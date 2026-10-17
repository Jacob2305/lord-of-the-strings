/* ==========================================================
   BeaverSpot floor plan (floor.html)
   Draws one floor as a flat SVG from data/floor-6.json. Nothing about the
   rooms is hard-coded here: shapes, labels and positions all come from the
   JSON, which tools/extract_rooms.py generates from the sign photos.

   Map coordinates ("units") are pixels of the straightened, stitched photo
   (see "units" in the JSON). The view is { cx, cy, s }: the map point at
   the center of the screen and the zoom in screen px per map unit.
   ========================================================== */
(function () {
  "use strict";

  const CONFIG = {
    dataUrl: "data/floor-6.json",
    amenitiesUrl: "data/amenities-6.json",
    labelPx: 13,          // room numbers, constant size on screen
    minorPx: 11,          // "Stair", "Men" ... labels
    labelPad: 3,          // px of air between a label and the walls around it
    minZoom: 0.8,         // x the "whole floor" zoom
    maxZoom: 14,          // x the "whole floor" zoom (raised if a room needs more)
    animMs: 450,
    wheelSpeed: 0.0015,
  };

  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const map = $("fp-map");
  const svg = $("fp-svg");
  const statusEl = $("fp-status");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let data = null;
  let rooms = [];               // every entry in the JSON, with parsed geometry
  let amenities = {};           // room id -> amenities, from data/amenities-6.json (+ edits made on the page)
  let amenitiesFromFile = {};   // the file as loaded, never edited
  const editedRooms = new Set();  // rooms changed with "Update amenities" since the page loaded
  const byId = new Map();
  let selected = null;
  let bounds = null;            // floor bounding box in map units
  const view = { cx: 0, cy: 0, s: 1 };
  let fitScale = 1, minScale = 0.1, maxScale = 10;
  let viewW = 1, viewH = 1;
  let layers = {};

  /* ---------------- helpers ---------------- */
  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function parsePath(d) {
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    return pts;
  }

  function bboxOf(polys) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    polys.forEach((p) => p.forEach(([x, y]) => {
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }));
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  function inside(poly, x, y) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  // Does segment a-b pass through the open box? (Liang-Barsky clipping)
  function segHitsBox(ax, ay, bx, by, x0, y0, x1, y1) {
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    const p = [-dx, dx, -dy, dy], q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] <= 0) return false; }
      else {
        const r = q[i] / p[i];
        if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
    }
    return t1 - t0 > 1e-6;
  }

  function boxFits(poly, cx, cy, hw, hh) {
    const x0 = cx - hw, x1 = cx + hw, y0 = cy - hh, y1 = cy + hh;
    if (!inside(poly, x0, y0) || !inside(poly, x1, y0) || !inside(poly, x1, y1) || !inside(poly, x0, y1)) return false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if (segHitsBox(poly[j][0], poly[j][1], poly[i][0], poly[i][1], x0, y0, x1, y1)) return false;
    }
    return true;
  }

  // Largest k so a w x h box (screen px) scaled by k fits in the polygon around
  // (cx, cy). The label then fits at any zoom s >= 1 / k.
  function maxFit(poly, cx, cy, w, h) {
    let lo = 0, hi = 50;
    if (!boxFits(poly, cx, cy, 1e-3, 1e-3)) return 0;
    for (let i = 0; i < 22; i++) {
      const k = (lo + hi) / 2;
      if (boxFits(poly, cx, cy, (k * w) / 2, (k * h) / 2)) lo = k; else hi = k;
    }
    return lo;
  }

  const measureCtx = document.createElement("canvas").getContext("2d");
  function textWidth(text, px, weight) {
    measureCtx.font = weight + " " + px + "px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    return measureCtx.measureText(text).width;
  }

  function natural(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  }

  function displayName(r) {
    // strips are stored as "6225-6265": show a real range dash
    return r.id.replace(/^(\d+)-(\d+)$/, "$1–$2");
  }

  /* ---------------- load ---------------- */
  // URL: floor.html?building=nac&floor=6[&room=6313]. Without params it shows
  // NAC floor 6. The floor's data file is looked up in data/buildings.json.
  const urlParams = new URLSearchParams(location.search);
  const want = {
    building: (urlParams.get("building") || "nac").toLowerCase(),
    floor: urlParams.get("floor") || "6",
    room: urlParams.get("room"),
  };

  function resolveDataUrl() {
    return fetch("data/buildings.json")
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((site) => {
        // no building list: fall back to the one floor we have
        if (!site) return { data: CONFIG.dataUrl, amenities: CONFIG.amenitiesUrl };
        const b = site.buildings.find((x) => x.id === want.building);
        const f = b && b.status === "live" &&
          (b.floors || []).find((x) => x.floor === want.floor && x.status === "live" && x.data);
        if (!f) { const e = new Error("not mapped"); e.notMapped = true; throw e; }
        return f;
      });
  }

  // The amenities file is optional: if it is missing or broken the map still
  // loads and every room just shows "no amenity info yet".
  function loadAmenities(url) {
    if (!url) return Promise.resolve({});
    return fetch(url)
      .then((res) => { if (!res.ok) throw new Error(res.status + " " + res.statusText); return res.json(); })
      .then((json) => json.rooms || {})
      .catch((err) => { console.warn("Could not load " + url + ": " + err.message); return {}; });
  }

  statusEl.textContent = "Loading floor plan…";
  let dataUrl = CONFIG.dataUrl;
  resolveDataUrl()
    .then((f) => {
      dataUrl = f.data;
      const floor = fetch(f.data)
        .then((res) => { if (!res.ok) throw new Error(res.status + " " + res.statusText); return res.json(); });
      return Promise.all([floor, loadAmenities(f.amenities)]);
    })
    .then(([json, info]) => {
      amenities = info;
      amenitiesFromFile = JSON.parse(JSON.stringify(info));   // untouched copy for "Reset room"
      statusEl.textContent = "";
      init(json);
      openRoomFromUrl();
    })
    .catch((err) => {
      if (err.notMapped) {
        statusEl.replaceChildren("This floor is not mapped yet. ");
        const a = document.createElement("a");
        a.href = "index.html";
        a.textContent = "Back to home";
        statusEl.append(a);
        return;
      }
      statusEl.textContent = "Could not load " + dataUrl + " (" + err.message +
        "). Open this page through a local server, for example VS Code Live Server.";
    });

  // ?room=6313 (or a lettered office like 6295B): open with it selected and zoomed
  function openRoomFromUrl() {
    if (!want.room) return;
    const q = want.room.toLowerCase();
    const r = rooms.find((x) => x.clickable &&
      (x.id.toLowerCase() === q || (x.aliases || []).some((a) => a.toLowerCase() === q)));
    if (r) select(r, { zoom: true, instant: true });
    else statusEl.textContent = "Room " + want.room + " is not on this floor plan.";
  }

  function init(json) {
    data = json;
    const title = data.building + " · Floor " + data.floor;
    $("fp-title").textContent = title;
    document.title = title + " | BeaverSpot";

    rooms = data.rooms.map((r) => {
      const polys = r.shapes.map(parsePath);
      const room = Object.assign({}, r, { polys, bbox: bboxOf(polys), clickable: r.type === "room" });
      byId.set(r.id, room);
      return room;
    });
    const [vx, vy, vw, vh] = data.viewBox;
    bounds = { x0: vx, y0: vy, x1: vx + vw, y1: vy + vh, w: vw, h: vh };

    buildSvg();
    prepareLabels();
    buildList();
    buildFilters();
    buildEditor();
    bindEvents();

    const ro = new ResizeObserver(() => onResize());
    ro.observe(map);
    onResize(true);
  }

  /* ---------------- drawing ---------------- */
  function buildSvg() {
    svg.replaceChildren();
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    const defs = el("defs", {}, svg);
    const hatch = el("pattern", { id: "fp-hatch", patternUnits: "userSpaceOnUse", width: 14, height: 14,
      patternTransform: "rotate(45)" }, defs);
    el("rect", { width: 14, height: 14, fill: "#f3f2f6" }, hatch);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 14, stroke: "#cbc6d3", "stroke-width": 4 }, hatch);

    layers.floor = el("g", { class: "fp-floor", "aria-hidden": "true" }, svg);
    (data.outline || []).forEach((d) => el("path", { d }, layers.floor));

    layers.spaces = el("g", { class: "fp-spaces", "aria-hidden": "true" }, svg);
    layers.rooms = el("g", { class: "fp-rooms" }, svg);
    layers.top = el("g", { class: "fp-top", "aria-hidden": "true" }, svg);
    layers.labelsMinor = el("g", { class: "fp-labels", "aria-hidden": "true" }, svg);
    layers.labels = el("g", { class: "fp-labels", "aria-hidden": "true" }, svg);

    // keyboard order follows the plan: rows top to bottom, then left to right
    const ordered = rooms.slice().sort((a, b) =>
      Math.round(a.labelAt[1] / 120) - Math.round(b.labelAt[1] / 120) || a.labelAt[0] - b.labelAt[0]);

    ordered.forEach((r) => {
      const g = el("g", { "data-room": r.id }, r.clickable ? layers.rooms : layers.spaces);
      if (r.clickable) {
        g.setAttribute("class", "fp-room");
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
        g.setAttribute("aria-pressed", "false");
        g.setAttribute("aria-label", (r.id.includes("-") ? "Rooms " : "Room ") + displayName(r));
      } else {
        g.setAttribute("class", "fp-space t-" + r.type);
      }
      r.shapes.forEach((d) => el("path", { d }, g));
      r.g = g;
    });
  }

  function prepareLabels() {
    let need = 0;
    rooms.forEach((r) => {
      if (!r.label) return;
      const minor = r.type !== "room";
      const px = minor ? CONFIG.minorPx : CONFIG.labelPx;
      const w = textWidth(r.label, px, minor ? 500 : 600) + 2 * CONFIG.labelPad;
      const h = px * 0.9 + 2 * CONFIG.labelPad;
      const [cx, cy] = r.labelAt;
      const poly = r.polys.find((p) => inside(p, cx, cy)) ||
        r.polys.reduce((a, b) => (bboxOf([b]).w * bboxOf([b]).h > bboxOf([a]).w * bboxOf([a]).h ? b : a));
      const kH = maxFit(poly, cx, cy, w, h);
      // turn the label on its side only in clearly tall, narrow rooms (as the
      // sign does for 6116-6120); square rooms just wait until it fits flat
      const pb = bboxOf([poly]);
      const kV = pb.h >= 1.5 * pb.w ? maxFit(poly, cx, cy, h, w) : 0;
      // zoom at which the label first fits flat / turned on its side
      r.minH = kH > 0 ? 1 / kH : Infinity;
      r.minV = kV > 0 ? 1 / kV : Infinity;
      r.labelScale = Math.min(r.minH, r.minV);
      if (r.clickable && isFinite(r.labelScale)) need = Math.max(need, r.labelScale);
      const t = el("text", { x: cx, y: cy, hidden: "" }, minor ? layers.labelsMinor : layers.labels);
      if (minor) t.setAttribute("class", "is-minor");
      t.textContent = r.label;
      r.text = t;
      r.labelMode = null;
    });
    rooms.needScale = need;
  }

  function updateLabels() {
    const s = view.s;
    layers.labels.setAttribute("font-size", (CONFIG.labelPx / s).toFixed(4));
    layers.labelsMinor.setAttribute("font-size", (CONFIG.minorPx / s).toFixed(4));
    rooms.forEach((r) => {
      if (!r.text) return;
      // flat if it fits; on its side only if that fits and flat does not
      const mode = s >= r.minH ? "h" : s >= r.minV ? "v" : null;
      if (mode === r.labelMode) return;
      r.labelMode = mode;
      if (!mode) { r.text.setAttribute("hidden", ""); return; }
      r.text.removeAttribute("hidden");
      if (mode === "v") r.text.setAttribute("transform", "rotate(-90 " + r.labelAt[0] + " " + r.labelAt[1] + ")");
      else r.text.removeAttribute("transform");
    });
  }

  /* ---------------- view / zoom / pan ---------------- */
  let raf = 0;
  function render() {
    raf = 0;
    const w = viewW / view.s, h = viewH / view.s;
    svg.setAttribute("viewBox", [view.cx - w / 2, view.cy - h / 2, w, h].map((v) => v.toFixed(2)).join(" "));
    updateLabels();
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(render); }

  function clampView(v) {
    v.s = clamp(v.s, minScale, maxScale);
    // the screen center may not leave the floor, so the plan cannot get lost
    v.cx = clamp(v.cx, bounds.x0, bounds.x1);
    v.cy = clamp(v.cy, bounds.y0, bounds.y1);
    return v;
  }
  function setView(v) { Object.assign(view, clampView(v)); schedule(); }

  function fitView() {
    return { cx: bounds.x0 + bounds.w / 2, cy: bounds.y0 + bounds.h / 2, s: fitScale };
  }

  function onResize(first) {
    const r = map.getBoundingClientRect();
    if (!r.width || !r.height) return;
    viewW = r.width; viewH = r.height;
    fitScale = Math.min(viewW / bounds.w, viewH / bounds.h);
    minScale = fitScale * CONFIG.minZoom;
    // make sure that fully zoomed in, every room has its number
    maxScale = Math.max(fitScale * CONFIG.maxZoom, (rooms.needScale || 0) * 1.05);
    if (first === true) Object.assign(view, fitView());
    setView(Object.assign({}, view));
    render();
  }

  function screenPoint(e) {
    const r = map.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function toMap(p, v) {
    v = v || view;
    return { x: v.cx + (p.x - viewW / 2) / v.s, y: v.cy + (p.y - viewH / 2) / v.s };
  }
  // a view at zoom s that keeps map point m under screen point p
  function viewKeeping(m, p, s) {
    return { s, cx: m.x - (p.x - viewW / 2) / s, cy: m.y - (p.y - viewH / 2) / s };
  }

  function zoomAt(p, factor) {
    const s = clamp(view.s * factor, minScale, maxScale);
    setView(viewKeeping(toMap(p), p, s));
  }

  let anim = 0;
  function stopAnim() { if (anim) cancelAnimationFrame(anim); anim = 0; }
  function animateTo(target) {
    stopAnim();
    target = clampView(Object.assign({}, target));
    if (reduceMotion.matches) { setView(target); return; }
    const from = Object.assign({}, view);
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / CONFIG.animMs);
      const e = ease(t);
      // zoom moves in log space so it feels even; center follows linearly
      const s = from.s * Math.pow(target.s / from.s, e);
      Object.assign(view, { s, cx: from.cx + (target.cx - from.cx) * e, cy: from.cy + (target.cy - from.cy) * e });
      render();
      anim = t < 1 ? requestAnimationFrame(step) : 0;
    };
    anim = requestAnimationFrame(step);
  }
  function animateZoomAt(p, factor) {
    const s = clamp(view.s * factor, minScale, maxScale);
    animateTo(viewKeeping(toMap(p), p, s));
  }

  function zoomToRoom(r, instant) {
    const b = r.bbox;
    let s = Math.min(viewW / (b.w * 3), viewH / (b.h * 3));   // room about a third of the view
    s = Math.max(s, (isFinite(r.labelScale) ? r.labelScale : 0) * 1.15, fitScale * 2.5);
    if (instant) setView({ cx: b.cx, cy: b.cy, s });           // page load: no animation
    else animateTo({ cx: b.cx, cy: b.cy, s });
  }

  /* ---------------- selection ---------------- */
  function drawCopy(r, cls) {
    const g = el("g", { class: cls }, layers.top);
    r.shapes.forEach((d) => el("path", { d }, g));
    return g;
  }

  function select(r, opts) {
    opts = opts || {};
    if (!r || !r.clickable) return;
    if (selected) {
      selected.g.classList.remove("is-selected");
      selected.g.setAttribute("aria-pressed", "false");
    }
    selected = r;
    r.g.classList.add("is-selected");
    r.g.setAttribute("aria-pressed", "true");
    layers.top.querySelectorAll(".fp-sel").forEach((n) => n.remove());
    drawCopy(r, "fp-sel");

    $("fp-details-title").textContent = (r.id.includes("-") ? "Rooms " : "Room ") + displayName(r);
    $("fp-details-where").textContent = data.building + " · Floor " + data.floor;
    const notes = [];
    if (r.aliases && r.aliases.length) {
      notes.push(r.id.includes("-") ? r.aliases.length + " small rooms in a row"
        : "Includes " + r.aliases.join(", "));
    }
    if (r.confidence === "low") notes.push("Room number read from a photo of the floor sign; not checked yet.");
    const note = $("fp-details-note");
    note.textContent = notes.join(" ");
    note.hidden = !notes.length;
    showAmenities(r);
    loadEditor(r);
    showDetails(true);

    // jump the picker to this room's hundred (while filtering, the list shows matches instead)
    if (!activeFilters.size && seriesOf(r) !== series) showSeries(seriesOf(r));
    listButtons.forEach((b, id) => b.setAttribute("aria-current", id === r.id ? "true" : "false"));
    const b = listButtons.get(r.id);
    if (b && b.offsetParent) b.scrollIntoView({ block: "nearest" });
    if (opts.zoom) zoomToRoom(r, opts.instant);
  }

  function clearSelection() {
    if (!selected) return;
    selected.g.classList.remove("is-selected");
    selected.g.setAttribute("aria-pressed", "false");
    selected = null;
    layers.top.querySelectorAll(".fp-sel").forEach((n) => n.remove());
    showDetails(false);
    listButtons.forEach((b) => b.setAttribute("aria-current", "false"));
  }

  // Opening/closing the details panel changes the map's size. Measure it right
  // away (not on the next ResizeObserver tick) so a zoom that follows fits the
  // new, smaller map.
  function showDetails(open) {
    const stage = $("fp-stage");
    if (stage.classList.contains("has-room") === open) return;
    $("fp-details").hidden = !open;
    stage.classList.toggle("has-room", open);
    onResize();
  }

  /* ---------------- room amenities ---------------- */
  // Checked-in-person amenities from the amenities file (see its _readme for the
  // fields). Fields left out of a room's entry show as "Not checked"; a value
  // outside the allowed list shows as-is and logs a warning so typos get noticed.
  const LEVELS = {
    outlets: { none: "None", few: "A few", some: "Some", many: "Many", "every-seat": "At every seat" },
    wifi: { none: "None", weak: "Weak", ok: "OK", good: "Good", excellent: "Excellent" },
    noise: { silent: "Silent", quiet: "Quiet", moderate: "Moderate", loud: "Loud" },
  };
  const yesNo = (v) => (v === true ? "Yes" : v === false ? "No" : null);
  const AMENITY_FIELDS = [
    { key: "capacity",     label: "Seats",         show: (v) => (Number.isInteger(v) && v >= 0 ? String(v) : null) },
    { key: "outlets",      label: "Outlets",       show: (v) => LEVELS.outlets[v] || null },
    { key: "microwave",    label: "Microwave",     show: yesNo },
    { key: "wifi",         label: "Wi-Fi",         show: (v) => LEVELS.wifi[v] || null },
    { key: "noise",        label: "Noise",         show: (v) => LEVELS.noise[v] || null },
    { key: "naturalLight", label: "Natural light", show: yesNo },
    { key: "hours",        label: "Hours",         show: (v) => (typeof v === "string" && v.trim()) || null },
  ];

  function showAmenities(r) {
    const info = amenities[r.id];
    const list = $("fp-amenities-list");
    const extra = $("fp-amenities-extra");
    list.replaceChildren();
    list.hidden = !info;
    $("fp-amenities-empty").hidden = !!info;
    extra.hidden = true;
    if (!info) return;

    AMENITY_FIELDS.forEach((f) => {
      const v = info[f.key];
      const given = v !== undefined && v !== null;
      let text = given ? f.show(v) : null;
      if (given && text === null) {
        console.warn("amenities: room " + r.id + " has an unexpected " + f.key + ":", v);
        text = String(v);
      }
      const row = document.createElement("div");
      if (text === null) row.className = "is-unknown";
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = f.label;
      dd.textContent = text === null ? "Not checked" : text;
      row.append(dt, dd);
      list.appendChild(row);
    });

    const bits = [];
    if (info.notes) bits.push(info.notes);
    if (info.checked) bits.push("Checked " + info.checked + ".");
    if (editedRooms.has(r.id)) bits.push("Edited on this page (not saved).");
    extra.textContent = bits.join(" ");
    extra.hidden = !bits.length;
  }

  /* ---------------- amenity editor (front end only) ---------------- */
  // "Update amenities" under the amenity boxes: one control per field in
  // AMENITY_FIELDS. Every change goes straight into `amenities`, so the boxes
  // and the map filters update at once. Nothing is saved: reloading the page
  // brings back data/amenities-6.json. Each control starts at "Not checked"
  // when the room has no value for it; clearing a control removes the value.
  const EDIT_KIND = {
    capacity: "number", outlets: "level", microwave: "yesno", wifi: "level",
    noise: "level", naturalLight: "yesno", hours: "text",
  };
  const MSG_UNSAVED = "Changes show right away but aren't saved: reloading the page resets them.";
  const editors = new Map();      // field key -> { show(value) } that puts a value into its control

  function setAmenity(key, value) {
    if (!selected) return;
    const r = selected;
    const info = amenities[r.id] || (amenities[r.id] = {});
    if (value === null) delete info[key];
    else info[key] = value;
    if (!Object.keys(info).length) delete amenities[r.id];
    editedRooms.add(r.id);
    showAmenities(r);
    if (activeFilters.size) applyFilters();
    $("fp-edit-reset").hidden = false;
    $("fp-edit-status").textContent = MSG_UNSAVED;
  }

  function editRow(f) {
    const row = document.createElement("div");
    row.className = "fp-edit-row fp-edit-" + EDIT_KIND[f.key];
    const id = "fp-edit-" + f.key;
    const label = document.createElement(EDIT_KIND[f.key] === "yesno" ? "span" : "label");
    label.className = "fp-edit-label";
    label.id = id + "-label";
    label.textContent = f.label;
    if (label.tagName === "LABEL") label.htmlFor = id;
    row.appendChild(label);
    return { row, id, label };
  }

  // 1..n slider over the field's allowed values, e.g. noise: silent .. loud
  function levelEditor(f) {
    const { row, id } = editRow(f);
    const keys = Object.keys(LEVELS[f.key]);
    const names = keys.map((k) => LEVELS[f.key][k]);
    const out = document.createElement("output");
    out.htmlFor = id;
    const input = document.createElement("input");
    Object.assign(input, { type: "range", id, min: 0, max: keys.length - 1, step: 1 });
    const ends = document.createElement("span");
    ends.className = "fp-edit-ends";
    ends.setAttribute("aria-hidden", "true");
    ends.innerHTML = "<span></span><span></span>";
    ends.firstChild.textContent = names[0];
    ends.lastChild.textContent = names[names.length - 1];
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "fp-edit-clear";
    clear.textContent = "Not checked";
    clear.setAttribute("aria-label", f.label + ": set to not checked");
    row.append(out, input, ends, clear);

    function show(v) {
      const i = keys.indexOf(v);
      const set = i >= 0;
      input.value = set ? i : Math.floor((keys.length - 1) / 2);
      input.dataset.set = set ? "true" : "false";
      input.style.setProperty("--fill", set ? (i / (keys.length - 1)) * 100 + "%" : "0%");
      out.textContent = set ? names[i] : "Not checked";
      input.setAttribute("aria-valuetext", set ? names[i] : "Not checked");
      clear.hidden = !set;
    }
    // "input" fires while dragging and on arrow keys; a click on the thumb of an
    // unset slider fires nothing, so pointerup/Enter also count as setting it
    const commit = () => { const v = keys[Number(input.value)]; show(v); setAmenity(f.key, v); };
    input.addEventListener("input", commit);
    input.addEventListener("pointerup", commit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
    clear.addEventListener("click", () => { show(null); setAmenity(f.key, null); input.focus(); });
    return { row, show };
  }

  // Yes / No pair; pressing the pressed one again goes back to "Not checked"
  function yesNoEditor(f) {
    const { row, label } = editRow(f);
    const group = document.createElement("div");
    group.className = "fp-edit-pair";
    group.setAttribute("role", "group");
    group.setAttribute("aria-labelledby", label.id);
    const buttons = [true, false].map((val) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = val ? "Yes" : "No";
      b.addEventListener("click", () => {
        const v = b.getAttribute("aria-pressed") === "true" ? null : val;
        show(v);
        setAmenity(f.key, v);
      });
      group.appendChild(b);
      return b;
    });
    row.appendChild(group);
    function show(v) {
      buttons[0].setAttribute("aria-pressed", v === true ? "true" : "false");
      buttons[1].setAttribute("aria-pressed", v === false ? "true" : "false");
    }
    return { row, show };
  }

  function inputEditor(f, type) {
    const { row, id } = editRow(f);
    const input = document.createElement("input");
    input.id = id;
    input.type = type;
    input.placeholder = "Not checked";
    if (type === "number") Object.assign(input, { min: 0, max: 999, step: 1, inputMode: "numeric" });
    else input.maxLength = 60;
    row.appendChild(input);
    input.addEventListener("input", () => {
      if (type === "number") {
        const n = parseInt(input.value, 10);
        setAmenity(f.key, Number.isInteger(n) && n >= 0 ? n : null);
      } else {
        setAmenity(f.key, input.value.trim() || null);
      }
    });
    const show = (v) => { input.value = v === undefined || v === null ? "" : v; };
    return { row, show };
  }

  function buildEditor() {
    const rows = $("fp-edit-rows");
    rows.replaceChildren();
    AMENITY_FIELDS.forEach((f) => {
      const kind = EDIT_KIND[f.key];
      const ed = kind === "level" ? levelEditor(f)
        : kind === "yesno" ? yesNoEditor(f)
        : inputEditor(f, kind === "number" ? "number" : "text");
      rows.appendChild(ed.row);
      editors.set(f.key, ed);
    });
    $("fp-edit-form").addEventListener("submit", (e) => e.preventDefault());
    $("fp-edit-reset").addEventListener("click", () => {
      if (!selected) return;
      const r = selected;
      const orig = amenitiesFromFile[r.id];
      if (orig) amenities[r.id] = JSON.parse(JSON.stringify(orig));
      else delete amenities[r.id];
      editedRooms.delete(r.id);
      showAmenities(r);
      loadEditor(r);
      if (activeFilters.size) applyFilters();
      $("fp-edit-status").textContent = "Room reset to the saved data.";
    });
  }

  function loadEditor(r) {
    const info = amenities[r.id] || {};
    editors.forEach((ed, key) => ed.show(info[key]));
    $("fp-edit-reset").hidden = !editedRooms.has(r.id);
    $("fp-edit-status").textContent = editedRooms.has(r.id) ? MSG_UNSAVED : "Changes are not saved.";
  }

  /* ---------------- sidebar room picker ---------------- */
  // Step 1 picks the hundred (6100s / 6200s / 6300s, taken from the first two
  // digits of the room numbers in the data). Step 2 lists that hundred's rooms
  // by their last digits: 6313 shows as "13", 6207A as "07A".
  const listButtons = new Map();
  const seriesButtons = new Map();
  let series = null;

  const seriesOf = (r) => r.id.slice(0, 2);
  function shortName(r) {
    // "6313" -> "13", "6207A" -> "07A", "6225-6265" -> "25-65"
    const m = r.id.match(/^(\d\d)(\d\d\w*)(?:-\d\d(\d\d))?$/);
    return m ? m[2] + (m[3] ? "–" + m[3] : "") : r.id;
  }

  function buildList() {
    const list = $("fp-list"), row = $("fp-series");
    list.replaceChildren();
    row.replaceChildren();
    const groups = new Map();
    rooms.filter((r) => r.clickable).sort((a, b) => natural(a.id, b.id)).forEach((r) => {
      const k = seriesOf(r);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });

    [...groups.keys()].sort().forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = k + "00s";
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => showSeries(k));
      row.appendChild(b);
      seriesButtons.set(k, b);
    });

    groups.forEach((rs) => rs.forEach((r) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = shortName(r);
      b.setAttribute("aria-label", (r.id.includes("-") ? "Rooms " : "Room ") + displayName(r));
      b.setAttribute("aria-current", "false");
      if (r.id.includes("-")) { b.className = "fp-range"; li.className = "is-wide"; }
      b.addEventListener("click", () => select(r, { zoom: true }));
      li.appendChild(b);
      list.appendChild(li);
      r.li = li;
      listButtons.set(r.id, b);
    }));

    showSeries([...groups.keys()].sort()[0]);
  }

  /* ---------------- amenity filters ---------------- */
  // Toggle buttons above the picker. With any on, rooms matching all of them
  // are highlighted on the map (the rest fade) and the list shows just those
  // rooms, by full number since they can come from different hundreds. A room
  // with no amenity info, or without the field a filter needs, never matches.
  const FILTERS = [
    { key: "quiet",     label: "Quiet",         test: (a) => a.noise === "silent" || a.noise === "quiet" },
    { key: "outlets",   label: "Outlets",       test: (a) => ["some", "many", "every-seat"].includes(a.outlets) },
    { key: "wifi",      label: "Good Wi-Fi",    test: (a) => a.wifi === "good" || a.wifi === "excellent" },
    { key: "light",     label: "Natural light", test: (a) => a.naturalLight === true },
    { key: "microwave", label: "Microwave",     test: (a) => a.microwave === true },
    { key: "group",     label: "6+ seats",      test: (a) => Number.isInteger(a.capacity) && a.capacity >= 6 },
  ];
  const activeFilters = new Set();

  function matchesFilters(r) {
    const a = amenities[r.id];
    return !!a && FILTERS.every((f) => !activeFilters.has(f.key) || f.test(a));
  }

  function buildFilters() {
    const row = $("fp-filters");
    row.replaceChildren();
    FILTERS.forEach((f) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = f.label;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => {
        if (activeFilters.has(f.key)) activeFilters.delete(f.key);
        else activeFilters.add(f.key);
        b.setAttribute("aria-pressed", activeFilters.has(f.key) ? "true" : "false");
        applyFilters();
      });
      row.appendChild(b);
    });
    $("fp-filter-clear").addEventListener("click", () => {
      activeFilters.clear();
      row.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
      applyFilters();
      row.querySelector("button").focus();
    });
  }

  function applyFilters() {
    const on = activeFilters.size > 0;
    map.classList.toggle("is-filtering", on);
    $("fp-legend-match").hidden = !on;
    $("fp-filter-clear").hidden = !on;
    $("fp-series").hidden = on;

    let n = 0;
    rooms.forEach((r) => {
      if (!r.clickable) return;
      const m = on && matchesFilters(r);
      r.g.classList.toggle("is-match", m);
      if (r.text) r.text.classList.toggle("is-faded", on && !m);
      listButtons.get(r.id).textContent = on ? r.id.replace("-", "–") : shortName(r);
      if (on) r.li.hidden = !m;
      if (m) n++;
    });

    if (!on) { showSeries(series); return; }
    let text = n + (n === 1 ? " room matches" : " rooms match");
    if (!n) text += Object.keys(amenities).length
      ? ". Try turning a filter off."
      : ". No rooms have amenity info yet.";
    $("fp-count").textContent = text;
    $("fp-list").scrollTop = 0;
  }

  function showSeries(k) {
    if (!seriesButtons.has(k)) return;
    series = k;
    seriesButtons.forEach((b, key) => b.setAttribute("aria-pressed", key === k ? "true" : "false"));
    let n = 0;
    rooms.forEach((r) => {
      if (!r.li) return;
      r.li.hidden = seriesOf(r) !== k;
      if (!r.li.hidden) n++;
    });
    $("fp-count").textContent = k + "00s · " + n + (n === 1 ? " room" : " rooms");
    $("fp-list").scrollTop = 0;
  }

  /* ---------------- events ---------------- */
  function bindEvents() {
    $("fp-zoom-in").addEventListener("click", () => animateZoomAt({ x: viewW / 2, y: viewH / 2 }, 1.6));
    $("fp-zoom-out").addEventListener("click", () => animateZoomAt({ x: viewW / 2, y: viewH / 2 }, 1 / 1.6));
    $("fp-zoom-reset").addEventListener("click", () => animateTo(fitView()));
    $("fp-details-close").addEventListener("click", () => {
      const r = selected;
      clearSelection();
      if (r) r.g.focus({ preventScroll: true });
    });

    // --- pointer: drag to pan, two fingers to pinch / pan ---
    const pointers = new Map();
    let gesture = null, moved = false, downAt = null, swallowClick = false;
    const isControl = (t) => t.closest && t.closest(".fp-zoom, .fp-legend");

    function startGesture() {
      const pts = [...pointers.values()];
      if (pts.length === 1) {
        gesture = { type: "pan", m: toMap(pts[0]) };
      } else if (pts.length >= 2) {
        const [a, b] = pts;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        gesture = { type: "pinch", m: toMap(mid), s: view.s, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
      } else gesture = null;
    }

    map.addEventListener("pointerdown", (e) => {
      if (isControl(e.target)) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      stopAnim();
      pointers.set(e.pointerId, screenPoint(e));
      if (pointers.size === 1) { moved = false; downAt = screenPoint(e); }
      else moved = true;            // a second finger is always a gesture
      startGesture();
    });

    map.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      const p = screenPoint(e);
      pointers.set(e.pointerId, p);
      if (!moved) {
        if (Math.hypot(p.x - downAt.x, p.y - downAt.y) < 5) return;   // still a click
        moved = true;
      }
      // keep receiving moves if the pointer leaves the map mid-drag
      try { if (!map.hasPointerCapture(e.pointerId)) map.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
      map.classList.add("is-dragging");
      if (gesture.type === "pan") {
        setView(viewKeeping(gesture.m, p, view.s));
      } else {
        const [a, b] = [...pointers.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const s = clamp(gesture.s * Math.hypot(a.x - b.x, a.y - b.y) / gesture.d, minScale, maxScale);
        setView(viewKeeping(gesture.m, mid, s));
      }
    });

    function endPointer(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (moved) swallowClick = true;
      if (pointers.size) startGesture();     // pinch -> pan with the finger that is left
      else { gesture = null; map.classList.remove("is-dragging"); }
    }
    map.addEventListener("pointerup", endPointer);
    map.addEventListener("pointercancel", endPointer);

    svg.addEventListener("click", (e) => {
      if (swallowClick) { swallowClick = false; return; }
      const g = e.target.closest(".fp-room");
      if (g) select(byId.get(g.getAttribute("data-room")), { zoom: true });
      else clearSelection();
    });
    // a drag that ends outside the svg would leave the flag set
    map.addEventListener("pointerdown", () => { swallowClick = false; }, true);

    map.addEventListener("dblclick", (e) => {
      if (isControl(e.target)) return;
      e.preventDefault();
      animateZoomAt(screenPoint(e), 2);
    });

    map.addEventListener("wheel", (e) => {
      if (isControl(e.target)) return;
      e.preventDefault();
      stopAnim();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewH : 1;
      // trackpad pinch arrives as ctrl+wheel with small deltas
      const k = e.ctrlKey ? 0.01 : CONFIG.wheelSpeed;
      zoomAt(screenPoint(e), Math.exp(-e.deltaY * unit * k));
    }, { passive: false });

    // --- keyboard ---
    // (listeners live on the HTML container: in Chromium an SVG <g> with focus
    //  listeners becomes a tab stop itself)
    map.addEventListener("keydown", (e) => {
      const g = e.target.closest && e.target.closest(".fp-room");
      if (!g) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select(byId.get(g.getAttribute("data-room")), { zoom: true });
      }
    });
    map.addEventListener("keydown", (e) => {
      if (e.target.closest(".fp-zoom")) return;
      const c = { x: viewW / 2, y: viewH / 2 };
      const step = 80 / view.s;
      const keys = {
        "+": () => animateZoomAt(c, 1.6), "=": () => animateZoomAt(c, 1.6),
        "-": () => animateZoomAt(c, 1 / 1.6), "0": () => animateTo(fitView()),
        ArrowLeft: () => setView({ s: view.s, cx: view.cx - step, cy: view.cy }),
        ArrowRight: () => setView({ s: view.s, cx: view.cx + step, cy: view.cy }),
        ArrowUp: () => setView({ s: view.s, cx: view.cx, cy: view.cy - step }),
        ArrowDown: () => setView({ s: view.s, cx: view.cx, cy: view.cy + step }),
      };
      if (keys[e.key]) { e.preventDefault(); stopAnim(); keys[e.key](); }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && selected) clearSelection();
    });

    // keyboard focus ring (drawn on top) + keep the focused room on screen
    map.addEventListener("focusin", (e) => {
      const g = e.target.closest && e.target.closest(".fp-room");
      if (!g) return;
      layers.top.querySelectorAll(".fp-focus").forEach((n) => n.remove());
      if (!g.matches(":focus-visible")) return;
      const r = byId.get(g.getAttribute("data-room"));
      drawCopy(r, "fp-focus");
      const b = r.bbox, hw = viewW / 2 / view.s, hh = viewH / 2 / view.s;
      const out = b.x0 < view.cx - hw || b.x1 > view.cx + hw || b.y0 < view.cy - hh || b.y1 > view.cy + hh;
      if (out) animateTo({ cx: b.cx, cy: b.cy, s: Math.max(view.s, Math.min(r.labelScale * 1.1, maxScale)) });
    });
    map.addEventListener("focusout", () => {
      layers.top.querySelectorAll(".fp-focus").forEach((n) => n.remove());
    });
  }
})();
