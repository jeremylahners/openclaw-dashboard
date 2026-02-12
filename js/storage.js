// OpenClaw Dashboard - Storage Utilities
// Handles localStorage operations for persistence

export const Storage = {
  // Message drafts
  getDrafts() {
    try {
      const stored = localStorage.getItem('messageDrafts');
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.error('Failed to load drafts:', e);
      return {};
    }
  },

  saveDrafts(drafts) {
    try {
      localStorage.setItem('messageDrafts', JSON.stringify(drafts));
    } catch (e) {
      console.error('Failed to save drafts:', e);
    }
  },

  // Side panel width
  getSidePanelWidth() {
    return localStorage.getItem('sidePanelWidth');
  },

  setSidePanelWidth(width) {
    localStorage.setItem('sidePanelWidth', width);
  },

  // Left panel active tab
  getLeftPanelTab() {
    return localStorage.getItem('leftPanelTab');
  },

  setLeftPanelTab(tab) {
    localStorage.setItem('leftPanelTab', tab);
  },

  // Folder collapse states
  getFolderStates() {
    const stored = localStorage.getItem('folderStates');
    return stored ? JSON.parse(stored) : {};
  },

  saveFolderState(folderPath, isCollapsed) {
    const states = this.getFolderStates();
    states[folderPath] = isCollapsed;
    localStorage.setItem('folderStates', JSON.stringify(states));
  },

  isFolderCollapsed(folderPath) {
    const states = this.getFolderStates();
    return states[folderPath] === true;
  }
};
