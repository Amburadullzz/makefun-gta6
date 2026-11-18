// Rook Adair, on foot: a readable low-poly body with a walk cycle, acceleration and friction,
// a sprint, a jump with gravity, and a ground clamp against the city's sidewalks. The body is
// built from boxes in a hierarchy of pivots so the limbs swing and the pistol hand aims.
import * as THREE from '../vendor/three.min.js';

const WALK_SPEED = 4.4;
const SPRINT_SPEED = 8.2;
const ACCELERATION = 34;
const AIR_CONTROL = 0.28;
const FRICTION = 12;
const GRAVITY = 22;
const JUMP_SPEED = 6.6;

const SKIN = 0xc79a76;
const JACKET = 0x2c3f57;
const JACKET_DARK = 0x1e2c3e;
const TROUSERS = 0x24272d;
const BOOTS = 0x14161a;
const HAIR = 0x2a1f1a;
const SCARF = 0xb3452f;

export class Player {
  constructor(scene, city, state) {
    this.city = city;
    this.state = state;
    this.position = new THREE.Vector3(150, 0, 150);
    this.velocity = new THREE.Vector3();
    this.yaw = Math.PI;
    this.radius = 0.42;
    this.eyeHeight = 1.62;
    this.onGround = true;
    this.sprinting = false;
    this.aiming = false;
    this.walkPhase = 0;
    this.speed = 0;
    this.inVehicle = null;
    this.hurtFlash = 0;

    this.group = new THREE.Group();
    this.group.name = 'rook';
    scene.add(this.group);
    this.buildBody();
    this.teleport(150, 150);
  }

  /** The body: hips carry the legs, shoulders carry the arms, so a swing is one rotation each. */
  buildBody() {
    // A little self-illumination keeps the character readable against wet asphalt at night.
    const material = (colour) =>
      new THREE.MeshLambertMaterial({ color: colour, emissive: new THREE.Color(colour).multiplyScalar(0.3) });

    this.body = new THREE.Group();
    this.group.add(this.body);

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.3), material(TROUSERS));
    hips.position.y = 0.95;
    this.body.add(hips);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.32), material(JACKET));
    torso.position.y = 1.39;
    this.body.add(torso);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.22, 0.34), material(JACKET_DARK));
    chest.position.y = 1.62;
    this.body.add(chest);

    const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.36), material(SCARF));
    scarf.position.y = 1.74;
    this.body.add(scarf);

    this.head = new THREE.Group();
    this.head.position.y = 1.86;
    this.body.add(this.head);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), material(SKIN));
    this.head.add(skull);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.13, 0.32), material(HAIR));
    hair.position.y = 0.13;
    this.head.add(hair);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.08), material(0xb08360));
    nose.position.set(0, -0.02, 0.17);
    this.head.add(nose);

    // Arms: a pivot at the shoulder with the limb hanging below it.
    this.arms = {};
    for (const side of ['left', 'right']) {
      const pivot = new THREE.Group();
      const x = side === 'left' ? -0.38 : 0.38;
      pivot.position.set(x, 1.6, 0);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.18), material(JACKET));
      upper.position.y = -0.25;
      pivot.add(upper);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.16), material(SKIN));
      hand.position.y = -0.55;
      pivot.add(hand);
      this.body.add(pivot);
      this.arms[side] = pivot;
    }

    // A pistol in the right hand, hidden until the player aims or fires.
    this.pistol = new THREE.Group();
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.34), material(0x23262b));
    slide.position.set(0, -0.62, 0.16);
    this.pistol.add(slide);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.1), material(0x15171a));
    grip.position.set(0, -0.72, 0.02);
    this.pistol.add(grip);
    this.pistol.visible = false;
    this.arms.right.add(this.pistol);

    // Legs: a pivot at the hip, with a boot at the bottom.
    this.legs = {};
    for (const side of ['left', 'right']) {
      const pivot = new THREE.Group();
      const x = side === 'left' ? -0.15 : 0.15;
      pivot.position.set(x, 0.92, 0);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.46, 0.22), material(TROUSERS));
      thigh.position.y = -0.23;
      pivot.add(thigh);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.4, 0.2), material(0x1d2025));
      shin.position.y = -0.66;
      pivot.add(shin);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.3), material(BOOTS));
      boot.position.set(0, -0.9, 0.04);
      pivot.add(boot);
      this.body.add(pivot);
      this.legs[side] = pivot;
    }

    // A soft shadow disc under the feet, so the character sits on the road.
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    this.group.add(shadow);
    this.shadow = shadow;
  }

  /** Drop the character at a spot on the ground, clearing any momentum. */
  teleport(x, z, yaw = this.yaw) {
    this.position.set(x, this.city.groundAt(x, z), z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.onGround = true;
    this.speed = 0;
    this.group.position.copy(this.position);
    this.group.rotation.y = yaw;
  }

  get eyePosition() {
    return new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  /** Forward direction the character faces, on the ground plane. */
  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  /**
   * One step of on-foot movement. `cameraYaw` is the direction the camera looks, so pressing W
   * always walks away from the camera; the body turns to face wherever it is actually going.
   */
  update(dt, input, cameraYaw) {
    const moveX = input.axisX();
    const moveZ = input.axisY();
    const wantsSprint = input.held('sprint') && moveZ > 0;
    this.sprinting = wantsSprint;

    const forwardX = -Math.sin(cameraYaw);
    const forwardZ = -Math.cos(cameraYaw);
    const rightX = Math.cos(cameraYaw);
    const rightZ = -Math.sin(cameraYaw);

    let wishX = forwardX * moveZ + rightX * moveX;
    let wishZ = forwardZ * moveZ + rightZ * moveX;
    const wishLength = Math.hypot(wishX, wishZ);
    if (wishLength > 0.001) {
      wishX /= wishLength;
      wishZ /= wishLength;
    }

    const maxSpeed = wantsSprint ? SPRINT_SPEED : WALK_SPEED;
    const control = this.onGround ? 1 : AIR_CONTROL;
    this.velocity.x += wishX * ACCELERATION * control * dt;
    this.velocity.z += wishZ * ACCELERATION * control * dt;

    // Friction: an exponential bleed toward zero, stronger when there is no input.
    const drag = wishLength > 0.001 ? (this.onGround ? 3.2 : 0.4) : FRICTION;
    const damping = Math.exp(-drag * dt);
    this.velocity.x *= damping;
    this.velocity.z *= damping;

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizontalSpeed > maxSpeed) {
      const scale = maxSpeed / horizontalSpeed;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);

    if (this.onGround && input.pressed('jump')) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }

    this.velocity.y -= GRAVITY * dt;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.city.resolveCircle(this.position, this.radius);

    this.position.y += this.velocity.y * dt;
    const ground = this.city.groundAt(this.position.x, this.position.z);
    if (this.position.y <= ground) {
      this.position.y = ground;
      this.velocity.y = 0;
      this.onGround = true;
    } else if (this.position.y > ground + 0.02) {
      this.onGround = false;
    }

    // The body faces the way it moves, turning at a limited rate so it never snaps.
    if (this.speed > 0.4) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      let difference = targetYaw - this.yaw;
      while (difference > Math.PI) difference -= Math.PI * 2;
      while (difference < -Math.PI) difference += Math.PI * 2;
      this.yaw += difference * Math.min(1, dt * 12);
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    this.animate(dt);
  }

  /** Walk cycle, idle breathing, jump tuck and the aim pose. */
  animate(dt) {
    const stride = Math.min(1, this.speed / SPRINT_SPEED);
    this.walkPhase += dt * (4 + this.speed * 1.5);

    if (!this.onGround) {
      this.legs.left.rotation.x = -0.5;
      this.legs.right.rotation.x = 0.35;
      this.arms.left.rotation.x = -0.8;
      this.arms.right.rotation.x = -0.6;
      this.body.position.y = 0;
    } else if (this.speed > 0.25) {
      const swing = Math.sin(this.walkPhase) * (0.55 + stride * 0.55);
      this.legs.left.rotation.x = swing;
      this.legs.right.rotation.x = -swing;
      this.arms.left.rotation.x = -swing * 0.85;
      this.arms.right.rotation.x = swing * 0.85;
      this.body.position.y = Math.abs(Math.sin(this.walkPhase * 2)) * 0.045 * stride;
    } else {
      const idle = Math.sin(this.walkPhase * 0.4) * 0.03;
      this.legs.left.rotation.x = 0;
      this.legs.right.rotation.x = 0;
      this.arms.left.rotation.x = idle;
      this.arms.right.rotation.x = idle;
      this.body.position.y = Math.sin(this.walkPhase * 0.6) * 0.012;
    }

    // Aiming: both arms out front and the pistol up, whichever way the body is walking.
    const aimBlend = this.aiming ? 1 : 0;
    if (aimBlend > 0) {
      this.arms.right.rotation.x = -1.45;
      this.arms.left.rotation.x = -1.3;
      this.arms.left.rotation.z = 0.35;
      this.arms.right.rotation.z = -0.12;
    } else {
      this.arms.left.rotation.z = 0;
      this.arms.right.rotation.z = 0;
    }
    this.pistol.visible = this.aiming;
    this.head.rotation.x = this.aiming ? -0.08 : 0;
    this.shadow.position.y = 0.03 - (this.position.y - this.city.groundAt(this.position.x, this.position.z));
    this.shadow.material.opacity = this.onGround ? 0.34 : 0.16;
  }
}
