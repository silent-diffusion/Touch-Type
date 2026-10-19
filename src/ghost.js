// Ghost Race: type a track (a fixed passage of words) to run it, against a ghost. The ghost is a
// recording of a past run on the same track (your best, your last, or the best of anyone else on
// this computer) played back key for key, or a steady pace. Your animal from Forest Hop runs the
// bottom lane; the ghost floats along the top one, and its place in the passage shows as a faint
// marker in the words.
//
// Typing follows the speed test's rules (TT.typingCore), with one change: Space only moves on
// once the word is right, so every finished word counts and the race can't be won by mashing.
// The last word finishes the race as soon as it's typed. Runs are recorded like speed tests
// (times from the first key, plus `lead`, how long after GO that key came), so they replay in the
// typing replay and can be raced as ghosts.
(() => {
  const C = TT.typingCore;
  const COUNT_MS = 700;   // each step of the countdown: 3, 2, 1, then GO
  const FINISH_MS = 1300; // the finish plays this long before the results
  const PHOTO_MS = 50;    // closer than this is a photo finish
  const PACES = [30, 45, 60, 75, 90, 120]; // the steady-pace ghosts, in wpm

  const TRACKS = [
    { id: "sprint", name: "Sprint", blurb: "A quick dash down to the river.",
      text: "the quick fox ran up the hill and down to the river to drink" },
    { id: "meadow", name: "Meadow Dash", blurb: "Short words, warm sun, no excuses.",
      text: "a little frog sat on a lily pad in the warm sun and watched the dragonflies dance over the water until the wind carried them away into the tall grass" },
    { id: "creek", name: "Creekside", blurb: "Along the water, past the old mill.",
      text: "the creek runs cold and clear past the old mill where the moss grows thick on every stone and the trout wait in the shadows for something to fall from the branches while a heron stands perfectly still" },
    { id: "summit", name: "Summit Climb", blurb: "Fewer words, longer ones, all uphill.",
      text: "climbing toward the summit the travelers followed a narrow path between enormous boulders and twisted pines until the morning clouds finally opened and revealed the whole valley shining beneath them like an emerald blanket" },
    { id: "long", name: "The Long Way Round", blurb: "The whole forest, edge to edge. Pace yourself.",
      text: "the long way round begins at the edge of the meadow where the deer graze in the early light and the path is soft with clover then it bends into the pines and climbs over roots and stones toward the ridge where the wind is cold and the view goes on forever before dropping down through the ferns to the creek where you can hear the water long before you see it and finally it follows the bank all the way home as the evening settles over the trees" },
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

  TT.ghostCore = { TRACKS, PACES, track, wordsOf, lengthOf, along, ghostFrom, clock, fmt };

  // ---------- the scene ----------

  const ease = (p) => 1 - (1 - p) * (1 - p);
  const hash = (a, b) => {
    let h = Math.imul(a * 374761393 + b * 668265263, 1274126177);
    h ^= h >>> 13;
    return ((h >>> 0) % 1000) / 1000;
  };

  // view: { w, h, t (race ms), me: { pos, moved, animal }, ghost: { pos, label }, total, msg, finish, won, night }
  function drawRace(ctx, v) {
    const { w, h } = v;
    ctx.clearRect(0, 0, w, h);
    const skyH = Math.round(h * 0.3);
    // sky and the far tree line
    ctx.fillStyle = "#cfd2b5";
    ctx.fillRect(0, 0, w, skyH);
    const P = Math.max(18, Math.round(skyH * 0.5));
    for (let i = 0, x = -P / 2; x < w; i++) {
      TT.sprites.draw(ctx, "pine", x, skyH - P * 0.92, P);
      x += P * (0.55 + hash(i, 3) * 0.6);
    }
    // the meadow and two lanes: the ghost's on top, yours below
    ctx.fillStyle = "#B7BC95";
    ctx.fillRect(0, skyH, w, h - skyH);
    const field = h - skyH;
    const laneH = Math.round(field * 0.3);
    const lanes = [skyH + Math.round(field * 0.12), skyH + Math.round(field * 0.12) + laneH + Math.round(field * 0.16)];
    const x0 = Math.round(w * 0.07), x1 = Math.round(w * 0.93);
    const X = (p) => x0 + ((x1 - x0) * p) / Math.max(1, v.total);
    for (const y of lanes) {
      ctx.fillStyle = "#C4AF88";
      ctx.fillRect(0, y, w, laneH);
      ctx.fillStyle = "rgba(63,60,51,0.18)";
      for (let x = 0; x < w; x += 26) ctx.fillRect(x, y + laneH / 2 - 2, 10, 4);
      ctx.fillStyle = "rgba(63,60,51,0.35)";
      ctx.fillRect(0, y, w, 3);
      ctx.fillRect(0, y + laneH - 3, w, 3);
    }
    // grass tufts
    ctx.fillStyle = "rgba(78,106,54,0.45)";
    for (let i = 0; i < 40; i++) {
      const x = hash(i, 9) * w, y = skyH + hash(i, 11) * field;
      if (lanes.some((ly) => y > ly - 6 && y < ly + laneH + 4)) continue;
      ctx.fillRect(x, y, 3, 7);
      ctx.fillRect(x + 4, y + 2, 3, 5);
    }
    // the start, the quarter marks and the finish
    ctx.fillStyle = "#F2EEE2";
    ctx.fillRect(x0 - 2, lanes[0] - 4, 5, lanes[1] + laneH - lanes[0] + 8);
    ctx.font = `800 ${Math.max(10, Math.round(laneH * 0.22))}px Archivo, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (const q of [0.25, 0.5, 0.75]) {
      const x = Math.round(x0 + (x1 - x0) * q);
      ctx.fillStyle = "rgba(63,60,51,0.3)";
      ctx.fillRect(x - 1, lanes[0], 2, lanes[1] + laneH - lanes[0]);
      ctx.fillStyle = "#3F3C33";
      ctx.fillText(`${q * 100}%`, x, lanes[0] - 4);
    }
    const sq = Math.max(6, Math.round(laneH / 6));
    for (let y = lanes[0] - 4, r = 0; y < lanes[1] + laneH + 4; y += sq, r++) {
      for (let k = 0; k < 2; k++) {
        ctx.fillStyle = (r + k) % 2 ? "#3F3C33" : "#F2EEE2";
        ctx.fillRect(x1 + k * sq - sq, y, sq, sq);
      }
    }
    // the flag over the finish, waving back toward the track
    const poleTop = lanes[0] - laneH * 0.9;
    ctx.fillStyle = "#3F3C33";
    ctx.fillRect(x1 - 2, poleTop, 4, lanes[0] - poleTop);
    ctx.beginPath();
    const wave = Math.sin(v.t / 180) * laneH * 0.06;
    ctx.moveTo(x1 - 2, poleTop);
    ctx.quadraticCurveTo(x1 - laneH * 0.35, poleTop + wave, x1 - laneH * 0.7, poleTop + laneH * 0.08);
    ctx.lineTo(x1 - laneH * 0.7, poleTop + laneH * 0.36);
    ctx.quadraticCurveTo(x1 - laneH * 0.35, poleTop + laneH * 0.3 - wave, x1 - 2, poleTop + laneH * 0.32);
    ctx.closePath();
    ctx.fillStyle = v.accent;
    ctx.fill();

    // who's in which lane
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.max(10, Math.round(laneH * 0.2))}px Archivo, sans-serif`;
    ctx.fillStyle = "rgba(63,60,51,0.75)";
    ctx.fillText(v.ghost.label.toUpperCase(), 8, lanes[0] + laneH / 2);
    ctx.fillText("YOU", 8, lanes[1] + laneH / 2);

    // the ghost: floating, with a fading trail while it moves
    const S = Math.round(laneH * 0.92);
    const gx = X(v.ghost.pos), gy = lanes[0] + laneH / 2 - S / 2 + Math.sin(v.t / 260) * S * 0.07;
    if (v.ghost.moving) {
      for (let k = 3; k >= 1; k--) {
        ctx.globalAlpha = 0.12 * (4 - k) / 3;
        TT.sprites.draw(ctx, "ghost", gx - S / 2 - k * S * 0.28, gy + Math.sin((v.t - k * 90) / 260) * S * 0.07, S);
      }
    }
    ctx.globalAlpha = 0.72;
    TT.sprites.draw(ctx, "ghost", gx - S / 2, gy, S);
    ctx.globalAlpha = 1;

    // you: a hop with every bit of progress, and dust behind
    const mx = X(v.me.pos);
    const since = v.t - v.me.moved;
    const hop = since >= 0 && since < 260 ? Math.sin((Math.PI * since) / 260) * S * 0.22 : 0;
    const my = lanes[1] + laneH / 2 - S / 2;
    ctx.fillStyle = "rgba(63,60,51,0.28)";
    ctx.beginPath();
    ctx.ellipse(mx, lanes[1] + laneH / 2 + S * 0.42, S * 0.32, S * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    if (since >= 0 && since < 400) {
      for (let k = 0; k < 3; k++) {
        const a = since / 400;
        ctx.fillStyle = `rgba(150,124,88,${0.45 * (1 - a)})`;
        ctx.beginPath();
        ctx.arc(mx - S * (0.45 + k * 0.18 + a * 0.3), lanes[1] + laneH / 2 + S * 0.35 - k * 3, S * (0.08 + a * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    TT.sprites.draw(ctx, v.me.animal, mx - S / 2, my - hop, S);

    // a passing message, fading
    if (v.msg && v.t - v.msg.t < 1100) {
      const a = 1 - Math.max(0, (v.t - v.msg.t - 700) / 400);
      ctx.globalAlpha = a;
      ctx.font = `800 ${Math.max(14, Math.round(skyH * 0.22))}px Archivo, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#3F3C33";
      ctx.fillText(v.msg.text, w / 2, skyH * 0.32);
      ctx.globalAlpha = 1;
    }

    // a win: confetti
    if (v.finish && v.won) {
      const age = v.t - v.finish;
      const colors = [v.accent, "#6F8F4E", "#D9B44A", "#F2EEE2", "#2f6b72"];
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
      ctx.fillStyle = "rgba(20,19,16,0.35)";
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
      music: () => TT.forestSound && TT.forestSound.startMusic("race", "grMusic"),
      stop: (fade) => TT.forestSound && TT.forestSound.stopMusic(fade),
      play: (name) => TT.forestSound && TT.forestSound.play(name, "grSfx"),
    };
    let live = null; // { state, track, words, c, ghost, animal, goAt, keys, times, first, finishT, ... }
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
      drawRace(ctx, {
        w, h, t, total: live.total,
        accent: getComputedStyle(root).getPropertyValue("--accent").trim() || "#B4472B",
        night: document.documentElement.dataset.theme === "night",
        me: { pos: along(live.c), moved: live.movedAt, animal: live.animal },
        ghost: { pos: gp, label: live.ghost.label, moving: live.state === "running" && gp < live.total && t > 0 },
        msg: live.msg, finish: live.finishT, won: live.won,
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
      const g = TT.sprites.svg("ghost", 24);
      if (gap == null) el.gap.innerHTML = `${g}<span>EVEN</span>`;
      else el.gap.innerHTML = `${g}<span class="${gap >= 0 ? "ahead" : "behind"}">${gap >= 0 ? "+" : "−"}${fmt(Math.abs(gap))}s ${gap >= 0 ? "AHEAD" : "BEHIND"}</span>`;
      el.vs.textContent = `${live.ghost.label.toUpperCase()} · ${clock(live.ghost.finish)}s`;
    }

    function frame() {
      if (!live || live.state === "paused" || live.state === "stopped" || live.state === "over") return;
      const t = raceT();
      if (live.state === "count") {
        const k = Math.floor((now() - live.countAt) / COUNT_MS);
        if (k !== live.countStep) {
          live.countStep = k;
          if (k < 3) {
            el.count.textContent = String(3 - k);
            snd.play("count");
          } else {
            el.count.textContent = "GO!";
            snd.play("go");
            live.state = "running";
            live.goAt = now();
            snd.music();
            onStart && onStart();
          }
          el.count.hidden = false;
          el.count.classList.remove("pop");
          void el.count.offsetWidth; // restart the pop
          el.count.classList.add("pop");
        }
      } else if (live.state === "running" && live.countStep === 3 && now() - live.goAt > 600) {
        el.count.hidden = true;
        live.countStep = 4;
      }
      // passing, or being passed
      if (live.state === "running") {
        const me = along(live.c);
        if (me > 0) {
          const gap = live.ghost.reach(me) - t;
          const side = gap > 150 ? 1 : gap < -150 ? -1 : live.side;
          if (side !== live.side && live.side !== 0 && t - (live.msg ? live.msg.t : -1e9) > 700) {
            live.msg = { t, text: side > 0 ? "YOU TOOK THE LEAD!" : "THE GHOST PULLS AHEAD" };
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
    function newRace(trackId, spec, animal) {
      cancelAnimationFrame(raf);
      const tr = track(trackId);
      const words = wordsOf(tr);
      live = {
        state: "count", track: tr, words, total: lengthOf(words), c: C.newCore(words.slice(), "words", words.length),
        ghost: ghostFrom(spec, words), spec, animal: animal || "frog",
        countAt: now(), countStep: -1, goAt: null, first: null, keys: "", times: [], spaceErrors: 0,
        movedAt: -1e9, side: 0, msg: null, finishT: null, won: false,
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
      snd.stop(0.3);
      snd.play(live.won ? "win" : "lose");
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
