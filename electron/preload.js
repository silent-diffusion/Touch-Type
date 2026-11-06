// Gives the page the few desktop details it needs, without exposing Node.
const { contextBridge, ipcRenderer } = require("electron");

// models.js's state for the separation model, in the shape separate.js expects of the pack
const packState = (st) => ({ status: "none", percent: 0, error: null, ...(st && st.models && st.models.separation), size: 0, version: 1 });

contextBridge.exposeInMainWorld("touchType", {
  getVersion: () => ipcRenderer.invoke("app-version"),
  platform: process.platform, // "darwin" on the Mac: Cmd for shortcuts, and macOS draws the full screen controls
  window: {
    isFullScreen: () => ipcRenderer.invoke("window-is-fullscreen"),
    setFullScreen: (on) => ipcRenderer.invoke("window-set-fullscreen", !!on),
    close: () => ipcRenderer.invoke("window-close"),
    onFullScreen: (cb) => ipcRenderer.on("fullscreen", (_e, on) => cb(on)),
  },
  update: {
    getState: () => ipcRenderer.invoke("update-get"),
    check: () => ipcRenderer.invoke("update-check"),
    download: () => ipcRenderer.invoke("update-download"),
    install: () => ipcRenderer.invoke("update-install"),
    setAuto: (on) => ipcRenderer.invoke("update-set-auto", !!on),
    onState: (cb) => ipcRenderer.on("update-state", (_e, state) => cb(state)),
  },
  // the optional models (electron/models.js, Settings → Models): their files are at ttpack://pack/
  models: {
    base: "ttpack://pack/",
    getState: () => ipcRenderer.invoke("models-get"),
    install: (id) => ipcRenderer.invoke("models-install", id),
    cancel: (id) => ipcRenderer.invoke("models-cancel", id),
    remove: (id) => ipcRenderer.invoke("models-remove", id),
    onState: (cb) => ipcRenderer.on("models-state", (_e, state) => cb(state)),
  },
  // the separation pack as separate.js knows it: the "separation" model
  pack: {
    base: "ttpack://pack/",
    getState: () => ipcRenderer.invoke("models-get").then(packState),
    install: () => ipcRenderer.invoke("models-install", "separation"),
    cancel: () => ipcRenderer.invoke("models-cancel", "separation"),
    remove: () => ipcRenderer.invoke("models-remove", "separation"),
    onState: (cb) => ipcRenderer.on("models-state", (_e, state) => cb(packState(state))),
  },
});
