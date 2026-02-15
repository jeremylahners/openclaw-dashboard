/**
 * Native Push Notifications Bridge (Capacitor)
 * Bridges Capacitor Push Notifications with Office Dashboard backend
 */

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

const API_BASE = window.location.origin;

/**
 * Initialize native push notifications
 */
export async function initNativePush() {
  // Only initialize on native platforms
  if (!Capacitor.isNativePlatform()) {
    console.log('[Native Push] Not a native platform, skipping');
    return false;
  }

  console.log('[Native Push] Initializing...');

  try {
    // Request permission
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('[Native Push] Permission denied');
      return false;
    }

    // Register for push notifications
    await PushNotifications.register();

    // Listen for registration success
    await PushNotifications.addListener('registration', async (token) => {
      console.log('[Native Push] Registration success:', token.value);
      
      // Send token to backend
      try {
        const response = await fetch(`${API_BASE}/api/push/subscribe-native`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: token.value,
            platform: Capacitor.getPlatform()
          })
        });

        const result = await response.json();
        if (result.ok) {
          console.log('[Native Push] Token registered with backend');
        } else {
          console.error('[Native Push] Backend registration failed:', result);
        }
      } catch (err) {
        console.error('[Native Push] Error sending token to backend:', err);
      }
    });

    // Listen for registration errors
    await PushNotifications.addListener('registrationError', (error) => {
      console.error('[Native Push] Registration error:', error);
    });

    // Listen for push notifications received
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Native Push] Notification received:', notification);
      
      // Show local notification if app is in foreground
      // The system automatically shows it if app is in background
    });

    // Listen for notification taps
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[Native Push] Notification action:', action);
      
      const data = action.notification.data;
      
      // Navigate to agent chat if agentKey is provided
      if (data.agentKey && typeof window.loadAgentChat === 'function') {
        window.loadAgentChat(data.agentKey);
      }
    });

    console.log('[Native Push] Initialized successfully');
    return true;

  } catch (error) {
    console.error('[Native Push] Initialization failed:', error);
    return false;
  }
}

/**
 * Unregister from push notifications
 */
export async function unregisterNativePush() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await PushNotifications.removeAllListeners();
    console.log('[Native Push] Unregistered');
  } catch (error) {
    console.error('[Native Push] Unregister error:', error);
  }
}

/**
 * Get current push notification status
 */
export async function getNativePushStatus() {
  if (!Capacitor.isNativePlatform()) {
    return { available: false, platform: 'web' };
  }

  try {
    const permStatus = await PushNotifications.checkPermissions();
    return {
      available: true,
      platform: Capacitor.getPlatform(),
      permission: permStatus.receive
    };
  } catch (error) {
    console.error('[Native Push] Status check error:', error);
    return { available: false, error: error.message };
  }
}
