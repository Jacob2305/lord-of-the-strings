/* ==========================================================
   Building page (building.html?building=<id>)
   Banner, floor cards and a "browse by type" placeholder. All from data/buildings.json.
   ========================================================== */
(function () {
  "use strict";
  const S = window.BeaverSite;
  const h = S.h;
  const main = document.getElementById("main");
  const id = (S.params().get("building") || "").toLowerCase();

  // layout placeholder only: these are not wired up yet
  const TYPES = ["Study spaces", "Library", "Food", "Printers", "Restrooms"];

  S.loadSite().then((site) => {
    const b = S.findBuilding(site, id);
    if (!b || b.status !== "live") return notAvailable(b);
    render(b);
  }).catch(() => {
    document.body.classList.add("plain");
    done([h("div", { class: "plain-msg" }, [
      h("h1", { text: "Could not load this page" }),
      h("p", { text: "The building list did not load. Open the site through a local server (for example VS Code Live Server)." }),
      h("p", {}, [h("a", { href: "index.html", text: "Back to home" })]),
    ])]);
  });

  function done(children) {
    main.replaceChildren(...children);
    main.removeAttribute("aria-busy");
  }

  function render(b) {
    document.title = b.name + " (" + b.short + ") | BeaverSpot";
    S.setCrumbs([{ label: "Home", href: "index.html" }, { label: b.short }]);

    const floors = (b.floors || []).filter((f) => f.status === "live");

    const banner = h("section", { class: "banner", "aria-labelledby": "b-title" }, [
      S.photo({ src: b.image, alt: b.alt, focus: b.focus, label: b.short, eager: true, className: "banner__photo" }),
      h("div", { class: "banner__text wrap" }, [
        h("p", { class: "banner__short", text: b.short }),
        h("h1", { id: "b-title", text: b.name }),
      ]),
    ]);

    const floorList = h("ul", { class: "floors" }, floors.map((f) => {
      const meta = h("span", { class: "floor__meta", text: "Floor plan" });
      // count the rooms once the floor file is loaded
      S.loadRooms().then((rooms) => {
        const n = rooms.filter((r) => r.building.id === b.id && r.floor.floor === f.floor).length;
        if (n) meta.textContent = n + " rooms mapped";
      });
      return h("li", {}, [h("a", { class: "floor", href: f.page }, [
        h("span", { class: "floor__num", "aria-hidden": "true", text: f.floor }),
        h("span", { class: "floor__body" }, [
          h("span", { class: "floor__label", text: f.label }),
          meta,
        ]),
        h("span", { class: "floor__go", "aria-hidden": "true", html:
          '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' }),
      ])]);
    }));

    const floorsSection = h("section", { class: "block wrap", "aria-labelledby": "floors-title" }, [
      h("h2", { id: "floors-title", text: "Choose a floor" }),
      floors.length ? floorList : h("p", { class: "muted", text: "No floors are mapped yet." }),
      h("p", { class: "more-soon", text: "More floors coming soon." }),
    ]);

    const typesSection = h("section", { class: "block wrap", "aria-labelledby": "types-title" }, [
      h("div", { class: "block__head" }, [
        h("h2", { id: "types-title", text: "Browse by type" }),
        h("span", { class: "chip chip--soon", text: "Coming soon" }),
      ]),
      h("ul", { class: "types", "aria-describedby": "types-note" }, TYPES.map((t) =>
        h("li", {}, [h("button", { type: "button", class: "type-chip", disabled: "", text: t })]))),
      h("p", { id: "types-note", class: "muted", text: "Coming soon. Filtering by type is not available yet." }),
    ]);

    done([banner, floorsSection, typesSection]);
  }

  // Not mapped yet (or unknown id): just words on a white page.
  function notAvailable(b) {
    document.title = (b ? b.name + ": coming soon" : "Coming soon") + " | BeaverSpot";
    document.body.classList.add("plain");
    done([h("div", { class: "plain-msg" }, [
      h("h1", { text: b ? b.name + " is coming soon." : "Coming soon." }),
      h("p", {}, [h("a", { href: "index.html", text: "Back to home" })]),
    ])]);
  }
})();
