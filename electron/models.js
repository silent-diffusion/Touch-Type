// The optional models (Settings → Models; the list is src/models.js): song separation for Tiles'
// ×4 visuals and lyric timing. None is part of the app: each is downloaded from this app's GitHub
// releases only when the user clicks Download for it, into the app's data folder, and it can be
// deleted again there. Every file is checked against its SHA-256 before it's kept. Downloads run
// one at a time; one waiting for another shows as downloading at 0%.
//
// ONNX Runtime, which the models run on, is downloaded with the first model that needs it, into
// its own folder (onnx-runtime), and deleted with the last. Packs downloaded before this kept it in
// the separation pack's folder; it's still found there.
//
// The page reaches every installed file at ttpack://pack/<file> (registered in main.js).
const { app, net } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const CATALOG = require("../src/models.js");

const SCHEME = "ttpack";
const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".onnx": "application/octet-stream", ".txt": "text/plain; charset=utf-8" };

const data = () => app.getPath("userData");
const dirOf = (m) => path.join(data(), m.folder);
const runtimeDir = () => path.join(data(), "onnx-runtime");
const legacyRuntimeDir = () => path.join(data(), "separation-pack"); // where packs before this kept it
const markerOf = (m) => path.join(dirOf(m), "installed.json");
const sizeAt = (p) => { try { return fs.statSync(p).size; } catch { return -1; } };

// per model: { status: none | downloading | installed | error, percent, error }
const state = {};
for (const m of CATALOG.list) state[m.id] = { status: "none", percent: 0, error: null };
let send = () => {};
const jobs = new Map(); // id → { cancelled }
let chain = Promise.resolve(); // downloads, one at a time

// Where a runtime file is, if it's there at its size.
function runtimeFile(f) {
  for (const d of [runtimeDir(), legacyRuntimeDir()]) {
    const p = path.join(d, f.name);
    if (sizeAt(p) === f.size) return p;
  }
  return null;
}
const runtimePresent = () => CATALOG.runtime.files.every((f) => runtimeFile(f));

// installed when its marker says this version and its files are all there at their sizes
function isInstalled(m) {
  try {
    const mk = JSON.parse(fs.readFileSync(markerOf(m), "utf8"));
    return mk.version === m.version && m.files.every((f) => sizeAt(path.join(dirOf(m), f.name)) === f.size) && (!m.runtime || runtimePresent());
  } catch {
    return false;
  }
}

function snapshot() {
  const models = {};
  for (const m of CATALOG.list) {
    const st = state[m.id];
    const disk = st.status === "installed" ? m.files.reduce((n, f) => n + Math.max(0, sizeAt(path.join(dirOf(m), f.name))), 0) : 0;
    models[m.id] = { ...st, disk };
  }
  const runtimeDisk = CATALOG.runtime.files.reduce((n, f) => { const p = runtimeFile(f); return n + (p ? f.size : 0); }, 0);
  return { models, runtime: { present: runtimePresent(), disk: runtimeDisk } };
}

function set(id, patch) {
  Object.assign(state[id], patch);
  send(snapshot());
}

function check() {
  for (const m of CATALOG.list) {
    if (state[m.id].status === "downloading") continue;
    state[m.id] = isInstalled(m) ? { status: "installed", percent: 100, error: null } : { status: "none", percent: 0, error: null };
  }
  send(snapshot());
}

const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

// Testing: TT_MODELS_MIRROR=<url> downloads from a local copy of the GitHub releases
// (<url>/<release tag>/<file>) instead, before they're published.
const mirrored = (base) => (process.env.TT_MODELS_MIRROR ? process.env.TT_MODELS_MIRROR.replace(/\/?$/, "/") + base.split("/").filter(Boolean).pop() + "/" : base);

async function fetchFile(base, f, dir, onBytes, cancelled) {
  const res = await net.fetch(mirrored(base) + f.name, { cache: "no-store" });
  if (!res.ok) throw new Error(`The download of ${f.name} failed (${res.status}).`);
  const tmp = path.join(dir, f.name + ".part");
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
  fs.renameSync(tmp, path.join(dir, f.name));
}

async function download(m, job) {
  // what's needed: the model's files, and ONNX Runtime's when it isn't here
  const wanted = m.files.map((f) => ({ f, base: m.base, dir: dirOf(m) }));
  if (m.runtime) for (const f of CATALOG.runtime.files) if (!runtimeFile(f)) wanted.push({ f, base: CATALOG.runtime.base, dir: runtimeDir() });
  const total = wanted.reduce((n, x) => n + x.f.size, 0);
  let done = 0;
  for (const { f, base, dir } of wanted) {
    fs.mkdirSync(dir, { recursive: true });
    const have = path.join(dir, f.name);
    // a file kept from an earlier, interrupted download doesn't need fetching again
    if (sizeAt(have) === f.size && sha256(have) === f.sha256) {
      done += f.size;
      continue;
    }
    await fetchFile(base, f, dir, (n) => {
      done += n;
      const percent = Math.floor((done / total) * 100);
      if (percent !== state[m.id].percent) set(m.id, { percent });
    }, () => job.cancelled);
  }
  fs.writeFileSync(markerOf(m), JSON.stringify({ version: m.version, installed: new Date().toISOString() }));
}

function install(id) {
  const m = CATALOG.byId(id);
  if (!m || jobs.has(id) || state[id].status === "installed") return;
  const job = { cancelled: false };
  jobs.set(id, job);
  set(id, { status: "downloading", percent: 0, error: null });
  chain = chain.then(async () => {
    try {
      if (job.cancelled) throw new Error("cancelled");
      await download(m, job);
      set(id, { status: "installed", percent: 100, error: null });
    } catch (e) {
      if (job.cancelled) set(id, { status: "none", percent: 0, error: null });
      else set(id, { status: "error", error: (e && e.message ? e.message : String(e)).split("\n")[0] });
    } finally {
      jobs.delete(id);
    }
  });
}

function cancel(id) {
  const job = jobs.get(id);
  if (job) job.cancelled = true;
}

function remove(id) {
  const m = CATALOG.byId(id);
  if (!m) return;
  cancel(id);
  const others = CATALOG.list.filter((x) => x.id !== id && x.runtime && state[x.id].status === "installed");
  // Packs from before kept ONNX Runtime in the separation folder: move it out first if another
  // model still needs it.
  if (others.length && path.resolve(dirOf(m)) === path.resolve(legacyRuntimeDir())) {
    fs.mkdirSync(runtimeDir(), { recursive: true });
    for (const f of CATALOG.runtime.files) {
      const from = path.join(legacyRuntimeDir(), f.name), to = path.join(runtimeDir(), f.name);
      if (sizeAt(from) === f.size && sizeAt(to) !== f.size) fs.renameSync(from, to);
    }
  }
  fs.rmSync(dirOf(m), { recursive: true, force: true });
  if (!others.length) fs.rmSync(runtimeDir(), { recursive: true, force: true });
  set(id, { status: "none", percent: 0, error: null });
}

// ttpack://pack/<file>: an installed file, for the page and its workers
async function serve(req) {
  const name = path.basename(new URL(req.url).pathname);
  let file = null;
  const rt = CATALOG.runtime.files.find((x) => x.name === name);
  if (rt && CATALOG.list.some((m) => m.runtime && state[m.id].status === "installed")) file = runtimeFile(rt);
  for (const m of CATALOG.list) {
    if (file) break;
    if (state[m.id].status === "installed" && m.files.some((x) => x.name === name)) file = path.join(dirOf(m), name);
  }
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(file), {
    headers: { "content-type": TYPES[path.extname(name)] || "application/octet-stream", "access-control-allow-origin": "*", "cache-control": "no-cache" },
  });
}

module.exports = {
  SCHEME,
  setUp(ipcMain, onState) {
    send = onState;
    check();
    ipcMain.handle("models-get", () => snapshot());
    ipcMain.handle("models-install", (_e, id) => { install(id); });
    ipcMain.handle("models-cancel", (_e, id) => cancel(id));
    ipcMain.handle("models-remove", (_e, id) => remove(id));
  },
  serve,
};
