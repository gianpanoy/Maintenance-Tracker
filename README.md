# Maintenance Tracker

A full-stack web application for visualizing employee productivity data from AS400 fixed-width `.txt` exports. Upload a labor report and instantly see interactive D3 charts breaking down hours, leave, and mile marker coverage by employee and crew.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│                                                         │
│   ┌─────────────┐         ┌───────────────────────────┐ │
│   │ Upload Page │         │     Dashboard Page        │ │
│   │             │         │                           │ │
│   │ UploadWidget│         │  D3 Doughnut (hours)      │ │
│   │  .tsx       │         │  D3 Doughnut (leave)      │ │
│   └──────┬──────┘         │  D3 Stacked Bar           │ │
│          │                │  Employee Table           │ │
│          │                └────────────┬──────────────┘ │
└──────────┼─────────────────────────────┼────────────────┘
           │ POST /api/upload            │ GET /api/session/{id}
           │ (multipart .txt)            │ (JSON rows)
           ▼                             ▼
┌─────────────────────────────────────────────────────────┐
│                   FastAPI Backend                       │
│                  localhost:8000                         │
│                                                         │
│   ┌──────────────────────────────────────────────────┐  │
│   │              entries.py (router)                 │  │
│   │                                                  │  │
│   │  POST /api/upload                                │  │
│   │    └── pd.read_fwf() parses AS400 fixed-width    │  │
│   │    └── stores slim rows in sessions{} (memory)   │  │
│   │    └── returns { session_id: uuid }              │  │
│   │                                                  │  │
│   │  GET /api/session/{session_id}                   │  │
│   │    └── returns { raw: [...rows] }                │  │
│   └──────────────────────────────────────────────────┘  │
│                                                         │
│   ┌──────────────────────────────────────────────────┐  │
│   │           PostgreSQL (Docker)                    │  │
│   │           localhost:5433                         │  │
│   │   WorkEntry table (not yet wired to upload)      │  │
│   └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Charts | D3.js |
| HTTP Client | Axios |
| Backend | FastAPI, Uvicorn |
| Parser | Pandas (`pd.read_fwf`) |
| Database | PostgreSQL (Docker), SQLModel, Alembic |

---

## Project Structure

```
Maintenance Tracker/
├── frontend/
│   ├── app/
│   │   ├── layout.tsx          # Navbar + root layout
│   │   ├── page.tsx            # Home page — renders UploadWidget
│   │   ├── upload/
│   │   │   └── page.tsx        # Upload page
│   │   └── dashboard/
│   │       └── page.tsx        # D3 dashboard
│   ├── components/
│   │   └── UploadWidget.tsx    # File selector + upload logic
│   ├── package.json
│   └── tsconfig.json
│
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI app entry point + CORS
│   │   ├── database.py         # SQLAlchemy engine
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   └── work_entry.py   # WorkEntry SQLModel table
│   │   └── routers/
│   │       ├── __init__.py
│   │       └── entries.py      # Upload + session endpoints
│   ├── .env                    # DATABASE_URL (not committed)
│   ├── requirements.txt
│   └── venv/                   # Python virtual env (not committed)
│
├── docker-compose.yml
└── README.md
```

---

## Setup

### Prerequisites

- Node.js v20+
- Python 3.11+
- Docker Desktop

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd "Maintenance Tracker"
```

### 2. Frontend

```bash
cd frontend
npm install
```

### 3. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn sqlmodel sqlalchemy psycopg2-binary alembic python-dotenv pandas python-multipart
```

### 4. Environment variables

Create `backend/.env`:

```env
DATABASE_URL=postgresql://admin:password@localhost:5433/maintenance_tracker
```

### 5. Database

```bash
docker start maintenancetracker-postgres-1
```

If the container doesn't exist yet:

```bash
docker compose up -d
```

---

## Running the App

Open three terminals:

**Terminal 1 — PostgreSQL**
```bash
docker start maintenancetracker-postgres-1
```

**Terminal 2 — Backend**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
```
API running at http://localhost:8000  
Swagger docs at http://localhost:8000/docs

**Terminal 3 — Frontend**
```bash
cd frontend
npm run dev
```
App running at http://localhost:3000

---

## Usage

1. Go to `http://localhost:3000`
2. Select **Employee** report type
3. Click the drop zone and select your AS400 `.txt` file
4. Click **Upload & View Dashboard**
5. The dashboard loads with:
   - Hours breakdown doughnut chart
   - Leave type breakdown doughnut chart
   - Stacked bar chart per employee
   - Employee summary table with checkboxes to filter charts

---

## Data Format

The app expects AS400 fixed-width `.txt` files (e.g. `SOLABOR.TXT`) with the following column layout:

| Column | Position | Description |
|---|---|---|
| Date | 0–8 | YYYYMMDD |
| Crew Code | 8–11 | |
| Crew Description | 12–42 | |
| Employee ID | 42–50 | |
| Employee Name | 50–80 | |
| Hours Regular | 82–86 | |
| Hours Overtime | 87–92 | |
| Leave Code | 92–94 | |
| Leave Description | 94–114 | |
| Leave Hours | 115–120 | |
| Charge Code | 120–125 | |
| Charge Description | 127–177 | |
| Function Code | 177–181 | |
| Function Description | 183–223 | |
| Work Order Code | 223–226 | |
| Work Order Description | 228–278 | |
| Position Code | 278–284 | |
| Position Description | 284–314 | |
| Mile Marker From | 315–321 | |
| Mile Marker To | 322–328 | |

---

## Known Limitations

- Sessions are stored in memory — restarting the backend clears all sessions. Re-upload your file to restore the dashboard.
- PostgreSQL is set up but not yet connected to the upload flow (no DB writes yet).
- Equipment upload is stubbed in the UI as "Coming Soon".

---

## Roadmap

- [ ] Persist sessions to PostgreSQL
- [ ] Add tooltips to D3 charts on hover
- [ ] Add OT hours to stacked bar chart
- [ ] Mile marker productivity chart per employee
- [ ] Equipment upload parser and endpoint
- [ ] Date range labels on dashboard
