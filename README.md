# Touch Type

A desktop app for improving your touch typing. It has a quick speed test, practice that targets your weak keys, a stats page, and games that adapt to the letters you struggle with.

![Touch Type icon](build/icon.png)

## Download

**[Download the latest installer for Windows](https://github.com/silent-diffusion/Touch-Type/releases/latest)**: open the release and run `Touch-Type-Setup-<version>.exe`.

- Installing takes one click. The app installs for your user account only, so it doesn't need admin rights, and it adds Start menu and desktop shortcuts.
- The installer isn't code-signed yet, so Windows SmartScreen may say "Windows protected your PC". Click **More info → Run anyway**.
- To uninstall, use Windows **Settings → Apps → Installed apps → Touch Type**.

## Features

- **Speed test:** time (15/30/60 s) or word count (10/25/50), lowercase words only. It reports WPM, raw WPM, accuracy and personal bests.
- **Practice:** mixes words that use your weak keys and words you've missed with ordinary words. Recent mistakes count more than old ones.
- **Stats:** a WPM chart, a keyboard heatmap, your weakest keys and words, and test history.
- **Replays and keystroke analysis:** every round is recorded and can be replayed. See which wrong key you pressed, how long each key takes, the slowest letter pairs, and every space, backspace and pause in context.
- **Forest Hop:** a Crossy Road–style game. Pick a pixel-art animal and hop as far into the forest as you can: a word sits beside each tile around your animal, so type one and press Space or Enter to jump that way. Dodge deer herds, ride logs across creeks and wait out rockslides. Every animal has its own treats to collect (spent on unlocking more animals) and its own predator, which turns up if you stop making progress.
- **Path Runner:** choose a path by typing its word before the clock runs out.
- **Settings:** three themes, five accent colors, interface and typing fonts, text size and caret style.

Your data stays on your computer.

### Keyboard shortcuts

| Key | Action |
|---|---|
| Tab | Restart the test or game |
| Tab / Enter | Start the next round from the results screen |
| Esc | Open or close the menu |
| P | Practice weak keys (on the results and stats screens) |
| Enter | Play the selected game |
| Space / Enter | Jump in Forest Hop, once a direction's word is typed |
| ← → / H | Choose an animal, or open How to Play, in Forest Hop |
| R | Replay the round (on the results and game-over screens) |
| Space / ← → | Play or pause, and skip, in a replay |
| F11 | Full screen |

## Development

Requires [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm start          # run the app
npm run dist       # build the installer into dist/
```

The app itself is plain HTML, CSS and JavaScript in `src/`. You can also open `src/index.html` directly in a browser. `electron/main.js` is the desktop shell.

## License

MIT. The bundled fonts are under the SIL Open Font License; see `src/fonts/LICENSE-FONTS.txt`.
