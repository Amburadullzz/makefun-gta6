// Instanced renderers for the crowd. A car is a dozen boxes and a pedestrian is six; drawn one
// mesh at a time, forty cars and forty walkers would be seven hundred draw calls. Here every body
// part is a single InstancedMesh covering the whole fleet, so the street can hold several times
// the traffic and the pavement several times the walkers for a handful of draw calls instead of
// hundreds. The models are the same proportions as vehicles.js and traffic.js build by hand; this
// module only bakes those offsets into per-model matrices and writes one instance per car per part.
import * as THREE from '../vendor/three.min.js';
import { CAR_MODELS, darken } from './vehicles.js';
import { makeGlowTexture } from './geometry.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const WHEEL_GEOMETRY = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
WHEEL_GEOMETRY.rotateZ(Math.PI / 2);
const PLANE = new THREE.PlaneGeometry(1, 1);
PLANE.rotateX(-Math.PI / 2);

const IDENTITY = new THREE.Quaternion();
const ONE = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);
const GLASS = new THREE.Color(0x11161d);
const WHEEL_COLOUR = new THREE.Color(0x14161a);
const POOL_TINT = new THREE.Color(0xfff2d6).multiplyScalar(0.42);

/** A local matrix for one box part: offset, then size. */
function boxMatrix(x, y, z, width, height, depth) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    IDENTITY,
    new THREE.Vector3(width, height, depth),
  );
}

const PART_CACHE = new Map();

/** The parts of one car model, in the same places vehicles.js puts them. */
function carParts(modelKey) {
  const cached = PART_CACHE.get(modelKey);
  if (cached) return cached;
  const spec = CAR_MODELS[modelKey];
  const width = spec.width;
  const length = spec.length;
  const bodyHeight = spec.bodyHeight;
  const cabinHeight = spec.cabinHeight;
  const parts = {
    lower: boxMatrix(0, 0.5 + bodyHeight / 2 - 0.2, 0, width, bodyHeight, length),
    cabin: boxMatrix(
      0,
      0.5 + bodyHeight + cabinHeight / 2 - 0.24,
      spec.boxy ? -0.4 : -0.15,
      width * 0.9,
      cabinHeight,
      spec.cabinLength,
    ),
    bonnet: boxMatrix(0, 0.5 + bodyHeight - 0.14, length * 0.3, width * 0.94, 0.16, length * 0.26),
    boot: boxMatrix(0, 0.5 + bodyHeight - 0.14, -length * 0.32, width * 0.94, 0.14, length * 0.22),
    wheels: [],
    heads: [],
    tails: [],
    bed: spec.bed ? boxMatrix(0, 0.5 + bodyHeight + 0.02, -length * 0.26, width * 0.86, 0.3, length * 0.36) : null,
    cab: spec.boxy ? boxMatrix(0, 1.35, length / 2 - 1.1, width * 0.92, 0.5, 1.1) : null,
    spoiler: null,
    pool: new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.07, length * 1.1),
      IDENTITY,
      new THREE.Vector3(width * 3.2, 1, length * 3.4),
    ),
  };
  if (spec.spoiler) {
    parts.spoiler = [boxMatrix(0, 0.5 + bodyHeight + 0.28, -length * 0.44, width * 0.82, 0.09, 0.36)];
    for (const side of [-1, 1]) {
      parts.spoiler.push(boxMatrix(side * width * 0.32, 0.5 + bodyHeight + 0.14, -length * 0.44, 0.08, 0.3, 0.1));
    }
  }
  for (const side of [-1, 1]) {
    for (const axle of [-1, 1]) {
      parts.wheels.push(new THREE.Vector3(side * (width / 2 - 0.06), 0.36, axle * (spec.wheelbase / 2)));
    }
    parts.heads.push(boxMatrix(side * (width / 2 - 0.34), 0.5 + bodyHeight * 0.4, length / 2 - 0.02, 0.4, 0.16, 0.1));
    parts.tails.push(boxMatrix(side * (width / 2 - 0.32), 0.5 + bodyHeight * 0.42, -length / 2 + 0.01, 0.36, 0.14, 0.08));
  }
  PART_CACHE.set(modelKey, parts);
  return parts;
}

function instanced(scene, geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // The instances span the whole street, so a per-mesh bound would never cull it anyway.
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  return mesh;
}

/** Every traffic car in the city, drawn as seven instanced parts. */
export class CarInstances {
  constructor(scene, capacity = 32) {
    this.capacity = capacity;
    this.count = 0;
    this.cars = [];
    this.meshes = [];
    const paint = () => new THREE.MeshLambertMaterial({ color: 0xffffff });

    this.lower = instanced(scene, BOX, paint(), capacity);
    this.cabin = instanced(
      scene,
      BOX,
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x0a1119 }),
      capacity,
    );
    this.cabinPaint = instanced(scene, BOX, paint(), capacity);
    this.bonnet = instanced(scene, BOX, paint(), capacity);
    this.boot = instanced(scene, BOX, paint(), capacity);
    this.bed = instanced(scene, BOX, paint(), capacity);
    this.cab = instanced(scene, BOX, new THREE.MeshLambertMaterial({ color: 0x11161d, emissive: 0x0a1119 }), capacity);
    this.spoiler = instanced(scene, BOX, new THREE.MeshLambertMaterial({ color: 0x2a2d33 }), capacity * 3);
    this.wheel = instanced(scene, WHEEL_GEOMETRY, new THREE.MeshLambertMaterial({ color: 0xffffff }), capacity * 4);
    this.head = instanced(
      scene,
      BOX,
      new THREE.MeshBasicMaterial({ color: 0xfff2d0, toneMapped: false }),
      capacity * 2,
    );
    this.tail = instanced(
      scene,
      BOX,
      new THREE.MeshBasicMaterial({ color: 0xff2a20, toneMapped: false }),
      capacity * 2,
    );
    this.pool = instanced(
      scene,
      PLANE,
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture('rgba(255,240,205,0.85)', 'rgba(255,220,160,0)'),
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      capacity,
    );
    for (const mesh of [
      this.lower,
      this.cabin,
      this.cabinPaint,
      this.bonnet,
      this.boot,
      this.bed,
      this.cab,
      this.spoiler,
      this.wheel,
      this.head,
      this.tail,
      this.pool,
    ]) {
      this.meshes.push(mesh);
    }

    this._car = new THREE.Matrix4();
    this._part = new THREE.Matrix4();
    this._spin = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
  }

  /** Start drawing a car here; returns its instance slot, or -1 when the pool is full. */
  add(car) {
    if (this.count >= this.capacity) return -1;
    const index = this.count;
    this.count += 1;
    this.cars[index] = car;
    car.instancedIndex = index;
    car.instancePaint = new THREE.Color(car.colour);
    car.instanceBed = new THREE.Color(darken(car.colour, 0.62));
    this.writeColours(index, car);
    return index;
  }

  writeColours(index, car) {
    this.lower.setColorAt(index, car.instancePaint);
    this.bonnet.setColorAt(index, car.instancePaint);
    this.boot.setColorAt(index, car.instancePaint);
    this.bed.setColorAt(index, car.instanceBed);
    this.cabin.setColorAt(index, GLASS);
    this.cabinPaint.setColorAt(index, car.instancePaint);
    this.pool.setColorAt(index, POOL_TINT);
    for (let k = 0; k < 4; k += 1) this.wheel.setColorAt(index * 4 + k, WHEEL_COLOUR);
  }

  /** Stop drawing a car here (it was taken, and now builds its own meshes). */
  remove(car) {
    const index = car.instancedIndex;
    if (index === undefined || index < 0) return;
    const last = this.count - 1;
    if (index !== last) {
      const moved = this.cars[last];
      this.cars[index] = moved;
      moved.instancedIndex = index;
      this.writeColours(index, moved);
    }
    this.cars[last] = null;
    this.count = last;
    car.instancedIndex = -1;
  }

  /** Rewrite every instance matrix from the cars' own state. */
  sync() {
    const count = this.count;
    for (let i = 0; i < count; i += 1) {
      const car = this.cars[i];
      const parts = carParts(car.modelKey);
      this._pos.copy(car.position);
      this._quat.setFromAxisAngle(UP, car.heading);
      this._car.compose(this._pos, this._quat, ONE);

      this._part.multiplyMatrices(this._car, parts.lower);
      this.lower.setMatrixAt(i, this._part);
      // A van's cabin is painted; every other car's is glass.
      if (car.spec.boxy) {
        this._part.makeScale(0, 0, 0);
        this.cabin.setMatrixAt(i, this._part);
        this._part.multiplyMatrices(this._car, parts.cabin);
        this.cabinPaint.setMatrixAt(i, this._part);
      } else {
        this._part.multiplyMatrices(this._car, parts.cabin);
        this.cabin.setMatrixAt(i, this._part);
        this._part.makeScale(0, 0, 0);
        this.cabinPaint.setMatrixAt(i, this._part);
      }
      this._part.multiplyMatrices(this._car, parts.bonnet);
      this.bonnet.setMatrixAt(i, this._part);
      this._part.multiplyMatrices(this._car, parts.boot);
      this.boot.setMatrixAt(i, this._part);
      if (parts.bed) {
        this._part.multiplyMatrices(this._car, parts.bed);
      } else {
        this._part.makeScale(0, 0, 0);
      }
      this.bed.setMatrixAt(i, this._part);
      if (parts.cab) {
        this._part.multiplyMatrices(this._car, parts.cab);
      } else {
        this._part.makeScale(0, 0, 0);
      }
      this.cab.setMatrixAt(i, this._part);
      for (let k = 0; k < 3; k += 1) {
        if (parts.spoiler) {
          this._part.multiplyMatrices(this._car, parts.spoiler[k]);
        } else {
          this._part.makeScale(0, 0, 0);
        }
        this.spoiler.setMatrixAt(i * 3 + k, this._part);
      }

      const spin = car.wheelSpin;
      this._spin.makeRotationX(spin);
      for (let k = 0; k < 4; k += 1) {
        this._part.copy(this._spin);
        this._part.setPosition(parts.wheels[k]);
        this._part.premultiply(this._car);
        this.wheel.setMatrixAt(i * 4 + k, this._part);
      }
      for (let k = 0; k < 2; k += 1) {
        this._part.multiplyMatrices(this._car, parts.heads[k]);
        this.head.setMatrixAt(i * 2 + k, this._part);
        this._part.multiplyMatrices(this._car, parts.tails[k]);
        this.tail.setMatrixAt(i * 2 + k, this._part);
      }

      if (car.headlightsOn) {
        this._part.multiplyMatrices(this._car, parts.pool);
      } else {
        this._part.makeScale(0, 0, 0);
      }
      this.pool.setMatrixAt(i, this._part);
    }

    this.lower.count = count;
    this.cabin.count = count;
    this.cabinPaint.count = count;
    this.bonnet.count = count;
    this.boot.count = count;
    this.bed.count = count;
    this.cab.count = count;
    this.spoiler.count = count * 3;
    this.wheel.count = count * 4;
    this.head.count = count * 2;
    this.tail.count = count * 2;
    this.pool.count = count;
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

/** Every pedestrian on the pavement, drawn as five instanced parts. */
export class CrowdInstances {
  constructor(scene, capacity = 64) {
    this.capacity = capacity;
    this.count = 0;
    this.peds = [];
    this.meshes = [];
    const paint = () => new THREE.MeshLambertMaterial({ color: 0xffffff });

    this.torso = instanced(scene, BOX, paint(), capacity);
    this.head = instanced(scene, BOX, paint(), capacity);
    this.hat = instanced(scene, BOX, paint(), capacity);
    this.legs = instanced(scene, BOX, new THREE.MeshLambertMaterial({ color: 0x24262c }), capacity * 2);
    this.bag = instanced(scene, BOX, new THREE.MeshLambertMaterial({ color: 0x2a2a2e }), capacity);
    this.meshes.push(this.torso, this.head, this.hat, this.legs, this.bag);

    this._ped = new THREE.Matrix4();
    this._base = new THREE.Matrix4();
    this._body = new THREE.Matrix4();
    this._part = new THREE.Matrix4();
    this._local = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._scale = new THREE.Vector3(1, 1, 1);

    // The parts, in the same places traffic.js puts them.
    this.torsoLocal = boxMatrix(0, 1.24, 0, 0.46, 0.6, 0.28);
    this.headLocal = boxMatrix(0, 1.68, 0, 0.26, 0.28, 0.26);
    this.hatLocal = boxMatrix(0, 1.84, 0, 0.3, 0.1, 0.3);
    this.bagLocal = boxMatrix(0.28, 1.1, 0.1, 0.2, 0.3, 0.12);
  }

  add(ped) {
    if (this.count >= this.capacity) return -1;
    const index = this.count;
    this.count += 1;
    this.peds[index] = ped;
    ped.instancedIndex = index;
    this.writeColours(index, ped);
    return index;
  }

  writeColours(index, ped) {
    this.torso.setColorAt(index, ped.coatColour);
    this.head.setColorAt(index, ped.skinColour);
    this.hat.setColorAt(index, ped.hatColour);
    this.bag.setColorAt(index, ped.bagColour);
  }

  remove(ped) {
    const index = ped.instancedIndex;
    if (index === undefined || index < 0) return;
    const last = this.count - 1;
    if (index !== last) {
      const moved = this.peds[last];
      this.peds[index] = moved;
      moved.instancedIndex = index;
      this.writeColours(index, moved);
    }
    this.peds[last] = null;
    this.count = last;
    ped.instancedIndex = -1;
  }

  sync() {
    const count = this.count;
    for (let i = 0; i < count; i += 1) {
      const ped = this.peds[i];
      const height = ped.height;
      this._pos.copy(ped.position);
      this._quat.setFromAxisAngle(UP, ped.heading);
      this._scale.set(height, height, height);
      this._ped.compose(this._pos, this._quat, this._scale);

      // The body carries the walk bob, or the fall when the walker is down.
      if (ped.dead) {
        this._body.makeRotationX(-Math.PI / 2);
        this._body.setPosition(0, 0.2, 0);
      } else {
        this._body.makeTranslation(0, ped.bob, 0);
      }
      this._base.multiplyMatrices(this._ped, this._body);
      // A body that has lain there long enough is cleared away by drawing it at no size.
      if (ped.dead && ped.deathTimer > 30) this._base.makeScale(0, 0, 0);

      this._part.multiplyMatrices(this._base, this.torsoLocal);
      this.torso.setMatrixAt(i, this._part);
      this._part.multiplyMatrices(this._base, this.headLocal);
      this.head.setMatrixAt(i, this._part);
      if (ped.hasHat) {
        this._part.multiplyMatrices(this._base, this.hatLocal);
      } else {
        this._part.makeScale(0, 0, 0);
      }
      this.hat.setMatrixAt(i, this._part);
      this._part.multiplyMatrices(this._base, this.bagLocal);
      this.bag.setMatrixAt(i, this._part);

      for (let k = 0; k < 2; k += 1) {
        const swing = k === 0 ? ped.legSwing : -ped.legSwing;
        this._local.makeRotationX(swing);
        this._local.setPosition(k === 0 ? -0.12 : 0.12, 0.62, 0);
        this._part.multiplyMatrices(this._base, this._local);
        this.legs.setMatrixAt(i * 2 + k, this._part);
      }
    }

    this.torso.count = count;
    this.head.count = count;
    this.hat.count = count;
    this.bag.count = count;
    this.legs.count = count * 2;
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
