const fs = require('fs');

let bot = fs.readFileSync('src/bot.ts', 'utf8');
bot = bot.replace(
  /if \(Math\.random\(\) < legalChance\) \{[\s\S]*?targetX = 0\.5; \/\/ > 0\.15 is wide for RHB\n  \}/,
  `if (Math.random() < legalChance) {
    // Force legal delivery (absolute channel)
    targetX = clamp(targetX, -0.88, 0.88);
  } else {
    // Force illegal delivery
    targetX = Math.random() < 0.5 ? -0.92 : 0.92;
  }`
);
fs.writeFileSync('src/bot.ts', bot);

console.log("Patched bot.ts!");
