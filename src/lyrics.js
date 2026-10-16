// Lyrics for Tiles. A song's lyrics become a pool of words for the game: lower case a-z only
// (accents dropped, words with apostrophes or other characters left out, no repeats).
//
// Songs you add can carry their lyrics inside the file, and they're read when the song is added:
//   MP3: ID3v2 USLT frames (or a TXXX frame named LYRICS)
//   FLAC, OGG Vorbis, Opus: a LYRICS or UNSYNCEDLYRICS comment
//   M4A / MP4: the ©lyr tag
// Nothing goes online; a file without lyrics simply has none (they can be pasted in instead).
(() => {
  // The words of some lyrics, in the order they first appear.
  function words(text) {
    if (!text) return [];
    const seen = new Set();
    const out = [];
    const plain = String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    for (const tok of plain.split(/[\s\-–—/]+/)) {
      const w = tok.replace(/^[^a-z']+|[^a-z']+$/g, ""); // trim punctuation around a word
      if (w.length < 2 || !/^[a-z]+$/.test(w) || seen.has(w)) continue;
      seen.add(w);
      out.push(w);
    }
    return out;
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
    let found = null;
    while (p + head <= end) {
      const id = ascii(b, p, idLen);
      if (!/^[A-Z0-9]+$/.test(id)) break; // padding
      const n = ver === 2 ? (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5]
        : ver === 4 ? ((b[p + 4] & 127) << 21) | ((b[p + 5] & 127) << 14) | ((b[p + 6] & 127) << 7) | (b[p + 7] & 127)
        : (b[p + 4] << 24) | (b[p + 5] << 16) | (b[p + 6] << 8) | b[p + 7];
      const at = p + head, stop = Math.min(end, at + n);
      if (n <= 0) break;
      if (id === "USLT" || id === "ULT") {
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
    return found;
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

  TT.lyrics = { words, fromFile };
})();
