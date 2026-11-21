// How much room the app has. A phone's on-screen keyboard covers the page without resizing it, so a
// media query can't tell how tall the app may be: this measures it and tells the page (style.css,
// "Compact") through one custom property and a few classes on <html>:
//
//   --app-h   the height the app can use, in px (the window, less the on-screen keyboard)
//   compact   the window is at most 600px wide: the same as @media (max-width: 600px), as a class so
//             it can be combined with the others
//   short     less than 560px of height to use: a phone on its side, or one with the keyboard up
//   kb-open   the on-screen keyboard is showing
//   task      nothing but the task: there's a keyboard up or a round being played, and no room (or
//             no use) for the tabs, so they go and the screen's actions become a slim bar at the top
//
// When the room changes it sends the window a "resize", so everything that lays itself out again
// for a new window size does it for the keyboard too.
(() => {
  window.TT = window.TT || {};
  const root = document.documentElement;
  const vv = window.visualViewport;
  const narrow = window.matchMedia ? window.matchMedia("(max-width: 600px)") : { matches: false };
  const SHORT = 560;     // px of height below which the window is short
  const KEYBOARD = 120;  // px: an on-screen keyboard takes more than this (a hardware keyboard's bar doesn't)

  let inset = null;      // the keyboard's height as the app's own shell reports it, or null to measure
  let full = 0, fullWidth = 0; // the tallest the window has been at this width: its height with no keyboard
  let state = { height: 0, keyboard: 0, compact: false, short: false, kbOpen: false, task: false, top: -1 };
  let sending = false;

  const zoomed = () => !!vv && Math.abs(vv.scale - 1) > 0.01;
  const inField = () => {
    const el = document.activeElement;
    return !!el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !/^(range|checkbox|radio|file|button|submit)$/.test(el.type)));
  };

  function measure() {
    const w = window.innerWidth, ih = window.innerHeight;
    if (w !== fullWidth) { fullWidth = w; full = 0; }
    full = Math.max(full, ih);
    // The part of the page that can be seen. Pinching in zooms it rather than shrinking it, so the
    // scale is taken back out (to the nearest px, or it would never sit still).
    const seen = !vv ? ih : zoomed() ? Math.round(vv.height * vv.scale) : vv.height;
    let height = seen, keyboard = 0;
    if (inset != null) {
      // the shell says how tall the keyboard is; if it also made the window shorter, that's the same space
      keyboard = inset;
      height = Math.min(seen, full - inset);
    } else if (ih - seen > KEYBOARD) {
      keyboard = ih - seen; // the keyboard covers the bottom of the page (iOS)
    } else if (full - ih > KEYBOARD && inField()) {
      keyboard = full - ih; // the window itself got shorter while typing in a field
    }
    return { height, keyboard };
  }

  function update(fromResize) {
    const { height, keyboard } = measure();
    const compact = narrow.matches;
    const short = height < SHORT;
    const kbOpen = keyboard > KEYBOARD;
    const small = compact || short;
    const task = (small && (kbOpen || root.classList.contains("playing"))) || (kbOpen && root.classList.contains("playing"));
    // iOS slides the page up under the keyboard: it's put back, and the app kept on the part that shows
    if (!zoomed() && (window.scrollX || window.scrollY)) window.scrollTo(0, 0);
    const top = vv && !zoomed() ? Math.max(0, vv.offsetTop) : 0;
    if (top !== state.top) root.style.setProperty("--app-top", `${top}px`);

    const changed = height !== state.height || compact !== state.compact || short !== state.short || kbOpen !== state.kbOpen || task !== state.task;
    state = { height, keyboard, compact, short, kbOpen, task, top };
    if (!changed) return;
    root.style.setProperty("--app-h", `${Math.round(height * 100) / 100}px`);
    root.classList.toggle("compact", compact);
    root.classList.toggle("short", short);
    root.classList.toggle("kb-open", kbOpen);
    root.classList.toggle("task", task);
    if (!fromResize && !sending) {
      sending = true;
      window.dispatchEvent(new Event("resize"));
      sending = false;
    }
  }

  window.addEventListener("resize", () => { if (!sending) update(true); });
  if (vv) {
    vv.addEventListener("resize", () => update());
    vv.addEventListener("scroll", () => update());
  }
  if (narrow.addEventListener) narrow.addEventListener("change", () => update());
  // focus moving into or out of a text field can mean a keyboard coming or going
  document.addEventListener("focusin", () => update());
  document.addEventListener("focusout", () => setTimeout(update, 0));

  TT.viewport = {
    update: () => update(),
    // The app's own shell can say how tall the on-screen keyboard is (0 when it's down), if it handles
    // the keyboard itself; null goes back to measuring. Tests use it too: desktop browsers have no keyboard.
    setKeyboardInset(px) {
      inset = px == null ? null : Math.max(0, Number(px) || 0);
      update();
    },
    get height() { return state.height; },
    get keyboard() { return state.keyboard; },
    get compact() { return state.compact; },
    get short() { return state.short; },
    get kbOpen() { return state.kbOpen; },
    get task() { return state.task; },
  };
  update(true);
})();
