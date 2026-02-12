// OpenClaw Dashboard - Files Routes
const fs = require('fs');
const path = require('path');
const { WORKSPACE_DIR } = require('../lib/server-config.js');

// Recursively scan directories
function scanDirectory(dir, relativePath = '') {
  const items = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(relativePath, entry.name);
    
    // Skip hidden files/folders, node_modules, office folder, code repos, and internal agent files
    if (entry.name.startsWith('.') || 
        entry.name === 'node_modules' || 
        entry.name === 'office' ||
        entry.name === 'myHealthCopilot' ||
        entry.name === 'team' ||
        entry.name === 'memory') {
      continue;
    }
    
    // Skip root-level config files (agent internals)
    if (relativePath === '' && entry.isFile() && 
        (entry.name.endsWith('.md') || entry.name.endsWith('.html'))) {
      continue;
    }
    
    if (entry.isDirectory()) {
      // Recursively scan subdirectories
      const children = scanDirectory(fullPath, relPath);
      if (children.length > 0) {
        items.push({
          type: 'folder',
          name: entry.name,
          path: relPath,
          children: children
        });
      }
    } else if (entry.isFile()) {
      // Only include markdown, text, html files
      if (entry.name.endsWith('.md') || entry.name.endsWith('.txt') || entry.name.endsWith('.html')) {
        const stats = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const preview = lines.slice(0, 3).join('\n').substring(0, 150);
        
        items.push({
          type: 'file',
          name: entry.name,
          path: relPath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          modifiedFormatted: stats.mtime.toLocaleString('en-US', { 
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
          }),
          preview: preview + (content.length > 150 ? '...' : '')
        });
      }
    }
  }
  
  // Sort: folders first, then by name
  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// Handle routes
function handleFilesRoutes(req, res, url, method) {
  // List files
  if (url === '/files') {
    try {
      const tree = scanDirectory(WORKSPACE_DIR);
      res.end(JSON.stringify({ ok: true, tree }));
    } catch (e) {
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return true;
  }
  
  // Get file content
  if (url.startsWith('/file/') && method === 'GET') {
    const filePath = url.replace('/file/', '');
    const fullPath = path.join(WORKSPACE_DIR, filePath);
    
    if (!fullPath.startsWith(WORKSPACE_DIR)) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: 'Access denied' }));
      return true;
    }
    
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      res.end(JSON.stringify({ ok: true, content, path: filePath }));
    } catch (e) {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'File not found' }));
    }
    return true;
  }
  
  return false;
}

module.exports = {
  handleFilesRoutes
};
