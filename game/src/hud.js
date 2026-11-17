// The interface: money, the wanted stars, a health bar, the current objective, the district and the
// clock, and a circular minimap drawn from the city's own road and block data, turning with the
// camera, with the player as an arrow in the middle and a north marker on the rim.
import { PROMENADE_X, WATER_X, GRID, PITCH, ROAD_WIDTH } from './city.js';

const MAP_RADIUS = 100;
const MAP_SCALE = 1.42;

export class Hud {
  constructor(state, city, missions) {
    this.state = state;
    this.city = city;
    this.missions = missions;
    this.root = document.getElementById('hud');
    this.money = document.getElementById('money');
    this.starsBox = document.getElementById('stars');
    this.healthFill = document.getElementById('health-fill');
    this.healthLabel = document.getElementById('health-label');
    this.objectiveTitle = document.getElementById('objective-title');
    this.objectiveText = document.getElementById('objective-text');
    this.clock = document.getElementById('clock');
    this.district = document.getElementById('district');
    this.radio = document.getElementById('radio');
    this.wantedLabel = document.getElementById('wanted-label');
    this.prompt = document.getElementById('prompt');
    this.crosshair = document.getElementById('crosshair');
    this.speedo = document.getElementById('speedo');
    this.speedValue = document.getElementById('speed-value');
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');

    this.starElements = [];
    for (let i = 0; i < 5; i += 1) {
      const star = document.createElement('span');
      star.textContent = '★';
      this.starsBox.appendChild(star);
      this.starElements.push(star);
    }
    this.shownMoney = state.money;
    this.money.textContent = `$${state.money.toLocaleString('en-US')}`;
    this.flashTimer = 0;
    this.lastWanted = state.wanted;
    this.mapTimer = 0;
  }

  show(visible) {
    this.root.classList.toggle('hidden', !visible);
  }

  update(dt, game) {
    const state = this.state;
    const player = game.player;

    // Money rolls up to its new value rather than jumping.
    if (this.shownMoney !== state.money) {
      const difference = state.money - this.shownMoney;
      const step = Math.sign(difference) * Math.max(1, Math.abs(difference) * Math.min(1, dt * 6));
      this.shownMoney = Math.abs(difference) <= Math.abs(step) ? state.money : this.shownMoney + step;
      this.money.textContent = `$${Math.round(this.shownMoney).toLocaleString('en-US')}`;
    }

    if (state.wanted !== this.lastWanted) {
      this.lastWanted = state.wanted;
      this.flashTimer = 1.4;
    }
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.starElements.forEach((star, index) => {
      const lit = index < state.wanted;
      star.classList.toggle('lit', lit);
      star.classList.toggle('flash', lit && this.flashTimer > 0 && Math.sin(this.flashTimer * 18) > 0);
    });

    const healthPercent = Math.max(0, Math.min(100, state.health));
    this.healthFill.style.width = `${healthPercent}%`;
    this.healthFill.classList.toggle('low', healthPercent < 35);
    this.healthLabel.textContent = String(Math.round(healthPercent));

    this.objectiveTitle.textContent = this.missions.title;
    const seconds = Math.max(0, Math.ceil(this.missions.timer));
    const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    this.objectiveText.textContent =
      this.missions.timer > 0 ? `${this.missions.text} · ${clock}` : this.missions.text;
    this.clock.textContent = state.clockText();
    this.district.textContent = districtName(game.player.position.x, game.player.position.z);
    this.radio.textContent = player.inVehicle ? 'SABLE FM · NIGHT DRIVE' : 'SABLE FM 88.4';
    this.wantedLabel.textContent = state.wanted > 0 ? 'WANTED' : '';

    // The prompt tells you what E will do right now.
    if (player.inVehicle) {
      this.prompt.classList.remove('hidden');
      this.prompt.innerHTML = 'Press <b>E</b> to get out';
    } else if (game.nearbyCar) {
      this.prompt.classList.remove('hidden');
      this.prompt.innerHTML = `Press <b>E</b> to take the ${game.nearbyCar.name}`;
    } else {
      this.prompt.classList.add('hidden');
    }

    this.crosshair.classList.toggle('hidden', !player.aiming);
    if (player.aiming) {
      this.crosshair.style.background = game.combat.hitMarker > 0 ? '#ff5b5b' : 'rgba(255,245,225,0.9)';
      this.crosshair.style.transform = game.combat.hitMarker > 0 ? 'scale(1.9)' : 'scale(1)';
    }

    if (player.inVehicle) {
      this.speedo.classList.remove('hidden');
      this.speedValue.textContent = String(Math.round(player.inVehicle.speedKmh));
    } else {
      this.speedo.classList.add('hidden');
    }

    // Redraw the map at 30 Hz; it does not need to be faster than the eye.
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 1 / 30;
      this.drawMinimap(game);
    }
  }

  drawMinimap(game) {
    const ctx = this.ctx;
    const size = this.canvas.width;
    const centre = size / 2;
    const player = game.player;
    const focusX = player.position.x;
    const focusZ = player.position.z;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(centre, centre, MAP_RADIUS, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#080d13';
    ctx.fillRect(0, 0, size, size);

    // Rotate the map so the camera's forward is up.
    const yaw = game.cameraRig.yaw;
    ctx.translate(centre, centre);
    ctx.rotate(yaw);
    ctx.scale(MAP_SCALE, MAP_SCALE);
    ctx.translate(-focusX, -focusZ);

    // The bay on the east side.
    ctx.fillStyle = '#123a4f';
    ctx.fillRect(WATER_X, -400, 900, 1200);
    ctx.fillStyle = '#1d3d42';
    ctx.fillRect(PROMENADE_X, -14, WATER_X - PROMENADE_X, 418);

    // Blocks, then the streets over them.
    ctx.fillStyle = '#232e3a';
    for (const block of this.city.blocks) {
      ctx.fillRect(block.x0, block.z0, block.x1 - block.x0, block.z1 - block.z0);
    }
    ctx.strokeStyle = '#57667a';
    ctx.lineWidth = ROAD_WIDTH;
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (let k = 0; k <= GRID; k += 1) {
      ctx.moveTo(-12, k * PITCH);
      ctx.lineTo(PROMENADE_X, k * PITCH);
      ctx.moveTo(k * PITCH, -12);
      ctx.lineTo(k * PITCH, PROMENADE_X);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Named spots, so the map has places on it.
    ctx.fillStyle = 'rgba(255,196,107,0.5)';
    for (const spot of Object.values(this.city.spots)) {
      ctx.beginPath();
      ctx.arc(spot.x, spot.z, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Traffic, dim and small.
    ctx.fillStyle = 'rgba(190,210,235,0.5)';
    for (const car of game.traffic.cars) {
      ctx.beginPath();
      ctx.arc(car.position.x, car.position.z, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Police, in flashing red and blue.
    const pulse = (Math.sin(performance.now() / 120) + 1) / 2;
    for (const unit of game.police.units) {
      ctx.fillStyle = pulse > 0.5 ? '#ff4040' : '#4d7bff';
      ctx.beginPath();
      ctx.arc(unit.car.position.x, unit.car.position.z, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    ctx.restore();

    // The mission marker: a diamond on the map, pinned to the rim when it is further away than
    // the map reaches, so the objective is always on screen.
    if (this.missions.marker) {
      const dx = this.missions.marker.x - focusX;
      const dz = this.missions.marker.z - focusZ;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      let mx = (dx * cos - dz * sin) * MAP_SCALE;
      let my = (dx * sin + dz * cos) * MAP_SCALE;
      const distance = Math.hypot(mx, my);
      const limit = MAP_RADIUS - 13;
      const pinned = distance > limit;
      if (pinned && distance > 0.001) {
        mx = (mx / distance) * limit;
        my = (my / distance) * limit;
      }
      const size2 = pinned ? 7 : 4.6 + Math.sin(performance.now() / 200) * 0.9;
      ctx.save();
      ctx.translate(centre + mx, centre + my);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffc46b';
      ctx.fillRect(-size2 / 2, -size2 / 2, size2, size2);
      ctx.strokeStyle = 'rgba(20,14,8,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-size2 / 2, -size2 / 2, size2, size2);
      ctx.restore();
    }

    // The player: an arrow at the centre, pointing the way the body faces.
    ctx.save();
    ctx.translate(centre, centre);
    ctx.rotate(-(player.yaw - yaw) + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fillStyle = '#eaf4ff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,30,40,0.9)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // North marker on the rim.
    const northAngle = -yaw - Math.PI / 2;
    const nx = centre + Math.cos(northAngle) * (MAP_RADIUS - 9);
    const ny = centre + Math.sin(northAngle) * (MAP_RADIUS - 9);
    ctx.fillStyle = 'rgba(8,13,19,0.85)';
    ctx.beginPath();
    ctx.arc(nx, ny, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8f2ff';
    ctx.font = '700 9px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny + 0.5);

    // A soft inner shadow so the map sits in its frame.
    const gradient = ctx.createRadialGradient(centre, centre, MAP_RADIUS * 0.55, centre, centre, MAP_RADIUS);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centre, centre, MAP_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The district under the player's feet, for the label beside the clock. */
export function districtName(x, z) {
  if (x > PROMENADE_X) return 'HARBOR WALK';
  if (x > 320 && z < 200) return 'SALT DOCKS';
  if (Math.hypot(x - 196, z - 196) < 110) return 'DOWNTOWN';
  if (z > 300) return 'OLD TOWN';
  if (z < 110) return 'NORTH PIER';
  return 'THE STRIP';
}


