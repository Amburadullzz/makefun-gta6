// The life on the streets: traffic that follows the grid, turning at intersections and braking
// for whatever is in front of it, and pedestrians who walk the pavements and run when a gun goes
// off or a car comes at them. Both are kept at a fixed count in a ring around the player: a body
// that falls too far behind is put back into the ring ahead, so the street is always busy and the
// simulation never grows past the count it started with. Every traffic car and every walker is
// drawn from the instanced layer, so a busy street costs a handful of draw calls, not hundreds.
import * as THREE from '../vendor/three.min.js';
import { CAR_MODELS, Vehicle } from './vehicles.js';
import { GRID, PITCH, PROMENADE_X } from './city.js';
import { CarInstances, CrowdInstances } from './instancing.js';

const LANE = 4.2;
const TRAFFIC_MODELS = ['sedan', 'sedan', 'van', 'pickup', 'coupe', 'sedan', 'sports', 'van'];
const COAT_COLOURS = [0x38404c, 0x5a3b3b, 0x2f4a3f, 0x4a4468, 0x6a5a3a, 0x2b2f36, 0x7a6a5a, 0x9a6a4a, 0x8a4a52, 0x6f7c8c];
const SKIN_TONES = [0xc79a76, 0x8d6448, 0x5e4030, 0xe0b592, 0x6f4a34];
const HAT_COLOURS = [0x1c1f24, 0x3a2b2b, 0x2a3a4a];

const TRAFFIC_COUNT = 26;      // cars on the street at once, whatever the frame rate
const PED_COUNT = 44;          // walkers on the pavement at once
const CAR_SPAWN_NEAR = 55;     // m: the ring traffic is put back into, around the player
const CAR_SPAWN_FAR = 130;
const CAR_RECYCLE_AT = 165;    // m: past this a car is recycled back into the ring
const PED_SPAWN_NEAR = 45;
const PED_SPAWN_FAR = 120;
const PED_RECYCLE_AT = 150;

export class Traffic {
  constructor(scene, city, rng, fleet, player = null) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.fleet = fleet;
    this.cars = [];
    this.peds = [];
    this.time = 0;
    this.player = player;
    this.focus = player && player.position ? { x: player.position.x, z: player.position.z } : { x: 196, z: 196 };

    // The instanced layer draws every traffic car and every walker; see instancing.js.
    this.carInstances = new CarInstances(scene, TRAFFIC_COUNT + 4);
    this.crowdInstances = new CrowdInstances(scene, PED_COUNT + 4);

    this.spawnTrafficCars(TRAFFIC_COUNT, this.focus);
    this.spawnPedestrians(PED_COUNT, this.focus);
    this.syncInstances();
  }

  // ---------------------------------------------------------------- traffic

  spawnTrafficCars(count, focus) {
    for (let i = 0; i < count; i += 1) {
      const spot = this.ringRoadPoint(focus, 24, CAR_SPAWN_FAR) ?? this.ringRoadPoint(focus, 24, 400);
      if (!spot) break;
      const modelKey = this.rng.pick(TRAFFIC_MODELS);
      const car = new Vehicle(this.scene, this.city, modelKey, {
        x: spot.x,
        z: spot.z,
        heading: spot.heading,
        colour: this.rng.pick(CAR_MODELS[modelKey].colours),
      });
      car.placeAt(spot.x, spot.z, spot.heading);
      car.ai = {
        node: this.city.nearestNode(spot.x, spot.z),
        target: null,
        cruise: this.rng.range(9, 15),
        patience: 0,
        stuckFor: 0,
      };
      car.setHeadlights(true, false);
      this.pickNextNode(car);
      car.hideForInstancing();
      this.carInstances.add(car);
      this.cars.push(car);
    }
  }

  /**
   * A point on a road at a random bearing and distance from the focus: where a car enters the
   * world when the ring is filled in or refilled. Heading follows the lane it lands in.
   */
  ringRoadPoint(focus, minRadius, maxRadius) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(minRadius, maxRadius);
      const rawX = focus.x + Math.cos(angle) * radius;
      const rawZ = focus.z + Math.sin(angle) * radius;
      const horizontal = this.rng.chance(0.5);
      const lane = this.rng.chance(0.5) ? 4 : -4;
      const ix = clamp(Math.round(rawX / PITCH), 0, GRID);
      const iz = clamp(Math.round(rawZ / PITCH), 0, GRID);
      const x = horizontal ? clamp(rawX, 12, PROMENADE_X - 12) : ix * PITCH + lane;
      const z = horizontal ? iz * PITCH + lane : clamp(rawZ, 12, PROMENADE_X - 12);
      const distance = Math.hypot(x - focus.x, z - focus.z);
      if (distance < minRadius * 0.7 || distance > maxRadius * 1.2) continue;
      if (!this.isClear(x, z, 13)) continue;
      const heading = horizontal
        ? (lane > 0 ? -Math.PI / 2 : Math.PI / 2)
        : (lane > 0 ? 0 : Math.PI);
      return { x, z, heading };
    }
    return null;
  }

  /** Nothing else is parked on this bit of road, so a recycled car never lands inside one. */
  isClear(x, z, radius) {
    for (const car of this.cars) {
      if (Math.hypot(car.position.x - x, car.position.z - z) < radius) return false;
    }
    return true;
  }

  /** A car that has fallen behind the player is put back into the ring, at the same count. */
  recycleCars(focus, threshold = CAR_RECYCLE_AT) {
    for (const car of this.cars) {
      const distance = Math.hypot(car.position.x - focus.x, car.position.z - focus.z);
      if (distance < threshold) continue;
      const spot = this.ringRoadPoint(focus, CAR_SPAWN_NEAR, CAR_SPAWN_FAR);
      if (!spot) continue;
      car.placeAt(spot.x, spot.z, spot.heading);
      car.ai.node = this.city.nearestNode(spot.x, spot.z);
      car.ai.target = null;
      car.ai.stuckFor = 0;
      car.speed = car.ai.cruise * 0.5;
      this.pickNextNode(car);
    }
  }

  /**
   * Move the whole ring to a new focus at once: what happens when the player crosses the city and
   * the traffic and the walkers are put back around him, at the same counts as before.
   */
  refocus(focus) {
    this.focus.x = focus.x;
    this.focus.z = focus.z;
    this.recycleCars(this.focus, 120);
    this.recyclePeds(this.focus, 110);
    this.syncInstances();
  }

  /** Choose the next intersection: mostly straight on, sometimes a turn, never back the way we came. */
  pickNextNode(car) {
    const options = car.ai.node.links.filter((node) => {
      const dx = node.x - car.position.x;
      const dz = node.z - car.position.z;
      const forwardX = Math.sin(car.heading);
      const forwardZ = Math.cos(car.heading);
      return dx * forwardX + dz * forwardZ > -1;
    });
    const choices = options.length > 0 ? options : car.ai.node.links;
    car.ai.target = this.rng.pick(choices);
    car.ai.node = car.ai.target;
  }

  /** How far the nearest obstacle ahead of a car is, and how fast that obstacle is going. */
  obstacleAhead(car, ignore) {
    const forwardX = Math.sin(car.heading);
    const forwardZ = Math.cos(car.heading);
    let nearest = 26;
    for (const other of this.cars) {
      if (other === car || other === ignore) continue;
      const dx = other.position.x - car.position.x;
      const dz = other.position.z - car.position.z;
      // A cheap box first: only a car within the look-ahead can be in it.
      if (dx > nearest || dx < -nearest || dz > nearest || dz < -nearest) continue;
      const ahead = dx * forwardX + dz * forwardZ;
      if (ahead < 0.5 || ahead > nearest) continue;
      const lateral = Math.abs(dx * forwardZ - dz * forwardX);
      if (lateral > 2.6) continue;
      nearest = ahead;
    }
    // The player's car counts as an obstacle too, and so does a pedestrian in the road.
    const playerCar = this.fleet.playerCar;
    if (playerCar && playerCar !== car && playerCar !== ignore) {
      const dx = playerCar.position.x - car.position.x;
      const dz = playerCar.position.z - car.position.z;
      const ahead = dx * forwardX + dz * forwardZ;
      const lateral = Math.abs(dx * forwardZ - dz * forwardX);
      if (ahead > 0.5 && ahead < nearest && lateral < 3) nearest = ahead;
    }
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const dx = ped.position.x - car.position.x;
      const dz = ped.position.z - car.position.z;
      if (dx > 14 || dx < -14 || dz > 14 || dz < -14) continue;
      const ahead = dx * forwardX + dz * forwardZ;
      const lateral = Math.abs(dx * forwardZ - dz * forwardX);
      if (ahead > 0.5 && ahead < Math.min(nearest, 14) && lateral < 1.8) nearest = Math.max(2, ahead);
    }
    return nearest;
  }

  updateCar(car, dt) {
    const ai = car.ai;
    if (!ai) return;
    const target = ai.target;
    if (!target) {
      this.pickNextNode(car);
      return;
    }

    // Aim at a point on the right-hand lane of the road to the next intersection.
    const dx = target.x - car.position.x;
    const dz = target.z - car.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 5) {
      this.pickNextNode(car);
      return;
    }
    const desiredHeading = Math.atan2(dx, dz);
    const laneOffset = laneOffsetFor(desiredHeading);
    const aimX = target.x + laneOffset.x;
    const aimZ = target.z + laneOffset.z;
    const aimHeading = Math.atan2(aimX - car.position.x, aimZ - car.position.z);

    let difference = aimHeading - car.heading;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    car.heading += difference * Math.min(1, dt * 3.4);

    const gap = this.obstacleAhead(car);
    let speed = ai.cruise;
    if (gap < 9) speed = Math.max(0, (gap - 3) * 1.6);
    if (gap < 4) speed = 0;

    // If a car has been stuck for a while, let it pick another route rather than sit forever.
    if (speed < 0.4) ai.stuckFor += dt;
    else ai.stuckFor = 0;
    if (ai.stuckFor > 6) {
      this.pickNextNode(car);
      ai.stuckFor = 0;
    }

    car.roll(dt, speed);
    car.updateLightbar(this.time, false);
  }

  /** Hand a traffic car to the player: it stops being AI and becomes a car you own. */
  releaseCar(car) {
    const index = this.cars.indexOf(car);
    if (index === -1) return null;
    this.cars.splice(index, 1);
    car.ai = null;
    car.occupied = false;
    this.carInstances.remove(car);
    car.showForInstancing();
    this.fleet.cars.push(car);
    return car;
  }

  // ---------------------------------------------------------------- pedestrians

  spawnPedestrians(count, focus) {
    for (let i = 0; i < count; i += 1) {
      const block = this.ringBlock(focus, 18, PED_SPAWN_FAR);
      const ped = new Pedestrian(this.scene, this.city, block, this.rng, { instanced: true });
      this.crowdInstances.add(ped);
      this.peds.push(ped);
    }
  }

  /** A block whose pavement is a walk away from the focus, for a walker to be re-homed onto. */
  ringBlock(focus, minRadius, maxRadius) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const block = this.rng.pick(this.city.blocks);
      const cx = (block.x0 + block.x1) / 2;
      const cz = (block.z0 + block.z1) / 2;
      const distance = Math.hypot(cx - focus.x, cz - focus.z);
      if (distance < minRadius || distance > maxRadius) continue;
      return block;
    }
    return this.rng.pick(this.city.blocks);
  }

  /** Walkers who have fallen behind are re-homed; the dead are cleared away and replaced. */
  recyclePeds(focus, threshold = PED_RECYCLE_AT) {
    for (const ped of this.peds) {
      if (ped.dead && ped.deathTimer < 45) continue;
      const block = ped.block;
      const cx = (block.x0 + block.x1) / 2;
      const cz = (block.z0 + block.z1) / 2;
      if (Math.hypot(cx - focus.x, cz - focus.z) < threshold) continue;
      ped.rehome(this.ringBlock(focus, 18, PED_SPAWN_FAR));
    }
  }

  scare(x, z, radius) {
    let scared = 0;
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const distance = Math.hypot(ped.position.x - x, ped.position.z - z);
      if (distance < radius) {
        ped.fleeFrom(x, z);
        scared += 1;
      }
    }
    return scared;
  }

  /** Run over anyone the given car is touching. Returns the pedestrians hit. */
  runOver(car) {
    if (Math.abs(car.speed) < 3.5) return [];
    const hits = [];
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const dx = ped.position.x - car.position.x;
      const dz = ped.position.z - car.position.z;
      if (Math.hypot(dx, dz) > 2.1) continue;
      const forwardX = Math.sin(car.heading);
      const forwardZ = Math.cos(car.heading);
      if (dx * forwardX + dz * forwardZ < -1.2) continue;
      ped.kill('hit');
      hits.push(ped);
    }
    return hits;
  }

  update(dt, player) {
    this.time += dt;
    if (player && player.position) {
      this.focus.x = player.position.x;
      this.focus.z = player.position.z;
    }
    for (const car of this.cars) this.updateCar(car, dt);
    for (const ped of this.peds) ped.update(dt, player);
    if (player && !player.inVehicle) this.separateFromPlayer(player);
    this.recycleCars(this.focus);
    this.recyclePeds(this.focus);
  }

  /** Push the crowd into the instance buffers: one pass, one draw call per body part. */
  syncInstances() {
    this.carInstances.sync();
    this.crowdInstances.sync();
  }

  separateFromPlayer(player) {
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const dx = ped.position.x - player.position.x;
      const dz = ped.position.z - player.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.001 && distance < 0.9) {
        const push = (0.9 - distance) / 2;
        ped.position.x += (dx / distance) * push;
        ped.position.z += (dz / distance) * push;
      }
    }
  }
}

/** One pedestrian: a small box body walking the pavement around a block, or running from trouble. */
class Pedestrian {
  constructor(scene, city, block, rng, options = {}) {
    this.scene = scene;
    this.city = city;
    this.block = block;
    this.rng = rng;
    this.dead = false;
    this.deathTimer = 0;
    this.speed = rng.range(1.1, 1.8);
    this.direction = rng.chance(0.5) ? 1 : -1;
    this.t = rng.range(0, 1);
    this.perimeter = 2 * (block.x1 - block.x0 + block.z1 - block.z0) - 16;
    this.fleeTime = 0;
    this.fleeX = 0;
    this.fleeZ = 0;
    this.phase = rng.range(0, Math.PI * 2);
    this.bob = 0;
    this.legSwing = 0;
    this.position = new THREE.Vector3(0, 0, 0);

    this.coatColour = new THREE.Color(rng.pick(COAT_COLOURS));
    this.skinColour = new THREE.Color(rng.pick(SKIN_TONES));
    this.hatColour = new THREE.Color(rng.pick(HAT_COLOURS));
    this.bagColour = new THREE.Color(0x2a2a2e);
    this.hasHat = rng.chance(0.3);
    this.height = rng.range(0.9, 1.08);
    // The pavement between the kerb and the shopfronts is two metres wide; walkers keep to one
    // side of that line so the two directions pass each other instead of walking through.
    this.laneOffset = rng.range(0.12, 0.32);

    this.instanced = options.instanced !== false;
    this.instancedIndex = -1;
    this.group = null;
    if (!this.instanced) this.build();

    this.updatePerimeterPosition();
    this.t = rng.range(0, this.perimeter);
    this.updatePerimeterPosition();
  }

  /** The meshes a walker owns when it is drawn on its own; the instanced path skips all of this. */
  build() {
    this.group = new THREE.Group();
    this.group.scale.setScalar(this.height);
    this.body = new THREE.Group();
    this.group.add(this.body);

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.6, 0.28),
      new THREE.MeshLambertMaterial({ color: this.coatColour }),
    );
    torso.position.y = 1.24;
    this.body.add(torso);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.28, 0.26),
      new THREE.MeshLambertMaterial({ color: this.skinColour }),
    );
    head.position.y = 1.68;
    this.body.add(head);
    if (this.hasHat) {
      const hat = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.1, 0.3),
        new THREE.MeshLambertMaterial({ color: this.hatColour }),
      );
      hat.position.y = 1.84;
      this.body.add(hat);
    }
    this.legs = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.66, 0.18), new THREE.MeshLambertMaterial({ color: 0x24262c }));
      leg.position.set(side * 0.12, 0.62, 0);
      this.body.add(leg);
      this.legs.push(leg);
    }
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.12), new THREE.MeshLambertMaterial({ color: this.bagColour }));
    bag.position.set(0.28, 1.1, 0.1);
    this.body.add(bag);

    this.scene.add(this.group);
  }

  /** Walk the rectangle of pavement around the block; corners turn automatically. */
  updatePerimeterPosition() {
    const { x0, x1, z0, z1 } = this.block;
    // The pavement is the strip between the kerb and the shopfronts. Walkers keep to a lane of it:
    // the offset is what keeps the two directions from sharing the same line.
    const inset = pavementInset(this);
    const left = x0 + inset;
    const right = x1 - inset;
    const back = z0 + inset;
    const front = z1 - inset;
    const width = right - left;
    const depth = front - back;
    const perimeter = 2 * (width + depth);
    let t = ((this.t % perimeter) + perimeter) % perimeter;
    let x;
    let z;
    let heading;
    if (t < width) {
      x = left + t;
      z = back;
      heading = Math.PI / 2;
    } else if (t < width + depth) {
      x = right;
      z = back + (t - width);
      heading = 0;
    } else if (t < width * 2 + depth) {
      x = right - (t - width - depth);
      z = front;
      heading = -Math.PI / 2;
    } else {
      x = left;
      z = front - (t - width * 2 - depth);
      heading = Math.PI;
    }
    this.position.set(x, this.city.groundAt(x, z), z);
    this.heading = heading;
    this.perimeter = perimeter;
  }

  /**
   * Stand this walker on the point of a block's pavement nearest (x, z), mid-stride: how a staged
   * frame puts people on a pavement it can see.
   */
  walkToNearest(block, x, z) {
    this.block = block;
    const inset = pavementInset(this);
    const left = block.x0 + inset;
    const right = block.x1 - inset;
    const back = block.z0 + inset;
    const front = block.z1 - inset;
    const width = right - left;
    const depth = front - back;
    const sides = [
      { t: clamp(x - left, 0, width), d: Math.abs(z - back) },
      { t: width + clamp(z - back, 0, depth), d: Math.abs(x - right) },
      { t: width + depth + clamp(right - x, 0, width), d: Math.abs(z - front) },
      { t: 2 * width + depth + clamp(front - z, 0, depth), d: Math.abs(x - left) },
    ];
    sides.sort((first, second) => first.d - second.d);
    this.dead = false;
    this.deathTimer = 0;
    this.fleeTime = 0;
    this.t = sides[0].t;
    this.updatePerimeterPosition();
    this.phase = 1.1;
    this.legSwing = Math.sin(this.phase) * 0.5;
    this.bob = Math.abs(Math.sin(this.phase)) * 0.03;
    this.syncMesh();
    return this;
  }

  /** Put this walker on another pavement, alive and walking. */
  rehome(block) {
    this.block = block;
    this.dead = false;
    this.deathTimer = 0;
    this.fleeTime = 0;
    this.updatePerimeterPosition();
    this.t = this.rng.range(0, this.perimeter);
    this.updatePerimeterPosition();
    if (this.group) {
      this.group.visible = true;
      this.body.rotation.x = 0;
      this.body.position.y = 0;
    }
  }

  fleeFrom(x, z) {
    this.fleeTime = this.rng.range(4, 7);
    const dx = this.position.x - x;
    const dz = this.position.z - z;
    const length = Math.hypot(dx, dz) || 1;
    this.fleeX = dx / length;
    this.fleeZ = dz / length;
  }

  kill(cause) {
    if (this.dead) return;
    this.dead = true;
    this.deathTimer = 0;
    this.cause = cause;
    if (this.body) {
      this.body.rotation.x = -Math.PI / 2;
      this.body.position.y = 0.2;
    }
  }

  update(dt, player) {
    if (this.dead) {
      this.deathTimer += dt;
      this.bob = 0;
      this.legSwing = 0;
      if (this.group) {
        this.group.position.copy(this.position);
        this.group.position.y = this.city.groundAt(this.position.x, this.position.z);
        if (this.deathTimer > 30) this.group.visible = false;
      }
      return;
    }

    if (this.fleeTime > 0) {
      this.fleeTime -= dt;
      const runSpeed = 4.6;
      this.position.x += this.fleeX * runSpeed * dt;
      this.position.z += this.fleeZ * runSpeed * dt;
      this.city.resolveCircle(this.position, 0.4);
      this.phase += dt * 16;
      this.heading = Math.atan2(this.fleeX, this.fleeZ);
      this.bob = Math.abs(Math.sin(this.phase)) * 0.06;
      this.legSwing = Math.sin(this.phase) * 0.9;
      if (this.fleeTime <= 0) {
        // Rejoin the nearest pavement and carry on as if nothing happened.
        this.t = 0;
        this.updatePerimeterPosition();
      }
      this.syncMesh();
      return;
    }

    this.t += this.speed * this.direction * dt;
    this.updatePerimeterPosition();
    this.phase += dt * (this.speed * 4.4);
    this.bob = Math.abs(Math.sin(this.phase)) * 0.03;
    this.legSwing = Math.sin(this.phase) * 0.5;

    // A pedestrian steps aside for the player rather than being walked through.
    if (player) {
      const dx = this.position.x - player.position.x;
      const dz = this.position.z - player.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1.1 && distance > 0.001) {
        this.position.x += (dx / distance) * (1.1 - distance);
        this.position.z += (dz / distance) * (1.1 - distance);
      }
    }
    this.syncMesh();
  }

  /** Copy the pose onto this walker's own meshes, when it has any. */
  syncMesh() {
    if (!this.group) return;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
    this.legs[0].rotation.x = this.legSwing;
    this.legs[1].rotation.x = -this.legSwing;
    this.body.position.y = this.bob;
  }
}

/** Where a car should sit across the road when heading in a given direction (keep right). */
export function laneOffsetFor(heading) {
  const rightX = Math.cos(heading);
  const rightZ = -Math.sin(heading);
  return { x: rightX * LANE, z: rightZ * LANE };
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

/** How far in from the block edge a walker keeps: the lane of pavement it walks in. */
function pavementInset(ped) {
  return 1.05 + ped.direction * ped.laneOffset;
}
