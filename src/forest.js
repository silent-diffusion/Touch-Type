// Forest Hop: a Crossy Road-style game. Each direction around your animal shows a word; type a
// word, then press Space to hop that way. The forest has meadows (trees block your way), game
// trails (deer herds), creeks (ride logs, or hop across lily pads), rapids and rockslides.
// Each animal has its own predator, which shows up if you stop making progress: you then get a
// countdown to reach a new row before it catches you.
//
// The world comes from a seed and moves on a fixed 20 ms time step, so a recording (seed, the
// words offered at each spot, and the key presses with their times) replays exactly. Rule
// changes are versioned (rec.v) so older recordings keep replaying the way they were played.
(() => {
  const A = TT.analysis;
  const W = TT.wordInput;
  const COLS = 13;          // playable columns
  const STEP = 20;          // simulation step, ms
  const START_LANE = 2;
  const START_COL = 6;
  const RULES = 4;          // current rules version (v4: wrong letters are typed and must be backspaced)
  const WARN_MS = 20000;    // v2: this long without reaching a new row brings the predator
  const GRACE_MS = 10000;   // v2: then this long to reach a new row before it strikes
  // v3: the predator is patient early on and gets quicker as your score grows
  const warnMs = (g) => (g.v >= 3 ? Math.max(10000, 24000 - score(g) * 100) : WARN_MS);
  const graceMs = (g) => (g.v >= 3 ? Math.max(5000, 12000 - score(g) * 50) : GRACE_MS);
  const V1_IDLE_MS = 9000;  // v1: the hawk struck after 9 s without progress
  const HAWK_BACK = 3;      // this many rows back from your best brings the predator
  const SPAN = COLS + 6;    // moving things loop over this many tiles (3 off each side)
  const BACK = "<", BACK_WORD = "{";
  const DIRS = ["up", "left", "right", "down"];
  const HISTORY_CAP = 200;

  const CAUSES = {
    trampled: "TRAMPLED BY DEER",
    drowned: "FELL IN THE CREEK",
    swept: "SWEPT DOWNSTREAM",
    crushed: "FLATTENED BY A BOULDER",
    hawk: "CAUGHT BY THE HAWK",
    predator: "CAUGHT",
  };

  // Each animal's predator, treat and any special water ending.
  //   circle: swoops in from above and circles   stalk: creeps up from behind
  //   side: a hunter steps out at the edge of the screen and takes aim
  const THEMES = {
    frog: { predator: "hawk", name: "THE HAWK", mode: "circle", caught: "CAUGHT BY THE HAWK", treat: "fly", treats: ["fly", "flies"] },
    chicken: { predator: "fox", name: "THE FOX", mode: "stalk", caught: "CAUGHT BY THE FOX", treat: "corn", treats: ["corn", "corn"] },
    moose: { predator: "wolf", name: "THE WOLF", mode: "stalk", caught: "CAUGHT BY THE WOLF", treat: "leaf", treats: ["leaf", "leaves"],
      water: { sprite: "orca", text: "EATEN BY AN ORCA" } },
    bear: { predator: "hunter", name: "THE HUNTER", mode: "side", caught: "SHOT BY THE HUNTER", treat: "berries", treats: ["berry", "berries"] },
    fox: { predator: "hunter", name: "THE HUNTER", mode: "side", caught: "SHOT BY THE HUNTER", treat: "egg", treats: ["egg", "eggs"] },
    rabbit: { predator: "fox", name: "THE FOX", mode: "stalk", caught: "CAUGHT BY THE FOX", treat: "carrot", treats: ["carrot", "carrots"] },
    owl: { predator: "eagle", name: "THE EAGLE", mode: "circle", caught: "CAUGHT BY THE EAGLE", treat: "moth", treats: ["moth", "moths"] },
    raccoon: { predator: "coyote", name: "THE COYOTE", mode: "stalk", caught: "CAUGHT BY THE COYOTE", treat: "trash", treats: ["trash can", "trash cans"] },
  };
  const theme = (animal) => THEMES[animal] || THEMES.frog;

  function causeText(cause, animal) {
    const th = theme(animal);
    if (cause === "predator" || cause === "hawk") return th.caught;
    if ((cause === "drowned" || cause === "swept") && th.water) return th.water.text;
    return CAUSES[cause];
  }

  // ---------- world generation ----------

  function rngFrom(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const mod = (a, n) => ((a % n) + n) % n;
  const pick = (r, list) => list[Math.floor(r() * list.length)];

  function newWorld(seed, v) {
    return { rng: rngFrom(seed), lanes: [], queue: [], v };
  }

  function laneAt(w, k) {
    if (k < 0) return { k, type: "edge" };
    while (w.lanes.length <= k) extend(w);
    return w.lanes[k];
  }

  function extend(w) {
    const k = w.lanes.length;
    if (!w.queue.length) planSegment(w, k);
    w.lanes.push(makeLane(w, k, w.queue.shift()));
  }

  // Lanes come in groups: a few hazard lanes, then a meadow to catch your breath.
  function planSegment(w, k) {
    const r = w.rng;
    if (k < 5) return w.queue.push("meadow");
    const d = Math.min(1, k / 120);
    const roll = r();
    let type, count;
    if (roll < 0.26 - d * 0.1) { type = "meadow"; count = 1 + (r() < 0.4 ? 1 : 0); }
    else if (roll < 0.6) { type = "trail"; count = 1 + Math.floor(r() * (2 + d * 2)); }
    else if (roll < 0.86) { type = k > 45 && r() < 0.5 ? "rapids" : "creek"; count = 1 + Math.floor(r() * (2 + d * 2)); }
    else { type = k > 12 ? "rockslide" : "trail"; count = 1; }
    for (let i = 0; i < count; i++) w.queue.push(type);
    if (type !== "meadow") w.queue.push("meadow");
  }

  function makeLane(w, k, type) {
    const r = w.rng;
    const d = Math.min(1, k / 120);
    const lane = { k, type };
    if (type === "meadow") {
      lane.blocks = {};
      lane.treats = {};
      const n = k === 0 ? 7 : k < 2 ? 0 : Math.floor(r() * (3 + d * 3));
      for (let i = 0; i < n; i++) {
        const c = Math.floor(r() * COLS);
        if (k === START_LANE && c === START_COL) continue;
        lane.blocks[c] = pick(r, ["pine", "pine", "pine", "rock", "stump"]);
      }
      if (k > START_LANE && r() < 0.3) {
        const c = Math.floor(r() * COLS);
        if (!lane.blocks[c]) lane.treats[c] = true;
      }
    } else if (type === "trail") {
      lane.dir = r() < 0.5 ? 1 : -1;
      // tiles per second. v3: deer start slow (a quarter to a third of before) and speed up
      // over the first 150 lanes, ending a little faster than v1/v2 at their fastest
      lane.speed = w.v >= 3
        ? 0.4 + r() * 0.4 + Math.min(1, k / 150) * (1.4 + r() * 2)
        : 1.6 + r() * (1.4 + d * 2.4);
      lane.things = [];
      let x = r() * 4;
      const herds = 2 + (r() < 0.35 + d * 0.4 ? 1 : 0);
      for (let h = 0; h < herds; h++) {
        const size = 1 + Math.floor(r() * (1.6 + d * 2));
        if (x + size > SPAN - 3) break;
        for (let i = 0; i < size; i++) lane.things.push({ x0: x + i, len: 1 });
        x += size + 3 + r() * 3;
      }
    } else if (type === "creek" || type === "rapids") {
      lane.dir = r() < 0.5 ? 1 : -1;
      lane.things = [];
      if (type === "creek" && r() < 0.25) {
        // a still pool crossed on lily pads
        lane.speed = 0;
        lane.pads = {};
        const n = 4 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) lane.pads[Math.floor(r() * COLS)] = true;
        // two pools in a row must line up somewhere, or they can't be crossed
        const prev = w.lanes[k - 1];
        if (prev && prev.pads) {
          const shared = Object.keys(prev.pads);
          for (let i = 0; i < 2; i++) lane.pads[shared[Math.floor(r() * shared.length)]] = true;
        }
      } else {
        lane.speed = type === "rapids" ? 2.6 + r() * 1.6 : 0.8 + r() * (0.8 + d);
        let x = r() * 3;
        while (x < SPAN - 2) {
          const len = type === "rapids" ? 2 : 2 + Math.floor(r() * 3);
          lane.things.push({ x0: x, len });
          x += len + (type === "rapids" ? 2.4 + r() * 2 : 1.4 + r() * 2.4);
        }
      }
    } else if (type === "rockslide") {
      lane.dir = r() < 0.5 ? 1 : -1;
      lane.period = 4200 + r() * 2600;
      lane.phase = r() * lane.period;
      lane.speed = 14;
    }
    return lane;
  }

  const thingX = (lane, th, t) => mod(th.x0 + lane.dir * lane.speed * t / 1000, SPAN) - 3;

  // Rockslides: a warning, then one fast boulder per cycle.
  function boulder(lane, t) {
    const travel = (SPAN / lane.speed) * 1000;
    const c = mod(t + lane.phase, lane.period);
    const start = lane.period - travel;
    if (c < start - 1200) return { x: null, warn: false };
    if (c < start) return { x: null, warn: true };
    const p = ((c - start) / 1000) * lane.speed;
    return { x: lane.dir > 0 ? p - 3 : COLS + 2 - p, warn: true };
  }

  // ---------- core: pure game rules, shared by live play, replays and analysis ----------

  function newCore(seed, animal, v = RULES) {
    return {
      v, seed, animal,
      world: newWorld(seed, v),
      lane: START_LANE, x: START_COL,
      from: { lane: START_LANE, x: START_COL }, hopT: -1000,
      maxLane: START_LANE, lastProgressT: 0, threatStart: null, threatGrace: GRACE_MS,
      simT: 0, over: false, endT: null, cause: null,
      words: null, wordSets: 0, buf: "", bad: -1,
      keys: 0, correct: 0, mistakes: 0, spaceErrors: 0, chars: 0, treats: 0,
      keyStats: {}, missedWords: new Set(), stepMisses: [],
    };
  }

  const score = (g) => g.maxLane - START_LANE;
  const isWater = (L) => L.type === "creek" || L.type === "rapids";

  // Where a direction would land, or null if a tree, rock or the forest edge is in the way.
  function target(g, dir) {
    let lane = g.lane;
    let c = Math.round(g.x);
    if (dir === "up") lane++;
    else if (dir === "down") lane--;
    else if (dir === "left") c--;
    else c++;
    if (lane < 0 || c < 0 || c >= COLS) return null;
    const L = laneAt(g.world, lane);
    if (L.type === "meadow" && L.blocks[c]) return null;
    return { lane, col: c };
  }

  function supported(g, t) {
    const L = laneAt(g.world, g.lane);
    if (!isWater(L)) return true;
    if (L.pads) return !!L.pads[Math.round(g.x)];
    const cx = g.x + 0.5;
    return L.things.some((th) => {
      const x = thingX(L, th, t);
      return cx > x + 0.05 && cx < x + th.len - 0.05;
    });
  }

  function collision(g, t) {
    const L = laneAt(g.world, g.lane);
    if (L.type === "trail") {
      const a = g.x + 0.2, b = g.x + 0.8;
      if (L.things.some((th) => { const x = thingX(L, th, t); return x < b && x + th.len > a; })) return "trampled";
    }
    if (L.type === "rockslide") {
      const bx = boulder(L, t).x;
      if (bx != null && bx < g.x + 0.85 && bx + 1 > g.x + 0.15) return "crushed";
    }
    if (!supported(g, t)) return "drowned";
    return null;
  }

  function die(g, t, cause) {
    g.over = true;
    g.endT = t;
    g.cause = cause;
  }

  function threat(g, t) {
    if (g.v < 2) {
      if (t - g.lastProgressT > V1_IDLE_MS || g.maxLane - g.lane >= HAWK_BACK) die(g, t, "hawk");
      return;
    }
    const behind = g.maxLane - g.lane >= HAWK_BACK;
    const idle = t - g.lastProgressT >= warnMs(g);
    if (g.threatStart == null) {
      if (idle || behind) {
        g.threatStart = t;
        g.threatGrace = graceMs(g);
      }
    } else if (!idle && !behind) {
      g.threatStart = null; // reached a new row: the predator gives up for now
    }
    if (g.threatStart != null && t - g.threatStart >= g.threatGrace) die(g, t, "predator");
  }

  function tick(g, t) {
    const L = laneAt(g.world, g.lane);
    if (isWater(L) && !L.pads && supported(g, t)) {
      g.x += (L.dir * L.speed * STEP) / 1000;
      if (g.x < -0.45 || g.x > COLS - 0.55) return die(g, t, "swept");
    }
    const hit = collision(g, t);
    if (hit) return die(g, t, hit);
    threat(g, t);
  }

  function advance(g, t) {
    while (!g.over && g.simT + STEP <= t) {
      g.simT += STEP;
      tick(g, g.simT);
    }
    return g.over;
  }

  // usedDir: the direction just hopped (only its word needs replacing), or undefined at the start.
  function assignWords(g, provider, usedDir) {
    g.words = provider(g, usedDir);
    g.wordSets++;
  }

  // Wrong keys are tied to a letter once the word you hopped with is known.
  const attribute = (g, word) => W.attribute(g, word);

  function hop(g, dir, t, provider) {
    const word = g.words[dir];
    const to = target(g, dir);
    const misses = attribute(g, word);
    g.correct++;
    g.chars += word.length + 1;
    g.from = { lane: g.lane, x: g.x };
    g.hopT = t;
    g.lane = to.lane;
    g.x = to.col;
    W.done(g, word);
    W.reset(g);
    if (g.lane > g.maxLane) {
      g.maxLane = g.lane;
      g.lastProgressT = t;
      if (g.v >= 2) g.threatStart = null;
    }
    const L = laneAt(g.world, g.lane);
    let treat = false;
    if (L.type === "meadow" && (L.treats || L.acorns)[to.col]) {
      delete (L.treats || L.acorns)[to.col];
      g.treats++;
      treat = true;
    }
    const hit = collision(g, t);
    if (hit) die(g, t, hit);
    else assignWords(g, provider, dir);
    return { type: "hop", dir, word, typed: " ", misses, treat };
  }

  // Applies one key press at time t (ms from the first key). Returns what it did, or null.
  function applyKey(g, k, t, provider) {
    if (advance(g, t)) return null;
    if (k === BACK || k === BACK_WORD) {
      const b = W.back(g, k === BACK_WORD);
      if (b) W.mark(g, t);
      return b && { type: "back", ...b, buf: g.buf };
    }
    if (k === " ") {
      const dir = g.buf && DIRS.find((d) => W.ready(g, g.words[d]) && target(g, d));
      if (dir) {
        g.keys++;
        return hop(g, dir, t, provider);
      }
      g.spaceErrors++;
      if (g.buf) {
        g.keys++;
        g.mistakes++;
      }
      return { type: "space", ok: false, buf: g.buf, empty: !g.buf };
    }
    const open = DIRS.filter((d) => target(g, d)).map((d) => g.words[d]);
    const r = W.letter(g, k, (s) => open.some((w) => w.startsWith(s)), g.v < 4);
    if (!r) return null;
    W.mark(g, t);
    g.keys++;
    if (!r.ok) {
      g.stepMisses.push({ pos: r.pos, typed: k });
      g.mistakes++;
      return { type: "miss", typed: k, pos: r.pos, buf: g.buf };
    }
    g.correct++;
    return { type: "letter", typed: k, pos: r.pos, buf: g.buf };
  }

  function gameStats(g, ms) {
    const minutes = ms / 60000;
    return {
      wpm: minutes > 1 / 60 ? W.wpm(g) : 0, // typing time only, scaled to the speed test (input.js)
      acc: g.keys ? (g.correct / g.keys) * 100 : 100,
    };
  }

  // A provider that replays the word sets saved in a recording.
  const recordedWords = (rec) => (g) => rec.words[g.wordSets] || { up: "up", left: "left", right: "right", down: "down" };

  // What would happen to an animal standing at (lane, x) at time t: a cause of death, or null.
  function probe(g, lane, x, t) {
    const saved = [g.lane, g.x];
    g.lane = lane;
    g.x = x;
    const hit = collision(g, t);
    [g.lane, g.x] = saved;
    return hit;
  }

  TT.forestCore = {
    newCore, applyKey, advance, assignWords, recordedWords, gameStats, attribute, score, probe, target, laneAt,
    CAUSES, THEMES, theme, causeText, START_LANE, RULES, WARN_MS, GRACE_MS, warnMs, graceMs,
  };

  // ---------- drawing ----------

  const LANE_BG = {
    meadow: ["#B7BC95", "#AFB48C"],
    trail: "#C4AF88",
    creek: "#8EA5A3",
    rapids: "#7F989A",
    rockslide: "#BCB199",
    edge: "#8E9670",
  };
  const ease = (p) => 1 - (1 - p) * (1 - p);
  // stable pseudo-random per tile, for decoration
  const hash = (a, b) => {
    let h = Math.imul(a * 374761393 + b * 668265263, 1274126177);
    h ^= h >>> 13;
    return ((h >>> 0) % 1000) / 1000;
  };

  function themeColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    return {
      ink: "#3F3C33",
      ground: v("--ground", "#ccc8b3"),
      text: v("--ink", "#3f3c33"),
      sub: v("--sub", "#736e5b"),
      accent: v("--accent", "#B4472B"),
      font: v("--type-font", "monospace"),
      night: document.documentElement.dataset.theme === "night",
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  // ---------- deaths: each way of dying has its own animation ----------

  const DEATH_MS = 1600; // how long it plays before the end screen
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const seg = (d, a, b) => clamp01((d - a) / (b - a)); // progress through [a, b]
  const rnd = (i, j) => hash(i * 7 + 3, j * 13 + 5);   // stable 0..1, for scattering bits

  // A sprite centred on (cx, cy), turned, squashed or faded.
  function spriteAt(ctx, kind, cx, cy, size, o = {}) {
    ctx.save();
    ctx.translate(cx, cy);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale(o.sx ?? 1, o.sy ?? 1);
    if (o.alpha != null) ctx.globalAlpha *= clamp01(o.alpha);
    TT.sprites.draw(ctx, kind, (-size * TT.sprites.aspect(kind)) / 2, -size / 2, size, o.flip);
    ctx.restore();
  }
  function puff(ctx, x, y, r, a, rgb) {
    if (a <= 0) return;
    ctx.fillStyle = `rgba(${rgb},${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // a ripple on the water, seen from above at an angle
  function ripple(ctx, x, y, r, a) {
    if (a <= 0) return;
    ctx.strokeStyle = `rgba(242,238,226,${a})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.38, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // drops thrown up from (x, y) at time t0 that fall back
  function splash(ctx, x, y, d, t0, n, T, seed) {
    const t = (d - t0) / 1000;
    if (t < 0 || t > 0.7) return;
    ctx.fillStyle = `rgba(242,238,226,${1 - t / 0.7})`;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (rnd(seed, i) - 0.5) * 2.2;
      const v = T * (2.2 + rnd(seed, i + 20) * 1.8);
      const s = T * (0.06 + rnd(seed, i + 40) * 0.05);
      ctx.fillRect(x + Math.cos(ang) * v * t - s / 2, y + Math.sin(ang) * v * t + 7 * T * t * t, s, s);
    }
  }
  // which side the hunter stands on (chosen when it steps out)
  function huntSide(cam, g, px) {
    if (cam.huntSince !== g.threatStart) {
      cam.huntSince = g.threatStart;
      cam.huntLeft = px > COLS / 2;
    }
    return cam.huntLeft;
  }

  function drawDeath(ctx, g, view, T, X, laneY, px, pl, th) {
    const d = view.dieT;
    const S = T * 0.9;                   // the animal's size
    const pxs = X(px), pys = laneY(pl);
    const cx = pxs + T / 2, cy = pys + T * 0.47;
    const L = laneAt(g.world, g.lane);
    const shadow = (sc = 1, a = 0.28) => {
      if (sc <= 0) return;
      ctx.fillStyle = `rgba(63,60,51,${a})`;
      ctx.beginPath();
      ctx.ellipse(cx, pys + T * 0.86, T * 0.3 * sc, T * 0.08 * sc, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const c = g.cause;
    const water = c === "drowned" || c === "swept";

    if (water && th.water) {
      // The orca: a fin closes in, it leaps out of the water over the animal, and dives back in.
      const dir = L.dir || 1;
      const wy = pys + T * 0.72;
      if (d < 760) {
        const k = seg(d, 600, 760);
        spriteAt(ctx, g.animal, cx + Math.sin(d / 50) * T * 0.05 * (1 - k), cy + Math.sin(d / 80) * T * 0.05 + k * T * 0.2, S * (1 - 0.4 * k));
      }
      if (d < 540) {
        const k = ease(seg(d, 0, 540));
        const fx = cx - dir * T * 2.8 * (1 - k);
        ctx.fillStyle = "#1E1D1A";
        ctx.beginPath();
        ctx.moveTo(fx - dir * T * 0.2, wy);
        ctx.lineTo(fx + dir * T * 0.04, wy - T * 0.5);
        ctx.lineTo(fx + dir * T * 0.16, wy);
        ctx.closePath();
        ctx.fill();
        ripple(ctx, fx - dir * T * 0.3, wy, T * 0.25, 0.6);
      }
      if (d >= 540 && d < 1120) {
        const k = seg(d, 540, 1100);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, view.w, wy + T * 0.08); // what's below the water doesn't show
        ctx.clip();
        spriteAt(ctx, th.water.sprite, cx + dir * (-0.5 + k) * T, wy + T * 0.35 - Math.sin(Math.PI * k) * T * 1.5, T * 1.15,
          { rot: dir * (-0.9 + 1.8 * k), flip: dir > 0 });
        ctx.restore();
      }
      splash(ctx, cx - dir * T * 0.4, wy, d, 540, 9, T, 3);
      splash(ctx, cx + dir * T * 0.5, wy, d, 1080, 12, T, 4);
      for (const [s, at] of [[540, -0.4], [1080, 0.5], [1250, 0.5]]) {
        const t = seg(d, s, s + 900);
        if (t > 0 && t < 1) ripple(ctx, cx + dir * at * T, wy, T * (0.3 + 1.1 * t), 0.75 * (1 - t));
      }
      return;
    }

    if (c === "drowned") {
      // Fell in: a splash, a struggle, then it sinks out of sight among the ripples.
      const wy = pys + T * 0.72;
      const sink = ease(seg(d, 260, 1300));
      const bob = d < 260 ? Math.sin(d / 40) * T * 0.05 : 0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, view.w, wy);
      ctx.clip();
      spriteAt(ctx, g.animal, cx, cy + bob + sink * S, S, { alpha: 1 - 0.4 * sink, rot: Math.sin(d / 90) * 0.18 * (1 - sink) });
      ctx.restore();
      for (const s of [0, 320, 680]) {
        const t = seg(d, s, s + 900);
        if (t > 0 && t < 1) ripple(ctx, cx, wy, T * (0.25 + 0.8 * t), 0.75 * (1 - t));
      }
      splash(ctx, cx, wy, d, 0, 8, T, 1);
      // bubbles coming up after it
      for (let i = 0; i < 7; i++) {
        const t = seg(d, 600 + i * 130, 900 + i * 130);
        if (t <= 0 || t >= 1) continue;
        ctx.strokeStyle = `rgba(242,238,226,${1 - t * 0.6})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx + (rnd(6, i) - 0.5) * T * 0.6, wy - T * 0.04 - t * T * 0.12, T * (0.03 + 0.05 * t), 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    }

    if (c === "swept") {
      // Swept away: the current carries it off the edge, spinning, leaving a wake.
      const dir = L.dir || 1;
      const sp = (L.speed || 2) * T;
      const k = seg(d, 0, 1500);
      spriteAt(ctx, g.animal, cx + dir * sp * (d / 1000), cy + Math.sin(d / 110) * T * 0.07, S * (1 - 0.35 * k), { rot: dir * (d / 1000) * 7, alpha: 1 - k });
      for (let i = 0; i < 6; i++) {
        const s = i * 220, t = seg(d, s, s + 800);
        if (t > 0 && t < 1) ripple(ctx, cx + dir * sp * (s / 1000), pys + T * 0.72, T * (0.2 + 0.55 * t), 0.65 * (1 - t));
      }
      splash(ctx, cx, pys + T * 0.7, d, 0, 6, T, 2);
      return;
    }

    if (c === "trampled") {
      // Trampled: the herd runs over it, stomp by stomp, kicking up dust and leaving hoofprints.
      shadow(1.2);
      const STOMPS = [0, 220, 440];
      let sy = 1 - 0.68 * ease(seg(d, 0, 200));
      for (const s of STOMPS) sy -= 0.1 * Math.sin(Math.PI * seg(d, s, s + 140));
      spriteAt(ctx, g.animal, cx, pys + T * 0.92 - (S * sy) / 2, S, { sx: 1 + (1 - sy) * 0.55, sy });
      ctx.fillStyle = "rgba(63,60,51,0.55)";
      STOMPS.forEach((s, i) => {
        if (d < s + 60) return;
        ctx.beginPath();
        ctx.ellipse(cx + (rnd(1, i) - 0.5) * S * 0.9, pys + T * 0.8 + (rnd(2, i) - 0.5) * T * 0.12, T * 0.07, T * 0.045, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      STOMPS.forEach((s, i) => {
        for (let j = 0; j < 3; j++) {
          const t = seg(d, s, s + 650);
          if (t <= 0 || t >= 1) continue;
          puff(ctx, cx + (rnd(i, j) - 0.5) * T * 1.1 + (rnd(i, j + 9) - 0.5) * T * 0.6 * t, pys + T * 0.85 - T * 0.35 * t, T * (0.1 + 0.22 * t), 0.45 * (1 - t), "150,124,88");
        }
      });
      return;
    }

    if (c === "crushed") {
      // Flattened: one hit from the boulder, which rolls on. The ground cracks, stones fly and
      // the screen shakes (in drawWorld).
      shadow(1.6, 0.35);
      const crack = ease(seg(d, 0, 160));
      ctx.strokeStyle = "rgba(63,60,51,0.55)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const ang = (i % 2 ? Math.PI : 0) + (rnd(9, i) - 0.5) * 0.9;
        const len = T * (0.35 + rnd(10, i) * 0.3) * crack;
        ctx.beginPath();
        ctx.moveTo(cx, pys + T * 0.86);
        ctx.lineTo(cx + Math.cos(ang) * len, pys + T * 0.86 + Math.sin(ang) * len * 0.35);
        ctx.stroke();
      }
      const f = ease(seg(d, 0, 70));
      const sy = 1 - 0.86 * f;
      spriteAt(ctx, g.animal, cx, pys + T * 0.92 - (S * sy) / 2, S, { sx: 1 + 0.75 * f, sy });
      const ring = seg(d, 0, 700);
      if (ring < 1) {
        ctx.strokeStyle = `rgba(150,124,88,${0.5 * (1 - ring)})`;
        ctx.lineWidth = T * 0.12 * (1 - ring) + 1;
        ctx.beginPath();
        ctx.ellipse(cx, pys + T * 0.86, T * (0.3 + 1.1 * ease(ring)), T * (0.1 + 0.36 * ease(ring)), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const t = d / 1000;
      if (t < 0.9) {
        for (let i = 0; i < 8; i++) {
          const ang = -Math.PI / 2 + (rnd(3, i) - 0.5) * 2.6;
          const v = T * (2 + rnd(4, i) * 2.5);
          const s = T * (0.06 + rnd(5, i) * 0.08);
          ctx.save();
          ctx.globalAlpha = 1 - t / 0.9;
          ctx.translate(cx + Math.cos(ang) * v * t, pys + T * 0.8 + Math.sin(ang) * v * t + 8 * T * t * t);
          ctx.rotate(t * 9 * (i % 2 ? 1 : -1));
          ctx.fillStyle = "#9C9886";
          ctx.fillRect(-s / 2, -s / 2, s, s);
          ctx.strokeStyle = "#3F3C33";
          ctx.lineWidth = 1;
          ctx.strokeRect(-s / 2, -s / 2, s, s);
          ctx.restore();
        }
      }
      return;
    }

    // caught by its predator
    const kind = g.v < 2 ? "hawk" : th.predator;
    const mode = g.v < 2 ? "circle" : th.mode;
    if (mode === "circle") {
      // A last dive, then it carries the animal up and away, leaving feathers drifting down.
      const size = T * 1.3;
      const dive = ease(seg(d, 0, 360));
      const sx0 = cx + T * 1.4, sy0 = cy - T * 2.6;
      const up = seg(d, 360, DEATH_MS);
      const lift = up ** 1.6;
      const bx = sx0 + (cx - sx0) * dive + Math.sin(up * 5) * T * 0.25 * lift;
      const by = sy0 + (cy - T * 0.35 - sy0) * dive - lift * (cy + T * 3);
      shadow(1 - lift * 1.5, 0.22);
      for (let i = 0; i < 6; i++) {
        const t = seg(d, 360, DEATH_MS);
        if (t <= 0 || t >= 1) continue;
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.translate(cx + (rnd(8, i) - 0.5) * T * 0.9 + Math.sin(t * 7 + i) * T * 0.25, cy - T * 0.2 + t * T * (0.6 + rnd(11, i) * 0.6));
        ctx.rotate(Math.sin(t * 5 + i) * 0.9);
        ctx.fillStyle = kind === "eagle" ? "#4E3A28" : "#A8957A";
        ctx.strokeStyle = "#3F3C33";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(0, 0, T * 0.11, T * 0.035, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      if (d < 360) spriteAt(ctx, g.animal, cx, cy + T * 0.05 * dive, S, { sy: 1 - 0.12 * dive });
      else spriteAt(ctx, g.animal, bx, by + size * 0.45, S * 0.85, { rot: Math.sin(d / 140) * 0.3 });
      spriteAt(ctx, kind, bx, by, size, { sy: 1 - 0.25 * Math.abs(Math.sin(d / 60)) });
    } else if (mode === "stalk") {
      // A pounce from behind, a scuffle in a cloud of dust, then it drags the animal away.
      const size = T * 1.15;
      const p = ease(seg(d, 0, 300));
      const fight = d >= 300 && d < 1050;
      const jx = fight ? Math.sin(d / 23) * T * 0.08 : 0, jy = fight ? Math.cos(d / 31) * T * 0.06 : 0;
      const drag = seg(d, 1050, DEATH_MS) ** 2 * (view.h - cy + T * 2);
      const py = cy + T * 0.75 - T * 0.8 * p - Math.sin(Math.PI * p) * T * 0.6;
      shadow(1 - seg(d, 1050, 1300));
      spriteAt(ctx, g.animal, cx + jx * 0.6, cy + jy * 0.5 + drag, S, { rot: (Math.PI / 2) * seg(d, 300, 650) });
      spriteAt(ctx, kind, cx - jx, py + jy + drag, size);
      const cloud = Math.min(seg(d, 280, 420), 1 - seg(d, 950, 1200));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + d / 300;
        puff(ctx, cx + Math.cos(a) * T * 0.45, cy + Math.sin(a) * T * 0.3 + T * 0.1, T * (0.18 + rnd(12, i) * 0.12), 0.5 * cloud, "160,140,110");
      }
    } else {
      // The hunter fires: a flash and a trail, the animal is knocked back and lands upside down.
      const size = T * 1.15;
      const left = huntSide(view.cam, g, px);
      const toward = left ? 1 : -1;
      const recoil = d < 250 ? Math.sin(Math.PI * seg(d, 0, 250)) * T * 0.12 : 0;
      const hx = (left ? 8 : view.w - size - 8) - toward * recoil;
      const hy = cy - size / 2;
      const mx = left ? hx + size + 4 : hx - 4, my = cy - T * 0.05;
      const k = seg(d, 0, 110);
      ctx.save();
      ctx.strokeStyle = view.colors.accent;
      ctx.globalAlpha = 1 - seg(d, 110, 320);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + (cx - mx) * k, my + (cy - my) * k);
      ctx.stroke();
      ctx.restore();
      if (d < 120) {
        ctx.strokeStyle = view.colors.accent;
        ctx.lineWidth = 3;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(mx + Math.cos(a) * T * 0.08, my + Math.sin(a) * T * 0.08);
          ctx.lineTo(mx + Math.cos(a) * T * 0.28, my + Math.sin(a) * T * 0.28);
          ctx.stroke();
        }
      }
      for (let i = 0; i < 4; i++) {
        const t = seg(d, 60 + i * 70, 1300 + i * 70);
        if (t > 0 && t < 1) puff(ctx, mx + toward * T * 0.15 * t + Math.sin(t * 4 + i) * T * 0.08, my - T * 0.6 * t, T * (0.08 + 0.18 * t), 0.45 * (1 - t), "200,196,180");
      }
      const kb = ease(seg(d, 110, 600));
      shadow(1, 0.28);
      spriteAt(ctx, g.animal, cx + toward * T * 0.7 * kb, cy - Math.sin(Math.PI * seg(d, 110, 600)) * T * 0.45 + kb * T * 0.08, S, { rot: toward * Math.PI * kb });
      const hit = seg(d, 110, 450);
      if (hit > 0 && hit < 1) {
        ctx.save();
        ctx.strokeStyle = view.colors.accent;
        ctx.globalAlpha = 1 - hit;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, T * (0.1 + 0.45 * hit), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      TT.sprites.draw(ctx, kind, hx, hy, size, !left);
    }
  }

  // view: { viewT, cam, w, h, portrait, colors, shakeT, dieT }  dieT: ms since dying, once over
  // Returns where the typed word goes: under the animal, below the word for hopping back.
  function drawWorld(ctx, g, view) {
    const { viewT, cam, w, h, portrait, colors } = view;
    const T = portrait
      ? Math.floor(Math.min(w / 9.5, h / 9.5))
      : Math.max(24, Math.floor(Math.min(64, w / (COLS + 3), h / 8.2)));
    const hopP = Math.min(1, Math.max(0, (viewT - g.hopT) / 130));
    const px = g.from.x + (g.x - g.from.x) * ease(hopP);
    const pl = g.from.lane + (g.lane - g.from.lane) * ease(hopP);
    if (cam.lane == null || Math.abs(cam.lane - pl) > 4) cam.lane = pl;
    else cam.lane += (pl - cam.lane) * 0.18;

    // top of the camera's lane, leaving room below for the back word and what you've typed
    const baseY = h - T * 3.55 - 20;
    const laneY = (k) => baseY - (k - cam.lane) * T;
    const worldW = COLS * T;
    let ox = (w - worldW) / 2;
    if (worldW + T > w) ox = Math.min(T * 0.5, Math.max(w - worldW - T * 0.5, w / 2 - (px + 0.5) * T));
    const X = (c) => ox + c * T;
    const kMin = Math.floor(cam.lane - (h - baseY) / T) - 1;
    const kMax = Math.ceil(cam.lane + baseY / T) + 1;
    const ink = colors.ink;
    const th = theme(g.animal);

    ctx.clearRect(0, 0, w, h);
    // a boulder (hard) or a herd (lightly) shakes the screen as it hits
    const amp = !g.over ? 0 : g.cause === "crushed" ? 0.14 : g.cause === "trampled" ? 0.04 : 0;
    const shake = amp * T * (1 - seg(view.dieT ?? DEATH_MS, 0, 420));
    ctx.save();
    if (shake) ctx.translate(Math.sin(view.dieT / 16) * shake, Math.cos(view.dieT / 21) * shake * 0.6);
    for (let k = kMax; k >= kMin; k--) {
      const L = laneAt(g.world, k);
      const y = laneY(k);
      const bg = LANE_BG[L.type];
      ctx.fillStyle = Array.isArray(bg) ? bg[mod(k, 2)] : bg;
      ctx.fillRect(0, y, w, T + 1);

      if (L.type === "trail") {
        ctx.fillStyle = "rgba(63,60,51,0.2)";
        for (let x = mod(ox, T * 0.7) - T; x < w; x += T * 0.7) ctx.fillRect(x, y + T / 2 - 2, T * 0.28, 4);
      } else if (isWater(L)) {
        ctx.fillStyle = "rgba(242,238,226,0.35)";
        const drift = L.speed ? (L.dir * L.speed * viewT / 1000) * T * 0.6 : 0;
        const gap = L.type === "rapids" ? T * 0.9 : T * 1.4;
        for (let x = mod(ox + drift, gap) - gap; x < w; x += gap) ctx.fillRect(x, y + T * (0.3 + hash(k, 1) * 0.4), L.type === "rapids" ? T * 0.6 : T * 0.3, 3);
      } else if (L.type === "rockslide") {
        ctx.fillStyle = "rgba(63,60,51,0.08)";
        for (let x = -T; x < w; x += 14) ctx.fillRect(x, y, 5, T);
      }

      // the forest beyond the playable columns
      ctx.fillStyle = "rgba(63,60,51,0.22)";
      ctx.fillRect(0, y, Math.max(0, ox), T + 1);
      ctx.fillRect(ox + worldW, y, w, T + 1);
      if (L.type === "meadow" || L.type === "edge") {
        for (let c = -6; c < 0; c++) if (hash(k, c) < 0.75) TT.sprites.draw(ctx, "pine", X(c) + T * 0.03, y + T * 0.03, T * 0.94);
        for (let c = COLS; c < COLS + 6; c++) if (hash(k, c) < 0.75) TT.sprites.draw(ctx, "pine", X(c) + T * 0.03, y + T * 0.03, T * 0.94);
      }
      if (L.type === "edge") {
        for (let c = 0; c < COLS; c++) if (hash(k, c + 50) < 0.8) TT.sprites.draw(ctx, "pine", X(c) + T * 0.03, y + T * 0.03, T * 0.94);
      }
    }

    // lane contents, drawn back to front
    for (let k = kMax; k >= kMin; k--) {
      const L = laneAt(g.world, k);
      const y = laneY(k);
      if (L.type === "meadow") {
        for (const [c, kind] of Object.entries(L.blocks)) TT.sprites.draw(ctx, kind, X(+c) + T * 0.03, y + T * 0.03, T * 0.94);
        for (const c of Object.keys(L.treats || L.acorns || {})) {
          const bob = Math.sin(viewT / 250 + +c) * T * 0.04;
          TT.sprites.draw(ctx, th.treat, X(+c) + T * 0.18, y + T * 0.16 + bob, T * 0.64);
        }
      } else if (L.type === "trail") {
        for (const it of L.things) {
          const x = thingX(L, it, viewT);
          TT.sprites.draw(ctx, "deer", X(x) + T * 0.04, y + T * 0.04, T * 0.92, L.dir > 0);
        }
      } else if (isWater(L)) {
        if (L.pads) {
          for (const c of Object.keys(L.pads)) {
            ctx.beginPath();
            ctx.arc(X(+c) + T / 2, y + T / 2, T * 0.36, 0.25, Math.PI * 2 - 0.25);
            ctx.lineTo(X(+c) + T / 2, y + T / 2);
            ctx.closePath();
            ctx.fillStyle = "#6F8F4E";
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = ink;
            ctx.stroke();
          }
        }
        for (const it of L.things) {
          const x = X(thingX(L, it, viewT));
          const lw = it.len * T;
          roundRect(ctx, x + 3, y + T * 0.18, lw - 6, T * 0.64, T * 0.3);
          ctx.fillStyle = "#8A6A47";
          ctx.fill();
          ctx.fillStyle = "rgba(63,60,51,0.25)";
          ctx.fillRect(x + T * 0.3, y + T * 0.68, lw - T * 0.6, T * 0.1);
          ctx.lineWidth = 2;
          ctx.strokeStyle = ink;
          ctx.stroke();
          ctx.fillStyle = "#C4A57A";
          ctx.beginPath();
          ctx.ellipse(x + lw - T * 0.22, y + T / 2, T * 0.1, T * 0.22, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (L.type === "rockslide") {
        const b = boulder(L, viewT);
        if (b.warn && (b.x != null || Math.floor(viewT / 160) % 2 === 0)) {
          for (const c of [0, COLS - 1]) {
            ctx.fillStyle = ink;
            ctx.fillRect(X(c) + T * 0.22, y + T * 0.22, T * 0.56, T * 0.56);
            ctx.fillStyle = colors.accent;
            ctx.font = `800 ${Math.round(T * 0.42)}px Archivo, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("!", X(c) + T / 2, y + T / 2 + 1);
          }
        }
        if (b.x != null) {
          ctx.beginPath();
          ctx.arc(X(b.x) + T / 2, y + T / 2, T * 0.42, 0, Math.PI * 2);
          ctx.fillStyle = "#9C9886";
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = ink;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(X(b.x) + T / 2, y + T / 2, T * 0.3, 0.2, 1.6);
          ctx.strokeStyle = "rgba(63,60,51,0.35)";
          ctx.stroke();
        }
      }
    }

    // hop targets: faint dashed squares; the one you're typing toward turns solid
    const typed = W.good(g);
    const matches = g.words ? DIRS.filter((d) => typed && g.words[d].startsWith(typed) && target(g, d)) : [];
    if (!g.over && g.words) {
      for (const d of DIRS) {
        const to = target(g, d);
        if (!to) continue;
        const sel = matches.length === 1 && matches[0] === d;
        ctx.save();
        ctx.lineWidth = sel ? 3.5 : 2;
        ctx.strokeStyle = sel ? colors.accent : "rgba(63,60,51,0.45)";
        if (!sel) ctx.setLineDash([6, 5]);
        ctx.strokeRect(X(to.col) + 4, laneY(to.lane) + 4, T - 8, T - 8);
        ctx.restore();
      }
    }

    // the player
    const pxs = X(px), pys = laneY(pl);
    const caught = g.over && (g.cause === "predator" || g.cause === "hawk");
    if (g.over) drawDeath(ctx, g, { ...view, dieT: view.dieT ?? DEATH_MS }, T, X, laneY, px, pl, th);
    else {
      const lift = Math.sin(Math.PI * hopP) * T * 0.35;
      ctx.fillStyle = "rgba(63,60,51,0.28)";
      ctx.beginPath();
      ctx.ellipse(pxs + T / 2, pys + T * 0.86, T * 0.3, T * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      TT.sprites.draw(ctx, g.animal, pxs + T * 0.05, pys + T * 0.02 - lift, T * 0.9);
    }

    drawWords(ctx, g, view, T, X, laneY, matches);
    if (!caught) drawPredator(ctx, g, view, T, X, laneY, px, pl, th);
    ctx.restore();

    if (colors.night) {
      ctx.fillStyle = "rgba(20,19,16,0.35)";
      ctx.fillRect(0, 0, w, h);
    }
    // what you've typed: under the animal, below the back word (and its SPACE tab)
    const fs = Math.max(13, Math.round(T * 0.34));
    return { x: pxs + T / 2, y: laneY(pl - 1) + T + 3 + fs * 2.45 + 4, fs: Math.max(16, Math.round(T * 0.42)) };
  }

  // The four words sit around the animal, each beside the tile it leads to.
  function drawWords(ctx, g, view, T, X, laneY, matches) {
    if (g.over || !g.words) return;
    const { colors, viewT, shakeT } = view;
    const fs = Math.max(13, Math.round(T * 0.34));
    const shake = viewT - shakeT < 220 ? Math.sin((viewT - shakeT) / 18) * 5 : 0;
    ctx.save();
    ctx.font = `500 ${fs}px ${colors.font}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (const d of DIRS) {
      const to = target(g, d);
      if (!to) continue;
      const word = g.words[d];
      const good = W.good(g);
      const match = !!good && word.startsWith(good);
      const ready = W.ready(g, word);
      const dim = !!g.buf && !match;
      const typed = match ? good.length : 0;
      const tw = ctx.measureText(word).width;
      const bw = tw + fs * 1.1;
      const bh = fs * 1.7;
      const tx = X(to.col), ty = laneY(to.lane);
      let x, y;
      if (d === "up") { x = tx + T / 2 - bw / 2; y = ty - bh - 3; }
      else if (d === "down") { x = tx + T / 2 - bw / 2; y = ty + T + 3; }
      else if (d === "left") { x = tx - bw - 3; y = ty + T / 2 - bh / 2; }
      else { x = tx + T + 3; y = ty + T / 2 - bh / 2; }
      x += shake;

      ctx.globalAlpha = dim ? 0.45 : 1;
      roundRect(ctx, x, y, bw, bh, 4);
      ctx.fillStyle = colors.ground;
      ctx.fill();
      if (ready) {
        ctx.fillStyle = colors.accent;
        ctx.globalAlpha = 0.18;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.lineWidth = ready ? 3 : 2;
      ctx.strokeStyle = ready || (match && matches.length === 1) ? colors.accent : colors.text;
      ctx.stroke();

      const textX = x + fs * 0.55;
      const textY = y + bh / 2 + 1;
      const done = word.slice(0, typed);
      ctx.fillStyle = colors.text;
      ctx.fillText(done, textX, textY);
      const doneW = ctx.measureText(done).width;
      ctx.fillStyle = ready ? colors.text : colors.sub;
      ctx.fillText(word.slice(typed), textX + doneW, textY);
      if (typed) {
        ctx.fillStyle = colors.accent;
        ctx.fillRect(textX, textY + fs * 0.55, doneW, 2);
      }
      if (ready) {
        // a small "space" tab under the word
        const label = "SPACE";
        ctx.font = `800 ${Math.max(9, Math.round(fs * 0.5))}px Archivo, sans-serif`;
        const lw = ctx.measureText(label).width + 10;
        const lx = x + bw / 2 - lw / 2, ly = y + bh - 2;
        ctx.fillStyle = colors.accent;
        ctx.fillRect(lx, ly, lw, fs * 0.75);
        ctx.fillStyle = colors.ground;
        ctx.textAlign = "center";
        ctx.fillText(label, lx + lw / 2, ly + fs * 0.4);
        ctx.textAlign = "left";
        ctx.font = `500 ${fs}px ${colors.font}`;
      }
    }
    ctx.restore();
  }

  // The predator appears once the countdown starts and closes in as it runs down. (When it
  // catches the animal, drawDeath takes over.)
  function drawPredator(ctx, g, view, T, X, laneY, px, pl, th) {
    if (g.v < 2 || g.threatStart == null) return;
    const { viewT, w, h, cam, colors } = view;
    const since = viewT - g.threatStart;
    const p = Math.min(1, since / g.threatGrace);
    const cx = X(px) + T / 2, cy = laneY(pl) + T / 2;
    const size = T * 1.15;

    if (th.mode === "circle") {
      const enter = Math.min(1, since / 900);
      const a = since / 650;
      const r = T * (1.7 - p * 0.6); // circles tighter as time runs out
      const x = cx + Math.cos(a) * r;
      const y = cy - T * 0.4 + Math.sin(a) * r * 0.55 - (1 - enter) * (cy + T * 2);
      ctx.fillStyle = "rgba(63,60,51,0.18)";
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * r * 0.7, cy + T * 0.3, T * 0.4, T * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      TT.sprites.draw(ctx, th.predator, x - size / 2, y - size / 2, size);
    } else if (th.mode === "stalk") {
      // creeps up from the bottom of the screen, right behind you
      const endY = cy + T * 0.75;
      const startY = h + size;
      const near = ease(Math.min(1, 0.3 * Math.min(1, since / 1200) + 0.7 * p));
      const y = startY + (endY - startY) * near;
      TT.sprites.draw(ctx, th.predator, cx - size / 2, y - size / 2, size, false);
    } else {
      // a hunter steps out at the side of the screen and takes aim
      const left = huntSide(cam, g, px);
      const slide = ease(Math.min(1, since / 600));
      const hx = left ? -size + slide * (size + 8) : w + 8 - slide * (size + 16);
      const hy = cy - size / 2;
      if (p > 0.6 && Math.floor(viewT / 200) % 2 === 0) {
        ctx.save();
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(left ? hx + size : hx, cy - T * 0.05);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        ctx.restore();
      }
      TT.sprites.draw(ctx, th.predator, hx, hy, size, !left);
    }
  }

  // ---------- engine: live play and replay ----------

  const TEMPLATE = `
    <div class="fh">
      <div class="fh-stage">
        <canvas class="fh-canvas" role="img" aria-label="Forest Hop playing field"></canvas>
        <div class="fh-hud fh-hud-l">
          <div class="fh-score"><span data-f="score">0</span><span class="caps-label">STEPS</span></div>
          <div class="caps-label" data-f="best"></div>
        </div>
        <div class="fh-hud fh-hud-r">
          <div class="fh-chip" data-f="treats"></div>
          <div class="fh-chip" data-f="animal"></div>
          <div class="fh-chip fh-threat" data-f="threat" hidden></div>
        </div>
        <div class="word-box fh-typed" data-f="typed" aria-hidden="true"></div>
        <div class="fh-over" data-f="over" hidden></div>
      </div>
      <p class="visually-hidden" data-f="sr" aria-live="polite"></p>
    </div>`;

  TT.createForest = ({ root, onStart, onEnd, replayOnly = false }) => {
    root.innerHTML = TEMPLATE;
    const el = Object.fromEntries([...root.querySelectorAll("[data-f]")].map((x) => [x.dataset.f, x]));
    const fh = root.querySelector(".fh");
    const canvas = root.querySelector(".fh-canvas");
    const ctx = canvas.getContext("2d");
    let g = null;
    let live = null;   // { state, startedAt, keys, times, words, recent, targets, missed }
    let replay = null; // { rec, pos, lastT, provider }
    let viewT = 0;
    let dieT = null;   // while the death animation plays: ms into it
    let typedAt = null; // where the typed word goes (from drawWorld)
    let shakeT = -1000;
    let raf = 0;
    let cam = { lane: null };
    let hudSig = "";
    let srSig = "";
    let colors = themeColors();

    const record = () => {
      const d = (TT.store.games.forest ||= { best: 0, plays: 0, unlocked: ["frog", "chicken", "moose", "bear"], animal: "frog", history: [] });
      if (d.treats == null) d.treats = d.acorns || 0; // acorns were renamed to treats
      delete d.acorns;
      return d;
    };

    const ro = new ResizeObserver(() => {
      fh.classList.toggle("portrait", fh.clientHeight > fh.clientWidth * 1.05);
      draw();
    });
    ro.observe(fh);

    // ---------- words (live play only) ----------

    // Keeps the words for the directions you didn't use; only the one you hopped with changes.
    function makeWords(state, usedDir) {
      const s = score(state);
      let maxLen = Math.min(9, 4 + Math.floor(s / 8));
      const minLen = s < 8 ? 2 : 3;
      const here = laneAt(state.world, state.lane).type;
      const ahead = laneAt(state.world, state.lane + 1).type;
      if (here === "rapids" || ahead === "rapids") maxLen = Math.min(maxLen, 5);
      const fits = (w) => w.length >= minLen && w.length <= maxLen && !live.recent.includes(w);
      const batch = A.practiceWords(60, live.targets, live.missed, TT.store.settings.mix).filter(fits);
      const anyFit = PRACTICE_WORDS.filter(fits);
      const share = Math.random() < Math.min(0.6, s * 0.02);

      const prev = state.words;
      const out = {};
      if (prev && usedDir) for (const d of DIRS) if (d !== usedDir) out[d] = prev[d];
      const chosen = Object.values(out);
      const clashes = (w) => chosen.some((c) => c === w || c.startsWith(w) || w.startsWith(c));
      const replaced = prev && usedDir ? prev[usedDir] : null;
      const ok = (w) => w !== replaced && !clashes(w) && (share || !chosen.some((c) => c[0] === w[0]));
      for (const d of DIRS) {
        if (out[d]) continue;
        let cands = batch.length ? batch : anyFit;
        if (share && chosen.length) {
          const shared = anyFit.filter((w) => w[0] === chosen[0][0]);
          if (shared.length > 2) cands = shared;
        }
        let word = null;
        for (let i = 0; i < 80 && !word; i++) {
          const w = cands[Math.floor(Math.random() * cands.length)];
          if (ok(w)) word = w;
        }
        word ||= anyFit.find(ok) || PRACTICE_WORDS.find((w) => !clashes(w));
        out[d] = word;
        chosen.push(word);
      }
      const fresh = DIRS.filter((d) => !(prev && usedDir) || d === usedDir).map((d) => out[d]);
      live.recent = [...live.recent, ...fresh].slice(-16);
      live.words.push({ ...out });
      return out;
    }

    // ---------- rendering ----------

    function draw() {
      if (!g) return;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      typedAt = drawWorld(ctx, g, { viewT, cam, w, h, portrait: fh.classList.contains("portrait"), colors, shakeT, dieT: g.over ? dieT ?? DEATH_MS : null });
      placeTyped();
    }

    // The typed word sits under the animal, kept inside the field.
    function placeTyped() {
      if (!typedAt) return;
      const box = el.typed;
      box.style.fontSize = `${typedAt.fs}px`;
      const half = box.offsetWidth / 2;
      box.style.left = `${Math.max(half + 8, Math.min(canvas.clientWidth - half - 8, typedAt.x))}px`;
      box.style.top = `${typedAt.y}px`;
    }

    // The death plays out (the world carries on around it), then done() shows the end screen.
    function playDeath(done) {
      cancelAnimationFrame(raf);
      const t0 = performance.now();
      const step = () => {
        dieT = Math.min(DEATH_MS, performance.now() - t0);
        viewT = g.endT + dieT;
        draw();
        if (dieT >= DEATH_MS) return done();
        raf = requestAnimationFrame(step);
      };
      dieT = 0;
      raf = requestAnimationFrame(step);
    }

    function renderHud() {
      const th = theme(g.animal);
      const best = Math.max(record().best, score(g));
      const treats = replay ? g.treats : record().treats + g.treats;
      const left = g.v >= 2 && g.threatStart != null && !g.over ? Math.max(0, Math.ceil((g.threatGrace - (viewT - g.threatStart)) / 1000)) : null;
      const sig = [score(g), best, treats, g.animal, left, g.buf, g.bad].join("|");
      if (sig === hudSig) return;
      hudSig = sig;
      el.score.textContent = score(g);
      el.best.textContent = `BEST ${best}`;
      el.treats.innerHTML = `${TT.sprites.svg(th.treat, 26)}<span>${treats}</span>`;
      el.treats.title = th.treats[1];
      el.animal.innerHTML = `${TT.sprites.svg(g.animal, 26)}<span>${g.animal.toUpperCase()}</span>`;
      el.threat.hidden = left == null;
      if (left != null) el.threat.innerHTML = `${TT.sprites.svg(th.predator, 26)}<span>${th.name} · ${left}</span>`;
      el.typed.innerHTML = W.html(g);
      el.typed.hidden = !g.buf || g.over;
      placeTyped();
    }

    // Screen readers get the four words and what has been typed.
    function renderSr() {
      if (!g.words) return;
      const NAMES = { up: "forward", left: "left", right: "right", down: "back" };
      const text = DIRS.map((d) => `${NAMES[d]}: ${target(g, d) ? g.words[d] : "blocked"}`).join(", ") + (g.buf ? `. Typed ${g.buf}` : "") + (W.clean(g) ? "" : `, wrong from letter ${g.bad + 1}`);
      if (text === srSig) return;
      srSig = text;
      el.sr.textContent = text;
    }

    function render() {
      draw();
      renderHud();
      renderSr();
    }

    // ---------- live play ----------

    function newGame(animal) {
      cancelAnimationFrame(raf);
      replay = null;
      colors = themeColors();
      live = { state: "ready", startedAt: 0, keys: "", times: [], words: [], recent: [], targets: A.weakKeys(), missed: A.weakWords(20) };
      const seed = (Math.random() * 2 ** 32) >>> 0;
      g = newCore(seed, animal, RULES);
      g.wpmScale = W.scale();
      assignWords(g, makeWords);
      viewT = 0;
      dieT = null;
      cam = { lane: null };
      hudSig = srSig = "";
      el.over.hidden = true;
      render();
      raf = requestAnimationFrame(frame);
    }

    function frame() {
      if (!live || live.state === "stopped" || live.state === "paused") return;
      if (live.state === "running") {
        viewT = performance.now() - live.startedAt;
        if (advance(g, viewT)) return end();
        renderHud();
      }
      draw();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      live.state = "running";
      live.startedAt = performance.now();
      onStart && onStart();
    }

    // Pausing stops the clock: on resume the start time moves on by however long the pause was,
    // so the round (and its recording) carries on as if no time had passed.
    function pause() {
      if (!live || live.state !== "running") return;
      live.state = "paused";
      live.pausedAt = performance.now();
      cancelAnimationFrame(raf);
      el.over.innerHTML = TT.pausedHtml("fh:play", "fh:select", "ANIMALS");
      el.over.hidden = false;
    }

    function resume() {
      if (!live || live.state !== "paused") return;
      live.startedAt += performance.now() - live.pausedAt;
      live.state = "running";
      el.over.hidden = true;
      raf = requestAnimationFrame(frame);
    }

    function handleKey(e) {
      if (!live || (live.state !== "ready" && live.state !== "running")) return;
      let k;
      if (e.key === "Backspace") k = e.ctrlKey || e.altKey ? BACK_WORD : BACK;
      else if (e.ctrlKey || e.altKey || e.metaKey) return;
      else if (e.key === " " || e.key === "Enter") k = " "; // either one jumps (recorded as a space)
      else if (/^[a-zA-Z]$/.test(e.key)) k = e.key;
      else return;
      e.preventDefault();

      if (live.state === "ready") {
        if (!/^[a-zA-Z]$/.test(k)) return; // the forest starts moving on the first letter
        start();
      }
      const t = Math.round(performance.now() - live.startedAt);
      viewT = t;
      if (advance(g, t)) return end(); // already caught; don't record this key
      live.keys += k;
      live.times.push(t);
      const d = applyKey(g, k, t, makeWords);
      if (g.over) return end();
      if (d && (d.type === "miss" || (d.type === "space" && !d.empty))) shakeT = viewT;
      render();
    }

    // Saves the run straight away, plays the death, then shows the end screen.
    function end() {
      live.state = "dying";
      cancelAnimationFrame(raf);
      viewT = g.endT;

      // A half-typed word counts only if it matches just one direction.
      const good = W.good(g);
      const cands = good ? DIRS.map((d) => g.words[d]).filter((w) => w.startsWith(good)) : [];
      if (cands.length === 1) W.attribute(g, good, cands[0]);

      const th = theme(g.animal);
      const s = score(g);
      const { wpm, acc } = gameStats(g, g.endT);
      const round = (x) => Math.round(x * 100) / 100;
      const date = new Date().toISOString();
      const id = TT.newRoundId();
      const rec = record();
      const prevBest = rec.best;
      rec.plays++;
      rec.best = Math.max(rec.best, s);
      rec.treats += g.treats;
      rec.bestBy = rec.bestBy || {};
      rec.bestBy[g.animal] = Math.max(rec.bestBy[g.animal] || 0, s);
      rec.runsBy = rec.runsBy || {};
      rec.runsBy[g.animal] = (rec.runsBy[g.animal] || 0) + 1;
      rec.history.push({ date, score: s, wpm: round(wpm), acc: round(acc), animal: g.animal, cause: g.cause });
      if (rec.history.length > HISTORY_CAP) rec.history.splice(0, rec.history.length - HISTORY_CAP);

      const store = TT.store;
      store.history.push({
        id, date, kind: "game", game: "forest", mode: "steps", amount: s,
        wpm: round(wpm), raw: round(wpm), acc: round(acc), seconds: round(g.endT / 1000),
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
        id, date, kind: "game", game: "forest", mode: "steps", amount: s, v: RULES,
        seed: g.seed, animal: g.animal, wpmScale: g.wpmScale, words: live.words, keys: live.keys, times: live.times, duration: g.endT,
      });

      const line = s > prevBest && prevBest > 0
        ? `<strong class="hl">New best!</strong> Previous best was ${prevBest}.`
        : `Best ${rec.best} · ${Math.round(wpm)} wpm · ${Math.round(acc)}% accuracy`;
      const got = g.treats ? ` · ${g.treats} ${th.treats[g.treats > 1 ? 1 : 0]}` : "";
      const overHtml = `
        <h2>${causeText(g.cause, g.animal)}</h2>
        <div class="fh-over-score">${s}</div>
        <div class="caps-label">STEPS</div>
        <p>${line}${got}</p>
        <div class="hints">
          <button data-act="fh:play"><kbd>TAB</kbd>PLAY AGAIN</button>
          <button data-act="replay:${id}"><kbd>R</kbd>REPLAY</button>
          <button data-act="fh:select"><kbd>ESC</kbd>ANIMALS</button>
        </div>`;
      hudSig = "";
      renderHud();
      renderSr();
      const me = live;
      playDeath(() => {
        if (live !== me || me.state !== "dying") return;
        me.state = "over";
        el.over.innerHTML = overHtml;
        el.over.hidden = false;
        onEnd && onEnd(id);
      });
    }

    function stop() {
      cancelAnimationFrame(raf);
      if (live && live.state !== "over") live.state = "stopped";
    }

    // ---------- replay ----------

    function loadReplay(rec) {
      stop();
      live = null;
      colors = themeColors();
      const provider = recordedWords(rec);
      replay = { rec, pos: 0, lastT: 0, provider, over: false };
      dieT = null;
      g = newCore(rec.seed, rec.animal || "frog", rec.v || 1);
      g.wpmScale = rec.wpmScale ?? W.scale();
      assignWords(g, provider);
      viewT = 0;
      cam = { lane: null };
      hudSig = srSig = "";
      el.over.hidden = true;
      render();
    }

    function replayTo(T) {
      if (!replay) return g;
      const { rec, provider } = replay;
      if (T < replay.lastT) {
        g = newCore(rec.seed, rec.animal || "frog", rec.v || 1);
        g.wpmScale = rec.wpmScale ?? W.scale();
        assignWords(g, provider);
        replay.pos = 0;
        cam = { lane: null };
      }
      while (replay.pos < rec.keys.length && rec.times[replay.pos] <= T) {
        const d = applyKey(g, rec.keys[replay.pos], rec.times[replay.pos], provider);
        if (d && d.type === "miss") shakeT = rec.times[replay.pos];
        replay.pos++;
      }
      advance(g, Math.min(T, rec.duration));
      replay.lastT = T;
      const overHtml = () => `<h2>${causeText(g.cause, g.animal)}</h2><div class="fh-over-score">${score(g)}</div><div class="caps-label">STEPS</div>`;
      if (g.over && !replay.over) {
        // reaching the end plays the death, then shows how the run ended
        replay.over = true;
        el.over.hidden = true;
        viewT = g.endT;
        render();
        playDeath(() => {
          if (!replay || !replay.over) return;
          el.over.innerHTML = overHtml();
          el.over.hidden = false;
        });
        return g;
      }
      if (!g.over) {
        if (replay.over) cancelAnimationFrame(raf);
        replay.over = false;
        dieT = null;
      }
      viewT = g.over ? g.endT + (dieT ?? DEATH_MS) : T;
      if (g.over && dieT >= DEATH_MS) {
        el.over.innerHTML = overHtml();
        el.over.hidden = false;
      } else if (!g.over) el.over.hidden = true;
      render();
      return g;
    }

    return {
      newGame, stop, handleKey, loadReplay, replayTo,
      relayout: () => { colors = themeColors(); hudSig = ""; render(); },
      isOver: () => !!live && live.state === "over",
      isRunning: () => !!live && live.state === "running",
      isPaused: () => !!live && live.state === "paused",
      pause, resume,
    };
  };
})();
