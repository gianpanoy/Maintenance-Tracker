from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse
import pandas as pd
import io
import uuid
from typing import Optional

router = APIRouter(prefix="/api", tags=["equipment"])

sessions: dict = {}

COLSPECS = [
    (0, 8),      # Date
    (8, 11),     # Crew Code
    (12, 42),    # Crew Description
    (42, 47),    # Fleet Code (98812)
    (49, 52),    # Unit Number (238, 239, etc.) ← unique vehicle ID
    (54, 56),    # Equipment Year
    (56, 96),    # Equipment Description
    (97, 100),   # Run Miles
    (101, 106),  # Run Hours
    (106, 131),  # Remarks (operator)
    (131, 136),  # Charge Code
    (138, 188),  # Charge Description
    (188, 192),  # Function Code
    (194, 234),  # Function Description
    (234, 237),  # Work Order Code
    (239, 279),  # Work Order Description
]

NAMES = [
    "Date",
    "Crew Code",
    "Crew Description",
    "Fleet Code",
    "Unit Number",
    "Equipment Year",
    "Equipment Description",
    "Run Miles",
    "Run Hours",
    "Remarks",
    "Charge Code",
    "Charge Description",
    "Function Code",
    "Function Description",
    "Work Order Code",
    "Work Order Description",
]

@router.post("/upload/equipment")
async def upload_equipment(file: UploadFile = File(...), type: Optional[str] = Form(None)):
    contents = await file.read()

    df = pd.read_fwf(
        io.BytesIO(contents),
        colspecs=COLSPECS,
        names=NAMES,
        dtype=str,
    )

    df = df.dropna(how="all")

    for col in df.columns:
        df[col] = df[col].str.strip()

    df["Date"] = pd.to_datetime(df["Date"], format="%Y%m%d", errors="coerce")
    df["Date"] = df["Date"].dt.strftime("%Y%m%d").fillna("")

    df["Run Miles"] = pd.to_numeric(df["Run Miles"], errors="coerce").fillna(0)
    df["Run Hours"] = pd.to_numeric(df["Run Hours"], errors="coerce").fillna(0)

    slim = df[[
        "Date", "Crew Code", "Fleet Code", "Unit Number",
        "Equipment Year", "Equipment Description",
        "Run Miles", "Run Hours", "Remarks",
        "Charge Code", "Charge Description",
        "Function Code", "Function Description",
        "Work Order Code", "Work Order Description",
    ]].copy()

    session_id = str(uuid.uuid4())
    sessions[session_id] = slim.fillna("").to_dict(orient="records")

    return JSONResponse({"session_id": session_id})


@router.get("/session/equipment/{session_id}")
def get_equipment_session(session_id: str):
    data = sessions.get(session_id)
    if not data:
        return JSONResponse({"error": "Session not found"}, status_code=404)
    return JSONResponse({"raw": data})
