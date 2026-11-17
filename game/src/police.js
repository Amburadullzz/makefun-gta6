// The Sable Harbor Police Department: a wanted level from one star to five, cruisers that spawn out
// of sight and work the street grid toward you, officers who get out and shoot when the car stops
// close, and a level that cools off only once you have broken line of sight for long enough.
import * as THREE from '../vendor/three.min.js';
import { Vehicle } from './vehicles.js';

const OFFICER_SKIN = [0xc79a76, 0x8d6448, 0x5e4030, 0xe0b592];
const UNIFORM = 0x1a2534;

/** One patrol unit: a cruiser with two officers in it. */
class PoliceUnit {
  constructor(scene, city, car, rng) {
    this.scene = scene;
    this.city = city;
    this.car = car;
    this.rng = rng;
    this.path = [];
    this.pathTimer = 0;
    this.officers = [];
    this.deployed = false;
    this.alive = true;
    car.updateLightbar(0, true);
  }

  deploy() {
    if (this.deployed) return;
    this.deployed = true;
    for (const side of [-1, 1]) {
      const officer = new Gunman(this.scene, this.city, this.rng, { coat: UNIFORM, vest: 0x2b3a4d, cap: true });
      const offsetX = Math.cos(this.car.heading) * side * 1.6;
      const offsetZ = -Math.sin(this.car.heading) * side * 1.6;
      officer.placeAt(this.car.position.x + offsetX, this.car.position.z + offsetZ);
      this.officers.push(officer);
    }
  }

  get aliveOfficers() {
    return this.officers.filter((officer) => !officer.dead);
  }

  dispose(scene) {
    scene.remove(this.car.group);
    for (const officer of this.officers) scene.remove(officer.group);
  }
}

/** An armed man on foot: a police officer in uniform, or a Salt Court enforcer in a work coat.
 *  Walks in to a firing distance, stops, and shoots on a timer with a hit chance that falls off. */
export class Gunman {
  constructor(scene, city, rng, options = {}) {
    this.city = city;
    this.rng = rng;
    this.position = new THREE.Vector3();
    this.heading = 0;
    this.health = options.health ?? 60;
    this.dead = false;
    this.fireTimer = rng.range(0.4, 1.2);
    this.phase = rng.range(0, Math.PI * 2);
    this.muzzle = 0;
    this.coat = options.coat ?? UNIFORM;
    this.accuracy = options.accuracy ?? 1;
    this.name = options.name ?? 'officer';

    const skin = rng.pick(OFFICER_SKIN);
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.3), new THREE.MeshLambertMaterial({ color: this.coat }));
    torso.position.y = 1.28;
    this.body.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.34), new THREE.MeshLambertMaterial({ color: options.vest ?? 0x2b3a4d }));
    vest.position.y = 1.42;
    this.body.add(vest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), new THREE.MeshLambertMaterial({ color: skin }));
    head.position.y = 1.75;
    this.body.add(head);
    if (options.cap ?? true) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), new THREE.MeshLambertMaterial({ color: 0x11161d }));
      cap.position.y = 1.92;
      this.body.add(cap);
    }
    this.legs = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.19), new THREE.MeshLambertMaterial({ color: 0x14181f }));
      leg.position.set(side * 0.13, 0.64, 0);
      this.body.add(leg);
      this.legs.push(leg);
    }
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.16), new THREE.MeshLambertMaterial({ color: this.coat }));
    arm.position.set(0.3, 1.32, 0.08);
    this.body.add(arm);

    this.muzzleLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff0b0, toneMapped: false }),
    );
    this.muzzleLight.position.set(0.32, 1.35, 0.42);
    this.muzzleLight.visible = false;
    this.body.add(this.muzzleLight);

    scene.add(this.group);
  }

  placeAt(x, z) {
    this.position.set(x, this.city.groundAt(x, z), z);
    this.group.position.copy(this.position);
  }

  hit(amount) {
    if (this.dead) return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.dead = true;
      this.body.rotation.x = -Math.PI / 2;
      this.body.position.y = 0.25;
      return true;
    }
    return false;
  }

  /** Walk toward the target, then fire; `onShot(damage, position)` is called for every round. */
  update(dt, player, onShot) {
    if (this.dead) return;
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.muzzleLight.visible = this.muzzle > 0;

    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    this.heading = Math.atan2(dx, dz);

    if (distance > 13) {
      const step = Math.min(3.6 * dt, distance - 11);
      this.position.x += (dx / distance) * step;
      this.position.z += (dz / distance) * step;
      this.city.resolveCircle(this.position, 0.4);
      this.phase += dt * 12;
      this.legs[0].rotation.x = Math.sin(this.phase) * 0.7;
      this.legs[1].rotation.x = -Math.sin(this.phase) * 0.7;
    } else {
      this.legs[0].rotation.x = 0;
      this.legs[1].rotation.x = 0;
    }
    this.position.y = this.city.groundAt(this.position.x, this.position.z);
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;

    if (distance < 36) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = this.rng.range(0.85, 1.5);
        this.muzzle = 0.06;
        const hitChance = Math.max(0.16, 0.72 - distance * 0.014) * this.accuracy;
        if (this.rng.chance(hitChance)) onShot(this.rng.range(5, 9), this);
      }
    }
  }
}

export class Police {
  constructor(scene, city, rng, state, fleet, traffic, audio) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.state = state;
    this.fleet = fleet;
    this.traffic = traffic;
    this.audio = audio;
    this.units = [];
    this.spawnTimer = 0;
    this.escapeTimer = 0;
    this.time = 0;
    this.onDamagePlayer = null;
    this.sirenOn = false;
    state.onChange((kind) => {
      if (kind === 'wanted') this.syncWanted();
    });
  }

  get cars() {
    return this.units.filter((unit) => unit.alive).map((unit) => unit.car);
  }

  get positions() {
    return this.units
      .filter((unit) => unit.alive)
      .map((unit) => ({ x: unit.car.position.x, z: unit.car.position.z, heading: unit.car.heading }));
  }

  /** A crime happened; the city answers according to how loud it was. */
  reportCrime(kind, position) {
    const before = this.state.wanted;
    if (kind === 'gunshot') this.state.raiseWanted(1);
    else if (kind === 'carjack') this.state.raiseWanted(1);
    else if (kind === 'pedestrian') this.state.raiseWanted(2);
    else if (kind === 'officer') this.state.raiseWanted(3);
    else if (kind === 'rampage') this.state.raiseWanted(3);
    else if (kind === 'mission') this.state.raiseWanted(2);
    if (position) this.traffic.scare(position.x, position.z, 26);
    if (this.state.wanted > before) {
      this.escapeTimer = 0;
      this.syncWanted();
    }
  }

  syncWanted() {
    const wanted = this.state.wanted;
    if (wanted > 0 && this.audio) this.audio.setSiren(true);
    if (wanted === 0 && this.audio) this.audio.setSiren(false);
  }

  damagePlayer(amount, source) {
    if (this.onDamagePlayer) this.onDamagePlayer(amount, source);
  }

  onOfficerShot(position) {
    if (this.audio) this.audio.gunshot(0.5, position);
  }

  /** How many cruisers should be on the street for the current level. */
  get targetUnits() {
    return Math.min(5, this.state.wanted);
  }

  /** Put a cruiser exactly where a staged shot wants it. */
  placeUnit(x, z, heading) {
    const car = new Vehicle(this.scene, this.city, 'police', { x, z, heading });
    car.placeAt(x, z, heading);
    car.setHeadlights(true, false);
    const unit = new PoliceUnit(this.scene, this.city, car, this.rng);
    this.units.push(unit);
    return unit;
  }

  spawnUnit(player) {
    const spot = this.city.randomRoadPoint(
      this.rng,
      player.position.x,
      player.position.z,
      90,
      190,
    );
    const heading = Math.atan2(player.position.x - spot.x, player.position.z - spot.z);
    const car = new Vehicle(this.scene, this.city, 'police', { x: spot.x, z: spot.z, heading });
    car.placeAt(spot.x, spot.z, heading);
    car.setHeadlights(true, false);
    const unit = new PoliceUnit(this.scene, this.city, car, this.rng);
    unit.pathTimer = 0;
    this.units.push(unit);
    return unit;
  }

  despawnUnit(unit) {
    unit.alive = false;
    unit.dispose(this.scene);
    this.units = this.units.filter((other) => other !== unit);
  }

  clearAll() {
    for (const unit of [...this.units]) this.despawnUnit(unit);
    this.sirenOn = false;
    if (this.audio) this.audio.setSiren(false);
  }

  /** Drive a cruiser: follow the street grid to the player's block, then close in. */
  updateUnit(unit, dt, player) {
    const car = unit.car;
    car.updateLightbar(this.time, true);

    // If the car is wrecked or stuck against something for too long, replace it.
    if (car.health <= 0) {
      unit.deployed = true;
      if (unit.aliveOfficers.length === 0) {
        this.despawnUnit(unit);
        return;
      }
    }

    const distanceToPlayer = Math.hypot(car.position.x - player.position.x, car.position.z - player.position.z);

    if (distanceToPlayer < 26 && !unit.deployed) {
      unit.deploy();
      car.speed *= 0.2;
    }

    // Officers on foot take over once they are out.
    const officers = unit.aliveOfficers;
    for (const officer of officers) {
      officer.update(dt, player, (damage, source) => {
        player.hurtFlash = 0.4;
        this.damagePlayer(damage, source);
        this.onOfficerShot(source.position);
      });
    }

    if (unit.deployed && officers.length === 0) {
      // Everyone is down; the wreck stays where it is for a while.
      car.speed *= Math.exp(-3 * dt);
      car.integrate(dt);
      return;
    }

    if (unit.deployed) {
      car.speed *= Math.exp(-4 * dt);
      car.integrate(dt);
      return;
    }

    unit.pathTimer -= dt;
    if (unit.pathTimer <= 0 || unit.path.length === 0) {
      unit.pathTimer = 1.4;
      const from = this.city.nearestNode(car.position.x, car.position.z);
      const to = this.city.nearestNode(player.position.x, player.position.z);
      unit.path = this.city.pathBetween(from, to).slice(1);
    }

    let targetX = player.position.x;
    let targetZ = player.position.z;
    let aggressive = false;
    if (unit.path.length > 0 && distanceToPlayer > 55) {
      const node = unit.path[0];
      targetX = node.x;
      targetZ = node.z;
      if (Math.hypot(car.position.x - node.x, car.position.z - node.z) < 8) unit.path.shift();
    } else {
      aggressive = true;
    }

    const desired = Math.atan2(targetX - car.position.x, targetZ - car.position.z);
    let difference = desired - car.heading;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    car.heading += difference * Math.min(1, dt * (aggressive ? 4.2 : 3));

    const gap = this.traffic.obstacleAhead(car, this.fleet.playerCar);
    let speed = aggressive ? 22 : 26;
    if (gap < 10) speed = Math.max(0, (gap - 4) * 2);
    if (car.health <= 0) speed = 0;
    car.roll(dt, speed);

    // A cruiser that has been wedged against a wall for a while is moved back onto the road.
    if (Math.abs(car.speed) < 1 && distanceToPlayer > 40) {
      unit.stuck = (unit.stuck ?? 0) + dt;
      if (unit.stuck > 7) {
        const node = this.city.nearestNode(player.position.x, player.position.z);
        const angle = this.rng.range(0, Math.PI * 2);
        const x = node.x + Math.cos(angle) * 20;
        const z = node.z + Math.sin(angle) * 20;
        car.placeAt(x, z, Math.atan2(player.position.x - x, player.position.z - z));
        unit.stuck = 0;
      }
    } else {
      unit.stuck = 0;
    }
  }

  update(dt, player) {
    this.time += dt;
    const wanted = this.state.wanted;

    if (wanted === 0) {
      if (this.units.length > 0) this.clearAll();
      this.escapeTimer = 0;
      return;
    }

    // Keep the street's worth of cruisers up to the level.
    this.spawnTimer -= dt;
    const active = this.units.filter((unit) => unit.alive).length;
    if (active < this.targetUnits && this.spawnTimer <= 0) {
      this.spawnTimer = 2.4;
      this.spawnUnit(player);
    }

    let seen = false;
    for (const unit of [...this.units]) {
      this.updateUnit(unit, dt, player);
      const distance = Math.hypot(unit.car.position.x - player.position.x, unit.car.position.z - player.position.z);
      if (distance < 55) seen = true;
      // A cruiser that has lost you for a long time gives up and is taken off the board.
      if (distance > 150) {
        unit.lost = (unit.lost ?? 0) + dt;
        if (unit.lost > 14 && this.units.length > 1) this.despawnUnit(unit);
      } else {
        unit.lost = 0;
      }
    }

    // Escape: break line of sight for long enough and the level falls a star at a time.
    if (!seen) {
      this.escapeTimer += dt;
      if (this.escapeTimer > 8) {
        this.escapeTimer = 0;
        this.state.setWanted(this.state.wanted - 1);
        if (this.state.wanted === 0) this.clearAll();
      }
    } else {
      this.escapeTimer = 0;
    }
  }

  /** Everything the player's bullets could hit. */
  targets() {
    const list = [];
    for (const unit of this.units) {
      for (const officer of unit.officers) {
        if (!officer.dead) list.push({ kind: 'officer', officer, position: officer.position, radius: 0.55 });
      }
      if (unit.car.health > 0) list.push({ kind: 'policeCar', car: unit.car, position: unit.car.position, radius: 1.6 });
    }
    return list;
  }
}