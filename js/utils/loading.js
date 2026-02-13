/**
 * Loading State Manager
 * Handles loading spinners and disabled states
 */

class LoadingManager {
  constructor() {
    this.activeLoaders = new Set();
  }

  /**
   * Show loading spinner in element
   * @param {string|HTMLElement} target - Element ID or element
   * @param {string} message - Optional loading message
   */
  show(target, message = 'Loading...') {
    const element = typeof target === 'string' ? document.getElementById(target) : target;
    if (!element) return null;

    const loaderId = `loader-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const loader = document.createElement('div');
    loader.className = 'loading-overlay';
    loader.id = loaderId;
    loader.innerHTML = `
      <div class="loading-spinner"></div>
      ${message ? `<div class="loading-message">${this.escapeHtml(message)}</div>` : ''}
    `;

    // Make parent position relative if it isn't already
    const position = window.getComputedStyle(element).position;
    if (position === 'static') {
      element.style.position = 'relative';
    }

    element.appendChild(loader);
    this.activeLoaders.add(loaderId);

    return loaderId;
  }

  /**
   * Hide loading spinner
   * @param {string} loaderId - Loader ID returned from show()
   */
  hide(loaderId) {
    if (!loaderId) return;
    
    const loader = document.getElementById(loaderId);
    if (loader) {
      loader.classList.add('loading-hide');
      setTimeout(() => {
        loader.remove();
        this.activeLoaders.delete(loaderId);
      }, 200);
    }
  }

  /**
   * Show inline spinner (doesn't overlay, just inserts)
   * @param {string|HTMLElement} target - Element ID or element
   */
  showInline(target) {
    const element = typeof target === 'string' ? document.getElementById(target) : target;
    if (!element) return null;

    const spinner = document.createElement('span');
    spinner.className = 'loading-spinner-inline';
    spinner.innerHTML = '<div class="spinner-dot"></div><div class="spinner-dot"></div><div class="spinner-dot"></div>';
    
    element.appendChild(spinner);
    return spinner;
  }

  /**
   * Disable element while loading
   * @param {string|HTMLElement} target - Element ID or element
   */
  disable(target) {
    const element = typeof target === 'string' ? document.getElementById(target) : target;
    if (!element) return;

    element.disabled = true;
    element.classList.add('loading-disabled');
  }

  /**
   * Re-enable element after loading
   * @param {string|HTMLElement} target - Element ID or element
   */
  enable(target) {
    const element = typeof target === 'string' ? document.getElementById(target) : target;
    if (!element) return;

    element.disabled = false;
    element.classList.remove('loading-disabled');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Async wrapper that shows/hides loading automatically
   * @param {string|HTMLElement} target - Element to show loading on
   * @param {Function} asyncFn - Async function to execute
   * @param {string} message - Optional loading message
   */
  async wrap(target, asyncFn, message) {
    const loaderId = this.show(target, message);
    try {
      return await asyncFn();
    } finally {
      this.hide(loaderId);
    }
  }
}

// Global loading instance
window.loading = new LoadingManager();
