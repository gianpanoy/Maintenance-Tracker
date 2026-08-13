# Maintenance Tracker

Internal full-stack dashboard for parsing AS400 fixed-width payroll/equipment
exports into interactive labor, equipment, calendar, and GIS map views for a
Hawaii DPW-style highway maintenance department (Kauai).

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the App](#running-the-app)
- [Features](#features)
- [The GIS Map Feature — Data Pipeline](#the-gis-map-feature--data-pipeline)
- [Known Limitations](#known-limitations)
- [Environment Gotchas](#environment-gotchas)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
Browser
  │
  ▼
Next.js Frontend (App Router, React 19)
  │  axios, client-side filtering/aggregation
  ▼
FastAPI Backend
  │  Pandas (fixed-width parsing) + GeoPandas/Shapely (GIS)
  ▼
In-memory session store (no database currently — see below)
```

**No database is currently in use.** Uploaded files are parsed once, held in
an in-memory `dict` keyed by a generated `session_id`, and returned to the
frontend for all subsequent filtering/aggregation. This means **uploaded
data does not survive a backend restart** — re-upload after restarting
`uvicorn`. (The original project scaffold included PostgreSQL/SQLModel/
Alembic as available tooling — see `Project_Setup.md` — but the actual
implementation deviated to this simpler in-memory approach and hasn't used
those pieces.)

All heavy computation (filtering by date/crew/type, aggregating hours/miles,
building calendar day maps, joining road segments to usage stats) happens
**client-side** in the frontend, driven by whatever raw session data was
fetched once on page load. The backend's job is parsing raw AS400 exports
and — for the map feature — road geometry lookup.

---

## Tech Stack

**Frontend**
- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS
- D3.js (bar/donut charts on the dashboards)
- Leaflet (**not** `react-leaflet`) for the map features — see
  [Environment Gotchas](#environment-gotchas) for why
- Axios

**Backend**
- FastAPI + Uvicorn
- Pandas (`read_fwf` for AS400 fixed-width parsing)
- GeoPandas, Shapely, pyproj (GIS geometry slicing for the map feature)

**Data sources**
- Two AS400 fixed-width `.txt` exports: `SOLABOR.TXT` (employee labor) and
  `SOEQUSE.TXT` (equipment usage)
- Hawaii Statewide GIS Program (`geodata.hawaii.gov`) for road geometry —
  HPMS Roads (layer 12), Kauai street centerlines (layer 4), and Mile
  Markers (layer 14)
- A hand-built CSV crosswalk mapping the department's internal charge codes
  to state route numbers / mile-marker ranges (there is no route number
  anywhere in the AS400 data itself)

---

## Project Structure

```
Maintenance-Tracker/
├── backend/
│   ├── venv/
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py                    # FastAPI app, CORS, router registration
│   │   ├── routers/
│   │   │   ├── entries.py             # Labor (SOLABOR.TXT) upload/session
│   │   │   ├── equipment.py           # Equipment (SOEQUSE.TXT) upload/session
│   │   │   ├── gis.py                 # GET /api/gis/segments (pre-baked equipment map)
│   │   │   └── labor_gis.py           # POST /api/gis/labor-segments (on-demand labor map)
│   │   ├── services/
│   │   │   └── road_geometry.py       # Shared GIS slicing logic (HPMS + calibration fallback)
│   │   └── data/                      # Files the RUNNING APP reads at request time
│   │       ├── charge_segments.geojson
│   │       ├── charge_code_route_map.csv
│   │       ├── kauai_hpms_roads.geojson
│   │       ├── kauai_streets.geojson
│   │       └── mile_markers.geojson
│   └── scripts/
│       ├── build_segments.py          # Offline: builds charge_segments.geojson
│       ├── road_sections.csv          # Charge codes rolled up into 22 physical sections
│       └── data/                      # Raw GIS downloads, used only by the offline script
│           ├── kauai_hpms_roads.geojson
│           ├── kauai_streets.geojson
│           └── mile_markers.geojson
│
├── frontend/
│   ├── app/
│   │   ├── upload/page.tsx            # File upload flow
│   │   ├── equipment/page.tsx         # Equipment Dashboard (Charts / Calendar / Map tabs)
│   │   ├── map/page.tsx               # Thin ssr:false wrapper — see gotcha below
│   │   └── (employee dashboard route)/page.tsx
│   ├── components/
│   │   ├── EquipRow.ts                # Shared equipment row type
│   │   ├── EquipmentBarCharts.tsx
│   │   ├── EquipmentTable.tsx
│   │   ├── EquipmentCalendar.tsx      # Month-grid calendar + month-scoped metrics
│   │   ├── EquipmentEntriesTable.tsx  # Raw-entry browser, grouped by equipment
│   │   ├── EquipmentMap.tsx           # Equipment-only Leaflet map (charge-code sections)
│   │   ├── MapClient.tsx              # Combined labor + equipment map (actual logic)
│   │   ├── EmployeeDetail.tsx
│   │   ├── HoursDonutCharts.tsx
│   │   ├── HoursBarChart.tsx
│   │   └── EmployeeTable.tsx
│   └── next.config.ts                 # transpilePackages: ["leaflet"]
│
└── README.md
```

---

## Prerequisites

- **Python 3.12** via `pyenv` (recommended over system/Homebrew Python — see
  [Environment Gotchas](#environment-gotchas))
- **Node.js** (whatever version your `create-next-app` scaffold pinned —
  check `frontend/package.json`)
- **Homebrew** (macOS) — occasionally needed for GDAL if `geopandas`
  doesn't find a prebuilt wheel

---

## Installation

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # confirm (venv) appears in your prompt
pip install fastapi uvicorn pandas geopandas shapely pyproj python-multipart
pip freeze > requirements.txt
```

If `geopandas` fails to build on macOS (rare, but happens on some Apple
Silicon setups):
```bash
brew install gdal
pip install geopandas shapely pyproj
```

### Frontend

```bash
cd frontend
npm install
npm install leaflet
npm install --save-dev @types/leaflet @types/geojson
```

### GIS data files

The map feature needs five files that aren't checked into the repo (raw
government GIS downloads + a hand-built crosswalk). See
[The GIS Map Feature](#the-gis-map-feature--data-pipeline) below for exact
download URLs and where each file goes — **two copies of the three raw GIS
files are needed**, one in `backend/scripts/data/` (offline script) and one
in `backend/app/data/` (live app).

---

## Running the App

Two separate processes, two separate terminals:

```bash
# Terminal 1 — backend
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
# → http://localhost:8000

# Terminal 2 — frontend
cd frontend
npm run dev
# → http://localhost:3000
```

Start at `http://localhost:3000/upload` to load a labor and/or equipment
export before visiting the dashboards.

---

## Features

### Employee Dashboard
Donut and bar charts (D3) of regular/OT/leave hours by employee, a
sortable/filterable table, and a slide-in detail drawer per employee with
metric cards and a raw-entries table. Filters: date range, crew, plus
quick-range buttons (3/6/9/12mo, YTD).

### Equipment Dashboard
Three tabs:
- **Charts** — bar charts + a selectable equipment table
- **Calendar** — true month-grid calendar (not a day-strip). Each day cell
  lists equipment (code first, then description) active that day with
  type-colored dots; clicking a day opens a detail drawer with per-unit
  miles/hours/operator/charge code/function. A row of month-scoped metric
  cards (vehicles active, miles, hours, active days) sits above the grid,
  distinct from the page-level filtered totals since the top filter can
  span more than one month. Applying the top-level date filter jumps the
  calendar to that month automatically.
- **Map** — equipment usage highlighted on real Kauai road geometry,
  colored/weighted by hours logged, click a segment for a detail drawer.

Filters: date range, crew, equipment type. An "Equipment Entries Table"
component (grouped-by-equipment, collapsible, searchable) is also available
for raw-entry verification against source data.

### Combined Map (`/map`)
Merges equipment (charge-code-level, pre-baked sections) and labor
(per-entry mile-marker precision — points *and* ranges) on one map, with a
persistent (non-overlay) side panel and independent layer toggles. Labor is
visible by default. Filters carry over from whichever dashboard you
navigated from via `localStorage` (`shared_filter_start/end/crew`).

---

## The GIS Map Feature — Data Pipeline

This is the most involved part of the system, built in two tiers:

### Tier 1 — Equipment map (pre-baked, offline)

1. **`road_sections.csv`** — your department's 132 charge codes, rolled up
   into 22 unique physical road sections (many charge codes share an
   identical route/mile-marker range — likely a funding/crew distinction,
   not a spatial one).
2. **`backend/scripts/build_segments.py`** — reads that CSV plus three raw
   Hawaii GIS downloads, and for each section:
   - Tries to slice real geometry from **HPMS Roads** (`bmp`/`emp`
     mile-marker fields already built into the layer)
   - Falls back to **mile-marker-point calibration** (projecting the Mile
     Markers point layer onto the matching named street) when HPMS
     coverage is missing or partial
   - Picks the correct disconnected line fragment using proximity to real
     mile-marker points, not just "longest piece"
   - Outputs `charge_segments.geojson`
3. Copy that output into `backend/app/data/` — `gis.py` serves it verbatim
   at `GET /api/gis/segments`.

**Download URLs** (Kauai-filtered, GeoJSON, WGS84):
```
# HPMS Roads (layer 12)
https://geodata.hawaii.gov/arcgis/rest/services/Transportation/MapServer/12/query?where=island%3D%27Kauai%27&outFields=*&returnGeometry=true&outSR=4326&f=geojson

# Kauai street centerlines (layer 4) — filtered to the specific roads this project needs
https://geodata.hawaii.gov/arcgis/rest/services/Transportation/MapServer/4/query?where=UPPER(fullname)+LIKE+%27%25KAPAA+BYP%25%27+OR+UPPER(fullname)+LIKE+%27%25KAUMUALII+HWY%25%27+OR+UPPER(fullname)+LIKE+%27%25AHUKINI+RD%25%27+OR+UPPER(fullname)+LIKE+%27%25MAALO+RD%25%27&outFields=*&returnGeometry=true&outSR=4326&f=geojson

# Mile Markers (layer 14)
https://geodata.hawaii.gov/arcgis/rest/services/Transportation/MapServer/14/query?where=island%3D%27Kauai%27&outFields=*&returnGeometry=true&outSR=4326&f=geojson
```
Sanity-check any download with `head -c 200 <file>` before trusting it —
should show `"geometry":{"type":...` near the start, not an
attributes-only response.

### Tier 2 — Labor map (on-demand, live)

`backend/app/services/road_geometry.py` extracts the same core slicing
logic into a reusable module (kept as a **separate copy** from
`build_segments.py` rather than a shared import, deliberately, to avoid
touching an already-proven offline pipeline). `labor_gis.py`
(`POST /api/gis/labor-segments`) uses it to slice geometry **per labor
entry** at request time, since individual entries can have far more unique
mile-marker ranges than the 22 fixed sections — including single-point
entries (`mile_marker_from == mile_marker_to`), rendered as circle markers
rather than lines.

This tier additionally needs `charge_code_route_map.csv` in
`backend/app/data/` — the **ungrouped**, one-row-per-charge-code crosswalk
(not `road_sections.csv`, which loses per-code granularity).

---

## Known Limitations

- **Route 50 west of Kekaha has no map data.** HPMS, the official DOT
  mile-marker survey, and the street centerline data all independently
  stop right around mp 32 — the physical road continues toward
  Waimea/Polihale, but no Hawaii-published GIS source covers it. Rather
  than fabricate a boundary, these charge codes (sections S01–S05) are
  intentionally left off the map. If a future data source (survey data,
  GPS-tracked equipment, county records) becomes available, this is a
  contained gap to fill in, not a bug to fix.
- **No database.** All session data is in-memory and lost on backend
  restart.
- **Charge codes bundle multiple funding/crew distinctions onto one
  physical section** on the equipment map — a highlighted section means
  "some associated charge code had activity," not GPS-level precision. The
  labor map (mile-marker-per-entry) is more precise where that data exists.

---

## Environment Gotchas

Real issues hit during this build, worth knowing about upfront:

- **`react-leaflet` was abandoned for plain Leaflet.** Under this
  project's React 19 / Next.js 15 / webpack stack, `react-leaflet`'s React
  wrapper produced persistent, hard-to-diagnose bundler errors
  ("Element type is invalid," "received a promise that resolves to
  object"). All map components now use vanilla `leaflet` driven
  imperatively via `useEffect` + a plain `<div ref={...}>`.
- **Any component importing `leaflet` must be loaded via
  `next/dynamic(() => import(...), { ssr: false })`.** Leaflet's own
  source touches `window` at module-evaluation time (not just when
  called), which crashes Next.js's server-side render with
  `ReferenceError: window is not defined` even if you only ever *call*
  Leaflet functions inside `useEffect`. `EquipmentMap.tsx` and the
  combined map's `MapClient.tsx` both need this — `app/map/page.tsx` is
  deliberately a thin wrapper for exactly this reason.
- **macOS shell aliases can silently override `python`, even inside an
  activated venv.** If `pip install`-ed packages seem to vanish, check
  `which python` / `python -c "import sys; print(sys.executable)"` — a
  shell alias (`.zshrc`/`.zprofile`) takes precedence over `venv`
  activation.
- **iCloud Drive's "Desktop & Documents" sync** is a suspected (not fully
  confirmed) cause of edits not reliably landing in files during this
  build — if file edits seem to not "stick" no matter how they're applied,
  check `ls -la ~/Documents` for a symlink into `Mobile Documents`, and
  consider developing outside any cloud-synced folder.
- **HDOT's own metadata warns**: "Mileage displayed on the mile marker
  sign may not match the route mileage" — the calibration fallback is
  inherently a little less precise than HPMS's official linear
  referencing, used only where HPMS coverage is missing.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `ModuleNotFoundError: No module named 'geopandas'` | venv not activated — check for `(venv)` in your prompt |
| `window is not defined` crash on a map page | A component importing `leaflet` isn't wrapped in `next/dynamic(..., { ssr: false })` |
| 404 on a route you just added to `main.py` | Router imported but not actually re-registered, or `uvicorn` running a stale process — check for duplicate PIDs on port 8000 with `lsof -i :8000` |
| Map loads but shows no color/highlighting | Check the browser console — both map components log fetch results and match/skip counts; also confirm the charge codes in your session actually exist in `charge_code_route_map.csv` |
| "Couldn't load road segment data" | `charge_segments.geojson` missing or empty in `backend/app/data/` — verify with `wc -c` |
| Edits "don't take" no matter how they're applied | See the iCloud sync gotcha above; also verify with `wc -l`/`grep` that a file actually changed before assuming a fix didn't work |
