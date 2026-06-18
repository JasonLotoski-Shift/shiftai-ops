# Prototype worker — Railway deploy runbook

1. Railway → New Project → Deploy from GitHub repo `JasonLotoski-Shift/shiftai-ops`.
2. Service settings → set the Dockerfile path to `worker/Dockerfile` (or start command `npm run worker` with the Nixpacks Node 22 + a playwright install build step — Dockerfile is simpler).
3. Variables: ANTHROPIC_API_KEY, DATABASE_URL (Supabase **Direct**, port 5432 — NOT the pooler),
   GOOGLE_SERVICE_ACCOUNT_KEY_B64, PROTOTYPE_LIBRARY_FOLDER_ID=15Hl4UUK4A5wrbXWOQp6Qj1YXk-w8hYUS,
   WORKER_SHARED_SECRET (generate a strong random), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
   PROTOTYPE_MODEL=claude-opus-4-8.
4. Resources: ≥1 GiB RAM (Chromium is heavy).
5. Deploy → copy the public service URL.
6. In Vercel (the app): set WORKER_URL=<railway url> and the same WORKER_SHARED_SECRET; redeploy.
7. Smoke test: `curl -X POST <railway>/build -d '{}'` → 401; with the Bearer secret → 202.
