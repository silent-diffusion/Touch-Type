// The typing engine shared by the speed test and practice. It records every key press with its
// time, and can play a recording back. Live typing, replays and analysis all run through the
// same rules (the "core" below), so a replay always matches what happened.
(() => {
  const MAX_EXTRA = 10;   // extra letters allowed past the end of a word
  const VISIBLE_LINES = 3;
  const BACK = "<";       // recording code for Backspace
  const BACK_WORD = "{";  // recording code for Ctrl+Backspace

  // ---------- core: pure typing rules ----------

  function newCore(words, mode, amount) {
    return {
      words, mode, amount,
      typed: words.map(() => ""),
      index: 0,
      keys: 0,
      correctKeys: 0,
      keyStats: {},         // letter -> { expected, missed }
      mistakes: new Set(),  // indices of words with any mistake
      finished: false,
    };
  }

  function bumpKey(c, letter, missed) {
    const k = (c.keyStats[letter] ||= { expected: 0, missed: 0 });
    k.expected++;
    if (missed) k.missed++;
  }

  // Applies one key press. Returns what it did, or null if it had no effect.
  function applyKey(c, k) {
    const i = c.index;
    const w = c.words[i];
    const t = c.typed[i];

    if (k === " ") {
      if (!t) return null;
      c.keys++;
      const ok = t === w;
      if (ok) c.correctKeys++;
      else c.mistakes.add(i);
      c.index++;
      if (c.mode === "words" && c.index >= c.words.length) c.finished = true;
      return { type: "space", word: i, ok, typed: t, skipped: Math.max(0, w.length - t.length) };
    }

    if (k === BACK || k === BACK_WORD) {
      const whole = k === BACK_WORD;
      let j = i;
      let crossed = false;
      if (!t) {
        // At the start of a word, step back into the previous one, but only if it has a mistake.
        // Correctly typed words stay locked.
        if (j === 0 || c.typed[j - 1] === c.words[j - 1]) return null;
        c.index = --j;
        crossed = true;
        if (!whole) return { type: "back", word: j, crossed, deleted: "", fixedError: false, whole };
      }
      const before = c.typed[j];
      const target = c.words[j];
      const deleted = whole ? before : before.slice(-1);
      const fixedError = whole ? before !== target.slice(0, before.length) : before.slice(-1) !== target[before.length - 1];
      c.typed[j] = whole ? "" : before.slice(0, -1);
      return { type: "back", word: j, crossed, deleted, fixedError, whole };
    }

    const expected = w[t.length];
    if (expected === undefined && t.length >= w.length + MAX_EXTRA) return null;
    c.keys++;
    if (expected !== undefined) bumpKey(c, expected, k !== expected);
    const correct = k === expected;
    if (correct) c.correctKeys++;
    else c.mistakes.add(i);
    c.typed[i] = t + k;
    if (c.mode === "words" && i === c.words.length - 1 && c.typed[i] === w) c.finished = true;
    return { type: "letter", word: i, pos: t.length, expected: expected || null, typed: k, correct };
  }

  function computeStats(c, ms) {
    let correct = 0, incorrect = 0, extra = 0, missed = 0;
    let wpmChars = 0, rawChars = 0;
    const last = Math.min(c.index, c.words.length - 1);

    for (let i = 0; i <= last; i++) {
      const w = c.words[i];
      const t = c.typed[i];
      const done = i < c.index;
      if (!done && !t) continue;

      for (let j = 0; j < Math.max(w.length, t.length); j++) {
        if (j < t.length && j < w.length) t[j] === w[j] ? correct++ : incorrect++;
        else if (j < t.length) extra++;
        else if (done) missed++;
      }

      rawChars += t.length + (done ? 1 : 0);
      if (done && t === w) wpmChars += w.length + 1;           // word + its space
      else if (!done && w.startsWith(t)) wpmChars += t.length;  // correct partial last word
    }

    const minutes = Math.max(ms, 1) / 60000;
    return {
      wpm: wpmChars / 5 / minutes,
      raw: rawChars / 5 / minutes,
      acc: c.keys ? (c.correctKeys / c.keys) * 100 : 0,
      correct, incorrect, extra, missed,
      seconds: ms / 1000,
    };
  }

  TT.typingCore = { newCore, applyKey, computeStats, BACK, BACK_WORD };

  // ---------- engine: live typing and replay, with rendering ----------

  TT.createTyping = ({ box, wordsEl, onStart, onTick, onFinish }) => {
    let c = newCore([], "time", 30);
    let gen = null;
    let startedAt = 0;
    let timer = null;
    let stopped = true;
    let keys = "";      // this round's recording
    let times = [];
    let replay = null;  // { rec, pos, lastT } while showing a recording
    let wordEls = [];
    let caret = null;
    let lineStep = 0;

    const elapsedMs = () => (startedAt ? performance.now() - startedAt : 0);
    const tick = () => onTick && onTick({ mode: c.mode, amount: c.amount, index: c.index, started: !!startedAt, elapsedMs: elapsedMs() });

    // ---------- rendering ----------

    function renderWord(i) {
      if (!wordEls[i]) return;
      const w = c.words[i];
      const t = c.typed[i];
      let html = "";
      for (let j = 0; j < Math.max(w.length, t.length); j++) {
        let cls = "";
        let ch = w[j];
        if (j < t.length) {
          if (j < w.length) cls = t[j] === w[j] ? "correct" : "incorrect";
          else { cls = "extra"; ch = t[j]; }
        }
        html += `<span class="${cls}">${ch}</span>`;
      }
      wordEls[i].innerHTML = html;
      wordEls[i].classList.toggle("error", i < c.index && t !== w);
    }

    function appendWordEls(from) {
      for (let i = from; i < c.words.length; i++) {
        const el = document.createElement("div");
        el.className = "word";
        wordEls[i] = el;
        wordsEl.insertBefore(el, caret);
        renderWord(i);
      }
    }

    function renderAll() {
      wordsEl.innerHTML = "";
      wordEls = [];
      caret = document.createElement("div");
      caret.className = "caret";
      wordsEl.appendChild(caret);
      appendWordEls(0);
      relayout();
    }

    function relayout() {
      if (!wordEls.length) return;
      const first = wordEls[0];
      const cs = getComputedStyle(first);
      lineStep = first.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
      box.style.height = `${lineStep * VISIBLE_LINES}px`;
      updateCaret();
    }

    function updateCaret() {
      const wordEl = wordEls[c.index];
      if (!wordEl) return;
      const letters = wordEl.children;
      const n = c.typed[c.index].length;
      const atEnd = n >= letters.length;
      const l = letters[atEnd ? letters.length - 1 : n];
      const x = l.offsetLeft + (atEnd ? l.offsetWidth : 0);
      const style = TT.store.settings.caret;

      caret.className = `caret caret-${style}`;
      if (style === "line") {
        caret.style.width = "3px";
        caret.style.height = `${l.offsetHeight}px`;
        caret.style.transform = `translate(${x - 1.5}px, ${l.offsetTop}px)`;
      } else {
        const h = style === "block" ? l.offsetHeight : 3;
        caret.style.width = `${l.offsetWidth}px`;
        caret.style.height = `${h}px`;
        caret.style.transform = `translate(${x}px, ${l.offsetTop + l.offsetHeight - h}px)`;
      }

      // Keep the current word on the second line once we're past the first.
      const shift = Math.max(0, wordEl.offsetTop - wordEls[0].offsetTop - lineStep);
      wordsEl.style.transform = `translateY(${-shift}px)`;
    }

    function showResult(d) {
      renderWord(d.word);
      if (d.type === "back" && d.crossed) renderWord(d.word + 1);
      updateCaret();
    }

    // ---------- live typing ----------

    function begin({ mode, amount, gen: g }) {
      clearInterval(timer);
      replay = null;
      gen = g;
      c = newCore(gen(mode === "words" ? amount : 100), mode, amount);
      startedAt = 0;
      stopped = false;
      keys = "";
      times = [];
      renderAll();
      tick();
    }

    function stop() {
      clearInterval(timer);
      stopped = true;
    }

    function start() {
      startedAt = performance.now();
      onStart();
      timer = setInterval(() => {
        tick();
        if (c.mode === "time" && elapsedMs() >= c.amount * 1000) finish();
      }, 100);
    }

    // In time mode, keep a buffer of words ahead of the cursor.
    function ensureWords() {
      if (c.mode !== "time" || c.index < c.words.length - 40) return;
      const from = c.words.length;
      const more = gen(50);
      c.words.push(...more);
      c.typed.push(...more.map(() => ""));
      appendWordEls(from);
    }

    function handleKey(e) {
      if (stopped || replay) return;
      let k;
      if (e.key === "Backspace") k = e.ctrlKey || e.altKey ? BACK_WORD : BACK;
      else if (e.ctrlKey || e.altKey || e.metaKey) return;
      else if (e.key === " ") k = " ";
      else if (/^[a-zA-Z]$/.test(e.key)) k = e.key; // lowercase only: a capital counts as a mistake
      else return;
      e.preventDefault();

      if (!startedAt) {
        if (k.length !== 1 || !/[a-zA-Z]/.test(k)) return; // the clock starts on the first letter
        start();
      }
      const t = Math.round(elapsedMs());
      if (c.mode === "time" && t >= c.amount * 1000) return finish();

      keys += k;
      times.push(t);
      const d = applyKey(c, k);
      if (d) {
        showResult(d);
        if (d.type === "space") ensureWords();
        if (d.type === "space" || d.crossed) tick();
      }
      if (c.finished) finish();
    }

    function finish() {
      if (stopped) return;
      stopped = true;
      c.finished = true;
      clearInterval(timer);
      const ms = c.mode === "time" ? c.amount * 1000 : elapsedMs();
      onFinish({
        ...computeStats(c, ms),
        mode: c.mode,
        amount: c.amount,
        keys: Object.fromEntries(Object.entries(c.keyStats).map(([k, v]) => [k, [v.expected, v.missed]])),
        missedWords: [...new Set([...c.mistakes].map((i) => c.words[i]))],
        recording: {
          mode: c.mode,
          amount: c.amount,
          words: c.words.slice(0, Math.min(c.words.length, c.index + 25)),
          keys,
          times,
          duration: Math.round(ms),
        },
      });
    }

    // ---------- replay ----------

    function loadReplay(rec) {
      stop();
      startedAt = 0;
      replay = { rec, pos: 0, lastT: 0 };
      c = newCore(rec.words.slice(), rec.mode, rec.amount);
      renderAll();
    }

    // Shows the recording as it was at time T (ms). Moving backwards replays from the start.
    function replayTo(T) {
      if (!replay) return c;
      const { rec } = replay;
      const rewind = T < replay.lastT;
      if (rewind) {
        c = newCore(rec.words.slice(), rec.mode, rec.amount);
        replay.pos = 0;
      }
      const results = [];
      while (replay.pos < rec.keys.length && rec.times[replay.pos] <= T) {
        const d = applyKey(c, rec.keys[replay.pos++]);
        if (d) results.push(d);
      }
      replay.lastT = T;
      if (rewind) renderAll();
      else results.forEach(showResult);
      return c;
    }

    return { begin, stop, handleKey, relayout, loadReplay, replayTo };
  };
})();
