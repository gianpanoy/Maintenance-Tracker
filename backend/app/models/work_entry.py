from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import date

class WorkEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    date: date
    crew_code: Optional[str] = None
    crew_description: Optional[str] = None
    employee_id: str
    employee_name: str
    hours_regular: Optional[float] = None
    hours_ot: Optional[float] = None
    leave_code: Optional[str] = None
    leave_description: Optional[str] = None
    leave_hours: Optional[float] = None
    charge_code: Optional[str] = None
    charge_description: Optional[str] = None
    function_code: Optional[str] = None
    function_description: Optional[str] = None
    position_code: Optional[str] = None
    position_description: Optional[str] = None
    mile_marker_from: Optional[float] = None
    mile_marker_to: Optional[float] = None
