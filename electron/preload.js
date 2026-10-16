// Gives the page the few desktop details it needs, without exposing Node.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("touchType", {
  getVersion: () => ipcRenderer.invoke("app-version"),
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
});
