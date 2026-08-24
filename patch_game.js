const fs = require('fs');
let code = fs.readFileSync('src/game.ts', 'utf8');
code = code.replace(
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
      
      // Calculate Vx required to hit target crease
      const Vx = calculateDeliveryVelocity(X_release, X_target_crease, t_flight, Ax_swing, X_spin);
      
      // Calculate projected absolute X at crease
      const X_projected_crease = calculateProjectedCreaseX(X_release, Vx, t_flight, Ax_swing, X_spin);
      
      delivery.aimTarget.x = X_projected_crease;`
);

if (!code.includes('calculateDeliveryVelocity')) {
  console.log("Error: replacement failed");
} else {
  // Add imports
  code = code.replace(/checkExtraBall, SIX_THRESHOLD } from '.\/formula';/, "checkExtraBall, SIX_THRESHOLD, calculateDeliveryVelocity, calculateProjectedCreaseX } from './formula';");
  fs.writeFileSync('src/game.ts', code);
  console.log("Success");
}
