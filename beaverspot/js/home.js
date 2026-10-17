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

  function tile(b) {
    const live = b.status === "live";
    const pic = S.photo({ src: b.image, alt: "", focus: b.focus, label: b.short, className: "tile__photo" });
    const chip = h("span", { class: "chip " + (live ? "chip--open" : "chip--soon"), text: live ? "Open" : "Coming soon" });
    const floors = (b.floors || []).filter((f) => f.status === "live");
    const caption = h("div", { class: "tile__caption" }, [
      h("h3", { class: "tile__name", text: b.name }),
      h("p", { class: "tile__meta", text: live
        ? floors.length + (floors.length === 1 ? " floor mapped" : " floors mapped") : "Not mapped yet" }),
    ]);
    // the photo is decorative here (the caption names the building); its alt
    // text is used on the building page banner instead
    const body = [pic, chip, caption];
    let card;
    if (live) {
      card = h("a", { class: "tile tile--live", href: "building.html?building=" + encodeURIComponent(b.id),
        "aria-label": b.name + " (" + b.short + "), open. " + caption.querySelector(".tile__meta").textContent }, body);
    } else {
      card = h("div", { class: "tile tile--soon", "aria-disabled": "true",
        "aria-label": b.name + ", coming soon", role: "group" }, body);
    }
    return h("li", {}, [card]);
  }
})();
