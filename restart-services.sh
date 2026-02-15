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
    both|"")
        echo -e "\n${YELLOW}Restarting both services...${NC}"
        kill_manual_backend
        kill_manual_frontend
        launchctl kickstart -k gui/$UID/com.openclaw.office-backend
        launchctl kickstart -k gui/$UID/com.openclaw.office-frontend
        echo -e "${GREEN}✓ Both services restarted${NC}"
        ;;
    status)
        echo -e "\n${YELLOW}Service Status:${NC}"
        echo -e "\nBackend:"
        launchctl print gui/$UID/com.openclaw.office-backend 2>&1 | grep "state = "
        echo -e "\nFrontend:"
        launchctl print gui/$UID/com.openclaw.office-frontend 2>&1 | grep "state = "
        echo -e "\nManual processes:"
        ps aux | grep -E "[g]ateway-api.js|[s]erve.js" || echo "None"
        ;;
    logs)
        echo -e "\n${YELLOW}Recent logs:${NC}"
        echo -e "\n${YELLOW}Backend errors:${NC}"
        tail -10 /tmp/office-backend.err
        echo -e "\n${YELLOW}Frontend errors:${NC}"
        tail -10 /tmp/office-frontend.err
        ;;
    *)
        echo -e "${RED}Usage: $0 [backend|frontend|both|status|logs]${NC}"
        echo "  backend  - Restart backend only"
        echo "  frontend - Restart frontend only"
        echo "  both     - Restart both (default)"
        echo "  status   - Show service status"
        echo "  logs     - Show recent error logs"
        exit 1
        ;;
esac

echo -e "\n${GREEN}Done!${NC}"
