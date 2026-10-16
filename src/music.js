// Songs you add to Tiles. The file and its beat analysis are kept in IndexedDB on this computer
// (never uploaded) and shared by every profile; scores stay with each profile.
//
// A saved song: { id, name, type, size, added, blob, analysis, lyrics }
//   lyrics — read from the file when it was added (lyrics.js), or pasted in later; may be empty,
//            and may be LRC text with times
//   lyricTimes — [{ t, w }] from tapping along to the lyrics; beats any times in the lyrics
//   analysis — from TT.beatTrack: { method: "auto" | "tap", bpm, beats, down, quiet, strength, pitch, duration, rev }
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

  // When each sung word starts: tapped along for the words that were tapped (the first ones, in
  // order, since a song can be tapped part way), then any LRC times in the lyrics for the rest.
  function sungWords(meta) {
    const lrc = TT.lyrics.timed(meta.lyrics) || [];
    const taps = (meta.lyricTimes || []).map((x) => ({ t: x.t, w: x.w, tol: 0.25 }));
    if (!taps.length) return lrc;
    const last = taps[taps.length - 1].t;
    return taps.concat(lrc.slice(taps.length).filter((x) => x.t > last));
  }

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
      lyrics: meta.lyrics || "",
      sungWords: sungWords(meta),
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
      let lyrics = "";
      try {
        lyrics = TT.lyrics.fromFile(await file.arrayBuffer()) || "";
      } catch {}
      const meta = { id: TT.newRoundId(), name: cleanName(file.name), type: file.type, size: file.size, added: new Date().toISOString(), analysis, lyrics };
      onStep("Saving…");
      await tx("readwrite", (s) => s.put({ ...meta, blob: file }));
      metas.set(meta.id, meta);
      decoded = { id: meta.id, buffer };
      register(meta);
      // with the separation pack installed, its parts are made in the background
      if (TT.separate) TT.separate.add(PREFIX + meta.id);
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
      // Songs added before beats had strengths and pitches get them now, so their tiles follow the
      // music too.
      const meta = metas.get(id);
      if (!meta.analysis.strength || !meta.analysis.pitch) {
        const an = meta.analysis;
        Object.assign(an, TT.beatTrack.beatFeatures(channelsOf(buffer), buffer.sampleRate, an.beats, an.quiet));
        rec.analysis = an;
        await tx("readwrite", (s) => s.put(rec));
        register(meta);
      }
      return buffer;
    },

    // A fresh decode of an added song, not kept: for separating it in the background without
    // touching the song being played.
    async decodeCopy(songId) {
      const id = savedId(songId);
      const rec = id && (await tx("readonly", (s) => s.get(id)));
      if (!rec || !rec.blob) throw new Error("That song's file is missing.");
      return decode(rec.blob);
    },

    // Replaces the found beat with one from tapping along. Returns false if the taps didn't fit.
    async setTaps(songId, taps) {
      const id = savedId(songId);
      const meta = metas.get(id);
      if (!meta) return false;
      const buffer = await this.buffer(songId);
      const an = TT.beatTrack.fromTaps(taps, buffer.duration, (beats) => TT.beatTrack.quietBeats(channelsOf(buffer), buffer.sampleRate, beats));
      if (!an) return false;
      Object.assign(an, TT.beatTrack.beatFeatures(channelsOf(buffer), buffer.sampleRate, an.beats, an.quiet));
      an.rev = (meta.analysis.rev || 1) + 1;
      const rec = await tx("readonly", (s) => s.get(id));
      if (!rec) return false;
      rec.analysis = an;
      await tx("readwrite", (s) => s.put(rec));
      meta.analysis = an;
      register(meta);
      return true;
    },

    // Saves the times of an added song's lyric words from tapping along ([{ t, w }]); empty clears them.
    async setLyricTimes(songId, times) {
      const id = savedId(songId);
      const meta = metas.get(id);
      if (!meta) return false;
      const rec = await tx("readonly", (s) => s.get(id));
      if (!rec) return false;
      rec.lyricTimes = times.map((x) => ({ t: Math.round(x.t * 1000) / 1000, w: x.w }));
      await tx("readwrite", (s) => s.put(rec));
      meta.lyricTimes = rec.lyricTimes;
      register(meta);
      return true;
    },

    // Sets (or clears) an added song's lyrics. New lyrics drop any tapped times (they were for the old words).
    async setLyrics(songId, text) {
      const id = savedId(songId);
      const meta = metas.get(id);
      if (!meta) return false;
      const lyrics = String(text || "").slice(0, 20000);
      const rec = await tx("readonly", (s) => s.get(id));
      if (!rec) return false;
      if (lyrics !== (rec.lyrics || "")) rec.lyricTimes = [];
      rec.lyrics = lyrics;
      await tx("readwrite", (s) => s.put(rec));
      meta.lyrics = lyrics;
      meta.lyricTimes = rec.lyricTimes || [];
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
      if (TT.separate) await TT.separate.forget(songId);
    },
  };
})();
