const fs = require('fs');
let code = fs.readFileSync('src/scene.ts', 'utf8');

// Replace class properties
code = code.replace(/public hudAvatarRoot:.*?\n/, '');
code = code.replace(/public hudAvatarTorso:.*?\n/, '');
code = code.replace(/private pitchBatterRoot:.*?\n/, '  public batterRoot: BABYLON.TransformNode | null = null;\n');
code = code.replace(/private pitchBatMesh:.*?\n/, '  public batMesh: BABYLON.Mesh | null = null;\n');

// Replace pitchBatterRoot with batterRoot in methods
code = code.replace(/this\.pitchBatterRoot/g, 'this.batterRoot');
code = code.replace(/this\.pitchBatMesh/g, 'this.batMesh');

// In buildCharacters, replace the HUD avatar and pitch batter with a unified batterRoot
let buildCharsMatch = code.match(/private buildCharacters\(\): void \{([\s\S]*?)\n  public setBatterHandedness/);

if (buildCharsMatch) {
  let oldBuildChars = buildCharsMatch[1];
  
  // We'll write a new version
  let newBuildChars = `
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
    // Unified Batter (Physical presence at crease)
    // --------------------------------------------------------
    const batterRoot = new BABYLON.TransformNode("batterRoot", this.scene);
    batterRoot.position.set(0.4, 0.0, -17.8);
    batterRoot.parent = null;

    const batterMat = new BABYLON.StandardMaterial('batterMat', this.scene);
    batterMat.diffuseColor = new BABYLON.Color3(0.8, 0.9, 1.0); // Clean white/blue standard cricket jersey
    batterMat.alpha = 1.0;

    const bTorso = BABYLON.MeshBuilder.CreateCylinder('batterTorso', { height: 1.2, diameter: 0.4 }, this.scene);
    bTorso.parent = batterRoot;
    bTorso.position = new BABYLON.Vector3(0, 1.2, 0);
    bTorso.material = batterMat;

    const bHead = BABYLON.MeshBuilder.CreateSphere('batterHead', { diameter: 0.35 }, this.scene);
    bHead.parent = batterRoot;
    bHead.position = new BABYLON.Vector3(0, 1.9, 0);
    bHead.material = batterMat;
    
    const bArms = BABYLON.MeshBuilder.CreateCylinder('batterArms', { height: 0.6, diameter: 0.15 }, this.scene);
    bArms.parent = batterRoot;
    bArms.position = new BABYLON.Vector3(0, 0.8, 0); // zero x/z
    bArms.material = batterMat;

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
    batterRoot.rotation = new BABYLON.Vector3(0, 0, 0);

    this.batterRoot = batterRoot;
    // We do NOT set position here again to keep it ONCE as instructed, 
    // but the prompt says: Set its position ONCE at initialization: batterRoot.position.set(0.4, 0.0, -17.8);
    // So we don't call updateBatterPosition() inside buildCharacters? Wait, we can keep updateBatterPosition but let's see.
`;
  
  code = code.replace(oldBuildChars, newBuildChars);
}

fs.writeFileSync('src/scene.ts', code);
