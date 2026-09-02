const fs = require('fs');
let code = fs.readFileSync('src/scene.ts', 'utf8');

const camSearch = `    } else if (mode === 'bowler_eye') {
      if (this.isBotBatting) {
        this.primaryCamera.position = new BABYLON.Vector3(0, 2.2, 22.5);
        this.primaryCamera.setTarget(new BABYLON.Vector3(0, 1.2, -18.0));
      }
    }`;

const camReplace = `    } else if (mode === 'bowler_eye') {
      this.primaryCamera.position = new BABYLON.Vector3(0, 2.2, 23.5);
      this.primaryCamera.setTarget(new BABYLON.Vector3(0, 1.2, -18.0));
    }`;

code = code.replace(camSearch, camReplace);

const resetSearch = `  public resetCameraToPlayerView(isPlayerBatting: boolean): void {
    if (this.batterRoot) this.batterRoot.parent = null;
    const targetMode: CameraMode = isPlayerBatting ? 'batter_eye' : 'bowler_eye';
    this.setCameraMode(targetMode);
  }`;

const resetReplace = `  public resetCameraToPlayerView(isPlayerBatting: boolean): void {
    if (this.batterRoot) {
      this.batterRoot.parent = null;
      this.batterRoot.position.set(0.4, 0.0, -17.8);
    }
    const targetMode: CameraMode = isPlayerBatting ? 'batter_eye' : 'bowler_eye';
    this.setCameraMode(targetMode);
  }`;

code = code.replace(resetSearch, resetReplace);

fs.writeFileSync('src/scene.ts', code);
