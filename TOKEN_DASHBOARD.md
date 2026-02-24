# 💾 Token Usage Dashboard — Implementation Complete

## Overview

Added a full token usage dashboard to the Office dashboard at **`http://localhost:3000`** with a new **💾 Tokens** tab in the left panel.

## Features

### 📊 Dashboard Components

1. **Summary Cards** — Three quick-glance metrics:
   - **Today** — Total tokens used today
   - **Week Avg** — Average daily tokens over the last 7 days
   - **Weekly Total** — Total tokens consumed this week

2. **7-Day Chart** — ApexCharts visualization showing daily token consumption trends:
   - Smooth area chart with gradient fill
   - Labeled axes (date on x, tokens on y)
   - Interactive tooltips on hover
   - Responsive sizing (250px default, 200px on mobile)

3. **Top Agents This Week** — Ranked list with progress bars:
   - Top 5 agents by token consumption
   - Visual progress bars showing % of weekly total
   - Color-coded (blue gradient)
   - Exact token counts and percentages

### 🎨 Visual Design

- **Color scheme:** Blue accents (`#3b82f6`) with dark background theme
- **Typography:** Consistent with dashboard (0.75-0.85rem labels, 1.2rem values)
- **Spacing:** 10-20px gaps, clean card layout
- **Responsive:** Grid adjusts to single column on mobile (≤768px)

## Technical Implementation

### Backend Changes

**File:** `/Users/jeremylahners/.openclaw/workspace/office/gateway-api.js`

Added two components:

1. **API Endpoint:** `GET /token-usage`
   - Returns aggregated token data from data files
   - Supports 7-day history
   - Calculates summary stats (daily avg, weekly total, top agents)

2. **Data Loading Function:** `loadTokenUsageData()`
   - Scans `/office/data/` directory for `token-usage-YYYY-MM-DD.json` files
   - Aggregates by agent across days
   - Computes top 5 agents and week statistics
   - Graceful degradation if files missing

### Frontend Changes

**File:** `/Users/jeremylahners/.openclaw/workspace/office/index.html`

- Added new tab navigation item: `<div class="left-tab" data-tab="tokens">💾 Tokens</div>`
- Added tab content container: `<div class="left-tab-content" id="tab-tokens">`
- ApexCharts CDN already included (v3.45.1)

**File:** `/Users/jeremylahners/.openclaw/workspace/office/js/ui.js`

Added three functions:

1. **`loadTokenUsageDashboard()`** — Main loader
   - Fetches `/token-usage` API
   - Updates timestamp
   - Renders dashboard HTML
   - Initializes charts

2. **`renderTokenDashboard(data)`** — HTML template generator
   - Creates summary cards
   - Builds agent rankings with progress bars
   - Handles empty states gracefully

3. **`initializeTokenCharts(data)`** — ApexCharts initialization
   - Area chart configuration
   - Auto-scales to data range
   - Dark theme tooltips

Modified **`setupLeftPanelTabs()`** to trigger `loadTokenUsageDashboard()` when tokens tab is clicked.

**File:** `/Users/jeremylahners/.openclaw/workspace/office/css/all-styles.css`

Added 100+ lines of CSS:
- `.token-dashboard` — Main flex container
- `.token-cards` — 3-column grid
- `.token-card` — Individual metric cards with blue background
- `.token-value` — Large metric numbers
- `.chart-container` — ApexCharts wrapper
- `.top-agents` — Agent list section
- `.agent-row` — Individual agent entries
- `.progress-bar` — Animated progress fills
- `.agent-tokens` — Flex layout for token display
- Mobile responsive overrides

## Data Format

### File Structure

```
/office/data/
├── token-usage-2026-02-22.json
├── token-usage-2026-02-21.json
├── token-usage-2026-02-20.json
└── ...
```

### JSON Schema

```json
{
  "date": "2026-02-22",
  "generatedAt": "2026-02-22T23:30:00Z",
  "totalTokens": 45230,
  "byAgent": {
    "isla": 18500,
    "lena": 8200,
    "marcus": 6800,
    "remy": 5400,
    "harper": 3200,
    "sage": 2100,
    "julie": 1030
  }
}
```

## Integration with Cron Jobs

The dashboard is designed to work with the existing **Daily Token Usage Report** cron job (ID: `3e9ce24d`).

This cron job currently:
1. Runs at 11pm EST daily
2. Generates token usage stats via Python script
3. Saves to `/office/data/token-usage-YYYY-MM-DD.json`
4. Sends summary to Discord DM

**The dashboard automatically loads these files** — no additional job configuration needed.

## Testing & Verification

✅ **Backend API:** Tested with curl
```bash
curl http://localhost:8081/token-usage | jq .
```
Returns 226K weekly tokens aggregated across 7 agents.

✅ **Sample Data:** Created 5 days of test data
- Feb 18-22, 2026
- Realistic token distributions
- Shows upward/downward trends

✅ **Service Restart:** Gateway API restarted successfully with new route

## To Use

1. **Open the dashboard:** http://localhost:3000
2. **Click the 💾 Tokens tab** in the left panel
3. Dashboard loads automatically and displays:
   - Today's tokens (from file)
   - Week average and total
   - 7-day trend chart
   - Top 5 agents ranking

## Optional Enhancements (Future)

- **Real-time updates:** WebSocket live token counter
- **Agent drill-down:** Click agent name to see detailed breakdown
- **Cost calculator:** Add token→$ conversion rates
- **Budget alerts:** Warn if weekly total exceeds threshold
- **Historical comparison:** "2% up vs last week" badges
- **Export:** Download token reports as CSV/PDF

## Files Modified

- ✅ `/office/gateway-api.js` — Added endpoint + loader function
- ✅ `/office/index.html` — Added tab + container
- ✅ `/office/js/ui.js` — Added dashboard functions
- ✅ `/office/css/all-styles.css` — Added dashboard styles
- ✅ `/office/data/token-usage-*.json` — Sample data (5 files)

## Notes

- **No breaking changes** — All existing functionality preserved
- **Graceful fallback** — If data files missing, shows "No data available"
- **Mobile friendly** — Responsive grid, smaller charts on small screens
- **Performance** — File loading cached in memory during session
- **Accessibility** — Proper contrast ratios, semantic HTML structure
