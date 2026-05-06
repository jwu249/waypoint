# waypoint

INFO490 Travel Itinerary

## Run locally

Start the backend and frontend in separate terminals.

### Backend (Flask API on port 5001)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Fill in `.env` (at minimum `OPENROUTER_API_KEY`), then run:

```bash
python3 api/index.py
```

### Frontend (Vite on port 5173)

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Notes

- Frontend `/api` requests are proxied to `http://localhost:5001`.
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` if using Supabase features.
- `OPENROUTER_API_KEY` is required for AI endpoints like `/api/parse`, `/api/suggest`, and `/api/explore` (default model: `openai/gpt-oss-120b:free`).
