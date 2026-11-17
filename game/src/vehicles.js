// Cars: five distinct box-built models with lamps, wheels and a livery, the arcade driving model
// behind them (throttle, brake, steering that tightens with speed, a handbrake slide), the
// enter-and-exit dance, and the chase lights that make a police cruiser read at a distance.
import * as THREE from '../vendor/three.min.js';
import { makeGlowTexture } from './geometry.js';

const WHEEL_RADIUS = 0.36;

/** The models: one row each of proportions, colours and what makes it recognisable. */
export const CAR_MODELS = {
  sedan: {
    name: 'Bastion',
    length: 4.5,
    width: 1.86,
    bodyHeight: 0.62,
    cabinHeight: 0.56,
    cabinLength: 2.1,
    wheelbase: 2.9,
    colours: [0x3c4a5c, 0x6c6f75, 0x2f3a35, 0x5c3b3b, 0x8a8f96, 0x2a3340],
    topSpeed: 33,
    acceleration: 15,
  },
  coupe: {
    name: 'Tern GT',
    length: 4.4,
    width: 1.94,
    bodyHeight: 0.5,
    cabinHeight: 0.44,
    cabinLength: 1.8,
    wheelbase: 2.7,
    colours: [0xb8283c, 0x1f6fb8, 0xe0b83a, 0x1c1f24],
    topSpeed: 44,
    acceleration: 24,
    spoiler: true,
  },
  van: {
    name: 'Mule',
    length: 5.3,
    width: 2.05,
    bodyHeight: 1.5,
    cabinHeight: 0.9,
    cabinLength: 4.2,
    wheelbase: 3.4,
    colours: [0x7d7f74, 0x3f4a52, 0x8c5a34, 0x50565c],
    topSpeed: 24,
    acceleration: 9,
    boxy: true,
  },
  pickup: {
    name: 'Crawler',
    length: 5.0,
    width: 1.98,
    bodyHeight: 0.78,
    cabinHeight: 0.7,
    cabinLength: 2.0,
    wheelbase: 3.1,
    colours: [0x8a5a2c, 0x3b4d3a, 0x6a6f74, 0x8f2f2f],
    topSpeed: 30,
    acceleration: 14,
    bed: true,
  },
  sports: {
    name: 'Kestrel S',
    length: 4.6,
    width: 2.0,
    bodyHeight: 0.46,
    cabinHeight: 0.4,
    cabinLength: 1.7,
    wheelbase: 2.8,
    colours: [0xf0f2f5, 0x1b1e24, 0x2bd6c0, 0xff7a2f],
    topSpeed: 48,
    acceleration: 28,
    spoiler: true,
  },
  police: {
    name: 'Watchman',
    length: 4.7,
    width: 1.94,
    bodyHeight: 0.64,
    cabinHeight: 0.56,
    cabinLength: 2.2,
    wheelbase: 3.0,
    colours: [0x101820],
    topSpeed: 40,
    acceleration: 22,
    police: true,
  },
};

/** A car: geometry, physics and the state the rest of the game reads. */
export class Vehicle {
  constructor(scene, city, modelKey, options = {}) {
    this.city = city;
    this.modelKey = modelKey;
    this.spec = CAR_MODELS[modelKey];
    this.name = this.spec.name;
    this.position = new THREE.Vector3(options.x ?? 0, 0, options.z ?? 0);
    this.heading = options.heading ?? 0;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.driver = null;
    this.isPlayerCar = false;
    this.headlightsOn = false;
    this.occupied = options.occupied ?? false;
    this.colour = options.colour ?? this.spec.colours[0];
    this.wheelSpin = 0;
    this.bob = 0;

    this.group = new THREE.Group();
    this.group.name = `${this.spec.name} (${modelKey})`;
    scene.add(this.group);
    this.build();
    this.syncMesh();
  }

  build() {
    const spec = this.spec;
    const paint = new THREE.MeshLambertMaterial({ color: this.colour });
    const paintDark = new THREE.MeshLambertMaterial({ color: darken(this.colour, 0.62) });
    const glass = new THREE.MeshLambertMaterial({ color: 0x11161d, emissive: 0x0a1119 });
    const rubber = new THREE.MeshLambertMaterial({ color: 0x14161a });
    const trim = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });

    this.body = new THREE.Group();
    this.group.add(this.body);

    const lower = new THREE.Mesh(new THREE.BoxGeometry(spec.width, spec.bodyHeight, spec.length), paint);
    lower.position.y = 0.5 + spec.bodyHeight / 2 - 0.2;
    this.body.add(lower);

    const cabinLength = spec.cabinLength;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width * 0.9, spec.cabinHeight, cabinLength),
      spec.boxy ? paint : glass,
    );
    cabin.position.set(0, 0.5 + spec.bodyHeight + spec.cabinHeight / 2 - 0.24, spec.boxy ? -0.4 : -0.15);
    this.body.add(cabin);

    if (spec.boxy) {
      // A van's cab and cargo box, so it does not read as a big glass cube.
      const cab = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.92, 0.5, 1.1), glass);
      cab.position.set(0, 1.35, spec.length / 2 - 1.1);
      this.body.add(cab);
    }

    // Bonnet and boot lips give the silhouette a front and a back.
    const bonnet = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.94, 0.16, spec.length * 0.26), paint);
    bonnet.position.set(0, 0.5 + spec.bodyHeight - 0.14, spec.length * 0.3);
    this.body.add(bonnet);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.94, 0.14, spec.length * 0.22), paint);
    boot.position.set(0, 0.5 + spec.bodyHeight - 0.14, -spec.length * 0.32);
    this.body.add(boot);

    if (spec.bed) {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.86, 0.3, spec.length * 0.36), paintDark);
      bed.position.set(0, 0.5 + spec.bodyHeight + 0.02, -spec.length * 0.26);
      this.body.add(bed);
    }
    if (spec.spoiler) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.82, 0.09, 0.36), trim);
      wing.position.set(0, 0.5 + spec.bodyHeight + 0.28, -spec.length * 0.44);
      this.body.add(wing);
      for (const side of [-1, 1]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.1), trim);
        strut.position.set(side * spec.width * 0.32, 0.5 + spec.bodyHeight + 0.14, -spec.length * 0.44);
        this.body.add(strut);
      }
    }

    // Wheels: four cylinders on the axle line, spinning with the speed.
    this.wheels = [];
    const wheelGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.28, 12);
    wheelGeometry.rotateZ(Math.PI / 2);
    for (const side of [-1, 1]) {
      for (const axle of [-1, 1]) {
        const wheel = new THREE.Mesh(wheelGeometry, rubber);
        wheel.position.set(side * (spec.width / 2 - 0.06), WHEEL_RADIUS, axle * (spec.wheelbase / 2));
        this.group.add(wheel);
        this.wheels.push(wheel);
      }
    }

    // Lamps: warm at the front, red at the back, plus the glow they throw.
    this.headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2d0, toneMapped: false });
    this.taillightMaterial = new THREE.MeshBasicMaterial({ color: 0xff2a20, toneMapped: false });
    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.1), this.headlightMaterial);
      head.position.set(side * (spec.width / 2 - 0.34), 0.5 + spec.bodyHeight * 0.4, spec.length / 2 - 0.02);
      this.body.add(head);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.08), this.taillightMaterial);
      tail.position.set(side * (spec.width / 2 - 0.32), 0.5 + spec.bodyHeight * 0.42, -spec.length / 2 + 0.01);
      this.body.add(tail);
    }

    if (spec.police) {
      // The livery: a white door panel and the light bar.
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 0.02, 0.3, spec.length * 0.5), new THREE.MeshLambertMaterial({ color: 0xe8eef5 }));
      stripe.position.set(0, 0.62, 0);
      this.body.add(stripe);
      const bar = new THREE.Group();
      bar.position.set(0, 0.5 + spec.bodyHeight + spec.cabinHeight - 0.1, -0.1);
      this.lightRed = new THREE.MeshBasicMaterial({ color: 0xff1a1a, toneMapped: false });
      this.lightBlue = new THREE.MeshBasicMaterial({ color: 0x2a6bff, toneMapped: false });
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.34), this.lightRed);
      red.position.x = -0.42;
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.34), this.lightBlue);
      blue.position.x = 0.42;
      bar.add(red, blue);
      this.body.add(bar);

      // A wash of red or blue on the road under the cruiser: the loudest signal on the street.
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 13),
        new THREE.MeshBasicMaterial({
          map: makeGlowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'),
          color: 0xff2020,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.09;
      this.group.add(pool);
      this.sirenPool = pool;

      // Halos over the bar so a cruiser reads as a cruiser from a long way off.
      const haloTexture = makeGlowTexture('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');
      this.halos = [];
      for (const [offset, colour] of [[-0.45, 0xff2b2b], [0.45, 0x3a7bff]]) {
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: haloTexture,
            color: colour,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        halo.scale.set(9.5, 9.5, 1);
        halo.position.set(offset, 0.5 + spec.bodyHeight + spec.cabinHeight + 0.5, -0.1);
        this.body.add(halo);
        this.halos.push(halo);
      }
    }

    // A soft pool of headlight on the road ahead, so the beam reads even from behind the car.
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.width * 3.2, spec.length * 3.4),
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture('rgba(255,240,205,0.85)', 'rgba(255,220,160,0)'),
        color: 0xfff2d6,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.07, spec.length * 1.1);
    pool.visible = false;
    this.group.add(pool);
    this.headlightPool = pool;

    // Headlight cones for the player's car: two spotlights that light the road ahead.
    this.beams = [];
    for (const side of [-1, 1]) {
      const beam = new THREE.SpotLight(0xfff0cc, 0, 70, 0.62, 0.5, 1.1);
      beam.position.set(side * 0.6, 0.9, spec.length / 2 - 0.2);
      beam.target.position.set(side * 0.9, -0.6, spec.length / 2 + 18);
      // Invisible until this car is the one being driven: a light left in the scene costs every
      // lit material a slot in its shader, and the city has dozens of cars.
      beam.visible = false;
      this.group.add(beam, beam.target);
      this.beams.push(beam);
    }
  }

  /** Headlights and their spotlights; only the car the player drives pays for real lights. */
  setHeadlights(on, withBeams = false) {
    this.headlightsOn = on;
    for (const beam of this.beams) {
      beam.intensity = on && withBeams ? 180 : 0;
      beam.visible = on && withBeams;
    }
    if (this.headlightPool) this.headlightPool.visible = on;
    this.taillightMaterial.color.setHex(on ? 0xff2a20 : 0x551513);
  }

  /** Flash the roof bar; police cars call this every frame with their own phase. */
  updateLightbar(time, sirenOn) {
    if (!this.spec.police) return;
    if (!sirenOn) {
      this.lightRed.color.setHex(0x5a1414);
      this.lightBlue.color.setHex(0x14205a);
      if (this.halos) for (const halo of this.halos) halo.material.opacity = 0;
      if (this.sirenPool) this.sirenPool.material.opacity = 0;
      return;
    }
    const phase = Math.sin(time * 12);
    this.lightRed.color.setHex(phase > 0 ? 0xff2b2b : 0x4a1010);
    this.lightBlue.color.setHex(phase > 0 ? 0x101c4a : 0x3a7bff);
    if (this.halos) {
      this.halos[0].material.opacity = phase > 0 ? 0.95 : 0.05;
      this.halos[1].material.opacity = phase > 0 ? 0.05 : 0.95;
    }
    if (this.sirenPool) {
      this.sirenPool.material.color.setHex(phase > 0 ? 0xff2222 : 0x2a52ff);
      this.sirenPool.material.opacity = 0.42;
    }
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    if (this.health < 35) this.smoking = true;
    return this.health === 0;
  }

  get forwardX() {
    return Math.sin(this.heading);
  }

  get forwardZ() {
    return Math.cos(this.heading);
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  /** Place the car somewhere, at rest, facing a heading. */
  placeAt(x, z, heading = this.heading) {
    this.position.set(x, this.city.groundAt(x, z), z);
    this.heading = heading;
    this.speed = 0;
    this.syncMesh();
  }

  /** The arcade driving model: throttle, brake, steering that tightens with speed, handbrake. */
  drive(dt, input) {
    if (this.health <= 0) {
      this.speed *= Math.exp(-2 * dt);
    } else {
      const throttle = input.held('forward') ? 1 : 0;
      const brake = input.held('back') ? 1 : 0;
      const handbrake = input.held('jump');

      if (throttle > 0) {
        this.speed += this.spec.acceleration * dt * (1 - Math.min(1, Math.abs(this.speed) / this.spec.topSpeed));
      }
      if (brake > 0) {
        if (this.speed > 0.5) this.speed -= this.spec.acceleration * 1.9 * dt;
        else this.speed -= this.spec.acceleration * 0.55 * dt;
      }
      if (handbrake) this.speed *= Math.exp(-2.4 * dt);

      // Rolling resistance and drag, so the car coasts to a stop.
      this.speed *= Math.exp(-(0.32 + Math.abs(this.speed) * 0.006) * dt);
      if (this.speed < -this.spec.topSpeed * 0.28) this.speed = -this.spec.topSpeed * 0.28;
      if (this.speed > this.spec.topSpeed) this.speed = this.spec.topSpeed;
      if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;

      const steerInput = input.axisX();
      this.steer += (steerInput - this.steer) * Math.min(1, dt * 7);
      const grip = handbrake ? 1.55 : 1;
      const speedFactor = Math.min(1, Math.abs(this.speed) / 7);
      const turnRate = 1.55 * grip * speedFactor * (this.speed < 0 ? -1 : 1);
      this.heading += this.steer * turnRate * dt;
      if (handbrake) this.speed *= Math.exp(-0.4 * dt);
    }

    this.integrate(dt);
  }

  /** Simple kinematics for a car nobody is driving: a speed and a heading, set from outside. */
  roll(dt, targetSpeed) {
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 3);
    this.integrate(dt);
  }

  integrate(dt) {
    const dx = Math.sin(this.heading) * this.speed * dt;
    const dz = Math.cos(this.heading) * this.speed * dt;
    this.position.x += dx;
    this.position.z += dz;

    const before = { x: this.position.x, z: this.position.z };
    this.city.resolveCircle(this.position, 1.15);
    const pushed = Math.hypot(this.position.x - before.x, this.position.z - before.z);
    if (pushed > 0.001) {
      // Hit a wall: lose most of the speed and take a little damage.
      if (Math.abs(this.speed) > 6) this.damage(Math.abs(this.speed) * 0.5);
      this.speed *= -0.18;
    }

    this.position.y = this.city.groundAt(this.position.x, this.position.z);
    this.wheelSpin += (this.speed * dt) / WHEEL_RADIUS;
    this.syncMesh();
  }

  syncMesh() {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
    for (const wheel of this.wheels) wheel.rotation.x = this.wheelSpin;
    // A little body roll into the turn, and a squat under acceleration.
    if (this.body) {
      this.body.rotation.z = -this.steer * Math.min(0.08, Math.abs(this.speed) * 0.003);
      this.body.rotation.x = Math.max(-0.04, Math.min(0.04, -this.speed * 0.0012));
    }
  }
}

/** Every car in the world that is not traffic: parked around the streets, waiting to be taken. */
export class VehicleFleet {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    this.playerCar = null;

    this.buildParkedCars();
    this.buildStoryCars();
    this.separate();
  }

  buildParkedCars() {
    const keys = Object.keys(CAR_MODELS).filter((key) => key !== 'police');
    for (let i = 0; i < 16; i += 1) {
      const block = this.rng.pick(this.city.blocks);
      // Park along the kerb of a block, nose in to the sidewalk.
      const side = this.rng.int(0, 3);
      const along = this.rng.range(block.x0 + 4, block.x1 - 4);
      let x = along;
      let z = block.z0 - 3.6;
      let heading = Math.PI / 2;
      if (side === 1) {
        z = block.z1 + 3.6;
        heading = -Math.PI / 2;
      } else if (side === 2) {
        x = block.x0 - 3.6;
        z = along;
        heading = 0;
      } else if (side === 3) {
        x = block.x1 + 3.6;
        z = along;
        heading = Math.PI;
      }
      const modelKey = this.rng.pick(keys);
      const car = new Vehicle(this.scene, this.city, modelKey, {
        x,
        z,
        heading,
        colour: this.rng.pick(CAR_MODELS[modelKey].colours),
      });
      car.placeAt(x, z, heading);
      car.parked = true;
      this.cars.push(car);
    }
  }

  /** The two cars the story needs: the Tern GT at the pier and a car waiting at the bar. */
  buildStoryCars() {
    this.storyCars = [];
    const tern = new Vehicle(this.scene, this.city, 'coupe', {
      x: this.city.spots.pier.x,
      z: this.city.spots.pier.z,
      heading: -Math.PI / 2,
      colour: 0xb8283c,
    });
    tern.placeAt(this.city.spots.pier.x, this.city.spots.pier.z, -Math.PI / 2);
    tern.isStoryCar = true;
    tern.storyName = 'the Tern GT';
    this.cars.push(tern);
    this.storyCars.push(tern);

    const barCar = new Vehicle(this.scene, this.city, 'sports', {
      x: this.city.spots.bar.x - 4,
      z: this.city.spots.bar.z - 24,
      heading: Math.PI / 2,
      colour: 0x2bd6c0,
    });
    barCar.placeAt(this.city.spots.bar.x - 4, this.city.spots.bar.z - 24, Math.PI / 2);
    barCar.isStoryCar = true;
    barCar.storyName = 'the Kestrel';
    this.cars.push(barCar);
    this.storyCars.push(barCar);
  }

  /** The closest car within reach of a point, or null. */
  nearest(x, z, maxDistance = 3.4) {
    let best = null;
    let bestDistance = maxDistance;
    for (const car of this.cars) {
      const distance = Math.hypot(car.position.x - x, car.position.z - z);
      if (distance < bestDistance) {
        best = car;
        bestDistance = distance;
      }
    }
    return best;
  }

  carAt(x, z, radius = 2.4) {
    for (const car of this.cars) {
      if (Math.hypot(car.position.x - x, car.position.z - z) < radius) return car;
    }
    return null;
  }

  /** Sit the player in a car. Returns the car, or null when it is too wrecked to move. */
  enter(car, player) {
    if (!car || car.health <= 0) return null;
    this.playerCar = car;
    car.isPlayerCar = true;
    car.setHeadlights(true, true);
    player.inVehicle = car;
    player.setVisible(false);
    return car;
  }

  /** Step out beside the car; the player lands on the pavement, not inside a wall. */
  exit(player) {
    const car = this.playerCar;
    if (!car) return null;
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    let x = car.position.x + sideX * 2.4;
    let z = car.position.z + sideZ * 2.4;
    const test = new THREE.Vector3(x, 0, z);
    this.city.resolveCircle(test, 0.5);
    x = test.x;
    z = test.z;
    car.isPlayerCar = false;
    car.setHeadlights(false, false);
    player.teleport(x, z, car.heading - Math.PI / 2);
    player.inVehicle = null;
    this.playerCar = null;
    return car;
  }

  /** Nudge cars apart so parked traffic does not end up inside the player's car. */
  separate() {
    for (let i = 0; i < this.cars.length; i += 1) {
      for (let j = i + 1; j < this.cars.length; j += 1) {
        const a = this.cars[i];
        const b = this.cars[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const distance = Math.hypot(dx, dz);
        const minimum = 2.6;
        if (distance > 0.001 && distance < minimum) {
          const push = (minimum - distance) / 2;
          const nx = dx / distance;
          const nz = dz / distance;
          a.position.x -= nx * push;
          a.position.z -= nz * push;
          b.position.x += nx * push;
          b.position.z += nz * push;
          a.syncMesh();
          b.syncMesh();
        }
      }
    }
  }

  update(dt, time) {
    if (this.playerCar) {
      this.playerCar.updateLightbar(time, false);
      if (this.playerCar.health < 35) this.playerCar.smoking = true;
    }
  }
}

function darken(colour, factor) {
  const r = Math.round(((colour >> 16) & 0xff) * factor);
  const g = Math.round(((colour >> 8) & 0xff) * factor);
  const b = Math.round((colour & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}
