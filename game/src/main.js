// The game's front door: the renderer, the scene, the clock, the fixed-timestep loop and the wiring
// that lets the city, the character, the cars, the police and the missions talk to each other.
// Everything the rest of the game reads lives on one object, `game`, exposed for the shot harness.
import * as THREE from '../vendor/three.min.js';
import { Rng, normalizeSeed } from './seed.js';
import { GameState } from './state.js';
import { Input } from './input.js';
import { City } from './city.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { VehicleFleet } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { Ui } from './ui.js';
import { AudioEngine } from './audio.js';
import { setupShot } from './shots.js';

const STEP = 1 / 60;
const MAX_STEPS = 5;

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = normalizeSeed(params.get('seed'), 1);

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.55;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x16283c, 0.0019);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2400);

const state = new GameState();
state.seed = seed;
const rng = new Rng(seed);
const city = new City(scene, rng.fork(1));
const input = new Input(canvas);
const player = new Player(scene, city, state);
const cameraRig = new CameraRig(camera, city, input);
const fleet = new VehicleFleet(scene, city, rng.fork(2));
const traffic = new Traffic(scene, city, rng.fork(3), fleet);
const audio = new AudioEngine();
const police = new Police(scene, city, rng.fork(4), state, fleet, traffic, audio);
const combat = new Combat(scene, city, camera, state, police, traffic, fleet, audio, cameraRig);

const game = {
  renderer,
  scene,
  camera,
  city,
  state,
  input,
  player,
  cameraRig,
  fleet,
  traffic,
  police,
  combat,
  audio,
  seed,
  shotName,
  shotMode: Boolean(shotName),
  mode: 'title',
  nearbyCar: null,
  invulnerable: false,
  elapsed: 0,
  frameTimes: [],
  simTimes: [],
  renderTimes: [],
  frozen: false,
  onPlayerHurt: null,
};
game.stepForShot = (dt) => step(dt);

const ui = new Ui({
  onNewGame: () => startNewGame(),
  onContinue: () => continueGame(),
  onResume: () => resume(),
  onSave: () => {
    saveGame();
    ui.toast('Saved.', 'info');
  },
  onQuit: () => quitToTitle(),
  onKeepPlaying: () => {
    ui.hideEnding();
    game.mode = 'playing';
    input.requestLock();
  },
});

const missions = new Missions(scene, city, state, ui, audio, police, traffic, fleet, combat);
const hud = new Hud(state, city, missions);
game.missions = missions;
game.hud = hud;
game.ui = ui;
combat.extraTargets = () => missions.targets();

police.onDamagePlayer = (amount) => {
  if (game.invulnerable || game.mode !== 'playing') return;
  state.hurt(amount);
  combat.onPlayerHurt();
  ui.flashDamage();
  cameraRig.kick(0.18);
  if (state.health <= 0) onPlayerDeath();
};

// ---------------------------------------------------------------- lifecycle

function startNewGame() {
  GameState.clearSave();
  state.reset();
  state.seed = seed;
  missions.index = 0;
  missions.stage = 0;
  state.missionIndex = 0;
  state.missionStage = 0;
  player.teleport(city.spots.bar.x + 4, city.spots.bar.z + 6, Math.PI);
  cameraRig.setOrbit(Math.PI, 0.28, 5.6);
  game.mode = 'playing';
  renderer.toneMappingExposure = 1.55;
  ui.hideStart();
  ui.hideEnding();
  hud.show(true);
  audio.init();
  audio.startMusic();
  input.requestLock();
  ui.toast('Sable Harbor. 21:40. The rain is not letting up.', 'story', 6);
  missions.startStage();
  missions.current?.start?.();
}

function continueGame() {
  const save = GameState.readSave();
  if (!save) {
    startNewGame();
    return;
  }
  state.load(save);
  missions.index = Math.min(state.missionIndex, missions.missions.length);
  missions.stage = state.missionStage;
  player.teleport(save.x ?? city.spots.bar.x + 4, save.z ?? city.spots.bar.z + 6, save.yaw ?? Math.PI);
  game.mode = 'playing';
  renderer.toneMappingExposure = 1.55;
  ui.hideStart();
  hud.show(true);
  audio.init();
  audio.startMusic();
  input.requestLock();
  ui.toast('Back on the street.', 'info');
  missions.startStage();
}

function saveGame() {
  const position = player.inVehicle ? player.inVehicle.position : player.position;
  state.save({ x: Math.round(position.x), z: Math.round(position.z), yaw: player.yaw });
}

function pause() {
  if (game.mode !== 'playing') return;
  game.mode = 'paused';
  input.releaseLock();
  hud.show(false);
  ui.showPause();
  saveGame();
}

function resume() {
  if (game.mode !== 'paused') return;
  game.mode = 'playing';
  hud.show(true);
  ui.hidePause();
  audio.init();
  input.requestLock();
}

function quitToTitle() {
  saveGame();
  game.mode = 'title';
  input.releaseLock();
  ui.hidePause();
  ui.hideEnding();
  hud.show(false);
  ui.showStart(GameState.hasSave());
}

function onPlayerDeath() {
  if (game.mode !== 'playing') return;
  game.mode = 'dying';
  ui.toast('Rook went down. The city spits him back out.', 'danger', 5);
  setTimeout(() => {
    if (game.mode !== 'dying') return;
    missions.onDeath();
    player.teleport(city.spots.bar.x + 4, city.spots.bar.z + 6, Math.PI);
    state.health = 100;
    state.dead = false;
    state.setWanted(0);
    police.clearAll();
    game.mode = 'playing';
    cameraRig.setOrbit(Math.PI, 0.28, 5.6);
  }, 2600);
}

// ---------------------------------------------------------------- interaction

/** The closest car within arm's reach: a parked one, a story one, or somebody's traffic. */
function findCarNearby() {
  let best = fleet.nearest(player.position.x, player.position.z, 3.6);
  let bestDistance = best
    ? Math.hypot(best.position.x - player.position.x, best.position.z - player.position.z)
    : 3.6;
  for (const car of traffic.cars) {
    const distance = Math.hypot(car.position.x - player.position.x, car.position.z - player.position.z);
    if (distance < bestDistance) {
      best = car;
      bestDistance = distance;
    }
  }
  return best;
}

function handleEnterExit() {
  if (player.inVehicle) {
    const car = fleet.exit(player);
    if (car) ui.toast(`Out of the ${car.name}.`, 'info', 2.4);
    return;
  }
  const car = findCarNearby();
  if (!car) return;

  const wasTraffic = traffic.cars.includes(car);
  if (wasTraffic) {
    traffic.releaseCar(car);
    const witnesses = traffic.peds.filter(
      (ped) => !ped.dead && Math.hypot(ped.position.x - car.position.x, ped.position.z - car.position.z) < 24,
    ).length;
    if (witnesses > 0 || police.units.length > 0) {
      police.reportCrime('carjack', car.position);
      ui.toast('Carjacked. Someone called it in.', 'danger');
    }
  } else if (car.health > 0) {
    const witnesses = traffic.peds.filter(
      (ped) => !ped.dead && Math.hypot(ped.position.x - car.position.x, ped.position.z - car.position.z) < 18,
    ).length;
    if (witnesses > 0) {
      police.reportCrime('carjack', car.position);
      ui.toast('Grand theft auto. A witness is on the phone.', 'danger');
    }
  }

  const entered = fleet.enter(car, player);
  if (entered) {
    audio.init();
    ui.toast(`${entered.name}. Keys were already in it.`, 'info', 2.6);
  }
}

function handleRunOvers() {
  const car = fleet.playerCar;
  if (!car) return;
  const hits = traffic.runOver(car);
  if (hits.length === 0) return;
  police.reportCrime('pedestrian', car.position);
  ui.toast('You hit someone. The whole street saw it.', 'danger');
  cameraRig.kick(0.2);
  audio.thud(car.position);
}

// ---------------------------------------------------------------- the loop

function step(dt) {
  game.elapsed += dt;
  state.tick(dt);

  if (input.pressed('pause')) pause();
  if (input.pressed('mute')) ui.toast(audio.toggleMute() ? 'Sound off.' : 'Sound on.', 'info', 1.8);

  if (player.inVehicle) {
    player.inVehicle.drive(dt, input);
    player.position.copy(player.inVehicle.position);
    if (input.pressed('enterExit')) handleEnterExit();
  } else {
    player.update(dt, input, cameraRig.yaw);
    game.nearbyCar = findCarNearby();
    if (input.pressed('enterExit')) handleEnterExit();
  }

  city.update(dt, player.position);
  traffic.update(dt, player);
  police.update(dt, player);
  combat.update(dt, player, input);
  missions.update(dt, game);
  fleet.update(dt, game.elapsed);
  handleRunOvers();

  if (player.inVehicle) {
    cameraRig.updateForVehicle(dt, player.inVehicle);
    audio.setEngine(player.inVehicle.speed, input.held('forward'));
  } else {
    cameraRig.update(dt, player);
    audio.engineOff();
  }

  // One key press is one action: clear this step's edges now that everything has read them.
  input.endFrame();
}

let lastTime = performance.now();
let accumulator = 0;
let framesSinceReady = 0;

function frame(now) {
  const elapsed = (now - lastTime) / 1000;
  const rawDelta = Math.min(0.1, elapsed);
  lastTime = now;

  try {
    const simStart = performance.now();
    updateWorld(rawDelta);
    const simEnd = performance.now();
    renderer.render(scene, camera);
    const renderEnd = performance.now();
    game.simTimes.push(simEnd - simStart);
    game.renderTimes.push(renderEnd - simEnd);
    if (game.simTimes.length > 240) {
      game.simTimes.shift();
      game.renderTimes.shift();
    }
  } catch (error) {
    // A bad frame must not end the game: report it once and keep the loop alive.
    if (!game.lastError) {
      game.lastError = error;
      console.error('frame failed', error);
    }
  }

  game.frameTimes.push(elapsed * 1000);
  if (game.frameTimes.length > 240) game.frameTimes.shift();

  if (shotName) {
    framesSinceReady += 1;
    if (framesSinceReady >= 3) window.__shotReady = true;
  }

  requestAnimationFrame(frame);
}

function updateWorld(rawDelta) {
  if (game.frozen) {
    // A staged screenshot: the world holds still while the camera stays where it was put.
    city.update(rawDelta, player.position);
  } else if (game.mode === 'playing' || game.mode === 'dying') {
    accumulator += rawDelta;
    let steps = 0;
    while (accumulator >= STEP && steps < MAX_STEPS) {
      step(STEP);
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === MAX_STEPS) accumulator = 0;
  } else if (game.mode === 'title') {
    // A slow drift over the bay behind the title card; the cover is a little brighter than play.
    renderer.toneMappingExposure = 1.85;
    game.elapsed += rawDelta;
    const angle = Math.sin(game.elapsed * 0.06) * 0.22 + 0.1;
    const distance = 340;
    camera.position.set(200 + Math.sin(angle) * distance, 46, 200 + Math.cos(angle) * distance);
    camera.lookAt(196, 46, 150);
    camera.fov = 58;
    camera.updateProjectionMatrix();
    city.update(rawDelta, { x: 196, z: 196 });
    traffic.update(rawDelta, null);
  } else if (game.mode === 'paused') {
    city.update(0, player.position);
  }

  if (game.mode !== 'title') {
    hud.update(rawDelta, game);
    if (!game.frozen) ui.update(rawDelta);
  } else {
    ui.update(rawDelta);
  }
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', onResize);
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Enter' && event.code !== 'NumpadEnter') return;
  if (game.mode === 'title' && !game.shotMode) {
    if (GameState.hasSave()) continueGame();
    else startNewGame();
  }
});
canvas.addEventListener('mousedown', () => {
  audio.init();
  if (game.mode === 'playing' && !input.locked) input.requestLock();
});
input.onLockChange = (locked) => {
  if (!locked && game.mode === 'playing') pause();
};

// ---------------------------------------------------------------- boot

function boot() {
  hud.show(false);
  ui.showStart(GameState.hasSave());
  if (shotName) {
    setupShot(shotName, game);
    window.__shotReady = false;
  }
  requestAnimationFrame(frame);
}

// Hooks for the headless checks and for the shot harness: start, step, and read the game.
window.__game = game;
window.__startGame = () => {
  startNewGame();
  return { money: state.money, wanted: state.wanted };
};
window.__advance = (seconds) => {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) step(STEP);
  return {
    money: state.money,
    health: state.health,
    wanted: state.wanted,
    x: Math.round(player.position.x * 100) / 100,
    z: Math.round(player.position.z * 100) / 100,
    inCar: Boolean(player.inVehicle),
    mission: missions.title,
    objective: missions.text,
    frameMs: averageFrameMs(),
  };
};
window.__frameStats = () => {
  const times = game.frameTimes.slice(-200);
  const sorted = [...times].sort((a, b) => a - b);
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return {
    frames: times.length,
    averageMs: mean(times),
    medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
    p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    simMs: mean(game.simTimes.slice(-200)),
    renderMs: mean(game.renderTimes.slice(-200)),
  };
};
function averageFrameMs() {
  const times = game.frameTimes.slice(-60);
  return times.reduce((sum, value) => sum + value, 0) / Math.max(1, times.length);
}

boot();
