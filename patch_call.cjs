const fs = require('fs');
let code = fs.readFileSync('src/game.ts', 'utf8');

const oldCall = `const resolution = resolveShot(globalAutoAssistConfig.delta_t);`;

const newCall = `
        let botTier = 'Medium';
        if (innings.bowler.id.includes('rookie')) botTier = 'Rookie';
        if (innings.bowler.id.includes('hard')) botTier = 'Hard';
        
        const resolution = resolveShot(globalAutoAssistConfig.delta_t, botTier, shot.type, delivery.length);
`;

code = code.replace(oldCall, newCall);
fs.writeFileSync('src/game.ts', code);
