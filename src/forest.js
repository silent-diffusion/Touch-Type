// Forest Hop: a Crossy Road-style game. Each direction around your animal gets a word; type a
// word, then press Space to hop that way. The forest has meadows (trees block your way), game
// trails (deer herds), creeks (ride logs, or hop across lily pads), rapids and rockslides.
// Stand still too long, or go back too far, and the hawk gets you.
//
// The world comes from a seed and moves on a fixed 20 ms time step, so a recording (seed, the
// words offered at each spot, and the key presses with their times) replays exactly.
(() => {
  const A = TT.analysis;
  const COLS = 13;          // playable columns
  const STEP = 20;          // simulation step, ms
  const START_LANE = 2;
  const START_COL = 6;
  const IDLE_MS = 9000;     // no forward progress for this long brings the hawk
  const HAWK_BACK = 3;      // going this many rows back from your best brings the hawk
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
  };

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

  function newWorld(seed) {
    return { rng: rngFrom(seed), lanes: [], queue: [] };
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
      lane.acorns = {};
      const n = k === 0 ? 7 : k < 2 ? 0 : Math.floor(r() * (3 + d * 3));
      for (let i = 0; i < n; i++) {
        const c = Math.floor(r() * COLS);
        if (k === START_LANE && c === START_COL) continue;
        lane.blocks[c] = pick(r, ["pine", "pine", "pine", "rock", "stump"]);
      }
      if (k > START_LANE && r() < 0.3) {
        const c = Math.floor(r() * COLS);
        if (!lane.blocks[c]) lane.acorns[c] = true;
      }
    } else if (type === "trail") {
      lane.dir = r() < 0.5 ? 1 : -1;
      lane.speed = 1.6 + r() * (1.4 + d * 2.4); // tiles per second
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

  function newCore(seed, animal) {
    return {
      seed, animal,
      world: newWorld(seed),
      lane: START_LANE, x: START_COL,
      from: { lane: START_LANE, x: START_COL }, hopT: -1000,
      maxLane: START_LANE, lastProgressT: 0,
      simT: 0, over: false, endT: null, cause: null,
      words: null, wordSets: 0, buf: "",
      keys: 0, correct: 0, mistakes: 0, spaceErrors: 0, chars: 0, acorns: 0,
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

  function tick(g, t) {
    const L = laneAt(g.world, g.lane);
    if (isWater(L) && !L.pads && supported(g, t)) {
      g.x += (L.dir * L.speed * STEP) / 1000;
      if (g.x < -0.45 || g.x > COLS - 0.55) return die(g, t, "swept");
    }
    const hit = collision(g, t);
    if (hit) return die(g, t, hit);
    if (t - g.lastProgressT > IDLE_MS || g.maxLane - g.lane >= HAWK_BACK) die(g, t, "hawk");
  }

  function advance(g, t) {
    while (!g.over && g.simT + STEP <= t) {
      g.simT += STEP;
      tick(g, g.simT);
    }
    return g.over;
  }

  function assignWords(g, provider) {
    g.words = provider(g);
    g.wordSets++;
  }

  // Wrong keys are tied to a letter once the word you hopped with is known.
  function attribute(g, word) {
    const bump = (letter, missed) => {
      const k = (g.keyStats[letter] ||= { expected: 0, missed: 0 });
      k.expected++;
      if (missed) k.missed++;
    };
    for (const ch of word) bump(ch, false);
    const misses = g.stepMisses.filter((m) => m.pos < word.length);
    for (const m of misses) bump(word[m.pos], true);
    if (misses.length) g.missedWords.add(word);
    g.stepMisses = [];
    return misses;
  }

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
    g.buf = "";
    if (g.lane > g.maxLane) {
      g.maxLane = g.lane;
      g.lastProgressT = t;
    }
    const L = laneAt(g.world, g.lane);
    let acorn = false;
    if (L.type === "meadow" && L.acorns[to.col]) {
      delete L.acorns[to.col];
      g.acorns++;
      acorn = true;
    }
    const hit = collision(g, t);
    if (hit) die(g, t, hit);
    else assignWords(g, provider);
    return { type: "hop", dir, word, typed: " ", misses, acorn };
  }

  // Applies one key press at time t (ms from the first key). Returns what it did, or null.
  function applyKey(g, k, t, provider) {
    if (advance(g, t)) return null;
    if (k === BACK || k === BACK_WORD) {
      if (!g.buf) return null;
      const deleted = k === BACK_WORD ? g.buf : g.buf.slice(-1);
      g.buf = k === BACK_WORD ? "" : g.buf.slice(0, -1);
      return { type: "back", deleted, buf: g.buf };
    }
    if (k === " ") {
      const dir = g.buf && DIRS.find((d) => g.words[d] === g.buf && target(g, d));
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
    g.keys++;
    const cand = g.buf + k;
    const open = DIRS.filter((d) => target(g, d)).map((d) => g.words[d]);
    if (!open.some((w) => w.startsWith(cand))) {
      g.stepMisses.push({ pos: g.buf.length, typed: k });
      g.mistakes++;
      return { type: "miss", typed: k, pos: g.buf.length, buf: g.buf };
    }
    g.correct++;
    g.buf = cand;
    return { type: "letter", typed: k, pos: cand.length - 1, buf: cand };
  }

  function gameStats(g, ms) {
    const minutes = ms / 60000;
    return {
      wpm: minutes > 1 / 60 ? g.chars / 5 / minutes : 0,
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

  TT.forestCore = { newCore, applyKey, advance, assignWords, recordedWords, gameStats, attribute, score, probe, target, laneAt, CAUSES, START_LANE };

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
    return {
      ink: "#3F3C33",
      accent: cs.getPropertyValue("--accent").trim() || "#B4472B",
      night: document.documentElement.dataset.theme === "night",
    };
  }

  // reserve: pixels at the bottom covered by the cross (landscape), kept clear of the player.
  function drawWorld(ctx, g, viewT, cam, w, h, portrait, colors, reserve) {
    const avail = h - reserve;
    const T = portrait
      ? Math.floor(Math.min(w / 9.5, h / 7))
      : Math.max(22, Math.floor(Math.min(60, w / (COLS + 3), avail / 5.2)));
    const hopP = Math.min(1, Math.max(0, (viewT - g.hopT) / 130));
    const px = g.from.x + (g.x - g.from.x) * ease(hopP);
    const pl = g.from.lane + (g.lane - g.from.lane) * ease(hopP);
    if (cam.lane == null || Math.abs(cam.lane - pl) > 4) cam.lane = pl;
    else cam.lane += (pl - cam.lane) * 0.18;

    // top of the camera's lane: the player's row and the row behind it stay above the cross
    const baseY = portrait ? h - T * 2.4 : avail - T * 2.1;
    const laneY = (k) => baseY - (k - cam.lane) * T;
    const worldW = COLS * T;
    let ox = (w - worldW) / 2;
    if (worldW + T > w) ox = Math.min(T * 0.5, Math.max(w - worldW - T * 0.5, w / 2 - (px + 0.5) * T));
    const X = (c) => ox + c * T;
    const kMin = Math.floor(cam.lane - (h - baseY) / T) - 1;
    const kMax = Math.ceil(cam.lane + baseY / T) + 1;
    const ink = colors.ink;

    ctx.clearRect(0, 0, w, h);
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
        for (const c of Object.keys(L.acorns)) {
          const bob = Math.sin(viewT / 250 + +c) * T * 0.04;
          TT.sprites.draw(ctx, "acorn", X(+c) + T * 0.18, y + T * 0.16 + bob, T * 0.64);
        }
      } else if (L.type === "trail") {
        for (const th of L.things) {
          const x = thingX(L, th, viewT);
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
        for (const th of L.things) {
          const x = X(thingX(L, th, viewT));
          const lw = th.len * T;
          ctx.beginPath();
          ctx.roundRect(x + 3, y + T * 0.18, lw - 6, T * 0.64, T * 0.3);
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

    // hop targets: dashed squares; the one you're typing toward turns solid
    if (!g.over && g.words) {
      const matches = DIRS.filter((d) => g.buf && g.words[d].startsWith(g.buf) && target(g, d));
      for (const d of DIRS) {
        const to = target(g, d);
        if (!to) continue;
        const sel = matches.length === 1 && matches[0] === d;
        ctx.save();
        ctx.lineWidth = sel ? 3.5 : 2;
        ctx.strokeStyle = sel ? colors.accent : "rgba(63,60,51,0.55)";
        if (!sel) ctx.setLineDash([6, 5]);
        ctx.strokeRect(X(to.col) + 4, laneY(to.lane) + 4, T - 8, T - 8);
        ctx.restore();
      }
    }

    // the player
    const pxs = X(px), pys = laneY(pl);
    const lift = Math.sin(Math.PI * hopP) * T * 0.35;
    ctx.fillStyle = "rgba(63,60,51,0.28)";
    ctx.beginPath();
    ctx.ellipse(pxs + T / 2, pys + T * 0.86, T * 0.3, T * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    if (g.over && g.cause === "trampled") {
      TT.sprites.draw(ctx, g.animal, pxs + T * 0.05, pys + T * 0.5, T * 0.9);
    } else {
      if (g.over && (g.cause === "drowned" || g.cause === "swept")) ctx.globalAlpha = 0.4;
      TT.sprites.draw(ctx, g.animal, pxs + T * 0.05, pys + T * 0.02 - lift, T * 0.9);
      ctx.globalAlpha = 1;
    }
    if (g.over && g.cause === "hawk") TT.sprites.draw(ctx, "hawk", pxs - T * 0.25, pys - T * 0.55, T * 1.5);

    if (colors.night) {
      ctx.fillStyle = "rgba(20,19,16,0.35)";
      ctx.fillRect(0, 0, w, h);
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
          <div class="fh-chip">${TT.sprites.svg("acorn", 26)}<span data-f="acorns">0</span></div>
          <div class="fh-chip" data-f="animal"></div>
        </div>
        <div class="fh-over" data-f="over" hidden></div>
      </div>
      <div class="fh-cross" data-f="cross" aria-live="polite"></div>
    </div>`;

  TT.createForest = ({ root, onStart, onEnd, replayOnly = false }) => {
    root.innerHTML = TEMPLATE;
    const el = Object.fromEntries([...root.querySelectorAll("[data-f]")].map((x) => [x.dataset.f, x]));
    const fh = root.querySelector(".fh");
    const stage = root.querySelector(".fh-stage");
    const canvas = root.querySelector(".fh-canvas");
    const ctx = canvas.getContext("2d");
    let g = null;
    let live = null;   // { state, startedAt, keys, times, words, recent, targets, missed }
    let replay = null; // { rec, pos, lastT, provider }
    let viewT = 0;
    let raf = 0;
    let cam = { lane: null };
    let crossSig = "";
    let colors = themeColors();

    const record = () => (TT.store.games.forest ||= { best: 0, plays: 0, acorns: 0, unlocked: ["frog", "chicken", "moose", "bear"], animal: "frog", history: [] });

    const ro = new ResizeObserver(() => {
      fh.classList.toggle("portrait", fh.clientHeight > fh.clientWidth * 1.05);
      draw();
    });
    ro.observe(fh);

    // ---------- words (live play only) ----------

    function makeWords(state) {
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
      const chosen = [];
      const clashes = (w) => chosen.some((c) => c === w || c.startsWith(w) || w.startsWith(c));
      const ok = (w) => !clashes(w) && (share || !chosen.some((c) => c[0] === w[0]));
      const out = {};
      for (const d of DIRS) {
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
      live.recent = [...live.recent, ...chosen].slice(-16);
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
      const portrait = fh.classList.contains("portrait");
      const reserve = portrait ? 0 : el.cross.offsetHeight + 18;
      drawWorld(ctx, g, viewT, cam, w, h, portrait, colors, reserve);
    }

    function renderHud() {
      const best = Math.max(record().best, score(g));
      el.score.textContent = score(g);
      el.best.textContent = `BEST ${best}`;
      el.acorns.textContent = replay ? g.acorns : record().acorns + g.acorns;
      el.animal.innerHTML = `${TT.sprites.svg(g.animal, 26)}<span>${g.animal.toUpperCase()}</span>`;
    }

    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

    function renderCross() {
      const blocked = Object.fromEntries(DIRS.map((d) => [d, !target(g, d)]));
      const sig = JSON.stringify([g.words, g.buf, blocked, g.over]);
      if (sig === crossSig) return;
      crossSig = sig;
      const exact = DIRS.find((d) => g.words[d] === g.buf && !blocked[d]);
      const LABEL = { up: "↑ FORWARD", left: "← LEFT", right: "RIGHT →", down: "↓ BACK" };
      const card = (d) => {
        if (blocked[d]) return `<div class="fh-card fh-${d} blocked"><span class="fh-dir">${LABEL[d]}</span><span class="fh-blocked">BLOCKED</span></div>`;
        const w = g.words[d];
        const match = g.buf && w.startsWith(g.buf);
        const typed = match ? g.buf.length : 0;
        const cls = exact === d ? "ready" : g.buf && !match ? "dim" : match ? "match" : "";
        return `<div class="fh-card fh-${d} ${cls}"><span class="fh-dir">${LABEL[d]}</span>` +
          `<span class="fh-word"><b>${esc(w.slice(0, typed))}</b>${esc(w.slice(typed))}</span></div>`;
      };
      const center = `<div class="fh-card fh-center"><span class="fh-buf">${esc(g.buf)}<i class="fh-caret"></i></span>` +
        `<span class="fh-hint">${exact ? "SPACE TO JUMP" : g.buf ? "TYPING" : "TYPE A WORD"}</span></div>`;
      el.cross.innerHTML = card("up") + card("left") + center + card("right") + card("down");
      el.cross.classList.toggle("ready", !!exact);
      // once the run is over the cross would cover the game-over buttons
      el.cross.style.visibility = g.over ? "hidden" : "";
    }

    function render() {
      draw();
      renderHud();
      renderCross();
    }

    function shake() {
      el.cross.classList.remove("shake");
      void el.cross.offsetWidth;
      el.cross.classList.add("shake");
    }

    // ---------- live play ----------

    function newGame(animal) {
      cancelAnimationFrame(raf);
      replay = null;
      colors = themeColors();
      live = { state: "ready", startedAt: 0, keys: "", times: [], words: [], recent: [], targets: A.weakKeys(), missed: A.weakWords(20) };
      const seed = (Math.random() * 2 ** 32) >>> 0;
      g = newCore(seed, animal);
      assignWords(g, makeWords);
      viewT = 0;
      cam = { lane: null };
      crossSig = "";
      el.over.hidden = true;
      render();
      raf = requestAnimationFrame(frame);
    }

    function frame() {
      if (!live || live.state === "stopped") return;
      if (live.state === "running") {
        viewT = performance.now() - live.startedAt;
        if (advance(g, viewT)) return end();
        renderCross();
      }
      draw();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      live.state = "running";
      live.startedAt = performance.now();
      onStart && onStart();
    }

    function handleKey(e) {
      if (!live || live.state === "over" || live.state === "stopped") return;
      let k;
      if (e.key === "Backspace") k = e.ctrlKey || e.altKey ? BACK_WORD : BACK;
      else if (e.ctrlKey || e.altKey || e.metaKey) return;
      else if (e.key === " ") k = " ";
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
      if (d && (d.type === "miss" || (d.type === "space" && !d.empty))) shake();
      render();
    }

    function end() {
      live.state = "over";
      cancelAnimationFrame(raf);
      viewT = g.endT;

      // A half-typed word counts only if it matches just one direction.
      if (g.buf && DIRS.filter((d) => g.words[d].startsWith(g.buf)).length === 1) attribute(g, g.buf);

      const s = score(g);
      const { wpm, acc } = gameStats(g, g.endT);
      const round = (x) => Math.round(x * 100) / 100;
      const date = new Date().toISOString();
      const id = TT.newRoundId();
      const rec = record();
      const prevBest = rec.best;
      rec.plays++;
      rec.best = Math.max(rec.best, s);
      rec.acorns += g.acorns;
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
        id, date, kind: "game", game: "forest", mode: "steps", amount: s,
        seed: g.seed, animal: g.animal, words: live.words, keys: live.keys, times: live.times, duration: g.endT,
      });

      const line = s > prevBest && prevBest > 0
        ? `<strong class="hl">New best!</strong> Previous best was ${prevBest}.`
        : `Best ${rec.best} · ${Math.round(wpm)} wpm · ${Math.round(acc)}% accuracy`;
      el.over.innerHTML = `
        <h2>${CAUSES[g.cause]}</h2>
        <div class="fh-over-score">${s}</div>
        <div class="caps-label">STEPS</div>
        <p>${line}${g.acorns ? ` · ${g.acorns} acorn${g.acorns > 1 ? "s" : ""}` : ""}</p>
        <div class="hints">
          <button data-act="fh:play"><kbd>TAB</kbd>PLAY AGAIN</button>
          <button data-act="replay:${id}"><kbd>R</kbd>REPLAY</button>
          <button data-act="fh:select"><kbd>ESC</kbd>ANIMALS</button>
        </div>`;
      el.over.hidden = false;
      render();
      onEnd && onEnd(id);
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
      replay = { rec, pos: 0, lastT: 0, provider };
      g = newCore(rec.seed, rec.animal || "frog");
      assignWords(g, provider);
      viewT = 0;
      cam = { lane: null };
      crossSig = "";
      el.over.hidden = true;
      render();
    }

    function replayTo(T) {
      if (!replay) return g;
      const { rec, provider } = replay;
      if (T < replay.lastT) {
        g = newCore(rec.seed, rec.animal || "frog");
        assignWords(g, provider);
        replay.pos = 0;
        cam = { lane: null };
      }
      while (replay.pos < rec.keys.length && rec.times[replay.pos] <= T) {
        applyKey(g, rec.keys[replay.pos], rec.times[replay.pos], provider);
        replay.pos++;
      }
      advance(g, Math.min(T, rec.duration));
      replay.lastT = T;
      viewT = g.over ? g.endT : T;
      if (g.over) el.over.innerHTML = `<h2>${CAUSES[g.cause]}</h2><div class="fh-over-score">${score(g)}</div><div class="caps-label">STEPS</div>`;
      el.over.hidden = !g.over;
      render();
      return g;
    }

    return {
      newGame, stop, handleKey, loadReplay, replayTo,
      relayout: () => { colors = themeColors(); crossSig = ""; render(); },
      isOver: () => !!live && live.state === "over",
    };
  };
})();
