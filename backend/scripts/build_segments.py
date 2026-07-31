"""
build_segments.py

One-time (re-run-when-CSV-changes) geoprocessing script.

Turns road_sections.csv (route + mile-marker ranges, one row per physical
road section, charge codes rolled up) into a GeoJSON FeatureCollection of
actual road geometry, ready to serve to the frontend map.

DATA SOURCE
-----------
Uses Hawaii Statewide GIS's "Hawaii Performance Monitoring System (HPMS)
Roads" layer (Transportation/MapServer, layer 12):
    https://geodata.hawaii.gov/arcgis/rest/services/Transportation/MapServer/12
This layer is already linear-referenced by HDOT — each road feature
carries route_id/route_name plus bmp (begin milepost) and emp (end
milepost). That means the road is already pre-cut into small
mile-marker-bounded pieces; we just select the pieces whose [bmp, emp]
overlaps a section's target range and stitch them together, only
interpolating *within* a single short segment for the two end-cuts.
(An earlier version of this plan tried to calibrate mile markers against
a single continuous route line using the separate Mile Markers point
layer — that layer still exists and is kept as an optional cross-check,
but the HPMS bmp/emp fields make that unnecessary as the primary method.)

DATA YOU NEED TO DOWNLOAD FIRST (not fetched by this script):
  1. HPMS Roads, filtered to Kauai, as GeoJSON. Confirmed working query:
     https://geodata.hawaii.gov/arcgis/rest/services/Transportation/MapServer/12/query?where=island%3D%27Kauai%27&outFields=*&returnGeometry=true&outSR=4326&f=geojson
     Save the response as: data/kauai_hpms_roads.geojson
  2. (Fallback, for route 5600 / any route not in HPMS — HPMS generally
     only covers federal-aid roads, and the bypass likely isn't one)
     Kauai Roads street centerlines (has `fullname`), for name-based
     lookup instead of route-number lookup.
     https://geodata.hawaii.gov/arcgis/rest/services/Transportation/MapServer/4/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson
     Save as: data/kauai_streets.geojson
  3. (Fallback, for sections where HPMS coverage is missing or partial —
     e.g. Route 50 past the Kekaha federal-aid boundary at mm ~32.9)
     Mile Markers (SDOT) point layer, filtered to Kauai. Used together
     with the streets file above: mile-marker points get projected onto
     the matching named street to calibrate mile-marker positions where
     HPMS has no bmp/emp data.
     https://geodata.hawaii.gov/arcgis/rest/services/Transportation/MapServer/14/query?where=island%3D%27Kauai%27&outFields=*&returnGeometry=true&outSR=4326&f=geojson
     Save as: data/mile_markers.geojson

USAGE
-----
    cd backend/scripts
    python build_segments.py

Reads:  road_sections.csv, data/kauai_hpms_roads.geojson  (both in scripts/)
Writes: charge_segments.geojson  (also in scripts/ — copy it into
        backend/app/data/ afterward; that's what the API endpoint reads)
"""

import json
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import mapping
from shapely.ops import linemerge, substring

# ---- config -----------------------------------------------------------

# All paths are relative to this script's own location (scripts/), not
# the current working directory — so `python build_segments.py` works
# the same whether you run it from scripts/ or anywhere else.
BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = BASE_DIR / "data"
HPMS_FILE = DATA_DIR / "kauai_hpms_roads.geojson"
STREETS_FILE = DATA_DIR / "kauai_streets.geojson"          # name-based fallback path
MILE_MARKERS_FILE = DATA_DIR / "mile_markers.geojson"       # calibration fallback path

SECTIONS_CSV = BASE_DIR / "road_sections.csv"
OUTPUT_FILE = BASE_DIR / "charge_segments.geojson"

# Attribute names in the HPMS layer — confirmed against a real sample
# pull from the service (route_id is a clean route-number string like
# "50"; route_name is the road name like "Kaumualii Highway" and is NOT
# used for matching). bmp/emp are already in decimal miles, matching
# the units in road_sections.csv directly — no conversion needed.
ROUTE_ATTR = "route_id"
BMP_ATTR = "bmp"
EMP_ATTR = "emp"

# Confirmed exact value for Kauai in the island field: "Kauai"
ISLAND_VALUE = "Kauai"

# Mile Markers (SDOT) layer — confirmed real field names: island, route
# (string, e.g. "50"), mp (double, the mile-marker value). Per HDOT's own
# metadata: "Mileage displayed on the mile marker sign may not match the
# route mileage" — this fallback is inherently a bit less precise than
# HPMS's official bmp/emp referencing, used only where HPMS has no/partial
# coverage.
MM_ROUTE_ATTR = "route"
MM_VALUE_ATTR = "mp"
MM_ISLAND_ATTR = "island"

# Street name to use for the calibration fallback, per route number that
# needs it (confirmed present in the Kauai street centerline layer).
ROUTE_STREET_NAMES = {
    50: "KAUMUALII HWY",
    570: "AHUKINI RD",
    583: "MAALO RD",
}

# Minimum fraction of a section's requested mile-marker span that HPMS
# must actually cover before we trust its result. Below this, fall back
# to mile-marker-point calibration instead of accepting a partial/sliver
# result (this is what caught the S01 truncation).
MIN_HPMS_COVERAGE = 0.95

# Routes known not to be in HPMS — handled by name match instead.
# Confirmed exact fullname in the Kauai Roads layer: "KAPAA BYP"
NAME_FALLBACK_ROUTES = {
    5600: "KAPAA BYP",
}

# Section groups to merge into a single combined map feature, used when
# individual sections can't be precisely sliced (e.g. beyond official DOT
# mile-marker data). The combined feature's geometry covers whatever real
# road data actually exists across the group's full mm range — if that's
# less than the full requested range, the result will be shorter than the
# CSV implies, which is the geometry honestly telling you where real data
# runs out rather than fabricating length that isn't backed by anything.
MERGE_SECTION_GROUPS = [
    ["S01", "S02", "S03", "S04", "S05"],  # Route 50 west of Kekaha — no official
                                            # DOT mile-marker data exists past mp ~32
]

WGS84 = "EPSG:4326"
METRIC_CRS = "EPSG:32604"  # UTM Zone 4N, for accurate distance math


# ---- core linear referencing (BMP/EMP clip-and-stitch) ------------------

def clip_hpms_segment(bmp, emp, line, mm_lo, mm_hi):
    """Clip a single HPMS segment's line to the overlap with [mm_lo, mm_hi],
    interpolating proportionally within just this segment's own bmp/emp span."""
    lo = max(mm_lo, bmp)
    hi = min(mm_hi, emp)
    if hi <= lo or emp == bmp:
        return None
    frac_lo = (lo - bmp) / (emp - bmp)
    frac_hi = (hi - bmp) / (emp - bmp)
    return substring(line, frac_lo, frac_hi, normalized=True)


def slice_route_range(route_segments, mm_start, mm_end):
    """route_segments: list of (bmp, emp, line) tuples for one route, in any order.
    Returns (merged_line_or_None, coverage_fraction) — coverage_fraction is how much
    of [mm_start, mm_end] was actually found in the provided segments (0.0-1.0),
    so the caller can detect a partial/sliver result rather than trusting it blindly."""
    lo, hi = min(mm_start, mm_end), max(mm_start, mm_end)
    requested_span = hi - lo
    if requested_span <= 0:
        return None, 0.0
    pieces = []
    covered_span = 0.0
    for bmp, emp, line in sorted(route_segments, key=lambda s: s[0]):
        overlap_lo = max(lo, bmp)
        overlap_hi = min(hi, emp)
        if overlap_hi <= overlap_lo:
            continue
        covered_span += overlap_hi - overlap_lo
        piece = clip_hpms_segment(bmp, emp, line, lo, hi)
        if piece is not None:
            pieces.append(piece)
    if not pieces:
        return None, 0.0
    merged = linemerge(pieces) if len(pieces) > 1 else pieces[0]
    return merged, covered_span / requested_span


# ---- calibration fallback (mile-marker points projected onto a street line) --

def build_mm_calibration(line, points_with_route_and_value, route_filter):
    """Project mile-marker points (filtered to one route) onto the line;
    return sorted (distance-along-line, mile-marker-value) pairs."""
    calib = []
    for pt, route, val in points_with_route_and_value:
        if str(route).strip() != str(route_filter).strip():
            continue
        dist = line.project(pt)
        calib.append((dist, float(val)))
    calib.sort(key=lambda t: t[0])
    return calib


def mm_to_distance(calib, mm_target):
    """Piecewise-linear interpolate/extrapolate a mile marker into distance-along-line."""
    import numpy as np
    dists = np.array([c[0] for c in calib])
    mms = np.array([c[1] for c in calib])
    if mm_target <= mms[0]:
        d0, d1, m0, m1 = dists[0], dists[1], mms[0], mms[1]
    elif mm_target >= mms[-1]:
        d0, d1, m0, m1 = dists[-2], dists[-1], mms[-2], mms[-1]
    else:
        return float(np.interp(mm_target, mms, dists))
    if m1 == m0:
        return float(d0)
    return float(d0 + (mm_target - m0) * (d1 - d0) / (m1 - m0))


def pick_piece_near_points(geoms, points, label="", buffer_m=200):
    """Merge line geometries into one LineString. If the pieces don't all
    connect end-to-end, linemerge() returns a MultiLineString — which
    substring()/project() can't be trusted on for calibration purposes.
    Rather than guessing by length (which can silently pick a totally
    unrelated fragment that happens to be long), use the actual
    mile-marker points to identify which fragment is really the target
    route: pick whichever piece has the most marker points within
    buffer_m of it. Falls back to longest-piece only if no points are
    given or none are near any piece."""
    merged = linemerge(geoms) if len(geoms) > 1 else geoms[0]
    if merged.geom_type != "MultiLineString":
        return merged
    parts = list(merged.geoms)
    if points:
        counts = [sum(1 for pt in points if part.distance(pt) <= buffer_m) for part in parts]
        best_idx = max(range(len(parts)), key=lambda i: (counts[i], parts[i].length))
        if counts[best_idx] > 0:
            print(f"  WARNING: {label} merge produced {len(parts)} disconnected piece(s) — "
                  f"picked the piece nearest {counts[best_idx]} mile-marker point(s) "
                  f"(length {parts[best_idx].length:.0f}m), discarding {len(parts) - 1} other piece(s).")
            return parts[best_idx]
    parts.sort(key=lambda g: g.length, reverse=True)
    print(f"  WARNING: {label} merge produced {len(parts)} disconnected piece(s) with NO mile-marker "
          f"points to disambiguate — using the longest piece ({parts[0].length:.0f}m) as a last-resort "
          f"guess. This may well be the wrong piece; verify visually.")
    return parts[0]


def slice_by_calibration(line, calib, mm_start, mm_end):
    """Cut a sub-line between two mile markers using point-based calibration
    (order-independent). Returns None if fewer than 2 calibration points exist."""
    if len(calib) < 2:
        return None
    lo, hi = min(mm_start, mm_end), max(mm_start, mm_end)
    d_lo = min(line.length, max(0.0, mm_to_distance(calib, lo)))
    d_hi = min(line.length, mm_to_distance(calib, hi))
    if d_hi <= d_lo:
        return None
    return substring(line, d_lo, d_hi)


# ---- main pipeline ------------------------------------------------------

def parse_route_id(value):
    """route_id is a clean numeric string (e.g. "50") — just parse it.
    Returns None for anything non-numeric so it's skipped rather than crashing."""
    try:
        return int(str(value).strip())
    except (ValueError, TypeError):
        return None


def combine_section_groups(sections, groups):
    """Replace each group of section_ids with one combined row: union of
    charge codes, min/max mm range, joined descriptions. Groups spanning
    more than one route are left un-merged (that would be a CSV error, not
    something to silently paper over)."""
    ids_to_drop = set()
    combined_rows = []
    for group in groups:
        subset = sections[sections["section_id"].isin(group)]
        if subset.empty:
            continue
        routes = subset["route"].unique()
        if len(routes) > 1:
            print(f"  WARNING: merge group {group} spans multiple routes {list(routes)} "
                  f"— skipping merge, processing these sections individually instead.")
            continue
        ids_to_drop.update(group)
        combined_rows.append({
            "section_id": "+".join(group),
            "route": routes[0],
            "mm_start": subset["mm_start"].min(),
            "mm_end": subset["mm_end"].max(),
            "description": " / ".join(subset["description"].astype(str).unique()),
            "charge_code": ";".join(subset["charge_code"].astype(str)),
        })
    result = sections[~sections["section_id"].isin(ids_to_drop)].copy()
    if combined_rows:
        result = pd.concat([result, pd.DataFrame(combined_rows)], ignore_index=True)
    return result


def main():
    if not SECTIONS_CSV.exists():
        sys.exit(f"Missing {SECTIONS_CSV} — run the CSV cleanup step first.")
    if not HPMS_FILE.exists():
        sys.exit(
            f"Missing {HPMS_FILE}. Download HPMS Roads (layer 12) filtered "
            f"to Kauai from geodata.hawaii.gov and save it there first."
        )

    sections = pd.read_csv(SECTIONS_CSV)
    sections = combine_section_groups(sections, MERGE_SECTION_GROUPS)
    hpms_gdf = gpd.read_file(HPMS_FILE).to_crs(METRIC_CRS)

    streets_gdf = None
    if STREETS_FILE.exists():
        streets_gdf = gpd.read_file(STREETS_FILE).to_crs(METRIC_CRS)

    markers_gdf = None
    if MILE_MARKERS_FILE.exists():
        markers_gdf = gpd.read_file(MILE_MARKERS_FILE).to_crs(METRIC_CRS)

    # Group HPMS rows into per-route lists of (bmp, emp, line)
    route_segments = {}
    for _, row in hpms_gdf.iterrows():
        route_num = parse_route_id(row[ROUTE_ATTR])
        if route_num is None:
            continue
        route_segments.setdefault(route_num, []).append(
            (float(row[BMP_ATTR]), float(row[EMP_ATTR]), row.geometry)
        )

    # Build calibration fallback lines/calibrations lazily, per route, only
    # if actually needed (avoids wasted work for routes HPMS covers fully)
    calibration_cache = {}  # route_num -> (line, calib) or None if unavailable

    def get_calibration(route_num):
        """Returns (line, calib) on success, or (None, reason_string) on failure —
        specific reason so failures don't require guessing which of several
        possible causes (missing file, no name match, etc.) applied."""
        if route_num in calibration_cache:
            return calibration_cache[route_num]

        street_name = ROUTE_STREET_NAMES.get(route_num)
        if not street_name:
            result = (None, f"no ROUTE_STREET_NAMES entry configured for route {route_num}")
        elif streets_gdf is None:
            result = (None, "kauai_streets.geojson not found/loaded")
        elif markers_gdf is None:
            result = (None, "mile_markers.geojson not found/loaded")
        else:
            matches = streets_gdf[streets_gdf["fullname"].str.upper().str.contains(street_name, na=False)]
            if matches.empty:
                result = (None, f"no street named '{street_name}' found in kauai_streets.geojson")
            else:
                marker_rows = markers_gdf[markers_gdf[MM_ISLAND_ATTR].astype(str) == ISLAND_VALUE]
                route_marker_rows = marker_rows[marker_rows[MM_ROUTE_ATTR].astype(str) == str(route_num)]
                if marker_rows.empty:
                    result = (None, f"no mile markers found with island == '{ISLAND_VALUE}' — "
                                     f"check MM_ISLAND_ATTR/ISLAND_VALUE against the real data")
                else:
                    route_points = list(route_marker_rows.geometry)
                    line = pick_piece_near_points(list(matches.geometry), route_points,
                                                   label=f"street match for route {route_num}")
                    mm_triples = [(geom, route, val) for geom, route, val in
                                  zip(marker_rows.geometry, marker_rows[MM_ROUTE_ATTR], marker_rows[MM_VALUE_ATTR])]
                    calib = build_mm_calibration(line, mm_triples, route_num)
                    if len(calib) < 2:
                        result = (None, f"only {len(calib)} mile marker(s) found for route {route_num} "
                                         f"(need >=2 to calibrate) — check MM_ROUTE_ATTR values match route_id format")
                    else:
                        result = (line, calib)

        calibration_cache[route_num] = result
        return result

    features = []
    skipped = []

    for route_num, group in sections.groupby("route"):
        route_num = int(route_num)

        if route_num in NAME_FALLBACK_ROUTES:
            if streets_gdf is None:
                skipped.append((route_num, "no streets fallback file provided"))
                continue
            name_query = NAME_FALLBACK_ROUTES[route_num]
            matches = streets_gdf[streets_gdf["fullname"].str.upper().str.contains(name_query, na=False)]
            if matches.empty:
                skipped.append((route_num, f"no street match for '{name_query}'"))
                continue
            line = pick_piece_near_points(list(matches.geometry), [],
                                           label=f"name-fallback street match for route {route_num}")
            for _, row in group.iterrows():
                features.append(build_feature(line, row))
            continue

        for _, row in group.iterrows():
            merged, coverage = (None, 0.0)
            if route_num in route_segments:
                merged, coverage = slice_route_range(route_segments[route_num], row["mm_start"], row["mm_end"])

            if merged is not None and coverage >= MIN_HPMS_COVERAGE:
                features.append(build_feature(merged, row))
                continue

            # HPMS missing or only partially covers this section — try calibration fallback
            line_calib, calib_or_reason = get_calibration(route_num)
            if line_calib is not None:
                sliced = slice_by_calibration(line_calib, calib_or_reason, row["mm_start"], row["mm_end"])
                if sliced is not None:
                    features.append(build_feature(sliced, row))
                    if merged is not None:
                        skipped.append((route_num, f"section {row['section_id']}: HPMS only covered "
                                                    f"{coverage:.0%} of the requested range — used mile-marker "
                                                    f"calibration fallback instead (verify this one visually)"))
                    continue
                calib_fail_reason = "calibration produced empty geometry for this section's mm range"
            else:
                calib_fail_reason = calib_or_reason

            if merged is not None:
                # Coverage was insufficient and no fallback was available — use
                # the partial HPMS result anyway rather than dropping it entirely,
                # but flag it loudly since it's likely truncated.
                features.append(build_feature(merged, row))
                skipped.append((route_num, f"section {row['section_id']}: HPMS only covered {coverage:.0%} "
                                            f"of the requested range, calibration fallback unavailable "
                                            f"({calib_fail_reason}) — geometry is likely truncated, needs manual review"))
                continue

            skipped.append((route_num, f"section {row['section_id']}: no HPMS coverage, calibration "
                                        f"fallback unavailable ({calib_fail_reason})"))

    if not features:
        sys.exit("No features produced — check ROUTE_ATTR/BMP_ATTR/EMP_ATTR against the real HPMS field names.")

    fc_gdf = gpd.GeoDataFrame.from_features(features, crs=METRIC_CRS).to_crs(WGS84)
    fc = {"type": "FeatureCollection", "features": features}
    for feat, geom in zip(fc["features"], fc_gdf.geometry):
        feat["geometry"] = mapping(geom)

    OUTPUT_FILE.write_text(json.dumps(fc))
    print(f"\nWrote {len(features)} segment(s) to {OUTPUT_FILE}")

    if skipped:
        print(f"\n{len(skipped)} section(s) skipped — needs manual attention:")
        for route_num, reason in skipped:
            print(f"  route {route_num}: {reason}")


def build_feature(geometry, section_row):
    return {
        "type": "Feature",
        "geometry": mapping(geometry),
        "properties": {
            "section_id": section_row["section_id"],
            "route": int(section_row["route"]),
            "mm_start": float(section_row["mm_start"]),
            "mm_end": float(section_row["mm_end"]),
            "description": section_row["description"],
            "charge_codes": str(section_row["charge_code"]).split(";"),
        },
    }


if __name__ == "__main__":
    main()
