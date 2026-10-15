// Pixel-art sprites (10x10) for Forest Hop: animals, forest props and hazards.
// Each sprite is drawn once to a small offscreen canvas and then scaled up with smoothing off.
(() => {
  const K = "#3F3C33", W = "#F2EEE2";
  const S = {
    frog: { pal: { k: K, w: W, b: K, g: "#6F8F4E", d: "#4E6A36" }, rows: [
      "..kk..kk..", ".kwbkkwbk.", ".kggggggk.", "kggggggggk", "kggggggggk",
      "kgkkkkkkgk", "kggggggggk", "kdggggggdk", "kdkk..kkdk", ".kk....kk."] },
    chicken: { pal: { k: K, w: W, b: K, r: "#B4472B", o: "#D08A2E" }, rows: [
      "...rr.....", "..kkrk....", "..kwwwk...", ".okbwwk...", "ookwwwwkk.",
      "..kwwwwwwk", "..kwwwwwwk", "...kwwwwk.", "....ko.ko.", "....oo.oo."] },
    moose: { pal: { k: K, t: "#CDB98E", b: "#7A5A3C", e: K, d: "#4E3A28" }, rows: [
      "tt......tt", "t.t....t.t", "tttkkkkttt", "..kbbbbk..", "..kebbek..",
      "..kbbbbk..", "...kddk...", "...kddk...", "....kk....", ".........."] },
    bear: { pal: { k: K, b: "#6B4E35", e: K, l: "#A8865F" }, rows: [
      ".kk....kk.", "kbbkkkkbbk", "kbbbbbbbbk", "kbebbbbebk", "kbbbbbbbbk",
      "kbbllllbbk", "kbblkklbbk", ".kbllllbk.", "..kbbbbk..", "...kkkk..."] },
    fox: { pal: { k: K, o: "#B4632F", e: K, w: W }, rows: [
      "k........k", "kok....kok", "kookkkkook", "kooooooook", "koeooooeok",
      "kwoooooowk", ".kwwwwwwk.", "..kwwwwk..", "...kwwk...", "....kk...."] },
    owl: { pal: { k: K, g: "#8C7A62", y: "#D9B44A", e: K, o: "#D08A2E", l: "#CFC3A8" }, rows: [
      ".k......k.", "kgk....kgk", "kggkkkkggk", "kyykggkyyk", "kyekggkeyk",
      "kggggogggk", "kglgggglgk", "kgllllllgk", ".kgllllgk.", "..kokkok.."] },
    rabbit: { pal: { k: K, p: "#D9A39A", c: "#EDE7D5", e: K }, rows: [
      "..kk..kk..", ".kpk..kpk.", ".kpk..kpk.", ".kckkkkck.", "kcccccccck",
      "kcecccceck", "kcccppccck", ".kcccccck.", "..kcccck..", "...kkkk..."] },
    raccoon: { pal: { k: K, g: "#8E8A80", w: W, e: W }, rows: [
      ".kk....kk.", "kgkkkkkkgk", "kggggggggk", "kkkwggwkkk", "kkekggkekk",
      "kgggwwgggk", "kggwkkwggk", ".kgwwwwgk.", "..kggggk..", "...kkkk..."] },
    pine: { pal: { k: K, l: "#6F8F4E", g: "#4E6A36", t: "#6B4E35" }, rows: [
      "....kk....", "...klgk...", "..kllggk..", "...klgk...", "..kllggk..",
      ".kllllggk.", "kllllgggk.", ".kkkkkkkk.", "....tt....", "...kttk..."] },
    rock: { pal: { k: K, s: "#9C9886", l: "#B8B4A2" }, rows: [
      "..........", "..........", "...kkkk...", "..kllssk..", ".klllsssk.",
      "kllssssssk", "kssssssssk", ".kkkkkkkk.", "..........", ".........."] },
    stump: { pal: { k: K, t: "#8A6A47", r: "#C4A57A" }, rows: [
      "..........", "..........", "..kkkkkk..", ".krrrrrrk.", ".krrkkrrk.",
      ".krrrrrrk.", ".kttttttk.", ".kttttttk.", "kttttttttk", ".kkkkkkkk."] },
    acorn: { pal: { k: K, c: "#6B4E35", n: "#B4823F", h: "#D9B07A" }, rows: [
      "....kk....", "..kkkkkk..", ".kccccccck", ".kcccccck.", "..knnnnk..",
      "..knhnnk..", "..knhnnk..", "...knnk...", "....kk....", ".........."] },
    deer: { pal: { k: K, t: "#CDB98E", b: "#9A7650", e: K, w: W }, rows: [
      "t.t.......", ".tk.......", ".kbk......", "kebbkkkkk.", ".kbbbbbbbk",
      "..kbbwbbbk", "..kbbbbbk.", "..kbk.kbk.", "..kbk.kbk.", "..kk..kk.."] },
    hawk: { pal: { k: K, h: "#6B5A48", l: "#A8957A" }, rows: [
      "....kk....", "...khhk...", "kk.khhk.kk", "khkkhhkkhk", "khhhhhhhhk",
      ".khhllhhk.", "..khllhk..", "...khhk...", "..khkkhk..", "..kk..kk.."] },
  };

  const cache = new Map();
  function sheet(kind, flip) {
    const key = kind + (flip ? "~" : "");
    if (cache.has(key)) return cache.get(key);
    const sp = S[kind];
    const c = document.createElement("canvas");
    c.width = c.height = 10;
    const ctx = c.getContext("2d");
    sp.rows.forEach((row, y) => {
      [...(flip ? [...row].reverse().join("") : row)].forEach((ch, x) => {
        if (ch === ".") return;
        ctx.fillStyle = sp.pal[ch] || K;
        ctx.fillRect(x, y, 1, 1);
      });
    });
    cache.set(key, c);
    return c;
  }

  TT.sprites = {
    kinds: Object.keys(S),
    // Draws a sprite with its top-left at (x, y), size px wide and tall.
    draw(ctx, kind, x, y, size, flip = false) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sheet(kind, flip), Math.round(x), Math.round(y), Math.round(size), Math.round(size));
    },
    // A small standalone canvas showing one sprite (for menus and cards).
    canvas(kind, size, { faded = false, label } = {}) {
      const c = document.createElement("canvas");
      const dpr = window.devicePixelRatio || 1;
      c.width = c.height = Math.round(size * dpr);
      c.style.width = c.style.height = `${size}px`;
      c.className = "sprite";
      if (faded) c.style.opacity = "0.35";
      c.setAttribute("role", "img");
      c.setAttribute("aria-label", label || kind);
      TT.sprites.draw(c.getContext("2d"), kind, 0, 0, c.width);
      return c;
    },
    // Markup version for places that are built from HTML strings.
    svg(kind, size) {
      const sp = S[kind];
      let rects = "";
      sp.rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch !== ".") rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${sp.pal[ch] || K}"/>`;
      }));
      return `<svg viewBox="0 0 10 10" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="${kind}">${rects}</svg>`;
    },
  };
})();
