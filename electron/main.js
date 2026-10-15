// Desktop shell: one window showing the web app in ../src, plus automatic updates from GitHub Releases.
const { app, BrowserWindow, Menu, dialog, screen, shell } = require("electron");
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

function setUpUpdates() {
  // Updates download in the background; the app asks before restarting to install one.
  autoUpdater.on("update-downloaded", async (info) => {
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `Touch Type ${info.version} is ready to install.`,
      detail: "Restart now to update, or it will install the next time you close the app.",
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on("error", (err) => console.error("Update check failed:", err == null ? "unknown" : err.message));
  autoUpdater.checkForUpdates().catch(() => {});
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
  app.whenReady().then(() => {
    createWindow();
    if (app.isPackaged) setUpUpdates();
  });
  app.on("window-all-closed", () => app.quit());
}
