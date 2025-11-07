# Obsidian Image Round Edges

An Obsidian plugin that allows you to apply rounded corners to images in your notes. The plugin physically modifies image files to create transparent rounded corners.

## Features

- Apply rounded frames to visible images or all images in a note
- Adjustable border radius from 0% to 100% (or pixel values)
- Symmetrical rounding based on the smaller dimension of the image
- Supports Markdown images, Wikilinks, and HTML img tags
- Uses Python PIL/Pillow for robust image processing with Canvas API fallback

## Installation

1. Copy the plugin files to your Obsidian vault's `.obsidian/plugins/obsidian-image-round-edges/` directory
2. Ensure Python 3 is installed with Pillow: `pip install Pillow`
3. Enable the plugin in Obsidian's settings

## Usage

- **Command: "Rounded frame: apply to visible images"** - Processes all images currently visible in the editor
- **Command: "Rounded frame: apply to all images in note"** - Processes all images in the current note

When you run a command, a modal will appear allowing you:
- Adjust the border radius using a slider (0-100%)
- Enter pixel values directly
- See a live preview of the rounded image
- Apply or reset the changes

## Settings

- Default unit (percent or pixels)
- Default radius values
- Option to remember last used values

## Technical Details

The plugin uses a Python script (`round_image.py`) to process images, creating transparent rounded corners. Modified images are saved with a suffix indicating the rounding applied (e.g., `image-rounded-25p.png`).

## License

MIT
