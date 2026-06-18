FROM node:22-slim
WORKDIR /app

# Copy manifests + the Prisma schema/config FIRST so `npm ci`'s postinstall (prisma generate)
# has what it needs. A placeholder DATABASE_URL satisfies prisma.config.ts at build time —
# generate is codegen only (no DB connection); Railway injects the real URL at runtime.
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npm ci

# Chromium + its system libs for Eyes/interact (Debian-based image → apt available via --with-deps).
RUN npx playwright install --with-deps chromium

# App source (tsx runs the worker directly; no build step).
COPY . .

ENV NODE_ENV=production
# The worker reads PORT (Railway), DATABASE_URL (Supabase Direct/session pooler :5432),
# GOOGLE_SERVICE_ACCOUNT_KEY_B64, PROTOTYPE_LIBRARY_FOLDER_ID, WORKER_SHARED_SECRET,
# SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, PROTOTYPE_MODEL from the env.
CMD ["npm", "run", "worker"]
