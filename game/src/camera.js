// Third-person camera: mouse orbit with pointer lock, a damped follow, a shoulder
// view when aiming, and a pull-in whenever a building or the ground would come
// between the player and the lens.



import * as THREE from '../vendor/three.min.js';

const MIN_PITCH = -0.28;
const MAX_PITCH = 1.05;

export function createCamera(camera, city) {
  const state = {
    yaw: Math.PI,
    pitch: 0.28,
    distance: 4.8,
    currentDistance: 4.8,
    trauma: 0,
    recoil: 0,
    fov: 62,
    mode: 'foot',
    initialized: false,
    cinematic: null,
  };

  const desired = new THREE.Vector3();
  const target = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const right = new THREE.Vector3();
  const offset = new THREE.Vector3();

  const isBlocked = (x, y, z) => {
    if (y < city.groundHeight(x, z) + 0.35) return true;
    for (const b of city.buildings) {
      if (x > b.minX - 0.4 && x < b.maxX + 0.4 && z > b.minZ - 0.4 && z < b.maxZ + 0.4 && y < b.h + 0.3) {
        return true;
      }
    }
    return false;
  };

  const api = {
    state,
    get yaw() { return state.yaw; },
    get pitch() { return state.pitch; },

    setOrbit(yaw, pitch) {
      state.yaw = yaw;
      state.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
    },

    addShake(amount) {
      state.trauma = Math.min(1, state.trauma + amount);
    },

    addRecoil(amount) {
      state.recoil = Math.min(0.12, state.recoil + amount);
    },


    setCinematic(eye, target, speed = 0.02) {
      state.cinematic = {
        target: new THREE.Vector3(target[0], target[1], target[2]),
        radius: Math.hypot(eye[0] - target[0], eye[2] - target[2]),
        height: eye[1],
        angle: Math.atan2(eye[0] - target[0], eye[2] - target[2]),
        speed,
      };
      state.initialized = true;
    },

    update(dt, focus, input, options = {}) {
      const { inCar = false, speed = 0, aiming = false, lookAhead = 0 } = options;

      if (state.cinematic) {
        const shot = state.cinematic;
        shot.angle += shot.speed * dt;
        camera.position.set(
          shot.target.x + Math.sin(shot.angle) * shot.radius,
          shot.height,
          shot.target.z + Math.cos(shot.angle) * shot.radius,
        );
        camera.lookAt(shot.target);
        if (camera.fov !== 55) {
          camera.fov = 55;
          camera.updateProjectionMatrix();
        }
        return;
      }
      state.mode = inCar ? 'car' : 'foot';

      if (input && (input.locked || input.mouse.dragging)) {
        const { dx, dy } = input.takeMouseDelta();
        state.yaw -= dx * input.mouse.sensitivity * (aiming ? 0.55 : 1);
        state.pitch += dy * input.mouse.sensitivity * (aiming ? 0.5 : 0.85);
      } else if (input) {
        input.takeMouseDelta();
      }
      state.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, state.pitch));
      state.recoil = Math.max(0, state.recoil - dt * 1.4);

      const baseDistance = aiming ? 2.5 : inCar ? 7.6 : 4.7;
      const height = aiming ? 1.62 : inCar ? 2.15 : 1.5;
      const pitch = state.pitch + state.recoil;

      target.copy(focus);
      target.y += height;
      if (lookAhead > 0) {
        target.x += -Math.sin(state.yaw) * lookAhead;
        target.z += -Math.cos(state.yaw) * lookAhead;
      }
      right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
      if (aiming) target.addScaledVector(right, 0.62);

      const cosPitch = Math.cos(pitch);
      offset.set(Math.sin(state.yaw) * cosPitch, Math.sin(pitch), Math.cos(state.yaw) * cosPitch).multiplyScalar(baseDistance);
      desired.copy(target).add(offset);


      let allowed = baseDistance;
      const steps = 9;
      for (let i = 1; i <= steps; i += 1) {
        const t = (i / steps) * baseDistance;
        const x = target.x + (offset.x / baseDistance) * t;
        const y = target.y + (offset.y / baseDistance) * t;
        const z = target.z + (offset.z / baseDistance) * t;
        if (isBlocked(x, y, z)) {
          allowed = Math.max(1.2, t - 0.55);
          break;
        }
      }
      state.currentDistance += (allowed - state.currentDistance) * Math.min(1, dt * (allowed < state.currentDistance ? 22 : 5));
      desired.copy(target).addScaledVector(offset, state.currentDistance / baseDistance);

      const groundY = city.groundHeight(desired.x, desired.z) + 0.55;
      if (desired.y < groundY) desired.y = groundY;

      if (!state.initialized) {
        camera.position.copy(desired);
        state.initialized = true;
      } else {
        const follow = 1 - Math.exp(-dt * (inCar ? 7.5 : 12));
        camera.position.lerp(desired, follow);
      }

      if (state.trauma > 0) {
        const shake = state.trauma * state.trauma;
        camera.position.x += (Math.random() - 0.5) * shake * 0.5;
        camera.position.y += (Math.random() - 0.5) * shake * 0.35;
        camera.position.z += (Math.random() - 0.5) * shake * 0.5;
        state.trauma = Math.max(0, state.trauma - dt * 1.6);
      }

      lookAt.copy(target);
      lookAt.y += 0.12;
      camera.lookAt(lookAt);

      const fovTarget = aiming ? 50 : inCar ? 68 + Math.min(10, speed * 0.28) : 62 + Math.min(5, speed * 0.4);
      state.fov += (fovTarget - state.fov) * Math.min(1, dt * 4);
      if (Math.abs(camera.fov - state.fov) > 0.05) {
        camera.fov = state.fov;
        camera.updateProjectionMatrix();
      }
    },


    orbit(dt, center, radius, height, speed = 0.08) {
      state.yaw += dt * speed;
      const x = center.x + Math.sin(state.yaw) * radius;
      const z = center.z + Math.cos(state.yaw) * radius;
      camera.position.set(x, center.y + height, z);
      camera.lookAt(center.x, center.y + 6, center.z);
      if (camera.fov !== 55) {
        camera.fov = 55;
        camera.updateProjectionMatrix();
      }
      state.initialized = true;
    },
  };

  return api;
}
