// The typing engine shared by the speed test and practice.
(() => {
  const MAX_EXTRA = 10;   // extra letters allowed past the end of a word
  const VISIBLE_LINES = 3;

  TT.createTyping = ({ box, wordsEl, onStart, onTick, onFinish }) => {
    const s = {
      mode: "time",
      amount: 30,
      gen: null,
      words: [],
      typed: [],
      index: 0,
      startedAt: 0,
      finished: false,
      timer: null,
      keys: 0,
      correctKeys: 0,
      keyStats: {},           // letter -> { expected, missed } for this test
      mistakes: new Set(),    // indices of words with any mistake
    };
    let wordEls = [];
    let caret = null;
    let lineStep = 0;

    const elapsedMs = () => (s.startedAt ? performance.now() - s.startedAt : 0);
    const tick = () => onTick({ mode: s.mode, amount: s.amount, index: s.index, started: !!s.startedAt, elapsedMs: elapsedMs() });

    // ---------- rendering ----------

    function renderWord(i) {
      const w = s.words[i];
      const t = s.typed[i];
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
      wordEls[i].classList.toggle("error", i < s.index && t !== w);
    }

    function appendWordEls(from) {
      for (let i = from; i < s.words.length; i++) {
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
      caret.id = "caret";
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
      const wordEl = wordEls[s.index];
      if (!wordEl) return;
      const letters = wordEl.children;
      const n = s.typed[s.index].length;
      const atEnd = n >= letters.length;
      const l = letters[atEnd ? letters.length - 1 : n];
      const x = l.offsetLeft + (atEnd ? l.offsetWidth : 0);
      const style = TT.store.settings.caret;

      caret.className = `caret-${style}`;
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

    // ---------- flow ----------

    function begin({ mode, amount, gen }) {
      clearInterval(s.timer);
      Object.assign(s, {
        mode, amount, gen,
        index: 0,
        startedAt: 0,
        finished: false,
        timer: null,
        keys: 0,
        correctKeys: 0,
        keyStats: {},
        mistakes: new Set(),
      });
      s.words = gen(mode === "words" ? amount : 100);
      s.typed = s.words.map(() => "");
      renderAll();
      tick();
    }

    function stop() {
      clearInterval(s.timer);
      s.finished = true;
    }

    function start() {
      s.startedAt = performance.now();
      onStart();
      s.timer = setInterval(() => {
        tick();
        if (s.mode === "time" && elapsedMs() >= s.amount * 1000) finish();
      }, 100);
    }

    // In time mode, keep a buffer of words ahead of the cursor.
    function ensureWords() {
      if (s.mode !== "time" || s.index < s.words.length - 40) return;
      const from = s.words.length;
      const more = s.gen(50);
      s.words.push(...more);
      s.typed.push(...more.map(() => ""));
      appendWordEls(from);
    }

    function bumpKey(letter, missed) {
      const k = (s.keyStats[letter] ||= { expected: 0, missed: 0 });
      k.expected++;
      if (missed) k.missed++;
    }

    function typeLetter(k) {
      if (!s.startedAt) start();
      const i = s.index;
      const w = s.words[i];
      const t = s.typed[i];
      const expected = w[t.length];
      if (expected === undefined && t.length >= w.length + MAX_EXTRA) return;

      s.keys++;
      if (expected !== undefined) bumpKey(expected, k !== expected);
      if (k === expected) s.correctKeys++;
      else s.mistakes.add(i);

      s.typed[i] = t + k;
      renderWord(i);
      updateCaret();

      const isLast = s.mode === "words" && i === s.words.length - 1;
      if (isLast && s.typed[i] === w) finish();
    }

    function typeSpace() {
      const i = s.index;
      const t = s.typed[i];
      if (!t) return;
      s.keys++;
      if (t === s.words[i]) s.correctKeys++;
      else s.mistakes.add(i);

      s.index++;
      renderWord(i);
      if (s.mode === "words" && s.index >= s.words.length) return finish();
      ensureWords();
      updateCaret();
      tick();
    }

    function backspace(wholeWord) {
      let i = s.index;
      if (!s.typed[i]) {
        // At the start of a word, step back into the previous one, but only if it has a mistake.
        // Correctly typed words stay locked.
        if (i === 0 || s.typed[i - 1] === s.words[i - 1]) return;
        s.index = --i;
        tick();
        if (!wholeWord) {
          renderWord(i);
          updateCaret();
          return;
        }
      }
      s.typed[i] = wholeWord ? "" : s.typed[i].slice(0, -1);
      renderWord(i);
      updateCaret();
    }

    function handleKey(e) {
      if (s.finished) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        backspace(e.ctrlKey || e.altKey);
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === " ") {
        e.preventDefault();
        typeSpace();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        // Lowercase only: a capital letter counts as a mistake.
        e.preventDefault();
        typeLetter(e.key);
      }
    }

    // ---------- results ----------

    function computeStats(ms) {
      let correct = 0, incorrect = 0, extra = 0, missed = 0;
      let wpmChars = 0, rawChars = 0;
      const last = Math.min(s.index, s.words.length - 1);

      for (let i = 0; i <= last; i++) {
        const w = s.words[i];
        const t = s.typed[i];
        const done = i < s.index;
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

      const minutes = ms / 60000;
      return {
        wpm: wpmChars / 5 / minutes,
        raw: rawChars / 5 / minutes,
        acc: s.keys ? (s.correctKeys / s.keys) * 100 : 0,
        correct, incorrect, extra, missed,
        seconds: ms / 1000,
      };
    }

    function finish() {
      if (s.finished) return;
      s.finished = true;
      clearInterval(s.timer);
      const ms = s.mode === "time" ? s.amount * 1000 : elapsedMs();
      onFinish({
        ...computeStats(ms),
        mode: s.mode,
        amount: s.amount,
        keys: Object.fromEntries(Object.entries(s.keyStats).map(([k, v]) => [k, [v.expected, v.missed]])),
        missedWords: [...new Set([...s.mistakes].map((i) => s.words[i]))],
      });
    }

    return { begin, stop, handleKey, relayout };
  };
})();
