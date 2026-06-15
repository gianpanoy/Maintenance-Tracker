from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def home():
    return {"message": "API is running!"}docker --version
docker compose version