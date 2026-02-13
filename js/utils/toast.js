/**
 * Toast Notification System
 * Simple, lightweight toast notifications for user feedback
 */

class ToastManager {
  constructor() {
    this.container = null;
    this.queue = [];
    this.ready = false;
    this.init();
  }

  init() {
    // Wait for DOM to be ready before creating container
    if (document.body) {
      this.createContainer();
    } else {
      document.addEventListener('DOMContentLoaded', () => this.createContainer());
    }
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
    this.ready = true;

    // Process any queued toasts
    this.queue.forEach(({ message, type, duration }) => {
      this.show(message, type, duration);
    });
    this.queue = [];
  }

  /**
   * Show a toast notification
   * @param {string} message - Message to display
   * @param {string} type - Type: 'success', 'error', 'warning', 'info'
   * @param {number} duration - Duration in ms (default: 3000)
   */
  show(message, type = 'info', duration = 3000) {
    // Queue if not ready
    if (!this.ready) {
      this.queue.push({ message, type, duration });
      return null;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Icon based on type
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ'}</span>
      <span class="toast-message">${this.escapeHtml(message)}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    this.container.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('toast-show'), 10);
    
    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => this.dismiss(toast), duration);
    }
    
    return toast;
  }

  dismiss(toast) {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 300);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Convenience methods
  success(message, duration = 3000) {
    return this.show(message, 'success', duration);
  }

  error(message, duration = 5000) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration = 4000) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration = 3000) {
    return this.show(message, 'info', duration);
  }
}

// Global toast instance - initialize immediately
window.toast = new ToastManager();

// Global helper function for backwards compatibility
window.showToast = function(message, type = 'info', duration = 3000) {
  return window.toast.show(message, type, duration);
};
