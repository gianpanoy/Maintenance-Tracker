from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import entries

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(entries.router)

@app.get("/")
def home():
    return {"message": "API is running!"}
