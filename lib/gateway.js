// OpenClaw Dashboard - Gateway Communication
const { GATEWAY_URL, GATEWAY_TOKEN } = require('./config.js');

// Call Gateway API
async function gatewayCall(tool, args) {
  try {
    const response = await fetch(`${GATEWAY_URL}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tool, args })
    });
    return await response.json();
  } catch (e) {
    console.error('Gateway call failed:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  gatewayCall
};
