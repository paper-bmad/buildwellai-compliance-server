#!/usr/bin/env bash
# Smoke test for the compliance API server.
# Usage: ./test_api.sh [base_url]
# Example: ANTHROPIC_API_KEY=sk-ant-... ./test_api.sh http://localhost:3001

set -eo pipefail
BASE="${1:-http://localhost:3001}"
PASS=0; FAIL=0

check() {
  local label="$1"; local result="$2"; local expected="$3"
  if [ "$result" = "$expected" ]; then
    echo "  PASS  $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $label (got '$result', want '$expected')"
    FAIL=$((FAIL+1))
  fi
}

echo "Smoke-testing $BASE"
echo "---"

# GET /health
health=$(curl -sf "$BASE/health" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'], d['version'])")
check "GET /health status" "$(echo $health | cut -d' ' -f1)" "ok"
check "GET /health version" "$(echo $health | cut -d' ' -f2)" "1.2.0"

# GET /domains
domain_count=$(curl -sf "$BASE/domains" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['domains']))")
check "GET /domains count" "$domain_count" "16"

# POST /check (requires API key)
if [ -n "$ANTHROPIC_API_KEY" ]; then
  status=$(curl -sf -X POST "$BASE/check" \
    -H "Content-Type: application/json" \
    -d '{
      "buildingParameters": {
        "buildingUse": "Residential", "constructionType": "Masonry",
        "numberOfStoreys": 2, "floorAreaM2": 120,
        "occupancyEstimate": 4, "hasBasement": false, "hasAtrium": false
      },
      "domains": ["fire_safety", "structural"]
    }' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('overallStatus','ERROR'))")
  check "POST /check overallStatus present" "$([ -n "$status" ] && echo ok || echo missing)" "ok"
  echo "       overallStatus=$status"
else
  echo "  SKIP  POST /check (set ANTHROPIC_API_KEY to test live inference)"
fi

echo "---"
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
