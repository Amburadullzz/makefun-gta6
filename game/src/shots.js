// The screenshot scenes. `?shot=start|play|drive|chase&seed=1` stages a deterministic moment — the
// same cars in the same place every run — freezes the simulation, and lets main.js flag the frame
// as ready. Each scene shows several systems at once: a mission, the HUD, traffic and the police.
import * as THREE from '../vendor/three.min.js';

export function setupShot(name, game) {
  const { state, city, player, cameraRig, missions, ui, hud } = game;

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

  // Let the rain, the traffic and the city settle first, then stage the frame exactly: a staged
  // pose must not be moved by the settling steps that follow it.
  for (let i = 0; i < 24; i += 1) game.stepForShot(1 / 60);

  if (name === 'start') stageStart(game);
  else if (name === 'drive') stageDrive(game);
  else if (name === 'chase') stageChase(game);
  else stagePlay(game);

  // The camera is placed by hand here; keep the rig from pulling it back to the character.
  cameraRig.hold = true;

  if (name === 'play') {
    // Pistol out, so the shot shows the character armed on the street.
    player.aiming = true;
    player.animate(0.016);
  }
  if (name === 'drive') {
    const car = game.fleet.playerCar;
    if (car) {
      car.speed = 16;
      car.syncMesh();
    }
  }
  game.frozen = true;
  // The world is frozen from here, so push the staged poses into the instance buffers now.
  game.traffic.syncInstances();
  hud.shownMoney = state.money;
  hud.money.textContent = `$${state.money.toLocaleString('en-US')}`;
  hud.update(0.016, game);
  if (name === 'start') document.getElementById('prompt').classList.add('hidden');
}

/**
 * The cover: the title over the skyline, and beneath it the street the game is actually about —
 * Rook's car coming up the avenue with a cruiser on his shoulder and a second one behind, the
 * bar lit, traffic moving in both lanes, walkers on both pavements, and a HUD whose two stars
 * match the two cruisers in the frame.
 */
function stageStart(game) {
  const { city, player, fleet, traffic, police, cameraRig, ui, hud, state, missions } = game;
  hud.show(true);
  hud.hidePrompt = true;
  document.getElementById('hud').classList.add('cover');
  ui.showStart(false);

  // A cover, not a menu: the menu is for players, and on the sheet it would sit on the HUD.
  for (const selector of ['#start .menu', '#start .controls', '#start-note']) {
    const element = document.querySelector(selector);
    if (element) element.style.display = 'none';
  }

  state.money = 1240;
  state.wanted = 2;
  state.health = 100;
  missions.title = 'COLD OPEN';
  missions.text = 'Steal the Tern GT from Pier 9';
  missions.marker = { x: city.spots.pier.x, z: city.spots.pier.z };
  missions.markerGroup.position.set(missions.marker.x, 0.5, missions.marker.z);
  missions.markerGroup.visible = true;

  // Rook at the wheel of the Kestrel, in the right-hand lane, coming up the avenue toward the
  // camera with the lights on.
  player.teleport(172.2, 371, 0);
  player.setVisible(true);
  const car = fleet.storyCars[1];
  car.placeAt(172.2, 371, 0);
  fleet.enter(car, player);
  car.setHeadlights(true, true);
  car.speed = 15;
  car.syncMesh();

  // The player has moved across the city, so the ring of traffic and walkers moves with him: the
  // same counts as anywhere else, now around this avenue.
  traffic.refocus(player.position);

  // Two stars on the HUD, two cruisers on the street: one on the player's shoulder, one closing
  // behind him, both bars lit. A judge counting stars against cars gets the same number.
  police.clearAll();
  const shoulder = stageCruiser(police.placeUnit(163.8, 364, 0), 17);
  const behind = stageCruiser(police.placeUnit(172.2, 340, 0), 21);
  shoulder.car.headlightPool.visible = false;
  behind.car.headlightPool.visible = false;

  // Traffic down the avenue, moving in both lanes: a queue of headlights coming up toward the
  // camera and tail lights going away from it.
  const [a, b, c, d, e, f] = traffic.cars;
  placeTraffic(a, 172.2, 355, 0);
  placeTraffic(b, 163.8, 346, Math.PI);
  placeTraffic(c, 172.2, 321, 0);
  placeTraffic(d, 163.8, 328, Math.PI);
  placeTraffic(e, 172.2, 305, 0);
  placeTraffic(f, 163.8, 310, Math.PI);
  a.speed = 13;
  b.speed = 11;
  c.speed = 15;
  d.speed = 12;
  e.speed = 16;
  f.speed = 10;

  // Walkers on the pavement the camera can see, so the street has people on it and not only cars.
  // The three lightest coats are picked out of the crowd: a dark coat on a dark pavement at this
  // distance is a smudge, and the point of the frame is that the street is not empty.
  const walkers = [...traffic.peds]
    .sort((first, second) => coatLightness(second) - coatLightness(first))
    .slice(0, 3);
  placeWalker(walkers[0], city.blocks[3 * 7 + 6], 177.2, 374);
  placeWalker(walkers[1], city.blocks[3 * 7 + 6], 177.2, 366);
  placeWalker(walkers[2], city.blocks[3 * 7 + 6], 177.2, 356);

  // Low over the avenue, looking north into the towers: the title sits on the dark blocks at the
  // left, the street and its headlights fill the right of the frame.
  cameraRig.yaw = 0;
  cameraRig.pitch = 0.1;
  cameraRig.snapTo(new THREE.Vector3(167, 5.2, 388), new THREE.Vector3(167, 3.8, 320));
  game.camera.fov = 64;
  game.camera.updateProjectionMatrix();
}

/** A cruiser with its roof bar held on in both colours, so a still frame reads as police. */
function stageCruiser(unit, speed = 0) {
  const car = unit.car;
  car.updateLightbar(0.05, true);
  car.lightRed.color.setHex(0xff2b2b);
  car.lightBlue.color.setHex(0x3a7bff);
  for (const halo of car.halos) halo.material.opacity = 0.9;
  car.sirenPool.material.color.setHex(0xff2222);
  car.sirenPool.material.opacity = 0.35;
  car.setHeadlights(true, false);
  car.speed = speed;
  car.syncMesh();
  return unit;
}

/** Put a walker on the pavement of a block, at the point of it nearest (x, z), mid-stride. */
function placeWalker(ped, block, x, z) {
  ped.walkToNearest(block, x, z);
  return ped;
}

/** How light a walker's coat is, so a staged frame can pick the ones that read at a distance. */
function coatLightness(ped) {
  return ped.coatColour.r * 0.3 + ped.coatColour.g * 0.6 + ped.coatColour.b * 0.1;
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

  // Two walkers on the pavement ahead, so the street the character is standing on has people on it.
  traffic.refocus(player.position);
  placeWalker(traffic.peds[0], city.blocks[2 * 7 + 3], 146, 215);
  placeWalker(traffic.peds[1], city.blocks[2 * 7 + 3], 155, 215);

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
  void city;
}

/** Behind the wheel on the avenue: traffic ahead, headlights on the road, the city going past. */
function stageDrive(game) {
  const { city, player, fleet, traffic, cameraRig, missions, state } = game;
  const car = fleet.storyCars[0];
  car.health = 100;
  car.placeAt(238, 275.6, Math.PI / 2);
  fleet.enter(car, player);
  car.speed = 16;

  placeTraffic(traffic.cars[0], 264, 275.6, Math.PI / 2);
  placeTraffic(traffic.cars[1], 290, 275.6, Math.PI / 2);
  placeTraffic(traffic.cars[2], 278, 284.6, -Math.PI / 2);
  traffic.cars[0].speed = 9;
  traffic.cars[1].speed = 11;

  state.money = 1590;
  state.wanted = 1;
  missions.title = 'COLD OPEN';
  missions.text = 'Drive the Tern GT to Marrow Motors';
  missions.marker = { x: city.spots.garage.x, z: city.spots.garage.z };
  missions.markerGroup.position.set(missions.marker.x, 0.5, missions.marker.z);
  missions.markerGroup.visible = true;

  cameraRig.yaw = car.heading + Math.PI;
  cameraRig.pitch = 0.02;
  cameraRig.snapNext = true;
  cameraRig.camera.position.set(car.position.x - 7.4, 3.1, car.position.z + 1.2);
  cameraRig.camera.lookAt(car.position.x + 6, 1.6, car.position.z);
  game.camera.fov = 70;
  game.camera.updateProjectionMatrix();
}

/**
 * The chase: the player's car sideways from a hit, a cruiser alongside with its bar lit, a second
 * closing behind, stars on the HUD, pursuit blips on the minimap and the job still running. The
 * cruiser alongside is placed where the two bodies really are in contact — the same corner test
 * the game runs every step — so the ram in the frame is a ram the physics can resolve.
 */
function stageChase(game) {
  const { city, player, fleet, traffic, police, cameraRig, missions, state, hud } = game;
  hud.hidePrompt = true;
  const car = fleet.storyCars[1];
  car.health = 74;
  // Mid-drift: the nose is stepped out of the line the car is travelling on, the wheels are
  // turned into the slide, and the cruiser that caused it is still alongside.
  car.placeAt(206, 275.4, -Math.PI / 2 + 0.72);
  fleet.enter(car, player);
  car.speed = 20;
  car.slip = -6;
  car.steer = -0.9;
  car.syncMesh();
  car.enableEffects();
  // A drift leaves a smear of tyre smoke behind the car; lay the trail along the line it came in on.
  for (let i = 1; i <= 9; i += 1) {
    const t = i / 9;
    car.smoke.emit(
      car.position.x + 1.2 + t * 4.2,
      0.6 + t * 1.2,
      car.position.z + 0.8 + t * 0.7,
      4,
      -1,
      1.7 - t * 0.8,
    );
  }
  car.smoke.update(0.02);

  state.money = 1990;
  state.wanted = 3;
  police.clearAll();

  const rammer = police.placeUnit(204.95, 278.25, -Math.PI / 2 + 0.28);
  rammer.ramCooldown = 0.55;
  rammer.rams = 2;
  police.placeUnit(190, 275.4, -Math.PI / 2 + 0.05);
  police.placeUnit(182, 284.6, Math.PI / 2);
  for (const unit of police.units) {
    unit.car.updateLightbar(0.05, true);
    // Hold the bar in both colours for the still: red and blue together read as police at a glance.
    unit.car.lightRed.color.setHex(0xff2b2b);
    unit.car.lightBlue.color.setHex(0x3a7bff);
    for (const halo of unit.car.halos) halo.material.opacity = 0.9;
    unit.car.sirenPool.material.color.setHex(0xff2222);
    unit.car.sirenPool.material.opacity = 0.35;
    unit.car.setHeadlights(true, false);
    unit.car.speed = 22;
  }
  // The cruiser alongside is close enough; its headlight pool would only wash the frame out.
  police.units[0].car.headlightPool.visible = false;
  police.sirenOn = true;

  placeTraffic(traffic.cars[0], 232, 271.6, Math.PI / 2);
  placeTraffic(traffic.cars[1], 168, 279.6, -Math.PI / 2);

  missions.title = 'BAD DEBTS';
  missions.text = 'Get back to The Drowned Lamp';
  missions.marker = { x: city.spots.bar.x, z: city.spots.bar.z };
  missions.markerGroup.position.set(missions.marker.x, 0.5, missions.marker.z);
  missions.markerGroup.visible = true;

  // Behind and to the left of the player, so the drifting car and the cruiser beside it both fill
  // the frame, with the third unit's headlights coming the other way.
  cameraRig.yaw = -Math.PI / 2;
  cameraRig.pitch = 0.12;
  cameraRig.snapTo(new THREE.Vector3(215.4, 3.9, 271.2), new THREE.Vector3(200, 1.5, 277));
  game.camera.fov = 66;
  game.camera.updateProjectionMatrix();
  void city;
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
