// Mara Voss: the body you walk around in. A readable low-poly figure with a walk
// cycle, acceleration and friction, sprint, jump and gravity, clamped to the city's
// ground height and pushed out of its buildings.



import * as THREE from '../vendor/three.min.js';
import { linear, makeShadowBlob } from './geometry.js';

const WALK_SPEED = 4.4;
const SPRINT_SPEED = 8.4;
const ACCELERATION = 46;
const FRICTION = 13;
const GRAVITY = 22;
const JUMP_SPEED = 7.2;
const TURN_RATE = 13;

export function createPlayer(scene, city, state) {
  const group = new THREE.Group();
  group.name = 'player';
  scene.add(group);

  const skin = new THREE.MeshStandardMaterial({ color: linear(0xc08a68), roughness: 0.75 });
  const jacket = new THREE.MeshStandardMaterial({ color: linear(0x7a5a2e), roughness: 0.55, metalness: 0.1 });
  const stripe = new THREE.MeshBasicMaterial({ color: linear(0x4fe6ff) });
  const pants = new THREE.MeshStandardMaterial({ color: linear(0x39404e), roughness: 0.85 });
  const boots = new THREE.MeshStandardMaterial({ color: linear(0x0d0f13), roughness: 0.5, metalness: 0.3 });
  const hair = new THREE.MeshStandardMaterial({ color: linear(0x171317), roughness: 0.9 });
  const scarf = new THREE.MeshStandardMaterial({ color: linear(0xb02a3f), roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: linear(0x2b3038), roughness: 0.35, metalness: 0.8 });

  const box = (w, h, d, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    return mesh;
  };

  const body = new THREE.Group();
  group.add(body);

  const hips = box(0.42, 0.24, 0.26, pants, 0, 0.92, 0);
  const torso = box(0.5, 0.58, 0.28, jacket, 0, 1.32, 0);
  const chestStripe = box(0.09, 0.5, 0.02, stripe, 0.15, 1.34, 0.15);
  const shoulderL = box(0.16, 0.03, 0.2, stripe, -0.19, 1.56, 0.06);
  const shoulderR = box(0.16, 0.03, 0.2, stripe, 0.19, 1.56, 0.06);
  const backPatch = box(0.16, 0.1, 0.02, stripe, 0, 1.34, -0.15);

  const bag = box(0.42, 0.34, 0.18, new THREE.MeshStandardMaterial({ color: linear(0x2c333e), roughness: 0.8 }), 0, 1.3, -0.24);
  const bagStripe = box(0.44, 0.05, 0.02, stripe, 0, 1.36, -0.34);
  const bagFlap = box(0.4, 0.14, 0.2, new THREE.MeshStandardMaterial({ color: linear(0x454e5c), roughness: 0.75 }), 0, 1.44, -0.25);
  const collar = box(0.46, 0.1, 0.3, scarf, 0, 1.6, 0);
  const neck = box(0.14, 0.1, 0.14, skin, 0, 1.64, 0);
  const head = box(0.27, 0.3, 0.27, skin, 0, 1.82, 0);
  const hairBack = box(0.29, 0.2, 0.29, hair, 0, 1.92, -0.01);
  const fringe = box(0.28, 0.07, 0.06, hair, 0, 1.93, 0.13);
  body.add(hips, torso, chestStripe, shoulderL, shoulderR, backPatch, bag, bagStripe, bagFlap, collar, neck, head, hairBack, fringe);

  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.33, 1.55, 0);
    const upper = box(0.13, 0.34, 0.15, jacket, 0, -0.17, 0);
    const lower = box(0.12, 0.3, 0.14, jacket, 0, -0.47, 0);
    const hand = box(0.11, 0.12, 0.12, skin, 0, -0.66, 0);
    pivot.add(upper, lower, hand);
    body.add(pivot);
    return pivot;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  const pistol = new THREE.Group();
  const barrel = box(0.07, 0.07, 0.34, metal, 0, 0, 0.1);
  const grip = box(0.06, 0.16, 0.09, metal, 0, -0.1, -0.04);
  pistol.add(barrel, grip);
  pistol.position.set(0, -0.68, 0.08);
  pistol.rotation.x = -0.1;
  armR.add(pistol);

  const makeLeg = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.13, 0.86, 0);
    const thigh = box(0.17, 0.42, 0.19, pants, 0, -0.21, 0);
    const shin = box(0.15, 0.38, 0.17, pants, 0, -0.6, 0);
    const boot = box(0.17, 0.13, 0.26, boots, 0, -0.8, 0.04);
    pivot.add(thigh, shin, boot);
    body.add(pivot);
    return pivot;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  const shadow = makeShadowBlob(1.5, 1.5, 0.85);
  shadow.position.y = 0.03;
  group.add(shadow);

  const player = {
    group,
    body,
    position: new THREE.Vector3(0, 0.14, 0),
    velocity: new THREE.Vector3(),
    heading: Math.PI,
    walkPhase: 0,
    onGround: true,
    sprinting: false,
    aiming: false,
    speed: 0,
    footstepTimer: 0,
    alive: true,
    radius: 0.42,
    parts: { armL, armR, legL, legR, pistol, torso, head },

    setVisible(visible) {
      group.visible = visible;
    },

    place(x, z, heading = player.heading) {
      player.position.set(x, city.groundHeight(x, z), z);
      player.heading = heading;
      player.velocity.set(0, 0, 0);
      player.onGround = true;
      group.position.copy(player.position);
      group.rotation.y = heading;
    },

    update(dt, controls, cameraYaw) {
      if (!player.alive) return;


      const forwardX = -Math.sin(cameraYaw);
      const forwardZ = -Math.cos(cameraYaw);
      const rightX = Math.cos(cameraYaw);
      const rightZ = -Math.sin(cameraYaw);
      let ix = 0;
      let iz = 0;
      if (controls.forward) { ix += forwardX; iz += forwardZ; }
      if (controls.back) { ix -= forwardX; iz -= forwardZ; }
      if (controls.right) { ix += rightX; iz += rightZ; }
      if (controls.left) { ix -= rightX; iz -= rightZ; }
      const intentLength = Math.hypot(ix, iz);
      if (intentLength > 0) {
        ix /= intentLength;
        iz /= intentLength;
      }

      const wantsSprint = controls.sprint && intentLength > 0 && state.stamina > 4 && !player.aiming;
      player.sprinting = wantsSprint;
      const maxSpeed = wantsSprint ? SPRINT_SPEED : WALK_SPEED;
      const accel = player.onGround ? ACCELERATION : ACCELERATION * 0.32;


      player.velocity.x += ix * accel * dt;
      player.velocity.z += iz * accel * dt;
      if (intentLength === 0 && player.onGround) {
        const damping = Math.max(0, 1 - FRICTION * dt);
        player.velocity.x *= damping;
        player.velocity.z *= damping;
      }

      const horizontal = Math.hypot(player.velocity.x, player.velocity.z);
      if (horizontal > maxSpeed) {
        const scale = maxSpeed / horizontal;
        player.velocity.x *= scale;
        player.velocity.z *= scale;
      }
      player.speed = Math.hypot(player.velocity.x, player.velocity.z);


      if (controls.jump && player.onGround) {
        player.velocity.y = JUMP_SPEED;
        player.onGround = false;
        state.bus.emit('jump', {});
      }
      player.velocity.y -= GRAVITY * dt;

      player.position.x += player.velocity.x * dt;
      player.position.z += player.velocity.z * dt;
      player.position.y += player.velocity.y * dt;

      const resolved = city.resolveCollision(player.position.x, player.position.z, player.radius);
      if (resolved.blocked) {
        player.position.x = resolved.x;
        player.position.z = resolved.z;
        player.velocity.x *= 0.2;
        player.velocity.z *= 0.2;
      }

      const ground = city.groundHeight(player.position.x, player.position.z);
      if (player.position.y <= ground) {
        player.position.y = ground;
        player.velocity.y = 0;
        player.onGround = true;
      } else if (player.position.y > ground + 0.02) {
        player.onGround = false;
      }


      if (player.speed > 0.4) {
        const targetHeading = Math.atan2(player.velocity.x, player.velocity.z);
        let delta = targetHeading - player.heading;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        player.heading += delta * Math.min(1, TURN_RATE * dt);
      }


      if (wantsSprint) state.stamina = Math.max(0, state.stamina - 19 * dt);
      else state.stamina = Math.min(100, state.stamina + (player.speed < 0.5 ? 22 : 9) * dt);


      const cycleSpeed = player.speed * 1.55;
      player.walkPhase += cycleSpeed * dt;
      const swing = Math.min(1, player.speed / WALK_SPEED);
      const phase = player.walkPhase;
      const legSwing = Math.sin(phase) * 0.75 * swing;
      const armSwing = Math.sin(phase + Math.PI) * 0.55 * swing;
      legL.rotation.x = player.onGround ? legSwing : -0.5;
      legR.rotation.x = player.onGround ? -legSwing : 0.35;
      if (player.aiming) {
        armR.rotation.x = -1.5;
        armR.rotation.z = -0.12;
        armL.rotation.x = -1.35;
        armL.rotation.z = 0.25;
        torso.rotation.y = 0.12;
      } else {
        armR.rotation.x = armSwing;
        armR.rotation.z = 0;
        armL.rotation.x = -armSwing;
        armL.rotation.z = 0;
        torso.rotation.y = 0;
      }
      body.position.y = player.onGround ? Math.abs(Math.sin(phase)) * 0.05 * swing : 0;
      torso.rotation.x = player.sprinting ? 0.16 : 0.04;
      head.rotation.y = Math.sin(phase * 0.5) * 0.08 * (1 - swing);

      group.position.copy(player.position);
      group.rotation.y = player.heading;
      shadow.position.y = 0.02 - (player.position.y - ground);


      if (player.onGround && player.speed > 1.2) {
        player.footstepTimer -= dt * player.speed;
        if (player.footstepTimer <= 0) {
          player.footstepTimer = 2.1;
          state.bus.emit('footstep', { sprint: player.sprinting });
        }
      }
    },

    hurt() {
      player.alive = false;
      body.rotation.x = -1.35;
      body.position.y = 0.2;
    },

    revive() {
      player.alive = true;
      body.rotation.x = 0;
      body.position.y = 0;
    },
  };

  return player;
}
