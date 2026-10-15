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
  const FOREST_VIEWS = ["forest", "forest-select", "forest-guide"];

  const ui = {
    view: "test",
    lastTyping: "test",
    menuView: "games",
    statsTab: "overview",
    settingsTab: "appearance",
    gamesTab: "all",
    game: "forest",
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
    s.autoUpdate = !!s.autoUpdate;
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
    const special = ui.view === "game" || ui.view === "replay" || FOREST_VIEWS.includes(ui.view);
    els.config.hidden = special;
    els.badge.hidden = !special && ui.lastTyping !== "practice";
    $("profile-chip").textContent = TT.profiles.active().name;
    $("profile-chip").setAttribute("aria-label", `Profile: ${TT.profiles.active().name}. Manage profiles`);
    els.badge.textContent = ui.view === "replay" ? "REPLAY" : ui.view === "game" ? "PATH RUNNER"
      : FOREST_VIEWS.includes(ui.view) ? "FOREST HOP" : "PRACTICE";
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
    TT.rounds.save({ id, date, kind, ...r.recording });

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

  const testName = (kind, mode, amount, game) =>
    kind === "game" ? `${game === "forest" ? "forest hop" : "path runner"}, ${amount} steps` : `${kind === "practice" ? "practice" : mode} ${amount}`;

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
    results: [["TAB / ENTER", "NEXT TEST", "restart"], ["R", "REPLAY", "replay:last"], ["P", "PRACTICE WEAK KEYS", "practice"], ["ESC", "MENU", "menu"]],
    games: [["ESC", "CLOSE MENU", "close"]],
    game: [["TAB", "RESTART", "play"], ["ESC", "MENU", "menu"]],
    forest: [["SPACE / ENTER", "JUMP", "noop"], ["TAB", "RESTART", "fh:play"], ["ESC", "ANIMALS", "fh:select"]],
    "forest-select": [["← →", "CHOOSE", "fh:next"], ["ENTER", "PLAY", "fh:play"], ["H", "HOW TO PLAY", "fh:guide"], ["ESC", "MENU", "menu"]],
    "forest-guide": [["ENTER", "PLAY", "fh:play"], ["ESC", "BACK", "fh:select"]],
    replay: [["SPACE", "PLAY / PAUSE", "rp:toggle"], ["← →", "SKIP 2S", "rp:skip:2000"], ["ESC", "BACK", "rp:back"]],
    stats: [["P", "PRACTICE WEAK KEYS", "practice"], ["ESC", "CLOSE MENU", "close"]],
    settings: [["ESC", "CLOSE MENU", "close"]],
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
    replay: "Click a moment to jump to it.",
    stats: "Select a view.",
    settings: "Changes save automatically.",
  };

  function renderHints() {
    let hints = HINTS[ui.view];
    // After practice, only Tab/Enter start the next round, so a stray "p" can't kick one off.
    if (ui.view === "results" && ui.lastTyping === "practice") {
      hints = hints.filter(([, , act]) => act !== "practice").map(([key, label, act]) =>
        [key, act === "restart" ? "PRACTICE AGAIN" : label, act]);
    }
    if (ui.view === "games" && selectedGame().playable) hints = [["ENTER", "PLAY", selectedGame().id === "forest" ? "fh:select" : "play"], ...hints];
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
    for (const v of FOREST_VIEWS) $(`view-${v}`).hidden = v !== view;
    if (view !== "forest" && forest) forest.stop();
    $("view-replay").hidden = view !== "replay";
    if (view !== "replay") pauseReplay();
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
    forest.stop();
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
          <div class="game-art">${g.id === "forest" ? TT.sprites.svg("frog", 220) : `<svg viewBox="0 0 300 300" role="img" aria-label="${g.name} icon">${GAME_ART[g.id]}</svg>`}</div>
          <div class="detail-line">DIFFICULTY: <strong>ADAPTIVE</strong></div>
          <div class="rule-box">${g.desc}${g.playable ? "" : " <strong>Coming in a later update.</strong>"}</div>
          ${g.playable ? `<button class="outline-btn play-btn" data-act="${g.id === "forest" ? "fh:select" : "play"}">PLAY <kbd>ENTER</kbd></button>` : ""}
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
      ui.lastGameId = id;
      els.statusLine.textContent = "Run saved. Press R to replay it.";
    },
  });

  function startGame() {
    engine.stop();
    document.body.classList.remove("typing");
    show("game");
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
            <li>Keys that don't fit any word are ignored and counted as mistakes. Backspace works.</li>
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
    renderBar();
    forest.newGame(pick);
  }

  function forestAct(x, y) {
    const d = fhData();
    if (x === "select") { forest.stop(); openForestSelect(); }
    else if (x === "play") startForest();
    else if (x === "guide") { show("forest-guide"); renderBar(); renderForestGuide(); }
    else if (x === "pick") { ui.fhPick = y; renderForestSelect(); }
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
    document.body.classList.remove("typing");
    Object.assign(rp, { rec, a: TT.review.analyze(rec), T: 0, playing: false, returnTo });
    show("replay");
    renderBar();
    renderReplayScreen();
    seekReplay(0);
  }

  function renderReplayScreen() {
    const { rec, a } = rp;
    const game = rec.kind === "game";
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
          <div class="title-row"><h1>REPLAY</h1><span class="title-meta">${testName(rec.kind, rec.mode, rec.amount, rec.game).toUpperCase()}</span></div>
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
            [game ? "Backspaces:" : "Backspaces (fixed typos):", game ? a.backs.length : `${a.backs.length} (${fixed})`],
            ...(game ? [["Slowest step:", a.steps.length ? fmtSec(Math.max(...a.steps.map((s) => s.ms))) : "—"]] : [["Space errors:", spaceBad]]),
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
    if (rec.game === "forest") {
      const F = TT.forestCore;
      const st = F.gameStats(state, Math.max(rp.T, 1));
      rows = [["Steps:", F.score(state)], ["WPM:", speed(st.wpm)], ["Accuracy:", `${Math.round(st.acc)}%`], ["Mistakes:", state.mistakes, true]];
    } else if (rec.kind === "game") {
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
          <td>${testName(h.kind || "test", h.mode, h.amount, h.game)}</td>
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
    ui.lastRoundId = ui.lastGameId = ui.lastForestId = null;
    ui.fhPick = null;
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

  function renderSettings() {
    const tabs = [["appearance", "Appearance"], ["practice", "Practice"], ["profiles", "Profiles"], ["updates", "Updates"], ["data", "Data"]];
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
      case "replay": {
        const id = x === "last" ? (ui.view === "game" ? ui.lastGameId : ui.view === "forest" ? ui.lastForestId : ui.lastRoundId) : x;
        if (id) openReplay(id, ui.view === "stats" ? "stats" : ui.view);
        break;
      }
      case "rp": replayAct(x, y); break;
      case "fh": forestAct(x, y); break;
      case "stab": ui.statsTab = x; renderStats(); break;
      case "settab": ui.settingsTab = x; renderSettings(); break;
      case "gtab": ui.gamesTab = x; renderGames(); break;
      case "game": ui.game = x; renderGames(); break;
      case "set": setSetting(x, y); break;
      case "update":
        if (window.touchType && ["check", "download", "install"].includes(x)) window.touchType.update[x]();
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

  const plainKey = (e, key) => e.key === key && !e.ctrlKey && !e.altKey && !e.metaKey;

  document.addEventListener("keydown", (e) => {
    if (e.getModifierState) els.capslock.hidden = !e.getModifierState("CapsLock");
    // Typing in a text field (like a profile name) shouldn't trigger shortcuts.
    if (e.target.closest && e.target.closest("input, textarea, select")) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (ui.renaming) profileAct("cancel");
        else e.target.blur();
      }
      return;
    }
    const v = ui.view;

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
        else if (e.key === "Escape") { e.preventDefault(); act("fh:select"); }
        else if (forest.isOver()) { if (plainKey(e, "r")) act("replay:last"); }
        else forest.handleKey(e);
      } else if (v === "forest-select") {
        const keys = { ArrowRight: "fh:next", ArrowLeft: "fh:prev", Enter: "fh:play", h: "fh:guide", Escape: "menu" };
        if (keys[e.key] && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); act(keys[e.key]); }
      } else {
        const keys = { Enter: "fh:play", Escape: "fh:select" };
        if (keys[e.key]) { e.preventDefault(); act(keys[e.key]); }
      }
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
      act(selectedGame().id === "forest" ? "fh:select" : "play");
    } else if (v === "stats" && plainKey(e, "p")) {
      act("practice");
    }
  });

  window.addEventListener("resize", () => {
    if (ui.view === "test" || ui.view === "practice") engine.relayout();
    if (ui.view === "replay" && rp.player && rp.player.relayout) rp.player.relayout();
  });

  // ---------- start ----------

  TT.ui = { statusRows, keyTiles };
  // Only the desktop app provides window.touchType; in a plain browser there are no updates.
  if (window.touchType) {
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
  document.fonts.ready.then(() => {
    if (ui.view === "test" || ui.view === "practice") engine.relayout();
  });
})();
