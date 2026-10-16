// The word you're typing in a game, shared by every game so they all type the same way, like the
// speed test: wrong letters stay in what you've typed (shown in the accent color) and have to be
// backspaced before anything else matches.
//
// It works on the game's own state: g.buf is everything typed for the current word, and g.bad is
// where the first wrong letter is (-1 when there's none). Wrong keys are kept in g.stepMisses with
// their position until it's known which word they were for (see attribute).
(() => {
  const MAX_WRONG = 10; // wrong letters allowed in a row before keys are ignored, as in the speed test

  const reset = (g) => {
    g.buf = "";
    g.bad = -1;
  };
  const clean = (g) => !(g.bad >= 0);
  const good = (g) => (clean(g) ? g.buf : g.buf.slice(0, g.bad));
  const wrong = (g) => (clean(g) ? "" : g.buf.slice(g.bad));
  // The buffer is exactly this word, with no mistakes: Space, Enter or a finished path can use it.
  const ready = (g, word) => clean(g) && g.buf === word;

  // A letter. fits(text) says whether text starts a word you can type right now.
  // Returns { ok, pos }, or null when it's ignored (too many wrong letters in a row).
  // reject: older rules, where a wrong letter was counted but never typed.
  function letter(g, k, fits, reject = false) {
    const pos = g.buf.length;
    if (clean(g) && fits(g.buf + k)) {
      g.buf += k;
      return { ok: true, pos };
    }
    if (reject) return { ok: false, pos };
    if (!clean(g) && pos - g.bad >= MAX_WRONG) return null;
    if (clean(g)) g.bad = pos;
    g.buf += k;
    return { ok: false, pos };
  }

  // Backspace, or Ctrl+Backspace (whole) to clear the word. Returns null if there was nothing to delete.
  function back(g, whole) {
    if (!g.buf) return null;
    const deleted = whole ? g.buf : g.buf.slice(-1);
    const fixedError = !clean(g); // wrong letters are always at the end, so this deletes one
    g.buf = whole ? "" : g.buf.slice(0, -1);
    if (g.bad >= g.buf.length) g.bad = -1;
    return { deleted, fixedError };
  }

  // Ties this word's key presses to letters once it's known which word they were for. Each letter
  // in `done` (typed correctly) counts once; each wrong key counts as a miss on the letter of `word`
  // at its position. `name` is what goes on the missed-words list.
  function attribute(g, done, word = done, name = word) {
    const bump = (ch, missed) => {
      const k = (g.keyStats[ch] ||= { expected: 0, missed: 0 });
      k.expected++;
      if (missed) k.missed++;
    };
    for (const ch of done) bump(ch, false);
    const misses = g.stepMisses.filter((m) => m.pos < word.length);
    for (const m of misses) bump(word[m.pos], true);
    if (misses.length) g.missedWords.add(name);
    g.stepMisses = [];
    return misses;
  }

  // The typed box's contents. Letters are a-z only, so nothing needs escaping.
  const html = (g) =>
    `<span class="wb-ok">${good(g)}</span>${clean(g) ? "" : `<span class="wb-bad">${wrong(g)}</span>`}`;

  // ---------- typing speed in games ----------
  // Games spend a lot of time waiting (for a tile, a gap, the next path), so their speed counts only
  // the time spent typing each word: from its first key to its last. Like the speed test's net WPM,
  // only words finished correctly add characters, while time spent on typos and backspaces (and on
  // words that were missed or given up) still counts, so mistakes slow it down. A word of n letters
  // has n - 1 gaps between its keys, and those are what's timed.
  //
  // That leaves out the gap between words (space, then the next first letter), so it reads a bit
  // fast. A profile's own speed tests, replayed the same way, give the scale that brings it in line
  // with their real WPM (see TT.review.speedScale). Until there are enough, DEFAULT_SCALE is used.
  const DEFAULT_SCALE = 0.9;

  // Every key typed toward a word (letters and backspaces) at time t.
  const mark = (g, t) => {
    if (g.wordT == null) g.wordT = t;
    g.lastT = t;
  };
  // The word was finished correctly. Each gap counts at least MIN_GAP_MS (about 400 wpm, faster
  // than anyone types), so keys landing in the same instant can't make the speed run away.
  const MIN_GAP_MS = 30;
  const done = (g, word) => {
    if (g.wordT != null) {
      const gaps = Math.max(0, word.length - 1);
      g.typeMs = (g.typeMs || 0) + Math.max(g.lastT - g.wordT, gaps * MIN_GAP_MS);
      g.typeChars = (g.typeChars || 0) + gaps;
    }
    g.wordT = null;
  };
  // The word was missed or given up: its time counts, its letters don't.
  const drop = (g) => {
    if (g.wordT != null) g.typeMs = (g.typeMs || 0) + (g.lastT - g.wordT);
    g.wordT = null;
  };
  const scale = () => (TT.store && TT.store.games && TT.store.games.speed ? TT.store.games.speed.scale : DEFAULT_SCALE);
  // Words per minute so far, scaled to match the speed test (g.wpmScale, saved with each round).
  const wpm = (g) => (g.typeMs > 0 ? (g.typeChars / 5 / (g.typeMs / 60000)) * (g.wpmScale ?? 1) : 0);

  TT.wordInput = { MAX_WRONG, reset, clean, good, wrong, ready, letter, back, attribute, html, mark, done, drop, wpm, scale, DEFAULT_SCALE };

  // The pause screen every game shows. restart and quit are the game's own actions.
  TT.pausedHtml = (restart, quit, quitLabel) => `
    <h2>PAUSED</h2>
    <p>The clock is stopped. Nothing you type counts until you resume.</p>
    <div class="hints">
      <button data-act="pause"><kbd>ESC</kbd>RESUME</button>
      <button data-act="${restart}"><kbd>TAB</kbd>RESTART</button>
      <button data-act="${quit}"><kbd>Q</kbd>${quitLabel}</button>
    </div>`;
})();
