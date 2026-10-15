// Path Runner: three paths ahead, each labeled with a word. Type a word to step onto it.
// A clock drains constantly; each step adds time back, less as you go further.
(() => {
  const A = TT.analysis;
  const LANES = 3;
  const START_TIME = 8;   // seconds on the clock at the start
  const MAX_TIME = 10;
  const BONUS = 2;        // extra seconds for a bonus path
  const PENALTY = 0.5;    // seconds lost per wrong key
  const HISTORY_CAP = 200;

  // Time gained for a step: longer words give more, and it shrinks as you go further.
  const gain = (word, n) => (0.6 + word.length * 0.3) * Math.max(0.55, 1 - n * 0.012);

  const TEMPLATE = `
    <div class="cols">
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
        <div class="pr-input" data-pr="input" aria-live="polite"></div>
        <p class="note" data-pr="note"></p>
      </section>
      <aside class="col-side">
        <div class="rule-head">STATUS</div>
        <dl class="status" data-pr="status"></dl>
        <div class="side-label">Target keys:</div>
        <div class="keygrid" data-pr="keys"></div>
        <div class="caps-label foot-caption" data-pr="caption"></div>
      </aside>
    </div>`;

  TT.createPathRunner = ({ root, onStart, onEnd }) => {
    root.innerHTML = TEMPLATE;
    const el = Object.fromEntries([...root.querySelectorAll("[data-pr]")].map((x) => [x.dataset.pr, x]));
    let g = null;
    let raf = 0;

    const record = () => ((TT.store.games.path ||= { best: 0, plays: 0, history: [] }));

    // ---------- rows ----------

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
      const fits = (w) => w.length >= minLen && w.length <= maxLen && !g.recent.includes(w);
      const shareChance = Math.min(0.7, n * 0.03);
      const prefixLen = n >= 25 ? 2 : 1;

      const batch = A.practiceWords(60, g.targets, g.missed, TT.store.settings.mix).filter(fits);
      const anyFit = PRACTICE_WORDS.filter(fits);
      const chosen = [];
      // No option may be a prefix of another, or typing the shorter one would end the choice early.
      const clashes = (w) => chosen.some((c) => c === w || c.startsWith(w) || w.startsWith(c));
      const share = Math.random() < shareChance;

      for (const cell of g.rows[k].cells) {
        if (cell.type !== "open") continue;
        let cands = batch.length ? batch : anyFit;
        if (cell.bonus && g.targets.length) {
          const t = anyFit.filter((w) => g.targets.some((x) => w.includes(x.key)));
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

    const activeRow = () => g.rows[g.n + 1];

    // ---------- rendering ----------

    function cellHtml(k, i) {
      const row = g.rows[k];
      const rel = k - g.n; // 2 = next-but-one, 1 = choices, 0 = player, -1 = trail
      if (rel <= 0) {
        const lane = rel === 0 ? g.lane : row && row.lane;
        const mark = lane === i ? (rel === 0 ? `<span class="pr-player"></span>` : `<span class="pr-trail"></span>`) : "";
        return `<div class="pr-cell ground">${mark}</div>`;
      }
      const c = row.cells[i];
      if (c.type === "block") return `<div class="pr-cell block ${rel === 2 ? "faint" : ""}" aria-label="blocked"></div>`;
      const bonus = c.bonus ? `<span class="pr-bonus">+${BONUS}s</span>` : "";
      if (rel === 2) return `<div class="pr-cell open faint">${bonus}</div>`;

      const match = g.buf && c.word.startsWith(g.buf);
      const typed = match ? g.buf.length : 0;
      return `<div class="pr-cell open active ${g.buf && !match ? "dim" : ""} ${c.bonus ? "bonus" : ""}">${bonus}` +
        `<span class="pr-word"><b>${c.word.slice(0, typed)}</b>${c.word.slice(typed)}</span></div>`;
    }

    function renderBoard() {
      el.rows.innerHTML = [g.n + 2, g.n + 1, g.n, g.n - 1]
        .map((k) => `<div class="pr-row">${[0, 1, 2].map((i) => cellHtml(k, i)).join("")}</div>`)
        .join("");
    }

    function renderInput() {
      el.input.innerHTML = g.buf
        ? `${g.buf}<span class="pr-caret"></span>`
        : `<span class="pr-caret"></span><span class="pr-placeholder">type a path's word</span>`;
    }

    function renderTimer() {
      const t = Math.max(0, g.time);
      el.time.textContent = `${t.toFixed(1)}S`;
      el.bar.style.width = `${(t / MAX_TIME) * 100}%`;
      el.bar.classList.toggle("low", t < 2.5);
    }

    function stats() {
      const minutes = g.startedAt ? (performance.now() - g.startedAt) / 60000 : 0;
      return {
        wpm: minutes > 1 / 60 ? g.chars / 5 / minutes : 0,
        acc: g.keys ? (g.correct / g.keys) * 100 : 100,
      };
    }

    function renderStatus() {
      const { wpm, acc } = stats();
      el.score.textContent = g.n;
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

    // ---------- flow ----------

    function newGame() {
      cancelAnimationFrame(raf);
      g = {
        n: 0,
        lane: 1,
        rows: {},
        buf: "",
        state: "ready",
        time: START_TIME,
        last: 0,
        startedAt: 0,
        keys: 0,
        correct: 0,
        mistakes: 0,
        chars: 0,
        recent: [],
        keyStats: {},          // letter -> { expected, missed }, attributed once a word is finished
        missedWords: new Set(),
        stepMisses: [],        // buffer positions of wrong keys since the last step
        targets: A.weakKeys(),
        missed: A.weakWords(20),
      };
      g.rows[0] = { cells: [], lane: 1 };
      g.rows[1] = layout(1);
      g.rows[2] = layout(2);
      assignWords(1);

      el.over.hidden = true;
      el.keys.innerHTML = TT.ui.keyTiles(g.targets.map((t) => t.key));
      el.caption.textContent = g.targets.length ? "WORDS USE YOUR TARGET KEYS" : "TAKE A FEW TESTS TO FIND THEM";
      el.note.textContent = "Type a word to start. Finishing a word steps you onto that path. Wrong keys cost time.";
      render(false);
    }

    function start() {
      g.state = "running";
      g.startedAt = g.last = performance.now();
      el.note.textContent = "Bonus paths add extra time.";
      onStart();
      raf = requestAnimationFrame(frame);
    }

    function frame(t) {
      if (g.state !== "running") return;
      g.time -= (t - g.last) / 1000;
      g.last = t;
      if (g.time <= 0) return end();
      renderTimer();
      raf = requestAnimationFrame(frame);
    }

    function mistake() {
      g.mistakes++;
      g.time -= PENALTY;
      el.input.classList.remove("shake");
      void el.input.offsetWidth;
      el.input.classList.add("shake");
      renderTimer();
      renderStatus();
      if (g.time <= 0) end();
    }

    // Wrong keys can't be tied to a letter until we know which word you were going for.
    // Once it's known, each wrong key counts as a miss on that word's letter at that position.
    function attribute(word, typedLen) {
      const bump = (letter, missed) => {
        const k = (g.keyStats[letter] ||= { expected: 0, missed: 0 });
        k.expected++;
        if (missed) k.missed++;
      };
      for (const ch of word.slice(0, typedLen)) bump(ch, false);
      const misses = g.stepMisses.filter((p) => p < word.length);
      for (const p of misses) bump(word[p], true);
      if (misses.length) g.missedWords.add(word);
      g.stepMisses = [];
    }

    function move(i) {
      const c = activeRow().cells[i];
      attribute(c.word, c.word.length);
      g.chars += c.word.length + 1;
      g.time = Math.min(MAX_TIME, g.time + gain(c.word, g.n) + (c.bonus ? BONUS : 0));
      g.recent = [...g.recent, c.word].slice(-12);

      g.n++;
      g.lane = i;
      g.rows[g.n].lane = i;
      g.buf = "";
      delete g.rows[g.n - 2];
      g.rows[g.n + 2] = layout(g.n + 2);
      assignWords(g.n + 1);
      render(true);
    }

    function end() {
      g.state = "over";
      g.time = 0;
      cancelAnimationFrame(raf);
      renderTimer();

      // A half-typed word only counts if it can match just one path.
      if (g.buf) {
        const cands = activeRow().cells.filter((c) => c.type === "open" && c.word.startsWith(g.buf));
        if (cands.length === 1) attribute(cands[0].word, g.buf.length);
      }

      const { wpm, acc } = stats();
      const round = (x) => Math.round(x * 100) / 100;
      const date = new Date().toISOString();
      const rec = record();
      const prevBest = rec.best;
      rec.plays++;
      rec.best = Math.max(rec.best, g.n);
      rec.history.push({ date, score: g.n, wpm: round(wpm), acc: round(acc) });
      if (rec.history.length > HISTORY_CAP) rec.history.splice(0, rec.history.length - HISTORY_CAP);

      // Also feed the run into the shared history, so its misses shape weak keys and practice.
      const store = TT.store;
      store.history.push({
        date,
        kind: "game",
        game: "path",
        mode: "steps",
        amount: g.n,
        wpm: round(wpm),
        raw: round(wpm),
        acc: round(acc),
        seconds: round((performance.now() - g.startedAt) / 1000),
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
          <button data-act="menu"><kbd>ESC</kbd>MENU</button>
        </div>`;
      el.over.hidden = false;
      renderStatus();
      onEnd();
    }

    function stop() {
      cancelAnimationFrame(raf);
      if (g && g.state === "running") g.state = "stopped";
    }

    function handleKey(e) {
      if (!g || g.state === "over" || g.state === "stopped") return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        g.buf = g.buf.slice(0, -1);
        renderBoard();
        renderInput();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        return;
      }
      if (!/^[a-zA-Z]$/.test(e.key)) return;
      e.preventDefault();
      if (g.state === "ready") start();

      g.keys++;
      const cand = g.buf + e.key;
      const open = activeRow().cells.filter((c) => c.type === "open");
      if (!open.some((c) => c.word.startsWith(cand))) {
        g.stepMisses.push(g.buf.length);
        return mistake();
      }

      g.correct++;
      g.buf = cand;
      const hit = activeRow().cells.findIndex((c) => c.type === "open" && c.word === cand);
      if (hit >= 0) move(hit);
      else {
        renderBoard();
        renderInput();
      }
    }

    return { newGame, stop, handleKey, isOver: () => !!g && g.state === "over" };
  };
})();
