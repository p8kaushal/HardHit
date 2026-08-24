const fs = require('fs');
let sim = fs.readFileSync('src/simulate.ts', 'utf8');
sim = sim.replace(/let limit = 0\.68;\s*if \(bowlTier === 'Medium'\) limit = 0\.45;\s*else if \(bowlTier === 'Hard'\) limit = 0\.22;\s*let limit = 0\.65;/g, "let limit = 0.65;");
fs.writeFileSync('src/simulate.ts', sim);

let form = fs.readFileSync('src/formula.ts', 'utf8');
form = form.replace(/batterHand: 'RHB' \| 'LHB' = 'RHB'/g, "_batterHand: 'RHB' | 'LHB' = 'RHB'");
fs.writeFileSync('src/formula.ts', form);
