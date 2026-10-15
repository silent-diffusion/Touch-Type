// Tiles: a rhythm game. Words fall down four lanes in time with a song. Type a word, then press
// Enter (or Space) as its tile crosses the line. Typing is judged for accuracy, the Enter press
// for timing.
//
// Like Forest Hop, the rules live in a pure core so replays re-run exactly. A recording keeps the
// hit times, the words and lanes it was given, and the keys, so the song isn't needed to replay it.
(() => {
  const A = TT.analysis;
  const W = TT.wordInput;
  const BACK = "<", BACK_WORD = "{";
  const RULES = 2; // v2: wrong letters are typed and must be backspaced
  const LANES = 4;

  // gap: seconds between words the chart aims for (it snaps to the song's beats)
  // min: the closest two words can ever be, in seconds
  // fall: milliseconds a tile takes to fall from the top to the line
  const DIFFS = {
    easy:   { name: "EASY",   gap: 4.0, min: 2.0,  fall: 4200, len: [3, 4], missHp: 8 },
    medium: { name: "MEDIUM", gap: 2.4, min: 1.2,  fall: 3400, len: [3, 5], missHp: 10 },
    hard:   { name: "HARD",   gap: 1.4, min: 0.7,  fall: 2700, len: [4, 6], missHp: 12 },
    expert: { name: "EXPERT", gap: 0.9, min: 0.55, fall: 2100, len: [4, 7], missHp: 14 },
  };
  const DIFF_IDS = Object.keys(DIFFS);
  // Timing windows in ms. Early presses get more room than late ones.
  const WIN = { perfect: 60, great: 130, early: 250, late: 180 };
  const POINTS = { P: 300, G: 200, O: 100 };
  const HEAL = { P: 4, G: 3, O: 2 };
  const TYPO_HP = 2, START_HP = 80, MAX_HP = 100;
  const GRADE_NAMES = { P: "PERFECT", G: "GREAT", O: "GOOD", M: "MISS", E: "TOO EARLY" };
  const LEAD_MS = 1200; // quiet time before the first tile shows up
  const HISTORY_CAP = 200;

  const multiplier = (combo) => (combo >= 50 ? 4 : combo >= 25 ? 3 : combo >= 10 ? 2 : 1);
  const letterGrade = (timing) => (timing >= 95 ? "S" : timing >= 85 ? "A" : timing >= 70 ? "B" : timing >= 50 ? "C" : "D");

  // ---------- chart ----------

  // How a chart weighs a beat: how much it stands out (w, 0 to 1) plus a little for starting a bar.
  const DOWN_BONUS = 0.15;
  // How much a gap away from the difficulty's target spacing costs, against a beat's weight.
  const SPACING = 2.5;
  const WORD_COST = 0.3;
  const beatValue = (b) => (b.w > 0 ? Math.min(1, b.w + (b.down ? DOWN_BONUS : 0)) : 0);

  // The hit times (ms of song time) for a song at a difficulty. Of the beats where something
  // happens, it picks the set with the most total weight while keeping the gaps close to the
  // difficulty's spacing and never under its minimum, so words land on the music's important
  // moments: long and phrase-starting melody notes in built-in songs, the hardest hits in added ones.
  // (Dynamic programming, like the beat tracker in beats.js.) If a difficulty comes out about as
  // sparse as the easier one, it aims tighter, so a harder one has more words whenever it can.
  function chart(song, diff) {
    if (!song.charts) {
      song.charts = {};
      const meanGap = (h) => (h.length > 1 ? (h[h.length - 1] - h[0]) / 1000 / (h.length - 1) : Infinity);
      let prev = Infinity;
      for (const id of DIFF_IDS) {
        const D = DIFFS[id];
        let hits = pick(song, D, D.gap);
        if (meanGap(hits) > prev * 0.9) hits = pick(song, D, prev * 0.7);
        song.charts[id] = hits;
        prev = meanGap(hits);
      }
    }
    return song.charts[diff];
  }

  function pick(song, D, target) {
    const end = song.duration - 0.25;
    const c = song.beats.filter((b) => b.t >= 0.5 && b.t <= end && beatValue(b) > 0);
    const n = c.length;
    // Each word costs the average beat's weight, so only beats that stand out are worth crowding in.
    const cost = WORD_COST * c.reduce((sum, b) => sum + beatValue(b), 0) / Math.max(1, n);
    const score = new Float64Array(n);
    const back = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      const v = beatValue(c[i]) - cost;
      score[i] = c[i].t <= c[0].t + target ? v : -Infinity; // the chart starts near the song's start
      for (let j = i - 1; j >= 0; j--) {
        const gap = c[i].t - c[j].t;
        if (gap < D.min * 0.95) continue;
        const s = score[j] + v - SPACING * Math.log(gap / target) ** 2;
        if (s > score[i]) {
          score[i] = s;
          back[i] = j;
        }
      }
    }
    // The chart ends on the best beat near the end of the song, then follows the picks back.
    let last = -1;
    for (let i = 0; i < n; i++) if (c[i].t >= c[n - 1].t - target && (last < 0 || score[i] > score[last])) last = i;
    const out = [];
    for (let i = last; i >= 0; i = back[i]) out.push(Math.round(c[i].t * 1000));
    return out.reverse();
  }

  // The first hit of the charts before they followed the music, for older recordings that didn't
  // save where the song started: the first bar (with sound, in an added song) half a second in.
  const oldFirstHit = (song) => {
    const b = song.beats.find((x) => x.down && x.t >= 0.5 && (!song.user || x.any));
    return b ? Math.round(b.t * 1000) : 0;
  };

  // ---------- core ----------

  // hits: game-time ms at which each tile reaches the line. endT: when the round ends.
  function newCore({ hits, fall, endT, diff, v = RULES }) {
    return {
      v, hits, fall, endT, diff,
      missHp: (DIFFS[diff] || DIFFS.medium).missHp,
      next: 0,          // index of the next tile to appear
      tiles: [],        // on screen, oldest first: { i, w, l, born }
      res: [],          // per tile: { grade, d, t }
      buf: "", bad: -1,
      score: 0, combo: 0, maxCombo: 0, hp: START_HP,
      keys: 0, correct: 0, mistakes: 0, chars: 0,
      counts: { P: 0, G: 0, O: 0, M: 0 },
      offsets: [],      // ms early (-) or late (+) of each hit
      keyStats: {}, missedWords: new Set(), stepMisses: [],
      last: null,       // the latest judgment: { grade, t, i, l, d }
      over: false, endAt: 0, cause: null,
    };
  }

  // The tile you're typing: the first one the correctly typed letters fit.
  const target = (g) => {
    const typed = W.good(g);
    return typed ? g.tiles.find((x) => x.w.startsWith(typed)) || null : null;
  };

  // Wrong keys are tied to a letter once it's known which word they were for. `letters` is what
  // was typed correctly of `word`. Before v2, wrong keys past what was typed weren't counted.
  const attribute = (g, letters, word = letters) => W.attribute(g, letters, g.v >= 2 ? word : letters, word);

  function finish(g, t, cause) {
    g.over = true;
    g.endAt = t;
    g.cause = cause;
  }

  function hurt(g, n, t) {
    g.hp = Math.max(0, g.hp - n);
    if (g.hp <= 0) finish(g, t, "health");
  }

  function spawn(g, t, provider) {
    const i = g.next++;
    const { w, l } = provider(g, i, t);
    g.tiles.push({ i, w, l, born: t });
  }

  function miss(g, tile, t) {
    g.tiles = g.tiles.filter((x) => x !== tile);
    // What was typed of a missed word still counts toward key stats.
    const typed = W.good(g);
    if (typed && tile.w.startsWith(typed) && !g.tiles.some((x) => x.w.startsWith(typed))) {
      attribute(g, typed, tile.w);
      W.reset(g);
    }
    g.res[tile.i] = { grade: "M", t };
    g.counts.M++;
    g.combo = 0;
    g.last = { grade: "M", t, i: tile.i, l: tile.l };
    hurt(g, g.missHp, t);
  }

  function hit(g, tile, d, t) {
    const a = Math.abs(d);
    const grade = a <= WIN.perfect ? "P" : a <= WIN.great ? "G" : "O";
    g.tiles = g.tiles.filter((x) => x !== tile);
    g.keys++;
    g.correct++;
    const misses = attribute(g, tile.w);
    g.res[tile.i] = { grade, d, t };
    g.counts[grade]++;
    g.combo++;
    g.maxCombo = Math.max(g.maxCombo, g.combo);
    g.score += POINTS[grade] * multiplier(g.combo);
    g.hp = Math.min(MAX_HP, g.hp + HEAL[grade]);
    g.chars += tile.w.length + 1;
    g.offsets.push(d);
    W.reset(g);
    g.last = { grade, t, i: tile.i, l: tile.l, d };
    return { type: "hit", grade, d, word: tile.w, misses, i: tile.i };
  }

  // Runs everything that happens on its own (tiles appearing, tiles passing the line, the song
  // ending) up to time t, in time order. Returns true once the round is over.
  function advance(g, t, provider) {
    while (!g.over) {
      const spawnT = g.next < g.hits.length ? g.hits[g.next] - g.fall : Infinity;
      const missT = g.tiles.length ? g.hits[g.tiles[0].i] + WIN.late : Infinity;
      const ev = Math.min(spawnT, missT, g.endT);
      if (ev > t) break;
      if (ev === missT) miss(g, g.tiles[0], ev);
      else if (ev === spawnT) spawn(g, ev, provider);
      else finish(g, ev, "done");
    }
    return g.over;
  }

  // Applies one key press at time t. " " is the strike key (Enter or Space).
  function applyKey(g, k, t, provider) {
    if (advance(g, t, provider)) return null;
    if (k === BACK || k === BACK_WORD) {
      const b = W.back(g, k === BACK_WORD);
      return b && { type: "back", ...b, buf: g.buf };
    }
    if (k === " ") {
      const tile = target(g);
      if (tile && W.ready(g, tile.w)) {
        const d = t - g.hits[tile.i];
        if (d < -WIN.early) {
          g.last = { grade: "E", t, i: tile.i, l: tile.l, d };
          return { type: "early", d, word: tile.w };
        }
        return hit(g, tile, d, t);
      }
      if (g.buf) {
        g.keys++;
        g.mistakes++;
      }
      return { type: "strike", ok: false, buf: g.buf, empty: !g.buf };
    }
    const r = W.letter(g, k, (s) => g.tiles.some((x) => x.w.startsWith(s)), g.v < 2);
    if (!r) return null;
    g.keys++;
    if (!r.ok) {
      g.stepMisses.push({ pos: r.pos, typed: k });
      g.mistakes++;
      hurt(g, TYPO_HP, t);
      return { type: "miss", typed: k, pos: r.pos, buf: g.buf };
    }
    g.correct++;
    return { type: "letter", typed: k, pos: r.pos, buf: g.buf };
  }

  function gameStats(g, ms) {
    const minutes = ms / 60000;
    const c = g.counts;
    const judged = c.P + c.G + c.O + c.M;
    const avg = g.offsets.length ? g.offsets.reduce((s, x) => s + x, 0) / g.offsets.length : 0;
    return {
      wpm: minutes > 1 / 60 ? g.chars / 5 / minutes : 0,
      acc: g.keys ? (g.correct / g.keys) * 100 : 100,
      timing: judged ? ((c.P + c.G * 0.7 + c.O * 0.4) / judged) * 100 : 100,
      judged,
      avg,
    };
  }

  // A provider that hands out the words and lanes saved in a recording.
  const recordedTiles = (rec) => (g, i) => rec.tiles[i] || { w: "word", l: i % LANES };

  TT.tilesAudio = { get: () => getAudio() };

  TT.tilesCore = {
    DIFFS, DIFF_IDS, WIN, RULES, GRADE_NAMES,
    chart, newCore, applyKey, advance, gameStats, target, attribute, recordedTiles, multiplier, letterGrade,
  };

  // ---------- sound ----------

  let audioCtx = null;
  function getAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC({ latencyHint: "interactive" });
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(ctx, bus, n, at) {
    const f = 440 * 2 ** ((n.midi - 69) / 12);
    const len = Math.min(Math.max(n.d, 0.12), 1.6) + 0.25;
    const peak = n.voice ? 0.1 : 0.15;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(peak, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0008, at + len);
    env.connect(bus);
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    o.connect(env);
    o.start(at);
    o.stop(at + len + 0.02);
    if (!n.voice) {
      // a quiet octave on top makes the melody sound a little more like a piano
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      g2.gain.value = 0.22;
      o2.type = "sine";
      o2.frequency.value = f * 2;
      o2.connect(g2).connect(env);
      o2.start(at);
      o2.stop(at + len + 0.02);
    }
  }

  function click(ctx, bus, down, at) {
    const o = ctx.createOscillator();
    const env = ctx.createGain();
    o.type = "square";
    o.frequency.value = down ? 1500 : 1000;
    env.gain.setValueAtTime(down ? 0.07 : 0.045, at);
    env.gain.exponentialRampToValueAtTime(0.0005, at + 0.04);
    o.connect(env).connect(bus);
    o.start(at);
    o.stop(at + 0.05);
  }

  // Plays a song in step with the game clock. startPerf: performance.now() time of song time 0.
  // Notes are scheduled a little ahead on the audio clock, and started early by the output
  // latency so they're heard right when the tiles reach the line.
  function createPlayer({ song, startPerf, music, metronome }) {
    const ctx = music || metronome ? getAudio() : null;
    if (!ctx) return { pump() {}, stop() {} };
    const bus = ctx.createGain();
    bus.gain.value = 0.9;
    bus.connect(ctx.destination);
    // metronome: a one-bar count-in, then every beat
    const clicks = [];
    if (metronome) {
      const first = song.beats[0];
      const per = first ? first.len : 0.5;
      for (let k = song.bar; k >= 1; k--) clicks.push({ t: -k * per, down: k === song.bar });
      for (const b of song.beats) clicks.push({ t: b.t, down: b.down });
    }
    let ni = 0;
    let ci = 0;
    let sync = null;
    let stopped = false;
    let source = null;
    return {
      pump() {
        if (stopped) return;
        const now = performance.now() / 1000;
        const m = ctx.currentTime - now;
        if (sync == null || Math.abs(m - sync) > 0.03) sync = m;
        const lat = ctx.outputLatency || ctx.baseLatency || 0;
        const zero = startPerf / 1000 + sync - lat; // song time 0 on the audio clock
        const horizon = ctx.currentTime + 0.3;
        if (music && song.buffer && !source && zero < horizon) {
          // an added song: the whole file, started so its time 0 lines up with the game
          source = ctx.createBufferSource();
          source.buffer = song.buffer;
          const gain = ctx.createGain();
          gain.gain.value = 0.85;
          source.connect(gain).connect(bus);
          const late = Math.max(0, ctx.currentTime - zero);
          source.start(Math.max(zero, ctx.currentTime), late);
        }
        if (music) {
          for (; ni < song.notes.length && zero + song.notes[ni].t < horizon; ni++) {
            const at = zero + song.notes[ni].t;
            if (at >= ctx.currentTime - 0.02) tone(ctx, bus, song.notes[ni], Math.max(at, ctx.currentTime));
          }
        }
        for (; ci < clicks.length && zero + clicks[ci].t < horizon; ci++) {
          const at = zero + clicks[ci].t;
          if (at >= ctx.currentTime - 0.02) click(ctx, bus, clicks[ci].down, Math.max(at, ctx.currentTime));
        }
      },
      stop() {
        if (stopped) return;
        stopped = true;
        try {
          bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
          setTimeout(() => {
            bus.disconnect();
            if (source) source.stop();
          }, 300);
        } catch {}
      },
    };
  }

  // ---------- screen ----------

  const TILE_H = 52;     // tile height in px
  const HIT_BOTTOM = 70; // the line's center, in px from the bottom of the lanes

  const TEMPLATE = `
    <div class="tl">
      <div class="tl-side tl-left">
        <div class="tl-box"><div class="caps-label">WPM</div><div class="tl-big" data-t="wpm">–</div></div>
        <div class="tl-box"><div class="caps-label">SCORE</div><div class="tl-big" data-t="score">0</div></div>
        <div class="tl-box"><div class="caps-label">COMBO</div><div class="tl-big"><span data-t="combo">0</span><span class="tl-mult" data-t="mult"></span></div></div>
        <div class="tl-box"><div class="caps-label">HEALTH</div><div class="tl-bar"><i data-t="hp"></i></div></div>
      </div>
      <div class="tl-center">
        <div class="tl-head">
          <div class="tl-song"><span data-t="title"></span><span class="caps-label" data-t="sub"></span></div>
          <div class="tl-progress"><i data-t="prog"></i></div>
        </div>
        <div class="tl-hw" data-t="hw">
          <span class="tl-div" style="left: 25%"></span><span class="tl-div" style="left: 50%"></span><span class="tl-div" style="left: 75%"></span>
          <div class="tl-band" data-t="band"></div>
          <div class="tl-flash" data-t="flash"></div>
          <div class="tl-tiles" data-t="tiles"></div>
          <div class="tl-judge" data-t="judge"></div>
        </div>
        <div class="tl-typed-row"><span class="word-box tl-typed" data-t="typed"></span></div>
      </div>
      <div class="tl-side tl-right">
        <div class="tl-box">
          <div class="caps-label">TIMING</div>
          <div class="tl-meter" data-t="meter"></div>
          <div class="tl-meter-l"><span>EARLY</span><span>LATE</span></div>
          <div class="tl-avg" data-t="avg">AVG —</div>
        </div>
        <div class="tl-box"><dl class="tl-counts" data-t="counts"></dl></div>
      </div>
      <div class="tl-over" data-t="over" hidden></div>
      <div class="visually-hidden" aria-live="polite" data-t="sr"></div>
    </div>`;

  TT.createTiles = ({ root, onStart, onEnd, replayOnly = false }) => {
    root.innerHTML = TEMPLATE;
    const el = Object.fromEntries([...root.querySelectorAll("[data-t]")].map((x) => [x.dataset.t, x]));
    let g = null;
    let live = null;   // { state, diff, song, startedAt, keys, times, tiles, ... }
    let replay = null; // { rec, pos, lastT, provider }
    let song = null;   // the built song, when it's available
    let beatTimes = []; // game-time ms of each beat, for the pulse on the line
    let viewT = 0;
    let raf = 0;
    let hudSig = "";
    let H = 0;
    let shakeT = -1000;
    const tileEls = new Map();

    const measure = () => {
      H = el.hw.clientHeight;
      render();
    };
    new ResizeObserver(measure).observe(el.hw);

    const progress = () => {
      const d = (TT.store.games.tiles ||= { best: 0, plays: 0, history: [], bestBy: {} });
      d.bestBy ||= {};
      d.history ||= [];
      return d;
    };

    // ---------- words (live play only) ----------

    function provide(state, i, t) {
      const D = DIFFS[live.diff];
      // Words that come quickly after the last one are kept short.
      const gap = i > 0 ? (state.hits[i] - state.hits[i - 1]) / 1000 : 9;
      const maxLen = Math.min(D.len[1], Math.max(3, Math.round(gap * 8)));
      const minLen = Math.min(D.len[0], maxLen);
      const taken = new Set(state.tiles.map((x) => x.w[0]));
      const ok = (w) => w.length >= minLen && w.length <= maxLen && !taken.has(w[0]) && !live.recent.includes(w);
      let pool = live.pool.filter(ok);
      if (pool.length < 5) {
        live.pool = A.practiceWords(80, live.targets, live.missed, TT.store.settings.mix);
        pool = live.pool.filter(ok);
      }
      if (!pool.length) pool = PRACTICE_WORDS.filter(ok);
      if (!pool.length) pool = WORDS.filter((w) => w.length >= 3 && !taken.has(w[0]));
      const w = pool[Math.floor(Math.random() * pool.length)];
      const at = live.pool.indexOf(w);
      if (at >= 0) live.pool.splice(at, 1);
      live.recent = [...live.recent, w].slice(-12);
      // A different lane from the last tile, and away from tiles still near the top.
      const crowded = (l) => state.tiles.some((x) => x.l === l && t - x.born < state.fall * 0.3);
      let lanes = [0, 1, 2, 3].filter((l) => l !== live.prevLane && !crowded(l));
      if (!lanes.length) lanes = [0, 1, 2, 3].filter((l) => l !== live.prevLane);
      const l = lanes[Math.floor(Math.random() * lanes.length)];
      live.prevLane = l;
      live.tiles.push({ w, l });
      return { w, l };
    }

    // ---------- rendering ----------

    function renderTiles() {
      const hitY = H - HIT_BOTTOM;
      const tg = target(g);
      const seen = new Set();
      for (const t of g.tiles) {
        let e = tileEls.get(t.i);
        if (!e) {
          e = document.createElement("div");
          e.className = "tl-tile";
          e.style.left = `${t.l * 25}%`;
          e.sig = "";
          el.tiles.appendChild(e);
          tileEls.set(t.i, e);
        }
        seen.add(t.i);
        const y = hitY - ((g.hits[t.i] - viewT) / g.fall) * (hitY + TILE_H / 2) - TILE_H / 2;
        e.style.transform = `translateY(${y.toFixed(1)}px)`;
        const typed = W.good(g);
        const sig = t === tg ? `1${typed}` : "0";
        if (e.sig !== sig) {
          e.sig = sig;
          e.classList.toggle("on", t === tg);
          e.innerHTML = t === tg ? `<span><b>${typed}</b>${t.w.slice(typed.length)}</span>` : `<span>${t.w}</span>`;
        }
      }
      for (const [i, e] of tileEls) {
        if (!seen.has(i)) {
          e.remove();
          tileEls.delete(i);
        }
      }
    }

    function renderEffects() {
      const last = g.last;
      const age = last ? viewT - last.t : Infinity;
      // the judgment text
      const show = last && age >= 0 && age < 700;
      const text = show ? GRADE_NAMES[last.grade] + (last.d != null && last.grade !== "E" ? ` ${last.d > 0 ? "+" : ""}${Math.round(last.d)}MS` : "") : "";
      if (el.judge.textContent !== text) el.judge.textContent = text;
      el.judge.classList.toggle("miss", !!show && (last.grade === "M" || last.grade === "E"));
      // a flash in the lane of a hit
      const flash = last && "PGO".includes(last.grade) && age >= 0 && age < 220;
      el.flash.style.opacity = flash ? (1 - age / 220).toFixed(2) : "0";
      if (flash) el.flash.style.left = `${last.l * 25}%`;
      // the line pulses on each beat
      let beat = null;
      for (let k = beatTimes.length - 1; k >= 0; k--) {
        if (beatTimes[k].t <= viewT) {
          if (viewT - beatTimes[k].t < 110) beat = beatTimes[k];
          break;
        }
      }
      el.band.classList.toggle("beat", !!beat);
      el.band.classList.toggle("down", !!beat && beat.down);
      // what's been typed
      const typed = W.html(g);
      if (el.typed.innerHTML !== typed) el.typed.innerHTML = typed;
      el.typed.classList.toggle("empty", !g.buf);
      el.typed.classList.toggle("shake", viewT - shakeT < 250);
    }

    function renderHud() {
      const st = gameStats(g, Math.max(1, viewT));
      const c = g.counts;
      const prog = Math.min(1, viewT / g.endT);
      const marks = g.offsets.slice(-14);
      const sig = [g.score, g.combo, Math.round(g.hp), viewT < 5000 ? "-" : Math.round(st.wpm), c.P, c.G, c.O, c.M, Math.round(prog * 200), marks.length, g.offsets.length].join("|");
      if (sig === hudSig) return;
      hudSig = sig;
      el.wpm.textContent = viewT < 5000 ? "–" : Math.round(st.wpm);
      el.score.textContent = g.score.toLocaleString();
      el.combo.textContent = g.combo;
      const mult = multiplier(g.combo);
      el.mult.textContent = mult > 1 ? `×${mult}` : "";
      el.hp.style.width = `${Math.round(g.hp)}%`;
      el.hp.classList.toggle("low", g.hp < 30);
      el.prog.style.width = `${(prog * 100).toFixed(1)}%`;
      el.meter.innerHTML = marks.map((d, i) => {
        const x = 50 + Math.max(-1, Math.min(1, d / WIN.early)) * 46;
        return `<b style="left: calc(${x.toFixed(1)}% - 1.5px); opacity: ${(0.3 + (0.7 * (i + 1)) / marks.length).toFixed(2)}"></b>`;
      }).join("");
      el.avg.textContent = g.offsets.length
        ? `AVG ${st.avg > 0 ? "+" : ""}${Math.round(st.avg)}MS${Math.abs(st.avg) < 15 ? "" : st.avg < 0 ? " EARLY" : " LATE"}`
        : "AVG —";
      el.counts.innerHTML = [["PERFECT", c.P], ["GREAT", c.G], ["GOOD", c.O], ["MISS", c.M]]
        .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    }

    function render() {
      if (!g || !H) return;
      renderTiles();
      renderEffects();
      renderHud();
    }

    function setHead(title, sub) {
      el.title.textContent = title;
      el.sub.textContent = sub;
    }

    function clearTiles() {
      for (const e of tileEls.values()) e.remove();
      tileEls.clear();
    }

    // ---------- live play ----------

    function newGame(songId, diff, sound = { music: true, metronome: false }) {
      stop();
      replay = null;
      song = TT.songs.get(songId);
      const D = DIFFS[diff];
      const songHits = chart(song, diff);
      const offset = Math.max(0, D.fall + LEAD_MS - (songHits[0] || 0));
      const hits = songHits.map((h) => h + offset);
      const endT = Math.round(offset + song.duration * 1000 + 800);
      g = newCore({ hits, fall: D.fall, endT, diff });
      live = {
        state: "ready", diff, song: songId, offset, sound, startedAt: 0, player: null,
        keys: "", times: [], tiles: [], recent: [], pool: [], prevLane: -1,
        targets: A.weakKeys(), missed: A.weakWords(20),
      };
      beatTimes = song.beats.map((b) => ({ t: offset + b.t * 1000, down: b.down }));
      viewT = 0;
      hudSig = "";
      clearTiles();
      setHead(song.title.toUpperCase(), `${song.composer.toUpperCase()} · ${D.name}`);
      el.over.innerHTML = `
        <h2>${song.title.toUpperCase()}</h2>
        <p class="tl-over-sub">${song.composer} · ${D.name.toLowerCase()} · ${Math.round(song.duration)} seconds</p>
        <p>Type a word, then press <strong>Enter</strong> or <strong>Space</strong> as it crosses the line.</p>
        <div class="tl-start"><kbd>ENTER</kbd>START</div>`;
      el.over.hidden = false;
      render();
    }

    function start() {
      live.state = "running";
      live.startedAt = performance.now();
      live.player = createPlayer({ song, startPerf: live.startedAt + live.offset, ...live.sound });
      live.player.pump();
      el.over.hidden = true;
      onStart && onStart();
      raf = requestAnimationFrame(frame);
    }

    function frame() {
      if (!live || live.state !== "running") return;
      viewT = performance.now() - live.startedAt;
      live.player.pump();
      if (advance(g, viewT, provide)) return end();
      render();
      raf = requestAnimationFrame(frame);
    }

    function handleKey(e) {
      if (!live || live.state === "over" || live.state === "stopped") return;
      let k;
      if (e.key === "Backspace") k = e.ctrlKey || e.altKey ? BACK_WORD : BACK;
      else if (e.ctrlKey || e.altKey || e.metaKey) return;
      else if (e.key === " " || e.key === "Enter") k = " "; // either one strikes (recorded as a space)
      else if (/^[a-zA-Z]$/.test(e.key)) k = e.key.toLowerCase();
      else return;
      e.preventDefault();
      if (e.repeat && k === " ") return; // holding the key down shouldn't strike again
      if (live.state === "ready") {
        if (k === " ") start();
        return;
      }
      // The event's own timestamp is when the key went down, which is more exact than now.
      const stamp = e.timeStamp && e.timeStamp <= performance.now() + 1 ? e.timeStamp : performance.now();
      const t = Math.max(0, Math.round(stamp - live.startedAt));
      if (advance(g, t, provide)) return end();
      live.keys += k;
      live.times.push(t);
      const d = applyKey(g, k, t, provide);
      if (g.over) return end();
      if (d && (d.type === "miss" || (d.type === "strike" && !d.empty))) shakeT = t;
      el.sr.textContent = d && (d.type === "hit" || d.type === "early") ? GRADE_NAMES[g.last.grade].toLowerCase() : el.sr.textContent;
      viewT = Math.max(viewT, t);
      render();
    }

    function end() {
      live.state = "over";
      cancelAnimationFrame(raf);
      if (live.player) live.player.stop();
      viewT = g.endAt;
      const tg = target(g);
      if (tg) attribute(g, W.good(g), tg.w);

      const st = gameStats(g, g.endAt);
      const grade = letterGrade(st.timing);
      const round = (x) => Math.round(x * 100) / 100;
      const date = new Date().toISOString();
      const id = TT.newRoundId();
      const rec = progress();
      const key = `${live.song}:${live.diff}`;
      const prev = rec.bestBy[key];
      const cleared = g.cause === "done";
      rec.plays++;
      rec.best = Math.max(rec.best, g.score);
      if (!prev || g.score > prev.score) rec.bestBy[key] = { score: g.score, grade, timing: round(st.timing), wpm: round(st.wpm), acc: round(st.acc), cleared };
      else if (cleared && !prev.cleared) prev.cleared = true;
      rec.history.push({ date, song: live.song, diff: live.diff, score: g.score, grade, timing: round(st.timing), wpm: round(st.wpm), acc: round(st.acc), cleared });
      if (rec.history.length > HISTORY_CAP) rec.history.splice(0, rec.history.length - HISTORY_CAP);

      const store = TT.store;
      store.history.push({
        id, date, kind: "game", game: "tiles", mode: live.diff, amount: g.score, song: live.song, title: song.title,
        wpm: round(st.wpm), raw: round(st.wpm), acc: round(st.acc), seconds: round(g.endAt / 1000),
        keys: Object.fromEntries(Object.entries(g.keyStats).map(([k, v]) => [k, [v.expected, v.missed]])),
        missedWords: [...g.missedWords],
      });
      for (const [letter, v] of Object.entries(g.keyStats)) {
        const total = (store.keyStats[letter] ||= { expected: 0, missed: 0 });
        total.expected += v.expected;
        total.missed += v.missed;
      }
      for (const w of g.missedWords) store.weakWords[w] = (store.weakWords[w] || 0) + 1;
      TT.save();
      TT.rounds.save({
        id, date, kind: "game", game: "tiles", mode: live.diff, amount: g.score, song: live.song, title: song.title,
        songKey: song.key, offset: live.offset, v: RULES, diff: live.diff, fall: g.fall, hits: g.hits, endT: g.endT, tiles: live.tiles,
        keys: live.keys, times: live.times, duration: g.endAt,
      });

      const best = prev && g.score > prev.score
        ? `<strong class="hl">New best!</strong> Previous best was ${prev.score.toLocaleString()}.`
        : prev ? `Best ${prev.score.toLocaleString()}` : "First time on this song and difficulty.";
      const c = g.counts;
      el.over.innerHTML = `
        <h2>${cleared ? "SONG COMPLETE" : "OUT OF HEALTH"}</h2>
        <div class="tl-over-grade">${grade}</div>
        <div class="caps-label">SCORE ${g.score.toLocaleString()} · MAX COMBO ${g.maxCombo}</div>
        <p>${best}</p>
        <dl class="tl-over-stats">
          <div><dt>PERFECT</dt><dd>${c.P}</dd></div><div><dt>GREAT</dt><dd>${c.G}</dd></div>
          <div><dt>GOOD</dt><dd>${c.O}</dd></div><div><dt>MISS</dt><dd>${c.M}</dd></div>
          <div><dt>WPM</dt><dd>${Math.round(st.wpm)}</dd></div><div><dt>ACCURACY</dt><dd>${Math.round(st.acc)}%</dd></div>
          <div><dt>TIMING</dt><dd>${g.offsets.length ? `${st.avg > 0 ? "+" : ""}${Math.round(st.avg)} ms` : "—"}</dd></div>
        </dl>
        <div class="hints">
          <button data-act="tl:play"><kbd>TAB</kbd>PLAY AGAIN</button>
          <button data-act="replay:${id}"><kbd>R</kbd>REPLAY</button>
          <button data-act="tl:select"><kbd>ESC</kbd>SONGS</button>
        </div>`;
      el.over.hidden = false;
      hudSig = "";
      render();
      onEnd && onEnd(id);
    }

    function stop() {
      cancelAnimationFrame(raf);
      if (live) {
        if (live.player) live.player.stop();
        if (live.state !== "over") live.state = "stopped";
      }
    }

    // ---------- replay ----------

    function resetReplayCore(rec) {
      g = newCore({ hits: rec.hits, fall: rec.fall, endT: rec.endT, diff: rec.diff, v: rec.v || 1 });
      replay.pos = 0;
    }

    function loadReplay(rec) {
      stop();
      live = null;
      replay = { rec, pos: 0, lastT: 0, provider: recordedTiles(rec) };
      resetReplayCore(rec);
      song = TT.songs.get(rec.song);
      // The beat pulse needs the song as it was played; an added song's beat may have been redone.
      const same = song && (!song.user || song.key === rec.songKey);
      const offset = !same ? null : rec.offset ?? (rec.hits.length ? rec.hits[0] - oldFirstHit(song) : null);
      beatTimes = song && offset != null ? song.beats.map((b) => ({ t: offset + b.t * 1000, down: b.down })) : [];
      viewT = 0;
      hudSig = "";
      clearTiles();
      setHead((rec.title || "Tiles").toUpperCase(), (DIFFS[rec.diff] || DIFFS.medium).name);
      el.over.hidden = true;
      render();
    }

    function replayTo(T) {
      if (!replay) return g;
      const { rec, provider } = replay;
      if (T < replay.lastT) resetReplayCore(rec);
      while (replay.pos < rec.keys.length && rec.times[replay.pos] <= T) {
        const d = applyKey(g, rec.keys[replay.pos], rec.times[replay.pos], provider);
        if (d && (d.type === "miss" || (d.type === "strike" && !d.empty))) shakeT = rec.times[replay.pos];
        replay.pos++;
      }
      advance(g, Math.min(T, rec.duration), provider);
      replay.lastT = T;
      viewT = g.over ? g.endAt : T;
      if (g.over) {
        const st = gameStats(g, g.endAt);
        el.over.innerHTML = `<h2>${g.cause === "done" ? "SONG COMPLETE" : "OUT OF HEALTH"}</h2><div class="tl-over-grade">${letterGrade(st.timing)}</div><div class="caps-label">SCORE ${g.score.toLocaleString()}</div>`;
      }
      el.over.hidden = !g.over;
      render();
      return g;
    }

    return {
      newGame, stop, handleKey, loadReplay, replayTo,
      relayout: () => { hudSig = ""; measure(); },
      isOver: () => !!live && live.state === "over",
      isRunning: () => !!live && live.state === "running",
    };
  };
})();
