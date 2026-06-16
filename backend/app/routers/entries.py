from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from app.database import engine
from app.models import WorkEntry

router = APIRouter(prefix="/api", tags=["entries"])

def get_session():
    with Session(engine) as session:
        yield session

@router.get("/hours-by-employee")
def hours_by_employee(session: Session = Depends(get_session)):
    entries = session.exec(select(WorkEntry)).all()
    result = {}
    for e in entries:
        key = e.employee_name
        if key not in result:
            result[key] = {"employee": key, "regular": 0, "ot": 0}
        result[key]["regular"] += e.hours_regular or 0
        result[key]["ot"] += e.hours_ot or 0
    return list(result.values())
