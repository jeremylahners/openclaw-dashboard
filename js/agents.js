// OpenClaw Dashboard - Agent Data & Movement
// Handles agent positions, movements, and data

// Agent greetings
export const agentGreetings = {
  isla: "Hey! What can I help you with?",
  marcus: "What's up? Got a PR for me to look at?",
  harper: "Testing something right now, but I can chat. What's up?",
  eli: "Thinking about patterns. What do you need?",
  sage: "Just found something interesting. What's on your mind?",
  julie: "Hey! Working on some copy. What do you need?",
  dash: "Building something cool. Want to see what I'm working on?",
  remy: "Kitchen's open. What can I help with?",
  lena: "Ready when you are. What's up?",
  val: "Numbers looking good. What do you need?"
};

// Agent channel names
export const agentChannels = {
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

// Agent default positions (for returning after interaction)
export const defaultPositions = {
  marcus: { top: 50, left: 40 },
  harper: { top: 50, left: 160 },
  eli: { top: 50, left: 280 },
  sage: { top: 50, left: 400 },
  dash: { top: 170, left: 40 },
  julie: { top: 170, left: 220 },
  remy: { top: 60, right: 100 },
  lena: { top: 140, right: 100 },
  val: { top: 270, right: 100 },
  isla: { bottom: 35 }
};

// Conference table seats (positions around the table)
export const conferenceSeats = [
  { top: 350, left: 120 },
  { top: 350, left: 220 },
  { top: 350, left: 320 },
  { top: 350, left: 420 },
  { top: 430, left: 120 },
  { top: 430, left: 220 },
  { top: 430, left: 320 },
  { top: 430, left: 420 },
];

// All agent keys
export const allAgentKeys = ['isla', 'marcus', 'harper', 'eli', 'sage', 'dash', 'julie', 'remy', 'lena', 'val'];

// Movement state
let seatAssignments = {};
let movedAgents = new Set();
let currentMeeting = null;
let activeNotification = null;

// Show a brief toast notification
export function showMovementNotification(text) {
  if (activeNotification) activeNotification.remove();
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:80px;right:20px;background:rgba(14,165,233,0.95);color:#fff;padding:12px 20px;border-radius:8px;font-size:0.85rem;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:200;opacity:0;transition:opacity 0.3s;';
  el.textContent = text;
  document.body.appendChild(el);
  activeNotification = el;
  requestAnimationFrame(() => el.style.opacity = '1');
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => { el.remove(); if (activeNotification === el) activeNotification = null; }, 300);
  }, 3000);
}

// Move agent to a position (CSS transition handles the walk)
export function moveAgent(agentKey, position) {
  const el = document.querySelector(`.agent.${agentKey}`);
  if (!el) return;
  el.style.transform = 'none';
  if (position.left !== undefined) { el.style.left = position.left + 'px'; el.style.right = 'auto'; }
  if (position.right !== undefined) { el.style.right = position.right + 'px'; el.style.left = 'auto'; }
  if (position.top !== undefined) { el.style.top = position.top + 'px'; el.style.bottom = 'auto'; }
  if (position.bottom !== undefined) { el.style.bottom = position.bottom + 'px'; el.style.top = 'auto'; }
}

// Return agent to their default desk
export function returnToDesk(agentKey) {
  const el = document.querySelector(`.agent.${agentKey}`);
  if (!el) return;
  el.style.removeProperty('left');
  el.style.removeProperty('right');
  el.style.removeProperty('top');
  el.style.removeProperty('bottom');
  el.style.removeProperty('transform');
  delete seatAssignments[agentKey];
  movedAgents.delete(agentKey);
}

// Walk one agent over to another agent's desk
export function walkAgentTo(fromAgent, toAgent) {
  if (movedAgents.has(fromAgent)) return;
  const toPos = defaultPositions[toAgent];
  if (!toPos) return;
  const dest = {};
  if (toPos.left !== undefined) { dest.top = toPos.top; dest.left = toPos.left + 80; }
  else if (toPos.right !== undefined) { dest.top = toPos.top; dest.right = toPos.right + 80; }
  else { dest.bottom = (toPos.bottom || 35) + 60; dest.left = 280; }
  moveAgent(fromAgent, dest);
  movedAgents.add(fromAgent);
  const fromName = fromAgent.charAt(0).toUpperCase() + fromAgent.slice(1);
  const toName = toAgent.charAt(0).toUpperCase() + toAgent.slice(1);
  showMovementNotification(`${fromName} walked over to ${toName}'s desk`);
}

// One agent walks to the other's desk for a chat
export function moveForChat(agentA, agentB) {
  if (movedAgents.has(agentA)) return;
  walkAgentTo(agentA, agentB);
}

// Start a meeting - move everyone to conference
export function startMeeting(meetingType) {
  currentMeeting = meetingType;
  allAgentKeys.forEach((agent, idx) => {
    if (idx < conferenceSeats.length) {
      moveAgent(agent, conferenceSeats[idx]);
      seatAssignments[agent] = idx;
      movedAgents.add(agent);
    }
  });
}

// End meeting - everyone returns to desks
export function endMeeting() {
  currentMeeting = null;
  allAgentKeys.forEach(returnToDesk);
}

// Check if in meeting
export function isInMeeting() {
  return currentMeeting !== null;
}

// Get moved agents set
export function getMovedAgents() {
  return movedAgents;
}

// Poll-driven animation
export function animateAgentMovement(interactions) {
  if (currentMeeting) return;
  const interacting = new Set();
  for (const i of interactions) {
    interacting.add(i.from);
    interacting.add(i.to);
  }
  const handled = new Set();
  for (const i of interactions) {
    if (handled.has(i.from) || handled.has(i.to)) continue;
    moveForChat(i.from, i.to);
    handled.add(i.from);
    handled.add(i.to);
  }
  for (const agent of movedAgents) {
    if (!interacting.has(agent)) returnToDesk(agent);
  }
}

// Update status indicators
export function updateStatusIndicators(statuses) {
  for (const [agentKey, status] of Object.entries(statuses)) {
    const agentEl = document.querySelector(`.agent.${agentKey}`);
    if (!agentEl) continue;
    
    const statusDot = agentEl.querySelector('.status-dot');
    const taskEl = agentEl.querySelector('.agent-task');
    
    if (statusDot) {
      statusDot.classList.remove('status-working', 'status-idle', 'status-thinking', 'status-meeting');
      switch (status.state) {
        case 'working':
          statusDot.classList.add('status-working');
          break;
        case 'thinking':
          statusDot.classList.add('status-thinking');
          break;
        case 'meeting':
          statusDot.classList.add('status-meeting');
          break;
        default:
          statusDot.classList.add('status-idle');
      }
    }
    
    if (taskEl && status.task) {
      taskEl.textContent = status.task;
    }
  }
}

// Parse natural language for movement commands
export function parseNaturalLanguage(text, currentAgent) {
  const lower = text.toLowerCase();
  const agentNames = allAgentKeys;
  
  // Meeting/standup triggers
  if (lower.match(/\b(standup|stand[\s-]?up|daily|meeting|gather|conference)\b/)) {
    if (lower.match(/\b(everyone|all|team|agents)\b/) || lower.includes('time')) {
      showMovementNotification('📅 Everyone is heading to the conference room...');
      startMeeting('standup');
      return { handled: true, silent: false };
    }
  }
  
  // End meeting triggers
  if (lower.match(/\b(back to|return to|end|dismiss|done)\b/) && lower.match(/\b(desk|desks|meeting)\b/)) {
    showMovementNotification('✅ Meeting ended - everyone returning to desks');
    endMeeting();
    return { handled: true, silent: false };
  }
  
  // Talk to / meet with / go see patterns
  const talkPatterns = [
    /\b(?:go\s+)?(?:talk|speak|chat|meet|ask)\s+(?:(?:to|with)\s+)?(\w+)/i,
    /\b(?:go\s+)?(?:see|visit|check in with|sync with)\s+(\w+)/i,
    /\b(?:walk|head|hop|swing)\s+(?:over\s+)?(?:to\s+)?(\w+)/i,
    /\bcoordinate\s+with\s+(\w+)/i,
    /\bdiscuss\s+(?:this\s+)?(?:with\s+)?(\w+)/i,
  ];
  
  for (const pattern of talkPatterns) {
    const match = text.match(pattern);
    if (match) {
      const targetAgent = match[1].toLowerCase();
      
      if (agentNames.includes(targetAgent) && targetAgent !== currentAgent) {
        const currentName = currentAgent.charAt(0).toUpperCase() + currentAgent.slice(1);
        const targetName = targetAgent.charAt(0).toUpperCase() + targetAgent.slice(1);
        showMovementNotification(`${currentName} is walking over to ${targetName}...`);
        
        moveForChat(currentAgent, targetAgent);
        
        setTimeout(() => {
          returnToDesk(currentAgent);
          showMovementNotification(`${currentName} returned to their desk`);
        }, 8000);
        return { handled: true, silent: false };
      }
    }
  }
  
  return { handled: false, silent: false };
}
