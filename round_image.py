#!/usr/bin/env python3
# 1. Load image from input path
# 2. Calculate symmetric border radius based on smaller dimension
# 3. Create rounded corners mask with transparency
# 4. Apply mask to image
# 5. Save result as PNG with transparency

import sys
from PIL import Image, ImageDraw
import math

def round_image(input_path, output_path, radius_value, unit):
    # Load image
    img = Image.open(input_path).convert("RGBA")
    w, h = img.size
    
    # Calculate radius
    base_dimension = min(w, h)
    max_radius = base_dimension / 2
    
    if unit == 'percent':
        radius_px = (radius_value / 100) * base_dimension
    else:
        radius_px = radius_value
    
    radius_px = min(radius_px, max_radius)
    radius_px = max(0, radius_px)
    
    # Create mask with rounded corners
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    
    # Draw rounded rectangle
    draw.rounded_rectangle([(0, 0), (w, h)], radius=int(radius_px), fill=255)
    
    # Apply mask
    img.putalpha(mask)
    
    # Save as PNG
    img.save(output_path, 'PNG')
    return True

if __name__ == '__main__':
    if len(sys.argv) != 5:
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    radius_value = float(sys.argv[3])
    unit = sys.argv[4]
    
    try:
        round_image(input_path, output_path, radius_value, unit)
        print("SUCCESS")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

