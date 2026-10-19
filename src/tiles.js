// Tiles: a rhythm game. Blank tiles fall down columns in time with a song, and each column has a
// word at the bottom. Type a column's word, then press Enter (or Space) as its tile crosses the
// line. Higher notes fall in columns further right. Typing is judged for accuracy, the Enter press
// for timing. (Before rules v4 the words were on the tiles themselves.)
//
// Like Forest Hop, the rules live in a pure core so replays re-run exactly. A recording keeps the
// hit times, the columns and words it was given, and the keys, so the song isn't needed to replay it.
(() => {
  const A = TT.analysis;
  const W = TT.wordInput;
  const BACK = "<", BACK_WORD = "{";
  // v2: wrong letters are typed and must be backspaced. v3: a missed tile clears the typing unless
  // it's a correct start on another tile. v4: blank tiles, a word under each column. v5: Enter on
  // time in the right column with the word mistyped or unfinished is a sloppy hit.
  //
  // Queue mode (g.queue, with v5 rules): no timing. Space locks the typed word in for the next tile
  // in falling order and you type on; each tile takes its locked-in word as it reaches the line.
  // Its tiles come QUEUE_SPEED times as often as in timed mode.
  //
  // v6: the multipliers come from progress (g.prog) rather than the combo count, and how well a word
  // was typed sets how much progress its tile gives (gain()). Points per hit are as before.
  const RULES = 6;
  const QUEUE_SPEED = 2;
  const LANES = 4;

  // gap: seconds between tiles the chart aims for (it snaps to the song's beats)
  // min: the closest two tiles can ever be, in seconds
  // fall: milliseconds a tile takes to fall from the top to the line
  // cols: how many columns (from rules v4, never fewer than three); len: word lengths
  // rate: letters a second the word-length plan allows for the time a tile gives you to type
  // (QUEUE_SPEED times as many in queue mode, so it gets the same mix of lengths, twice as often)
  // heal, typoHp: how fast health comes back (a share of HEAL) and what a wrong key costs, when
  // not the usual (1 and TYPO_HP)
  // Ludicrous, unlocked by finishing a song on Expert, is as big a step up from Expert as Expert is
  // from Hard (each setting scaled by the same ratio), and health comes back half as fast while
  // mistakes cost twice as much.
  const DIFFS = {
    easy:   { name: "EASY",   gap: 5.0,  min: 2.5,  fall: 5000, cols: 3, len: [3, 6], rate: 2.5, missHp: 8 },
    medium: { name: "MEDIUM", gap: 3.0,  min: 1.8,  fall: 4400, cols: 3, len: [3, 7], rate: 2.6, missHp: 10 },
    hard:   { name: "HARD",   gap: 2.6,  min: 1.4,  fall: 3600, cols: 4, len: [3, 8], rate: 3.5, missHp: 12 },
    expert: { name: "EXPERT", gap: 1.25, min: 0.75, fall: 2600, cols: 4, len: [4, 9], rate: 7.5, missHp: 14 },
    ludicrous: { name: "LUDICROUS", gap: 0.6, min: 0.4, fall: 1900, cols: 4, len: [5, 10], rate: 16, missHp: 28, heal: 0.5, typoHp: 4 },
  };
  const DIFF_IDS = Object.keys(DIFFS);
  // A difficulty's settings in a mode: queue mode halves the spacing, so tiles come twice as often.
  const modeDiff = (diff, queue) => {
    const D = DIFFS[diff] || DIFFS.medium;
    return queue ? { ...D, gap: D.gap / QUEUE_SPEED, min: D.min / QUEUE_SPEED } : D;
  };
  // Timing windows in ms. Early presses get more room than late ones.
  const WIN = { perfect: 60, great: 130, early: 250, late: 180 };
  // S: sloppy, on time in the right column but with the word mistyped or unfinished (v5)
  const POINTS = { P: 300, G: 200, O: 100, S: 50 };
  const HEAL = { P: 4, G: 3, O: 2, S: 0 };
  const TYPO_HP = 2, START_HP = 80, MAX_HP = 100;
  const GRADE_NAMES = { P: "PERFECT", G: "GREAT", O: "GOOD", S: "SLOPPY", M: "MISS", E: "TOO EARLY", X: "WRONG COLUMN", Q: "LOCKED IN" };
  const LEAD_MS = 1200; // quiet time before the first tile shows up
  const LYRIC_SHARE = 0.6; // for a song with untimed lyrics, about this share of words come from them
  const TITLE_SHARE = 0.12; // without lyrics, about this share of words come from the title, when one fits
  // The words of a song's title, leaving out what file names tend to carry.
  const TITLE_SKIP = new Set(["official", "video", "audio", "lyric", "lyrics", "remastered", "remaster", "feat", "version", "explicit", "music", "full", "song", "track", "the", "and", "for", "from", "with"]);
  const titleWords = (title) => (TT.lyrics ? TT.lyrics.words(title || "").filter((w) => w.length >= 3 && !TITLE_SKIP.has(w)) : []);
  const SUNG_EXTRA = 2;    // a sung word may be this many letters longer than its tile's plan allows
  // The word-length plan (planLengths): time to read a word before typing it, how much unused time
  // queue mode carries on (you can type ahead), the most letters a tile can get while an earlier
  // tile in its column is still falling, the length that counts as long (never two in a row), and
  // how much likelier each letter shorter is (1: every length up to the cap is as likely).
  const REACT_S = 0.3, QUEUE_SLACK_S = 2, SHARED_ROW_MAX = 5, LONG_AT = 7, LONGER = 1;
  // Longer common words for Tiles, which the main lists have few of (6 to 10 letters).
  const LONG_WORDS = [
    "always", "around", "before", "called", "change", "number", "people", "really", "should",
    "system", "things", "better", "family", "friend", "garden", "ground", "listen", "market",
    "minute", "moment", "nature", "office", "orange", "planet", "rather", "reason", "school",
    "silver", "simple", "spring", "street", "summer", "ticket", "travel", "winter", "window",
    "yellow", "animal", "bright", "castle", "circle", "coffee", "dinner", "follow", "forest",
    "gentle", "island", "letter", "middle", "mirror", "pencil", "pocket", "rabbit", "purple",
    "shadow", "another", "because", "between", "country", "through", "without", "against",
    "nothing", "problem", "someone", "picture", "morning", "evening", "kitchen", "example",
    "history", "journey", "library", "machine", "measure", "natural", "perfect", "popular",
    "present", "quickly", "science", "special", "student", "teacher", "weather", "welcome",
    "balance", "captain", "chapter", "careful", "comfort", "distant", "feather", "harvest",
    "imagine", "lantern", "mineral", "mystery", "octopus", "pattern", "rainbow", "station",
    "thunder", "uniform", "village", "whisper", "blanket", "compass", "dolphin", "freedom",
    "anything", "children", "together", "question", "possible", "remember", "actually", "building",
    "business", "complete", "consider", "continue", "describe", "discover", "elephant", "everyone",
    "favorite", "hospital", "language", "mountain", "neighbor", "notebook", "painting", "pleasant",
    "practice", "sentence", "shoulder", "somebody", "standard", "strength", "surprise", "swimming",
    "thousand", "treasure", "umbrella", "vacation", "whatever", "yourself", "birthday", "calendar",
    "daughter", "distance", "exercise", "festival", "keyboard", "lavender", "midnight", "sunlight",
    "triangle", "tomorrow", "beautiful", "important", "chocolate", "different", "adventure",
    "butterfly", "character", "community", "dangerous", "direction", "education", "encourage",
    "everybody", "excellent", "furniture", "happiness", "knowledge", "landscape", "newspaper",
    "orchestra", "paragraph", "pineapple", "president", "something", "telephone", "wonderful",
    "yesterday", "afternoon", "attention", "breakfast", "celebrate", "crocodile", "delicious",
    "discovery", "emergency", "fireplace", "invisible", "lightning", "marmalade", "signature",
    "snowflake", "waterfall",
    // for Ludicrous
    "background", "basketball", "everything", "friendship", "generation", "government", "helicopter",
    "incredible", "investment", "lighthouse", "motorcycle", "playground", "photograph",
    "restaurant", "skateboard", "strawberry", "understand", "watermelon", "wilderness", "attraction",
    "connection", "discussion", "experiment", "expression", "university", "volleyball", "adjustment",
    "atmosphere", "blackboard", "commercial", "confidence", "creativity", "dictionary", "electrical",
    "impossible", "instrument", "microscope", "particular", "population", "television", "throughout",
  ];
  const HISTORY_CAP = 200;

  // ×2 at 10, ×3 at 25, ×4 at 50: of the combo before v6, of progress from v6
  const MULT_AT = [10, 25, 50];
  const multiplier = (n) => (n >= 50 ? 4 : n >= 25 ? 3 : n >= 10 ? 2 : 1);
  // what the multiplier goes by: progress from v6, the combo before
  const level = (g) => (g.v >= 6 ? g.prog : g.combo);
  const multOf = (g) => multiplier(level(g));
  // how far to the next multiplier, 0 to 1 (1 at ×4)
  const toNext = (g) => {
    const n = level(g);
    let from = 0;
    for (const at of MULT_AT) {
      if (n < at) return (n - from) / (at - from);
      from = at;
    }
    return 1;
  };
  // v6: how much progress a tile gives, from how its word was typed. clean: no wrong keys and no
  // backspaces. Timed: a clean word with a perfect hit 3, a correct word with any good hit 2.
  // Queue mode (always perfect, so it goes by the typing): a correct word 1, a clean one 2, and a
  // clean one typed faster than your speed so far this round 3. A sloppy hit or lock-in gives the
  // share of its letters typed right, never less than half.
  const SLOPPY_MIN = 0.5;
  const sloppyGain = (typed, word) => Math.max(SLOPPY_MIN, typed.length / word.length);
  const letterGrade = (timing) => (timing >= 95 ? "S" : timing >= 85 ? "A" : timing >= 70 ? "B" : timing >= 50 ? "C" : "D");

  // ---------- chart ----------

  // How a chart weighs a beat: how much it stands out (w, 0 to 1) plus a little for starting a bar.
  const DOWN_BONUS = 0.15;
  // How much a gap away from the difficulty's target spacing costs, against a beat's weight.
  const SPACING = 2.5;
  const WORD_COST = 0.3;
  const beatValue = (b) => (b.w > 0 ? Math.min(1, b.w + (b.down ? DOWN_BONUS : 0)) : 0);

  // The hit times (ms of song time) for a song at a difficulty. Of the beats where something
  // happens, it picks the set with the most total weight while keeping the gaps close to the
  // difficulty's spacing and never under its minimum, so words land on the music's important
  // moments: long and phrase-starting melody notes in built-in songs, the hardest hits in added ones.
  // (Dynamic programming, like the beat tracker in beats.js.) If a difficulty comes out as sparse
  // as the easier one, it aims a little tighter, so a harder one has more tiles whenever it can.
  function chart(song, diff, queue = false) {
    const mode = queue ? "queue" : "timed";
    song.charts ||= {};
    if (!song.charts[mode]) {
      const out = (song.charts[mode] = {});
      const meanGap = (h) => (h.length > 1 ? (h[h.length - 1] - h[0]) / 1000 / (h.length - 1) : Infinity);
      let prev = Infinity;
      for (const id of DIFF_IDS) {
        const D = modeDiff(id, queue);
        let hits = pick(song, D, D.gap);
        if (meanGap(hits) > prev * 0.97) hits = pick(song, D, prev * 0.85);
        out[id] = hits;
        prev = meanGap(hits);
      }
    }
    return song.charts[mode][diff];
  }

  function pick(song, D, target) {
    const end = song.duration - 0.25;
    const c = song.beats.filter((b) => b.t >= 0.5 && b.t <= end && beatValue(b) > 0);
    const n = c.length;
    // Each word costs the average beat's weight, so only beats that stand out are worth crowding in.
    const cost = WORD_COST * c.reduce((sum, b) => sum + beatValue(b), 0) / Math.max(1, n);
    const score = new Float64Array(n);
    const back = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      const v = beatValue(c[i]) - cost;
      score[i] = c[i].t <= c[0].t + target ? v : -Infinity; // the chart starts near the song's start
      for (let j = i - 1; j >= 0; j--) {
        const gap = c[i].t - c[j].t;
        if (gap < D.min * 0.95) continue;
        const s = score[j] + v - SPACING * Math.log(gap / target) ** 2;
        if (s > score[i]) {
          score[i] = s;
          back[i] = j;
        }
      }
    }
    // The chart ends on the best beat near the end of the song, then follows the picks back.
    let last = -1;
    for (let i = 0; i < n; i++) if (c[i].t >= c[n - 1].t - target && (last < 0 || score[i] > score[last])) last = i;
    const out = [];
    for (let i = last; i >= 0; i = back[i]) out.push(Math.round(c[i].t * 1000));
    return out.reverse();
  }

  // The column of each of a chart's tiles: its note's pitch against the chart's other notes, so the
  // lowest notes fall on the left and the highest on the right. Equal notes share a column.
  function columns(song, diff, queue = false) {
    const cols = DIFFS[diff].cols;
    const at = new Map(song.beats.map((b) => [Math.round(b.t * 1000), b.p]));
    let last = null;
    const ps = chart(song, diff, queue).map((h) => (last = at.get(h) ?? last));
    const known = ps.filter((p) => p != null).sort((a, b) => a - b);
    if (!known.length) return ps.map((_, i) => i % cols);
    const below = (p) => {
      let lo = 0, eq = 0;
      for (const q of known) { if (q < p) lo++; else if (q === p) eq++; }
      return (lo + eq / 2) / known.length;
    };
    return ps.map((p) => (p == null ? Math.floor(cols / 2) : Math.min(cols - 1, Math.floor(below(p) * cols))));
  }

  // How long each tile's word may be, and the length it aims for. You type one word at a time, so a
  // tile's typing time is the gap since the tile before it in any column (less a moment to read).
  // That time at the difficulty's rate caps the length, so a long word only follows a long gap and
  // two long words never come in quick succession. In queue mode time you didn't need carries on,
  // up to QUEUE_SLACK_S, since you can type ahead. A tile that appears while an earlier tile in its
  // column is still falling gets no more than SHARED_ROW_MAX letters, and a long word (LONG_AT
  // letters or more) is never straight after another. Within the cap, each extra letter is LONGER
  // times as likely. Returns [{ L, max, raw }] per tile:
  // the length to aim for, the cap, and the cap before the difficulty's limits.
  function planLengths(hits, lanes, diff, queue = false, fall = DIFFS[diff].fall, rnd = Math.random) {
    const D = DIFFS[diff];
    const [lo, hi] = D.len;
    const lastIn = new Map();
    let slack = 0, prevL = 0;
    return hits.map((h, i) => {
      const rate = queue ? D.rate * QUEUE_SPEED : D.rate;
      const avail = (h - (i ? hits[i - 1] : 0)) / 1000 - REACT_S + (queue ? slack : 0);
      const raw = Math.floor(avail * rate);
      let max = Math.max(lo, Math.min(hi, raw));
      const prev = lastIn.get(lanes[i]);
      if (prev != null && prev > h - fall) max = Math.min(max, Math.max(lo, SHARED_ROW_MAX));
      lastIn.set(lanes[i], h);
      if (prevL >= LONG_AT) max = Math.min(max, Math.max(lo, LONG_AT - 1));
      let total = 0;
      for (let n = lo; n <= max; n++) total += LONGER ** (n - lo);
      let r = rnd() * total, L = lo;
      while (L < max && (r -= LONGER ** (L - lo)) > 0) L++;
      if (queue) slack = Math.min(QUEUE_SLACK_S, Math.max(0, avail - L / rate));
      prevL = L;
      return { L, max, raw };
    });
  }

  // Timed lyrics: the word sung as each of a chart's tiles reaches the line, or null. Each sung
  // word goes to the nearest tile within its tolerance (song.sungWords), and to only one tile.
  function sungWords(song, diff, queue = false) {
    const hits = chart(song, diff, queue), sw = song.sungWords || [];
    const out = hits.map(() => null);
    if (!sw.length) return out;
    const used = new Set();
    hits.forEach((h, i) => {
      let best = -1, bestD = Infinity;
      for (let k = 0; k < sw.length; k++) {
        if (used.has(k)) continue;
        const d = Math.abs(sw[k].t * 1000 - h);
        if (d < bestD) { bestD = d; best = k; }
      }
      if (best >= 0 && bestD <= sw[best].tol * 1000) { used.add(best); out[i] = sw[best].w; }
    });
    return out;
  }

  // The first hit of the charts before they followed the music, for older recordings that didn't
  // save where the song started: the first bar (with sound, in an added song) half a second in.
  const oldFirstHit = (song) => {
    const b = song.beats.find((x) => x.down && x.t >= 0.5 && (!song.user || x.any));
    return b ? Math.round(b.t * 1000) : 0;
  };

  // ---------- core ----------

  // hits: game-time ms at which each tile reaches the line. endT: when the round ends.
  // From v4, lanes: each tile's column, and cols: how many columns there are.
  function newCore({ hits, fall, endT, diff, v = RULES, lanes = null, cols = 4, queue = false }) {
    return {
      v, hits, fall, endT, diff, lanes, cols, queue,
      words: null,      // v4: the word under each column
      wordN: 0,         // v4: how many words have been dealt
      missHp: (DIFFS[diff] || DIFFS.medium).missHp,
      heal: (DIFFS[diff] || DIFFS.medium).heal ?? 1,      // how fast health comes back
      typoHp: (DIFFS[diff] || DIFFS.medium).typoHp ?? TYPO_HP, // what a wrong key costs
      next: 0,          // index of the next tile to appear
      tiles: [],        // on screen, oldest first: { i, l, born } (and w, the word, before v4; q, the locked-in word, in queue mode)
      res: [],          // per tile: { grade, d, t }
      buf: "", bad: -1,
      score: 0, combo: 0, maxCombo: 0, hp: START_HP,
      prog: 0,          // v6: progress toward the multipliers
      dirty: false,     // v6: a wrong key or a backspace since the last word
      keys: 0, correct: 0, mistakes: 0, chars: 0,
      counts: { P: 0, G: 0, O: 0, S: 0, M: 0 },
      offsets: [],      // ms early (-) or late (+) of each hit
      keyStats: {}, missedWords: new Set(), stepMisses: [],
      last: null,       // the latest judgment: { grade, t, i, l, d }
      over: false, endAt: 0, cause: null,
    };
  }

  // v4: the column whose word the correctly typed letters start, or -1. Its words all start with
  // different letters, so the first one picks the column.
  const column = (g) => {
    const typed = W.good(g);
    return typed && g.words ? g.words.findIndex((w) => w.startsWith(typed)) : -1;
  };

  // Queue mode: the next tile in falling order without a locked-in word. It may not have appeared
  // yet ({ i, l, unseen: true }), so you can type ahead; null once every tile has a word.
  function nextUp(g) {
    const tile = g.tiles.find((x) => !x.q);
    if (tile) return tile;
    return g.next < g.hits.length ? { i: g.next, l: g.lanes[g.next], unseen: true } : null;
  }

  // The tile you're typing toward: before v4, the first one whose word the typed letters fit;
  // from v4, the lowest tile in the column you're typing; in queue mode, the next one up.
  const target = (g) => {
    if (g.queue) {
      const up = nextUp(g);
      return up && !up.unseen ? up : null;
    }
    if (g.v >= 4) {
      const c = column(g);
      return c < 0 ? null : g.tiles.find((x) => x.l === c) || null;
    }
    const typed = W.good(g);
    return typed ? g.tiles.find((x) => x.w.startsWith(typed)) || null : null;
  };

  // v4: deals a column a new word. provider(g, column, t) picks it live and replays it from a recording.
  function deal(g, c, t, provider) {
    g.words[c] = provider(g, c, t);
    g.wordN++;
  }

  // Deals every column its first word (v4; nothing to do before that).
  function dealWords(g, provider) {
    if (g.v < 4) return;
    g.words = [];
    for (let c = 0; c < g.cols; c++) deal(g, c, 0, provider);
  }

  // Wrong keys are tied to a letter once it's known which word they were for. `letters` is what
  // was typed correctly of `word`. Before v2, wrong keys past what was typed weren't counted.
  const attribute = (g, letters, word = letters) => W.attribute(g, letters, g.v >= 2 ? word : letters, word);

  // The typing starts over for the next word, and the next word starts clean.
  function nextWord(g) {
    W.reset(g);
    g.dirty = false;
  }

  function finish(g, t, cause) {
    g.over = true;
    g.endAt = t;
    g.cause = cause;
  }

  function hurt(g, n, t) {
    g.hp = Math.max(0, g.hp - n);
    if (g.hp <= 0) finish(g, t, "health");
  }

  function spawn(g, t, provider) {
    const i = g.next++;
    if (g.v >= 4) return g.tiles.push({ i, l: g.lanes[i], born: t });
    const { w, l } = provider(g, i, t);
    g.tiles.push({ i, w, l, born: t });
  }

  function miss(g, tile, t) {
    g.tiles = g.tiles.filter((x) => x !== tile);
    if (g.v >= 4) return missColumn(g, tile, t);
    // The typing starts fresh for the next word, unless it's a correct start on another tile.
    // What was typed for the missed word (wrong keys too) still counts toward key stats.
    const typed = W.good(g);
    const forThis = !!typed && tile.w.startsWith(typed);
    const forOther = !!typed && g.tiles.some((x) => x.w.startsWith(typed));
    if (forOther) {
      // keep typing toward the other tile
    } else if (forThis) {
      attribute(g, typed, tile.w);
      W.drop(g);
      W.reset(g);
    } else if (g.v >= 3 && g.buf) {
      attribute(g, "", tile.w); // nothing fitted a word, so the wrong keys were for the missed one
      W.drop(g);
      W.reset(g);
    }
    missed(g, tile, t, tile.w);
  }

  // v4: the typing starts fresh unless it's a correct start on another column's word. What was typed
  // for this column (or that fit no column) counts toward its word's key stats.
  function missColumn(g, tile, t) {
    const word = g.words[tile.l];
    const c = column(g);
    if (g.buf && (c === tile.l || c < 0)) {
      attribute(g, c === tile.l ? W.good(g) : "", word);
      W.drop(g);
      nextWord(g);
    }
    missed(g, tile, t, word);
  }

  function missed(g, tile, t, word) {
    g.res[tile.i] = { grade: "M", t, w: word };
    g.counts.M++;
    g.combo = 0;
    g.prog = 0;
    g.last = { grade: "M", t, i: tile.i, l: tile.l };
    hurt(g, g.missHp, t);
  }

  function hit(g, tile, d, t, word = tile.w) {
    const a = Math.abs(d);
    const grade = a <= WIN.perfect ? "P" : a <= WIN.great ? "G" : "O";
    g.tiles = g.tiles.filter((x) => x !== tile);
    g.keys++;
    g.correct++;
    const misses = attribute(g, word);
    g.res[tile.i] = { grade, d, t, w: word };
    g.counts[grade]++;
    g.combo++;
    g.maxCombo = Math.max(g.maxCombo, g.combo);
    const gain = !g.dirty && grade === "P" ? 3 : 2;
    if (g.v >= 6) g.prog += gain;
    g.score += POINTS[grade] * multOf(g);
    g.hp = Math.min(MAX_HP, g.hp + HEAL[grade] * g.heal);
    g.chars += word.length + 1;
    g.offsets.push(d);
    W.done(g, word);
    nextWord(g);
    g.last = { grade, t, i: tile.i, l: tile.l, d, gain };
    return { type: "hit", grade, d, word, misses, i: tile.i, gain };
  }

  // v5: Enter on time in the right column, with the word mistyped or unfinished. It still takes the
  // tile, for the fewest points, without healing or hurting, and leaves the combo as it was. The
  // letters typed right count toward key stats, the wrong ones as misses, and the word goes on the
  // missed-words list.
  function sloppy(g, tile, d, t, word) {
    const typed = W.good(g);
    g.tiles = g.tiles.filter((x) => x !== tile);
    g.keys++;
    const misses = attribute(g, typed, word);
    g.missedWords.add(word);
    g.res[tile.i] = { grade: "S", d, t, w: word };
    g.counts.S++;
    const gain = sloppyGain(typed, word);
    if (g.v >= 6) g.prog += gain;
    g.score += POINTS.S * multOf(g);
    g.chars += typed.length;
    g.offsets.push(d);
    W.drop(g);
    nextWord(g);
    g.last = { grade: "S", t, i: tile.i, l: tile.l, d, gain };
    return { type: "hit", grade: "S", d, word, misses, i: tile.i, sloppy: true, gain };
  }

  // Runs everything that happens on its own (tiles appearing, tiles passing the line, the song
  // ending) up to time t, in time order. Returns true once the round is over.
  function advance(g, t, provider) {
    while (!g.over) {
      const spawnT = g.next < g.hits.length ? g.hits[g.next] - g.fall : Infinity;
      // queue mode: a tile with a locked-in word takes it at the line; one without is missed as usual
      const head = g.tiles[0];
      const missT = head ? g.hits[head.i] + (head.q ? 0 : WIN.late) : Infinity;
      const ev = Math.min(spawnT, missT, g.endT);
      if (ev > t) break;
      if (ev === missT) {
        if (head.q) register(g, head, ev);
        else miss(g, head, ev);
      }
      else if (ev === spawnT) spawn(g, ev, provider);
      else finish(g, ev, "done");
    }
    return g.over;
  }

  // Applies one key press at time t. " " is the strike key (Enter or Space).
  function applyKey(g, k, t, provider) {
    if (advance(g, t, provider)) return null;
    if (k === BACK || k === BACK_WORD) {
      const b = W.back(g, k === BACK_WORD);
      if (b) {
        W.mark(g, t);
        g.dirty = true;
      }
      return b && { type: "back", ...b, buf: g.buf };
    }
    if (k === " " && g.queue) return lockIn(g, t, provider);
    if (k === " " && g.v >= 4) return strikeColumn(g, t, provider);
    if (k === " ") {
      const tile = target(g);
      if (tile && W.ready(g, tile.w)) {
        const d = t - g.hits[tile.i];
        if (d < -WIN.early) {
          g.last = { grade: "E", t, i: tile.i, l: tile.l, d };
          return { type: "early", d, word: tile.w };
        }
        return hit(g, tile, d, t);
      }
      if (g.buf) {
        g.keys++;
        g.mistakes++;
      }
      return { type: "strike", ok: false, buf: g.buf, empty: !g.buf };
    }
    // queue mode: only the next tile's word fits, so another column's word shows as a typo at once
    const up = g.queue ? nextUp(g) : null;
    const fits = up ? (s) => g.words[up.l].startsWith(s)
      : g.v >= 4 ? (s) => g.words.some((w) => w.startsWith(s)) : (s) => g.tiles.some((x) => x.w.startsWith(s));
    const r = W.letter(g, k, fits, g.v < 2);
    if (!r) return null;
    W.mark(g, t);
    g.keys++;
    if (!r.ok) {
      g.dirty = true;
      g.stepMisses.push({ pos: r.pos, typed: k });
      g.mistakes++;
      hurt(g, g.typoHp, t);
      return { type: "miss", typed: k, pos: r.pos, buf: g.buf };
    }
    g.correct++;
    return { type: "letter", typed: k, pos: r.pos, buf: g.buf };
  }

  // v4: Enter or Space with a column's word typed hits the lowest tile in that column. With no tile
  // there close enough, it's a mistake (too early, or the wrong column if another column's tile is
  // at the line) and the typing stays, so you can still go on to hit it.
  function strikeColumn(g, t, provider) {
    const c = column(g);
    if (g.v >= 5 && c >= 0 && !W.ready(g, g.words[c])) {
      const tile = g.tiles.find((x) => x.l === c);
      const d = tile ? t - g.hits[tile.i] : null;
      if (tile && d >= -WIN.early) {
        const out = sloppy(g, tile, d, t, g.words[c]);
        deal(g, c, t, provider);
        return out;
      }
    }
    if (c < 0 || !W.ready(g, g.words[c])) {
      if (g.buf) {
        g.keys++;
        g.mistakes++;
      }
      return { type: "strike", ok: false, buf: g.buf, empty: !g.buf };
    }
    const word = g.words[c];
    const tile = g.tiles.find((x) => x.l === c);
    const d = tile ? t - g.hits[tile.i] : null;
    if (!tile || d < -WIN.early) {
      g.keys++;
      g.mistakes++;
      const wrong = g.tiles.some((x) => x.l !== c && t - g.hits[x.i] >= -WIN.early);
      g.last = { grade: wrong ? "X" : "E", t, i: tile ? tile.i : -1, l: c, d };
      return { type: "early", wrong, d, word, col: c };
    }
    const out = hit(g, tile, d, t, word);
    deal(g, c, t, provider);
    return out;
  }

  // Queue mode: Space locks the typed word in for the next tile in falling order, once that tile has
  // appeared. Typed right, the tile will be a perfect hit; mistyped or unfinished (but begun right),
  // a sloppy one. The column gets a new word straight away, and the tile takes its word as it
  // reaches the line, or at once if it's already there. Space before the tile has appeared is a
  // mistake, and the typing stays for when it has.
  function lockIn(g, t, provider) {
    if (!g.buf) return { type: "strike", ok: false, buf: "", empty: true };
    const up = nextUp(g);
    const c = column(g);
    if (c < 0 || !up || c !== up.l) {
      g.keys++;
      g.mistakes++;
      return { type: "strike", ok: false, buf: g.buf, empty: false };
    }
    const word = g.words[c];
    if (up.unseen) {
      g.keys++;
      g.mistakes++;
      g.last = { grade: "E", t, i: up.i, l: c, d: null };
      return { type: "early", wrong: false, d: null, word, col: c };
    }
    const ok = W.ready(g, word);
    const typed = W.good(g);
    g.keys++;
    let misses, gain;
    if (ok) {
      // faster than so far this round: this word's letters a millisecond against the round's
      const gaps = word.length - 1;
      const ms = Math.max(g.lastT - g.wordT, gaps * W.MIN_GAP_MS);
      const faster = g.typeMs > 0 && gaps / ms > g.typeChars / g.typeMs;
      gain = g.dirty ? 1 : faster ? 3 : 2;
      g.correct++;
      misses = attribute(g, word);
      g.chars += word.length + 1;
      W.done(g, word);
    } else {
      gain = sloppyGain(typed, word);
      misses = attribute(g, typed, word);
      g.missedWords.add(word);
      g.chars += typed.length;
      W.drop(g);
    }
    nextWord(g);
    up.q = { w: word, ok, t, gain };
    g.last = { grade: "Q", t, i: up.i, l: c, d: null };
    deal(g, c, t, provider);
    if (t >= g.hits[up.i]) register(g, up, t);
    return { type: "hit", grade: ok ? "P" : "S", d: null, word, misses, i: up.i, sloppy: !ok, queued: true, gain };
  }

  // Queue mode: a tile takes its locked-in word at the line. Like a hit (or a sloppy hit), without timing.
  function register(g, tile, t) {
    const { w, ok, gain } = tile.q;
    const grade = ok ? "P" : "S";
    g.tiles = g.tiles.filter((x) => x !== tile);
    g.res[tile.i] = { grade, d: null, t, w };
    g.counts[grade]++;
    if (ok) {
      g.combo++;
      g.maxCombo = Math.max(g.maxCombo, g.combo);
      g.hp = Math.min(MAX_HP, g.hp + HEAL.P * g.heal);
    }
    if (g.v >= 6) g.prog += gain;
    g.score += POINTS[grade] * multOf(g);
    g.last = { grade, t, i: tile.i, l: tile.l, d: null, gain };
  }

  function gameStats(g, ms) {
    const minutes = ms / 60000;
    const c = g.counts;
    const judged = c.P + c.G + c.O + (c.S || 0) + c.M;
    const avg = g.offsets.length ? g.offsets.reduce((s, x) => s + x, 0) / g.offsets.length : 0;
    return {
      wpm: minutes > 1 / 60 ? W.wpm(g) : 0, // typing time only, scaled to the speed test (input.js)
      acc: g.keys ? (g.correct / g.keys) * 100 : 100,
      timing: judged ? ((c.P + c.G * 0.7 + c.O * 0.4 + (c.S || 0) * 0.2) / judged) * 100 : 100,
      judged,
      avg,
    };
  }

  // Providers that hand out what a recording saved: before v4 each tile's word and lane, from v4
  // the column words in the order they were dealt.
  const recordedTiles = (rec) => (g, i) => rec.tiles[i] || { w: "word", l: i % LANES };
  const recordedWords = (rec) => (g) => (rec.words && rec.words[g.wordN]) || "word";
  const recorded = (rec) => ((rec.v || 1) >= 4 ? recordedWords(rec) : recordedTiles(rec));
  // A fresh core for a recording, ready to replay.
  function coreFor(rec) {
    const g = newCore({ hits: rec.hits, fall: rec.fall, endT: rec.endT, diff: rec.diff, v: rec.v || 1, lanes: rec.lanes, cols: rec.cols, queue: !!rec.queue });
    g.wpmScale = rec.wpmScale ?? W.scale();
    dealWords(g, recorded(rec));
    return g;
  }

  // Thunder, for when Ludicrous is unlocked: a crack at each flash (times in seconds from now),
  // then a long, rolling rumble.
  function thunder(cracks = [0, 0.18, 0.52]) {
    const ctx = getAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.02;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0, last = 0; i < len; i++) d[i] = last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; // a little darker than white noise
    const burst = (t, dur, type, f, f1, peak, attack) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.setValueAtTime(f, t);
      fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(fl).connect(g).connect(ctx.destination);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.05);
      return g;
    };
    cracks.forEach((c, i) => burst(t0 + c, 0.35, "highpass", 1800, 600, i === cracks.length - 1 ? 0.9 : 0.5, 0.004));
    // the rumble rolls: its loudness wobbles as it fades
    const rumble = burst(t0 + 0.25, 3.4, "lowpass", 260, 60, 1.2, 0.18);
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 5;
    depth.gain.value = 0.25;
    lfo.connect(depth).connect(rumble.gain);
    lfo.start(t0);
    lfo.stop(t0 + 3.8);
  }

  TT.tilesAudio = { get: () => getAudio(), quickSplit, thunder }; // quickSplit: for tests

  TT.tilesCore = {
    DIFFS, DIFF_IDS, WIN, RULES, GRADE_NAMES, QUEUE_SPEED, modeDiff, nextUp, planLengths, LONG_WORDS, MULT_AT, level, multOf, toNext,
    chart, columns, sungWords, titleWords, audioReady, newCore, dealWords, coreFor, applyKey, advance, gameStats, target, column, attribute, recorded, multiplier, letterGrade,
  };

  // ---------- sound ----------

  let audioCtx = null;
  function getAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC({ latencyHint: "interactive" });
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  // Waits until the audio clock is really running (it's moved on), at most `wait` ms. The round's
  // clock mustn't start before it: anything scheduled while the audio device is still waking (which
  // can take a moment, more so on Bluetooth) plays late, and the music then jumps to catch up.
  function audioReady(ctx, wait = 2000) {
    return new Promise((resolve) => {
      if (!ctx) return resolve();
      if (ctx.state !== "running") ctx.resume().catch(() => {});
      const t0 = performance.now(), c0 = ctx.currentTime;
      const check = () => {
        if ((ctx.state === "running" && ctx.currentTime > c0) || performance.now() - t0 > wait) resolve();
        else setTimeout(check, 10);
      };
      check();
    });
  }

  function tone(ctx, bus, n, at) {
    const f = 440 * 2 ** ((n.midi - 69) / 12);
    const len = Math.min(Math.max(n.d, 0.12), 1.6) + 0.25;
    // voice 0 the melody, 1 the bass, 2 the harmony: soft, a little slower to come in
    const harmony = n.voice === 2;
    const peak = harmony ? 0.055 : n.voice ? 0.1 : 0.15;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(peak, at + (harmony ? 0.03 : 0.008));
    env.gain.exponentialRampToValueAtTime(0.0008, at + len);
    // Stereo: the melody mostly left and the bass mostly right (the harmony in the middle), so the
    // music has some width.
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = harmony ? 0 : n.voice ? 0.6 : -0.6;
      env.connect(pan).connect(bus);
    } else env.connect(bus);
    const o = ctx.createOscillator();
    o.type = harmony ? "sine" : "triangle";
    o.frequency.value = f;
    o.connect(env);
    o.start(at);
    o.stop(at + len + 0.02);
    if (!n.voice) {
      // a quiet octave on top makes the melody sound a little more like a piano
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      g2.gain.value = 0.22;
      o2.type = "sine";
      o2.frequency.value = f * 2;
      o2.connect(g2).connect(env);
      o2.start(at);
      o2.stop(at + len + 0.02);
    }
  }

  // The built-in songs' drums: a kick (a sine falling in pitch), a snare (a noise burst and a short
  // tone) and a hi-hat (high noise), all kept light so the pieces still sound like themselves.
  const noiseFor = new WeakMap();
  function noise(ctx) {
    if (!noiseFor.has(ctx)) {
      const b = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.5), ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseFor.set(ctx, b);
    }
    return noiseFor.get(ctx);
  }
  function drum(ctx, bus, kind, at) {
    const env = ctx.createGain();
    env.connect(bus);
    if (kind === "kick") {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(140, at);
      o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
      env.gain.setValueAtTime(0.2, at);
      env.gain.exponentialRampToValueAtTime(0.001, at + 0.28);
      o.connect(env);
      o.start(at);
      o.stop(at + 0.3);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = kind === "hat" ? 7000 : 1500;
    src.connect(hp).connect(env);
    const len = kind === "hat" ? 0.045 : 0.13;
    env.gain.setValueAtTime(kind === "hat" ? 0.035 : 0.11, at);
    env.gain.exponentialRampToValueAtTime(0.0008, at + len);
    src.start(at);
    src.stop(at + len + 0.02);
    if (kind === "snare") {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = 190;
      g.gain.setValueAtTime(0.07, at);
      g.gain.exponentialRampToValueAtTime(0.0008, at + 0.06);
      o.connect(g).connect(bus);
      o.start(at);
      o.stop(at + 0.08);
    }
  }

  // The quick split, for added songs that haven't been separated properly: from the mix, the low
  // end (bass and kick drum), the middle's voice range (where a lead vocal sits), and the sides plus
  // the highs (most other instruments), each to its own analyser. Rough, but instant.
  function quickSplit(ctx, input, feeds) {
    const split = ctx.createChannelSplitter(2);
    input.connect(split);
    const mid = ctx.createGain(), side = ctx.createGain();
    const l = ctx.createGain(), r = ctx.createGain(), rNeg = ctx.createGain();
    l.gain.value = 0.5;
    r.gain.value = 0.5;
    rNeg.gain.value = -0.5;
    split.connect(l, 0);
    split.connect(r, 1);
    split.connect(rNeg, 1);
    l.connect(mid);
    r.connect(mid);
    l.connect(side);
    rNeg.connect(side);
    const filter = (from, type, hz) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = hz;
      from.connect(f);
      return f;
    };
    filter(mid, "lowpass", 160).connect(feeds.low);
    filter(filter(mid, "highpass", 300), "lowpass", 3400).connect(feeds.vocal);
    side.connect(feeds.other);
    filter(mid, "highpass", 3800).connect(feeds.other);
  }
  // Separated stems (the AI model, when a song has them): each played silently in step with the
  // song, into its feed. vocals to the vocal line; drums and bass to the outline; the rest to the sparks.
  const STEM_FEEDS = { vocals: "vocal", drums: "low", bass: "low", other: "other" };

  function click(ctx, bus, down, at) {
    const o = ctx.createOscillator();
    const env = ctx.createGain();
    o.type = "square";
    o.frequency.value = down ? 1500 : 1000;
    env.gain.setValueAtTime(down ? 0.07 : 0.045, at);
    env.gain.exponentialRampToValueAtTime(0.0005, at + 0.04);
    o.connect(env).connect(bus);
    o.start(at);
    o.stop(at + 0.05);
  }

  const RESYNC_S = 0.08; // how far an added song's audio may drift from the game before it's lined up again

  // Plays a song in step with the game clock. startPerf: performance.now() time of song time 0.
  // Notes are scheduled a little ahead on the audio clock, and started early by the output
  // latency so they're heard right when the tiles reach the line.
  function createPlayer({ song, startPerf, music, metronome }) {
    const ctx = music || metronome ? getAudio() : null;
    if (!ctx) return { pump() {}, stop() {} };
    const bus = ctx.createGain();
    bus.gain.value = 0.9;
    bus.connect(ctx.destination);
    // What's playing, split into left and right, for Scope mode to draw.
    const split = ctx.createChannelSplitter(2);
    const left = ctx.createAnalyser(), right = ctx.createAnalyser();
    left.fftSize = right.fftSize = 2048;
    bus.connect(split);
    split.connect(left, 0);
    split.connect(right, 1);
    // The music in three parts for Scope mode's ×4 (vocal, low, other), each to its own analyser.
    // The built-in songs' parts go through their own buses: melody to vocal (it's what's sung),
    // bass and drums to low, harmony to other.
    const feeds = {}, parts = {};
    for (const k of ["vocal", "low", "other"]) {
      feeds[k] = ctx.createAnalyser();
      feeds[k].fftSize = 2048;
      parts[k] = ctx.createGain();
      parts[k].connect(bus);
      parts[k].connect(feeds[k]);
    }
    const partOf = (n) => (n.voice === 0 ? parts.vocal : n.voice === 1 ? parts.low : parts.other);
    const tap = { left, right, rate: ctx.sampleRate, feeds };
    // metronome: a one-bar count-in, then every beat
    const clicks = [];
    if (metronome) {
      const first = song.beats[0];
      const per = first ? first.len : 0.5;
      for (let k = song.bar; k >= 1; k--) clicks.push({ t: -k * per, down: k === song.bar });
      for (const b of song.beats) clicks.push({ t: b.t, down: b.down });
    }
    let ni = 0;
    let ci = 0;
    let di = 0;
    let sync = null;
    let stopped = false;
    let source = null, sourceZero = 0, stems = [];
    const stopSources = () => {
      for (const s of [source, ...stems]) {
        try { if (s) s.stop(); } catch {}
      }
      source = null;
      stems = [];
    };
    return {
      tap,
      pump() {
        if (stopped) return;
        const now = performance.now() / 1000;
        const m = ctx.currentTime - now;
        if (sync == null || Math.abs(m - sync) > 0.03) sync = m;
        const lat = ctx.outputLatency || ctx.baseLatency || 0;
        const zero = startPerf / 1000 + sync - lat; // song time 0 on the audio clock
        const horizon = ctx.currentTime + 0.3;
        // if the audio clock and the game's have drifted apart (the audio stalled, say), the file
        // starts again from where the game is, rather than playing on out of step
        if (source && Math.abs(zero - sourceZero) > RESYNC_S) stopSources();
        if (music && song.buffer && !source && zero < horizon) {
          // an added song: the whole file, started so its time 0 lines up with the game
          source = ctx.createBufferSource();
          source.buffer = song.buffer;
          const gain = ctx.createGain();
          gain.gain.value = 0.85;
          source.connect(gain).connect(bus);
          const late = Math.max(0, ctx.currentTime - zero);
          source.start(Math.max(zero, ctx.currentTime), late);
          sourceZero = zero;
          // the parts for the visuals: separated stems if the song has them, else the quick split
          if (song.stems) {
            for (const [name, buffer] of Object.entries(song.stems)) {
              if (!buffer || !STEM_FEEDS[name]) continue;
              const s = ctx.createBufferSource();
              s.buffer = buffer;
              s.connect(feeds[STEM_FEEDS[name]]);
              s.start(Math.max(zero, ctx.currentTime), late);
              stems.push(s);
            }
          } else quickSplit(ctx, gain, feeds);
        }
        if (music) {
          for (; ni < song.notes.length && zero + song.notes[ni].t < horizon; ni++) {
            const at = zero + song.notes[ni].t;
            if (at >= ctx.currentTime - 0.02) tone(ctx, partOf(song.notes[ni]), song.notes[ni], Math.max(at, ctx.currentTime));
          }
          const drums = song.drums || [];
          for (; di < drums.length && zero + drums[di].t < horizon; di++) {
            const at = zero + drums[di].t;
            if (at >= ctx.currentTime - 0.02) drum(ctx, parts.low, drums[di].kind, Math.max(at, ctx.currentTime));
          }
        }
        for (; ci < clicks.length && zero + clicks[ci].t < horizon; ci++) {
          const at = zero + clicks[ci].t;
          if (at >= ctx.currentTime - 0.02) click(ctx, bus, clicks[ci].down, Math.max(at, ctx.currentTime));
        }
      },
      stop() {
        if (stopped) return;
        stopped = true;
        try {
          bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
          setTimeout(() => {
            bus.disconnect();
            stopSources();
          }, 300);
        } catch {}
      },
    };
  }

  // ---------- Scope mode ----------
  // The music outlines the playable area (the field, its words and the typing box) like an
  // oscilloscope trace, always outside it so it never gets in the way. From a streak of 10 (×2) it's
  // a thin line that ripples with the music, growing through ×2 until it swings about 60 px out by
  // 25. From 25 (×3) the app switches to its night colours, the line glows, and it can swing out
  // across the whole window, under the rest of the app: by 50 (×4) it reaches the window's edges.
  // At ×4 a storm of sparks joins it, thrown out from the play area and swirling round it to the
  // window's edges, and the music comes apart into three (the player's feeds): the vocals draw a
  // line straight across the bottom of the window that bounces up as they're sung, the bass and
  // drums drive the outline, and the other instruments throw the sparks. Nothing is ever drawn
  // over the play area, and at ×4 it and the boxes beside it are opaque. A miss flattens it all
  // out, and it fades away.
  const SCOPE_START = 10, SCOPE_AT = 25, SCOPE_FULL = 50, COLLAPSE_MS = 450;
  const SPARKS_MAX = 900; // the most sparks in the storm at once
  // From ×3 the outline's colour goes round the colour wheel, HUE_SPEED degrees a second (a new
  // colour about every five seconds), starting from the orange it always had. At ×4 the vocal line
  // and the sparks make a triad with it, a third of the wheel round each (TRIAD), turning together.
  // The storm's swirl turns the other way now and then: on a
  // downbeat, every FLIP_MS to twice that, easing round over about a second.
  const HUE_START = 16, HUE_SPEED = 12, FLIP_MS = 6000, TRIAD = 120;
  const vocalHue = (hue) => (hue + TRIAD) % 360, sparkHue = (hue) => (hue + 2 * TRIAD) % 360;
  const SCOPE_LOWPASS = 1200, SCOPE_SETTLE = 128, SCOPE_MATCH = 128; // Hz the trace is smoothed to; samples the filter needs to settle; points compared to hold the trace still
  const SWING_START = 5, SWING_AT = 60; // px the line swings out: at the start of ×2, and by ×3
  const OUTLINE_GAP = 10; // px between the playable area and the line at rest
  const VOCAL_SWING = 0.22; // how far the vocal line can bounce up, as a share of the window's height
  const VOCAL_FLOOR = 14; // px from the bottom of the window the vocal line lies at rest
  const ONSET_RISE = 1.35, ONSET_GAP_MS = 110; // a burst of sparks: the other instruments this much louder than lately, this far apart

  function createScope() {
    let canvas = null, ctx = null, bufL = null, bufR = null;
    // level: 0 to 1 through ×2 (10 to 25), then 1 to 2 through ×3 (25 to 75)
    let on = false, dark = false, level = 0, collapseAt = null, bufIn = null;
    // A readable trace of a signal (see draw), with its own gain and trigger state: one for the
    // outline, one for the vocal line. peak: the loudest it's been lately, falling slowly.
    const newTrace = () => ({ loud: 0.05, peak: 0.004, rms: 0, mono: null, last: null });
    const outline = newTrace(), vocal = newTrace();
    // the other instruments' loudness lately, for bursts of sparks on their notes
    let otherAvg = 0, otherPeak = 0.003, lastOnset = -1e9;
    const feedBufs = {};
    const readFeed = (name, analyser) => {
      const n = analyser.fftSize;
      if (!feedBufs[name] || feedBufs[name].length !== n) feedBufs[name] = new Float32Array(n);
      analyser.getFloatTimeDomainData(feedBufs[name]);
      return feedBufs[name];
    };
    // the storm: 0 to 1 as ×4 comes in; each spark is { x, y, vx, vy, life, max, size, hot }
    let storm = 0, sparks = [], lastBeat = null, lastNow = 0;
    // the line's hue (from when ×3 began), and the swirl: 1 clockwise, -1 the other way
    let hue = HUE_START, hueFrom = null, spin = 1, spinTo = 1, flipAt = 0;

    function setup() {
      if (canvas) return;
      canvas = document.createElement("canvas");
      canvas.className = "scope";
      canvas.setAttribute("aria-hidden", "true");
      document.body.appendChild(canvas);
      ctx = canvas.getContext("2d");
    }
    // Where the line is drawn. At ×2 it's inside the folder, between the folder's own background and
    // everything in it, so it shows without the UI going see-through. At ×3 it covers the whole
    // window, behind the see-through folder. (No folder, as in tests: always the whole window.)
    function place() {
      const folder = !dark && on && document.getElementById("folder");
      const host = folder || document.body;
      canvas.classList.toggle("in-folder", !!folder);
      if (canvas.parentNode !== host) {
        if (folder) folder.prepend(canvas);
        else document.body.appendChild(canvas);
      }
    }
    function setOn(yes) {
      on = yes;
      setup();
      canvas.classList.toggle("on", yes);
      if (!yes) setDark(false);
      place();
    }
    function setDark(yes) {
      dark = yes;
      document.documentElement.classList.toggle("scope", yes);
      if (!yes) setStorm(false);
      if (canvas) place();
    }
    function setStorm(yes) {
      document.documentElement.classList.toggle("scope-storm", yes);
      if (!yes) { sparks = []; storm = 0; lastBeat = null; flipAt = 0; }
    }

    // What's playing, made readable the way a real oscilloscope does it:
    // - low-passed, so cymbals and the high parts don't turn the line to fuzz;
    // - triggered: the trace starts at a rising zero crossing, so a held tone stands still from frame
    //   to frame instead of sliding (which, with the trails at ×3, smeared into a blur). Of the
    //   crossings, it's the one whose trace looks most like the last frame's, so chords stand still too;
    // - the gain follows the loudness (quick to rise, slow to fall) and peaks are soft-limited, so a
    //   quiet song and a loud one both show their shape.
    // Returns where the shown part starts and how long it is (~21 ms); tr.mono holds the trace.
    function readTrace(tr, input, sr) {
      const len = input.length;
      if (!tr.mono || tr.mono.length !== len) tr.mono = new Float32Array(len);
      const mono = tr.mono;
      const a = 1 - Math.exp((-2 * Math.PI * SCOPE_LOWPASS) / sr);
      let y1 = 0, y2 = 0, sum = 0;
      for (let i = 0; i < len; i++) {
        y1 += a * (input[i] - y1);
        y2 += a * (y1 - y2);
        mono[i] = y2;
        if (i >= SCOPE_SETTLE) sum += y2 * y2;
      }
      tr.rms = Math.sqrt(sum / (len - SCOPE_SETTLE));
      tr.loud += (tr.rms - tr.loud) * (tr.rms > tr.loud ? 0.3 : 0.03);
      tr.loud = Math.max(0.004, tr.loud);
      tr.peak = Math.max(0.004, tr.rms, tr.peak * 0.997);
      const view = len >> 1;
      let from = -1, best = Infinity;
      for (let i = SCOPE_SETTLE, armed = false; i < len - view; i++) {
        if (mono[i] < -0.1 * tr.loud) armed = true;
        else if (armed && mono[i - 1] < 0 && mono[i] >= 0) {
          armed = false;
          if (!tr.last) { from = i; break; }
          let diff = 0;
          for (let j = 0; j < SCOPE_MATCH && diff < best; j++) diff += Math.abs(mono[i + Math.floor((j * view) / SCOPE_MATCH)] / tr.loud - tr.last[j]);
          if (diff < best) { best = diff; from = i; }
        }
      }
      if (from < 0) from = len - view;
      if (!tr.last) tr.last = new Float32Array(SCOPE_MATCH);
      for (let j = 0; j < SCOPE_MATCH; j++) tr.last[j] = mono[from + Math.floor((j * view) / SCOPE_MATCH)] / tr.loud;
      return { from, view };
    }
    // the trace's value a share u (0 to 1) of the way along what's shown
    const traceAt = (tr, from, view, u) => {
      const f = from + u * view, i = Math.floor(f), m = tr.mono;
      return m[i] + (m[Math.min(m.length - 1, i + 1)] - m[i]) * (u * view - (i - from));
    };

    // ×4: the vocals as a line straight across the bottom of the window, from the left edge to the
    // right, bouncing up as they're sung and lying flat when nobody is. It's behind the UI, the
    // opaque play area and boxes (and clipped out of the play area anyway), in the triad's second colour.
    function drawVocal(feed, W, H, sr, shrink) {
      const { from, view } = readTrace(vocal, readFeed("vocal", feed), sr);
      const level = Math.min(1, vocal.rms / vocal.peak);
      const amp = H * VOCAL_SWING * storm * shrink * level;
      const mid = H - VOCAL_FLOOR, N = 600;
      ctx.beginPath();
      for (let k = 0; k <= N; k++) {
        const v = Math.tanh(traceAt(vocal, from, view, k / N) / (vocal.peak * 2.5));
        const x = (k / N) * W, y = mid - (amp * (v + 1)) / 2;
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      const vh = vocalHue(hue).toFixed(1);
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `hsla(${vh},70%,62%,${(0.45 * storm).toFixed(3)})`;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = `hsla(${vh},85%,90%,${(0.9 * storm).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }

    // A burst of sparks from the outline, thrown outward with a swirl round the play area: more on a
    // downbeat and on the song's strong beats (or, with the music in parts, on the other instruments' notes).
    function burst(r, perim, count, speed) {
      for (let k = 0; k < count && sparks.length < SPARKS_MAX; k++) {
        const [x, y, nx, ny] = edgePoint(r, Math.random() * perim);
        const out = speed * (0.4 + Math.random() * 0.9), swirl = spin * speed * (0.3 + Math.random() * 0.5);
        // round the play area (clockwise for spin 1): the edge's way along is the way out turned a quarter
        sparks.push({ x, y, vx: nx * out - ny * swirl, vy: ny * out + nx * swirl, life: 0, max: 0.9 + Math.random() * 1.4, size: 1.6 + Math.random() * 2.6, hot: Math.random() < 0.3 });
      }
    }
    function drawStorm(r, W, H, perim, beat, dt, shrink, now, feeds) {
      const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
      // The other instruments throw the sparks: a burst when they come in louder than lately (a new
      // note or chord), and a drizzle as loud as they are. With nothing there, it's the beat.
      let others = false, onset = 0, otherLevel = 0;
      if (feeds && feeds.other) {
        const buf = readFeed("other", feeds.other);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        otherPeak = Math.max(0.003, rms, otherPeak * 0.997);
        otherLevel = rms / otherPeak;
        others = otherPeak > 0.004;
        if (others && rms > otherAvg * ONSET_RISE && otherLevel > 0.2 && now - lastOnset > ONSET_GAP_MS) {
          onset = otherLevel;
          lastOnset = now;
        }
        otherAvg += (rms - otherAvg) * 0.08;
      }
      if (onset && collapseAt == null) burst(r, perim, Math.round((40 + 120 * onset) * storm), 220 + 300 * onset);
      if (beat && beat.t !== lastBeat && collapseAt == null) {
        lastBeat = beat.t;
        // now and then, on a downbeat, the swirl turns the other way
        if (!flipAt) flipAt = now + FLIP_MS * (1 + Math.random());
        if (beat.down && now >= flipAt) {
          spinTo = -spinTo;
          flipAt = now + FLIP_MS * (1 + Math.random());
        }
        const strong = beat.down ? 1 : 0.35 + 0.65 * (beat.w == null ? 0.5 : beat.w);
        if (!others) burst(r, perim, Math.round((50 + 110 * strong) * storm), 260 + 260 * strong);
      }
      // a steady drizzle in between
      if (collapseAt == null) burst(r, perim, Math.round(storm * 90 * dt * (others ? 0.25 + 0.75 * otherLevel : 1)), 160);
      spin += (spinTo - spin) * Math.min(1, dt * 3);
      // each burst (each beat, without the parts) flashes the sparks bright, then they cool
      const glow = others ? Math.max(0, 1 - (now - lastOnset) / 260) : beat ? Math.max(0, 1 - beat.since / 260) : 0;
      const comp = sparkHue(hue);
      ctx.globalCompositeOperation = "lighter";
      const keep = [];
      for (const p of sparks) {
        p.life += dt;
        if (p.life >= p.max) continue;
        // drag, and a gentle pull that keeps the swirl going round the play area
        const dx = p.x - cx, dy = p.y - cy, dist = Math.hypot(dx, dy) || 1;
        p.vx += spin * (-dy / dist) * 90 * dt;
        p.vy += spin * (dx / dist) * 90 * dt;
        p.vx *= 1 - 0.9 * dt;
        p.vy *= 1 - 0.9 * dt;
        const ox = p.x, oy = p.y;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) continue;
        keep.push(p);
        const fade = (1 - p.life / p.max) * shrink;
        const a = Math.min(1, (0.5 + 0.5 * glow) * fade);
        // the triad's third colour: a bright tint for the hot ones
        ctx.strokeStyle = p.hot ? `hsla(${comp.toFixed(1)},85%,90%,${a.toFixed(3)})` : `hsla(${comp.toFixed(1)},60%,60%,${a.toFixed(3)})`;
        ctx.lineWidth = p.size * (1 + 0.6 * glow);
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      sparks = keep;
      ctx.globalCompositeOperation = "source-over";
    }

    // The point at distance d along a rectangle's edge (clockwise from the top left), and the way out.
    function edgePoint(r, d) {
      const w = r.x1 - r.x0, h = r.y1 - r.y0;
      if (d < w) return [r.x0 + d, r.y0, 0, -1];
      d -= w;
      if (d < h) return [r.x1, r.y0 + d, 1, 0];
      d -= h;
      if (d < w) return [r.x1 - d, r.y1, 0, 1];
      d -= w;
      return [r.x0, r.y1 - d, -1, 0];
    }

    function draw(tap, area, shrink, calm, beat, dt, now) {
      const dpr = window.devicePixelRatio || 1;
      // the canvas covers the folder (×2) or the window (×3); the area is in window coordinates
      const box = canvas.classList.contains("in-folder") ? canvas.parentNode.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const W = box.width, H = box.height;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const low = Math.min(1, level), high = Math.max(0, level - 1);
      // at ×3 older frames fade rather than clear, so the line leaves a short glowing tail
      if (dark) {
        ctx.fillStyle = `rgba(43,42,38,${(0.35 - 0.15 * high).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      } else ctx.clearRect(0, 0, W, H);
      if (!area) return;
      const r = { x0: area.left - box.left - OUTLINE_GAP, y0: area.top - box.top - OUTLINE_GAP, x1: area.right - box.left + OUTLINE_GAP, y1: area.bottom - box.top + OUTLINE_GAP };
      // everything is drawn outside the play area, never on it
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      ctx.clip("evenodd");
      // at ×4 the whole window warms up on each beat
      if (storm > 0 && beat && !calm) {
        const pulse = Math.max(0, 1 - beat.since / 220) * storm * shrink * (beat.down ? 0.16 : 0.09);
        if (pulse > 0.005) {
          ctx.fillStyle = `hsla(${hue.toFixed(1)},70%,60%,${pulse.toFixed(3)})`;
          ctx.fillRect(0, 0, W, H);
        }
      }
      // The outline draws the whole mix (left and right together), and at ×4, as the storm comes in,
      // only the bass and drums.
      const len = tap.left.fftSize;
      if (!bufL || bufL.length !== len) { bufL = new Float32Array(len); bufR = new Float32Array(len); bufIn = new Float32Array(len); }
      tap.left.getFloatTimeDomainData(bufL);
      tap.right.getFloatTimeDomainData(bufR);
      const sr = (tap.left.context && tap.left.context.sampleRate) || 48000;
      const lowPart = tap.feeds && storm > 0 ? readFeed("low", tap.feeds.low) : null;
      for (let i = 0; i < len; i++) {
        const mix = (bufL[i] + bufR[i]) / 2;
        bufIn[i] = lowPart && i < lowPart.length ? mix * (1 - storm) + lowPart[i] * storm : mix;
      }
      const { from, view } = readTrace(outline, bufIn, sr);
      // How far the line may swing out: from SWING_START to SWING_AT px through ×2, then through ×3
      // further and further toward the window's edge on each side, reaching it at ×4.
      const base = SWING_START + (SWING_AT - SWING_START) * low;
      const perim = 2 * (r.x1 - r.x0 + (r.y1 - r.y0));
      const N = 1600;
      ctx.beginPath();
      for (let k = 0; k <= N; k++) {
        const [x, y, nx, ny] = edgePoint(r, ((k % N) / N) * perim);
        const edge = Math.max(0, nx < 0 ? x : nx > 0 ? W - x : ny < 0 ? y : H - y);
        const amp = calm ? 0 : Math.min(edge, base + Math.max(0, edge - base) * high) * shrink;
        const v = Math.tanh(traceAt(outline, from, view, (k % N) / N) / (outline.loud * 2.5));
        const d = (amp * (v + 1)) / 2; // 0..amp, outward only
        if (k) ctx.lineTo(x + nx * d, y + ny * d);
        else ctx.moveTo(x + nx * d, y + ny * d);
      }
      ctx.closePath();
      if (dark) {
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `hsla(${hue.toFixed(1)},70%,60%,${(0.4 + 0.15 * high).toFixed(3)})`;
        ctx.lineWidth = 7 + 3 * high;
        ctx.stroke();
        ctx.strokeStyle = `hsla(${hue.toFixed(1)},80%,90%,0.85)`;
        ctx.lineWidth = 1.8 + 0.4 * high;
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#3f3c33";
        ctx.globalAlpha = 0.6 + 0.3 * low;
        ctx.lineWidth = 1.5 + 1.5 * low;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (storm > 0 && tap.feeds && !calm) drawVocal(tap.feeds.vocal, W, H, sr, shrink);
      if ((storm > 0 || sparks.length) && !calm) drawStorm(r, W, H, perim, beat, dt, shrink, now, tap.feeds);
      ctx.restore();
    }

    return {
      // Called every frame of a running round with the streak, the audio tap, the playable area and
      // the last beat ({ since: ms ago, down, w }, or null).
      frame(now, combo, tap, area, beat = null) {
        const dt = Math.min(0.05, Math.max(0, (now - (lastNow || now)) / 1000));
        lastNow = now;
        const want = combo >= SCOPE_START;
        if (want) collapseAt = null;
        if (!on && want) {
          level = 0;
          setOn(true);
        }
        if (!on) return;
        if (!want && collapseAt == null) collapseAt = now;
        if (collapseAt != null && now - collapseAt >= COLLAPSE_MS) return setOn(false);
        if (collapseAt == null && (combo >= SCOPE_AT) !== dark) setDark(combo >= SCOPE_AT);
        const target = combo >= SCOPE_AT
          ? 1 + Math.min(1, (combo - SCOPE_AT) / (SCOPE_FULL - SCOPE_AT))
          : Math.max(0, Math.min(1, (combo - SCOPE_START) / (SCOPE_AT - SCOPE_START)));
        if (collapseAt == null) level += (target - level) * 0.04;
        // ×4: the storm comes in over about a second
        const stormy = collapseAt == null && combo >= SCOPE_FULL;
        if (stormy && !document.documentElement.classList.contains("scope-storm")) setStorm(true);
        if (stormy) storm = Math.min(1, storm + dt);
        else if (collapseAt == null && storm > 0) { storm = Math.max(0, storm - dt * 2); if (!storm) setStorm(false); }
        const shrink = collapseAt == null ? 1 : Math.max(0, 1 - (now - collapseAt) / COLLAPSE_MS);
        // with reduced motion asked for, the outline stays still
        const calm = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        // the line's colour turns round the wheel from when ×3 began
        if (dark && hueFrom == null) hueFrom = now;
        if (!dark) hueFrom = null;
        hue = hueFrom == null ? HUE_START : (HUE_START + ((now - hueFrom) / 1000) * HUE_SPEED) % 360;
        draw(tap, area, shrink, calm, beat, dt, now);
      },
      off() {
        if (on) setOn(false);
        collapseAt = null;
        lastNow = 0;
      },
      sparks: () => sparks.length, // for tests
      colours: () => ({ hue, vocal: vocalHue(hue), spark: sparkHue(hue), spin: spinTo }), // for tests
    };
  }

  TT.tilesScope = { create: createScope }; // for tests: a scope driven by hand

  // ---------- screen ----------

  const TILE_H = 52;     // tile height in px
  const HIT_BOTTOM = 42; // the line's center, in px from the bottom of the field: the words sit on it
  const PUSH_MS = 200;
  const BOUNCE_MS = 220; // how long the combo liquid's swell on a beat takes to settle   // how long a word card takes to push up into a tile it hit and settle back

  const TEMPLATE = `
    <div class="tl">
      <div class="tl-side tl-left">
        <div class="tl-box"><div class="caps-label">WPM</div><div class="tl-big" data-t="wpm">–</div></div>
        <div class="tl-box"><div class="caps-label">SCORE</div><div class="tl-big" data-t="score">0</div></div>
        <div class="tl-box tl-combo"><div class="tl-liquid" data-t="liquid" aria-hidden="true"><i></i></div><div class="caps-label">COMBO</div><div class="tl-big"><span data-t="combo">0</span><span class="tl-mult" data-t="mult"></span></div><div class="tl-scope" data-t="scope" hidden><i></i></div></div>
        <div class="tl-box"><div class="caps-label">HEALTH</div><div class="tl-bar"><i data-t="hp"></i></div></div>
      </div>
      <div class="tl-center">
        <div class="tl-head">
          <div class="tl-song"><span data-t="title"></span><span class="caps-label" data-t="sub"></span></div>
          <div class="tl-prog-row"><div class="tl-progress" role="progressbar" aria-label="Song progress" data-t="progbar"><i data-t="prog"></i></div><span class="tl-time" data-t="time">0:00</span></div>
        </div>
        <div class="tl-hw" data-t="hw">
          <div class="tl-band" data-t="band"></div>
          <div class="tl-words" data-t="words"></div>
          <div class="tl-track" data-t="track">
            <div data-t="divs"></div>
            <div class="tl-flash" data-t="flash"></div>
            <div class="tl-tiles" data-t="tiles"></div>
          </div>
          <div class="tl-judge" data-t="judge"></div>
        </div>
        <div class="tl-queue" data-t="queue" hidden aria-label="Locked-in words"></div>
        <div class="tl-typed-row"><span class="word-box tl-typed" data-t="typed"></span></div>
      </div>
      <div class="tl-side tl-right">
        <div class="tl-box" data-t="qbox" hidden><div class="caps-label">LOCKED IN</div><div class="tl-big" data-t="queued">0</div></div>
        <div class="tl-box" data-t="timingbox">
          <div class="caps-label">TIMING</div>
          <div class="tl-meter" data-t="meter"></div>
          <div class="tl-meter-l"><span>EARLY</span><span>LATE</span></div>
          <div class="tl-avg" data-t="avg">AVG —</div>
        </div>
        <div class="tl-box"><dl class="tl-counts" data-t="counts"></dl></div>
      </div>
      <div class="tl-over" data-t="over" hidden></div>
      <div class="visually-hidden" aria-live="polite" data-t="sr"></div>
    </div>`;

  TT.createTiles = ({ root, onStart, onEnd, replayOnly = false }) => {
    root.innerHTML = TEMPLATE;
    const el = Object.fromEntries([...root.querySelectorAll("[data-t]")].map((x) => [x.dataset.t, x]));
    let g = null;
    let live = null;   // { state, diff, song, startedAt, keys, times, tiles, ... }
    let replay = null; // { rec, pos, lastT, provider }
    let song = null;   // the built song, when it's available
    let beatTimes = []; // game-time ms of each beat, for the pulse on the line
    let viewT = 0;
    let raf = 0;
    let hudSig = "";
    let H = 0;
    let shakeT = -1000;
    const tileEls = new Map();
    const chipEls = new Map(); // queue mode: the line of locked-in words, by tile
    const scope = replayOnly ? null : createScope();
    // The playable area Scope mode outlines: the field with its words, and the typing box under it.
    const playArea = () => {
      const a = el.hw.getBoundingClientRect(), b = el.typed.getBoundingClientRect();
      if (!a.width) return null;
      return { left: Math.min(a.left, b.left), top: a.top, right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) };
    };

    // The tiles fall down a track tilted back in 3D, like a Guitar Hero highway. It pivots on the
    // line, so a tile at the line sits exactly on its word.
    const measure = () => {
      H = el.track.clientHeight;
      render();
    };
    new ResizeObserver(measure).observe(el.track);

    const progress = () => {
      const d = (TT.store.games.tiles ||= { best: 0, plays: 0, history: [], bestBy: {} });
      d.bestBy ||= {};
      d.history ||= [];
      return d;
    };

    // ---------- words (live play only) ----------

    // A new word for a column. The first letters of the column words all differ, so the first key
    // picks the column. A word needed soon (its column's next tile is close) is kept short.
    function provide(state, col, t) {
      const D = DIFFS[live.diff];
      const locked = (i) => state.queue && state.tiles.some((x) => x.i === i && x.q);
      const j = state.hits.findIndex((h, i) => state.lanes[i] === col && h > t + WIN.late && !state.res[i] && !locked(i));
      // the word is for the column's next tile: its planned length, and the most it can take
      const p = j >= 0 ? live.plan[j] : { L: D.len[0], max: D.len[1], raw: D.len[1] };
      const taken = new Set((state.words || []).filter((w, c) => w && c !== col).map((w) => w[0]));
      const fresh = (w) => !taken.has(w[0]) && !live.recent.includes(w);
      const ok = (w) => w.length >= Math.min(D.len[0], p.max) && w.length <= p.max && fresh(w);
      const exact = (w) => w.length === p.L && fresh(w);
      // Timed lyrics: the column's next tile falls as a word is sung, so it gets that word. It may
      // run up to SUNG_EXTRA letters past the tile's cap when there's time to type it, and mustn't
      // share a first letter with another column's word.
      const sungNow = j >= 0 ? live.sungFor[j] : null;
      const sungMax = Math.min(p.max + SUNG_EXTRA, Math.max(3, p.raw));
      if (sungNow && sungNow.length >= 2 && sungNow.length <= sungMax && !taken.has(sungNow[0])) {
        live.recent = [...live.recent, sungNow].slice(-12);
        live.words.push(sungNow);
        return sungNow;
      }
      // Lyrics without times: most words come from the song itself, when one fits.
      let sung = live.lyricWords.length && Math.random() < LYRIC_SHARE ? live.lyricWords.filter(ok) : [];
      // no lyrics: now and then a word from the title
      if (!sung.length && live.titleWords.length && Math.random() < TITLE_SHARE) sung = live.titleWords.filter(ok);
      let pool = sung;
      if (!sung.length) {
        if (live.pool.filter(ok).length < 5) live.pool = A.practiceWords(80, live.targets, live.missed, TT.store.settings.mix);
        // practice words of the planned length, with the long-word list for 6 letters and up
        const from = p.L >= 6 ? [...live.pool, ...LONG_WORDS] : live.pool;
        pool = from.filter(exact);
        if (!pool.length) pool = from.filter(ok);
      }
      if (!pool.length) pool = [...PRACTICE_WORDS, ...LONG_WORDS].filter(ok);
      if (!pool.length) pool = WORDS.filter((w) => w.length >= 3 && !taken.has(w[0]));
      const w = pool[Math.floor(Math.random() * pool.length)];
      const at = live.pool.indexOf(w);
      if (at >= 0) live.pool.splice(at, 1);
      live.recent = [...live.recent, w].slice(-12);
      live.words.push(w);
      return w;
    }

    // ---------- rendering ----------

    const colCount = () => (g.v >= 4 ? g.cols : 4);
    const colLeft = (l) => `${(l * 100) / colCount()}%`;
    // each column's colour (style.css, --c0 to --c3)
    const colVar = (l) => `var(--c${l % 4})`;

    // The dashed lines between the columns.
    function renderColumns() {
      const n = colCount();
      if (el.divs.n === n) return;
      el.divs.n = n;
      el.divs.innerHTML = Array.from({ length: n - 1 }, (_, k) => `<span class="tl-div" style="left: ${colLeft(k + 1)}"></span>`).join("");
      el.flash.style.width = `${100 / n}%`;
    }

    function renderTiles() {
      const hitY = H - HIT_BOTTOM;
      const tg = target(g);
      const seen = new Set();
      for (const t of g.tiles) {
        let e = tileEls.get(t.i);
        if (!e) {
          e = document.createElement("div");
          e.className = g.v >= 4 ? "tl-tile blank" : "tl-tile";
          e.style.left = colLeft(t.l);
          e.style.setProperty("--col", colVar(t.l));
          e.style.width = `calc(${100 / colCount()}% - 12px)`;
          e.sig = "";
          el.tiles.appendChild(e);
          tileEls.set(t.i, e);
        }
        seen.add(t.i);
        const y = hitY - ((g.hits[t.i] - viewT) / g.fall) * (hitY + TILE_H / 2) - TILE_H / 2;
        e.style.transform = `translateY(${y.toFixed(1)}px)`;
        const typed = W.good(g);
        const sig = t.q ? `q${t.q.ok}${t.q.w}` : t === tg ? `1${typed}` : "0";
        if (e.sig !== sig) {
          e.sig = sig;
          e.classList.toggle("on", t === tg);
          // queue mode: a tile with a locked-in word shows it (sloppy ones marked)
          e.classList.toggle("queued", !!t.q);
          e.classList.toggle("sloppy", !!t.q && !t.q.ok);
          // from v4 the tiles are blank; the words are under the columns
          e.innerHTML = t.q ? `<span>${t.q.w}</span>` : g.v >= 4 ? "" : t === tg ? `<span><b>${typed}</b>${t.w.slice(typed.length)}</span>` : `<span>${t.w}</span>`;
        }
      }
      for (const [i, e] of tileEls) {
        if (!seen.has(i)) {
          e.remove();
          tileEls.delete(i);
        }
      }
    }

    // v4: the word under each column. The one you're typing shows your progress; once it's typed
    // in full it's ready for Enter.
    function renderWords() {
      const show = g.v >= 4 && !!g.words;
      el.words.hidden = !show;
      if (!show) return;
      const c = column(g);
      const typed = W.good(g);
      // queue mode: the column of the next tile to type for
      const up = g.queue ? nextUp(g) : null;
      const nextCol = up ? up.l : -1;
      const sig = [g.words.join(" "), c, typed, g.bad, nextCol].join("|");
      if (el.words.sig === sig) return;
      el.words.sig = sig;
      el.words.innerHTML = g.words.map((w, i) => {
        const on = i === c;
        const n = on ? typed.length : 0;
        const cls = ["tl-word", on ? "on" : "", on && W.ready(g, w) ? "ready" : "", i === nextCol && !on ? "next" : "", !on && (typed || (g.queue && i !== nextCol)) ? "dim" : ""].filter(Boolean).join(" ");
        return `<div class="${cls}" style="left: ${colLeft(i)}; width: ${100 / colCount()}%; --col: ${colVar(i)}"><span><b>${w.slice(0, n)}</b>${w.slice(n)}</span></div>`;
      }).join("");
    }

    // Queue mode: the locked-in words in a line above the typing box, in their columns' colours,
    // the next to reach the line first. A word leaves as its tile takes it.
    function renderQueue() {
      el.queue.hidden = !g.queue;
      if (!g.queue) return;
      const locked = g.tiles.filter((x) => x.q);
      const seen = new Set();
      locked.forEach((t, k) => {
        let c = chipEls.get(t.i);
        if (!c) {
          c = document.createElement("span");
          c.className = t.q.ok ? "tl-chip" : "tl-chip sloppy";
          c.style.setProperty("--col", colVar(t.l));
          c.textContent = t.q.w;
          el.queue.appendChild(c);
          chipEls.set(t.i, c);
        }
        c.classList.toggle("first", k === 0);
        seen.add(t.i);
      });
      for (const [i, c] of chipEls) {
        if (!seen.has(i)) {
          c.remove();
          chipEls.delete(i);
        }
      }
      el.queue.classList.toggle("waiting", !locked.length);
    }

    function renderEffects() {
      const last = g.last;
      const age = last ? viewT - last.t : Infinity;
      // the judgment text
      const show = last && age >= 0 && age < 700;
      const text = show ? GRADE_NAMES[last.grade] + (last.d != null && "PGOS".includes(last.grade) ? ` ${last.d > 0 ? "+" : ""}${Math.round(last.d)}MS` : "") : "";
      if (el.judge.textContent !== text) el.judge.textContent = text;
      el.judge.classList.toggle("miss", !!show && "MEX".includes(last.grade));
      // a perfect hit flashes the field's outline white, glowing outward only (never over a tile or
      // word). In queue mode every hit is perfect, so there it's the clean words.
      const perfect = !!last && last.grade === "P" && age >= 0 && age < 140 && (!g.queue || last.gain >= 2);
      el.hw.classList.toggle("perfect", perfect);
      // a flash in the lane of a hit
      const flash = last && "PGOS".includes(last.grade) && age >= 0 && age < 320;
      el.flash.style.opacity = flash ? (1 - age / 320).toFixed(2) : "0";
      if (flash) {
        el.flash.style.left = colLeft(last.l);
        if (g.v >= 4) el.flash.style.setProperty("--col", colVar(last.l));
      }
      // the line pulses on each beat
      let beat = null;
      for (let k = beatTimes.length - 1; k >= 0; k--) {
        if (beatTimes[k].t <= viewT) {
          if (viewT - beatTimes[k].t < 110) beat = beatTimes[k];
          break;
        }
      }
      el.band.classList.toggle("beat", !!beat);
      el.band.classList.toggle("down", !!beat && beat.down);
      // the combo box's liquid swells a little on each beat and settles back (more on a downbeat)
      let bounce = 0;
      for (let k = beatTimes.length - 1; k >= 0; k--) {
        if (beatTimes[k].t <= viewT) {
          const since = viewT - beatTimes[k].t;
          if (since < BOUNCE_MS) bounce = (1 - since / BOUNCE_MS) ** 2 * (beatTimes[k].down ? 1 : 0.55);
          break;
        }
      }
      const b = bounce.toFixed(2);
      if (el.liquid.bounce !== b) {
        el.liquid.bounce = b;
        el.liquid.style.setProperty("--bounce", b);
      }
      // what's been typed
      const typed = W.html(g);
      if (el.typed.innerHTML !== typed) el.typed.innerHTML = typed;
      el.typed.classList.toggle("empty", !g.buf);
      const tc = g.v >= 4 && g.words ? column(g) : -1;
      el.typed.classList.toggle("col", tc >= 0);
      if (tc >= 0) el.typed.style.setProperty("--col", colVar(tc));
      el.typed.classList.toggle("shake", viewT - shakeT < 250);
      // v4: a word card pushes up into the tile it hit, then settles back
      const cards = el.words.children;
      const pushes = g.queue ? "Q" : "PGOS";
      const push = g.v >= 4 && last && pushes.includes(last.grade) && age >= 0 && age < PUSH_MS ? last.l : -1;
      for (let i = 0; i < cards.length; i++) {
        const p = i === push ? Math.sin((Math.PI * age) / PUSH_MS) : 0;
        const tf = p ? `translateY(${(-16 * p).toFixed(1)}px) scale(${(1 + 0.1 * p).toFixed(3)})` : "";
        if (cards[i].style.transform !== tf) cards[i].style.transform = tf;
        cards[i].classList.toggle("hit", !!p);
      }
    }

    function renderHud() {
      const st = gameStats(g, Math.max(1, viewT));
      const c = g.counts;
      const prog = Math.min(1, viewT / g.endT);
      const marks = g.offsets.slice(-14);
      const locked = g.queue ? g.tiles.filter((x) => x.q).length : 0;
      const sig = [g.score, g.combo, Math.round(level(g) * 100), Math.round(g.hp), viewT < 5000 ? "-" : Math.round(st.wpm), c.P, c.G, c.O, c.S, c.M, Math.round(prog * 200), Math.floor(viewT / 1000), marks.length, g.offsets.length, g.queue, locked].join("|");
      if (sig === hudSig) return;
      hudSig = sig;
      // queue mode has no timing, so the box shows how many tiles have a word locked in
      el.timingbox.hidden = !!g.queue;
      el.qbox.hidden = !g.queue;
      el.queued.textContent = locked;
      el.wpm.textContent = viewT < 5000 ? "–" : Math.round(st.wpm);
      el.score.textContent = g.score.toLocaleString();
      el.combo.textContent = g.combo;
      const mult = multOf(g);
      el.mult.textContent = mult > 1 ? `×${mult}` : "";
      // the liquid behind the combo: how close the next multiplier is. On reaching one it starts
      // again from empty at once, rather than draining.
      const fill = toNext(g);
      const liquid = el.liquid.firstChild;
      if (el.liquid.mult !== mult) {
        liquid.style.transition = "none";
        liquid.style.setProperty("--fill", fill.toFixed(3));
        void liquid.offsetHeight;
        liquid.style.transition = "";
        el.liquid.mult = mult;
      } else liquid.style.setProperty("--fill", fill.toFixed(3));
      el.liquid.classList.toggle("dry", fill <= 0);
      el.hp.style.width = `${Math.round(g.hp)}%`;
      el.hp.classList.toggle("low", g.hp < 30);
      el.prog.style.width = `${(prog * 100).toFixed(1)}%`;
      const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
      el.time.textContent = `${clock(Math.min(viewT, g.endT))} / ${clock(g.endT)}`;
      el.progbar.setAttribute("aria-valuenow", Math.round(prog * 100));
      el.meter.innerHTML = marks.map((d, i) => {
        const x = 50 + Math.max(-1, Math.min(1, d / WIN.early)) * 46;
        return `<b style="left: calc(${x.toFixed(1)}% - 1.5px); opacity: ${(0.3 + (0.7 * (i + 1)) / marks.length).toFixed(2)}"></b>`;
      }).join("");
      el.avg.textContent = g.offsets.length
        ? `AVG ${st.avg > 0 ? "+" : ""}${Math.round(st.avg)}MS${Math.abs(st.avg) < 15 ? "" : st.avg < 0 ? " EARLY" : " LATE"}`
        : "AVG —";
      el.counts.innerHTML = [["PERFECT", c.P], ["GREAT", c.G], ["GOOD", c.O], ["SLOPPY", c.S || 0], ["MISS", c.M]]
        .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
      // how far the scope has grown (live rounds with Scope mode on)
      const lv = level(g);
      const scopeOn = !!live && live.sound.scope && lv >= SCOPE_AT;
      el.scope.hidden = !scopeOn;
      if (scopeOn) el.scope.firstChild.style.width = `${Math.round(Math.min(1, (lv - SCOPE_AT) / (SCOPE_FULL - SCOPE_AT)) * 100)}%`;
    }

    function render() {
      if (!g || !H) return;
      renderColumns();
      renderTiles();
      renderWords();
      renderQueue();
      renderEffects();
      renderHud();
    }

    function setHead(title, sub) {
      el.title.textContent = title;
      el.sub.textContent = sub;
    }

    function clearTiles() {
      for (const e of tileEls.values()) e.remove();
      tileEls.clear();
      for (const c of chipEls.values()) c.remove();
      chipEls.clear();
      el.words.sig = "";
    }

    // ---------- live play ----------

    // sound: the toggles (music, metronome, scope, lyrics), and queue for queue mode
    function newGame(songId, diff, sound = { music: true, metronome: false, scope: true, lyrics: true, queue: false }) {
      stop();
      replay = null;
      song = TT.songs.get(songId);
      const queue = !!sound.queue;
      const D = modeDiff(diff, queue);
      const songHits = chart(song, diff, queue);
      const offset = Math.max(0, D.fall + LEAD_MS - (songHits[0] || 0));
      const hits = songHits.map((h) => h + offset);
      const endT = Math.round(offset + song.duration * 1000 + 800);
      live = {
        state: "ready", diff, queue, song: songId, offset, sound, startedAt: 0, player: null,
        keys: "", times: [], words: [], recent: [], pool: [],
        // with timed lyrics, sung words go on the tiles where they're sung and the rest are
        // practice words; with untimed lyrics, most words are drawn from them at random
        sungFor: sound.lyrics !== false ? sungWords(song, diff, queue) : [],
        lyricWords: [], titleWords: [],
        targets: A.weakKeys(), missed: A.weakWords(20),
      };
      if (sound.lyrics !== false && !live.sungFor.some(Boolean) && TT.lyrics) live.lyricWords = TT.lyrics.words(song.lyrics);
      // A few words come from the song's title. With lyrics they're just more lyric words; without,
      // they're dealt now and then (TITLE_SHARE), since a title has only a handful.
      if (sound.lyrics !== false && TT.lyrics) {
        const title = titleWords(song.title);
        if (live.lyricWords.length) live.lyricWords = [...new Set([...live.lyricWords, ...title])];
        else live.titleWords = title;
      }
      // wake the audio now, while the click that opened the round still counts
      if (sound.music || sound.metronome) getAudio();
      const lanes = columns(song, diff, queue);
      live.plan = planLengths(hits, lanes, diff, queue, D.fall);
      g = newCore({ hits, fall: D.fall, endT, diff, lanes, cols: D.cols, queue });
      el.queue.hidden = !queue; // the queue line's space is there from the start, so nothing moves
      g.wpmScale = W.scale();
      dealWords(g, provide);
      beatTimes = song.beats.map((b) => ({ t: offset + b.t * 1000, down: b.down, w: b.w }));
      viewT = 0;
      hudSig = "";
      clearTiles();
      setHead(song.title.toUpperCase(), `${song.composer.toUpperCase()} · ${D.name}${queue ? " · QUEUE" : ""}`);
      el.over.innerHTML = `
        <h2>${song.title.toUpperCase()}</h2>
        <p class="tl-over-sub">${song.composer} · ${D.name.toLowerCase()}${queue ? " · queue mode" : ""} · ${Math.round(song.duration)} seconds</p>
        <p>${queue
          ? "Type the word under the next tile's column and press <strong>Enter</strong> or <strong>Space</strong> to lock it in, then type the next. Each tile takes its word as it crosses the line."
          : "Type the word under a column, then press <strong>Enter</strong> or <strong>Space</strong> as that column's tile crosses the line."}</p>
        <div class="tl-start"><kbd>ENTER</kbd>START</div>`;
      el.over.hidden = false;
      render();
    }

    // The round starts once the audio is running, so the music is in step from the first note.
    async function start() {
      const round = live;
      round.state = "starting";
      const s = round.sound;
      await audioReady(s.music || s.metronome ? getAudio() : null);
      if (live !== round || round.state !== "starting") return; // left or restarted meanwhile
      round.state = "running";
      round.startedAt = performance.now();
      round.player = createPlayer({ song, startPerf: round.startedAt + round.offset, ...round.sound });
      round.player.pump();
      el.over.hidden = true;
      onStart && onStart();
      raf = requestAnimationFrame(frame);
    }

    // the last beat that has played, and how long ago, for the storm
    function lastBeatNow() {
      for (let k = beatTimes.length - 1; k >= 0; k--) {
        if (beatTimes[k].t <= viewT) return { ...beatTimes[k], since: viewT - beatTimes[k].t, k };
      }
      return null;
    }

    function frame() {
      if (!live || live.state !== "running") return;
      viewT = performance.now() - live.startedAt;
      live.player.pump();
      if (advance(g, viewT, provide)) return end();
      render();
      if (scope && live.sound.scope && live.player.tap) scope.frame(performance.now(), level(g), live.player.tap, playArea(), lastBeatNow());
      raf = requestAnimationFrame(frame);
    }

    // Pausing stops the clock and the music. On resume the start time moves on by the length of the
    // pause and the music picks up where it was, so the round carries on as if no time had passed.
    function pause() {
      if (!live || live.state !== "running") return;
      live.state = "paused";
      live.pausedAt = performance.now();
      cancelAnimationFrame(raf);
      if (live.player) live.player.stop();
      live.player = null;
      el.over.innerHTML = TT.pausedHtml("tl:play", "tl:select", "SONGS");
      el.over.hidden = false;
    }

    async function resume() {
      if (!live || live.state !== "paused") return;
      const round = live;
      round.state = "starting";
      const s = round.sound;
      await audioReady(s.music || s.metronome ? getAudio() : null);
      if (live !== round || round.state !== "starting") return;
      live.startedAt += performance.now() - live.pausedAt;
      live.state = "running";
      live.player = createPlayer({ song, startPerf: live.startedAt + live.offset, ...live.sound });
      live.player.pump();
      el.over.hidden = true;
      raf = requestAnimationFrame(frame);
    }

    function handleKey(e) {
      if (!live || live.state === "over" || live.state === "stopped" || live.state === "paused" || live.state === "starting") return;
      let k;
      if (e.key === "Backspace") k = e.ctrlKey || e.altKey ? BACK_WORD : BACK;
      else if (e.ctrlKey || e.altKey || e.metaKey) return;
      else if (e.key === " " || e.key === "Enter") k = " "; // either one strikes (recorded as a space)
      else if (/^[a-zA-Z]$/.test(e.key)) k = e.key.toLowerCase();
      else return;
      e.preventDefault();
      if (e.repeat && k === " ") return; // holding the key down shouldn't strike again
      if (live.state === "ready") {
        if (k === " ") start();
        return;
      }
      // The event's own timestamp is when the key went down, which is more exact than now.
      const stamp = e.timeStamp && e.timeStamp <= performance.now() + 1 ? e.timeStamp : performance.now();
      const t = Math.max(0, Math.round(stamp - live.startedAt));
      if (advance(g, t, provide)) return end();
      live.keys += k;
      live.times.push(t);
      const d = applyKey(g, k, t, provide);
      if (g.over) return end();
      if (d && (d.type === "miss" || (d.type === "strike" && !d.empty))) shakeT = t;
      el.sr.textContent = d && (d.type === "hit" || d.type === "early") ? GRADE_NAMES[g.last.grade].toLowerCase() : el.sr.textContent;
      viewT = Math.max(viewT, t);
      render();
    }

    function end() {
      live.state = "over";
      cancelAnimationFrame(raf);
      if (live.player) live.player.stop();
      if (scope) scope.off();
      viewT = g.endAt;
      // a half-typed word counts toward its column's word
      const col = column(g);
      if (col >= 0) attribute(g, W.good(g), g.words[col]);

      const st = gameStats(g, g.endAt);
      const grade = letterGrade(st.timing);
      const round = (x) => Math.round(x * 100) / 100;
      const date = new Date().toISOString();
      const id = TT.newRoundId();
      const rec = progress();
      const key = `${live.song}:${live.diff}${live.queue ? ":queue" : ""}`;
      const prev = rec.bestBy[key];
      const cleared = g.cause === "done";
      rec.plays++;
      rec.best = Math.max(rec.best, g.score);
      if (!prev || g.score > prev.score) rec.bestBy[key] = { score: g.score, grade, timing: round(st.timing), wpm: round(st.wpm), acc: round(st.acc), cleared };
      else if (cleared && !prev.cleared) prev.cleared = true;
      rec.history.push({ date, song: live.song, diff: live.diff, ...(live.queue ? { queue: true } : {}), score: g.score, grade, timing: round(st.timing), wpm: round(st.wpm), acc: round(st.acc), cleared });
      if (rec.history.length > HISTORY_CAP) rec.history.splice(0, rec.history.length - HISTORY_CAP);

      const store = TT.store;
      store.history.push({
        id, date, kind: "game", game: "tiles", mode: live.diff, ...(live.queue ? { queue: true } : {}), amount: g.score, song: live.song, title: song.title,
        wpm: round(st.wpm), raw: round(st.wpm), acc: round(st.acc), seconds: round(g.endAt / 1000),
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
        id, date, kind: "game", game: "tiles", mode: live.diff, amount: g.score, song: live.song, title: song.title,
        songKey: song.key, offset: live.offset, wpmScale: g.wpmScale, v: RULES, diff: live.diff, ...(live.queue ? { queue: true } : {}), fall: g.fall, hits: g.hits, endT: g.endT, lanes: g.lanes, cols: g.cols, words: live.words,
        keys: live.keys, times: live.times, duration: g.endAt,
      });

      const best = prev && g.score > prev.score
        ? `<strong class="hl">New best!</strong> Previous best was ${prev.score.toLocaleString()}.`
        : prev ? `Best ${prev.score.toLocaleString()}` : `First time on this song and difficulty${live.queue ? " in queue mode" : ""}.`;
      const c = g.counts;
      el.over.innerHTML = `
        <h2>${cleared ? "SONG COMPLETE" : "OUT OF HEALTH"}</h2>
        <div class="tl-over-grade">${grade}</div>
        <div class="caps-label">SCORE ${g.score.toLocaleString()} · MAX COMBO ${g.maxCombo}</div>
        <p>${best}</p>
        <dl class="tl-over-stats">
          <div><dt>PERFECT</dt><dd>${c.P}</dd></div><div><dt>GREAT</dt><dd>${c.G}</dd></div>
          <div><dt>GOOD</dt><dd>${c.O}</dd></div><div><dt>SLOPPY</dt><dd>${c.S}</dd></div><div><dt>MISS</dt><dd>${c.M}</dd></div>
          <div><dt>WPM</dt><dd>${Math.round(st.wpm)}</dd></div><div><dt>ACCURACY</dt><dd>${Math.round(st.acc)}%</dd></div>
          <div><dt>TIMING</dt><dd>${g.offsets.length ? `${st.avg > 0 ? "+" : ""}${Math.round(st.avg)} ms` : "—"}</dd></div>
        </dl>
        <div class="hints">
          <button data-act="tl:play"><kbd>TAB</kbd>PLAY AGAIN</button>
          <button data-act="replay:${id}"><kbd>R</kbd>REPLAY</button>
          <button data-act="tl:select"><kbd>ESC</kbd>SONGS</button>
        </div>`;
      el.over.hidden = false;
      hudSig = "";
      render();
      onEnd && onEnd(id);
    }

    function stop() {
      cancelAnimationFrame(raf);
      if (scope) scope.off();
      if (live) {
        if (live.player) live.player.stop();
        if (live.state !== "over") live.state = "stopped";
      }
    }

    // ---------- replay ----------

    function resetReplayCore(rec) {
      g = coreFor(rec);
      replay.pos = 0;
    }

    function loadReplay(rec) {
      stop();
      live = null;
      replay = { rec, pos: 0, lastT: 0, provider: recorded(rec) };
      resetReplayCore(rec);
      el.queue.hidden = !g.queue;
      song = TT.songs.get(rec.song);
      // The beat pulse needs the song as it was played; an added song's beat may have been redone.
      const same = song && (!song.user || song.key === rec.songKey);
      const offset = !same ? null : rec.offset ?? (rec.hits.length ? rec.hits[0] - oldFirstHit(song) : null);
      beatTimes = song && offset != null ? song.beats.map((b) => ({ t: offset + b.t * 1000, down: b.down })) : [];
      viewT = 0;
      hudSig = "";
      clearTiles();
      setHead((rec.title || "Tiles").toUpperCase(), (DIFFS[rec.diff] || DIFFS.medium).name + (rec.queue ? " · QUEUE" : ""));
      el.over.hidden = true;
      render();
    }

    function replayTo(T) {
      if (!replay) return g;
      const { rec, provider } = replay;
      if (T < replay.lastT) resetReplayCore(rec);
      while (replay.pos < rec.keys.length && rec.times[replay.pos] <= T) {
        const d = applyKey(g, rec.keys[replay.pos], rec.times[replay.pos], provider);
        if (d && (d.type === "miss" || (d.type === "strike" && !d.empty))) shakeT = rec.times[replay.pos];
        replay.pos++;
      }
      advance(g, Math.min(T, rec.duration), provider);
      replay.lastT = T;
      viewT = g.over ? g.endAt : T;
      if (g.over) {
        const st = gameStats(g, g.endAt);
        el.over.innerHTML = `<h2>${g.cause === "done" ? "SONG COMPLETE" : "OUT OF HEALTH"}</h2><div class="tl-over-grade">${letterGrade(st.timing)}</div><div class="caps-label">SCORE ${g.score.toLocaleString()}</div>`;
      }
      el.over.hidden = !g.over;
      render();
      return g;
    }

    return {
      newGame, stop, handleKey, loadReplay, replayTo,
      relayout: () => { hudSig = ""; measure(); },
      isOver: () => !!live && live.state === "over",
      isRunning: () => !!live && live.state === "running",
      isPaused: () => !!live && live.state === "paused",
      pause, resume,
    };
  };
})();
