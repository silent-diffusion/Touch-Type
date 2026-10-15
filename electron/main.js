// Desktop shell: one window showing the web app in ../src, plus updates from GitHub Releases.
// The app never goes online by itself: update checks only happen when the user clicks
// "Check for updates" in Settings, or has turned on automatic updates there.
const { app, BrowserWindow, Menu, dialog, ipcMain, screen, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");

let win = null;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1440, width),
    height: Math.min(900, height),
    minWidth: 960,
    minHeight: 680,
    backgroundColor: "#ccc8b3",
    title: "Touch Type",
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false, // the spellchecker would download dictionaries
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile(path.join(__dirname, "..", "src", "index.html"));
  win.once("ready-to-show", () => win.show());

  // The app has no external links today; if one is added, open it in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());

  // F11 toggles full screen; there is no menu bar.
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });
}

// ---------- updates ----------

// status: idle | checking | none | available | downloading | downloaded | error
const update = { status: "idle", version: null, percent: 0, error: null, supported: app.isPackaged };
let auto = false;
let autoChecked = false;

function setUpdate(patch) {
  Object.assign(update, patch);
  if (win && !win.isDestroyed()) win.webContents.send("update-state", { ...update });
}

const busy = () => ["checking", "downloading"].includes(update.status);

function check() {
  if (!update.supported || busy() || update.status === "downloaded") return;
  autoUpdater.checkForUpdates().catch(() => {});
}

function download() {
  if (update.status !== "available") return;
  setUpdate({ status: "downloading", percent: 0 });
  autoUpdater.downloadUpdate().catch(() => {});
}

async function promptRestart(version) {
  const { response } = await dialog.showMessageBox(win, {
    type: "info",
    buttons: ["Restart now", "Later"],
    defaultId: 0,
    cancelId: 1,
    title: "Update ready",
    message: `Touch Type ${version} is ready to install.`,
    detail: "Restart now to update, or it will install the next time you close the app.",
  });
  if (response === 0) autoUpdater.quitAndInstall();
}

function setUpUpdates() {
  autoUpdater.autoDownload = false;        // downloads only after the user (or automatic mode) asks
  autoUpdater.autoInstallOnAppQuit = true; // a finished download installs when the app closes

  autoUpdater.on("checking-for-update", () => setUpdate({ status: "checking", error: null }));
  autoUpdater.on("update-not-available", () => setUpdate({ status: "none" }));
  autoUpdater.on("update-available", (info) => {
    setUpdate({ status: "available", version: info.version });
    if (auto) download();
  });
  autoUpdater.on("download-progress", (p) => setUpdate({ status: "downloading", percent: Math.floor(p.percent) }));
  autoUpdater.on("update-downloaded", (info) => {
    setUpdate({ status: "downloaded", version: info.version, percent: 100 });
    if (auto) promptRestart(info.version);
  });
  autoUpdater.on("error", (err) => {
    const message = err && err.message ? err.message.split("\n")[0] : "Unknown error";
    setUpdate({ status: "error", error: message });
  });

  ipcMain.handle("update-get", () => ({ ...update }));
  ipcMain.handle("update-check", () => check());
  ipcMain.handle("update-download", () => download());
  ipcMain.handle("update-install", () => {
    if (update.status === "downloaded") autoUpdater.quitAndInstall();
  });
  // The page reports the user's automatic-updates setting on load and whenever it changes.
  // Turning it on (or launching with it on) checks once per session.
  ipcMain.handle("update-set-auto", (_e, on) => {
    auto = !!on;
    if (auto && !autoChecked) {
      autoChecked = true;
      check();
    }
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  Menu.setApplicationMenu(null);
  ipcMain.handle("app-version", () => app.getVersion());
  setUpUpdates();
  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => app.quit());
}
