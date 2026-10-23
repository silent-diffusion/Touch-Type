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
    { id: "forest", name: "Forest Hop", cat: "arcade", kind: "ARCADE GAME", playable: true,
      desc: "Pick an animal and get as far through the forest as you can. Type a direction's word, then press Space or Enter to hop. Dodge deer, ride logs, collect treats, and keep moving before your predator catches up." },
    { id: "tiles", name: "Tiles", cat: "rhythm", kind: "RHYTHM GAME", playable: true,
      desc: "Tiles fall down the columns in time with the music, and each column has a word at the bottom. Type a column's word, then press Enter or Space as its tile crosses the line. Pick a song, or add your own music, and a difficulty from easy to expert." },
    { id: "path", name: "Path Runner", cat: "arcade", kind: "ARCADE GAME", playable: true,
      desc: "Type a path's word to step onto it. The words come from your weak keys. The clock keeps draining, so keep moving." },
    { id: "ghost", name: "Ghost Race", cat: "arcade", kind: "RACING GAME", playable: true,
      desc: "Type a track to run it, against a ghost: your own best run played back key for key, your last run, anyone else's best on this computer, or a steady pace. Words only move you on once they're right. Beat the ghost and your new best becomes the one to chase." },
    { id: "worm", name: "Wormhole", cat: "trivia", kind: "TRIVIA GAME", playable: true,
      desc: "You're an earthworm. Name things in a category, like a fruit or a country, by typing them: any right answer counts, and the rarer it is, the deeper you dig. Play the Daily Dig, seven prompts a day with one answer each, or Blitz: as many answers as you can in 30 seconds." },
    { id: "drills", name: "Key Drills", cat: "drills", kind: "DRILL",
      desc: "Short, fast rounds on your weakest keys and letter pairs." },
  ];

  const GAME_ART = {
    tiles: `<path d="M36 40 V260 M264 40 V260" stroke="currentColor" stroke-width="12"/>
            <path d="M93 40 V260 M150 40 V260 M207 40 V260" stroke="currentColor" stroke-width="4" stroke-dasharray="10 10"/>
            <rect x="44" y="196" width="212" height="40" fill="none" stroke="currentColor" stroke-width="10"/>
            <rect x="100" y="56" width="44" height="34" fill="currentColor"/>
            <rect x="214" y="120" width="44" height="34" fill="currentColor"/>
            <rect x="44" y="198" width="44" height="36" fill="var(--accent)"/>`,
    path: `<path d="M150 228 V150 L66 66 M150 150 V48 M150 150 L234 66 M44 104 V44 H104 M112 74 L150 36 L188 74 M196 44 H256 V104" fill="none" stroke="currentColor" stroke-width="22"/>
           <rect x="124" y="236" width="52" height="52" fill="var(--accent)"/>`,
    ghost: `<path d="M30 110 H230 M186 66 L230 110 L186 154" fill="none" stroke="currentColor" stroke-width="22"/>
            <path d="M30 200 H190 M146 156 L190 200 L146 244" fill="none" stroke="var(--accent)" stroke-width="22" stroke-dasharray="26 14"/>`,
    drills: `<rect x="50" y="50" width="200" height="200" fill="none" stroke="currentColor" stroke-width="22"/>
             <rect x="115" y="115" width="70" height="70" fill="var(--accent)"/>`,
  };

  const MENU_VIEWS = ["games", "leaderboard", "stats", "settings"];
  const FOREST_VIEWS = ["forest", "forest-select", "forest-guide"];
  const TILES_VIEWS = ["tiles", "tiles-select"];
  const GHOST_VIEWS = ["ghost", "ghost-select"];
  const WORM_VIEWS = ["worm", "worm-select"];
  // What Enter (or the play button) does for each game in the library.
  const playAct = (id) => ({ forest: "fh:select", tiles: "tl:select", ghost: "gr:select", worm: "wm:select" })[id] || "play";

  const ui = {
    view: "test",
    lastTyping: "test",
    menuView: "games",
    statsTab: "overview",
    lbTab: "forest",
    lbSong: null,
    lbDiff: null,
    lbQueue: null,
    settingsTab: "appearance",
    gamesTab: "all",
    game: "forest",
    targets: [],
  };

  const els = {
    app: $("app"),
    tabs: $("tabs"),
    subtabs: $("subtabs"),
    config: $("test-config"),
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
    s.autoUpdate = !!s.autoUpdate;
    // Added songs load a moment after start-up, so their ids are kept here.
    if (!TT.songs.get(s.tilesSong) && !TT.music.isUser(s.tilesSong)) s.tilesSong = TT.songs.list[0].id;
    if (!TT.tilesCore.DIFFS[s.tilesDiff]) s.tilesDiff = "medium";
    s.tilesMusic = s.tilesMusic !== false;
    s.tilesMetronome = !!s.tilesMetronome;
    s.tilesScope = s.tilesScope !== false;
    s.tilesLyrics = s.tilesLyrics !== false;
    s.tilesQueue = !!s.tilesQueue;
    s.fhMusic = s.fhMusic !== false;
    s.fhSfx = s.fhSfx !== false;
    s.grMusic = s.grMusic !== false;
    s.grSfx = s.grSfx !== false;
    if (!TT.ghostCore.TRACKS.some((t) => t.id === s.grTrack)) s.grTrack = "60m";
    s.wmMusic = s.wmMusic !== false;
    s.wmSfx = s.wmSfx !== false;
    if (s.wmPack !== "mixed" && !TT.wormCore.PACKS.some((p) => p.id === s.wmPack)) s.wmPack = "mixed";
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
    // The test settings show in the folder on the test, practice and results screens only.
    const special = !["test", "practice", "results"].includes(ui.view);
    els.config.hidden = special;
    $("profile-chip").textContent = TT.profiles.active().name;
    $("profile-chip").setAttribute("aria-label", `Profile: ${TT.profiles.active().name}. Manage profiles`);
    if (special) return;

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
    const id = TT.newRoundId();
    const date = new Date().toISOString();
    ui.lastRoundId = id;
    TT.rounds.save({ id, date, kind, ...r.recording }).then(refreshSpeedScale);

    store.history.push({
      id,
      date,
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

  const testName = (kind, mode, amount, game, title, queue) =>
    kind === "game" && game === "tiles" ? `tiles, ${(title || "song").toLowerCase()} (${mode}${queue ? ", queue" : ""})`
      : kind === "game" && game === "ghost" ? `ghost race, ${(title || mode).toLowerCase()}`
      : kind === "game" && game === "worm" ? (mode === "daily" ? `wormhole, ${(title || "daily dig").toLowerCase()}` : `wormhole blitz, ${(title || "").toLowerCase()}`)
      : kind === "game" ? `${game === "forest" ? "forest hop" : "path runner"}, ${amount} steps` : `${kind === "practice" ? "practice" : mode} ${amount}`;

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
    test: [["ARROWS", "MOVE", "noop"], ["TAB", "RESTART", "restart"], ["ESC", "MENU", "menu"]],
    practice: [["ARROWS", "MOVE", "noop"], ["TAB", "NEW WORDS", "restart"], ["ESC", "MENU", "menu"]],
    results: [["ARROWS", "MOVE", "noop"], ["TAB / ENTER", "NEXT TEST", "restart"], ["R", "REPLAY", "replay:last"], ["P", "PRACTICE WEAK KEYS", "practice"], ["ESC", "MENU", "menu"]],
    games: [["ARROWS", "MOVE", "noop"], ["ESC", "CLOSE MENU", "close"]],
    game: [["TAB", "RESTART", "play"], ["ESC", "PAUSE", "pause"]],
    forest: [["SPACE / ENTER", "JUMP", "noop"], ["TAB", "RESTART", "fh:play"], ["ESC", "PAUSE", "pause"]],
    "forest-select": [["ARROWS", "CHOOSE", "noop"], ["ENTER", "PLAY", "fh:play"], ["H", "HOW TO PLAY", "fh:guide"], ["M", "MUSIC", "fh:music"], ["E", "EFFECTS", "fh:sfx"], ["ESC", "MENU", "menu"]],
    "forest-guide": [["ARROWS", "MOVE", "noop"], ["ENTER", "PLAY", "fh:play"], ["ESC", "BACK", "fh:select"]],
    tiles: [["ENTER / SPACE", "HIT", "noop"], ["TAB", "RESTART", "tl:play"], ["ESC", "PAUSE", "pause"]],
    "tiles-select": [["ARROWS", "MOVE", "noop"], ["[ ]", "DIFFICULTY", "tl:harder"], ["ENTER", "PLAY", "tl:play"], ["A", "ADD A SONG", "tl:import"], ["Q", "MODE", "tl:mode:toggle"], ["M", "MUSIC", "tl:music"], ["T", "METRONOME", "tl:metronome"], ["ESC", "MENU", "menu"]],
    ghost: [["SPACE", "NEXT WORD", "noop"], ["TAB", "RESTART", "gr:play"], ["ESC", "PAUSE", "pause"]],
    "ghost-select": [["ARROWS", "MOVE", "noop"], ["ENTER", "RACE", "gr:play"], ["M", "MUSIC", "gr:music"], ["E", "EFFECTS", "gr:sfx"], ["ESC", "MENU", "menu"]],
    worm: [["ENTER", "DIG IN", "noop"], ["ESC", "PAUSE", "pause"]],
    "worm-select": [["ARROWS", "MOVE", "noop"], ["ENTER", "DIG", "wm:play"], ["M", "MUSIC", "wm:music"], ["E", "EFFECTS", "wm:sfx"], ["ESC", "MENU", "menu"]],
    replay: [["SPACE", "PLAY / PAUSE", "rp:toggle"], ["← →", "SKIP 2S", "rp:skip:2000"], ["↑ ↓", "MOVE", "noop"], ["ESC", "BACK", "rp:back"]],
    stats: [["ARROWS", "MOVE", "noop"], ["P", "PRACTICE WEAK KEYS", "practice"], ["ESC", "CLOSE MENU", "close"]],
    leaderboard: [["ARROWS", "MOVE", "noop"], ["ESC", "CLOSE MENU", "close"]],
    settings: [["ARROWS", "MOVE", "noop"], ["ESC", "CLOSE MENU", "close"]],
  };
  const STATUS = {
    test: "Type to begin.",
    practice: "Practice ready.",
    results: "Result saved.",
    games: "Select a game.",
    game: "Type a word to move.",
    forest: "Type a word, then press Space or Enter to hop.",
    "forest-select": "Collect treats on your runs to unlock more animals.",
    "forest-guide": "Lanes get more dangerous the further you go.",
    tiles: "Type the word, then hit Enter as it crosses the line.",
    "tiles-select": "Pick a song and a difficulty.",
    ghost: "Type the track. Space moves on once a word is right.",
    "ghost-select": "Pick a track and who to race.",
    worm: "Type an answer and press Enter. Rarer answers dig deeper.",
    "worm-select": "Play today's dig, or a Blitz round.",
    replay: "Click a moment to jump to it.",
    stats: "Select a view.",
    leaderboard: "Everyone on this computer, ranked.",
    settings: "Changes save automatically.",
  };

  function renderHints() {
    let hints = HINTS[ui.view];
    // After practice, only Tab/Enter start the next round, so a stray "p" can't kick one off.
    if (ui.view === "results" && ui.lastTyping === "practice") {
      hints = hints.filter(([, , act]) => act !== "practice").map(([key, label, act]) =>
        [key, act === "restart" ? "PRACTICE AGAIN" : label, act]);
    }
    if (ui.view === "games" && selectedGame().playable) hints = [["ENTER", "PLAY", playAct(selectedGame().id)], ...hints];
    // a Daily Dig that's already done can only be replayed
    if (ui.view === "worm-select" && wormDigDone()) hints = hints.map((h) => (h[0] === "ENTER" ? ["R", "REPLAY", "wm:replay"] : h));
    // In full screen, Esc on a main screen leaves full screen.
    if (ui.fullscreen && ROOT_VIEWS.includes(ui.view)) {
      hints = hints.map(([key, label, act]) => (key === "ESC" ? [key, "EXIT FULL SCREEN", "window:windowed"] : [key, label, act]));
    }
    els.hints.innerHTML = hints.map(([key, label, act]) => `<button data-act="${act}"><kbd>${key}</kbd>${label}</button>`).join("");
    els.statusLine.textContent = STATUS[ui.view];
  }

  // ---------- full screen (desktop app) ----------

  // The main screens, one per tab. Esc on one of these leaves full screen.
  const ROOT_VIEWS = ["test", "practice", "games", "leaderboard", "stats", "settings"];
  ui.fullscreen = false;

  function setFullscreenState(on) {
    ui.fullscreen = !!on;
    document.documentElement.classList.toggle("fullscreen", ui.fullscreen);
    if (!ui.fullscreen) $("fs-bar").hidden = true;
    renderHints();
  }

  // Full screen has no title bar, so moving the mouse to the very top shows a close button,
  // which hides again once the mouse moves away.
  document.addEventListener("mousemove", (e) => {
    if (!ui.fullscreen) return;
    const bar = $("fs-bar");
    if (e.clientY <= 4) bar.hidden = false;
    else if (!bar.hidden && e.clientY > 56) bar.hidden = true;
  });
  document.documentElement.addEventListener("mouseleave", (e) => {
    if (ui.fullscreen && e.clientY > 0) $("fs-bar").hidden = true;
  });

  // ---------- folder tabs ----------

  const MAIN_TABS = [
    ["test", "TEST", "nav:test"], ["practice", "PRACTICE", "nav:practice"], ["games", "GAMES", "nav:games"],
    ["leaderboard", "LEADERBOARD", "nav:leaderboard"], ["stats", "STATS", "nav:stats"], ["settings", "SETTINGS", "nav:settings"],
  ];
  // While you're in the games, the second row of tabs is the library and each playable game.
  const GAME_TABS = [["library", "LIBRARY", "nav:games"], ["forest", "FOREST HOP", "fh:select"], ["tiles", "TILES", "tl:select"], ["ghost", "GHOST RACE", "gr:select"], ["worm", "WORMHOLE", "wm:select"], ["path", "PATH RUNNER", "play"]];
  const FOLDER_VIEWS = ["leaderboard", "stats", "settings"]; // these draw their own second row of tabs

  // Which main tab a screen belongs to.
  function tabFor(view) {
    if (view === "replay") return rp.returnTo === "replay" ? "test" : tabFor(rp.returnTo);
    if (view === "results") return ui.lastTyping === "practice" ? "practice" : "test";
    if (MAIN_TABS.some(([id]) => id === view)) return view;
    return "games"; // the game screens
  }

  // Which game tab a screen inside the games belongs to.
  function gameTabFor(view) {
    if (view === "replay") return rp.rec && ["forest", "tiles", "ghost", "worm"].includes(rp.rec.game) ? rp.rec.game : "path";
    if (FOREST_VIEWS.includes(view)) return "forest";
    if (GHOST_VIEWS.includes(view)) return "ghost";
    if (WORM_VIEWS.includes(view)) return "worm";
    if (TILES_VIEWS.includes(view)) return "tiles";
    if (view === "game") return "path";
    return "library";
  }

  const tabNum = (id) => MAIN_TABS.findIndex(([t]) => t === id) + 1;

  // The open tab is drawn as one shape whose outline runs on, unbroken, into its folder's outline:
  // a curve out of the folder's edge, a slanted side, rounded top corners, the other side, a curve back.
  // num is the tab's number as shown ("03.1"); Ctrl + that number jumps to it (see "jump" below).
  const tabButton = (on, act, num, label) =>
    `<button class="ftab ${on ? "on" : ""}" data-act="${act}" data-num="${num.replace(/^0/, "")}" title="Ctrl+${num.replace(/^0/, "")}"${on ? ' aria-current="page"' : ""}><span class="n">${num}</span>${label}${on
      ? '<svg class="tabshape" aria-hidden="true"><path class="ff"/><path class="fl"/></svg>' : ""}</button>`;

  const FLARE = 12, CORNER = 12, SLANT = 8; // px: the curve into the folder, top corners, how far the sides lean in
  function shapeTab(btn) {
    const svg = btn.querySelector(".tabshape");
    if (!svg) return;
    const w = btn.offsetWidth, h = btn.offsetHeight;
    if (!w || !h) return; // not laid out yet; the size watcher shapes it once it is
    const y = h - 1; // the middle of the folder's outline, which the tab's foot overlaps
    const lean = (SLANT * FLARE) / h; // how far the side has leaned in at the top of the curve
    const L = FLARE, R = FLARE + w; // the tab's left and right edges in the drawing
    const outline = `M0 ${y} Q${L} ${y} ${L + lean} ${y - FLARE} L${L + SLANT} ${CORNER} Q${L + SLANT} 1 ${L + SLANT + CORNER} 1 ` +
      `L${R - SLANT - CORNER} 1 Q${R - SLANT} 1 ${R - SLANT} ${CORNER} L${R - lean} ${y - FLARE} Q${R} ${y} ${R + FLARE} ${y}`;
    svg.setAttribute("width", w + 2 * FLARE);
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", `0 0 ${w + 2 * FLARE} ${h}`);
    svg.querySelector(".fl").setAttribute("d", outline);
    svg.querySelector(".ff").setAttribute("d", `${outline} L${R + FLARE} ${h} L0 ${h} Z`);
  }
  // Reshape the open tabs whenever they change size (a tab grows under the cursor).
  const tabSizes = new ResizeObserver((entries) => entries.forEach((e) => shapeTab(e.target)));
  function shapeTabs(nav) {
    for (const btn of nav.querySelectorAll(".ftab.on")) {
      shapeTab(btn);
      tabSizes.observe(btn);
    }
  }

  function renderTabs(view) {
    const main = tabFor(view);
    els.tabs.innerHTML = MAIN_TABS.map(([id, label, act], i) => tabButton(id === main, act, `0${i + 1}`, label)).join("");
    shapeTabs(els.tabs);
    if (main === "games") setSubtabs(GAME_TABS, gameTabFor(view), main);
    else if (!FOLDER_VIEWS.includes(view)) setSubtabs(null);
  }

  // The second row of tabs. tabs: [[id, label, action], ...], or null for none.
  function setSubtabs(tabs, current, main) {
    // A section's own menu switching tab (stats, settings, leaderboard) pulls a new window forward.
    if (tabs && folderShown.main === main && folderShown.sub != null && current !== folderShown.sub) queueFolderMove("sub");
    if (tabs) folderShown.sub = current;
    els.subtabs.hidden = !tabs;
    els.app.classList.toggle("has-sub", !!tabs);
    if (!tabs) return (els.subtabs.innerHTML = "");
    const n = tabNum(main);
    els.subtabs.innerHTML = tabs.map(([id, label, act], i) => tabButton(id === current, act, `0${n}.${i + 1}`, label)).join("");
    shapeTabs(els.subtabs);
  }

  // ---------- folder transition ----------
  // Moving to another tab pulls its folder out of the drawer: the new folder, with its open tab, rises
  // from the bottom of the screen while the old one drops back behind it and fades. A main tab moves
  // the whole folder (with its second row of tabs); a tab in the second row moves just the window.
  // The open tab travels with its folder, so the outline around them stays joined, and the other
  // tabs stay where they are.
  const folderShown = { main: null, sub: null }; // the tabs on screen now
  let folderMove = null; // { kind, ghost } waiting for the next frame
  let folderRun = null;  // { ghost, anims } still animating
  const calm = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  els.stack = document.querySelector(".folder-stack");

  function endFolderRun() {
    if (!folderRun) return;
    folderRun.anims.forEach((a) => a.cancel());
    folderRun.ghost.remove();
    folderRun = null;
  }

  // A still copy of the folder as it looks now, laid over the same spot, to animate out of the way.
  // ---------- scrolling inside the folder ----------
  // The app never scrolls as a page; pages and their columns scroll on their own (style.css). Pages are
  // redrawn whenever something changes, so this keeps each one's scroll position across redraws, and
  // brings a newly selected list item into view.
  const SCROLLERS = ".view, #stats-body, .cols, .cols > *";
  const scrollSaved = new Map();
  const listPicked = new Map();
  function scrollPage() {
    const sub = els.subtabs.hidden ? "" : els.subtabs.querySelector(".ftab.on")?.dataset.act || "";
    return `${ui.view}|${sub}`;
  }
  function scrollersShown() {
    return [...$("folder").querySelectorAll(SCROLLERS)].filter((e) => !e.closest("[hidden]"));
  }
  document.addEventListener("scroll", (e) => {
    const el = e.target;
    if (!(el instanceof Element) || !el.matches(SCROLLERS) || !$("folder").contains(el)) return;
    scrollSaved.set(`${scrollPage()}|${scrollersShown().indexOf(el)}`, el.scrollTop);
  }, true);
  new MutationObserver(() => {
    const page = scrollPage();
    scrollersShown().forEach((el, i) => {
      const top = scrollSaved.get(`${page}|${i}`);
      if (top && !el.scrollTop) el.scrollTop = top;
      const on = el.matches(".col-list") && el.querySelector(".on");
      if (!on) return;
      const key = `${page}|${i}`;
      if (listPicked.get(key) === on.textContent) return;
      listPicked.set(key, on.textContent);
      const box = el.getBoundingClientRect(), r = on.getBoundingClientRect();
      if (r.top < box.top) el.scrollTop -= box.top - r.top + 8;
      else if (r.bottom > box.bottom) el.scrollTop += r.bottom - box.bottom + 8;
    });
  }).observe($("folder"), { childList: true, subtree: true });

  function folderGhost(target) {
    const r = target.getBoundingClientRect();
    // the copy starts unscrolled, so note where each scrolling part was (in the order the copy keeps)
    const scrolled = [...target.querySelectorAll(SCROLLERS)].filter((e) => !e.closest("[hidden]")).map((e) => e.scrollTop);
    const ghost = target.cloneNode(true);
    ghost.querySelectorAll("[hidden]").forEach((e) => e.remove());
    ghost.scrolled = scrolled;
    [ghost, ...ghost.querySelectorAll("[id]")].forEach((e) => e.removeAttribute("id"));
    ghost.querySelectorAll("[data-act]").forEach((e) => e.removeAttribute("data-act"));
    ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, {
      position: "fixed", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      margin: "0", zIndex: "0", pointerEvents: "none", transformOrigin: "50% 0",
    });
    return ghost;
  }

  function queueFolderMove(kind) {
    if (folderMove || calm.matches || !els.app.offsetWidth) return;
    endFolderRun();
    const target = kind === "main" ? els.stack : $("folder");
    folderMove = { kind, ghost: folderGhost(target) };
    // after the new page is drawn: the next frame, or a moment later if frames are paused
    requestAnimationFrame(runFolderMove);
    setTimeout(runFolderMove, 60);
  }

  function runFolderMove() {
    const move = folderMove;
    folderMove = null;
    if (!move) return;
    const target = move.kind === "main" ? els.stack : $("folder");
    const tab = (move.kind === "main" ? els.tabs : els.subtabs).querySelector(".ftab.on");
    els.app.prepend(move.ghost);
    move.ghost.querySelectorAll(SCROLLERS).forEach((e, i) => { e.scrollTop = move.ghost.scrolled[i] || 0; });
    const rise = Math.max(120, window.innerHeight - target.getBoundingClientRect().top + 24);
    const ease = "cubic-bezier(.3,.7,.3,1)";
    const riseUp = [{ transform: `translateY(${rise}px)` }, { transform: "translateY(0)" }];
    const anims = [
      target.animate(riseUp, { duration: 420, easing: ease }),
      move.ghost.animate([
        { transform: "none", filter: "brightness(1)", opacity: 1 },
        { transform: "translateY(-22px) scale(.97)", filter: "brightness(.86)", opacity: 1, offset: 0.7 },
        { transform: "translateY(-22px) scale(.97)", filter: "brightness(.86)", opacity: 0 },
      ], { duration: 460, easing: ease, fill: "forwards" }),
    ];
    if (tab) anims.push(tab.animate(riseUp, { duration: 420, easing: ease }));
    folderRun = { ghost: move.ghost, anims };
    // Tidy up when it ends, and in any case shortly after (animations pause while the window is hidden).
    const done = () => { if (folderRun && folderRun.ghost === move.ghost) endFolderRun(); };
    anims[1].onfinish = done;
    setTimeout(done, 700);
  }

  // ---------- jump to a tab by its number ----------
  // Hold Ctrl and press a tab's number: the first number opens that main tab right away, and each
  // number after it (Ctrl still held) opens that tab in its second row. Letting go of Ctrl starts over.
  let jumpMain = false; // a main tab has been chosen while Ctrl is held

  function jumpKey(n) {
    if (!jumpMain) {
      const tab = MAIN_TABS[n - 1];
      if (!tab) return (els.statusLine.textContent = `There's no tab ${n}.`);
      act(tab[2]);
      jumpMain = true;
      return;
    }
    const sub = els.subtabs.hidden ? null : els.subtabs.querySelectorAll(".ftab")[n - 1];
    if (sub) act(sub.dataset.act);
    else els.statusLine.textContent = `There's no tab ${tabNum(tabFor(ui.view))}.${n}.`;
  }

  document.addEventListener("keyup", (e) => {
    if (e.key === "Control") jumpMain = false;
  });
  window.addEventListener("blur", () => {
    jumpMain = false;
  });

  // While a game is being played it takes the whole window: no header, tabs or footer (style.css,
  // html.playing). It starts with the round and ends when the round does, or on leaving the game.
  const PLAY_VIEWS = ["game", "forest", "tiles", "ghost", "worm"];
  const setPlaying = (on) => document.documentElement.classList.toggle("playing", !!on);

  function show(view) {
    if (!PLAY_VIEWS.includes(view)) setPlaying(false);
    // Changing tab plays the folder transition (decided here, before anything on screen changes).
    const main = tabFor(view);
    const sub = main === "games" ? gameTabFor(view) : null;
    if (folderShown.main !== null && main !== folderShown.main) queueFolderMove("main");
    else if (main === "games" && folderShown.sub !== null && sub !== folderShown.sub) queueFolderMove("sub");
    folderShown.main = main;
    if (main === "games") folderShown.sub = sub;
    else if (!FOLDER_VIEWS.includes(view)) folderShown.sub = null;

    ui.view = view;
    els.config.hidden = !["test", "practice", "results"].includes(view);
    renderTabs(view);
    els.typing.hidden = view !== "test" && view !== "practice";
    els.results.hidden = view !== "results";
    $("view-game").hidden = view !== "game";
    for (const v of FOREST_VIEWS) $(`view-${v}`).hidden = v !== view;
    if (view !== "forest" && forest) forest.stop();
    for (const v of TILES_VIEWS) $(`view-${v}`).hidden = v !== view;
    if (view !== "tiles" && tiles) tiles.stop();
    for (const v of GHOST_VIEWS) $(`view-${v}`).hidden = v !== view;
    if (view !== "ghost" && ghostRace) ghostRace.stop();
    for (const v of WORM_VIEWS) $(`view-${v}`).hidden = v !== view;
    if (view !== "worm" && wormhole) wormhole.stop();
    if (view !== "tiles-select" && ui.tap) stopTap();
    $("view-replay").hidden = view !== "replay";
    if (view !== "replay") pauseReplay();
    for (const v of MENU_VIEWS) $(`view-${v}`).hidden = v !== view;
    renderHints();
  }

  function openMenu(view) {
    engine.stop();
    runner.stop();
    forest.stop();
    tiles.stop();
    ghostRace.stop();
    wormhole.stop();
    document.body.classList.remove("typing");
    ui.menuView = view;
    show(view);
    ({ games: renderGames, leaderboard: renderLeaderboard, stats: renderStats, settings: renderSettings })[view]();
  }

  // A section's own menu becomes the folder's second row of tabs (it returns no markup of its own).
  const subtabs = (tabs, current, act) => {
    setSubtabs(tabs.map(([id, label]) => [id, label, `${act}:${id}`]), current, tabFor(ui.view));
    return "";
  };

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

    const filters = [["all", "ALL"], ["arcade", "ARCADE"], ["rhythm", "RHYTHM"], ["trivia", "TRIVIA"], ["drills", "DRILLS"]];
    $("view-games").innerHTML = `
      <div class="seg game-filter" aria-label="Show games">${filters.map(([id, label]) =>
        `<button class="${id === ui.gamesTab ? "on" : ""}" aria-pressed="${id === ui.gamesTab}" data-act="gtab:${id}">${label}</button>`).join("")}</div>` + `
      <div class="cols">
        <ul class="list col-list">
          ${list.map((x) => `<li><button class="${x.id === g.id ? "on" : ""}" aria-pressed="${x.id === g.id}" data-act="game:${x.id}">${x.name}<span class="tag">${gameTag(x)}</span></button></li>`).join("")}
        </ul>
        <section class="col-main">
          <div class="title-row"><h1>${g.name.toUpperCase()}</h1><span class="title-meta">${g.playable ? `BEST ${gameBest(g.id)}${g.id === "ghost" ? " WPM" : g.id === "worm" ? " POINTS" : ""}` : "SOON"}</span></div>
          <div class="kind-line">${g.kind}</div>
          <div class="game-art">${g.id === "forest" ? TT.sprites.svg("frog", 220) : g.id === "ghost" ? TT.ghostCore.runnerSvg(220) : g.id === "worm" ? TT.wormCore.wormIcon(240) : `<svg viewBox="0 0 300 300" role="img" aria-label="${g.name} icon">${GAME_ART[g.id]}</svg>`}</div>
          <div class="detail-line">DIFFICULTY: <strong>${g.id === "tiles" ? "EASY TO EXPERT" : g.id === "ghost" ? "AS FAST AS YOUR GHOST" : g.id === "worm" ? "AS DEEP AS YOU KNOW" : "ADAPTIVE"}</strong></div>
          <div class="rule-box">${g.desc}${g.playable ? "" : " <strong>Coming in a later update.</strong>"}</div>
          ${g.playable ? `<button class="outline-btn play-btn" data-act="${playAct(g.id)}">PLAY <kbd>ENTER</kbd></button>` : ""}
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
    onEnd(id) {
      setPlaying(false);
      ui.lastGameId = id;
      els.statusLine.textContent = "Run saved. Press R to replay it.";
    },
  });

  function startGame() {
    engine.stop();
    document.body.classList.remove("typing");
    show("game");
    setPlaying(true);
    renderBar();
    runner.newGame();
  }

  // ---------- forest hop ----------

  const FH_ANIMALS = [
    { kind: "frog", title: "FROG", cost: 0, blurb: "Light on its feet and right at home by the creek." },
    { kind: "chicken", title: "CHICKEN", cost: 0, blurb: "Nobody knows how it got into the forest. Neither does it." },
    { kind: "moose", title: "MOOSE", cost: 0, blurb: "Big antlers, big steps, same hop as everyone else." },
    { kind: "bear", title: "BEAR", cost: 0, blurb: "Follows its nose toward the berries." },
    { kind: "fox", title: "FOX", cost: 150, blurb: "Quick, quiet and a little smug about it." },
    { kind: "rabbit", title: "RABBIT", cost: 100, blurb: "Born for hopping. Very proud of the ears." },
    { kind: "owl", title: "OWL", cost: 250, blurb: "Keeps one eye on the eagle at all times." },
    { kind: "raccoon", title: "RACCOON", cost: 300, blurb: "Has strong opinions about trash cans." },
  ];

  const fhData = () => {
    const d = (TT.store.games.forest ||= { best: 0, plays: 0, treats: 0, unlocked: ["frog", "chicken", "moose", "bear"], animal: "frog", history: [] });
    if (d.treats == null) d.treats = d.acorns || 0; // acorns were renamed to treats
    delete d.acorns;
    d.bestBy ||= {};
    d.runsBy ||= {};
    return d;
  };

  const forest = TT.createForest({
    root: $("view-forest"),
    onStart() {
      els.statusLine.textContent = "Keep moving forward.";
    },
    onEnd(id) {
      setPlaying(false);
      ui.lastForestId = id;
      els.statusLine.textContent = "Run saved. Press R to replay it.";
    },
  });

  function openForestSelect() {
    engine.stop();
    runner.stop();
    document.body.classList.remove("typing");
    ui.fhPick ||= fhData().animal;
    show("forest-select");
    renderBar();
    renderForestSelect();
  }

  const toggleBtn = (label, on, act) => `<button class="opt ${on ? "on" : ""}" aria-pressed="${on}" data-act="${act}">${label} ${on ? "ON" : "OFF"}</button>`;

  function renderForestSelect() {
    const d = fhData();
    const pick = FH_ANIMALS.find((a) => a.kind === ui.fhPick) || FH_ANIMALS[0];
    const unlocked = (a) => d.unlocked.includes(a.kind);
    const open = unlocked(pick);
    const cards = FH_ANIMALS.map((a) => {
      const on = a.kind === pick.kind;
      const tag = !unlocked(a) ? `LOCKED · ${a.cost}` : d.bestBy[a.kind] ? `BEST ${d.bestBy[a.kind]}` : "NEW";
      return `<button class="fh-animal ${on ? "on" : ""} ${unlocked(a) ? "" : "locked"}" data-act="fh:pick:${a.kind}" aria-pressed="${on}" aria-label="${a.title.toLowerCase()}${unlocked(a) ? "" : ", locked"}">
        ${TT.sprites.svg(a.kind, 90)}<span class="fh-animal-name">${a.title}</span><span class="caps-label">${tag}</span>
      </button>`;
    }).join("");
    const th = TT.forestCore.theme(pick.kind);
    const action = open
      ? `<button class="fh-play" data-act="fh:play">PLAY <kbd>ENTER</kbd></button>`
      : `<button class="outline-btn fh-unlock" data-act="fh:unlock:${pick.kind}" ${d.treats < pick.cost ? "disabled" : ""}>UNLOCK FOR ${pick.cost} TREATS</button>
         ${d.treats < pick.cost ? `<p class="note">You need ${pick.cost - d.treats} more treats.</p>` : ""}`;

    $("view-forest-select").innerHTML = `
      <div class="cols">
        <section class="col-main">
          <div class="title-row"><h1>CHOOSE YOUR ANIMAL</h1><span class="title-meta fh-acorns">${d.treats} TREATS</span></div>
          <div class="kind-line">EVERY ANIMAL HOPS THE SAME</div>
          <div class="fh-animals">${cards}</div>
        </section>
        <aside class="col-side">
          <div class="rule-head">SELECTED</div>
          <div class="fh-portrait">${TT.sprites.svg(pick.kind, 160)}</div>
          <div class="fh-pick-title"><span>${pick.title}</span><span class="caps-label">${open ? "UNLOCKED" : "LOCKED"}</span></div>
          <p class="fh-blurb">${pick.blurb}</p>
          <dl class="status">${statusRows([
            ["Collects:", `<span class="fh-inline">${TT.sprites.svg(th.treat, 22)}${th.treats[1]}</span>`],
            ["Watch out for:", `<span class="fh-inline">${TT.sprites.svg(th.predator, 22)}${th.name.toLowerCase()}</span>`],
            ["Best:", open && d.bestBy[pick.kind] ? `${d.bestBy[pick.kind]} steps` : "—"],
            ["Runs:", open ? d.runsBy[pick.kind] || 0 : "—", true],
          ])}</dl>
          ${action}
          <div class="rule-head">SOUND</div>
          <div class="tl-toggles">${toggleBtn("MUSIC", S().fhMusic, "fh:music")}${toggleBtn("EFFECTS", S().fhSfx, "fh:sfx")}</div>
        </aside>
      </div>`;
  }

  function renderForestGuide() {
    const lane = (bg, inner) => `<div class="fh-lane" style="background: ${bg}">${inner}</div>`;
    const at = (c, html) => `<span class="fh-at" style="left: ${c * 56 + 3}px">${html}</span>`;
    const sp = (k, c) => at(c, TT.sprites.svg(k, 50));
    const log = (c, len) => `<span class="fh-log" style="left: ${c * 56 + 3}px; width: ${len * 56 - 6}px"></span>`;
    const pad = (c) => `<span class="fh-pad" style="left: ${c * 56 + 8}px"></span>`;
    const LANES = [
      ["MEADOW", "SAFE", lane("#B7BC95", sp("pine", 0) + sp("rock", 2) + sp("stump", 3) + sp(TT.forestCore.theme(fhData().animal).treat, 5)),
        "Safe ground. Trees, rocks and stumps block your way, so that direction shows BLOCKED."],
      ["GAME TRAIL", "DANGER", lane("#C4AF88", sp("deer", 1) + sp("deer", 2)),
        "Deer herds run across the trail. Wait for a gap, then jump. They amble along at first and run faster the further you go."],
      ["CREEK", "DANGER", lane("#8EA5A3", log(0, 2) + pad(3) + log(4, 3)),
        "Hop onto drifting logs or lily pads. Logs carry you sideways. Miss and you fall in."],
      ["RAPIDS", "FURTHER IN", lane("#7F989A", log(1, 2) + log(4, 2)),
        "A fast creek with short logs and no lily pads. Words are kept short here."],
      ["ROCKSLIDE", "WARNING FIRST", lane("#BCB199", `<span class="fh-warn" style="left: 6px">!</span><span class="fh-boulder" style="left: ${2 * 56 + 5}px"></span>`),
        "The ! markers flash, then a boulder rolls straight through. Wait for it, then hop."],
      ["PREDATORS", "KEEP MOVING", lane("#AFB48C", sp(TT.forestCore.theme(fhData().animal).predator, 2) + sp(fhData().animal, 4)),
        "Stop making progress, or hop 3 rows back, and your predator shows up with a countdown. Reach a new row to shake it off. It's patient at first (about 24 seconds, then 12 more) and gets quicker the further you go."],
    ];
    $("view-forest-guide").innerHTML = `
      <div class="title-row"><h1>HOW TO PLAY</h1><span class="title-meta">GET AS FAR AS YOU CAN</span></div>
      <div class="cols fh-guide">
        <aside class="col-side">
          <div class="rule-head">HOPPING</div>
          <div class="fh-mini-cross">
            <span style="grid-area: 1 / 2">pine</span><span style="grid-area: 2 / 1">fern</span>
            <span class="c" style="grid-area: 2 / 2">${TT.sprites.svg(fhData().animal, 30)}</span>
            <span style="grid-area: 2 / 3">moss</span><span style="grid-area: 3 / 2">bark</span>
          </div>
          <ol class="fh-rules">
            <li>A word sits beside each tile around your animal: forward, back, left and right.</li>
            <li>Type the word, then press <strong>Space</strong> or <strong>Enter</strong> to hop. You can type ahead and wait for the right moment.</li>
            <li>A wrong letter stays in what you've typed until you Backspace it, like in the speed test. Each one counts as a mistake.</li>
            <li>If a tree or rock is in the way, that direction has no word.</li>
            <li>Only the word you used changes after a hop. New words lean toward your target keys and get longer the further you go.</li>
          </ol>
          <p class="fh-acorn-note">${TT.sprites.svg(TT.forestCore.theme(fhData().animal).treat, 36)}<span>Hop onto <strong>treats</strong> to collect them, then spend them to unlock animals. Every animal has its own treat and its own predator.</span></p>
        </aside>
        <section class="col-main fh-lanes">${LANES.map(([title, tag, art, text]) => `
          <div class="fh-lane-card">${art}
            <div class="fh-lane-title"><span>${title}</span><span class="caps-label">${tag}</span></div>
            <p>${text}</p>
          </div>`).join("")}
        </section>
      </div>`;
  }

  function startForest() {
    const d = fhData();
    const pick = ui.fhPick || d.animal;
    if (!d.unlocked.includes(pick)) return;
    d.animal = pick;
    TT.save();
    engine.stop();
    runner.stop();
    document.body.classList.remove("typing");
    show("forest");
    setPlaying(true);
    renderBar();
    forest.newGame(pick);
  }

  function forestAct(x, y) {
    const d = fhData();
    if (x === "select") { forest.stop(); openForestSelect(); }
    else if (x === "play") startForest();
    else if (x === "guide") { show("forest-guide"); renderBar(); renderForestGuide(); }
    else if (x === "pick") { ui.fhPick = y; renderForestSelect(); }
    else if (x === "music" || x === "sfx") {
      // music and sound effects, muted separately
      const key = x === "music" ? "fhMusic" : "fhSfx";
      S()[key] = !S()[key];
      TT.save();
      TT.forestSound.setLevels();
      if (ui.view === "forest-select") renderForestSelect();
    }
    else if (x === "next" || x === "prev") {
      const i = FH_ANIMALS.findIndex((a) => a.kind === ui.fhPick);
      ui.fhPick = FH_ANIMALS[(i + (x === "next" ? 1 : -1) + FH_ANIMALS.length) % FH_ANIMALS.length].kind;
      renderForestSelect();
    } else if (x === "unlock") {
      const a = FH_ANIMALS.find((z) => z.kind === y);
      if (a && !d.unlocked.includes(a.kind) && d.treats >= a.cost) {
        d.treats -= a.cost;
        d.unlocked.push(a.kind);
        TT.save();
        renderForestSelect();
      }
    }
  }

  // ---------- ghost race ----------

  const grData = () => {
    const d = (TT.store.games.ghost ||= { best: 0, plays: 0, bestBy: {}, lastBy: {}, history: [] });
    d.bestBy ||= {};
    d.lastBy ||= {};
    d.history ||= [];
    return d;
  };

  const ghostRace = TT.createGhostRace({
    root: $("view-ghost"),
    onStart() {
      els.statusLine.textContent = "Go! Space moves on once a word is right.";
    },
    onEnd(id) {
      setPlaying(false);
      ui.lastGhostId = id;
      els.statusLine.textContent = "Race saved. Press R to replay it.";
    },
  });

  // Who you can race on a track: your best and last runs, anyone else's best on this computer, or
  // a steady pace. Runs point at their recordings (TT.rounds), which play back as the ghost.
  function ghostOptions(trackId) {
    const d = grData(), me = TT.profiles.activeId(), clock = TT.ghostCore.clock;
    const note = (r) => `${clock(r.time)}s · ${Math.round(r.wpm)} wpm`;
    const best = d.bestBy[trackId], last = d.lastBy[trackId];
    const out = [{ id: "best", label: "Your best", run: best, note: best ? note(best) : "Race once to set one" }];
    if (last && best && last.id !== best.id) out.push({ id: "last", label: "Your last run", run: last, note: note(last) });
    for (const p of TT.profiles.list()) {
      if (p.id === me) continue;
      const g = (TT.profiles.games(p.id) || {}).ghost, b = g && g.bestBy && g.bestBy[trackId];
      if (b) out.push({ id: `p:${p.id}`, label: `${p.name}'s best`, run: b, note: note(b) });
    }
    out.push({ id: "pace", label: "Steady pace", note: `${S().grPace} wpm the whole way` });
    return out;
  }
  // the chosen one, or the next best there is (your best, then a steady pace)
  const ghostChoice = (trackId) => {
    const opts = ghostOptions(trackId);
    return opts.find((o) => o.id === S().grVs && (o.run || o.id === "pace")) || opts.find((o) => o.run) || opts[opts.length - 1];
  };

  function openGhostSelect() {
    engine.stop();
    runner.stop();
    forest.stop();
    tiles.stop();
    document.body.classList.remove("typing");
    show("ghost-select");
    renderBar();
    renderGhostSelect();
  }

  function renderGhostSelect() {
    const s = S(), G = TT.ghostCore, d = grData();
    const tr = G.track(s.grTrack), words = G.wordsOf(tr);
    const opts = ghostOptions(tr.id), pick = ghostChoice(tr.id);
    const item = (t) => {
      const b = d.bestBy[t.id], on = t.id === tr.id;
      return `<li><button class="${on ? "on" : ""}" aria-pressed="${on}" data-act="gr:track:${t.id}">${t.name}<span class="tag">${b ? `${G.clock(b.time)}S` : `${G.wordsOf(t).length} WORDS`}</span></button></li>`;
    };
    const best = d.bestBy[tr.id];
    const races = d.history.filter((h) => h.track === tr.id);
    const vs = opts.map((o) => {
      const on = o.id === pick.id, off = !o.run && o.id !== "pace";
      return `<button class="gr-vs-opt ${on ? "on" : ""}" aria-pressed="${on}" data-act="gr:vs:${o.id}"${off ? " disabled" : ""}>
        ${TT.ghostCore.runnerSvg(34, "", true)}<span><strong>${esc(o.label)}</strong><small>${esc(o.note)}</small></span></button>`;
    }).join("");
    $("view-ghost-select").innerHTML = `
      <div class="cols">
        <ul class="list col-list">${G.TRACKS.map(item).join("")}</ul>
        <section class="col-main">
          <div class="title-row"><h1>${tr.name.toUpperCase()}</h1><span class="title-meta">${words.length} WORDS · ${G.lengthOf(words)} LETTERS</span></div>
          <div class="kind-line">${esc(tr.blurb.toUpperCase())}</div>
          <div class="gr-lineup" aria-hidden="true">
            <div class="gr-lane"><span class="gr-num">2</span><span class="gr-who">${esc(pick.label.toUpperCase())}</span>${TT.ghostCore.runnerSvg(46, "", true)}<span class="gr-flag"></span></div>
            <div class="gr-lane"><span class="gr-num">3</span><span class="gr-who">YOU</span>${TT.ghostCore.runnerSvg(46)}<span class="gr-flag"></span></div>
          </div>
          <p class="gr-passage">${esc(tr.text)}</p>
          <dl class="status">${statusRows([
            ["Your best:", best ? `${G.clock(best.time)}s · ${Math.round(best.wpm)} wpm · ${Math.round(best.acc)}%` : "—"],
            ["Races:", races.length],
            ["Ghosts beaten:", races.filter((h) => h.won).length, true],
          ])}</dl>
          <button class="fh-play" data-act="gr:play">RACE <kbd>ENTER</kbd></button>
        </section>
        <aside class="col-side">
          <div class="rule-head">RACE AGAINST</div>
          <div class="gr-vs">${vs}</div>
          ${pick.id === "pace" ? `<div class="seg gr-paces" aria-label="Pace in words per minute">${G.PACES.map((w) =>
            `<button class="${w === s.grPace ? "on" : ""}" aria-pressed="${w === s.grPace}" data-act="gr:pace:${w}">${w}</button>`).join("")}</div>
            <p class="note">Words per minute.</p>` : ""}
          <div class="rule-head">SOUND</div>
          <div class="tl-toggles">${toggleBtn("MUSIC", s.grMusic, "gr:music")}${toggleBtn("EFFECTS", s.grSfx, "gr:sfx")}</div>
          <div class="side-label">How to race:</div>
          <ol class="fh-rules">
            <li>On your marks, set, and at the gun, type the track. You run lane 3 in your accent colour; the ghost, a pale afterimage, runs lane 2. A faint mark in the words shows where it has got to.</li>
            <li><strong>Space</strong> moves you on only once a word is right, so fix a typo before going on. The last word finishes the race as soon as it's typed.</li>
            <li>The ghost is a real run played back key for key. Beat yours and your new best becomes the ghost to chase.</li>
          </ol>
        </aside>
      </div>`;
  }

  async function startGhost() {
    const s = S(), tr = TT.ghostCore.track(s.grTrack), pick = ghostChoice(tr.id);
    let spec = { kind: "pace", wpm: s.grPace, label: `${s.grPace} wpm pace` };
    if (pick.run) {
      const rec = await TT.rounds.get(pick.run.id);
      if (rec && rec.keys) spec = { kind: "run", rec, label: pick.id === "best" ? "Your best" : pick.id === "last" ? "Your last" : pick.label };
    }
    engine.stop();
    runner.stop();
    forest.stop();
    tiles.stop();
    document.body.classList.remove("typing");
    show("ghost");
    setPlaying(true);
    renderBar();
    ghostRace.newRace(tr.id, spec);
  }

  function ghostAct(x, y) {
    const s = S();
    if (x === "select") return openGhostSelect();
    if (x === "play") return startGhost();
    if (x === "track") s.grTrack = y;
    else if (x === "vs") s.grVs = y;
    else if (x === "pace") { s.grPace = Number(y); s.grVs = "pace"; }
    else if (x === "music" || x === "sfx") {
      const key = x === "music" ? "grMusic" : "grSfx";
      s[key] = !s[key];
      TT.forestSound.setLevels();
    } else return;
    TT.save();
    if (ui.view === "ghost-select") renderGhostSelect();
  }

  // ---------- wormhole ----------

  const WM = TT.wormCore;
  const wormhole = TT.createWormhole({
    root: $("view-worm"),
    onStart() {
      els.statusLine.textContent = "Type an answer and press Enter. Rarer answers dig deeper.";
    },
    onEnd(id) {
      setPlaying(false);
      ui.lastWormId = id;
      els.statusLine.textContent = "Dig saved. Press R to replay it.";
    },
  });

  // The select screen's list: today's Daily Dig, Blitz, then the last two weeks of digs to catch up on.
  const WM_PAST = 13;
  function wormDays() {
    const today = WM.dayKey();
    const out = [];
    for (let k = 1; k <= WM_PAST; k++) {
      const day = WM.addDays(today, -k);
      if (WM.dayIndex(day) >= 0) out.push(day);
    }
    return out;
  }
  // the dig chosen in the list: today's, a past day's, or Blitz
  const wormPick = () => {
    const p = ui.wmPick || "daily";
    if (p === "blitz" || p === "daily") return p;
    return wormDays().includes(p.slice(4)) ? p : "daily";
  };
  const wormDay = (pick) => (pick === "daily" ? WM.dayKey() : pick.slice(4));
  const digTag = (e) => (!e ? "NEW" : e.done ? `${e.score}` : `${e.picks.filter(Boolean).length}/${WM.DAILY_N}`);
  // the chosen dig, when it's a Daily that's done
  const wormDone = () => {
    const pick = wormPick();
    const e = pick !== "blitz" && WM.data().daily[wormDay(pick)];
    return e && e.done ? e : null;
  };
  function wormDigDone() {
    return !!wormDone();
  }

  function openWormSelect() {
    engine.stop();
    runner.stop();
    forest.stop();
    tiles.stop();
    ghostRace.stop();
    document.body.classList.remove("typing");
    show("worm-select");
    renderBar();
    renderWormSelect();
  }

  const tierChip = (tier) => `<span class="wm-tier t${tier}">${WM.TIERS[tier]}</span>`;

  function renderWormSelect() {
    const s = S(), d = WM.data(), pick = wormPick();
    const today = WM.dayKey();
    const item = (id, label, tag) => {
      const on = id === pick;
      return `<li><button class="${on ? "on" : ""}" aria-pressed="${on}" data-act="wm:pick:${id}">${label}<span class="tag">${tag}</span></button></li>`;
    };
    const best = (pk) => (d.blitz[pk] ? `BEST ${d.blitz[pk].score}` : "NEW");
    const list = item("daily", "DAILY DIG", digTag(d.daily[today])) + item("blitz", "BLITZ", best(s.wmPack)) +
      `<li class="tl-group caps-label">PAST DIGS</li>` +
      wormDays().map((day) => item(`day:${day}`, WM.dayLabel(day).toUpperCase(), d.daily[day] ? digTag(d.daily[day]) : "PLAY")).join("");

    let main;
    if (pick === "blitz") {
      const packs = [{ id: "mixed", name: "Mixed" }, ...WM.PACKS];
      const b = d.blitz[s.wmPack];
      const rounds = d.history.filter((h) => h.mode === "blitz" && (h.pack || "mixed") === s.wmPack).length;
      main = `
        <div class="title-row"><h1>BLITZ</h1><span class="title-meta">${esc(WM.packName(s.wmPack).toUpperCase())}</span></div>
        <div class="kind-line">ONE PROMPT · 30 SECONDS · AS MANY ANSWERS AS YOU CAN</div>
        <div class="wm-art">${WM.wormIcon(150)}</div>
        <div class="side-label">Prompts from:</div>
        <div class="seg wm-packs" aria-label="Prompts from">${packs.map((p) =>
          `<button class="${p.id === s.wmPack ? "on" : ""}" aria-pressed="${p.id === s.wmPack}" data-act="wm:pack:${p.id}">${esc(p.name.toUpperCase())}</button>`).join("")}</div>
        <dl class="status">${statusRows([
          ["Your best:", b ? `${b.score} points · ${b.n} ${b.n === 1 ? "answer" : "answers"}` : "—"],
          ["Best prompt:", b ? esc(WM.promptById(b.prompt) ? WM.promptById(b.prompt).q : "—") : "—"],
          ["Rounds:", rounds, true],
        ])}</dl>
        <p class="note">Type answer after answer, pressing Enter after each. A run of rare answers multiplies them: the second in a row is worth 1.5 times its points, the third twice, and every one after that 2.5 times.</p>
        <button class="fh-play" data-act="wm:play">DIG <kbd>ENTER</kbd></button>`;
    } else {
      const day = wormDay(pick), e = d.daily[day];
      const prompts = WM.dailyPrompts(day);
      const isToday = day === today;
      const answered = e ? e.picks.filter(Boolean).length : 0; // prompts done, answered or not
      let body;
      if (e && e.done) {
        const rows = prompts.map((pid, k) => {
          const pk = e.picks[k], q = (WM.promptById(pid) || { q: "" }).q;
          return `<li><span>${esc(q)}</span>${pk && pk.name ? `<strong class="t${pk.tier}">${esc(pk.name)}</strong>${tierChip(pk.tier)}<em>+${pk.pts}</em>` : `<strong class="none">no answer</strong><em>+0</em>`}</li>`;
        }).join("");
        const last = e.rounds && e.rounds[e.rounds.length - 1];
        body = `
          <ol class="wm-picks">${rows}</ol>
          <p class="note">${isToday ? "That's today's dig done. A new one comes at midnight." : "Dug."}</p>
          ${last ? `<button class="outline-btn" data-act="wm:replay">REPLAY <kbd>R</kbd></button>` : ""}`;
      } else {
        const packs = [...new Set(prompts.map((pid) => (WM.promptById(pid) || {}).pack))].map((id) => WM.packName(id));
        body = `
          <p class="wm-today">${answered ? `You're ${answered} of ${WM.DAILY_N} prompts in. Pick up where you left off: the next prompt is still a surprise.` : `Seven prompts, from ${esc(packs.join(", ").replace(/, ([^,]*)$/, " and $1"))}. You get 25 seconds for each, and one answer: make it a rare one.`}</p>
          <button class="fh-play" data-act="wm:play">${answered ? "CARRY ON DIGGING" : "DIG"} <kbd>ENTER</kbd></button>`;
      }
      main = `
        <div class="title-row"><h1>${isToday ? "DAILY DIG" : "PAST DIG"}</h1><span class="title-meta">${esc(WM.dayLabel(day, { weekday: "long", day: "numeric", month: "long" }).toUpperCase())}</span></div>
        <div class="kind-line">7 PROMPTS · 25 SECONDS EACH · ONE ANSWER EACH${isToday ? "" : " · DOESN'T COUNT FOR YOUR STREAK"}</div>
        <div class="wm-art">${WM.wormIcon(150)}</div>
        <dl class="status">${statusRows([
          ["Points:", e ? e.score : "—"],
          ["Depth:", e && e.score ? `${WM.fmtDepth(WM.metres(e.score))} · ${WM.placeAt(e.score).toLowerCase().replace(/^./, (c) => c.toUpperCase())}` : "—"],
          ["Day streak:", WM.streak(d)],
          ["Best dig:", Object.values(d.daily).reduce((m, x) => Math.max(m, x.done ? x.score : 0), 0) || "—", true],
        ])}</dl>
        ${body}`;
    }

    $("view-worm-select").innerHTML = `
      <div class="cols">
        <ul class="list col-list wm-list">${list}</ul>
        <section class="col-main">${main}</section>
        <aside class="col-side">
          <div class="rule-head">HOW IT SCORES</div>
          <dl class="status wm-legend">${statusRows(WM.TIERS.map((_, t) => [tierChip(t), `${WM.POINTS[t]} points`, t === 3]))}</dl>
          <p class="note">Any right answer counts, and close spellings do too. The rarer it is, the more it's worth. Every point digs the worm deeper: 700 reaches the centre of the Earth.</p>
          <div class="rule-head">SOUND</div>
          <div class="tl-toggles">${toggleBtn("MUSIC", s.wmMusic, "wm:music")}${toggleBtn("EFFECTS", s.wmSfx, "wm:sfx")}</div>
          <div class="side-label">How rare is rare?</div>
          <p class="note wm-credit">Each answer's rarity started from a survey of people naming things in categories (Banks &amp; Connell, 2023, CC BY 4.0) and from how often words appear in books (Google Books Ngram, CC BY 3.0), tuned by hand. Then everyone who plays on this computer adds to it: answers people here keep giving become commoner, so even your own favourites score less each time you use them.</p>
        </aside>
      </div>`;
    renderHints();
  }

  function startWorm() {
    const s = S(), d = WM.data(), pick = wormPick();
    let spec;
    if (pick === "blitz") {
      // a prompt from the pack, not one of the last few played
      const pool = WM.PROMPTS.filter((p) => s.wmPack === "mixed" || p.pack === s.wmPack).map((p) => p.id);
      const recent = d.history.filter((h) => h.mode === "blitz").slice(-Math.min(12, Math.floor(pool.length / 2))).map((h) => h.prompts[0]);
      const fresh = pool.filter((id) => !recent.includes(id));
      const from = fresh.length ? fresh : pool;
      spec = { mode: "blitz", pack: s.wmPack, prompts: [from[Math.floor(Math.random() * from.length)]] };
    } else {
      const day = wormDay(pick), e = d.daily[day];
      if (e && e.done) return;
      spec = { mode: "daily", date: day, prompts: WM.dailyPrompts(day), resume: e && e.picks.length ? { picks: e.picks.slice() } : null };
    }
    engine.stop();
    runner.stop();
    forest.stop();
    tiles.stop();
    ghostRace.stop();
    document.body.classList.remove("typing");
    show("worm");
    setPlaying(true);
    renderBar();
    wormhole.newRound(spec);
  }

  function wormAct(x, y) {
    const s = S();
    if (x === "select") return openWormSelect();
    if (x === "play") return startWorm();
    if (x === "next") return wormhole.next();
    if (x === "replay") {
      // the chosen day's dig, as last played
      const e = wormDone(), id = e && e.rounds && e.rounds[e.rounds.length - 1];
      if (id) act(`replay:${id}`);
      return;
    }
    if (x === "pick") { ui.wmPick = y; renderWormSelect(); return; }
    if (x === "pack") { s.wmPack = y; ui.wmPick = "blitz"; }
    else if (x === "music" || x === "sfx") {
      const key = x === "music" ? "wmMusic" : "wmSfx";
      s[key] = !s[key];
      TT.forestSound.setLevels();
    } else return;
    TT.save();
    if (ui.view === "worm-select") renderWormSelect();
  }

  // ---------- tiles ----------

  const tiles = TT.createTiles({
    root: $("view-tiles"),
    onStart() {
      els.statusLine.textContent = S().tilesQueue ? "Type the next tile's word and press Enter to lock it in." : "Type a column's word, then hit Enter as its tile crosses the line.";
    },
    onEnd(id) {
      setPlaying(false);
      ui.lastTilesId = id;
      els.statusLine.textContent = "Round saved. Press R to replay it.";
    },
  });

  const DIFF_HINT = {
    easy: "Three columns and words up to 6 letters, with a tile every few bars, falling slowest.",
    medium: "Three columns and words up to 7 letters, with tiles a little closer together.",
    hard: "Four columns and words up to 8 letters, a tile every couple of seconds.",
    expert: "Five columns and no longest word: a word can be as long as the time before its tile allows. A tile about every second, falling fast.",
    ludicrous: "Six columns and words of 7 letters or more, as long as the time before their tile allows. A tile about every half second, falling fastest of all. Health comes back half as fast, and mistakes cost twice as much.",
  };
  const MODE_HINT = {
    timed: "Press Enter as each tile crosses the line. Timing counts.",
    queue: "Lock in the next tile's word with Enter and type on. Each tile takes its word at the line, so only typing counts, and tiles come twice as often.",
  };
  // a song's best at a difficulty, in timed or queue mode
  const bestKey = (id, diff, queue) => `${id}:${diff}${queue ? ":queue" : ""}`;
  const tilesData = () => {
    const d = (TT.store.games.tiles ||= { best: 0, plays: 0, history: [], bestBy: {} });
    d.bestBy ||= {};
    return d;
  };
  const fmtLength = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

  // Ludicrous opens once this profile has finished a song on Expert (in either mode). The next time
  // the song screen opens it's revealed with a storm (tiles data ludicrous: "new", then "shown"), and
  // its button flashes until it's first played (ludicrousPlayed).
  const ludicrousOpen = () => !!tilesData().ludicrous;
  const tilesDiffIds = () => TT.tilesCore.DIFF_IDS.filter((id) => id !== "ludicrous" || ludicrousOpen());
  function checkLudicrous() {
    const d = tilesData();
    if (!d.ludicrous && Object.entries(d.bestBy).some(([k, b]) => b && b.cleared && /:expert(:queue)?$/.test(k))) {
      d.ludicrous = "new";
      TT.save();
    }
    return d.ludicrous === "new";
  }

  function openTilesSelect() {
    engine.stop();
    runner.stop();
    forest.stop();
    tiles.stop();
    document.body.classList.remove("typing");
    show("tiles-select");
    renderBar();
    renderTilesSelect();
    if (checkLudicrous()) ludicrousReveal();
  }

  function renderTilesSelect() {
    const s = S();
    const C = TT.tilesCore;
    const d = tilesData();
    const song = TT.songs.get(s.tilesSong) || TT.songs.get(TT.songs.list[0].id);
    if (s.tilesDiff === "ludicrous" && !ludicrousOpen()) s.tilesDiff = "expert"; // another profile's choice
    const best = (id, diff) => d.bestBy[bestKey(id, diff, s.tilesQueue)];
    const item = (x) => {
      const b = best(x.id, s.tilesDiff);
      const on = x.id === song.id;
      const tag = b ? b.grade : x.user ? `${Math.round(x.bpm)} BPM` : x.tempo;
      return `<li><button class="${on ? "on" : ""}" aria-pressed="${on}" data-act="tl:song:${x.id}">${esc(x.title)}<span class="tag">${tag}</span></button></li>`;
    };
    const mine = TT.music.list();
    const songs = TT.songs.list.map(item).join("") +
      `<li class="tl-group caps-label">YOUR MUSIC</li>` + mine.map(item).join("") +
      `<li><button class="tl-add" data-act="tl:import" ${ui.tlBusy ? "disabled" : ""}>+ ADD A SONG</button></li>`;
    const words = C.chart(song, s.tilesDiff, s.tilesQueue).length;
    const lyricCount = TT.lyrics.words(song.lyrics).length;
    const sungCount = (song.sungWords || []).length ? C.sungWords(song, s.tilesDiff, s.tilesQueue).filter(Boolean).length : 0;
    let lyricLine = "";
    if (lyricCount && !s.tilesLyrics) lyricLine = "Lyrics are off, so the words are practice words.";
    else if (sungCount) lyricLine = `The lyrics are timed: ${sungCount === words ? `all ${words} tiles fall` : `${sungCount} of the ${words} tiles fall`} as a word is sung, and get that word when it fits the difficulty. ${sungCount === words ? "Words that don't fit are" : "The rest are"} practice words.`;
    else if (lyricCount) lyricLine = `Most of the words come from the song's lyrics (${lyricCount} different words).` +
      (song.user ? " Time them with TIME LYRICS, or paste LRC lyrics with times, and each word lands on the tile where it's sung." : "");
    else if (s.tilesLyrics && C.titleWords(song.title).length) lyricLine = "A few of the words come from the title." + (song.user ? " Add lyrics with LYRICS and most of them will come from the song." : "");
    else if (song.user) lyricLine = "No lyrics yet. Add them with LYRICS and most of the words will come from the song.";
    if (lyricLine) lyricLine = `<p class="note">${lyricLine}</p>`;
    // An added song's parts for the ×4 visuals: split with the separation pack, or a link to get it.
    let partsLine = "";
    if (song.user) {
      const sp = TT.separate, st = sp.statusOf(song.id), installed = sp.state().dev || sp.state().pack.status === "installed";
      const parts = "vocals, drums, bass and other instruments";
      if (st.status === "done") partsLine = `<p class="note">Split into ${parts}, for the ×4 visuals.</p>`;
      else if (st.status === "working") partsLine = `<p class="note">Splitting into ${parts} for the ×4 visuals… ${st.percent || 0}%. You can play it meanwhile.</p>`;
      else if (st.status === "queued") partsLine = `<p class="note">Waiting to be split into ${parts} for the ×4 visuals. You can play it meanwhile.</p>`;
      else if (st.status === "failed") partsLine = `<p class="note">It couldn't be split into its parts: ${esc(st.error)}</p>`;
      else if (!installed && sp.supported()) partsLine = `<p class="note">At ×4 the visuals follow this song's ${parts}. Get the separation pack for a cleaner split.</p>
          <div class="tl-own"><button class="outline-btn" data-act="goto:music">GET THE SEPARATION PACK</button></div>`;
    }
    const rows = tilesDiffIds().map((id) => {
      const b = best(song.id, id);
      return [`${C.DIFFS[id].name[0]}${C.DIFFS[id].name.slice(1).toLowerCase()}:`, b ? `${b.grade} · ${b.score.toLocaleString()}` : "—"];
    });
    rows[rows.length - 1][2] = true;
    const toggle = (label, on, act) => `<button class="opt ${on ? "on" : ""}" aria-pressed="${on}" data-act="${act}">${label} ${on ? "ON" : "OFF"}</button>`;

    const lyricTap = ui.tap && ui.tap.mode === "lyrics" && (() => {
      const tap = ui.tap, i = tap.taps.length, w = tap.words;
      const span = (k, cls) => (k >= 0 && k < w.length ? `<span class="${cls}">${esc(w[k])}</span>` : "");
      return `
        <section class="col-main">
          <div class="title-row"><h1>TIME THE LYRICS</h1><span class="title-meta">${esc(song.title.toUpperCase())}</span></div>
          <p class="tl-blurb">Press <strong>Space</strong> or <strong>T</strong> as each word starts to be sung. <strong>Backspace</strong> takes back the last tap. You can save part way and the rest stay untimed.</p>
          <div class="tl-lyric-run" aria-live="polite">${span(i - 2, "done")}${span(i - 1, "done")}${i < w.length ? span(i, "now") : `<span class="now">ALL TIMED</span>`}${[1, 2, 3, 4, 5, 6].map((d) => span(i + d, "next")).join("")}</div>
          <div class="tl-tapcount"><span>${i}</span><span class="caps-label">OF ${w.length} WORDS TIMED</span></div>
          ${ui.tlNote ? `<p class="tl-msg" role="status">${esc(ui.tlNote)}</p>` : ""}
          <div class="tl-own">
            <button class="fh-play" data-act="tl:tapsave">SAVE <kbd>ENTER</kbd></button>
            <button class="outline-btn" data-act="tl:tapundo">UNDO <kbd>BACKSPACE</kbd></button>
            <button class="outline-btn" data-act="tl:tapcancel">CANCEL <kbd>ESC</kbd></button>
          </div>
        </section>`;
    })();
    const tapPanel = lyricTap || ui.tap && `
        <section class="col-main">
          <div class="title-row"><h1>TAP THE BEAT</h1><span class="title-meta">${esc(song.title.toUpperCase())}</span></div>
          <p class="tl-blurb">Tap <strong>Space</strong> or <strong>T</strong> on every beat while the song plays. Start on a strong beat, the "one" of a bar, and keep going for at least 8 taps. More taps make it more exact.</p>
          <div class="tl-tapcount"><span>${ui.tap.taps.length}</span><span class="caps-label">TAPS${ui.tap.bpm ? ` · ABOUT ${ui.tap.bpm} BPM` : ""}</span></div>
          ${ui.tlNote ? `<p class="tl-msg" role="status">${esc(ui.tlNote)}</p>` : ""}
          <div class="tl-own">
            <button class="fh-play" data-act="tl:tapsave">SAVE <kbd>ENTER</kbd></button>
            <button class="outline-btn" data-act="tl:tapcancel">CANCEL <kbd>ESC</kbd></button>
          </div>
        </section>`;
    const lyricsPanel = ui.lyricsEdit && song.user && `
        <section class="col-main">
          <div class="title-row"><h1>LYRICS</h1><span class="title-meta">${esc(song.title.toUpperCase())}</span></div>
          <p class="tl-blurb">Paste the song's lyrics. Tiles takes most of its words from them, the ones that fit the difficulty. LRC lyrics, with times like <span class="mono">[01:23.45]</span>, are timed straight away. They stay on this computer.</p>
          <label class="visually-hidden" for="tl-lyrics">Lyrics</label>
          <textarea id="tl-lyrics" class="tl-lyrics" rows="12" spellcheck="false">${esc(song.lyrics || "")}</textarea>
          <div class="tl-own">
            <button class="fh-play" data-act="tl:lyricssave">SAVE</button>
            <button class="outline-btn" data-act="tl:lyricsfile">OPEN .LRC FILE</button>
            <button class="outline-btn" data-act="tl:lyricscancel">CANCEL</button>
          </div>
        </section>`;
    $("view-tiles-select").innerHTML = `
      <div class="cols">
        <ul class="list col-list tl-songs">${songs}</ul>
        ${tapPanel || lyricsPanel || `<section class="col-main">
          <div class="title-row"><h1>${esc(song.title.toUpperCase())}</h1><span class="title-meta">${esc(song.composer.toUpperCase())}${song.year ? ` · ${song.year}` : ""}</span></div>
          <div class="kind-line">${song.tempo} · ${fmtLength(song.duration)}${song.user ? ` · ${Math.round(song.bpm)} BPM` : ""} · ${words} TILES</div>
          ${ui.tlNote ? `<p class="tl-msg" role="status">${esc(ui.tlNote)}</p>` : ""}
          <p class="tl-blurb">${esc(song.blurb)}</p>
          ${lyricLine}
          ${partsLine}
          ${song.user ? `<div class="tl-own">
            <button class="outline-btn" data-act="tl:lyricsedit">LYRICS</button>
            ${lyricCount ? `<button class="outline-btn" data-act="tl:timelyrics">TIME LYRICS</button>` : ""}
            <button class="outline-btn" data-act="tl:tap">TAP THE BEAT</button>
            <button class="outline-btn" data-act="tl:delete">DELETE</button>
          </div>` : ""}
          <div class="side-label">Difficulty:</div>
          <div class="seg tl-diffs" aria-label="Difficulty">${tilesDiffIds().map((id) => {
            const cls = [id === s.tilesDiff ? "on" : "", id === "ludicrous" ? `ludi${d.ludicrousPlayed ? "" : " fresh"}` : ""].join(" ").trim();
            return `<button class="${cls}" aria-pressed="${id === s.tilesDiff}" data-act="tl:diff:${id}">${C.DIFFS[id].name}</button>`;
          }).join("")}</div>
          <p class="note">${DIFF_HINT[s.tilesDiff]}${s.tilesQueue ? " In queue mode the tiles come twice as often." : ""} Long words only come when there's time to type them. The music plays at the same speed on every difficulty.</p>
          <button class="fh-play tl-play" data-act="tl:play">PLAY <kbd>ENTER</kbd></button>
        </section>`}
        <aside class="col-side">
          <div class="rule-head">MODE</div>
          <div class="seg tl-modes" aria-label="Mode">${[["timed", "TIMED"], ["queue", "QUEUE"]].map(([id, label]) => {
            const on = (id === "queue") === s.tilesQueue;
            return `<button class="${on ? "on" : ""}" aria-pressed="${on}" data-act="tl:mode:${id}">${label}</button>`;
          }).join("")}</div>
          <p class="note">${MODE_HINT[s.tilesQueue ? "queue" : "timed"]}</p>
          <div class="rule-head">SOUND</div>
          <div class="tl-toggles">${toggle("MUSIC", s.tilesMusic, "tl:music")}${toggle("METRONOME", s.tilesMetronome, "tl:metronome")}${toggle("SCOPE", s.tilesScope, "tl:scope")}${toggle("LYRICS", s.tilesLyrics, "tl:lyrics")}</div>
          <div class="rule-head">YOUR BEST${s.tilesQueue ? " · QUEUE" : ""}</div>
          <dl class="status">${statusRows(rows)}</dl>
          <div class="side-label">How to play:</div>
          <ol class="fh-rules">${s.tilesQueue ? `
            <li>Each column has a word at the bottom. Tiles fall down the columns in time with the music, higher notes further right.</li>
            <li>Type the word under the next tile's column (it has a dashed outline) and press <strong>Enter</strong> or <strong>Space</strong> to lock it in. That tile shows the word, the column gets a new one, and you type the next tile's word.</li>
            <li>Each tile takes its word as it crosses the line, so there's no timing to worry about. A tile that reaches the line with no word is a miss. You can lock in a word once its tile has appeared.</li>
            <li>Typos cost health and have to be backspaced. Lock in a mistyped or unfinished word anyway and it's a <strong>sloppy</strong> hit, worth the fewest points.</li>` : `
            <li>Each column has a word at the bottom. Tiles fall down the columns in time with the music, higher notes further right.</li>
            <li>Type a column's word, then press <strong>Enter</strong> or <strong>Space</strong> as that column's tile crosses the line. Its word then changes.</li>
            <li>Close to the line counts, and a little early gets more room than a little late. Enter on the wrong column counts as a mistake, but your typing stays. Misses and typos cost health, and a typo has to be backspaced before you can go on.</li>
            <li>Mistyped or didn't finish the word, but you're in the right column? Press Enter on time anyway: it's a <strong>sloppy</strong> hit, worth the fewest points, and it won't cost health.</li>
            <li>Seven <strong>perfect</strong> hits in a row start a perfect streak: every hit is worth 1.5 times the points, and fills the combo 1.5 times as fast, until one isn't perfect. While it lasts the colours fade, so only the columns tell the words apart.</li>`}
          </ol>
        </aside>
      </div>`;
  }

  async function saveLyrics() {
    const s = S();
    const t = $("tl-lyrics");
    if (!t) return;
    const ok = await TT.music.setLyrics(s.tilesSong, t.value);
    ui.lyricsEdit = false;
    const n = TT.lyrics.words(t.value).length;
    ui.tlNote = !ok ? "The lyrics couldn't be saved." : n ? `Lyrics saved: ${n} different words.` : "Lyrics cleared.";
    renderTilesSelect();
  }

  async function startTiles() {
    const s = S();
    const song = TT.songs.get(s.tilesSong);
    if (!song) return;
    // An added song's audio is loaded from disk the first time it's played.
    if (song.user && s.tilesMusic && !song.buffer) {
      els.statusLine.textContent = "Loading the song…";
      try {
        await TT.music.buffer(song.id);
      } catch (err) {
        ui.tlNote = err.message;
        openTilesSelect();
        return;
      }
    }
    // its separated parts for the ×4 visuals, if it has them (otherwise the quick split)
    if (song.user && s.tilesMusic) {
      try {
        song.stems = await TT.separate.stemsFor(song.id);
      } catch {
        song.stems = null;
      }
    }
    engine.stop();
    runner.stop();
    forest.stop();
    document.body.classList.remove("typing");
    if (s.tilesDiff === "ludicrous" && !ludicrousOpen()) s.tilesDiff = "expert";
    if (s.tilesDiff === "ludicrous" && !tilesData().ludicrousPlayed) {
      tilesData().ludicrousPlayed = true; // its button stops flashing
      TT.save();
    }
    show("tiles");
    setPlaying(true);
    renderBar();
    tiles.newGame(s.tilesSong, s.tilesDiff, { music: s.tilesMusic, metronome: s.tilesMetronome, scope: s.tilesScope, lyrics: s.tilesLyrics, queue: s.tilesQueue });
  }

  // ---------- Ludicrous: the reveal ----------

  // Lightning across the screen while it flashes white and black (three flashes, the most that's
  // safe in a second) and the app turns black and white, with thunder; then a note that Ludicrous
  // is open. With reduced motion: one soft flash, no bolts.
  const LUDI_BOLTS = [0, 180, 520]; // ms: each bolt, with a white flash and then a black one
  function ludicrousReveal() {
    const d = tilesData();
    d.ludicrous = "shown";
    TT.save();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = window.devicePixelRatio || 1;
    const storm = document.createElement("div");
    storm.className = "ludi-storm";
    storm.setAttribute("aria-hidden", "true");
    const cv = document.createElement("canvas");
    storm.append(cv);
    document.body.append(storm);
    document.documentElement.classList.add("ludi-bw");
    const w = (cv.width = Math.round(innerWidth * dpr)), h = (cv.height = Math.round(innerHeight * dpr));
    const c = cv.getContext("2d");
    const bolts = reduce ? [] : [lightning(w, h, false), lightning(w, h, false), lightning(w, h, true)];
    ui.ludi = { storm, pop: null };
    TT.tilesAudio.thunder(reduce ? [0] : LUDI_BOLTS.map((t) => t / 1000));
    const t0 = performance.now();
    const step = () => {
      if (!ui.ludi) return;
      const t = performance.now() - t0;
      let flash = "";
      if (reduce) flash = t < 300 ? "soft" : "";
      else for (const at of LUDI_BOLTS) {
        if (t >= at && t < at + 90) flash = "white";
        else if (t >= at + 110 && t < at + 190) flash = "black";
      }
      storm.dataset.flash = flash;
      c.clearRect(0, 0, w, h);
      LUDI_BOLTS.forEach((at, i) => {
        const age = t - at;
        if (bolts[i] && age >= 0 && age < 280) drawLightning(c, bolts[i], 1 - age / 280, dpr);
      });
      if (t < 1000) requestAnimationFrame(step);
      else ludicrousNote();
    };
    requestAnimationFrame(step);
    // the note comes up even if the window was hidden (and its frames held back) meanwhile
    setTimeout(() => {
      if (!ui.ludi || ui.ludi.pop) return;
      storm.dataset.flash = "";
      c.clearRect(0, 0, w, h);
      ludicrousNote();
    }, 1300);
  }

  // A jagged bolt from the top down (or right across the screen), with a few forks.
  function lightning(w, h, across) {
    const jag = (a, b, depth, rough) => {
      let pts = [a, b];
      let disp = Math.hypot(b[0] - a[0], b[1] - a[1]) * rough;
      for (let k = 0; k < depth; k++) {
        const next = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const [px, py] = pts[i - 1], [qx, qy] = pts[i];
          const L = Math.hypot(qx - px, qy - py) || 1, o = (Math.random() - 0.5) * disp;
          next.push([(px + qx) / 2 - ((qy - py) / L) * o, (py + qy) / 2 + ((qx - px) / L) * o], pts[i]);
        }
        pts = next;
        disp /= 2;
      }
      return pts;
    };
    const a = across ? [0, h * (0.1 + Math.random() * 0.2)] : [w * (0.15 + Math.random() * 0.7), 0];
    const b = across ? [w, h * (0.55 + Math.random() * 0.35)] : [a[0] + (Math.random() - 0.5) * w * 0.4, h];
    const main = jag(a, b, 7, 0.2);
    const forks = [];
    for (let i = 0; i < 4; i++) {
      const from = main[Math.floor(main.length * (0.2 + Math.random() * 0.6))];
      const len = Math.min(w, h) * (0.15 + Math.random() * 0.2);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.5);
      forks.push(jag(from, [from[0] + Math.cos(ang) * len, from[1] + Math.sin(ang) * len], 5, 0.25));
    }
    return { main, forks };
  }
  function drawLightning(c, bolt, a, dpr) {
    const line = (pts, width, style) => {
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.lineWidth = width * dpr;
      c.strokeStyle = style;
      c.stroke();
    };
    c.save();
    c.lineJoin = c.lineCap = "round";
    c.shadowColor = "rgba(190, 210, 255, 0.9)";
    c.shadowBlur = 28 * dpr;
    line(bolt.main, 16, `rgba(170, 195, 255, ${a * 0.35})`);
    for (const f of bolt.forks) line(f, 5, `rgba(200, 215, 255, ${a * 0.5})`);
    c.shadowBlur = 10 * dpr;
    line(bolt.main, 3.5, `rgba(255, 255, 255, ${a})`);
    for (const f of bolt.forks) line(f, 1.5, `rgba(255, 255, 255, ${a * 0.85})`);
    c.restore();
  }

  function ludicrousNote() {
    if (!ui.ludi || ui.ludi.pop) return;
    const pop = document.createElement("div");
    pop.className = "ludi-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-modal", "true");
    pop.setAttribute("aria-labelledby", "ludi-title");
    pop.innerHTML = `
      <svg class="ludi-icon" viewBox="0 0 24 32" aria-hidden="true"><path d="M14 1 3 18h7l-3 13 13-19h-7l3-11z"/></svg>
      <div class="caps-label">NEW DIFFICULTY UNLOCKED</div>
      <h2 id="ludi-title">LUDICROUS</h2>
      <p>Your skills are impressive. You may be considered an expert, but there's something even… <em>crazier</em>.</p>
      <p class="note">Tiles come twice as fast as on Expert, across six columns, with words of 7 letters or more. Health comes back half as fast, and mistakes cost twice as much.</p>
      <button class="fh-play" type="button">BRING IT ON <kbd>ENTER</kbd></button>`;
    document.body.append(pop);
    ui.ludi.pop = pop;
    ui.ludi.storm.dataset.flash = "dim"; // the screen darkens behind the note
    const btn = pop.querySelector("button");
    btn.addEventListener("click", closeLudicrous);
    btn.focus();
  }
  function closeLudicrous() {
    if (!ui.ludi) return;
    ui.ludi.storm.remove();
    if (ui.ludi.pop) ui.ludi.pop.remove();
    ui.ludi = null;
    document.documentElement.classList.remove("ludi-bw");
    if (ui.view === "tiles-select") renderTilesSelect();
  }

  // ---- your own music ----

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac";
  fileInput.hidden = true;
  document.body.appendChild(fileInput);
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    const refresh = () => { if (ui.view === "tiles-select") renderTilesSelect(); };
    ui.tlBusy = true;
    try {
      const id = await TT.music.importFile(file, (text) => { ui.tlNote = text; refresh(); });
      S().tilesSong = id;
      TT.save();
      const song = TT.songs.get(id);
      const found = TT.lyrics.words(song.lyrics).length;
      ui.tlNote = `Added "${song.title}". Its beat is about ${Math.round(song.bpm)} BPM.` +
        (found ? ` Its lyrics were in the file: ${found} different words.` : " No lyrics were in the file; add them with LYRICS if you like.");
    } catch (err) {
      ui.tlNote = err.message;
    }
    ui.tlBusy = false;
    refresh();
  });

  // An .lrc (or text) file of lyrics, opened into the lyrics editor.
  const lrcInput = document.createElement("input");
  lrcInput.type = "file";
  lrcInput.accept = ".lrc,.txt,text/plain";
  lrcInput.hidden = true;
  document.body.appendChild(lrcInput);
  lrcInput.addEventListener("change", async () => {
    const file = lrcInput.files[0];
    lrcInput.value = "";
    const t = $("tl-lyrics");
    if (!file || !t) return;
    if (file.size > 512 * 1024) { ui.tlNote = "That file is too big for lyrics."; renderTilesSelect(); return; }
    t.value = await file.text();
    t.focus();
  });

  // Tapping along: mode "beat" finds the beat; mode "lyrics" times each lyric word as it's sung.
  async function startTap(mode = "beat") {
    const song = TT.songs.get(S().tilesSong);
    if (!song || !song.user) return;
    ui.lyricsEdit = false;
    ui.tlNote = "Loading the song…";
    ui.tap = { mode, id: song.id, taps: [], bpm: 0, src: null, zeroPerf: 0, words: mode === "lyrics" ? TT.lyrics.sequence(song.lyrics) : [] };
    renderTilesSelect();
    let buffer;
    try {
      buffer = await TT.music.buffer(song.id);
    } catch (err) {
      ui.tap = null;
      ui.tlNote = err.message;
      renderTilesSelect();
      return;
    }
    if (!ui.tap) return; // cancelled while loading
    const ctx = TT.tilesAudio.get();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const lead = 0.25;
    const lat = ctx.outputLatency || ctx.baseLatency || 0;
    src.start(ctx.currentTime + lead);
    // when the start of the song is heard, on the performance.now() clock (taps use the same clock)
    ui.tap.zeroPerf = performance.now() + (lead + lat) * 1000;
    ui.tap.src = src;
    ui.tlNote = "";
    renderTilesSelect();
  }

  function stopTap() {
    if (!ui.tap) return;
    try { if (ui.tap.src) ui.tap.src.stop(); } catch {}
    ui.tap = null;
  }

  function tapBeat(stamp) {
    const tap = ui.tap;
    if (!tap || !tap.src) return;
    const t = (stamp - tap.zeroPerf) / 1000;
    if (t < 0) return;
    if (tap.mode === "lyrics") {
      if (tap.taps.length < tap.words.length) tap.taps.push({ t, w: tap.words[tap.taps.length] });
      renderTilesSelect();
      return;
    }
    tap.taps.push(t);
    const gaps = tap.taps.slice(1).map((v, i) => v - tap.taps[i]).filter((g) => g > 0.2 && g < 2).sort((a, b) => a - b);
    tap.bpm = gaps.length >= 3 ? Math.round(60 / gaps[Math.floor(gaps.length / 2)]) : 0;
    renderTilesSelect();
  }

  async function saveTap() {
    const tap = ui.tap;
    if (!tap) return;
    if (tap.mode === "lyrics") {
      if (tap.taps.length < 4) {
        ui.tlNote = `Time at least 4 words first (${tap.taps.length} so far).`;
        renderTilesSelect();
        return;
      }
      const ok = await TT.music.setLyricTimes(tap.id, tap.taps);
      stopTap();
      ui.tlNote = ok ? `Lyric times saved: ${tap.taps.length} words timed.` : "The lyric times couldn't be saved.";
      renderTilesSelect();
      return;
    }
    if (tap.taps.length < 8) {
      ui.tlNote = `Tap at least 8 beats first (${tap.taps.length} so far).`;
      renderTilesSelect();
      return;
    }
    const ok = await TT.music.setTaps(tap.id, tap.taps);
    stopTap();
    const song = TT.songs.get(tap.id);
    ui.tlNote = ok ? `Beat saved: about ${Math.round(song.bpm)} BPM.` : "Those taps were too uneven to use. Try again, tapping on every beat.";
    renderTilesSelect();
  }

  async function deleteSong() {
    const song = TT.songs.get(S().tilesSong);
    if (!song || !song.user) return;
    if (!confirm(`Remove "${song.title}" from Tiles? Its scores stay in your history.`)) return;
    await TT.music.remove(song.id);
    S().tilesSong = TT.songs.list[0].id;
    TT.save();
    ui.tlNote = `Removed "${song.title}".`;
    renderTilesSelect();
  }

  function tilesAct(x, y) {
    const s = S();
    const ids = [...TT.songs.list, ...TT.music.list()].map((z) => z.id);
    const diffs = tilesDiffIds();
    if (x === "select") { tiles.stop(); openTilesSelect(); return; }
    if (x === "play") { if (!ui.tap) startTiles(); return; }
    if (x === "import") { if (!ui.tlBusy) fileInput.click(); return; }
    if (x === "tap") { startTap(); return; }
    if (x === "lyricsedit") { ui.lyricsEdit = true; ui.tlNote = ""; renderTilesSelect(); const t = $("tl-lyrics"); if (t) t.focus(); return; }
    if (x === "lyricscancel") { ui.lyricsEdit = false; renderTilesSelect(); return; }
    if (x === "lyricssave") { saveLyrics(); return; }
    if (x === "lyricsfile") { lrcInput.click(); return; }
    if (x === "timelyrics") { startTap("lyrics"); return; }
    if (x === "tapundo") { if (ui.tap && ui.tap.mode === "lyrics" && ui.tap.taps.length) { ui.tap.taps.pop(); renderTilesSelect(); } return; }
    if (x === "tapsave") { saveTap(); return; }
    if (x === "tapcancel") { stopTap(); ui.tlNote = ""; renderTilesSelect(); return; }
    if (x === "delete") { deleteSong(); return; }
    if (ui.tap) return; // the rest waits until tapping is done
    ui.tlNote = "";
    if (x === "song" || x === "next" || x === "prev") ui.lyricsEdit = false; // another song: close its lyrics editor
    if (x === "song") s.tilesSong = y;
    else if (x === "next" || x === "prev") s.tilesSong = ids[(ids.indexOf(s.tilesSong) + (x === "next" ? 1 : -1) + ids.length) % ids.length];
    else if (x === "diff") { if (diffs.includes(y)) s.tilesDiff = y; }
    else if (x === "harder" || x === "easier") s.tilesDiff = diffs[Math.max(0, Math.min(diffs.length - 1, diffs.indexOf(s.tilesDiff) + (x === "harder" ? 1 : -1)))];
    else if (x === "music") s.tilesMusic = !s.tilesMusic;
    else if (x === "metronome") s.tilesMetronome = !s.tilesMetronome;
    else if (x === "scope") s.tilesScope = !s.tilesScope;
    else if (x === "lyrics") s.tilesLyrics = !s.tilesLyrics;
    else if (x === "mode") s.tilesQueue = y === "toggle" ? !s.tilesQueue : y === "queue";
    else return;
    TT.save();
    if (ui.view === "tiles-select") renderTilesSelect();
  }

  // ---------- replay ----------

  const rp = { rec: null, a: null, T: 0, playing: false, speed: 1, raf: 0, last: 0, returnTo: "results", player: null };
  const SPEEDS = [0.5, 1, 2, 4];
  const fmtSec = (ms) => `${(ms / 1000).toFixed(1)}s`;

  async function openReplay(id, returnTo) {
    const rec = await TT.rounds.get(id);
    if (!rec) {
      els.statusLine.textContent = "No recording for that round (rounds are recorded from v1.1 on).";
      return;
    }
    engine.stop();
    runner.stop();
    tiles.stop();
    ghostRace.stop();
    wormhole.stop();
    document.body.classList.remove("typing");
    Object.assign(rp, { rec, a: TT.review.analyze(rec), T: 0, playing: false, returnTo });
    show("replay");
    renderBar();
    renderReplayScreen();
    seekReplay(0);
  }

  function renderReplayScreen() {
    const { rec, a } = rp;
    // a Ghost Race run replays like a speed test: it's the same typing
    const game = rec.kind === "game" && rec.game !== "ghost";
    const fmtDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const R = TT.review;
    const cons = R.consistency(a.gaps);
    const avgGap = a.gaps.length ? a.gaps.reduce((s, x) => s + x, 0) / a.gaps.length : 0;
    const confusions = R.topConfusions(a.confusions, 6);
    const slow = R.ranked(a.keyTimes).slice(0, 5);
    const spaceBad = a.spaces.filter((s) => !s.ok).length;
    const fixed = a.backs.filter((b) => b.fixedError).length;
    const moments = R.moments(a);
    const list = (items, fn, none) => (items.length ? `<dl class="status mono">${items.map(fn).join("")}</dl>` : `<p class="muted rp-none">${none}</p>`);

    $("view-replay").innerHTML = `
      <div class="cols">
        <section class="col-main">
          <div class="title-row"><h1>REPLAY</h1><span class="title-meta">${testName(rec.kind, rec.mode, rec.amount, rec.game, rec.title, rec.queue).toUpperCase()}</span></div>
          <div class="kind-line">${fmtDate.format(new Date(rec.date))}</div>
          <div id="rp-stage" class="rp-stage">${game ? "" : `
            <div class="live"><span id="rp-live-num" class="live-num"></span><span id="rp-live-label" class="caps-label"></span></div>
            <div id="rp-words-box" class="words-box"><div id="rp-words" class="words"></div></div>`}
          </div>
          <div class="rp-controls">
            <button id="rp-play" class="outline-btn" data-act="rp:toggle">PLAY</button>
            <input id="rp-scrub" type="range" min="0" max="${rec.duration}" step="10" value="0" aria-label="Replay position">
            <span id="rp-time" class="rp-time"></span>
            <div class="seg" aria-label="Playback speed">${SPEEDS.map((s) =>
              `<button class="${s === rp.speed ? "on" : ""}" aria-pressed="${s === rp.speed}" data-act="rp:speed:${s}">${s}×</button>`).join("")}</div>
          </div>
        </section>
        <aside class="col-side rp-side">
          <div class="rule-head">AT THIS MOMENT</div>
          <dl id="rp-now" class="status"></dl>
          <div class="rule-head">WHOLE ROUND</div>
          <dl class="status">${statusRows([
            ["Avg time per key:", `${Math.round(avgGap)} ms`],
            ["Rhythm consistency:", cons ? `${Math.round(cons.pct)}%` : "—"],
            // before games kept wrong letters typed, their Backspaces couldn't fix a typo
            [game && !a.typedErrors ? "Backspaces:" : "Backspaces (fixed typos):", game && !a.typedErrors ? a.backs.length : `${a.backs.length} (${fixed})`],
            ...(rec.game === "tiles" ? [["Timing (average):", a.final.counts.M < a.final.judged ? `${a.final.avg > 0 ? "+" : ""}${Math.round(a.final.avg)} ms` : "—"], ["Missed tiles:", a.final.counts.M]]
              : rec.game === "worm" ? [["Answers:", a.final.answers], ["Not on the list:", a.final.wrong]]
              : game ? [["Slowest step:", a.steps.length ? fmtSec(Math.max(...a.steps.map((s) => s.ms))) : "—"]] : [["Space errors:", spaceBad]]),
            ["Pauses over 1s:", a.hesitations.length, true],
          ])}</dl>
          <div class="side-label">Wrong keys (expected → pressed):</div>
          ${list(confusions, (c) => `<div><dt>${esc(c.expected)} → ${esc(c.typed)}</dt><dd>×${c.n}</dd></div>`, "None.")}
          <div class="side-label">Slowest keys:</div>
          ${list(slow, (k) => `<div><dt>${esc(k.key)}</dt><dd>${Math.round(k.avg)} ms</dd></div>`, "Not enough keys yet.")}
          <div class="side-label">Moments:</div>
          ${moments.length ? `<ol class="moments">${moments.map((m) =>
            `<li><button data-act="rp:seek:${Math.max(0, m.t - 600)}" data-kind="${m.kind}"><span class="m-time">${fmtSec(m.t)}</span>${esc(m.text)}</button></li>`).join("")}</ol>`
            : `<p class="muted rp-none">A clean round: no mistakes, backspaces or long pauses.</p>`}
        </aside>
      </div>`;

    if (rec.game === "forest") {
      $("rp-stage").classList.add("rp-forest");
      rp.player = TT.createForest({ root: $("rp-stage"), replayOnly: true });
    } else if (rec.game === "tiles") {
      $("rp-stage").classList.add("rp-tiles");
      rp.player = TT.createTiles({ root: $("rp-stage"), replayOnly: true });
    } else if (rec.game === "worm") {
      $("rp-stage").classList.add("rp-worm");
      rp.player = TT.createWormhole({ root: $("rp-stage"), replayOnly: true });
    } else if (game) {
      rp.player = TT.createPathRunner({ root: $("rp-stage"), replayOnly: true });
    } else {
      rp.player = TT.createTyping({ box: $("rp-words-box"), wordsEl: $("rp-words") });
    }
    rp.player.loadReplay(rec);
    $("rp-scrub").addEventListener("input", (e) => {
      pauseReplay();
      seekReplay(Number(e.target.value));
    });
  }

  function seekReplay(T) {
    const { rec } = rp;
    rp.T = Math.max(0, Math.min(rec.duration, T));
    const state = rp.player.replayTo(rp.T);
    $("rp-scrub").value = rp.T;
    $("rp-time").textContent = `${fmtSec(rp.T)} / ${fmtSec(rec.duration)}`;

    let rows;
    // Speeds over a fraction of a second are meaningless, so they appear after the first second.
    const speed = (x) => (rp.T < 1000 && rec.duration >= 1000 ? "—" : Math.round(x));
    if (rec.game === "tiles") {
      const st = TT.tilesCore.gameStats(state, Math.max(rp.T, 1));
      rows = [["Score:", state.score.toLocaleString()], ["Combo:", state.combo], ["WPM:", speed(st.wpm)], ["Accuracy:", `${Math.round(st.acc)}%`], ["Missed tiles:", state.counts.M, true]];
    } else if (rec.game === "forest") {
      const F = TT.forestCore;
      const st = F.gameStats(state, Math.max(rp.T, 1));
      rows = [["Steps:", F.score(state)], ["WPM:", speed(st.wpm)], ["Accuracy:", `${Math.round(st.acc)}%`], ["Mistakes:", state.mistakes, true]];
    } else if (rec.game === "worm") {
      const p = WM.ptsAt(state, rp.T);
      rows = [["Points:", Math.round(p)], ["Depth:", WM.fmtDepth(WM.metres(p)).toLowerCase()],
        ["Answers:", state.finds.filter((f) => f.d > 0 && f.t <= rp.T).length],
        [state.mode === "daily" ? "Prompt:" : "Rare run:", state.mode === "daily" ? `${Math.max(1, state.i + 1)} of ${state.prompts.length}` : state.streak, true]];
    } else if (rec.kind === "game" && rec.game !== "ghost") {
      const st = TT.pathCore.gameStats(state, Math.max(rp.T, 1));
      rows = [["Steps:", state.n], ["WPM:", speed(st.wpm)], ["Accuracy:", `${Math.round(st.acc)}%`], ["Mistakes:", state.mistakes, true]];
    } else {
      const st = TT.typingCore.computeStats(state, Math.max(rp.T, 1));
      rows = [["WPM:", speed(st.wpm)], ["Raw WPM:", speed(st.raw)], ["Accuracy:", `${Math.round(st.acc)}%`], ["Words typed:", state.index, true]];
      if (rec.mode === "time") {
        $("rp-live-num").textContent = Math.max(0, Math.ceil(rec.amount - rp.T / 1000));
        $("rp-live-label").textContent = "SECONDS LEFT";
      } else {
        $("rp-live-num").textContent = `${state.index}/${rec.amount}`;
        $("rp-live-label").textContent = "WORDS";
      }
    }
    $("rp-now").innerHTML = statusRows(rows);
  }

  function playReplay() {
    if (rp.T >= rp.rec.duration) seekReplay(0);
    rp.playing = true;
    rp.last = performance.now();
    $("rp-play").textContent = "PAUSE";
    const frame = (now) => {
      if (!rp.playing) return;
      seekReplay(rp.T + (now - rp.last) * rp.speed);
      rp.last = now;
      if (rp.T >= rp.rec.duration) return pauseReplay();
      rp.raf = requestAnimationFrame(frame);
    };
    rp.raf = requestAnimationFrame(frame);
  }

  function pauseReplay() {
    rp.playing = false;
    cancelAnimationFrame(rp.raf);
    const btn = $("rp-play");
    if (btn) btn.textContent = rp.rec && rp.T >= rp.rec.duration ? "REPLAY" : "PLAY";
  }

  function replayAct(x, y) {
    if (x === "toggle") rp.playing ? pauseReplay() : playReplay();
    else if (x === "seek") { pauseReplay(); seekReplay(Number(y)); }
    else if (x === "skip") seekReplay(rp.T + Number(y));
    else if (x === "speed") {
      rp.speed = Number(y);
      for (const b of document.querySelectorAll("#view-replay [data-act^='rp:speed']")) {
        const on = b.dataset.act === `rp:speed:${y}`;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on);
      }
    } else if (x === "back") {
      pauseReplay();
      if (rp.returnTo === "stats") openMenu("stats");
      else show(rp.returnTo);
      if (rp.returnTo !== "stats") renderBar();
    }
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

  // ---------- leaderboard ----------
  // Everyone on this computer, ranked by their best in each game. The game pages and Stats show only
  // the active profile; this compares them all.
  const LB_GAMES = [["forest", "Forest Hop"], ["tiles", "Tiles"], ["ghost", "Ghost Race"], ["worm", "Wormhole"], ["path", "Path Runner"]];

  function renderLeaderboard() {
    const s = S();
    const tab = LB_GAMES.some(([id]) => id === ui.lbTab) ? ui.lbTab : "forest";
    const me = TT.profiles.activeId();
    const players = TT.profiles.list().map((p) => ({ name: p.name, you: p.id === me, games: TT.profiles.games(p.id) || {} }));
    const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
    const date = (iso) => (iso ? day.format(new Date(iso)) : "—");
    let head, rows, filters = "", what;

    if (tab === "tiles") {
      const songs = [...TT.songs.list, ...TT.music.list()];
      const song = songs.find((x) => x.id === (ui.lbSong || s.tilesSong)) || songs[0];
      const diff = tilesDiffIds().includes(ui.lbDiff) ? ui.lbDiff : tilesDiffIds().includes(s.tilesDiff) ? s.tilesDiff : "medium";
      const queue = ui.lbQueue ?? s.tilesQueue;
      const key = bestKey(song.id, diff, queue);
      const btn = (label, on, act) => `<button class="${on ? "on" : ""}" aria-pressed="${on}" data-act="${act}">${esc(label)}</button>`;
      filters = `<div class="lb-filters">
          <div class="seg lb-songs" aria-label="Song">${songs.map((x) => btn(x.title, x.id === song.id, `lb:song:${x.id}`)).join("")}</div>
          <div class="seg" aria-label="Difficulty">${tilesDiffIds().map((d) => btn(TT.tilesCore.DIFFS[d].name, d === diff, `lb:diff:${d}`)).join("")}</div>
          <div class="seg" aria-label="Mode">${btn("TIMED", !queue, "lb:mode:timed")}${btn("QUEUE", queue, "lb:mode:queue")}</div>
        </div>`;
      what = `${song.title}, ${TT.tilesCore.DIFFS[diff].name.toLowerCase()}${queue ? ", queue" : ""}`;
      head = ["SCORE", "GRADE", "WPM", "ACCURACY", "CLEARED"];
      rows = players.map((p) => {
        const b = p.games.tiles && p.games.tiles.bestBy && p.games.tiles.bestBy[key];
        return b && { p, best: b.score, cells: [b.score.toLocaleString(), b.grade, Math.round(b.wpm), `${Math.round(b.acc)}%`, b.cleared ? "Yes" : "No"] };
      });
    } else if (tab === "ghost") {
      // fastest first, per track
      const G = TT.ghostCore;
      const tr = G.track(ui.lbTrack || s.grTrack);
      const btn = (label, on, act) => `<button class="${on ? "on" : ""}" aria-pressed="${on}" data-act="${act}">${esc(label)}</button>`;
      filters = `<div class="lb-filters"><div class="seg" aria-label="Track">${G.TRACKS.map((x) => btn(x.name.toUpperCase(), x.id === tr.id, `lb:track:${x.id}`)).join("")}</div></div>`;
      what = `Ghost Race, ${tr.name}`;
      head = ["TIME", "WPM", "ACCURACY", "RACES", "DATE"];
      rows = players.map((p) => {
        const d = p.games.ghost, b = d && d.bestBy && d.bestBy[tr.id];
        if (!b) return null;
        const races = (d.history || []).filter((h) => h.track === tr.id).length;
        return { p, best: -b.time, cells: [`${G.clock(b.time)}s`, Math.round(b.wpm), `${Math.round(b.acc)}%`, races, date(b.date)] };
      });
    } else if (tab === "worm") {
      // today's Daily Dig, everyone's best dig, or the best Blitz from a pack
      const which = ["today", "best", "blitz"].includes(ui.lbWorm) ? ui.lbWorm : "today";
      const pack = ui.lbPack || s.wmPack;
      const btn = (label, on, act) => `<button class="${on ? "on" : ""}" aria-pressed="${on}" data-act="${act}">${esc(label)}</button>`;
      filters = `<div class="lb-filters">
          <div class="seg" aria-label="Which">${btn("TODAY'S DIG", which === "today", "lb:worm:today")}${btn("BEST DIG", which === "best", "lb:worm:best")}${btn("BLITZ", which === "blitz", "lb:worm:blitz")}</div>
          ${which === "blitz" ? `<div class="seg" aria-label="Prompts from">${[{ id: "mixed", name: "Mixed" }, ...WM.PACKS].map((x) => btn(x.name.toUpperCase(), x.id === pack, `lb:pack:${x.id}`)).join("")}</div>` : ""}
        </div>`;
      const depth = (pts) => WM.fmtDepth(WM.metres(pts)).toLowerCase();
      const rarest = (picks) => {
        const x = (picks || []).filter((k) => k && k.name).sort((a, b) => b.tier - a.tier || b.pts - a.pts)[0];
        return x ? x.name : "—";
      };
      if (which === "blitz") {
        what = `Wormhole Blitz, ${WM.packName(pack)}`;
        head = ["POINTS", "ANSWERS", "PROMPT", "DATE"];
        rows = players.map((p) => {
          const b = p.games.worm && p.games.worm.blitz && p.games.worm.blitz[pack];
          const q = b && WM.promptById(b.prompt);
          return b && { p, best: b.score, cells: [b.score, b.n, q ? q.q.replace(/^Name /, "") : "—", date(b.date)] };
        });
      } else if (which === "best") {
        what = "Wormhole, best Daily Dig";
        head = ["POINTS", "DEPTH", "RAREST", "DAY"];
        rows = players.map((p) => {
          const daily = (p.games.worm && p.games.worm.daily) || {};
          const [day, e] = Object.entries(daily).filter(([, x]) => x.done).sort((a, b) => b[1].score - a[1].score)[0] || [];
          return e && { p, best: e.score, cells: [e.score, depth(e.score), rarest(e.picks), WM.dayLabel(day, { day: "numeric", month: "short", year: "numeric" })] };
        });
      } else {
        const today = WM.dayKey();
        what = `Wormhole, Daily Dig for ${WM.dayLabel(today, { weekday: "long", day: "numeric", month: "long" })}`;
        head = ["POINTS", "DEPTH", "RAREST", "ANSWERED"];
        rows = players.map((p) => {
          const e = p.games.worm && p.games.worm.daily && p.games.worm.daily[today];
          return e && { p, best: e.score, cells: [e.score, depth(e.score), rarest(e.picks), `${e.picks.filter((k) => k && k.name).length} of ${WM.DAILY_N}`] };
        });
      }
    } else {
      what = tab === "forest" ? "Forest Hop, steps in one run" : "Path Runner, steps in one run";
      head = tab === "forest" ? ["BEST STEPS", "ANIMAL", "WPM", "ACCURACY", "PLAYS", "DATE"] : ["BEST STEPS", "WPM", "ACCURACY", "PLAYS", "DATE"];
      rows = players.map((p) => {
        const d = p.games[tab];
        if (!d || !d.best) return null;
        // the run that set the best, if it's still in the kept history
        const run = (d.history || []).find((h) => h.score === d.best);
        const cells = [d.best, run ? Math.round(run.wpm) : "—", run ? `${Math.round(run.acc)}%` : "—", d.plays || (d.history || []).length, date(run && run.date)];
        if (tab === "forest") cells.splice(1, 0, run && run.animal ? run.animal[0].toUpperCase() + run.animal.slice(1) : "—");
        return { p, best: d.best, cells };
      });
    }
    rows = rows.filter(Boolean).sort((a, b) => b.best - a.best);
    const mine = rows.findIndex((r) => r.p.you);

    const table = rows.length
      ? `<table class="table lb-table"><thead><tr><th>#</th><th>PLAYER</th>${head.map((h) => `<th class="num">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r, i) =>
          `<tr class="${r.p.you ? "lb-you" : ""}"><td class="num">${i + 1}</td><td>${esc(r.p.name)}${r.p.you ? ` <span class="tag">YOU</span>` : ""}</td>${r.cells.map((c) => `<td class="num">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
      : `<p class="muted">Nobody has played this yet.</p>`;

    $("view-leaderboard").innerHTML = subtabs(LB_GAMES, tab, "lb:tab") + `
      <div class="cols">
        <section class="col-main">
          <div class="title-row"><h1>LEADERBOARD</h1><span class="title-meta">${esc(what.toUpperCase())}</span></div>
          ${filters}
          ${table}
        </section>
        <aside class="col-side">
          <div class="rule-head">YOU</div>
          <dl class="status">${statusRows([
            ["Player:", TT.profiles.active().name],
            ["Rank:", mine >= 0 ? `${mine + 1} of ${rows.length}` : "Not ranked yet"],
            ["Players on this computer:", players.length, true],
          ])}</dl>
          <p class="note">${players.length < 2
            ? "Only one profile so far. Add more in Settings → Profiles, and everyone who plays on this computer is ranked here."
            : "Everyone who plays on this computer is ranked here by their best. The game pages show only your own."}</p>
        </aside>
      </div>`;
  }

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
        <thead><tr><th>DATE</th><th>TEST</th><th class="num">WPM</th><th class="num">ACCURACY</th><th class="num">RAW</th><th class="num">REPLAY</th></tr></thead>
        <tbody>${rows.map((h) => `<tr>
          <td>${fmt.format(new Date(h.date))}</td>
          <td>${testName(h.kind || "test", h.mode, h.amount, h.game, h.title, h.queue)}</td>
          <td class="num"><strong>${Math.round(h.wpm)}</strong></td>
          <td class="num">${Math.round(h.acc)}%</td>
          <td class="num">${Math.round(h.raw)}</td>
          <td class="num">${h.id ? `<button class="opt outline sm" data-act="replay:${h.id}" aria-label="Replay this round">▶</button>` : `<span class="muted">—</span>`}</td>
        </tr>`).join("")}</tbody>
      </table>
      <p class="caps-label foot-caption">ROUNDS ARE RECORDED FROM v1.1 ON. OLDER ROUNDS CAN'T BE REPLAYED.</p>`;
    },

    // Filled in asynchronously from the recordings (see renderKeystrokes).
    keystrokes: () => `<p class="note">Analyzing recordings…</p>`,
  };

  // Keystroke stats come from re-analyzing recent recordings, weighted toward recent rounds.
  let keystrokeToken = 0;
  async function renderKeystrokes() {
    const token = ++keystrokeToken;
    const recs = await TT.rounds.recent(150);
    if (token !== keystrokeToken || ui.view !== "stats" || ui.statsTab !== "keystrokes") return;
    const body = $("stats-body");
    if (!recs.length) {
      body.innerHTML = empty("No recordings yet", "Every test, practice round and game is recorded from v1.1 on. Finish one and its keystrokes will be analyzed here.");
      return;
    }
    const R = TT.review;
    const weights = recs.map((_, i) => Math.pow(0.5, i / A.HALF_LIFE));
    const all = R.combine(recs.map(R.analyze), weights);
    const conf = R.topConfusions(all.confusions, 12);
    const slowKeys = R.ranked(all.keyTimes, 8).slice(0, 10);
    const slowPairs = R.ranked(all.bigrams, 5).slice(0, 10);
    const avgKey = Object.values(all.keyTimes).reduce((s, o) => s + o.sum, 0) / (Object.values(all.keyTimes).reduce((s, o) => s + o.n, 0) || 1);
    const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "—");
    const n1 = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);
    const table = (head, rows, none) => rows.length
      ? `<table class="table"><thead><tr>${head.map((h, i) => `<th class="${i ? "num" : ""}">${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`
      : `<p class="muted">${none}</p>`;

    body.innerHTML = `<div class="cols">
      <section class="col-main stack">
        <div>
          <div class="rule-head">WRONG KEYS</div>
          ${table(["EXPECTED → PRESSED", "WEIGHTED COUNT"], conf.map((c) => `<tr><td class="mono">${esc(c.expected)} → ${esc(c.typed)}</td><td class="num">${n1(c.n)}</td></tr>`), "No wrong keys recorded.")}
        </div>
        <div class="two-col">
          <div>
            <div class="rule-head">SLOWEST KEYS</div>
            ${table(["KEY", "AVG MS"], slowKeys.map((k) => `<tr><td class="mono">${esc(k.key)}</td><td class="num">${Math.round(k.avg)}</td></tr>`), "Not enough data yet.")}
          </div>
          <div>
            <div class="rule-head">SLOWEST LETTER PAIRS</div>
            ${table(["PAIR", "AVG MS"], slowPairs.map((k) => `<tr><td class="mono">${esc(k.key)}</td><td class="num">${Math.round(k.avg)}</td></tr>`), "Not enough data yet.")}
          </div>
        </div>
      </section>
      <aside class="col-side">
        <div class="rule-head">SUMMARY</div>
        <dl class="status">${statusRows([
          ["Rounds analyzed:", recs.length],
          ["Avg time per key:", `${Math.round(avgKey)} ms`, true],
          ["Space errors:", pct(all.spaces.bad, all.spaces.n)],
          ["Pause before space:", all.spaces.pauseN ? `${Math.round(all.spaces.pause / all.spaces.pauseN)} ms` : "—", true],
          ["Backspaces per 100 keys:", all.letters ? n1((all.backs.n / all.letters) * 100) : "—"],
          ["Backspaces fixing a typo:", pct(all.backs.fixed, all.backs.n)],
          ["Pauses over 1s per round:", n1(all.hesitations / recs.length), true],
        ])}</dl>
        <div class="caps-label foot-caption">RECENT ROUNDS COUNT MORE. OPEN A ROUND'S REPLAY FROM HISTORY FOR DETAIL.</div>
      </aside>
    </div>`;
  }

  const empty = (title, text) => `<div class="empty"><h2>${title}</h2><p>${text}</p></div>`;

  function renderStats() {
    const tabs = [["overview", "Overview"], ["keys", "Keys"], ["keystrokes", "Keystrokes"], ["words", "Words"], ["history", "History"]];
    const body = TT.store.history.length
      ? STATS_VIEWS[ui.statsTab]()
      : empty("No results yet", "Finish a speed test and your stats will show up here.");
    $("view-stats").innerHTML = subtabs(tabs, ui.statsTab, "stab") + `<div id="stats-body">${body}</div>`;
    if (TT.store.history.length && ui.statsTab === "keystrokes") renderKeystrokes();
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
      const name = esc(TT.profiles.active().name);
      return `<div class="cols">
        <section class="col-main"><div class="settings-rows">
          ${srow("Profile", `<strong style="padding: 0 4px; font-size: 18px">${name}</strong>`)}
          ${srow("Saved results", `<strong style="padding: 0 4px; font-size: 18px">${n} ${n === 1 ? "round" : "rounds"}</strong>`)}
          ${srow("Reset", `<button class="opt danger" data-act="reset-data">DELETE THIS PROFILE'S DATA</button><span class="hint-text">Only ${name}. Settings and other profiles are kept.</span>`)}
        </div>
        <p class="note">Everything is stored on this computer. Nothing is uploaded.</p>
        </section>
      </div>`;
    },

    profiles() {
      const P = TT.profiles;
      const active = P.activeId();
      const list = P.list();
      const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
      const rows = list.map((p) => {
        const s = P.summary(p.id);
        const isActive = p.id === active;
        const renaming = ui.renaming === p.id;
        const name = renaming
          ? `<form class="profile-form" data-form="rename:${p.id}">
               <input class="text-input" name="name" value="${esc(p.name)}" maxlength="${P.MAX_NAME}" aria-label="New name for ${esc(p.name)}" required>
               <button class="opt on" type="submit">SAVE</button>
               <button class="opt" type="button" data-act="profile:cancel">CANCEL</button>
             </form>`
          : `<span class="profile-name">${esc(p.name)}</span>${isActive ? `<span class="tag">ACTIVE</span>` : ""}`;
        const actions = renaming ? "" :
          (isActive ? "" : `<button class="opt outline" data-act="profile:switch:${p.id}">SWITCH</button>`) +
          `<button class="opt" data-act="profile:rename:${p.id}" aria-label="Rename ${esc(p.name)}">RENAME</button>` +
          (isActive || list.length < 2 ? "" : `<button class="opt danger" data-act="profile:delete:${p.id}" aria-label="Delete ${esc(p.name)}">DELETE</button>`);
        return `<div class="profile-row ${isActive ? "active" : ""}">
          <div class="profile-main">${name}<span class="hint-text">${plural(s.tests, "test")} · ${plural(s.games, "game")} · best ${Math.round(s.best)} wpm</span></div>
          <div class="controls">${actions}</div>
        </div>`;
      }).join("");
      return `<div class="cols">
        <section class="col-main">
          <div class="settings-rows profiles">${rows}</div>
          <form class="new-profile" data-form="create">
            <label for="new-profile-name">New profile</label>
            <input id="new-profile-name" class="text-input" name="name" maxlength="${P.MAX_NAME}" placeholder="Name" required>
            <button class="opt outline" type="submit">CREATE</button>
          </form>
          <p class="note">Each profile keeps its own results, stats, replays and Forest Hop progress. Appearance and the other settings are shared.</p>
        </section>
      </div>`;
    },
  };

  function profileAct(x, id) {
    const P = TT.profiles;
    if (x === "switch") {
      if (P.switchTo(id)) onProfileChanged();
    } else if (x === "rename") {
      ui.renaming = id;
      renderSettings();
      const input = document.querySelector(`[data-form="rename:${id}"] input`);
      if (input) { input.focus(); input.select(); }
    } else if (x === "cancel") {
      ui.renaming = null;
      renderSettings();
    } else if (x === "delete") {
      const p = P.list().find((z) => z.id === id);
      if (p && confirm(`Delete the profile "${p.name}" and all of its results, replays and game progress? This can't be undone.`)) {
        P.remove(id);
        renderSettings();
      }
    }
  }

  // After switching profiles: forget anything that pointed at the old profile's rounds.
  function onProfileChanged() {
    ui.lastRoundId = ui.lastGameId = ui.lastForestId = ui.lastTilesId = ui.lastGhostId = ui.lastWormId = null;
    ui.fhPick = null;
    refreshSpeedScale();
    ui.renaming = null;
    renderBar();
    renderSettings();
    els.statusLine.textContent = `Switched to ${TT.profiles.active().name}.`;
  }

  document.addEventListener("submit", (e) => {
    const form = e.target.closest("[data-form]");
    if (!form) return;
    e.preventDefault();
    const name = new FormData(form).get("name");
    const [kind, id] = form.dataset.form.split(":");
    if (kind === "rename") {
      if (TT.profiles.rename(id, name)) {
        ui.renaming = null;
        renderSettings();
        renderBar();
      }
    } else if (kind === "create") {
      const newId = TT.profiles.create(name);
      if (newId && TT.profiles.switchTo(newId)) onProfileChanged();
    }
  });

  const UPDATE_TEXT = {
    idle: () => "Not checked yet.",
    checking: () => "Checking for updates…",
    none: () => "You have the latest version.",
    available: (u) => `Version ${esc(u.version)} is available.`,
    downloading: (u) => `Downloading version ${esc(u.version)}… ${u.percent}%`,
    downloaded: (u) => `Version ${esc(u.version)} is downloaded and ready to install.`,
    error: (u) => `Couldn't reach the update server: ${esc(u.error)}`,
  };

  SETTINGS_VIEWS.updates = () => {
    const version = (v) => `<strong style="padding: 0 4px; font-size: 18px">${v}</strong>`;
    if (!window.touchType) {
      return `<div class="cols"><section class="col-main">
        <div class="settings-rows">${srow("Version", version("Web version"))}</div>
        <p class="note">Updates are only available in the desktop app.</p>
      </section></div>`;
    }

    const u = ui.update;
    let action = "";
    if (!u.supported) action = "";
    else if (u.status === "available") action = `<button class="opt on" data-act="update:download">DOWNLOAD ${esc(u.version)}</button>`;
    else if (u.status === "downloaded") action = `<button class="opt on" data-act="update:install">RESTART AND INSTALL</button>`;
    else if (u.status !== "checking" && u.status !== "downloading") action = `<button class="opt outline" data-act="update:check">CHECK FOR UPDATES</button>`;
    const status = u.supported ? UPDATE_TEXT[u.status](u) : "Updates only work in the installed app.";

    return `<div class="cols">
      <section class="col-main">
        <div class="settings-rows">
          ${srow("Version", version(ui.version ? `v${esc(ui.version)}` : "…"))}
          ${srow("Automatic updates", optButtons("autoUpdate", { false: "Off", true: "On" }) +
            `<span class="hint-text">Checks when the app starts and downloads updates in the background.</span>`)}
          ${srow("Updates", `${action}<span class="hint-text" aria-live="polite">${status}</span>`)}
        </div>
        <p class="note">Touch Type only connects to the internet when you check for updates or turn on automatic updates. It looks for new releases on GitHub (github.com/silent-diffusion/Touch-Type).</p>
      </section>
    </div>`;
  };

  // Settings → Music: the separation pack, which splits the songs you add into their parts for
  // Tiles' ×4 visuals (separate.js). One click downloads it; it can be removed again here.
  const MB = (bytes) => `${Math.round(bytes / 1e6)} MB`;
  SETTINGS_VIEWS.music = () => {
    const sp = TT.separate;
    const about = `<p class="note">With the separation pack, Touch Type splits the songs you add to Tiles into vocals, drums, bass and other instruments, on this computer, so the ×4 visuals can follow each part: the line along the bottom follows the vocals, the outline the bass and drums, and the sparks everything else. It runs in the background, on your graphics card when it can, and you can play a song while it's being split. Until then, Tiles uses a quicker, rougher split.</p>
        <p class="note">The pack is about 100 MB. It's only downloaded when you click Download, from GitHub (github.com/silent-diffusion/Touch-Type). It uses Deezer's Spleeter model and Microsoft's ONNX Runtime; their licences come with it.</p>`;
    if (!sp.supported()) {
      return `<div class="cols"><section class="col-main">
        <div class="settings-rows">${srow("Separation pack", `<span class="hint-text">Only available in the desktop app.</span>`)}</div>
        ${about}
      </section></div>`;
    }
    const st = sp.state(), p = st.pack;
    let action = "", status;
    if (st.dev) status = "A local copy is in use (for testing).";
    else if (p.status === "installed") {
      action = `<button class="opt outline" data-act="pack:remove">REMOVE</button>`;
      status = `Installed (${MB(p.size)}). Songs already split keep their parts if you remove it.`;
    } else if (p.status === "downloading") {
      action = `<button class="opt outline" data-act="pack:cancel">CANCEL</button>`;
      status = `Downloading… ${p.percent}%`;
    } else {
      action = `<button class="opt on" data-act="pack:install">DOWNLOAD (${MB(p.size || 100e6)})</button>`;
      status = p.status === "error" ? `The download didn't finish: ${esc(p.error)}` : "Not installed.";
    }
    const songs = TT.music.list();
    const c = sp.counts();
    const working = songs.find((x) => sp.statusOf(x.id).status === "working");
    const failed = songs.filter((x) => sp.statusOf(x.id).status === "failed");
    let progress = !c.total ? "No added songs yet." : `${c.done} of ${c.total} ${c.total === 1 ? "song" : "songs"} split.`;
    if (working) progress += ` Splitting “${esc(working.title)}”… ${sp.statusOf(working.id).percent || 0}%${st.device ? ` (on the ${st.device === "gpu" ? "graphics card" : "processor"})` : ""}.`;
    if (failed.length) progress += ` ${failed.length === 1 ? "One song" : `${failed.length} songs`} couldn't be split: ${esc(sp.statusOf(failed[0].id).error)}`;
    return `<div class="cols">
      <section class="col-main">
        <div class="settings-rows">
          ${srow("Separation pack", `${action}<span class="hint-text" aria-live="polite">${status}</span>`)}
          ${srow("Your songs", `<span class="hint-text" aria-live="polite">${progress}</span>`)}
        </div>
        ${about}
      </section>
    </div>`;
  };

  function renderSettings() {
    const tabs = [["appearance", "Appearance"], ["practice", "Practice"], ["profiles", "Profiles"], ["music", "Music"], ["updates", "Updates"], ["data", "Data"]];
    $("view-settings").innerHTML = subtabs(tabs, ui.settingsTab, "settab") + SETTINGS_VIEWS[ui.settingsTab]();
  }

  function setSetting(key, raw) {
    const s = S();
    if (key === "second" || key === "autoUpdate") s[key] = raw === "true";
    else if (key === "mix" || key === "practiceAmount") s[key] = Number(raw);
    else s[key] = raw;
    TT.save();
    if (key === "autoUpdate" && window.touchType) window.touchType.update.setAuto(s.autoUpdate);
    applySettings();
    renderSettings();
  }

  // ---------- actions ----------

  // ---------- pausing games ----------

  // The game on screen, with where Q (quit) takes you from it.
  function activeGame() {
    if (ui.view === "forest") return { g: forest, quit: "fh:select" };
    if (ui.view === "tiles") return { g: tiles, quit: "tl:select" };
    if (ui.view === "ghost") return { g: ghostRace, quit: "gr:select" };
    if (ui.view === "worm") return { g: wormhole, quit: "wm:select" };
    if (ui.view === "game") return { g: runner, quit: "menu" };
    return null;
  }

  // Esc: pauses a running game and resumes a paused one. Before a round starts or after it ends
  // it goes back, as it always did.
  function togglePause() {
    const a = activeGame();
    if (!a) return;
    if (a.g.isPaused()) a.g.resume();
    else if (a.g.isRunning()) a.g.pause();
    else act(a.quit);
  }

  // Switching to another window pauses a running game, so a round isn't lost while you're away.
  const pauseIfRunning = () => {
    const a = activeGame();
    if (a && a.g.isRunning()) a.g.pause();
  };
  window.addEventListener("blur", pauseIfRunning);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseIfRunning(); });

  function act(action) {
    const [type, x, ...rest] = action.split(":");
    const y = rest.join(":"); // song ids like "u:abc" have a colon of their own
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
      case "pause": togglePause(); break;
      case "close":
      case "restart": startTyping(ui.lastTyping); break;
      case "practice": startTyping("practice"); break;
      case "play": startGame(); break;
      case "replay": {
        const id = x === "last" ? (ui.view === "game" ? ui.lastGameId : ui.view === "forest" ? ui.lastForestId : ui.view === "tiles" ? ui.lastTilesId : ui.view === "ghost" ? ui.lastGhostId : ui.view === "worm" ? ui.lastWormId : ui.lastRoundId) : x;
        if (id) openReplay(id, ui.view === "stats" ? "stats" : ui.view);
        break;
      }
      case "rp": replayAct(x, y); break;
      case "fh": forestAct(x, y); break;
      case "tl": tilesAct(x, y); break;
      case "gr": ghostAct(x, y); break;
      case "wm": wormAct(x, y); break;
      case "stab":
        ui.statsTab = x;
        if (ui.view === "stats") renderStats();
        else openMenu("stats"); // from a replay opened in the stats
        break;
      case "lb":
        if (x === "tab") ui.lbTab = y;
        else if (x === "song") ui.lbSong = y;
        else if (x === "diff") ui.lbDiff = y;
        else if (x === "mode") ui.lbQueue = y === "queue";
        else if (x === "track") ui.lbTrack = y;
        else if (x === "worm") ui.lbWorm = y;
        else if (x === "pack") ui.lbPack = y;
        renderLeaderboard();
        break;
      case "settab": ui.settingsTab = x; renderSettings(); break;
      case "gtab": ui.gamesTab = x; renderGames(); break;
      case "game": ui.game = x; renderGames(); break;
      case "set": setSetting(x, y); break;
      case "window":
        if (!window.touchType) break;
        if (x === "close") window.touchType.window.close();
        else if (x === "windowed") window.touchType.window.setFullScreen(false);
        break;
      case "update":
        if (window.touchType && ["check", "download", "install"].includes(x)) window.touchType.update[x]();
        break;
      case "pack":
        if (x === "remove" && !confirm("Remove the separation pack? Songs already split keep their parts.")) break;
        if (["install", "cancel", "remove"].includes(x)) TT.separate[x]();
        break;
      case "goto":
        // from the Tiles song screen to Settings → Music
        if (x === "music") {
          ui.settingsTab = "music";
          openMenu("settings");
        }
        break;
      case "profile": profileAct(x, y); break;
      case "profiles":
        ui.settingsTab = "profiles";
        openMenu("settings");
        break;
      case "reset-data":
        if (confirm(`Delete all of ${TT.profiles.active().name}'s results, stats, replays and game progress? This can't be undone.`)) {
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

  // ---------- arrow keys move around a page ----------
  // On every page that isn't being played, the arrow keys move a highlight to the nearest control in that
  // direction: across the page's columns, and up into the section's tabs and the main tabs. Enter (or
  // Space) presses it. In a list of choices (games, songs, animals) moving also selects, and Enter keeps
  // doing what it says at the bottom (usually PLAY). The page's own shortcuts all still work.
  const NAV_VIEWS = ["test", "practice", "results", "games", "forest-select", "forest-guide", "tiles-select", "ghost-select", "worm-select", "replay", "leaderboard", "stats", "settings"];
  const FOCUSABLE = "button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]";
  const PICKS = ".list button[aria-pressed], .fh-animal";
  const NAV_AREAS = ".topline, #tabs, #subtabs, #folder";
  let navOn = false;
  let navLast = null;

  function navCandidates() {
    const typing = document.body.classList.contains("typing");
    return [...document.querySelectorAll(`.topline :is(${FOCUSABLE}), #tabs :is(${FOCUSABLE}), #subtabs :is(${FOCUSABLE}), #folder :is(${FOCUSABLE})`)].filter((el) => {
      if (el.closest("[hidden], [aria-hidden=true]") || (typing && el.closest("#test-config"))) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }
  // where the highlight starts: what's chosen on the page, or else its first control
  function navStart(list) {
    const page = list.filter((el) => $("folder").contains(el));
    return page.find((el) => el.matches(PICKS) && el.classList.contains("on")) ||
      page.find((el) => el.getAttribute("aria-pressed") === "true") || page[0] ||
      navArea(list, "#subtabs") || navArea(list, "#tabs") || list[0];
  }
  // stepping into a row of tabs lands on the open tab; into the page, on where it starts
  function navArea(list, area) {
    if (area === "#folder") return navStart(list);
    const inArea = list.filter((el) => el.closest(area));
    return inArea.find((el) => el.classList.contains("on")) || inArea[0];
  }
  // a control in a scrolling column is brought into view within its column only
  function navReveal(el) {
    for (let box = el.parentElement; box && box !== document.body; box = box.parentElement) {
      if (!box.matches(SCROLLERS) || box.scrollHeight <= box.clientHeight) continue;
      const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (r.top < b.top + 8) box.scrollTop -= b.top - r.top + 24;
      else if (r.bottom > b.bottom - 8) box.scrollTop += r.bottom - b.bottom + 24;
    }
  }
  function navFocus(el) {
    navOn = true;
    el.focus({ preventScroll: true });
    navReveal(el);
    navLast = { act: el.dataset.act || null, view: ui.view, area: el.closest(NAV_AREAS) && el.closest(NAV_AREAS).id };
    if (el.matches(PICKS) && !el.classList.contains("on")) el.click();
  }
  function navMove(key) {
    const list = navCandidates();
    const cur = document.activeElement;
    if (!list.includes(cur)) { const start = navStart(list); if (start) navFocus(start); return; }
    const c = cur.getBoundingClientRect();
    const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    const down = key === "ArrowDown", up = key === "ArrowUp", right = key === "ArrowRight";
    const vertical = up || down;
    let best = null, bestScore = Infinity;
    // the page and the rows above it (profile, main tabs, section tabs) are moved around one at a time
    const area = cur.closest(NAV_AREAS);
    for (const el of list) {
      if (el === cur || el.closest(NAV_AREAS) !== area) continue;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      // wholly past this one in that direction (tabs overlap their neighbours a little, so allow that)
      const ahead = vertical
        ? (down ? y > cy + 4 && r.top >= c.bottom - 20 : y < cy - 4 && r.bottom <= c.top + 20)
        : (right ? x > cx + 4 && r.left >= c.right - 16 : x < cx - 4 && r.right <= c.left + 16);
      if (!ahead) continue;
      const gap = vertical ? Math.max(0, down ? r.top - c.bottom : c.top - r.bottom) : Math.max(0, right ? r.left - c.right : c.left - r.right);
      const side = vertical ? Math.max(0, r.left - c.right, c.left - r.right) : Math.max(0, r.top - c.bottom, c.top - r.bottom);
      const off = vertical ? Math.abs(x - cx) : Math.abs(y - cy);
      // controls in line with this one win over nearer ones off to the side
      const score = gap + side * 4 + (side ? 400 : 0) + off * 0.1;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (!best && vertical) {
      // past the edge of this area: on to the next one up or down
      const areas = NAV_AREAS.split(", ").filter((a) => list.some((el) => el.closest(a)));
      const next = areas[areas.findIndex((a) => area.matches(a)) + (down ? 1 : -1)];
      best = next && navArea(list, next);
    }
    if (!best) return;
    // coming into a list of choices from outside it lands on the one that's chosen, not a new one
    const group = best.matches(PICKS) && best.closest(".list, .fh-animals");
    if (group && !group.contains(cur)) best = group.querySelector(".on") || best;
    navFocus(best);
  }
  // A redraw replaces the page's controls, so the highlight goes back to the same control.
  new MutationObserver(() => {
    if (!navOn || !navLast || !NAV_VIEWS.includes(ui.view)) return;
    const cur = document.activeElement;
    if (cur && cur !== document.body && document.contains(cur)) return;
    const list = navCandidates();
    const acts = navLast.act ? list.filter((el) => el.dataset.act === navLast.act) : [];
    const same = acts.find((el) => el.closest(NAV_AREAS).id === navLast.area) || acts[0];
    if (same) { same.focus({ preventScroll: true }); navReveal(same); }
    else navOn = false;
  }).observe(els.app, { childList: true, subtree: true });
  document.addEventListener("pointerdown", () => { navOn = false; });

  // Returns true when the key was used for moving around the page.
  function navKey(e) {
    const v = ui.view;
    if (!NAV_VIEWS.includes(v) || e.ctrlKey || e.altKey || e.metaKey) return false;
    if (v === "tiles-select" && ui.tap) return false;
    if ((v === "test" || v === "practice") && document.body.classList.contains("typing")) return false;
    const arrow = /^Arrow(Up|Down|Left|Right)$/.test(e.key);
    const cur = document.activeElement;
    const onControl = navOn && cur && cur !== document.body && navCandidates().includes(cur);
    if (arrow) {
      // the replay's ← → skip, until you've moved onto one of its controls
      if (v === "replay" && !onControl && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return false;
      e.preventDefault();
      navMove(e.key);
      return true;
    }
    if (!onControl) return false;
    if (e.key === "Enter" || (e.key === " " && !["replay", "test", "practice"].includes(v))) {
      // on a choice in a list, Enter does the page's Enter (PLAY); anything else is pressed
      if (e.key === "Enter" && cur.matches(PICKS)) return false;
      e.preventDefault();
      cur.click();
      return true;
    }
    // typing on the speed test goes to the test, not the highlighted control
    if ((v === "test" || v === "practice") && e.key !== "Tab" && e.key !== "Escape" && e.key.length === 1) { cur.blur(); navOn = false; }
    return false;
  }

  const plainKey = (e, key) => e.key === key && !e.ctrlKey && !e.altKey && !e.metaKey;

  document.addEventListener("keydown", (e) => {
    // The Ludicrous reveal takes every key: Enter, Space or Esc closes its note once it's up.
    if (ui.ludi) {
      e.preventDefault();
      if (ui.ludi.pop && ["Enter", " ", "Escape"].includes(e.key)) closeLudicrous();
      return;
    }
    if (e.getModifierState) els.capslock.hidden = !e.getModifierState("CapsLock");
    // Typing in a text field (like a profile name) shouldn't trigger shortcuts.
    if (e.target.closest && e.target.closest("input, textarea, select")) {
      // up and down leave a slider or a one-line text box (left and right still change it)
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && e.target.matches("input") && NAV_VIEWS.includes(ui.view)) {
        e.preventDefault();
        navOn = true;
        navMove(e.key);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (ui.renaming) profileAct("cancel");
        else e.target.blur();
      }
      return;
    }
    const v = ui.view;

    // Ctrl + a number jumps to a tab (see jumpKey).
    if (e.ctrlKey && !e.altKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      if (!e.repeat) jumpKey(Number(e.key));
      return;
    }
    if (navKey(e)) return;
    if (e.key === "Escape" && ui.fullscreen && ROOT_VIEWS.includes(v)) {
      e.preventDefault();
      act("window:windowed");
      return;
    }
    if (v === "replay") {
      const keys = { " ": "rp:toggle", ArrowLeft: "rp:skip:-2000", ArrowRight: "rp:skip:2000", Escape: "rp:back" };
      if (keys[e.key]) {
        e.preventDefault();
        act(keys[e.key]);
      }
      return;
    }
    if (FOREST_VIEWS.includes(v)) {
      if (v === "forest") {
        if (e.key === "Tab") { e.preventDefault(); act("fh:play"); }
        else if (e.key === "Escape") { e.preventDefault(); act("pause"); }
        else if (forest.isPaused()) { if (plainKey(e, "q")) act("fh:select"); }
        else if (forest.isOver()) { if (plainKey(e, "r")) act("replay:last"); }
        else forest.handleKey(e);
      } else if (v === "forest-select") {
        const keys = { Enter: "fh:play", h: "fh:guide", m: "fh:music", e: "fh:sfx", Escape: "menu" };
        if (keys[e.key] && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); act(keys[e.key]); }
      } else {
        const keys = { Enter: "fh:play", Escape: "fh:select" };
        if (keys[e.key]) { e.preventDefault(); act(keys[e.key]); }
      }
      return;
    }
    if (TILES_VIEWS.includes(v)) {
      if (v === "tiles") {
        if (e.key === "Tab") { e.preventDefault(); act("tl:play"); }
        else if (e.key === "Escape") { e.preventDefault(); act("pause"); }
        else if (tiles.isPaused()) { if (plainKey(e, "q")) act("tl:select"); }
        else if (tiles.isOver()) { if (plainKey(e, "r")) act("replay:last"); }
        else tiles.handleKey(e);
      } else if (ui.tap) {
        // tapping along: Space or T taps, Enter saves, Esc cancels
        if (e.key === " " || plainKey(e, "t")) { e.preventDefault(); if (!e.repeat) tapBeat(e.timeStamp || performance.now()); }
        else if (e.key === "Enter") { e.preventDefault(); act("tl:tapsave"); }
        else if (e.key === "Backspace") { e.preventDefault(); act("tl:tapundo"); }
        else if (e.key === "Escape") { e.preventDefault(); act("tl:tapcancel"); }
      } else {
        const keys = { "]": "tl:harder", "[": "tl:easier", Enter: "tl:play", a: "tl:import", q: "tl:mode:toggle", m: "tl:music", t: "tl:metronome", Escape: "menu" };
        if (keys[e.key] && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); act(keys[e.key]); }
      }
      return;
    }
    if (GHOST_VIEWS.includes(v)) {
      if (v === "ghost") {
        if (e.key === "Tab") { e.preventDefault(); act("gr:play"); }
        else if (e.key === "Escape") { e.preventDefault(); act("pause"); }
        else if (ghostRace.isPaused()) { if (plainKey(e, "q")) act("gr:select"); }
        else if (ghostRace.isOver()) { if (plainKey(e, "r")) act("replay:last"); }
        else ghostRace.handleKey(e);
      } else {
        const keys = { Enter: "gr:play", m: "gr:music", e: "gr:sfx", Escape: "menu" };
        if (keys[e.key] && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); act(keys[e.key]); }
      }
      return;
    }
    if (WORM_VIEWS.includes(v)) {
      if (v === "worm") {
        if (e.key === "Tab") { e.preventDefault(); if (wormhole.mode() === "blitz") act("wm:play"); }
        else if (e.key === "Escape") { e.preventDefault(); act("pause"); }
        else if (wormhole.isPaused()) { if (plainKey(e, "q")) act("wm:select"); }
        else if (wormhole.isOver()) { if (plainKey(e, "r")) act("replay:last"); }
        else wormhole.handleKey(e);
      } else if (plainKey(e, "r")) {
        act("wm:replay");
      } else {
        const keys = { Enter: "wm:play", m: "wm:music", e: "wm:sfx", Escape: "menu" };
        if (keys[e.key] && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); act(keys[e.key]); }
      }
      return;
    }
    if (v === "game" && (e.key === "Escape" || (runner.isPaused() && plainKey(e, "q")))) {
      e.preventDefault();
      act(e.key === "Escape" ? "pause" : "menu");
      return;
    }
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
      // Only deliberate keys start a new round; anything typed past the end of a test is ignored.
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        act("restart");
      } else if (plainKey(e, "p") && ui.lastTyping === "test") {
        act("practice");
      } else if (plainKey(e, "r")) {
        act("replay:last");
      }
    } else if (v === "game") {
      if (e.key === "Tab") {
        e.preventDefault();
        act("play");
        return;
      }
      if (runner.isOver()) {
        if (plainKey(e, "r")) act("replay:last");
        return;
      }
      runner.handleKey(e);
    } else if (v === "games" && e.key === "Enter" && selectedGame().playable) {
      e.preventDefault();
      act(playAct(selectedGame().id));
    } else if (v === "stats" && plainKey(e, "p")) {
      act("practice");
    }
  });

  window.addEventListener("resize", () => {
    if (ui.view === "test" || ui.view === "practice") engine.relayout();
    if (ui.view === "replay" && rp.player && rp.player.relayout) rp.player.relayout();
    if (ui.view === "ghost") ghostRace.relayout();
    if (ui.view === "worm") wormhole.relayout();
  });

  // ---------- game speed ----------

  // Games time only the typing of each word, so their WPM is scaled to match this profile's own
  // speed tests (input.js, review.js). Worked out again after every test and on switching profiles.
  async function refreshSpeedScale() {
    const recs = await TT.rounds.recent(60);
    const found = TT.review.speedScale(recs);
    TT.store.games.speed = found || { scale: TT.wordInput.DEFAULT_SCALE, tests: 0 };
    TT.save();
  }

  // ---------- start ----------

  TT.ui = { statusRows, keyTiles };
  // Only the desktop app provides window.touchType; in a plain browser there are no updates.
  if (window.touchType) {
    window.touchType.window.isFullScreen().then(setFullscreenState);
    window.touchType.window.onFullScreen(setFullscreenState);
    const refresh = () => {
      if (ui.view === "settings" && ui.settingsTab === "updates") renderSettings();
    };
    ui.update = { status: "idle", supported: false };
    window.touchType.getVersion().then((v) => { ui.version = v; refresh(); });
    window.touchType.update.getState().then((st) => { ui.update = st; refresh(); });
    window.touchType.update.onState((st) => { ui.update = st; refresh(); });
    // Nothing goes online unless automatic updates are on.
    window.touchType.update.setAuto(S().autoUpdate);
  }
  sanitizeSettings();
  applySettings();
  startTyping("test");
  refreshSpeedScale();
  TT.music.load().then(() => {
    if (ui.view === "tiles-select") renderTilesSelect();
    TT.separate.start();
  });
  // The separation pack and the songs being split: keep the screens that show them up to date
  // (but not the song screen while lyrics are being edited or tapped, which would lose the typing).
  TT.separate.onChange(() => {
    if (ui.view === "settings" && ui.settingsTab === "music") renderSettings();
    if (ui.view === "tiles-select" && !ui.lyricsEdit && !ui.tap) renderTilesSelect();
  });
  document.fonts.ready.then(() => {
    if (ui.view === "test" || ui.view === "practice") engine.relayout();
  });
})();
