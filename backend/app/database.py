from sqlalchemy import create_engine
from sqlmodel import Session
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("postgresql://admin:password@localhost:5433/maintenance_tracker")
engine = create_engine(DATABASE_URL)
