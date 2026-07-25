# Contador de Ganado

Web app to count cattle in photos. Upload one or more images, and each is sent to a
[Roboflow](https://roboflow.com) object-detection model to automatically mark the
cows it finds with numbered circles. You can then click a circle to remove a wrong
detection, or click an empty spot to add a missed one. Multiple photos can be loaded
at once — switch between them with the thumbnail strip or the arrows on the viewer,
and each photo keeps its own counts and markers in memory. A badge shows how many
photos still haven't been sent to Roboflow.

## Stack

- **Backend:** Python (FastAPI) — proxies detection requests to the Roboflow API.
- **Frontend:** React + TypeScript (Vite) — canvas-based image viewer with zoom/pan
  and the marker editor.

## Requirements

- Python 3.10+
- Node.js 20+ and npm
- A free [Roboflow](https://roboflow.com) account with a private API key and a
  trained cattle/cow-detection model (search [Roboflow Universe](https://universe.roboflow.com)
  for one, e.g. "cattle" or "cow detection").

## Running locally

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows (use `source .venv/bin/activate` on macOS/Linux)
pip install -r requirements.txt
cp .env.example .env        # then edit .env with your ROBOFLOW_API_KEY and ROBOFLOW_MODEL
uvicorn app.main:app --port 8000 --reload
```

The API runs at `http://127.0.0.1:8000`. Check `http://127.0.0.1:8000/api/health`
to confirm it's configured correctly.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. In dev mode Vite proxies `/api/*` requests to the
backend on port 8000 (see `vite.config.ts`).

## Configuration (`backend/.env`)

| Variable | Description |
|---|---|
| `ROBOFLOW_API_KEY` | Your private Roboflow API key |
| `ROBOFLOW_MODEL` | Model id in `workspace/model-name/version` format |
| `CONFIDENCE` | Minimum confidence to keep a detection (0–1) |
| `OVERLAP` | Max bounding-box overlap allowed before merging detections (0–1) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins allowed to call the API |
| `MAX_UPLOAD_MB` | Max accepted image size in MB |

**Never commit `backend/.env`** — it holds your real API key. Only `.env.example`
(with placeholder values) should go into the repo; both `.gitignore` files already
exclude `.env`, `node_modules`, and `.venv`.

## Status

Image upload + detection + manual correction is working end-to-end locally. Video
support and production deployment (e.g. Docker, systemd) haven't been set up yet.
