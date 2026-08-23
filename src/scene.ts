import * as BABYLON from 'babylonjs';
import { CameraMode } from './types';

export class GameScene {
  public scene: BABYLON.Scene;
  private canvas: HTMLCanvasElement;
  private engine: BABYLON.Engine;
  
  // Cameras
  private cameras!: Record<CameraMode, BABYLON.TargetCamera>;
  private activeCameraMode: CameraMode = 'stadium_wide';

  // Gameplay Meshes
  private ballMesh: BABYLON.Mesh | null = null;
  private ballTrail: BABYLON.LinesMesh | null = null;
  private bounceMarker: BABYLON.Mesh | null = null;
  
  // Characters (Procedural low-poly)
  private bowlerMesh: BABYLON.TransformNode | null = null;
  private batterMesh: BABYLON.TransformNode | null = null;
  private batMesh: BABYLON.Mesh | null = null;


  // Animation state
  private isAnimatingBall = false;
  private ballAnimationTime = 0;
  private ballTrajectoryPoints: BABYLON.Vector3[] = [];
  private onBallArrivedCallback: (() => void) | null = null;
  private onBallResolvedCallback: (() => void) | null = null;
  
  private batterHand: 'RHB' | 'LHB' = 'RHB';
  
  constructor(canvasElementId: string) {
    this.canvas = document.getElementById(canvasElementId) as unknown as HTMLCanvasElement;
    this.engine = new BABYLON.Engine(this.canvas, true);
    this.scene = new BABYLON.Scene(this.engine);
    
    this.setupLights();
    this.buildStadium();
    this.setupCameras();
    this.buildCharacters();
    this.buildBall();


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
    this.cameras = {
      stadium_wide: new BABYLON.TargetCamera('camWide', new BABYLON.Vector3(15, 12, -22), this.scene),
      bowler_eye: new BABYLON.TargetCamera('camBowler', new BABYLON.Vector3(0, 3.2, -16), this.scene),
      batter_eye: new BABYLON.TargetCamera('camBatter', new BABYLON.Vector3(0, 2.5, 14.5), this.scene),
      follow_shot: new BABYLON.TargetCamera('camFollow', new BABYLON.Vector3(8, 8, 5), this.scene)
    };

    // Set targets
    this.cameras.stadium_wide.setTarget(new BABYLON.Vector3(0, 1.5, 0));
    this.cameras.bowler_eye.setTarget(new BABYLON.Vector3(0, 1, 10)); // Looking at batter
    this.cameras.batter_eye.setTarget(new BABYLON.Vector3(0, 1.2, -10)); // Looking at bowler
    
    this.setCameraMode('stadium_wide');
  }

  public setCameraMode(mode: CameraMode): void {
    this.activeCameraMode = mode;
    this.scene.activeCamera = this.cameras[mode];
  }

  private buildCharacters(): void {
    // Bowler placeholder shape (Blue)
    const bowlerContainer = new BABYLON.TransformNode('bowlerContainer', this.scene);
    const bodyMat = new BABYLON.StandardMaterial('bowlerMat', this.scene);
    bodyMat.diffuseColor = new BABYLON.Color3(0.2, 0.4, 0.9);
    
    const torso = BABYLON.MeshBuilder.CreateCylinder('bowlerTorso', { height: 1.2, diameter: 0.4 }, this.scene);
    torso.position.y = 1.2;
    torso.parent = bowlerContainer;
    torso.material = bodyMat;

    const head = BABYLON.MeshBuilder.CreateSphere('bowlerHead', { diameter: 0.35 }, this.scene);
    head.position.y = 1.9;
    head.parent = bowlerContainer;
    head.material = bodyMat;
    
    bowlerContainer.position.set(0, 0, -11.5);
    this.bowlerMesh = bowlerContainer;

    // Batter placeholder shape (Red)
    const batterContainer = new BABYLON.TransformNode('batterContainer', this.scene);
    const batterMat = new BABYLON.StandardMaterial('batterMat', this.scene);
    batterMat.diffuseColor = new BABYLON.Color3(0.9, 0.2, 0.4);

    const bTorso = BABYLON.MeshBuilder.CreateCylinder('batterTorso', { height: 1.2, diameter: 0.4 }, this.scene);
    bTorso.position.y = 1.2;
    bTorso.parent = batterContainer;
    bTorso.material = batterMat;

    const bHead = BABYLON.MeshBuilder.CreateSphere('batterHead', { diameter: 0.35 }, this.scene);
    bHead.position.y = 1.9;
    bHead.parent = batterContainer;
    bHead.material = batterMat;

    // Bat
    const batMat = new BABYLON.StandardMaterial('batMat', this.scene);
    batMat.diffuseColor = new BABYLON.Color3(0.65, 0.5, 0.3);
    const bat = BABYLON.MeshBuilder.CreateBox('bat', { width: 0.08, height: 0.9, depth: 0.04 }, this.scene);
    bat.position.set(0.3, 0.7, 0.1);
    bat.rotation.z = -0.4;
    bat.parent = batterContainer;
    bat.material = batMat;
    this.batMesh = bat;

    // Guard stance orientation (default RHB)
    batterContainer.position.set(0.45, 0, 9.4);
    batterContainer.rotation.y = -Math.PI / 2; // Sideways stance
    this.batterMesh = batterContainer;
  }

  public setBatterHandedness(hand: 'RHB' | 'LHB'): void {
    this.batterHand = hand;
    if (!this.batterMesh) return;
    if (hand === 'RHB') {
      this.batterMesh.position.set(0.45, 0, 9.4);
      this.batterMesh.rotation.y = -Math.PI / 2;
    } else {
      this.batterMesh.position.set(-0.45, 0, 9.4);
      this.batterMesh.rotation.y = Math.PI / 2;
    }
  }

  private buildBall(): void {
    const ballMat = new BABYLON.StandardMaterial('ballMat', this.scene);
    ballMat.diffuseColor = new BABYLON.Color3(0.85, 0.1, 0.1);
    
    this.ballMesh = BABYLON.MeshBuilder.CreateSphere('cricketBall', { diameter: 0.15 }, this.scene);
    this.ballMesh.material = ballMat;
    this.ballMesh.setEnabled(false);
  }

  // --- Animation Mechanics ---

  /**
   * Precomputes the flight path parabolic arc based on delivery details.
   */
  public generateTrajectoryPoints(
    aimTarget: { x: number; z: number },
    type: string,
    overTheWicket: boolean = true
  ): BABYLON.Vector3[] {
    const points: BABYLON.Vector3[] = [];
    const steps = 60;
    
    const startX = overTheWicket ? -0.6 : 0.6;
    const start = new BABYLON.Vector3(startX, 1.8, -10.5); // Bowler release point
    const bounceZ = -10 + aimTarget.z; // Target Z from bowling crease
    const bounceX = aimTarget.x;
    const bounce = new BABYLON.Vector3(bounceX, 0.075, bounceZ);
    
    // Arrival target (stumps at Z = 10)
    const endZ = 10;
    // Bouncer/Short bounces higher
    let arrivalY = 0.55;
    if (type === 'bouncer') arrivalY = 1.35;
    else if (type === 'short') arrivalY = 0.95;
    else if (type === 'yorker') arrivalY = 0.15;
    
    const end = new BABYLON.Vector3(aimTarget.x * 1.1, arrivalY, endZ);
    
    // Pre-bounce arc
    const preBounceSteps = Math.round(steps * 0.6);
    for (let i = 0; i <= preBounceSteps; i++) {
      const t = i / preBounceSteps;
      const x = BABYLON.Scalar.Lerp(start.x, bounce.x, t);
      const z = BABYLON.Scalar.Lerp(start.z, bounce.z, t);
      // Gravity parabolic arc
      const y = BABYLON.Scalar.Lerp(start.y, bounce.y, t) + Math.sin(t * Math.PI) * 0.4;
      points.push(new BABYLON.Vector3(x, y, z));
    }

    // Post-bounce arc
    const postBounceSteps = steps - preBounceSteps;
    for (let i = 1; i <= postBounceSteps; i++) {
      const t = i / postBounceSteps;
      const x = BABYLON.Scalar.Lerp(bounce.x, end.x, t);
      const z = BABYLON.Scalar.Lerp(bounce.z, end.z, t);
      const y = BABYLON.Scalar.Lerp(bounce.y, end.y, t) + Math.sin(t * Math.PI) * 0.6;
      points.push(new BABYLON.Vector3(x, y, z));
    }

    return points;
  }

  public updateBounceMarker(aimTarget: { x: number; z: number }): void {
    if (this.bounceMarker) {
      this.bounceMarker.setEnabled(true);
      this.bounceMarker.position.set(aimTarget.x, 0.04, -10 + aimTarget.z);
    }
  }

  public hideBounceMarker(): void {
    this.bounceMarker?.setEnabled(false);
  }

  public animateDelivery(
    aimTarget: { x: number; z: number },
    type: string,
    releaseSpeed: number, // 0.0 to 1.0 (faster/slower)
    onArrived: () => void,
    onResolved: () => void,
    overTheWicket: boolean = true
  ): void {
    this.onBallArrivedCallback = onArrived;
    this.onBallResolvedCallback = onResolved;
    
    // Position bounce marker indicator on pitch
    this.bounceMarker?.setEnabled(true);
    this.bounceMarker!.position.set(aimTarget.x, 0.04, -10 + aimTarget.z);

    this.ballTrajectoryPoints = this.generateTrajectoryPoints(aimTarget, type, overTheWicket);
    this.ballAnimationTime = 0;
    this.isAnimatingBall = true;
    
    this.ballMesh?.setEnabled(true);
    this.ballMesh?.position.copyFrom(this.ballTrajectoryPoints[0]);

    // Set bowler initial X based on overTheWicket
    if (this.bowlerMesh) {
      this.bowlerMesh.position.x = overTheWicket ? -0.6 : 0.6;
    }

    // Animate bowler release arm rotation
    if (this.bowlerMesh) {
      BABYLON.Animation.CreateAndStartAnimation(
        'bowlerArm',
        this.bowlerMesh,
        'position.z',
        30,
        15,
        -11.5,
        -10.2,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
    }

    // Flight loop runner
    const speedScale = 1.0 + releaseSpeed * 0.5; // modifier
    const animateFrame = () => {
      if (!this.isAnimatingBall) return;

      this.ballAnimationTime += 1.0 * speedScale;
      const index = Math.floor(this.ballAnimationTime);

      if (index >= this.ballTrajectoryPoints.length) {
        // Ball passed/reached batter stumps
        this.isAnimatingBall = false;
        this.ballMesh?.setEnabled(false);
        this.bounceMarker?.setEnabled(false);
        if (this.onBallArrivedCallback) this.onBallArrivedCallback();
        return;
      }

      this.ballMesh?.position.copyFrom(this.ballTrajectoryPoints[index]);
      
      // Update follow camera
      if (this.activeCameraMode === 'follow_shot') {
        this.cameras.follow_shot.position.set(
          this.ballMesh!.position.x + 3,
          this.ballMesh!.position.y + 2,
          this.ballMesh!.position.z - 4
        );
        this.cameras.follow_shot.setTarget(this.ballMesh!.position);
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
    if (this.batMesh && this.batterMesh) {
      // Temporarily rotate batter and bat to swing
      const swingAnim = BABYLON.Animation.CreateAndStartAnimation(
        'batterSwing',
        this.batMesh,
        'rotation.y',
        60,
        12,
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

  /**
   * Animates a hit ball carrying towards the boundary.
   */
  public animateHitPath(distance: number, direction: number): void {
    this.isAnimatingBall = false;
    this.ballMesh?.setEnabled(true);
    
    // Calculate 3D end coordinates based on direction (0-7 clock slices)
    const angle = (direction * Math.PI) / 4 - Math.PI / 2;
    const carryDistance = Math.min(65, distance); // visual clamp to boundary
    
    let xOffset = Math.cos(angle) * carryDistance;
    if (this.batterHand === 'RHB') {
      xOffset = -xOffset; // RHB Off-side is negative X, Leg-side is positive X
    }
    
    const endPoint = new BABYLON.Vector3(
      xOffset,
      0.15,
      10 + Math.sin(angle) * carryDistance
    );

    const startPoint = new BABYLON.Vector3(this.batterMesh?.position.x || 0, 0.4, 9.4);
    const midpoint = BABYLON.Vector3.Center(startPoint, endPoint);
    midpoint.y = Math.max(3, distance * 0.15); // visual height scales with distance

    const points: BABYLON.Vector3[] = [];
    const steps = 80;
    
    // Generate parabola to boundary
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = BABYLON.Scalar.Lerp(startPoint.x, endPoint.x, t);
      const z = BABYLON.Scalar.Lerp(startPoint.z, endPoint.z, t);
      const y = BABYLON.Scalar.Lerp(startPoint.y, endPoint.y, t) + Math.sin(t * Math.PI) * midpoint.y;
      points.push(new BABYLON.Vector3(x, y, z));
    }

    // Run animation frames
    let animIdx = 0;
    this.setCameraMode('follow_shot');

    const animateHit = () => {
      if (animIdx >= points.length) {
        this.ballMesh?.setEnabled(false);
        if (this.ballTrail) this.ballTrail.dispose();
        if (this.onBallResolvedCallback) this.onBallResolvedCallback();
        return;
      }

      this.ballMesh?.position.copyFrom(points[animIdx]);
      this.cameras.follow_shot.position.set(
        this.ballMesh!.position.x + 4,
        this.ballMesh!.position.y + 3,
        this.ballMesh!.position.z - 6
      );
      this.cameras.follow_shot.setTarget(this.ballMesh!.position);

      animIdx++;
      requestAnimationFrame(animateHit);
    };

    animateHit();
  }

  public animateMissWicket(isWicket: boolean): void {
    this.isAnimatingBall = false;
    this.ballMesh?.setEnabled(false);
    
    if (isWicket && this.batterMesh) {
      // Trigger a dramatic slump animation or knock over stumps
      BABYLON.Animation.CreateAndStartAnimation(
        'batterDrop',
        this.batterMesh,
        'position.y',
        30,
        15,
        0,
        -0.4,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
      );
    }
    
    setTimeout(() => {
      if (this.batterMesh) this.batterMesh.position.y = 0;
      if (this.onBallResolvedCallback) this.onBallResolvedCallback();
    }, 1500);
  }
}
