import * as BABYLON from 'babylonjs';
import { gameNow, isGamePaused, setGameTimeout } from './game-clock';
import { CameraMode, DeliveryChoice, DeliveryType, FieldPreset } from './types';
import { globalAutoAssistConfig } from './game';
import { BALL_RADIUS_METERS, BATTER_CREASE_Z, BATTER_STUMPS_Z, STUMP_HEIGHT_METERS, WICKET_WIDTH_METERS, batterContactProgress, deliveryAnimationStep, deliveryBounceProgress, deliveryDurationMs, deliveryPitchPoint, deliveryProgressAtZ, deliveryReleaseX, sampleDeliveryPath } from './formula';
import { advanceBallFrame, type BallState } from './ball-physics';
import { advanceFielder, createDefaultFieldLayout, decideAutomatedRuns, fielderReachProfileFromRatings, fielderThrowSpeedFromRating, type AutomatedRunDecision, type FieldingPosition, type FielderReachProfile, type FieldingTrajectorySample } from './fielding';
import { followShotPose, shotCameraDirection, shotResultPose, type CameraVector } from './camera-director';

// A larger visible ball improves phone readability; physics uses the real radius.
const BALL_VISUAL_RADIUS = 0.075;
const BALL_VISUAL_OFFSET = BALL_VISUAL_RADIUS - BALL_RADIUS_METERS;

export class GameScene {
  public scene: BABYLON.Scene;
  private canvas: HTMLCanvasElement;
  private engine: BABYLON.Engine;
  
  // Camera
  public primaryCamera!: BABYLON.ArcRotateCamera;
  private activeCameraMode: CameraMode = 'stadium_wide';

  // Gameplay Meshes
  private ballMesh: BABYLON.Mesh | null = null;
  private ballTrail: BABYLON.LinesMesh | null = null;
  private readonly trailVertices = Array.from({ length: 10 }, () => BABYLON.Vector3.Zero());
  private predictionPath: BABYLON.LinesMesh | null = null;
  public bounceMarker: BABYLON.Mesh | null = null;
  private timingRing: BABYLON.Mesh | null = null;
  
  // Characters (Procedural low-poly)
  public static CREASE_ANCHOR = new BABYLON.Vector3(0.0, 0.0, BATTER_CREASE_Z);
  public playerCreaseOffset = new BABYLON.Vector3(-0.35, 0.0, 0.0);
  private bowlerRoot: BABYLON.TransformNode | null = null;
  private bowlerLegs: BABYLON.Mesh[] = [];
  private bowlerArms: BABYLON.Mesh[] = [];
  private bowlerRunUpSide: { overTheWicket: boolean; bowlingArm: 'Right' | 'Left' } = { overTheWicket: true, bowlingArm: 'Right' };
  public batterRoot: BABYLON.TransformNode | null = null;
  private nonStrikerRoot: BABYLON.TransformNode | null = null;
  private batterHead: BABYLON.TransformNode | null = null;
  public batMesh: BABYLON.Mesh | null = null;
  private batPivot: BABYLON.TransformNode | null = null;
  private readonly fielderRoots = new Map<FieldingPosition['name'], BABYLON.TransformNode>();
  private readonly fielderProfiles = new Map<FieldingPosition['name'], FielderReachProfile>();
  private fieldingRatings = { agility: 50, reaction: 50, catching: 50, throwing: 50 };
  private fieldPreset: FieldPreset = 'balanced';
  private shotFieldedBy: FieldingPosition['name'] | null = null;
  private shotCaughtBy: FieldingPosition['name'] | null = null;


  // Animation state
  private isAnimatingBall = false;
  private ballAnimationTime = 0;
  private ballTrajectoryPoints: BABYLON.Vector3[] = [];
  private updateDeliveryAnimation: (() => void) | null = null;
  private updateMissedAnimation: (() => void) | null = null;
  private onBallArrivedCallback: (() => void) | null = null;
  private onBallResolvedCallback: (() => void) | null = null;
  private onBallCreaseCrossedCallback: (() => void) | null = null;
  private creaseCrossedFired = false;
  
  private batterHand: 'RHB' | 'LHB' = 'RHB';
  

  
  public isBotBatting: boolean = false;
  public hasBotSwung: boolean = false;
  public botBattingTriggerCallback: (() => void) | null = null;
  public onDeliveryBounce: (() => void) | null = null;
  private deliveryBouncePlayed = false;
  
  private currentBallPos: BABYLON.Vector3 | null = null;
  private shotOrigin: BABYLON.Vector3 | null = null;
  private shotPhysics: BallState | null = null;
  private physicsAccumulator = 0;
  public shotReachedBoundary = false;
  public shotBoundaryOnFull = false;
  private ballPathPoints: BABYLON.Vector3[] = [];
  private shotTrajectory: FieldingTrajectorySample[] = [];
  private shotElapsedSeconds = 0;
  private shotCameraDirection: CameraVector = { x: 0, y: 0, z: 1 };
  
  constructor(canvasElementId: string) {
    this.canvas = document.getElementById(canvasElementId) as unknown as HTMLCanvasElement;
    this.engine = new BABYLON.Engine(this.canvas, true);
    // The canvas starts hidden in the lobby; it must be sized again when the
    // gameplay screen becomes visible before its camera and picking are used.
    this.scene = new BABYLON.Scene(this.engine);
    
    this.setupLights();
    this.buildStadium();
    this.setupCameras();
    this.buildCharacters();
    this.buildFielders();
    this.buildBall();

    const observer = this.scene.onBeforeRenderObservable.add(() => {
      try {
        this.updateDeliveryAnimation?.();
        this.updateMissedAnimation?.();
        if (globalAutoAssistConfig.isBallInPlay) {
          this.updateBallPhysics();
        }
        if (globalAutoAssistConfig.isRunUpActive) {
          this.updateBowlerRunUp();
        } else {
          this.bowlerLegs.forEach(leg => { leg.rotation.x = 0; });
          this.bowlerArms.forEach(arm => { arm.rotation.x = 0; });
        }
        if (globalAutoAssistConfig.isDeliveryActive) {
          this.updateBallFlight();
        }
        if ((globalAutoAssistConfig.isDeliveryActive || globalAutoAssistConfig.isBallInPlay || this.isAnimatingBall) && this.ballMesh) {
          this.ballMesh.rotation.x += Math.min(this.engine.getDeltaTime(), 50) * 0.012;
        }
        if (this.activeCameraMode === 'follow_shot' && this.ballMesh) {
          const pose = followShotPose(this.ballMesh.position, this.shotCameraDirection);
          const currentTarget = this.primaryCamera.getTarget();
          const frames = Math.min(this.engine.getDeltaTime(), 50) * 60 / 1000;
          const target = new BABYLON.Vector3(pose.target.x, pose.target.y, pose.target.z);
          const newTarget = BABYLON.Vector3.Lerp(currentTarget, target, 1 - Math.pow(0.92, frames));
          if (Number.isFinite(newTarget.x) && Number.isFinite(newTarget.y) && Number.isFinite(newTarget.z)) {
            this.primaryCamera.setTarget(newTarget);
          }
          
          const targetPos = new BABYLON.Vector3(pose.position.x, pose.position.y, pose.position.z);
          this.primaryCamera.position = BABYLON.Vector3.Lerp(this.primaryCamera.position, targetPos, 1 - Math.pow(0.95, frames));
          if (this.primaryCamera.position.y < 3.0) {
            this.primaryCamera.position.y = 3.0;
          }
        }


      } catch (error) {
        console.error('[BALL TRACKING CRASH GUARD]', error);
      }
    });

    globalAutoAssistConfig.removeTrajectoryObserver = () => {
      if (observer) {
        this.scene.onBeforeRenderObservable.remove(observer);
      }
    };

    globalAutoAssistConfig.resetSceneForInnings = () => {
      // Reposition single camera to Player Anchor
      this.resetCameraToPlayerView(!this.isBotBatting);
      // Reset ball mesh to bowler release point
      if (this.ballMesh) {
        this.ballMesh.position = new BABYLON.Vector3(0, 1.8, 18.0);
        this.ballMesh.setEnabled(false);
      }
    };

    // Start render loop
    this.engine.runRenderLoop(() => {
      if (!isGamePaused()) this.scene.render();
    });

    window.addEventListener('resize', () => {
      this.engine.resize();
    });
  }

  private setupLights(): void {
    const hemiLight = new BABYLON.HemisphericLight('hemiLight', new BABYLON.Vector3(0, 1, 0), this.scene);
    hemiLight.intensity = 0.65;
    
    const dirLight = new BABYLON.DirectionalLight('dirLight', new BABYLON.Vector3(-1, -2, -1), this.scene);
    dirLight.position = new BABYLON.Vector3(20, 40, 20);
    dirLight.intensity = 0.8;
  }

  private buildStadium(): void {
    this.scene.clearColor = new BABYLON.Color4(0.46, 0.67, 0.82, 1);
    // Ground
    const grassMaterial = new BABYLON.StandardMaterial('grassMat', this.scene);
    grassMaterial.diffuseColor = new BABYLON.Color3(0.12, 0.42, 0.16);
    grassMaterial.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);

    const outfield = BABYLON.MeshBuilder.CreateGround('outfield', { width: 140, height: 140 }, this.scene);
    outfield.material = grassMaterial;

    const stripeMat = new BABYLON.StandardMaterial('mownGrassMat', this.scene);
    stripeMat.diffuseColor = new BABYLON.Color3(0.15, 0.46, 0.19);
    stripeMat.specularColor = BABYLON.Color3.Black();
    for (let i = -3; i <= 3; i++) {
      const stripe = BABYLON.MeshBuilder.CreateGround(`mownStripe${i}`, { width: 140, height: 10 }, this.scene);
      stripe.position.set(0, 0.005, i * 20);
      stripe.material = stripeMat;
      stripe.isPickable = false;
    }

    // Low-detail stands sit outside the 65 m rope and never affect the ball simulation.
    const standColors = ['#223b52', '#46657a', '#d0c9ae'];
    standColors.forEach((color, i) => {
      const material = new BABYLON.StandardMaterial(`standMat${i}`, this.scene);
      material.diffuseColor = BABYLON.Color3.FromHexString(color);
      material.specularColor = BABYLON.Color3.Black();
      const stand = BABYLON.MeshBuilder.CreateTorus(`standTier${i}`, { diameter: 148 + i * 7, thickness: 5, tessellation: 48 }, this.scene);
      stand.position.y = 2 + i * 3;
      stand.material = material;
      stand.isPickable = false;
    });
    const seatingMat = new BABYLON.StandardMaterial('seatingMat', this.scene);
    seatingMat.diffuseColor = BABYLON.Color3.FromHexString('#6b8692');
    seatingMat.specularColor = BABYLON.Color3.Black();
    for (let i = 0; i < 32; i++) {
      const angle = i * Math.PI * 2 / 32;
      const panel = BABYLON.MeshBuilder.CreateBox(`seatingPanel${i}`, { width: 5, height: 0.65, depth: 0.12 }, this.scene);
      panel.position.set(Math.sin(angle) * 76, 5.8, Math.cos(angle) * 76);
      panel.rotation.y = angle;
      panel.material = seatingMat;
      panel.isPickable = false;
    }
    const floodlightMat = new BABYLON.StandardMaterial('floodlightMat', this.scene);
    floodlightMat.diffuseColor = BABYLON.Color3.FromHexString('#dce5e5');
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 4 + i * Math.PI / 2;
      const x = Math.sin(angle) * 80;
      const z = Math.cos(angle) * 80;
      const pole = BABYLON.MeshBuilder.CreateCylinder(`lightPole${i}`, { height: 20, diameter: 0.35, tessellation: 6 }, this.scene);
      pole.position.set(x, 10, z);
      pole.material = seatingMat;
      pole.isPickable = false;
      const lamps = BABYLON.MeshBuilder.CreateBox(`floodlights${i}`, { width: 5, height: 1.5, depth: 0.5 }, this.scene);
      lamps.position.set(x, 20, z);
      lamps.rotation.y = angle;
      lamps.material = floodlightMat;
      lamps.isPickable = false;
    }

    // Boundary Rope
    const ropeMat = new BABYLON.StandardMaterial('ropeMat', this.scene);
    ropeMat.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9);
    const boundary = BABYLON.MeshBuilder.CreateTorus('boundary', { diameter: 130, thickness: 0.4 }, this.scene);
    boundary.position.y = 0.1;
    boundary.material = ropeMat;

    // Pitch
    const pitchMat = new BABYLON.StandardMaterial('pitchMat', this.scene);
    pitchMat.diffuseColor = BABYLON.Color3.FromHexString('#967140'); // earthy brown/tan turf tone
    pitchMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    
    // Pitch dimensions: 3m wide, 22m long
    const pitch = BABYLON.MeshBuilder.CreatePlane('pitch', { width: 3, height: 22 }, this.scene);
    pitch.rotation.x = Math.PI / 2;
    pitch.position.y = 0.02;
    pitch.material = pitchMat;

    // Pitch Markings
    const createLine = (name: string, points: BABYLON.Vector3[]) => {
      const line = BABYLON.MeshBuilder.CreateLines(name, { points }, this.scene);
      line.color = new BABYLON.Color3(1, 1, 1);
      line.position.y = 0.021; // slightly above pitch
    };

    // Popping Creases
    createLine('poppingCreaseBat', [new BABYLON.Vector3(-1.32, 0, -BATTER_CREASE_Z), new BABYLON.Vector3(1.32, 0, -BATTER_CREASE_Z)]);
    createLine('poppingCreaseBowl', [new BABYLON.Vector3(-1.32, 0, BATTER_CREASE_Z), new BABYLON.Vector3(1.32, 0, BATTER_CREASE_Z)]);

    // Bowling Creases
    createLine('bowlingCreaseBat', [new BABYLON.Vector3(-1.32, 0, 10), new BABYLON.Vector3(1.32, 0, 10)]);
    createLine('bowlingCreaseBowl', [new BABYLON.Vector3(-1.32, 0, -10), new BABYLON.Vector3(1.32, 0, -10)]);

    // Return Creases
    createLine('returnCreaseLeftBat', [new BABYLON.Vector3(-1.32, 0, -BATTER_CREASE_Z), new BABYLON.Vector3(-1.32, 0, 10)]);
    createLine('returnCreaseRightBat', [new BABYLON.Vector3(1.32, 0, -BATTER_CREASE_Z), new BABYLON.Vector3(1.32, 0, 10)]);
    createLine('returnCreaseLeftBowl', [new BABYLON.Vector3(-1.32, 0, BATTER_CREASE_Z), new BABYLON.Vector3(-1.32, 0, -10)]);
    createLine('returnCreaseRightBowl', [new BABYLON.Vector3(1.32, 0, BATTER_CREASE_Z), new BABYLON.Vector3(1.32, 0, -10)]);

    // Wide Lines
    createLine('wideLineLeftBat', [new BABYLON.Vector3(-0.89, 0, -BATTER_CREASE_Z), new BABYLON.Vector3(-0.89, 0, 10)]);
    createLine('wideLineRightBat', [new BABYLON.Vector3(0.89, 0, -BATTER_CREASE_Z), new BABYLON.Vector3(0.89, 0, 10)]);
    createLine('wideLineLeftBowl', [new BABYLON.Vector3(-0.89, 0, BATTER_CREASE_Z), new BABYLON.Vector3(-0.89, 0, -10)]);
    createLine('wideLineRightBowl', [new BABYLON.Vector3(0.89, 0, BATTER_CREASE_Z), new BABYLON.Vector3(0.89, 0, -10)]);

    // Stumps are on the bowling creases at each end of the pitch.
    this.buildStumps(new BABYLON.Vector3(0, 0, BATTER_STUMPS_Z));
    this.buildStumps(new BABYLON.Vector3(0, 0, -BATTER_STUMPS_Z));
    
    // Bounce Marker shadow on pitch
    const markerMat = new BABYLON.StandardMaterial('markerMat', this.scene);
    markerMat.diffuseColor = new BABYLON.Color3(1, 0.1, 0.1);
    markerMat.alpha = 0.6;
    this.bounceMarker = BABYLON.MeshBuilder.CreateDisc('bounceMarker', { radius: 0.25 }, this.scene);
    this.bounceMarker.rotation.x = Math.PI / 2;
    this.bounceMarker.position.y = 0.08;
    this.bounceMarker.isPickable = false;
    this.bounceMarker.renderingGroupId = 1;
    this.bounceMarker.setEnabled(false);
    this.bounceMarker.material = markerMat;

    const ringMat = new BABYLON.StandardMaterial('timingRingMat', this.scene);
    ringMat.diffuseColor = new BABYLON.Color3(1, 0, 0);
    ringMat.emissiveColor = new BABYLON.Color3(1, 0, 0);
    ringMat.alpha = 0.8;
    this.timingRing = BABYLON.MeshBuilder.CreateTorus('timingRing', { diameter: 1.5, thickness: 0.05 }, this.scene);
    this.timingRing.rotation.x = Math.PI / 2;
    this.timingRing.position.y = 0.1;
    this.timingRing.setEnabled(false);
    this.timingRing.material = ringMat;
  }

  private buildStumps(position: BABYLON.Vector3): void {
    const stumpMat = new BABYLON.StandardMaterial('stumpMat', this.scene);
    stumpMat.diffuseColor = new BABYLON.Color3(0.8, 0.6, 0.25);
    
    const stumpWidth = 0.0381;
    const stumpHeight = STUMP_HEIGHT_METERS;
    const spacing = (WICKET_WIDTH_METERS - stumpWidth) / 2;
    
    // Create 3 stumps
    for (let i = -1; i <= 1; i++) {
      const stump = BABYLON.MeshBuilder.CreateCylinder(`stump_${position.z}_${i}`, {
        height: stumpHeight,
        diameter: stumpWidth
      }, this.scene);
      stump.position.set(position.x + i * spacing, stumpHeight / 2, position.z);
      stump.material = stumpMat;
    }
    for (let i = -1; i <= 0; i++) {
      const bail = BABYLON.MeshBuilder.CreateCylinder(`bail_${position.z}_${i}`, { height: spacing, diameter: 0.025, tessellation: 6 }, this.scene);
      bail.rotation.z = Math.PI / 2;
      bail.position.set(position.x + (i + 0.5) * spacing, stumpHeight + 0.0125, position.z);
      bail.material = stumpMat;
    }
  }

  private setupCameras(): void {
    this.primaryCamera = new BABYLON.ArcRotateCamera('primaryCamera', 0, 0, 10, BABYLON.Vector3.Zero(), this.scene);
    this.scene.activeCamera = this.primaryCamera;
    this.primaryCamera.fov = 75 * (Math.PI / 180);
    this.setCameraMode('stadium_wide');
  }

  public setCameraMode(mode: CameraMode): void {
    this.engine.resize();
    this.activeCameraMode = mode;
    if (this.batterRoot) this.batterRoot.parent = null;
    
    // Smooth snaps or fixed snaps depending on mode
    if (mode === 'batter_eye') {
      this.setBattingCameraView();
    } else if (mode === 'bowler_eye') {
      this.setBowlingCameraView();
    } else if (mode === 'stadium_wide') {
      this.primaryCamera.position = new BABYLON.Vector3(15, 12, -22);
      this.primaryCamera.setTarget(new BABYLON.Vector3(0, 1.5, 0));
    }
  }

  public setBattingCameraView(): void {
    this.primaryCamera.position = new BABYLON.Vector3(0.0, 2.5, -14.0);
    this.primaryCamera.setTarget(new BABYLON.Vector3(0.0, 1.0, 0.0));
    this.primaryCamera.lockedTarget = null;
    this.primaryCamera.fov = 0.85;
  }

  public setBowlingCameraView(): void {
    this.primaryCamera.position = new BABYLON.Vector3(0.0, 2.6, 13.5);
    this.primaryCamera.setTarget(new BABYLON.Vector3(0.0, 0.5, -8.8));
    this.primaryCamera.lockedTarget = null;
    this.primaryCamera.fov = 0.85;
  }

  public getCameraMode(): CameraMode {
    return this.activeCameraMode;
  }

  public resetCameraToPlayerView(isPlayerBatting: boolean): void {
    if (this.batterRoot) {
      this.batterRoot.parent = null;
      this.updateBatterPosition();
    }
    const targetMode: CameraMode = isPlayerBatting ? 'batter_eye' : 'bowler_eye';
    this.setCameraMode(targetMode);
  }

  private buildCharacters(): void {
    const material = (name: string, color: string) => {
      const result = new BABYLON.StandardMaterial(name, this.scene);
      result.diffuseColor = BABYLON.Color3.FromHexString(color);
      result.specularColor = new BABYLON.Color3(0.06, 0.06, 0.06);
      return result;
    };
    const blue = material('batterKit', '#174e98');
    const green = material('bowlerKit', '#2d7b57');
    const trousers = material('trousers', '#e5e1d4');
    const skin = material('skin', '#b98260');
    const helmet = material('helmet', '#18334d');
    const pads = material('pads', '#f2eee0');
    const shoes = material('shoes', '#293d49');
    const batWood = material('batWood', '#cda36a');
    const grip = material('batGrip', '#344b5e');

    const part = (_name: string, parent: BABYLON.TransformNode, mesh: BABYLON.Mesh, mat: BABYLON.Material, x: number, y: number, z: number) => {
      mesh.parent = parent;
      mesh.position.set(x, y, z);
      mesh.material = mat;
      mesh.isPickable = false;
      return mesh;
    };
    const limb = (name: string, parent: BABYLON.TransformNode, mat: BABYLON.Material, x: number, y: number, z: number, height: number, diameter: number) =>
      part(name, parent, BABYLON.MeshBuilder.CreateCylinder(name, { height, diameter, tessellation: 8 }, this.scene), mat, x, y, z);
    const ball = (name: string, parent: BABYLON.TransformNode, mat: BABYLON.Material, x: number, y: number, z: number, diameter: number) =>
      part(name, parent, BABYLON.MeshBuilder.CreateSphere(name, { diameter, segments: 8 }, this.scene), mat, x, y, z);
    const box = (name: string, parent: BABYLON.TransformNode, mat: BABYLON.Material, x: number, y: number, z: number, width: number, height: number, depth: number) =>
      part(name, parent, BABYLON.MeshBuilder.CreateBox(name, { width, height, depth }, this.scene), mat, x, y, z);

    const bowler = new BABYLON.TransformNode('bowlerRoot', this.scene);
    bowler.position.set(0.6, 0, 11.5);
    limb('bowlerTorso', bowler, green, 0, 1.24, 0, 0.68, 0.43);
    ball('bowlerHead', bowler, skin, 0, 1.77, 0, 0.28);
    const bowlerLeftArm = limb('bowlerLArm', bowler, green, -0.3, 1.25, 0, 0.62, 0.13);
    bowlerLeftArm.rotation.z = -0.2;
    const bowlerRightArm = limb('bowlerRArm', bowler, green, 0.3, 1.25, 0, 0.62, 0.13);
    bowlerRightArm.rotation.z = 0.2;
    this.bowlerArms = [bowlerLeftArm, bowlerRightArm];
    this.bowlerLegs = [-1, 1].map((side, i) => {
      const leg = limb(`bowlerLeg${i}`, bowler, trousers, side * 0.13, 0.47, 0, 0.84, 0.16);
      box(`bowlerShoe${i}`, bowler, shoes, side * 0.13, 0.06, 0.04, 0.18, 0.1, 0.28);
      return leg;
    });
    this.bowlerRoot = bowler;

    const batter = new BABYLON.TransformNode('batterRoot', this.scene);
    batter.position.set(-0.35, 0, -8.8);
    limb('batterTorso', batter, blue, 0, 1.23, 0, 0.67, 0.42);
    const head = new BABYLON.TransformNode('batterHeadPivot', this.scene);
    head.parent = batter;
    head.position.y = 1.76;
    head.rotation.y = -this.batterStanceAngle();
    this.batterHead = head;
    ball('batterHead', head, skin, 0, 0, 0, 0.27);
    const cap = ball('batterHelmet', head, helmet, 0, 0.08, 0, 0.29);
    cap.scaling.y = 0.75;
    box('helmetPeak', head, helmet, 0, 0.05, 0.15, 0.26, 0.035, 0.16);
    [-1, 1].forEach((side, i) => {
      limb(`batterLeg${i}`, batter, trousers, side * 0.13, 0.48, 0, 0.86, 0.17);
      box(`batterPad${i}`, batter, pads, side * 0.13, 0.38, 0.095, 0.19, 0.57, 0.1);
      box(`batterShoe${i}`, batter, shoes, side * 0.13, 0.06, 0.06, 0.18, 0.1, 0.3);
      const arm = limb(`batterArm${i}`, batter, blue, side * 0.27, 1.18, 0.07, 0.58, 0.13);
      arm.rotation.z = side * 0.24;
      ball(`batterGlove${i}`, batter, pads, side * 0.3, 0.89, 0.13, 0.16);
    });
    const batPivot = new BABYLON.TransformNode('batPivot', this.scene);
    batPivot.parent = batter;
    batPivot.position.set(0.30, 0.91, 0.40);
    batPivot.rotation.z = -0.2;
    const bat = box('batMesh', batPivot, batWood, 0, -0.43, 0, 0.22, 0.64, 0.065);
    bat.rotation.y = Math.PI / 2;
    limb('batHandle', batPivot, grip, 0, -0.03, 0, 0.27, 0.05);
    this.batMesh = bat;
    this.batPivot = batPivot;
    batter.rotation.y = this.batterStanceAngle();
    this.batterRoot = batter;
    this.updateBatterPosition();

    // A supporting batter stands clear of the bowler's approach and camera.
    // This is a role representation; the game does not yet model a full squad.
    const nonStriker = new BABYLON.TransformNode('nonStrikerRoot', this.scene);
    nonStriker.position.set(3.2, 0, -BATTER_CREASE_Z);
    nonStriker.rotation.y = Math.PI;
    limb('nonStrikerTorso', nonStriker, blue, 0, 1.23, 0, 0.67, 0.42);
    ball('nonStrikerHead', nonStriker, skin, 0, 1.76, 0, 0.27);
    const nonStrikerHelmet = ball('nonStrikerHelmet', nonStriker, helmet, 0, 1.84, 0, 0.29);
    nonStrikerHelmet.scaling.y = 0.75;
    [-1, 1].forEach((side, i) => {
      limb(`nonStrikerLeg${i}`, nonStriker, trousers, side * 0.13, 0.48, 0, 0.86, 0.17);
      box(`nonStrikerPad${i}`, nonStriker, pads, side * 0.13, 0.38, 0.095, 0.19, 0.57, 0.1);
      box(`nonStrikerShoe${i}`, nonStriker, shoes, side * 0.13, 0.06, 0.06, 0.18, 0.1, 0.3);
      const arm = limb(`nonStrikerArm${i}`, nonStriker, blue, side * 0.27, 1.18, 0.07, 0.58, 0.13);
      arm.rotation.z = side * 0.24;
      ball(`nonStrikerGlove${i}`, nonStriker, pads, side * 0.3, 0.89, 0.13, 0.16);
    });
    const nonStrikerBat = box('nonStrikerBat', nonStriker, batWood, 0.37, 0.46, 0.19, 0.2, 0.65, 0.06);
    nonStrikerBat.rotation.z = -0.14;
    limb('nonStrikerBatHandle', nonStriker, grip, 0.32, 0.88, 0.19, 0.24, 0.05);
    this.nonStrikerRoot = nonStriker;
  }

  public setBatterHandedness(hand: 'RHB' | 'LHB'): void {
    this.batterHand = hand;
    const layout = createDefaultFieldLayout(hand, this.fieldPreset);
    for (const fielder of layout) this.fielderRoots.get(fielder.name)?.position.set(fielder.position.x, 0, fielder.position.z);
    if (!this.batterRoot) return;
    
    this.batterRoot.parent = null;
    this.batterRoot.scaling = new BABYLON.Vector3(1.0, 1.0, 1.0);
    this.batterRoot.rotation = new BABYLON.Vector3(0, this.batterStanceAngle(), 0);
    if (this.batterHead) this.batterHead.rotation.y = -this.batterStanceAngle();
    this.batterRoot.setEnabled(true);

    this.updateBatterPosition();
  }

  public getFielderPositions(): Array<{ name: FieldingPosition['name']; position: { x: number; z: number } }> {
    return Array.from(this.fielderRoots, ([name, root]) => ({
      name,
      position: { x: root.position.x, z: root.position.z },
    }));
  }

  public getBatterPosition(): { x: number; z: number } {
    return this.batterRoot
      ? { x: this.batterRoot.position.x, z: this.batterRoot.position.z }
      : { x: this.playerCreaseOffset.x, z: -8.8 + this.playerCreaseOffset.z };
  }

  public getBowlerPosition(): { x: number; z: number } {
    return this.bowlerRoot
      ? { x: this.bowlerRoot.position.x, z: this.bowlerRoot.position.z }
      : { x: 0, z: 11.5 };
  }

  public getNonStrikerPosition(): { x: number; z: number } {
    return this.nonStrikerRoot
      ? { x: this.nonStrikerRoot.position.x, z: this.nonStrikerRoot.position.z }
      : { x: 3.2, z: -BATTER_CREASE_Z };
  }

  public setFieldPreset(preset: FieldPreset): void {
    const layout = createDefaultFieldLayout(this.batterHand, preset);
    this.fieldPreset = preset;
    for (const fielder of layout) this.fielderRoots.get(fielder.name)?.position.set(fielder.position.x, 0, fielder.position.z);
    this.fielderProfiles.clear();
  }

  public getFieldPreset(): FieldPreset {
    return this.fieldPreset;
  }

  public setFieldingRatings(agility: number, reaction: number, catching = 50, throwing = 50): void {
    // Validate against the same bounded scale used to build movement profiles.
    fielderReachProfileFromRatings({ x: 0, z: 0 }, agility, reaction);
    if (!Number.isFinite(catching) || catching < 0 || catching > 100) throw new Error('Catching rating must be between 0 and 100');
    if (!Number.isFinite(throwing) || throwing < 0 || throwing > 100) throw new Error('Throwing rating must be between 0 and 100');
    this.fieldingRatings = { agility, reaction, catching, throwing };
  }

  public getShotFielder(): FieldingPosition['name'] | null {
    return this.shotFieldedBy;
  }

  public getShotCatcher(): FieldingPosition['name'] | null {
    return this.shotCaughtBy;
  }

  public getShotRunDecision(): (AutomatedRunDecision & { fielderName: FieldingPosition['name'] }) | null {
    if (!this.shotFieldedBy) return null;
    const root = this.fielderRoots.get(this.shotFieldedBy);
    if (!root) return null;
    const throwSpeed = fielderThrowSpeedFromRating(this.fieldingRatings.throwing);
    return { ...decideAutomatedRuns(this.shotElapsedSeconds, { x: root.position.x, z: root.position.z }, throwSpeed), fielderName: this.shotFieldedBy };
  }

  private buildFielders(): void {
    const shirt = new BABYLON.StandardMaterial('fielderKit', this.scene);
    shirt.diffuseColor = BABYLON.Color3.FromHexString('#bf6b35');
    shirt.specularColor = BABYLON.Color3.Black();
    const trousers = new BABYLON.StandardMaterial('fielderTrousers', this.scene);
    trousers.diffuseColor = BABYLON.Color3.FromHexString('#e5e1d4');
    trousers.specularColor = BABYLON.Color3.Black();
    const skin = new BABYLON.StandardMaterial('fielderSkin', this.scene);
    skin.diffuseColor = BABYLON.Color3.FromHexString('#b98260');
    skin.specularColor = BABYLON.Color3.Black();
    for (const fielder of createDefaultFieldLayout(this.batterHand, this.fieldPreset)) {
      const root = new BABYLON.TransformNode(`fielder_${fielder.name}`, this.scene);
      root.position.set(fielder.position.x, 0, fielder.position.z);
      const torso = BABYLON.MeshBuilder.CreateCylinder(`fielder_${fielder.name}_torso`, { height: 0.7, diameter: 0.42, tessellation: 8 }, this.scene);
      torso.parent = root;
      torso.position.y = 1.12;
      torso.material = shirt;
      torso.isPickable = false;
      const head = BABYLON.MeshBuilder.CreateSphere(`fielder_${fielder.name}_head`, { diameter: 0.28, segments: 8 }, this.scene);
      head.parent = root;
      head.position.y = 1.65;
      head.material = skin;
      head.isPickable = false;
      for (const [index, x] of [-0.12, 0.12].entries()) {
        const leg = BABYLON.MeshBuilder.CreateCylinder(`fielder_${fielder.name}_leg${index}`, { height: 0.72, diameter: 0.15, tessellation: 6 }, this.scene);
        leg.parent = root;
        leg.position.set(x, 0.42, 0);
        leg.material = trousers;
        leg.isPickable = false;
      }
      this.fielderRoots.set(fielder.name, root);
    }
  }

  private batterStanceAngle(): number {
    return this.batterHand === 'RHB' ? Math.PI / 2 : -Math.PI / 2;
  }

  public updateBatterPosition(): void {
    if (!this.batterRoot) return;
    this.batterRoot.parent = null;
    const pos = GameScene.CREASE_ANCHOR.add(this.playerCreaseOffset);
    this.batterRoot.position.copyFrom(pos);
    this.batterRoot.setAbsolutePosition(pos);
    this.batterRoot.setEnabled(true);
    const childMeshes = this.batterRoot.getChildMeshes();
    childMeshes.forEach(m => {
      m.isVisible = true;
      m.visibility = 1.0;
      if (m.material) {
        m.material.alpha = 1.0;
      }
    });
  }

  public setPlayerCreaseOffset(dx: number, dz: number): void {
    const clampedDx = Math.max(-0.95, Math.min(0.25, dx));
    const clampedDz = Math.max(-0.3, Math.min(0.8, dz));
    this.playerCreaseOffset.set(clampedDx, 0.0, clampedDz);
    this.updateBatterPosition();
  }

  public setBowlerSide(overTheWicket: boolean, bowlingArm: 'Right' | 'Left'): void {
    this.bowlerRunUpSide = { overTheWicket, bowlingArm };
    if (this.bowlerRoot) this.bowlerRoot.position.x = deliveryReleaseX(this.bowlerRunUpSide);
  }

  private buildBall(): void {
    const ballMat = new BABYLON.StandardMaterial('ballMat', this.scene);
    ballMat.diffuseColor = new BABYLON.Color3(0.85, 0.1, 0.1);
    
    this.ballMesh = BABYLON.MeshBuilder.CreateSphere('cricketBall', { diameter: BALL_VISUAL_RADIUS * 2 }, this.scene);
    this.ballMesh.material = ballMat;
    const seamMat = new BABYLON.StandardMaterial('ballSeamMat', this.scene);
    seamMat.diffuseColor = BABYLON.Color3.FromHexString('#e8d8bf');
    const seam = BABYLON.MeshBuilder.CreateTorus('ballSeam', { diameter: BALL_VISUAL_RADIUS * 2, thickness: 0.006, tessellation: 20 }, this.scene);
    seam.parent = this.ballMesh;
    seam.rotation.z = Math.PI / 3;
    seam.material = seamMat;
    seam.isPickable = false;
    this.ballMesh.setEnabled(false);
  }

  // --- Animation Mechanics ---

  public prepareDeliverySound(): void { this.deliveryBouncePlayed = false; }

  private notifyDeliveryBounce(progress: number, type: DeliveryType, bounceZ: number): void {
    const bounceProgress = deliveryBounceProgress(type, bounceZ);
    if (!this.deliveryBouncePlayed && progress >= bounceProgress) {
      this.deliveryBouncePlayed = true;
      this.onDeliveryBounce?.();
    }
  }

  public generateTrajectoryPoints(
    aimTarget: { x: number; z: number },
    type: DeliveryType,
    overTheWicket: boolean = true,
    turn = 0.5,
    swing = 0,
    pace = 0.5
  ): BABYLON.Vector3[] {
    const points: BABYLON.Vector3[] = [];
    const steps = 60;
    
    const delivery: DeliveryChoice = { aimTarget, type, line: 'middle', length: 'good', releaseTiming: 0.5, overTheWicket, bowlingArm: globalAutoAssistConfig.bowlerArm || 'Right', turn, swing, pace };
    
    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      const pos = sampleDeliveryPath(delivery, progress);
      points.push(new BABYLON.Vector3(pos.x, pos.y + BALL_VISUAL_OFFSET, pos.z));
    }

    return points;
  }

  public updateBounceMarkerDirect(line: string, length: string): void {
    if (this.bounceMarker) {
      this.bounceMarker.parent = null;
      this.bounceMarker.isVisible = true;
      this.bounceMarker.setEnabled(true);
      
      let x = 0.0;
      if (line.toLowerCase() === 'off') x = -0.45;
      if (line.toLowerCase() === 'leg') x = 0.45;
      if (line.toLowerCase() === 'middle') x = 0.0;

      let z = -4.2;
      switch (length.toLowerCase()) {
        case 'yorker': z = -8.2; break;
        case 'full': z = -6.2; break;
        case 'good': z = -4.2; break;
        case 'short': z = -2.2; break;
        case 'bouncer': z = -0.2; break;
      }
      this.bounceMarker.position.copyFrom(new BABYLON.Vector3(x, 0.08, z));
    }
  }

  public updateBounceMarker(aimTarget: { x: number; z: number }): void {
    if (this.bounceMarker) {
      this.bounceMarker.parent = null;
      this.bounceMarker.isVisible = true;
      this.bounceMarker.setEnabled(true);
      this.bounceMarker.position.set(aimTarget.x, 0.08, aimTarget.z);
    }
  }

  public pickBowlingTarget(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ray = this.scene.createPickingRay(clientX - rect.left, clientY - rect.top, BABYLON.Matrix.Identity(), this.primaryCamera);
    const distance = ray.intersectsPlane(new BABYLON.Plane(0, 1, 0, 0));
    if (distance === null) return null;
    const point = ray.origin.add(ray.direction.scale(distance));
    return {
      x: Math.max(-1.5, Math.min(1.5, point.x)),
      z: Math.max(-8.2, Math.min(0.5, point.z))
    };
  }

  public hideBounceMarker(): void {
    this.bounceMarker?.setEnabled(false);
    this.timingRing?.setEnabled(false);
    if (this.predictionPath) {
      this.predictionPath.dispose();
      this.predictionPath = null;
    }
  }


  public animateDelivery(
    aimTarget: { x: number; z: number },
    type: string,
    deliveryType: DeliveryType,
    onArrived: () => void,
    onResolved: () => void,
    overTheWicket: boolean = true,
    onCreaseCrossed?: () => void,
    isSlowMotion: boolean = false,
    assistMultiplier: number = 0,
    pace = 0.5,
    turn = 0.5,
    swing = 0
  ): void {
    this.updateMissedAnimation = null;
    this.clearBallTrail();
    this.setDeliveryCallbacks(onArrived, onResolved);
    this.onBallCreaseCrossedCallback = onCreaseCrossed || null;
    this.creaseCrossedFired = false;
    this.hasBotSwung = false;
    const delivery: DeliveryChoice = { aimTarget: { ...aimTarget }, type: deliveryType, line: 'middle', length: 'good', releaseTiming: 0.5, overTheWicket, bowlingArm: globalAutoAssistConfig.bowlerArm || 'Right', turn, swing, pace };
    const contactProgress = batterContactProgress(delivery);
    const botSwingProgress = Math.max(0, contactProgress - 150 / deliveryDurationMs(deliveryType, pace));
    
    // Ensure active camera remains strictly locked in player's perspective during delivery
    const preContactCam: CameraMode = this.isBotBatting ? 'bowler_eye' : 'batter_eye';
    this.setCameraMode(preContactCam);

    // Position bounce marker indicator on pitch
    if (this.bounceMarker) {
      this.bounceMarker.parent = null;
      this.bounceMarker.isVisible = true;
      this.bounceMarker.setEnabled(true);
      const pitch = deliveryPitchPoint(delivery);
      this.bounceMarker.position.set(pitch.x, 0.08, pitch.z);
    }

    const lengthColors: Record<string, BABYLON.Color3> = {
      'good': BABYLON.Color3.FromHexString('#22c55e'),
      'full': BABYLON.Color3.FromHexString('#eab308'),
      'short': BABYLON.Color3.FromHexString('#ef4444'),
      'yorker': BABYLON.Color3.FromHexString('#3b82f6'),
      'bouncer': BABYLON.Color3.FromHexString('#a855f7')
    };
    if (this.bounceMarker && this.bounceMarker.material) {
      (this.bounceMarker.material as BABYLON.StandardMaterial).diffuseColor = lengthColors[type.toLowerCase()] || new BABYLON.Color3(1, 1, 1);
    }
    
    this.timingRing?.setEnabled(!this.isBotBatting);
    if (this.timingRing && this.batterRoot) {
      this.timingRing.position.set(this.batterRoot.position.x, 0.1, -8.8);
      this.timingRing.scaling.set(3.0, 3.0, 3.0);
    }

    this.ballTrajectoryPoints = this.generateTrajectoryPoints(aimTarget, deliveryType, overTheWicket, turn, swing, pace);
    
    if (this.predictionPath) {
      this.predictionPath.dispose();
      this.predictionPath = null;
    }
    if (!this.isBotBatting && assistMultiplier >= 0.7) {
      const visiblePoints = this.ballTrajectoryPoints.filter(p => p.z >= BATTER_CREASE_Z);
      if (visiblePoints.length > 1) {
        this.predictionPath = BABYLON.MeshBuilder.CreateDashedLines('predictionPath', {
          points: visiblePoints,
          dashSize: 0.2,
          gapSize: 0.2
        }, this.scene);
        this.predictionPath.color = new BABYLON.Color3(0.3, 0.8, 1);
      }
    }
    
    this.ballAnimationTime = 0;
    this.isAnimatingBall = true;
    
    this.ballMesh?.setEnabled(true);
    this.ballMesh?.position.copyFrom(this.ballTrajectoryPoints[0]);

    // Set bowler initial X based on bowler arm
    if (this.bowlerRoot) {
      this.setBowlerSide(overTheWicket, globalAutoAssistConfig.bowlerArm || 'Right');
    }

    // Animate bowler release arm rotation (for player bowling context if needed)
    if (this.bowlerRoot) {
      BABYLON.Animation.CreateAndStartAnimation(
        'bowlerArm',
        this.bowlerRoot,
        'position.z',
        30,
        15,
        16.0,
        10.0,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
    }

    // Flight loop runner
    let speedScale = 1000 / deliveryDurationMs(deliveryType, pace);
    if (isSlowMotion) {
      speedScale *= 0.35; // Reduce by 65% for bullet-time
    }

    const animateFrame = () => {
      if (!this.isAnimatingBall) { this.updateDeliveryAnimation = null; return; }
      let currentSpeedScale = speedScale;
      let fov = 75;

      if (this.ballMesh && this.ballMesh.position.z <= -6.5) {
        // Time Dilation
        if (!this.isBotBatting) {
          if (assistMultiplier >= 0.7) { // Rookie
            currentSpeedScale *= 0.45;
          } else if (assistMultiplier >= 0.3) { // Medium
            currentSpeedScale *= 0.85;
          }
        }

        // Camera FOV Zoom
        if (this.activeCameraMode === 'batter_eye' && this.scene.activeCamera) {
          const progress = Math.min(1, Math.max(0, (-6.5 - this.ballMesh.position.z) / 2.3));
          fov = BABYLON.Scalar.Lerp(75, 50, progress);
          (this.scene.activeCamera as BABYLON.TargetCamera).fov = fov * (Math.PI / 180);
        }
      }

      this.ballAnimationTime += deliveryAnimationStep(this.engine.getDeltaTime(), currentSpeedScale);
      const progress = Math.min(contactProgress, this.ballAnimationTime / 60);
      this.notifyDeliveryBounce(progress, deliveryType, aimTarget.z);
      const index = Math.floor(this.ballAnimationTime);

      if (this.isBotBatting && !this.hasBotSwung && progress >= botSwingProgress) {
        this.hasBotSwung = true;
        this.botBattingTriggerCallback?.();
      }

      if (this.timingRing && this.ballMesh) {
        const startZ = 10.0;
        const creaseZ = -8.8;
        const currentZ = this.ballMesh.position.z;
        const progress = Math.max(0, Math.min(1, (startZ - currentZ) / (startZ - creaseZ)));
        const ringScale = 3.0 - (2.0 * progress);
        this.timingRing.scaling.set(ringScale, ringScale, ringScale);

        if (this.timingRing.material) {
          const mat = this.timingRing.material as BABYLON.StandardMaterial;
          
          const rawOffset = 1.0 - progress;
          const effectiveOffset = rawOffset * (1 - assistMultiplier);
          const effectiveProgress = 1.0 - effectiveOffset;
          const effectiveRingScale = 3.0 - (2.0 * effectiveProgress);
          
          let r = 1, g = 0, b = 0;
          if (effectiveRingScale > 2.0) {
            g = 1 - (effectiveRingScale - 2.0); 
          } else {
            g = 1;
            r = effectiveRingScale - 1.0;
          }
          mat.diffuseColor = new BABYLON.Color3(r, g, b);
          mat.emissiveColor = new BABYLON.Color3(r, g, b);
        }
      }

      if (progress >= contactProgress) {
        const contact = sampleDeliveryPath(delivery, contactProgress);
        this.ballMesh?.position.set(contact.x, contact.y + BALL_VISUAL_OFFSET, contact.z);
        this.isAnimatingBall = false;
        this.updateDeliveryAnimation = null;
        this.ballMesh?.setEnabled(false);
        this.bounceMarker?.setEnabled(false);
        this.timingRing?.setEnabled(false);
        if (this.predictionPath) {
          this.predictionPath.dispose();
          this.predictionPath = null;
        }
        if (!this.creaseCrossedFired) {
          this.creaseCrossedFired = true;
          this.onBallCreaseCrossedCallback?.();
        }
        if (this.onBallArrivedCallback) this.onBallArrivedCallback();
        return;
      }

      if (this.ballMesh) {
        const next = this.ballTrajectoryPoints[Math.min(index + 1, this.ballTrajectoryPoints.length - 1)];
        BABYLON.Vector3.LerpToRef(this.ballTrajectoryPoints[index], next, this.ballAnimationTime - index, this.ballMesh.position);
      }
      
      // Draw custom line trail
      this.drawBallTrail();

    };
    this.updateDeliveryAnimation = animateFrame;
  }

  public setDeliveryCallbacks(onArrived: () => void, onResolved: () => void): void {
    this.onBallArrivedCallback = onArrived;
    this.onBallResolvedCallback = onResolved;
  }

  private drawBallTrail(): void {
    if (!this.ballMesh) return;
    const index = Math.floor(this.ballAnimationTime);
    const trailPoints = this.ballTrajectoryPoints.slice(Math.max(0, index - 8), index + 1);
    this.updateTrail(trailPoints, new BABYLON.Color3(0.9, 0.9, 0.4));
  }

  private clearBallTrail(): void {
    this.ballTrail?.dispose();
    this.ballTrail = null;
  }

  private updateTrail(points: BABYLON.Vector3[], color: BABYLON.Color3): void {
    if (points.length < 2) return;
    const padding = this.trailVertices.length - points.length;
    for (let i = 0; i < this.trailVertices.length; i++) {
      this.trailVertices[i].copyFrom(points[Math.max(0, i - padding)]);
    }
    this.ballTrail = BABYLON.MeshBuilder.CreateLines('ballTrail', {
      points: this.trailVertices,
      updatable: true,
      instance: this.ballTrail || undefined
    }, this.scene);
    this.ballTrail.color.copyFrom(color);
  }

  public animateBatterSwing(_directionAngle: number, successCallback: () => void): void {
    if (this.batPivot && this.batterRoot) {
      const batter = this.batterRoot;
      const stance = this.batterStanceAngle();
      const pivot = this.batPivot;
      this.scene.stopAnimation(pivot);
      this.scene.stopAnimation(batter);
      const bodySwing = BABYLON.Animation.CreateAndStartAnimation(
        'batterBodySwing', batter, 'rotation.y', 60, 12, stance, stance + 0.45,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
      bodySwing?.onAnimationEndObservable.add(() => { batter.rotation.y = stance; });
      const swing = new BABYLON.Animation('batSwing', 'rotation.z', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT);
      swing.setKeys([{ frame: 0, value: -0.2 }, { frame: 4, value: -1.4 }, { frame: 10, value: 1.1 }, { frame: 18, value: -0.2 }]);
      this.scene.beginDirectAnimation(pivot, [swing], 0, 18, false, 1, () => {
        successCallback();
      });
    } else {
      successCallback();
    }
  }

  public detachCameraFromBall(): void {
    if (this.primaryCamera) {
      this.primaryCamera.setTarget(new BABYLON.Vector3(0, 1.5, 0));
    }
    // Remove direct parenting or locks
    if (this.ballMesh) {
      this.ballMesh.parent = null;
    }
  }

  public endDeliveryCycle(): void {
    globalAutoAssistConfig.isBallInPlay = false;
    this.isAnimatingBall = false;
    
    this.detachCameraFromBall();
    if (this.currentBallPos && this.shotPhysics) {
      const pose = shotResultPose(this.currentBallPos, this.shotCameraDirection);
      this.setCameraMode('shot_result');
      this.primaryCamera.setTarget(new BABYLON.Vector3(pose.target.x, pose.target.y, pose.target.z));
      this.primaryCamera.setPosition(new BABYLON.Vector3(pose.position.x, pose.position.y, pose.position.z));
    }
    
    if (this.ballMesh) this.ballMesh.setEnabled(false);
    if (this.bounceMarker) this.bounceMarker.setEnabled(false);
    if (this.timingRing) this.timingRing.setEnabled(false);
    if (this.predictionPath) {
      this.predictionPath.dispose();
      this.predictionPath = null;
    }
    this.clearBallTrail();

    const onResolved = this.onBallResolvedCallback;
    this.onBallResolvedCallback = null;
    onResolved?.();
  }

  public resetBowlerMesh(): void {
    if (!this.bowlerRoot) return;
    this.bowlerRoot.setEnabled(true);
    this.bowlerRoot.scaling = new BABYLON.Vector3(1.0, 1.0, 1.0);
    this.bowlerRoot.rotation = new BABYLON.Vector3(0, Math.PI, 0);
    this.bowlerRoot.position = new BABYLON.Vector3(0.6, 0.0, 11.5);
    this.bowlerLegs.forEach(leg => { leg.rotation.x = 0; });
    this.bowlerArms.forEach(arm => { arm.rotation.x = 0; });
    
    // Ensure no ball meshes or other unintended geometries are parented
    const children = this.bowlerRoot.getChildren();
    for (const child of children) {
      if (child.name === 'cricketBall' || child.name === 'ballTrail') {
        child.parent = null;
      }
    }
  }

  public updateBowlerRunUp(): void {
    if (!this.bowlerRoot || globalAutoAssistConfig.runUpStartTime === undefined) return;
    
    const elapsed = gameNow() - globalAutoAssistConfig.runUpStartTime;
    const duration = 1200;
    const progress = Math.min(1.0, elapsed / duration);
    
    // Smoothly interpolate from +12.0m to +10.0m (release crease)
    const z = BABYLON.Scalar.Lerp(12.0, 10.0, progress);
    const bounce = Math.sin(progress * Math.PI * 8) * 0.15;
    
    this.bowlerRoot.position.z = z;
    this.bowlerRoot.position.y = bounce;
    this.bowlerRoot.rotation.x = Math.sin(progress * Math.PI * 16) * 0.2;
    this.bowlerRoot.position.x = deliveryReleaseX(this.bowlerRunUpSide);
    this.bowlerLegs.forEach((leg, i) => { leg.rotation.x = Math.sin(progress * Math.PI * 8 + i * Math.PI) * 0.3; });
    this.bowlerArms.forEach((arm, i) => { arm.rotation.x = Math.sin(progress * Math.PI * 8 + i * Math.PI) * -0.25; });
  }

  public updateBallFlight(): void {
    const ball = this.ballMesh as any;
    if (!ball) return;
    
    // Do not dispose predictionPath if we want to show it. But we should render it if we need to.
    // If we only render predictionPath for player, then for bot we just move the ball.

    if (globalAutoAssistConfig.deliveryStartTime !== undefined) {
      const elapsed = gameNow() - globalAutoAssistConfig.deliveryStartTime;
      const delivery = globalAutoAssistConfig.currentDelivery;
      const duration = deliveryDurationMs(delivery?.type ?? 'medium', delivery?.pace);
      let progress = elapsed / duration;
      
      const contactProgress = delivery ? batterContactProgress(delivery) : 1;
      if (progress >= contactProgress) {
        progress = contactProgress;
        globalAutoAssistConfig.isDeliveryActive = false;
      }
      
      const targetX = globalAutoAssistConfig.currentDelivery ? globalAutoAssistConfig.currentDelivery.aimTarget.x : 0;
      const targetZ = delivery?.aimTarget.z ?? -3.5;
      this.notifyDeliveryBounce(progress, delivery?.type ?? 'medium', targetZ);
        
      const activeDelivery: DeliveryChoice = delivery ?? { aimTarget: { x: targetX, z: targetZ }, type: 'medium', line: 'middle', length: 'good', releaseTiming: 0.5, bowlingArm: globalAutoAssistConfig.bowlerArm };
      const pos = sampleDeliveryPath(activeDelivery, progress);
      ball.position.set(pos.x, pos.y + BALL_VISUAL_OFFSET, pos.z);
      if (progress >= contactProgress && this.onBallArrivedCallback) this.onBallArrivedCallback();
    }
  }

  private updateBallPhysics(): void {
    try {
      if (!this.currentBallPos || !this.shotPhysics || !this.ballMesh) return;

      this.physicsAccumulator = advanceBallFrame(this.shotPhysics, this.physicsAccumulator, this.engine.getDeltaTime() / 1000, (state, stepSeconds) => {
        this.shotElapsedSeconds += stepSeconds;
        this.shotTrajectory.push({
          timeSeconds: this.shotElapsedSeconds,
          position: { x: state.position.x, y: state.position.y, z: state.position.z },
        });
        if (state.reachedBoundary) return false;
        for (const [name, profile] of this.fielderProfiles) {
          const root = this.fielderRoots.get(name);
          if (!root) continue;
          const next = advanceFielder({ x: root.position.x, z: root.position.z }, profile, this.fieldingRatings.catching,
            { timeSeconds: this.shotElapsedSeconds, position: state.position, hasBounced: state.hasBounced, reachedBoundary: state.reachedBoundary }, stepSeconds);
          root.position.x = next.position.x;
          root.position.z = next.position.z;
          if (next.kind === 'catch') {
            this.shotCaughtBy = name;
            return true;
          }
          if (next.kind === 'ground_stop') {
            this.shotFieldedBy = name;
            return true;
          }
        }
        return false;
      });
      globalAutoAssistConfig.hasBounced = this.shotPhysics.hasBounced;
      this.shotReachedBoundary = this.shotPhysics.reachedBoundary;
      this.shotBoundaryOnFull = this.shotPhysics.boundaryOnFull ?? false;
      this.ballMesh.position.copyFrom(this.currentBallPos);
      this.ballMesh.position.y += BALL_VISUAL_OFFSET;
      if (this.shotPhysics.stopped || (this.shotPhysics.reachedBoundary && (!this.shotPhysics.boundaryOnFull || this.shotPhysics.hasBounced))) {
        this.endDeliveryCycle();
        return;
      }

      this.ballPathPoints.push(this.ballMesh.position.clone());
      if (this.ballPathPoints.length > 10) this.ballPathPoints.shift();

      this.ballMesh.position.copyFrom(this.currentBallPos);
      this.ballMesh.position.y += BALL_VISUAL_OFFSET;

      // Dynamically track the ball mesh and its high trajectory arc
      if (globalAutoAssistConfig.isBallInPlay) {
        const ball = this.ballMesh;
        if (!ball || ball.isDisposed() || isNaN(ball.position.x) || isNaN(ball.position.y) || isNaN(ball.position.z)) {
          this.primaryCamera.setTarget(new BABYLON.Vector3(0, 1.2, 0));
          return;
        }

        // Retain clear elevated FOV
        this.primaryCamera.fov = 0.85;
      }

      // Draw custom line trail for hit path
      this.updateTrail(this.ballPathPoints, new BABYLON.Color3(1, 0.85, 0.2));
    } catch (e) {
      console.error("[BALL TRACKING CRASH GUARD]", e);
    }
  }


  public animateHitPath(distance: number, direction: number, V_out?: { x: number, y: number, z: number }): void {
    this.isAnimatingBall = false;
    this.updateMissedAnimation = null;
    this.clearBallTrail();
    this.ballMesh?.setEnabled(true);
    
    // Set startPoint to the actual batter's position (crease anchor Z = -8.8)
    const startPoint = this.ballMesh?.position.clone() ?? new BABYLON.Vector3(this.batterRoot?.position.x || 0, 0.4, this.batterRoot?.position.z || -8.8);
    if (this.ballMesh) startPoint.y -= BALL_VISUAL_OFFSET;
    
    // Fix angle so that direction 0 (straight) maps to +Z, and 2 (right/off-side) maps to +X
    const angle = Math.PI / 2 - (direction * Math.PI) / 4;
    
    let currentVelocity = V_out 
      ? new BABYLON.Vector3(V_out.x, V_out.y, V_out.z) 
      : new BABYLON.Vector3(Math.cos(angle) * (distance / 2), Math.max(10, distance * 0.3), Math.sin(angle) * (distance / 2));
      
    if (this.batterHand === 'RHB' && !V_out) {
      currentVelocity.x = -currentVelocity.x;
    }

    this.shotCameraDirection = shotCameraDirection(currentVelocity);
    const cameraPose = followShotPose(startPoint, this.shotCameraDirection);
    this.setCameraMode('follow_shot');
    this.primaryCamera.setTarget(new BABYLON.Vector3(cameraPose.target.x, cameraPose.target.y, cameraPose.target.z));
    this.primaryCamera.setPosition(new BABYLON.Vector3(cameraPose.position.x, cameraPose.position.y, cameraPose.position.z));

    this.ballPathPoints = [startPoint.add(new BABYLON.Vector3(0, BALL_VISUAL_OFFSET, 0))];
    this.currentBallPos = startPoint.clone();
    this.shotOrigin = startPoint.clone();
    this.shotElapsedSeconds = 0;
    this.shotTrajectory = [{
      timeSeconds: 0,
      position: { x: startPoint.x, y: startPoint.y, z: startPoint.z },
    }];
    this.shotReachedBoundary = false;
    this.shotBoundaryOnFull = false;
    this.shotFieldedBy = null;
    this.shotCaughtBy = null;
    this.fielderProfiles.clear();
    for (const fielder of createDefaultFieldLayout(this.batterHand, this.fieldPreset)) {
      const root = this.fielderRoots.get(fielder.name);
      if (!root) continue;
      root.position.set(fielder.position.x, 0, fielder.position.z);
      this.fielderProfiles.set(fielder.name, fielderReachProfileFromRatings(fielder.position, this.fieldingRatings.agility, this.fieldingRatings.reaction));
    }
    this.shotPhysics = { position: this.currentBallPos, velocity: currentVelocity, hasBounced: false, reachedBoundary: false, stopped: false };
    this.physicsAccumulator = 0;
    
    globalAutoAssistConfig.isBallInPlay = true;
  }

  public getShotDistance(): number {
    if (!this.currentBallPos || !this.shotOrigin) return 0;
    return Math.hypot(this.currentBallPos.x - this.shotOrigin.x, this.currentBallPos.z - this.shotOrigin.z);
  }

  public getShotTrajectory(): FieldingTrajectorySample[] {
    return this.shotTrajectory.map(sample => ({ ...sample, position: { ...sample.position } }));
  }

  public animateMissWicket(isWicket: boolean, continuingDelivery?: DeliveryChoice): void {
    this.isAnimatingBall = false;
    this.updateMissedAnimation = null;
    this.clearBallTrail();
    this.bounceMarker?.setEnabled(false);
    const ball = this.ballMesh;
    if (ball && continuingDelivery) {
      const wicketProgress = deliveryProgressAtZ(continuingDelivery, BATTER_STUMPS_Z);
      const startProgress = Math.max(0, Math.min(wicketProgress, deliveryProgressAtZ(continuingDelivery, ball.position.z)));
      const startTime = gameNow();
      const duration = Math.max(1, (wicketProgress - startProgress) * deliveryDurationMs(continuingDelivery.type, continuingDelivery.pace));
      ball.setEnabled(true);
      this.updateMissedAnimation = () => {
        const fraction = Math.min(1, Math.max(0, (gameNow() - startTime) / duration));
        const point = sampleDeliveryPath(continuingDelivery, startProgress + (wicketProgress - startProgress) * fraction);
        ball.position.set(point.x, point.y + BALL_VISUAL_OFFSET, point.z);
        if (fraction >= 1) {
          ball.setEnabled(false);
          this.updateMissedAnimation = null;
        }
      };
    } else {
      ball?.setEnabled(false);
    }
    
    if (isWicket && this.batterRoot) {
      // Trigger a dramatic slump animation or knock over stumps
      BABYLON.Animation.CreateAndStartAnimation(
        'batterDrop',
        this.batterRoot,
        'rotation.x',
        30,
        15,
        0,
        Math.PI / 4,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
    }
    
    const onResolved = this.onBallResolvedCallback;
    this.onBallResolvedCallback = null;
    setGameTimeout(() => {
      if (this.batterRoot) this.batterRoot.rotation.x = 0;
      onResolved?.();
    }, 1500);
  }
}
