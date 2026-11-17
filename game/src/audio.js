// Every sound in Vesper Bay is synthesised here with WebAudio: the engine, gunshots,
// the siren, footsteps and a slow synth loop for the night. No audio files.



export function createAudio(state) {
  let ctx = null;
  let master = null;
  let sfx = null;
  let music = null;
  let noiseBuffer = null;
  let engine = null;
  let siren = null;
  let started = false;
  let musicStep = 0;
  let nextStepTime = 0;
  let musicOn = true;

  const BPM = 84;
  const STEP = 60 / BPM / 4;

  const init = () => {
    if (ctx) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    sfx = ctx.createGain();
    sfx.gain.value = 0.9;
    sfx.connect(master);

    music = ctx.createGain();
    music.gain.value = 0.3;
    music.connect(master);

    const length = Math.floor(ctx.sampleRate * 1.2);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  };

  const now = () => (ctx ? ctx.currentTime : 0);

  const tone = (frequency, duration, options = {}) => {
    if (!ctx) return;
    const { type = 'sine', gain = 0.2, when = 0, glide = null, bus = sfx } = options;
    const start = now() + when;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glide), start + duration);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env);
    env.connect(bus);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  };

  const noise = (duration, options = {}) => {
    if (!ctx || !noiseBuffer) return;
    const { gain = 0.3, frequency = 1200, q = 0.8, when = 0, sweep = null, bus = sfx } = options;
    const start = now() + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(frequency, start);
    filter.Q.value = q;
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(80, sweep), start + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(env);
    env.connect(bus);
    source.start(start);
    source.stop(start + duration + 0.02);
  };




  const CHORDS = [
    { root: 110.0, notes: [220.0, 261.63, 329.63] },
    { root: 87.31, notes: [174.61, 220.0, 261.63] },
    { root: 130.81, notes: [261.63, 329.63, 392.0] },
    { root: 98.0, notes: [196.0, 246.94, 293.66] },
  ];
  const ARP = [0, 2, 1, 3, 2, 1, 0, 2, 3, 2, 1, 0, 2, 3, 1, 2];

  const scheduleStep = (step, time) => {
    const bar = Math.floor(step / 16) % 4;
    const chord = CHORDS[bar];
    const inBar = step % 16;
    const start = Math.max(time, now() + 0.01);

    if (inBar === 0) {

      for (const note of chord.notes) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = note;
        env.gain.setValueAtTime(0.0001, start);
        env.gain.exponentialRampToValueAtTime(0.05, start + 0.6);
        env.gain.exponentialRampToValueAtTime(0.0001, start + STEP * 16);
        osc.connect(env);
        env.connect(music);
        osc.start(start);
        osc.stop(start + STEP * 16 + 0.1);
      }
      const sub = ctx.createOscillator();
      const subEnv = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.value = chord.root / 2;
      subEnv.gain.setValueAtTime(0.0001, start);
      subEnv.gain.exponentialRampToValueAtTime(0.09, start + 0.4);
      subEnv.gain.exponentialRampToValueAtTime(0.0001, start + STEP * 16);
      sub.connect(subEnv);
      subEnv.connect(music);
      sub.start(start);
      sub.stop(start + STEP * 16 + 0.1);
    }

    if (inBar % 4 === 0) {
      tone(chord.root, STEP * 3.2, { type: 'sawtooth', gain: 0.055, when: start - now(), bus: music });
    }


    if (state.wanted > 0 || inBar % 2 === 0) {
      const note = chord.notes[ARP[step % ARP.length] % chord.notes.length] * 2;
      tone(note, STEP * 0.9, { type: 'square', gain: state.wanted > 0 ? 0.028 : 0.016, when: start - now(), bus: music });
    }
  };

  const pumpMusic = () => {
    if (!ctx || !musicOn || ctx.state !== 'running') return;
    if (nextStepTime < now() - 0.5) nextStepTime = now() + 0.05;
    while (nextStepTime < now() + 0.25) {
      scheduleStep(musicStep, nextStepTime);
      musicStep += 1;
      nextStepTime += STEP;
    }
  };



  const startEngine = () => {
    if (!ctx || engine) return;
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    oscA.type = 'sawtooth';
    oscB.type = 'square';
    oscA.frequency.value = 46;
    oscB.frequency.value = 23;
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 2.5;
    gain.gain.value = 0.0001;
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(sfx);
    oscA.start();
    oscB.start();
    engine = { oscA, oscB, filter, gain };
  };

  const updateEngine = (dt, active, speed) => {
    if (!ctx) return;
    if (active && !engine) startEngine();
    if (!engine) return;
    const target = active ? 0.05 + Math.min(0.05, Math.abs(speed) * 0.0012) : 0.0001;
    engine.gain.gain.setTargetAtTime(target, now(), 0.12);
    const rpm = 42 + Math.abs(speed) * 1.5;
    engine.oscA.frequency.setTargetAtTime(rpm, now(), 0.1);
    engine.oscB.frequency.setTargetAtTime(rpm * 0.5, now(), 0.1);
    engine.filter.frequency.setTargetAtTime(240 + Math.abs(speed) * 9, now(), 0.1);
  };

  const startSiren = () => {
    if (!ctx || siren) return;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 720;
    lfo.type = 'square';
    lfo.frequency.value = 0.55;
    lfoGain.gain.value = 170;
    gain.gain.value = 0.0001;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(sfx);
    osc.start();
    lfo.start();
    siren = { osc, lfo, gain };
  };

  const updateSiren = (active, distance) => {
    if (!ctx) return;
    if (active && !siren) startSiren();
    if (!siren) return;
    const target = active ? Math.max(0.0001, 0.035 * Math.max(0, 1 - distance / 160)) : 0.0001;
    siren.gain.gain.setTargetAtTime(target, now(), 0.2);
  };



  state.bus.on('gunshot', () => {
    noise(0.22, { gain: 0.5, frequency: 2200, q: 0.6, sweep: 260 });
    tone(90, 0.16, { type: 'sine', gain: 0.35, glide: 40 });
  });
  state.bus.on('dryFire', () => noise(0.05, { gain: 0.15, frequency: 3200 }));
  state.bus.on('reload', () => {
    noise(0.07, { gain: 0.16, frequency: 1800 });
    noise(0.06, { gain: 0.12, frequency: 900, when: 0.5 });
  });
  state.bus.on('hitmark', () => tone(1400, 0.05, { type: 'square', gain: 0.09 }));
  state.bus.on('footstep', ({ sprint }) => noise(sprint ? 0.07 : 0.06, { gain: sprint ? 0.12 : 0.07, frequency: 620, q: 0.6 }));
  state.bus.on('jump', () => noise(0.08, { gain: 0.06, frequency: 500 }));
  state.bus.on('playerHit', () => {
    noise(0.16, { gain: 0.25, frequency: 260, q: 0.7 });
    tone(60, 0.22, { type: 'sine', gain: 0.2 });
  });
  state.bus.on('policeShot', () => noise(0.16, { gain: 0.22, frequency: 1800, sweep: 400 }));
  state.bus.on('wantedUp', ({ level }) => {
    tone(220, 0.4, { type: 'sawtooth', gain: 0.12, glide: 110 });
    tone(330, 0.5, { type: 'triangle', gain: 0.08, when: 0.08 });
    if (level >= 3) tone(110, 0.8, { type: 'sine', gain: 0.18, when: 0.05 });
  });
  state.bus.on('wantedDown', () => tone(520, 0.25, { type: 'triangle', gain: 0.1, glide: 780 }));
  state.bus.on('stageComplete', () => {
    tone(660, 0.14, { type: 'triangle', gain: 0.12 });
    tone(880, 0.22, { type: 'triangle', gain: 0.1, when: 0.12 });
  });
  state.bus.on('missionComplete', () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((note, index) => {
      tone(note, 0.3, { type: 'triangle', gain: 0.13, when: index * 0.11 });
    });
  });
  state.bus.on('missionFailed', () => {
    tone(220, 0.5, { type: 'sawtooth', gain: 0.12, glide: 110 });
    tone(164.81, 0.7, { type: 'triangle', gain: 0.1, when: 0.2 });
  });
  state.bus.on('money', () => tone(1200, 0.09, { type: 'square', gain: 0.07 }));
  state.bus.on('enterCar', () => noise(0.12, { gain: 0.12, frequency: 420 }));
  state.bus.on('exitCar', () => noise(0.1, { gain: 0.1, frequency: 320 }));
  state.bus.on('horn', () => {
    tone(330, 0.4, { type: 'square', gain: 0.09 });
    tone(415, 0.4, { type: 'square', gain: 0.06 });
  });
  state.bus.on('pedDown', () => noise(0.2, { gain: 0.2, frequency: 300, q: 0.5 }));

  return {
    start() {
      init();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (!started) {
        started = true;
        nextStepTime = now() + 0.2;
      }
    },
    update(dt, info = {}) {
      if (!ctx) return;
      pumpMusic();
      updateEngine(dt, Boolean(info.inCar), info.speed ?? 0);
      updateSiren(Boolean(info.wanted), info.sirenDistance ?? 999);
    },
    toggleMusic() {
      musicOn = !musicOn;
      if (music) music.gain.value = musicOn ? 0.3 : 0;
    },
    setPaused(paused) {
      if (!ctx) return;
      if (paused) ctx.suspend();
      else ctx.resume();
    },
  };
}
