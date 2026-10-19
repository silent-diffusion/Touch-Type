// The arcade games' music and sound effects ("Pocket Pixels"): bouncy 8-bit tunes and blips, made
// live with Web Audio (no recordings), so they work offline. It shares Tiles' audio context.
//
// Each tune loops four bars: a pulse-wave lead, a quiet arpeggio, a triangle bass jumping octaves,
// and a noise kick, snare and hats, scheduled a little ahead on the audio clock. Forest Hop's
// tune is C, Am, F, G at 132 bpm; Ghost Race's is Am, F, C, G at 152 with a kick on every beat.
// Each game switches its music and effects on or off on its own screen: the setting named with
// each call (Forest Hop fhMusic and fhSfx, Ghost Race grMusic and grSfx).
(() => {
  const TUNES = {
    forest: {
      bpm: 132,
      chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
      roots: [48, 45, 41, 43],
      mel: [[72, 76, 79, 76, 84, 0, 79, 0], [81, 0, 76, 0, 72, 76, 81, 0], [77, 81, 84, 81, 77, 0, 72, 0], [79, 0, 74, 79, 83, 0, 86, 0]],
    },
    race: {
      bpm: 152,
      drive: true, // a kick on every beat
      chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]],
      roots: [45, 41, 48, 43],
      mel: [[76, 0, 76, 79, 81, 79, 76, 72], [74, 0, 72, 69, 72, 0, 77, 0], [76, 0, 79, 76, 84, 83, 81, 79], [79, 0, 74, 0, 71, 74, 79, 83]],
    },
  };
  const MUSIC_GAIN = 1.2, SFX_GAIN = 1.9; // these blips are quieter than the other sounds

  let ctx = null, out = null, musicBus = null, sfxBus = null, noiseBuf = null;
  const pulses = {};
  let song = null; // { timer, step, next, gain, key }

  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  const level = (key) => (TT.store.settings[key] === false ? 0 : 0.7);
  const ON = 0.7; // the level when switched on

  function audio() {
    const c = TT.tilesAudio && TT.tilesAudio.get();
    if (!c) return null;
    if (c !== ctx) {
      ctx = c;
      out = ctx.createDynamicsCompressor();
      out.threshold.value = -14;
      out.ratio.value = 3;
      out.connect(ctx.destination);
      musicBus = ctx.createGain();
      sfxBus = ctx.createGain();
      musicBus.connect(out);
      sfxBus.connect(out);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      for (const k in pulses) delete pulses[k];
    }
    setLevels();
    return ctx;
  }
  // (each call checks its game's own setting, so the buses stay at the "on" level)
  function setLevels() {
    if (!ctx) return;
    musicBus.gain.setTargetAtTime(ON * ON * 0.9 * MUSIC_GAIN, ctx.currentTime, 0.05);
    sfxBus.gain.setTargetAtTime(ON * ON * 1.1 * SFX_GAIN, ctx.currentTime, 0.05);
  }

  // ---------- the synth ----------

  // (the gain starts silent: otherwise its default of 1 can let one loud sample through before t)
  function envelope(g, t, a, peak, d) {
    g.gain.value = 0.0001;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  // a tone from f to f1 over dur
  function tone({ type = "sine", wave, f, f1, t, dur = 0.2, gain = 0.2, a = 0.004, to }) {
    const o = ctx.createOscillator();
    if (wave) o.setPeriodicWave(wave);
    else o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    envelope(g, t, a, gain, dur);
    o.connect(g).connect(to);
    o.start(t);
    o.stop(t + a + dur + 0.1);
  }
  // filtered noise
  function noise({ t, dur = 0.1, gain = 0.2, type = "bandpass", f = 1000, f1, q = 1, a = 0.003, to }) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    envelope(g, t, a, gain, dur);
    s.connect(fl).connect(g).connect(to);
    s.start(t, Math.random() * 1.5);
    s.stop(t + a + dur + 0.05);
  }
  // a pulse wave by its duty cycle (the 8-bit lead's sound)
  function pulse(duty) {
    if (pulses[duty]) return pulses[duty];
    const n = 40, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return (pulses[duty] = ctx.createPeriodicWave(re, im));
  }
  const chip = (m, t, dur, gain, to, duty = 0.25) => tone({ wave: pulse(duty), f: hz(m), t, dur, gain, a: 0.002, to });
  const tri = (m, t, dur, gain, to) => tone({ type: "triangle", f: hz(m), t, dur, gain, a: 0.002, to });
  const hat = (t, gain, to) => noise({ t, dur: 0.03, gain, type: "highpass", f: 8000, to });
  const kick = (t, gain, to) => tone({ f: 150, f1: 42, t, dur: 0.24, gain, a: 0.002, to });
  const snare = (t, gain, to) => {
    noise({ t, dur: 0.12, gain, f: 1800, q: 0.7, to });
    tone({ type: "triangle", f: 220, f1: 140, t, dur: 0.06, gain: gain * 0.6, to });
  };

  // ---------- the tunes ----------

  function step(T, s, t, to) {
    const SD = 60 / T.bpm / 4; // a sixteenth
    const bar = Math.floor(s / 16) % 4, pos = s % 16, loop = Math.floor(s / 64);
    if (pos === 0 || pos === 8 || (T.drive && pos % 4 === 0)) kick(t, 0.32, to);
    if (pos === 4 || pos === 12) snare(t, 0.13, to);
    if (T.drive && pos % 2) hat(t, 0.015, to);
    if (pos % 2 === 0) {
      hat(t, pos % 4 ? 0.04 : 0.025, to);
      tri(T.roots[bar] + (pos % 4 ? 12 : 0), t, SD * 1.6, 0.2, to);
      const m = T.mel[bar][pos / 2];
      if (m) chip(m, t, SD * 1.7, 0.06, to);
    }
    // the arpeggio joins halfway through the first time round
    if (loop % 2 || bar > 1) chip(T.chords[bar][pos % 3] + 12, t, SD * 0.8, 0.018, to, 0.125);
  }

  function startMusic(tune = "forest", key = "fhMusic") {
    stopMusic(0.05);
    if (!audio() || !level(key)) return;
    const T = TUNES[tune] || TUNES.forest, SD = 60 / T.bpm / 4;
    const g = ctx.createGain();
    g.connect(musicBus);
    const st = { step: 0, next: ctx.currentTime + 0.08, gain: g, key };
    st.timer = setInterval(() => {
      if (ctx.state !== "running") return;
      // after a stall (a hidden window), pick up from now rather than catch up
      if (st.next < ctx.currentTime - 0.1) st.next = ctx.currentTime + 0.05;
      while (st.next < ctx.currentTime + 0.2) {
        step(T, st.step, st.next, g);
        st.next += SD;
        st.step++;
      }
    }, 25);
    song = st;
  }
  function stopMusic(fade = 0.5) {
    if (!song) return;
    clearInterval(song.timer);
    const g = song.gain;
    g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
    setTimeout(() => g.disconnect(), fade * 1000 + 500);
    song = null;
  }

  // ---------- effects ----------

  const SFX = {
    hop: (t, o) => tone({ wave: pulse(0.25), f: 600, f1: 1300, t, dur: 0.07, gain: 0.08, to: o }),
    treat: (t, o) => { chip(88, t, 0.06, 0.08, o, 0.5); chip(95, t + 0.07, 0.25, 0.08, o, 0.5); },
    wrong: (t, o) => { tone({ type: "square", f: 110, t, dur: 0.1, gain: 0.07, to: o }); tone({ type: "square", f: 104, t: t + 0.01, dur: 0.1, gain: 0.05, to: o }); },
    warn: (t, o) => { for (let i = 0; i < 4; i++) chip(i % 2 ? 76 : 81, t + i * 0.1, 0.08, 0.07, o, 0.5); },
    tick: (t, o) => hat(t, 0.08, o),
    trampled: (t, o) => {
      for (let i = 0; i < 4; i++) noise({ t: t + i * 0.08, dur: 0.06, gain: 0.25, type: "lowpass", f: 500, to: o });
      tone({ wave: pulse(0.5), f: 800, f1: 90, t: t + 0.35, dur: 0.5, gain: 0.07, to: o });
    },
    boulder: (t, o) => {
      noise({ t, dur: 0.7, gain: 0.3, type: "lowpass", f: 1500, f1: 80, to: o });
      tone({ type: "square", f: 100, f1: 35, t, dur: 0.5, gain: 0.08, to: o });
    },
    creek: (t, o) => {
      [84, 79, 76, 72, 67].forEach((m, i) => chip(m, t + i * 0.06, 0.06, 0.06, o, 0.5));
      noise({ t: t + 0.3, dur: 0.25, gain: 0.12, type: "highpass", f: 3000, to: o });
    },
    swept: (t, o) => { for (let i = 0; i < 16; i++) tri(84 - i * 1.5, t + i * 0.045, 0.05, 0.16, o); },
    orca: (t, o) => {
      [0, 0.35, 0.55, 0.7, 0.82].forEach((d, i) => tone({ type: "square", f: hz(i % 2 ? 41 : 40), t: t + d, dur: 0.16, gain: 0.07, to: o }));
      [1.0, 1.15].forEach((d) => noise({ t: t + d, dur: 0.08, gain: 0.3, f: 700, to: o }));
    },
    swoop: (t, o) => {
      tone({ wave: pulse(0.25), f: 2000, f1: 400, t, dur: 0.3, gain: 0.07, to: o });
      tone({ wave: pulse(0.25), f: 400, f1: 1600, t: t + 0.35, dur: 0.5, gain: 0.06, to: o });
    },
    pounce: (t, o) => {
      noise({ t, dur: 0.1, gain: 0.25, f: 1000, to: o });
      for (let i = 0; i < 6; i++) chip(60 + Math.floor(Math.random() * 24), t + 0.12 + i * 0.07, 0.04, 0.06, o, 0.5);
    },
    hunter: (t, o) => {
      tone({ wave: pulse(0.5), f: 1500, f1: 200, t, dur: 0.15, gain: 0.08, to: o });
      noise({ t, dur: 0.05, gain: 0.2, type: "highpass", f: 2000, to: o });
    },
    // Ghost Race
    count: (t, o) => chip(81, t, 0.12, 0.08, o, 0.5),
    go: (t, o) => { chip(93, t, 0.35, 0.09, o, 0.5); chip(81, t, 0.35, 0.05, o, 0.25); },
    pass: (t, o) => [76, 81, 88].forEach((m, i) => chip(m, t + i * 0.05, 0.06, 0.07, o, 0.5)),
    passed: (t, o) => { tone({ type: "triangle", f: hz(79), f1: hz(67), t, dur: 0.28, gain: 0.16, to: o }); noise({ t, dur: 0.25, gain: 0.05, f: 900, f1: 300, to: o }); },
    win: (t, o) => {
      [72, 76, 79, 84].forEach((m, i) => chip(m, t + i * 0.09, 0.08, 0.08, o, 0.5));
      chip(88, t + 0.4, 0.5, 0.08, o, 0.5);
      chip(84, t + 0.4, 0.5, 0.05, o, 0.25);
    },
    lose: (t, o) => sting(t, o),
  };
  // the little "aww" after a death, once its own sound has played
  const DEATHS = new Set(["trampled", "boulder", "creek", "swept", "orca", "swoop", "pounce", "hunter"]);
  const STING_AT = { orca: 1.3, swept: 0.75, swoop: 0.95 };
  function sting(t, o) {
    [72, 71, 70].forEach((m, i) => chip(m, t + i * 0.16, 0.13, 0.08, o));
    chip(69, t + 0.48, 0.6, 0.08, o);
  }

  function play(name, key = "fhSfx") {
    if (!SFX[name] || !level(key) || !audio()) return;
    const t = ctx.currentTime + 0.01;
    SFX[name](t, sfxBus);
    if (DEATHS.has(name)) sting(t + (STING_AT[name] ?? 0.85), sfxBus);
  }

  TT.forestSound = {
    startMusic,
    stopMusic,
    play,
    // a game's music was switched off (or on)
    setLevels: () => {
      if (!ctx) return;
      setLevels();
      if (song && !level(song.key)) stopMusic(0.2);
    },
    playing: () => !!song,
  };
})();
