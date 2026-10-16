// Built-in songs for Tiles. These are public-domain pieces written out as notes and played by the
// app's own synth, so no recordings ship with the app.
//
// A song is a list of sections, each with a melody (m) and a bass line (b) written as notes:
//   "e5" one step, "e5:3" three steps, "r:2" a two-step rest, "c#4" / "bb3" sharp and flat,
//   "|" a bar line (only there to make the music easier to read).
// A step is 1/beat of a beat. A section can change the tempo (bpm) or move everything up or down
// by some semitones (t). Every section's melody and bass must be the same length.
//
// The app adds two more parts as it builds a song: a harmony (voice 2), a third under the melody in
// the song's key, and a light drum part (kick, snare and hi-hat) in the song's time. They're made
// from the written notes, so they always fit, and they only change the sound: the tiles still come
// from the melody and bass.
(() => {
  const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

  function parse(str, shift = 0) {
    const notes = [];
    let s = 0;
    for (const tok of str.trim().split(/\s+/)) {
      if (!tok || tok === "|") continue;
      const [name, len] = tok.split(":");
      const n = len ? Number(len) : 1;
      const m = /^([a-g])(#|b)?(\d)$/.exec(name);
      if (m) notes.push({ s, n, midi: 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + shift });
      else if (name !== "r") throw new Error(`Bad note "${tok}"`);
      s += n;
    }
    return { notes, steps: s };
  }

  // ---------- the songs ----------

  const twinkle = {
    A: { m: "c5:2 c5:2 g5:2 g5:2 | a5:2 a5:2 g5:4 | f5:2 f5:2 e5:2 e5:2 | d5:2 d5:2 c5:4",
         b: "c3:4 e3:4 | f3:4 c3:4 | f3:4 c3:4 | g2:4 c3:4" },
    B: { m: "g5:2 g5:2 f5:2 f5:2 | e5:2 e5:2 d5:4 | g5:2 g5:2 f5:2 f5:2 | e5:2 e5:2 d5:4",
         b: "c3:4 g2:4 | c3:4 g2:4 | c3:4 g2:4 | c3:4 g2:4" },
  };

  const ode = {
    A: { m: "e5:2 e5:2 f5:2 g5:2 | g5:2 f5:2 e5:2 d5:2 | c5:2 c5:2 d5:2 e5:2 | e5:3 d5:1 d5:4",
         b: "c3:4 c3:4 | g2:4 g2:4 | c3:4 c3:4 | g2:4 g2:4" },
    B: { m: "e5:2 e5:2 f5:2 g5:2 | g5:2 f5:2 e5:2 d5:2 | c5:2 c5:2 d5:2 e5:2 | d5:3 c5:1 c5:4",
         b: "c3:4 c3:4 | g2:4 g2:4 | c3:4 c3:4 | g2:4 c3:4" },
    C: { m: "d5:2 d5:2 e5:2 c5:2 | d5:2 e5:1 f5:1 e5:2 c5:2 | d5:2 e5:1 f5:1 e5:2 d5:2 | c5:2 d5:2 g4:4",
         b: "g2:4 c3:4 | g2:4 c3:4 | g2:4 g2:4 | c3:4 g2:4" },
  };

  const canonBass = "d3:4 a2:4 | b2:4 f#2:4 | g2:4 d2:4 | g2:4 a2:4";
  const canon = {
    intro: { m: "r:32", b: canonBass },
    v1: { m: "f#5:4 e5:4 | d5:4 c#5:4 | b4:4 a4:4 | b4:4 c#5:4", b: canonBass },
    v2: { m: "d5:4 c#5:4 | b4:4 a4:4 | g4:4 f#4:4 | g4:4 e4:4", b: canonBass },
    v3: { m: "d4:2 f#4:2 a4:2 g4:2 | f#4:2 d4:2 f#4:2 e4:2 | d4:2 b3:2 d4:2 a4:2 | g4:2 b4:2 a4:2 g4:2", b: canonBass },
    v4: { m: "d4:2 f#4:2 a4:2 g4:2 | f#4:2 d4:2 f#4:2 e4:2 | d4:2 b3:2 d4:2 a4:2 | g4:2 b4:2 a4:2 g4:2", b: canonBass, t: 12 },
    end: { m: "d5:8", b: "d3:8" },
  };

  const elise = {
    theme: { m: "e5 d#5 | e5 d#5 e5 b4 d5 c5 | a4:3 c4 e4 a4 | b4:3 e4 g#4 b4 | c5:3 e4 e5 d#5 | e5 d#5 e5 b4 d5 c5 | a4:3 c4 e4 a4 | b4:3 e4 c5 b4",
             b: "r:2 | r:6 | a2 e3 a3 r:3 | e2 e3 g#3 r:3 | a2 e3 a3 r:3 | r:6 | a2 e3 a3 r:3 | e2 e3 g#3 r:3" },
    end1: { m: "a4:4", b: "a2 e3 a3 r" },
    end2: { m: "a4:3 b4 c5 d5", b: "a2 e3 a3 r:3" },
    bridge: { m: "e5:3 g4 f5 e5 | d5:3 f4 e5 d5 | c5:3 e4 d5 c5 | b4:2 e4 e5 e4 e5 | e5 e6 d#5 e5 d#5 e5 | d#5 e5 d#5 e5",
              b: "c3 g3 c4 r:3 | g2 g3 b3 r:3 | a2 e3 a3 r:3 | e2 e3 e4 r:3 | r:6 | r:4" },
    fin: { m: "a4:6", b: "a2:6" },
  };

  const minuet = {
    A1: { m: "d5:2 g4 a4 b4 c5 | d5:2 g4:2 g4:2 | e5:2 c5 d5 e5 f#5 | g5:2 g4:2 g4:2 | c5:2 d5 c5 b4 a4 | b4:2 c5 b4 a4 g4 | f#4:2 g4 a4 b4 g4 | a4:6",
          b: "g3:4 a3:2 | b3:6 | c4:6 | b3:6 | a3:6 | g3:6 | d3:4 g3:2 | d3:2 f#3:2 a3:2" },
    A2: { m: "d5:2 g4 a4 b4 c5 | d5:2 g4:2 g4:2 | e5:2 c5 d5 e5 f#5 | g5:2 g4:2 g4:2 | c5:2 d5 c5 b4 a4 | b4:2 c5 b4 a4 g4 | a4:2 b4 a4 g4 f#4 | g4:6",
          b: "g3:4 a3:2 | b3:6 | c4:6 | b3:6 | a3:6 | g3:6 | c4:2 d4:2 d3:2 | g3:4 g2:2" },
    B: { m: "b5:2 g5 a5 b5 g5 | a5:2 d5 e5 f#5 d5 | g5:2 e5 f#5 g5 d5 | c#5:2 b4 c#5 a4:2 | a4 b4 c#5 d5 e5 f#5 | g5:2 f#5:2 e5:2 | f#5:2 a4:2 c#5:2 | d5:6 | d5:2 g4 f#4 g4:2 | e5:2 g4 f#4 g4:2 | d5:2 c5:2 b4:2 | a4 g4 f#4 g4 a4:2 | d4 e4 f#4 g4 a4 b4 | c5:2 b4:2 a4:2 | b4 d5 g4:2 f#4:2 | g4:6",
         b: "g3:6 | f#3:6 | e3:6 | a3:4 a2:2 | a3:6 | e3:2 g3:2 a3:2 | a3:6 | d3:4 d4:2 | b3:6 | c4:6 | b3:2 a3:2 g3:2 | c4:2 d4:2 d3:2 | g3:6 | a3:6 | g3:4 d3:2 | g2:6" },
  };

  const kingTheme = {
    m: "b3 c#4 d4 e4 f#4 d4 f#4:2 | f4 c#4 f4:2 e4 c4 e4:2 | b3 c#4 d4 e4 f#4 d4 f#4 b4 | a4 f#4 d4 f#4 a4:4",
    b: "b2:2 f#2:2 b2:2 f#2:2 | c#3:2 f#2:2 c3:2 e2:2 | b2:2 f#2:2 b2:2 f#2:2 | f#2:2 c#3:2 f#2:4",
  };

  const turkish = {
    A1: { m: "b4 a4 g#4 a4 | c5:4 d5 c5 b4 c5 | e5:4 f5 e5 d#5 e5 | b5 a5 g#5 a5 b5 a5 g#5 a5 | c6:4 a5:2 c6:2 | b5:2 a5:2 g5:2 a5:2 | b5:2 a5:2 g5:2 a5:2 | b5:2 a5:2 g5:2 f#5:2 | e5:4",
          b: "r:4 | a2:2 e3:2 c3:2 e3:2 | a2:2 e3:2 c3:2 e3:2 | e2:2 b2:2 g#2:2 b2:2 | a2:2 e3:2 c3:2 e3:2 | e2:2 b2:2 g2:2 b2:2 | e2:2 b2:2 g2:2 b2:2 | b2:2 d#3:2 f#3:2 a3:2 | e2:2 b2:2" },
    A2: { m: "b4 a4 g#4 a4 | c5:4 d5 c5 b4 c5 | e5:4 f5 e5 d#5 e5 | b5 a5 g#5 a5 b5 a5 g#5 a5 | c6:4 a5:2 b5:2 | c6:2 b5:2 a5:2 g#5:2 | a5:2 e5:2 f5:2 d5:2 | c5:4 b4:3 a4:1 | a4:4",
          b: "r:4 | a2:2 e3:2 c3:2 e3:2 | a2:2 e3:2 c3:2 e3:2 | e2:2 b2:2 g#2:2 b2:2 | a2:2 e3:2 c3:2 e3:2 | a2:2 e3:2 e2:2 g#2:2 | a2:2 c3:2 d3:2 f3:2 | e2:2 b2:2 e2:2 g#2:2 | a2:4" },
    B: { m: "e5:2 f5:2 | g5:2 g5:2 a5 g5 f5 e5 | d5:4 e5:2 f5:2 | g5:2 g5:2 a5 g5 f5 e5 | d5:4 c5:2 d5:2 | e5:2 e5:2 f5 e5 d5 c5 | b4:4 c5:2 d5:2 | e5:2 e5:2 f5 e5 d5 c5 | b4:4",
         b: "r:4 | c3:2 g3:2 e3:2 g3:2 | g2:2 d3:2 b2:2 d3:2 | c3:2 g3:2 e3:2 g3:2 | g2:2 d3:2 b2:2 d3:2 | a2:2 e3:2 c3:2 e3:2 | e2:2 b2:2 g#2:2 b2:2 | a2:2 e3:2 c3:2 e3:2 | e2:2 b2:2" },
  };

  // Lyrics for the songs that have words, both long in the public domain: Jane Taylor's poem "The
  // Star" (1806), sung to the Twinkle tune, and Henry van Dyke's "Hymn of Joy" (1907), the usual
  // English words for Ode to Joy. Tiles takes many of its words from these (lyrics.js).
  const TWINKLE_LYRICS = `Twinkle, twinkle, little star, how I wonder what you are!
Up above the world so high, like a diamond in the sky.
When the blazing sun is gone, when he nothing shines upon,
Then you show your little light, twinkle, twinkle, all the night.
Then the traveller in the dark thanks you for your tiny spark;
He could not see which way to go, if you did not twinkle so.
In the dark blue sky you keep, and often through my curtains peep,
For you never shut your eye till the sun is in the sky.`;

  const ODE_LYRICS = `Joyful, joyful, we adore thee, God of glory, Lord of love;
Hearts unfold like flowers before thee, opening to the sun above.
Melt the clouds of sin and sadness; drive the dark of doubt away;
Giver of immortal gladness, fill us with the light of day!
All thy works with joy surround thee, earth and heaven reflect thy rays,
Stars and angels sing around thee, center of unbroken praise.
Field and forest, vale and mountain, flowery meadow, flashing sea,
Singing bird and flowing fountain call us to rejoice in thee.`;

  // How the lyrics are sung: one string per section (in the song's section order), one syllable on
  // each melody note. Syllables of a word are joined by "-"; "_" is a note slurred on from the
  // syllable before it. Each word is timed by its first syllable's note, so Tiles can put a word on
  // the tile that falls as it's sung.
  const TWINKLE_SUNG = [
    "Twin-kle twin-kle lit-tle star, how I won-der what you are",
    "Up a-bove the world so high, like a dia-mond in the sky",
    "Twin-kle twin-kle lit-tle star, how I won-der what you are",
    "When the bla-zing sun is gone, when he no-thing shines up-on",
    "Then you show your lit-tle light, twin-kle twin-kle all the night",
    "Twin-kle twin-kle lit-tle star, how I won-der what you are",
  ];
  const ODE_SUNG = [
    "Joy-ful, joy-ful, we a-dore thee, God of glo-ry, Lord of love",
    "Hearts un-fold like flowers be-fore thee, o-pening to the sun a-bove",
    "Melt the clouds of sin and _ sad-ness, drive the _ dark of doubt a-way",
    "Gi-ver of im-mor-tal glad-ness, fill us with the light of day",
    "All thy works with joy sur-round thee, earth and heaven re-flect thy rays",
    "Stars and an-gels sing a-round thee, cen-ter of un-bro-ken praise",
    "Field and for-est, vale and _ moun-tain, flow-ery _ mea-dow, flash-ing sea",
    "Sing-ing bird and flow-ing foun-tain call us to re-joice in thee",
  ];

  // tempo: how fast the song is played, as a label for the song list
  const SONGS = [
    { id: "twinkle", title: "Twinkle, Twinkle", composer: "Mozart (theme)", year: 1781, tempo: "SLOW",
      blurb: "The French tune Mozart wrote his famous variations on.", lyrics: TWINKLE_LYRICS, sung: TWINKLE_SUNG,
      bpm: 100, beat: 2, bar: 4, pickup: 0,
      sections: [twinkle.A, twinkle.B, twinkle.A, twinkle.A, twinkle.B, twinkle.A] },
    { id: "ode", title: "Ode to Joy", composer: "Beethoven", year: 1824, tempo: "SLOW",
      blurb: "The big tune from the last movement of the Ninth Symphony.", lyrics: ODE_LYRICS, sung: ODE_SUNG,
      bpm: 100, beat: 2, bar: 4, pickup: 0,
      sections: [ode.A, ode.B, ode.C, ode.B, ode.A, ode.B, ode.C, ode.B] },
    { id: "canon", title: "Canon in D", composer: "Pachelbel", year: 1680, tempo: "SLOW",
      blurb: "The same eight bass notes over and over, with the melody building on top.",
      bpm: 72, beat: 2, bar: 4, pickup: 0,
      sections: [canon.intro, canon.v1, canon.v2, canon.v3, canon.v4, canon.v1, canon.end] },
    { id: "elise", title: "Für Elise", composer: "Beethoven", year: 1810, tempo: "MEDIUM",
      blurb: "Beethoven's little piano piece, in three beats to the bar.",
      bpm: 120, beat: 2, bar: 3, pickup: 2,
      sections: [elise.theme, elise.end1, elise.theme, elise.end2, elise.bridge, elise.theme, elise.end1, elise.theme, elise.end2, elise.bridge, elise.theme, elise.fin] },
    { id: "minuet", title: "Minuet in G", composer: "Petzold", year: 1725, tempo: "MEDIUM",
      blurb: "A dance from the notebook Bach kept for his wife, Anna Magdalena.",
      bpm: 120, beat: 2, bar: 3, pickup: 0,
      sections: [minuet.A1, minuet.A2, minuet.B, minuet.B] },
    { id: "king", title: "In the Hall of the Mountain King", composer: "Grieg", year: 1875, tempo: "SPEEDS UP",
      blurb: "One sneaky tune, played again and again, faster and faster.",
      bpm: 92, beat: 2, bar: 4, pickup: 0, key: { tonic: 11, minor: true }, // B minor (its F sharps fool keyOf)
      sections: [
        { ...kingTheme, bpm: 92 }, { ...kingTheme, bpm: 92 },
        { ...kingTheme, bpm: 104, t: 12 }, { ...kingTheme, bpm: 116, t: 12 },
        { ...kingTheme, bpm: 128 }, { ...kingTheme, bpm: 140, t: 12 },
        { ...kingTheme, bpm: 152, t: 12 }, { ...kingTheme, bpm: 164, t: 12 },
        { m: "b4:2 f#4:2 b4:4", b: "b2:2 f#2:2 b1:4", bpm: 164 },
      ] },
    { id: "turkish", title: "Turkish March", composer: "Mozart", year: 1783, tempo: "FAST",
      blurb: "The quick last movement of Mozart's Piano Sonata No. 11.",
      bpm: 120, beat: 4, bar: 2, pickup: 4,
      sections: [turkish.A1, turkish.A2, turkish.B, turkish.A1, turkish.A2, turkish.B, turkish.A1, turkish.A2] },
  ];

  // ---------- building ----------

  // How much a beat stands out, 0 to 1, from the notes that start on it (i = step in the section).
  // A melody note counts most, more when it's long or starts a phrase (after a rest or a long note);
  // the bass adds a little. Nothing starting on the beat is 0, so it never gets a word.
  function weight(song, mel, bass, i) {
    const note = mel.notes.find((n) => n.s === i);
    let w = bass.notes.some((n) => n.s === i) ? 0.2 : 0;
    if (note) {
      const prev = mel.notes[mel.notes.indexOf(note) - 1];
      const phrase = !prev || prev.s + prev.n < i || prev.n >= 2 * song.beat;
      w += 0.5 + 0.2 * Math.min(1, note.n / (2 * song.beat)) + (phrase ? 0.1 : 0);
    }
    return Math.min(1, w);
  }

  // The pitch (MIDI number) of the note starting on a beat: the melody's, or the bass's if the
  // melody has none there. Tiles uses it to put higher notes in columns further right.
  function pitch(mel, bass, i) {
    const note = mel.notes.find((n) => n.s === i) || bass.notes.find((n) => n.s === i);
    return note ? note.midi : null;
  }

  // Works out every note's time and every beat. Beats know whether they start a bar (down),
  // whether a melody note (mel) or any note (any) starts on them, how much they stand out (w)
  // and their pitch (p), so tiles land on the music's important moments and follow the tune.
  // A sung line's syllables: [{ word, first }] per melody note, or null for a slurred note.
  function syllables(line) {
    const out = [];
    for (const tok of line.split(/\s+/)) {
      if (!tok) continue;
      if (tok === "_") { out.push(null); continue; }
      const word = tok.toLowerCase().replace(/[^a-z'-]/g, "").replace(/-/g, "");
      tok.split("-").forEach((_, k) => out.push({ word, first: k === 0 }));
    }
    return out;
  }

  // The song's key: the major or minor key whose profile best fits how long each pitch class
  // sounds (Krumhansl and Kessler's key profiles). Returns { tonic, minor }.
  const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function keyOf(notes) {
    const dur = new Array(12).fill(0);
    for (const n of notes) dur[n.midi % 12] += n.d;
    const fit = (profile, tonic) => {
      let s = 0;
      for (let k = 0; k < 12; k++) s += dur[(tonic + k) % 12] * profile[k];
      return s;
    };
    let best = { tonic: 0, minor: false, s: -Infinity };
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const minor of [false, true]) {
        const s = fit(minor ? MINOR : MAJOR, tonic);
        if (s > best.s) best = { tonic, minor, s };
      }
    }
    return best;
  }
  // The scale's notes: major, or harmonic minor (its raised seventh is what minor tunes lean on).
  const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 11] };
  // A third under a melody note, in the key, or null for a note outside the scale.
  function thirdBelow(midi, key) {
    const scale = SCALE[key.minor ? "minor" : "major"];
    const rel = (((midi - key.tonic) % 12) + 12) % 12;
    const deg = scale.indexOf(rel);
    if (deg < 0) return null;
    const down = (deg - 2 + 7) % 7;
    const step = (scale[deg] - scale[down] + 12) % 12;
    return midi - step;
  }
  const HARMONY_MIN_S = 0.2; // shorter melody notes get no harmony, so fast runs stay clean

  // The drums for one step of a section: g is the step counted from the first downbeat. Kick and
  // snare on the beats (1 and 3 / 2 and 4; in three, kick on 1 and hi-hats on 2 and 3), hi-hats on
  // the half beats.
  function drumsAt(song, g) {
    const perBar = song.beat * song.bar;
    const inBar = ((g % perBar) + perBar) % perBar;
    const out = [];
    if (inBar % song.beat === 0) {
      const b = inBar / song.beat;
      if (song.bar === 3) out.push(b === 0 ? "kick" : "hat");
      else if (song.bar === 2) out.push(b === 0 ? "kick" : "snare");
      else out.push(b % 2 === 0 ? "kick" : "snare");
    } else if (song.beat % 2 === 0 && inBar % song.beat === song.beat / 2) out.push("hat");
    return out;
  }

  function build(song) {
    const notes = [];
    const beats = [];
    const drums = []; // { t, kind: "kick" | "snare" | "hat" }
    const sungWords = []; // { t (seconds), w, tol }: when each sung word starts
    const perBar = song.beat * song.bar;
    const mod = (a, n) => ((a % n) + n) % n;
    let step = 0;
    let t = 0;
    for (const [sectionIndex, sec] of song.sections.entries()) {
      const dt = 60 / (sec.bpm || song.bpm) / song.beat; // seconds per step
      const voices = [parse(sec.m, sec.t || 0), parse(sec.b || "", sec.t || 0)];
      const len = Math.max(voices[0].steps, voices[1].steps);
      voices.forEach((v, voice) => {
        for (const n of v.notes) notes.push({ t: t + n.s * dt, d: n.n * dt, midi: n.midi, voice });
      });
      const starts = voices.map((v) => new Set(v.notes.map((n) => n.s)));
      const line = song.sung && song.sung[sectionIndex];
      if (line) {
        const syl = syllables(line);
        if (syl.length !== voices[0].notes.length) throw new Error(`${song.id}: section ${sectionIndex + 1} has ${syl.length} syllables for ${voices[0].notes.length} notes`);
        syl.forEach((x, k) => {
          if (x && x.first && x.word.length >= 2 && /^[a-z]+$/.test(x.word)) sungWords.push({ t: t + voices[0].notes[k].s * dt, w: x.word, tol: 0.12 });
        });
      }
      // the drums: through every section, but only a last kick on the final one
      const last = sectionIndex === song.sections.length - 1;
      for (let i = 0; i < len; i++) {
        const g = step + i - song.pickup;
        if (g < 0 || (last && i > 0)) continue;
        for (const kind of last ? ["kick"] : drumsAt(song, g)) drums.push({ t: t + i * dt, kind });
      }
      for (let i = 0; i < len; i++) {
        const g = step + i - song.pickup;
        if (mod(g, song.beat)) continue;
        beats.push({ t: t + i * dt, down: mod(g, perBar) === 0, mel: starts[0].has(i), any: starts[0].has(i) || starts[1].has(i), w: weight(song, ...voices, i), p: pitch(...voices, i), len: song.beat * dt });
      }
      step += len;
      t += len * dt;
    }
    // the harmony: a third under each melody note long enough to carry one, in the song's key
    const key = song.key || keyOf(notes);
    for (const n of notes.filter((x) => x.voice === 0 && x.d >= HARMONY_MIN_S)) {
      const midi = thirdBelow(n.midi, key);
      if (midi != null) notes.push({ t: n.t, d: n.d, midi, voice: 2 });
    }
    notes.sort((a, b) => a.t - b.t || a.voice - b.voice);
    return { ...song, notes, beats, drums, key, sungWords, duration: t };
  }

  const cache = new Map();
  const added = new Map(); // songs added from files (music.js), already in built form
  TT.songs = {
    list: SONGS,
    get(id) {
      if (added.has(id)) return added.get(id);
      const song = SONGS.find((s) => s.id === id);
      if (!song) return null;
      if (!cache.has(id)) cache.set(id, build(song));
      return cache.get(id);
    },
    build,
    parse,
    keyOf,
    thirdBelow,
    register: (song) => added.set(song.id, song),
    unregister: (id) => added.delete(id),
  };
})();
