// Ghost Race: a sprint in a stadium. Type a track (a fixed passage of words) to run it, against a
// ghost: a recording of a past run on the same track (your best, your last, or the best of anyone
// else on this computer) played back key for key, or a steady pace. Your sprinter (in your accent
// colour) runs lane 3; the ghost, a pale afterimage of a sprinter, runs lane 2, and its place in
// the passage shows as a faint mark in the words. Its art is its own: the sprinter's frames, the
// crowd, the track and the photo-finish camera are all drawn here.
//
// Typing follows the speed test's rules (TT.typingCore), with one change: Space only moves on
// once the word is right, so every finished word counts and the race can't be won by mashing.
// The last word finishes the race as soon as it's typed. Runs are recorded like speed tests
// (times from the first key, plus `lead`, how long after GO that key came), so they replay in the
// typing replay and can be raced as ghosts.
(() => {
  const C = TT.typingCore;
  const COUNT_MS = 900;   // each step of the start: on your marks, set, then the gun
  const START = [["ON YOUR MARKS", "marks"], ["SET", "set"], ["GO!", "gun"]];
  const FINISH_MS = 1300; // the finish plays this long before the results
  const PHOTO_MS = 50;    // closer than this is a photo finish
  const PACES = [30, 45, 60, 75, 90, 120]; // the steady-pace ghosts, in wpm

  // The events: a passage each, and how many metres it stands for (for the marks on the track).
  const TRACKS = [
    { id: "60m", name: "60 Metres", metres: 60, blurb: "Indoor sprint. Out of the blocks and done.",
      text: "on your marks the crowd goes quiet and then the gun sends everyone flying down the lane" },
    { id: "100m", name: "100 Metres", metres: 100, blurb: "The blue riband. Short words, top speed.",
      text: "the hundred is over in a blink so drive hard from the blocks keep your head down for the first few strides and then lift into full speed as the line comes up to meet you" },
    { id: "200m", name: "200 Metres", metres: 200, blurb: "Round the bend and hold your form down the straight.",
      text: "the two hundred starts on the bend where you lean into the curve and stay relaxed through the shoulders then you come off the turn into the straight with the whole stadium on its feet and the clock running just above the finish" },
    { id: "hurdles", name: "400m Hurdles", metres: 400, blurb: "Longer words to clear, one after another.",
      text: "the hurdles reward patience and rhythm because every barrier arrives exactly when your stride pattern expects it and the athletes who remain composed through the final hundred metres usually discover something extraordinary waiting beyond the last obstacle" },
    { id: "mile", name: "The Mile", metres: 1609, blurb: "Four laps. Pace it, then kick.",
      text: "the mile is four laps of patience and nerve so settle in behind the leaders on the first lap and let the pace come to you then hold your place through the second lap when the legs start to complain and the crowd goes quiet waiting for the move and on the third lap stay close and watch for gaps because the bell is coming and when it rings for the last lap the whole field wakes up and you have to find one more gear for the long sprint home" },
  ];
  const track = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];
  const wordsOf = (t) => t.text.split(" ");
  // a track's length: its letters and the spaces between its words
  const lengthOf = (ws) => ws.reduce((n, w) => n + w.length, 0) + ws.length - 1;

  // How far along the passage a typing core is, in characters: each finished word with its space,
  // plus the letters of the current word typed right so far.
  function along(c) {
    let n = 0;
    for (let i = 0; i < c.index && i < c.words.length; i++) n += c.words[i].length + 1;
    const w = c.words[c.index] || "", t = c.typed[c.index] || "";
    let k = 0;
    while (k < t.length && k < w.length && t[k] === w[k]) k++;
    return Math.min(n + k, lengthOf(c.words));
  }

  // A ghost: where it is (characters along) at a time in the race (ms from GO), and when it
  // reaches a point. From a recording, or at a steady pace.
  function ghostFrom(spec, words) {
    const total = lengthOf(words);
    if (spec.kind === "pace") {
      const rate = (spec.wpm * 5) / 60000; // characters a ms
      return { ...spec, total, finish: total / rate, at: (t) => Math.min(total, Math.max(0, t) * rate), reach: (p) => p / rate };
    }
    const rec = spec.rec, lead = rec.lead || 0;
    const c = C.newCore(rec.words.slice(), rec.mode, rec.amount);
    const ts = [0], ps = [0];
    for (let i = 0; i < rec.keys.length; i++) {
      C.applyKey(c, rec.keys[i]);
      ts.push(lead + rec.times[i]);
      ps.push(along(c));
    }
    const finish = lead + rec.duration;
    // the last point at or before t (a binary search)
    const idx = (t) => {
      let lo = 0, hi = ts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ts[mid] <= t) lo = mid; else hi = mid - 1;
      }
      return lo;
    };
    return {
      ...spec, total, finish,
      at: (t) => (t >= finish ? total : ps[idx(t)]),
      reach: (p) => {
        for (let i = 0; i < ps.length; i++) if (ps[i] >= p) return ts[i];
        return finish;
      },
    };
  }

  const fmt = (ms) => (ms / 1000).toFixed(1);
  const clock = (ms) => {
    const s = ms / 1000;
    return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}` : s.toFixed(1);
  };

  TT.ghostCore = { TRACKS, PACES, track, wordsOf, lengthOf, along, ghostFrom, clock, fmt, runnerSvg: (...a) => runnerSvg(...a) };

  // ---------- the scene: a stadium ----------

  const ease = (p) => 1 - (1 - p) * (1 - p);
  const hash = (a, b) => {
    let h = Math.imul(a * 374761393 + b * 668265263, 1274126177);
    h ^= h >>> 13;
    return ((h >>> 0) % 1000) / 1000;
  };

  // The sprinter, 12×14 pixels, facing right: standing, then a four-step running cycle (stride,
  // passing, the other stride, passing). h hair, s skin, k eye, a vest (your accent colour), w its
  // race number, b shorts, o shoes.
  const RUNNER = {
    stand: [
      "......hhh...", ".....hhhhh..", ".....hsssk..", ".....hssss..", "......ss....", "....aaaaa...", "...saawwas..",
      "...saawwas..", "....aaaaa...", "....bbbbb...", "....bb.bb...", "....ss.ss...", "....ss.ss...", "....oo.oo...",
    ],
    stride: [
      "......hhh...", ".....hhhhh..", ".....hsssk..", ".....hssss..", "......ss....", "....aaaaa...", "..saawwaaas.",
      ".s..awwaa..s", "....aaaaa...", "....bbbbb...", "...bb...bb..", "..ss.....ss.", ".ss.......s.", ".o........oo",
    ],
    pass: [
      "......hhh...", ".....hhhhh..", ".....hsssk..", ".....hssss..", "......ss....", "....aaaaa...", "....awwaas..",
      "....awwas...", "....aaaaa...", "....bbbbb...", ".....bbsss..", ".....ss..s..", ".....ss.....", ".....oo.....",
    ],
    stride2: [
      "......hhh...", ".....hhhhh..", ".....hsssk..", ".....hssss..", "......ss....", "....aaaaa...", "...saawwaas.",
      "..s.awwaa.s.", "....aaaaa...", "....bbbbb...", "...bb...bb..", "..ss.....ss.", ".ss.......s.", ".o........oo",
    ],
  };
  const CYCLE = ["stride", "pass", "stride2", "pass"];
  // the running frame at a time (85 ms a step; times before the start wrap round too)
  const cycleAt = (t) => CYCLE[((Math.floor(t / 85) % 4) + 4) % 4];
  const runnerPal = (accent) => ({ h: "#4E3A28", s: "#E0B48A", k: "#3F3C33", a: accent, w: "#F2EEE2", b: "#2F3A4A", o: "#F2EEE2" });
  // the ghost: the same sprinter, pale all over
  const GHOST_PAL = { h: "#DCE6EA", s: "#EEF3F5", k: "#9FB3BD", a: "#E4ECEF", w: "#C9D6DC", b: "#D3DEE3", o: "#F7FAFB" };
  // Each frame is drawn once, a pixel to a pixel, with a one-pixel outline round it (dark for you,
  // so your vest stands out on the red track whatever your accent; soft for the ghost).
  const sheets = new Map();
  function sheet(frame, pal, line) {
    const key = frame + JSON.stringify(pal) + line;
    if (sheets.has(key)) return sheets.get(key);
    const rows = RUNNER[frame];
    const c = document.createElement("canvas");
    c.width = rows[0].length + 2;
    c.height = rows.length + 2;
    const x = c.getContext("2d");
    const paint = (dx, dy, color) => rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === ".") return;
      x.fillStyle = color || pal[ch];
      x.fillRect(i + 1 + dx, j + 1 + dy, 1, 1);
    }));
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(dx, dy, line);
    paint(0, 0);
    sheets.set(key, c);
    return c;
  }
  // draws the sprinter with its feet at (cx, feet), h px tall
  function drawRunner(ctx, frame, pal, cx, feet, h, alpha = 1) {
    const sh = sheet(frame, pal, pal === GHOST_PAL ? "rgba(255,255,255,0.35)" : "#2a2823"), w = (h * sh.width) / sh.height;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sh, Math.round(cx - w / 2), Math.round(feet - h), Math.round(w), Math.round(h));
    ctx.restore();
  }
  // the sprinter as markup, for the track screen and the library
  function runnerSvg(size, accent = "var(--accent)", ghost = false) {
    const pal = ghost ? GHOST_PAL : runnerPal(accent);
    const line = ghost ? "rgba(255,255,255,0.35)" : "#2a2823";
    let outline = "", rects = "";
    RUNNER.stride.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === ".") return;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) outline += `<rect x="${x + 1 + dx}" y="${y + 1 + dy}" width="1.02" height="1.02" fill="${line}"/>`;
      rects += `<rect x="${x + 1}" y="${y + 1}" width="1.02" height="1.02" fill="${pal[ch]}"/>`;
    }));
    return `<svg viewBox="0 0 14 16" width="${Math.round((size * 14) / 16)}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="${ghost ? "ghost sprinter" : "sprinter"}">${outline}${rects}</svg>`;
  }

  const CROWD = ["#B4472B", "#2f6b72", "#D9B44A", "#74466f", "#4f6b2a", "#F2EEE2", "#3f5a8f", "#93640f"];
  const SKIN = ["#E0B48A", "#C99A6B", "#8E6544", "#F0CFA8"];

  // view: { w, h, t (race ms), total, metres, accent, night, me: { pos, moved, frameT }, ghost: { pos, label, moving },
  //         msg, finish (your time), won, flash (when the first runner crossed), cheer (when the crowd last roared), state }
  function drawRace(ctx, v) {
    const { w, h } = v;
    ctx.clearRect(0, 0, w, h);
    // the stands: a wall, then rows of the crowd, who bob and cheer
    const standH = Math.round(h * 0.3);
    ctx.fillStyle = "#8f8b7c";
    ctx.fillRect(0, 0, w, standH);
    const rowsN = 4, rowH = (standH - 12) / rowsN, px = Math.max(2, Math.round(rowH / 7));
    const cheer = Math.max(0, 1 - (v.t - v.cheer) / 1800);
    for (let r = 0; r < rowsN; r++) {
      const y0 = 4 + r * rowH;
      ctx.fillStyle = r % 2 ? "#9c9886" : "#a7a391";
      ctx.fillRect(0, y0 + rowH * 0.62, w, rowH * 0.38);
      for (let i = 0, x = (r % 2) * px * 2; x < w; i++, x += px * 4 + Math.round(hash(i, r) * px * 2)) {
        if (hash(i, r + 40) < 0.12) continue; // an empty seat
        const jump = (Math.sin(v.t / 140 + i * 1.7 + r) * 0.5 + 0.5) * (0.25 + cheer * 1.6) * px;
        const yy = y0 + rowH * 0.62 - px * 5 - jump;
        ctx.fillStyle = CROWD[Math.floor(hash(i, r + 7) * CROWD.length)];
        ctx.fillRect(x, yy + px * 2, px * 3, px * 3);
        ctx.fillStyle = SKIN[Math.floor(hash(i, r + 9) * SKIN.length)];
        ctx.fillRect(x + px * 0.5, yy, px * 2, px * 2);
        // arms up when they cheer
        if (cheer > 0.3 && hash(i, r + 11) < cheer) {
          ctx.fillRect(x - px * 0.5, yy - px, px, px * 2);
          ctx.fillRect(x + px * 3, yy - px, px, px * 2);
        }
      }
    }
    // the trackside wall, with a banner
    ctx.fillStyle = "#3F3C33";
    ctx.fillRect(0, standH - 8, w, 8);
    ctx.fillStyle = v.accent;
    ctx.fillRect(0, standH - 6, w, 3);

    // the track: four red lanes with white lines, and the infield below
    const infH = Math.round(h * 0.1);
    const trackTop = standH, trackH = h - standH - infH;
    const laneH = trackH / 4;
    ctx.fillStyle = "#B5523B";
    ctx.fillRect(0, trackTop, w, trackH);
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (let i = 0; i < 160; i++) ctx.fillRect(hash(i, 2) * w, trackTop + hash(i, 3) * trackH, 2, 2); // the rubber's grain
    ctx.fillStyle = "#F2EEE2";
    for (let k = 0; k <= 4; k++) ctx.fillRect(0, Math.round(trackTop + k * laneH) - 1, w, 2);
    ctx.fillStyle = "#6F8F4E";
    ctx.fillRect(0, h - infH, w, infH);
    ctx.fillStyle = "#4E6A36";
    for (let x = 0; x < w; x += 18) ctx.fillRect(x, h - infH + 4 + ((x / 18) % 2) * 6, 8, 2);

    const x0 = Math.round(w * 0.08), x1 = Math.round(w * 0.92);
    const X = (p) => x0 + ((x1 - x0) * p) / Math.max(1, v.total);
    // lane numbers and the start line
    ctx.font = `800 ${Math.max(10, Math.round(laneH * 0.42))}px Archivo, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = "rgba(242,238,226,0.85)";
      ctx.fillText(String(k + 1), x0 - laneH * 0.55, trackTop + (k + 0.5) * laneH);
    }
    ctx.fillStyle = "#F2EEE2";
    ctx.fillRect(x0 - 2, trackTop, 4, trackH);
    // distance marks, in metres
    ctx.font = `800 ${Math.max(9, Math.round(laneH * 0.26))}px Archivo, sans-serif`;
    for (const q of [0.25, 0.5, 0.75]) {
      const x = Math.round(x0 + (x1 - x0) * q);
      ctx.fillStyle = "rgba(242,238,226,0.35)";
      for (let y = trackTop; y < trackTop + trackH; y += 10) ctx.fillRect(x - 1, y, 2, 5);
      ctx.fillStyle = "#F2EEE2";
      ctx.fillText(`${Math.round(v.metres * q)}M`, x, h - infH / 2);
    }
    // the finish: a checked line, a post with the photo-finish camera
    const sq = Math.max(4, Math.round(laneH / 5));
    for (let y = trackTop, r = 0; y < trackTop + trackH; y += sq, r++) {
      for (let k = 0; k < 2; k++) {
        ctx.fillStyle = (r + k) % 2 ? "#3F3C33" : "#F2EEE2";
        ctx.fillRect(x1 + k * sq - sq, y, sq, Math.min(sq, trackTop + trackH - y));
      }
    }
    const camY = standH - laneH * 0.9;
    ctx.fillStyle = "#3F3C33";
    ctx.fillRect(x1 + sq + 4, camY, 4, trackTop + trackH * 0.15 - camY);
    ctx.fillRect(x1 + sq - 6, camY - laneH * 0.25, laneH * 0.55, laneH * 0.32);
    ctx.fillStyle = v.flash != null && v.t - v.flash < 200 ? "#fff" : "#9FB3BD";
    ctx.fillRect(x1 + sq - 10, camY - laneH * 0.15, 6, laneH * 0.12);

    // the runners: the ghost in lane 2, you in lane 3
    const lanes = [trackTop + laneH, trackTop + laneH * 2];
    const S = laneH * 1.25; // a runner's height
    const feet = (k) => lanes[k] + laneH * 0.88;
    // the finish tape across each runner's lane, broken once they're through
    const tape = (k, through, at) => {
      const top = lanes[k] + laneH * 0.15, bot = lanes[k] + laneH * 0.85;
      ctx.fillStyle = "#F2EEE2";
      if (!through) {
        ctx.fillRect(x1 - 1, top, 3, bot - top);
        ctx.fillStyle = v.accent;
        for (let y = top; y < bot; y += 8) ctx.fillRect(x1 - 1, y, 3, 4);
        return;
      }
      const a = Math.min(1, (v.t - at) / 300);
      ctx.save();
      ctx.translate(x1, top);
      ctx.rotate(-0.9 * a);
      ctx.fillRect(-1, 0, 3, (bot - top) * 0.45);
      ctx.restore();
      ctx.save();
      ctx.translate(x1, bot);
      ctx.rotate(0.9 * a);
      ctx.fillRect(-1, -(bot - top) * 0.45, 3, (bot - top) * 0.45);
      ctx.restore();
    };
    const gThrough = v.ghost.pos >= v.total, mThrough = v.finish != null;
    tape(0, gThrough, v.ghost.finishAt);
    tape(1, mThrough, v.finish);

    // the ghost: a pale afterimage of a sprinter, with a trail while it runs
    const gx = X(v.ghost.pos);
    const gFrame = v.ghost.moving ? cycleAt(v.t) : "stand";
    if (v.ghost.moving) {
      for (let k = 3; k >= 1; k--) drawRunner(ctx, cycleAt(v.t - k * 85), GHOST_PAL, gx - k * S * 0.22, feet(0), S, 0.1 * (4 - k));
    }
    drawRunner(ctx, gFrame, GHOST_PAL, gx, feet(0), S, 0.6);

    // you: running while you type, standing when you stop
    const mx = X(v.me.pos);
    const since = v.t - v.me.moved;
    const running = v.state !== "count" && since >= 0 && since < 350 && !mThrough;
    const mFrame = running ? cycleAt(v.t) : "stand";
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(mx, feet(1), S * 0.22, S * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    drawRunner(ctx, mFrame, runnerPal(v.accent), mx, feet(1), S);

    // a lead change, called like a commentator
    if (v.msg && v.t - v.msg.t < 1100) {
      const a = 1 - Math.max(0, (v.t - v.msg.t - 700) / 400);
      ctx.globalAlpha = a;
      const fs = Math.max(14, Math.round(standH * 0.2));
      ctx.font = `800 ${fs}px Archivo, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(v.msg.text).width;
      ctx.fillStyle = "#3F3C33";
      ctx.fillRect(w / 2 - tw / 2 - 14, standH * 0.5 - fs * 0.8, tw + 28, fs * 1.6);
      ctx.fillStyle = "#F2EEE2";
      ctx.fillText(v.msg.text, w / 2, standH * 0.5 + 1);
      ctx.globalAlpha = 1;
    }
    // the photo-finish camera's flash, the moment the first runner crosses
    if (v.flash != null && v.t - v.flash < 260) {
      ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - (v.t - v.flash) / 260)})`;
      ctx.fillRect(0, 0, w, h);
    }
    // a win: streamers from the stands
    if (v.finish != null && v.won) {
      const age = v.t - v.finish;
      const colors = [v.accent, "#F2EEE2", "#D9B44A", "#2f6b72", "#6F8F4E"];
      for (let i = 0; i < 60; i++) {
        const x = hash(i, 21) * w + Math.sin(age / 200 + i) * 12;
        const y = -20 + ((age * (0.25 + hash(i, 22) * 0.35) + hash(i, 23) * h * 0.4) % (h + 40));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(age / (150 + i * 7));
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(-4, -2, 8, 4);
        ctx.restore();
      }
    }
    if (v.night) {
      ctx.fillStyle = "rgba(20,19,16,0.3)";
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ---------- the race ----------

  const TEMPLATE = `
    <div class="gr">
      <div class="gr-stage">
        <canvas class="gr-canvas" role="img" aria-label="Ghost Race track"></canvas>
        <div class="fh-hud fh-hud-l gr-hud-l">
          <div class="fh-score"><span data-g="time">0.0</span><span class="caps-label">SECONDS</span></div>
          <div class="caps-label" data-g="wpm">— WPM</div>
        </div>
        <div class="fh-hud fh-hud-r">
          <div class="fh-chip gr-gap" data-g="gap"></div>
          <div class="fh-chip" data-g="vs"></div>
        </div>
        <div class="gr-count" data-g="count" hidden></div>
        <div class="fh-over" data-g="over" hidden></div>
      </div>
      <div class="gr-text"><div class="words-box gr-box" data-g="box"><div class="words" data-g="words"></div></div></div>
      <p class="visually-hidden" data-g="sr" aria-live="polite"></p>
    </div>`;

  TT.createGhostRace = ({ root, onStart, onEnd }) => {
    root.innerHTML = TEMPLATE;
    const el = Object.fromEntries([...root.querySelectorAll("[data-g]")].map((x) => [x.dataset.g, x]));
    const canvas = root.querySelector(".gr-canvas");
    const ctx = canvas.getContext("2d");
    const snd = {
      music: () => TT.forestSound && TT.forestSound.startMusic("stadium", "grMusic"),
      stop: (fade) => TT.forestSound && TT.forestSound.stopMusic(fade),
      play: (name) => TT.forestSound && TT.forestSound.play(name, "grSfx"),
    };
    let live = null; // { state, track, words, c, ghost, goAt, keys, times, first, finishT, ... }
    let raf = 0;
    let wordEls = [], caret = null, ghostMark = null, lineStep = 0;
    let hudSig = "";

    new ResizeObserver(() => { relayout(); draw(); }).observe(root.querySelector(".gr-stage"));

    const now = () => performance.now();
    const raceT = () => {
      if (!live || live.goAt == null) return 0;
      if (live.state === "paused") return live.pausedAt - live.goAt;
      if (live.finishT != null) return live.finishT + (now() - live.finishedAt);
      return now() - live.goAt;
    };

    // ---------- the words ----------

    function renderWord(i) {
      const e = wordEls[i];
      if (!e) return;
      const w = live.c.words[i], t = live.c.typed[i];
      let html = "";
      for (let j = 0; j < Math.max(w.length, t.length); j++) {
        let cls = "", ch = w[j];
        if (j < t.length) {
          if (j < w.length) cls = t[j] === w[j] ? "correct" : "incorrect";
          else { cls = "extra"; ch = t[j]; }
        }
        html += `<span class="${cls}">${ch}</span>`;
      }
      e.innerHTML = html;
    }
    function renderWords() {
      el.words.innerHTML = "";
      wordEls = live.c.words.map((_, i) => {
        const e = document.createElement("div");
        e.className = "word";
        el.words.appendChild(e);
        return e;
      });
      ghostMark = document.createElement("div");
      ghostMark.className = "gr-ghost-mark";
      el.words.appendChild(ghostMark);
      caret = document.createElement("div");
      caret.className = "caret";
      el.words.appendChild(caret);
      wordEls.forEach((_, i) => renderWord(i));
      relayout();
    }
    function relayout() {
      if (!live || !wordEls.length) return;
      const first = wordEls[0], cs = getComputedStyle(first);
      lineStep = first.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
      el.box.style.height = `${lineStep * 3}px`;
      place();
    }
    // the letter element at (word, letter), and whether the spot is just past it
    const letterAt = (i, n) => {
      const e = wordEls[Math.min(i, wordEls.length - 1)];
      if (!e || !e.children.length) return null;
      const atEnd = n >= e.children.length || i >= wordEls.length;
      return { l: e.children[atEnd ? e.children.length - 1 : n], atEnd };
    };
    // your caret, and the ghost's mark where it has got to in the passage
    function place() {
      if (!live || !caret) return;
      const c = live.c;
      const me = letterAt(c.index, (c.typed[c.index] || "").length);
      if (me) {
        const { l, atEnd } = me;
        const x = l.offsetLeft + (atEnd ? l.offsetWidth : 0);
        const style = TT.store.settings.caret;
        caret.className = `caret caret-${style}`;
        if (style === "line") {
          caret.style.width = "3px";
          caret.style.height = `${l.offsetHeight}px`;
          caret.style.transform = `translate(${x - 1.5}px, ${l.offsetTop}px)`;
        } else {
          const hh = style === "block" ? l.offsetHeight : 3;
          caret.style.width = `${l.offsetWidth}px`;
          caret.style.height = `${hh}px`;
          caret.style.transform = `translate(${x}px, ${l.offsetTop + l.offsetHeight - hh}px)`;
        }
        // keep your line second once you're past the first
        const cur = wordEls[Math.min(c.index, wordEls.length - 1)];
        const shift = Math.max(0, cur.offsetTop - wordEls[0].offsetTop - lineStep);
        el.words.style.transform = `translateY(${-shift}px)`;
      }
      // the ghost's spot: its characters along, as a word and letter
      let p = Math.floor(live.ghost.at(raceT())), i = 0;
      while (i < live.c.words.length - 1 && p > live.c.words[i].length) { p -= live.c.words[i].length + 1; i++; }
      const gh = letterAt(i, Math.max(0, p));
      ghostMark.hidden = !gh || live.ghost.at(raceT()) <= 0;
      if (gh) {
        const x = gh.l.offsetLeft + (gh.atEnd ? gh.l.offsetWidth : 0);
        ghostMark.style.height = `${gh.l.offsetHeight}px`;
        ghostMark.style.transform = `translate(${x - 2}px, ${gh.l.offsetTop}px)`;
      }
    }

    // ---------- drawing ----------

    function draw() {
      if (!live) return;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = raceT();
      const gp = live.ghost.at(t);
      // the photo-finish camera flashes as the first runner crosses
      const first = Math.min(live.ghost.finish, live.finishT ?? Infinity);
      if (live.goAt != null && t >= first && !live.flashed) {
        live.flashed = true;
        snd.play("shutter");
      }
      drawRace(ctx, {
        w, h, t, total: live.total, metres: live.track.metres, state: live.state,
        accent: getComputedStyle(root).getPropertyValue("--accent").trim() || "#B4472B",
        night: document.documentElement.dataset.theme === "night",
        me: { pos: along(live.c), moved: live.movedAt },
        ghost: { pos: gp, label: live.ghost.label, moving: (live.state === "running" || live.state === "finishing") && gp < live.total && t > 0, finishAt: live.ghost.finish },
        msg: live.msg, finish: live.finishT, won: live.won, cheer: live.cheerAt,
        flash: live.goAt != null && t >= first ? first : null,
      });
    }

    function renderHud() {
      // the clock stops as you finish (the ghost runs on, if it's still going)
      const t = live.finishT ?? raceT();
      const me = along(live.c);
      const st = live.goAt != null && t > 500 ? C.computeStats(live.c, Math.max(1, t)) : null;
      // how far ahead (+) or behind (−): when the ghost reached (or will reach) where you are
      let gap = null;
      if (me > 0 && live.state !== "ready" && live.state !== "count") gap = live.ghost.reach(me) - t;
      if (live.finishT != null) gap = live.ghost.finish - live.finishT;
      const sig = [Math.floor(t / 100), st && Math.round(st.wpm), gap == null ? "" : Math.round(gap / 100)].join("|");
      if (sig === hudSig) return;
      hudSig = sig;
      el.time.textContent = clock(Math.max(0, t));
      el.wpm.textContent = st ? `${Math.round(st.wpm)} WPM` : "— WPM";
      const g = runnerSvg(24, "", true);
      if (gap == null) el.gap.innerHTML = `${g}<span>EVEN</span>`;
      else el.gap.innerHTML = `${g}<span class="${gap >= 0 ? "ahead" : "behind"}">${gap >= 0 ? "+" : "−"}${fmt(Math.abs(gap))}s ${gap >= 0 ? "AHEAD" : "BEHIND"}</span>`;
      el.vs.textContent = `${live.ghost.label.toUpperCase()} · ${clock(live.ghost.finish)}s`;
    }

    function frame() {
      if (!live || live.state === "paused" || live.state === "stopped" || live.state === "over") return;
      const t = raceT();
      if (live.state === "count") {
        const k = Math.min(2, Math.floor((now() - live.countAt) / COUNT_MS));
        if (k !== live.countStep) {
          live.countStep = k;
          const [text, sound] = START[k];
          el.count.textContent = text;
          el.count.classList.toggle("long", text.length > 4);
          snd.play(sound);
          if (k === 2) {
            // the gun: the race is on
            live.state = "running";
            live.goAt = now();
            live.cheerAt = 0;
            snd.music();
            onStart && onStart();
          }
          el.count.hidden = false;
          el.count.classList.remove("pop");
          void el.count.offsetWidth; // restart the pop
          el.count.classList.add("pop");
        }
      } else if (live.state === "running" && live.countStep === 2 && now() - live.goAt > 600) {
        el.count.hidden = true;
        live.countStep = 3;
      }
      // passing, or being passed
      if (live.state === "running") {
        const me = along(live.c);
        if (me > 0) {
          const gap = live.ghost.reach(me) - t;
          const side = gap > 150 ? 1 : gap < -150 ? -1 : live.side;
          if (side !== live.side && live.side !== 0 && t - (live.msg ? live.msg.t : -1e9) > 700) {
            live.msg = { t, text: side > 0 ? "YOU TAKE THE LEAD!" : "THE GHOST HITS THE FRONT" };
            live.cheerAt = t;
            snd.play(side > 0 ? "pass" : "passed");
          }
          live.side = side;
        }
      }
      if (live.state === "finishing" && now() - live.finishedAt >= FINISH_MS) return showResults();
      draw();
      renderHud();
      place();
      raf = requestAnimationFrame(frame);
    }

    // ---------- playing ----------

    // spec: { kind: "run", rec, label } or { kind: "pace", wpm, label }
    function newRace(trackId, spec) {
      cancelAnimationFrame(raf);
      const tr = track(trackId);
      const words = wordsOf(tr);
      live = {
        state: "count", track: tr, words, total: lengthOf(words), c: C.newCore(words.slice(), "words", words.length),
        ghost: ghostFrom(spec, words), spec,
        countAt: now(), countStep: -1, goAt: null, first: null, keys: "", times: [], spaceErrors: 0,
        movedAt: -1e9, side: 0, msg: null, finishT: null, won: false, cheerAt: -1e9, flashed: false,
      };
      hudSig = "";
      el.over.hidden = true;
      el.count.hidden = true;
      el.count.classList.remove("pop");
      renderWords();
      draw();
      renderHud();
      raf = requestAnimationFrame(frame);
    }

    function handleKey(e) {
      if (!live || live.state !== "running") return;
      let k;
      if (e.key === "Backspace") k = e.ctrlKey || e.altKey ? C.BACK_WORD : C.BACK;
      else if (e.ctrlKey || e.altKey || e.metaKey) return;
      else if (e.key === " ") k = " ";
      else if (/^[a-zA-Z]$/.test(e.key)) k = e.key; // a capital counts as a mistake, like the test
      else return;
      e.preventDefault();
      const c = live.c, t = Math.round(raceT());
      if (live.first == null) {
        if (k.length !== 1 || k === " ") return; // the first key is a letter
        live.first = t;
      }
      // Space moves on only once the word is right
      if (k === " " && c.typed[c.index] !== c.words[c.index]) {
        if (c.typed[c.index]) {
          live.spaceErrors++;
          snd.play("wrong");
          el.box.classList.remove("shake");
          void el.box.offsetWidth;
          el.box.classList.add("shake");
        }
        return;
      }
      const before = along(c);
      apply(k, t);
      // the last word finishes the race as soon as it's right
      if (c.index === c.words.length - 1 && c.typed[c.index] === c.words[c.index]) apply(" ", t);
      if (along(c) > before) live.movedAt = t;
      if (c.finished) finish(t);
      el.sr.textContent = c.finished ? "" : `Next: ${c.words[c.index]}`;
    }

    function apply(k, t) {
      const c = live.c;
      live.keys += k;
      live.times.push(t - live.first);
      const d = C.applyKey(c, k);
      if (!d) return;
      if (d.type === "letter" && !d.correct) snd.play("wrong");
      renderWord(d.word);
      if (d.type === "back" && d.crossed) renderWord(d.word + 1);
      place();
    }

    function finish(t) {
      live.state = "finishing";
      live.finishT = t;
      live.finishedAt = now();
      live.won = t <= live.ghost.finish;
      live.cheerAt = t;
      snd.stop(0.3);
      snd.play(live.won ? "win" : "lose");
      if (live.won) snd.play("cheer");
      save();
    }

    // The run is saved as it finishes; the results come up once the finish has played.
    function save() {
      const L = live, c = L.c, t = L.finishT;
      const st = C.computeStats(c, t);
      const round = (x) => Math.round(x * 100) / 100;
      const date = new Date().toISOString();
      const id = TT.newRoundId();
      const d = (TT.store.games.ghost ||= { best: 0, plays: 0, bestBy: {}, lastBy: {}, history: [] });
      d.bestBy ||= {};
      d.lastBy ||= {};
      d.history ||= [];
      const prev = d.bestBy[L.track.id];
      const run = { time: t, wpm: round(st.wpm), acc: round(st.acc), id, date };
      L.prevBest = prev;
      L.newBest = !prev || t < prev.time;
      if (L.newBest) d.bestBy[L.track.id] = run;
      d.lastBy[L.track.id] = run;
      d.plays++;
      d.best = Math.max(d.best || 0, Math.round(st.wpm));
      d.history.push({ date, track: L.track.id, time: t, wpm: run.wpm, acc: run.acc, won: L.won, vs: L.ghost.label });
      if (d.history.length > 200) d.history.splice(0, d.history.length - 200);
      L.stats = st;
      L.id = id;

      const store = TT.store;
      const keyStats = Object.fromEntries(Object.entries(c.keyStats).map(([k, v]) => [k, [v.expected, v.missed]]));
      const missedWords = [...new Set([...c.mistakes].map((i) => c.words[i]))];
      store.history.push({
        id, date, kind: "game", game: "ghost", mode: L.track.id, title: L.track.name, amount: c.words.length,
        wpm: round(st.wpm), raw: round(st.raw), acc: round(st.acc), seconds: round(t / 1000), keys: keyStats, missedWords,
      });
      for (const [letter, v] of Object.entries(c.keyStats)) {
        const total = (store.keyStats[letter] ||= { expected: 0, missed: 0 });
        total.expected += v.expected;
        total.missed += v.missed;
      }
      for (const w of missedWords) store.weakWords[w] = (store.weakWords[w] || 0) + 1;
      TT.save();
      TT.rounds.save({
        id, date, kind: "game", game: "ghost", track: L.track.id, title: L.track.name,
        mode: "words", amount: c.words.length, words: c.words.slice(), keys: L.keys, times: L.times,
        lead: L.first || 0, duration: Math.max(1, t - (L.first || 0)),
        vs: { kind: L.spec.kind, label: L.ghost.label, time: Math.round(L.ghost.finish) },
      });
    }

    function showResults() {
      const L = live;
      L.state = "over";
      cancelAnimationFrame(raf);
      draw();
      renderHud();
      const diff = L.ghost.finish - L.finishT;
      const photo = Math.abs(diff) < PHOTO_MS;
      const head = photo ? "PHOTO FINISH!" : L.won ? "YOU WIN!" : "THE GHOST WINS";
      const by = photo ? `${L.won ? "You" : "The ghost"} took it by ${Math.max(1, Math.round(Math.abs(diff)))} ms.` : L.won ? `You beat ${L.ghost.label.toLowerCase()} by ${fmt(diff)}s.` : `${L.ghost.label} finished ${fmt(-diff)}s ahead.`;
      const best = L.newBest
        ? L.prevBest ? `<strong class="hl">New best!</strong> ${fmt(L.prevBest.time - L.finishT)}s faster than before. It's the ghost to beat now.` : `<strong class="hl">First run on this track.</strong> It's your ghost now.`
        : `Your best here is ${clock(L.prevBest.time)}s.`;
      el.over.innerHTML = `
        <h2>${head}</h2>
        <div class="fh-over-score">${clock(L.finishT)}</div>
        <div class="caps-label">SECONDS · ${Math.round(L.stats.wpm)} WPM · ${Math.round(L.stats.acc)}% ACCURACY</div>
        <p>${by} ${best}</p>
        <div class="hints">
          <button data-act="gr:play"><kbd>TAB</kbd>RACE AGAIN</button>
          <button data-act="replay:${L.id}"><kbd>R</kbd>REPLAY</button>
          <button data-act="gr:select"><kbd>ESC</kbd>TRACKS</button>
        </div>`;
      el.over.hidden = false;
      onEnd && onEnd(L.id);
    }

    function stop() {
      cancelAnimationFrame(raf);
      if (live && live.state !== "over") {
        if (live.state === "finishing") showResults();
        else live.state = "stopped";
        snd.stop(0.3);
      }
    }

    function pause() {
      if (!live || live.state !== "running") return;
      live.state = "paused";
      live.pausedAt = now();
      cancelAnimationFrame(raf);
      snd.stop(0.2);
      el.over.innerHTML = TT.pausedHtml("gr:play", "gr:select", "TRACKS");
      el.over.hidden = false;
    }

    function resume() {
      if (!live || live.state !== "paused") return;
      live.goAt += now() - live.pausedAt;
      live.state = "running";
      el.over.hidden = true;
      snd.music();
      raf = requestAnimationFrame(frame);
    }

    return {
      newRace, stop, handleKey, pause, resume, relayout,
      isRunning: () => !!live && live.state === "running",
      isPaused: () => !!live && live.state === "paused",
      isOver: () => !!live && live.state === "over",
    };
  };
})();
