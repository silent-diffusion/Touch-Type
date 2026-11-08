// Finds a song's beat (beats.js) off the page's main thread, so adding a song doesn't freeze the
// app while a whole song is analysed. Messages (see music.js, runBeats):
//   in:  { id, op: "analyze", channels, sampleRate }
//        { id, op: "features", channels, sampleRate, beats, quiet }
//   out: { id, type: "progress", done }   0 to 1 (analyze only)
//        { id, type: "done", result }
//        { id, type: "error", message }
self.TT = {};
importScripts("beats.js");

self.onmessage = (e) => {
  const m = e.data;
  try {
    let result;
    if (m.op === "analyze") {
      let last = -1;
      result = TT.beatTrack.analyze(m.channels, m.sampleRate, (done) => {
        // a message for every whole percent is plenty
        const pct = Math.floor(done * 100);
        if (pct !== last) { last = pct; postMessage({ id: m.id, type: "progress", done }); }
      });
    } else if (m.op === "features") {
      result = TT.beatTrack.beatFeatures(m.channels, m.sampleRate, m.beats, m.quiet);
    } else throw new Error(`unknown op ${m.op}`);
    postMessage({ id: m.id, type: "done", result });
  } catch (err) {
    postMessage({ id: m.id, type: "error", message: (err && err.message) || String(err) });
  }
};
