#!/usr/bin/env python3
"""Extract CSS from index.html and organize into separate files."""

import re

# Read the HTML file
with open('index.html.backup', 'r') as f:
    content = f.read()

# Extract CSS between <style> and </style>
match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
if not match:
    print("No CSS found")
    exit(1)

css_content = match.group(1).strip()

# Split into sections based on comments and responsive breakpoints
lines = css_content.split('\n')

main_css = []
components_css = []
layout_css = []
responsive_css = []

current_section = main_css
in_responsive = False
responsive_buffer = []

for line in lines:
    stripped = line.strip()
    
    # Check for media queries
    if '@media' in stripped:
        in_responsive = True
        responsive_buffer = [line]
        continue
    
    if in_responsive:
        responsive_buffer.append(line)
        # Check if we've closed all braces in media query
        open_braces = ''.join(responsive_buffer).count('{')
        close_braces = ''.join(responsive_buffer).count('}')
        if open_braces > 0 and open_braces == close_braces:
            responsive_css.extend(responsive_buffer)
            responsive_css.append('')
            responsive_buffer = []
            in_responsive = False
        continue
    
    # Categorize based on selectors and comments
    if any(keyword in stripped.lower() for keyword in ['@keyframes', '* {', 'body {', ':root']):
        main_css.append(line)
    elif any(keyword in stripped.lower() for keyword in [
        '.agent', '.avatar', '.bubble', '.message', '.chat', '.panel', '.tab',
        '.button', '.btn', 'input', '.card', '.badge', '.status', '.mobile-nav',
        '.file-', '.folder-', '.priority-', '.standup-', '.action-item'
    ]):
        components_css.append(line)
    elif any(keyword in stripped.lower() for keyword in [
        '.office', '.zone', '.desk', '.conference', '.kitchen', 'h1 {', 'h2 {',
        '.left-info', '.side-panel', '.resize'
    ]):
        layout_css.append(line)
    else:
        # Default to components for most CSS
        components_css.append(line)

# Write CSS files
with open('css/main.css', 'w') as f:
    f.write('/* Base Styles & Variables */\n\n')
    f.write('\n'.join(main_css))

with open('css/components.css', 'w') as f:
    f.write('/* UI Components */\n\n')
    f.write('\n'.join(components_css))

with open('css/layout.css', 'w') as f:
    f.write('/* Layout & Structure */\n\n')
    f.write('\n'.join(layout_css))

with open('css/responsive.css', 'w') as f:
    f.write('/* Responsive Design - Tablet & Mobile */\n\n')
    f.write('\n'.join(responsive_css))

print("✅ CSS extracted to css/ directory")
print(f"  - main.css: {len(main_css)} lines")
print(f"  - components.css: {len(components_css)} lines") 
print(f"  - layout.css: {len(layout_css)} lines")
print(f"  - responsive.css: {len(responsive_css)} lines")
