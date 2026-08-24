import { getOrCreatePlayer, MatchController } from './game';
import { UIManager, renderProfile, renderLeaderboard } from './ui';
import { verifyFormulas } from './formula';
import { runBotSimulation } from './simulate';

let controller: MatchController | null = null;
let ui: UIManager | null = null;

function loadLobbyProfile(): void {
  const player = getOrCreatePlayer();
  renderProfile(player);
  renderLeaderboard();
}

function showScreen(screenId: string): void {
  const screens = document.querySelectorAll('.screen');
  screens.forEach(s => s.classList.remove('active'));
  document.getElementById(screenId)!.classList.add('active');
}

function initLobby(): void {
  loadLobbyProfile();
  
  const btnStartToss = document.getElementById('btn-start-toss')!;
  btnStartToss.onclick = () => {
    const diffSelect = document.getElementById('select-difficulty') as HTMLSelectElement;
    const difficulty = diffSelect.value as 'Easy' | 'Medium' | 'Hard';
    
    // Initialize controllers
    controller = new MatchController(difficulty);

    showScreen('screen-toss');
    resetTossUI();
  };

  document.getElementById('btn-return-lobby')!.onclick = () => {
    const modal = document.getElementById('match-summary-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('active');
    }
    showScreen('screen-lobby');
    loadLobbyProfile();
  };
}

function resetTossUI(): void {
  const coin = document.getElementById('coin')!;
  coin.innerText = '?';
  coin.className = 'coin';
  
  document.getElementById('toss-result-message')!.classList.add('hidden');
  document.getElementById('toss-choice-buttons')!.classList.add('hidden');
  document.getElementById('btn-start-match')!.classList.add('hidden');
  
  const headsBtn = document.getElementById('btn-toss-heads')! as HTMLButtonElement;
  const tailsBtn = document.getElementById('btn-toss-tails')! as HTMLButtonElement;
  headsBtn.disabled = false;
  tailsBtn.disabled = false;
}

function runToss(playerChoice: 'heads' | 'tails'): void {
  const headsBtn = document.getElementById('btn-toss-heads')! as HTMLButtonElement;
  const tailsBtn = document.getElementById('btn-toss-tails')! as HTMLButtonElement;
  headsBtn.disabled = true;
  tailsBtn.disabled = true;

  const coin = document.getElementById('coin')!;
  coin.classList.add('flipping');

  setTimeout(() => {
    coin.classList.remove('flipping');
    const coinFlipResult = Math.random() < 0.5 ? 'heads' : 'tails';
    coin.innerText = coinFlipResult === 'heads' ? 'H' : 'T';

    const playerWonToss = playerChoice === coinFlipResult;
    const msgEl = document.getElementById('toss-result-message')!;
    const wonTextEl = document.getElementById('toss-won-text')!;
    msgEl.classList.remove('hidden');

    if (playerWonToss) {
      wonTextEl.innerText = 'You won the toss! Choose your preferred innings type:';
      const choiceButtons = document.getElementById('toss-choice-buttons')!;
      choiceButtons.classList.remove('hidden');
      
      document.getElementById('btn-choice-bat')!.onclick = () => {
        controller!.setTossResult(controller!.state.player.id, 'bat');
        proceedToMatchStart();
      };
      
      document.getElementById('btn-choice-bowl')!.onclick = () => {
        controller!.setTossResult(controller!.state.player.id, 'bowl');
        proceedToMatchStart();
      };
    } else {
      // Bot won toss
      const botChoice = Math.random() < 0.5 ? 'bat' : 'bowl';
      wonTextEl.innerText = `${controller!.state.bot.name} won the toss and elected to ${botChoice} first.`;
      controller!.setTossResult(controller!.state.bot.id, botChoice);
      
      const startMatchBtn = document.getElementById('btn-start-match')!;
      startMatchBtn.classList.remove('hidden');
      startMatchBtn.onclick = () => {
        proceedToMatchStart();
      };
    }
  }, 1200);
}

function proceedToMatchStart(): void {
  controller!.startMatch();
  if (!ui) {
    ui = new UIManager(controller!);
  } else {
    ui.setController(controller!);
  }
  showScreen('screen-gameplay');
  ui!.setupActiveTurn();
}

// Bind coin toss buttons
document.getElementById('btn-toss-heads')!.onclick = () => runToss('heads');
document.getElementById('btn-toss-tails')!.onclick = () => runToss('tails');

// Init application on load
window.addEventListener('DOMContentLoaded', () => {
  verifyFormulas();
  initLobby();
});

declare global {
  interface Window {
    runBotSimulation: typeof runBotSimulation;
  }
}

window.runBotSimulation = runBotSimulation;
