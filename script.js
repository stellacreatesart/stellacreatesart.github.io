(function () {
  const IMG_V = "v10";   // bump this when images are re-exported, so browsers fetch the new files
  const works = (window.ARTWORKS || []).filter(w => !w.hidden);   // pieces marked "hidden": true are kept but not shown
  const MEDIUMS = ["Fine Art", "Graphic Design", "Stardaze"]   // the Studio tab was removed; its pieces are hidden (see REMOVED-PIECES.md)
    .filter(m => works.some(w => w.category === m));
  const TAB_COLOURS = ["#ff3ea5"];   // underline colour for the selected tab

  const slug = s => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const HIDE_MEDIUM = ["Graphic Design"];   // tabs where the medium isn't shown under each piece
  // A piece with no title shows just its year as the label.
  // Every label reads "Title, year": title in bold, year in regular weight. Untitled pieces show just the year.
  const labelHTML = w => [w.title ? `<b>${esc(w.title)}</b>` : "", w.year ? String(w.year) : ""].filter(Boolean).join(", ");
  const meta = w => HIDE_MEDIUM.includes(w.category) ? "" : (w.medium || "");
  const altText = w => [w.title || "Untitled", w.medium, w.year, w.sold ? "sold" : ""].filter(Boolean).join(", ");
  // Fine Art and Graphic Design: prints can be ordered by email, and a sold piece says "Original sold" so it's clear prints are still available
  const PRINTS = ["Fine Art", "Graphic Design"];
  const soldLabel = w => PRINTS.includes(w.category) ? "Original sold" : "Sold";
  const toItem = w => ({ src: "images/full/" + w.file + "?" + IMG_V, thumb: "images/thumb/" + w.file + "?" + IMG_V, titleHTML: labelHTML(w), meta: [meta(w), w.sold ? soldLabel(w) : ""].filter(Boolean).join(" · "), alt: altText(w),
    prints: PRINTS.includes(w.category) ? (w.title || "Untitled") + (w.year ? ", " + w.year : "") : "" });

  const tabs = document.getElementById("tabs");
  const panelsHost = document.getElementById("medium-panels");

  // Tell the browser how wide each piece actually displays, so on sharp (Retina) screens it
  // fetches the full-resolution image instead of stretching the smaller copy.
  const sizeWatcher = new ResizeObserver(entries => {
    entries.forEach(e => {
      const wpx = Math.ceil(e.contentRect.width);
      const img = e.target.querySelector("img");
      if (wpx > 0 && img && img.sizes !== wpx + "px") img.sizes = wpx + "px";
    });
  });

  // A gallery wall for a list of pieces. useSizes=false ignores each piece's own "large"/"line"
  // settings (used on the home page, where pieces come from different tabs).
  function makeGrid(pieces, useSizes = true) {
    const grid = document.createElement("div");
    grid.className = "grid";
    const items = pieces.map(toItem);
    grid._cards = pieces.map((w, i) => {
      const b = document.createElement("button");
      b.className = "card";
      b.setAttribute("aria-label", altText(w));
      b.innerHTML = `
        <img src="images/thumb/${w.file}?${IMG_V}"
             srcset="images/thumb/${w.file}?${IMG_V} ${Math.round(w.w * 0.92)}w${w.fw ? `, images/full/${w.file}?${IMG_V} ${w.fw}w` : ""}"
             sizes="400px" alt="" width="${w.w}" height="${w.h}"
             loading="lazy" decoding="async">
        <span class="info" aria-hidden="true"><span class="ttl">${labelHTML(w)}</span>${meta(w) ? `<span class="med">${esc(meta(w))}</span>` : ""}</span>${w.sold ? `<span class="sold" aria-hidden="true">Sold</span>` : ""}`;
      b.addEventListener("click", () => open(items, i, b));
      sizeWatcher.observe(b);
      const big = useSizes && (w.size === "large" || w.size === "large-right");
      return { el: b, r: w.w / w.h, large: big, right: big && w.size === "large-right", line: useSizes ? (w.line || "") : "" };
    });
    return grid;
  }

  // Build one tab + one panel per medium
  MEDIUMS.forEach(m => {
    const id = slug(m);
    const a = document.createElement("a");
    a.href = "#" + id; a.dataset.tab = id; a.textContent = m;
    tabs.appendChild(a);

    const list = works.filter(w => w.category === m);
    const panel = document.createElement("section");
    panel.className = "panel"; panel.dataset.panel = id; panel.hidden = true;
    panel.innerHTML = `<div class="panel-head"><h1>${esc(m)}</h1></div>`;

    // Pieces in the same collection are kept next to each other (no headings), in the order
    // their collection first appears in artworks.js; pieces without a collection follow.
    const groups = new Map();
    list.forEach(w => {
      const key = w.collection || "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(w);
    });
    const pieces = [...groups.entries()]
      .sort((a, b) => (a[0] === "") - (b[0] === ""))
      .flatMap(([, ws]) => ws);

    const grid = makeGrid(pieces);
    panel.appendChild(grid);

    panelsHost.appendChild(panel);
  });

  /* ---------- Gallery-wall layout ----------
     Pieces are hung edge to edge in rows that each fill the full width. Where a row breaks
     is chosen so that every row's height is as close as possible to a target height, so no
     row ends up tiny. Nothing is cropped: each piece keeps its own proportions.
     A piece marked size: "large" stands taller, with the next pieces stacked in pairs beside it. */
  const place = (el, w, h) => { el.style.width = w.toFixed(2) + "px"; el.style.height = h.toFixed(2) + "px"; };
  const div = cls => Object.assign(document.createElement("div"), { className: cls });

  // How "bad" a row height is: rows shorter than the target are penalised far more than taller ones,
  // so pieces never end up looking small.
  const rowCost = (h, target) => h < target ? 4 * ((target - h) / target) ** 2 : ((h - target) / target) ** 2;

  function rowsFor(cards, W, gap, target, isEnd, oneRow) {
    if (oneRow) {
      const sumR = cards.reduce((t, c) => t + c.r, 0);
      const h = (W - gap * (cards.length - 1)) / sumR;
      const row = div("row");
      cards.forEach(c => { place(c.el, c.r * h, h); row.appendChild(c.el); });
      return [row];
    }
    const n = cards.length, best = [0], prev = [0];
    for (let j = 1; j <= n; j++) {
      best[j] = Infinity;
      for (let i = Math.max(0, j - 6); i < j; i++) {
        const seg = cards.slice(i, j), sumR = seg.reduce((s, c) => s + c.r, 0);
        const h = (W - gap * (seg.length - 1)) / sumR;
        const last = isEnd && j === n, cap = target * 1.7;
        let cost = rowCost(Math.min(h, last ? cap : h), target);
        if (last && h > cap) cost += (h - cap) / target;   // the wall's final row may sit at a capped height
        if (best[i] + cost < best[j]) { best[j] = best[i] + cost; prev[j] = i; }
      }
    }
    const rows = [];
    for (let j = n; j > 0; j = prev[j]) rows.unshift(cards.slice(prev[j], j));
    return rows.map((seg, k) => {
      const sumR = seg.reduce((s, c) => s + c.r, 0);
      let h = (W - gap * (seg.length - 1)) / sumR;
      if (isEnd && k === rows.length - 1) h = Math.min(h, target * 1.7);
      const row = div("row");
      seg.forEach(c => { place(c.el, c.r * h, h); row.appendChild(c.el); });
      return row;
    });
  }

  // A big piece plus k stacks of two pieces each, optionally followed by one more piece at full height.
  // Solves for the block height that fills the width exactly. pick(n) returns the n pieces to use;
  // avail = how many pieces are available; right = put the big piece on the right-hand side.
  function blockFor(big, pick, avail, W, gap, target, right) {
    const options = [];
    for (let k = 1; k <= 2; k++) for (let j = 0; j <= 1; j++) {
      const n = 2 * k + j;
      if (n > avail) continue;
      if (j && avail > 5) continue;             // the extra single piece is only for the last few pieces of a group
      const rest = pick(n);
      if (rest.some(c => c.large)) continue;     // another big piece is never used as a side piece
      let s = 0;
      for (let q = 0; q < k; q++) s += 1 / (1 / rest[2 * q].r + 1 / rest[2 * q + 1].r);
      const single = j ? rest[2 * k].r : 0;
      const H = (W - gap * (k + j) + gap * s) / (big.r + s + single);
      // with only a few pieces before the next big piece, prefer using all of them (no awkward leftovers)
      const leftover = avail <= 5 ? (avail - n) * 0.6 : 0;
      options.push({ k, j, H, rest, strands: avail - n === 1, score: Math.abs(H - target * 1.7) / target + leftover + (j ? 0.15 : 0) });
    }
    // Plain stacked pairs are slightly preferred; the extra single piece is used when it avoids
    // leftovers or gives a better size.
    const ok = options.filter(o => !o.strands);
    const pool = ok.length ? ok : options;
    let best = pool.sort((x, y) => x.score - y.score)[0];

    // If the stacked-pairs layout would make a side piece tiny, try the big piece with two neat
    // rows of pieces beside it instead.
    const looksWrong = o => {
      if (!o) return true;
      const bigW = big.r * o.H; let minH = Infinity, maxW = 0;
      for (let q = 0; q < o.k; q++) {
        const a2 = o.rest[2 * q], b2 = o.rest[2 * q + 1], w2 = (o.H - gap) / (1 / a2.r + 1 / b2.r);
        minH = Math.min(minH, w2 / a2.r, w2 / b2.r); maxW = Math.max(maxW, w2);
      }
      if (o.j) maxW = Math.max(maxW, o.rest[2 * o.k].r * o.H);
      return minH < target * 0.55;
    };
    if (looksWrong(best)) {
      let bestRows = null;
      for (let n = 2; n <= Math.min(avail, 6); n++) {
        const rest = pick(n);
        if (rest.some(c => c.large)) continue;
        for (let m = 1; m < n; m++) {
          const r1 = rest.slice(0, m), r2 = rest.slice(m);
          const R1 = r1.reduce((t, c) => t + c.r, 0), R2 = r2.reduce((t, c) => t + c.r, 0);
          const A = 1 / R1 + 1 / R2, B = gap - gap * (r1.length - 1) / R1 - gap * (r2.length - 1) / R2;
          const H = (A * (W - gap) + B) / (1 + A * big.r);
          const Wr = W - gap - big.r * H;
          const h1 = (Wr - gap * (r1.length - 1)) / R1, h2 = (Wr - gap * (r2.length - 1)) / R2;
          const bigW = big.r * H, maxW = Math.max(...rest.map(c => c.r * (r1.includes(c) ? h1 : h2)));
          let score = Math.abs(H - target * 1.7) / target;
          if (Math.min(h1, h2) < target * 0.55) score += 2;
          if (maxW > bigW * 0.9) score += 2;
          if (avail - n === 1) score += 1;
          if (avail <= 6) score += (avail - n) * 0.6;
          if (!bestRows || score < bestRows.score) bestRows = { score, H, h1, h2, Wr, r1, r2, n };
        }
      }
      if (bestRows) {
        const { H, h1, h2, Wr, r1, r2, n } = bestRows, row = div("row"), area = div("stack");
        area.style.width = Wr.toFixed(2) + "px";
        place(big.el, big.r * H, H);
        for (const [cardsRow, h] of [[r1, h1], [r2, h2]]) {
          const line = div("row");
          cardsRow.forEach(c => { place(c.el, c.r * h, h); line.appendChild(c.el); });
          area.appendChild(line);
        }
        if (right) row.append(area, big.el); else row.append(big.el, area);
        return { row, used: n };
      }
    }
    if (!best) return null;
    const { k, j, H, rest } = best, row = div("row"), parts = [];
    place(big.el, big.r * H, H);
    for (let q = 0; q < k; q++) {
      const a = rest[2 * q], b = rest[2 * q + 1];
      const w = (H - gap) / (1 / a.r + 1 / b.r);
      const stack = div("stack");
      place(a.el, w, w / a.r); place(b.el, w, w / b.r);
      stack.append(a.el, b.el); parts.push(stack);
    }
    if (j) { const c = rest[2 * k]; place(c.el, c.r * H, H); parts.push(c.el); }
    if (right) row.append(...parts, big.el); else row.append(big.el, ...parts);
    return { row, used: 2 * k + j };
  }

  function layout(grid) {
    const W = Math.floor(grid.clientWidth);
    if (!W || grid._W === W) return;
    grid._W = W;
    const gap = W < 600 ? 8 : 16;
    const target = W < 600 ? 190 : W < 900 ? 260 : 330;
    const cards = grid._cards, out = [];
    let seg = [];
    const flush = isEnd => { if (seg.length) out.push(...rowsFor(seg, W, gap, target, isEnd)); seg = []; };
    for (let i = 0; i < cards.length; ) {
      const c = cards[i];
      if (c.line) {
        // a series marked with the same "line" name is shown together on its own row
        // (on phones it wraps onto a few rows of its own, in order)
        let j = i;
        while (j < cards.length && cards[j].line === c.line) j++;
        flush(false);
        out.push(...rowsFor(cards.slice(i, j), W, gap, W >= 700 ? Infinity : target, j === cards.length, W >= 700));
        i = j; continue;
      }
      if (c.large && W >= 700) {
        // only the pieces up to the next big piece are available to stack beside this one
        let next = cards.slice(i + 1);
        const nextBig = next.findIndex(x => x.large || x.line);
        if (nextBig >= 0) next = next.slice(0, nextBig);
        if (c.right && seg.length >= 2) {
          // big piece on the right: the pieces just before it are stacked to its left
          const before = seg.length;
          const block = blockFor(c, n => seg.slice(before - n), before, W, gap, target, true);
          if (block) { seg = seg.slice(0, before - block.used); flush(false); out.push(block.row); i++; continue; }
        }
        // otherwise use the pieces that follow (stacked to its right, or to its left for a right-hand piece)
        const block = blockFor(c, n => next.slice(0, n), next.length, W, gap, target, c.right);
        if (block) { flush(false); out.push(block.row); i += 1 + block.used; continue; }
      }
      seg.push(c); i++;
    }
    flush(true);
    grid.style.setProperty("--gap", gap + "px");
    grid.replaceChildren(...out);
  }
  // About: choose the photo/text column split so the Polaroid and the text column end at the same height
  function balanceAbout() {
    const hero = document.querySelector(".about-hero");
    if (!hero || hero.offsetParent === null) return;
    const photo = hero.querySelector(".polaroid"), text = hero.querySelector(".about-intro");
    hero.style.gridTemplateColumns = "";
    if (window.innerWidth <= 900) return;              // stacked on small screens
    // try a range of splits and keep the one where the two heights match best
    let best = null;
    for (let f = 0.25; f <= 0.6001; f += 0.01) {
      hero.style.gridTemplateColumns = `minmax(0, ${f.toFixed(3)}fr) minmax(0, ${(1 - f).toFixed(3)}fr)`;
      const d = Math.abs(photo.getBoundingClientRect().height - text.getBoundingClientRect().height);
      if (!best || d < best.d) best = { f, d };
    }
    hero.style.gridTemplateColumns = `minmax(0, ${best.f.toFixed(3)}fr) minmax(0, ${(1 - best.f).toFixed(3)}fr)`;
  }
  const layoutVisible = () => { document.querySelectorAll(".panel:not([hidden]) .grid").forEach(layout); balanceAbout(); };
  // rebalance once the web font and the Polaroid image have loaded (both change the heights)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(balanceAbout);
  const aboutImg = document.querySelector(".polaroid img");
  if (aboutImg) aboutImg.addEventListener("load", balanceAbout);
  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layoutVisible, 80); });

  // Tab switching via the URL hash (#about, #painting, ...), so each tab has its own link
  // About is the last tab
  const aboutTab = document.createElement("a");
  aboutTab.href = "#about"; aboutTab.dataset.tab = "about"; aboutTab.textContent = "About";
  tabs.appendChild(aboutTab);
  [...tabs.querySelectorAll("a")].forEach((a, i) => a.style.setProperty("--c", TAB_COLOURS[i % TAB_COLOURS.length]));
  function route() {
    let id = location.hash.slice(1) || "fine-art";   // the site opens on Fine Art
    if (["printmaking", "sculpture-and-3d", "sketchbooks", "studio"].includes(id)) id = "fine-art";   // old links to removed tabs
    if (["painting", "drawing"].includes(id)) id = "fine-art";
    const tabId = id;                                   // "contact" highlights its own tab but shows About
    if (id === "contact") id = "about";
    if (!document.querySelector(`[data-panel="${id}"]`)) id = "fine-art";   // old #home links and anything unknown
    const was = document.querySelector("[data-panel]:not([hidden])");
    document.querySelectorAll("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== id; });
    // switching tabs: the new section rises softly into place
    const now = document.querySelector("[data-panel]:not([hidden])");
    if (was && now && was !== now && !window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      now.animate([{ opacity: 0, transform: "translateY(14px)", filter: "blur(3px)" }, { opacity: 1, transform: "none", filter: "none" }], { duration: 520, easing: "cubic-bezier(.16, 1, .3, 1)" });
    tabs.querySelectorAll("a").forEach(a => {
      if (a.dataset.tab === (tabId === "contact" ? "contact" : id)) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    // on phones the tab row scrolls sideways: keep the active tab visible
    const active = tabs.querySelector('[aria-current="page"]');
    if (active && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = active.offsetLeft - tabs.offsetLeft - 20;
    const label = tabId === "contact" ? "Contact" : id === "about" ? "About" : MEDIUMS.find(m => slug(m) === id);
    document.title = `${label} · Stella Creates Art`;
    layoutVisible();
  }
  window.addEventListener("hashchange", () => {
    route();
    // after switching tab, start the new gallery just under the pinned bar
    const barTop = document.querySelector(".bar-sentinel").getBoundingClientRect().top + window.scrollY;
    if (location.hash === "#contact") scrollToContact();
    else if (window.scrollY > barTop) window.scrollTo({ top: barTop, behavior: "auto" });
  });
  function scrollToContact() {
    const el = document.getElementById("contact"), bar = document.querySelector(".tabbar");
    requestAnimationFrame(() => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - bar.offsetHeight - 24, behavior: "smooth" }));
  }
  route();
  if (location.hash === "#contact") scrollToContact();


  // The wordmark is scaled so "STELLA CREATES ART" runs exactly edge to edge of the page
  function fitWordmark() {
    const wm = document.querySelector(".wordmark");
    const cs = getComputedStyle(wm.parentElement);
    const avail = wm.parentElement.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const range = document.createRange(); range.selectNodeContents(wm);
    // the typeface changes its proportions with size (optical sizing), so refine the size a few times
    let size = 100;
    for (let k = 0; k < 4; k++) {
      wm.style.fontSize = size + "px";
      size = size * avail / range.getBoundingClientRect().width;
    }
    wm.style.fontSize = (Math.floor(size * 100) / 100) + "px";
  }
  fitWordmark();
  window.addEventListener("resize", fitWordmark);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitWordmark);

  // Show the shadow and email in the tab bar once it is pinned to the top
  const tabbar = document.querySelector(".tabbar"), barEmail = document.querySelector(".bar-email");
  new IntersectionObserver(([e]) => {
    const pinned = !e.isIntersecting && e.boundingClientRect.top < 0;
    tabbar.classList.toggle("is-pinned", pinned);
    barEmail.tabIndex = pinned ? 0 : -1;
  }).observe(document.querySelector(".bar-sentinel"));

  // Lightbox: the piece grows out of its place on the wall, 
  const lb = document.getElementById("lightbox");
  const img = document.getElementById("lb-img");
  const prev = lb.querySelector(".lb-prev"), next = lb.querySelector(".lb-next");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let list = [], idx = 0, lastFocus = null;

  function show() {
    const it = list[idx];
    img.src = it.thumb;                                   // already loaded: appears instantly
    const full = new Image(); full.src = it.src;          // then swap in the full-resolution file
    full.decode().then(() => { if (list[idx] === it) img.src = it.src; }).catch(() => {});
    img.alt = it.alt || "";
    document.getElementById("lb-title").innerHTML = it.titleHTML;
    document.getElementById("lb-meta").textContent = it.meta || "";
    const pr = document.getElementById("lb-prints");
    pr.hidden = !it.prints;
    if (it.prints) {
      pr.textContent = "Prints available. Email me";
      pr.href = "mailto:stellabagchi@gmail.com?subject=" + encodeURIComponent("Print of " + it.prints);
    }
    prev.style.visibility = next.style.visibility = list.length > 1 ? "visible" : "hidden";
  }
  function open(l, i, fromEl) {
    list = l; idx = i; lastFocus = document.activeElement;
    show(); lb.hidden = false; document.body.style.overflow = "hidden";
    lb.querySelector(".lb-close").focus();
    if (reduceMotion || !fromEl) return;
    lb.animate([{ backgroundColor: "rgba(8,8,8,0)" }, { backgroundColor: "rgba(8,8,8,.97)" }], { duration: 380, easing: "ease-out" });
    const grow = () => {
      const from = fromEl.getBoundingClientRect(), to = img.getBoundingClientRect();
      if (!to.width) return;
      const s = from.width / to.width, dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2);
      img.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: "none" }], { duration: 560, easing: "cubic-bezier(.16, 1, .3, 1)" });
      lb.querySelectorAll("figcaption, button").forEach(el => el.animate([{ opacity: 0 }, { opacity: 0 , offset: .4 }, { opacity: 1 }], { duration: 560, easing: "ease-out" }));
    };
    img.complete ? grow() : img.addEventListener("load", grow, { once: true });
  }
  function close() {
    const done = () => { lb.hidden = true; document.body.style.overflow = ""; if (lastFocus) lastFocus.focus(); };
    if (reduceMotion) return done();
    lb.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-in" }).onfinish = done;
  }
  const step = d => {
    if (list.length < 2) return;
    idx = (idx + d + list.length) % list.length; show();
    if (!reduceMotion) img.animate([{ opacity: 0, transform: `translateX(${d * 24}px)` }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.16, 1, .3, 1)" });
  };

  lb.querySelector(".lb-close").addEventListener("click", close);
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  lb.addEventListener("click", e => { if (e.target === lb || e.target.tagName === "FIGURE") close(); });
  document.addEventListener("keydown", e => {
    if (lb.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
    if (e.key === "Tab") {                                // keep keyboard focus inside the viewer
      const f = [...lb.querySelectorAll("button, a")].filter(x => x.style.visibility !== "hidden" && !x.hidden);
      const at = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(at + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  let touchX = null;
  // swipe left/right to move between pieces, but not while pinching
  const pinched = () => window.visualViewport && window.visualViewport.scale > 1.01;
  lb.addEventListener("touchstart", e => { touchX = e.touches.length === 1 && !pinched() ? e.touches[0].clientX : null; }, { passive: true });
  lb.addEventListener("touchend", e => {
    if (touchX === null || pinched()) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    touchX = null;
  });

  document.getElementById("year").textContent = new Date().getFullYear();
})();
