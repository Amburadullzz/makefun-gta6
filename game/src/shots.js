// The screenshot scenes. `?shot=start|play|drive|chase&seed=1` stages a deterministic moment — the
// same cars in the same place every run — freezes the simulation, and lets main.js flag the frame
// as ready. Each scene shows several systems at once: a mission, the HUD, traffic and the police.
import * as THREE from '../vendor/three.min.js';

export function setupShot(name, game) {
  const { state, city, player, fleet, traffic, police, cameraRig, missions, ui, hud } = game;

  game.invulnerable = true;
  game.mode = 'playing';
  game.renderer.toneMappingExposure = name === 'start' ? 1.85 : 1.55;
  missions.frozen = true;
  ui.hideStart();
  ui.hidePause();
  ui.hideEnding();
  hud.show(true);
  state.reset();
  state.seed = game.seed;
  state.minutes = 22 * 60 + 6;
  state.money = 1240;
  player.teleport(city.spots.bar.x + 4, city.spots.bar.z + 6, Math.PI);
  cameraRig.snapNext = true;

  if (name === 'start') stageStart(game);
  else if (name === 'drive') stageDrive(game);
  else if (name === 'chase') stageChase(game);
  else stagePlay(game);

  // The camera is placed by hand here; keep the rig from pulling it back to the character.
  cameraRig.hold = true;

  // Let the rain and the traffic settle for a moment, then hold the frame.
  for (let i = 0; i < 24; i += 1) game.stepForShot(1 / 60);
  if (name === 'play') {
    // Pistol out, so the shot shows the character armed on the street.
    player.aiming = true;
    player.animate(0.016);
  }
  if (name === 'drive' || name === 'chase') {
    const car = fleet.playerCar;
    if (car) {
      car.speed = name === 'chase' ? 19 : 16;
      car.syncMesh();
      cameraRig.updateForVehicle(0.016, car);
    }
  }
  game.frozen = true;
  hud.shownMoney = state.money;
  hud.money.textContent = `$${state.money.toLocaleString('en-US')}`;
  hud.update(0.016, game);
}

/** The cover: the title over the harbour, a car waiting on the promenade, the skyline behind. */
function stageStart(game) {
  const { city, player, fleet, traffic, cameraRig, ui, hud } = game;
  hud.show(false);
  ui.showStart(false);
  player.teleport(419, 268, Math.PI);
  player.setVisible(true);

  const car = fleet.storyCars[1];
  car.placeAt(424, 254, Math.PI);
  car.setHeadlights(true, true);

  // A few cars on the waterfront road, headlights toward the city.
  const others = traffic.cars.slice(0, 3);
  others.forEach((trafficCar, index) => {
    trafficCar.placeAt(412 + index * 6, 320 + index * 26, Math.PI);
    trafficCar.setHeadlights(true, false);
    trafficCar.speed = 0;
  });

  cameraRig.yaw = 2.6;
  cameraRig.pitch = 0.1;
  cameraRig.snapTo(new THREE.Vector3(128, 22, 470), new THREE.Vector3(238, 38, 300));
  game.camera.fov = 58;
  game.camera.updateProjectionMatrix();
  void city;
}

/** On foot outside The Drowned Lamp: the character, the street, the HUD and the first job. */
function stagePlay(game) {
  const { city, player, traffic, fleet, cameraRig, missions, state } = game;
  player.teleport(152, 223, Math.PI / 2);
  player.setVisible(true);
  player.yaw = Math.PI / 2;
  player.walkPhase = 1.1;
  state.money = 1240;
  state.wanted = 0;

  // Two cars coming up the avenue behind him, one waiting at the kerb.
  const [first, second, third] = traffic.cars;
  placeTraffic(first, 186, 228, Math.PI / 2);
  placeTraffic(second, 214, 219.5, -Math.PI / 2);
  placeTraffic(third, 132, 219.5, Math.PI / 2);
  const parked = fleet.cars[0];
  if (parked) parked.placeAt(163, 219.5, Math.PI / 2);

  missions.title = 'COLD OPEN';
  missions.text = 'Steal the Tern GT from Pier 9';
  // The job marker, standing on the corner ahead: the same beacon every objective gets.
  missions.marker = { x: 171, z: 217 };
  missions.markerGroup.position.set(171, 0.5, 217);
  missions.markerGroup.visible = true;

  // A low camera behind Rook, looking down the pavement at the bar's neon.
  cameraRig.yaw = Math.PI / 2;
  cameraRig.pitch = 0.1;
  cameraRig.snapTo(new THREE.Vector3(147.9, 2.4, 224.7), new THREE.Vector3(156.4, 1.45, 221.4));
  game.camera.fov = 60;
  game.camera.updateProjectionMatrix();
}

/** Behind the wheel on the avenue: traffic ahead, headlights on the road, the city going past. */
function stageDrive(game) {
  const { city, player, fleet, traffic, cameraRig, missions, state } = game;
  const car = fleet.storyCars[0];
  car.health = 100;
  car.placeAt(64, 163.6, Math.PI / 2);
  fleet.enter(car, player);
  car.speed = 16;

  placeTraffic(traffic.cars[0], 88, 163.6, Math.PI / 2);
  placeTraffic(traffic.cars[1], 112, 163.6, Math.PI / 2);
  placeTraffic(traffic.cars[2], 126, 172.6, -Math.PI / 2);
  traffic.cars[0].speed = 9;
  traffic.cars[1].speed = 11;

  state.money = 1240;
  state.wanted = 1;
  missions.title = 'COLD OPEN';
  missions.text = 'Drive the Tern GT to Marrow Motors';
  missions.marker = { x: city.spots.garage.x, z: city.spots.garage.z };
  missions.markerGroup.position.set(missions.marker.x, 0.5, missions.marker.z);
  missions.markerGroup.visible = true;

  cameraRig.yaw = car.heading + Math.PI;
  cameraRig.pitch = 0.02;
  cameraRig.snapNext = true;
  cameraRig.updateForVehicle(0.016, car);
  cameraRig.camera.position.set(car.position.x - 7.4, 3.1, car.position.z + 1.2);
  cameraRig.camera.lookAt(car.position.x + 6, 1.6, car.position.z);
  game.camera.fov = 70;
  game.camera.updateProjectionMatrix();
}

/** Three stars and two cruisers on the tail, with the job still on the HUD. */
function stageChase(game) {
  const { city, player, fleet, traffic, police, cameraRig, missions, state, ui } = game;
  const car = fleet.storyCars[1];
  car.health = 100;
  car.placeAt(172, 223.6, Math.PI / 2);
  fleet.enter(car, player);
  car.speed = 19;

  state.money = 1990;
  state.wanted = 3;
  police.clearAll();
  police.placeUnit(161, 219.6, Math.PI / 2);
  police.placeUnit(150, 229.6, Math.PI / 2);
  police.placeUnit(138, 215.6, Math.PI / 2);
  for (const unit of police.units) {
    unit.car.updateLightbar(0.05, true);
    unit.car.speed = 20;
  }
  police.units[0].deploy();
  police.sirenOn = true;

  placeTraffic(traffic.cars[0], 214, 214.6, -Math.PI / 2);
  placeTraffic(traffic.cars[1], 250, 223.6, Math.PI / 2);

  missions.title = 'BAD DEBTS';
  missions.text = 'Get back to The Drowned Lamp';
  missions.marker = { x: city.spots.bar.x, z: city.spots.bar.z };
  missions.markerGroup.position.set(missions.marker.x, 0.5, missions.marker.z);
  missions.markerGroup.visible = true;

  // Side-on, low: the player's car and the cruisers behind it both in frame, lights toward us.
  cameraRig.yaw = car.heading;
  cameraRig.pitch = 0.1;
  cameraRig.snapTo(new THREE.Vector3(166, 2.7, 235), new THREE.Vector3(165, 1.2, 218));
  game.camera.fov = 64;
  game.camera.updateProjectionMatrix();
  ui.toast('Del: "Three stars, Rook. Lose them before the bridge."', 'danger', 60);
}

function placeTraffic(car, x, z, heading) {
  if (!car) return;
  car.placeAt(x, z, heading);
  car.setHeadlights(true, false);
  if (car.ai) {
    car.ai.node = car.ai.node ?? null;
    car.ai.target = null;
    car.ai.cruise = 10;
  }
  car.speed = 0;
}
