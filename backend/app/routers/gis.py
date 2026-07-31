from fastapi import APIRouter
from fastapi.responses import JSONResponse
import json
from pathlib import Path

router = APIRouter(prefix="/api", tags=["gis"])

# Precomputed by scripts/build_segments.py — see that script for how this
# is generated. Read fresh on every request (not cached at import time) so
# re-running the build script and dropping in a new file doesn't require
# restarting the API.
SEGMENTS_FILE = Path(__file__).resolve().parent.parent / "data" / "charge_segments.geojson"


@router.get("/gis/segments")
def get_charge_segments():
    if not SEGMENTS_FILE.exists():
        return JSONResponse(
            {"error": "charge_segments.geojson not found — run scripts/build_segments.py "
                      "and copy the output into app/data/ first."},
            status_code=404,
        )
    with open(SEGMENTS_FILE) as f:
        data = json.load(f)
    return JSONResponse(data)
