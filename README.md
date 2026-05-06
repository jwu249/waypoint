# Waypoint

Waypoint is an AI-powered travel itinerary app. Paste unstructured trip notes, upload a file, or import from a travel blog URL and the app extracts your stops, geocodes them, and plots them on an interactive map. From there you can edit stops manually, use the AI copilot to make changes in natural language, optimize your route, or browse nearby recommendations.

Built with React + Vite (frontend), Flask (backend), Supabase (database + auth), Llama 4 Scout via Groq (AI), and Photon/OSM (geocoding).

**Live app**: https://waypoint-swart-seven.vercel.app/

---

## Dependencies

**Backend**
- Python 3.11+
- Flask, flask-cors, groq, python-dotenv, requests

**Frontend**
- Node 18+
- React, React Router, React-Leaflet, Vite

---

## Setup

### 1. Clone the repo

```bash
git clone <repo-url>
cd waypoint
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env`:

```
GROQ_API_KEY=gsk_...
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`GROQ_API_KEY` is required for all AI features. Supabase keys are required for auth and data persistence.

### 3. Backend (Flask API — port 5001)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 api/index.py
```

### 4. Frontend (Vite — port 5173)

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

Frontend `/api` requests are proxied to `http://localhost:5001`.

---

## Repository Submission Checklist

- Complete project code included:
  - `frontend/` (React + Vite app)
  - `api/` (Flask backend)
  - `supabase/` (schema + migration SQL)
- Clean structure:
  - `node_modules/`, `.venv/`, and build artifacts are gitignored.
  - Environment files with secrets (`.env`, `.env.local`) are gitignored.
- Reproducible setup:
  - Python dependencies are version-pinned in [`requirements.txt`](./requirements.txt).
  - Frontend dependency versions are locked via [`frontend/package-lock.json`](./frontend/package-lock.json).
  - Use the setup commands above to run backend (`:5001`) and frontend (`:5173`) locally.
- No secrets or model weights committed:
  - Keep real keys only in local `.env` or deployment environment variables.
  - Never commit `.env`.
  - No model weight files (`.pt`, `.pth`, `.onnx`, `.h5`, `.ckpt`, `.safetensors`) should be tracked.

---

## Where to Access AI Features

All AI features are part of the normal user flow — there are no standalone scripts.

| Feature | Where |
|---|---|
| AI trip parsing (notes to stops) | Create a new trip at `/new`, paste notes, click "Create itinerary" |
| Import from URL | `/new` — paste a blog or article URL in the "Import from URL" panel |
| AI Copilot (chat editing) | Inside any trip at `/trip/:id` — click "AI Copilot" |
| Route Optimizer | Inside any trip at `/trip/:id` — click "Optimize" |
| Explore recommendations | Inside any trip at `/trip/:id` — scroll to the "Explore nearby" panel |
| AI suggestions | Inside any trip at `/trip/:id` — use the suggest prompt in the stop list |
