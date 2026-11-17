// The wanted level and the people who answer it. Crimes raise it, cruisers spawn out
// of sight and chase, officers get out and shoot, and the level cools down once the
// player has actually lost them.



import * as THREE from '../vendor/three.min.js';
import { GeometryBuilder, linear, makeGlowTexture, makeShadowBlob } from './geometry.js';
import { damagePlayer } from './state.js';

const CRIME_STARS = {
  gunfire: 1,
  carTheft: 1,
  hitAndRun: 2,
  murder: 3,
  officerDown: 3,
  ramming: 1,
  trespass: 1,
};

const MAX_CRUISERS = 4;
const DECAY_DELAY = 16;
const ESCAPE_DISTANCE = 85;

function buildOfficer() {
  const group = new THREE.Group();
  const navy = linear(0x1b2740);
  const dark = linear(0x0e131c);
  const skin = linear(0xc08a68);
  const badge = linear(0xd8c070);

  const upper = new GeometryBuilder();
  upper.addBox(0, 1.3, 0, 0.48, 0.6, 0.28, navy, { skipBottom: true });
  upper.addBox(0, 1.55, 0, 0.5, 0.16, 0.3, dark, { skipBottom: true });
  upper.addBox(0, 1.76, 0, 0.26, 0.3, 0.26, skin, { skipBottom: true });
  upper.addBox(0, 1.93, 0, 0.3, 0.12, 0.3, dark, { skipBottom: true });
  upper.addBox(0, 1.9, 0.16, 0.28, 0.04, 0.12, dark, { skipBottom: true });
  upper.addBox(-0.08, 1.36, 0.15, 0.08, 0.1, 0.03, badge, { skipBottom: true });
  upper.addBox(-0.32, 1.34, 0, 0.12, 0.52, 0.14, navy, { skipBottom: true });
  upper.addBox(0.32, 1.34, 0, 0.12, 0.52, 0.14, navy, { skipBottom: true });
  group.add(new THREE.Mesh(upper.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));

  const legMaterial = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.9 });
  const legs = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.13, 0.88, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.86, 0.19), legMaterial);
    leg.position.y = -0.43;
    pivot.add(leg);
    group.add(pivot);
    legs.push(pivot);
  }
  group.add(makeShadowBlob(1.2, 1.2, 0.8));
  return { group, legs };
}

export function createPolice(scene, city, state, vehicles, traffic, player, cameraRig) {
  const cruisers = [];
  const officers = [];
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('rgba(255,240,210,1)', 'rgba(255,160,60,0)'),
    color: linear(0xffd08a), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
  }));
  flash.scale.set(2.2, 2.2, 1);
  scene.add(flash);
  let flashLife = 0;

  state.decayTimer = 0;
  state.lastCrimeAt = -999;

  const reportCrime = (kind, x, z) => {
    const stars = CRIME_STARS[kind] ?? 1;
    const before = state.wanted;
    state.wanted = Math.min(5, state.wanted + stars);
    state.decayTimer = DECAY_DELAY;
    state.lastCrimeAt = performance.now() / 1000;
    state.stats.crimes += 1;
    if (state.wanted > before) {
      state.bus.emit('wantedUp', { level: state.wanted, kind });
    }
  };

  state.bus.on('crime', ({ kind, x, z }) => reportCrime(kind, x, z));
  state.bus.on('playerDown', () => {
    state.wanted = 0;
    state.decayTimer = 0;
  });

  const spawnCruiser = () => {
    const playerPosition = player.position;
    const candidates = city.roadNodes.filter((node) => {
      const distance = Math.hypot(node.x - playerPosition.x, node.z - playerPosition.z);
      return distance > 95 && distance < 260;
    });
    const node = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : city.roadNodes[Math.floor(Math.random() * city.roadNodes.length)];
    const car = vehicles.spawn('police', node.x + 3, node.z, 0, { color: 0xd6dbe2 });
    car.driver = 'police';
    car.speed = 12;
    car.route = null;
    car.stuckTimer = 0;
    car.reverseTimer = 0;
    car.fireTimer = 1 + Math.random();
    cruisers.push(car);
    return car;
  };

  const spawnOfficer = (x, z) => {
    const model = buildOfficer();
    scene.add(model.group);
    const officer = {
      ...model,
      position: new THREE.Vector3(x, city.groundHeight(x, z), z),
      heading: 0,
      speed: 0,
      alive: true,
      health: 70,
      fireTimer: 0.8 + Math.random() * 0.6,
      bob: 0,
      radius: 0.45,
      kind: 'officer',
    };
    officers.push(officer);
    return officer;
  };

  const hurtOfficer = (officer, amount) => {
    if (!officer.alive) return;
    officer.health -= amount;
    if (officer.health <= 0) {
      officer.alive = false;
      officer.group.rotation.z = Math.PI / 2;
      officer.group.position.y = officer.position.y + 0.2;
      state.wanted = Math.min(5, state.wanted + 2);
      state.decayTimer = DECAY_DELAY;
      state.stats.takedowns += 1;
      state.bus.emit('wantedUp', { level: state.wanted, kind: 'officerDown' });
    }
  };

  const shootAtPlayer = (from, damage) => {
    const dx = player.position.x - from.x;
    const dz = player.position.z - from.z;
    const dy = player.position.y + 1.1 - from.y;
    const distance = Math.hypot(dx, dy, dz);
    const accuracy = Math.max(0.18, 0.62 - distance * 0.008);
    flash.position.copy(from);
    flashLife = 0.08;
    state.bus.emit('policeShot', { x: from.x, z: from.z });
    if (Math.random() < accuracy) {
      damagePlayer(state, damage, 'police');
      state.bus.emit('playerHit', { amount: damage, source: 'police' });
      cameraRig.addShake(0.22);
    }
  };

  const clearAll = () => {
    for (const car of cruisers.slice()) vehicles.remove(car);
    cruisers.length = 0;
    for (const officer of officers) scene.remove(officer.group);
    officers.length = 0;
  };

  const update = (dt) => {
    const now = performance.now() / 1000;


    const nearestCopDistance = () => {
      let nearest = Infinity;
      for (const car of cruisers) nearest = Math.min(nearest, Math.hypot(car.position.x - player.position.x, car.position.z - player.position.z));
      for (const officer of officers) {
        if (officer.alive) nearest = Math.min(nearest, Math.hypot(officer.position.x - player.position.x, officer.position.z - player.position.z));
      }
      return nearest;
    };

    if (state.wanted > 0) {
      const distance = nearestCopDistance();
      if (now - state.lastCrimeAt > 5 && distance > ESCAPE_DISTANCE) {
        if (state.decayTimer <= 0) state.decayTimer = 5;
        state.decayTimer -= dt;
        if (state.decayTimer <= 0) {
          state.wanted -= 1;
          state.decayTimer = 9;
          state.bus.emit('wantedDown', { level: state.wanted });
          if (state.wanted <= 0) {
            state.wanted = 0;
            clearAll();
          }
        }
      } else if (now - state.lastCrimeAt > 5 && distance > 35) {

        state.decayTimer = Math.min(state.decayTimer, DECAY_DELAY);
      }
    }


    const wantedCruisers = Math.min(MAX_CRUISERS, state.wanted);
    while (cruisers.length < wantedCruisers) spawnCruiser();
    while (cruisers.length > wantedCruisers) {
      const car = cruisers.pop();
      vehicles.remove(car);
    }


    const wantedOfficers = state.wanted >= 2 ? Math.min(4, state.wanted - 1) : 0;
    if (officers.filter((officer) => officer.alive).length < wantedOfficers) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 45 + Math.random() * 35;
      const x = player.position.x + Math.cos(angle) * distance;
      const z = player.position.z + Math.sin(angle) * distance;
      const resolved = city.resolveCollision(x, z, 0.6);
      if (city.isRoad(resolved.x, resolved.z) || city.groundHeight(resolved.x, resolved.z) > 0) {
        spawnOfficer(resolved.x, resolved.z);
      }
    }


    for (const car of cruisers) {
      const dx = player.position.x - car.position.x;
      const dz = player.position.z - car.position.z;
      const distance = Math.hypot(dx, dz);
      const desiredHeading = Math.atan2(dx, dz);
      let delta = desiredHeading - car.heading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;

      car.reverseTimer = Math.max(0, car.reverseTimer - dt);
      const wantsReverse = car.reverseTimer > 0;

      if (!wantsReverse) {
        const turn = Math.max(-2.1 * dt, Math.min(2.1 * dt, delta));
        car.heading += turn;
        let targetSpeed = distance > 26 ? 24 + state.wanted * 1.5 : distance > 10 ? 12 : 0;
        if (state.inCar && distance < 40) targetSpeed = 30;
        car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.8);
        if (car.speed < 1.2 && distance > 25) {
          car.stuckTimer += dt;
          if (car.stuckTimer > 2) {
            car.stuckTimer = 0;
            car.reverseTimer = 1.1;
            car.heading += (Math.random() - 0.5) * 1.2;
          }
        } else {
          car.stuckTimer = Math.max(0, car.stuckTimer - dt * 0.5);
        }
      } else {
        car.speed += (-8 - car.speed) * Math.min(1, dt * 3);
      }
      car.step(dt, vehicles.cars);


      car.fireTimer -= dt;
      if (distance < 34 && car.fireTimer <= 0 && state.mode === 'play') {
        car.fireTimer = 1.5 + Math.random() * 0.7;
        shootAtPlayer({ x: car.position.x, y: car.position.y + 1.2, z: car.position.z }, 5 + state.wanted);
      }


      if (distance < 2.8 && Math.abs(car.speed) > 7 && !state.inCar) {
        damagePlayer(state, 9, 'ram');
        cameraRig.addShake(0.4);
      }
    }


    for (const officer of officers) {
      if (!officer.alive) continue;
      const dx = player.position.x - officer.position.x;
      const dz = player.position.z - officer.position.z;
      const distance = Math.hypot(dx, dz);
      const heading = Math.atan2(dx, dz);
      let delta = heading - officer.heading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      officer.heading += delta * Math.min(1, dt * 8);

      if (distance > 12) {
        const step = 4.2 * dt;
        officer.position.x += (dx / distance) * step;
        officer.position.z += (dz / distance) * step;
        const resolved = city.resolveCollision(officer.position.x, officer.position.z, officer.radius);
        officer.position.x = resolved.x;
        officer.position.z = resolved.z;
        officer.bob += dt * 9;
        officer.legs[0].rotation.x = Math.sin(officer.bob) * 0.7;
        officer.legs[1].rotation.x = -officer.legs[0].rotation.x;
      } else {
        officer.legs[0].rotation.x = 0;
        officer.legs[1].rotation.x = 0;
      }
      officer.position.y = city.groundHeight(officer.position.x, officer.position.z);
      officer.group.position.copy(officer.position);
      officer.group.rotation.y = officer.heading;

      officer.fireTimer -= dt;
      if (distance < 30 && officer.fireTimer <= 0 && state.mode === 'play') {
        officer.fireTimer = 1.1 + Math.random() * 0.8;
        shootAtPlayer({ x: officer.position.x, y: officer.position.y + 1.4, z: officer.position.z }, 6 + state.wanted);
      }
    }


    if (state.wanted > 0 && state.mode === 'play') {
      state.sirenTimer = (state.sirenTimer ?? 0) - dt;
      if (state.sirenTimer <= 0) {
        state.sirenTimer = 1.6;
        let nearest = null;
        for (const car of cruisers) {
          if (!nearest || Math.hypot(car.position.x - player.position.x, car.position.z - player.position.z) <
            Math.hypot(nearest.position.x - player.position.x, nearest.position.z - player.position.z)) nearest = car;
        }
        if (nearest) state.bus.emit('siren', { x: nearest.position.x, z: nearest.position.z });
      }
    }

    if (flashLife > 0) {
      flashLife -= dt;
      flash.material.opacity = Math.max(0, flashLife / 0.08);
    } else {
      flash.material.opacity = 0;
    }
  };

  return {
    cruisers,
    officers,
    spawnOfficer,
    update,
    reportCrime,
    hurtOfficer,
    clearAll,
    get wanted() {
      return state.wanted;
    },
  };
}
