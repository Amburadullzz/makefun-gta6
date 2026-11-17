// Cars: the models (box-built, lit, with headlight pools), the arcade driving model,
// and getting in and out. Traffic and the police both borrow the same car object and
// steer it by writing speed and heading; only the player's car reads the keyboard.



import * as THREE from '../vendor/three.min.js';
import { GeometryBuilder, linear, makeGlowTexture, makeShadowBlob } from './geometry.js';

export const CAR_SPECS = {
  sedan: { length: 4.6, width: 1.9, height: 1.45, maxSpeed: 31, accel: 13.5, brake: 26, turn: 2.3 },
  taxi: { length: 4.6, width: 1.9, height: 1.5, maxSpeed: 30, accel: 12.5, brake: 25, turn: 2.3 },
  van: { length: 5.5, width: 2.1, height: 2.15, maxSpeed: 24, accel: 9, brake: 21, turn: 2.0 },
  sports: { length: 4.4, width: 2.0, height: 1.16, maxSpeed: 45, accel: 21, brake: 32, turn: 2.5 },
  pickup: { length: 5.2, width: 2.05, height: 1.75, maxSpeed: 28, accel: 11.5, brake: 24, turn: 2.1 },
  police: { length: 4.75, width: 1.95, height: 1.52, maxSpeed: 39, accel: 18, brake: 30, turn: 2.45 },
};

const CAR_COLORS = [0x8a1f2c, 0x1f3c5a, 0x2d4a3a, 0x4a4a52, 0x6a5a3a, 0x5a2a4a, 0x1c2430, 0x7a6a5a, 0x3a5a6a];

export const CAR_NAMES = {
  sedan: 'KESTREL 4-DOOR',
  taxi: 'BAY CAB',
  van: 'HAULER VAN',
  sports: 'VANTAGE GT',
  pickup: 'DOCK PICKUP',
  police: 'V.B.P.D. CRUISER',
};

let glowTexture = null;
function sharedGlow() {
  if (!glowTexture) glowTexture = makeGlowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  return glowTexture;
}

export function buildCarModel(type, colorHex) {
  const specs = CAR_SPECS[type] ?? CAR_SPECS.sedan;
  const { length, width, height } = specs;
  const group = new THREE.Group();
  const body = new GeometryBuilder();
  const lights = new GeometryBuilder();
  const paint = linear(colorHex);
  const dark = linear(0x0b0d11);
  const glass = linear(0x121a22);
  const chrome = linear(0x8a9098);
  const tyre = linear(0x1c2026);

  const halfLength = length / 2;
  const halfWidth = width / 2;
  const wheelRadius = 0.34;

  if (type === 'van') {
    body.addBox(0, 0.42 + 0.55, 0, width, 1.1, length, paint, { skipBottom: true });
    body.addBox(0, 0.42 + 1.5, 0.1, width * 0.97, 1.0, length * 0.86, paint, { skipBottom: true });
    body.addBox(0, 0.42 + 1.55, length * 0.36, width * 0.86, 0.75, 0.12, glass, { skipBottom: true });
    body.addBox(0, 0.42 + 1.15, 0, width + 0.02, 0.5, length * 0.2, glass, { skipBottom: true });
  } else if (type === 'pickup') {
    body.addBox(0, 0.42 + 0.5, 0, width, 1.0, length, paint, { skipBottom: true });
    body.addBox(0, 0.42 + 1.15, -length * 0.08, width * 0.94, 0.62, length * 0.42, paint, { skipBottom: true });
    body.addBox(0, 0.42 + 1.2, -length * 0.05, width * 0.8, 0.5, length * 0.3, glass, { skipBottom: true });
    body.addBox(0, 0.42 + 0.72, length * 0.34, width * 0.9, 0.5, length * 0.3, dark, { skipBottom: true });
  } else {
    const bodyHeight = type === 'sports' ? 0.52 : 0.62;
    body.addBox(0, 0.4 + bodyHeight / 2, 0, width, bodyHeight, length, paint, { skipBottom: true });
    const cabinLength = type === 'sports' ? length * 0.42 : length * 0.48;
    const cabinHeight = type === 'sports' ? 0.4 : 0.55;
    body.addBox(0, 0.4 + bodyHeight + cabinHeight / 2, -length * 0.06, width * 0.88, cabinHeight, cabinLength, paint, { skipBottom: true });
    body.addBox(0, 0.4 + bodyHeight + cabinHeight / 2, -length * 0.06, width * 0.8, cabinHeight * 0.82, cabinLength * 0.92, glass, { skipBottom: true });

    body.addBox(0, 0.4 + bodyHeight + 0.03, length * 0.33, width * 0.9, 0.1, length * 0.22, paint, { skipBottom: true });
    body.addBox(0, 0.4 + bodyHeight + 0.03, -length * 0.34, width * 0.9, 0.1, length * 0.16, paint, { skipBottom: true });
  }


  body.addBox(0, 0.55, halfLength - 0.06, width * 0.98, 0.26, 0.16, chrome, { skipBottom: true });
  body.addBox(0, 0.55, -halfLength + 0.06, width * 0.98, 0.26, 0.16, chrome, { skipBottom: true });
  body.addBox(-halfWidth - 0.1, 0.95, length * 0.12, 0.18, 0.12, 0.3, paint, { skipBottom: true });
  body.addBox(halfWidth + 0.1, 0.95, length * 0.12, 0.18, 0.12, 0.3, paint, { skipBottom: true });


  // Wheels are part of the merged body: four boxes read as tyres at night and cost
  // nothing extra to draw.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wx = sx * (halfWidth + 0.02);
      const wz = sz * (halfLength - 0.85);
      body.addBox(wx, wheelRadius, wz, 0.3, wheelRadius * 2, wheelRadius * 2, tyre, { skipBottom: true });
      body.addBox(wx + sx * 0.16, wheelRadius, wz, 0.04, 0.26, 0.26, chrome, { skipBottom: true });
    }
  }


  const headY = type === 'sports' ? 0.62 : 0.72;
  lights.addBox(-halfWidth * 0.66, headY, halfLength - 0.02, 0.42, 0.16, 0.06, linear(0xfff2d0), { skipBottom: true });
  lights.addBox(halfWidth * 0.66, headY, halfLength - 0.02, 0.42, 0.16, 0.06, linear(0xfff2d0), { skipBottom: true });
  lights.addBox(-halfWidth * 0.66, headY, -halfLength + 0.02, 0.38, 0.14, 0.06, linear(0xff2a2a), { skipBottom: true });
  lights.addBox(halfWidth * 0.66, headY, -halfLength + 0.02, 0.38, 0.14, 0.06, linear(0xff2a2a), { skipBottom: true });

  const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.18 });
  group.add(new THREE.Mesh(body.build(), bodyMaterial));

  const lightMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, toneMapped: false });
  group.add(new THREE.Mesh(lights.build(), lightMaterial));


  let flashers = null;
  if (type === 'police') {
    const livery = new GeometryBuilder();
    livery.addBox(0, 0.9, 0, width + 0.03, 0.42, length * 0.42, linear(0x101318), { skipBottom: true });
    livery.addBox(0, 1.18, -length * 0.1, width + 0.02, 0.1, length * 0.5, linear(0xd8dde4), { skipBottom: true });
    group.add(new THREE.Mesh(livery.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 })));
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.8, 0.16, 0.36),
      new THREE.MeshBasicMaterial({ color: linear(0x151a20) }),
    );
    bar.position.set(0, height + 0.12, -length * 0.02);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(width * 0.36, 0.2, 0.32), new THREE.MeshBasicMaterial({ color: linear(0xff2020), fog: true }));
    red.position.set(-width * 0.2, height + 0.14, -length * 0.02);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(width * 0.36, 0.2, 0.32), new THREE.MeshBasicMaterial({ color: linear(0x2060ff), fog: true }));
    blue.position.set(width * 0.2, height + 0.14, -length * 0.02);
    group.add(red, blue);
    const sirenGlows = new THREE.Group();
    for (const [offset, colour] of [[-1, 0xff3040], [1, 0x3060ff]]) {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: sharedGlow(), color: linear(colour), transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true, toneMapped: false,
      }));
      glow.scale.set(3.4, 3.4, 1);
      glow.position.set(offset * width * 0.22, height + 0.2, -length * 0.02);
      sirenGlows.add(glow);
    }
    group.add(sirenGlows);
    flashers = { red, blue, glows: sirenGlows };

    const spill = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 5.5, length * 4.4),
      new THREE.MeshBasicMaterial({
        map: sharedGlow(), color: linear(0xff2030), transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      }),
    );
    spill.rotation.x = -Math.PI / 2;
    spill.position.y = 0.07;
    spill.renderOrder = 4;
    group.add(spill);
    flashers.spill = spill;
  }


  const beamMaterial = new THREE.MeshBasicMaterial({
    map: sharedGlow(), color: linear(0xffe2b0), transparent: true, opacity: 0.34,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
  });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(width * 2.6, length * 3.4), beamMaterial);
  beam.rotation.x = -Math.PI / 2;
  beam.position.set(0, 0.06, length * 1.5);
  beam.renderOrder = 4;
  group.add(beam);

  const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sharedGlow(), color: linear(0xffe8c0), transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: true, toneMapped: false,
  }));
  headGlow.scale.set(width * 1.9, 2.2, 1);
  headGlow.position.set(0, headY, halfLength + 0.05);
  group.add(headGlow);

  const shadow = makeShadowBlob(width * 1.5, length * 1.15, 0.95);
  shadow.position.y = 0.04;
  group.add(shadow);

  return { group, flashers, headGlow, specs, length, width, height };
}

export function createCar(scene, city, type, x, z, heading, options = {}) {
  const color = options.color ?? CAR_COLORS[0];
  const model = buildCarModel(type, color);
  const group = model.group;
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);

  const car = {
    type,
    name: CAR_NAMES[type] ?? 'CAR',
    group,
    model,
    specs: model.specs,
    position: new THREE.Vector3(x, 0, z),
    heading,
    speed: 0,
    steer: 0,
    health: 100,
    driver: null,
    parked: options.parked ?? false,
    police: type === 'police',
    color,
    brakeLight: false,
    stuckTimer: 0,
    lane: options.lane ?? 0,
    route: null,
    flashPhase: Math.random() * 6,

    setDriver(kind) {
      car.driver = kind;
    },


    step(dt, colliders = []) {
      const { specs } = car;
      const dirX = Math.sin(car.heading);
      const dirZ = Math.cos(car.heading);
      car.position.x += dirX * car.speed * dt;
      car.position.z += dirZ * car.speed * dt;


      const radius = specs.width * 0.55;
      const nose = city.resolveCollision(car.position.x + dirX * specs.length * 0.4, car.position.z + dirZ * specs.length * 0.4, radius);
      const tail = city.resolveCollision(car.position.x - dirX * specs.length * 0.4, car.position.z - dirZ * specs.length * 0.4, radius);
      if (nose.blocked || tail.blocked) {
        car.position.x += (nose.x - (car.position.x + dirX * specs.length * 0.4)) + (tail.x - (car.position.x - dirX * specs.length * 0.4));
        car.position.z += (nose.z - (car.position.z + dirZ * specs.length * 0.4)) + (tail.z - (car.position.z - dirZ * specs.length * 0.4));
        car.speed *= -0.2;
      }


      for (const other of colliders) {
        if (other === car) continue;
        const dx = other.position.x - car.position.x;
        const dz = other.position.z - car.position.z;
        const distance = Math.hypot(dx, dz);
        const minimum = (specs.length + other.specs.length) * 0.32;
        if (distance > 0.001 && distance < minimum) {
          const push = (minimum - distance) / minimum;
          car.position.x -= (dx / distance) * push * 0.6;
          car.position.z -= (dz / distance) * push * 0.6;
          car.speed *= 0.86;
          other.speed *= 0.92;
        }
      }

      const ground = city.groundHeight(car.position.x, car.position.z);
      car.position.y += (ground - car.position.y) * Math.min(1, dt * 12);
      group.position.copy(car.position);
      group.rotation.y = car.heading;


      const lean = Math.max(-0.08, Math.min(0.08, car.steer * car.speed * 0.004));
      group.rotation.z = -lean;
      group.rotation.x = Math.max(-0.05, Math.min(0.05, -car.speed * 0.0012));

      if (car.model.flashers) {
        car.flashPhase += dt * 9;
        const on = Math.sin(car.flashPhase) > 0;
        car.model.flashers.red.material.color.setHex(on ? 0xff3030 : 0x3a0808);
        car.model.flashers.blue.material.color.setHex(on ? 0x1030ff : 0x08083a);
        car.model.flashers.spill.material.color.setHex(on ? 0xff2233 : 0x2233ff);
        car.model.flashers.spill.material.opacity = on ? 0.34 : 0.24;
        car.model.flashers.glows.children[0].material.opacity = on ? 1 : 0.15;
        car.model.flashers.glows.children[1].material.opacity = on ? 0.15 : 1;
      }
    },

    dispose() {
      scene.remove(group);
    },
  };

  return car;
}

export function createVehicleManager(scene, city, state) {
  const cars = [];
  let playerCar = null;
  let headlight = null;

  const manager = {
    cars,
    get playerCar() {
      return playerCar;
    },

    spawn(type, x, z, heading, options = {}) {
      const car = createCar(scene, city, type, x, z, heading, options);
      cars.push(car);
      return car;
    },

    remove(car) {
      const index = cars.indexOf(car);
      if (index >= 0) cars.splice(index, 1);
      if (playerCar === car) playerCar = null;
      car.dispose();
    },

    nearest(position, maxDistance = 4.2) {
      let best = null;
      let bestDistance = maxDistance;
      for (const car of cars) {
        const distance = Math.hypot(car.position.x - position.x, car.position.z - position.z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = car;
        }
      }
      return best;
    },

    enter(car) {
      playerCar = car;
      car.driver = 'player';
      car.parked = false;
      state.inCar = true;
      state.bus.emit('enterCar', { car });
      if (!headlight) {
        headlight = new THREE.SpotLight(0xffe6c0, 260, 70, 0.55, 0.7, 1.3);
        headlight.castShadow = false;
        scene.add(headlight);
      }
      headlight.visible = true;
      headlight.position.set(0, 0.95, car.specs.length * 0.4);
      car.group.add(headlight);
      const target = new THREE.Object3D();
      target.position.set(0, 0.1, car.specs.length * 0.4 + 22);
      car.group.add(target);
      headlight.target = target;
    },

    exit() {
      if (!playerCar) return null;
      const car = playerCar;
      car.driver = null;
      playerCar = null;
      state.inCar = false;
      if (headlight) {
        car.group.remove(headlight);
        headlight.visible = false;
      }
      state.bus.emit('exitCar', { car });
      return car;
    },


    drivePlayer(dt, controls) {
      const car = playerCar;
      if (!car) return;
      const specs = car.specs;
      const throttle = controls.forward ? 1 : 0;
      const reverse = controls.back ? 1 : 0;
      const handbrake = controls.handbrake;

      if (throttle) car.speed += specs.accel * dt;
      if (reverse) {
        if (car.speed > 0.5) car.speed -= specs.brake * dt;
        else car.speed -= specs.accel * 0.55 * dt;
      }
      if (!throttle && !reverse) {
        const drag = 3.2 + Math.abs(car.speed) * 0.05;
        car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), drag * dt);
      }
      if (handbrake) {
        car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 18 * dt);
      }
      car.speed = Math.max(-specs.maxSpeed * 0.35, Math.min(specs.maxSpeed, car.speed));

      const speedFactor = Math.min(1, Math.abs(car.speed) / 8);
      const steerInput = (controls.left ? 1 : 0) - (controls.right ? 1 : 0);
      car.steer += (steerInput - car.steer) * Math.min(1, dt * 8);
      const turnRate = specs.turn * steerInput * speedFactor * (handbrake ? 1.45 : 1);
      car.heading += turnRate * dt * Math.sign(car.speed || 1) * Math.min(1, Math.abs(car.speed) / 4);

      state.speed = Math.abs(car.speed) * 3.6;
      car.step(dt, cars);
    },

    update(dt) {

      for (const car of cars) {
        if (car.driver === 'player' || car.driver === 'ai' || car.driver === 'police') continue;
        car.step(dt, cars);
      }
    },


    nearby(position, maxDistance = 4.6) {
      return manager.nearest(position, maxDistance);
    },
  };

  return manager;
}
