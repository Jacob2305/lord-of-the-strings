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
