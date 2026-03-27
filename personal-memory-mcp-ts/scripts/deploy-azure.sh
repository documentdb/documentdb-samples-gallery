#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# deploy-azure.sh — Deploy DocumentDB OSS on an Azure VM
#
# Creates a resource group, an Ubuntu VM, installs Docker, pulls and runs
# the DocumentDB local image, opens port 10260, and outputs the connection
# string ready for .env.
#
# Usage:
#   bash scripts/deploy-azure.sh
#   bash scripts/deploy-azure.sh --vm-name my-docdb --location westus
#
# Prerequisites:
#   - Azure CLI (az) installed and logged in: az login
#   - Sufficient permissions to create resources in the target subscription
###############################################################################

# Defaults (override via environment variables or flags)
RESOURCE_GROUP="${RESOURCE_GROUP:-personal-memory-rg}"
VM_NAME="${VM_NAME:-docdb-vm}"
LOCATION="${LOCATION:-eastus}"
VM_SIZE="${VM_SIZE:-Standard_B2s}"
ADMIN_USER="${ADMIN_USER:-memadmin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
DB_USER="${DB_USER:-docdbadmin}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-personal_memory}"
IMAGE="${IMAGE:-ghcr.io/documentdb/documentdb/documentdb-local:latest}"

# Parse optional flags
while [[ $# -gt 0 ]]; do
  case $1 in
    --resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    --vm-name)        VM_NAME="$2"; shift 2 ;;
    --location)       LOCATION="$2"; shift 2 ;;
    --vm-size)        VM_SIZE="$2"; shift 2 ;;
    --admin-user)     ADMIN_USER="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --db-user)        DB_USER="$2"; shift 2 ;;
    --db-password)    DB_PASSWORD="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Generate passwords if not provided
if [[ -z "$ADMIN_PASSWORD" ]]; then
  ADMIN_PASSWORD="V$(openssl rand -base64 16 | tr -dc 'A-Za-z0-9' | head -c 14)1!"
fi
if [[ -z "$DB_PASSWORD" ]]; then
  DB_PASSWORD="D$(openssl rand -base64 16 | tr -dc 'A-Za-z0-9' | head -c 14)1!"
  echo "🔑 Generated DocumentDB password (save this!): $DB_PASSWORD"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DocumentDB OSS on Azure VM — Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Resource Group : $RESOURCE_GROUP"
echo "  VM Name        : $VM_NAME"
echo "  VM Size        : $VM_SIZE"
echo "  Location       : $LOCATION"
echo "  DB User        : $DB_USER"
echo "  Database       : $DB_NAME"
echo "  Image          : $IMAGE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Step 1: Ensure az is logged in
echo ""
echo "⏳ Checking Azure CLI login..."
if ! az account show &>/dev/null; then
  echo "❌ Not logged in. Run 'az login' first."
  exit 1
fi
SUBSCRIPTION=$(az account show --query name -o tsv)
echo "✅ Logged in to subscription: $SUBSCRIPTION"

# Step 2: Create resource group
echo ""
echo "⏳ Creating resource group '$RESOURCE_GROUP' in '$LOCATION'..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none
echo "✅ Resource group ready"

# Step 3: Create cloud-init script
CLOUD_INIT=$(cat <<EOF
#!/bin/bash
set -e

# Install Docker
apt-get update -y
apt-get install -y docker.io
systemctl enable --now docker

# Pull and run DocumentDB
docker run -dt \
  --name documentdb \
  --restart unless-stopped \
  -p 10260:10260 \
  -e USERNAME=${DB_USER} \
  -e PASSWORD=${DB_PASSWORD} \
  ${IMAGE}
EOF
)

CLOUD_INIT_FILE=$(mktemp)
echo "$CLOUD_INIT" > "$CLOUD_INIT_FILE"

# Step 4: Create the VM
echo ""
echo "⏳ Creating VM '$VM_NAME' ($VM_SIZE)..."
echo "   This may take 2-3 minutes..."
PUBLIC_IP=$(az vm create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --image "Canonical:ubuntu-24_04-lts:server:latest" \
  --size "$VM_SIZE" \
  --admin-username "$ADMIN_USER" \
  --admin-password "$ADMIN_PASSWORD" \
  --custom-data "$CLOUD_INIT_FILE" \
  --public-ip-sku Standard \
  --query publicIpAddress -o tsv)

rm -f "$CLOUD_INIT_FILE"
echo "✅ VM created — public IP: $PUBLIC_IP"

# Step 5: Open port 10260 for DocumentDB gateway
echo ""
echo "⏳ Opening port 10260 (DocumentDB gateway)..."
az vm open-port \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --port 10260 \
  --priority 1010 \
  --output none
echo "✅ Port 10260 open"

# Step 6: Wait for DocumentDB to be ready
echo ""
echo "⏳ Waiting for DocumentDB to start (may take 1-2 minutes for Docker pull)..."
READY=false
for i in $(seq 1 30); do
  if az vm run-command invoke \
    --resource-group "$RESOURCE_GROUP" \
    --name "$VM_NAME" \
    --command-id RunShellScript \
    --scripts "docker ps --filter name=documentdb --filter status=running -q" \
    --query "value[0].message" -o tsv 2>/dev/null | grep -q '[a-f0-9]'; then
    READY=true
    break
  fi
  echo "   Attempt $i/30 — waiting 20s..."
  sleep 20
done

if [[ "$READY" == "true" ]]; then
  echo "✅ DocumentDB is running"
else
  echo "⚠️  DocumentDB may still be starting. Check with:"
  echo "   az vm run-command invoke --resource-group $RESOURCE_GROUP --name $VM_NAME \\"
  echo "     --command-id RunShellScript --scripts 'docker ps'"
fi

# Step 7: Build connection string
CONNECTION_STRING="mongodb://${DB_USER}:${DB_PASSWORD}@${PUBLIC_IP}:10260/${DB_NAME}?tls=true&tlsAllowInvalidCertificates=true&authMechanism=SCRAM-SHA-256&directConnection=true"

# Step 8: Output results
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Deployment Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Add this to your mcp-server/.env file:"
echo ""
echo "  DOCUMENTDB_URI=$CONNECTION_STRING"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  VM Public IP   : $PUBLIC_IP"
echo "  VM Admin User  : $ADMIN_USER"
echo "  DB User        : $DB_USER"
echo "  DB Password    : $DB_PASSWORD"
echo "  Resource Group : $RESOURCE_GROUP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  SSH into the VM:"
echo "    ssh $ADMIN_USER@$PUBLIC_IP"
echo ""
echo "  Tear down all resources:"
echo "    az group delete --name $RESOURCE_GROUP --yes --no-wait"
echo ""
