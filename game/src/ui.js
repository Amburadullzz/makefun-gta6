// The screens around the game: the title card, the pause menu, the ending, and the toast line that
// tells you what just happened. All of it is DOM on top of the canvas, so the type stays sharp.

export class Ui {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.start = document.getElementById('start');
    this.pause = document.getElementById('pause');
    this.ending = document.getElementById('ending');
    this.endingTitle = document.getElementById('ending-title');
    this.endingText = document.getElementById('ending-text');
    this.toastStack = document.getElementById('toast-stack');
    this.continueButton = document.getElementById('btn-continue');
    this.startNote = document.getElementById('start-note');
    this.pauseNote = document.getElementById('pause-note');
    this.status = document.getElementById('status');
    this.toasts = [];

    this.damageFlash = document.createElement('div');
    this.damageFlash.id = 'damage-flash';
    document.body.appendChild(this.damageFlash);
    this.damage = 0;

    document.getElementById('btn-new').addEventListener('click', () => this.handlers.onNewGame?.());
    this.continueButton.addEventListener('click', () => this.handlers.onContinue?.());
    document.getElementById('btn-resume').addEventListener('click', () => this.handlers.onResume?.());
    document.getElementById('btn-save').addEventListener('click', () => this.handlers.onSave?.());
    document.getElementById('btn-quit').addEventListener('click', () => this.handlers.onQuit?.());
    document.getElementById('btn-keep-playing').addEventListener('click', () => this.handlers.onKeepPlaying?.());
    document.getElementById('btn-ending-title').addEventListener('click', () => this.handlers.onQuit?.());
  }

  showStart(hasSave) {
    this.start.classList.remove('hidden');
    this.pause.classList.add('hidden');
    this.ending.classList.add('hidden');
    this.continueButton.disabled = !hasSave;
    this.startNote.textContent = hasSave
      ? 'Enter to continue · the city is saved as you play'
      : 'Enter to begin · the city is saved as you play';
    this.setStatus('Sable Harbor. Press Enter to start a new game.');
  }

  hideStart() {
    this.start.classList.add('hidden');
  }

  showPause() {
    this.pause.classList.remove('hidden');
    this.pauseNote.textContent = 'Click resume or press ESC to get back on the street.';
    this.setStatus('Paused.');
  }

  hidePause() {
    this.pause.classList.add('hidden');
  }

  showEnding(title, text) {
    this.endingTitle.textContent = title;
    this.endingText.textContent = text;
    this.ending.classList.remove('hidden');
    this.setStatus(`The shift is over. ${text}`);
  }

  hideEnding() {
    this.ending.classList.add('hidden');
  }

  get startVisible() {
    return !this.start.classList.contains('hidden');
  }

  get pauseVisible() {
    return !this.pause.classList.contains('hidden');
  }

  get endingVisible() {
    return !this.ending.classList.contains('hidden');
  }

  /** A line of news at the bottom of the screen: a payout, a warning, something Del said. */
  toast(text, kind = 'info', seconds = 4.6) {
    const element = document.createElement('div');
    element.className = `toast ${kind}`;
    element.textContent = text;
    this.toastStack.appendChild(element);
    this.toasts.push({ element, life: seconds });
    while (this.toasts.length > 3) {
      const oldest = this.toasts.shift();
      oldest.element.remove();
    }
    this.setStatus(text);
  }

  setStatus(text) {
    if (this.status) this.status.textContent = text;
  }

  /** A red pulse at the edges of the screen when the player is hit. */
  flashDamage() {
    this.damage = 1;
  }

  update(dt) {
    for (const toast of [...this.toasts]) {
      toast.life -= dt;
      if (toast.life <= 0) {
        toast.element.remove();
        this.toasts = this.toasts.filter((other) => other !== toast);
      } else if (toast.life < 0.6) {
        toast.element.style.opacity = String(Math.max(0, toast.life / 0.6));
      }
    }
    if (this.damage > 0) {
      this.damage = Math.max(0, this.damage - dt * 1.8);
      this.damageFlash.style.opacity = String(this.damage * 0.55);
    }
  }
}
