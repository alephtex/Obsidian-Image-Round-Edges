#!/usr/bin/env python3
"""
Test script for the new border functionality.
Creates a test image and applies different border effects.
"""

from PIL import Image, ImageDraw
import subprocess
import os

def create_test_image():
    """Create a simple test image"""
    # Create a 200x200 image with colored squares
    img = Image.new('RGB', (200, 200), 'white')
    draw = ImageDraw.Draw(img)

    # Draw some colored rectangles
    draw.rectangle([20, 20, 80, 80], fill='red')
    draw.rectangle([120, 20, 180, 80], fill='blue')
    draw.rectangle([20, 120, 80, 180], fill='green')
    draw.rectangle([120, 120, 180, 180], fill='yellow')

    # Add some text
    try:
        # Try to use default font
        draw.text((90, 90), "TEST", fill='black')
    except:
        pass  # Skip text if font not available

    return img

def test_border_effects():
    """Test the new border functionality"""
    # Create test image
    test_img = create_test_image()
    test_img.save('test_input.png')
    print("Created test image: test_input.png")

    # Test cases
    test_cases = [
        {
            'name': 'solid_border',
            'args': ['python3', 'round_image.py', 'test_input.png', 'test_solid.png', '20', 'percent',
                    'false', '#000000', '10', '5',  # shadow disabled
                    'true', '#ff0000', '3', 'solid']  # border enabled: red, 3px, solid
        },
        {
            'name': 'dashed_border',
            'args': ['python3', 'round_image.py', 'test_input.png', 'test_dashed.png', '15', 'percent',
                    'false', '#000000', '10', '5',  # shadow disabled
                    'true', '#00ff00', '2', 'dashed']  # border enabled: green, 2px, dashed
        },
        {
            'name': 'dotted_border',
            'args': ['python3', 'round_image.py', 'test_input.png', 'test_dotted.png', '25', 'percent',
                    'false', '#000000', '10', '5',  # shadow disabled
                    'true', '#0000ff', '4', 'dotted']  # border enabled: blue, 4px, dotted
        },
        {
            'name': 'border_with_shadow',
            'args': ['python3', 'round_image.py', 'test_input.png', 'test_border_shadow.png', '30', 'percent',
                    'true', '#800000', '8', '3',  # shadow enabled: dark red, blur 8, offset 3
                    'true', '#ff4444', '2', 'solid']  # border enabled: light red, 2px, solid
        }
    ]

    for test_case in test_cases:
        print(f"Testing: {test_case['name']}")
        try:
            result = subprocess.run(test_case['args'], capture_output=True, text=True)
            if result.returncode == 0:
                print(f"  ✓ Success: {test_case['name']}")
            else:
                print(f"  ✗ Failed: {test_case['name']}")
                print(f"    Error: {result.stderr}")
        except Exception as e:
            print(f"  ✗ Exception in {test_case['name']}: {e}")

if __name__ == '__main__':
    test_border_effects()
    print("\nTest completed. Check the generated PNG files to verify border positioning.")
