#!/bin/bash
# Update agent status
# Usage: ./update-status.sh <agent> <state> <task>
# Example: ./update-status.sh marcus working "Reviewing PR #190"

AGENT=$1
STATE=$2
TASK=$3

curl -s -X POST "http://localhost:8766/status/${AGENT}" \
  -H "Content-Type: application/json" \
  -d "{\"state\": \"${STATE}\", \"task\": \"${TASK}\"}"

echo ""
