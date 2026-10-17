/* ==========================================================
   Home page (index.html): hero photo and building tiles.
   Everything comes from data/buildings.json.
   ========================================================== */
(function () {
  "use strict";
  const S = window.BeaverSite;
  const h = S.h;

  S.loadSite().then((site) => {
    const c = site.campus;
    document.getElementById("campus-name").textContent = c.name;
    document.getElementById("hero-photo").append(
      S.photo({ src: c.image, alt: c.alt, focus: c.focus, label: "Campus", eager: true, className: "hero__img" }));

    const tiles = document.getElementById("tiles");
    tiles.replaceChildren(...site.buildings.map(tile));
  }).catch(() => {
    document.getElementById("tiles").replaceChildren(
      h("li", { class: "tiles__error", text: "Could not load the building list. Open the site through a local server (for example VS Code Live Server)." }));
  });

  // Every building gets the same tile and links to its page; buildings that
  // are not mapped yet show a plain "coming soon" page there.
  function tile(b) {
    const pic = S.photo({ src: b.image, alt: "", focus: b.focus, label: b.short, className: "tile__photo" });
    const caption = h("div", { class: "tile__caption" }, [h("h3", { class: "tile__name", text: b.name })]);
    return h("li", {}, [h("a", { class: "tile", href: "building.html?building=" + encodeURIComponent(b.id) }, [pic, caption])]);
  }
})();
