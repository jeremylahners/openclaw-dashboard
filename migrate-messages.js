// office/migrate-messages.js
const fs = require('fs');
const path = require('path');
const { addMessage } = require('./db.js');

const MESSAGES_FILE = path.join(__dirname, 'messages.json');

function migrate() {
  if (!fs.existsSync(MESSAGES_FILE)) {
    console.log('No messages.json found, nothing to migrate');
    return;
  }

  const data = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
  let total = 0;
  let skipped = 0;

  for (const [agent, messages] of Object.entries(data)) {
    for (const msg of messages) {
      const role = msg.isBot ? 'assistant' : 'user';
      const content = msg.content || '';
      const timestamp = msg.timestamp || Date.now();
      // Use original ID as idempotency key to prevent re-import
      const idempotencyKey = msg.id || `legacy-${agent}-${timestamp}-${total}`;

      if (!content.trim()) {
        skipped++;
        continue;
      }

      const result = addMessage(agent, role, content, timestamp, idempotencyKey);
      if (result.duplicate) {
        skipped++;
      } else {
        total++;
      }
    }
  }

  console.log(`Migration complete: ${total} messages imported, ${skipped} skipped`);

  // Rename old file as backup
  const backupPath = MESSAGES_FILE + '.bak';
  fs.renameSync(MESSAGES_FILE, backupPath);
  console.log(`Original messages.json backed up to ${backupPath}`);
}

migrate();
