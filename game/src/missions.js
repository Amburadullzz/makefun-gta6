// Three jobs for Dex Calloway, chained: a marker in the world, an objective line on
// the HUD, a payoff, and a way to fail. The marker is a ring and a beam of light you
// can see down the street; the minimap draws the same point.



import * as THREE from '../vendor/three.min.js';
import { linear, makeGlowTexture } from './geometry.js';
import { addMoney } from './state.js';

const MISSIONS = [
  {
    id: 'dead-drop',
    title: 'DEAD DROP',
    kicker: 'JOB 01 · DEAD DROP',
    contact: 'DEX CALLOWAY',
    reward: 750,
    stages: [
      {
        text: 'Steal a car and drive it to the Salt Row quay',
        at: { x: 70, z: 160 },
        radius: 9,
        need: 'inCar',
        hint: 'A car is parked on the avenue. Press E beside it.',
      },
      {
        text: 'Step out and hand the case to Dex',
        at: { x: 70, z: 160 },
        radius: 6,
        need: 'onFoot',
      },
    ],
    outro: 'Dex: "Clean run. The Kings will hear about you."',
  },
  {
    id: 'shake-the-tail',
    title: 'SHAKE THE TAIL',
    kicker: 'JOB 02 · SHAKE THE TAIL',
    contact: 'DEX CALLOWAY',
    reward: 1500,
    stages: [
      {
        text: 'Collect Nix from the Lumen Mile motel',
        at: { x: 95, z: -58 },
        radius: 7,
        need: 'onFoot',
        onArrive: (state) => {
          state.wanted = Math.max(state.wanted, 2);
          state.decayTimer = 18;
          state.bus.emit('toast', { text: 'NIX: "They made me. Drive — now!"', kind: 'hot' });
          state.bus.emit('wantedUp', { level: state.wanted, kind: 'spotted' });
        },
      },
      {
        text: 'Lose the police',
        at: null,
        radius: 0,
        need: 'wantedZero',
        hint: 'Break line of sight and keep moving.',
      },
      {
        text: 'Drop Nix at the safehouse in the Narrows',
        at: { x: -95, z: 58 },
        radius: 7,
        need: 'onFoot',
      },
    ],
    outro: 'Nix: "You drive like the bay owes you money."',
  },
  {
    id: 'the-long-night',
    title: 'THE LONG NIGHT',
    kicker: 'JOB 03 · THE LONG NIGHT',
    contact: 'DEX CALLOWAY',
    reward: 5000,
    stages: [
      {
        text: 'Drive to the Vesper Spire service door',
        at: { x: -60, z: -87 },
        radius: 9,
        need: 'inCar',
      },
      {
        text: 'Take the ledger from the Spire lobby',
        at: { x: -60, z: -84 },
        radius: 6,
        need: 'onFoot',
        onArrive: (state) => {
          state.wanted = Math.max(state.wanted, 3);
          state.decayTimer = 24;
          state.bus.emit('toast', { text: 'ALARM. V.B.P.D. IS ON THE WAY.', kind: 'hot' });
          state.bus.emit('wantedUp', { level: state.wanted, kind: 'alarm' });
        },
      },
      {
        text: 'Get the ledger to the water at Salt Row',
        at: { x: 29, z: 160 },
        radius: 9,
        need: 'onFoot',
      },
    ],
    outro: 'Dex: "That is every name the Kings own. Go home, Mara."',
  },
];

export function createMissions(scene, city, state, player, vehicles, police) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.4, 0.16, 6, 32),
    new THREE.MeshBasicMaterial({ color: linear(0xffc24a), transparent: true, opacity: 0.9, fog: true }),
  );
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 4.2, 70, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: linear(0xffc24a), transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: true,
    }),
  );
  beam.position.y = 35;
  scene.add(beam);

  const diamond = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('rgba(255,226,150,1)', 'rgba(255,160,40,0)'),
    color: linear(0xffd06a), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: true,
  }));
  diamond.scale.set(7, 7, 1);
  scene.add(diamond);

  let markerGroup = new THREE.Group();
  markerGroup.add(ring, beam, diamond);
  scene.add(markerGroup);

  let pulse = 0;
  let stageClearedTimer = 0;
  let active = true;

  const currentMission = () => MISSIONS[Math.min(state.missionIndex, MISSIONS.length - 1)];
  const currentStage = () => {
    const mission = currentMission();
    return mission.stages[Math.min(state.missionStage, mission.stages.length - 1)];
  };

  const setObjective = () => {
    if (state.missionIndex >= MISSIONS.length) {
      state.missionKicker = 'THE NIGHT IS YOURS';
      state.objective = 'Free roam — the bay is still out there';
      state.target = null;
      markerGroup.visible = false;
      state.missionActive = false;
      return;
    }
    const mission = currentMission();
    const stage = currentStage();
    state.missionKicker = mission.kicker;
    state.objective = stage.text;
    state.target = stage.at ? { ...stage.at } : null;
    state.targetRadius = stage.radius;
    state.missionActive = true;
    markerGroup.visible = Boolean(stage.at);
    if (stage.at) {
      markerGroup.position.set(stage.at.x, 0.2, stage.at.z);
    }
    if (stage.hint) state.bus.emit('hint', { text: stage.hint });
  };

  const completeStage = () => {
    const mission = currentMission();
    const stage = currentStage();
    if (stage.onArrive) stage.onArrive(state);
    state.missionStage += 1;
    if (state.missionStage >= mission.stages.length) {
      state.missionStage = 0;
      state.missionIndex += 1;
      state.stats.missionsDone += 1;
      addMoney(state, mission.reward, mission.title);
      state.bus.emit('missionComplete', {
        title: mission.title,
        reward: mission.reward,
        outro: mission.outro,
        last: state.missionIndex >= MISSIONS.length,
      });
    } else {
      state.bus.emit('stageComplete', { text: stage.text });
    }
    setObjective();
    state.bus.emit('saveRequested', {});
  };

  const update = (dt) => {
    pulse += dt;
    const stage = currentStage();
    if (markerGroup.visible) {
      ring.rotation.z += dt * 1.4;
      const scale = 1 + Math.sin(pulse * 2.4) * 0.06;
      ring.scale.setScalar(scale);
      diamond.position.y = 5.5 + Math.sin(pulse * 2) * 0.6;
      beam.material.opacity = 0.07 + Math.sin(pulse * 1.6) * 0.02;
      if (state.target) {
        markerGroup.position.set(state.target.x, 0.2, state.target.z);
      }
    }

    if (!active || state.mode !== 'play' || state.missionIndex >= MISSIONS.length) return;
    if (stageClearedTimer > 0) {
      stageClearedTimer -= dt;
      return;
    }

    const position = state.inCar && vehicles.playerCar ? vehicles.playerCar.position : player.position;
    let satisfied = true;
    if (stage.need === 'inCar') satisfied = state.inCar;
    if (stage.need === 'onFoot') satisfied = !state.inCar;
    if (stage.need === 'wantedZero') satisfied = state.wanted === 0;

    if (stage.at) {
      const distance = Math.hypot(position.x - stage.at.x, position.z - stage.at.z);
      state.targetDistance = distance;
      if (distance > stage.radius) return;
      if (!satisfied) {
        if (stage.need === 'inCar' && !state.inCar && distance < stage.radius) {
          state.bus.emit('hint', { text: 'You need a car for this one.' });
        }
        return;
      }
    } else if (!satisfied) {
      state.targetDistance = 0;
      return;
    }

    stageClearedTimer = 0.4;
    completeStage();
  };

  const start = () => {
    state.missionIndex = 0;
    state.missionStage = 0;
    setObjective();
    state.bus.emit('missionStart', {
      kicker: currentMission().kicker,
      contact: currentMission().contact,
    });
  };

  const fail = () => {
    if (state.missionIndex >= MISSIONS.length) return;
    state.missionStage = 0;
    setObjective();
    state.bus.emit('missionFailed', { title: currentMission().title });
  };

  const reset = () => {
    state.missionIndex = 0;
    state.missionStage = 0;
    setObjective();
  };

  const restart = () => {

    state.missionStage = 0;
    setObjective();
    state.bus.emit('missionRestart', { title: currentMission().title });
  };

  state.bus.on('wantedUp', () => {
    if (state.missionIndex < MISSIONS.length) setObjective();
  });

  setObjective();

  return {
    missions: MISSIONS,
    update,
    start,
    fail,
    reset,
    restart,
    setObjective,
    currentMission,
    currentStage,
    marker: () => (markerGroup.visible ? { x: markerGroup.position.x, z: markerGroup.position.z } : null),
  };
}
