// Every sound in Sable Harbor, made with WebAudio and nothing else: the engine's hum follows the
// speed, the pistol cracks, the siren wails while you are wanted, the rain hisses under it all and
// a slow minor loop plays on the radio. No audio files, so the game is the same offline.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.started = false;
    this.siren = null;
    this.engine = null;
    this.rain = null;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.musicPlaying = false;
    this.tempo = 84;
  }

  /** Browsers only allow sound after a gesture, so the first click or key starts everything. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.75;
    this.master.connect(this.ctx.destination);

    this.noiseBuffer = this.makeNoise(1.4);
    this.buildEngine();
    this.buildSiren();
    this.buildRain();
    this.started = true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.75;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  makeNoise(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // ---------------------------------------------------------------- engine

  buildEngine() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 3;
    const low = ctx.createOscillator();
    low.type = 'sawtooth';
    low.frequency.value = 62;
    const high = ctx.createOscillator();
    high.type = 'square';
    high.frequency.value = 93;
    const highGain = ctx.createGain();
    highGain.gain.value = 0.35;
    low.connect(filter);
    high.connect(highGain);
    highGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    low.start();
    high.start();
    this.engine = { gain, filter, low, high };
  }

  /** Engine note for the current speed; call every frame while driving. */
  setEngine(speed, throttle) {
    if (!this.engine || !this.ctx) return;
    const ratio = Math.min(1, Math.abs(speed) / 42);
    const now = this.ctx.currentTime;
    const base = 46 + ratio * 96;
    this.engine.low.frequency.setTargetAtTime(base, now, 0.08);
    this.engine.high.frequency.setTargetAtTime(base * 1.5, now, 0.08);
    this.engine.filter.frequency.setTargetAtTime(320 + ratio * 900 + (throttle ? 180 : 0), now, 0.1);
    this.engine.gain.gain.setTargetAtTime(0.1 + ratio * 0.13, now, 0.12);
  }

  engineOff() {
    if (this.engine) this.engine.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
  }

  // ---------------------------------------------------------------- siren

  buildSiren() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 1.6;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 640;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.32;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 240;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    lfo.start();
    this.siren = { gain, osc, lfo };
  }

  setSiren(on) {
    if (!this.siren || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.siren.gain.gain.setTargetAtTime(on ? 0.055 : 0, now, 0.25);
    this.siren.lfo.frequency.setTargetAtTime(on ? 0.42 : 0.1, now, 0.4);
  }

  // ---------------------------------------------------------------- rain

  buildRain() {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.value = 0.016;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    this.rain = { gain };
  }

  // ---------------------------------------------------------------- one-shots

  gunshot(volume = 1, position = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const distance = position && this.listener ? this.listener(position) : 0;
    const attenuation = Math.max(0.12, 1 - distance / 90);

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 1.4;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5 * volume * attenuation, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(now);
    source.stop(now + 0.2);

    const thump = ctx.createOscillator();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(140, now);
    thump.frequency.exponentialRampToValueAtTime(46, now + 0.12);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.42 * volume * attenuation, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    thump.connect(thumpGain);
    thumpGain.connect(this.master);
    thump.start(now);
    thump.stop(now + 0.2);
  }

  thud(position = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.26);
    void position;
  }

  cash() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    [880, 1320].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      const at = now + index * 0.09;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(at);
      osc.stop(at + 0.24);
    });
  }

  missionComplete() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    [392, 494, 587, 784].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      const at = now + index * 0.13;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.16, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(at);
      osc.stop(at + 0.55);
    });
  }

  crash() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 0.7;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 600;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(now);
    source.stop(now + 0.32);
  }

  // ---------------------------------------------------------------- music

  /** A slow minor loop for the radio: bass, pad, arpeggio and a brushed beat. */
  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.musicStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.2;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 90);
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = 0;
  }

  scheduleMusic() {
    if (!this.musicPlaying || !this.ctx) return;
    const beat = 60 / this.tempo / 2;
    const chords = [
      { bass: 55.0, notes: [220.0, 261.63, 329.63], arp: [440.0, 523.25, 659.26, 523.25] },
      { bass: 43.65, notes: [174.61, 220.0, 261.63], arp: [349.23, 440.0, 523.25, 440.0] },
      { bass: 65.41, notes: [261.63, 329.63, 392.0], arp: [392.0, 523.25, 659.26, 523.25] },
      { bass: 49.0, notes: [196.0, 246.94, 293.66], arp: [392.0, 493.88, 587.33, 493.88] },
    ];
    while (this.nextNoteTime < this.ctx.currentTime + 0.4) {
      const step = this.musicStep;
      const bar = Math.floor(step / 8) % 4;
      const chord = chords[bar];
      const inBar = step % 8;
      const at = this.nextNoteTime;

      if (inBar === 0 || inBar === 4) this.playNote(chord.bass, at, beat * 1.6, 'sine', 0.14);
      if (inBar === 0) {
        for (const note of chord.notes) this.playNote(note, at, beat * 3.4, 'triangle', 0.028);
      }
      this.playNote(chord.arp[inBar % 4] * (inBar % 2 === 0 ? 1 : 2), at, beat * 0.5, 'sine', 0.035);
      if (inBar % 2 === 1) this.playHat(at);
      if (inBar === 0 || inBar === 6) this.playKick(at);

      this.nextNoteTime += beat;
      this.musicStep += 1;
    }
  }

  playNote(frequency, at, duration, type, volume) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }

  playHat(at) {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 2.6;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, at);
    gain.gain.exponentialRampToValueAtTime(0.0005, at + 0.06);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(at);
    source.stop(at + 0.08);
  }

  playKick(at) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(96, at);
    osc.frequency.exponentialRampToValueAtTime(38, at + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(at);
    osc.stop(at + 0.2);
  }
}
