# 🚀 Token Dashboard — Quick Start

## Access It

**URL:** http://localhost:3000  
**Tab:** 💾 Tokens (in left panel)

## What You'll See

### Summary Cards (Top)
- **Today** — tokens consumed so far today
- **Week Avg** — average daily consumption (last 7 days)
- **Weekly Total** — total tokens this week

### 7-Day Chart (Middle)
- Smooth area chart showing daily trends
- Shows if token usage is trending up or down
- Interactive tooltips on hover

### Top Agents (Bottom)
- Ranked list of your busiest agents
- Shows % of weekly total consumed
- Progress bars show relative consumption

## Data Source

The dashboard pulls from:
```
/Users/jeremylahners/.openclaw/workspace/office/data/
├── token-usage-2026-02-22.json
├── token-usage-2026-02-21.json
├── ...
└── token-usage-2026-02-17.json
```

Each file is auto-generated daily by the cron job `3e9ce24d` (11pm EST).

## File Format

```json
{
  "date": "2026-02-22",
  "generatedAt": "2026-02-22T23:30:00Z",
  "totalTokens": 45230,
  "byAgent": {
    "isla": 18500,
    "lena": 8200,
    "marcus": 6800,
    ...
  }
}
```

If you want to manually add/update data:
1. Create a JSON file with the format above
2. Save to `/office/data/token-usage-YYYY-MM-DD.json`
3. Reload the dashboard — it auto-detects new files

## API Endpoint

If you need the raw data:
```bash
curl http://localhost:8081/token-usage | jq .
```

Returns aggregated data for the last 7 days plus summary stats.

## Troubleshooting

**"No data available" message?**
- Check that `/office/data/` directory exists
- Verify JSON files are in the correct location
- Make sure files are valid JSON (test with `jq < file.json`)

**Chart not showing?**
- Check browser console (F12) for JavaScript errors
- ApexCharts CDN should be loaded (check Network tab)
- Refresh the page

**Old data showing?**
- Browser may be caching — refresh with `Cmd+Shift+R` (hard refresh)
- Or clear browser cache in DevTools

## Development Notes

- Chart library: ApexCharts v3.45.1 (CDN)
- Backend endpoint: `/token-usage` (gateway-api.js:1772)
- Dashboard component: `js/ui.js` (`loadTokenUsageDashboard()` function)
- Styles: `css/all-styles.css` (token-dashboard section, lines 2330+)

---

**Last updated:** Feb 23, 2026 5:00 AM  
**Status:** Production-ready ✅
