// The one place the run's numbers live: money, health, the wanted level, the mission
// stage, the clock and the statistics, plus the save file in localStorage. Gameplay
// modules mutate this object; the HUD only ever reads it.



export const SAVE_KEY = 'vesper-bay.night-shift.save';
export const SAVE_VERSION = 1;
export const START_CLOCK_MINUTES = 23 * 60 + 10;
export const MAX_WANTED = 5;

export function createBus() {
  const listeners = new Map();
  return {
    on(name, handler) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(handler);
      return () => listeners.get(name).delete(handler);
    },
    emit(name, payload) {
      const set = listeners.get(name);
      if (!set) return;
      for (const handler of set) handler(payload);
    },
  };
}

export function createState(seed = 1) {
  return {
    seed,
    mode: 'menu',
    paused: false,
    money: 250,
    health: 100,
    maxHealth: 100,
    stamina: 100,
    wanted: 0,
    wantedHeat: 0,
    ammo: 12,
    magazineSize: 12,
    ammoReserve: 48,
    weapon: 'PISTOL',
    missionIndex: 0,
    missionStage: 0,
    missionActive: false,
    missionFailed: false,
    objective: '',
    missionKicker: '',
    target: null,
    targetRadius: 6,
    clock: START_CLOCK_MINUTES,
    inCar: false,
    pos: { x: 0, y: 0, z: 0 },
    heading: 0,
    district: 'THE NARROWS',
    speed: 0,
    stats: {
      moneyEarned: 0,
      shotsFired: 0,
      shotsHit: 0,
      takedowns: 0,
      carsStolen: 0,
      missionsDone: 0,
      distance: 0,
      deaths: 0,
      playSeconds: 0,
      crimes: 0,
    },
    bus: createBus(),
  };
}

export function resetRun(state, seed = state.seed) {
  state.seed = seed;
  state.money = 250;
  state.health = 100;
  state.stamina = 100;
  state.wanted = 0;
  state.wantedHeat = 0;
  state.ammo = state.magazineSize;
  state.ammoReserve = 48;
  state.missionIndex = 0;
  state.missionStage = 0;
  state.missionActive = false;
  state.missionFailed = false;
  state.objective = '';
  state.missionKicker = '';
  state.target = null;
  state.clock = START_CLOCK_MINUTES;
  state.inCar = false;
  state.speed = 0;
  state.stats = {
    moneyEarned: 0,
    shotsFired: 0,
    shotsHit: 0,
    takedowns: 0,
    carsStolen: 0,
    missionsDone: 0,
    distance: 0,
    deaths: 0,
    playSeconds: 0,
    crimes: 0,
  };
}

export function snapshot(state) {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    seed: state.seed,
    money: state.money,
    health: state.health,
    ammo: state.ammo,
    ammoReserve: state.ammoReserve,
    missionIndex: state.missionIndex,
    missionStage: state.missionStage,
    clock: state.clock,
    pos: { x: state.pos.x, y: state.pos.y, z: state.pos.z },
    heading: state.heading,
    district: state.district,
    stats: { ...state.stats },
  };
}

export function saveGame(state) {
  try {
    const data = JSON.stringify(snapshot(state));
    window.localStorage.setItem(SAVE_KEY, data);
    return true;
  } catch {
    return false;
  }
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function applySave(state, save) {
  if (!save) return false;
  state.seed = Number.isFinite(save.seed) ? save.seed : state.seed;
  state.money = Number.isFinite(save.money) ? save.money : state.money;
  state.health = Math.min(state.maxHealth, Math.max(25, Number(save.health) || state.maxHealth));
  state.ammo = Number.isFinite(save.ammo) ? save.ammo : state.ammo;
  state.ammoReserve = Number.isFinite(save.ammoReserve) ? save.ammoReserve : state.ammoReserve;
  state.missionIndex = Math.min(3, Math.max(0, Number(save.missionIndex) || 0));
  state.missionStage = Math.max(0, Number(save.missionStage) || 0);
  state.clock = Number.isFinite(save.clock) ? save.clock : state.clock;
  state.district = typeof save.district === 'string' ? save.district : state.district;
  if (save.pos && Number.isFinite(save.pos.x) && Number.isFinite(save.pos.z)) {
    state.pos = { x: save.pos.x, y: 0, z: save.pos.z };
  }
  state.heading = Number.isFinite(save.heading) ? save.heading : 0;
  if (save.stats) state.stats = { ...state.stats, ...save.stats };
  return true;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {

  }
}

export function formatMoney(value) {
  const n = Math.max(0, Math.round(value));
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatClock(minutes) {
  const total = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = Math.floor(total % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function addMoney(state, amount, reason = '') {
  state.money = Math.max(0, state.money + amount);
  if (amount > 0) state.stats.moneyEarned += amount;
  state.bus.emit('money', { amount, reason });
}

export function damagePlayer(state, amount, source = '') {
  if (state.mode !== 'play' || state.health <= 0) return;
  state.health = Math.max(0, state.health - amount);
  state.bus.emit('playerHit', { amount, source });
  if (state.health <= 0) state.bus.emit('playerDown', { source });
}
