(() => {
  const $ = (id) => document.getElementById(id);
  const S = () => TT.store.settings;
  const A = TT.analysis;

  // ---------- options ----------

  const MODES = { time: [15, 30, 60], words: [10, 25, 50] };
  const PRACTICE_AMOUNTS = [15, 30, 60];
  const MIXES = [40, 60, 80];
  const THEMES = { sand: "Sand", ash: "Ash", night: "Night" };
  // name, light-theme color, dark-theme color
  const ACCENTS = {
    rust: ["Rust", "#B4472B", "#E07A5C"],
    teal: ["Teal", "#2F5F6B", "#6FA7B4"],
    ochre: ["Ochre", "#8A6A1F", "#D4A848"],
    plum: ["Plum", "#5B4A6B", "#A68FBA"],
    olive: ["Olive", "#5E6B2F", "#A3B566"],
  };
  const UI_FONTS = {
    archivo: ["Archivo", "'Archivo', 'Segoe UI', sans-serif"],
    plex: ["Plex Sans", "'IBM Plex Sans', 'Segoe UI', sans-serif"],
    grotesk: ["Space Grotesk", "'Space Grotesk', 'Segoe UI', sans-serif"],
  };
  const TYPE_FONTS = {
    jetbrains: ["JetBrains Mono", "'JetBrains Mono', Consolas, monospace"],
    plexmono: ["Plex Mono", "'IBM Plex Mono', Consolas, monospace"],
    spacemono: ["Space Mono", "'Space Mono', Consolas, monospace"],
    archivo: ["Archivo", "'Archivo', 'Segoe UI', sans-serif"],
  };
  const SIZES = { s: ["S", "22px"], m: ["M", "28px"], l: ["L", "34px"], xl: ["XL", "40px"] };
  const CARETS = { line: "Line", block: "Block", underline: "Underline" };

  const GAMES = [
    { id: "path", name: "Path Runner", cat: "arcade", kind: "ARCADE GAME", playable: true,
      desc: "Type a path's word to step onto it. The words come from your weak keys. The clock keeps draining, so keep moving." },
    { id: "falling", name: "Falling Words", cat: "arcade", kind: "ARCADE GAME",
      desc: "Clear each word before it reaches the ground." },
    { id: "ghost", name: "Ghost Race", cat: "arcade", kind: "ARCADE GAME",
      desc: "Race a replay of your own best run." },
    { id: "drills", name: "Key Drills", cat: "drills", kind: "DRILL",
      desc: "Short, fast rounds on your weakest keys and letter pairs." },
  ];

  const GAME_ART = {
    path: `<path d="M150 228 V150 L66 66 M150 150 V48 M150 150 L234 66 M44 104 V44 H104 M112 74 L150 36 L188 74 M196 44 H256 V104" fill="none" stroke="currentColor" stroke-width="22"/>
           <rect x="124" y="236" width="52" height="52" fill="var(--accent)"/>`,
    falling: `<path d="M30 270 H270" stroke="currentColor" stroke-width="22"/>
              <rect x="40" y="40" width="80" height="24" fill="currentColor"/>
              <rect x="150" y="100" width="100" height="24" fill="currentColor"/>
              <rect x="70" y="170" width="70" height="24" fill="var(--accent)"/>`,
    ghost: `<path d="M30 110 H230 M186 66 L230 110 L186 154" fill="none" stroke="currentColor" stroke-width="22"/>
            <path d="M30 200 H190 M146 156 L190 200 L146 244" fill="none" stroke="var(--accent)" stroke-width="22" stroke-dasharray="26 14"/>`,
    drills: `<rect x="50" y="50" width="200" height="200" fill="none" stroke="currentColor" stroke-width="22"/>
             <rect x="115" y="115" width="70" height="70" fill="var(--accent)"/>`,
  };

  const MENU_VIEWS = ["games", "stats", "settings"];

  const ui = {
    view: "test",
    lastTyping: "test",
    menuView: "games",
    statsTab: "overview",
    settingsTab: "appearance",
    gamesTab: "all",
    game: "path",
    targets: [],
  };

  const els = {
    bar: $("bar"),
    config: $("test-config"),
    badge: $("practice-badge"),
    menuNav: $("menu-nav"),
    typing: $("view-typing"),
    results: $("view-results"),
    liveNum: $("live-num"),
    liveLabel: $("live-label"),
    targets: $("targets"),
    note: $("typing-note"),
    capslock: $("capslock"),
    hints: $("hints"),
    statusLine: $("status-line"),
  };

  const esc = (str) => String(str).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ---------- settings ----------

  function sanitizeSettings() {
    const s = S();
    if (!MODES[s.mode]) s.mode = "time";
    if (!MODES[s.mode].includes(s.amount)) s.amount = s.mode === "time" ? 30 : 25;
    if (!PRACTICE_AMOUNTS.includes(s.practiceAmount)) s.practiceAmount = 30;
    if (!MIXES.includes(s.mix)) s.mix = 60;
    if (!THEMES[s.theme]) s.theme = "sand";
    if (!ACCENTS[s.accent]) s.accent = "rust";
    if (!UI_FONTS[s.uiFont]) s.uiFont = "archivo";
    if (!TYPE_FONTS[s.typingFont]) s.typingFont = "jetbrains";
    if (!SIZES[s.size]) s.size = "m";
    if (!CARETS[s.caret]) s.caret = "line";
    s.second = !!s.second;
  }

  const isDark = () => S().theme === "night";
  const accentColor = (key) => ACCENTS[key][isDark() ? 2 : 1];
  const secondAccentKey = () => (S().accent === "teal" ? "ochre" : "teal");

  function applySettings() {
    const s = S();
    const root = document.documentElement;
    root.dataset.theme = s.theme;
    const accent2 = accentColor(secondAccentKey());
    root.style.setProperty("--accent", accentColor(s.accent));
    root.style.setProperty("--accent-2", accent2);
    root.style.setProperty("--hl", s.second ? accent2 : "var(--ink)");
    root.style.setProperty("--ui-font", UI_FONTS[s.uiFont][1]);
    root.style.setProperty("--type-font", TYPE_FONTS[s.typingFont][1]);
    root.style.setProperty("--type-size", SIZES[s.size][1]);
  }

  // ---------- typing ----------

  const engine = TT.createTyping({
    box: $("words-box"),
    wordsEl: $("words"),
    onStart() {
      document.body.classList.add("typing");
      els.statusLine.textContent = ui.view === "practice" ? "Practice in progress." : "Test in progress.";
    },
    onTick: renderLive,
    onFinish(result) {
      document.body.classList.remove("typing");
      const pb = record(result);
      renderResults(result, pb);
      show("results");
    },
  });

  function renderLive({ mode, amount, index, started, elapsedMs }) {
    if (mode === "time") {
      els.liveNum.textContent = started ? Math.max(0, Math.ceil(amount - elapsedMs / 1000)) : amount;
      els.liveLabel.textContent = started ? "SECONDS LEFT" : "SECONDS";
    } else {
      els.liveNum.textContent = `${index}/${amount}`;
      els.liveLabel.textContent = "WORDS";
    }
  }

  function startTyping(kind) {
    const s = S();
    ui.lastTyping = kind;
    document.body.classList.remove("typing");
    show(kind);
    renderBar();

    if (kind === "practice") {
      ui.targets = A.weakKeys();
      const missed = A.weakWords(20);
      els.targets.hidden = !ui.targets.length;
      els.targets.innerHTML = `<span class="caps-label">TARGET KEYS</span>` +
        ui.targets.map((t) => `<span class="chip">${t.key}</span>`).join("");
      els.note.textContent = ui.targets.length || missed.length
        ? `Start typing to begin. About ${s.mix}% of words use your target keys or words you've missed; the rest are ordinary words.`
        : "Not enough data yet. Finish a few speed tests and your weak keys will show up here. For now this is a normal test.";
      engine.begin({ mode: "time", amount: s.practiceAmount, gen: (n) => A.practiceWords(n, ui.targets, missed, s.mix) });
    } else {
      els.targets.hidden = true;
      els.note.textContent = "";
      engine.begin({ mode: s.mode, amount: s.amount, gen: TT.randomWords });
    }
  }

  function renderBar() {
    const s = S();
    const btn = (label, on, act) => `<button class="${on ? "on" : ""}" aria-pressed="${on}" data-act="${act}">${label}</button>`;
    const divider = `<span class="divider" aria-hidden="true"></span>`;
    const game = ui.view === "game";
    els.config.hidden = game;
    els.badge.hidden = !game && ui.lastTyping !== "practice";
    els.badge.textContent = game ? "PATH RUNNER" : "PRACTICE";
    if (game) return;

    if (ui.lastTyping === "practice") {
      els.config.innerHTML =
        PRACTICE_AMOUNTS.map((n) => btn(n, n === s.practiceAmount, `pamount:${n}`)).join("") +
        divider + `<span class="seg-label">MIX ${s.mix} / ${100 - s.mix}</span>`;
    } else {
      els.config.innerHTML =
        btn("TIME", s.mode === "time", "mode:time") + btn("WORDS", s.mode === "words", "mode:words") +
        divider + MODES[s.mode].map((n) => btn(n, n === s.amount, `amount:${n}`)).join("");
    }
  }

  // ---------- results ----------

  function record(r) {
    const kind = ui.lastTyping;
    const store = TT.store;
    const prior = store.history.filter((h) => (h.kind || "test") === kind && h.mode === r.mode && h.amount === r.amount);
    const best = prior.reduce((m, h) => Math.max(m, h.wpm), 0);
    const round = (x) => Math.round(x * 100) / 100;

    store.history.push({
      date: new Date().toISOString(),
      kind,
      mode: r.mode,
      amount: r.amount,
      wpm: round(r.wpm),
      raw: round(r.raw),
      acc: round(r.acc),
      seconds: round(r.seconds),
      keys: r.keys,
      missedWords: r.missedWords,
    });

    for (const [letter, [expected, missed]] of Object.entries(r.keys)) {
      const total = (store.keyStats[letter] ||= { expected: 0, missed: 0 });
      total.expected += expected;
      total.missed += missed;
    }
    for (const w of r.missedWords) store.weakWords[w] = (store.weakWords[w] || 0) + 1;

    TT.save();
    return { best, isFirst: prior.length === 0 };
  }

  const testName = (kind, mode, amount) =>
    kind === "game" ? `path runner, ${amount} steps` : `${kind === "practice" ? "practice" : mode} ${amount}`;

  function statusRows(rows) {
    return rows.map(([label, value, ruled, cls]) =>
      `<div class="${ruled ? "ruled" : ""}"><dt>${label}</dt><dd class="${cls || ""}">${value}</dd></div>`).join("");
  }

  function keyTiles(letters, total = 8) {
    let html = letters.slice(0, total).map((k) => `<div class="filled">${esc(k)}</div>`).join("");
    for (let i = letters.length; i < total; i++) html += "<div></div>";
    return html;
  }

  function renderResults(r, { best, isFirst }) {
    const kind = ui.lastTyping;
    const name = testName(kind, r.mode, r.amount);
    const wpm = Math.round(r.wpm);

    $("r-title").textContent = kind === "practice" ? "PRACTICE COMPLETE" : "TEST COMPLETE";
    $("r-test").textContent = name.toUpperCase();
    $("r-kind").textContent = kind === "practice" ? "WEAK-KEY PRACTICE" : "SPEED TEST";
    $("r-wpm").textContent = wpm;
    $("r-acc").textContent = `${Math.round(r.acc)}%`;
    $("r-raw").textContent = Math.round(r.raw);

    const pb = $("r-pb");
    if (isFirst) pb.innerHTML = `First result for <strong>${name}</strong>.`;
    else if (r.wpm > best) pb.innerHTML = `<strong class="hl">New personal best for ${name}!</strong> Previous best was ${Math.round(best)} wpm.`;
    else pb.innerHTML = `Personal best for <strong>${name}</strong> is <strong>${Math.round(best)} wpm</strong>. You were ${Math.round(best) - wpm} short.`;

    $("r-status").innerHTML = statusRows([
      ["Test", name[0].toUpperCase() + name.slice(1)],
      ["WPM:", wpm],
      ["Raw WPM:", Math.round(r.raw)],
      ["Accuracy:", `${Math.round(r.acc)}%`, true],
      ["Correct:", r.correct],
      ["Incorrect:", `<span style="color: var(--accent)">${r.incorrect}</span>`],
      ["Extra / Missed:", `${r.extra} / ${r.missed}`],
      ["Time:", `${Math.round(r.seconds)}s`, true],
    ]);

    const missedKeys = Object.entries(r.keys).filter(([, [, m]]) => m > 0).sort((a, b) => b[1][1] - a[1][1]).map(([k]) => k);
    $("r-keys").innerHTML = keyTiles(missedKeys);
  }

  // ---------- views ----------

  const HINTS = {
    test: [["TAB", "RESTART", "restart"], ["ESC", "MENU", "menu"]],
    practice: [["TAB", "NEW WORDS", "restart"], ["ESC", "MENU", "menu"]],
    results: [["TAB", "NEXT TEST", "restart"], ["P", "PRACTICE WEAK KEYS", "practice"], ["ESC", "MENU", "menu"]],
    games: [["ESC", "CLOSE MENU", "close"]],
    game: [["TAB", "RESTART", "play"], ["ESC", "MENU", "menu"]],
    stats: [["P", "PRACTICE WEAK KEYS", "practice"], ["ESC", "CLOSE MENU", "close"]],
    settings: [["ESC", "CLOSE MENU", "close"]],
  };
  const STATUS = {
    test: "Type to begin.",
    practice: "Practice ready.",
    results: "Result saved.",
    games: "Select a game.",
    game: "Type a word to move.",
    stats: "Select a view.",
    settings: "Changes save automatically.",
  };

  function renderHints() {
    let hints = HINTS[ui.view].map(([key, label, act]) =>
      [key, ui.view === "results" && act === "restart" && ui.lastTyping === "practice" ? "PRACTICE AGAIN" : label, act]);
    if (ui.view === "games" && selectedGame().playable) hints = [["ENTER", "PLAY", "play"], ...hints];
    els.hints.innerHTML = hints.map(([key, label, act]) => `<button data-act="${act}"><kbd>${key}</kbd>${label}</button>`).join("");
    els.statusLine.textContent = STATUS[ui.view];
  }

  function show(view) {
    ui.view = view;
    const inMenu = MENU_VIEWS.includes(view);
    els.bar.hidden = inMenu;
    els.menuNav.hidden = !inMenu;
    els.typing.hidden = view !== "test" && view !== "practice";
    els.results.hidden = view !== "results";
    $("view-game").hidden = view !== "game";
    for (const v of MENU_VIEWS) $(`view-${v}`).hidden = v !== view;
    for (const b of els.menuNav.querySelectorAll("button")) {
      const on = b.dataset.view === view;
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
    renderHints();
  }

  function openMenu(view) {
    engine.stop();
    runner.stop();
    document.body.classList.remove("typing");
    ui.menuView = view;
    show(view);
    ({ games: renderGames, stats: renderStats, settings: renderSettings })[view]();
  }

  const subtabs = (tabs, current, act) =>
    `<div class="subtabs">${tabs.map(([id, label]) =>
      `<button class="${id === current ? "on" : ""}" aria-pressed="${id === current}" data-act="${act}:${id}">${label}</button>`).join("")}</div>`;

  function statusPanel(title = "STATUS") {
    const sum = A.summary();
    return `<div class="rule-head">${title}</div>
      <dl class="status">${statusRows([
        ["WPM (last 10):", Math.round(sum.wpm10)],
        ["Best WPM:", Math.round(sum.best)],
        ["Accuracy (last 10):", `${Math.round(sum.acc10)}%`],
        ["Tests taken:", sum.tests, true],
      ])}</dl>`;
  }

  function targetPanel() {
    const targets = A.weakKeys();
    return `<div class="side-label">Target keys:</div>
      <div class="keygrid">${keyTiles(targets.map((t) => t.key))}</div>
      <div class="caps-label foot-caption">${targets.length ? "WEIGHTED TO RECENT TESTS" : "TAKE A FEW TESTS TO FIND THEM"}</div>`;
  }

  // ---------- games ----------

  const selectedGame = () => GAMES.find((x) => x.id === ui.game);
  const gameBest = (id) => (TT.store.games[id] ? TT.store.games[id].best : 0);
  const gameTag = (x) => (!x.playable ? "SOON" : gameBest(x.id) ? gameBest(x.id) : "NEW");

  function renderGames() {
    const list = GAMES.filter((g) => ui.gamesTab === "all" || g.cat === ui.gamesTab);
    if (!list.some((g) => g.id === ui.game)) ui.game = list[0].id;
    const g = selectedGame();

    $("view-games").innerHTML = subtabs([["all", "All"], ["arcade", "Arcade"], ["drills", "Drills"]], ui.gamesTab, "gtab") + `
      <div class="cols">
        <ul class="list col-list">
          ${list.map((x) => `<li><button class="${x.id === g.id ? "on" : ""}" aria-pressed="${x.id === g.id}" data-act="game:${x.id}">${x.name}<span class="tag">${gameTag(x)}</span></button></li>`).join("")}
        </ul>
        <section class="col-main">
          <div class="title-row"><h1>${g.name.toUpperCase()}</h1><span class="title-meta">${g.playable ? `BEST ${gameBest(g.id)}` : "SOON"}</span></div>
          <div class="kind-line">${g.kind}</div>
          <div class="game-art"><svg viewBox="0 0 300 300" role="img" aria-label="${g.name} icon">${GAME_ART[g.id]}</svg></div>
          <div class="detail-line">DIFFICULTY: <strong>ADAPTIVE</strong></div>
          <div class="rule-box">${g.desc}${g.playable ? "" : " <strong>Coming in a later update.</strong>"}</div>
          ${g.playable ? `<button class="outline-btn play-btn" data-act="play">PLAY <kbd>ENTER</kbd></button>` : ""}
        </section>
        <aside class="col-side">${statusPanel()}${targetPanel()}</aside>
      </div>`;
    renderHints();
  }

  // ---------- game ----------

  const runner = TT.createPathRunner({
    root: $("view-game"),
    onStart() {
      els.statusLine.textContent = "Keep moving.";
    },
    onEnd() {
      els.statusLine.textContent = "Run saved.";
    },
  });

  function startGame() {
    engine.stop();
    document.body.classList.remove("typing");
    show("game");
    renderBar();
    runner.newGame();
  }

  // ---------- stats ----------

  function formatDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m`;
    return `${Math.round(sec)}s`;
  }

  function wpmChart(history) {
    const pts = history.slice(-30).map((h) => h.wpm);
    let lo = Math.floor(Math.min(...pts) / 10) * 10;
    let hi = Math.ceil(Math.max(...pts) / 10) * 10;
    if (hi - lo < 20) hi = lo + 20;
    const X0 = 44, W = 716, Y0 = 20, H = 160;
    const x = (i) => X0 + (pts.length === 1 ? W : (i * W) / (pts.length - 1));
    const y = (v) => Y0 + H - ((v - lo) / (hi - lo)) * H;
    const mid = (lo + hi) / 2;
    const coords = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const last = pts.length - 1;
    const grid = [hi, mid, lo].map((v) =>
      `<line x1="${X0}" x2="760" y1="${y(v)}" y2="${y(v)}" stroke="var(--ink)" stroke-opacity="0.25"/><text x="0" y="${y(v) + 4}">${Math.round(v)}</text>`).join("");
    return `<svg class="chart" viewBox="0 0 760 200" role="img" aria-label="Words per minute over your last ${pts.length} tests">
      ${grid}
      <polyline points="${coords}" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="${x(last)}" cy="${y(pts[last])}" r="6" fill="var(--accent)"/>
    </svg>`;
  }

  function heatmap(rates) {
    const max = Math.max(0, ...Object.values(rates).map((o) => o.rate));
    const row = (letters) => `<div class="krow">${letters.split("").map((k) => {
      const o = rates[k];
      const p = o && max ? Math.round((o.rate / max) * 85) : 0;
      const style = p ? `background: color-mix(in srgb, var(--accent) ${p + 15}%, transparent);${p > 45 ? " color: var(--on-accent);" : ""}` : "";
      const label = o ? `${k}: ${(o.rate * 100).toFixed(1)}% missed recently` : `${k}: no data`;
      return `<div class="k" style="${style}" title="${label}">${k}</div>`;
    }).join("")}</div>`;
    return `<div class="keyboard" role="img" aria-label="Keyboard heatmap of missed keys">
      ${row("qwertyuiop")}<div style="padding-left: 28px">${row("asdfghjkl")}</div><div style="padding-left: 56px">${row("zxcvbnm")}</div>
    </div>`;
  }

  const legend = `<span class="legend">LESS<span></span>
    <span style="background: color-mix(in srgb, var(--accent) 35%, transparent)"></span>
    <span style="background: color-mix(in srgb, var(--accent) 65%, transparent)"></span>
    <span style="background: var(--accent)"></span>MORE</span>`;

  const STATS_VIEWS = {
    overview() {
      const tests = A.typingTests();
      const recent = tests.slice(-30);
      const delta = recent.length ? Math.round(recent[recent.length - 1].wpm - recent[0].wpm) : 0;
      const sum = A.summary();
      const words = A.weakWords(5);
      return `<div class="cols">
        <section class="col-main stack">
          <div>
            <div class="rule-head"><span>WPM, LAST ${recent.length} TESTS</span><span>${delta > 0 ? "+" : ""}${delta}</span></div>
            ${recent.length ? wpmChart(tests) : `<p class="note">Finish a speed test to see your WPM over time.</p>`}
          </div>
          <div>
            <div class="rule-head"><span>MISSED KEYS</span>${legend}</div>
            ${heatmap(A.keyRates())}
          </div>
        </section>
        <aside class="col-side">
          <div class="rule-head">STATUS</div>
          <dl class="status">${statusRows([
            ["Tests taken:", sum.tests],
            ["WPM (last 10):", Math.round(sum.wpm10)],
            ["Best WPM:", Math.round(sum.best)],
            ["Accuracy (last 10):", `${Math.round(sum.acc10)}%`],
            ["Time typing:", formatDuration(sum.seconds), true],
          ])}</dl>
          <div class="side-label">Weakest words:</div>
          ${words.length
            ? `<dl class="status mono">${statusRows(words.map((w, i) => [esc(w.word), `×${w.count}`, i === words.length - 1]))}</dl>`
            : `<p class="muted">No missed words yet.</p>`}
          <div class="caps-label foot-caption">RECENT MISTAKES COUNT MORE</div>
        </aside>
      </div>`;
    },

    keys() {
      const rates = A.keyRates();
      const life = TT.store.keyStats;
      const targets = new Set(A.weakKeys(rates).map((t) => t.key));
      const rows = Object.entries(rates).sort((a, b) => b[1].rate - a[1].rate);
      if (!rows.length) return empty("No key data yet", "Key stats are collected from tests, practice and games.");
      const max = Math.max(...rows.map(([, o]) => o.rate)) || 1;
      return `<table class="table">
        <thead><tr><th>KEY</th><th>RECENT MISS RATE</th><th class="num">ATTEMPTS</th><th class="num">ALL-TIME MISSES</th></tr></thead>
        <tbody>${rows.map(([k, o]) => `<tr>
          <td class="mono">${k}${targets.has(k) ? `<span class="tag">TARGET</span>` : ""}</td>
          <td><span class="bar-cell"><i style="width: ${Math.round((o.rate / max) * 160)}px"></i>${(o.rate * 100).toFixed(1)}%</span></td>
          <td class="num">${o.attempts}</td>
          <td class="num">${life[k] ? life[k].missed : 0}</td>
        </tr>`).join("")}</tbody>
      </table>
      <p class="caps-label foot-caption">A KEY NEEDS ${A.MIN_ATTEMPTS} ATTEMPTS BEFORE IT CAN BE A TARGET. A TEST'S WEIGHT HALVES EVERY ${A.HALF_LIFE} TESTS.</p>`;
    },

    words() {
      const words = A.weakWords(50);
      if (!words.length) return empty("No missed words yet", "Words you make mistakes in will be listed here.");
      const max = words[0].score;
      return `<table class="table">
        <thead><tr><th>WORD</th><th>RECENT WEIGHT</th><th class="num">TIMES MISSED</th><th class="num">ALL TIME</th></tr></thead>
        <tbody>${words.map((w) => `<tr>
          <td class="mono">${esc(w.word)}</td>
          <td><span class="bar-cell"><i style="width: ${Math.round((w.score / max) * 160)}px"></i></span></td>
          <td class="num">${w.count}</td>
          <td class="num">${TT.store.weakWords[w.word] || w.count}</td>
        </tr>`).join("")}</tbody>
      </table>`;
    },

    history() {
      const rows = TT.store.history.slice(-50).reverse();
      const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      return `<table class="table">
        <thead><tr><th>DATE</th><th>TEST</th><th class="num">WPM</th><th class="num">ACCURACY</th><th class="num">RAW</th></tr></thead>
        <tbody>${rows.map((h) => `<tr>
          <td>${fmt.format(new Date(h.date))}</td>
          <td>${testName(h.kind || "test", h.mode, h.amount)}</td>
          <td class="num"><strong>${Math.round(h.wpm)}</strong></td>
          <td class="num">${Math.round(h.acc)}%</td>
          <td class="num">${Math.round(h.raw)}</td>
        </tr>`).join("")}</tbody>
      </table>`;
    },
  };

  const empty = (title, text) => `<div class="empty"><h2>${title}</h2><p>${text}</p></div>`;

  function renderStats() {
    const tabs = [["overview", "Overview"], ["keys", "Keys"], ["words", "Words"], ["history", "History"]];
    const body = TT.store.history.length
      ? STATS_VIEWS[ui.statsTab]()
      : empty("No results yet", "Finish a speed test and your stats will show up here.");
    $("view-stats").innerHTML = subtabs(tabs, ui.statsTab, "stab") + body;
  }

  // ---------- settings ----------

  function optButtons(key, options, fontOf) {
    const s = S();
    return Object.entries(options).map(([value, label]) => {
      const on = String(s[key]) === String(value);
      const name = Array.isArray(label) ? label[0] : label;
      const font = fontOf ? ` style="font-family: ${fontOf(value)}"` : "";
      return `<button class="opt ${on ? "on" : ""}" aria-pressed="${on}" data-act="set:${key}:${value}"${font}>${name}</button>`;
    }).join("");
  }

  const srow = (label, controls) => `<div class="srow"><div class="slabel">${label}</div><div class="controls">${controls}</div></div>`;

  function previewPanel() {
    const caret = S().caret;
    const g = caret === "line" ? `<span class="pc-line"></span>g` : `<span class="pc-${caret}">g</span>`;
    return `<div class="rule-head">PREVIEW</div>
      <div class="preview-live"><span class="live-num">24</span><span class="caps-label">SECONDS LEFT</span></div>
      <p class="preview-text"><span class="c">world place </span><span class="err"><span class="c">th</span><span class="x">or</span><span class="c">ugh</span></span><span class="c"> group mi</span>${g}ht hand large order system follow</p>
      <div class="rule-box push-down">Personal best: <strong class="hl">91 wpm</strong></div>`;
  }

  const SETTINGS_VIEWS = {
    appearance() {
      const s = S();
      const swatches = Object.entries(ACCENTS).map(([key, [name]]) => {
        const on = s.accent === key;
        return `<button class="swatch ${on ? "on" : ""}" style="background: ${accentColor(key)}" aria-label="${name} accent" aria-pressed="${on}" data-act="set:accent:${key}"></button>`;
      }).join("");
      return `<div class="cols">
        <section class="col-main"><div class="settings-rows">
          ${srow("Theme", optButtons("theme", THEMES))}
          ${srow("Accent", `<div class="swatches">${swatches}</div>`)}
          ${srow("Second accent", optButtons("second", { false: "Off", true: "On" }) +
            (s.second ? `<span class="swatch-mini" aria-hidden="true"></span>` : "") +
            `<span class="hint-text">For personal bests.</span>`)}
          ${srow("Interface font", optButtons("uiFont", UI_FONTS, (v) => UI_FONTS[v][1]))}
          ${srow("Typing font", optButtons("typingFont", TYPE_FONTS, (v) => TYPE_FONTS[v][1]))}
          ${srow("Text size", optButtons("size", SIZES))}
          ${srow("Caret", optButtons("caret", CARETS))}
        </div></section>
        <aside class="col-side">${previewPanel()}</aside>
      </div>`;
    },

    practice() {
      const mixes = Object.fromEntries(MIXES.map((m) => [m, `${m}%`]));
      return `<div class="cols">
        <section class="col-main"><div class="settings-rows">
          ${srow("Targeted words", optButtons("mix", mixes) + `<span class="hint-text">The rest are ordinary words.</span>`)}
          ${srow("Practice length", optButtons("practiceAmount", Object.fromEntries(PRACTICE_AMOUNTS.map((n) => [n, `${n}s`]))))}
        </div>
        <p class="note">Weak keys are worked out from your recent tests. A test's weight halves every ${A.HALF_LIFE} tests, so keys you've stopped missing drop off the list.</p>
        </section>
        <aside class="col-side">${targetPanel()}</aside>
      </div>`;
    },

    data() {
      const n = TT.store.history.length;
      return `<div class="cols">
        <section class="col-main"><div class="settings-rows">
          ${srow("Saved results", `<strong style="padding: 0 4px; font-size: 18px">${n} ${n === 1 ? "test" : "tests"}</strong>`)}
          ${srow("Reset", `<button class="opt danger" data-act="reset-data">DELETE ALL DATA</button><span class="hint-text">Settings are kept.</span>`)}
        </div>
        <p class="note">Everything is stored on this computer, in this browser. Nothing is uploaded.</p>
        </section>
      </div>`;
    },
  };

  function renderSettings() {
    const tabs = [["appearance", "Appearance"], ["practice", "Practice"], ["data", "Data"]];
    $("view-settings").innerHTML = subtabs(tabs, ui.settingsTab, "settab") + SETTINGS_VIEWS[ui.settingsTab]();
  }

  function setSetting(key, raw) {
    const s = S();
    if (key === "second") s.second = raw === "true";
    else if (key === "mix" || key === "practiceAmount") s[key] = Number(raw);
    else s[key] = raw;
    TT.save();
    applySettings();
    renderSettings();
  }

  // ---------- actions ----------

  function act(action) {
    const [type, x, y] = action.split(":");
    const s = S();
    switch (type) {
      case "mode":
        if (s.mode !== x) { s.mode = x; s.amount = x === "time" ? 30 : 25; TT.save(); }
        startTyping("test");
        break;
      case "amount":
        s.amount = Number(x); TT.save(); startTyping("test");
        break;
      case "pamount":
        s.practiceAmount = Number(x); TT.save(); startTyping("practice");
        break;
      case "nav":
        if (x === "test" || x === "practice") startTyping(x);
        else openMenu(x);
        break;
      case "menu": openMenu(ui.menuView); break;
      case "close":
      case "restart": startTyping(ui.lastTyping); break;
      case "practice": startTyping("practice"); break;
      case "play": startGame(); break;
      case "stab": ui.statsTab = x; renderStats(); break;
      case "settab": ui.settingsTab = x; renderSettings(); break;
      case "gtab": ui.gamesTab = x; renderGames(); break;
      case "game": ui.game = x; renderGames(); break;
      case "set": setSetting(x, y); break;
      case "reset-data":
        if (confirm("Delete all saved results and stats? This can't be undone.")) {
          TT.resetData();
          renderSettings();
        }
        break;
    }
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (el) act(el.dataset.act);
  });

  // Clicking a button shouldn't move keyboard focus, so space/tab keep going to the test.
  document.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) e.preventDefault();
  });

  const plainKey = (e, key) => e.key === key && !e.ctrlKey && !e.altKey && !e.metaKey;

  document.addEventListener("keydown", (e) => {
    if (e.getModifierState) els.capslock.hidden = !e.getModifierState("CapsLock");
    const v = ui.view;

    if (e.key === "Escape") {
      e.preventDefault();
      act(MENU_VIEWS.includes(v) ? "close" : "menu");
      return;
    }
    if (v === "test" || v === "practice") {
      if (e.key === "Tab") {
        e.preventDefault();
        act("restart");
        return;
      }
      engine.handleKey(e);
    } else if (v === "results") {
      if (e.key === "Tab") {
        e.preventDefault();
        act("restart");
      } else if (plainKey(e, "p")) {
        act("practice");
      }
    } else if (v === "game") {
      if (e.key === "Tab") {
        e.preventDefault();
        act("play");
        return;
      }
      runner.handleKey(e);
    } else if (v === "games" && e.key === "Enter" && selectedGame().playable) {
      e.preventDefault();
      act("play");
    } else if (v === "stats" && plainKey(e, "p")) {
      act("practice");
    }
  });

  window.addEventListener("resize", () => {
    if (ui.view === "test" || ui.view === "practice") engine.relayout();
  });

  // ---------- start ----------

  TT.ui = { statusRows, keyTiles };
  sanitizeSettings();
  applySettings();
  startTyping("test");
  document.fonts.ready.then(() => {
    if (ui.view === "test" || ui.view === "practice") engine.relayout();
  });
})();
