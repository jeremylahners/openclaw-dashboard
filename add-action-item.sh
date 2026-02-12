#!/bin/bash
# Helper script for agents to add action items
# Usage: ./add-action-item.sh "Your action item text" "YourAgentName"

if [ -z "$1" ]; then
  echo "Usage: $0 \"Action item text\" [AgentName]"
  exit 1
fi

TEXT="$1"
AGENT="${2:-System}"

curl -X POST http://localhost:8081/action-items/add \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"$TEXT\", \"agent\": \"$AGENT\"}"

echo ""
