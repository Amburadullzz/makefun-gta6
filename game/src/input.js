// Keyboard and mouse, in one place. Gameplay asks for named actions ("forward",
// "handbrake"), never for key codes, and the mapping table is the only list of keys.



export const ACTION_KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  handbrake: ['Space'],
  fire: ['Mouse0'],
  aim: ['Mouse2'],
  reload: ['KeyR'],
  enter: ['KeyE'],
  horn: ['KeyH'],
  pause: ['Escape', 'KeyP'],
  camera: ['KeyC'],
};

export const KEY_TO_ACTION = (() => {
  const table = new Map();
  for (const [action, codes] of Object.entries(ACTION_KEYS)) {
    for (const code of codes) {
      if (!table.has(code)) table.set(code, []);
      table.get(code).push(action);
    }
  }
  return table;
})();

const GAME_KEYS = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'KeyE', 'KeyR', 'KeyH', 'KeyC',
]);

export function createInput(canvas) {
  const held = new Set();
  const previous = new Set();
  const virtual = new Set();
  const mouse = { dx: 0, dy: 0, wheel: 0, locked: false, dragging: false, sensitivity: 0.0022 };
  const listeners = { lock: new Set() };

  const setLock = (locked) => {
    mouse.locked = locked;
    for (const fn of listeners.lock) fn(locked);
  };

  const codeToActions = (code) => KEY_TO_ACTION.get(code) ?? [];

  const onKeyDown = (event) => {
    if (event.repeat) {
      if (GAME_KEYS.has(event.code)) event.preventDefault();
      return;
    }
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    for (const action of codeToActions(event.code)) held.add(action);
  };

  const onKeyUp = (event) => {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    for (const action of codeToActions(event.code)) held.delete(action);
  };

  const onMouseDown = (event) => {
    mouse.dragging = true;
    if (event.button === 0) held.add('fire');
    if (event.button === 2) held.add('aim');
  };

  const onMouseUp = (event) => {
    mouse.dragging = false;
    if (event.button === 0) held.delete('fire');
    if (event.button === 2) held.delete('aim');
  };

  const onMouseMove = (event) => {

    if (!mouse.locked && !mouse.dragging) return;
    mouse.dx += event.movementX || 0;
    mouse.dy += event.movementY || 0;
  };

  const onWheel = (event) => {
    mouse.wheel += Math.sign(event.deltaY);
  };

  const onBlur = () => {
    held.clear();
    mouse.dx = 0;
    mouse.dy = 0;
  };

  const onContextMenu = (event) => event.preventDefault();

  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp, { passive: false });
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('blur', onBlur);
  window.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerlockchange', () => setLock(document.pointerLockElement === canvas));

  const api = {
    mouse,
    down: (action) => held.has(action) || virtual.has(action),
    pressed: (action) => (held.has(action) || virtual.has(action)) && !previous.has(action),
    released: (action) => !held.has(action) && !virtual.has(action) && previous.has(action),
    anyDown: (...actions) => actions.some((action) => api.down(action)),
    get locked() {
      return mouse.locked;
    },
    lockPointer() {
      if (document.pointerLockElement === canvas) return;


      const request = canvas.requestPointerLock?.({ unadjustedMovement: true });
      if (request && typeof request.catch === 'function') {
        request.catch(() => {
          const fallback = canvas.requestPointerLock?.();
          if (fallback && typeof fallback.catch === 'function') fallback.catch(() => {});
        });
      }
    },
    unlockPointer() {
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    },
    onLockChange(fn) {
      listeners.lock.add(fn);
      return () => listeners.lock.delete(fn);
    },

    press(action) {
      virtual.add(action);
    },
    release(action) {
      virtual.delete(action);
    },
    clearVirtual() {
      virtual.clear();
    },
    takeMouseDelta() {
      const dx = mouse.dx;
      const dy = mouse.dy;
      mouse.dx = 0;
      mouse.dy = 0;
      return { dx, dy };
    },
    takeWheel() {
      const value = mouse.wheel;
      mouse.wheel = 0;
      return value;
    },
    endFrame() {
      previous.clear();
      for (const action of held) previous.add(action);
      for (const action of virtual) previous.add(action);
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('contextmenu', onContextMenu);
    },
  };

  return api;
}
