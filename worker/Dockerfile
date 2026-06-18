FROM node:22-slim
WORKDIR /app
# Playwright system deps + chromium need apt; install before npm so layers cache.
COPY package*.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium
COPY . .
RUN npx prisma generate
ENV NODE_ENV=production
CMD ["npm", "run", "worker"]
