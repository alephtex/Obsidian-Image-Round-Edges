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

    # Create the final canvas (larger if shadow or border is enabled)
    shadow_padding = shadow_blur + shadow_offset + 10 if shadow_enabled else 0
    border_padding = border_width if border_enabled else 0
    canvas_padding = shadow_padding + border_padding
    canvas_w = w + canvas_padding * 2
    canvas_h = h + canvas_padding * 2
    canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))

    # Position of original image on canvas (centered with padding)
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

        # Position shadow on canvas (accounting for border padding)
        shadow_x = img_x + shadow_offset
        shadow_y = img_y + shadow_offset
        canvas.paste(shadow, (shadow_x, shadow_y), shadow)

    # First, paste the rounded image
    canvas.paste(rounded_img, (img_x, img_y), mask)

    # Apply border AFTER rounding if enabled (so it appears outside the rounded corners)
    if border_enabled:
        # Create border on the full canvas size
        border_canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        border_draw = ImageDraw.Draw(border_canvas)

        # Calculate border position (outside the rounded image area)
        border_x = img_x - border_width
        border_y = img_y - border_width
        border_w = w + border_width * 2
        border_h = h + border_width * 2

        # Draw the outer border shape (larger rounded rectangle)
        if border_style == "solid":
            border_draw.rounded_rectangle([border_x, border_y, border_x + border_w, border_y + border_h],
                                        radius=int(radius_px + border_width), fill=hex_to_rgb(border_color) + (255,))
        elif border_style == "dashed":
            # For dashed, we'll draw multiple rounded rectangles with gaps
            # This is a simplified dashed implementation
            dash_length = border_width * 3
            gap_length = border_width * 2
            for i in range(0, int(border_w + border_h), dash_length + gap_length):
                # Draw dashes along the perimeter (simplified)
                if i < border_w:
                    # Top dash
                    border_draw.rounded_rectangle([border_x + i, border_y, border_x + min(i + dash_length, border_w), border_y + border_width],
                                                radius=max(0, int(radius_px + border_width) - i) if i < radius_px + border_width else 0,
                                                fill=hex_to_rgb(border_color) + (255,))
                # Add more complex dashed logic for full perimeter if needed
        else:  # dotted - similar to dashed but smaller
            dot_length = border_width
            gap_length = border_width * 2
            for i in range(0, int(border_w + border_h), dot_length + gap_length):
                if i < border_w:
                    border_draw.rounded_rectangle([border_x + i, border_y, border_x + min(i + dot_length, border_w), border_y + border_width],
                                                radius=max(0, int(radius_px + border_width) - i) if i < radius_px + border_width else 0,
                                                fill=hex_to_rgb(border_color) + (255,))

        # Create mask for the inner area (where the rounded image is) to cut out from border
        inner_mask = Image.new('L', (canvas_w, canvas_h), 0)
        inner_draw = ImageDraw.Draw(inner_mask)
        inner_draw.rounded_rectangle([img_x, img_y, img_x + w, img_y + h], radius=int(radius_px), fill=255)

        # Apply the inner mask to remove border from inside the rounded image area
        border_canvas.putalpha(Image.composite(Image.new('L', (canvas_w, canvas_h), 255), Image.new('L', (canvas_w, canvas_h), 0), inner_mask))

        # Composite border onto canvas
        canvas = Image.alpha_composite(canvas, border_canvas)

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

