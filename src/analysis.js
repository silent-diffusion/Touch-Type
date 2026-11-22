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

  // keyRates and weakWords each walk the whole history (up to 2000 rounds), and one screen, or the
  // start of one round, asks for them several times. What they found is kept until the history
  // changes: it only ever gains a round at its end (losing its oldest at the cap), or is replaced
  // outright (another profile, a reset). Nothing changes a round once it's saved.
  let seen = { h: null, n: -1, first: null, last: null }, found = {};
  function kept() {
    const h = TT.store.history;
    if (seen.h !== h || seen.n !== h.length || seen.first !== h[0] || seen.last !== h[h.length - 1]) {
      seen = { h, n: h.length, first: h[0], last: h[h.length - 1] };
      found = {};
    }
    return found;
  }

  // letter -> { attempts, rate } where rate is the recency-weighted miss rate.
  function keyRates() {
    const k = kept();
    if (k.rates) return k.rates;
    const out = (k.rates = {});
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
  // They're dealt as words to type (Practice, and the games through practiceWords), where Space ends a
  // word and Tiles has no capitals, so only words of plain lower-case letters count: Wormhole once saved
  // a missed answer whole ("bald eagle", "Stilton").
  function weakWords(limit = 20) {
    const k = kept();
    if (!k.words) {
      const out = {};
      eachWeighted((e, w) => {
        for (const word of e.missedWords || []) {
          if (!/^[a-z]+$/.test(word)) continue;
          const o = (out[word] ||= { word, score: 0, count: 0 });
          o.score += w;
          o.count++;
        }
      });
      k.words = Object.values(out).sort((a, b) => b.score - a.score);
    }
    return k.words.slice(0, limit);
  }

  // (a list's total is worked out once: the games pick from the same lists on every step)
  const totals = new WeakMap();
  function pickWeighted(items) {
    let total = totals.get(items);
    if (total === undefined) {
      total = items.reduce((sum, x) => sum + x.score, 0);
      totals.set(items, total);
    }
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

  // The practice words that use the target keys, each scored by how often its keys are missed. A
  // round asks for words on every step with the same targets, so the list is kept with them.
  const keyPools = new WeakMap();
  function keyPoolFor(targets) {
    let pool = keyPools.get(targets);
    if (!pool) {
      const rate = Object.fromEntries(targets.map((t) => [t.key, t.rate]));
      pool = PRACTICE_WORDS
        .map((word) => ({ word, score: [...new Set(word)].reduce((s, l) => s + (rate[l] || 0), 0) }))
        .filter((x) => x.score > 0);
      keyPools.set(targets, pool);
    }
    return pool;
  }

  // mixPct% of words are targeted (weak-key words, plus words you've missed); the rest are ordinary.
  function practiceWords(n, targets, missed, mixPct) {
    if (!targets.length && !missed.length) return TT.randomWords(n);

    const keyPool = keyPoolFor(targets);

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
