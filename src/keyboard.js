// The on-screen keyboard. A phone only shows its keyboard for a text field, so there's one hidden
// field (#kb in index.html) that takes the typing wherever a hardware keyboard would just be typed on:
// the speed test, practice and the games.
//
//   TT.keyboard.open()   raise it. Only a touch-first device has one, and it only comes up from
//                        inside a tap (or a key press), so call this straight from the handler.
//   TT.keyboard.close()  put it away (also from any other text field)
//
// Keys reach the page the usual way: the field's keydown events travel up to the document like any
// others (app.js). Some keyboards send no usable keydown (swipe typing, dictation, Android: the key
// is "Unidentified"), only the text they'd put in the field. That text is turned back into keydown
// events here, so every key takes the same path and counts once.
(() => {
  window.TT = window.TT || {};
  const field = document.getElementById("kb");
  const coarse = window.matchMedia ? window.matchMedia("(pointer: coarse)") : { matches: false };
  const MARK = "/";    // the field always holds this one character, so Backspace has something to delete
  const ECHO_MS = 300; // a proper keydown's own text arrives well within this
  let key = "";        // the key being pressed, if it came as a proper keydown, and when:
  let keyAt = -1e9;    // the text that key puts in the field isn't typed again
  let sending = false; // a keydown made here is on its way up
  let last = "";       // the last character typed
  let held = MARK;     // what the field holds while a word is being composed

  const rest = () => {
    field.value = held = MARK;
    if (document.activeElement === field) field.setSelectionRange(MARK.length, MARK.length);
  };

  function send(k, ctrlKey = false) {
    sending = true;
    field.dispatchEvent(new KeyboardEvent("keydown", { key: k, ctrlKey, bubbles: true, cancelable: true }));
    sending = false;
    last = k;
  }

  function type(text) {
    // iOS turns a second space into ". " and straight quotes into curly ones: what was typed is a space, a quote
    if (text === ". " && last === " ") text = " ";
    text = text.replace(/\u00a0/g, " ").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');
    for (const ch of text) send(ch === "\n" ? "Enter" : ch);
  }
  const erase = (n, word) => { for (let i = 0; i < n; i++) send("Backspace", word); };

  // True, once, for what a proper keydown does to the field itself right after it: its own character
  // (iOS may make a second space ". "), or its own deletion or line break.
  function echo(inputType, text) {
    if (performance.now() - keyAt > ECHO_MS) return false;
    const yes = key === "Backspace" ? inputType.startsWith("delete")
      : key === "Enter" ? inputType === "insertLineBreak" || inputType === "insertParagraph"
      : inputType.startsWith("insert") && (text === key || (key === " " && (text === ". " || text === "\u00a0")));
    if (yes) keyAt = -1e9;
    return yes;
  }

  field.addEventListener("keydown", (e) => {
    if (sending) return;
    const proper = !!e.key && e.key !== "Unidentified" && e.key !== "Process" && e.keyCode !== 229 && !e.isComposing;
    keyAt = proper ? performance.now() : -1e9;
    if (!proper) return;
    key = last = e.key;
    // the field itself never takes the key (shortcuts with Ctrl or Cmd are left alone)
    if ((e.key.length === 1 || e.key === "Backspace" || e.key === "Enter") && !e.ctrlKey && !e.metaKey) e.preventDefault();
  });

  field.addEventListener("beforeinput", (e) => {
    if (!e.cancelable) return; // a word being composed: read from the field afterwards (the input event)
    e.preventDefault();
    const t = e.inputType;
    const text = e.data || (e.dataTransfer && e.dataTransfer.getData("text/plain")) || "";
    if (echo(t, text)) return;
    if (t === "insertText" || t === "insertReplacementText") type(text);
    else if (t === "insertLineBreak" || t === "insertParagraph") send("Enter");
    else if (t === "deleteContentBackward") erase(1);
    else if (t === "deleteWordBackward" || t === "deleteSoftLineBackward" || t === "deleteHardLineBackward") erase(1, true);
  });

  // Text that couldn't be stopped on its way in (a keyboard composing a word letter by letter):
  // whatever changed in the field since last time is what was typed.
  field.addEventListener("input", (e) => {
    const now = field.value;
    let same = 0;
    while (same < held.length && same < now.length && held[same] === now[same]) same++;
    const gone = held.length - same, added = now.slice(same);
    if (echo(added ? "insertText" : "deleteContentBackward", added)) return rest();
    erase(gone);
    type(added);
    if (e.isComposing) held = now;
    else rest();
  });
  field.addEventListener("compositionend", () => setTimeout(rest, 0));
  field.addEventListener("focus", () => { keyAt = -1e9; rest(); });
  rest();

  TT.keyboard = {
    open() {
      if (!coarse.matches) return;
      if (document.activeElement === field) {
        if (TT.viewport.kbOpen) return;
        field.blur(); // it has the focus but the keyboard was put away: taking the focus again brings it back
      }
      field.focus({ preventScroll: true });
    },
    close() {
      const el = document.activeElement;
      if (el && (el === field || el.tagName === "TEXTAREA" || el.tagName === "INPUT")) el.blur();
    },
    isOpen: () => document.activeElement === field,
  };
})();
