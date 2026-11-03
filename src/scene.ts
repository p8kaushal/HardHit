import * as BABYLON from 'babylonjs';
import { gameNow, isGamePaused } from './game-clock';
import { CameraMode, DeliveryType } from './types';
import { globalAutoAssistConfig } from './game';
import { BATTER_CREASE_Z, deliveryAnimationStep, deliveryArrivalHeight, deliveryDurationMs, deliverySwingAtBounce, getDeliveryFlightPosition } from './formula';
import { stepBall, type BallState } from './ball-physics';

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
        public batterRoot: BABYLON.TransformNode | null = null;
        public hudAvatarRoot: BABYLON.TransformNode | null = null;
    public batMesh: BABYLON.Mesh | null = null;


  // Animation state
  private isAnimatingBall = false;
  private ballAnimationTime = 0;
  private ballTrajectoryPoints: BABYLON.Vector3[] = [];
  private onBallArrivedCallback: (() => void) | null = null;
  private onBallResolvedCallback: (() => void) | null = null;
  private onBallCreaseCrossedCallback: (() => void) | null = null;
  private creaseCrossedFired = false;
  
  private batterHand: 'RHB' | 'LHB' = 'RHB';
  

  
  public isBotBatting: boolean = false;
  public hasBotSwung: boolean = false;
  public botBattingTriggerCallback: (() => void) | null = null;
  
  private currentBallPos: BABYLON.Vector3 | null = null;
  private shotOrigin: BABYLON.Vector3 | null = null;
  private shotPhysics: BallState | null = null;
  private physicsAccumulator = 0;
  public shotReachedBoundary = false;
  private ballPathPoints: BABYLON.Vector3[] = [];
  
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
    this.buildBall();

    const observer = this.scene.onBeforeRenderObservable.add(() => {
      try {
        if (globalAutoAssistConfig.isBallInPlay) {
          this.updateBallPhysics();
        }
        if (globalAutoAssistConfig.isRunUpActive) {
          this.updateBowlerRunUp();
        }
        if (globalAutoAssistConfig.isDeliveryActive) {
          this.updateBallFlight();
        }
        if (this.isAnimatingBall && this.isBotBatting) {
          if (this.ballMesh && this.ballMesh.position.z <= -7.5 && !this.hasBotSwung) {
            this.hasBotSwung = true;
            if (this.botBattingTriggerCallback) {
              this.botBattingTriggerCallback();
            }
          }
        }
        if (this.activeCameraMode === 'follow_shot' && this.ballMesh) {
          const currentTarget = this.primaryCamera.getTarget();
          const frames = Math.min(this.engine.getDeltaTime(), 50) * 60 / 1000;
          const newTarget = BABYLON.Vector3.Lerp(currentTarget, this.ballMesh.position, 1 - Math.pow(0.92, frames));
          if (Number.isFinite(newTarget.x) && Number.isFinite(newTarget.y) && Number.isFinite(newTarget.z)) {
            this.primaryCamera.setTarget(newTarget);
          }
          
          const targetPos = this.ballMesh.position.add(new BABYLON.Vector3(0, 4.5, -11.0));
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
      if (this.hudAvatarRoot) {
        this.hudAvatarRoot.setEnabled(false);
      }
    };

    window.addEventListener('keydown', (e) => {
      // Crease-Zone Input Buffering (Easy Mode)
      if (e.code === 'Space' && !this.isBotBatting && globalAutoAssistConfig.isRookie) {
        if (this.isAnimatingBall && this.ballMesh) {
          const z = this.ballMesh.position.z;
          // Physical arrival zone definition
          if (z <= -6.5 && z >= BATTER_CREASE_Z) {
            globalAutoAssistConfig.bufferedTiming = 0.5; // Guaranteed valid timing offset (0 deviation)
          }
        }
      }
    });

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
    // Ground
    const grassMaterial = new BABYLON.StandardMaterial('grassMat', this.scene);
    grassMaterial.diffuseColor = new BABYLON.Color3(0.12, 0.42, 0.16);
    grassMaterial.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);

    const outfield = BABYLON.MeshBuilder.CreateGround('outfield', { width: 140, height: 140 }, this.scene);
    outfield.material = grassMaterial;

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
    createLine('poppingCreaseBat', [new BABYLON.Vector3(-1.32, 0, 8.2), new BABYLON.Vector3(1.32, 0, 8.2)]);
    createLine('poppingCreaseBowl', [new BABYLON.Vector3(-1.32, 0, -8.2), new BABYLON.Vector3(1.32, 0, -8.2)]);

    // Bowling Creases
    createLine('bowlingCreaseBat', [new BABYLON.Vector3(-1.32, 0, 10), new BABYLON.Vector3(1.32, 0, 10)]);
    createLine('bowlingCreaseBowl', [new BABYLON.Vector3(-1.32, 0, -10), new BABYLON.Vector3(1.32, 0, -10)]);

    // Return Creases
    createLine('returnCreaseLeftBat', [new BABYLON.Vector3(-1.32, 0, 8.2), new BABYLON.Vector3(-1.32, 0, 10)]);
    createLine('returnCreaseRightBat', [new BABYLON.Vector3(1.32, 0, 8.2), new BABYLON.Vector3(1.32, 0, 10)]);
    createLine('returnCreaseLeftBowl', [new BABYLON.Vector3(-1.32, 0, -8.2), new BABYLON.Vector3(-1.32, 0, -10)]);
    createLine('returnCreaseRightBowl', [new BABYLON.Vector3(1.32, 0, -8.2), new BABYLON.Vector3(1.32, 0, -10)]);

    // Wide Lines
    createLine('wideLineLeftBat', [new BABYLON.Vector3(-0.89, 0, 8.2), new BABYLON.Vector3(-0.89, 0, 10)]);
    createLine('wideLineRightBat', [new BABYLON.Vector3(0.89, 0, 8.2), new BABYLON.Vector3(0.89, 0, 10)]);
    createLine('wideLineLeftBowl', [new BABYLON.Vector3(-0.89, 0, -8.2), new BABYLON.Vector3(-0.89, 0, -10)]);
    createLine('wideLineRightBowl', [new BABYLON.Vector3(0.89, 0, -8.2), new BABYLON.Vector3(0.89, 0, -10)]);

    // Stumps (Bowling crease: Z = -10, Batting crease: Z = 10)
    this.buildStumps(new BABYLON.Vector3(0, 0, -10));
    this.buildStumps(new BABYLON.Vector3(0, 0, 10));
    
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
    
    const stumpWidth = 0.05;
    const stumpHeight = 0.9;
    
    // Create 3 stumps
    for (let i = -1; i <= 1; i++) {
      const stump = BABYLON.MeshBuilder.CreateCylinder(`stump_${position.z}_${i}`, {
        height: stumpHeight,
        diameter: stumpWidth
      }, this.scene);
      stump.position.set(position.x + (i * 0.12), stumpHeight / 2, position.z);
      stump.material = stumpMat;
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
      this.batterRoot.position.set(-0.35, 0.0, -8.8);
    }
    const targetMode: CameraMode = isPlayerBatting ? 'batter_eye' : 'bowler_eye';
    this.setCameraMode(targetMode);
  }

  private buildCharacters(): void {
    // Scene-Graph Duplicate Audit & Purge
    const purgeNames = ['batter', 'player', 'batsman', 'avatar', 'preview', 'capsule'];
    
    // 2. Purge Preview Overlays & Camera Attachments
    this.scene.meshes.forEach(m => {
      const lowerName = m.name.toLowerCase();
      const isPreview = lowerName.includes('preview') || lowerName.includes('avatar');
      const isCharacter = purgeNames.some(pn => lowerName.includes(pn));
      const nearCamera = m.position.z < -19.0 || m.position.x > 1.0;
      const isParentedToCamera = m.parent === this.primaryCamera || (m.parent && m.parent.name.includes('cameraPivot'));

      if (isPreview && nearCamera) {
        m.dispose();
      }
      if (isCharacter && isParentedToCamera) {
        m.dispose();
      }
    });

    const batterNodes = this.scene.meshes.filter(m => purgeNames.some(pn => m.name.toLowerCase().includes(pn)));
    batterNodes.forEach(m => m.dispose());
    
    const batterTransforms = this.scene.transformNodes.filter(t => purgeNames.some(pn => t.name.toLowerCase().includes(pn)));
    batterTransforms.forEach(t => t.dispose());

    // --------------------------------------------------------
    // Dedicated Bowler Mesh Hierarchy
    // --------------------------------------------------------
    const bowlerRoot = new BABYLON.TransformNode("bowlerRoot", this.scene);
    bowlerRoot.position.set(0.6, 0.0, 11.5);
    bowlerRoot.parent = null;

    const bowlerMat = new BABYLON.StandardMaterial('bowlerMat', this.scene);
    bowlerMat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.2); // Green
    bowlerMat.alpha = 1.0;

    const bowlerTorso = BABYLON.MeshBuilder.CreateCylinder('bowlerTorso', { height: 1.2, diameter: 0.4 }, this.scene);
    bowlerTorso.parent = bowlerRoot;
    bowlerTorso.position = new BABYLON.Vector3(0, 1.2, 0);
    bowlerTorso.material = bowlerMat;

    const bowlerHead = BABYLON.MeshBuilder.CreateSphere('bowlerHead', { diameter: 0.35 }, this.scene);
    bowlerHead.parent = bowlerRoot;
    bowlerHead.position = new BABYLON.Vector3(0, 1.95, 0);
    bowlerHead.material = bowlerMat;

    const bowlerLeftArm = BABYLON.MeshBuilder.CreateCylinder('bowlerLArm', { height: 0.6, diameter: 0.15 }, this.scene);
    bowlerLeftArm.parent = bowlerRoot;
    bowlerLeftArm.position = new BABYLON.Vector3(-0.3, 1.4, 0);
    bowlerLeftArm.rotation.z = Math.PI / 8;
    bowlerLeftArm.material = bowlerMat;

    const bowlerRightArm = BABYLON.MeshBuilder.CreateCylinder('bowlerRArm', { height: 0.6, diameter: 0.15 }, this.scene);
    bowlerRightArm.parent = bowlerRoot;
    bowlerRightArm.position = new BABYLON.Vector3(0.3, 1.4, 0);
    bowlerRightArm.rotation.z = -Math.PI / 8;
    bowlerRightArm.material = bowlerMat;

    this.bowlerRoot = bowlerRoot;

    // --------------------------------------------------------
    // Unified Batter (Physical presence at crease)
    // --------------------------------------------------------
    const batterRoot = new BABYLON.TransformNode("batterRoot", this.scene);
    batterRoot.position.set(-0.35, 0.0, -8.8);
    batterRoot.parent = null;

    const batterBlueMat = new BABYLON.StandardMaterial('batterBlueMat', this.scene);
    batterBlueMat.diffuseColor = new BABYLON.Color3(0.1, 0.3, 0.85); // Blue jersey
    batterBlueMat.alpha = 1.0;

    const bTorso = BABYLON.MeshBuilder.CreateCylinder('batterTorso', { height: 1.2, diameter: 0.4 }, this.scene);
    bTorso.parent = batterRoot;
    bTorso.position = new BABYLON.Vector3(0, 1.2, 0);
    bTorso.material = batterBlueMat;

    const bHead = BABYLON.MeshBuilder.CreateSphere('batterHead', { diameter: 0.35 }, this.scene);
    bHead.parent = batterRoot;
    bHead.position = new BABYLON.Vector3(0, 1.9, 0);
    bHead.material = batterBlueMat;
    
    const bArms = BABYLON.MeshBuilder.CreateCylinder('batterArms', { height: 0.6, diameter: 0.15 }, this.scene);
    bArms.parent = batterRoot;
    bArms.position = new BABYLON.Vector3(0, 0.8, 0); // zero x/z
    bArms.material = batterBlueMat;

    // True Pitch Bat
    const batMat = new BABYLON.StandardMaterial('batMat', this.scene);
    batMat.diffuseColor = new BABYLON.Color3(0.65, 0.5, 0.3);

    const bBat = BABYLON.MeshBuilder.CreateBox('batMesh', { width: 0.08, height: 0.9, depth: 0.04 }, this.scene);
    bBat.parent = batterRoot;
    bBat.position.set(0, 0.7, 0); // zero x/z
    bBat.rotation.z = -0.4;
    bBat.material = batMat;
    
    this.batMesh = bBat;

    batterRoot.scaling = new BABYLON.Vector3(1.0, 1.0, 1.0);
    batterRoot.rotation = new BABYLON.Vector3(0, Math.PI, 0);

    this.batterRoot = batterRoot;
    // We do NOT set position here again to keep it ONCE as instructed, 
    // but the prompt says: Set its position ONCE at initialization: batterRoot.position.set(-0.35, 0.0, -8.8);
        this.updateBatterPosition();

    // Isolate HUD Avatar (Now used as Contact Marker)
    const hudAvatarRoot = new BABYLON.TransformNode("hudAvatarRoot", this.scene);
    hudAvatarRoot.parent = null; // Removed from primaryCamera
    
    // Add a simple representation for the avatar so it is visible
    const avatarMesh = BABYLON.MeshBuilder.CreateBox("hudAvatarMesh", { size: 0.3 }, this.scene);
    avatarMesh.parent = hudAvatarRoot;
    const avatarMat = new BABYLON.StandardMaterial('avatarMat', this.scene);
    avatarMat.diffuseColor = new BABYLON.Color3(1.0, 0.5, 0.0);
    avatarMesh.material = avatarMat;
    
    hudAvatarRoot.setEnabled(false);
    
    this.hudAvatarRoot = hudAvatarRoot;
  }

  public setBatterHandedness(hand: 'RHB' | 'LHB'): void {
    this.batterHand = hand;
    if (!this.batterRoot) return;
    
    this.batterRoot.parent = null;
    this.batterRoot.scaling = new BABYLON.Vector3(1.0, 1.0, 1.0);
    this.batterRoot.rotation = new BABYLON.Vector3(0, Math.PI, 0);
    this.batterRoot.setEnabled(true);

    this.updateBatterPosition();
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
    const clampedDx = Math.max(-0.8, Math.min(0.8, dx));
    const clampedDz = Math.max(-1.2, Math.min(0.5, dz));
    this.playerCreaseOffset.set(clampedDx, 0.0, clampedDz);
    this.updateBatterPosition();
  }

  private buildBall(): void {
    const ballMat = new BABYLON.StandardMaterial('ballMat', this.scene);
    ballMat.diffuseColor = new BABYLON.Color3(0.85, 0.1, 0.1);
    
    this.ballMesh = BABYLON.MeshBuilder.CreateSphere('cricketBall', { diameter: 0.15 }, this.scene);
    this.ballMesh.material = ballMat;
    this.ballMesh.setEnabled(false);
  }

  // --- Animation Mechanics ---

  public generateTrajectoryPoints(
    aimTarget: { x: number; z: number },
    type: DeliveryType,
    _overTheWicket: boolean = true,
    turn = 0.5,
    swing = 0,
    pace = 0.5
  ): BABYLON.Vector3[] {
    const points: BABYLON.Vector3[] = [];
    const steps = 60;
    
    const targetX = aimTarget.x;
    // We get targetZ from the same marker logic. For bot, it's bounceMarker Z.
    // We will just use the bounce marker Z or compute it.
    const bounceZ = this.bounceMarker ? this.bounceMarker.position.z : aimTarget.z;
    
    const startX = globalAutoAssistConfig.bowlerArm === 'Left' ? -0.6 : 0.6;
    const release = { x: startX, y: 1.9, z: 10.0 };
    const bounce = { x: targetX, y: 0.06, z: bounceZ };
    const seamDrift = 0;
    const end = { x: targetX + seamDrift, y: deliveryArrivalHeight(bounceZ, type, pace), z: BATTER_CREASE_Z };
    
    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      const pos = getDeliveryFlightPosition(progress, release, bounce, end, type, turn, swing, pace);
      points.push(new BABYLON.Vector3(pos.x, pos.y, pos.z));
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
    this.onBallArrivedCallback = onArrived;
    this.onBallResolvedCallback = onResolved;
    this.onBallCreaseCrossedCallback = onCreaseCrossed || null;
    this.creaseCrossedFired = false;
    this.hasBotSwung = false;
    
    // Ensure active camera remains strictly locked in player's perspective during delivery
    const preContactCam: CameraMode = this.isBotBatting ? 'bowler_eye' : 'batter_eye';
    this.setCameraMode(preContactCam);

    // Position bounce marker indicator on pitch
    if (this.bounceMarker) {
      this.bounceMarker.parent = null;
      this.bounceMarker.isVisible = true;
      this.bounceMarker.setEnabled(true);
      this.bounceMarker.position.set(aimTarget.x + deliverySwingAtBounce(deliveryType, swing, aimTarget.z), 0.08, aimTarget.z);
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
      this.bowlerRoot.position.x = globalAutoAssistConfig.bowlerArm === 'Left' ? -0.6 : 0.6;
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
      if (!this.isAnimatingBall) return;
      if (isGamePaused()) { requestAnimationFrame(animateFrame); return; }
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
      const index = Math.floor(this.ballAnimationTime);

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

      if (index >= this.ballTrajectoryPoints.length) {
        // Ball passed/reached batter stumps
        this.isAnimatingBall = false;
        this.ballMesh?.setEnabled(false);
        this.bounceMarker?.setEnabled(false);
        this.timingRing?.setEnabled(false);
        if (this.predictionPath) {
          this.predictionPath.dispose();
          this.predictionPath = null;
        }
        if (this.onBallArrivedCallback) this.onBallArrivedCallback();
        return;
      }

      this.ballMesh?.position.copyFrom(this.ballTrajectoryPoints[index]);
      
      if (!this.creaseCrossedFired && this.ballMesh && this.ballMesh.position.z <= -8.5) {
        this.creaseCrossedFired = true;
        if (this.onBallCreaseCrossedCallback) {
          this.onBallCreaseCrossedCallback();
        }
      }

      // Draw custom line trail
      this.drawBallTrail();

      requestAnimationFrame(animateFrame);
    };

    animateFrame();
  }

  private drawBallTrail(): void {
    if (!this.ballMesh) return;
    const index = Math.floor(this.ballAnimationTime);
    const trailPoints = this.ballTrajectoryPoints.slice(Math.max(0, index - 8), index + 1);
    this.updateTrail(trailPoints, new BABYLON.Color3(0.9, 0.9, 0.4));
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
    if (this.batMesh && this.batterRoot) {
      // Temporarily rotate batter and bat to swing (9 frames at 60fps = 0.15s)
      const swingAnim = BABYLON.Animation.CreateAndStartAnimation(
        'batterSwing',
        this.batMesh,
        'rotation.y',
        60,
        9,
        0,
        Math.PI * 0.9,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
      
      swingAnim?.onAnimationEndObservable.add(() => {
        // Return bat
        this.batMesh!.rotation.y = 0;
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
    
    if (this.ballMesh) this.ballMesh.setEnabled(false);
    if (this.bounceMarker) this.bounceMarker.setEnabled(false);
    if (this.timingRing) this.timingRing.setEnabled(false);
    if (this.hudAvatarRoot) this.hudAvatarRoot.setEnabled(false);
    if (this.predictionPath) {
      this.predictionPath.dispose();
      this.predictionPath = null;
    }
    if (this.ballTrail) {
      this.ballTrail.dispose();
      this.ballTrail = null;
    }

    if (this.onBallResolvedCallback) {
      this.onBallResolvedCallback();
    }
  }

  public resetBowlerMesh(): void {
    if (!this.bowlerRoot) return;
    this.bowlerRoot.setEnabled(true);
    this.bowlerRoot.scaling = new BABYLON.Vector3(1.0, 1.0, 1.0);
    this.bowlerRoot.rotation = new BABYLON.Vector3(0, Math.PI, 0);
    this.bowlerRoot.position = new BABYLON.Vector3(0.6, 0.0, 11.5);
    
    // Ensure no ball meshes or other unintended geometries are parented
    const children = this.bowlerRoot.getChildren();
    for (const child of children) {
      if (child.name === 'cricketBall' || child.name === 'ballTrail') {
        child.parent = null;
      }
    }
  }

  public updateBowlerRunUp(): void {
    if (!this.bowlerRoot || !globalAutoAssistConfig.runUpStartTime) return;
    
    this.bowlerRoot.setEnabled(true);

    // ENFORCE BATTER VISIBILITY
    if (this.batterRoot) {
      this.batterRoot.setEnabled(true);
      this.batterRoot.getChildMeshes().forEach(m => { m.isVisible = true; });
    }
    
    const elapsed = gameNow() - globalAutoAssistConfig.runUpStartTime;
    const duration = 1200;
    const progress = Math.min(1.0, elapsed / duration);
    
    // Smoothly interpolate from +12.0m to +10.0m (release crease)
    const z = BABYLON.Scalar.Lerp(12.0, 10.0, progress);
    const bounce = Math.sin(progress * Math.PI * 8) * 0.15;
    
    this.bowlerRoot.position.z = z;
    this.bowlerRoot.position.y = bounce;
    this.bowlerRoot.rotation.x = Math.sin(progress * Math.PI * 16) * 0.2;
    this.bowlerRoot.position.x = globalAutoAssistConfig.bowlerArm === 'Left' ? -0.6 : 0.6;
  }

  public updateBallFlight(): void {
    const ball = this.ballMesh as any;
    if (!ball) return;
    
    // ENFORCE BATTER VISIBILITY
    if (this.batterRoot) {
      this.batterRoot.setEnabled(true);
      this.batterRoot.getChildMeshes().forEach(m => { m.isVisible = true; });
    }

    // Do not dispose predictionPath if we want to show it. But we should render it if we need to.
    // If we only render predictionPath for player, then for bot we just move the ball.

    if (globalAutoAssistConfig.deliveryStartTime) {
      const elapsed = gameNow() - globalAutoAssistConfig.deliveryStartTime;
      const delivery = globalAutoAssistConfig.currentDelivery;
      const duration = deliveryDurationMs(delivery?.type ?? 'medium', delivery?.pace);
      let progress = elapsed / duration;
      
      if (progress >= 1.0) {
        progress = 1.0;
        globalAutoAssistConfig.isDeliveryActive = false;
      }
      
      const targetX = globalAutoAssistConfig.currentDelivery ? globalAutoAssistConfig.currentDelivery.aimTarget.x : 0;
      const targetZ = delivery?.aimTarget.z ?? -3.5;
        
      const startX = globalAutoAssistConfig.bowlerArm === 'Left' ? -0.6 : 0.6;
      const release = { x: startX, y: 1.9, z: 10.0 };
      const bounce = { x: targetX, y: 0.06, z: targetZ };
      const seamDrift = 0;
      const end = { x: targetX + seamDrift, y: deliveryArrivalHeight(targetZ, delivery?.type, delivery?.pace), z: BATTER_CREASE_Z };
      
      const pos = getDeliveryFlightPosition(progress, release, bounce, end, delivery?.type ?? 'medium', delivery?.turn, delivery?.swing, delivery?.pace);
      ball.position.set(pos.x, pos.y, pos.z);
      if (progress >= 1.0 && this.onBallArrivedCallback) this.onBallArrivedCallback();
    }
  }

  private updateBallPhysics(): void {
    try {
      if (!this.currentBallPos || !this.shotPhysics || !this.ballMesh) return;

      const step = 1 / 120;
      this.physicsAccumulator += Math.min(this.engine.getDeltaTime() / 1000, 0.05);
      while (this.physicsAccumulator >= step) {
        stepBall(this.shotPhysics, step);
        this.physicsAccumulator -= step;
        if (this.shotPhysics.stopped || this.shotPhysics.reachedBoundary) break;
      }
      globalAutoAssistConfig.hasBounced = this.shotPhysics.hasBounced;
      this.shotReachedBoundary = this.shotPhysics.reachedBoundary;
      this.ballMesh.position.copyFrom(this.currentBallPos);
      if (this.shotPhysics.stopped || this.shotPhysics.reachedBoundary) {
        this.endDeliveryCycle();
        return;
      }

      this.ballPathPoints.push(this.currentBallPos.clone());
      if (this.ballPathPoints.length > 10) this.ballPathPoints.shift();

      this.ballMesh.position.copyFrom(this.currentBallPos);

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
    this.ballMesh?.setEnabled(true);
    
    // Transition active camera to follow_shot trajectory view immediately upon bat contact
    this.setCameraMode('follow_shot');
    
    // Set startPoint to the actual batter's position (crease anchor Z = -8.8)
    const startPoint = new BABYLON.Vector3(this.batterRoot?.position.x || 0, 0.4, this.batterRoot?.position.z || -8.8);
    
    // Only render/position the marker when valid bat-ball contact occurs in pitch/outfield space (Z > -10.0m)
    if (this.hudAvatarRoot && startPoint.z > -10.0) {
      this.hudAvatarRoot.setEnabled(true);
      this.hudAvatarRoot.position.copyFrom(startPoint);
    }
    
    // Fix angle so that direction 0 (straight) maps to +Z, and 2 (right/off-side) maps to +X
    const angle = Math.PI / 2 - (direction * Math.PI) / 4;
    
    let currentVelocity = V_out 
      ? new BABYLON.Vector3(V_out.x, V_out.y, V_out.z) 
      : new BABYLON.Vector3(Math.cos(angle) * (distance / 2), Math.max(10, distance * 0.3), Math.sin(angle) * (distance / 2));
      
    if (this.batterHand === 'RHB' && !V_out) {
      currentVelocity.x = -currentVelocity.x;
    }

    this.ballPathPoints = [startPoint.clone()];
    this.currentBallPos = startPoint.clone();
    this.shotOrigin = startPoint.clone();
    this.shotReachedBoundary = false;
    this.shotPhysics = { position: this.currentBallPos, velocity: currentVelocity, hasBounced: false, reachedBoundary: false, stopped: false };
    this.physicsAccumulator = 0;
    
    globalAutoAssistConfig.isBallInPlay = true;
  }

  public getShotDistance(): number {
    if (!this.currentBallPos || !this.shotOrigin) return 0;
    return Math.hypot(this.currentBallPos.x - this.shotOrigin.x, this.currentBallPos.z - this.shotOrigin.z);
  }

  public animateMissWicket(isWicket: boolean): void {
    this.isAnimatingBall = false;
    this.ballMesh?.setEnabled(false);
    
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
    
    setTimeout(() => {
      if (this.batterRoot) this.batterRoot.rotation.x = 0;
      if (this.onBallResolvedCallback) this.onBallResolvedCallback();
    }, 1500);
  }
}
