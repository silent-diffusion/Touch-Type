// Finds when each word of a song's lyrics is sung, for Tiles (align.js runs it). The lyrics are
// known, so this doesn't transcribe the song: it lines the lyric text up with the audio (forced
// alignment). A speech model (wav2vec2, from the lyric timing model the user downloads in Settings
// → Models) gives, for every 20 ms of audio, how likely each letter is; a dynamic program (CTC
// Viterbi) then finds the most likely place for every letter of the lyrics, in order, and so when
// each word starts. It runs on the separated vocals when the song has them, which makes the voice
// much clearer than in the full mix.
//
// Messages in:  { type: "init", base, model, cpu }        base: where the models are; model: its file
//               { type: "align", id, audio, text }        audio: Float32Array, mono 16 kHz; text: the lyrics
// Messages out: { type: "ready", device: "gpu" | "cpu" }   { type: "error", id?, message }
//               { type: "progress", id, done }             done: 0 to 1
//               { type: "done", id, words: [{ t, w, p }] } every lyric word the game uses (TT.lyrics.sequence
//                                                           order): when it starts (s) and how sure (0 to 1)
"use strict";

const RATE = 16000, STRIDE = 320; // the model's output: one frame per 20 ms
const CHUNK = 30 * RATE, CONTEXT = 2 * RATE; // run 30 s at a time, with 2 s either side for context
// the model's letters (wav2vec2-base-960h): 0 is the blank, 4 the word boundary
const VOCAB = { "'": 27, A: 7, B: 24, C: 19, D: 14, E: 5, F: 20, G: 21, H: 11, I: 10, J: 29, K: 26, L: 15, M: 17, N: 9, O: 8, P: 23, Q: 30, R: 13, S: 12, T: 6, U: 16, V: 25, W: 18, X: 28, Y: 22, Z: 31 };
const BLANK = 0, SEP = 4, CLASSES = 32;

let rt = null, session = null, device = null;

async function init(where, model, cpuOnly = false) {
  const base = new URL(where, self.location.href).href;
  importScripts(base + "ort.webgpu.min.js");
  rt = self.ort;
  rt.env.wasm.wasmPaths = base;
  rt.env.wasm.numThreads = self.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined" ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
  let gpu = false;
  try {
    gpu = !cpuOnly && !!(navigator.gpu && (await navigator.gpu.requestAdapter()));
  } catch {}
  const bytes = await (await fetch(base + model)).arrayBuffer();
  const tries = gpu ? [["webgpu"], ["wasm"]] : [["wasm"]];
  const failures = [];
  for (const providers of tries) {
    try {
      session = await rt.InferenceSession.create(bytes, { executionProviders: providers, graphOptimizationLevel: "all" });
      device = providers[0] === "webgpu" ? "gpu" : "cpu";
      return device;
    } catch (e) {
      failures.push(`${providers[0]}: ${(e && e.message) || e}`);
    }
  }
  throw new Error(failures.join("; "));
}

// ---------- the letters: the model's view of the audio ----------

// log-probabilities of each letter for every 20 ms frame: Float32Array(frames * CLASSES)
async function emissions(id, audio) {
  const frames = Math.floor(audio.length / STRIDE);
  const out = new Float32Array(frames * CLASSES).fill(-30);
  out.frames = frames;
  for (let at = 0; at < audio.length; at += CHUNK) {
    const from = Math.max(0, at - CONTEXT), to = Math.min(audio.length, at + CHUNK + CONTEXT);
    const x = audio.slice(from, to);
    // the model expects zero mean and unit variance
    let mean = 0;
    for (let i = 0; i < x.length; i++) mean += x[i];
    mean /= x.length;
    let v = 0;
    for (let i = 0; i < x.length; i++) v += (x[i] - mean) ** 2;
    const sd = Math.sqrt(v / x.length + 1e-7);
    for (let i = 0; i < x.length; i++) x[i] = (x[i] - mean) / sd;
    const res = await session.run({ [session.inputNames[0]]: new rt.Tensor("float32", x, [1, x.length]) });
    const logits = res[session.outputNames[0]];
    const data = logits.data, n = logits.dims[1];
    const f0 = Math.round(from / STRIDE); // the chunk's first frame in the whole song
    const keepFrom = Math.round(at / STRIDE), keepTo = Math.min(frames, Math.round((at + CHUNK) / STRIDE));
    for (let f = keepFrom; f < keepTo; f++) {
      const k = f - f0;
      if (k < 0 || k >= n) continue;
      // log-softmax
      let max = -Infinity;
      for (let c = 0; c < CLASSES; c++) max = Math.max(max, data[k * CLASSES + c]);
      let sum = 0;
      for (let c = 0; c < CLASSES; c++) sum += Math.exp(data[k * CLASSES + c] - max);
      const lse = max + Math.log(sum);
      for (let c = 0; c < CLASSES; c++) out[f * CLASSES + c] = data[k * CLASSES + c] - lse;
    }
    if (typeof logits.dispose === "function") logits.dispose();
    postMessage({ type: "progress", id, done: Math.min(0.9, (0.9 * (at + CHUNK)) / audio.length) });
  }
  return out;
}

// ---------- the lyrics: what has to be found ----------

// The lyric tokens as the model spells them, and for each the game's word (or null for words the
// game leaves out, like "don't" or "a", which still have to be lined up).
function transcript(text) {
  const plain = String(text || "").replace(/\[[^\]]*\]|<[^>]*>/g, " ");
  const toks = [];
  for (const raw of plain.split(/[\s\-–—/]+/)) {
    const letters = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[’‘]/g, "'").replace(/[^A-Z']/g, "").replace(/^'+|'+$/g, "");
    if (!letters) continue;
    const g = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, "");
    toks.push({ letters, word: g.length >= 2 && /^[a-z]+$/.test(g) ? g : null });
  }
  return toks;
}

// ---------- lining them up ----------

// CTC Viterbi: the most likely path through the letters of the lyrics (each may be held, and blanks
// may come between them) over all the frames. Returns each token's first frame and its mean
// probability.
function align(em, toks) {
  const T = em.frames;
  // the label sequence: letters with the word boundary between words; states interleave blanks
  const labels = [], tokOf = [];
  toks.forEach((tk, i) => {
    if (i) { labels.push(SEP); tokOf.push(-1); }
    for (const ch of tk.letters) { labels.push(VOCAB[ch]); tokOf.push(i); }
  });
  const L = labels.length, S = 2 * L + 1;
  if (!L || T < L) return null;
  const NEG = -1e30;
  let prev = new Float64Array(S).fill(NEG), cur = new Float64Array(S);
  const back = new Uint8Array(T * S); // 0: stayed, 1: from s-1, 2: from s-2
  const lab = (s) => (s & 1 ? labels[s >> 1] : BLANK);
  prev[0] = em[BLANK];
  prev[1] = em[lab(1)];
  for (let t = 1; t < T; t++) {
    const row = t * CLASSES;
    // only states that can still reach the end in time, and that can be reached by now
    const sMin = Math.max(0, S - 2 * (T - t)), sMax = Math.min(S - 1, 2 * t + 1);
    cur.fill(NEG);
    for (let s = sMin; s <= sMax; s++) {
      let best = prev[s], from = 0;
      if (s >= 1 && prev[s - 1] > best) { best = prev[s - 1]; from = 1; }
      if (s >= 2 && (s & 1) && lab(s) !== lab(s - 2) && prev[s - 2] > best) { best = prev[s - 2]; from = 2; }
      if (best <= NEG) continue;
      cur[s] = best + em[row + lab(s)];
      back[t * S + s] = from;
    }
    [prev, cur] = [cur, prev];
  }
  // end on the last letter or the blank after it
  let s = prev[S - 1] >= prev[S - 2] ? S - 1 : S - 2;
  const first = new Int32Array(toks.length).fill(-1), last = new Int32Array(toks.length).fill(-1);
  const pSum = new Float64Array(toks.length), pN = new Int32Array(toks.length);
  for (let t = T - 1; t >= 0; t--) {
    if (s & 1) {
      const i = tokOf[s >> 1];
      if (i >= 0) {
        first[i] = t;
        if (last[i] < 0) last[i] = t;
        pSum[i] += Math.exp(em[t * CLASSES + lab(s)]);
        pN[i]++;
      }
    }
    s -= back[t * S + s];
  }
  return { first, last, prob: Array.from(pSum, (v, i) => (pN[i] ? v / pN[i] : 0)) };
}

async function run(id, audio, text) {
  const toks = transcript(text);
  if (!toks.length) throw new Error("The lyrics have no words to time.");
  const em = await emissions(id, audio);
  const res = align(em, toks);
  if (!res) throw new Error("The song is too short for its lyrics.");
  postMessage({ type: "progress", id, done: 1 });
  const words = [];
  toks.forEach((tk, i) => {
    if (tk.word) words.push({ t: Math.round(res.first[i] * STRIDE / RATE * 1000) / 1000, w: tk.word, p: Math.round(res.prob[i] * 100) / 100 });
  });
  return words;
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      postMessage({ type: "ready", device: await init(m.base, m.model, m.cpu) });
    } else if (m.type === "align") {
      postMessage({ type: "done", id: m.id, words: await run(m.id, m.audio, m.text) });
    }
  } catch (err) {
    postMessage({ type: "error", id: m.id, message: (err && err.message) || String(err) });
  }
};
