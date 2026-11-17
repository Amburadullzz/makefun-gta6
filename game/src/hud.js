// The interface: money, health, wanted stars, the objective line and a circular
// minimap drawn from the same road and block rectangles the city was built from.
// Everything here reads the run's state; nothing here changes it.



import { formatMoney, formatClock } from './state.js';

const MAP_RADIUS_METRES = 105;

export function createHud(city, state, camera) {
  const el = {
    hud: document.getElementById('hud'),
    money: document.getElementById('money-value'),
    wanted: document.getElementById('wanted'),
    healthFill: document.getElementById('health-fill'),
    healthValue: document.getElementById('health-value'),
    stamina: document.getElementById('stamina-fill'),
    ammoMag: document.getElementById('ammo-mag'),
    ammoReserve: document.getElementById('ammo-reserve'),
    kicker: document.getElementById('mission-kicker'),
    objective: document.getElementById('mission-objective'),
    distance: document.getElementById('mission-distance'),
    district: document.getElementById('district-name'),
    mapLabel: document.getElementById('minimap-label'),
    speedo: document.getElementById('speedo'),
    speed: document.getElementById('speed-value'),
    gear: document.getElementById('gear-value'),
    prompt: document.getElementById('prompt'),
    crosshair: document.getElementById('crosshair'),
    clock: document.getElementById('clock-readout'),
    damage: document.getElementById('damage-flash'),
    toasts: document.getElementById('toast-stack'),
    arrow: document.getElementById('objective-arrow'),
  };

  const canvas = document.getElementById('minimap');
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const centre = size / 2;
  const scale = centre / MAP_RADIUS_METRES;

  const stars = [];
  for (let i = 0; i < 5; i += 1) {
    const span = document.createElement('span');
    span.className = 'star';
    span.textContent = '★';
    el.wanted.appendChild(span);
    stars.push(span);
  }

  let damageTimer = 0;
  let lastMoney = state.money;
  let moneyPulse = 0;
  let promptTimer = 0;

  const toast = (text, kind = '') => {
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.textContent = text;
    el.toasts.appendChild(node);
    window.setTimeout(() => {
      node.classList.add('fade');
      window.setTimeout(() => node.remove(), 520);
    }, 2600);
  };

  const flashDamage = (amount) => {
    damageTimer = Math.min(0.6, 0.25 + amount * 0.02);
    el.damage.style.opacity = String(Math.min(0.9, 0.25 + amount * 0.035));
  };

  const drawMinimap = (player, vehicles, police, missions, time) => {
    const px = state.inCar && vehicles.playerCar ? vehicles.playerCar.position.x : player.position.x;
    const pz = state.inCar && vehicles.playerCar ? vehicles.playerCar.position.z : player.position.z;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(centre, centre, centre - 2, 0, Math.PI * 2);
    ctx.clip();


    ctx.fillStyle = '#0a1622';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#2b333f';
    const waterY = centre + (city.waterZ - pz) * scale;
    if (waterY < size) {
      ctx.fillStyle = '#0d2434';
      ctx.fillRect(0, waterY, size, size - waterY);
    }

    ctx.fillStyle = '#39434f';
    for (const road of city.roads) {
      const x = centre + (road.x0 - px) * scale;
      const y = centre + (road.z0 - pz) * scale;
      const w = (road.x1 - road.x0) * scale;
      const h = (road.z1 - road.z0) * scale;
      ctx.fillRect(x, y, w, h);
    }

    ctx.fillStyle = '#0c1016';
    for (const block of city.blocks) {
      const x = centre + (block.x0 - px) * scale;
      const y = centre + (block.z0 - pz) * scale;
      const w = (block.x1 - block.x0) * scale;
      const h = (block.z1 - block.z0) * scale;
      ctx.fillRect(x, y, w, h);
    }


    ctx.fillStyle = 'rgba(120,150,180,0.10)';
    for (const building of city.buildings) {
      if (building.h < 30) continue;
      const x = centre + (building.minX - px) * scale;
      const y = centre + (building.minZ - pz) * scale;
      ctx.fillRect(x, y, building.w * scale, building.d * scale);
    }


    ctx.strokeStyle = 'rgba(90,200,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, waterY);
    ctx.lineTo(size, waterY);
    ctx.stroke();


    const marker = missions.marker();
    if (marker) {
      const mx = centre + (marker.x - px) * scale;
      const my = centre + (marker.z - pz) * scale;

      let clampedX = mx;
      let clampedY = my;
      const offsetX = mx - centre;
      const offsetY = my - centre;
      const offsetLength = Math.hypot(offsetX, offsetY);
      const limit = centre - 16;
      if (offsetLength > limit) {
        clampedX = centre + (offsetX / offsetLength) * limit;
        clampedY = centre + (offsetY / offsetLength) * limit;
      }
      const pulse = 1 + Math.sin(time * 4) * 0.18;
      ctx.save();
      ctx.translate(clampedX, clampedY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffc24a';
      ctx.shadowColor = '#ffb020';
      ctx.shadowBlur = 12;
      ctx.fillRect(-5 * pulse, -5 * pulse, 10 * pulse, 10 * pulse);
      ctx.restore();
    }


    for (const car of police.cruisers) {
      const x = centre + (car.position.x - px) * scale;
      const y = centre + (car.position.z - pz) * scale;
      ctx.fillStyle = Math.sin(time * 9) > 0 ? '#ff3b52' : '#4f8bff';
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const officer of police.officers) {
      if (!officer.alive) continue;
      const x = centre + (officer.position.x - px) * scale;
      const y = centre + (officer.position.z - pz) * scale;
      ctx.fillStyle = 'rgba(255,90,110,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }


    ctx.fillStyle = 'rgba(170,200,220,0.4)';
    for (const car of vehicles.cars) {
      const x = centre + (car.position.x - px) * scale;
      const y = centre + (car.position.z - pz) * scale;
      if (x < 0 || y < 0 || x > size || y > size) continue;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }


    const heading = state.inCar && vehicles.playerCar ? vehicles.playerCar.heading : player.heading;
    ctx.save();
    ctx.translate(centre, centre);
    ctx.rotate(-heading + Math.PI);
    ctx.fillStyle = '#eafcff';
    ctx.shadowColor = '#5ce9ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();


    ctx.fillStyle = 'rgba(220,245,255,0.75)';
    ctx.font = 'bold 15px "DejaVu Sans Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', centre, 20);
  };

  const update = (dt, player, vehicles, police, missions) => {
    const time = performance.now() / 1000;
    state.targetDistance = state.targetDistance ?? 0;

    if (el.money.textContent !== formatMoney(state.money)) {
      el.money.textContent = formatMoney(state.money);
      moneyPulse = 0.5;
    }
    moneyPulse = Math.max(0, moneyPulse - dt);

    for (let i = 0; i < stars.length; i += 1) {
      stars[i].classList.toggle('on', i < state.wanted);
    }
    el.wanted.classList.toggle('pulse', state.wanted >= 3);

    const healthPercent = Math.max(0, Math.min(100, (state.health / state.maxHealth) * 100));
    el.healthFill.style.width = `${healthPercent}%`;
    el.healthFill.classList.toggle('low', healthPercent < 35);
    el.healthValue.textContent = String(Math.ceil(state.health));
    el.stamina.style.width = `${Math.max(0, Math.min(100, state.stamina))}%`;

    el.ammoMag.textContent = String(state.ammo);
    el.ammoReserve.textContent = String(state.ammoReserve);

    el.kicker.textContent = state.missionKicker || 'VESPER BAY';
    el.objective.textContent = state.objective || 'Free roam';
    if (state.target && state.targetDistance > 0) {
      el.distance.textContent = `${Math.round(state.targetDistance)} m`;
    } else {
      el.distance.textContent = state.missionIndex >= 3 ? 'the night is yours' : '';
    }

    const district = city.districtAt(player.position.x, player.position.z);
    if (state.district !== district) {
      state.district = district;
      el.district.textContent = district;
      el.mapLabel.textContent = district;
    }

    el.clock.textContent = formatClock(state.clock);

    if (state.inCar) {
      el.speedo.classList.add('visible');
      const speed = Math.round(state.speed);
      el.speed.textContent = String(speed);
      el.gear.textContent = vehicles.playerCar && vehicles.playerCar.speed < -0.5 ? 'R' : 'D';
      el.crosshair.style.opacity = '0';
    } else {
      el.speedo.classList.remove('visible');
      el.crosshair.style.opacity = '0.85';
    }


    promptTimer -= dt;
    if (state.mode === 'play' && promptTimer <= 0) {
      promptTimer = 0.1;
      if (state.inCar) {
        el.prompt.classList.remove('hidden');
        el.prompt.innerHTML = '<b>E</b> get out &nbsp;·&nbsp; <b>SPACE</b> handbrake';
      } else {
        const car = vehicles.nearby(player.position, 5.4);
        if (car) {
          el.prompt.classList.remove('hidden');
          el.prompt.innerHTML = `<b>E</b> take the ${car.name}`;
        } else {
          el.prompt.classList.add('hidden');
        }
      }
    }


    if (state.target && !state.inCar) {
      const dx = state.target.x - player.position.x;
      const dz = state.target.z - player.position.z;
      const angleToTarget = Math.atan2(dx, dz);
      let delta = angleToTarget - (camera.yaw + Math.PI);
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const distance = Math.hypot(dx, dz);
      if (distance > 30 && Math.abs(delta) < 2.4) {
        el.arrow.style.opacity = '0.85';
        el.arrow.style.transform = `translate(-50%, -50%) rotate(${delta}rad) translateY(-150px)`;
      } else {
        el.arrow.style.opacity = '0';
      }
    } else {
      el.arrow.style.opacity = '0';
    }

    if (damageTimer > 0) {
      damageTimer -= dt;
      if (damageTimer <= 0) el.damage.style.opacity = '0';
    }

    drawMinimap(player, vehicles, police, missions, time);
  };

  state.bus.on('toast', ({ text, kind }) => toast(text, kind));
  state.bus.on('playerHit', ({ amount }) => flashDamage(amount));
  state.bus.on('hitmark', () => {
    el.crosshair.classList.add('hit');
    window.setTimeout(() => el.crosshair.classList.remove('hit'), 90);
  });
  state.bus.on('wantedUp', ({ level }) => {
    if (level > 0) toast(`WANTED · ${'★'.repeat(level)}`, 'hot');
  });
  state.bus.on('wantedDown', ({ level }) => {
    toast(level > 0 ? `HEAT DROPPING · ${'★'.repeat(level)}` : 'YOU LOST THEM', 'gold');
  });
  state.bus.on('stageComplete', () => toast('OBJECTIVE COMPLETE', 'gold'));
  state.bus.on('missionComplete', ({ title, reward }) => {
    toast(`${title} · +$${formatMoney(reward)}`, 'gold');
  });
  state.bus.on('missionFailed', ({ title }) => toast(`${title} FAILED`, 'hot'));
  state.bus.on('missionStart', ({ kicker, contact }) => toast(`${kicker} — ${contact}`, 'gold'));
  state.bus.on('hint', ({ text }) => toast(text, ''));

  return {
    update,
    toast,
    flashDamage,
    show() {
      el.hud.classList.remove('hidden');
    },
    hide() {
      el.hud.classList.add('hidden');
    },
  };
}
