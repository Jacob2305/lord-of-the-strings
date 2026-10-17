/* ==========================================================
   BeaverSpot shared script (every page loads this first).
   - draws the site header, breadcrumb and footer
   - loads data/buildings.json and the floor files it points to
   - photo(): an <img> that turns into a designed placeholder if the file is missing
   Everything is exposed on window.BeaverSite.
   ========================================================== */
(function () {
  "use strict";

  const SITE_DATA = "data/buildings.json";

  /* ---------------- tiny helpers ---------------- */
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === "text") el.textContent = attrs[k];
      else if (k === "html") el.innerHTML = attrs[k];
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => c && el.append(c));
    return el;
  }
  const params = () => new URLSearchParams(location.search);
  // simple line art for missing photos: a campus building with a tree
  const PH_ART = '<svg viewBox="0 0 120 80" aria-hidden="true"><path d="M10 72h100M22 72V30l28-14 28 14v42M50 16v-6M34 38h8v8h-8zM58 38h8v8h-8zM34 54h8v8h-8zM58 54h8v8h-8zM46 72V58h8v14"/><circle cx="96" cy="46" r="12"/><path d="M96 58v14"/></svg>';

  /* ---------------- data ---------------- */
  let sitePromise = null;
  function loadSite() {
    if (!sitePromise) {
      sitePromise = fetch(SITE_DATA).then((r) => {
        if (!r.ok) throw new Error(SITE_DATA + ": " + r.status);
        return r.json();
      });
    }
    return sitePromise;
  }
  function findBuilding(site, id) {
    id = (id || "").toLowerCase();
    return site.buildings.find((b) => b.id === id) || null;
  }

  // Every room on every live floor, from the floor files listed in buildings.json.
  let roomsPromise = null;
  function loadRooms() {
    if (!roomsPromise) {
      roomsPromise = loadSite().then((site) => {
        const jobs = [];
        site.buildings.filter((b) => b.status === "live").forEach((b) => {
          (b.floors || []).filter((f) => f.status === "live" && f.data).forEach((f) => {
            jobs.push(fetch(f.data).then((r) => r.json()).then((d) =>
              d.rooms.filter((r) => r.type === "room").map((r) => ({
                id: r.id,
                aliases: r.aliases || [],
                building: b,
                floor: f,
                href: f.page + "&room=" + encodeURIComponent(r.id),
              }))).catch(() => []));
          });
        });
        return Promise.all(jobs).then((lists) => lists.flat());
      });
    }
    return roomsPromise;
  }

  /* ---------------- header / breadcrumb / footer ---------------- */
  function renderChrome() {
    const page = document.body.getAttribute("data-page") || "";
    const main = document.querySelector("main");
    if (main && !main.id) main.id = "main";

    if (!document.querySelector(".site-skip")) {
      document.body.prepend(h("a", { class: "site-skip", href: "#" + (main ? main.id : "main"), text: "Skip to main content" }));
    }

    const header = document.getElementById("site-header");
    if (header) {
      header.className = "site-header";
      const link = (href, text, current) =>
        h("li", {}, [h("a", { href, "aria-current": current ? "page" : null, text })]);
      header.replaceChildren(h("div", { class: "site-header__inner wrap" }, [
        h("a", { class: "site-mark", href: "index.html", html: "Beaver<span>Spot</span>", "aria-label": "BeaverSpot home" }),
        h("nav", { class: "site-nav", "aria-label": "Main" }, [h("ul", {}, [
          link("index.html", "Home", page === "home"),
          link("index.html#buildings", "Buildings", false),
        ])]),
      ]));
    }

    const footer = document.getElementById("site-footer");
    if (footer) {
      footer.className = "site-footer";
      footer.replaceChildren(h("div", { class: "site-footer__inner wrap" }, [
        h("p", {}, [
          h("strong", { text: "BeaverSpot" }),
          document.createTextNode("A student project for a web design course at the City College of New York. " +
            "Not an official CCNY site; room details may be out of date."),
        ]),
      ]));
    }

    // floor.html builds its breadcrumb from the URL; other pages call setCrumbs()
    if (page === "floor") {
      const p = params();
      const bId = p.get("building") || "nac", fl = p.get("floor") || "6";
      setCrumbs([{ label: "Home", href: "index.html" }, { label: bId.toUpperCase() }, { label: "Floor " + fl }]);
      loadSite().then((site) => {
        const b = findBuilding(site, bId);
        if (!b) return;
        setCrumbs([
          { label: "Home", href: "index.html" },
          { label: b.short, href: "building.html?building=" + encodeURIComponent(b.id) },
          { label: "Floor " + fl },
        ]);
      }).catch(() => {});
    }
  }

  function setCrumbs(items) {
    const nav = document.getElementById("crumbs");
    if (!nav) return;
    nav.className = "crumbs";
    nav.setAttribute("aria-label", "Breadcrumb");
    const ol = h("ol", { class: "wrap" });
    items.forEach((it, i) => {
      const last = i === items.length - 1;
      ol.append(h("li", {}, [last || !it.href
        ? h("span", { "aria-current": last ? "page" : null, text: it.label })
        : h("a", { href: it.href, text: it.label })]));
    });
    nav.replaceChildren(ol);
  }

  /* ---------------- photo with placeholder ---------------- */
  // Returns <div class="photo"> holding an <img>. If the file is missing, the
  // img is swapped for a placeholder naming the expected path, so dropping the
  // real file at that path later needs no code change.
  function photo(opts) {
    const box = h("div", { class: "photo " + (opts.className || "") });
    const img = h("img", { alt: opts.alt || "", decoding: "async", loading: opts.eager ? "eager" : "lazy" });
    if (opts.focus) img.style.objectPosition = opts.focus;
    const fail = () => {
      box.classList.add("is-missing");
      const ph = h("div", { class: "photo__ph", role: opts.alt ? "img" : null,
        "aria-label": opts.alt ? "Photo not added yet: " + opts.alt : null }, []);
      ph.innerHTML = PH_ART;
      ph.append(h("span", { text: (opts.label || "Photo") + " photo goes here:" }), h("code", { text: opts.src || "(no path set)" }));
      img.replaceWith(ph);
    };
    img.addEventListener("error", fail, { once: true });
    if (opts.src) img.src = opts.src; else setTimeout(fail);
    box.append(img);
    return box;
  }

  window.BeaverSite = { loadSite, loadRooms, findBuilding, setCrumbs, photo, h, params };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderChrome);
  else renderChrome();
})();
