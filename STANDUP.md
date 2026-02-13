# Daily Standup System

## Overview
The Office dashboard's standup panel reads from a single JSON file instead of parsing individual agent memory files.

## File Location
`/Users/jeremylahners/.openclaw/workspace/office/standup.json`

## File Format
See `standup.json.example` for the complete structure.

### Required Fields
```json
{
  "timestamp": 1771012800000,  // Unix timestamp in ms (for staleness check)
  "date": "Fri, Feb 13",        // Human-readable date
  "time": "3:00 PM",            // Human-readable time
  "updates": [],                // Array of agent updates (see below)
  "crossTeam": []               // Optional cross-team items
}
```

### Agent Update Format
```json
{
  "agent": "marcus",            // Agent key (lowercase)
  "emoji": "🔧",               // Agent emoji
  "name": "Marcus",             // Display name
  "role": "Dev",                // Short role description
  "items": [                    // Array of work items
    { 
      "status": "✅",          // ✅ (done), 🔄 (in progress), ⏳ (waiting), ⚠️ (blocked)
      "text": "Fixed bug"     // Work item description
    }
  ],
  "learned": "Insight text",    // Optional: what the agent learned today
  "blockers": []                // Optional: array of blocker strings
}
```

## Staleness Detection
- The endpoint checks the `timestamp` field
- If older than 24 hours, adds `"stale": true` to response
- Dashboard can show a warning if data is stale

## Generating Standup Data

### Option 1: Cron Job (Recommended)
Create a cron job that runs daily (e.g., 3:00 PM) to:
1. Query each agent's memory file or session
2. Parse status/learned/blockers
3. Write to `standup.json` with current timestamp

### Option 2: Manual Update
Edit `standup.json` directly with today's updates.

### Option 3: API Endpoint (Future)
Could add a POST endpoint to `/standup` that accepts updates and writes to the file.

## Example Workflow
```bash
# 1. Generate standup data (via cron or script)
node scripts/generate-standup.js

# 2. Dashboard automatically picks it up (polls every 2 minutes)

# 3. Data remains cached until next generation
```

## Migration Notes
- Old system: Parsed `memory/agents/{name}.md` files on every request
- New system: Reads single JSON file (faster, cleaner separation)
- Generation process can use any logic (agent memory, session history, manual input)

## Fallback Behavior
If `standup.json` doesn't exist or is invalid:
- Returns empty updates array
- Shows message: "No standup data available"
- Suggests running standup cron or creating file manually
