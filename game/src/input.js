// One place for what the player is pressing. The rest of the game asks for named actions
// ("forward", "handbrake", "fire"), never for a key code, so the bindings can change here alone.

/** Named action -> the keyboard codes that trigger it. */
export const KEY_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  enterExit: ['KeyE'],
  reload: ['KeyR'],
  horn: ['KeyH'],
  pause: ['Escape', 'KeyP'],
  mute: ['KeyM'],
  headlights: ['KeyL'],
};

/** Actions that must not scroll or zoom the page while the game has focus. */
const SWALLOWED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0 };
    this.locked = false;
    this.enabled = true;
    this.onLockChange = null;
    this.attach();
  }

  attach() {
    window.addEventListener('keydown', (event) => {
      if (SWALLOWED.has(event.code)) event.preventDefault();
      if (event.repeat) return;
      this.down.add(event.code);
      this.justPressed.add(event.code);
    });
    window.addEventListener('keyup', (event) => {
      this.down.delete(event.code);
      this.justReleased.add(event.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouse.left = false;
      this.mouse.right = false;
    });

    this.canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.mouse.left = true;
        this.mouse.leftPressed = true;
      }
      if (event.button === 2) this.mouse.right = true;
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouse.left = false;
      if (event.button === 2) this.mouse.right = false;
    });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('mousemove', (event) => {
      // Pointer lock is the normal way to look around; dragging with a button held is the
      // fallback for a browser or a window that will not give the game the pointer.
      if (!this.locked && !this.mouse.left && !this.mouse.right) return;
      this.mouse.dx += event.movementX || 0;
      this.mouse.dy += event.movementY || 0;
    });
    window.addEventListener(
      'wheel',
      (event) => {
        if (!this.locked) return;
        this.mouse.wheel += Math.sign(event.deltaY);
        event.preventDefault();
      },
      { passive: false },
    );

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.mouse.left = false;
        this.mouse.right = false;
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  /** Ask the browser for pointer lock; a click during play is the usual trigger. */
  requestLock() {
    if (this.locked) return;
    const request = this.canvas.requestPointerLock?.();
    if (request && typeof request.catch === 'function') request.catch(() => {});
  }

  releaseLock() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  /** Is the named action held down right now? */
  held(action) {
    if (!this.enabled) return false;
    const codes = KEY_BINDINGS[action];
    if (!codes) return false;
    for (const code of codes) if (this.down.has(code)) return true;
    return false;
  }

  /** Did the named action go down this frame? */
  pressed(action) {
    if (!this.enabled) return false;
    const codes = KEY_BINDINGS[action];
    if (!codes) return false;
    for (const code of codes) if (this.justPressed.has(code)) return true;
    return false;
  }

  released(action) {
    const codes = KEY_BINDINGS[action];
    if (!codes) return false;
    for (const code of codes) if (this.justReleased.has(code)) return true;
    return false;
  }

  /** -1..1 sideways intent from A/D, for steering and strafing. */
  axisX() {
    return (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
  }

  /** -1..1 forward intent from W/S. */
  axisY() {
    return (this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0);
  }

  takeMouse() {
    const delta = { dx: this.mouse.dx, dy: this.mouse.dy, wheel: this.mouse.wheel };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
    return delta;
  }

  /** Clear per-frame edges. Called once at the end of every update. */
  endFrame() {
    this.justPressed.clear();
    this.justReleased.clear();
    this.mouse.leftPressed = false;
    this.mouse.wheel = 0;
  }
}
