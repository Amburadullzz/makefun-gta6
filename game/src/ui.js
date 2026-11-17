// The screens around the game: the title over the skyline, the pause panel with its
// save and new-game buttons, and the blackout card you get when the city wins.



import { formatMoney, readSave } from './state.js';

export function createUi(state, handlers) {
  const start = document.getElementById('start-screen');
  const pause = document.getElementById('pause-screen');
  const gameover = document.getElementById('gameover-screen');
  const saveLine = document.getElementById('start-save');
  const pauseStats = document.getElementById('pause-stats');
  const gameoverTitle = document.getElementById('gameover-title');
  const gameoverLine = document.getElementById('gameover-line');

  const refreshSaveLine = () => {
    const save = readSave();
    if (!save) {
      saveLine.textContent = 'No shift on record';
      return;
    }
    const when = new Date(save.savedAt || Date.now());
    saveLine.textContent = `Last shift · $${formatMoney(save.money)} · job ${Math.min(3, save.missionIndex + 1)} of 3 · ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };
  refreshSaveLine();

  const refreshPauseStats = () => {
    pauseStats.innerHTML = [
      `CASH <b>$${formatMoney(state.money)}</b>`,
      `JOBS DONE <b>${state.stats.missionsDone}</b>`,
      `TAKEDOWNS <b>${state.stats.takedowns}</b>`,
      `CARS TAKEN <b>${state.stats.carsStolen}</b>`,
      `DISTANCE <b>${Math.round(state.stats.distance)} m</b>`,
    ].join('<br>');
  };

  document.getElementById('start-button').addEventListener('click', (event) => {
    event.stopPropagation();
    handlers.onStart();
  });
  start.addEventListener('click', () => handlers.onStart());
  document.getElementById('resume-button').addEventListener('click', () => handlers.onResume());
  document.getElementById('save-button').addEventListener('click', () => handlers.onSave());
  document.getElementById('newgame-button').addEventListener('click', () => handlers.onNewGame());
  document.getElementById('retry-button').addEventListener('click', () => handlers.onRetry());

  return {
    refreshSaveLine,
    showStart() {
      refreshSaveLine();
      start.classList.remove('hidden');
      pause.classList.add('hidden');
      gameover.classList.add('hidden');
    },
    hideStart() {
      start.classList.add('hidden');
    },
    showPause() {
      refreshPauseStats();
      pause.classList.remove('hidden');
    },
    hidePause() {
      pause.classList.add('hidden');
    },
    showGameOver(reason = 'WASTED', line = 'The bay keeps what it takes.') {
      gameoverTitle.textContent = reason;
      gameoverLine.textContent = line;
      gameover.classList.remove('hidden');
    },
    hideGameOver() {
      gameover.classList.add('hidden');
    },
    get startVisible() {
      return !start.classList.contains('hidden');
    },
  };
}
