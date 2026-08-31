import * as BABYLON from 'babylonjs';
import { CameraMode } from './types';
import { globalAutoAssistConfig } from './game';
import { getParabolicFlightPosition } from './formula';

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
  private predictionPath: BABYLON.LinesMesh | null = null;
  private bounceMarker: BABYLON.Mesh | null = null;
  private timingRing: BABYLON.Mesh | null = null;
  
  // Characters (Procedural low-poly)
  public static CREASE_ANCHOR = new BABYLON.Vector3(0.0, 0.0, -17.8);
  public playerCreaseOffset = new BABYLON.Vector3(0.4, 0.0, 0.0);
  private bowlerMesh: BABYLON.TransformNode | null = null;
  public hudAvatarRoot: BABYLON.TransformNode | null = null;
  public hudAvatarTorso: BABYLON.Mesh | null = null;
  private pitchBatterRoot: BABYLON.TransformNode | null = null;
  private pitchBatMesh: BABYLON.Mesh | null = null;


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
  
  private currentBallVelocity: BABYLON.Vector3 | null = null;
  private currentBallPos: BABYLON.Vector3 | null = null;
  private ballPathPoints: BABYLON.Vector3[] = [];
  private ballUnitDir: BABYLON.Vector3 | null = null;
  private ballSideDir: BABYLON.Vector3 | null = null;
  
  constructor(canvasElementId: string) {
    this.canvas = document.getElementById(canvasElementId) as unknown as HTMLCanvasElement;
    this.engine = new BABYLON.Engine(this.canvas, true);
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
          if (this.ballMesh && this.ballMesh.position.z >= 7.9 && !this.hasBotSwung) {
            this.hasBotSwung = true;
            if (this.botBattingTriggerCallback) {
              this.botBattingTriggerCallback();
            }
          }
        }
        if (this.activeCameraMode === 'follow_shot' && this.ballMesh) {
          const currentTarget = this.primaryCamera.getTarget();
          const newTarget = BABYLON.Vector3.Lerp(currentTarget, this.ballMesh.position, 0.08);
          if (Number.isFinite(newTarget.x) && Number.isFinite(newTarget.y) && Number.isFinite(newTarget.z)) {
            this.primaryCamera.setTarget(newTarget);
          }
          
          const targetPos = this.ballMesh.position.add(new BABYLON.Vector3(0, 4.5, -11.0));
          this.primaryCamera.position = BABYLON.Vector3.Lerp(this.primaryCamera.position, targetPos, 0.05);
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

    window.addEventListener('keydown', (e) => {
      // Crease-Zone Input Buffering (Easy Mode)
      if (e.code === 'Space' && !this.isBotBatting && globalAutoAssistConfig.isRookie) {
        if (this.isAnimatingBall && this.ballMesh) {
          const z = this.ballMesh.position.z;
          // Physical arrival zone definition
          if (z >= 6.0 && z <= 9.4) {
            globalAutoAssistConfig.bufferedTiming = 0.5; // Guaranteed valid timing offset (0 deviation)
          }
        }
      }
    });

    // Start render loop
    this.engine.runRenderLoop(() => {
      this.scene.render();
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
    this.bounceMarker.position.y = 0.04;
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
    this.activeCameraMode = mode;
    if (this.pitchBatterRoot) this.pitchBatterRoot.parent = null;
    
    // Smooth snaps or fixed snaps depending on mode
    if (mode === 'batter_eye') {
      this.setBattingCameraView();
    } else if (mode === 'bowler_eye') {
      if (this.isBotBatting) {
        this.primaryCamera.position = new BABYLON.Vector3(0, 2.2, 22.5);
        this.primaryCamera.setTarget(new BABYLON.Vector3(0, 1.2, -18.0));
      }
    } else if (mode === 'stadium_wide') {
      this.primaryCamera.position = new BABYLON.Vector3(15, 12, -22);
      this.primaryCamera.setTarget(new BABYLON.Vector3(0, 1.5, 0));
    }
  }

  public setBattingCameraView(): void {
    this.primaryCamera.position = new BABYLON.Vector3(-1.8, 3.2, -23.5);
    this.primaryCamera.setTarget(new BABYLON.Vector3(0.0, 1.0, 0.0));
    this.primaryCamera.lockedTarget = null;
    this.primaryCamera.fov = 0.85;
  }

  public getCameraMode(): CameraMode {
    return this.activeCameraMode;
  }

  public resetCameraToPlayerView(isPlayerBatting: boolean): void {
    if (this.pitchBatterRoot) this.pitchBatterRoot.parent = null;
    const targetMode: CameraMode = isPlayerBatting ? 'batter_eye' : 'bowler_eye';
    this.setCameraMode(targetMode);
  }

  private buildCharacters(): void {
    console.log("SCENE MESHES:", this.scene.meshes.map(m => m.name));

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

    // Bowler placeholder shape (Blue)
    const bowlerContainer = new BABYLON.TransformNode('bowlerContainer', this.scene);
    const bodyMat = new BABYLON.StandardMaterial('bowlerMat', this.scene);
    bodyMat.diffuseColor = new BABYLON.Color3(0.2, 0.4, 0.9);
    
    const torso = BABYLON.MeshBuilder.CreateCylinder('bowlerTorso', { height: 1.2, diameter: 0.4 }, this.scene);
    torso.position = new BABYLON.Vector3(0, 1.2, 0);
    torso.parent = bowlerContainer;
    torso.material = bodyMat;

    const head = BABYLON.MeshBuilder.CreateSphere('bowlerHead', { diameter: 0.35 }, this.scene);
    head.position = new BABYLON.Vector3(0, 1.9, 0);
    head.parent = bowlerContainer;
    head.material = bodyMat;
    
    bowlerContainer.position.set(0, 0, -11.5);
    this.bowlerMesh = bowlerContainer;

    // --------------------------------------------------------
    // HUD Avatar (Pink, remains in viewport / UI space)
    // --------------------------------------------------------
    const hudAvatarRoot = new BABYLON.TransformNode('hudAvatarRoot', this.scene);
    hudAvatarRoot.position = new BABYLON.Vector3(0.4, 0.0, -17.8);
    hudAvatarRoot.parent = null;

    const hudBatterMat = new BABYLON.StandardMaterial('hudBatterMat', this.scene);
    hudBatterMat.diffuseColor = new BABYLON.Color3(0.9, 0.2, 0.4); // Pink
    hudBatterMat.alpha = 1.0;

    const hudAvatarTorso = BABYLON.MeshBuilder.CreateCylinder('hudAvatarTorso', { height: 1.2, diameter: 0.4 }, this.scene);
    hudAvatarTorso.parent = hudAvatarRoot;
    hudAvatarTorso.position = new BABYLON.Vector3(0, 1.2, 0);
    hudAvatarTorso.material = hudBatterMat;
    hudAvatarTorso.visibility = 1.0;

    const hudAvatarHead = BABYLON.MeshBuilder.CreateSphere('hudAvatarHead', { diameter: 0.35 }, this.scene);
    hudAvatarHead.parent = hudAvatarRoot;
    hudAvatarHead.position = new BABYLON.Vector3(0, 1.9, 0);
    hudAvatarHead.material = hudBatterMat;
    hudAvatarHead.visibility = 1.0;

    // HUD Bat
    const hudBatMat = new BABYLON.StandardMaterial('hudBatMat', this.scene);
    hudBatMat.diffuseColor = new BABYLON.Color3(0.65, 0.5, 0.3);
    const hudBat = BABYLON.MeshBuilder.CreateBox('hudBat', { width: 0.08, height: 0.9, depth: 0.04 }, this.scene);
    hudBat.parent = hudAvatarRoot;
    hudBat.position.set(0, 0.7, 0);
    hudBat.rotation.z = -0.4;
    hudBat.material = hudBatMat;

    hudAvatarRoot.scaling = new BABYLON.Vector3(1.0, 1.0, 1.0);
    hudAvatarRoot.rotation = new BABYLON.Vector3(0, 0, 0);
    hudAvatarRoot.parent = null;
    hudAvatarRoot.position.copyFrom(GameScene.CREASE_ANCHOR.add(this.playerCreaseOffset));
    hudAvatarRoot.setEnabled(true);
    
    this.hudAvatarRoot = hudAvatarRoot;
    this.hudAvatarTorso = hudAvatarTorso;

    // --------------------------------------------------------
    // True Pitch Batter (White/Blue, physical presence at crease)
    // --------------------------------------------------------
    const pitchBatterRoot = new BABYLON.TransformNode('pitchBatterRoot', this.scene);
    pitchBatterRoot.position = new BABYLON.Vector3(0.4, 0.0, -17.8);
    pitchBatterRoot.parent = null;

    const pitchBatterMat = new BABYLON.StandardMaterial('pitchBatterMat', this.scene);
    pitchBatterMat.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9); // Clean white/blue standard cricket jersey
    pitchBatterMat.alpha = 1.0;

    const pitchTorso = BABYLON.MeshBuilder.CreateCylinder('pitchBatterTorso', { height: 1.2, diameter: 0.4 }, this.scene);
    pitchTorso.parent = pitchBatterRoot;
    pitchTorso.position = new BABYLON.Vector3(0, 1.2, 0);
    pitchTorso.material = pitchBatterMat;
    pitchTorso.visibility = 1.0;

    const pitchHead = BABYLON.MeshBuilder.CreateSphere('pitchBatterHead', { diameter: 0.35 }, this.scene);
    pitchHead.parent = pitchBatterRoot;
    pitchHead.position = new BABYLON.Vector3(0, 1.9, 0);
    pitchHead.material = pitchBatterMat;
    pitchHead.visibility = 1.0;

    // True Pitch Bat
    const pitchBat = BABYLON.MeshBuilder.CreateBox('pitchBat', { width: 0.08, height: 0.9, depth: 0.04 }, this.scene);
    pitchBat.parent = pitchBatterRoot;
    pitchBat.position.set(0, 0.7, 0);
    pitchBat.rotation.z = -0.4;
    pitchBat.material = hudBatMat; // Share bat material
    
    this.pitchBatMesh = pitchBat;

    pitchBatterRoot.scaling = new BABYLON.Vector3(1.0, 1.0, 1.0);
    pitchBatterRoot.rotation = new BABYLON.Vector3(0, 0, 0);
    pitchBatterRoot.parent = null;
    pitchBatterRoot.position.copyFrom(GameScene.CREASE_ANCHOR.add(this.playerCreaseOffset));
    pitchBatterRoot.setEnabled(true);

    pitchTorso.isVisible = true;
    pitchHead.isVisible = true;

    this.pitchBatterRoot = pitchBatterRoot;
    this.updateBatterPosition();
  }

  public setBatterHandedness(hand: 'RHB' | 'LHB'): void {
    this.batterHand = hand;
    if (!this.pitchBatterRoot) return;
    
    this.pitchBatterRoot.parent = null;
    this.pitchBatterRoot.scaling = new BABYLON.Vector3(1.0, 1.0, 1.0);
    this.pitchBatterRoot.rotation = new BABYLON.Vector3(0, 0, 0);
    this.pitchBatterRoot.setEnabled(true);

    this.updateBatterPosition();
  }

  public updateBatterPosition(): void {
    if (!this.pitchBatterRoot) return;
    this.pitchBatterRoot.parent = null;
    const pos = GameScene.CREASE_ANCHOR.add(this.playerCreaseOffset);
    this.pitchBatterRoot.position.copyFrom(pos);
    this.pitchBatterRoot.setAbsolutePosition(pos);
    this.pitchBatterRoot.setEnabled(true);
    const childMeshes = this.pitchBatterRoot.getChildMeshes();
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
    _type: string,
    _overTheWicket: boolean = true
  ): BABYLON.Vector3[] {
    const points: BABYLON.Vector3[] = [];
    const steps = 60;
    
    // In updateBallFlight, we use (0.0, 1.8, 16.5) to bounce to (targetX, 0.85, -18.5)
    // Wait, generateTrajectoryPoints is used by animateDelivery for the player bowling.
    // The prompt says "In src/scene.ts / src/game.ts (updateBallFlight / updateBowlerDelivery), implement a two-phase parabolic flight path synced with the landing bounce coordinates... update the visual path trace mesh generation logic (prediction lines) to match this exact two-phase parabolic bounce math so the physical ball travels exactly along the rendered path."
    // Let's implement it for both player and bot deliveries to be safe.
    
    // For animateDelivery (Player bowling):
    // Release is at (-0.6 or 0.6, 1.8, -10.5). Crease is at 10.
    // To keep it unified and match the exact prompt coordinates for Phase 1 & 2:
    // Start release point: Bowler hand (0.0, 1.8, 16.5).
    // Bounce contact: landing marker coordinate (targetX, 0.06, targetZ).
    // End destination: Crease coordinate (targetX + seamDrift, 0.85, -18.5).
    
    // The prompt explicitly specifies:
    // Start release point: (0.0, 1.8, 16.5)
    // End destination: (targetX, 0.85, -18.5)
    
    const targetX = aimTarget.x;
    // We get targetZ from the same marker logic. For bot, it's bounceMarker Z.
    // We will just use the bounce marker Z or compute it.
    const bounceZ = this.bounceMarker ? this.bounceMarker.position.z : -10 + aimTarget.z;
    
    const startX = globalAutoAssistConfig.bowlerArm === 'Left' ? -0.6 : 0.6;
    const release = { x: startX, y: 1.9, z: 16.5 };
    const bounce = { x: targetX, y: 0.06, z: bounceZ };
    const seamDrift = 0;
    const end = { x: targetX + seamDrift, y: 0.85, z: -18.5 };
    
    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      const pos = getParabolicFlightPosition(progress, release, bounce, end);
      points.push(new BABYLON.Vector3(pos.x, pos.y, pos.z));
    }

    return points;
  }

  public updateBounceMarker(aimTarget: { x: number; z: number }): void {
    if (this.bounceMarker) {
      this.bounceMarker.setEnabled(true);
      // Let's keep the existing marker Z mapping logic if the user didn't change it, 
      // but wait, if the pitch is from 16.5 to -18.5, then maybe aimTarget.z should be mapped differently?
      // "synced with the landing bounce coordinates" - so we use whatever the marker is set to.
      this.bounceMarker.position.set(aimTarget.x, 0.04, -10 + aimTarget.z);
    }
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
    releaseSpeed: number, // 0.0 to 1.0 (faster/slower)
    onArrived: () => void,
    onResolved: () => void,
    overTheWicket: boolean = true,
    onCreaseCrossed?: () => void,
    isSlowMotion: boolean = false,
    assistMultiplier: number = 0
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
    this.bounceMarker?.setEnabled(true);
    this.bounceMarker!.position.set(aimTarget.x, 0.04, -10 + aimTarget.z);

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
    
    this.timingRing?.setEnabled(true);
    if (this.timingRing && this.pitchBatterRoot) {
      this.timingRing.position.set(this.pitchBatterRoot.position.x, 0.1, 9.4);
      this.timingRing.scaling.set(3.0, 3.0, 3.0);
    }

    this.ballTrajectoryPoints = this.generateTrajectoryPoints(aimTarget, type, overTheWicket);
    
    if (this.predictionPath) {
      this.predictionPath.dispose();
      this.predictionPath = null;
    }
    if (!this.isBotBatting && assistMultiplier >= 0.7) {
      const visiblePoints = this.ballTrajectoryPoints.filter(p => p.z <= 8.2);
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
    if (this.bowlerMesh) {
      this.bowlerMesh.position.x = globalAutoAssistConfig.bowlerArm === 'Left' ? -0.6 : 0.6;
    }

    // Animate bowler release arm rotation (for player bowling context if needed)
    if (this.bowlerMesh) {
      BABYLON.Animation.CreateAndStartAnimation(
        'bowlerArm',
        this.bowlerMesh,
        'position.z',
        30,
        15,
        24.0,
        16.5,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
    }

    // Flight loop runner
    let speedScale = 1.0 + releaseSpeed * 0.5; // modifier
    if (isSlowMotion) {
      speedScale *= 0.35; // Reduce by 65% for bullet-time
    }

    const animateFrame = () => {
      if (!this.isAnimatingBall) return;
      if (globalAutoAssistConfig.isDeliveryActive === false) {
        this.isAnimatingBall = false;
        return;
      }

      let currentSpeedScale = speedScale;
      let fov = 75;

      if (this.ballMesh && this.ballMesh.position.z >= 6.9) {
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
          const progress = Math.min(1, Math.max(0, (this.ballMesh.position.z - 6.9) / (10 - 6.9)));
          fov = BABYLON.Scalar.Lerp(75, 50, progress);
          (this.scene.activeCamera as BABYLON.TargetCamera).fov = fov * (Math.PI / 180);
        }
      }

      this.ballAnimationTime += 1.0 * currentSpeedScale;
      const index = Math.floor(this.ballAnimationTime);

      if (this.timingRing && this.ballMesh) {
        const startZ = -11.5;
        const creaseZ = 9.4;
        const currentZ = this.ballMesh.position.z;
        const progress = Math.max(0, Math.min(1, (currentZ - startZ) / (creaseZ - startZ)));
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
        this.setCameraMode('follow_shot');
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
      
      // Check if ball crossed the crease (z = 8.2 approx)
      if (!this.creaseCrossedFired && this.ballMesh && this.ballMesh.position.z >= 8.2) {
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
    
    // Clear old trail line
    if (this.ballTrail) {
      this.ballTrail.dispose();
    }
    
    const index = Math.floor(this.ballAnimationTime);
    const trailPoints = this.ballTrajectoryPoints.slice(Math.max(0, index - 8), index + 1);
    
    if (trailPoints.length > 1) {
      this.ballTrail = BABYLON.MeshBuilder.CreateLines('ballTrail', {
        points: trailPoints,
        updatable: true
      }, this.scene);
      this.ballTrail.color = new BABYLON.Color3(0.9, 0.9, 0.4);
    }
  }

  public animateBatterSwing(_directionAngle: number, successCallback: () => void): void {
    if (this.pitchBatMesh && this.pitchBatterRoot) {
      // Temporarily rotate batter and bat to swing (9 frames at 60fps = 0.15s)
      const swingAnim = BABYLON.Animation.CreateAndStartAnimation(
        'batterSwing',
        this.pitchBatMesh,
        'rotation.y',
        60,
        9,
        0,
        Math.PI * 0.9,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
      
      swingAnim?.onAnimationEndObservable.add(() => {
        // Return bat
        this.pitchBatMesh!.rotation.y = 0;
        this.setCameraMode('follow_shot');
        successCallback();
      });
    } else {
      this.setCameraMode('follow_shot');
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
    if (!this.bowlerMesh) return;
    this.bowlerMesh.scaling = new BABYLON.Vector3(1.0, 1.0, 1.0);
    this.bowlerMesh.rotation = new BABYLON.Vector3(0, Math.PI, 0);
    
    // Ensure no ball meshes or other unintended geometries are parented
    const children = this.bowlerMesh.getChildren();
    for (const child of children) {
      if (child.name === 'cricketBall' || child.name === 'ballTrail') {
        child.parent = null;
      }
    }
  }

  public updateBowlerRunUp(): void {
    if (!this.bowlerMesh || !globalAutoAssistConfig.runUpStartTime) return;
    
    this.resetBowlerMesh();
    
    const elapsed = performance.now() - globalAutoAssistConfig.runUpStartTime;
    const duration = 1200;
    const progress = Math.min(1.0, elapsed / duration);
    
    const z = BABYLON.Scalar.Lerp(24.0, 16.5, progress);
    const bounce = Math.sin(progress * Math.PI * 8) * 0.15;
    
    this.bowlerMesh.position.z = z;
    this.bowlerMesh.position.y = bounce;
    this.bowlerMesh.rotation.x = Math.sin(progress * Math.PI * 16) * 0.2;
    this.bowlerMesh.position.x = globalAutoAssistConfig.bowlerArm === 'Left' ? -0.6 : 0.6;
  }

  public updateBallFlight(): void {
    const ball = this.ballMesh as any;
    if (!ball) return;
    
    // Do not dispose predictionPath if we want to show it. But we should render it if we need to.
    // If we only render predictionPath for player, then for bot we just move the ball.

    if (globalAutoAssistConfig.deliveryStartTime) {
      const elapsed = performance.now() - globalAutoAssistConfig.deliveryStartTime;
      const duration = 1400; // 1.4 seconds
      let progress = elapsed / duration;
      
      if (progress >= 1.0) {
        progress = 1.0;
        globalAutoAssistConfig.isDeliveryActive = false;
        if (this.onBallArrivedCallback) {
          this.onBallArrivedCallback();
        }
      }
      
      const targetX = globalAutoAssistConfig.currentDelivery ? globalAutoAssistConfig.currentDelivery.aimTarget.x : 0;
      const targetZ = this.bounceMarker && this.bounceMarker.isEnabled() 
        ? this.bounceMarker.position.z 
        : (globalAutoAssistConfig.currentDelivery ? -10 + globalAutoAssistConfig.currentDelivery.aimTarget.z : 0);
        
      const startX = globalAutoAssistConfig.bowlerArm === 'Left' ? -0.6 : 0.6;
      const release = { x: startX, y: 1.9, z: 16.5 };
      const bounce = { x: targetX, y: 0.06, z: targetZ };
      const seamDrift = 0;
      const end = { x: targetX + seamDrift, y: 0.85, z: -18.5 };
      
      const pos = getParabolicFlightPosition(progress, release, bounce, end);
      ball.position.set(pos.x, pos.y, pos.z);
    }
  }

  private updateBallPhysics(): void {
    try {
      if (!this.currentBallPos || !this.currentBallVelocity || !this.ballUnitDir || !this.ballSideDir || !this.ballMesh) return;

      // Air drag applied every frame
      this.currentBallVelocity.x *= 0.985;
      this.currentBallVelocity.y *= 0.985;
      this.currentBallVelocity.z *= 0.985;

      const ballRadius = 0.075;
      if (this.currentBallPos.y < ballRadius) {
        this.currentBallPos.y = ballRadius;
        globalAutoAssistConfig.hasBounced = true;
        // Turf rolling friction deceleration
        this.currentBallVelocity.x *= 0.92;
        this.currentBallVelocity.z *= 0.92;
        // Turf bounce rebounds (0.55 coefficient)
        this.currentBallVelocity.y = Math.abs(this.currentBallVelocity.y) * 0.55;
      }

      const currentSpeed = Math.sqrt(this.currentBallVelocity.x ** 2 + this.currentBallVelocity.z ** 2);
      const distanceToOrigin = Math.sqrt(this.currentBallPos.x ** 2 + this.currentBallPos.z ** 2);
      const isAtBoundary = distanceToOrigin >= 65;

      if ((currentSpeed < 0.3 && this.currentBallPos.y <= 0.2) || isAtBoundary) {
        this.endDeliveryCycle();
        return;
      }

      const dt = this.engine.getDeltaTime() / 1000;
      // Apply gravity
      if (this.currentBallPos.y > ballRadius) {
          this.currentBallVelocity.y -= 9.81 * dt;
      }
      
      this.currentBallPos.addInPlace(this.currentBallVelocity.scale(dt));
      this.ballPathPoints.push(this.currentBallPos.clone());

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
      const trailPoints = this.ballPathPoints.slice(Math.max(0, this.ballPathPoints.length - 10), this.ballPathPoints.length);
      if (trailPoints.length > 1) {
        if (this.ballTrail) this.ballTrail.dispose();
        this.ballTrail = BABYLON.MeshBuilder.CreateLines('ballTrail', {
          points: trailPoints,
          updatable: true
        }, this.scene);
        this.ballTrail.color = new BABYLON.Color3(1, 0.85, 0.2);
      }
    } catch (e) {
      console.error("[BALL TRACKING CRASH GUARD]", e);
    }
  }


  public animateHitPath(distance: number, direction: number, V_out?: { x: number, y: number, z: number }): void {
    this.isAnimatingBall = false;
    this.ballMesh?.setEnabled(true);
    
    // Transition active camera to follow_shot trajectory view immediately upon bat contact
    this.setCameraMode('follow_shot');
    
    const angle = (direction * Math.PI) / 4 - Math.PI / 2;
    const startPoint = new BABYLON.Vector3(this.pitchBatterRoot?.position.x || 0, 0.4, 9.4);
    
    let currentVelocity = V_out 
      ? new BABYLON.Vector3(V_out.x, V_out.y, V_out.z) 
      : new BABYLON.Vector3(Math.cos(angle) * (distance / 2), Math.max(10, distance * 0.3), Math.sin(angle) * (distance / 2));
      
    if (this.batterHand === 'RHB' && !V_out) {
      currentVelocity.x = -currentVelocity.x;
    }

    this.ballPathPoints = [startPoint.clone()];
    this.currentBallPos = startPoint.clone();
    this.currentBallVelocity = currentVelocity;

    // Flight direction for camera
    const unitDir = currentVelocity.clone().normalize();
    unitDir.y = 0;
    this.ballSideDir = new BABYLON.Vector3(-unitDir.z, 0, unitDir.x);
    this.ballUnitDir = unitDir;
    
    globalAutoAssistConfig.isBallInPlay = true;
  }

  public animateMissWicket(isWicket: boolean): void {
    this.isAnimatingBall = false;
    this.ballMesh?.setEnabled(false);
    
    if (isWicket && this.pitchBatterRoot) {
      // Trigger a dramatic slump animation or knock over stumps
      BABYLON.Animation.CreateAndStartAnimation(
        'batterDrop',
        this.pitchBatterRoot,
        'rotation.x',
        30,
        15,
        0,
        Math.PI / 4,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
    }
    
    setTimeout(() => {
      if (this.pitchBatterRoot) this.pitchBatterRoot.rotation.x = 0;
      if (this.onBallResolvedCallback) this.onBallResolvedCallback();
    }, 1500);
  }
}
