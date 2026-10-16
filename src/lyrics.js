// Lyrics for Tiles. A song's lyrics become a pool of words for the game: lower case a-z only
// (accents dropped, words with apostrophes or other characters left out, no repeats).
//
// Songs you add can carry their lyrics inside the file, and they're read when the song is added:
//   MP3: ID3v2 USLT frames (or a TXXX frame named LYRICS)
//   FLAC, OGG Vorbis, Opus: a LYRICS or UNSYNCEDLYRICS comment
//   M4A / MP4: the ©lyr tag
// Nothing goes online; a file without lyrics simply has none (they can be pasted in instead).
//
// Timed lyrics make sung words land on the tile that falls as they're sung. They come as LRC text
// ("[01:23.45] a line", or "<01:23.45>" before each word in enhanced LRC), pasted in or embedded in
// the file, or as an MP3's synced-lyrics frame (SYLT), which is turned into LRC when it's read.
(() => {
  const TAG = /\[(\d+):(\d+(?:[.:]\d+)?)\]|<(\d+):(\d+(?:[.:]\d+)?)>|\[[a-z]+:[^\]]*\]/gi;

  // One word as the game uses it: lower case a-z, accents dropped, punctuation trimmed. Null for
  // anything else (apostrophes, digits, single letters).
  function clean(tok) {
    const w = String(tok).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, "");
    return w.length >= 2 && /^[a-z]+$/.test(w) ? w : null;
  }
  const split = (text) => String(text || "").replace(TAG, " ").split(/[\s\-–—/]+/);

  // The words of some lyrics in the order they're sung, repeats and all.
  const sequence = (text) => split(text).map(clean).filter(Boolean);

  // The different words of some lyrics, in the order they first appear.
  const words = (text) => [...new Set(sequence(text))];

  // A rough count of a word's syllables (vowel groups), to spread a line's words over its time.
  const syllables = (w) => Math.max(1, (w.replace(/e$/, "").match(/[aeiouy]+/g) || []).length);

  // Timed words from LRC text: [{ t (seconds), w, tol }], or null if it has no time tags. tol is
  // how close (seconds) a word must be to a tile to be dealt to it: tight when each word is timed,
  // looser when only lines are and the words are spread over the line.
  function timed(text) {
    if (!text || !/\[\d+:\d+(?:[.:]\d+)?\]/.test(text)) return null;
    const sec = (m, s) => Number(m) * 60 + Number(String(s).replace(":", "."));
    let offset = 0;
    const off = /\[offset:\s*([+-]?\d+)\]/i.exec(text);
    if (off) offset = Number(off[1]) / 1000; // LRC offset: positive means the lyrics come sooner
    const lines = [];
    for (const raw of String(text).split(/\r?\n/)) {
      const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
      if (!stamps.length) continue;
      const body = raw.replace(/\[[^\]]*\]/g, "");
      for (const st of stamps) lines.push({ t: sec(st[1], st[2]) - offset, body });
    }
    lines.sort((a, b) => a.t - b.t);
    const out = [];
    lines.forEach((line, li) => {
      // enhanced LRC: a time before each word
      if (/<\d+:\d+/.test(line.body)) {
        for (const m of line.body.matchAll(/<(\d+):(\d+(?:[.:]\d+)?)>\s*([^<]*)/g)) {
          const ws = split(m[3]).map(clean).filter(Boolean);
          ws.forEach((w, k) => out.push({ t: sec(m[1], m[2]) - offset + k * 0.25, w, tol: k ? 0.35 : 0.2 }));
        }
        return;
      }
      // a timed line: its words spread over the line by syllables, at most ~0.3 s a syllable
      // (words the game skips, like "don't", still take their share of the line)
      const toks = split(line.body).filter((x) => /[a-z]/i.test(x));
      if (!toks.some(clean)) return;
      const next = li + 1 < lines.length ? lines[li + 1].t : line.t + 4;
      const size = (x) => syllables(x.toLowerCase().replace(/[^a-z]/g, ""));
      const total = toks.reduce((n, x) => n + size(x), 0);
      const span = Math.min(Math.max(0, next - line.t) * 0.9, total * 0.3);
      let at = 0;
      for (const x of toks) {
        const w = clean(x);
        if (w) out.push({ t: line.t + (span * at) / total, w, tol: 0.35 });
        at += size(x);
      }
    });
    return out.length ? out : null;
  }
  // ---------- reading lyrics from a file ----------

  const latin1 = new TextDecoder("latin1");
  const utf8 = new TextDecoder("utf-8");
  const ascii = (b, at, n) => String.fromCharCode(...b.subarray(at, at + n));

  // ID3v2 text in one of its four encodings. Returns [text, bytes used up to and including the end mark].
  function id3Text(b, at, end, enc, terminated) {
    const wide = enc === 1 || enc === 2;
    let stop = end;
    if (terminated) {
      for (let i = at; i < end; i += wide ? 2 : 1) {
        if (b[i] === 0 && (!wide || b[i + 1] === 0)) { stop = i; break; }
      }
    }
    const raw = b.subarray(at, stop);
    let text;
    if (enc === 0) text = latin1.decode(raw);
    else if (enc === 3) text = utf8.decode(raw);
    else {
      let le = enc === 1, from = 0;
      if (enc === 1 && raw.length >= 2) {
        if (raw[0] === 0xfe && raw[1] === 0xff) { le = false; from = 2; }
        else if (raw[0] === 0xff && raw[1] === 0xfe) { le = true; from = 2; }
      }
      text = new TextDecoder(le ? "utf-16le" : "utf-16be").decode(raw.subarray(from));
    }
    return [text, stop + (terminated ? (wide ? 2 : 1) : 0) - at];
  }

  function id3(b) {
    if (ascii(b, 0, 3) !== "ID3") return null;
    const ver = b[3];
    const size = ((b[6] & 127) << 21) | ((b[7] & 127) << 14) | ((b[8] & 127) << 7) | (b[9] & 127);
    let p = 10;
    const end = Math.min(b.length, 10 + size);
    if (b[5] & 0x40 && ver >= 3) {
      // an extended header: skip it
      const ext = ver === 4 ? ((b[10] & 127) << 21) | ((b[11] & 127) << 14) | ((b[12] & 127) << 7) | (b[13] & 127) : ((b[10] << 24) | (b[11] << 16) | (b[12] << 8) | b[13]) + 4;
      p += ext;
    }
    const idLen = ver === 2 ? 3 : 4;
    const head = ver === 2 ? 6 : 10;
    let found = null, synced = null;
    while (p + head <= end) {
      const id = ascii(b, p, idLen);
      if (!/^[A-Z0-9]+$/.test(id)) break; // padding
      const n = ver === 2 ? (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5]
        : ver === 4 ? ((b[p + 4] & 127) << 21) | ((b[p + 5] & 127) << 14) | ((b[p + 6] & 127) << 7) | (b[p + 7] & 127)
        : (b[p + 4] << 24) | (b[p + 5] << 16) | (b[p + 6] << 8) | b[p + 7];
      const at = p + head, stop = Math.min(end, at + n);
      if (n <= 0) break;
      if ((id === "SYLT" || id === "SLT") && b[at + 4] === 2) {
        // synced lyrics, timed in milliseconds: become LRC lines, which beat any unsynced lyrics
        const enc = b[at];
        let q = at + 6;
        q += id3Text(b, q, stop, enc, true)[1]; // the description
        const lines = [];
        while (q < stop) {
          const [text, used] = id3Text(b, q, stop, enc, true);
          q += used;
          if (q + 4 > stop) break;
          const ms = (b[q] << 24) | (b[q + 1] << 16) | (b[q + 2] << 8) | b[q + 3];
          q += 4;
          const s = ms / 1000;
          if (text.trim()) lines.push(`[${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(2).padStart(5, "0")}]${text.trim()}`);
        }
        if (lines.length) synced = lines.join("\n");
      } else if (id === "USLT" || id === "ULT") {
        // encoding, 3-letter language, a description, then the lyrics
        const enc = b[at];
        const [, used] = id3Text(b, at + 4, stop, enc, true);
        const [text] = id3Text(b, at + 4 + used, stop, enc, false);
        if (text.trim() && (!found || text.length > found.length)) found = text;
      } else if (id === "TXXX" || id === "TXX") {
        const enc = b[at];
        const [desc, used] = id3Text(b, at + 1, stop, enc, true);
        if (/^(unsynced)?lyrics$/i.test(desc.trim())) {
          const [text] = id3Text(b, at + 1 + used, stop, enc, false);
          if (text.trim() && !found) found = text;
        }
      }
      p = stop;
    }
    return synced || found;
  }

  // Vorbis-style comments (FLAC, OGG, Opus): little-endian lengths, "KEY=value" in UTF-8.
  function vorbisComments(b, at) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (at + 8 > b.length) return null;
    let p = at + 4 + v.getUint32(at, true);
    if (p + 4 > b.length) return null;
    const count = v.getUint32(p, true);
    p += 4;
    for (let i = 0; i < count && p + 4 <= b.length; i++) {
      const n = v.getUint32(p, true);
      p += 4;
      const entry = utf8.decode(b.subarray(p, Math.min(b.length, p + n)));
      p += n;
      const eq = entry.indexOf("=");
      if (eq > 0 && /^(unsynced)?lyrics$/i.test(entry.slice(0, eq)) && entry.slice(eq + 1).trim()) return entry.slice(eq + 1);
    }
    return null;
  }

  function flac(b) {
    if (ascii(b, 0, 4) !== "fLaC") return null;
    let p = 4;
    while (p + 4 <= b.length) {
      const last = b[p] & 0x80, type = b[p] & 0x7f;
      const n = (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
      if (type === 4) return vorbisComments(b.subarray(p + 4, p + 4 + n), 0);
      if (last) break;
      p += 4 + n;
    }
    return null;
  }

  // OGG: join the first pages' contents, then find the comment packet (Vorbis or Opus).
  function ogg(b) {
    if (ascii(b, 0, 4) !== "OggS") return null;
    const parts = [];
    let p = 0, total = 0;
    for (let page = 0; page < 64 && p + 27 <= b.length && ascii(b, p, 4) === "OggS"; page++) {
      const segs = b[p + 26];
      let n = 0;
      for (let i = 0; i < segs; i++) n += b[p + 27 + i];
      const at = p + 27 + segs;
      parts.push(b.subarray(at, at + n));
      total += n;
      p = at + n;
      if (total > 4 * 1024 * 1024) break;
    }
    const all = new Uint8Array(total);
    let o = 0;
    for (const part of parts) { all.set(part, o); o += part.length; }
    for (let i = 0; i + 8 < all.length; i++) {
      if (all[i] === 3 && ascii(all, i + 1, 6) === "vorbis") return vorbisComments(all, i + 7);
      if (ascii(all, i, 8) === "OpusTags") return vorbisComments(all, i + 8);
    }
    return null;
  }

  // MP4 / M4A: moov > udta > meta > ilst > ©lyr > data.
  function mp4(b) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const boxes = (from, to) => {
      const out = [];
      let p = from;
      while (p + 8 <= to) {
        let size = v.getUint32(p);
        const type = ascii(b, p + 4, 4);
        let head = 8;
        if (size === 1 && p + 16 <= to) { size = Number(v.getBigUint64(p + 8)); head = 16; }
        else if (size === 0) size = to - p;
        if (size < head) break;
        out.push({ type, at: p + head, end: Math.min(to, p + size) });
        p += size;
      }
      return out;
    };
    const top = boxes(0, b.length);
    if (!top.some((x) => x.type === "ftyp")) return null;
    const down = (list, type) => list.find((x) => x.type === type);
    const moov = down(top, "moov");
    const udta = moov && down(boxes(moov.at, moov.end), "udta");
    const meta = udta && down(boxes(udta.at, udta.end), "meta");
    const ilst = meta && down(boxes(meta.at + 4, meta.end), "ilst"); // meta has 4 bytes of version and flags
    const lyr = ilst && boxes(ilst.at, ilst.end).find((x) => x.type === "©lyr");
    const data = lyr && down(boxes(lyr.at, lyr.end), "data");
    return data ? utf8.decode(b.subarray(data.at + 8, data.end)) : null;
  }

  // The lyrics inside an audio file, or null. bytes: an ArrayBuffer of the whole file.
  function fromFile(bytes) {
    const b = new Uint8Array(bytes);
    try {
      return id3(b) || flac(b) || ogg(b) || mp4(b) || null;
    } catch {
      return null;
    }
  }

  TT.lyrics = { clean, words, sequence, timed, fromFile };
})();
