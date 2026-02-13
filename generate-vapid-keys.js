#!/usr/bin/env node

// Generate VAPID keys for web push notifications
// Run: node generate-vapid-keys.js

const webpush = require('web-push');

console.log('Generating VAPID keys for web push...\n');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('=== VAPID Keys Generated ===\n');
console.log('Public Key:');
console.log(vapidKeys.publicKey);
console.log('\nPrivate Key:');
console.log(vapidKeys.privateKey);
console.log('\n=== Instructions ===');
console.log('1. Add these to your .env file or config.js:');
console.log(`   VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
console.log(`   VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
console.log('\n2. The public key will be used in the frontend (index.html)');
console.log('3. Both keys will be used in the backend (gateway-api.js)');
console.log('\n⚠️  IMPORTANT: Keep the private key secret! Do not commit to git.');
console.log('\n✓ Done! Keys generated successfully.');
