const fs = require('fs');
let code = fs.readFileSync('src/game.ts', 'utf8');

// Replace handleInningsCompletion's UI logic
const search = `      // Restore bowling panel controls immediately
      const controlBowling = document.getElementById('control-bowling') || document.getElementById('setup-delivery-panel');
      if (controlBowling) {
        controlBowling.classList.remove('hidden', 'panel-hidden');
      }`;

const replacement = `      // Ensure all UI panels from the batting phase are cleanly hidden/unmounted.
      const controlBatting = document.getElementById('control-batting');
      if (controlBatting) {
        controlBatting.classList.add('hidden', 'panel-hidden');
      }
      // Restore bowling panel controls immediately
      const controlBowling = document.getElementById('control-bowling') || document.getElementById('setup-delivery-panel');
      if (controlBowling) {
        controlBowling.classList.remove('hidden', 'panel-hidden');
      }`;

code = code.replace(search, replacement);

fs.writeFileSync('src/game.ts', code);
