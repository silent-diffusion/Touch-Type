// Keystroke analysis, worked out from round recordings by re-running them through the same rules
// the live round used. Nothing here is stored, so new measures automatically cover old rounds.
(() => {
  const HESITATION_MS = 1000; // a gap this long before a key counts as a pause
  const MIN_SAMPLES = 3;      // fewest timings before a letter or pair is ranked

  const newAnalysis = () => ({
    keyTimes: {},    // letter -> { sum, n }: time from the previous key to a correct letter
    bigrams: {},     // "th" -> { sum, n }: time for the second letter of a correct pair
    confusions: {},  // "e>r" -> count: expected e, pressed r
    wrong: [],       // { t, expected, typed, word, pos }
    spaces: [],      // { t, gap, ok, word, typed, next, skipped, ignored }
    backs: [],       // { t, gap, word, deleted, fixedError, crossed, whole }
    hesitations: [], // { t, gap, word, pos }
    steps: [],       // games: { t, word, ms, misses }
    wpm: [],         // { s, wpm, raw } per second (typing rounds)
    gaps: [],        // gaps before correct letters, for consistency
    duration: 0,
  });

  function time(map, key, gap) {
    if (gap == null) return;
    const o = (map[key] ||= { sum: 0, n: 0 });
    o.sum += gap;
    o.n++;
  }

  function analyzeTyping(rec) {
    const C = TT.typingCore;
    const c = C.newCore(rec.words.slice(), rec.mode, rec.amount);
    const a = newAnalysis();
    let prevT = null;
    let prevChar = null; // last correct letter in the current word, for letter pairs
    let nextSec = 1000;
    const sample = (ms) => {
      const st = C.computeStats(c, ms);
      a.wpm.push({ s: ms / 1000, wpm: st.wpm, raw: st.raw });
    };

    for (let i = 0; i < rec.keys.length; i++) {
      const k = rec.keys[i];
      const t = rec.times[i];
      for (; nextSec <= t && nextSec <= rec.duration; nextSec += 1000) sample(nextSec);
      const gap = prevT == null ? null : t - prevT;
      prevT = t;
      const wordAt = c.index;
      const posAt = c.typed[wordAt].length;
      if (gap != null && gap >= HESITATION_MS) a.hesitations.push({ t, gap, word: rec.words[wordAt], pos: posAt });

      const d = C.applyKey(c, k);
      if (!d) {
        if (k === " ") a.spaces.push({ t, gap, ignored: true, ok: false, word: rec.words[wordAt], typed: "", next: rec.words[wordAt], skipped: 0 });
        continue;
      }
      if (d.type === "letter") {
        if (d.correct) {
          time(a.keyTimes, d.typed, gap);
          if (prevChar) time(a.bigrams, prevChar + d.typed, gap);
          if (gap != null) a.gaps.push(gap);
          prevChar = d.typed;
        } else {
          a.confusions[`${d.expected || "·"}>${d.typed}`] = (a.confusions[`${d.expected || "·"}>${d.typed}`] || 0) + 1;
          a.wrong.push({ t, expected: d.expected, typed: d.typed, word: rec.words[d.word], pos: d.pos });
          prevChar = null;
        }
      } else if (d.type === "space") {
        a.spaces.push({ t, gap, ok: d.ok, word: rec.words[d.word], typed: d.typed, next: rec.words[d.word + 1] || "", skipped: d.skipped });
        prevChar = null;
      } else {
        a.backs.push({ t, gap, word: rec.words[d.word], deleted: d.deleted, fixedError: d.fixedError, crossed: d.crossed, whole: d.whole });
        prevChar = null;
      }
    }
    for (; nextSec <= rec.duration; nextSec += 1000) sample(nextSec);
    a.duration = rec.duration;
    a.final = C.computeStats(c, rec.duration);
    return a;
  }

  function analyzeGame(rec) {
    const P = TT.pathCore;
    const g = P.newCore(structuredClone(rec.rows), rec.v || 1);
    const a = newAnalysis();
    a.typedErrors = g.v >= 2; // wrong letters stay typed, so a Backspace can be told to fix one
    let prevT = null;
    let prevChar = null;
    let stepStart = 0;
    let pending = []; // wrong keys this step; their intended letter is known once a word is finished

    for (let i = 0; i < rec.keys.length; i++) {
      const k = rec.keys[i];
      const t = rec.times[i];
      const gap = prevT == null ? null : t - prevT;
      prevT = t;
      const bufAt = g.buf;
      if (gap != null && gap >= HESITATION_MS) a.hesitations.push({ t, gap, word: bufAt ? `${bufAt}…` : "(choosing a path)", pos: bufAt.length });

      const d = P.applyKey(g, k, t);
      if (!d) continue;
      if (d.type === "miss") {
        pending.push({ t, typed: d.typed, pos: d.pos });
        prevChar = null;
      } else if (d.type === "back") {
        a.backs.push({ t, gap, word: `${bufAt}…`, deleted: d.deleted, fixedError: d.fixedError, crossed: false, whole: k === TT.typingCore.BACK_WORD });
        prevChar = null;
      } else {
        time(a.keyTimes, d.typed, gap);
        if (prevChar) time(a.bigrams, prevChar + d.typed, gap);
        if (gap != null) a.gaps.push(gap);
        prevChar = d.typed;
        if (d.type === "move") {
          for (const m of pending) {
            if (m.pos >= d.word.length) continue;
            const expected = d.word[m.pos];
            a.confusions[`${expected}>${m.typed}`] = (a.confusions[`${expected}>${m.typed}`] || 0) + 1;
            a.wrong.push({ t: m.t, expected, typed: m.typed, word: d.word, pos: m.pos });
          }
          a.steps.push({ t, word: d.word, ms: t - stepStart, misses: pending.length });
          pending = [];
          stepStart = t;
          prevChar = null;
        }
      }
    }
    P.advance(g, rec.duration);
    a.duration = rec.duration;
    a.final = { steps: g.n, ...P.gameStats(g, rec.duration) };
    return a;
  }

  function analyzeForest(rec) {
    const F = TT.forestCore;
    const g = F.newCore(rec.seed, rec.animal || "frog", rec.v || 1);
    const provider = F.recordedWords(rec);
    F.assignWords(g, provider);
    const a = newAnalysis();
    a.typedErrors = g.v >= 4;
    let prevT = null;
    let prevChar = null;
    let stepStart = 0;
    let pending = []; // wrong keys since the last hop; their intended letter is known after the hop

    for (let i = 0; i < rec.keys.length; i++) {
      const k = rec.keys[i];
      const t = rec.times[i];
      const gap = prevT == null ? null : t - prevT;
      prevT = t;
      const bufAt = g.buf;
      const typoAt = g.bad >= 0;
      if (gap != null && gap >= HESITATION_MS) a.hesitations.push({ t, gap, word: bufAt ? `${bufAt}…` : "(choosing a direction)", pos: bufAt.length });

      const d = F.applyKey(g, k, t, provider);
      if (!d) continue;
      if (d.type === "miss") {
        pending.push({ t, typed: d.typed, pos: d.pos });
        prevChar = null;
      } else if (d.type === "back") {
        a.backs.push({ t, gap, word: `${bufAt}…`, deleted: d.deleted, fixedError: d.fixedError, crossed: false, whole: k === TT.typingCore.BACK_WORD });
        prevChar = null;
      } else if (d.type === "letter") {
        time(a.keyTimes, d.typed, gap);
        if (prevChar) time(a.bigrams, prevChar + d.typed, gap);
        if (gap != null) a.gaps.push(gap);
        prevChar = d.typed;
      } else if (d.type === "space") {
        a.spaces.push({ t, gap, ok: false, ignored: d.empty, word: bufAt, typed: bufAt, next: "", skipped: 0,
          note: d.empty ? "Space with nothing typed" : typoAt ? `Space with a typo (typed "${bufAt}")` : `Space before finishing a word (typed "${bufAt}")` });
        prevChar = null;
      } else if (d.type === "hop") {
        a.spaces.push({ t, gap, ok: true, word: d.word, typed: d.word, next: "", skipped: 0 });
        for (const m of pending) {
          if (m.pos >= d.word.length) continue;
          const expected = d.word[m.pos];
          a.confusions[`${expected}>${m.typed}`] = (a.confusions[`${expected}>${m.typed}`] || 0) + 1;
          a.wrong.push({ t: m.t, expected, typed: m.typed, word: d.word, pos: m.pos });
        }
        a.steps.push({ t, word: d.word, ms: t - stepStart, misses: pending.length, dir: d.dir });
        pending = [];
        stepStart = t;
        prevChar = null;
      }
    }
    F.advance(g, rec.duration);
    a.duration = rec.duration;
    a.final = { steps: F.score(g), cause: g.cause, animal: g.animal, ...F.gameStats(g, rec.duration) };
    return a;
  }

  function analyzeTiles(rec) {
    const C = TT.tilesCore;
    const g = C.coreFor(rec);
    const provider = C.recorded(rec);
    const a = newAnalysis();
    a.typedErrors = g.v >= 2;
    a.extra = []; // missed tiles and early presses, for the moments list
    let prevT = null;
    let prevChar = null;
    let stepStart = 0;
    let pending = []; // wrong keys since the last word; their intended letter is known once it's hit
    const noteMisses = (upTo) => {
      for (let i = 0; i < g.res.length; i++) {
        const r = g.res[i];
        if (r && r.grade === "M" && !r.noted && r.t <= upTo) {
          r.noted = true;
          const word = r.w || (rec.tiles && rec.tiles[i] ? rec.tiles[i].w : "?");
          a.extra.push({ t: r.t, kind: "wrong", text: g.v >= 4 ? `Missed a tile under "${word}"` : `Missed "${word}"` });
        }
      }
    };

    for (let i = 0; i < rec.keys.length; i++) {
      const k = rec.keys[i];
      const t = rec.times[i];
      const gap = prevT == null ? null : t - prevT;
      prevT = t;
      C.advance(g, t, provider);
      noteMisses(t);
      const bufAt = g.buf;
      const typoAt = g.bad >= 0;
      // Waiting for a tile is part of the game, so only pauses in the middle of a word count.
      if (gap != null && gap >= HESITATION_MS && bufAt && k !== " ") a.hesitations.push({ t, gap, word: `${bufAt}…`, pos: bufAt.length });

      const d = C.applyKey(g, k, t, provider);
      if (!d) continue;
      if (d.type === "miss") {
        pending.push({ t, typed: d.typed, pos: d.pos });
        prevChar = null;
      } else if (d.type === "back") {
        a.backs.push({ t, gap, word: `${bufAt}…`, deleted: d.deleted, fixedError: d.fixedError, crossed: false, whole: k === TT.typingCore.BACK_WORD });
        prevChar = null;
      } else if (d.type === "letter") {
        time(a.keyTimes, d.typed, gap);
        if (prevChar) time(a.bigrams, prevChar + d.typed, gap);
        if (gap != null) a.gaps.push(gap);
        prevChar = d.typed;
      } else if (d.type === "early") {
        a.extra.push({ t, kind: "space", text: d.wrong ? `Enter on the wrong column ("${d.word}")`
          : d.d == null ? `Enter with no tile under "${d.word}"` : `Enter ${Math.round(-d.d)} ms too early on "${d.word}"` });
      } else if (d.type === "strike") {
        a.spaces.push({ t, gap, ok: false, ignored: d.empty, word: bufAt, typed: bufAt, next: "", skipped: 0,
          note: d.empty ? "Enter with nothing typed" : typoAt ? `Enter with a typo (typed "${bufAt}")` : `Enter before finishing a word (typed "${bufAt}")` });
        prevChar = null;
      } else if (d.type === "hit") {
        a.spaces.push({ t, gap, ok: true, word: d.word, typed: d.word, next: "", skipped: 0 });
        for (const m of pending) {
          if (m.pos >= d.word.length) continue;
          const expected = d.word[m.pos];
          a.confusions[`${expected}>${m.typed}`] = (a.confusions[`${expected}>${m.typed}`] || 0) + 1;
          a.wrong.push({ t: m.t, expected, typed: m.typed, word: d.word, pos: m.pos });
        }
        a.steps.push({ t, word: d.word, ms: t - stepStart, misses: pending.length, grade: d.grade, offset: d.d });
        pending = [];
        stepStart = t;
        prevChar = null;
      }
    }
    C.advance(g, rec.duration, provider);
    noteMisses(rec.duration);
    if (g.cause === "health") a.extra.push({ t: rec.duration, kind: "wrong", text: "Ran out of health" });
    a.duration = rec.duration;
    a.final = { score: g.score, counts: { ...g.counts }, maxCombo: g.maxCombo, ...C.gameStats(g, rec.duration) };
    return a;
  }

  const cache = new Map();
  function analyze(rec) {
    if (!cache.has(rec.id)) {
      cache.set(rec.id, rec.game === "forest" ? analyzeForest(rec) : rec.game === "tiles" ? analyzeTiles(rec)
        : rec.kind === "game" ? analyzeGame(rec) : analyzeTyping(rec));
    }
    return cache.get(rec.id);
  }

  // Combines several analyses; weights (newest first) let recent rounds count more.
  function combine(list, weights) {
    const out = { keyTimes: {}, bigrams: {}, confusions: {}, spaces: { n: 0, bad: 0, pause: 0, pauseN: 0 },
      backs: { n: 0, fixed: 0 }, letters: 0, hesitations: 0, rounds: list.length };
    list.forEach((a, idx) => {
      const w = weights ? weights[idx] : 1;
      for (const [k, o] of Object.entries(a.keyTimes)) {
        const t = (out.keyTimes[k] ||= { sum: 0, n: 0, raw: 0 });
        t.sum += o.sum * w; t.n += o.n * w; t.raw += o.n;
      }
      for (const [k, o] of Object.entries(a.bigrams)) {
        const t = (out.bigrams[k] ||= { sum: 0, n: 0, raw: 0 });
        t.sum += o.sum * w; t.n += o.n * w; t.raw += o.n;
      }
      for (const [k, n] of Object.entries(a.confusions)) out.confusions[k] = (out.confusions[k] || 0) + n * w;
      for (const s of a.spaces) {
        out.spaces.n += w;
        if (!s.ok) out.spaces.bad += w;
        if (s.ok && s.gap != null) { out.spaces.pause += s.gap * w; out.spaces.pauseN += w; }
      }
      for (const b of a.backs) {
        out.backs.n += w;
        if (b.fixedError) out.backs.fixed += w;
      }
      out.letters += a.gaps.length * w;
      out.hesitations += a.hesitations.length * w;
    });
    return out;
  }

  const ranked = (map, minRaw = MIN_SAMPLES) =>
    Object.entries(map)
      .filter(([, o]) => (o.raw ?? o.n) >= minRaw)
      .map(([k, o]) => ({ key: k, avg: o.sum / o.n, n: o.raw ?? o.n }))
      .sort((x, y) => y.avg - x.avg);

  const topConfusions = (map, limit = 10) =>
    Object.entries(map)
      .map(([k, n]) => ({ expected: k.split(">")[0], typed: k.split(">")[1], n }))
      .sort((x, y) => y.n - x.n)
      .slice(0, limit);

  function consistency(gaps) {
    if (gaps.length < 2) return null;
    const mean = gaps.reduce((s, x) => s + x, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((s, x) => s + (x - mean) ** 2, 0) / gaps.length);
    return { mean, sd, pct: Math.max(0, 100 - (sd / mean) * 100) };
  }

  // A time-ordered list of notable moments in one round, for jumping around a replay.
  function moments(a) {
    const list = [];
    for (const w of a.wrong) {
      list.push({ t: w.t, kind: "wrong", text: w.expected ? `Pressed ${w.typed} for ${w.expected} in "${w.word}"` : `Extra ${w.typed} after "${w.word}"` });
    }
    for (const s of a.spaces) {
      if (s.note) list.push({ t: s.t, kind: "space", text: s.note });
      else if (s.ignored) list.push({ t: s.t, kind: "space", text: `Extra space before "${s.next}"` });
      else if (!s.ok) list.push({ t: s.t, kind: "space", text: s.skipped ? `Space ${s.skipped} letter${s.skipped > 1 ? "s" : ""} early in "${s.word}" (typed "${s.typed}")` : `Space after mistyped "${s.word}" (typed "${s.typed}")` });
    }
    for (const b of a.backs) {
      const what = b.crossed && !b.deleted ? "Back into" : b.whole ? "Cleared" : b.fixedError ? "Fixed a typo in" : "Deleted a correct letter in";
      list.push({ t: b.t, kind: "back", text: `${what} "${b.word}"` });
    }
    for (const h of a.hesitations) list.push({ t: h.t, kind: "pause", text: `${(h.gap / 1000).toFixed(1)}s pause in "${h.word}"` });
    if (a.extra) list.push(...a.extra);
    if (a.final && a.final.cause && a.final.animal && TT.forestCore) {
      const c = TT.forestCore.causeText(a.final.cause, a.final.animal);
      list.push({ t: a.duration, kind: "wrong", text: c[0] + c.slice(1).toLowerCase() });
    }
    return list.sort((x, y) => x.t - y.t);
  }

  TT.review = { analyze, combine, ranked, topConfusions, consistency, moments, MIN_SAMPLES };
})();
