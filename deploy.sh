#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Task Manager K2 — Deploy to Azure App Service
# ═══════════════════════════════════════════════════════════
# Prerequisites:
#   1. Azure CLI: brew install azure-cli
#   2. Login:     az login
#   3. .env configured in server/
#
# Usage: ./deploy.sh
# ═══════════════════════════════════════════════════════════

set -e

APP_NAME="task-manager-k2"
RESOURCE_GROUP="task-manager-rg"
LOCATION="westeurope"
SKU="B1"

echo "═══════════════════════════════════════════════"
echo " Task Manager K2 — Azure Deployment"
echo "═══════════════════════════════════════════════"

# Check prerequisites
if ! command -v az &> /dev/null; then
  echo "❌ Azure CLI nie jest zainstalowane!"
  echo "   Zainstaluj: brew install azure-cli"
  echo "   Potem:      az login"
  exit 1
fi

if ! az account show &> /dev/null; then
  echo "❌ Nie jesteś zalogowany do Azure!"
  echo "   Uruchom: az login"
  exit 1
fi

echo "✅ Azure CLI OK ($(az account show --query name -o tsv))"

# ── 1. Build frontend ──
echo ""
echo "[1/6] Building frontend..."
npm run build

# ── 2. Install server dependencies ──
echo ""
echo "[2/6] Installing server dependencies..."
cd server && npm install --production && cd ..

# ── 3. Create Azure resources ──
echo ""
echo "[3/6] Creating Azure resources..."
az group create --name $RESOURCE_GROUP --location $LOCATION --output none 2>/dev/null || true

az appservice plan create \
  --name "${APP_NAME}-plan" \
  --resource-group $RESOURCE_GROUP \
  --sku $SKU \
  --is-linux --output none 2>/dev/null || true

az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan "${APP_NAME}-plan" \
  --name $APP_NAME \
  --runtime "NODE:20-lts" --output none 2>/dev/null || true

# ── 4. Configure environment variables ──
echo ""
echo "[4/6] Configuring environment variables..."

# Read .env and set app settings
ENV_SETTINGS=""
if [ -f server/.env ]; then
  while IFS='=' read -r key value; do
    # Skip comments, empty lines
    [[ $key =~ ^#.*$ ]] && continue
    [[ -z $key ]] && continue
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | xargs)
    if [ -n "$key" ] && [ -n "$value" ]; then
      ENV_SETTINGS="$ENV_SETTINGS $key=$value"
    fi
  done < server/.env
fi

# Override production-specific settings
ENV_SETTINGS="$ENV_SETTINGS NODE_ENV=production PORT=8080 FRONTEND_AUTH=true"

az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --settings $ENV_SETTINGS --output none

echo "  ✅ Environment variables configured (including FRONTEND_AUTH=true)"

# Set startup command
az webapp config set \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --startup-file "node server/server.js" --output none

# ── 5. Create deployment package ──
echo ""
echo "[5/6] Deploying application..."

DEPLOY_DIR=$(mktemp -d)

# Copy built frontend
cp -r dist "$DEPLOY_DIR/"

# Copy server (with node_modules, without .env and uploads)
cp -r server "$DEPLOY_DIR/"
rm -f "$DEPLOY_DIR/server/.env"
rm -rf "$DEPLOY_DIR/server/uploads"

# Copy root package.json (needed for Azure to recognize Node app)
cp package.json "$DEPLOY_DIR/"

cd "$DEPLOY_DIR"
zip -qr deploy.zip . -x "*/uploads/*" "*/.env"

az webapp deploy \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --src-path deploy.zip \
  --type zip

cd -
rm -rf "$DEPLOY_DIR"

# ── 6. Done ──
APP_URL="https://${APP_NAME}.azurewebsites.net"

echo ""
echo "[6/6] Deployment complete!"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  🚀 Aplikacja: $APP_URL"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  ⚠️  WYMAGANE: Dodaj Redirect URI w Azure Portal"
echo ""
echo "  1. Otwórz: https://portal.azure.com"
echo "  2. Idź do: Entra ID → App registrations → Task Manager K2"
echo "  3. Kliknij: Authentication → Add a platform → Single-page application"
echo "  4. Wklej:   $APP_URL"
echo "  5. Zapisz"
echo ""
echo "  Po tym każdy z zespołu może otworzyć $APP_URL"
echo "  i zalogować się kontem Microsoft (@k2biznes.pl)"
echo ""
