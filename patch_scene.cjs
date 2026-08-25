const fs = require('fs');
let code = fs.readFileSync('src/scene.ts', 'utf-8');

// Add properties
code = code.replace(
  "private botBattingTriggerCallback: (() => void) | null = null;",
  "private botBattingTriggerCallback: (() => void) | null = null;\n  \n  private currentBallVelocity: BABYLON.Vector3 | null = null;\n  private currentBallPos: BABYLON.Vector3 | null = null;\n  private ballPathPoints: BABYLON.Vector3[] = [];\n  private ballUnitDir: BABYLON.Vector3 | null = null;\n  private ballSideDir: BABYLON.Vector3 | null = null;"
);

// Modify onBeforeRenderObservable
code = code.replace(
  "if (this.isAnimatingBall && this.isBotBatting) {",
  "if (globalAutoAssistConfig.isBallInPlay) {\n        this.updateBallPhysics();\n      }\n      if (this.isAnimatingBall && this.isBotBatting) {"
);

const hitPathOld = `  public animateHitPath(distance: number, direction: number, V_out?: { x: number, y: number, z: number }): void {
    this.isAnimatingBall = false;
    this.ballMesh?.setEnabled(true);
    
    // Transition active camera to follow_shot trajectory view immediately upon bat contact
    this.setCameraMode('follow_shot');
    
    const angle = (direction * Math.PI) / 4 - Math.PI / 2;
    const startPoint = new BABYLON.Vector3(this.batterMesh?.position.x || 0, 0.4, 9.4);
    
    let currentVelocity = V_out 
      ? new BABYLON.Vector3(V_out.x, V_out.y, V_out.z) 
      : new BABYLON.Vector3(Math.cos(angle) * (distance / 2), Math.max(10, distance * 0.3), Math.sin(angle) * (distance / 2));
      
    if (this.batterHand === 'RHB' && !V_out) {
      currentVelocity.x = -currentVelocity.x;
    }

    const points: BABYLON.Vector3[] = [startPoint.clone()];
    let currentPos = startPoint.clone();

    // Flight direction for camera
    const unitDir = currentVelocity.clone().normalize();
    unitDir.y = 0;
    const sideDir = new BABYLON.Vector3(-unitDir.z, 0, unitDir.x);

    let animIdx = 0;

    const animateHit = () => {
      if (currentPos.y < 0.15) {
        currentPos.y = 0.15;
        // Ground drag application for rolling
        const groundDrag = 0.12; 
        currentVelocity.x *= Math.max(0, 1 - groundDrag);
        currentVelocity.z *= Math.max(0, 1 - groundDrag);
        // Simple bounce damping
        currentVelocity.y = Math.abs(currentVelocity.y) * 0.3;
      }

      const currentSpeed = Math.sqrt(currentVelocity.x ** 2 + currentVelocity.z ** 2);
      const isAtBoundary = Math.sqrt(currentPos.x ** 2 + currentPos.z ** 2) >= 70;

      if ((currentSpeed < 0.5 && currentPos.y <= 0.2) || isAtBoundary) {
        this.ballMesh?.setEnabled(false);
        if (this.ballTrail) this.ballTrail.dispose();
        if (this.onBallResolvedCallback) this.onBallResolvedCallback();
        return;
      }

      const dt = 1 / 60; // 60fps simulation step
      // Apply gravity
      currentVelocity.y -= 9.81 * dt;
      currentPos.addInPlace(currentVelocity.scale(dt));
      points.push(currentPos.clone());

      this.ballMesh?.position.copyFrom(currentPos);

      // Dynamically track the ball mesh and its high trajectory arc
      if (this.activeCameraMode === 'follow_shot' && this.ballMesh) {
        const camDistBehind = 7.0;
        const camSideOffset = 3.2;
        const camHeight = Math.max(3.5, currentPos.y * 0.55 + 2.5);

        const camPos = new BABYLON.Vector3(
          currentPos.x - unitDir.x * camDistBehind + sideDir.x * camSideOffset,
          camHeight,
          currentPos.z - unitDir.z * camDistBehind + sideDir.z * camSideOffset
        );

        this.cameras.follow_shot.position.copyFrom(camPos);
        this.cameras.follow_shot.setTarget(this.ballMesh.position);
      }

      // Draw custom line trail for hit path
      const trailPoints = points.slice(Math.max(0, points.length - 10), points.length);
      if (trailPoints.length > 1) {
        if (this.ballTrail) this.ballTrail.dispose();
        this.ballTrail = BABYLON.MeshBuilder.CreateLines('ballTrail', {
          points: trailPoints,
          updatable: true
        }, this.scene);
        this.ballTrail.color = new BABYLON.Color3(1, 0.85, 0.2);
      }

      animIdx++;
      requestAnimationFrame(animateHit);
    };

    animateHit();
  }`;

const hitPathNew = `  private updateBallPhysics(): void {
    if (!this.currentBallPos || !this.currentBallVelocity || !this.ballUnitDir || !this.ballSideDir || !this.ballMesh) return;

    const ballRadius = 0.075;
    if (this.currentBallPos.y < ballRadius) {
      this.currentBallPos.y = ballRadius;
      // Ground drag application for rolling (0.12 coefficient)
      const groundDrag = 0.12; 
      this.currentBallVelocity.x *= Math.max(0, 1 - groundDrag);
      this.currentBallVelocity.z *= Math.max(0, 1 - groundDrag);
      // Turf bounce rebounds (0.55 coefficient)
      this.currentBallVelocity.y = Math.abs(this.currentBallVelocity.y) * 0.55;
    }

    const currentSpeed = Math.sqrt(this.currentBallVelocity.x ** 2 + this.currentBallVelocity.z ** 2);
    const isAtBoundary = Math.sqrt(this.currentBallPos.x ** 2 + this.currentBallPos.z ** 2) >= 70;

    if ((currentSpeed < 0.5 && this.currentBallPos.y <= 0.2) || isAtBoundary) {
      globalAutoAssistConfig.isBallInPlay = false;
      this.ballMesh?.setEnabled(false);
      if (this.ballTrail) this.ballTrail.dispose();
      
      // Reset camera target to pitch center
      if (this.activeCameraMode === 'follow_shot') {
        this.cameras.follow_shot.setTarget(new BABYLON.Vector3(0, 0, 0));
      }
      
      if (this.onBallResolvedCallback) this.onBallResolvedCallback();
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
    if (this.activeCameraMode === 'follow_shot') {
      const camDistBehind = 7.0;
      const camSideOffset = 3.2;
      const camHeight = Math.max(3.5, this.currentBallPos.y * 0.55 + 2.5);

      const camPos = new BABYLON.Vector3(
        this.currentBallPos.x - this.ballUnitDir.x * camDistBehind + this.ballSideDir.x * camSideOffset,
        camHeight,
        this.currentBallPos.z - this.ballUnitDir.z * camDistBehind + this.ballSideDir.z * camSideOffset
      );

      // Smooth interpolation towards ball position
      this.cameras.follow_shot.position = BABYLON.Vector3.Lerp(this.cameras.follow_shot.position, camPos, 0.1);
      
      const currentTarget = this.cameras.follow_shot.getTarget();
      const newTarget = BABYLON.Vector3.Lerp(currentTarget, this.ballMesh.position, 0.1);
      this.cameras.follow_shot.setTarget(newTarget);
      
      // Retain clear elevated FOV
      this.cameras.follow_shot.fov = 75 * (Math.PI / 180);
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
  }

  public animateHitPath(distance: number, direction: number, V_out?: { x: number, y: number, z: number }): void {
    this.isAnimatingBall = false;
    this.ballMesh?.setEnabled(true);
    
    // Transition active camera to follow_shot trajectory view immediately upon bat contact
    this.setCameraMode('follow_shot');
    
    const angle = (direction * Math.PI) / 4 - Math.PI / 2;
    const startPoint = new BABYLON.Vector3(this.batterMesh?.position.x || 0, 0.4, 9.4);
    
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
  }`;

code = code.replace(hitPathOld, hitPathNew);
fs.writeFileSync('src/scene.ts', code);
