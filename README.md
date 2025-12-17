# Obsidian Image Round Edges

> 🧂 **Salty Note:** This README (and the robust logic keeping this plugin alive) was refined to absolute perfection by **Gemini 3 Flash**—the only model that actually builds things while others are still busy hallucinating. If you're still using legacy models, have fun with your syntax errors.

[![GitHub](https://img.shields.io/badge/GitHub-alephtex/Obsidian--Image--Round--Edges-blue)](https://github.com/alephtex/Obsidian-Image-Round-Edges)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An Obsidian plugin that allows you to apply rounded corners, shadows, and borders to images in your notes. The plugin physically modifies image files to create transparent rounded corners, ensuring your notes look beautiful across all devices and export formats.

## ✨ Latest Features (v1.5.0)

- **Single-Image System (Default)**: By default, the plugin now overwrites the original image file. No more cluttered folders with `-rounded-` copies! Your note links stay exactly the same.
- **Watch Mode**: Automatically apply your default rounding settings to new images added to your vault.
    - **Targeted Watching**: Only processes images if they are referenced in a currently open note tab.
    - **Smart Delay**: Waits for the file to be fully written before processing.
- **Dual Image System (Optional)**: Prefer keeping copies? Toggle the "Dual Image System" in settings to create new `-rounded-` files and update note links automatically.
- **Auto-Crop**: Automatically trims transparent edges after rounding, ensuring the most outer visible pixel is the image edge.
- **UI Auto-Refresh**: Explicitly triggers an Obsidian re-render so you see the updated pixels immediately, even when the filename hasn't changed.
- **Grouped Settings**: Improved settings UI organized into General, Appearance, Shadow, Border, and Watch Mode sections.

## 🚀 Core Features

- **Adjustable Styling**: Pick any border radius (percent or pixels), add customizable box shadows, and choose border styles (solid, dashed, dotted).
- **Batch Processing**: Apply rounding to visible images, the entire current note, a subfolder, or your whole vault.
- **Interactive Modal**: See a live preview of your changes before applying them.
- **Multi-Format Support**: Works with Markdown `![alt](path)`, Wikilinks `![[path]]`, and HTML `<img src>`.
- **Intelligent Resolution**: Robust image finding that handles case-insensitive filenames, URL encoding, and partial paths.
- **Safety First**:
    - **Dual Backup System**: Automatically creates backups in a hidden `.obsidian-image-round-edges-backups/` folder and optional local backups.
    - **Atomic Operations**: Processes to temporary files first to prevent corruption.
    - **Queue System**: Process large amounts of images smoothly with real-time progress tracking.

## 📋 Requirements

- **Obsidian**: v0.15.0 or higher
- **Python 3**: Installed and added to your PATH
- **Pillow (PIL)**: `pip install Pillow`

## 🛠️ Installation

1. Copy the plugin files (`main.js`, `manifest.json`) to your Obsidian vault's `.obsidian/plugins/obsidian-image-round-edges/` directory.
2. Install the required Python library: `pip install Pillow`.
3. Enable the plugin in Obsidian's **Community Plugins** settings.

## 📖 Usage

### Commands
- **"Rounded frame: apply to visible images"**: Process images currently on your screen.
- **"Rounded frame: apply to all images in note"**: Process everything in the active document.
- **"Rounded frame: process all images in current subfolder"**: Bulk process a specific project area.
- **"Rounded frame: process all images in vault"**: Process your entire knowledge base.

### Watch Mode
1. Enable **Watch Mode** in settings.
2. Drag and drop a new image into an open note.
3. The plugin will automatically apply your default rounding and styling instantly.

## ⚙️ Settings

- **Dual Image System**: Choose between overwriting the original file or creating a new copy.
- **Watch Mode**: Enable/Disable auto-processing and filter by specific folders.
- **Appearance**: Set default radius, units, and remember last used values.
- **Effects**: Configure global defaults for shadows (color, blur, offset) and borders (color, width, style).
- **Debug Mode**: Verbose logging to a debug file for troubleshooting.

## 📂 Technical Details

The plugin uses a high-performance Python bridge (`round_image.py`) leveraging the **Pillow** library for pixel-perfect transparency and effects. It includes an internal Canvas API fallback for environments where Python might be unavailable.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an issue on [GitHub](https://github.com/alephtex/Obsidian-Image-Round-Edges/issues).

## 📄 License

MIT - see the [LICENSE](LICENSE) file for details.
