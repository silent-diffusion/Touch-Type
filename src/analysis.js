// Turns saved history into weak keys, weak words and practice word lists.
// Recent tests count more: a test's weight halves every HALF_LIFE tests.
(() => {
  const HALF_LIFE = 10;   // tests
  const MIN_ATTEMPTS = 10; // a key needs this many attempts before it can count as weak
  const TARGET_COUNT = 5;

  const weightForAge = (age) => Math.pow(0.5, age / HALF_LIFE);

  // Walks history newest-first, calling fn(entry, weight).
  function eachWeighted(fn) {
    const h = TT.store.history;
    for (let i = h.length - 1, age = 0; i >= 0; i--, age++) fn(h[i], weightForAge(age));
  }

  // letter -> { attempts, rate } where rate is the recency-weighted miss rate.
  function keyRates() {
    const out = {};
    eachWeighted((e, w) => {
      if (!e.keys) return;
      for (const [k, [expected, missed]] of Object.entries(e.keys)) {
        const o = (out[k] ||= { attempts: 0, wExpected: 0, wMissed: 0 });
        o.attempts += expected;
        o.wExpected += w * expected;
        o.wMissed += w * missed;
      }
    });
    for (const o of Object.values(out)) o.rate = o.wExpected ? o.wMissed / o.wExpected : 0;
    return out;
  }

  function weakKeys(rates = keyRates()) {
    return Object.entries(rates)
      .filter(([, o]) => o.attempts >= MIN_ATTEMPTS && o.rate > 0)
      .sort((a, b) => b[1].rate - a[1].rate)
      .slice(0, TARGET_COUNT)
      .map(([key, o]) => ({ key, rate: o.rate }));
  }

  // [{ word, score, count }] where score is recency-weighted and count is raw misses in history.
  function weakWords(limit = 20) {
    const out = {};
    eachWeighted((e, w) => {
      for (const word of e.missedWords || []) {
        const o = (out[word] ||= { word, score: 0, count: 0 });
        o.score += w;
        o.count++;
      }
    });
    return Object.values(out).sort((a, b) => b.score - a.score).slice(0, limit);
  }

  function pickWeighted(items) {
    const total = items.reduce((sum, x) => sum + x.score, 0);
    let r = Math.random() * total;
    for (const x of items) {
      r -= x.score;
      if (r <= 0) return x.word;
    }
    return items[items.length - 1].word;
  }

  const randomWord = () => WORDS[Math.floor(Math.random() * WORDS.length)];

  TT.randomWords = (n) => {
    const out = [];
    let prev = null;
    while (out.length < n) {
      const w = randomWord();
      if (w !== prev) out.push(w);
      prev = w;
    }
    return out;
  };

  // mixPct% of words are targeted (weak-key words, plus words you've missed); the rest are ordinary.
  function practiceWords(n, targets, missed, mixPct) {
    if (!targets.length && !missed.length) return TT.randomWords(n);

    const rate = Object.fromEntries(targets.map((t) => [t.key, t.rate]));
    const keyPool = PRACTICE_WORDS
      .map((word) => ({ word, score: [...new Set(word)].reduce((s, l) => s + (rate[l] || 0), 0) }))
      .filter((x) => x.score > 0);

    const out = [];
    let prev = null;
    while (out.length < n) {
      let w;
      if (Math.random() * 100 < mixPct) {
        const useMissed = missed.length && (!keyPool.length || Math.random() < 0.3);
        w = useMissed ? pickWeighted(missed) : pickWeighted(keyPool);
      } else {
        w = randomWord();
      }
      if (w !== prev) out.push(w);
      prev = w;
    }
    return out;
  }

  // Speed tests and practice only. Game runs feed weak keys but aren't comparable for WPM.
  const typingTests = () => TT.store.history.filter((h) => h.kind !== "game");

  function summary() {
    const h = TT.store.history;
    const tests = typingTests();
    const recent = tests.slice(-10);
    const avg = (arr, f) => (arr.length ? arr.reduce((s, x) => s + f(x), 0) / arr.length : 0);
    return {
      tests: tests.length,
      wpm10: avg(recent, (x) => x.wpm),
      acc10: avg(recent, (x) => x.acc),
      best: tests.reduce((m, x) => Math.max(m, x.wpm), 0),
      seconds: h.reduce((s, x) => s + (x.seconds || 0), 0),
    };
  }

  TT.analysis = { keyRates, weakKeys, weakWords, practiceWords, summary, typingTests, MIN_ATTEMPTS, HALF_LIFE };
})();
