#!/bin/bash
# Office Dashboard Service Restart Script
# Can be run by Isla or Marcus to restart frontend/backend services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Office Dashboard Service Restart${NC}"
echo "=================================="

# Function to kill any manual gateway-api.js processes
kill_manual_backend() {
    echo -e "\n${YELLOW}Checking for manual gateway-api.js processes...${NC}"
    MANUAL_PIDS=$(ps aux | grep "[g]ateway-api.js" | awk '{print $2}')
    if [ -n "$MANUAL_PIDS" ]; then
        echo "Found manual processes: $MANUAL_PIDS"
        echo "$MANUAL_PIDS" | xargs kill -9
        echo -e "${GREEN}✓ Killed manual gateway-api.js processes${NC}"
    else
        echo "No manual processes found"
    fi
}

# Function to kill any manual serve.js processes
kill_manual_frontend() {
    echo -e "\n${YELLOW}Checking for manual serve.js processes...${NC}"
    MANUAL_PIDS=$(ps aux | grep "[s]erve.js" | awk '{print $2}')
    if [ -n "$MANUAL_PIDS" ]; then
        echo "Found manual processes: $MANUAL_PIDS"
        echo "$MANUAL_PIDS" | xargs kill -9
        echo -e "${GREEN}✓ Killed manual serve.js processes${NC}"
    else
        echo "No manual processes found"
    fi
}

# Whisper-server model selection (prefer medium, fall back to small, then base)
WHISPER_MODEL_MEDIUM="/Users/jeremylahners/.cache/whisper-cpp/models/ggml-medium.en.bin"
WHISPER_MODEL_SMALL="/Users/jeremylahners/.cache/whisper-cpp/models/ggml-small.en.bin"
WHISPER_MODEL_BASE="/Users/jeremylahners/.cache/whisper-cpp/models/ggml-base.en.bin"
if [ -f "$WHISPER_MODEL_MEDIUM" ]; then
    WHISPER_MODEL="$WHISPER_MODEL_MEDIUM"
elif [ -f "$WHISPER_MODEL_SMALL" ]; then
    WHISPER_MODEL="$WHISPER_MODEL_SMALL"
    echo -e "${YELLOW}⚠ ggml-medium.en.bin not found, using small model${NC}"
elif [ -f "$WHISPER_MODEL_BASE" ]; then
    WHISPER_MODEL="$WHISPER_MODEL_BASE"
    echo -e "${YELLOW}⚠ ggml-small.en.bin not found, using base model${NC}"
else
    WHISPER_MODEL=""
fi

# Function to kill any manual whisper-server processes
kill_manual_whisper() {
    echo -e "\n${YELLOW}Checking for manual whisper-server processes...${NC}"
    MANUAL_PIDS=$(ps aux | grep "[w]hisper-server" | awk '{print $2}')
    if [ -n "$MANUAL_PIDS" ]; then
        echo "Found manual processes: $MANUAL_PIDS"
        echo "$MANUAL_PIDS" | xargs kill -9
        echo -e "${GREEN}✓ Killed manual whisper-server processes${NC}"
    else
        echo "No manual processes found"
    fi
}

# Parse arguments
SERVICE="$1"

case "$SERVICE" in
    backend)
        echo -e "\n${YELLOW}Restarting backend only...${NC}"
        kill_manual_backend
        launchctl kickstart -k gui/$UID/com.openclaw.office-backend
        echo -e "${GREEN}✓ Backend restarted${NC}"
        ;;
    frontend)
        echo -e "\n${YELLOW}Restarting frontend only...${NC}"
        kill_manual_frontend
        launchctl kickstart -k gui/$UID/com.openclaw.office-frontend
        echo -e "${GREEN}✓ Frontend restarted${NC}"
        ;;
    whisper)
        echo -e "\n${YELLOW}Restarting whisper-server...${NC}"
        kill_manual_whisper
        if launchctl print gui/$UID/com.openclaw.whisper-server &>/dev/null; then
            launchctl kickstart -k gui/$UID/com.openclaw.whisper-server
            echo -e "${GREEN}✓ whisper-server restarted${NC}"
        else
            echo -e "${RED}whisper-server LaunchAgent not loaded. Install with:${NC}"
            echo "  cp whisper-server.plist ~/Library/LaunchAgents/com.openclaw.whisper-server.plist"
            echo "  launchctl load ~/Library/LaunchAgents/com.openclaw.whisper-server.plist"
        fi
        ;;
    both|"")
        echo -e "\n${YELLOW}Restarting all services...${NC}"
        kill_manual_backend
        kill_manual_frontend
        kill_manual_whisper
        launchctl kickstart -k gui/$UID/com.openclaw.office-backend
        launchctl kickstart -k gui/$UID/com.openclaw.office-frontend
        if launchctl print gui/$UID/com.openclaw.whisper-server &>/dev/null; then
            launchctl kickstart -k gui/$UID/com.openclaw.whisper-server
            echo -e "${GREEN}✓ All services restarted (including whisper-server)${NC}"
        else
            echo -e "${GREEN}✓ Backend & frontend restarted${NC}"
            echo -e "${YELLOW}⚠ whisper-server not loaded (optional — see whisper-server.plist)${NC}"
        fi
        ;;
    status)
        echo -e "\n${YELLOW}Service Status:${NC}"
        echo -e "\nBackend:"
        launchctl print gui/$UID/com.openclaw.office-backend 2>&1 | grep "state = "
        echo -e "\nFrontend:"
        launchctl print gui/$UID/com.openclaw.office-frontend 2>&1 | grep "state = "
        echo -e "\nWhisper-server:"
        launchctl print gui/$UID/com.openclaw.whisper-server 2>&1 | grep "state = " || echo "  Not loaded"
        echo -e "\nManual processes:"
        ps aux | grep -E "[g]ateway-api.js|[s]erve.js|[w]hisper-server" || echo "None"
        ;;
    logs)
        echo -e "\n${YELLOW}Recent logs:${NC}"
        echo -e "\n${YELLOW}Backend errors:${NC}"
        tail -10 /tmp/office-backend.err
        echo -e "\n${YELLOW}Frontend errors:${NC}"
        tail -10 /tmp/office-frontend.err
        echo -e "\n${YELLOW}Whisper-server:${NC}"
        tail -10 /tmp/openclaw/whisper-server.log 2>/dev/null || echo "  No logs found"
        ;;
    *)
        echo -e "${RED}Usage: $0 [backend|frontend|whisper|both|status|logs]${NC}"
        echo "  backend  - Restart backend only"
        echo "  frontend - Restart frontend only"
        echo "  whisper  - Restart whisper-server only"
        echo "  both     - Restart all services (default)"
        echo "  status   - Show service status"
        echo "  logs     - Show recent error logs"
        exit 1
        ;;
esac

echo -e "\n${GREEN}Done!${NC}"
