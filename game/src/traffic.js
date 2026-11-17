// The city's other people: AI cars that keep to their lane and follow the grid, and
// pedestrians who loop their block's sidewalk, dodge traffic, and scatter when a gun
// goes off. Traffic borrows the same car body and steering as the player's.



import * as THREE from '../vendor/three.min.js';
import { GeometryBuilder, linear, makeShadowBlob } from './geometry.js';
import { CAR_SPECS } from './vehicles.js';

const PED_COATS = [0x3e5470, 0x6a3a3a, 0x3a6448, 0x555560, 0x7a6440, 0x3a3a6a, 0x644e78];
const PED_SKIN = [0xc08a68, 0x8a5a3a, 0xe0b090, 0x6a4028, 0xb07a5a];
const PED_PANTS = [0x1a1e26, 0x22262e, 0x2a2622, 0x1c2228];

const TRAFFIC_TYPES = ['sedan', 'sedan', 'taxi', 'van', 'sports', 'pickup'];

function buildPedestrian(rng) {
  const group = new THREE.Group();
  const coat = linear(PED_COATS[rng.int(0, PED_COATS.length - 1)]);
  const skin = linear(PED_SKIN[rng.int(0, PED_SKIN.length - 1)]);
  const pants = linear(PED_PANTS[rng.int(0, PED_PANTS.length - 1)]);
  const scale = rng.float(0.92, 1.08);

  const upper = new GeometryBuilder();
  upper.addBox(0, 1.28, 0, 0.46, 0.56, 0.26, coat, { skipBottom: true });
  upper.addBox(0, 1.72, 0, 0.25, 0.28, 0.25, skin, { skipBottom: true });
  upper.addBox(0, 1.86, -0.01, 0.27, 0.12, 0.27, linear(0x14100f), { skipBottom: true });
  upper.addBox(-0.3, 1.34, 0, 0.12, 0.5, 0.14, coat, { skipBottom: true });
  upper.addBox(0.3, 1.34, 0, 0.12, 0.5, 0.14, coat, { skipBottom: true });

  const upperMesh = new THREE.Mesh(upper.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  group.add(upperMesh);

  const legMaterial = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const legs = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12, 0.86, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.82, 0.18), legMaterial);
    leg.position.y = -0.41;
    pivot.add(leg);
    group.add(pivot);
    legs.push(pivot);
  }

  const shadow = makeShadowBlob(1.1, 1.1, 0.7);
  group.add(shadow);
  group.scale.setScalar(scale);
  return { group, legs, upperMesh };
}

function perimeterPoint(block, inset, distance) {
  const x0 = block.x0 + inset;
  const x1 = block.x1 - inset;
  const z0 = block.z0 + inset;
  const z1 = block.z1 - inset;
  const w = x1 - x0;
  const d = z1 - z0;
  const perimeter = 2 * (w + d);
  let t = ((distance % perimeter) + perimeter) % perimeter;
  if (t < w) return { x: x0 + t, z: z0, heading: Math.PI / 2 };
  t -= w;
  if (t < d) return { x: x1, z: z0 + t, heading: 0 };
  t -= d;
  if (t < w) return { x: x1 - t, z: z1, heading: -Math.PI / 2 };
  t -= w;
  return { x: x0, z: z1 - t, heading: Math.PI };
}

export function createTraffic(scene, city, state, vehicles, rng) {
  const pedestrians = [];
  const aiCars = [];



  const spawnPedestrian = (block = null) => {
    const chosen = block ?? city.blocks[rng.int(0, city.blocks.length - 1)];
    if (!chosen) return null;
    const model = buildPedestrian(rng);
    scene.add(model.group);
    const ped = {
      ...model,
      block: chosen,
      position: new THREE.Vector3(),
      heading: 0,
      distance: rng.float(0, 120),
      dir: rng.chance(0.5) ? 1 : -1,
      speed: rng.float(1.05, 1.55),
      fleeing: 0,
      down: 0,
      downTimer: 0,
      bob: rng.float(0, 6),
      alive: true,
      kind: 'ped',
      radius: 0.45,
    };
    const start = perimeterPoint(chosen, 2.3, ped.distance);
    ped.position.set(start.x, city.groundHeight(start.x, start.z), start.z);
    ped.heading = start.heading;
    pedestrians.push(ped);
    return ped;
  };

  for (let i = 0; i < 26; i += 1) spawnPedestrian();

  const knockDown = (ped, byCar) => {
    if (!ped.alive) return;
    ped.alive = false;
    ped.down = 1;
    ped.downTimer = 9;
    ped.group.rotation.z = Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1);
    ped.group.position.y = ped.position.y + 0.2;
    state.bus.emit('pedDown', { ped, byCar, x: ped.position.x, z: ped.position.z });
  };

  const fleeFrom = (x, z, radius = 30) => {
    for (const ped of pedestrians) {
      if (!ped.alive) continue;
      const distance = Math.hypot(ped.position.x - x, ped.position.z - z);
      if (distance < radius) {
        ped.fleeing = Math.max(ped.fleeing, 3.2 + Math.random() * 2);
        ped.fleeHeading = Math.atan2(ped.position.x - x, ped.position.z - z);
        ped.speed = 4.6 + Math.random() * 1.6;
      }
    }
  };

  state.bus.on('gunshot', ({ x, z }) => fleeFrom(x, z, 34));
  state.bus.on('siren', ({ x, z }) => fleeFrom(x, z, 12));

  const updatePedestrians = (dt) => {
    for (const ped of pedestrians) {
      if (!ped.alive) {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {

          ped.alive = true;
          ped.group.rotation.z = 0;
          ped.block = city.blocks[rng.int(0, city.blocks.length - 1)];
          ped.distance = rng.float(0, 100);
          const spot = perimeterPoint(ped.block, 2.3, ped.distance);
          ped.position.set(spot.x, city.groundHeight(spot.x, spot.z), spot.z);
        }
        continue;
      }

      if (ped.fleeing > 0) {
        ped.fleeing -= dt;
        const dx = Math.sin(ped.fleeHeading);
        const dz = Math.cos(ped.fleeHeading);
        ped.position.x += dx * ped.speed * dt;
        ped.position.z += dz * ped.speed * dt;
        ped.heading = ped.fleeHeading;
        const resolved = city.resolveCollision(ped.position.x, ped.position.z, ped.radius);
        if (resolved.blocked) {
          ped.position.x = resolved.x;
          ped.position.z = resolved.z;
          ped.fleeHeading += Math.PI * 0.5;
        }
        if (ped.position.z > city.waterZ - 6) ped.fleeHeading = Math.PI;
        ped.position.y = city.groundHeight(ped.position.x, ped.position.z);
        ped.legs[0].rotation.x = Math.sin(ped.bob + performance.now() * 0.02) * 0.9;
        ped.legs[1].rotation.x = -ped.legs[0].rotation.x;
        if (ped.fleeing <= 0) {

          let best = city.blocks[0];
          let bestDistance = Infinity;
          for (const block of city.blocks) {
            const d = Math.hypot(block.cx - ped.position.x, block.cz - ped.position.z);
            if (d < bestDistance) { bestDistance = d; best = block; }
          }
          ped.block = best;
          ped.speed = 1.3;
          ped.distance = 0;
        }
      } else {
        ped.distance += ped.speed * ped.dir * dt;
        const spot = perimeterPoint(ped.block, 2.3, ped.distance);
        ped.position.x += (spot.x - ped.position.x) * Math.min(1, dt * 6);
        ped.position.z += (spot.z - ped.position.z) * Math.min(1, dt * 6);
        ped.position.y = city.groundHeight(ped.position.x, ped.position.z);
        let delta = spot.heading + (ped.dir < 0 ? Math.PI : 0) - ped.heading;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        ped.heading += delta * Math.min(1, dt * 5);
        ped.bob += dt * ped.speed * 5;
        ped.legs[0].rotation.x = Math.sin(ped.bob) * 0.55;
        ped.legs[1].rotation.x = -ped.legs[0].rotation.x;
      }

      ped.group.position.copy(ped.position);
      ped.group.rotation.y = ped.heading;
      ped.group.rotation.z = 0;
      ped.upperMesh.position.y = Math.abs(Math.sin(ped.bob)) * 0.03;
    }
  };



  const roadCentersX = city.roadX;
  const roadCentersZ = city.roadZ;



  const laneTarget = (axis, dir, along, road) => {
    const offset = 3.6;
    if (axis === 'z') return { x: road - offset * dir, z: along };
    return { x: along, z: road + offset * dir };
  };

  const nearestRoadCentre = (axis, value) => {
    const centres = axis === 'x' ? roadCentersZ : roadCentersX;
    let best = centres[0];
    for (const centre of centres) {
      if (Math.abs(centre - value) < Math.abs(best - value)) best = centre;
    }
    return best;
  };

  const pickNextTarget = (car) => {
    const route = car.route;
    const turn = rng.chance(0.4);
    const nextAxis = turn ? (route.axis === 'z' ? 'x' : 'z') : route.axis;
    const nextDir = turn ? (rng.chance(0.5) ? 1 : -1) : route.dir;


    const fallbackRoad = nearestRoadCentre(route.axis, route.axis === 'x' ? car.position.z : car.position.x);
    const road = turn
      ? (route.axis === 'z' ? car.target.z : car.target.x)
      : (Number.isFinite(car.roadCoord) ? car.roadCoord : fallbackRoad);

    const along = nextAxis === 'x' ? roadCentersX : roadCentersZ;
    const current = nextAxis === 'x' ? car.position.x : car.position.z;
    let value = null;
    let bestDistance = Infinity;
    for (const centre of along) {
      const delta = (centre - current) * nextDir;
      if (delta > 2 && delta < bestDistance) {
        bestDistance = delta;
        value = centre;
      }
    }
    if (value === null) {

      car.route = { axis: nextAxis, dir: -nextDir };
      car.roadCoord = road;
      const backwards = nextAxis === 'x' ? roadCentersX : roadCentersZ;
      const behind = backwards.filter((centre) => (centre - current) * -nextDir > 2);
      const pick = behind.length ? behind[0] : backwards[backwards.length - 1];
      car.target = laneTarget(nextAxis, -nextDir, pick, road);
      return;
    }
    car.route = { axis: nextAxis, dir: nextDir };
    car.roadCoord = road;
    car.target = laneTarget(nextAxis, nextDir, value, road);
  };

  const spawnAiCar = (type = null, at = null) => {
    const carType = type ?? TRAFFIC_TYPES[rng.int(0, TRAFFIC_TYPES.length - 1)];
    const spot = at ?? city.randomSpawn(rng);
    const alongZ = rng.chance(0.5);
    const car = vehicles.spawn(carType, spot.x, spot.z, spot.heading, {
      color: [0x8a1f2c, 0x1f3c5a, 0x2d4a3a, 0x4a4a52, 0x6a5a3a, 0x5a2a4a, 0x1c2430][rng.int(0, 6)],
    });
    car.driver = 'ai';
    car.speed = rng.float(7, 12);
    const axis = Math.abs(Math.sin(spot.heading)) > 0.5 ? 'x' : 'z';
    const dir = Math.cos(spot.heading) > 0.2 || Math.sin(spot.heading) > 0.2 ? 1 : -1;
    const roadCoord = nearestRoadCentre(axis, axis === 'x' ? spot.z : spot.x);
    car.route = { axis, dir };
    car.roadCoord = roadCoord;

    const along = axis === 'x' ? roadCentersX : roadCentersZ;
    const current = axis === 'x' ? spot.x : spot.z;
    let target = null;
    for (const value of along) {
      const delta = (value - current) * dir;
      if (delta > 4) { target = value; break; }
    }
    const aim = target ?? current + 40 * dir;
    car.target = laneTarget(axis, dir, aim, roadCoord);
    aiCars.push(car);
    return car;
  };

  for (let i = 0; i < 16; i += 1) {
    let attempts = 0;
    let spot = null;
    do {
      spot = city.randomSpawn(rng);
      attempts += 1;
    } while (attempts < 20 && aiCars.some((car) => Math.hypot(car.position.x - spot.x, car.position.z - spot.z) < 14));
    spawnAiCar(null, spot);
  }

  const updateTraffic = (dt, playerPosition) => {
    for (const car of aiCars) {
      if (car.driver !== 'ai') continue;
      if (!car.target) continue;
      const dx = car.target.x - car.position.x;
      const dz = car.target.z - car.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 3.5) {
        pickNextTarget(car);
      }

      const desiredHeading = Math.atan2(dx, dz);
      let delta = desiredHeading - car.heading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;


      const turnRate = 2.7;
      car.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, delta));


      let desiredSpeed = Math.min(CAR_SPECS[car.type].maxSpeed * 0.45, 13);
      for (const other of vehicles.cars) {
        if (other === car) continue;
        const ox = other.position.x - car.position.x;
        const oz = other.position.z - car.position.z;
        const forward = ox * Math.sin(car.heading) + oz * Math.cos(car.heading);
        const lateral = Math.abs(ox * Math.cos(car.heading) - oz * Math.sin(car.heading));
        if (forward > 0 && forward < 11 && lateral < 2.2) {
          desiredSpeed = Math.min(desiredSpeed, Math.max(0, (forward - 3.5) * 1.6));
        }
      }
      for (const ped of pedestrians) {
        if (!ped.alive) continue;
        const ox = ped.position.x - car.position.x;
        const oz = ped.position.z - car.position.z;
        const forward = ox * Math.sin(car.heading) + oz * Math.cos(car.heading);
        const lateral = Math.abs(ox * Math.cos(car.heading) - oz * Math.sin(car.heading));
        if (forward > 0 && forward < 8 && lateral < 1.6) {
          desiredSpeed = Math.min(desiredSpeed, 0.5);

          if (car.speed > 6 && forward < 2.2) {
            knockDown(ped, car);
            state.bus.emit('crime', { kind: 'hitAndRun', x: ped.position.x, z: ped.position.z });
          }
        }
      }
      if (Math.abs(delta) > 0.22) desiredSpeed = Math.min(desiredSpeed, Math.max(4.5, 13 - Math.abs(delta) * 9));

      car.speed += (desiredSpeed - car.speed) * Math.min(1, dt * 2.2);
      car.brakeLight = desiredSpeed < car.speed - 0.5;
      car.step(dt, vehicles.cars);


      if (Math.abs(car.speed) < 0.6) car.stuckTimer += dt;
      else car.stuckTimer = 0;
      if (car.stuckTimer > 4) {
        const spot = city.randomSpawn(rng, playerPosition, 60);
        car.position.set(spot.x, 0, spot.z);
        car.heading = spot.heading;
        car.speed = 8;
        car.stuckTimer = 0;
        const newAxis = Math.abs(Math.sin(spot.heading)) > 0.5 ? 'x' : 'z';
        const newRoad = nearestRoadCentre(newAxis, newAxis === 'x' ? spot.z : spot.x);
        car.route = { axis: newAxis, dir: 1 };
        car.roadCoord = newRoad;
        car.target = laneTarget(newAxis, 1, (newAxis === 'x' ? spot.x : spot.z) + 40, newRoad);
      }
    }


    const playerCar = vehicles.playerCar;
    if (playerCar && Math.abs(playerCar.speed) > 4) {
      for (const ped of pedestrians) {
        if (!ped.alive) continue;
        const distance = Math.hypot(ped.position.x - playerCar.position.x, ped.position.z - playerCar.position.z);
        if (distance < 2.4) {
          knockDown(ped, playerCar);
          state.bus.emit('crime', { kind: 'hitAndRun', x: ped.position.x, z: ped.position.z });
          playerCar.speed *= 0.85;
        }
      }
    }
  };

  const clearAiCars = () => {
    for (const car of aiCars.slice()) vehicles.remove(car);
    aiCars.length = 0;
  };


  const spawnPedestrianNear = (x, z) => {
    let best = city.blocks[0];
    let bestDistance = Infinity;
    for (const block of city.blocks) {
      const distance = Math.hypot(block.cx - x, block.cz - z);
      if (distance < bestDistance) { bestDistance = distance; best = block; }
    }
    const ped = spawnPedestrian(best);
    if (!ped) return null;
    let bestT = 0;
    let bestPointDistance = Infinity;
    for (let i = 0; i < 200; i += 1) {
      const t = (i / 200) * 160;
      const point = perimeterPoint(best, 2.3, t);
      const distance = Math.hypot(point.x - x, point.z - z);
      if (distance < bestPointDistance) { bestPointDistance = distance; bestT = t; }
    }
    ped.distance = bestT;
    const point = perimeterPoint(best, 2.3, bestT);
    ped.position.set(point.x, city.groundHeight(point.x, point.z), point.z);
    ped.group.position.copy(ped.position);
    return ped;
  };

  return {
    pedestrians,
    aiCars,
    spawnPedestrianNear,
    update(dt, playerPosition) {
      updatePedestrians(dt);
      updateTraffic(dt, playerPosition);
    },
    spawnPedestrian,
    spawnAiCar,
    knockDown,
    fleeFrom,
    clearAiCars,
  };
}
