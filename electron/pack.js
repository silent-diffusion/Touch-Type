// The separation pack: the files Tiles uses to split songs you add into vocals, drums, bass and
// other instruments (src/separate.js). It isn't part of the app: it's downloaded from this app's
// GitHub releases only when the user clicks Download in Settings, into the app's data folder, and
// it can be removed again there. Each file is checked against its SHA-256 before it's kept.
//
// The page reaches the installed files at ttpack://pack/<file> (registered in main.js).
const { app, net } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PACK = {
  version: 1,
  base: "https://github.com/silent-diffusion/Touch-Type/releases/download/separation-pack-1/",
  files: [
    { name: "vocals.fp16.onnx", size: 19714141, sha256: "db47148ab1c52709ce694893f532c91abfe3edc4d46238939570e036a22878ca" },
    { name: "drums.fp16.onnx", size: 19714140, sha256: "7ae4002e5633634674f74dc3356d5875b0da894d59ce0f60e844bb8f9cb8aa92" },
    { name: "bass.fp16.onnx", size: 19714139, sha256: "ba4c4949a27222492cca49859901a873b4b71461dc48c7c5a51f93d31eb11f55" },
    { name: "other.fp16.onnx", size: 19714140, sha256: "3cc59116cb7195946ab9596d8ca25984d09c0f8a70db8cf85d063132f97bc61d" },
    { name: "ort.webgpu.min.js", size: 66416, sha256: "2d0bac4406b97d87c2ee2f279a0e6ad089567e62283d41e7e535a40e5c03d2f5" },
    { name: "ort-wasm-simd-threaded.asyncify.mjs", size: 51407, sha256: "5d25483158d53d8f34d0e9c06a654d56c8dca4ebdf370ea0982ef11315a00e0e" },
    { name: "ort-wasm-simd-threaded.asyncify.wasm", size: 25749873, sha256: "503d17cb7411b79781b9fad1cf0978f03cf06b050c7d399c730e914f473bf549" },
    { name: "NOTICE.txt", size: 15141, sha256: "1903baad5fc7dd0d9a5b6789dbc3c3048b31f64f31233757d8fdd6f1fc42059b" },
  ],
};
const TOTAL = PACK.files.reduce((s, f) => s + f.size, 0);
const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".onnx": "application/octet-stream", ".txt": "text/plain; charset=utf-8" };

const dir = () => path.join(app.getPath("userData"), "separation-pack");
const marker = () => path.join(dir(), "installed.json");

// status: none | downloading | installed | error
const state = { status: "none", percent: 0, error: null, size: TOTAL, version: PACK.version };
let send = () => {};
let job = null; // { cancelled }

function set(patch) {
  Object.assign(state, patch);
  send({ ...state });
}

// installed when the marker says this version, and every file is there at its size
function check() {
  try {
    const m = JSON.parse(fs.readFileSync(marker(), "utf8"));
    const ok = m.version === PACK.version && PACK.files.every((f) => fs.statSync(path.join(dir(), f.name)).size === f.size);
    if (ok) return set({ status: "installed", percent: 100, error: null });
  } catch {}
  if (state.status !== "downloading") set({ status: "none", percent: 0 });
}

async function fetchFile(f, onBytes, cancelled) {
  const res = await net.fetch(PACK.base + f.name, { cache: "no-store" });
  if (!res.ok) throw new Error(`The download of ${f.name} failed (${res.status}).`);
  const tmp = path.join(dir(), f.name + ".part");
  const out = fs.createWriteStream(tmp);
  const hash = crypto.createHash("sha256");
  const reader = res.body.getReader();
  let got = 0;
  try {
    for (;;) {
      if (cancelled()) throw new Error("cancelled");
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      got += value.length;
      onBytes(value.length);
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once("drain", r));
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  if (got !== f.size || hash.digest("hex") !== f.sha256) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`${f.name} didn't download correctly. Try again.`);
  }
  fs.renameSync(tmp, path.join(dir(), f.name));
}

async function install() {
  if (state.status === "downloading" || state.status === "installed") return;
  const me = { cancelled: false };
  job = me;
  set({ status: "downloading", percent: 0, error: null });
  try {
    fs.mkdirSync(dir(), { recursive: true });
    let done = 0;
    for (const f of PACK.files) {
      const have = path.join(dir(), f.name);
      // a file kept from an earlier, interrupted download doesn't need fetching again
      if (fs.existsSync(have) && fs.statSync(have).size === f.size && crypto.createHash("sha256").update(fs.readFileSync(have)).digest("hex") === f.sha256) {
        done += f.size;
        continue;
      }
      await fetchFile(f, (n) => {
        done += n;
        const percent = Math.floor((done / TOTAL) * 100);
        if (percent !== state.percent) set({ percent });
      }, () => me.cancelled);
    }
    fs.writeFileSync(marker(), JSON.stringify({ version: PACK.version, installed: new Date().toISOString() }));
    set({ status: "installed", percent: 100 });
  } catch (e) {
    if (me.cancelled) set({ status: "none", percent: 0, error: null });
    else set({ status: "error", error: (e && e.message ? e.message : String(e)).split("\n")[0] });
  } finally {
    if (job === me) job = null;
  }
}

function cancel() {
  if (job) job.cancelled = true;
}

function remove() {
  cancel();
  fs.rmSync(dir(), { recursive: true, force: true });
  set({ status: "none", percent: 0, error: null });
}

// ttpack://pack/<file>: an installed pack file, for the page and its worker
async function serve(req) {
  const name = path.basename(new URL(req.url).pathname);
  const f = PACK.files.find((x) => x.name === name);
  if (!f || state.status !== "installed") return new Response("Not found", { status: 404 });
  const body = fs.readFileSync(path.join(dir(), name));
  return new Response(body, {
    headers: { "content-type": TYPES[path.extname(name)] || "application/octet-stream", "access-control-allow-origin": "*", "cache-control": "no-cache" },
  });
}

module.exports = {
  SCHEME: "ttpack",
  setUp(ipcMain, onState) {
    send = onState;
    check();
    ipcMain.handle("pack-get", () => ({ ...state }));
    ipcMain.handle("pack-install", () => { install(); });
    ipcMain.handle("pack-cancel", () => cancel());
    ipcMain.handle("pack-remove", () => remove());
  },
  serve,
};
