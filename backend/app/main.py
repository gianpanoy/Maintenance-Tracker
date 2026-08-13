from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import entries
from app.routers import equipment
from app.routers import gis

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(entries.router)
app.include_router(equipment.router)
app.include_router(gis.router)

@app.get("/")
def home():
    return {"message": "API is running!"}
