// Gives the page the few desktop details it needs, without exposing Node.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("touchType", {
  getVersion: () => ipcRenderer.invoke("app-version"),
});
