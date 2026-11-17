import * as THREE from '../vendor/three.min.js';

export const SHOT_NAMES = ['start', 'play', 'drive', 'chase'];

export function applyShot(name, world) {
  const { state, city, scene, player, vehicles, traffic, police, missions, cameraRig, ui, hud, input } = world;

  const clearTraffic = () => {
    for (const car of traffic.aiCars.slice()) vehicles.remove(car);
    traffic.aiCars.length = 0;
  };

  const makeTrafficAt = (type, x, z, heading, color = 0x2a3a4a) => {
    const car = vehicles.spawn(type, x, z, heading, { color });
    car.driver = 'ai';
    car.speed = 9;
    car.route = { axis: Math.abs(Math.sin(heading)) > 0.5 ? 'x' : 'z', dir: Math.cos(heading) > 0 || Math.sin(heading) > 0 ? 1 : -1 };
    car.target = { x: x + Math.sin(heading) * 40, z: z + Math.cos(heading) * 40 };
    traffic.aiCars.push(car);
    return car;
  };

  state.mode = 'play';
  state.paused = false;
  if (name !== 'start') ui.hideStart();
  state.money = 250;
  state.health = 100;
  state.stamina = 100;
  state.ammo = 12;
  state.ammoReserve = 48;
  state.clock = 23 * 60 + 41;
  hud.show();

  if (name === 'start') {
    state.mode = 'menu';
    hud.hide();
    ui.showStart();
    player.place(36.6, 142.6, 2.2);
    player.setVisible(true);
    const parked = vehicles.spawn('sports', 32.6, 143, Math.PI, { color: 0xc02a3a, parked: true });
    parked.speed = 0;
    cameraRig.setCinematic([38.8, 1.35, 150.6], [32, 2.4, 132], 0.004);

    const key = new THREE.PointLight(0xffd9b0, 420, 18, 2);
    key.position.set(38.1, 2.5, 144.9);
    scene.add(key);
    const rim = new THREE.PointLight(0x6ce8ff, 190, 14, 2);
    rim.position.set(35.2, 2.6, 139.6);
    scene.add(rim);
    const carKey = new THREE.PointLight(0xffc890, 220, 14, 2);
    carKey.position.set(34.6, 1.9, 146.4);
    scene.add(carKey);
    traffic.spawnPedestrianNear(34, 140);
    traffic.spawnPedestrianNear(30, 158);
    for (let i = 0; i < 5; i += 1) {
      makeTrafficAt(i % 2 === 0 ? 'sedan' : 'taxi', 29, 120 - i * 26, Math.PI, i % 3 === 0 ? 0x8a1f2c : 0x2a3a4a);
    }
    return { settle: 0.6, ready: true };
  }

  if (name === 'play') {
    player.place(38.8, 14.5, Math.PI);
    player.setVisible(true);
    cameraRig.setOrbit(0.36, 0.13);
    state.wanted = 0;
    state.missionIndex = 0;
    state.missionStage = 0;
    missions.setObjective();
    const parked = vehicles.spawn('sedan', 34.4, 11.6, 0.95, { color: 0xc04060, parked: true });
    parked.speed = 0;
    // A streetlight's worth of light on the car, so the prompt has something to point at.
    const carLight = new THREE.PointLight(0xffd9b0, 150, 14, 2);
    carLight.position.set(32.8, 3.0, 9.6);
    scene.add(carLight);
    vehicles.spawn('pickup', 34.2, -12, Math.PI / 2, { color: 0x2d4a3a, parked: true });
    makeTrafficAt('sedan', 28.4, -22, 0, 0x3a5a7a);
    makeTrafficAt('taxi', 33.2, 54, Math.PI, 0x8a6a2a);
    traffic.spawnPedestrianNear(42, 2);
    traffic.spawnPedestrianNear(41, -8);
    traffic.spawnPedestrianNear(36.5, 26);
    traffic.spawnPedestrianNear(44.5, 13);
    traffic.spawnPedestrianNear(60, 6);
    state.bus.emit('hint', { text: 'DEX: "The quay, Mara. Do not be late."' });
    return { settle: 1.1, ready: true };
  }

  if (name === 'drive') {
    clearTraffic();
    const car = vehicles.spawn('sports', -46, 29, Math.PI / 2, { color: 0xb02a3a });
    car.speed = 15;
    vehicles.enter(car);
    input.press('forward');
    player.setVisible(false);
    state.wanted = 1;
    state.decayTimer = 90;
    state.lastCrimeAt = performance.now() / 1000;
    state.missionIndex = 0;
    state.missionStage = 0;
    missions.setObjective();
    cameraRig.setOrbit(Math.PI / 2 + Math.PI, 0.2);
    makeTrafficAt('taxi', 6, 27.4, Math.PI / 2, 0xb08a2a);
    makeTrafficAt('sedan', 22, 27.4, Math.PI / 2, 0x2a3a4a);
    makeTrafficAt('van', 40, 31.4, -Math.PI / 2, 0x4a4a52);
    traffic.spawnPedestrianNear(70, 25);
    state.bus.emit('hint', { text: 'DEX: "Keep it under the speed limit. Or do not."' });
    return { settle: 0.55, ready: true };
  }

  if (name === 'chase') {
    clearTraffic();
    const car = vehicles.spawn('sports', -58, 29, Math.PI / 2, { color: 0xb02a3a });
    car.speed = 19;
    vehicles.enter(car);
    input.press('forward');
    player.setVisible(false);
    state.wanted = 3;
    state.decayTimer = 90;
    state.lastCrimeAt = performance.now() / 1000;
    state.missionIndex = 1;
    state.missionStage = 1;
    missions.setObjective();
    cameraRig.setOrbit(Math.PI / 2 + Math.PI + 0.05, 0.19);

    const cruiserA = vehicles.spawn('police', -32, 27.2, -Math.PI / 2, { color: 0xd6dbe2 });
    cruiserA.driver = 'police';
    cruiserA.speed = 16;
    cruiserA.fireTimer = 0.4;
    police.cruisers.push(cruiserA);

    const cruiserB = vehicles.spawn('police', -19, 31.8, -Math.PI / 2, { color: 0xd6dbe2 });
    cruiserB.driver = 'police';
    cruiserB.speed = 14;
    cruiserB.fireTimer = 1.2;
    police.cruisers.push(cruiserB);

    police.officers.length = 0;
    const officer = police.spawnOfficer(34, 23);
    officer.fireTimer = 0.9;

    traffic.spawnPedestrianNear(56, 20);
    traffic.spawnPedestrianNear(48, 36);
    state.bus.emit('toast', { text: 'V.B.P.D. PURSUIT IN PROGRESS', kind: 'hot' });
    return { settle: 0.55, ready: true };
  }

  return { settle: 0, ready: false };
}
