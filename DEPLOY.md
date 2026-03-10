# FXMARK deployment

- **Backend**: GCP Cloud Run (Docker) — build and deploy from `docker/`
- **Frontend**: Vercel (GitHub connected) — push to main = deploy latest code

---

## Backend (GCP: Docker → Artifact Registry → Cloud Run)

Deployments use the existing **docker** setup: `docker/Dockerfile.backend.prod` and `docker/cloudbuild-backend.yaml`.

**Flow:** (1) Build Docker image and push to Artifact Registry. (2) Deploy that image to Cloud Run.

### First-time setup

1. Set project and enable APIs:

   ```bash
   gcloud config set project YOUR_PROJECT_ID
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   ```

2. Create Artifact Registry repo (one time):

   ```bash
   gcloud artifacts repositories create fxmark --repository-format=docker --location=us-central1
   ```

3. Configure Cloud Run env vars (e.g. `CONNECTION_STRING`, `JWT_SECRET`, `MONGODB_URI`) in the Cloud Run console or:

   ```bash
   gcloud run services update fxmark-backend --region us-central1 \
     --set-env-vars "CONNECTION_STRING=...,JWT_SECRET=...,MONGODB_URI=..."
   ```

### Step 1: Docker → Artifact Registry (build and push)

From the **repo root**:

```bash
gcloud builds submit --config=docker/cloudbuild-backend.yaml .
```

This builds the backend image from `docker/Dockerfile.backend.prod` and pushes it to Artifact Registry:

- `us-central1-docker.pkg.dev/PROJECT_ID/fxmark/backend:SHORT_SHA`
- `us-central1-docker.pkg.dev/PROJECT_ID/fxmark/backend:latest`

### Step 2: Deploy to Cloud Run

Deploy the image from Artifact Registry to Cloud Run:

```bash
# Deploy the latest tag (or use :SHORT_SHA from the build output)
gcloud run deploy fxmark-backend \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/fxmark/backend:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated
```

Replace `YOUR_PROJECT_ID` with your GCP project ID. To deploy a specific build, use the `:SHORT_SHA` tag from the build step.

---

## Frontend (Vercel)

The frontend is deployed on **Vercel** with the repo connected to **GitHub**. Latest code is deployed automatically when you push to `main` or `master`.

### One-time setup

1. In Vercel: Import the GitHub repo and set **Root Directory** to the repo root (Vercel will use root `vercel.json`: `installCommand: cd frontend-web && npm install`, `outputDirectory: frontend-web/dist`).
2. In the Vercel project **Environment Variables**, set:
   - `VITE_API_URL` = your backend URL, e.g. `https://fxmark-backend-XXXXX.run.app` (no `/api` suffix if your app appends it; match what the frontend expects).

Root `vercel.json` configures build and SPA rewrites; override `VITE_API_URL` in Vercel so production uses your Cloud Run URL.

### Deploy latest code (update frontend)

Push to `main` or `master`:

```bash
git add -A && git commit -m "Update frontend" && git push origin main
```

Vercel will build and deploy the latest code from GitHub.

---

## Local Docker (dev)

From the repo root, using the existing `docker/` setup:

```bash
cd docker && docker-compose up --build
```

Uses `docker/Dockerfile.backend` and starts backend, MongoDB, Postgres, Redis.

---

## Summary

| Component | Where        | Update latest code |
|-----------|--------------|--------------------|
| Backend   | GCP Cloud Run | **Step 1:** `gcloud builds submit --config=docker/cloudbuild-backend.yaml .` (Docker → Artifact Registry). **Step 2:** `gcloud run deploy fxmark-backend --image us-central1-docker.pkg.dev/PROJECT_ID/fxmark/backend:latest --region us-central1 --platform managed --allow-unauthenticated` |
| Frontend  | Vercel       | Push to `main`/`master` (Vercel auto-deploys from GitHub) |
