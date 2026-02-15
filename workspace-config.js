// workspace-config.js — Single source of truth for workspace configuration
// Reads workspace.config.json, validates it, and derives runtime values.

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'workspace.config.json');
const EXAMPLE_PATH = path.join(__dirname, 'workspace.config.example.json');
const RUNTIME_TABS_PATH = path.join(__dirname, 'runtime-tabs.json');

function loadConfig() {
  let raw;
  let usingExample = false;

  if (fs.existsSync(CONFIG_PATH)) {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } else if (fs.existsSync(EXAMPLE_PATH)) {
    console.warn('⚠️  workspace.config.json not found — using example config');
    raw = JSON.parse(fs.readFileSync(EXAMPLE_PATH, 'utf-8'));
    usingExample = true;
  } else {
    throw new Error('No workspace.config.json or workspace.config.example.json found');
  }

  validate(raw);

  const workspaceRoot = path.resolve(__dirname, raw.workspace?.root || '..');

  // Derive agent sessions and channels
  const agentKeys = Object.keys(raw.agents);
  const agentSessions = {};
  const agentChannels = {};
  for (const key of agentKeys) {
    agentSessions[key] = `agent:${key}:webchat:user`;
    agentChannels[key] = { name: raw.agents[key].channel || `#${key}` };
  }

  // Reverse lookup: session key -> agent name
  const sessionToAgent = {};
  for (const [agent, session] of Object.entries(agentSessions)) {
    sessionToAgent[session] = agent;
  }

  // Derived paths
  const paths = {
    workspaceRoot,
    memoryDir: path.join(workspaceRoot, 'memory', 'agents'),
    statusFile: path.join(workspaceRoot, 'memory', 'agent-status.json'),
    interactionsFile: path.join(workspaceRoot, 'memory', 'agent-interactions.json'),
    agentFilesDir: path.join(workspaceRoot, 'files', 'agents'),
    todayFile: path.join(workspaceRoot, 'TODAY.md'),
  };

  // Load runtime tabs
  let runtimeTabs = {};
  if (fs.existsSync(RUNTIME_TABS_PATH)) {
    try {
      runtimeTabs = JSON.parse(fs.readFileSync(RUNTIME_TABS_PATH, 'utf-8'));
    } catch (e) {
      console.warn('⚠️  Failed to load runtime-tabs.json:', e.message);
    }
  }

  return {
    raw,
    usingExample,
    branding: raw.branding,
    owner: raw.owner,
    agents: raw.agents,
    agentKeys,
    agentSessions,
    agentChannels,
    sessionToAgent,
    paths,
    runtimeTabs,
    runtimeTabsPath: RUNTIME_TABS_PATH,
  };
}

function validate(config) {
  if (!config.version || config.version !== 1) {
    throw new Error('workspace.config.json: missing or unsupported version (expected 1)');
  }
  if (!config.branding?.name) {
    throw new Error('workspace.config.json: branding.name is required');
  }
  if (!config.owner?.name) {
    throw new Error('workspace.config.json: owner.name is required');
  }
  if (!config.agents || typeof config.agents !== 'object') {
    throw new Error('workspace.config.json: agents object is required');
  }
  const keys = Object.keys(config.agents);
  if (keys.length === 0) {
    throw new Error('workspace.config.json: at least one agent is required');
  }
  for (const key of keys) {
    const agent = config.agents[key];
    if (!agent.name) throw new Error(`workspace.config.json: agents.${key}.name is required`);
    if (!agent.role) throw new Error(`workspace.config.json: agents.${key}.role is required`);
    if (!agent.emoji) throw new Error(`workspace.config.json: agents.${key}.emoji is required`);
  }
}

// Build the frontend-safe config (excludes filesystem paths, tokens, etc.)
function buildFrontendConfig(wsConfig, vapidPublicKey) {
  const agents = {};
  for (const [key, agent] of Object.entries(wsConfig.agents)) {
    agents[key] = {
      name: agent.name,
      fullName: agent.fullName || agent.name,
      role: agent.role,
      emoji: agent.emoji,
      channel: agent.channel || `#${key}`,
      quote: agent.quote || '',
      greeting: agent.greeting || '',
      color: agent.color || null,
      tabs: agent.tabs || [],
    };
  }

  return {
    branding: wsConfig.branding,
    owner: wsConfig.owner,
    agents,
    runtimeTabs: wsConfig.runtimeTabs || {},
    vapidPublicKey: vapidPublicKey || null,
  };
}

module.exports = { loadConfig, buildFrontendConfig };
