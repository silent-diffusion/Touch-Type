// The optional models the user can download in Settings → Models, and the ONNX Runtime files they
// run on. One list for the page (TT.MODELS), Electron's main process (require: electron/models.js)
// and the Apple app (which reads it from the bundled web app).
//
// Only data is ever downloaded: the models' .onnx files, from this app's GitHub releases, each
// checked against its SHA-256. ONNX Runtime is code, so the Apple app bundles it; the desktop app
// downloads it with the first model that needs it (from the separation-pack-1 release, as before).
//
// A model: id; name; use (what it's for); version (a new one downloads again); base (where its
// files are); files: [{ name, size, sha256 }]; folder (the desktop app's folder for it, in its
// data folder); licence (a TT.LICENCES key); runtime: true when it runs on ONNX Runtime;
// gpu: true when it's the one to use with a graphics card (WebGPU), false when it's for the CPU.
(() => {
  const RELEASES = "https://github.com/silent-diffusion/Touch-Type/releases/download/";

  const runtime = {
    base: RELEASES + "separation-pack-1/",
    files: [
      { name: "ort.webgpu.min.js", size: 66416, sha256: "2d0bac4406b97d87c2ee2f279a0e6ad089567e62283d41e7e535a40e5c03d2f5" },
      { name: "ort-wasm-simd-threaded.asyncify.mjs", size: 51407, sha256: "5d25483158d53d8f34d0e9c06a654d56c8dca4ebdf370ea0982ef11315a00e0e" },
      { name: "ort-wasm-simd-threaded.asyncify.wasm", size: 25749873, sha256: "503d17cb7411b79781b9fad1cf0978f03cf06b050c7d399c730e914f473bf549" },
    ],
  };

  const list = [
    {
      id: "separation",
      name: "Song separation",
      use: "Splits the songs you add to Tiles into vocals, drums, bass and other instruments, so the ×4 visuals follow each part, and so lyric timing can listen to the voice on its own.",
      version: 1,
      base: RELEASES + "separation-pack-1/",
      folder: "separation-pack", // the folder it has always had, so packs downloaded before still count
      licence: "separation",
      runtime: true,
      gpu: null,
      files: [
        { name: "vocals.fp16.onnx", size: 19714141, sha256: "db47148ab1c52709ce694893f532c91abfe3edc4d46238939570e036a22878ca" },
        { name: "drums.fp16.onnx", size: 19714140, sha256: "7ae4002e5633634674f74dc3356d5875b0da894d59ce0f60e844bb8f9cb8aa92" },
        { name: "bass.fp16.onnx", size: 19714139, sha256: "ba4c4949a27222492cca49859901a873b4b71461dc48c7c5a51f93d31eb11f55" },
        { name: "other.fp16.onnx", size: 19714140, sha256: "3cc59116cb7195946ab9596d8ca25984d09c0f8a70db8cf85d063132f97bc61d" },
      ],
    },
    {
      id: "lyrics-gpu",
      name: "Lyric timing",
      use: "Finds when each word of a song's lyrics is sung, so Tiles can deal the words you type as they're sung, without tapping along. Runs on the graphics card: a 3-minute song takes seconds.",
      version: 1,
      base: RELEASES + "lyric-timing-1/",
      folder: "lyric-timing",
      licence: "lyrics",
      runtime: true,
      gpu: true,
      files: [
        { name: "wav2vec2-base-960h.fp16.onnx", size: 189192204, sha256: "378348ee38b739cc77e77e3fb8502f0f40ed53da0dbf7401b24c25c8fafe03de" },
      ],
    },
    {
      id: "lyrics-small",
      name: "Lyric timing (small)",
      use: "The same lyric timing in half the size, for computers and devices without a graphics card it can use: it runs on the processor, a few minutes for a 3-minute song.",
      version: 1,
      base: RELEASES + "lyric-timing-1/",
      folder: "lyric-timing-small",
      licence: "lyrics",
      runtime: true,
      gpu: false,
      files: [
        { name: "wav2vec2-base-960h.int8.onnx", size: 95286006, sha256: "a4249bb7b7bcbe391be19980922b0523c0907e976a9e5d5aabfadb40fcea5058" },
      ],
    },
  ];

  const MODELS = { runtime, list, byId: (id) => list.find((m) => m.id === id) || null };
  if (typeof module !== "undefined" && module.exports) module.exports = MODELS;
  else (window.TT = window.TT || {}).MODELS = MODELS;
})();
