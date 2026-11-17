// The camera: a third-person orbit on the mouse that follows the character with a damped spring,
// stays above the pavement, and pulls in when a building would come between it and the player.
// While driving it swings behind the car and widens out with speed.
import * as THREE from '../vendor/three.min.js';

const MIN_PITCH = -0.45;
const MAX_PITCH = 1.15;
const MOUSE_SENSITIVITY = 0.0026;

export class CameraRig {
  constructor(camera, city, input) {
    this.camera = camera;
    this.city = city;
    this.input = input;
    this.yaw = Math.PI;
    this.pitch = 0.28;
    this.distance = 5.6;
    this.wantedDistance = 5.6;
    this.focus = new THREE.Vector3(150, 1.6, 150);
    this.position = new THREE.Vector3(150, 4, 156);
    this.lookAt = new THREE.Vector3();
    this.mode = 'foot';
    this.shake = 0;
    this.shakePhase = 0;
    this.fovTarget = 62;
    this.fov = 62;
    this.snapNext = true;
    this.hold = false;
  }

  /** A knock on the camera, used by gunshots, crashes and taking a hit. */
  kick(amount) {
    this.shake = Math.min(0.6, this.shake + amount);
  }

  /** Jump the camera to a pose with no damping: used when a shot is staged or a mission starts. */
  snapTo(position, lookAt) {
    this.position.copy(position);
    this.lookAt.copy(lookAt);
    this.camera.position.copy(position);
    this.camera.lookAt(lookAt);
    this.snapNext = false;
  }

  /** Put the camera behind a heading (radians, 0 = +Z) at a distance, for staged shots. */
  setOrbit(yaw, pitch, distance = this.distance) {
    this.yaw = yaw;
    this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
    this.distance = distance;
    this.wantedDistance = distance;
    this.snapNext = true;
  }

  update(dt, player) {
    if (this.hold) return;
    const mouse = this.input.takeMouse();
    if (this.input.locked) {
      this.yaw -= mouse.dx * MOUSE_SENSITIVITY;
      this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch + mouse.dy * MOUSE_SENSITIVITY));
    }
    if (mouse.wheel !== 0) {
      this.wantedDistance = Math.max(3.4, Math.min(9, this.wantedDistance + mouse.wheel * 0.6));
    }
    this.wantedDistance = Math.max(3.4, Math.min(9, this.wantedDistance + (this.input.mouse.right ? -0.9 : 0) * dt * 4));

    const focusY = player.position.y + 1.5;
    this.focus.lerp(new THREE.Vector3(player.position.x, focusY, player.position.z), this.snapNext ? 1 : 1 - Math.exp(-14 * dt));

    const cosPitch = Math.cos(this.pitch);
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch) + 0.35,
      Math.cos(this.yaw) * cosPitch,
    ).multiplyScalar(this.wantedDistance);

    const desired = this.focus.clone().add(offset);
    // Do not let the camera sink into the pavement or the raised sidewalks.
    const floor = this.city.groundAt(desired.x, desired.z) + 0.9;
    if (desired.y < floor) desired.y = floor;

    // Pull in when a building blocks the line of sight.
    const clear = this.city.cameraClearT(this.focus, desired);
    if (clear < 1) {
      desired.copy(this.focus).add(offset.multiplyScalar(Math.max(0.18, clear)));
      if (desired.y < floor) desired.y = floor;
    }

    if (this.snapNext) {
      this.position.copy(desired);
      this.snapNext = false;
    } else {
      this.position.lerp(desired, 1 - Math.exp(-11 * dt));
    }

    this.lookAt.lerp(new THREE.Vector3(this.focus.x, this.focus.y + 0.1, this.focus.z), 1 - Math.exp(-16 * dt));

    // Shake decays quickly; a little noise on the position and the look target sells a hit.
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.shakePhase += dt * 42;
    const shakeAmount = this.shake * this.shake;
    const shakeX = Math.sin(this.shakePhase * 1.7) * shakeAmount * 0.35;
    const shakeY = Math.cos(this.shakePhase * 2.3) * shakeAmount * 0.28;

    this.camera.position.set(this.position.x + shakeX, this.position.y + shakeY, this.position.z);
    this.camera.lookAt(this.lookAt.x + shakeX * 0.5, this.lookAt.y + shakeY * 0.5, this.lookAt.z);

    this.fov = this.fov + (this.fovTarget - this.fov) * (1 - Math.exp(-6 * dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Chase camera for a car: behind the heading, higher, wider, with the road ahead in view. */
  updateForVehicle(dt, vehicle) {
    if (this.hold) return;
    const mouse = this.input.takeMouse();
    if (this.input.locked) {
      this.yaw -= mouse.dx * MOUSE_SENSITIVITY * 0.8;
    }
    // The camera settles behind the car, but the mouse can look around it.
    let difference = vehicle.heading + Math.PI - this.yaw;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    const follow = 1 - Math.exp(-(1.8 + Math.abs(vehicle.speed) * 0.12) * dt);
    this.yaw += difference * follow;
    this.pitch = Math.max(-0.2, Math.min(0.7, this.pitch + mouse.dy * MOUSE_SENSITIVITY * 0.5));

    const speedRatio = Math.min(1, Math.abs(vehicle.speed) / 40);
    this.wantedDistance = 6.4 + speedRatio * 2.4;
    this.fovTarget = 62 + speedRatio * 12;

    const focus = new THREE.Vector3(
      vehicle.position.x - Math.sin(vehicle.heading) * 3.2,
      vehicle.position.y + 1.9,
      vehicle.position.z - Math.cos(vehicle.heading) * 3.2,
    );
    this.focus.lerp(focus, 1 - Math.exp(-10 * dt));

    const height = 2.5 + this.pitch * 2.4;
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * this.wantedDistance,
      height,
      Math.cos(this.yaw) * this.wantedDistance,
    );
    const desired = this.focus.clone().add(offset);
    const floor = this.city.groundAt(desired.x, desired.z) + 1;
    if (desired.y < floor) desired.y = floor;
    const clear = this.city.cameraClearT(this.focus, desired);
    if (clear < 1) {
      desired.copy(this.focus).add(offset.multiplyScalar(Math.max(0.3, clear)));
      if (desired.y < floor) desired.y = floor;
    }
    this.position.lerp(desired, 1 - Math.exp(-9 * dt));
    this.lookAt.lerp(this.focus, 1 - Math.exp(-14 * dt));

    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookAt);

    this.fov = this.fov + (this.fovTarget - this.fov) * (1 - Math.exp(-4 * dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
