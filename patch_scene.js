const fs = require('fs');
let file = fs.readFileSync('src/scene.ts', 'utf8');

// 1. Correct Bowler Model Placement
file = file.replace('bowlerRoot.position.set(0.0, 0.0, 12.0);', 'bowlerRoot.position.set(0.6, 0.0, 11.5);');

// 2. Set camera behind bowler looking slightly down
file = file.replace('this.primaryCamera.position = new BABYLON.Vector3(0.0, 2.5, 14.0);', 'this.primaryCamera.position = new BABYLON.Vector3(0.0, 2.6, 13.5);');
file = file.replace('this.primaryCamera.setTarget(new BABYLON.Vector3(0.0, 1.0, -8.8));', 'this.primaryCamera.setTarget(new BABYLON.Vector3(0.0, 0.5, -8.8));');

// 3. Target Marker Realignment (0.04 to 0.02)
file = file.replace(/this\.bounceMarker!\.position\.set\(aimTarget\.x, 0\.04, aimTarget\.z\);/g, 'this.bounceMarker!.position.set(aimTarget.x, 0.02, aimTarget.z);');
file = file.replace(/this\.bounceMarker\.position\.set\(aimTarget\.x, 0\.04, aimTarget\.z\);/g, 'this.bounceMarker.position.set(aimTarget.x, 0.02, aimTarget.z);');
// Fix any remaining -10 + aimTarget.z for bounceMarker
file = file.replace(/this\.bounceMarker\.position\.set\(aimTarget\.x, 0\.04, -10 \+ aimTarget\.z\);/g, 'this.bounceMarker.position.set(aimTarget.x, 0.02, aimTarget.z);');
file = file.replace(/this\.bounceMarker!\.position\.set\(aimTarget\.x, 0\.04, -10 \+ aimTarget\.z\);/g, 'this.bounceMarker!.position.set(aimTarget.x, 0.02, aimTarget.z);');

fs.writeFileSync('src/scene.ts', file);
