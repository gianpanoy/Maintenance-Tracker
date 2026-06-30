from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse
import pandas as pd
import io
import uuid
from typing import Optional

router = APIRouter(prefix="/api", tags=["entries"])

# In-memory session store
sessions: dict = {}

COLSPECS = [
    (0, 8), (8, 11), (12, 42), (42, 50), (50, 80),
    (82, 86), (87, 92), (92, 94), (94, 114), (115, 120),
    (120, 125), (127, 177), (177, 181), (183, 223),
    (223, 226), (228, 278), (278, 284), (284, 314),
    (315, 321), (322, 328),
]

NAMES = [
    "Date", "Crew Code", "Crew Description", "Employee ID", "Employee Name",
    "Hours, Regular", "Hours, Overtime", "Leave Code", "Leave Description",
    "Leave Hours", "Charge Code", "Charge Description", "Function Code",
    "Function Description", "Work Order Code", "Work Order Description",
    "Position Code", "Position Description", "Mile Marker, From", "Mile Marker, To",
]

@router.post("/upload")
async def upload_file(file: UploadFile = File(...), type: Optional[str] = Form(None)):
    contents = await file.read()

    df = pd.read_fwf(
        io.BytesIO(contents),
        colspecs=COLSPECS,
        names=NAMES,
        dtype=str,
    )

    df = df.dropna(how="all")
    df["Hours, Regular"] = pd.to_numeric(df["Hours, Regular"], errors="coerce").fillna(0)
    df["Hours, Overtime"] = pd.to_numeric(df["Hours, Overtime"], errors="coerce").fillna(0)
    df["Leave Hours"] = pd.to_numeric(df["Leave Hours"], errors="coerce").fillna(0)
    df["Mile Marker, From"] = pd.to_numeric(df["Mile Marker, From"], errors="coerce")
    df["Mile Marker, To"] = pd.to_numeric(df["Mile Marker, To"], errors="coerce")

    slim = df[[
        "Date", "Crew Code", "Employee ID", "Employee Name",
        "Hours, Regular", "Hours, Overtime",
        "Leave Description", "Leave Hours",
        "Mile Marker, From", "Mile Marker, To",
    ]].copy()

    session_id = str(uuid.uuid4())
    sessions[session_id] = slim.fillna("").to_dict(orient="records")

    return JSONResponse({"session_id": session_id})


@router.get("/session/{session_id}")
def get_session(session_id: str):
    data = sessions.get(session_id)
    if not data:
        return JSONResponse({"error": "Session not found"}, status_code=404)
    return JSONResponse({"raw": data})
