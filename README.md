# Obsidian Image Round Edges

[![GitHub](https://img.shields.io/badge/GitHub-alephtex/Obsidian--Image--Round--Edges-blue)](https://github.com/alephtex/Obsidian-Image-Round-Edges)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An Obsidian plugin that allows you to apply rounded corners to images in your notes. The plugin physically modifies image files to create transparent rounded corners.

## Features

- Apply rounded frames to visible images or all images in a note
- Adjustable border radius from 0% to 100% (or pixel values)
- Symmetrical rounding based on the smaller dimension of the image
- Supports Markdown images, Wikilinks, and HTML img tags
- Uses Python PIL/Pillow for robust image processing with Canvas API fallback

### ✨ New Features (v1.1.0)

- **Live Preview**: See all affected images simultaneously in the modal
- **Shadow Effects**: Add customizable box shadows to images
- **Border Effects**: Add customizable borders around images
- **Undo/Redo**: Experimental undo/redo functionality in the modal
- **Enhanced Settings**: Configure shadow and border defaults
- **Bulk Processing**: Process all images in current subfolder or entire vault
- **Referenced Image Detection**: Finds and processes images referenced in notes, not just physical files

## Requirements

- **Obsidian**: v0.12.0 or higher
- **Python 3**: Latest version recommended
- **Pillow (PIL)**: `pip install Pillow`

## Installation

1. Copy the plugin files to your Obsidian vault's `.obsidian/plugins/obsidian-image-round-edges/` directory
2. Install Python dependencies: `pip install Pillow`
3. Enable the plugin in Obsidian's Community Plugins settings

## Usage

- **Command: "Rounded frame: apply to visible images"** - Processes all images currently visible in the editor
- **Command: "Rounded frame: apply to all images in note"** - Processes all images in the current note

When you run a command, a modal will appear allowing you:
- Adjust the border radius using a slider (0-100%)
- Enter pixel values directly
- See a live preview of the rounded image
- Apply or reset the changes

## Bulk Processing

The plugin supports two types of bulk processing:

### Referenced Images
The commands find **all images referenced in your notes**, not just physical files. This means:

- Images linked with `![alt](path/to/image.png)`
- Wikilinks like `![[image.png|alt]]`
- HTML img tags: `<img src="path/to/image.png">`
- **Already processed images** (with `-rounded-` suffix) are also found and can be re-processed

### Commands

- **"Rounded frame: process all images in current subfolder"**
  - Finds all images referenced in notes within the current folder and subfolders
  - Also includes any physical image files in those folders
  - Perfect for processing a specific project or section

- **"Rounded frame: process all images in vault"**
  - Finds all images referenced across your entire vault
  - Includes physical image files from all folders
  - Comprehensive processing of your entire knowledge base

### How it works

1. **Scan markdown files** for image references using regex patterns
2. **Resolve relative paths** from the note's location
3. **Combine with physical files** found in the folder structure
4. **Deduplicate** to avoid processing the same image multiple times
5. **Process all found images** with your chosen settings

Images are processed in their original folders and saved with rounded versions alongside the originals, maintaining your vault's organization.

## Settings

- **Default unit**: Choose between percent or pixels
- **Default radius**: Set your preferred border radius value
- **Remember last used values**: Plugin remembers your last settings

## Examples

### Before and After
```markdown
<!-- Original image -->
![original](image.png)

<!-- After applying 25% rounded corners -->
![rounded](image-rounded-25p.png)
```

### Supported Image Formats
- PNG, JPG, JPEG, GIF, WebP
- Works with local images and URLs

## Technical Details

The plugin uses a Python script (`round_image.py`) to process images, creating transparent rounded corners. Modified images are saved with a suffix indicating the rounding applied (e.g., `image-rounded-25p.png`).

## Troubleshooting

### Common Issues

**Python not found**
- Ensure Python 3 is installed and added to your PATH
- Try running `python --version` in your terminal

**Pillow not installed**
- Install with: `pip install Pillow`
- If you have multiple Python versions, use `pip3 install Pillow`

**Images not processing**
- Check that the image file exists and is accessible
- Ensure the image format is supported (PNG, JPG, JPEG, GIF, WebP)
- Try restarting Obsidian after enabling the plugin

**Plugin not appearing in Obsidian**
- Verify files are in the correct directory: `.obsidian/plugins/obsidian-image-round-edges/`
- Check that `manifest.json` exists in the plugin folder

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Support

If you encounter any issues or have questions:

- Open an issue on [GitHub](https://github.com/alephtex/Obsidian-Image-Round-Edges/issues)
- Check the troubleshooting section above
- Ensure you're using the latest version of the plugin

## Changelog

### v1.1.0
- Added live preview showing all affected images simultaneously
- Added shadow effects with customizable color, blur, and offset
- Added border effects with customizable color and width
- Added undo/redo functionality in modal
- Added bulk processing commands for subfolder and vault-wide image processing
- Improved multi-image reference updating with correct position handling
- Enhanced settings UI with shadow and border configuration

### v1.0.0
- Initial release
- Basic image rounding functionality
- Support for multiple image formats
- Adjustable border radius (percent/pixel)

## License

MIT - see the [LICENSE](LICENSE) file for details.
