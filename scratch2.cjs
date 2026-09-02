const fs = require('fs');
let code = fs.readFileSync('src/scene.ts', 'utf8');

code = code.replace(/\/\/ So we don't call updateBatterPosition\(\) inside buildCharacters\? Wait, we can keep updateBatterPosition but let's see\.\n/, 
`    this.updateBatterPosition();
  }
`);

fs.writeFileSync('src/scene.ts', code);
