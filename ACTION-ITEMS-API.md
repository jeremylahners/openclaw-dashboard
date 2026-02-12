# Action Items API - For Agents

## What It Is

The Office dashboard now has an **Action Items** checklist in the Priorities panel. This is for tasks that Jeremy needs to handle manually — things we haven't automated yet or that require human judgment.

## When to Use It

Add an action item when:
- You discover something Jeremy needs to do manually
- A task is blocked waiting for human input
- You need Jeremy to enable/configure something before you can proceed
- You find something that needs his attention or decision

## How Agents Can Add Items

### From Web Console

If you can access the browser console:

```javascript
addActionItemFromAgent("Review MHC PR #123 for approval", "Isla")
```

### Via Exec Tool (Shell Command)

```bash
curl -X POST http://localhost:8081/action-items/add \
  -H "Content-Type: application/json" \
  -d '{"text": "Review MHC PR #123 for approval", "agent": "Isla"}'
```

### From JavaScript (Frontend)

```javascript
window.addActionItemFromAgent(
  "Review and approve BlueBubbles config changes", 
  "Dash"
)
```

## API Endpoint Details

**URL:** `http://localhost:8081/action-items/add`  
**Method:** `POST`  
**Headers:** `Content-Type: application/json`

**Request Body:**
```json
{
  "text": "Action item text here",
  "agent": "AgentName"  // optional but recommended
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Action item added to dashboard checklist"
}
```

## Jeremy's Experience

1. Action items appear at the top of the Priorities panel
2. Each item has a checkbox — he checks it when done
3. Completed items stay visible but are grayed out and crossed out
4. A "Clear Completed" button appears when there are checked items
5. Items persist in server-side storage (survive browser refresh)
6. **When Jeremy checks an item, the agent who created it gets notified automatically!**

## Agent Notifications

When Jeremy completes a task, the backend automatically:
- Detects the completion (completed: false → true)
- Looks up which agent added the item (from `addedBy` field)
- Sends a session message: *"✅ Jeremy completed your action item: [task text]"*
- Logs the notification attempt

**You don't need to poll or ask** - you'll get pinged when your task is done!

## Examples

```bash
# Isla needs PR approval
curl -X POST http://localhost:8081/action-items/add \
  -H "Content-Type: application/json" \
  -d '{"text": "Approve MHC backend PR #45", "agent": "Isla"}'

# Dash needs design feedback
curl -X POST http://localhost:8081/action-items/add \
  -H "Content-Type: application/json" \
  -d '{"text": "Review new dashboard mockup in #dash", "agent": "Dash"}'

# Val needs financial doc
curl -X POST http://localhost:8081/action-items/add \
  -H "Content-Type: application/json" \
  -d '{"text": "Upload Q4 expense receipts to Tiller", "agent": "Val"}'
```

## Guidelines

- **Be specific:** "Review PR #123" not "Check GitHub"
- **Be actionable:** Start with a verb (Review, Approve, Update, Check)
- **Include context:** Mention where/what ("in #mhc channel", "for MHC project")
- **Don't duplicate:** Check existing items first if possible
- **Use sparingly:** Only for things that truly need Jeremy's attention

## Logs

When you add an item, you'll see:
```
📋 Action item added: Review MHC PR #45 (added by Isla)
```

Check the gateway-api.js console to confirm your request went through.
