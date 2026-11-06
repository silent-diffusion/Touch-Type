// Settings → Models: the optional models (TT.MODELS, models.js) as the page sees them, through the
// app's model manager (window.touchType.models: electron/models.js on Windows and the Mac, the
// native one in the Apple app). In a plain browser there are none.
//
// The bridge's state: { models: { id: { status, percent, error, disk } }, runtime: { present, disk } }
//   status: none | downloading | installed | error; percent: 0 to 100; disk: bytes it takes now;
//   runtime: whether ONNX Runtime is there already (the Apple app bundles it; the desktop app
//   downloads it with the first model that needs it), and the bytes it takes when downloaded.
(() => {
  const bridge = () => (window.touchType && window.touchType.models) || null;
  let state = { models: {}, runtime: { present: false, disk: 0 } };
  const listeners = new Set();
  const changed = () => listeners.forEach((f) => { try { f(); } catch {} });

  const empty = { status: "none", percent: 0, error: null, disk: 0 };

  TT.models = {
    supported: () => !!bridge(),
    catalog: () => (TT.MODELS ? TT.MODELS.list : []),
    // where the installed models (and ONNX Runtime) are, for the workers
    base: () => (bridge() ? bridge().base : null),
    state: (id) => state.models[id] || empty,
    installed: (id) => (state.models[id] || empty).status === "installed",
    // bytes the models take on this device (with ONNX Runtime, where it was downloaded)
    diskUsed: () => Object.values(state.models).reduce((n, m) => n + (m.disk || 0), 0) + ((state.runtime && state.runtime.disk) || 0),
    // what downloading a model takes: its files, and ONNX Runtime when it isn't here yet
    downloadSize(id) {
      const m = TT.MODELS.byId(id);
      if (!m) return 0;
      const own = m.files.reduce((n, f) => n + f.size, 0);
      const rt = m.runtime && !(state.runtime && state.runtime.present) ? TT.MODELS.runtime.files.reduce((n, f) => n + f.size, 0) : 0;
      return own + rt;
    },
    install: (id) => bridge() && bridge().install(id),
    cancel: (id) => bridge() && bridge().cancel(id),
    remove: (id) => bridge() && bridge().remove(id),
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },

    async start() {
      const b = bridge();
      if (!b) return;
      b.onState((st) => { state = st || state; changed(); });
      try { state = (await b.getState()) || state; } catch {}
      changed();
    },
  };
})();
