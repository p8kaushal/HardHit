const fs = require('fs');
let code = fs.readFileSync('src/game.ts', 'utf8');

const oldResolveShot = `export function resolveShot(delta_t: number): { contact: boolean } {
  // Bounding Box Bypass & Contact Guarantee
  let contact = false;
  if (delta_t <= 0.30) {
    contact = true;
  }
  return { contact };
}`;

const newResolveShot = `export function resolveShot(delta_t: number, botTier: string, shotType: string, deliveryLength: string): { contact: boolean, Q: number, tier: string } {
  const delta_t_window = calculateEffectiveWindow(botTier, shotType, deliveryLength);
  const Q = calculateContactQuality(delta_t, delta_t_window);
  const tier = getContactQualityTier(Q);
  
  let contact = false;
  if (Q >= 0.40) {
    contact = true;
  }
  return { contact, Q, tier };
}`;

code = code.replace(oldResolveShot, newResolveShot);
fs.writeFileSync('src/game.ts', code);
