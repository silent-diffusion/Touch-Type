// Lyric timing: finds when each word of an added song's lyrics is sung (align-worker.js), so Tiles
// can deal the words as they're sung without the user tapping along ("TIME LYRICS").
//
// It needs a lyric timing model from Settings → Models (models.js): "lyrics-gpu" on a graphics card
// (WebGPU), "lyrics-small" on the processor. With one installed, every added song with lyrics is
// timed in the background, one at a time. When the song separation model is installed too, a song
// is timed from its separated vocals (once they're made), which are much clearer than the full mix.
//
// The times are saved like tapped ones (TT.music.setLyricTimes), marked as found automatically and
// by which version of this (KEY). Times the user tapped are never replaced: tapping is the override.
// A song whose lyrics change is timed again.
(() => {
  const KEY = "w2v-960h-1"; // the alignment's version: a new one times songs again
  const RATE = 16000;
  const MIN_WORDS = 4;

  // songs: songId → { status: queued | working | done | failed, percent, error }
  const state = { model: null, device: null, songs: {}, running: false };
  const listeners = new Set();
  const changed = () => listeners.forEach((f) => { try { f(); } catch {} });
  let worker = null, workerReady = null, workerModel = null;
  let queue = [];
  let gpu = null; // whether WebGPU has an adapter here (found once)

  async function hasGpu() {
    if (gpu === null) {
      try { gpu = !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch { gpu = false; }
    }
    return gpu;
  }

  // Which installed model to use, and whether on the processor: the GPU one with a graphics card,
  // else the small one, else the GPU one anyway (slowly, on the processor).
  async function choose() {
    const has = (id) => TT.models && TT.models.installed(id);
    const g = await hasGpu();
    if (has("lyrics-gpu") && g) return { id: "lyrics-gpu", cpu: false };
    if (has("lyrics-small")) return { id: "lyrics-small", cpu: true };
    if (has("lyrics-gpu")) return { id: "lyrics-gpu", cpu: true };
    return null;
  }

  const fileOf = (id) => TT.MODELS.byId(id).files[0].name;

  async function startWorker(pick) {
    if (workerReady && workerModel === pick.id) return workerReady;
    stopWorker();
    workerModel = pick.id;
    worker = new Worker("align-worker.js");
    workerReady = new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === "ready") { state.device = m.device; state.model = pick.id; changed(); resolve(); }
        else if (m.type === "error" && m.id == null) reject(new Error(m.message));
        else if (worker.onJob) worker.onJob(m);
      };
      worker.onerror = (e) => reject(new Error(e.message || "Lyric timing couldn't start."));
      worker.postMessage({ type: "init", base: TT.models.base(), model: fileOf(pick.id), cpu: pick.cpu });
    });
    workerReady.catch(() => stopWorker());
    return workerReady;
  }
  function stopWorker() {
    if (worker) worker.terminate();
    worker = null;
    workerReady = null;
    workerModel = null;
  }

  // mono 16 kHz: from the separated vocals when there are some, else from the song itself
  async function audioFor(songId) {
    let source = null, from = "mix";
    if (TT.separate && TT.separate.statusOf(songId).status === "done") {
      try {
        const stems = await TT.separate.stemsFor(songId);
        if (stems && stems.vocals) { source = stems.vocals; from = "vocals"; }
      } catch {}
    }
    if (!source) source = await TT.music.decodeCopy(songId);
    const off = new OfflineAudioContext(1, Math.ceil(source.duration * RATE), RATE);
    const src = off.createBufferSource();
    src.buffer = source;
    src.connect(off.destination);
    src.start();
    return { audio: (await off.startRendering()).getChannelData(0), from };
  }

  const wordsOf = (song) => (TT.lyrics ? TT.lyrics.sequence(song.lyrics || "") : []);

  // Whether a song wants timing: lyrics, no tapped times, not timed by this version already.
  function wants(song) {
    if (!song || !song.user || wordsOf(song).length < MIN_WORDS) return false;
    if (song.lyricTimesBy === "you") return false;
    return song.lyricTimesBy !== KEY;
  }

  function queueAll() {
    if (!TT.music) return;
    for (const song of TT.music.list()) {
      const st = state.songs[song.id];
      if (wants(song) && !queue.includes(song.id) && !(st && (st.status === "working" || st.status === "failed"))) {
        queue.push(song.id);
        state.songs[song.id] = { status: "queued", percent: 0 };
      }
    }
    changed();
    run();
  }

  // A song is done separating first when separation is installed: its vocals make better timing.
  const waitingForVocals = (songId) => {
    if (!TT.separate || !TT.models.installed("separation")) return false;
    const st = TT.separate.statusOf(songId).status;
    return st === "queued" || st === "working";
  };
  const separating = () => TT.separate && TT.music.list().some((s) => TT.separate.statusOf(s.id).status === "working");

  async function alignOne(songId, pick) {
    const song = TT.songs.get(songId);
    const job = (state.songs[songId] = { status: "working", percent: 0 });
    changed();
    await startWorker(pick);
    const { audio, from } = await audioFor(songId);
    const words = await new Promise((resolve, reject) => {
      worker.onJob = (m) => {
        if (m.id !== songId) return;
        if (m.type === "progress") { job.percent = Math.round(m.done * 100); changed(); }
        else if (m.type === "done") resolve(m.words);
        else if (m.type === "error") reject(new Error(m.message));
      };
      worker.postMessage({ type: "align", id: songId, audio, text: song.lyrics }, [audio.buffer]);
    });
    // Words the model was least sure of aren't kept: a tile simply gets a practice word there.
    const ps = words.map((x) => x.p).sort((a, b) => a - b);
    const floor = (ps[ps.length >> 1] || 0) * 0.25;
    const keep = words.filter((x) => x.p >= floor).map((x) => ({ t: x.t, w: x.w }));
    // the song may have changed while it was being timed
    const now = TT.songs.get(songId);
    if (!now || now.lyrics !== song.lyrics || now.lyricTimesBy === "you") throw new Error("The song changed while it was being timed.");
    await TT.music.setLyricTimes(songId, keep, KEY);
    state.songs[songId] = { status: "done", percent: 100, from, kept: keep.length, of: words.length };
    changed();
  }

  async function run() {
    if (state.running) return;
    state.running = true;
    try {
      for (;;) {
        const pick = await choose();
        if (!pick) { queue = []; break; }
        const next = queue.find((id) => !waitingForVocals(id));
        if (!next) break; // the rest wait for their vocals; separate.js's changes start this again
        if (separating()) break; // one heavy job at a time
        queue = queue.filter((id) => id !== next);
        try {
          await alignOne(next, pick);
        } catch (e) {
          state.songs[next] = { status: "failed", percent: 0, error: (e && e.message) || String(e) };
          changed();
        }
      }
    } finally {
      state.running = false;
      changed();
    }
  }

  TT.align = {
    KEY,
    state: () => state,
    // whether this device has a graphics card WebGPU can use: null until it's known
    gpu: () => gpu,
    supported: () => !!(TT.models && TT.models.supported()),
    // a lyric timing model is installed
    available: () => !!(TT.models && (TT.models.installed("lyrics-gpu") || TT.models.installed("lyrics-small"))),
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },

    // Called once at start, after the added songs are loaded.
    start() {
      hasGpu().then(changed);
      if (!TT.models) return;
      TT.models.onChange(() => {
        if (!TT.align.available()) { queue = []; stopWorker(); changed(); return; }
        if (workerModel && !TT.models.installed(workerModel)) stopWorker();
        queueAll();
      });
      // a song's vocals were made, or separating finished: maybe a song can be timed now
      if (TT.separate) TT.separate.onChange(() => { if (queue.length && !state.running) run(); });
      queueAll();
    },

    // A song was added, or its lyrics changed.
    add() { queueAll(); },
    // A song was deleted.
    forget(songId) {
      queue = queue.filter((x) => x !== songId);
      delete state.songs[songId];
      changed();
    },
    // Times a song again automatically, replacing times the user tapped.
    async retime(songId) {
      await TT.music.setLyricTimes(songId, [], null);
      delete state.songs[songId];
      queueAll();
    },

    // How a song stands: done (by KEY), you (tapped), working (percent), queued, failed, or none.
    statusOf(songId) {
      const song = TT.songs.get(songId);
      if (song && song.lyricTimesBy === "you") return { status: "you" };
      if (song && song.lyricTimesBy === KEY) return { ...(state.songs[songId] || {}), status: "done" };
      return state.songs[songId] || { status: "none" };
    },
    counts() {
      const songs = TT.music ? TT.music.list().filter((s) => wordsOf(s).length >= MIN_WORDS) : [];
      return {
        withLyrics: songs.length,
        auto: songs.filter((s) => s.lyricTimesBy === KEY).length,
        tapped: songs.filter((s) => s.lyricTimesBy === "you").length,
      };
    },
  };
})();
