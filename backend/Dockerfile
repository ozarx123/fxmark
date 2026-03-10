# FXMARK backend — GCP Cloud Run (Docker)
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Production image
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy deps from builder
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Backend entry (see package.json "start": "node src/index.js")
EXPOSE 8080
CMD ["node", "src/index.js"]
