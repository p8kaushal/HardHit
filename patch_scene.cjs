const fs = require('fs');

let scene = fs.readFileSync('src/scene.ts', 'utf8');

// Replace bounceX and end.x calculations
scene = scene.replace(
  /const bounceX = aimTarget\.x;\n    const bounce = new BABYLON\.Vector3\(bounceX, 0\.075, bounceZ\);[\s\S]*?const end = new BABYLON\.Vector3\(aimTarget\.x \* 1\.1, arrivalY, endZ\);/,
  `// aimTarget.x is now X_projected_crease at Z = 8.2m
    const creaseZ = 8.2;
    const zRatioBounce = (bounceZ - start.z) / (creaseZ - start.z);
    const bounceX = start.x + (aimTarget.x - start.x) * zRatioBounce;
    const bounce = new BABYLON.Vector3(bounceX, 0.075, bounceZ);
    
    // Arrival target (stumps at Z = 10)
    const endZ = 10;
    // Bouncer/Short bounces higher
    let arrivalY = 0.55;
    if (type === 'bouncer') arrivalY = 1.35;
    else if (type === 'short') arrivalY = 0.95;
    else if (type === 'yorker') arrivalY = 0.15;
    
    const zRatioEnd = (endZ - start.z) / (creaseZ - start.z);
    const endX = start.x + (aimTarget.x - start.x) * zRatioEnd;
    const end = new BABYLON.Vector3(endX, arrivalY, endZ);`
);

fs.writeFileSync('src/scene.ts', scene);
console.log("Patched scene.ts!");
