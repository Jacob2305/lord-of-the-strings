# BeaverSpot

## Run it locally

The pages load their data with `fetch()`, which browsers block if you just
double-click an HTML file. Use a local server instead:

- **VS Code:** install the "Live Server" extension, right-click `index.html`, choose "Open with Live Server".
- **Or terminal:** run `python -m http.server 8000` in this folder, then open http://localhost:8000

## Pages

Home → building → floor:

| Page | What it is |
|---|---|
| `index.html` | Home: campus photo and building tiles |
| `building.html?building=nac` | One building: its floors and a "browse by type" placeholder |
| `floor.html?building=nac&floor=6` | Zoomable floor plan. Add `&room=6313` to open with that room selected |

Only NAC floor 6 is mapped. The other buildings show as "Coming soon".

## Folder layout

| Path | What it is |
|---|---|
| `data/buildings.json` | Buildings, their photos (path, focal point, alt text) and which floors are live. The home and building pages are drawn from this. |
| `data/floor-6.json` | Every room on NAC floor 6 (shapes and labels). Made by the scripts in `tools/`. |
| `data/amenities-6.json` | The amenity database for NAC floor 6: seats, outlets, microwave, Wi-Fi, noise, natural light and hours for each room, entered by hand. Kept separate from `floor-6.json` so regenerating the plan doesn't wipe it. See "Adding amenities" below. |
| `css/site.css`, `js/site.js` | Shared colors, fonts, header, breadcrumb, footer and the photo placeholder |
| `css/home.css`, `js/home.js` | Home page |
| `css/building.css`, `js/building.js` | Building page |
| `css/floor.css`, `js/floor.js` | Floor plan page |
| `images/source/` | The building photos and the floor-sign photos the plan was traced from |
| `tools/` | Scripts that turn the sign photos into `data/floor-6.json`, plus page tests (see `tools/README.md`) |

## Changing a photo

Replace the file in `images/source/`, or point `image` in `data/buildings.json`
at a new one. If a file is missing, the page shows a placeholder naming the path
it expected, so nothing looks broken.

## Adding amenities

Open `data/amenities-6.json` and add an entry under `"rooms"`, keyed by the room
number as it appears on the plan. Copy the shape of `_example`; the `_readme`
list in the file explains each field and its allowed values. Every field is
optional: anything you leave out shows as "Not checked", and rooms with no
entry show "No amenity info for this room yet."

```json
"rooms": {
  "6313": { "capacity": 30, "outlets": "some", "microwave": false, "wifi": "good",
            "noise": "quiet", "naturalLight": true, "hours": "Mon–Fri 8am–10pm",
            "checked": "2026-10-17" }
}
```

A misspelled value (say `"noise": "lowd"`) still shows on the page as typed, and
the browser console logs a warning naming the room, so typos are easy to spot.
The **Filter by amenity** buttons on the floor page (Quiet, Outlets, Good Wi-Fi,
Natural light, Microwave, 6+ seats) use this file: rooms matching every chosen
filter are highlighted on the map and listed in the sidebar. A room only matches
if its entry has the field the filter checks, so unfilled rooms never show up.
The filter rules are `FILTERS` in `js/floor.js`.

**Update amenities** (in a room's details panel) lets anyone change that room's
amenities on the page: sliders for outlets, Wi-Fi and noise, Yes/No for microwave
and natural light, and boxes for seats and hours. Changes show at once in the
amenity boxes and the filters, but this is front end only: nothing is saved, and
reloading the page brings back what's in `amenities-6.json`. "Reset room" undoes
a room's changes. Saving edits is planned for the final.

For another floor, add an `amenities-<floor>.json` and point that floor's
`"amenities"` entry in `data/buildings.json` at it.
