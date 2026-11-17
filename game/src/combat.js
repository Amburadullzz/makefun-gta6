// The pistol: aim, fire, and everything a bullet does. A ray is cast from the character's chest
// along the crosshair; the nearest thing it crosses is hit, unless a wall is in the way. Muzzle
// flash, tracer, sparks and the recoil kick all live here, as does the ammo count.
import * as THREE from '../vendor/three.min.js';

const RANGE = 70;
const MAGAZINE = 12;
const RELOAD_TIME = 1.15;
const FIRE_INTERVAL = 0.19;

export class Combat {
  constructor(scene, city, camera, state, police, traffic, fleet, audio, cameraRig) {
    this.scene = scene;
    this.city = city;
    this.camera = camera;
    this.state = state;
    this.police = police;
    this.traffic = traffic;
    this.fleet = fleet;
    this.audio = audio;
    this.cameraRig = cameraRig;

    this.ammo = MAGAZINE;
    this.reserve = 96;
    this.reloading = 0;
    this.cooldown = 0;
    this.aiming = false;
    this.hitMarker = 0;
    this.hurtFlash = 0;
    this.shotsFired = 0;
    this.hits = 0;

    this.muzzleLight = new THREE.PointLight(0xffd9a0, 0, 16, 2);
    scene.add(this.muzzleLight);
    this.tracerMaterial = new THREE.LineBasicMaterial({
      color: 0xfff0c0,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
    });
    this.tracer = new THREE.Line(new THREE.BufferGeometry(), this.tracerMaterial);
    this.tracer.visible = false;
    this.tracer.frustumCulled = false;
    scene.add(this.tracer);
    this.tracerLife = 0;

    // A shared spark burst, recycled for every impact.
    const sparkCount = 24;
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(sparkCount * 3), 3));
    this.sparks = new THREE.Points(
      sparkGeometry,
      new THREE.PointsMaterial({
        color: 0xffcf8a,
        size: 0.16,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.sparks.visible = false;
    this.sparks.frustumCulled = false;
    this.sparkCount = sparkCount;
    this.sparkVelocity = [];
    scene.add(this.sparks);
    this.sparkLife = 0;
  }

  reload() {
    if (this.reloading > 0 || this.ammo === MAGAZINE || this.reserve === 0) return;
    this.reloading = RELOAD_TIME;
  }

  /** Where the pistol is and which way it points, from the player and the camera. */
  aimRay(player) {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const origin = new THREE.Vector3(player.position.x, player.position.y + 1.35, player.position.z);
    origin.addScaledVector(forward, 0.7);
    return { origin, direction: forward };
  }

  /** Every target a bullet could hit, from the pedestrians, the officers and the cars. */
  collectTargets() {
    const targets = [];
    for (const ped of this.traffic.peds) {
      if (ped.dead) continue;
      targets.push({ kind: 'pedestrian', ped, position: ped.position, radius: 0.55, height: 1.7 });
    }
    for (const entry of this.police.targets()) targets.push(entry);
    for (const car of this.fleet.cars) {
      if (car === this.fleet.playerCar) continue;
      targets.push({ kind: 'car', car, position: car.position, radius: 1.5, height: 1.4 });
    }
    for (const car of this.traffic.cars) {
      targets.push({ kind: 'car', car, position: car.position, radius: 1.5, height: 1.4 });
    }
    // Mission enemies are targets too; the missions module supplies them.
    if (this.extraTargets) for (const target of this.extraTargets()) targets.push(target);
    return targets;
  }

  /** Fire one round: the trigger, the flash, the ray, the consequence. */
  fire(player) {
    if (this.reloading > 0 || this.cooldown > 0) return null;
    if (this.ammo <= 0) {
      this.reload();
      return null;
    }
    this.ammo -= 1;
    this.cooldown = FIRE_INTERVAL;
    this.shotsFired += 1;

    const { origin, direction } = this.aimRay(player);
    // A little spread, tighter when aiming.
    const spread = this.aiming ? 0.004 : 0.018;
    direction.x += (Math.random() - 0.5) * spread;
    direction.y += (Math.random() - 0.5) * spread;
    direction.z += (Math.random() - 0.5) * spread;
    direction.normalize();

    const end = origin.clone().addScaledVector(direction, RANGE);
    let hit = null;
    let hitDistance = RANGE;

    for (const target of this.collectTargets()) {
      const toTarget = new THREE.Vector3(
        target.position.x - origin.x,
        target.position.y + (target.height ?? 1) * 0.55 - origin.y,
        target.position.z - origin.z,
      );
      const along = toTarget.dot(direction);
      if (along < 0.5 || along > hitDistance) continue;
      const perpendicular = toTarget.clone().addScaledVector(direction, -along).length();
      if (perpendicular > (target.radius ?? 0.6) + 0.35) continue;
      // Do not shoot through a building.
      const point = origin.clone().addScaledVector(direction, along);
      if (this.city.isInsideBuilding(point.x, point.z)) continue;
      hit = target;
      hitDistance = along;
    }

    // The tracer and the flash.
    const impact = origin.clone().addScaledVector(direction, Math.min(hitDistance, RANGE));
    this.showTracer(origin, impact);
    this.showFlash(player, origin);
    this.burst(impact, hit ? 0xff9a7a : 0xffd8a0);
    this.audio.gunshot(1, player.position);
    this.cameraRig.kick(this.aiming ? 0.09 : 0.16);

    if (hit) this.applyHit(hit, direction, impact);
    else this.traffic.scare(player.position.x, player.position.z, 22);

    // Firing in public is a crime; the city hears it.
    this.police.reportCrime('gunshot', player.position);
    this.traffic.scare(player.position.x, player.position.z, 30);
    return { hit, point: impact };
  }

  applyHit(hit, direction, point) {
    this.hits += 1;
    this.hitMarker = 0.18;
    if (hit.kind === 'pedestrian') {
      hit.ped.kill('shot');
      this.burst(point, 0xff3b3b, 0.35);
      this.police.reportCrime('rampage', point);
    } else if (hit.kind === 'officer' || hit.kind === 'enforcer') {
      const died = hit.officer.hit(34);
      this.burst(point, 0xff3b3b, 0.3);
      this.police.reportCrime('officer', point);
      if (died) this.audio.thud(point);
    } else if (hit.kind === 'car' || hit.kind === 'policeCar') {
      const car = hit.car;
      const wrecked = car.damage(18);
      this.burst(point, 0xbfd8ff, 0.25);
      if (wrecked) this.burst(point, 0xffa040, 0.6);
    }
  }

  showTracer(from, to) {
    const positions = this.tracer.geometry.attributes.position;
    if (!positions || positions.count !== 2) {
      this.tracer.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    }
    const array = this.tracer.geometry.attributes.position.array;
    array[0] = from.x;
    array[1] = from.y;
    array[2] = from.z;
    array[3] = to.x;
    array[4] = to.y;
    array[5] = to.z;
    this.tracer.geometry.attributes.position.needsUpdate = true;
    this.tracer.visible = true;
    this.tracerLife = 0.055;
  }

  showFlash(player, origin) {
    this.muzzleLight.position.copy(origin);
    this.muzzleLight.intensity = 40;
    this.flashLife = 0.05;
    void player;
  }

  burst(point, colour, scale = 1) {
    const array = this.sparks.geometry.attributes.position.array;
    this.sparkVelocity = [];
    for (let i = 0; i < this.sparkCount; i += 1) {
      array[i * 3] = point.x;
      array[i * 3 + 1] = point.y;
      array[i * 3 + 2] = point.z;
      const speed = (0.8 + Math.random() * 2.4) * scale;
      this.sparkVelocity.push(
        new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed),
      );
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.material.color.setHex(colour);
    this.sparks.visible = true;
    this.sparkLife = 0.35;
  }

  onPlayerHurt() {
    this.hurtFlash = 0.5;
  }

  update(dt, player, input) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.hitMarker = Math.max(0, this.hitMarker - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    this.aiming = player.inVehicle ? false : input.mouse.right;
    player.aiming = this.aiming;

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const needed = MAGAZINE - this.ammo;
        const loaded = Math.min(needed, this.reserve);
        this.ammo += loaded;
        this.reserve -= loaded;
        this.reloading = 0;
      }
    }
    if (input.pressed('reload')) this.reload();
    if (input.mouse.left && !player.inVehicle) this.fire(player);

    if (this.tracerLife > 0) {
      this.tracerLife -= dt;
      this.tracerMaterial.opacity = Math.max(0, this.tracerLife / 0.055) * 0.9;
      if (this.tracerLife <= 0) this.tracer.visible = false;
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.muzzleLight.intensity = Math.max(0, this.flashLife / 0.05) * 40;
    }
    if (this.sparkLife > 0) {
      this.sparkLife -= dt;
      const array = this.sparks.geometry.attributes.position.array;
      for (let i = 0; i < this.sparkCount; i += 1) {
        const velocity = this.sparkVelocity[i];
        array[i * 3] += velocity.x * dt;
        array[i * 3 + 1] += velocity.y * dt;
        array[i * 3 + 2] += velocity.z * dt;
        velocity.y -= 9 * dt;
      }
      this.sparks.geometry.attributes.position.needsUpdate = true;
      this.sparks.material.opacity = Math.max(0, this.sparkLife / 0.35);
      if (this.sparkLife <= 0) this.sparks.visible = false;
    }
  }
}
