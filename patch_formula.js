const fs = require('fs');
let file = fs.readFileSync('src/formula.ts', 'utf8');

file = file.replace(/let target = 0;\n  if \(line === 'off'\) target = -0\.45;\n  if \(line === 'leg'\) target = 0\.45;\n  return batterHand === 'LHB' \? -target : target;/g, 
`let target = 0;
  if (line === 'off') target = -0.45;
  if (line === 'leg') target = 0.45;
  return target;`);

if (!file.includes('getAimZFromLength')) {
  file += `\nexport function getAimZFromLength(length: import('./types').LengthType): number {
  switch (length) {
    case 'yorker': return -8.2;
    case 'full': return -6.5;
    case 'good': return -4.5;
    case 'short': return -2.5;
    case 'bouncer': return -0.5;
    default: return -4.5;
  }
}\n`;
}
fs.writeFileSync('src/formula.ts', file);
