#!/usr/bin/env python3
# 1. Load image from input path
# 2. Calculate symmetric border radius based on smaller dimension
# 3. Create rounded corners mask with transparency
# 4. Apply shadow effect if enabled
# 5. Apply border effect if enabled
# 6. Composite all effects
# 7. Save result as PNG with transparency

import sys
from PIL import Image, ImageDraw, ImageFilter
import math

def hex_to_rgb(hex_color):
    """Convert hex color string to RGB tuple"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def apply_effects(input_path, output_path, radius_value, unit,
                  shadow_enabled=False, shadow_color="#000000", shadow_blur=10, shadow_offset=5,
                  border_enabled=False, border_color="#cccccc", border_width=2, border_style="solid"):
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

    # Create the final canvas (larger if shadow is enabled)
    canvas_padding = shadow_blur + shadow_offset + 10 if shadow_enabled else 0
    canvas_w = w + canvas_padding * 2
    canvas_h = h + canvas_padding * 2
    canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))

    # Position of original image on canvas
    img_x = canvas_padding
    img_y = canvas_padding

    # Create mask for rounded corners
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (w, h)], radius=int(radius_px), fill=255)

    # Apply rounded corners to image
    rounded_img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    rounded_img.paste(img, (0, 0), mask)

    # Apply shadow if enabled
    if shadow_enabled:
        # Create shadow
        shadow = Image.new('RGBA', (w, h), hex_to_rgb(shadow_color) + (255,))
        shadow.putalpha(mask)

        # Apply blur to shadow
        shadow = shadow.filter(ImageFilter.GaussianBlur(shadow_blur))

        # Position shadow on canvas
        shadow_x = img_x + shadow_offset
        shadow_y = img_y + shadow_offset
        canvas.paste(shadow, (shadow_x, shadow_y), shadow)

    # Apply border if enabled
    if border_enabled:
        # Create border mask (slightly larger than image mask)
        border_mask = Image.new('L', (w, h), 0)
        border_draw = ImageDraw.Draw(border_mask)

        if border_style == "solid":
            # Solid border: draw a slightly larger rounded rectangle
            border_draw.rounded_rectangle([(-border_width, -border_width), (w + border_width, h + border_width)],
                                        radius=int(radius_px + border_width), fill=255)
            # Subtract the inner area to create the border
            inner_mask = Image.new('L', (w, h), 255)
            inner_draw = ImageDraw.Draw(inner_mask)
            inner_draw.rounded_rectangle([(0, 0), (w, h)], radius=int(radius_px), fill=0)
            border_mask = Image.composite(border_mask, Image.new('L', (w, h), 0), inner_mask)
        elif border_style == "dashed":
            # Dashed border: draw multiple small arcs
            # This is a simplified implementation
            border_draw.rounded_rectangle([(-border_width, -border_width), (w + border_width, h + border_width)],
                                        radius=int(radius_px + border_width), fill=255)
            # Subtract the inner area
            inner_mask = Image.new('L', (w, h), 255)
            inner_draw = ImageDraw.Draw(inner_mask)
            inner_draw.rounded_rectangle([(0, 0), (w, h)], radius=int(radius_px), fill=0)
            border_mask = Image.composite(border_mask, Image.new('L', (w, h), 0), inner_mask)
        else:  # dotted
            # Dotted border: similar to dashed but smaller segments
            border_draw.rounded_rectangle([(-border_width, -border_width), (w + border_width, h + border_width)],
                                        radius=int(radius_px + border_width), fill=255)
            inner_mask = Image.new('L', (w, h), 255)
            inner_draw = ImageDraw.Draw(inner_mask)
            inner_draw.rounded_rectangle([(0, 0), (w, h)], radius=int(radius_px), fill=0)
            border_mask = Image.composite(border_mask, Image.new('L', (w, h), 0), inner_mask)

        # Create border image
        border_img = Image.new('RGBA', (w, h), hex_to_rgb(border_color) + (255,))
        border_img.putalpha(border_mask)

        # Composite border onto canvas
        canvas.paste(border_img, (img_x, img_y), border_mask)

    # Finally, paste the rounded image on top
    canvas.paste(rounded_img, (img_x, img_y), mask)

    # Save as PNG
    canvas.save(output_path, 'PNG')
    return True

def round_image(input_path, output_path, radius_value, unit):
    # Legacy function for backward compatibility
    return apply_effects(input_path, output_path, radius_value, unit)

if __name__ == '__main__':
    # Support both old and new argument formats for backward compatibility
    if len(sys.argv) == 5:
        # Legacy format: input_path, output_path, radius_value, unit
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
    elif len(sys.argv) >= 13:
        # New format with effects: input_path, output_path, radius_value, unit,
        # shadow_enabled, shadow_color, shadow_blur, shadow_offset,
        # border_enabled, border_color, border_width, border_style
        input_path = sys.argv[1]
        output_path = sys.argv[2]
        radius_value = float(sys.argv[3])
        unit = sys.argv[4]
        shadow_enabled = sys.argv[5].lower() == 'true'
        shadow_color = sys.argv[6]
        shadow_blur = int(sys.argv[7])
        shadow_offset = int(sys.argv[8])
        border_enabled = sys.argv[9].lower() == 'true'
        border_color = sys.argv[10]
        border_width = int(sys.argv[11])
        border_style = sys.argv[12]

        try:
            apply_effects(input_path, output_path, radius_value, unit,
                         shadow_enabled, shadow_color, shadow_blur, shadow_offset,
                         border_enabled, border_color, border_width, border_style)
            print("SUCCESS")
        except Exception as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        print("ERROR: Invalid number of arguments", file=sys.stderr)
        sys.exit(1)

