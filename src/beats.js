// Beat tracking for music you add to Tiles. Works out the tempo and where every beat falls from the
// sound itself:
//   1. an onset envelope: how suddenly the sound gets louder, frame by frame (spectral flux)
//   2. the tempo: the beat length that best lines the envelope up with itself (autocorrelation)
//   3. the beats: dynamic programming picks beats that sit on onsets but keep a steady pulse
//      (the method from Ellis, "Beat Tracking by Dynamic Programming", 2007)
//   4. the first beat of each bar: the beat (of four) with the most low-end punch, like a kick drum
// Everything here is plain math on sample arrays, so it can be tested without a browser.
(() => {
  const TARGET_RATE = 11025; // the audio is mixed to mono and slowed to about this rate first
  const N = 512;             // FFT size
  const HOP = 128;           // samples between frames, about 11.6 ms
  const TIGHT = 100;         // how strongly the beat tracker sticks to a steady tempo
  const BAR = 4;             // beats in a bar (imported songs are taken to be in 4)

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const ang = (-2 * Math.PI) / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const xr = re[b] * cr - im[b] * ci;
          const xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = t;
        }
      }
    }
  }

  // Mixes the channels to mono and averages blocks of samples down to about TARGET_RATE.
  function mono(channels, sampleRate) {
    const f = Math.max(1, Math.round(sampleRate / TARGET_RATE));
    const len = Math.floor(channels[0].length / f);
    const x = new Float32Array(len);
    const scale = 1 / (f * channels.length);
    for (let i = 0; i < len; i++) {
      let s = 0;
      for (const ch of channels) for (let k = 0, o = i * f; k < f; k++) s += ch[o + k];
      x[i] = s * scale;
    }
    return { x, rate: sampleRate / f };
  }

  // Takes away the local average, keeps the rises, and scales to a standard deviation of 1.
  function normalize(v, fps) {
    const n = v.length;
    const w = Math.max(1, Math.round(fps * 0.25));
    const sum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) sum[i + 1] = sum[i] + v[i];
    const out = new Float32Array(n);
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - w), b = Math.min(n, i + w + 1);
      out[i] = Math.max(0, v[i] - (sum[b] - sum[a]) / (b - a));
      sq += out[i] * out[i];
    }
    const sd = Math.sqrt(sq / Math.max(1, n)) || 1;
    for (let i = 0; i < n; i++) out[i] /= sd;
    return out;
  }

  function envelope(x, rate) {
    const frames = Math.max(0, Math.floor((x.length - N) / HOP) + 1);
    const fps = rate / HOP;
    const win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    const re = new Float64Array(N), im = new Float64Array(N);
    const prev = new Float64Array(N / 2);
    const flux = new Float32Array(frames), low = new Float32Array(frames), level = new Float32Array(frames);
    const lowBins = Math.max(2, Math.round(160 / (rate / N)));
    for (let f = 0; f < frames; f++) {
      const o = f * HOP;
      let e = 0;
      for (let i = 0; i < N; i++) {
        const v = x[o + i];
        e += v * v;
        re[i] = v * win[i];
        im[i] = 0;
      }
      fft(re, im);
      let s = 0, sl = 0;
      for (let b = 1; b < N / 2; b++) {
        const m = Math.log(1 + 1000 * Math.hypot(re[b], im[b]));
        const d = m - prev[b];
        prev[b] = m;
        if (d > 0) {
          s += d;
          if (b <= lowBins) sl += d;
        }
      }
      flux[f] = s;
      low[f] = sl;
      level[f] = Math.sqrt(e / N);
    }
    return { onset: normalize(flux, fps), low: normalize(low, fps), level, fps };
  }

  // The beat length in frames: the lag where the envelope best matches itself, nudged toward
  // 120 bpm so a song isn't read at double or half its tempo.
  function period(o, fps) {
    const minLag = Math.max(2, Math.floor((fps * 60) / 200));
    const maxLag = Math.ceil((fps * 60) / 50);
    const ac = new Float64Array(maxLag + 2);
    for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
      let s = 0;
      for (let i = 0; i + lag < o.length; i++) s += o[i] * o[i + lag];
      ac[lag] = s / Math.max(1, o.length - lag);
    }
    let best = -Infinity, bestLag = minLag;
    for (let lag = minLag; lag <= maxLag; lag++) {
      // a real beat also lines up at twice its length
      const score = ac[lag] + (2 * lag <= maxLag + 1 ? 0.5 * ac[2 * lag] : 0);
      const bpm = (60 * fps) / lag;
      const w = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
      if (score * w > best) {
        best = score * w;
        bestLag = lag;
      }
    }
    const a = ac[bestLag - 1], b = ac[bestLag], c = ac[bestLag + 1];
    const den = a - 2 * b + c;
    return bestLag + (den < 0 ? (0.5 * (a - c)) / den : 0);
  }

  // Dynamic programming: each frame's best score is its onset strength plus the best earlier beat,
  // minus a penalty for straying from the beat length. Backtracking from the end gives the beats.
  function track(o, P) {
    const n = o.length;
    const C = new Float64Array(n);
    const back = new Int32Array(n).fill(-1);
    const lo = Math.max(1, Math.round(P * 0.5)), hi = Math.round(P * 2);
    const pen = new Float64Array(hi + 1);
    for (let d = lo; d <= hi; d++) pen[d] = TIGHT * Math.log(d / P) ** 2;
    for (let t = 0; t < n; t++) {
      let best = 0, bi = -1;
      for (let d = lo; d <= hi && t - d >= 0; d++) {
        const v = C[t - d] - pen[d];
        if (v > best) {
          best = v;
          bi = t - d;
        }
      }
      C[t] = o[t] + best;
      back[t] = bi;
    }
    let end = Math.max(0, n - Math.round(P));
    for (let t = end; t < n; t++) if (C[t] > C[end]) end = t;
    const out = [];
    for (let t = end; t >= 0; t = back[t]) out.push(t);
    return out.reverse();
  }

  // Beats that keep a steady tempo are snapped to an exact grid; others are smoothed a little.
  function tidy(times) {
    const n = times.length;
    if (n < 4) return times;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let k = 0; k < n; k++) {
      sx += k; sy += times[k]; sxx += k * k; sxy += k * times[k];
    }
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const a = (sy - b * sx) / n;
    let err = 0;
    for (let k = 0; k < n; k++) err += (times[k] - (a + b * k)) ** 2;
    if (Math.sqrt(err / n) < 0.02) return times.map((_, k) => a + b * k);
    return times.map((t, k) => (k === 0 || k === n - 1 ? t : (times[k - 1] + 2 * t + times[k + 1]) / 4));
  }

  // Carries the beats back to the start of the song and on to its end at the nearby beat length.
  function extend(times, duration) {
    if (times.length < 2) return times;
    const out = times.slice();
    const head = out[1] - out[0];
    while (out[0] - head >= 0) out.unshift(out[0] - head);
    const tail = out[out.length - 1] - out[out.length - 2];
    while (out[out.length - 1] + tail <= duration) out.push(out[out.length - 1] + tail);
    return out;
  }

  const median = (arr) => {
    const s = Float64Array.from(arr).sort();
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };

  // The strongest value of an envelope within a couple of frames of time t.
  function near(arr, t, fps) {
    const f = Math.round(t * fps - N / 2 / HOP);
    let m = 0;
    for (let i = Math.max(0, f - 2); i <= Math.min(arr.length - 1, f + 2); i++) m = Math.max(m, arr[i]);
    return m;
  }

  // Bright sounds between the beats (like hi-hats) can pull the tracker half a beat off. If the low
  // end hits clearly harder halfway between the beats, the beats move there.
  function halfShift(times, env) {
    let on = 0, off = 0;
    for (let k = 0; k + 1 < times.length; k++) {
      on += near(env.low, times[k], env.fps);
      off += near(env.low, (times[k] + times[k + 1]) / 2, env.fps);
    }
    if (off <= on * 1.3) return times;
    const out = [];
    for (let k = 0; k + 1 < times.length; k++) out.push((times[k] + times[k + 1]) / 2);
    return out;
  }

  // A slow song with something on every half beat can read at double speed. If the beats are fast
  // and the low end only hits on every other one, keep just those.
  function halveIfDoubled(times, env) {
    if (times.length < 8) return times;
    const gap = (times[times.length - 1] - times[0]) / (times.length - 1);
    if (60 / gap < 110) return times;
    const sums = [0, 0];
    times.forEach((t, k) => { sums[k % 2] += near(env.low, t, env.fps); });
    const keep = sums[0] >= sums[1] ? 0 : 1;
    if (sums[keep] < sums[1 - keep] * 2.5) return times;
    return times.filter((_, k) => k % 2 === keep);
  }

  // Where the first beat of a bar is (0 to 3), and which beats fall in silence.
  function bars(times, env) {
    const { low, onset, level, fps } = env;
    let down = 0, best = -Infinity;
    for (let off = 0; off < BAR; off++) {
      let s = 0, c = 0;
      for (let k = off; k < times.length; k += BAR) {
        s += near(low, times[k], fps) * 2 + near(onset, times[k], fps);
        c++;
      }
      if (c && s / c > best) {
        best = s / c;
        down = off;
      }
    }
    const loud = median(Array.from(level).filter((v) => v > 1e-4));
    const quiet = [];
    times.forEach((t, k) => {
      const f = Math.round(t * fps);
      let s = 0, c = 0;
      for (let i = Math.max(0, f - 4); i <= Math.min(level.length - 1, f + 4); i++) { s += level[i]; c++; }
      if (!c || s / c < loud * 0.12) quiet.push(k);
    });
    return { down, quiet };
  }

  // The whole analysis. channels: Float32Arrays of samples. Returns what gets saved with a song.
  function analyze(channels, sampleRate) {
    const { x, rate } = mono(channels, sampleRate);
    const duration = channels[0].length / sampleRate;
    const env = envelope(x, rate);
    if (env.onset.length < env.fps * 8) throw new Error("too short");
    const P = period(env.onset, env.fps);
    const frames = track(env.onset, P);
    // A frame's rise shows up slightly before the sound itself starts, so beats move 6 ms later.
    const toSec = (f) => (f * HOP + N / 2) / rate + 0.006;
    const times = extend(halveIfDoubled(halfShift(tidy(frames.map(toSec)), env), env), duration - 0.05).filter((t) => t >= 0 && t <= duration);
    const { down, quiet } = bars(times, env);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    return {
      method: "auto",
      bpm: Math.round((60 / median(gaps)) * 10) / 10,
      beats: times.map((t) => Math.round(t * 1000) / 1000),
      down,
      quiet,
      duration,
    };
  }

  // Beats from tapping along. taps: song times in seconds. The first tap is taken as the first
  // beat of a bar. Returns the same shape as analyze(), or null with too few usable taps.
  function fromTaps(taps, duration, quietFrom) {
    const t = taps.slice().sort((a, b) => a - b);
    if (t.length < 8) return null;
    const gaps = t.slice(1).map((v, i) => v - t[i]).filter((g) => g > 0.2 && g < 2);
    if (gaps.length < 6) return null;
    const P = median(gaps);
    // Number every tap by the beat it belongs to, then fit a straight line through them.
    const pts = t.map((v) => [Math.round((v - t[0]) / P), v]);
    const n = pts.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const [k, v] of pts) {
      sx += k; sy += v; sxx += k * k; sxy += k * v;
    }
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const a = (sy - b * sx) / n;
    if (!(b > 0.2 && b < 2)) return null;
    const first = Math.ceil(-a / b);
    const beats = [];
    for (let k = first; a + k * b <= duration; k++) beats.push(Math.round((a + k * b) * 1000) / 1000);
    const down = (((0 - first) % BAR) + BAR) % BAR;
    const quiet = quietFrom ? quietFrom(beats) : [];
    return { method: "tap", bpm: Math.round((60 / b) * 10) / 10, beats, down, quiet, duration };
  }

  // Which beats fall in near silence, worked out straight from the samples (used after tapping).
  function quietBeats(channels, sampleRate, beats) {
    const ch = channels[0];
    const rms = (t) => {
      const a = Math.max(0, Math.floor((t - 0.05) * sampleRate)), b = Math.min(ch.length, Math.floor((t + 0.05) * sampleRate));
      let s = 0;
      for (let i = a; i < b; i += 4) s += ch[i] * ch[i];
      return Math.sqrt(s / Math.max(1, (b - a) / 4));
    };
    const levels = beats.map(rms);
    const loud = median(levels.filter((v) => v > 1e-4));
    return levels.map((v, k) => (v < loud * 0.12 ? k : -1)).filter((k) => k >= 0);
  }

  // Turns a saved analysis into the beat list Tiles charts from (the same shape built-in songs use).
  function toSongBeats(an) {
    const quiet = new Set(an.quiet || []);
    return an.beats.map((t, k) => {
      const next = an.beats[k + 1] ?? t + (t - (an.beats[k - 1] ?? t - 0.5));
      const loud = !quiet.has(k);
      return { t, down: k >= an.down && (k - an.down) % BAR === 0, mel: loud, any: loud, len: next - t };
    });
  }

  TT.beatTrack = { analyze, fromTaps, quietBeats, toSongBeats, BAR, _internal: { mono, envelope, period, track } };
})();
