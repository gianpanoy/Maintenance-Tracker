from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
import pandas as pd
import io

router = APIRouter(prefix="/api", tags=["entries"])

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
async def upload_file(file: UploadFile = File(...)):
    contents = await file.read()
    
    df = pd.read_fwf(
        io.BytesIO(contents),
        colspecs=COLSPECS,
        names=NAMES,
        dtype=str,
    )

    # Clean up
    df = df.dropna(how="all")
    df["Hours, Regular"] = pd.to_numeric(df["Hours, Regular"], errors="coerce").fillna(0)
    df["Hours, Overtime"] = pd.to_numeric(df["Hours, Overtime"], errors="coerce").fillna(0)
    df["Leave Hours"] = pd.to_numeric(df["Leave Hours"], errors="coerce").fillna(0)
    df["Mile Marker, From"] = pd.to_numeric(df["Mile Marker, From"], errors="coerce")
    df["Mile Marker, To"] = pd.to_numeric(df["Mile Marker, To"], errors="coerce")

    # Aggregations for charts
    hours_by_employee = (
        df.groupby("Employee Name")[["Hours, Regular", "Hours, Overtime"]]
        .sum().reset_index()
        .rename(columns={"Hours, Regular": "regular", "Hours, Overtime": "ot"})
        .to_dict(orient="records")
    )

    leave_breakdown = (
        df[df["Leave Code"].notna()]
        .groupby("Leave Description")["Leave Hours"]
        .sum().reset_index()
        .rename(columns={"Leave Description": "type", "Leave Hours": "hours"})
        .to_dict(orient="records")
    )

    miles_by_employee = (
        df.assign(miles=df["Mile Marker, To"] - df["Mile Marker, From"])
        .groupby("Employee Name")["miles"]
        .sum().reset_index()
        .rename(columns={"miles": "total_miles"})
        .dropna()
        .to_dict(orient="records")
    )

    return JSONResponse({
        "hours_by_employee": hours_by_employee,
        "leave_breakdown": leave_breakdown,
        "miles_by_employee": miles_by_employee,
        "raw": df.fillna("").to_dict(orient="records"),
    })