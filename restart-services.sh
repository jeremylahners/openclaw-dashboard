#!/bin/bash
# Office Dashboard Service Restart Script
# Bulletproof version — ensures clean process lifecycle

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Office Dashboard Service Restart${NC}"
echo "=================================="

# Function to kill ALL gateway-api.js processes and wait for port to be free
kill_all_backend() {
    echo -e "\n${YELLOW}Killing ALL gateway-api.js processes...${NC}"

    # Method 1: Kill by process name
    PIDS=$(pgrep -f "gateway-api.js" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "Found gateway-api.js processes: $PIDS"
        echo "$PIDS" | xargs kill -TERM 2>/dev/null || true
        sleep 1
        # Force kill any survivors
        PIDS=$(pgrep -f "gateway-api.js" 2>/dev/null || true)
        if [ -n "$PIDS" ]; then
            echo "Force killing survivors: $PIDS"
            echo "$PIDS" | xargs kill -9 2>/dev/null || true
            sleep 0.5
        fi
    fi

    # Method 2: Kill anything on port 8081
    PORT_PIDS=$(/usr/sbin/lsof -ti :8081 2>/dev/null || true)
    if [ -n "$PORT_PIDS" ]; then
        echo "Killing port 8081 holders: $PORT_PIDS"
        echo "$PORT_PIDS" | xargs kill -9 2>/dev/null || true
        sleep 0.5
    fi

    # Clean up pidfile
    rm -f /tmp/office-backend.pid

    # Wait for port to actually be free (up to 5 seconds)
    echo -n "Waiting for port 8081 to be free..."
    for i in $(seq 1 25); do
        if ! /usr/sbin/lsof -ti :8081 &>/dev/null; then
            echo -e " ${GREEN}free${NC}"
            break
        fi
        if [ "$i" -eq 25 ]; then
            echo -e " ${RED}TIMEOUT — port still in use!${NC}"
            /usr/sbin/lsof -i :8081 2>/dev/null || true
            exit 1
        fi
        sleep 0.2
    done

    echo -e "${GREEN}✓ All gateway-api.js processes killed, port 8081 free${NC}"
}

# Function to kill all serve.js processes
kill_all_frontend() {
    echo -e "\n${YELLOW}Checking for serve.js processes...${NC}"
    PIDS=$(pgrep -f "[s]erve.js" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "Found: $PIDS"
        echo "$PIDS" | xargs kill -9 2>/dev/null || true
        echo -e "${GREEN}✓ Killed serve.js processes${NC}"
    else
        echo "No serve.js processes found"
    fi
}

# Verify backend is listening after restart
verify_backend() {
    echo -n "Verifying backend is listening on port 8081..."
    for i in $(seq 1 30); do
        # Use curl as the primary check (lsof may not be on PATH in all contexts)
        if curl -s --max-time 1 http://127.0.0.1:8081/gateway/status &>/dev/null; then
            echo -e " ${GREEN}✓ listening${NC}"
            return 0
        fi
        sleep 0.5
    done
    echo -e " ${RED}✗ NOT listening after 15 seconds!${NC}"
    echo "Check /tmp/office-backend.err for errors"
    return 1
}

# Truncate log files if they're too large (> 10000 lines)
rotate_logs() {
    for logfile in /tmp/office-backend.log /tmp/office-backend.err; do
        if [ -f "$logfile" ]; then
            LINES=$(wc -l < "$logfile" 2>/dev/null || echo "0")
            if [ "$LINES" -gt 10000 ]; then
                echo -e "${YELLOW}Rotating $logfile ($LINES lines → last 1000)${NC}"
                tail -1000 "$logfile" > "${logfile}.tmp" && mv "${logfile}.tmp" "$logfile"
            fi
        fi
    done
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

# Function to kill whisper-server processes
kill_all_whisper() {
    echo -e "\n${YELLOW}Checking for whisper-server processes...${NC}"
    PIDS=$(pgrep -f "[w]hisper-server" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "Found: $PIDS"
        echo "$PIDS" | xargs kill -9 2>/dev/null || true
        echo -e "${GREEN}✓ Killed whisper-server processes${NC}"
    else
        echo "No whisper-server processes found"
    fi
}

# Function to kill kokoro-server processes
kill_all_kokoro() {
    echo -e "\n${YELLOW}Checking for kokoro-server processes...${NC}"
    PIDS=$(pgrep -f "[k]okoro-server" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "Found: $PIDS"
        echo "$PIDS" | xargs kill -9 2>/dev/null || true
        echo -e "${GREEN}✓ Killed kokoro-server processes${NC}"
    else
        echo "No kokoro-server processes found"
    fi
}

# Parse arguments
SERVICE="$1"

case "$SERVICE" in
    backend)
        echo -e "\n${YELLOW}Restarting backend only...${NC}"
        rotate_logs
        kill_all_backend
        launchctl kickstart -k gui/$UID/com.openclaw.office-backend
        verify_backend
        echo -e "${GREEN}✓ Backend restarted${NC}"
        ;;
    frontend)
        echo -e "\n${YELLOW}Restarting frontend only...${NC}"
        kill_all_frontend
        launchctl kickstart -k gui/$UID/com.openclaw.office-frontend
        echo -e "${GREEN}✓ Frontend restarted${NC}"
        ;;
    whisper)
        echo -e "\n${YELLOW}Restarting whisper-server...${NC}"
        kill_all_whisper
        if launchctl print gui/$UID/com.openclaw.whisper-server &>/dev/null; then
            launchctl kickstart -k gui/$UID/com.openclaw.whisper-server
            echo -e "${GREEN}✓ whisper-server restarted${NC}"
        else
            echo -e "${RED}whisper-server LaunchAgent not loaded. Install with:${NC}"
            echo "  cp whisper-server.plist ~/Library/LaunchAgents/com.openclaw.whisper-server.plist"
            echo "  launchctl load ~/Library/LaunchAgents/com.openclaw.whisper-server.plist"
        fi
        ;;
    kokoro)
        echo -e "\n${YELLOW}Restarting kokoro-server...${NC}"
        kill_all_kokoro
        if launchctl print gui/$UID/com.openclaw.kokoro-server &>/dev/null; then
            launchctl kickstart -k gui/$UID/com.openclaw.kokoro-server
            echo -e "${GREEN}✓ kokoro-server restarted${NC}"
        else
            echo -e "${RED}kokoro-server LaunchAgent not loaded. Install with:${NC}"
            echo "  cp kokoro-server.plist ~/Library/LaunchAgents/com.openclaw.kokoro-server.plist"
            echo "  launchctl load ~/Library/LaunchAgents/com.openclaw.kokoro-server.plist"
        fi
        ;;
    both|"")
        echo -e "\n${YELLOW}Restarting all services...${NC}"
        rotate_logs
        kill_all_backend
        kill_all_frontend
        kill_all_whisper
        kill_all_kokoro
        launchctl kickstart -k gui/$UID/com.openclaw.office-backend
        launchctl kickstart -k gui/$UID/com.openclaw.office-frontend
        if launchctl print gui/$UID/com.openclaw.whisper-server &>/dev/null; then
            launchctl kickstart -k gui/$UID/com.openclaw.whisper-server
        else
            echo -e "${YELLOW}⚠ whisper-server not loaded (optional — see whisper-server.plist)${NC}"
        fi
        if launchctl print gui/$UID/com.openclaw.kokoro-server &>/dev/null; then
            launchctl kickstart -k gui/$UID/com.openclaw.kokoro-server
        else
            echo -e "${YELLOW}⚠ kokoro-server not loaded (optional — see kokoro-server.plist)${NC}"
        fi
        verify_backend
        echo -e "${GREEN}✓ All services restarted${NC}"
        ;;
    status)
        echo -e "\n${YELLOW}Service Status:${NC}"
        echo -e "\nBackend:"
        launchctl print gui/$UID/com.openclaw.office-backend 2>&1 | grep "state = " || echo "  Not loaded"
        echo -e "\nFrontend:"
        launchctl print gui/$UID/com.openclaw.office-frontend 2>&1 | grep "state = " || echo "  Not loaded"
        echo -e "\nWhisper-server:"
        launchctl print gui/$UID/com.openclaw.whisper-server 2>&1 | grep "state = " || echo "  Not loaded"
        echo -e "\nKokoro-server:"
        launchctl print gui/$UID/com.openclaw.kokoro-server 2>&1 | grep "state = " || echo "  Not loaded"
        echo -e "\nProcesses on key ports:"
        echo "  Port 8081 (backend):" $(/usr/sbin/lsof -ti :8081 2>/dev/null || echo "none")
        echo "  Port 3001 (frontend):" $(/usr/sbin/lsof -ti :3001 2>/dev/null || echo "none")
        echo -e "\nAll gateway-api.js processes:"
        ps aux | grep -E "[g]ateway-api.js" || echo "  None"
        echo -e "\nPidfile:"
        if [ -f /tmp/office-backend.pid ]; then
            PID=$(cat /tmp/office-backend.pid)
            if kill -0 "$PID" 2>/dev/null; then
                echo "  /tmp/office-backend.pid → $PID (alive)"
            else
                echo "  /tmp/office-backend.pid → $PID (STALE)"
            fi
        else
            echo "  No pidfile"
        fi
        ;;
    logs)
        echo -e "\n${YELLOW}Recent logs:${NC}"
        echo -e "\n${YELLOW}Backend errors (last 20 lines):${NC}"
        tail -20 /tmp/office-backend.err 2>/dev/null || echo "  No error log"
        echo -e "\n${YELLOW}Backend log (last 20 lines):${NC}"
        tail -20 /tmp/office-backend.log 2>/dev/null || echo "  No log"
        echo -e "\n${YELLOW}Frontend errors:${NC}"
        tail -10 /tmp/office-frontend.err 2>/dev/null || echo "  No error log"
        echo -e "\n${YELLOW}Log file sizes:${NC}"
        ls -lh /tmp/office-backend.log /tmp/office-backend.err /tmp/office-frontend.log /tmp/office-frontend.err 2>/dev/null || true
        ;;
    *)
        echo -e "${RED}Usage: $0 [backend|frontend|whisper|kokoro|both|status|logs]${NC}"
        echo "  backend  - Restart backend only"
        echo "  frontend - Restart frontend only"
        echo "  whisper  - Restart whisper-server only"
        echo "  kokoro   - Restart kokoro-server only"
        echo "  both     - Restart all services (default)"
        echo "  status   - Show service status"
        echo "  logs     - Show recent error logs"
        exit 1
        ;;
esac

echo -e "\n${GREEN}Done!${NC}"
