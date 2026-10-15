// Path Runner: three paths ahead, each labeled with a word. Type a word to step onto it.
// A clock drains constantly; each step adds time back, less as you go further.
// Every run is recorded (key presses, times and the rows that appeared) so it can be replayed.
(() => {
  const A = TT.analysis;
  const W = TT.wordInput;
  const RULES = 2;        // v2: wrong letters are typed and must be backspaced (v1 recordings have no v)
  const START_TIME = 8;   // seconds on the clock at the start
  const MAX_TIME = 10;
  const BONUS = 2;        // extra seconds for a bonus path
  const PENALTY = 0.5;    // seconds lost per wrong key
  const HISTORY_CAP = 200;
  const BACK = "<", BACK_WORD = "{";

  // Time gained for a step: longer words give more, and it shrinks as you go further.
  const gain = (word, n) => (0.6 + word.length * 0.3) * Math.max(0.55, 1 - n * 0.012);

  // ---------- core: pure game rules, shared by live play, replays and analysis ----------
  // The clock is kept as a "bank": time left at moment t (ms) is bank - t/1000. That makes it
  // exact no matter how often the screen updates, so replays end at the same moment.

  function newCore(rows, v = RULES) {
    return {
      v, n: 0, lane: 1, rows, buf: "", bad: -1,
      bank: START_TIME, over: false, endT: null,
      keys: 0, correct: 0, mistakes: 0, chars: 0,
      keyStats: {}, missedWords: new Set(),
      stepMisses: [], // { pos, typed } wrong keys since the last step
    };
  }

  const timeLeft = (g, t) => g.bank - t / 1000;

  function advance(g, t) {
    if (!g.over && timeLeft(g, t) <= 0) {
      g.over = true;
      g.endT = Math.round(g.bank * 1000);
    }
    return g.over;
  }

  // Wrong keys can't be tied to a letter until we know which word you were going for.
  // Once it's known, each wrong key counts as a miss on that word's letter at that position.
  const attribute = (g, word, typedLen) => W.attribute(g, word.slice(0, typedLen), word);

  // Applies one key press at time t. Returns what it did, or null if it had no effect.
  // onMove (live play only) creates the rows that come into view.
  function applyKey(g, k, t, onMove) {
    if (advance(g, t)) return null;
    if (k === BACK || k === BACK_WORD) {
      const b = W.back(g, k === BACK_WORD);
      if (b) W.mark(g, t);
      return b && { type: "back", ...b, buf: g.buf };
    }
    if (k === " ") return null;

    const row = g.rows[g.n + 1];
    const r = W.letter(g, k, (s) => row.cells.some((c) => c.type === "open" && c.word.startsWith(s)), g.v < 2);
    if (!r) return null;
    W.mark(g, t);
    g.keys++;
    if (!r.ok) {
      g.stepMisses.push({ pos: r.pos, typed: k });
      g.mistakes++;
      g.bank -= PENALTY;
      if (timeLeft(g, t) <= 0) {
        g.over = true;
        g.endT = t; // the penalty itself ran the clock out
      }
      return { type: "miss", typed: k, pos: r.pos, buf: g.buf };
    }

    g.correct++;
    const hit = row.cells.findIndex((c) => c.type === "open" && W.ready(g, c.word));
    if (hit < 0) return { type: "letter", typed: k, pos: r.pos, buf: g.buf };

    const cell = row.cells[hit];
    const misses = attribute(g, cell.word, cell.word.length);
    g.chars += cell.word.length + 1;
    const now = Math.min(MAX_TIME, timeLeft(g, t) + gain(cell.word, g.n) + (cell.bonus ? BONUS : 0));
    g.bank = now + t / 1000;
    g.n++;
    g.lane = hit;
    g.rows[g.n].lane = hit;
    W.done(g, cell.word);
    W.reset(g);
    if (onMove) onMove(g, cell.word);
    return { type: "move", typed: k, pos: r.pos, word: cell.word, lane: hit, bonus: !!cell.bonus, misses };
  }

  function gameStats(g, ms) {
    const minutes = ms / 60000;
    return {
      wpm: minutes > 1 / 60 ? W.wpm(g) : 0, // typing time only, scaled to the speed test (input.js)
      acc: g.keys ? (g.correct / g.keys) * 100 : 100,
    };
  }

  TT.pathCore = { newCore, applyKey, advance, timeLeft, gameStats, attribute, MAX_TIME, RULES };

  // ---------- engine: live play and replay, with rendering ----------

  const MAIN = `
      <section class="col-main pr-main">
        <div class="pr-top">
          <div class="live"><span class="live-num" data-pr="score">0</span><span class="caps-label">STEPS</span></div>
          <div class="pr-timer">
            <span class="caps-label" data-pr="time"></span>
            <div class="pr-bar"><i data-pr="bar"></i></div>
          </div>
        </div>
        <div class="pr-board">
          <div class="pr-rows" data-pr="rows"></div>
          <div class="pr-over" data-pr="over" hidden></div>
        </div>
        <div class="word-box pr-input" data-pr="input" aria-live="polite"></div>
        <p class="note" data-pr="note"></p>
      </section>`;
  const SIDE = `
      <aside class="col-side">
        <div class="rule-head">STATUS</div>
        <dl class="status" data-pr="status"></dl>
        <div class="side-label">Target keys:</div>
        <div class="keygrid" data-pr="keys"></div>
        <div class="caps-label foot-caption" data-pr="caption"></div>
      </aside>`;

  // With replayOnly, only the board is drawn (the replay screen has its own side panel).
  TT.createPathRunner = ({ root, onStart, onEnd, replayOnly = false }) => {
    root.innerHTML = replayOnly ? MAIN : `<div class="cols">${MAIN}${SIDE}</div>`;
    const el = Object.fromEntries([...root.querySelectorAll("[data-pr]")].map((x) => [x.dataset.pr, x]));
    let g = null;
    let live = null;    // { startedAt, keys, times, recent, targets, missed, state }
    let replay = null;  // { rec, pos, lastT }
    let viewT = 0;      // the moment being shown, in ms from the first key
    let raf = 0;

    const record = () => ((TT.store.games.path ||= { best: 0, plays: 0, history: [] }));

    // ---------- rows (live play only) ----------

    function layout(k) {
      let blocked = 0;
      if (k >= 30) blocked = Math.random() < 0.3 ? 2 : 1;
      else if (k >= 15) blocked = 1;
      else if (k >= 5) blocked = Math.random() < 0.5 ? 1 : 0;

      const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
      const cells = [0, 1, 2].map(() => ({ type: "open" }));
      for (let i = 0; i < blocked; i++) cells[lanes[i]] = { type: "block" };
      if (k % 5 === 0) {
        const open = cells.filter((c) => c.type === "open");
        open[Math.floor(Math.random() * open.length)].bonus = true;
      }
      return { cells };
    }

    function assignWords(k) {
      const n = k - 1;
      const maxLen = Math.min(10, 4 + Math.floor(n / 6));
      const minLen = n < 10 ? 2 : 3;
      const fits = (w) => w.length >= minLen && w.length <= maxLen && !live.recent.includes(w);
      const shareChance = Math.min(0.7, n * 0.03);
      const prefixLen = n >= 25 ? 2 : 1;

      const batch = A.practiceWords(60, live.targets, live.missed, TT.store.settings.mix).filter(fits);
      const anyFit = PRACTICE_WORDS.filter(fits);
      const chosen = [];
      // No option may be a prefix of another, or typing the shorter one would end the choice early.
      const clashes = (w) => chosen.some((c) => c === w || c.startsWith(w) || w.startsWith(c));
      const share = Math.random() < shareChance;

      for (const cell of g.rows[k].cells) {
        if (cell.type !== "open") continue;
        let cands = batch.length ? batch : anyFit;
        if (cell.bonus && live.targets.length) {
          const t = anyFit.filter((w) => live.targets.some((x) => w.includes(x.key)));
          if (t.length) cands = t;
        } else if (chosen.length && share) {
          const pre = chosen[0].slice(0, prefixLen);
          const shared = anyFit.filter((w) => w.startsWith(pre));
          if (shared.length > 1) cands = shared;
        }
        const ok = (w) => !clashes(w) && (share || !chosen.some((c) => c[0] === w[0]));
        let word = null;
        for (let tries = 0; tries < 60 && !word; tries++) {
          const w = cands[Math.floor(Math.random() * cands.length)];
          if (ok(w)) word = w;
        }
        word ||= anyFit.find(ok) || PRACTICE_WORDS.find((w) => !clashes(w));
        cell.word = word;
        chosen.push(word);
      }
    }

    function onMove(state, word) {
      live.recent = [...live.recent, word].slice(-12);
      state.rows[state.n + 2] = layout(state.n + 2);
      assignWords(state.n + 1);
    }

    // ---------- rendering ----------

    function cellHtml(k, i) {
      const row = g.rows[k];
      const rel = k - g.n; // 2 = next-but-one, 1 = choices, 0 = player, -1 = trail
      if (rel <= 0) {
        const lane = rel === 0 ? g.lane : row && row.lane;
        const mark = lane === i ? (rel === 0 ? `<span class="pr-player"></span>` : `<span class="pr-trail"></span>`) : "";
        return `<div class="pr-cell ground">${mark}</div>`;
      }
      if (!row) return `<div class="pr-cell"></div>`;
      const c = row.cells[i];
      if (c.type === "block") return `<div class="pr-cell block ${rel === 2 ? "faint" : ""}" aria-label="blocked"></div>`;
      const bonus = c.bonus ? `<span class="pr-bonus">+${BONUS}s</span>` : "";
      if (rel === 2 || !c.word) return `<div class="pr-cell open faint">${bonus}</div>`;

      const good = W.good(g);
      const match = good && c.word.startsWith(good);
      const typed = match ? good.length : 0;
      return `<div class="pr-cell open active ${g.buf && !match ? "dim" : ""} ${c.bonus ? "bonus" : ""}">${bonus}` +
        `<span class="pr-word"><b>${c.word.slice(0, typed)}</b>${c.word.slice(typed)}</span></div>`;
    }

    function renderBoard() {
      el.rows.innerHTML = [g.n + 2, g.n + 1, g.n, g.n - 1]
        .map((k) => `<div class="pr-row">${[0, 1, 2].map((i) => cellHtml(k, i)).join("")}</div>`)
        .join("");
    }

    function renderInput() {
      el.input.innerHTML = g.buf ? W.html(g) : `<span class="pr-placeholder">type a path's word</span>`;
      el.input.classList.toggle("empty", !g.buf);
    }

    function renderTimer() {
      const t = g.over ? 0 : Math.max(0, timeLeft(g, viewT));
      el.time.textContent = `${t.toFixed(1)}S`;
      el.bar.style.width = `${(t / MAX_TIME) * 100}%`;
      el.bar.classList.toggle("low", t < 2.5);
    }

    function renderStatus() {
      el.score.textContent = g.n;
      if (!el.status) return;
      const { wpm, acc } = gameStats(g, viewT);
      el.status.innerHTML = TT.ui.statusRows([
        ["Steps:", g.n],
        ["Best:", Math.max(record().best, g.n)],
        ["WPM:", Math.round(wpm)],
        ["Accuracy:", `${Math.round(acc)}%`],
        ["Mistakes:", g.mistakes, true],
      ]);
    }

    function render(animate) {
      renderBoard();
      renderInput();
      renderTimer();
      renderStatus();
      if (!animate) return;
      // The world scrolls down one row: start shifted up by a row, then slide into place.
      const rows = el.rows.children;
      const step = rows[1].offsetTop - rows[0].offsetTop;
      el.rows.style.transition = "none";
      el.rows.style.transform = `translateY(${-step}px)`;
      void el.rows.offsetHeight;
      el.rows.style.transition = "transform 0.18s ease-out";
      el.rows.style.transform = "translateY(0)";
    }

    function shake() {
      el.input.classList.remove("shake");
      void el.input.offsetWidth;
      el.input.classList.add("shake");
    }

    // ---------- live play ----------

    function newGame() {
      cancelAnimationFrame(raf);
      replay = null;
      live = { state: "ready", startedAt: 0, keys: "", times: [], recent: [], targets: A.weakKeys(), missed: A.weakWords(20) };
      g = newCore({ 0: { cells: [], lane: 1 } });
      g.wpmScale = W.scale();
      g.rows[1] = layout(1);
      g.rows[2] = layout(2);
      assignWords(1);
      viewT = 0;

      el.over.hidden = true;
      el.keys.innerHTML = TT.ui.keyTiles(live.targets.map((t) => t.key));
      el.caption.textContent = live.targets.length ? "WORDS USE YOUR TARGET KEYS" : "TAKE A FEW TESTS TO FIND THEM";
      el.note.textContent = "Type a word to start. Finishing a word steps you onto that path. Wrong keys cost time and have to be backspaced.";
      render(false);
    }

    function start() {
      live.state = "running";
      live.startedAt = performance.now();
      el.note.textContent = "Bonus paths add extra time.";
      onStart();
      raf = requestAnimationFrame(frame);
    }

    function frame() {
      if (live.state !== "running") return;
      viewT = performance.now() - live.startedAt;
      if (advance(g, viewT)) return end();
      renderTimer();
      raf = requestAnimationFrame(frame);
    }

    function end() {
      live.state = "over";
      cancelAnimationFrame(raf);
      viewT = g.endT;

      // A half-typed word only counts if it can match just one path.
      const good = W.good(g);
      if (good) {
        const cands = g.rows[g.n + 1].cells.filter((c) => c.type === "open" && c.word.startsWith(good));
        if (cands.length === 1) attribute(g, cands[0].word, good.length);
      }

      const { wpm, acc } = gameStats(g, g.endT);
      const round = (x) => Math.round(x * 100) / 100;
      const date = new Date().toISOString();
      const id = TT.newRoundId();
      const rec = record();
      const prevBest = rec.best;
      rec.plays++;
      rec.best = Math.max(rec.best, g.n);
      rec.history.push({ date, score: g.n, wpm: round(wpm), acc: round(acc) });
      if (rec.history.length > HISTORY_CAP) rec.history.splice(0, rec.history.length - HISTORY_CAP);

      // Also feed the run into the shared history, so its misses shape weak keys and practice.
      const store = TT.store;
      store.history.push({
        id, date,
        kind: "game",
        game: "path",
        mode: "steps",
        amount: g.n,
        wpm: round(wpm),
        raw: round(wpm),
        acc: round(acc),
        seconds: round(g.endT / 1000),
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
        id, date, kind: "game", game: "path", mode: "steps", amount: g.n,
        v: RULES, wpmScale: g.wpmScale, rows: g.rows, keys: live.keys, times: live.times, duration: g.endT,
      });

      const line = g.n > prevBest && prevBest > 0
        ? `<strong class="hl">New best!</strong> Previous best was ${prevBest}.`
        : `Best: ${rec.best} steps · ${Math.round(wpm)} wpm · ${Math.round(acc)}% accuracy`;
      el.over.innerHTML = `
        <h2>OUT OF TIME</h2>
        <div class="pr-over-score">${g.n}</div>
        <div class="caps-label">STEPS</div>
        <p>${line}</p>
        <div class="hints">
          <button data-act="play"><kbd>TAB</kbd>PLAY AGAIN</button>
          <button data-act="replay:${id}"><kbd>R</kbd>REPLAY</button>
          <button data-act="menu"><kbd>ESC</kbd>MENU</button>
        </div>`;
      el.over.hidden = false;
      render(false);
      onEnd(id);
    }

    function stop() {
      cancelAnimationFrame(raf);
      if (live && live.state === "running") live.state = "stopped";
    }

    // Pausing stops the clock; on resume the start time moves on by the length of the pause.
    function pause() {
      if (!live || live.state !== "running") return;
      live.state = "paused";
      live.pausedAt = performance.now();
      cancelAnimationFrame(raf);
      el.over.innerHTML = TT.pausedHtml("play", "menu", "MENU");
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
      if (!live || live.state === "over" || live.state === "stopped" || live.state === "paused") return;
      let k;
      if (e.key === "Backspace") k = e.ctrlKey || e.altKey ? BACK_WORD : BACK;
      else if (e.ctrlKey || e.altKey || e.metaKey) return;
      else if (e.key === " ") k = " ";
      else if (/^[a-zA-Z]$/.test(e.key)) k = e.key;
      else return;
      e.preventDefault();

      if (live.state === "ready") {
        if (!/^[a-zA-Z]$/.test(k)) return; // the clock starts on the first letter
        start();
      }
      const t = Math.round(performance.now() - live.startedAt);
      viewT = t;
      if (advance(g, t)) return end(); // the clock ran out before this key; don't record it
      live.keys += k;
      live.times.push(t);
      const d = applyKey(g, k, t, onMove);
      if (g.over) return end();
      if (!d) return;
      if (d.type === "miss") {
        renderInput();
        shake();
        renderTimer();
        renderStatus();
      } else if (d.type === "move") {
        render(true);
      } else {
        renderBoard();
        renderInput();
      }
    }

    // ---------- replay ----------

    function loadReplay(rec) {
      stop();
      live = null;
      replay = { rec, pos: 0, lastT: 0 };
      g = newCore(structuredClone(rec.rows), rec.v || 1);
      g.wpmScale = rec.wpmScale ?? W.scale();
      viewT = 0;
      el.over.hidden = true;
      if (el.note) el.note.textContent = "";
      render(false);
    }

    // Shows the run as it was at time T (ms). Moving backwards replays from the start.
    function replayTo(T) {
      if (!replay) return g;
      const { rec } = replay;
      const rewind = T < replay.lastT;
      if (rewind) {
        g = newCore(structuredClone(rec.rows), rec.v || 1);
        g.wpmScale = rec.wpmScale ?? W.scale();
        replay.pos = 0;
      }
      let moved = false, missed = false;
      while (replay.pos < rec.keys.length && rec.times[replay.pos] <= T) {
        const d = applyKey(g, rec.keys[replay.pos], rec.times[replay.pos]);
        replay.pos++;
        if (d && d.type === "move") moved = true;
        if (d && d.type === "miss") missed = true;
      }
      advance(g, T);
      replay.lastT = T;
      viewT = g.over ? g.endT : T;
      render(moved && !rewind);
      if (missed && !rewind) shake();
      if (g.over) {
        el.over.innerHTML = `<h2>OUT OF TIME</h2><div class="pr-over-score">${g.n}</div><div class="caps-label">STEPS</div>`;
      }
      el.over.hidden = !g.over;
      return g;
    }

    return {
      newGame, stop, handleKey, loadReplay, replayTo, pause, resume,
      isOver: () => !!live && live.state === "over",
      isRunning: () => !!live && live.state === "running",
      isPaused: () => !!live && live.state === "paused",
    };
  };
})();
