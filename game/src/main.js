// Vesper Bay — wiring. Owns the renderer, the scene and its lights, the fixed-timestep
// loop and the order the systems update in. Every other file does one job; this one
// hands them to each other.



import * as THREE from '../vendor/three.min.js';
import { buildCity } from './city.js';
import { createPlayer } from './player.js';
import { createCamera } from './camera.js';
import { createInput } from './input.js';
import { createState, saveGame, readSave, applySave, resetRun, clearSave } from './state.js';
import { createVehicleManager } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createUi } from './ui.js';
import { createAudio } from './audio.js';
import { applyShot } from './shots.js';
import { createPostFx } from './postfx.js';
import { makeRng } from './seed.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') ?? 1) || 1;
const shotName = params.get('shot');
const rng = makeRng(seed ^ 0x9e37);

const state = createState(seed);
const canvas = document.getElementById('game');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.Fog(0x0d1626, 70, 460);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2200);

scene.add(new THREE.AmbientLight(0x33465f, 0.9));
scene.add(new THREE.HemisphereLight(0x6a8cba, 0x1a2028, 2.4));
const moonLight = new THREE.DirectionalLight(0x9fb8e8, 0.95);
moonLight.position.set(-160, 220, -120);
scene.add(moonLight);
const streetGlow = new THREE.PointLight(0xffe0c4, 13, 26, 2);
streetGlow.position.set(0, 5, 0);
scene.add(streetGlow);

const characterFill = new THREE.PointLight(0xdfe9ff, 90, 16, 2);
scene.add(characterFill);

const input = createInput(canvas);
const city = buildCity(scene, seed);
const cameraRig = createCamera(camera, city);
const player = createPlayer(scene, city, state);
const vehicles = createVehicleManager(scene, city, state);
const traffic = createTraffic(scene, city, state, vehicles, rng);
const police = createPolice(scene, city, state, vehicles, traffic, player, cameraRig);
const combat = createCombat(scene, camera, city, state, player, vehicles, traffic, police);
const missions = createMissions(scene, city, state, player, vehicles, police);
const hud = createHud(city, state, cameraRig);
const audio = createAudio(state);
const ui = createUi(state, { onStart, onResume, onSave, onNewGame, onRetry });
const postfx = createPostFx(renderer, scene, camera);

const controls = { forward: false, back: false, left: false, right: false, sprint: false, jump: false, handbrake: false };
const SPAWN = { x: 39.6, z: 8, heading: -Math.PI / 2 };
const HOSPITAL = { x: -95.5, z: 6 };

let lastTime = performance.now();
let accumulator = 0;
let elapsed = 0;
let frames = 0;
let frameTimeTotal = 0;
let deathTimer = 0;
let autoSaveTimer = 0;
let shotSettled = false;
let shotReadyFrames = 0;
let quality = 2;
const frameSamples = [];
const viewDirection = new THREE.Vector3();

function applyQuality(level) {
  quality = Math.max(0, Math.min(2, level));
  const ratio = quality === 2 ? Math.min(window.devicePixelRatio || 1, 1.5) : quality === 1 ? 1 : 0.75;
  renderer.setPixelRatio(ratio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  postfx.setSize(window.innerWidth, window.innerHeight);
  postfx.enabled = quality > 0;
}

function populateParkedCars() {
  const colours = [0x8a1f2c, 0x1f3c5a, 0x2d4a3a, 0x4a4a52, 0x6a5a3a, 0x5a2a4a, 0x1c2430, 0x7a6a5a];
  const types = ['sedan', 'sedan', 'van', 'pickup', 'sports', 'taxi'];
  for (let i = 0; i < 16; i += 1) {
    const alongX = rng.chance(0.5);
    const road = alongX ? rng.pick(city.roadZ) : rng.pick(city.roadX);
    const along = rng.float(-190, 130);
    const side = rng.chance(0.5) ? 1 : -1;
    const x = alongX ? along : road + side * 6.2;
    const z = alongX ? road + side * 6.2 : along;
    const heading = alongX ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
    vehicles.spawn(rng.pick(types), x, z, heading, { color: rng.pick(colours), parked: true });
  }

  vehicles.spawn('sedan', 34.2, 14, -Math.PI / 2, { color: 0x5a2a4a, parked: true });
}

function beginPlay(fromSave) {
  audio.start();
  ui.hideStart();
  ui.hideGameOver();
  hud.show();
  state.mode = 'play';
  state.paused = false;
  input.lockPointer();
  if (fromSave) missions.setObjective();
  else missions.start();
  state.bus.emit('hint', { text: 'WASD to move · E to take a car · mouse to look' });
}

function onStart() {
  if (state.mode === 'play') return;
  const save = readSave();
  if (save) {
    applySave(state, save);
    player.place(state.pos.x, state.pos.z, state.heading);
    state.missionIndex = save.missionIndex;
    state.missionStage = save.missionStage;
    missions.setObjective();
    beginPlay(true);
    state.bus.emit('toast', { text: 'SHIFT RESTORED', kind: 'gold' });
  } else {
    beginPlay(false);
  }
}

function onResume() {
  if (state.mode !== 'pause') return;
  state.mode = 'play';
  ui.hidePause();
  input.lockPointer();
  audio.setPaused(false);
}

function onSave() {
  const ok = saveGame(state);
  ui.refreshSaveLine();
  hud.toast(ok ? 'SHIFT SAVED' : 'COULD NOT SAVE', ok ? 'gold' : 'hot');
}

function onNewGame() {
  resetRun(state);
  clearSave();
  police.clearAll();
  traffic.clearAiCars();
  for (const car of vehicles.cars.slice()) vehicles.remove(car);
  populateParkedCars();
  player.revive();
  player.place(SPAWN.x, SPAWN.z, SPAWN.heading);
  player.setVisible(true);
  cameraRig.state.cinematic = null;
  cameraRig.setOrbit(Math.PI / 2, 0.16);
  missions.reset();
  state.mode = 'play';
  ui.hidePause();
  ui.hideGameOver();
  hud.show();
  input.lockPointer();
  audio.start();
  audio.setPaused(false);
  missions.start();
}

function onRetry() {
  respawn();
}

function respawn() {
  if (vehicles.playerCar) vehicles.exit();
  player.revive();
  player.setVisible(true);
  player.place(HOSPITAL.x, HOSPITAL.z, 0);
  state.health = state.maxHealth;
  state.stamina = 100;
  state.wanted = 0;
  state.decayTimer = 0;
  state.money = Math.max(0, state.money - 150);
  state.mode = 'play';
  ui.hideGameOver();
  hud.show();
  police.clearAll();
  missions.restart();
  cameraRig.setOrbit(Math.PI, 0.2);
  input.lockPointer();
  state.bus.emit('toast', { text: 'PATCHED UP · $150 FOR THE CLINIC', kind: '' });
}

function togglePause() {
  if (state.mode === 'play') {
    state.mode = 'pause';
    ui.showPause();
    input.unlockPointer();
    audio.setPaused(true);
    saveGame(state);
  } else if (state.mode === 'pause') {
    onResume();
  }
}

function readControls() {
  controls.forward = input.down('forward');
  controls.back = input.down('back');
  controls.left = input.down('left');
  controls.right = input.down('right');
  controls.sprint = input.down('sprint');
  controls.jump = input.pressed('jump');
  controls.handbrake = input.down('handbrake');
}

function handleEnterExit() {
  if (state.inCar) {
    const car = vehicles.exit();
    if (car) {
      const sideX = Math.cos(car.heading) * 2.4;
      const sideZ = -Math.sin(car.heading) * 2.4;
      player.place(car.position.x + sideX, car.position.z + sideZ, car.heading);
      player.setVisible(true);
    }
    return;
  }
  const car = vehicles.nearby(player.position, 5.4);
  if (!car) return;
  vehicles.enter(car);
  player.setVisible(false);
  state.stats.carsStolen += 1;
  if (!car.stolenReported) {
    car.stolenReported = true;
    police.reportCrime('carTheft', car.position.x, car.position.z);
  }
  if (car.driver === 'ai') {
    state.bus.emit('toast', { text: 'CARJACKED · THE DRIVER RAN', kind: 'hot' });
  }
}

state.bus.on('carWreck', ({ car }) => {
  car.speed = 0;
  car.wrecked = true;
  cameraRig.addShake(0.5);
  state.bus.emit('toast', { text: 'THE CAR IS DONE', kind: 'hot' });
});

state.bus.on('playerDown', ({ source }) => {
  if (state.mode !== 'play') return;
  state.mode = 'dead';
  state.stats.deaths += 1;
  deathTimer = 3.4;
  player.hurt();
  if (vehicles.playerCar) vehicles.exit();
  police.clearAll();
  audio.setPaused(true);
  ui.showGameOver(source === 'police' ? 'FLATLINE' : 'BLACKOUT', 'The bay keeps what it takes.');
  missions.fail();
  saveGame(state);
});

state.bus.on('saveRequested', () => saveGame(state));

function update(dt) {
  if (state.mode === 'pause') return;
  if (state.mode === 'dead') {
    deathTimer -= dt;
    if (deathTimer <= 0) respawn();
    return;
  }

  elapsed += dt;
  if (state.mode === 'play') {
    state.clock += dt * 0.4;
    state.stats.playSeconds += dt;
  }

  readControls();

  if (state.mode === 'play') {
    if (input.pressed('pause')) togglePause();
    if (input.pressed('enter')) handleEnterExit();
    if (input.pressed('horn') && state.inCar) state.bus.emit('horn', {});
    if (state.inCar && vehicles.playerCar) {
      vehicles.drivePlayer(dt, controls);
      state.pos.x = vehicles.playerCar.position.x;
      state.pos.z = vehicles.playerCar.position.z;
      state.heading = vehicles.playerCar.heading;
      state.speed = Math.abs(vehicles.playerCar.speed) * 3.6;
      player.position.set(vehicles.playerCar.position.x, vehicles.playerCar.position.y + 0.5, vehicles.playerCar.position.z);
      player.heading = vehicles.playerCar.heading;
      state.stats.distance += Math.abs(vehicles.playerCar.speed) * dt;
    } else {
      player.update(dt, controls, cameraRig.yaw);
      state.pos.x = player.position.x;
      state.pos.y = player.position.y;
      state.pos.z = player.position.z;
      state.heading = player.heading;
      state.speed = player.speed;
      state.stats.distance += player.speed * dt;
    }
    combat.update(dt, input, cameraRig);
    police.update(dt);
    missions.update(dt);
  } else {
    player.update(dt, { forward: false, back: false, left: false, right: false, sprint: false, jump: false }, cameraRig.yaw);
  }

  traffic.update(dt, player.position);
  vehicles.update(dt);
  city.update(dt, elapsed);
  hud.update(dt, player, vehicles, police, missions);

  const focus = state.inCar && vehicles.playerCar ? vehicles.playerCar.position : player.position;
  cameraRig.update(dt, focus, input, {
    inCar: state.inCar,
    speed: state.inCar && vehicles.playerCar ? Math.abs(vehicles.playerCar.speed) : player.speed,
    aiming: input.down('aim') && !state.inCar,
  });

  streetGlow.position.set(focus.x, focus.y + 5, focus.z);
  camera.getWorldDirection(viewDirection);
  characterFill.position.set(focus.x - viewDirection.x * 2.6, focus.y + 2.1, focus.z - viewDirection.z * 2.6);

  const nearestCop = police.cruisers.reduce((nearest, car) => {
    const distance = Math.hypot(car.position.x - focus.x, car.position.z - focus.z);
    return Math.min(nearest, distance);
  }, 999);
  audio.update(dt, { inCar: state.inCar, speed: state.speed, wanted: state.wanted, sirenDistance: nearestCop });

  autoSaveTimer += dt;
  if (autoSaveTimer > 30 && state.mode === 'play') {
    autoSaveTimer = 0;
    saveGame(state);
  }

  input.endFrame();
}

function render() {
  postfx.render();
}

function frame(now) {
  const raw = (now - lastTime) / 1000;
  lastTime = now;
  const dt = Math.min(0.1, raw);
  const frozen = Boolean(shotName) && shotSettled;
  if (window.__bench && !window.__bench.done) {
    // The benchmark drives its own frames; keep the game loop out of its way.
    requestAnimationFrame(frame);
    return;
  }
  try {
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      update(STEP);
      accumulator -= STEP;
      steps += 1;
    }
  }
  if (shotName && !shotSettled) {

    const plan = applyShot(shotName, { state, city, scene, player, vehicles, traffic, police, missions, cameraRig, camera, input, hud, ui, audio });
    const stepsToRun = Math.round((plan.settle ?? 1) / STEP);
    for (let i = 0; i < stepsToRun; i += 1) {
      update(STEP);
      input.endFrame();
    }
    shotSettled = true;
    lastTime = performance.now();
    accumulator = 0;
  }
  } catch (error) {

    if (!window.__errors) window.__errors = [];
    if (window.__errors.length < 6) window.__errors.push(String(error && error.stack || error));
  }
  render();
  frames += 1;
  frameTimeTotal += raw;

  if (!shotName && !frozen) {
    frameSamples.push(raw);
    if (frameSamples.length >= 90) {
      const average = frameSamples.reduce((sum, value) => sum + value, 0) / frameSamples.length;
      frameSamples.length = 0;
      if (average > 0.034 && quality > 0) applyQuality(quality - 1);
    }
  }

  if (shotName && shotSettled && shotReadyFrames < 3) {
    shotReadyFrames += 1;
    if (shotReadyFrames === 3) window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  postfx.setSize(width, height);
}
window.addEventListener('resize', resize);

function boot() {
  populateParkedCars();
  player.place(SPAWN.x, SPAWN.z, SPAWN.heading);
  cameraRig.setOrbit(Math.PI / 2, 0.16);

  if (!shotName) {
    state.mode = 'menu';
    ui.showStart();
    hud.hide();
    cameraRig.setCinematic([58, 26, 236], [-14, 26, -30], 0.012);
    player.setVisible(false);
  }

  input.onLockChange((locked) => {
    if (!locked && state.mode === 'play' && !shotName) {
      state.mode = 'pause';
      ui.showPause();
      saveGame(state);
    }
  });

  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.classList.add('done');
    window.setTimeout(() => loadingEl.remove(), 700);
  }

  render();
  lastTime = performance.now();
  requestAnimationFrame(frame);
}

window.__game = {
  state,
  player,
  city,
  vehicles,
  traffic,
  police,
  missions,
  combat,
  camera: cameraRig,
  renderer,
  scene,
  threeCamera: camera,
  audio,
  hud,
  ui,
  press: (action) => input.press(action),
  release: (action) => input.release(action),
  clearVirtual: () => input.clearVirtual(),
  teleport: (x, z) => player.place(x, z, player.heading),
  setWanted: (level) => { state.wanted = Math.max(0, Math.min(5, level)); },
  getStatus: () => ({
    mode: state.mode,
    money: state.money,
    health: Math.round(state.health),
    wanted: state.wanted,
    missionIndex: state.missionIndex,
    missionStage: state.missionStage,
    objective: state.objective,
    inCar: state.inCar,
    x: Number(state.pos.x.toFixed(2)),
    y: Number(state.pos.y.toFixed(2)),
    z: Number(state.pos.z.toFixed(2)),
    heading: Number(state.heading.toFixed(3)),
    speed: Math.round(state.speed),
    ammo: state.ammo,
    policeCars: police.cruisers.length,
    officers: police.officers.length,
    peds: traffic.pedestrians.length,
    cars: vehicles.cars.length,
    avgFrameMs: frames > 1 ? Number(((frameTimeTotal / frames) * 1000).toFixed(2)) : 0,
  }),

  setQuality: (level) => applyQuality(level),

  benchmarkLogic: (count = 200) => {
    const start = performance.now();
    for (let i = 0; i < count; i += 1) {
      update(STEP);
      input.endFrame();
    }
    const total = performance.now() - start;
    return { frames: count, totalMs: Number(total.toFixed(1)), averageMs: Number((total / count).toFixed(3)) };
  },
  getQuality: () => quality,
  startBenchmark: (count = 200) => {
    const bench = { done: false, count, i: 0, total: 0 };
    window.__bench = bench;
    const start = performance.now();
    const step = () => {
      for (let n = 0; n < 2 && bench.i < count; n += 1) {
        postfx.render();
        bench.i += 1;
      }
      if (bench.i < count) window.setTimeout(step, 25);
      else {
        bench.total = performance.now() - start;
        bench.average = bench.total / count;
        bench.done = true;
      }
    };
    window.setTimeout(step, 0);
    return true;
  },
  benchmark: (count = 200) => {
    const start = performance.now();
    for (let i = 0; i < count; i += 1) postfx.render();
    const total = performance.now() - start;
    return { frames: count, totalMs: Number(total.toFixed(1)), averageMs: Number((total / count).toFixed(2)) };
  },
};

boot();
