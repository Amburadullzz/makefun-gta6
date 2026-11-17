// The life on the streets: traffic that follows the grid, turning at intersections and braking
// for whatever is in front of it, and pedestrians who walk the pavements and run when a gun goes
// off or a car comes at them. Any traffic car can be pulled over and taken, so the city is full of
// cars worth stealing.
import * as THREE from '../vendor/three.min.js';
import { CAR_MODELS, Vehicle } from './vehicles.js';

const LANE = 4.2;
const TRAFFIC_MODELS = ['sedan', 'sedan', 'van', 'pickup', 'coupe', 'sedan', 'sports', 'van'];
const COAT_COLOURS = [0x38404c, 0x5a3b3b, 0x2f4a3f, 0x4a4468, 0x6a5a3a, 0x2b2f36, 0x7a6a5a];
const SKIN_TONES = [0xc79a76, 0x8d6448, 0x5e4030, 0xe0b592, 0x6f4a34];
const HAT_COLOURS = [0x1c1f24, 0x3a2b2b, 0x2a3a4a];

export class Traffic {
  constructor(scene, city, rng, fleet) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.fleet = fleet;
    this.cars = [];
    this.peds = [];
    this.time = 0;

    this.spawnTrafficCars(12);
    this.spawnPedestrians(16);
  }

  // ---------------------------------------------------------------- traffic

  spawnTrafficCars(count) {
    for (let i = 0; i < count; i += 1) {
      const spot = this.city.spawnPoints[this.rng.int(0, this.city.spawnPoints.length - 1)];
      const node = this.city.nearestNode(spot.x, spot.z);
      const modelKey = this.rng.pick(TRAFFIC_MODELS);
      const car = new Vehicle(this.scene, this.city, modelKey, {
        x: node.x,
        z: node.z,
        colour: this.rng.pick(CAR_MODELS[modelKey].colours),
      });
      car.ai = {
        node,
        target: null,
        cruise: this.rng.range(9, 15),
        patience: 0,
        stuckFor: 0,
      };
      car.setHeadlights(true, false);
      this.pickNextNode(car);
      this.cars.push(car);
    }
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
    this.fleet.cars.push(car);
    return car;
  }

  // ---------------------------------------------------------------- pedestrians

  spawnPedestrians(count) {
    for (let i = 0; i < count; i += 1) {
      const block = this.rng.pick(this.city.blocks);
      const ped = new Pedestrian(this.scene, this.city, block, this.rng);
      this.peds.push(ped);
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
    for (const car of this.cars) this.updateCar(car, dt);
    for (const ped of this.peds) ped.update(dt, player);
    if (player && !player.inVehicle) this.separateFromPlayer(player);
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
  constructor(scene, city, block, rng) {
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
    this.position = new THREE.Vector3(0, 0, 0);

    const coat = rng.pick(COAT_COLOURS);
    const skin = rng.pick(SKIN_TONES);
    const height = rng.range(0.9, 1.08);

    this.group = new THREE.Group();
    this.group.scale.setScalar(height);
    this.body = new THREE.Group();
    this.group.add(this.body);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.28), new THREE.MeshLambertMaterial({ color: coat }));
    torso.position.y = 1.24;
    this.body.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), new THREE.MeshLambertMaterial({ color: skin }));
    head.position.y = 1.68;
    this.body.add(head);
    if (rng.chance(0.3)) {
      const hat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), new THREE.MeshLambertMaterial({ color: rng.pick(HAT_COLOURS) }));
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
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.12), new THREE.MeshLambertMaterial({ color: 0x2a2a2e }));
    bag.position.set(0.28, 1.1, 0.1);
    this.body.add(bag);

    scene.add(this.group);
    this.updatePerimeterPosition();
  }

  /** Walk the rectangle of pavement around the block; corners turn automatically. */
  updatePerimeterPosition() {
    const { x0, x1, z0, z1 } = this.block;
    const inset = 2.2;
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
    this.body.rotation.x = -Math.PI / 2;
    this.body.position.y = 0.2;
  }

  update(dt, player) {
    if (this.dead) {
      this.deathTimer += dt;
      this.group.position.copy(this.position);
      this.group.position.y = this.city.groundAt(this.position.x, this.position.z);
      if (this.deathTimer > 30) this.group.visible = false;
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
      this.group.position.copy(this.position);
      this.group.rotation.y = this.heading;
      this.legs[0].rotation.x = Math.sin(this.phase) * 0.9;
      this.legs[1].rotation.x = -Math.sin(this.phase) * 0.9;
      this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.06;
      if (this.fleeTime <= 0) {
        // Rejoin the nearest pavement and carry on as if nothing happened.
        this.t = 0;
        this.updatePerimeterPosition();
      }
      return;
    }

    this.t += this.speed * this.direction * dt;
    this.updatePerimeterPosition();
    this.phase += dt * (this.speed * 4.4);
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
    this.legs[0].rotation.x = Math.sin(this.phase) * 0.5;
    this.legs[1].rotation.x = -Math.sin(this.phase) * 0.5;
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.03;

    // A pedestrian steps aside for the player rather than being walked through.
    if (player) {
      const dx = this.position.x - player.position.x;
      const dz = this.position.z - player.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1.1 && distance > 0.001) {
        this.position.x += (dx / distance) * (1.1 - distance);
        this.position.z += (dz / distance) * (1.1 - distance);
        this.group.position.copy(this.position);
      }
    }
  }
}

/** Where a car should sit across the road when heading in a given direction (keep right). */
export function laneOffsetFor(heading) {
  const rightX = Math.cos(heading);
  const rightZ = -Math.sin(heading);
  return { x: rightX * LANE, z: rightZ * LANE };
}
