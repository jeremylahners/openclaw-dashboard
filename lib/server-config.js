// OpenClaw Dashboard - Configuration
const path = require('path');
const config = require('../config.js');

// File paths
const MEMORY_DIR = path.join(__dirname, '..', '..', 'memory', 'agents');
const STATUS_FILE = path.join(__dirname, '..', '..', 'memory', 'agent-status.json');
const INTERACTIONS_FILE = path.join(__dirname, '..', '..', 'memory', 'agent-interactions.json');
const MESSAGES_FILE = path.join(__dirname, '..', 'messages.json');
const ACTION_ITEMS_FILE = path.join(__dirname, '..', 'action-items.json');
const WORKSPACE_DIR = path.join(__dirname, '..', '..');
const TODAY_FILE = path.join(__dirname, '..', '..', 'TODAY.md');

// Server config
const PORT = 8081;

// Gateway config
const GATEWAY_URL = `http://127.0.0.1:${config.gatewayPort}`;
const GATEWAY_TOKEN = config.gatewayToken;

// Agent session mapping
const agentSessions = {
  isla: "agent:isla:webchat:user",
  marcus: "agent:marcus:webchat:user",
  harper: "agent:harper:webchat:user",
  eli: "agent:eli:webchat:user",
  sage: "agent:sage:webchat:user",
  julie: "agent:julie:webchat:user",
  dash: "agent:dash:webchat:user",
  remy: "agent:remy:webchat:user",
  lena: "agent:lena:webchat:user",
  val: "agent:val:webchat:user"
};

// Agent channel names
const agentChannels = {
  isla: { name: "#hq" },
  marcus: { name: "#mhc" },
  harper: { name: "#qa" },
  eli: { name: "#cto-dev" },
  sage: { name: "#research" },
  julie: { name: "#marketing" },
  dash: { name: "#dash" },
  remy: { name: "#chef" },
  lena: { name: "#gym" },
  val: { name: "#finance" }
};

// Agent info for standup display
const agentInfo = {
  isla: { emoji: '🏝️', name: 'Isla' },
  marcus: { emoji: '🔧', name: 'Marcus' },
  julie: { emoji: '📣', name: 'Julie' },
  remy: { emoji: '🍳', name: 'Remy' },
  lena: { emoji: '💪', name: 'Lena' },
  harper: { emoji: '🔍', name: 'Harper' },
  sage: { emoji: '🔭', name: 'Sage' },
  val: { emoji: '💰', name: 'Val' },
  eli: { emoji: '🏗️', name: 'Eli' },
  dash: { emoji: '🎨', name: 'Dash' }
};

module.exports = {
  MEMORY_DIR,
  STATUS_FILE,
  INTERACTIONS_FILE,
  MESSAGES_FILE,
  ACTION_ITEMS_FILE,
  WORKSPACE_DIR,
  TODAY_FILE,
  PORT,
  GATEWAY_URL,
  GATEWAY_TOKEN,
  agentSessions,
  agentChannels,
  agentInfo
};
