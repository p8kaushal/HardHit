const fs = require('fs');

// 1. Update formula.ts
let formula = fs.readFileSync('src/formula.ts', 'utf8');
formula = formula.replace(
  /const x = delivery.aimTarget.x;[\s\S]*?if \(x < -0.15\) return \{ isExtra: true, type: 'wide' \};\n  \}/,
  `const x = delivery.aimTarget.x;
  // Measure strictly relative to absolute pitch center line (X=0.0m) bypassing stance offsets
  if (Math.abs(x) > 0.89) {
    return { isExtra: true, type: 'wide' };
  }`
);
fs.writeFileSync('src/formula.ts', formula);

// 2. Update game.ts
let game = fs.readFileSync('src/game.ts', 'utf8');
game = game.replace(
  /const X_aim_base = delivery.aimTarget.x;[\s\S]*?delivery.aimTarget.x = X_final;/g,
  `let limit = 0.65; // Easy/Rookie
      if (innings.bowler.id === 'bot_medium') limit = 0.42;
      else if (innings.bowler.id === 'bot_hard') limit = 0.20;
      
      let X_target_crease = delivery.aimTarget.x;
      X_target_crease = Math.max(-limit, Math.min(limit, X_target_crease));
      
      const X_release = delivery.overTheWicket !== false ? -0.6 : 0.6;
      const t_flight = 0.6;
      const Ax_swing = 0;
      const X_spin = 0;
      
      const Vx = calculateDeliveryVelocity(X_release, X_target_crease, t_flight, Ax_swing, X_spin);
      const X_projected_crease = calculateProjectedCreaseX(X_release, Vx, t_flight, Ax_swing, X_spin);
      
      delivery.aimTarget.x = X_projected_crease;`
);
game = game.replace(/checkExtraBall, SIX_THRESHOLD } from '.\/formula';/, "checkExtraBall, SIX_THRESHOLD, calculateDeliveryVelocity, calculateProjectedCreaseX } from './formula';");
fs.writeFileSync('src/game.ts', game);

// 3. Update simulate.ts
let sim = fs.readFileSync('src/simulate.ts', 'utf8');
sim = sim.replace(
  /const X_aim_base = delivery.aimTarget.x;[\s\S]*?delivery.aimTarget.x = X_final;/g,
  `let limit = 0.65; // Easy/Rookie
            if (bowlTier === 'Medium') limit = 0.42;
            else if (bowlTier === 'Hard') limit = 0.20;
            
            let X_target_crease = delivery.aimTarget.x;
            X_target_crease = Math.max(-limit, Math.min(limit, X_target_crease));
            
            const X_release = delivery.overTheWicket !== false ? -0.6 : 0.6;
            const t_flight = 0.6;
            const Ax_swing = 0;
            const X_spin = 0;
            
            const Vx = calculateDeliveryVelocity(X_release, X_target_crease, t_flight, Ax_swing, X_spin);
            const X_projected_crease = calculateProjectedCreaseX(X_release, Vx, t_flight, Ax_swing, X_spin);
            
            delivery.aimTarget.x = X_projected_crease;`
);
sim = sim.replace(/checkExtraBall, SIX_THRESHOLD } from '.\/formula';/, "checkExtraBall, SIX_THRESHOLD, calculateDeliveryVelocity, calculateProjectedCreaseX } from './formula';");
fs.writeFileSync('src/simulate.ts', sim);

console.log("Patched everything!");
