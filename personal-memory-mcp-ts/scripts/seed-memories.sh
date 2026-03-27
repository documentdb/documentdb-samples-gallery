#!/usr/bin/env bash
# Seed DocumentDB with example memories via the MCP API.
# Usage: AUTH_TOKEN=... bash scripts/seed-memories.sh
set -euo pipefail

MCP_URL="${MCP_URL:-http://localhost:3000/mcp}"
AUTH_TOKEN="${AUTH_TOKEN:-dev-token-change-me}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_FILE="$SCRIPT_DIR/../data/sample-memories.json"

echo "Seeding example memories via MCP API..."

save_memory() {
  local content="$1" category="$2" importance="$3" tags="$4"

  curl -s -X POST "$MCP_URL" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-03-26\",\"capabilities\":{},\"clientInfo\":{\"name\":\"seed\",\"version\":\"1.0\"}}}" \
    > /dev/null 2>&1

  curl -s -X POST "$MCP_URL" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"save_memory\",\"arguments\":{\"content\":\"$content\",\"category\":\"$category\",\"importance\":\"$importance\",\"tags\":$tags,\"source_platform\":\"seed\",\"source_agent_id\":\"seed-script\"}}}" \
    > /dev/null 2>&1

  echo "  ✓ [$category] $content"
}

save_memory "Full name is Jane Smith, preferred name Jane" "fact" "high" '["identity","name"]'
save_memory "Lives in Seattle, WA, USA (Pacific Time)" "fact" "high" '["location","seattle","timezone"]'
save_memory "Software engineer working on cloud infrastructure and databases" "fact" "high" '["career","engineering","databases"]'
save_memory "Prefers concise, clear responses with code examples" "instruction" "high" '["communication","style","instruction"]'
save_memory "Enjoys hiking, photography, and reading science fiction" "preference" "low" '["hobbies","hiking","photography","reading"]'
save_memory "Uses TypeScript and Python daily, prefers TypeScript for backend" "preference" "medium" '["programming","typescript","python"]'
save_memory "Working on migrating a legacy MongoDB deployment to DocumentDB" "fact" "medium" '["work","mongodb","documentdb","migration"]'
save_memory "Adopted a golden retriever named Luna in March 2026" "event" "medium" '["pet","dog","luna"]'

echo ""
echo "Done! Seeded 8 example memories."
echo "Try: curl -s http://localhost:3000/health"
