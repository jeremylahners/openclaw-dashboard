import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.join(__dirname, '__tests__', 'screenshots');

async function main() {
  const browser = await chromium.launch({ headless: true });
  
  // iPad Portrait (768x1024)
  console.log('=== iPad Portrait (768x1024) ===');
  const ipadPortrait = await browser.newPage({ viewport: { width: 768, height: 1024 } });
  await ipadPortrait.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await ipadPortrait.waitForTimeout(2000);
  await ipadPortrait.screenshot({ path: path.join(screenshotDir, '01-ipad-portrait-full.png'), fullPage: true });
  
  // Focus on office zones
  const officeElP = await ipadPortrait.$('.office');
  if (officeElP) {
    await officeElP.screenshot({ path: path.join(screenshotDir, '02-ipad-portrait-office.png') });
  }
  await ipadPortrait.close();

  // iPad Landscape (1024x768)
  console.log('=== iPad Landscape (1024x768) ===');
  const ipadLandscape = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await ipadLandscape.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await ipadLandscape.waitForTimeout(2000);
  await ipadLandscape.screenshot({ path: path.join(screenshotDir, '03-ipad-landscape-full.png'), fullPage: true });
  
  const officeElL = await ipadLandscape.$('.office');
  if (officeElL) {
    await officeElL.screenshot({ path: path.join(screenshotDir, '04-ipad-landscape-office.png') });
  }
  await ipadLandscape.close();

  // Desktop (1280x800)
  console.log('=== Desktop (1280x800) ===');
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await desktop.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await desktop.waitForTimeout(2000);
  await desktop.screenshot({ path: path.join(screenshotDir, '05-desktop-full.png'), fullPage: true });
  
  const officeElD = await desktop.$('.office');
  if (officeElD) {
    await officeElD.screenshot({ path: path.join(screenshotDir, '06-desktop-office.png') });
  }

  // Now test chat - click on an agent to open chat panel
  // Find an agent element and click it
  const agentEl = await desktop.$('.agent');
  if (agentEl) {
    await agentEl.click();
    await desktop.waitForTimeout(1500);
    await desktop.screenshot({ path: path.join(screenshotDir, '07-desktop-chat-open.png'), fullPage: true });
    
    // Screenshot just the chat messages area
    const chatEl = await desktop.$('.chat-messages');
    if (chatEl) {
      await chatEl.screenshot({ path: path.join(screenshotDir, '08-desktop-chat-messages.png') });
    }
    
    // Look for agent-comms-group elements
    const commsGroups = await desktop.$$('.agent-comms-group');
    console.log(`Found ${commsGroups.length} agent-comms-group elements`);
    
    for (let i = 0; i < commsGroups.length; i++) {
      const box = await commsGroups[i].boundingBox();
      console.log(`Comms group ${i}: `, box);
      await commsGroups[i].screenshot({ path: path.join(screenshotDir, `09-comms-group-${i}.png`) });
    }
    
    // Check computed styles of agent-comms-group if any exist
    if (commsGroups.length > 0) {
      const styles = await desktop.evaluate(() => {
        const el = document.querySelector('.agent-comms-group');
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          display: cs.display,
          width: cs.width,
          height: cs.height,
          overflow: cs.overflow,
          visibility: cs.visibility,
          opacity: cs.opacity,
          border: cs.border,
          maxWidth: cs.maxWidth,
          maxHeight: cs.maxHeight,
          minHeight: cs.minHeight,
        };
      });
      console.log('Comms group computed styles:', styles);
    }
  }

  // Also check iPad portrait with chat open
  console.log('=== iPad Portrait with Chat ===');
  const ipadChat = await browser.newPage({ viewport: { width: 768, height: 1024 } });
  await ipadChat.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await ipadChat.waitForTimeout(2000);
  
  // On iPad, office might be hidden and chat shown - check
  const officeVisible = await ipadChat.evaluate(() => {
    const oc = document.querySelector('.office-container');
    return oc ? getComputedStyle(oc).display : 'not found';
  });
  console.log('Office container display on iPad:', officeVisible);
  
  const chatPanelVisible = await ipadChat.evaluate(() => {
    const rp = document.querySelector('.right-panel');
    return rp ? getComputedStyle(rp).display : 'not found';
  });
  console.log('Chat panel display on iPad:', chatPanelVisible);
  
  // Get zone positions
  const zonePositions = await ipadChat.evaluate(() => {
    const zones = ['desks', 'conference', 'kitchen', 'finance-corner', 'adventure-corner', 'isla-desk'];
    const results = {};
    for (const z of zones) {
      const el = document.querySelector(`.zone.${z}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        results[z] = { top: rect.top, left: rect.left, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right };
      }
    }
    return results;
  });
  console.log('Zone positions on iPad portrait:');
  console.log(JSON.stringify(zonePositions, null, 2));
  
  // Check for overlaps
  const zoneNames = Object.keys(zonePositions);
  for (let i = 0; i < zoneNames.length; i++) {
    for (let j = i + 1; j < zoneNames.length; j++) {
      const a = zonePositions[zoneNames[i]];
      const b = zonePositions[zoneNames[j]];
      if (a && b) {
        const overlap = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        if (overlap) {
          console.log(`⚠️ OVERLAP: ${zoneNames[i]} overlaps with ${zoneNames[j]}`);
        }
      }
    }
  }

  await ipadChat.close();
  await browser.close();
  console.log('\n✅ Screenshots saved to', screenshotDir);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
