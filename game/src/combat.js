// The pistol. Fires a ray from the camera through the crosshair, checks it against
// people, officers, cars and walls, and answers with a muzzle flash, a tracer, an
// impact spark and a hit marker. Ammo and reloading live in the run's state.



import * as THREE from '../vendor/three.min.js';
import { linear, makeGlowTexture } from './geometry.js';
import { damagePlayer } from './state.js';

const FIRE_INTERVAL = 0.19;
const RELOAD_TIME = 1.15;
const RANGE = 90;

export function createCombat(scene, camera, city, state, player, vehicles, traffic, police) {
  const raycaster = new THREE.Raycaster();
  const muzzleWorld = new THREE.Vector3();
  const rayOrigin = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();

  let cooldown = 0;
  let reloading = 0;
  let recoilKick = 0;

  const flash = new THREE.PointLight(0xffd08a, 0, 16, 2);
  scene.add(flash);
  const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('rgba(255,240,200,1)', 'rgba(255,170,60,0)'),
    color: linear(0xffd08a), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  flashSprite.scale.set(1.5, 1.5, 1);
  scene.add(flashSprite);


  const tracers = [];
  for (let i = 0; i < 8; i += 1) {
    const geometry = new THREE.BoxGeometry(0.035, 0.035, 1);
    const material = new THREE.MeshBasicMaterial({
      color: linear(0xffe6a8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  const sparks = [];
  for (let i = 0; i < 10; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,220,150,1)', 'rgba(255,90,20,0)'),
      color: linear(0xffc070), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    }));
    sprite.scale.set(1.1, 1.1, 1);
    sprite.visible = false;
    scene.add(sprite);
    sparks.push({ sprite, life: 0 });
  }

  const spawnTracer = (from, to) => {
    const tracer = tracers.find((item) => item.life <= 0) ?? tracers[0];
    tracer.life = 0.09;
    tracer.mesh.visible = true;
    tracer.mesh.position.copy(from).lerp(to, 0.5);
    tracer.mesh.lookAt(to);
    const length = from.distanceTo(to);
    tracer.mesh.scale.set(1, 1, length);
    tracer.mesh.material.opacity = 0.85;
  };

  const spawnSpark = (point) => {
    const spark = sparks.find((item) => item.life <= 0) ?? sparks[0];
    spark.life = 0.22;
    spark.sprite.visible = true;
    spark.sprite.position.copy(point);
    spark.sprite.material.opacity = 0.9;
    spark.sprite.scale.setScalar(1.4);
  };

  const segmentHitsSphere = (origin, direction, center, radius, maxDistance) => {
    const ox = center.x - origin.x;
    const oy = center.y - origin.y;
    const oz = center.z - origin.z;
    const projection = ox * direction.x + oy * direction.y + oz * direction.z;
    if (projection < 0 || projection > maxDistance) return -1;
    const cx = ox - direction.x * projection;
    const cy = oy - direction.y * projection;
    const cz = oz - direction.z * projection;
    if (cx * cx + cy * cy + cz * cz > radius * radius) return -1;
    return projection;
  };

  const rayBoxDistance = (origin, direction, box) => {
    let tmin = 0;
    let tmax = RANGE;
    for (const axis of ['x', 'y', 'z']) {
      const d = direction[axis];
      const o = origin[axis];
      const min = axis === 'y' ? 0 : box[`min${axis.toUpperCase()}`];
      const max = axis === 'y' ? box.h : box[`max${axis.toUpperCase()}`];
      if (Math.abs(d) < 1e-6) {
        if (o < min || o > max) return -1;
      } else {
        let t1 = (min - o) / d;
        let t2 = (max - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return -1;
      }
    }
    return tmin;
  };

  const fire = () => {
    if (state.mode !== 'play' || state.inCar || reloading > 0 || cooldown > 0) return;
    if (state.ammo <= 0) {
      state.bus.emit('dryFire', {});
      cooldown = 0.35;
      return;
    }
    state.ammo -= 1;
    state.stats.shotsFired += 1;
    cooldown = FIRE_INTERVAL;
    recoilKick = Math.min(0.09, recoilKick + 0.05);

    camera.getWorldDirection(rayDirection);
    rayOrigin.copy(camera.position);

    player.parts.pistol.getWorldPosition(muzzleWorld);

    let nearest = RANGE;
    let victim = null;
    let victimKind = null;

    for (const ped of traffic.pedestrians) {
      if (!ped.alive) continue;
      const center = { x: ped.position.x, y: ped.position.y + 1.05, z: ped.position.z };
      const distance = segmentHitsSphere(rayOrigin, rayDirection, center, 0.55, nearest);
      if (distance >= 0 && distance < nearest) {
        nearest = distance;
        victim = ped;
        victimKind = 'ped';
      }
    }
    for (const officer of police.officers) {
      if (!officer.alive) continue;
      const center = { x: officer.position.x, y: officer.position.y + 1.05, z: officer.position.z };
      const distance = segmentHitsSphere(rayOrigin, rayDirection, center, 0.55, nearest);
      if (distance >= 0 && distance < nearest) {
        nearest = distance;
        victim = officer;
        victimKind = 'officer';
      }
    }
    for (const car of vehicles.cars) {
      const center = { x: car.position.x, y: car.position.y + 0.9, z: car.position.z };
      const distance = segmentHitsSphere(rayOrigin, rayDirection, center, car.specs.length * 0.42, nearest);
      if (distance >= 0 && distance < nearest) {
        nearest = distance;
        victim = car;
        victimKind = 'car';
      }
    }
    let wallDistance = RANGE;
    for (const building of city.buildings) {
      const distance = rayBoxDistance(rayOrigin, rayDirection, building);
      if (distance >= 0 && distance < wallDistance) wallDistance = distance;
    }
    if (wallDistance < nearest) {
      nearest = wallDistance;
      victim = null;
      victimKind = 'wall';
    }

    hitPoint.copy(rayOrigin).addScaledVector(rayDirection, nearest);
    spawnTracer(muzzleWorld, hitPoint);

    if (victimKind === 'ped') {
      state.stats.shotsHit += 1;
      traffic.knockDown(victim, null);
      state.bus.emit('crime', { kind: 'murder', x: victim.position.x, z: victim.position.z });
      state.bus.emit('hitmark', { kind: 'ped' });
      spawnSpark(hitPoint);
    } else if (victimKind === 'officer') {
      state.stats.shotsHit += 1;
      police.hurtOfficer(victim, 45);
      state.bus.emit('hitmark', { kind: 'officer' });
      spawnSpark(hitPoint);
    } else if (victimKind === 'car') {
      state.stats.shotsHit += 1;
      victim.health -= 12;
      victim.speed *= 0.97;
      spawnSpark(hitPoint);
      state.bus.emit('hitmark', { kind: 'car' });
      if (victim.health <= 0) state.bus.emit('carWreck', { car: victim });
    } else {
      spawnSpark(hitPoint);
    }

    flash.position.copy(muzzleWorld);
    flash.intensity = 22;
    flashSprite.position.copy(muzzleWorld);
    flashSprite.material.opacity = 0.9;

    state.bus.emit('gunshot', { x: player.position.x, z: player.position.z });
    state.bus.emit('crime', { kind: 'gunfire', x: player.position.x, z: player.position.z });
    state.bus.emit('shot', {});
  };

  const reload = () => {
    if (reloading > 0 || state.ammo >= state.magazineSize || state.ammoReserve <= 0) return;
    reloading = RELOAD_TIME;
    state.bus.emit('reload', {});
  };

  return {
    get reloading() {
      return reloading > 0;
    },
    fire,
    reload,

    update(dt, input, cameraRig) {
      cooldown = Math.max(0, cooldown - dt);
      reloading = Math.max(0, reloading - dt);
      recoilKick = Math.max(0, recoilKick - dt * 0.5);

      if (reloading === 0 && state.ammo === 0 && state.ammoReserve > 0) {
        const missing = state.magazineSize - state.ammo;
        const load = Math.min(missing, state.ammoReserve);
        state.ammo += load;
        state.ammoReserve -= load;
      }

      if (input.pressed('fire')) fire();
      if (input.pressed('reload')) reload();

      if (flash.intensity > 0) flash.intensity = Math.max(0, flash.intensity - dt * 380);
      if (flashSprite.material.opacity > 0) flashSprite.material.opacity = Math.max(0, flashSprite.material.opacity - dt * 12);
      flashSprite.position.copy(flash.position);

      for (const tracer of tracers) {
        if (tracer.life > 0) {
          tracer.life -= dt;
          tracer.mesh.material.opacity = Math.max(0, tracer.life / 0.09) * 0.85;
          if (tracer.life <= 0) tracer.mesh.visible = false;
        }
      }
      for (const spark of sparks) {
        if (spark.life > 0) {
          spark.life -= dt;
          spark.sprite.material.opacity = Math.max(0, spark.life / 0.22) * 0.9;
          spark.sprite.scale.setScalar(1.4 + (0.22 - spark.life) * 5);
          if (spark.life <= 0) spark.sprite.visible = false;
        }
      }
      if (recoilKick > 0) cameraRig.addRecoil(recoilKick * dt * 6);
    },


    damagePlayer(amount, source) {
      damagePlayer(state, amount, source);
    },
  };
}
