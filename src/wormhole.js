// Wormhole: a typing trivia game. You're an earthworm. Each prompt asks for something in a
// category ("Name a fruit"): type an answer and press Enter. Anything in the prompt's answer bank
// counts, close spellings included, and the rarer the answer, the deeper the worm digs.
//
// Two ways to play: the Daily Dig, seven prompts a day (the same for everyone on this computer),
// one answer each with 25 seconds to find it; and Blitz, one prompt and 30 seconds to name as many
// as you can, where a run of rare answers multiplies their points.
//
// Rarity: each answer in the bank (wormhole-data.js) has a share, the percentage of people expected
// to name it when listing all they can think of. The shares come from a survey of people doing just
// that (Banks & Connell, 2023) and from how often words appear in books (Google Books Ngram), then
// hand-tuned. Everyone who plays on this computer adds to them: the bank counts as PRIOR people,
// and each answer given here, by anyone (you included), is one more person naming it, so answers
// people here keep giving get commoner and score less (crowdShare).
//
// Depth: every point digs the worm the same distance down the screen, while the depth meter follows
// the real Earth (metres): a common answer near the surface digs a few centimetres, and 700 points
// reaches the centre, 6,371 km down.
//
// A round is a list of events (see step), recorded as it's played, so a replay shows it as it was.
(() => {
  const DATA = TT.wormData || { packs: [], prompts: [] };
  const POINTS = [10, 30, 60, 100];
  const TIERS = ["COMMON", "KNOWN", "RARE", "DEEP CUT"];
  const CUTS = [35, 12, 4]; // shares (%) at or above which an answer is common, known or rare
  const PRIOR = 10;         // how many people the bank's shares count as
  const MULTS = [1, 1, 1.5, 2, 2.5]; // Blitz: the 1st, 2nd, 3rd and 4th-on rare answer in a row
  const DAILY_N = 7, DAILY_MS = 25000, BLITZ_MS = 30000;
  const COUNT_MS = 2400; // 3, 2, 1, then dig
  const UP_MS = 1500;    // Blitz: "time's up" shows this long before the results
  const MAX_TYPED = 40;

  const PROMPTS = DATA.prompts.map(([id, pack, q, a]) => ({ id, pack, q, a }));
  const BY_ID = new Map(PROMPTS.map((p) => [p.id, p]));
  const PACKS = DATA.packs.map(([id, name]) => ({ id, name }));
  const promptById = (id) => BY_ID.get(id);
  const packName = (id) => (PACKS.find((p) => p.id === id) || { name: "Mixed" }).name;

  // ---------- reading an answer ----------

  // An answer as it's compared: no accents, capitals, spaces or punctuation, and no leading "the",
  // "a" or "an" ("The Lion King" and "lion-king" are the same). & + # read as and, plus and sharp,
  // so C++ and C# can be told apart.
  const LETTERS = { ø: "o", ł: "l", đ: "d", ð: "d", þ: "th", æ: "ae", œ: "oe", ß: "ss", ı: "i" };
  const key = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[øłđðþæœßı]/g, (c) => LETTERS[c])
    .replace(/&/g, " and ").replace(/\+/g, " plus ").replace(/#/g, " sharp ")
    .replace(/^\s*(the|a|an)\s+/, "").replace(/[^a-z0-9]/g, "");
  // What a plural's singular might be, besides itself: roses, glasses, berries, leaves.
  function singles(k) {
    const out = [];
    if (k.length > 3 && k.endsWith("s") && !k.endsWith("ss")) out.push(k.slice(0, -1));
    if (k.length > 4 && k.endsWith("es")) out.push(k.slice(0, -2));
    if (k.length > 4 && k.endsWith("ies")) out.push(`${k.slice(0, -3)}y`);
    if (k.length > 4 && k.endsWith("ves")) out.push(`${k.slice(0, -3)}f`, `${k.slice(0, -3)}fe`);
    return out;
  }

  // Edit distance (two neighbouring letters swapped count as one slip), giving up past max.
  function osa(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let low = i;
      for (let j = 1; j <= b.length; j++) {
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur.push(v);
        if (v < low) low = v;
      }
      if (low > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[b.length];
  }

  // Where what was typed differs from the right spelling: [expected, typed] for each slip
  // (typed "" for a letter left out, expected "" for one too many).
  function slips(right, typed) {
    const n = right.length, m = typed.length;
    const d = Array.from({ length: n + 1 }, (_, i) => [i, ...Array(m).fill(0)]);
    for (let j = 1; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (right[i - 1] === typed[j - 1] ? 0 : 1));
    }
    const out = [];
    for (let i = n, j = m; i > 0 || j > 0;) {
      if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (right[i - 1] === typed[j - 1] ? 0 : 1)) {
        if (right[i - 1] !== typed[j - 1]) out.push([right[i - 1], typed[j - 1]]);
        i--;
        j--;
      } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
        out.push([right[i - 1], ""]);
        i--;
      } else {
        out.push(["", typed[j - 1]]);
        j--;
      }
    }
    return out.reverse();
  }

  // A prompt's answers, with every name and spelling they go by (and their plurals) to look up.
  const banks = new Map();
  function bank(id) {
    if (banks.has(id)) return banks.get(id);
    const p = BY_ID.get(id);
    if (!p) return null;
    const answers = p.a.map(([name, share, ...alts]) => ({ name, share, alts }));
    const exact = new Map(), loose = new Map();
    answers.forEach((a, i) => [a.name, ...a.alts].forEach((form) => {
      const k = key(form);
      if (k && !exact.has(k)) exact.set(k, { i, form });
    }));
    // (a name that's a plural, like "brussels sprouts", is found from the singular too)
    answers.forEach((a, i) => [a.name, ...a.alts].forEach((form) => {
      for (const s of singles(key(form))) if (!exact.has(s) && !loose.has(s)) loose.set(s, { i, form });
    }));
    // how many answers one person names, on average: the shares added up
    const per = Math.max(1, answers.reduce((n, a) => n + a.share, 0) / 100);
    const b = { id, p, answers, exact, loose, per };
    banks.set(id, b);
    return b;
  }

  // What a typed answer counts as: { i, form, how } (how: "exact"; "alias" for another name or
  // spelling; "close" for a near miss), { amb: [i, ...] } when it's as close to two answers, or
  // null. One slip is forgiven from 5 letters, two from 9.
  function match(b, typed) {
    const k = key(typed);
    if (!k) return null;
    const forms = [k, ...singles(k)];
    let hit = null;
    for (const f of forms) if (!hit) hit = b.exact.get(f);
    for (const f of forms) if (!hit) hit = b.loose.get(f);
    if (hit) return { i: hit.i, form: hit.form, how: hit.form === b.answers[hit.i].name ? "exact" : "alias" };
    if (k.length < 4) return null;
    let best = 3, found = new Map();
    for (const [kk, h] of b.exact) {
      const allow = kk.length >= 9 ? 2 : kk.length >= 5 ? 1 : 0;
      if (!allow) continue;
      const d = Math.min(...forms.map((f) => osa(f, kk, allow)));
      if (d > allow || d > best) continue;
      if (d < best) {
        best = d;
        found = new Map();
      }
      if (!found.has(h.i)) found.set(h.i, h.form);
    }
    if (!found.size) return null;
    if (found.size > 1) return { amb: [...found.keys()] };
    const [[i, form]] = found;
    return { i, form, how: "close" };
  }

  // For "did you mean": the answer nearest a miss that's too far off to count by itself (up to one
  // slip in 3 letters, two from 5, three from 8, and never more than 40% of the answer). { i, form },
  // { amb: [i, ...] } when two are as near, or null. not: names already given, left out.
  // A word as it sounds, roughly: ph is f, c is k or s, doubled letters are one, and vowels blur.
  const sound = (k) => k.replace(/ph/g, "f").replace(/ck/g, "k").replace(/c(?=[eiy])/g, "s").replace(/[cq]/g, "k")
    .replace(/x/g, "ks").replace(/z/g, "s").replace(/(.)\1+/g, "$1").replace(/[aeiouy]+/g, "a");
  function nearest(b, typed, not = new Set()) {
    const k = key(typed);
    if (k.length < 3) return null;
    const forms = [k, ...singles(k)];
    const sounds = forms.map(sound);
    let best = 4, found = new Map();
    for (const [kk, h] of b.exact) {
      if (not.has(b.answers[h.i].name)) continue;
      const allow = Math.min(kk.length >= 8 ? 3 : kk.length >= 5 ? 2 : kk.length >= 3 ? 1 : 0, Math.floor(kk.length * 0.4));
      if (!allow) continue;
      // spelt nearly right, or sounds nearly the same (a slip more than the sounds differ by)
      const sk = sound(kk);
      const heard = sk.length > 2 ? Math.min(...sounds.map((s) => osa(s, sk, allow))) + 1 : allow + 1;
      const d = Math.min(...forms.map((f) => osa(f, kk, allow)), heard);
      if (d > allow || d > best) continue;
      if (d < best) {
        best = d;
        found = new Map();
      }
      if (!found.has(h.i)) found.set(h.i, h.form);
    }
    if (!found.size) return null;
    if (found.size > 1) return { amb: [...found.keys()] };
    const [[i, form]] = found;
    return { i, form };
  }

  // ---------- rarity ----------

  // An answer's share (%) with this computer's players counted in. The bank counts as PRIOR people
  // naming it at its share; each time someone here gave it is one more person naming it; and each
  // round adds (answers given ÷ answers a person names on average) people in all.
  function crowdShare(b, i, crowd) {
    const a = b.answers[i];
    const votes = (crowd && crowd.v[a.name]) || 0;
    const people = PRIOR + ((crowd && crowd.g) || 0) / b.per;
    return Math.round((((PRIOR * a.share) / 100 + votes) / people) * 1e8) / 1e6; // (rounded, so 35 stays 35)
  }
  const tierOf = (share) => (share >= CUTS[0] ? 0 : share >= CUTS[1] ? 1 : share >= CUTS[2] ? 2 : 3);

  // Everyone on this computer's answers to a prompt: { g (answers given), v (name -> times given),
  // others (name -> how many other players have given it), mine (name -> times you have) }.
  // all: every profile's games, [id, games], when they've been read already.
  const everyone = () => TT.profiles.list().map((p) => [p.id, TT.profiles.games(p.id)]);
  function household(pid, all = everyone()) {
    const me = TT.profiles.activeId();
    const out = { g: 0, v: {}, others: {}, mine: {} };
    for (const [id, games] of all) {
      const w = (games || {}).worm;
      const c = w && w.crowd && w.crowd[pid];
      if (!c) continue;
      out.g += c.g || 0;
      for (const [name, n] of Object.entries(c.v || {})) {
        out.v[name] = (out.v[name] || 0) + n;
        if (id === me) out.mine[name] = n;
        else if (n > 0) out.others[name] = (out.others[name] || 0) + 1;
      }
    }
    return out;
  }

  // A few of the bank's deep cuts (here), for "you could have said": the better known ones are likelier.
  function deepCuts(b, crowd, not = [], n = 3) {
    const pool = b.answers.map((a, i) => ({ a, s: crowdShare(b, i, crowd) })).filter((x) => !not.includes(x.a.name));
    let picks = pool.filter((x) => tierOf(x.s) === 3);
    if (picks.length < n) picks = picks.concat(pool.filter((x) => tierOf(x.s) === 2).sort((p, q) => p.s - q.s).slice(0, n - picks.length));
    const out = [];
    while (out.length < n && picks.length) {
      const weight = (x) => Math.sqrt(x.s + 0.2);
      let r = Math.random() * picks.reduce((t, x) => t + weight(x), 0), k = 0;
      for (; k < picks.length - 1; k++) if ((r -= weight(picks[k])) <= 0) break;
      out.push(picks[k].a.name);
      picks.splice(k, 1);
    }
    return out;
  }
  // the answers most people give
  const commonest = (b, crowd, n = 2) => b.answers.map((a, i) => ({ a, s: crowdShare(b, i, crowd) }))
    .sort((p, q) => q.s - p.s).slice(0, n).map((x) => x.a.name);

  // ---------- the Daily Dig ----------
  // Every day has its seven prompts, worked out from the date alone. Each pass through all the
  // prompts is a shuffle (a different one each pass), dealt a pack at a time so a day mixes packs;
  // each day takes the next seven.

  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const EPOCH = Date.UTC(2026, 9, 1); // 1 October 2026, the first Daily Dig
  const dayIndex = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 864e5);
  };
  const keyOfIndex = (i) => {
    const d = new Date(EPOCH + i * 864e5);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };
  const addDays = (k, n) => keyOfIndex(dayIndex(k) + n);
  const dayLabel = (k, opts = { weekday: "short", day: "numeric", month: "short" }) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  };

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const shuffle = (arr, r) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const passes = new Map();
  function pass(c) {
    if (passes.has(c)) return passes.get(c);
    const r = rng(0x5eed1 + c * 7919);
    const lists = shuffle(PACKS.map((p) => p.id), r).map((id) => shuffle(PROMPTS.filter((p) => p.pack === id).map((p) => p.id), r));
    const out = [];
    for (let i = 0; out.length < PROMPTS.length; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
    passes.set(c, out);
    return out;
  }
  function dailyPrompts(k) {
    const days = Math.max(1, Math.floor(PROMPTS.length / DAILY_N));
    const d = dayIndex(k), c = Math.floor(d / days), j = d - c * days;
    return pass(c).slice(j * DAILY_N, j * DAILY_N + DAILY_N);
  }

  // The days in a row with a finished Daily Dig, each played on its own day, up to today (or
  // yesterday, while today's is still to do).
  function streak(d, today = dayKey()) {
    const done = (k) => {
      const e = d && d.daily && d.daily[k];
      return !!(e && e.done && e.on === k);
    };
    let k = done(today) ? today : addDays(today, -1), n = 0;
    while (done(k)) {
      n++;
      k = addDays(k, -1);
    }
    return n;
  }

  // ---------- depth ----------

  const CORE = 700;      // points to the centre of the Earth
  const EARTH = 6371000; // metres
  const DK = CORE / Math.log1p(EARTH / 0.1);
  const metres = (p) => (p >= CORE ? EARTH : 0.1 * Math.expm1(Math.max(0, p) / DK));
  const ptsOf = (m) => DK * Math.log1p(m / 0.1);
  function fmtDepth(m) {
    if (m < 1) return `${Math.round(m * 100)} CM`;
    if (m < 10) return `${m.toFixed(1)} M`;
    if (m < 1000) return `${Math.round(m)} M`;
    const km = m / 1000;
    return `${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString("en-GB")} KM`;
  }

  // The layers on the way down: where each starts (metres), its caption, and its colours.
  const LAYERS = [
    { m: 0, name: "TOPSOIL", note: "Home sweet home: most earthworms live in the top 30 cm.", base: "#6b4a2f", dark: "#573b25", light: "#7f5b3b" },
    { m: 0.3, name: "TREE ROOTS", note: "The deepest roots ever found went down 120 m.", base: "#5b4029", dark: "#4a3320", light: "#6e5034" },
    { m: 2, name: "CLAY AND LOST COINS", note: "Roman London lies several metres under today's streets.", base: "#9e5c3a", dark: "#874c2f", light: "#b06b45" },
    { m: 10, name: "THE FOSSIL BED", note: "Shells and ferns from 300 million years ago.", base: "#968466", dark: "#7f6f55", light: "#a99778" },
    { m: 40, name: "DINOSAUR BONES", note: "T. rex lived about 66 million years ago.", base: "#86704f", dark: "#715e42", light: "#987f5c" },
    { m: 100, name: "THE UNDERGROUND RIVER", note: "There's far more fresh water underground than in every river and lake.", base: "#545c63", dark: "#454c52", light: "#646d75" },
    { m: 300, name: "THE CRYSTAL CAVES", note: "Mexico's Cave of Crystals, 300 m down, has crystals longer than a bus.", base: "#3b3348", dark: "#2f283a", light: "#4a4159" },
    { m: 4000, name: "THE DEEPEST MINE", note: "South Africa's deepest gold mine goes down about 4 km.", base: "#4a4038", dark: "#3c342d", light: "#5a4e44" },
    { m: 12262, name: "THE KOLA BOREHOLE", note: "The deepest hole ever drilled: 12.3 km, in Russia.", base: "#5c5250", dark: "#4b4341", light: "#6d6260" },
    { m: 35000, name: "THE MANTLE", note: "Hot rock that flows, very slowly.", base: "#8c3523", dark: "#72291b", light: "#a5452c" },
    { m: 2890000, name: "THE OUTER CORE", note: "Swirling liquid iron, which makes the Earth's magnetic field.", base: "#d0632a", dark: "#b45222", light: "#e57a36" },
    { m: 5150000, name: "THE INNER CORE", note: "A ball of solid iron, as hot as the surface of the Sun.", base: "#efb240", dark: "#dc9a2e", light: "#f7c95e" },
  ].map((L, i) => ({ ...L, i, p: ptsOf(L.m) }));
  const layerAt = (p) => {
    let k = 0;
    while (k + 1 < LAYERS.length && p >= LAYERS[k + 1].p) k++;
    return k;
  };
  const placeAt = (p) => (p >= CORE ? "THE CENTRE OF THE EARTH" : p <= 0 ? "THE SURFACE" : LAYERS[layerAt(p)].name);

  // this profile's Wormhole data
  function data() {
    const d = (TT.store.games.worm ||= {});
    d.best ||= 0;
    d.plays ||= 0;
    d.crowd ||= {};
    d.daily ||= {};
    d.blitz ||= {};
    d.history ||= [];
    return d;
  }

  // ---------- the art ----------

  const hash = (a, b) => {
    let h = Math.imul(a * 374761393 + b * 668265263, 1274126177);
    h ^= h >>> 13;
    h = Math.imul(h, 1103515245);
    h ^= h >>> 16;
    return ((h >>> 0) % 10000) / 10000;
  };
  const ease = (u) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, u))) / 2;
  const TIER_COL = ["#b9b5a2", "#d08f4f", "#68b8dc", "#f4c84e"];

  // A sprite from rows of palette letters ("." is clear), with a dark outline round it, drawn once.
  const sheets = new Map();
  function sprite(name, rows, pal, line = "#2a2823") {
    if (sheets.has(name)) return sheets.get(name);
    const c = document.createElement("canvas");
    c.width = rows[0].length + 2;
    c.height = rows.length + 2;
    const x = c.getContext("2d");
    const paint = (dx, dy, color) => rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === ".") return;
      x.fillStyle = color || pal[ch];
      x.fillRect(i + 1 + dx, j + 1 + dy, 1, 1);
    }));
    if (line) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(dx, dy, line);
    paint(0, 0);
    sheets.set(name, c);
    return c;
  }
  // draws a sprite centred on (x, y), px screen pixels to a sprite pixel
  function put(ctx, c, x, y, px, flip = false, alpha = 1) {
    const w = c.width * px, h = c.height * px;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x - (flip ? -w / 2 : w / 2)), Math.round(y - h / 2));
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(c, 0, 0, w, h);
    ctx.restore();
  }

  const ART = {
    robin: [["....bbb..", "...bbbkb.", "...bbbbby", ".bbrrrb..", "bbbrrrr..", ".bbbrrb..", "...l.l..."], { b: "#7a5a3a", k: "#1d1b18", y: "#e0a030", r: "#d0543a", l: "#c88a3c" }],
    robinPeck: [[".........", "....bbb..", "...bbbkb.", ".bbrrbbby", "bbbrrrr..", ".bbbrrb..", "...l.l..."], { b: "#7a5a3a", k: "#1d1b18", y: "#e0a030", r: "#d0543a", l: "#c88a3c" }],
    mole: [["...gggggg...", "..gggggggg..", ".gggggggkggn", "gggggggggggn", "gggggggggg..", ".cc.gggg.cc."], { g: "#4a4048", k: "#111", n: "#f08a9a", c: "#e8b0a0" }],
    chest: [["wwwwwwwwwwww", "wbbbbbbbbbbw", "wbbbbggbbbbw", "wwwwwggwwwww", "wbbbbbbbbbbw", "wbbbbbbbbbbw", "wwwwwwwwwwww"], { w: "#c9a227", b: "#8a5a2e", g: "#f2d77a" }],
    coin: [[".ggg.", "gglgg", "gglgg", "gglgg", ".ggg."], { g: "#d9b44a", l: "#f6e08e" }],
    pot: [[".tttt.", "tttttt", ".tddt.", "tttttt", "tttttt", ".tttt."], { t: "#b5653a", d: "#7a3f22" }],
    skull: [["...bbbbbbb......", ".bbbbbbbbbbbb...", "bbbbkkbbbbbbbbb.", "bbbbkkbbbbbbbbbb", "bbbbbbbbbbbbbbbb", "bbbbbbbtbtbtbtb.", ".bbbbb..........", "..btbtbtbtbt....", "..bbbbbbbbbbbb..", "....bbbbbbbb...."], { b: "#e6dac0", k: "#3a332a", t: "#fffaf0" }],
    bone: [["bb.......bb", "bbbbbbbbbbb", "bb.......bb"], { b: "#e6dac0" }],
    shell: [["..sss..", ".sssss.", "sdsdsds", "sdsdsds", ".sdsds.", "..sss.."], { s: "#d8c9a5", d: "#a8987a" }],
    fish: [["..wwww...", ".wwwwwwkw", "wwwwwwwww", ".wwwwwww.", "w..ww...."], { w: "#e8eef0", k: "#6a7a84" }],
    crystal: [["....c....", "...ccc...", "..clcc.c.", "..clcc.cc", ".cclccclc", ".ccdcccdc", "ccdcccdcc", "ddddddddd"], { c: "#b48ad8", l: "#e3ccf5", d: "#7b5aa0" }],
    crystal2: [["...c.....", "..ccc.c..", "..clc.cc.", ".cclccclc", ".clcccdcc", "ccdcccdcc", "ddddddddd"], { c: "#7fd4e0", l: "#d5f6fb", d: "#4b97a8" }],
    cart: [["mmmmmmmmmmmm", "mgggyggggygm", "mrrrrrrrrrrm", "mrrrrrrrrrrm", ".mrrrrrrrrm.", "..mmmmmmmm..", "..ww....ww.."], { m: "#7a7a78", g: "#d9b44a", y: "#f6e08e", r: "#7a4a2a", w: "#2f2f2f" }],
    lantern: [[".mmm.", "mylym", "myyym", "mylym", ".mmm."], { m: "#3a3a38", y: "#f2c54b", l: "#fff3b0" }],
    drill: [["..sss..", "..sss..", ".sssss.", ".sdsds.", "sssssss", ".sdsds.", "..sds..", "..sss..", "...s...", "...s..."], { s: "#b8c0c8", d: "#6a7078" }],
    flower: [[".p.", "pyp", ".p.", ".g.", ".g."], { p: "#e8a0b8", y: "#f2d77a", g: "#5d8a3a" }],
    flower2: [[".w.", "wyw", ".w.", ".g.", ".g."], { w: "#f4f1e6", y: "#e0a030", g: "#5d8a3a" }],
  };
  const art = (name) => sprite(name, ...ART[name]);

  // ---------- the worm ----------

  const WORM = { o: "#5a2e33", p: "#e58c8a", h: "#f6b8b1", s: "#c96c6e", b: "#ee9f86" };
  // one round segment of the worm, r pixels across its middle, outlined; band: the paler saddle
  function segment(r, band) {
    const name = `seg${r}${band ? "b" : ""}`;
    if (sheets.has(name)) return sheets.get(name);
    const n = 2 * r + 3, c = document.createElement("canvas");
    c.width = c.height = n;
    const x = c.getContext("2d"), m = r + 1;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const dx = i - m, dy = j - m, d2 = dx * dx + dy * dy;
        let col = null;
        if (d2 <= r * r + r * 0.6) col = dx + dy <= -r * 0.9 ? WORM.h : dx + dy >= r * 0.9 ? WORM.s : band ? WORM.b : WORM.p;
        else if (d2 <= (r + 1) * (r + 1) + r * 0.6) col = WORM.o;
        if (col) {
          x.fillStyle = col;
          x.fillRect(i, j, 1, 1);
        }
      }
    }
    sheets.set(name, c);
    return c;
  }

  // Points spaced along a path (an array of [x, y], ending at the head), walking back from its end.
  function along(path, gaps) {
    const out = [];
    let i = path.length - 1, walked = 0, want = 0;
    for (const g of gaps) {
      want += g;
      while (i > 0) {
        const [ax, ay] = path[i], [bx, by] = path[i - 1];
        const len = Math.hypot(ax - bx, ay - by);
        if (walked + len >= want) {
          const u = len ? (want - walked) / len : 0;
          out.push([ax + (bx - ax) * u, ay + (by - ay) * u, Math.atan2(ay - by, ax - bx)]);
          break;
        }
        walked += len;
        i--;
      }
      if (i <= 0) {
        const [x, y] = path[0];
        out.push([x - (want - walked), y, 0]); // on past the path's start, along the ground
      }
    }
    return out;
  }

  const SEGS = 10;
  // The worm along its path. moving: digging (stretched out); face: { blink, happy }.
  function drawWorm(ctx, path, P, t, moving, face) {
    const r = 3, sp = (moving ? 1.9 : 1.5) * r * P;
    const pts = along(path, Array.from({ length: SEGS }, (_, k) => (k ? sp : 0)));
    const head = pts[0];
    for (let k = SEGS - 1; k >= 0; k--) {
      const [x, y, a] = pts[k];
      // a little wiggle while it rests
      const wig = moving ? 0 : Math.sin(t / 240 + k * 0.9) * P * 0.7;
      const px = x - Math.sin(a) * wig, py = y + Math.cos(a) * wig;
      const c = segment(k === 0 ? r + 1 : r, k === 3);
      put(ctx, c, Math.round(px / P) * P, Math.round(py / P) * P, P);
    }
    // the face, looking where it's going
    const [hx, hy, ha] = head;
    const fx = Math.round(hx / P) * P, fy = Math.round(hy / P) * P;
    const dx = Math.cos(ha), dy = Math.sin(ha), nx = -dy, ny = dx;
    const eye = (side) => [fx + dx * 1.6 * P + nx * side * 1.7 * P, fy + dy * 1.6 * P + ny * side * 1.7 * P];
    for (const side of [-1, 1]) {
      const [ex, ey] = eye(side);
      const x = Math.round(ex / P) * P, y = Math.round(ey / P) * P;
      ctx.fillStyle = "#2a1d1f";
      if (face.happy) {
        ctx.fillRect(x - P, y, P, P);
        ctx.fillRect(x, y - P, P, P);
        ctx.fillRect(x + P, y, P, P);
      } else if (face.blink) ctx.fillRect(x - P, y, 2 * P, P);
      else {
        ctx.fillRect(x - P, y - P, 2 * P, 2 * P);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x - P, y - P, P, P);
      }
      ctx.fillStyle = "#f07a78";
      ctx.fillRect(Math.round((x + dx * 1.4 * P) / P) * P + (side > 0 ? 0 : -P), Math.round((y + dy * 1.4 * P) / P) * P + P, P, P);
    }
  }

  // ---------- the scene ----------

  // where the tunnel runs, across the screen, at a depth (points): it meanders as it goes down
  const tunnelX = (p, w) => w * (0.42 + 0.055 * Math.sin(p / 19) + 0.025 * Math.sin(p / 7.1 + 1.3));

  // The ground's texture: a layer's colours in screen pixels a sprite pixel across, made once each.
  const textures = new Map();
  function texture(L, P) {
    const name = `${L.i}:${P}`;
    if (textures.has(name)) return textures.get(name);
    const N = 24, c = document.createElement("canvas");
    c.width = c.height = N * P;
    const x = c.getContext("2d");
    x.fillStyle = L.base;
    x.fillRect(0, 0, c.width, c.height);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const h = hash(i + L.i * 97, j);
        if (h < 0.16) x.fillStyle = L.dark;
        else if (h > 0.9) x.fillStyle = L.light;
        else continue;
        x.fillRect(i * P, j * P, P * (h > 0.97 || h < 0.04 ? 2 : 1), P);
      }
    }
    textures.set(name, c);
    return c;
  }

  // Things in each layer, at fixed places: [x as a share of the width, depth through the layer, kind].
  // They keep clear of the tunnel's middle third.
  function decor(L) {
    const n = Math.max(4, Math.round((LAYERS[L.i + 1] ? LAYERS[L.i + 1].p - L.p : 60) / 9));
    const out = [];
    for (let k = 0; k < n; k++) {
      const left = hash(L.i, k * 3) < 0.5;
      out.push([left ? 0.04 + hash(L.i, k * 3 + 1) * 0.22 : 0.64 + hash(L.i, k * 3 + 1) * 0.24, hash(L.i + 50, k), k]);
    }
    return out;
  }
  const decors = LAYERS.map(decor);

  // What runs right across a layer: the river, the mine's tunnel, the borehole.
  function drawLayerBase(ctx, L, top, bot, v) {
    const { w, h, P, t } = v;
    const span = bot - top;
    if (L.i === 5) {
      const ry = top + span * 0.45, rh = Math.max(14 * P, span * 0.12);
      if (ry > h || ry + rh < 0) return;
      ctx.fillStyle = "#3d6f8f";
      ctx.fillRect(0, ry, w, rh);
      ctx.fillStyle = "rgba(220,240,250,0.5)";
      for (let i = 0; i < 18; i++) {
        const sx = ((hash(i, 5) * w + t * 0.05 * (1 + hash(i, 6))) % (w + 40)) - 20;
        ctx.fillRect(Math.round(sx / P) * P, ry + Math.round((hash(i, 7) * (rh - 2 * P)) / P) * P, 5 * P, P);
      }
      put(ctx, art("fish"), ((t * 0.04 + 100) % (w + 80)) - 40, ry + rh / 2, P);
    } else if (L.i === 7) {
      const my = top + span * 0.35;
      if (my - 16 * P > h || my + 8 * P < 0) return;
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0, my - 12 * P, w, 16 * P);
      ctx.fillStyle = "#7a5a3a";
      for (let bx = 0; bx < w; bx += 46 * P) {
        ctx.fillRect(bx, my - 12 * P, 2 * P, 16 * P);
        ctx.fillRect(bx - 4 * P, my - 13 * P, 10 * P, 2 * P);
      }
      ctx.fillStyle = "#8a8a88";
      ctx.fillRect(0, my + 3 * P, w, P);
      put(ctx, art("cart"), w * 0.2 + Math.sin(t / 2500) * 30 * P, my - 2 * P, P);
      for (let bx = 23 * P; bx < w; bx += 92 * P) {
        ctx.fillStyle = "rgba(242,197,75,0.12)";
        ctx.beginPath();
        ctx.arc(bx, my - 8 * P, 10 * P, 0, Math.PI * 2);
        ctx.fill();
        put(ctx, art("lantern"), bx, my - 8 * P, P);
      }
    } else if (L.i === 8) {
      const dx = w * 0.12, end = top + span * 0.7;
      if (top > h || end < 0) return;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(dx - 3 * P, top, 6 * P, end - top);
      ctx.fillStyle = "#9aa2aa";
      ctx.fillRect(dx - P, top, 2 * P, end - top);
      put(ctx, art("drill"), dx, end, P);
    }
  }

  function drawLayerThings(ctx, L, top, bot, v) {
    const { w, P, t } = v;
    const span = bot - top;
    const items = decors[L.i];
    for (const [fx, fy, k] of items) {
      const x = fx * w, y = top + 6 * P + fy * Math.max(0, span - 12 * P);
      if (y < -60 || y > v.h + 60) continue;
      const h = hash(L.i + 7, k);
      switch (L.i) {
        case 0: // topsoil: pebbles and little roots
          ctx.fillStyle = h < 0.5 ? "#8b8070" : "#6f665a";
          ctx.fillRect(Math.round(x / P) * P, Math.round(y / P) * P, P * (2 + Math.round(h * 2)), P * 2);
          if (h > 0.7) {
            ctx.fillStyle = "#3e2a1a";
            for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(x / P) * P + (i % 2) * P, Math.round(y / P) * P - 12 * P + i * 2 * P, P, 2 * P);
          }
          break;
        case 1: // roots, and a mole in its burrow
          if (k === 1) {
            const mx = x + Math.sin(t / 900) * 18 * P;
            ctx.fillStyle = "rgba(0,0,0,0.35)";
            ctx.fillRect(x - 26 * P, y - 4 * P, 52 * P, 8 * P);
            put(ctx, art("mole"), mx, y, P, Math.cos(t / 900) < 0);
          } else {
            ctx.strokeStyle = "#3e2a1a";
            ctx.lineWidth = 2 * P;
            ctx.beginPath();
            ctx.moveTo(x, y - 20 * P);
            ctx.quadraticCurveTo(x + (h - 0.5) * 30 * P, y, x + (h - 0.5) * 16 * P, y + 18 * P);
            ctx.moveTo(x + (h - 0.5) * 8 * P, y - 4 * P);
            ctx.lineTo(x + (h > 0.5 ? 12 : -12) * P, y + 6 * P);
            ctx.stroke();
          }
          break;
        case 2: // clay: lost coins, a pot, buried treasure
          if (k === 2) put(ctx, art("chest"), x, y, P);
          else if (h < 0.3) put(ctx, art("pot"), x, y, P);
          else put(ctx, art("coin"), x, y, P);
          break;
        case 3: // fossils: coiled ammonites and shells
          if (h < 0.55) {
            ctx.strokeStyle = "#d8c9a5";
            ctx.lineWidth = P;
            ctx.beginPath();
            for (let a = 0; a <= 64; a++) {
              const ang = a * 0.2, rr = (0.6 + ang * 0.75) * P;
              const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr;
              if (a) ctx.lineTo(px, py);
              else ctx.moveTo(px, py);
            }
            ctx.stroke();
            ctx.fillStyle = "#a8987a";
            for (let a = 3; a < 13; a++) {
              const ang = a * 0.95, rr = (0.6 + ang * 0.75) * P;
              ctx.fillRect(Math.round((x + Math.cos(ang) * rr) / P) * P, Math.round((y + Math.sin(ang) * rr) / P) * P, P, P);
            }
          } else put(ctx, art("shell"), x, y, P);
          break;
        case 4: // dinosaur bones
          if (k === 1) put(ctx, art("skull"), x, y, P, fx > 0.5);
          else if (k === 3) {
            ctx.strokeStyle = "#e6dac0";
            ctx.lineWidth = P;
            for (let i = 0; i < 5; i++) {
              ctx.beginPath();
              ctx.arc(x + i * 4 * P, y, 7 * P, Math.PI * 0.15, Math.PI * 0.85);
              ctx.stroke();
            }
            ctx.fillStyle = "#e6dac0";
            ctx.fillRect(x - 4 * P, y - P, 24 * P, 2 * P);
          } else put(ctx, art("bone"), x, y, P);
          break;
        case 5: // drips of water in the rock
          ctx.fillStyle = "rgba(120,170,200,0.3)";
          ctx.fillRect(Math.round(x / P) * P, Math.round(y / P) * P, 2 * P, 3 * P);
          break;
        case 6: // crystal caves
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.beginPath();
          ctx.ellipse(x, y, 18 * P, 9 * P, 0, 0, Math.PI * 2);
          ctx.fill();
          put(ctx, art(h < 0.5 ? "crystal" : "crystal2"), x, y + 3 * P, P);
          if (Math.sin(t / 400 + k * 2) > 0.85) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(Math.round((x + 2 * P) / P) * P, Math.round((y - 4 * P) / P) * P, P, P);
          }
          break;
        case 7: // the mine: specks of gold in the rock
        case 8: // the borehole's granite, flecked
          ctx.fillStyle = L.i === 7 ? (h < 0.5 ? "#d9b44a" : "#8a7a5a") : (h < 0.5 ? "#9a8e88" : "#3c3533");
          ctx.fillRect(Math.round(x / P) * P, Math.round(y / P) * P, P * (1 + Math.round(h)), P);
          break;
        case 9: { // the mantle: slow, glowing blobs of rock
          const by = y + Math.sin(t / 3000 + k) * 20 * P, rr = (6 + h * 8) * P;
          ctx.fillStyle = "rgba(225,105,45,0.32)";
          ctx.beginPath();
          ctx.arc(x, by, rr, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,190,100,0.28)";
          ctx.beginPath();
          ctx.arc(x - rr * 0.25, by - rr * 0.25, rr * 0.45, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 10: // the outer core: swirls of liquid iron
          ctx.strokeStyle = "rgba(255,220,140,0.35)";
          ctx.lineWidth = 2 * P;
          ctx.beginPath();
          for (let i = 0; i <= 20; i++) {
            const sx = x - 30 * P + i * 3 * P;
            const sy = y + Math.sin(i / 3 + t / 700 + k) * 5 * P;
            if (i) ctx.lineTo(sx, sy);
            else ctx.moveTo(sx, sy);
          }
          ctx.stroke();
          break;
        default:
          break;
      }
    }
  }

  // The whole scene at a moment. v: { w, h, t, P, pts (the worm's depth), moving, digs, finds,
  //   firstDig (when the worm first dug), happy (until when it's pleased), night }
  function drawScene(ctx, v) {
    const { w, h, t, P, pts } = v;
    const PX = h / 100; // screen pixels a point
    const Y = (p) => p * PX;
    const camY = Y(pts) - h * 0.42;
    const sy = (p) => Y(p) - camY; // a depth's place on screen
    ctx.clearRect(0, 0, w, h);

    // the sky, while the surface is in view
    const ground = sy(0);
    if (ground > 0) {
      const g = ctx.createLinearGradient(0, 0, 0, ground);
      g.addColorStop(0, "#9cc3d5");
      g.addColorStop(1, "#d8e6d6");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, ground);
      ctx.fillStyle = "#f4f1e6";
      for (let i = 0; i < 4; i++) {
        const cx = ((hash(i, 30) * w + t * 0.008 * (1 + i * 0.3)) % (w + 120)) - 60;
        const cy = ground - h * 0.25 - hash(i, 31) * h * 0.25;
        for (let j = 0; j < 4; j++) ctx.fillRect(Math.round((cx + j * 6 * P - (j === 3 ? 12 * P : 0)) / P) * P, Math.round((cy - (j % 2) * 3 * P) / P) * P, 10 * P, 4 * P);
      }
    }

    // the ground: each layer in view, with its things
    for (const L of LAYERS) {
      const next = LAYERS[L.i + 1];
      const top = sy(L.p), bot = next ? sy(next.p) : h + 1;
      if (bot < 0 || top > h) continue;
      ctx.save();
      ctx.translate(0, -Math.round(camY));
      ctx.fillStyle = ctx.createPattern(texture(L, P), "repeat");
      ctx.fillRect(0, Math.max(top, 0) + Math.round(camY), w, Math.min(bot, h) - Math.max(top, 0));
      ctx.restore();
      if (L.i > 0) {
        // a ragged line where one layer meets the next
        ctx.fillStyle = L.dark;
        for (let x = 0; x < w; x += 2 * P) ctx.fillRect(x, Math.round((top + Math.sin(x / 37 + L.i) * 2 * P) / P) * P, 2 * P, P);
      }
      drawLayerBase(ctx, L, top, bot, v);
      drawLayerThings(ctx, L, top, bot, v);
    }
    // past the centre of the Earth, a glow
    const cy = sy(CORE);
    if (cy > -h && cy < 2 * h) {
      const g = ctx.createRadialGradient(w * 0.42, cy, 0, w * 0.42, cy, h * 0.9);
      g.addColorStop(0, "rgba(255,250,215,0.9)");
      g.addColorStop(0.4, "rgba(255,225,140,0.35)");
      g.addColorStop(1, "rgba(255,200,90,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // the surface: grass, flowers, the hole and a robin keeping watch
    if (ground > -20 && ground < h + 20) {
      ctx.fillStyle = "#6f8f4e";
      ctx.fillRect(0, ground - 3 * P, w, 4 * P);
      ctx.fillStyle = "#4e6a36";
      for (let x = 0; x < w; x += 3 * P) ctx.fillRect(x, ground - 3 * P - (hash(x, 9) < 0.5 ? P : 2 * P), P, 2 * P);
      for (let i = 0; i < 7; i++) {
        const fx = hash(i, 40) * w;
        if (Math.abs(fx - tunnelX(0, w)) < 40 * P) continue;
        put(ctx, art(i % 2 ? "flower" : "flower2"), fx, ground - 6 * P, P);
      }
      const hx = tunnelX(0, w);
      ctx.fillStyle = "#2a1d14";
      ctx.fillRect(Math.round((hx - 5 * P) / P) * P, ground - P, 10 * P, 3 * P);
      // the robin: pecking, then startled when the worm dives
      const rx = hx + 34 * P, ry = ground - 6 * P;
      const startled = v.firstDig != null && t >= v.firstDig && t - v.firstDig < 1100;
      const peck = !startled && Math.sin(t / 380) > 0.6;
      put(ctx, art(peck ? "robinPeck" : "robin"), rx, ry - (startled ? 3 * P : 0), P, true);
      if (startled) {
        ctx.fillStyle = "#3f3c33";
        ctx.font = `800 ${Math.round(9 * P)}px Archivo, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("!", rx, ry - 9 * P);
      }
    }

    // the tunnel the worm has dug, from the hole down to its head (the worm starts on the grass,
    // its head at the hole)
    const r = 3 * P;
    const lie = sy(0) - 3 * P;
    const tunnel = [];
    if (pts > 0) {
      const from = Math.max(0, pts - (h * 1.4) / PX);
      if (from === 0) tunnel.push([tunnelX(0, w), sy(0)]);
      for (let p = from; p < pts; p += 1.5) tunnel.push([tunnelX(p, w), sy(p)]);
      tunnel.push([tunnelX(pts, w), sy(pts)]);
      ctx.strokeStyle = "rgba(20,12,8,0.55)";
      ctx.lineWidth = r * 2.6;
      ctx.lineCap = ctx.lineJoin = "round";
      ctx.beginPath();
      tunnel.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    const near = !tunnel.length || tunnel[0][1] >= sy(0) - 1;
    const path = near ? [[tunnelX(0, w) - 14 * r, lie], [tunnelX(0, w), lie], ...tunnel] : tunnel;
    // made it to the centre of the Earth: a flag, planted
    if (pts >= CORE && cy > -40 && cy < h + 40) {
      const fx = Math.round((tunnelX(CORE, w) + r * 2.4) / P) * P, fy = Math.round(cy / P) * P;
      ctx.fillStyle = "#3f3c33";
      ctx.fillRect(fx, fy - 16 * P, P, 16 * P);
      ctx.fillStyle = "#d0543a";
      for (let i = 0; i < 6; i++) ctx.fillRect(fx + P, fy - 16 * P + i * P, (8 - Math.abs(i - 2.5) * 2.4) * P, P);
    }

    // what it's found on the way: a stone, copper, a gem or gold for each tier, with its name
    ctx.textBaseline = "middle";
    v.finds.forEach((f, i) => {
      const y = sy(f.at);
      if (y < -30 || y > h + 30 || t < f.s + f.d) return;
      const side = i % 2 ? 1 : -1;
      const gx = tunnelX(f.at, w) + side * (r * 1.6 + 5 * P);
      const sz = (2 + f.tier) * P;
      ctx.fillStyle = TIER_COL[f.tier];
      ctx.fillRect(Math.round((gx - sz / 2) / P) * P, Math.round((y - sz / 2) / P) * P, sz, sz);
      if (f.tier === 3 && Math.sin(t / 300 + i) > 0.5) {
        ctx.fillStyle = "#fffbe0";
        ctx.fillRect(Math.round((gx + sz / 2) / P) * P, Math.round((y - sz / 2 - P) / P) * P, P, P);
      }
      const fs = f.tier >= 2 ? Math.round(5 * P) + 2 : Math.round(4.2 * P) + 1;
      ctx.font = `800 ${fs}px Archivo, sans-serif`;
      ctx.textAlign = side > 0 ? "left" : "right";
      const tx = gx + side * (sz / 2 + 3 * P);
      const tw = ctx.measureText(f.name).width;
      ctx.fillStyle = "rgba(24,18,14,0.55)";
      ctx.fillRect(side > 0 ? tx - 2 * P : tx - tw - 2 * P, y - fs * 0.7, tw + 4 * P, fs * 1.4);
      ctx.fillStyle = TIER_COL[f.tier];
      ctx.fillText(f.name, tx, y + 1);
    });

    // earth flying up as it digs
    for (const [k, g] of v.digs.entries()) {
      if (t < g.s || t > g.s + g.d + 700 || g.d === 0) continue;
      const n = 5 + Math.round((g.to - g.from) / 6);
      for (let j = 0; j < n; j++) {
        const born = g.s + (g.d * j) / n, age = t - born;
        if (age < 0 || age > 650) continue;
        const p0 = g.from + (g.to - g.from) * ease((born - g.s) / g.d);
        const ang = -Math.PI / 2 + (hash(k, j) - 0.5) * 2.2, sp = 0.12 + hash(k, j + 99) * 0.2;
        const x = tunnelX(p0, w) + Math.cos(ang) * sp * age;
        const y = sy(p0) + Math.sin(ang) * sp * age + 0.0009 * age * age;
        ctx.fillStyle = LAYERS[layerAt(p0)][hash(k, j + 7) < 0.5 ? "light" : "dark"];
        ctx.fillRect(Math.round(x / P) * P, Math.round(y / P) * P, P, P);
      }
    }

    // the worm
    drawWorm(ctx, path, P, t, v.moving, { blink: t % 3400 < 130, happy: v.happy != null && t < v.happy });

    // the depth ruler, with each layer marked
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(242,238,226,0.5)";
    ctx.fillRect(w - 10, Math.max(0, ground), 2, h);
    const tick = 10;
    for (let p = Math.ceil(camY / PX / tick) * tick; Y(p) - camY < h; p += tick) {
      if (p < 0) continue;
      ctx.fillRect(w - (p % 50 ? 16 : 22), sy(p), p % 50 ? 6 : 12, 2);
    }
    ctx.font = `800 ${Math.max(10, Math.round(3.6 * P))}px Archivo, sans-serif`;
    ctx.textAlign = "right";
    for (const L of LAYERS) {
      const y = sy(L.p);
      if (y < 10 || y > h - 4) continue;
      ctx.fillStyle = "rgba(242,238,226,0.85)";
      ctx.fillText(L.name, w - 28, y + 14);
      ctx.fillStyle = "rgba(242,238,226,0.55)";
      ctx.fillText(fmtDepth(L.m), w - 28, y + 28);
    }

    // a new layer reached: its name and a fact, for a few seconds
    if (v.entered && t - v.entered.t < 3200) {
      const E = v.entered.L;
      const a = Math.min(1, (t - v.entered.t) / 250) * Math.min(1, (3200 - (t - v.entered.t)) / 500);
      ctx.globalAlpha = Math.max(0, a);
      const fs = Math.max(15, Math.round(h * 0.045));
      ctx.font = `800 ${fs}px Archivo, sans-serif`;
      ctx.textAlign = "center";
      const name = E.name, note = E.note;
      const nw = ctx.measureText(name).width;
      ctx.font = `600 ${Math.round(fs * 0.62)}px Archivo, sans-serif`;
      const tw = Math.max(nw, ctx.measureText(note).width);
      const bx = w * 0.5, by = h - fs * 3.4;
      ctx.fillStyle = "rgba(42,40,35,0.85)";
      ctx.fillRect(bx - tw / 2 - 16, by - fs * 1.1, tw + 32, fs * 2.5);
      ctx.fillStyle = "#f2eee2";
      ctx.font = `800 ${fs}px Archivo, sans-serif`;
      ctx.fillText(name, bx, by + fs * 0.1);
      ctx.fillStyle = "rgba(242,238,226,0.8)";
      ctx.font = `600 ${Math.round(fs * 0.62)}px Archivo, sans-serif`;
      ctx.fillText(note, bx, by + fs * 0.95);
      ctx.globalAlpha = 1;
    }
    if (v.night) {
      ctx.fillStyle = "rgba(20,19,16,0.3)";
      ctx.fillRect(0, 0, w, h);
    }
  }

  // The worm on its own, peeking up out of its hole, as an image for the game's pages.
  const ICON_W = 36, ICON_H = 40;
  let iconUrl = null;
  function wormIcon(size) {
    if (!iconUrl) {
      const c = document.createElement("canvas");
      c.width = ICON_W;
      c.height = ICON_H;
      const x = c.getContext("2d");
      const path = [];
      for (let i = 0; i <= 40; i++) {
        const u = i / 40;
        path.push([18 + Math.sin(u * Math.PI * 1.6) * 3.5, 37 - u * 28]);
      }
      x.fillStyle = "#2a1d14";
      x.fillRect(9, 36, 18, 3);
      drawWorm(x, path, 1, 0, false, { blink: false, happy: false });
      x.fillStyle = "#6b4a2f"; // the earth round the hole, in front of its tail
      x.fillRect(7, 37, 22, 3);
      x.fillStyle = "#7f5b3b";
      x.fillRect(8, 37, 4, 1);
      x.fillRect(24, 37, 4, 1);
      iconUrl = c.toDataURL();
    }
    return `<img class="px-art wm-icon" src="${iconUrl}" width="${size}" height="${Math.round((size * ICON_H) / ICON_W)}" alt="" aria-hidden="true">`;
  }

  // ---------- a round ----------
  // A round is a list of events, [t, type, data], t in ms of game time (pauses left out):
  //   [t, "prompt", i]            prompt i comes up and its clock starts
  //   [t, "key", k]               a key: a character, "<" Backspace, "{" Ctrl+Backspace
  //   [t, "submit", {typed, r}]   Enter. r is what it counted as, worked out as it was typed:
  //                               { name, form, how, tier, pts, mult, share, others, before, cuts }
  //                               or { bad: "none" | "dup" | "amb", what, opts }
  //   [t, "timeout", {cuts, common}]  the prompt's time ran out
  //   [t, "end"]
  // newState and step turn them into what's on screen, for the game and its replay alike.

  const digMs = (pts) => 380 + Math.min(1700, pts * 7);

  // spec: { mode: "daily", date, prompts, resume? } or { mode: "blitz", pack, prompts: [id] }
  function newState(spec) {
    const st = {
      spec, mode: spec.mode, prompts: spec.prompts, i: -1, phase: "count",
      askAt: 0, typed: "", score: 0, digs: [], finds: [], picks: [], given: new Set(),
      streak: 0, bestStreak: 0, wrong: 0, note: null, reveal: null, digEnd: 0, base: 0, upAt: null, overAt: null,
    };
    // a Daily Dig picked up where it was left
    const res = spec.resume;
    if (res && res.picks && res.picks.length) {
      st.base = res.picks.length;
      st.picks = res.picks.map((p) => (p && p.name ? { ...p } : null));
      let at = 0;
      for (const p of st.picks) {
        if (!p) continue;
        at += p.pts;
        st.finds.push({ ...p, at, s: 0, d: 0, t: 0 });
      }
      st.score = at;
      if (at) st.digs.push({ s: 0, d: 0, from: 0, to: at });
    }
    return st;
  }

  function step(st, [t, type, data]) {
    if (type === "prompt") {
      Object.assign(st, { i: data, phase: "ask", askAt: t, typed: "", note: null, reveal: null });
    } else if (type === "key") {
      st.typed = data === "<" ? st.typed.slice(0, -1) : data === "{" ? "" : st.typed + data;
      if (st.note && !st.note.r.name) st.note = null;
    } else if (type === "submit") {
      const { typed, r } = data;
      st.note = { t, r, typed };
      if (!r.name) {
        if (r.bad === "none") st.wrong++;
        if (r.bad !== "amb" && r.bad !== "near") st.typed = ""; // a suggestion keeps what you typed
        return;
      }
      st.typed = "";
      const s = Math.max(t, st.digEnd), d = digMs(r.pts);
      st.digs.push({ s, d, from: st.score, to: st.score + r.pts });
      st.digEnd = s + d;
      st.score += r.pts;
      const f = { name: r.name, tier: r.tier, pts: r.pts, mult: r.mult, at: st.score, i: st.i, t, s, d, typed, form: r.form, how: r.how };
      st.finds.push(f);
      st.given.add(r.name);
      st.streak = r.tier >= 2 ? st.streak + 1 : 0;
      st.bestStreak = Math.max(st.bestStreak, st.streak);
      if (st.mode === "daily") {
        st.picks[st.i] = f;
        st.phase = "reveal";
        st.reveal = { t, f, r };
      }
    } else if (type === "timeout") {
      if (st.mode === "daily") {
        st.picks[st.i] = null;
        st.phase = "reveal";
        st.reveal = { t, f: null, r: data };
        st.typed = "";
      } else {
        st.phase = "up";
        st.upAt = t;
      }
    } else if (type === "end") {
      st.phase = "over";
      st.overAt = t;
    }
  }

  // the worm's depth (points) at a moment, part way through a dig if it's digging
  function ptsAt(st, T) {
    let p = 0;
    for (const g of st.digs) {
      if (T >= g.s + g.d) p = g.to;
      else {
        if (T > g.s) p = g.from + (g.to - g.from) * ease((T - g.s) / g.d);
        break;
      }
    }
    return p;
  }
  const digging = (st, T) => st.digs.some((g) => g.d > 0 && T >= g.s && T < g.s + g.d);

  const limitOf = (st) => (st.mode === "daily" ? DAILY_MS : BLITZ_MS);
  const leftAt = (st, T) => (st.phase === "ask" ? Math.max(0, limitOf(st) - (T - st.askAt)) : st.phase === "count" ? limitOf(st) : 0);

  TT.wormCore = {
    POINTS, TIERS, CUTS, PRIOR, MULTS, DAILY_N, DAILY_MS, BLITZ_MS, CORE, LAYERS, PACKS, PROMPTS, TIER_COL,
    key, singles, osa, slips, bank, match, nearest, crowdShare, tierOf, household, deepCuts, commonest,
    dayKey, dayIndex, addDays, dayLabel, dailyPrompts, streak, metres, ptsOf, fmtDepth, layerAt, placeAt,
    promptById, packName, data, newState, step, ptsAt, wormIcon,
  };

  // ---------- the game ----------

  const W = TT.wordInput;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const tierTag = (tier) => `<span class="wm-tier t${tier}">${TIERS[tier]}</span>`;

  const TEMPLATE = `
    <div class="wm">
      <div class="wm-stage">
        <canvas class="wm-canvas" role="img" aria-label="The worm's dig"></canvas>
        <div class="fh-hud fh-hud-l wm-hud-l">
          <div class="fh-score"><span data-w="depth">0 CM</span><span class="caps-label">DEEP</span></div>
          <div class="caps-label" data-w="pts">0 POINTS</div>
        </div>
        <div class="fh-hud fh-hud-r">
          <div class="fh-chip wm-clock" data-w="clock"></div>
          <div class="fh-chip" data-w="step"></div>
          <div class="fh-chip wm-streak" data-w="streak" hidden></div>
        </div>
        <div class="wm-reveal" data-w="reveal" hidden></div>
        <div class="gr-count" data-w="count" hidden></div>
        <div class="fh-over wm-over" data-w="over" hidden></div>
      </div>
      <div class="wm-panel" data-w="panel">
        <div class="wm-bar"><i data-w="bar"></i></div>
        <div class="wm-ask">
          <div class="wm-q"><span class="caps-label" data-w="qlabel"></span><h2 data-w="q"></h2></div>
          <div class="wm-dots" data-w="dots"></div>
        </div>
        <div class="wm-input" data-w="input"><span class="wm-chev" aria-hidden="true">›</span><span class="wm-typed" data-w="typed"></span><span class="wm-caret" aria-hidden="true"></span></div>
        <div class="wm-note" data-w="note"></div>
        <div class="wm-found" data-w="found"></div>
      </div>
      <p class="visually-hidden" data-w="sr" aria-live="polite"></p>
    </div>`;

  TT.createWormhole = ({ root, onStart, onEnd, replayOnly = false }) => {
    root.innerHTML = TEMPLATE;
    const el = Object.fromEntries([...root.querySelectorAll("[data-w]")].map((x) => [x.dataset.w, x]));
    const canvas = root.querySelector(".wm-canvas");
    const ctx = canvas.getContext("2d");
    const snd = {
      music: () => TT.forestSound && TT.forestSound.startMusic("burrow", "wmMusic"),
      stop: (fade) => TT.forestSound && TT.forestSound.stopMusic(fade),
      play: (name) => !replayOnly && TT.forestSound && TT.forestSound.play(name, "wmSfx"),
    };
    let st = null;     // the round on screen (newState, step)
    let live = null;   // playing it: { ev, startAt, state, pausedAt, crowds, g, keys, removed, missed, ... }
    let replay = null; // replaying it: { rec, pos, T }
    let raf = 0, panelSig = "", hudSig = "", revealSig = "";

    const now = () => performance.now();
    const gameT = () => (live ? (live.state === "paused" ? live.pausedAt : live.state === "over" ? live.endT + live.startAt : now()) - live.startAt : replay ? replay.T : 0);
    new ResizeObserver(() => { if (st) render(gameT()); }).observe(root.querySelector(".wm-stage"));

    // ---------- drawing ----------

    // when the worm first reached the layer it's in (for its caption), from the digs
    function entered(T, p) {
      if (p <= 0) return null;
      const L = LAYERS[layerAt(p)];
      const at = (x) => ptsAt(st, x) >= Math.max(L.p, 1e-6);
      if (at(Math.max(0, T - 3200)) && T > 3200) return null;
      let lo = Math.max(0, T - 3200), hi = T;
      for (let n = 0; n < 14; n++) {
        const mid = (lo + hi) / 2;
        if (at(mid)) hi = mid;
        else lo = mid;
      }
      return { t: hi, L };
    }

    function draw(T) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h || !st) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pts = ptsAt(st, T);
      const deep = st.finds.filter((f) => f.tier === 3 && f.d > 0).map((f) => f.s + f.d);
      const happy = deep.filter((x) => x <= T).pop();
      drawScene(ctx, {
        w, h, t: T, P: Math.max(2, Math.round(h / 150)), pts, moving: digging(st, T),
        digs: st.digs, finds: st.finds, firstDig: st.digs.find((g) => g.d > 0)?.s ?? null,
        happy: happy != null ? happy + 1300 : null, entered: entered(T, pts),
        night: document.documentElement.dataset.theme === "night",
      });
    }

    function renderHud(T) {
      const pts = ptsAt(st, T), left = leftAt(st, T);
      const sig = [Math.round(pts), Math.ceil(left / 1000), st.phase, st.i, st.finds.length, st.streak].join("|");
      if (sig === hudSig) return;
      hudSig = sig;
      el.depth.textContent = fmtDepth(metres(pts));
      el.pts.textContent = `${Math.round(pts)} POINTS · ${placeAt(pts)}`;
      el.clock.hidden = st.phase !== "ask";
      el.clock.textContent = `0:${pad(Math.ceil(left / 1000))}`;
      el.clock.classList.toggle("low", st.phase === "ask" && left <= 5000);
      el.step.textContent = st.mode === "daily" ? `PROMPT ${(st.i < 0 ? st.base : st.i) + 1} / ${st.prompts.length}` : `${st.finds.length} FOUND`;
      const run = st.mode === "blitz" ? MULTS[Math.min(st.streak + 1, 4)] : 1;
      el.streak.hidden = !(st.mode === "blitz" && st.streak >= 1);
      el.streak.textContent = `RARE RUN ×${run}`;
    }

    // the prompt, what's been typed, and what's been found
    function renderPanel(T) {
      const left = leftAt(st, T);
      el.bar.style.transform = `scaleX(${st.phase === "ask" ? left / limitOf(st) : st.phase === "count" ? 1 : 0})`;
      el.bar.classList.toggle("low", st.phase === "ask" && left <= 5000);
      const note = st.note && (T - st.note.t < 2600 || st.note.r.bad === "near" || st.note.r.bad === "amb") ? st.note : null; // a suggestion stays until you type
      const sig = [st.phase, st.i, st.typed, st.finds.length, note && note.t, live && live.state].join("|");
      if (sig === panelSig) return;
      panelSig = sig;
      const p = promptById(st.prompts[Math.max(0, st.i)]) || { q: "" };
      const hidden = live && live.state === "paused" && st.mode === "daily";
      root.classList.toggle("wm-hide", !!hidden);
      if (st.phase === "count" && st.mode === "daily") {
        el.qlabel.textContent = st.spec.date ? `DAILY DIG · ${dayLabel(st.spec.date).toUpperCase()}` : "DAILY DIG";
        el.q.textContent = st.base ? `Picking up at prompt ${st.base + 1} of ${st.prompts.length}` : "Seven prompts. One answer each.";
      } else {
        el.qlabel.textContent = st.mode === "daily" ? `PROMPT ${st.i + 1} OF ${st.prompts.length}` : st.phase === "count" ? "GET READY" : `BLITZ · ${packName(st.spec.pack).toUpperCase()}`;
        el.q.textContent = p.q;
      }
      el.typed.textContent = st.typed;
      el.input.classList.toggle("off", st.phase !== "ask");
      // the last answer: what it counted as, or why it didn't
      let html = "";
      if (note) {
        const r = note.r;
        if (r.name) {
          const as = r.how === "exact" ? "" : ` · counted as <strong>${esc(r.name)}</strong>`;
          html = `${tierTag(r.tier)} <strong>+${r.pts}</strong>${r.mult > 1 ? ` <span class="wm-mult">×${r.mult}</span>` : ""} ${esc(r.name)}${as}`;
        } else if (r.bad === "dup") html = `You've already dug up <strong>${esc(r.what)}</strong>.`;
        else if (r.bad === "amb") html = `So close to two answers: did you mean ${r.opts.map((o) => `<strong>${esc(o)}</strong>`).join(" or ")}?`;
        else if (r.bad === "near") html = `Did you mean <strong>${esc(r.opts[0])}</strong>? Press <strong>Enter</strong> to dig it in, or keep typing.`;
        else html = `<strong>${esc(note.typed)}</strong> isn't in this ground. Try another.`;
      } else if (st.phase === "ask" && !st.typed) html = st.mode === "daily" ? "Type an answer and press Enter. Rarer answers dig deeper." : "Answer after answer: press Enter after each one.";
      el.note.innerHTML = html;
      el.note.className = `wm-note${note && !note.r.name ? " bad" : ""}`;
      // the Daily's seven, by tier; Blitz's finds, newest first
      if (st.mode === "daily") {
        el.dots.innerHTML = st.prompts.map((_, k) => {
          const pk = st.picks[k];
          const cls = k < st.picks.length ? (pk ? `t${pk.tier}` : "none") : k === st.i ? "now" : "";
          return `<span class="${cls}" title="Prompt ${k + 1}"></span>`;
        }).join("");
        el.found.innerHTML = "";
      } else {
        el.dots.innerHTML = "";
        el.found.innerHTML = st.finds.slice().reverse().map((f) => `<span class="wm-chip t${f.tier}">${esc(f.name)}<b>+${f.pts}</b></span>`).join("");
      }
    }

    // Daily: after each answer, what it was worth, who else said it and what else was down there
    function renderReveal(T) {
      const rv = st.phase === "reveal" ? st.reveal : null;
      const sig = rv ? `${rv.t}|${replayOnly}` : "";
      if (sig === revealSig) return;
      revealSig = sig;
      el.reveal.hidden = !rv;
      if (!rv) return;
      const r = rv.r, last = st.i + 1 >= st.prompts.length;
      const cuts = (r.cuts || []).map(esc).join(" · ");
      let body;
      if (rv.f) {
        const others = r.others ? `${r.others === 1 ? "Someone else" : `${r.others} others`} on this computer said it too.` : "Nobody else on this computer has said it.";
        const before = r.before ? ` You've used it ${r.before === 1 ? "once" : `${r.before} times`} before.` : "";
        body = `
          ${tierTag(r.tier)}
          <div class="wm-gain">+${r.pts}</div>
          <div class="wm-ans">${esc(r.name)}</div>
          ${r.how === "exact" ? "" : `<p>Counted as <strong>${esc(r.name)}</strong>.</p>`}
          <p>${others}${before}</p>`;
      } else {
        body = `
          <span class="wm-tier none">TIME'S UP</span>
          <div class="wm-gain">+0</div>
          ${r.common && r.common.length ? `<p>Most people say ${r.common.map((c) => `<strong>${esc(c)}</strong>`).join(" or ")}.</p>` : ""}`;
      }
      el.reveal.innerHTML = `${body}
        ${cuts ? `<div class="side-label">Deep cuts you could have used:</div><p class="wm-cuts">${cuts}</p>` : ""}
        ${replayOnly ? "" : `<div class="hints"><button data-act="wm:next"><kbd>ENTER</kbd>${last ? "SEE YOUR DIG" : "NEXT PROMPT"}</button></div>`}`;
      el.sr.textContent = rv.f ? `${TIERS[r.tier].toLowerCase()}, ${r.pts} points: ${r.name}` : "Time's up.";
    }

    function render(T) {
      draw(T);
      renderHud(T);
      renderPanel(T);
      renderReveal(T);
    }

    // ---------- playing ----------

    function emit(ev) {
      live.ev.push(ev);
      step(st, ev);
    }

    function newRound(spec) {
      cancelAnimationFrame(raf);
      replay = null;
      st = newState(spec);
      const all = everyone();
      live = {
        ev: [], startAt: now(), state: "running", crowds: spec.prompts.map((pid) => household(pid, all)),
        g: { wpmScale: W.scale() }, keys: {}, removed: [], missed: new Set(), counted: -1, countOff: Infinity, ticked: -1,
        layer: layerAt(st.score), cored: st.score >= CORE,
      };
      panelSig = hudSig = revealSig = "";
      el.over.hidden = el.count.hidden = el.reveal.hidden = true;
      root.classList.remove("wm-hide", "wm-done");
      render(0);
      raf = requestAnimationFrame(frame);
    }

    function frame() {
      if (!live || live.state !== "running") return;
      const T = gameT();
      advance(T);
      if (live.state !== "running") return;
      render(T);
      raf = requestAnimationFrame(frame);
    }

    // Brings the round up to time T: the countdown, a prompt's time running out, the end. (Each
    // frame does this, and so does each key, in case frames have been held back.)
    function advance(T) {
      if (st.phase === "count") {
        if (T >= COUNT_MS) {
          emit([COUNT_MS, "prompt", st.base]);
          countPop("DIG!", T + 650);
          snd.play("wmGo");
          snd.music();
          onStart && onStart();
        } else {
          const k = Math.floor(T / (COUNT_MS / 3));
          if (k !== live.counted) {
            live.counted = k;
            countPop(String(3 - k), Infinity);
            snd.play("wmCount");
          }
        }
      }
      if (T >= live.countOff) {
        el.count.hidden = true;
        live.countOff = Infinity;
      }
      if (st.phase === "ask") {
        const left = limitOf(st) - (T - st.askAt);
        if (left <= 0) timeUp(st.askAt + limitOf(st));
        else if (left <= 5000 && Math.ceil(left / 1000) !== live.ticked) {
          live.ticked = Math.ceil(left / 1000);
          snd.play("tick");
        }
      }
      if (st.phase === "up" && T - st.upAt >= UP_MS) return finish(T);
      const p = ptsAt(st, T), L = layerAt(p);
      if (L > live.layer) {
        live.layer = L;
        snd.play("wmLayer");
      }
      if (!live.cored && p >= CORE) {
        live.cored = true;
        snd.play("win");
      }
    }

    // the big word in the middle (3, 2, 1, DIG!, TIME'S UP), until off (game time)
    function countPop(text, off) {
      live.countOff = off;
      el.count.textContent = text;
      el.count.classList.toggle("long", text.length > 4);
      el.count.hidden = false;
      el.count.classList.remove("pop");
      void el.count.offsetWidth; // restart the pop
      el.count.classList.add("pop");
    }

    function shake() {
      el.input.classList.remove("shake");
      void el.input.offsetWidth;
      el.input.classList.add("shake");
    }

    function handleKey(e) {
      if (!live || live.state !== "running") return;
      const T = gameT();
      advance(T);
      if (live.state !== "running") return;
      if (st.phase === "reveal") {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          if (T - st.reveal.t > 450) next();
        }
        return;
      }
      if (st.phase !== "ask") return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (!e.repeat) submit(T);
        return;
      }
      let k;
      if (e.key === "Backspace") k = e.ctrlKey || e.altKey ? "{" : "<";
      else if (e.ctrlKey || e.altKey || e.metaKey) return;
      else if (e.key.length === 1 && /[\p{L}\p{N} '\-.&]/u.test(e.key)) k = e.key;
      else return;
      e.preventDefault();
      if (k === "<" || k === "{") {
        if (!st.typed) return;
        const gone = k === "<" ? [st.typed.length - 1] : [...st.typed].map((_, i) => i);
        for (const pos of gone) live.removed.push({ pos, ch: st.typed[pos] });
      } else if (st.typed.length >= MAX_TYPED || (k === " " && (!st.typed || st.typed.endsWith(" ")))) return;
      W.mark(live.g, T);
      emit([T, "key", k]);
      renderPanel(T);
    }

    function submit(T) {
      const typed = st.typed.trim();
      if (!typed) return;
      const b = bank(st.prompts[st.i]), crowd = live.crowds[st.i];
      let m = match(b, typed);
      let r;
      // too far off to count by itself: suggest the nearest answer, and a second Enter digs it in
      const near = m ? null : nearest(b, typed, st.given);
      if (near && near.i != null && live.near && live.near.typed === typed && live.near.i === near.i && live.near.p === st.i) {
        m = { i: near.i, form: near.form, how: "close" };
      }
      live.near = null;
      if (!m && near && near.amb) r = { bad: "amb", opts: near.amb.slice(0, 3).map((i) => b.answers[i].name) };
      else if (!m && near) {
        r = { bad: "near", opts: [b.answers[near.i].name] };
        live.near = { typed, i: near.i, p: st.i };
      } else if (!m) r = { bad: "none" };
      else if (m.amb) r = { bad: "amb", opts: m.amb.slice(0, 3).map((i) => b.answers[i].name) };
      else if (st.given.has(b.answers[m.i].name)) r = { bad: "dup", what: b.answers[m.i].name };
      else {
        const a = b.answers[m.i];
        const share = crowdShare(b, m.i, crowd), tier = tierOf(share);
        const run = tier >= 2 ? st.streak + 1 : 0;
        const mult = st.mode === "blitz" ? MULTS[Math.min(run, 4)] : 1;
        r = {
          name: a.name, form: m.form, how: m.how, tier, pts: Math.round(POINTS[tier] * mult), mult,
          share: Math.round(share * 10) / 10, others: crowd.others[a.name] || 0, before: crowd.mine[a.name] || 0,
        };
        if (st.mode === "daily") r.cuts = deepCuts(b, crowd, [a.name]);
      }
      emit([T, "submit", { typed, r }]);
      if (st.mode === "blitz") {
        el.sr.textContent = r.name ? `${TIERS[r.tier].toLowerCase()}, ${r.pts} points: ${r.name}`
          : r.bad === "dup" ? `Already dug up ${r.what}` : r.bad === "amb" ? `Did you mean ${r.opts.join(" or ")}?`
          : r.bad === "near" ? `Did you mean ${r.opts[0]}? Press Enter to dig it in.` : `${typed} isn't in the bank`;
      }
      if (r.name) {
        W.done(live.g, typed);
        countKeys(typed, r.form, r.name);
        snd.play(`wmTier${r.tier}`);
        if (st.mode === "daily") keepDaily();
      } else {
        W.drop(live.g);
        live.removed = [];
        snd.play(r.bad === "dup" ? "wmDup" : r.bad === "near" ? "wmCount" : "wrong");
        if (r.bad !== "amb" && r.bad !== "near") shake();
      }
      render(T);
    }

    // Each letter of the answer's right spelling is one expected key: a slip in it, or a letter
    // typed and then backspaced for something else, is a miss there (for weak keys, like the other games).
    function countKeys(typed, form, name) {
      const bump = (ch, miss) => {
        if (!/^[a-z]$/.test(ch)) return;
        const k = (live.keys[ch] ||= [0, 0]);
        k[0]++;
        if (miss) k[1]++;
      };
      const right = key(form), got = key(typed);
      const off = new Map();
      for (const [e] of slips(right, got)) if (e) off.set(e, (off.get(e) || 0) + 1);
      let missed = off.size > 0;
      for (const ch of right) {
        const m = off.get(ch) || 0;
        bump(ch, m > 0);
        if (m) off.set(ch, m - 1);
      }
      const low = typed.toLowerCase();
      for (const { pos, ch } of live.removed) {
        if (low[pos] && low[pos] !== ch.toLowerCase()) {
          bump(low[pos], true);
          missed = true;
        }
      }
      live.removed = [];
      if (missed) live.missed.add(name);
    }

    function timeUp(t) {
      const b = bank(st.prompts[st.i]), crowd = live.crowds[st.i];
      W.drop(live.g);
      live.removed = [];
      snd.play("wmUp");
      if (st.mode === "daily") {
        emit([t, "timeout", { cuts: deepCuts(b, crowd), common: commonest(b, crowd) }]);
        keepDaily();
      } else {
        emit([t, "timeout", {}]);
        snd.stop(0.8);
        countPop("TIME'S UP", Infinity);
      }
    }

    // Daily: on to the next prompt, or the end of the dig
    function next() {
      if (!live || st.phase !== "reveal") return;
      const T = gameT();
      if (st.i + 1 < st.prompts.length) {
        emit([T, "prompt", st.i + 1]);
        live.ticked = -1;
        render(T);
      } else finish(T);
    }

    // The Daily is kept a prompt at a time, so it can't be played twice: each answer (or none)
    // counts for the crowd straight away, and the dig is done once all seven are in.
    function keepDaily() {
      const d = data(), k = st.spec.date, pid = st.prompts[st.i], f = st.picks[st.i];
      const e = (d.daily[k] ||= { picks: [], score: 0, done: false });
      e.picks[st.i] = f ? { id: pid, name: f.name, tier: f.tier, pts: f.pts, typed: f.typed } : { id: pid, name: null, tier: -1, pts: 0 };
      e.score = e.picks.reduce((n, x) => n + (x ? x.pts : 0), 0);
      const c = (d.crowd[pid] ||= { n: 0, g: 0, v: {} });
      c.n++;
      if (f) {
        c.g++;
        c.v[f.name] = (c.v[f.name] || 0) + 1;
      }
      if (e.picks.filter(Boolean).length >= st.prompts.length && !e.done) {
        e.done = true;
        e.on = dayKey();
      }
      d.best = Math.max(d.best || 0, e.score);
      TT.save();
    }

    function finish(T) {
      emit([T, "end"]);
      live.state = "over";
      live.endT = T;
      cancelAnimationFrame(raf);
      snd.stop(0.6);
      save(T);
      render(T);
      showResults();
      onEnd && onEnd(live.id);
    }

    // The round is saved as it ends: the crowd (Blitz), bests, the history and the recording.
    function save(T) {
      const L = live, d = data();
      const id = TT.newRoundId(), date = new Date().toISOString();
      const round = (x) => Math.round(x * 100) / 100;
      const mine = st.finds.filter((f) => f.d > 0); // this round's (a picked-up Daily's earlier ones are already kept)
      const answers = mine.length;
      const wpm = W.wpm(L.g);
      let exp = 0, miss = 0;
      for (const [e, m] of Object.values(L.keys)) {
        exp += e;
        miss += m;
      }
      const acc = exp ? ((exp - miss) / exp) * 100 : 100;
      const rarest = mine.slice().sort((a, b) => b.tier - a.tier || b.pts - a.pts)[0] || null;
      const score = st.score;
      L.id = id;
      L.stats = { wpm, acc, answers, score, rarest };
      if (st.mode === "blitz") {
        const pid = st.prompts[0];
        const c = (d.crowd[pid] ||= { n: 0, g: 0, v: {} });
        c.n++;
        c.g += answers;
        for (const f of mine) c.v[f.name] = (c.v[f.name] || 0) + 1;
        const pk = st.spec.pack || "mixed";
        const prev = d.blitz[pk];
        L.prevBest = prev;
        L.newBest = !prev || score > prev.score;
        if (L.newBest) d.blitz[pk] = { score, n: answers, prompt: pid, date, id, streak: st.bestStreak };
        d.best = Math.max(d.best || 0, score);
      } else {
        const e = d.daily[st.spec.date];
        if (e) (e.rounds ||= []).push(id);
      }
      d.plays++;
      d.history.push({ date, mode: st.mode, day: st.spec.date, pack: st.spec.pack, prompts: st.prompts, score, n: answers, rarest: rarest && rarest.name, tier: rarest ? rarest.tier : -1, wpm: round(wpm), id });
      if (d.history.length > 200) d.history.splice(0, d.history.length - 200);

      // weak keys and the stats' history, like the other games
      const store = TT.store;
      store.history.push({
        id, date, kind: "game", game: "worm", mode: st.mode,
        title: st.mode === "daily" ? `Daily Dig ${dayLabel(st.spec.date, { day: "numeric", month: "short" })}` : promptById(st.prompts[0]).q,
        amount: answers, wpm: round(wpm), raw: round(wpm), acc: round(acc), seconds: round(T / 1000),
        keys: L.keys, missedWords: [...L.missed],
      });
      for (const [letter, [e, m]] of Object.entries(L.keys)) {
        const total = (store.keyStats[letter] ||= { expected: 0, missed: 0 });
        total.expected += e;
        total.missed += m;
      }
      for (const w of L.missed) store.weakWords[w] = (store.weakWords[w] || 0) + 1;
      TT.save();
      TT.rounds.save({
        id, date, kind: "game", game: "worm", mode: st.mode, title: store.history[store.history.length - 1].title,
        spec: { ...st.spec }, ev: L.ev, duration: Math.max(1, Math.round(T)), wpmScale: L.g.wpmScale,
      });
    }

    function showResults() {
      const L = live, d = data();
      const pts = st.score, m = metres(pts);
      const s = L.stats;
      let html;
      if (st.mode === "daily") {
        const e = d.daily[st.spec.date] || { picks: [] };
        const rows = st.prompts.map((pid, k) => {
          const pk = e.picks[k];
          const q = (promptById(pid) || { q: "" }).q;
          return `<li><span>${esc(q)}</span>${pk && pk.name ? `<strong class="t${pk.tier}">${esc(pk.name)}</strong>${tierTag(pk.tier)}<em>+${pk.pts}</em>` : `<strong class="none">no answer</strong><em>+0</em>`}</li>`;
        }).join("");
        const best = e.picks.filter((x) => x && x.name).sort((a, b) => b.tier - a.tier || b.pts - a.pts)[0];
        const run = streak(d);
        html = `
          <h2>DAILY DIG · ${esc(dayLabel(st.spec.date).toUpperCase())}</h2>
          <div class="fh-over-score">${fmtDepth(m)}</div>
          <div class="caps-label">${placeAt(pts)} · ${pts} POINTS</div>
          <ol class="wm-picks">${rows}</ol>
          <p>${best ? `Rarest: <strong>${esc(best.name)}</strong>. ` : ""}${run ? `Day streak: <strong>${run}</strong>. ` : ""}${s.answers ? `${Math.round(s.wpm)} wpm.` : ""}</p>
          <div class="hints">
            <button data-act="replay:${L.id}"><kbd>R</kbd>REPLAY</button>
            <button data-act="wm:select"><kbd>ESC</kbd>BACK</button>
          </div>`;
      } else {
        const b = bank(st.prompts[0]);
        const missed = deepCuts(b, L.crowds[0], [...st.given], 6);
        const best = L.newBest
          ? L.prevBest ? `<strong class="hl">New best for ${esc(packName(st.spec.pack))}!</strong> ${pts - L.prevBest.score} more than before.` : `<strong class="hl">First Blitz in ${esc(packName(st.spec.pack))}.</strong>`
          : `Your best in ${esc(packName(st.spec.pack))} is ${L.prevBest.score}.`;
        html = `
          <h2>${esc(promptById(st.prompts[0]).q.toUpperCase())}</h2>
          <div class="fh-over-score">${pts}</div>
          <div class="caps-label">POINTS · ${s.answers} ${s.answers === 1 ? "ANSWER" : "ANSWERS"} · ${fmtDepth(m)} DEEP${st.bestStreak >= 2 ? ` · RARE RUN OF ${st.bestStreak}` : ""}</div>
          <p>${best}${s.answers ? ` ${Math.round(s.wpm)} wpm.` : ""}</p>
          ${missed.length ? `<div class="side-label">Deep cuts still down there:</div><p class="wm-cuts">${missed.map(esc).join(" · ")}</p>` : ""}
          <div class="hints">
            <button data-act="wm:play"><kbd>TAB</kbd>NEW PROMPT</button>
            <button data-act="replay:${L.id}"><kbd>R</kbd>REPLAY</button>
            <button data-act="wm:select"><kbd>ESC</kbd>BACK</button>
          </div>`;
      }
      el.reveal.hidden = true;
      el.count.hidden = true;
      el.over.innerHTML = html;
      el.over.hidden = false;
      root.classList.add("wm-done"); // the results take the whole game: the window is back to its usual size
    }

    // Leaving mid-round. A Daily prompt that was showing counts as unanswered (it's been seen), and
    // the answers typed so far are kept like a finished round's (a Blitz cut short is dropped).
    function stop() {
      cancelAnimationFrame(raf);
      if (!live || live.state === "over" || live.state === "stopped") return;
      const T = gameT();
      if (st.mode === "daily" && st.phase === "ask") {
        emit([T, "timeout", { cuts: [], common: [] }]);
        keepDaily();
      }
      if (st.mode === "daily" && st.finds.some((f) => f.d > 0)) {
        emit([T, "end"]);
        save(T);
      }
      live.state = "stopped";
      snd.stop(0.3);
    }

    function pause() {
      if (!live || live.state !== "running") return;
      live.state = "paused";
      live.pausedAt = now();
      cancelAnimationFrame(raf);
      snd.stop(0.2);
      el.over.innerHTML = st.mode === "daily"
        ? `<h2>PAUSED</h2>
           <p>The clock is stopped, and the prompt is hidden until you carry on.</p>
           <div class="hints">
             <button data-act="pause"><kbd>ESC</kbd>RESUME</button>
             <button data-act="wm:select"><kbd>Q</kbd>STOP DIGGING</button>
           </div>
           <p class="note">Stopping keeps your dig so far, and you can pick it up later today. The prompt you're on counts as unanswered.</p>`
        : TT.pausedHtml("wm:play", "wm:select", "BACK");
      el.over.hidden = false;
      panelSig = "";
      renderPanel(live.pausedAt - live.startAt);
    }

    function resume() {
      if (!live || live.state !== "paused") return;
      live.startAt += now() - live.pausedAt;
      live.state = "running";
      el.over.hidden = true;
      if (st.phase !== "count" && st.phase !== "up") snd.music();
      panelSig = "";
      raf = requestAnimationFrame(frame);
    }

    // ---------- replays ----------

    function loadReplay(rec) {
      stop();
      live = null;
      replay = { rec, pos: 0, T: 0 };
      st = newState(rec.spec);
      panelSig = hudSig = revealSig = "";
      el.over.hidden = el.count.hidden = el.reveal.hidden = true;
      render(0);
    }

    // Shows the round as it was at time T (ms). Moving backwards replays it from the start.
    function replayTo(T) {
      if (!replay) return st;
      const { rec } = replay;
      if (T < replay.T) {
        st = newState(rec.spec);
        replay.pos = 0;
      }
      while (replay.pos < rec.ev.length && rec.ev[replay.pos][0] <= T) step(st, rec.ev[replay.pos++]);
      replay.T = T;
      const over = st.phase === "over";
      el.over.hidden = !over;
      if (over) el.over.innerHTML = `<h2>${st.mode === "daily" ? "DIG DONE" : "TIME'S UP"}</h2><div class="fh-over-score">${fmtDepth(metres(st.score))}</div><div class="caps-label">${st.score} POINTS · ${placeAt(st.score)}</div>`;
      render(T);
      return st;
    }

    return {
      newRound, stop, handleKey, pause, resume, next, loadReplay, replayTo,
      relayout: () => st && render(gameT()),
      mode: () => st && st.mode,
      isRunning: () => !!live && live.state === "running",
      isPaused: () => !!live && live.state === "paused",
      isOver: () => !!live && live.state === "over",
    };
  };
})();
