// Splits a song into its four parts (vocals, drums, bass, other) for Tiles' ×4 visuals, off the
// main thread. It runs Deezer's Spleeter 4stems model (ONNX, from the separation pack the user
// downloads in Settings) with ONNX Runtime Web: on the GPU through WebGPU when there is one,
// otherwise on the CPU.
//
// The model takes and returns magnitude spectra, so the transform is done here (see separate.js
// for the pack): a periodic Hann STFT, frame 4096 and hop 1024, of 44.1 kHz stereo; the first 1024
// of 2049 bins go in, 512 frames at a time. Spleeter's soft ratio mask across the four estimates is
// applied to the original spectrum (keeping its phase), the bins above the model's are given each
// frame's average mask, and the inverse STFT is overlap-added as it goes. Each part comes out mono
// at 11,025 Hz as 16-bit samples: only the visuals use them, and that keeps a song's parts small.
//
// Messages in:  { type: "init", base, cpu }                   base: where the pack's files are; cpu: don't use the GPU
//               { type: "separate", id, left, right }        Float32Arrays at 44.1 kHz
// Messages out: { type: "ready", device: "gpu" | "cpu" }   { type: "error", id?, message }
//               { type: "progress", id, done }              done: 0 to 1
//               { type: "done", id, rate, stems: { vocals, drums, bass, other } }   Int16Arrays
"use strict";

const STEMS = ["vocals", "drums", "bass", "other"];
const N = 4096, HOP = 1024, BINS = N / 2 + 1, F = 1024, T = 512, PAD = N - HOP;
const RATE_IN = 44100, DOWN = 4, RATE_OUT = RATE_IN / DOWN;

let rt = null, sessions = null, device = null; // rt: ONNX Runtime (it defines the global ort)

// ---------- the FFT: radix-2, in place, for N points ----------

const LOG = Math.log2(N);
const REV = new Uint32Array(N);
for (let i = 0; i < N; i++) {
  let r = 0;
  for (let b = 0; b < LOG; b++) r |= ((i >> b) & 1) << (LOG - 1 - b);
  REV[i] = r;
}
const COS = new Float64Array(N / 2), SIN = new Float64Array(N / 2);
for (let i = 0; i < N / 2; i++) {
  COS[i] = Math.cos((2 * Math.PI * i) / N);
  SIN[i] = Math.sin((2 * Math.PI * i) / N);
}
// sign -1 forward, +1 inverse (unscaled)
function fft(re, im, sign) {
  for (let i = 0; i < N; i++) {
    const j = REV[i];
    if (j > i) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let start = 0; start < N; start += size) {
      for (let k = 0; k < half; k++) {
        const c = COS[k * step], s = sign * SIN[k * step];
        const a = start + k, b = a + half;
        const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
}

// periodic Hann (N + 1 points, the last dropped), and what overlapping windows add up to
const W = new Float64Array(N);
for (let i = 0; i < N; i++) W[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
// the overlap-added squared window: the same at every sample once N / HOP frames overlap (1.5)
let WSUM = 0;
for (let k = 0; k < N / HOP; k++) WSUM += W[(k * HOP + 7) % N] ** 2;

// ---------- the model ----------

async function init(where, cpuOnly = false) {
  const base = new URL(where, self.location.href).href; // the runtime needs a full address for its files
  importScripts(base + "ort.webgpu.min.js");
  rt = self.ort;
  rt.env.wasm.wasmPaths = base;
  rt.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
  let gpu = false;
  try {
    gpu = !cpuOnly && !!(navigator.gpu && (await navigator.gpu.requestAdapter()));
  } catch {}
  sessions = {};
  const tries = gpu ? [["webgpu"], ["wasm"]] : [["wasm"]];
  const failures = [];
  for (const providers of tries) {
    try {
      for (const s of STEMS) {
        const model = await (await fetch(base + s + ".fp16.onnx")).arrayBuffer();
        sessions[s] = await rt.InferenceSession.create(model, { executionProviders: providers, graphOptimizationLevel: "all" });
      }
      device = providers[0] === "webgpu" ? "gpu" : "cpu";
      return device;
    } catch (e) {
      sessions = {};
      failures.push(`${providers[0]}: ${(e && e.message) || e}`);
      if (providers[0] === "wasm") throw new Error(failures.join("; "));
    }
  }
}

// ---------- separating ----------

async function separate(id, left, right) {
  const n = left.length;
  const frames = Math.ceil((PAD + n) / HOP);
  const outLen = Math.ceil(n / DOWN);
  const out = {};
  for (const s of STEMS) out[s] = new Float32Array(outLen);
  // the padded input: PAD zeros in front
  const sample = (ch, i) => (i >= PAD && i < PAD + n ? ch[i - PAD] : 0);
  // each part's overlap-add, N samples ahead of what's been written out
  const acc = {};
  for (const s of STEMS) acc[s] = new Float64Array(N);
  const re = new Float64Array(N), im = new Float64Array(N);
  // one chunk's spectra (both channels, all bins) and the model's input
  const specRe = [new Float32Array(T * BINS), new Float32Array(T * BINS)];
  const specIm = [new Float32Array(T * BINS), new Float32Array(T * BINS)];
  const mags = new Float32Array(2 * T * F);
  // one frame's masks: [channel][part] over the model's bins, and their averages
  const masks = [0, 1].map(() => STEMS.map(() => new Float32Array(F)));
  const avgs = [new Float64Array(4), new Float64Array(4)];
  let emitted = 0; // padded-input samples written out so far
  const timing = { model: 0, total: performance.now() };

  for (let f0 = 0; f0 < frames; f0 += T) {
    const count = Math.min(T, frames - f0);
    mags.fill(0);
    for (let t = 0; t < count; t++) {
      // Both channels in one transform: left as the real part, right as the imaginary, then pulled
      // apart by symmetry (each channel's spectrum is conjugate-symmetric, being real).
      const at = (f0 + t) * HOP;
      for (let i = 0; i < N; i++) {
        re[i] = sample(left, at + i) * W[i];
        im[i] = sample(right, at + i) * W[i];
      }
      fft(re, im, -1);
      const o = t * BINS, mL = t * F, mR = (T + t) * F;
      for (let k = 0; k < BINS; k++) {
        const j = (N - k) & (N - 1);
        const zr = re[k], zi = im[k], wr = re[j], wi = im[j];
        const lr = (zr + wr) / 2, li = (zi - wi) / 2, rr = (zi + wi) / 2, ri = (wr - zr) / 2;
        specRe[0][o + k] = lr; specIm[0][o + k] = li;
        specRe[1][o + k] = rr; specIm[1][o + k] = ri;
        if (k < F) {
          mags[mL + k] = Math.hypot(lr, li);
          mags[mR + k] = Math.hypot(rr, ri);
        }
      }
    }
    // the four estimates
    const est = {};
    const input = new rt.Tensor("float32", mags, [2, 1, T, F]);
    const m0 = performance.now();
    for (const s of STEMS) {
      const result = await sessions[s].run({ x: input });
      est[s] = result.y.data;
    }
    timing.model += performance.now() - m0;
    // masks, then each part's frames back to sound
    for (let t = 0; t < count; t++) {
      // Spleeter's ratio masks for this frame, per channel and part; above the model's bins, each
      // mask's average over the frame
      for (let c = 0; c < 2; c++) {
        const m = (c * T + t) * F;
        for (let k = 0; k < F; k++) {
          let total = 1e-10;
          for (let q = 0; q < 4; q++) total += est[STEMS[q]][m + k] ** 2;
          for (let q = 0; q < 4; q++) masks[c][q][k] = (est[STEMS[q]][m + k] ** 2 + 1e-10 / 4) / total;
        }
        for (let q = 0; q < 4; q++) {
          let sum = 0;
          const mk = masks[c][q];
          for (let k = 0; k < F; k++) sum += mk[k];
          avgs[c][q] = sum / F;
        }
      }
      const o = t * BINS;
      // Two parts per inverse transform: the first as the real part, the second as the imaginary
      // (both are real sounds, so they come back apart).
      for (let pair = 0; pair < 4; pair += 2) {
        for (let k = 0; k < BINS; k++) {
          let ar = 0, ai = 0, br = 0, bi = 0;
          for (let c = 0; c < 2; c++) {
            const xr = specRe[c][o + k], xi = specIm[c][o + k];
            const ma = k < F ? masks[c][pair][k] : avgs[c][pair];
            const mb = k < F ? masks[c][pair + 1][k] : avgs[c][pair + 1];
            ar += xr * ma; ai += xi * ma; br += xr * mb; bi += xi * mb;
          }
          // mono: the two channels averaged
          ar *= 0.5; ai *= 0.5; br *= 0.5; bi *= 0.5;
          re[k] = ar - bi;
          im[k] = ai + br;
          if (k > 0 && k < BINS - 1) {
            // the conjugate-symmetric halves of both parts, combined the same way
            re[N - k] = ar + bi;
            im[N - k] = br - ai;
          }
        }
        fft(re, im, 1);
        const a = acc[STEMS[pair]], b = acc[STEMS[pair + 1]];
        for (let i = 0; i < N; i++) {
          a[i] += (re[i] / N) * W[i];
          b[i] += (im[i] / N) * W[i];
        }
      }
      // the first HOP samples are finished: no later frame reaches them
      for (const s of STEMS) {
        const a = acc[s], o2 = out[s];
        for (let i = 0; i < HOP; i++) {
          const p = emitted + i - PAD;
          if (p >= 0 && p < n) o2[(p / DOWN) | 0] += a[i] / WSUM / DOWN;
        }
        a.copyWithin(0, HOP);
        a.fill(0, N - HOP);
      }
      emitted += HOP;
    }
    postMessage({ type: "progress", id, done: Math.min(1, (f0 + count) / frames) });
  }
  // what's left in the overlap-add
  for (const s of STEMS) {
    const a = acc[s], o2 = out[s];
    for (let i = 0; i < N; i++) {
      const p = emitted + i - PAD;
      if (p >= 0 && p < n) o2[(p / DOWN) | 0] += a[i] / WSUM / DOWN;
    }
  }
  const stems = {};
  for (const s of STEMS) {
    const pcm = new Int16Array(outLen);
    const src = out[s];
    for (let i = 0; i < outLen; i++) pcm[i] = Math.max(-32767, Math.min(32767, Math.round(src[i] * 32767)));
    stems[s] = pcm;
  }
  timing.total = performance.now() - timing.total;
  return { stems, timing };
}

let chain = Promise.resolve();
self.onmessage = (e) => {
  const msg = e.data;
  chain = chain.then(async () => {
    try {
      if (msg.type === "init") postMessage({ type: "ready", device: await init(msg.base, msg.cpu) });
      else if (msg.type === "separate") {
        const { stems, timing } = await separate(msg.id, msg.left, msg.right);
        postMessage({ type: "done", id: msg.id, rate: RATE_OUT, stems, timing }, STEMS.map((s) => stems[s].buffer));
      }
    } catch (err) {
      postMessage({ type: "error", id: msg.id, message: String((err && err.message) || err) });
    }
  });
};
