#!/bin/bash

# Create simple placeholder icons for PWA
# Uses base64-encoded 1px PNGs that will be scaled by browsers

ICON_DIR="/Users/jeremylahners/.openclaw/workspace/office/icons"
mkdir -p "$ICON_DIR"

# Simple 1x1 blue pixel PNG (will be scaled up by browser)
# This is a valid PNG file encoded as base64
BLUE_PIXEL="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

# Create a simple script to generate colored PNGs
cat > "$ICON_DIR/generate.html" << 'EOF'
<!DOCTYPE html>
<html>
<head><title>Icon Generator</title></head>
<body>
<h1>Generating PWA Icons...</h1>
<canvas id="canvas"></canvas>
<div id="output"></div>
<script>
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const output = document.getElementById('output');

sizes.forEach(size => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Gradient background
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#0ea5e9');
  gradient.addColorStop(1, '#3b82f6');
  ctx.fillStyle = gradient;
  
  // Rounded rectangle
  const radius = size * 0.15;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();
  
  // Text
  ctx.fillStyle = 'white';
  ctx.font = `bold ${size * 0.4}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OC', size / 2, size / 2);
  
  // Download link
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `icon-${size}.png`;
    a.textContent = `Download icon-${size}.png`;
    a.style.display = 'block';
    a.style.margin = '10px';
    output.appendChild(a);
    
    // Auto-click to download
    // a.click();
  });
});

// Generate maskable icon
const canvas = document.createElement('canvas');
canvas.width = 512;
canvas.height = 512;
const ctx = canvas.getContext('2d');

const gradient = ctx.createLinearGradient(0, 0, 512, 512);
gradient.addColorStop(0, '#0ea5e9');
gradient.addColorStop(1, '#3b82f6');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, 512, 512);

ctx.fillStyle = 'white';
ctx.font = 'bold 200px sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('OC', 256, 256);

canvas.toBlob(blob => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'icon-512-maskable.png';
  a.textContent = 'Download icon-512-maskable.png';
  a.style.display = 'block';
  a.style.margin = '10px';
  a.style.fontWeight = 'bold';
  output.appendChild(a);
});

output.insertAdjacentHTML('afterbegin', '<p><strong>Instructions:</strong> Click each link below to download the icons. Save them to the icons/ folder.</p>');
</script>
</body>
</html>
EOF

echo "✅ Icon generator created at $ICON_DIR/generate.html"
echo "📝 Open it in a browser to download all icons:"
echo "   open $ICON_DIR/generate.html"
