// The night's work: three jobs that chain from one to the next, each a list of stages with an
// objective, a marker in the world, a reward and a way to fail. After the third the city keeps
// paying for cars delivered to Marrow Motors, so there is always a reason to steal one more.
import * as THREE from '../vendor/three.min.js';
import { Gunman } from './police.js';

const MISSION_DELAY = 3.5;
const SIDE_JOB_REWARD = 80;
const SIDE_JOB_COOLDOWN = 40;

export class Missions {
  constructor(scene, city, state, ui, audio, police, traffic, fleet, combat) {
    this.scene = scene;
    this.city = city;
    this.state = state;
    this.ui = ui;
    this.audio = audio;
    this.police = police;
    this.traffic = traffic;
    this.fleet = fleet;
    this.combat = combat;

    this.missions = this.defineMissions();
    this.index = Math.min(state.missionIndex, this.missions.length);
    this.stage = state.missionStage ?? 0;
    this.timer = 0;
    this.delay = 0;
    this.enforcers = [];
    this.sideJobCooldown = 0;
    this.frozen = false;
    this.delVisible = false;
    this.title = 'NO JOB';
    this.text = 'Find Del at The Drowned Lamp.';
    this.marker = null;
    this.markerColour = 0xffc46b;

    this.buildMarker();
    this.buildDel();
    this.startStage();
  }

  // ---------------------------------------------------------------- mission data

  defineMissions() {
    const spots = this.city.spots;
    const fleet = this.fleet;
    const distanceTo = (x, z) => (game) => {
      const point = game.player.inVehicle ? game.player.inVehicle.position : game.player.position;
      return Math.hypot(point.x - x, point.z - z);
    };

    return [
      {
        id: 'cold-open',
        title: 'COLD OPEN',
        stages: [
          {
            text: 'Steal the Tern GT from Pier 9',
            marker: () => ({ x: spots.pier.x, z: spots.pier.z }),
            done: () => fleet.playerCar === fleet.storyCars[0],
          },
          {
            text: 'Drive the Tern GT to Marrow Motors',
            marker: () => ({ x: spots.garage.x, z: spots.garage.z }),
            done: (game) => game.fleet.playerCar === fleet.storyCars[0] && distanceTo(spots.garage.x, spots.garage.z)(game) < 17,
          },
        ],
        reward: 350,
        failed: () => fleet.storyCars[0].health <= 0,
        failText: 'The Tern GT is wrecked. Del is not going to like that.',
        start: () =>
          this.ui.toast('Del: "There is a Tern GT at Pier 9, keys in it. Bring it to Marrow Motors and we are square."', 'story'),
      },
      {
        id: 'bad-debts',
        title: 'BAD DEBTS',
        stages: [
          {
            text: 'Meet Del at the Salt Court warehouse',
            marker: () => ({ x: spots.warehouse.x, z: spots.warehouse.z }),
            done: (game) => distanceTo(spots.warehouse.x, spots.warehouse.z)(game) < 13,
            enter: () => {
              this.ui.toast('Del: "Corso Vane is skimming the whole dock. His two boys are inside. Make it loud."', 'story');
              this.spawnEnforcers(spots.warehouse);
            },
          },
          {
            text: 'Take out Corso\'s enforcers',
            marker: () => ({ x: spots.warehouse.x, z: spots.warehouse.z }),
            counter: () => ({ done: this.enforcers.filter((man) => man.dead).length, total: this.enforcers.length }),
            done: () => this.enforcers.length > 0 && this.enforcers.every((man) => man.dead),
          },
          {
            text: 'Get back to The Drowned Lamp',
            marker: () => ({ x: spots.bar.x, z: spots.bar.z }),
            done: (game) => distanceTo(spots.bar.x, spots.bar.z)(game) < 13,
          },
        ],
        reward: 750,
        start: () =>
          this.ui.toast('Del: "Corso Vane runs Salt Court. Go and explain to his boys that the dock is ours now."', 'story'),
      },
      {
        id: 'last-ferry',
        title: 'LAST FERRY',
        stages: [
          {
            text: 'Shake the police, then meet Del at the bar',
            marker: () => ({ x: spots.bar.x, z: spots.bar.z }),
            done: (game) => this.state.wanted === 0 && distanceTo(spots.bar.x, spots.bar.z)(game) < 12,
            enter: () =>
              this.ui.toast('Del: "You brought the whole harbour down on us. Lose them, then come and get me."', 'story'),
          },
          {
            text: 'Get Del to the ferry terminal',
            marker: () => ({ x: spots.marina.x, z: spots.marina.z }),
            enter: () => {
              this.timer = 180;
              this.state.raiseWanted(3);
              this.delVisible = true;
              this.ui.toast('Del: "Corso called it in. Every cruiser on the harbour is coming. Ferry leaves in three minutes."', 'danger');
              this.audio.setSiren(true);
            },
            done: (game) => game.fleet.playerCar !== null && distanceTo(spots.marina.x, spots.marina.z)(game) < 18,
            fail: () => this.timer <= 0,
            failText: 'The ferry left without you.',
          },
        ],
        reward: 2000,
        start: () => this.ui.toast('Del: "One more run, Rook. Then we both get out of this city."', 'story'),
      },
    ];
  }

  get current() {
    return this.missions[this.index] ?? null;
  }

  get currentStage() {
    return this.current?.stages[this.stage] ?? null;
  }

  // ---------------------------------------------------------------- markers and Del

  buildMarker() {
    this.markerGroup = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.4, 0.1, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xffc46b, toneMapped: false, transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.14;
    this.markerRing = ring;
    this.markerGroup.add(ring);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.9, 2.4, 16, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffc46b,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    beam.position.y = 8;
    this.markerBeam = beam;
    this.markerGroup.add(beam);

    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.65),
      new THREE.MeshBasicMaterial({ color: 0xffd89a, toneMapped: false }),
    );
    diamond.position.y = 3.4;
    this.markerDiamond = diamond;
    this.markerGroup.add(diamond);

    this.scene.add(this.markerGroup);
  }

  /** Del, riding shotgun: a small body that only appears while she is in the car with you. */
  buildDel() {
    this.del = new THREE.Group();
    const coat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.58, 0.28), new THREE.MeshLambertMaterial({ color: 0x8c2f3c }));
    coat.position.y = 1.2;
    this.del.add(coat);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), new THREE.MeshLambertMaterial({ color: 0xd8a888 }));
    head.position.y = 1.62;
    this.del.add(head);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), new THREE.MeshLambertMaterial({ color: 0x2a1a1a }));
    hair.position.y = 1.74;
    this.del.add(hair);
    this.del.visible = false;
    this.scene.add(this.del);
  }

  spawnEnforcers(spot) {
    for (const [dx, dz] of [[-7, -6], [8, -4]]) {
      const man = new Gunman(this.scene, this.city, this.rngForEnforcer(), {
        coat: 0x4a3326,
        vest: 0x2f2118,
        cap: false,
        health: 70,
        accuracy: 0.85,
        name: 'Salt Court enforcer',
      });
      man.placeAt(spot.x + dx, spot.z + dz);
      this.enforcers.push(man);
    }
    this.police.reportCrime('mission', spot);
  }

  rngForEnforcer() {
    // A small deterministic generator so the two enforcers differ but always differ the same way.
    let state = (this.index * 9301 + 49297) % 233280;
    return {
      range: (min, max) => min + ((state = (state * 9301 + 49297) % 233280) / 233280) * (max - min),
      chance: (p) => ((state = (state * 9301 + 49297) % 233280) / 233280) < p,
      pick: (list) => list[Math.floor(((state = (state * 9301 + 49297) % 233280) / 233280) * list.length)],
    };
  }

  // ---------------------------------------------------------------- running the night

  startStage() {
    const stage = this.currentStage;
    if (!stage) {
      this.marker = null;
      this.markerGroup.visible = false;
      return;
    }
    this.title = this.current.title;
    this.text = stage.text;
    this.marker = stage.marker();
    this.markerColour = 0xffc46b;
    this.markerGroup.visible = true;
    if (stage.enter) stage.enter();
  }

  advance() {
    const mission = this.current;
    this.stage += 1;
    this.state.missionStage = this.stage;
    if (this.stage >= mission.stages.length) {
      this.completeMission();
    } else {
      this.ui.toast(this.currentStage.text, 'story');
      this.startStage();
    }
  }

  completeMission() {
    const mission = this.current;
    this.state.addMoney(mission.reward);
    this.state.missionsDone += 1;
    this.ui.toast(`Job done: ${mission.title} · $${mission.reward}`, 'money');
    this.audio.missionComplete();
    this.index += 1;
    this.stage = 0;
    this.state.missionIndex = this.index;
    this.state.missionStage = 0;
    this.state.save();
    this.enforcers = [];
    this.delVisible = false;
    this.delay = MISSION_DELAY;
    this.marker = null;
    this.markerGroup.visible = false;

    if (this.index >= this.missions.length) {
      this.ui.showEnding(
        'SABLE HARBOR',
        `Rook and Del are on the water. The city keeps its lights on for the next one. You have $${this.state.money}.`,
      );
      this.title = 'FREE ROAM';
      this.text = `Side job: bring any car to Marrow Motors for $${SIDE_JOB_REWARD}.`;
      this.sideJobCooldown = 0;
    } else {
      this.title = 'NEXT JOB';
      this.text = 'Del will call. Stay out of sight.';
    }
  }

  fail(reason) {
    const mission = this.current;
    if (!mission) return;
    this.ui.toast(`Failed: ${reason}`, 'danger');
    this.stage = 0;
    this.state.missionStage = 0;
    this.enforcers = [];
    this.delVisible = false;
    this.timer = 0;
    this.police.clearAll();
    this.state.setWanted(0);
    this.state.heal(100);
    this.state.dead = false;
    this.state.save();
    this.delay = 2.5;
    this.marker = null;
    this.markerGroup.visible = false;
    // Put the story car back at the pier if it was the one that got wrecked.
    const tern = this.fleet.storyCars[0];
    if (tern.health <= 0) {
      tern.health = 100;
      tern.placeAt(this.city.spots.pier.x, this.city.spots.pier.z, -Math.PI / 2);
    }
  }

  /** The player died: the night resets to the start of the current job. */
  onDeath() {
    this.fail('Rook went down.');
  }

  /** A car was delivered to the garage after the story: pay the side job. */
  paySideJob() {
    this.state.addMoney(SIDE_JOB_REWARD);
    this.ui.toast(`Chop shop: $${SIDE_JOB_REWARD} for the car.`, 'money');
    this.sideJobCooldown = SIDE_JOB_COOLDOWN;
    this.audio.cash();
    this.state.save();
  }

  update(dt, game) {
    const player = game.player;
    if (this.frozen) return;

    if (this.timer > 0 && this.current?.id === 'last-ferry') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.fail('The ferry left without you.');
        return;
      }
    }

    if (this.delay > 0) {
      this.delay -= dt;
      if (this.delay <= 0 && this.index < this.missions.length) {
        this.startStage();
        this.current?.start?.();
      }
      if (this.delay <= 0 && this.index >= this.missions.length) {
        this.sideJobCooldown = 0;
      }
    }

    // The marker follows whatever the current stage points at.
    const stage = this.currentStage;
    if (stage) {
      const marker = stage.marker();
      this.marker = marker;
      this.markerGroup.position.set(marker.x, this.city.groundAt(marker.x, marker.z), marker.z);
      this.markerGroup.visible = true;
      const time = performance.now() / 1000;
      this.markerRing.rotation.z = time * 0.6;
      this.markerRing.scale.setScalar(1 + Math.sin(time * 2.4) * 0.04);
      this.markerDiamond.rotation.y = time * 1.4;
      this.markerDiamond.position.y = 3.4 + Math.sin(time * 2) * 0.25;

      if (stage.done(game)) {
        this.advance();
        return;
      }
      if (stage.fail && stage.fail()) {
        this.fail(stage.failText ?? 'Out of time.');
        return;
      }
      if (this.current.failed && this.current.failed()) {
        this.fail(this.current.failText ?? 'The job went wrong.');
        return;
      }
      if (stage.counter) {
        const { done, total } = stage.counter();
        this.text = `${stage.text} (${done}/${total})`;
      } else {
        this.text = stage.text;
      }
    } else if (this.index >= this.missions.length) {
      // Free roam: the garage pays for delivered cars.
      this.sideJobCooldown = Math.max(0, this.sideJobCooldown - dt);
      this.title = 'FREE ROAM';
      if (this.sideJobCooldown === 0) {
        this.marker = { x: this.city.spots.garage.x, z: this.city.spots.garage.z };
        this.markerGroup.visible = true;
        this.markerGroup.position.set(this.marker.x, this.city.groundAt(this.marker.x, this.marker.z), this.marker.z);
        this.text = `Side job: bring any car to Marrow Motors for $${SIDE_JOB_REWARD}.`;
        const inCar = player.inVehicle;
        if (inCar && Math.hypot(inCar.position.x - this.marker.x, inCar.position.z - this.marker.z) < 17) {
          this.paySideJob();
        }
      } else {
        this.markerGroup.visible = false;
        this.text = 'Stay out of sight. Del will call.';
      }
    }

    // Enforcers fight back and the wanted level answers for them.
    for (const man of this.enforcers) {
      man.update(dt, player, (damage) => {
        this.state.hurt(damage);
        this.combat.onPlayerHurt();
        if (this.state.health <= 0) this.onDeath();
      });
    }

    // Del rides in the passenger seat once she is picked up.
    if (this.delVisible && player.inVehicle) {
      const car = player.inVehicle;
      this.del.visible = true;
      this.del.position.set(
        car.position.x + Math.cos(car.heading) * 0.55,
        car.position.y,
        car.position.z - Math.sin(car.heading) * 0.55,
      );
      this.del.rotation.y = car.heading;
    } else {
      this.del.visible = false;
    }
  }

  /** Everything the pistol can hit that belongs to a mission. */
  targets() {
    return this.enforcers
      .filter((man) => !man.dead)
      .map((man) => ({ kind: 'enforcer', officer: man, position: man.position, radius: 0.55 }));
  }
}
