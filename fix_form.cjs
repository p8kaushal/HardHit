const fs = require('fs');
let form = fs.readFileSync('src/formula.ts', 'utf8');
form = form.replace(/_batterHand: 'RHB' \| 'LHB' = 'RHB'/g, "batterHand: 'RHB' | 'LHB' = 'RHB'");
form = form.replace(/export function checkExtraBall\(delivery: DeliveryChoice, batterHand: 'RHB' \| 'LHB' = 'RHB'\)/, "export function checkExtraBall(delivery: DeliveryChoice, _batterHand: 'RHB' | 'LHB' = 'RHB')");
fs.writeFileSync('src/formula.ts', form);
