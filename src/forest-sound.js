// The arcade games' music and sound effects ("Pocket Pixels"): bouncy 8-bit tunes and blips, made
// live with Web Audio (no recordings), so they work offline. It shares Tiles' audio context.
//
// Each tune loops four bars: a pulse-wave lead, a quiet arpeggio, a triangle bass jumping octaves,
// and a noise kick, snare and hats, scheduled a little ahead on the audio clock: Forest Hop's
// tune, C, Am, F, G at 132 bpm. Ghost Race has its own: a sports-broadcast march in G at 138, a
// brassy lead in thirds over an oom-pah bass, with a snare roll into each repeat. Wormhole's is a
// plucky underground tune in D minor at 112 (Dm, B♭, F, C), all short notes over a bouncing bass.
// Each game switches its music and effects on or off on its own screen: the setting named with
// each call (Forest Hop fhMusic and fhSfx, Ghost Race grMusic and grSfx, Wormhole wmMusic and wmSfx).
(() => {
  const TUNES = {
    forest: {
      bpm: 132,
      chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
      roots: [48, 45, 41, 43],
      mel: [[72, 76, 79, 76, 84, 0, 79, 0], [81, 0, 76, 0, 72, 76, 81, 0], [77, 81, 84, 81, 77, 0, 72, 0], [79, 0, 74, 79, 83, 0, 86, 0]],
    },
    stadium: {
      bpm: 138,
      brass: true, // a lead in thirds, an oom-pah bass, a march snare
      chords: [[55, 59, 62], [60, 64, 67], [62, 66, 69], [55, 59, 62]],
      roots: [43, 48, 50, 43],
      mel: [[79, 0, 79, 83, 86, 0, 83, 0], [84, 0, 84, 88, 91, 0, 88, 0], [86, 85, 86, 83, 81, 0, 78, 0], [79, 83, 86, 91, 0, 0, 0, 0]],
    },
    burrow: {
      bpm: 112,
      pluck: true, // every note short
      chords: [[62, 65, 69], [58, 62, 65], [60, 65, 69], [60, 64, 67]],
      roots: [38, 34, 41, 36],
      mel: [[74, 0, 77, 74, 69, 0, 72, 74], [70, 0, 74, 70, 65, 0, 69, 70], [72, 0, 77, 72, 69, 72, 76, 77], [76, 0, 72, 0, 67, 0, 72, 0]],
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

  // the highest note of a chord (in any octave) below m: the harmony a third or so under the lead
  const below = (m, chord) => {
    let best = m - 12;
    for (const c of chord) for (let n = c - 24; n < m; n += 12) if (n > best && n < m - 1) best = n;
    return best;
  };

  // Ghost Race's march: brass in thirds, oom-pah, snare on 2 and 4 and a roll into the repeat
  function brassStep(T, s, t, to) {
    const SD = 60 / T.bpm / 4;
    const bar = Math.floor(s / 16) % 4, pos = s % 16;
    if (pos === 0 || pos === 8) kick(t, 0.3, to);
    if (pos === 4 || pos === 12) snare(t, 0.12, to);
    if (bar === 3 && pos >= 12) snare(t, 0.05 + (pos - 12) * 0.02, to);
    if (pos % 4 === 2) hat(t, 0.02, to);
    if (pos % 8 === 0) tri(T.roots[bar], t, SD * 3, 0.24, to);
    if (pos % 8 === 4) tri(T.roots[bar] + 7, t, SD * 3, 0.18, to);
    if (pos % 2 === 0) {
      const m = T.mel[bar][pos / 2];
      const long = bar === 3 && pos === 6 ? SD * 10 : SD * 1.8; // the last note of the phrase rings
      if (m) {
        chip(m, t, long, 0.05, to, 0.5);
        chip(below(m, T.chords[bar]), t, long, 0.035, to, 0.25);
      }
    }
  }

  function step(T, s, t, to) {
    if (T.brass) return brassStep(T, s, t, to);
    const SD = 60 / T.bpm / 4; // a sixteenth
    const bar = Math.floor(s / 16) % 4, pos = s % 16, loop = Math.floor(s / 64);
    if (pos === 0 || pos === 8 || (T.drive && pos % 4 === 0)) kick(t, 0.32, to);
    if (pos === 4 || pos === 12) snare(t, 0.13, to);
    if (T.drive && pos % 2) hat(t, 0.015, to);
    if (pos % 2 === 0) {
      hat(t, pos % 4 ? 0.04 : 0.025, to);
      tri(T.roots[bar] + (pos % 4 ? 12 : 0), t, SD * (T.pluck ? 0.9 : 1.6), 0.2, to);
      const m = T.mel[bar][pos / 2];
      if (m) chip(m, t, SD * (T.pluck ? 0.8 : 1.7), 0.06, to);
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
    // Ghost Race: the starter, the crowd, the camera, and brass for the big moments
    marks: (t, o) => {
      noise({ t, dur: 0.9, gain: 0.05, type: "lowpass", f: 700, a: 0.2, to: o }); // the crowd settles
      tone({ f: 1850, f1: 1750, t: t + 0.05, dur: 0.22, gain: 0.04, to: o });
    },
    set: (t, o) => chip(72, t, 0.05, 0.06, o, 0.5),
    gun: (t, o) => {
      noise({ t, dur: 0.12, gain: 0.5, type: "highpass", f: 1500, a: 0.001, to: o });
      noise({ t, dur: 0.45, gain: 0.3, type: "lowpass", f: 500, f1: 120, a: 0.002, to: o });
      tone({ f: 130, f1: 45, t, dur: 0.25, gain: 0.25, to: o });
    },
    cheer: (t, o) => {
      // a roar from the stands, with a couple of whistles
      [0, 0.12, 0.3].forEach((d, i) => noise({ t: t + d, dur: 1.4 - i * 0.2, gain: 0.16, f: 900 + i * 700, q: 0.6, a: 0.25, to: o }));
      tone({ f: 1900, f1: 2600, t: t + 0.3, dur: 0.18, gain: 0.04, to: o });
      tone({ f: 2400, f1: 1800, t: t + 0.55, dur: 0.22, gain: 0.04, to: o });
    },
    shutter: (t, o) => {
      noise({ t, dur: 0.015, gain: 0.3, type: "highpass", f: 4000, a: 0.001, to: o });
      noise({ t: t + 0.06, dur: 0.02, gain: 0.25, type: "highpass", f: 3000, a: 0.001, to: o });
    },
    pass: (t, o) => [79, 83, 86].forEach((m, i) => { chip(m, t + i * 0.07, 0.07, 0.07, o, 0.5); chip(m - 4, t + i * 0.07, 0.07, 0.04, o, 0.25); }),
    passed: (t, o) => {
      chip(74, t, 0.12, 0.06, o, 0.5);
      chip(70, t + 0.14, 0.25, 0.06, o, 0.5);
      noise({ t, dur: 0.6, gain: 0.08, f: 500, q: 0.7, a: 0.1, to: o }); // the crowd groans
    },
    win: (t, o) => {
      // ta-ta-ta-taaa
      [[79, 0], [79, 0.12], [79, 0.24], [86, 0.36]].forEach(([m, d], i) => {
        const dur = i === 3 ? 0.7 : 0.08;
        chip(m, t + d, dur, 0.08, o, 0.5);
        chip(m - (i === 3 ? 5 : 4), t + d, dur, 0.05, o, 0.25);
      });
    },
    lose: (t, o) => sting(t, o),
    // Wormhole: the countdown, crunches of earth, and a chime that climbs higher for rarer answers
    wmCount: (t, o) => chip(69, t, 0.07, 0.06, o, 0.5),
    wmGo: (t, o) => {
      [62, 69, 74].forEach((m, i) => chip(m, t + i * 0.05, 0.12, 0.07, o, 0.5));
      crunch(t + 0.12, o, 3);
    },
    wmTier0: (t, o) => {
      chip(72, t, 0.08, 0.06, o, 0.5);
      crunch(t, o, 2);
    },
    wmTier1: (t, o) => {
      [72, 79].forEach((m, i) => chip(m, t + i * 0.08, 0.1, 0.07, o, 0.5));
      crunch(t, o, 3);
    },
    wmTier2: (t, o) => {
      [72, 76, 79, 84].forEach((m, i) => chip(m, t + i * 0.07, 0.1, 0.07, o, 0.5));
      crunch(t, o, 5);
    },
    wmTier3: (t, o) => {
      [72, 76, 79, 84, 88, 91].forEach((m, i) => chip(m, t + i * 0.06, 0.12, 0.075, o, 0.5));
      [96, 100, 103].forEach((m, i) => chip(m, t + 0.42 + i * 0.08, 0.22, 0.035, o, 0.125)); // a sparkle
      crunch(t, o, 8);
    },
    wmDup: (t, o) => tone({ type: "triangle", f: 220, f1: 170, t, dur: 0.14, gain: 0.12, to: o }),
    wmUp: (t, o) => [72, 67, 64, 60].forEach((m, i) => chip(m, t + i * 0.09, 0.09, 0.06, o, 0.5)),
    wmLayer: (t, o) => {
      noise({ t, dur: 0.7, gain: 0.2, type: "lowpass", f: 320, f1: 80, a: 0.06, to: o }); // a rumble
      chip(81, t + 0.18, 0.3, 0.04, o, 0.25);
      chip(86, t + 0.3, 0.4, 0.035, o, 0.25);
    },
  };
  // earth giving way: n soft crunches, a little uneven
  function crunch(t, o, n) {
    for (let i = 0; i < n; i++) noise({ t: t + i * 0.07 + Math.random() * 0.02, dur: 0.05, gain: 0.16, type: "lowpass", f: 900 + Math.random() * 700, to: o });
  }
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
