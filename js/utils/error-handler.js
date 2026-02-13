/**
 * Global Error Handler & Offline Detection
 * Handles errors gracefully and provides user feedback
 */

class ErrorHandler {
  constructor() {
    this.isOnline = navigator.onLine;
    this.retryAttempts = new Map(); // url -> attempt count
    this.maxRetries = 3;
    this.retryDelay = 1000; // ms

    this.init();
  }

  init() {
    // Online/offline detection
    window.addEventListener('online', () => {
      this.isOnline = true;
      toast.success('Connection restored');
      console.log('[ErrorHandler] Back online');
      
      // Trigger reconnection if needed
      if (window.gwConnect && typeof window.gwConnect === 'function') {
        setTimeout(() => window.gwConnect(), 500);
      }
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      toast.warning('You are offline', 0); // 0 = no auto-dismiss
      console.log('[ErrorHandler] Offline');
    });

    // Global error handler for unhandled errors
    window.addEventListener('error', (event) => {
      console.error('[ErrorHandler] Uncaught error:', event.error);
      this.handle(event.error, 'An unexpected error occurred');
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      console.error('[ErrorHandler] Unhandled rejection:', event.reason);
      this.handle(event.reason, 'Operation failed');
      event.preventDefault(); // Prevent console spam
    });
  }

  /**
   * Handle an error gracefully
   * @param {Error|string} error - The error
   * @param {string} userMessage - User-friendly message
   * @param {boolean} showToast - Whether to show toast (default: true)
   */
  handle(error, userMessage = null, showToast = true) {
    // Log for debugging
    console.error('[ErrorHandler]', error);

    // Determine user message
    let message = userMessage;
    if (!message) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        message = 'Network error - check your connection';
      } else if (error instanceof SyntaxError) {
        message = 'Invalid response from server';
      } else if (error.message) {
        message = error.message;
      } else {
        message = 'Something went wrong';
      }
    }

    // Show toast if requested
    if (showToast) {
      toast.error(message);
    }

    return message;
  }

  /**
   * Wrap a fetch call with error handling and retry logic
   * @param {string} url - URL to fetch
   * @param {object} options - Fetch options
   * @param {number} retries - Number of retries (default: 3)
   */
  async fetchWithRetry(url, options = {}, retries = this.maxRetries) {
    // Check if online
    if (!this.isOnline) {
      throw new Error('You are offline');
    }

    const attemptKey = `${options.method || 'GET'}_${url}`;
    const currentAttempt = this.retryAttempts.get(attemptKey) || 0;

    try {
      const response = await fetch(url, options);

      // Reset retry count on success
      this.retryAttempts.delete(attemptKey);

      // Check for HTTP errors
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Resource not found');
        } else if (response.status === 500) {
          throw new Error('Server error');
        } else if (response.status === 503) {
          throw new Error('Service unavailable');
        } else {
          throw new Error(`Request failed (${response.status})`);
        }
      }

      return response;
    } catch (error) {
      console.warn(`[ErrorHandler] Fetch attempt ${currentAttempt + 1}/${retries} failed:`, error.message);

      // Retry if not max retries
      if (currentAttempt < retries - 1) {
        this.retryAttempts.set(attemptKey, currentAttempt + 1);
        
        // Exponential backoff
        const delay = this.retryDelay * Math.pow(2, currentAttempt);
        console.log(`[ErrorHandler] Retrying in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchWithRetry(url, options, retries);
      }

      // Max retries reached
      this.retryAttempts.delete(attemptKey);
      throw error;
    }
  }

  /**
   * Wrap async function with error handling
   * @param {Function} fn - Async function to wrap
   * @param {string} errorMessage - Custom error message
   */
  async wrap(fn, errorMessage = null) {
    try {
      return await fn();
    } catch (error) {
      this.handle(error, errorMessage);
      throw error;
    }
  }

  /**
   * Safe JSON parse with error handling
   * @param {string} text - JSON string
   * @param {any} defaultValue - Default value if parse fails
   */
  parseJSON(text, defaultValue = null) {
    try {
      return JSON.parse(text);
    } catch (error) {
      console.warn('[ErrorHandler] JSON parse failed:', error.message);
      return defaultValue;
    }
  }
}

// Global error handler instance
window.errorHandler = new ErrorHandler();

// Convenience wrapper for fetch
window.safeFetch = (url, options) => errorHandler.fetchWithRetry(url, options);
