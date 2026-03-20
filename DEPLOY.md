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

### Finance: wallet–ledger consistency (env)

- **`FINANCE_AUTO_RECONCILE_WALLET=1`** — after each guarded money flow, if wallet ≠ ledger WALLET account, log error and **set wallet to ledger** (optional safety net).
- **`FINANCE_ENSURE_WALLET_LEDGER_INDEX=1`** — on backend startup, create unique index on WALLET ledger rows **only if** no duplicates exist (same rules as `node scripts/ensure-wallet-ledger-unique-index.js --create`).

See `backend/docs/FINANCIAL_TRANSACTION_ARCHITECTURE.md`.

### Secret Manager (recommended for API keys)

Enable once:

```bash
gcloud services enable secretmanager.googleapis.com
```

**Create or rotate secrets** (PowerShell from repo root):

```powershell
# Mongo + JWT (+ optional Twelve Data + Finnhub) — prompts or pass -FinnhubApiKey "..."
.\scripts\setup-secrets.ps1 -FinnhubApiKey "YOUR_FINNHUB_KEY"
```

Or manually (Finnhub) — use **`-n`** / no trailing newline so the key is not corrupted:

```bash
# Bash (no newline)
printf %s 'YOUR_FINNHUB_KEY' | gcloud secrets create finnhub-api-key --data-file=-
# If the secret already exists:
printf %s 'YOUR_FINNHUB_KEY' | gcloud secrets versions add finnhub-api-key --data-file=-
```

**Attach secret to Cloud Run** (adds env var `FINNHUB_API_KEY` from latest version):

```bash
gcloud run services update fxmark-backend --region us-central1 \
  --update-secrets=FINNHUB_API_KEY=finnhub-api-key:latest
```

### Zoho Mail (SMTP — verification & notifications)

Store the mailbox and password as two secrets (recommended instead of plain env vars):

```powershell
# From repo root — reads ZOHO_MAIL_USER and ZOHO_MAIL_PASSWORD from backend\.env
.\scripts\fix-zoho-secrets.ps1
```

Or with `setup-secrets.ps1` (pass both):

```powershell
.\scripts\setup-secrets.ps1 -ZohoMailUser "noreply@yourdomain.com" -ZohoMailPassword "your-password-or-app-password"
```

Secret IDs in GCP: **`zoho-mail-user`**, **`zoho-mail-password`**.  
Cloud Run env mapping: **`ZOHO_MAIL_USER`**, **`ZOHO_MAIL_PASSWORD`** (wired automatically by `docker/deploy.ps1` and `docker/deploy-source.ps1` when both secrets exist).

Grant the Cloud Run service account **Secret Accessor** on both secrets (the scripts above try to do this), or:

**PowerShell (repo root):** `.\scripts\grant-zoho-secrets-access.ps1`

**Bash / one-liner per secret** (replace `PROJECT_NUMBER` — from `gcloud projects describe --format="value(projectNumber)"`):

```bash
gcloud secrets add-iam-policy-binding zoho-mail-user \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding zoho-mail-password \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

If deploy still says **Permission denied**, Cloud Run may use a **custom** service account. Get it:

```bash
gcloud run services describe fxmark-backend --region us-central1 --format="value(spec.template.spec.serviceAccountName)"
```

Grant **Secret Accessor** on both Zoho secrets to **that** email (not `-compute@`).

Attach to Cloud Run (merge with any other `--update-secrets` you already use):

```bash
gcloud run services update fxmark-backend --region us-central1 \
  --update-secrets=ZOHO_MAIL_USER=zoho-mail-user:latest,ZOHO_MAIL_PASSWORD=zoho-mail-password:latest
```

Non-secret env vars (still set as normal env): `FRONTEND_URL`, `ZOHO_SMTP_HOST`, `ZOHO_SMTP_PORT`, `FROM_EMAIL`, `FROM_NAME`, `API_URL`, etc.

Grant the Cloud Run service account access if deploy errors on permission (replace `PROJECT_NUMBER` from Cloud Run → service details, or use Console “Secrets” → grant accessor):

```bash
gcloud secrets add-iam-policy-binding finnhub-api-key \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

**From `backend/.env` without pasting in shell:** `.\scripts\fix-finnhub-secret.ps1` (reads `FINNHUB_API_KEY=` or pass `-Key`).

Deploy scripts `docker/deploy.ps1` and `docker/deploy-source.ps1` automatically pass `FINNHUB_API_KEY=finnhub-api-key:latest` when that secret exists.

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

### Redis (Memorystore) + Cloud Run

Cloud Run cannot reach the public internet for a “managed Redis” — use **Memorystore for Redis** on the **same VPC** and a **Serverless VPC Access connector**.

**This repo’s `fxmark` project (example):**

| Resource | Value |
|----------|--------|
| Redis instance | `fxmark-redis` (region `us-central1`, network `default`, 1 GB basic) |
| VPC connector | `fxmark-run-connector` (`10.8.0.0/28`, `e2-micro`) |
| Cloud Run env | `REDIS_HOST` = instance **host** IP, `REDIS_PORT` = `6379` |
| Cloud Run networking | `--vpc-connector=fxmark-run-connector` `--vpc-egress=private-ranges-only` |

**Verify:** `GET https://YOUR_CLOUD_RUN_URL/health/redis` → `{"status":"ok","redis":"connected"}`.

**Enable APIs (once):**

```bash
gcloud services enable redis.googleapis.com vpcaccess.googleapis.com compute.googleapis.com servicenetworking.googleapis.com
```

**Create Redis** (10–30+ min first time; pick a subnet range for the connector that does **not** overlap your VPC subnets, e.g. `10.8.0.0/28`):

```bash
gcloud redis instances create fxmark-redis --size=1 --region=us-central1 \
  --redis-version=redis_7_0 --network=default --display-name="FXMARK Redis"

gcloud compute networks vpc-access connectors create fxmark-run-connector \
  --region=us-central1 --network=default --range=10.8.0.0/28 \
  --min-instances=2 --max-instances=3 --machine-type=e2-micro
```

**Host IP** (use after instance is `READY`):

```bash
gcloud redis instances describe fxmark-redis --region=us-central1 --format='value(host)'
```

**Point Cloud Run at Redis:**

```bash
gcloud run services update fxmark-backend --region=us-central1 \
  --vpc-connector=fxmark-run-connector \
  --vpc-egress=private-ranges-only \
  --update-env-vars="REDIS_HOST=PRIVATE_IP,REDIS_PORT=6379"
```

Or use `REDIS_URL=redis://PRIVATE_IP:6379` (if `REDIS_URL` is set, it takes precedence over `REDIS_HOST`).

**Idempotent helper (PowerShell):** `.\scripts\enable-redis-gcp.ps1` — creates instance + connector if missing and prints the `gcloud run services update` command with the current Redis host.

**Costs / notes:** Basic 1 GB Memorystore + VPC connector have ongoing cost. If you **recreate** the Redis instance, the private IP may change — update `REDIS_HOST` / `REDIS_URL` on Cloud Run. Standard tier supports AUTH/TLS; basic tier uses private network only.

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
| Backend   | GCP Cloud Run | **Step 1:** `gcloud builds submit --config=docker/cloudbuild-backend.yaml .` (Docker → Artifact Registry). **Step 2:** `gcloud run deploy fxmark-backend --image us-central1-docker.pkg.dev/PROJECT_ID/fxmark/backend:latest --region us-central1 --platform managed --allow-unauthenticated`. **Redis:** Memorystore + VPC connector + `REDIS_HOST` (see above). |
| Frontend  | Vercel       | Push to `main`/`master` (Vercel auto-deploys from GitHub) |
