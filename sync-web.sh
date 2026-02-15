#!/bin/bash
# Sync web files to Capacitor www/ directory

echo "🔄 Syncing web files to www/..."

# Create www if it doesn't exist
mkdir -p www

# Copy essential files
cp index.html www/
cp manifest.json www/
cp service-worker.js www/
cp config.js www/

# Copy directories
cp -r css www/
cp -r js www/
cp -r icons www/

echo "✅ Web files synced to www/"
echo "📱 Run 'npx cap sync ios' to update native project"
