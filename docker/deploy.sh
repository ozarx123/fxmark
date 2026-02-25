#!/bin/bash
# FXMARK Backend - GCP Cloud Run Deployment Script
# Prerequisites: Docker, gcloud CLI, GCP project with billing

set -e

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-fxmark-backend}"
BUILD_ONLY=false
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --project) PROJECT_ID="$2"; shift 2 ;;
        --region) REGION="$2"; shift 2 ;;
        --build-only) BUILD_ONLY=true; shift ;;
        --skip-build) SKIP_BUILD=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

if [[ -z "$PROJECT_ID" ]]; then
    echo "Error: Set GCP project: export PROJECT_ID='your-project-id' or pass --project"
    exit 1
fi

IMAGE_NAME="$REGION-docker.pkg.dev/$PROJECT_ID/fxmark/backend:latest"
REPO_NAME="fxmark"

echo "=== FXMARK GCP Deployment ==="
echo "Project: $PROJECT_ID | Region: $REGION | Service: $SERVICE_NAME"
echo ""

# Step 1: Build
if [[ "$SKIP_BUILD" != "true" ]]; then
    echo "[1/4] Building Docker image..."
    docker build -f docker/Dockerfile.backend.prod -t fxmark-backend:latest .
    echo "Build OK"
else
    echo "[1/4] Skipping build (--skip-build)"
fi

if [[ "$BUILD_ONLY" == "true" ]]; then
    echo "Build complete. Exiting (--build-only)"
    exit 0
fi

# Step 2: Ensure Artifact Registry repo exists
echo "[2/4] Ensuring Artifact Registry repository..."
if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" 2>/dev/null; then
    gcloud artifacts repositories create "$REPO_NAME" \
        --repository-format=docker \
        --location="$REGION" \
        --description="FXMARK container images"
fi
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
echo "Registry OK"

# Step 3: Tag and Push
echo "[3/4] Pushing image to Artifact Registry..."
docker tag fxmark-backend:latest "$IMAGE_NAME"
docker push "$IMAGE_NAME"
echo "Push OK"

# Step 4: Deploy to Cloud Run
echo "[4/4] Deploying to Cloud Run..."
DEPLOY_ARGS=(
    run deploy "$SERVICE_NAME"
    --image="$IMAGE_NAME"
    --region="$REGION"
    --platform=managed
    --allow-unauthenticated
    --port=8080
    --set-env-vars=NODE_ENV=production
)

if gcloud secrets describe mongo-uri 2>/dev/null; then
    DEPLOY_ARGS+=(--set-secrets=CONNECTION_STRING=mongo-uri:latest)
fi
if gcloud secrets describe jwt-secret 2>/dev/null; then
    DEPLOY_ARGS+=(--set-secrets=JWT_SECRET=jwt-secret:latest)
fi

gcloud "${DEPLOY_ARGS[@]}"

echo ""
echo "=== Deployment complete ==="
URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)" 2>/dev/null || true)
if [[ -n "$URL" ]]; then echo "Service URL: $URL"; fi
echo ""
echo "If CONNECTION_STRING/JWT_SECRET are not set, add them via:"
echo "  gcloud run services update $SERVICE_NAME --region=$REGION --set-env-vars=CONNECTION_STRING=...,JWT_SECRET=..."
echo "  Or use Secret Manager: scripts/setup-secrets.ps1"
