// Songs you add to Tiles. The file and its beat analysis are kept in IndexedDB on this computer
// (never uploaded) and shared by every profile; scores stay with each profile.
//
// A saved song: { id, name, type, size, added, blob, analysis }
//   analysis — from TT.beatTrack: { method: "auto" | "tap", bpm, beats, down, quiet, duration, rev }
// In the song list an added song's id is "u:" + its saved id.
(() => {
  const STORE = "music";
  const MAX_BYTES = 60 * 1024 * 1024;
  const MAX_SECONDS = 12 * 60;
  const MIN_SECONDS = 20;
  const PREFIX = "u:";

  const metas = new Map(); // saved id -> record without the file
  let decoded = { id: null, buffer: null }; // only the latest song is kept decoded (they're big)

  async function tx(mode, fn) {
    const db = await TT.openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && "result" in req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const cleanName = (name) => String(name || "Song").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Song";
  const savedId = (songId) => (String(songId).startsWith(PREFIX) ? songId.slice(PREFIX.length) : null);
  // A short pause so the progress message gets drawn before the heavy work starts.
  const frame = () => new Promise((r) => setTimeout(r, 40));

  // What Tiles sees: the same shape as a built-in song, with the beats from the analysis.
  function register(meta) {
    const an = meta.analysis;
    TT.songs.register({
      id: PREFIX + meta.id,
      key: `${meta.id}:${an.rev || 1}`,
      user: true,
      title: meta.name,
      composer: "Your music",
      year: "",
      tempo: "YOUR FILE",
      blurb: an.method === "tap"
        ? "You set this beat by tapping along. Tap again any time to redo it."
        : "The beat was found automatically. If the words don't land on it, tap along to set it yourself.",
      bpm: an.bpm,
      bar: TT.beatTrack.BAR,
      beat: 1,
      pickup: 0,
      notes: [],
      beats: TT.beatTrack.toSongBeats(an),
      duration: an.duration,
      buffer: decoded.id === meta.id ? decoded.buffer : null,
    });
  }

  function channelsOf(buffer) {
    const out = [];
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) out.push(buffer.getChannelData(c));
    return out;
  }

  async function decode(blob) {
    const ctx = TT.tilesAudio.get();
    if (!ctx) throw new Error("Sound isn't available here.");
    const data = await blob.arrayBuffer();
    return ctx.decodeAudioData(data);
  }

  function keep(id, buffer) {
    if (decoded.id && decoded.id !== id) {
      const old = TT.songs.get(PREFIX + decoded.id);
      if (old) old.buffer = null;
    }
    decoded = { id, buffer };
    const song = TT.songs.get(PREFIX + id);
    if (song) song.buffer = buffer;
  }

  TT.music = {
    PREFIX,
    isUser: (songId) => !!savedId(songId),

    // Loads the list of added songs (not the audio) and registers them with Tiles.
    async load() {
      let all = [];
      try {
        all = await tx("readonly", (s) => s.getAll());
      } catch {
        return [];
      }
      for (const rec of all || []) {
        const { blob, ...meta } = rec;
        if (!meta.analysis) continue;
        metas.set(meta.id, meta);
        register(meta);
      }
      return this.list();
    },

    list: () => [...metas.values()].sort((a, b) => a.added.localeCompare(b.added)).map((m) => TT.songs.get(PREFIX + m.id)).filter(Boolean),

    // Adds a song from a file. onStep(text) reports progress. Returns the new song's id.
    async importFile(file, onStep = () => {}) {
      if (!file) throw new Error("No file was chosen.");
      if (file.size > MAX_BYTES) throw new Error("That file is too big (the limit is 60 MB).");
      onStep(`Reading ${file.name}…`);
      await frame();
      let buffer;
      try {
        buffer = await decode(file);
      } catch {
        throw new Error("That file couldn't be read as audio. Try an MP3, M4A, WAV, OGG or FLAC file.");
      }
      if (buffer.duration < MIN_SECONDS) throw new Error("That song is too short (it needs at least 20 seconds).");
      if (buffer.duration > MAX_SECONDS) throw new Error("That song is too long (the limit is 12 minutes).");
      onStep("Finding the beat…");
      await frame();
      let analysis;
      try {
        analysis = TT.beatTrack.analyze(channelsOf(buffer), buffer.sampleRate);
      } catch {
        throw new Error("No steady beat could be found in that song.");
      }
      if (analysis.beats.length < 16) throw new Error("No steady beat could be found in that song.");
      analysis.rev = 1;
      const meta = { id: TT.newRoundId(), name: cleanName(file.name), type: file.type, size: file.size, added: new Date().toISOString(), analysis };
      onStep("Saving…");
      await tx("readwrite", (s) => s.put({ ...meta, blob: file }));
      metas.set(meta.id, meta);
      decoded = { id: meta.id, buffer };
      register(meta);
      return PREFIX + meta.id;
    },

    // The decoded audio for an added song, loading it if needed.
    async buffer(songId) {
      const id = savedId(songId);
      if (!id || !metas.has(id)) throw new Error("That song isn't here any more.");
      if (decoded.id === id && decoded.buffer) return decoded.buffer;
      const rec = await tx("readonly", (s) => s.get(id));
      if (!rec || !rec.blob) throw new Error("That song's file is missing.");
      const buffer = await decode(rec.blob);
      keep(id, buffer);
      return buffer;
    },

    // Replaces the found beat with one from tapping along. Returns false if the taps didn't fit.
    async setTaps(songId, taps) {
      const id = savedId(songId);
      const meta = metas.get(id);
      if (!meta) return false;
      const buffer = await this.buffer(songId);
      const an = TT.beatTrack.fromTaps(taps, buffer.duration, (beats) => TT.beatTrack.quietBeats(channelsOf(buffer), buffer.sampleRate, beats));
      if (!an) return false;
      an.rev = (meta.analysis.rev || 1) + 1;
      const rec = await tx("readonly", (s) => s.get(id));
      if (!rec) return false;
      rec.analysis = an;
      await tx("readwrite", (s) => s.put(rec));
      meta.analysis = an;
      register(meta);
      return true;
    },

    async remove(songId) {
      const id = savedId(songId);
      if (!id) return;
      await tx("readwrite", (s) => s.delete(id));
      metas.delete(id);
      if (decoded.id === id) decoded = { id: null, buffer: null };
      TT.songs.unregister(songId);
    },
  };
})();
