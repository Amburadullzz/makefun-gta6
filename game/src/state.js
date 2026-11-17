// Everything the player owns, in one object: money, health, the wanted level, where the story
// stands, the in-game clock, and the save file. Nothing else in the game keeps a number that the
// HUD or a mission needs to agree on.

const SAVE_KEY = 'sableharbor.save';
const SAVE_VERSION = 3;

export const STARTING_MONEY = 120;
export const MAX_HEALTH = 100;
export const MAX_WANTED = 5;

/** The night begins at 21:40 and each real second is one in-game minute. */
const START_MINUTES = 21 * 60 + 40;

export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.money = STARTING_MONEY;
    this.health = MAX_HEALTH;
    this.wanted = 0;
    this.missionIndex = 0;
    this.missionStage = 0;
    this.missionsDone = 0;
    this.minutes = START_MINUTES;
    this.day = 1;
    this.dead = false;
    this.seed = 1;
    this.listeners = [];
    this.lastSaveAt = 0;
  }

  /** Subscribe to coarse state changes (money, health, wanted, mission) for the HUD. */
  onChange(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((other) => other !== fn);
    };
  }

  emit(kind) {
    for (const fn of this.listeners) fn(kind, this);
  }

  /** In-game clock as a 24-hour string, e.g. "22:07". */
  clockText() {
    const total = Math.floor(this.minutes) % (24 * 60);
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  /** Advance the city clock; a night shift runs fast, one second is a minute. */
  tick(dt) {
    this.minutes += dt;
    if (this.minutes >= 24 * 60) {
      this.minutes -= 24 * 60;
      this.day += 1;
    }
  }

  addMoney(amount) {
    this.money = Math.max(0, Math.round(this.money + amount));
    this.emit('money');
  }

  /** Take damage; returns true when this blow was the one that dropped the player. */
  hurt(amount) {
    if (this.dead || amount <= 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.emit('health');
    if (this.health === 0) {
      this.dead = true;
      this.emit('death');
      return true;
    }
    return false;
  }

  heal(amount) {
    this.health = Math.min(MAX_HEALTH, this.health + amount);
    this.emit('health');
  }

  /** Raise the wanted level, never lowering it: the police only calm down by escaping. */
  raiseWanted(stars) {
    const next = Math.min(MAX_WANTED, Math.max(this.wanted, stars));
    if (next !== this.wanted) {
      this.wanted = next;
      this.emit('wanted');
    }
  }

  setWanted(stars) {
    const next = Math.max(0, Math.min(MAX_WANTED, stars));
    if (next !== this.wanted) {
      this.wanted = next;
      this.emit('wanted');
    }
  }

  save(extra = {}) {
    const payload = {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      seed: this.seed,
      money: this.money,
      health: this.health,
      wanted: this.wanted,
      missionIndex: this.missionIndex,
      missionStage: this.missionStage,
      missionsDone: this.missionsDone,
      minutes: this.minutes,
      day: this.day,
      ...extra,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      this.lastSaveAt = payload.savedAt;
      return true;
    } catch {
      return false;
    }
  }

  /** Read the save file, or null when there is none or it was written by another version. */
  static readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== SAVE_VERSION) return null;
      return data;
    } catch {
      return null;
    }
  }

  load(data) {
    if (!data) return false;
    this.seed = data.seed ?? 1;
    this.money = Number.isFinite(data.money) ? data.money : STARTING_MONEY;
    this.health = Number.isFinite(data.health) ? data.health : MAX_HEALTH;
    this.wanted = Number.isFinite(data.wanted) ? data.wanted : 0;
    this.missionIndex = Number.isFinite(data.missionIndex) ? data.missionIndex : 0;
    this.missionStage = Number.isFinite(data.missionStage) ? data.missionStage : 0;
    this.missionsDone = Number.isFinite(data.missionsDone) ? data.missionsDone : 0;
    this.minutes = Number.isFinite(data.minutes) ? data.minutes : START_MINUTES;
    this.day = Number.isFinite(data.day) ? data.day : 1;
    this.dead = false;
    this.emit('load');
    return true;
  }

  static clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* storage can be off; a missing save is the same as no save */
    }
  }

  static hasSave() {
    return GameState.readSave() !== null;
  }
}
