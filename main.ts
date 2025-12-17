// 1. Load persisted radius defaults and initialise helper utilities before any feature work starts.
// 2. Register both editor and preview context menu hooks so users can trigger rounding from any view.
// 3. Locate markdown, wikilink, and HTML image references to understand which element should be updated.
// 4. Present a modal that lets the user pick radius/unit with immediate visual feedback and easy resets.
// 5. Replace the chosen source with an <img> that uses reusable CSS classes for consistent rounded styling.

import { Plugin, MarkdownView, Menu, TFile, TFolder, Notice, EditorTransaction } from 'obsidian';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const PY_ROUND_IMAGE = `#!/usr/bin/env python3
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
    canvas = Image.new('RGBA', (0 + canvas_w, 0 + canvas_h), (0, 0, 0, 0))

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
`;

const execAsync = promisify(exec);
import { RoundedFrameSettings, DEFAULT_SETTINGS, RoundedFrameSettingTab, RadiusUnit } from './settings';
import { RoundedStyleManager } from './style-manager';
import { RoundedFrameModal, ShadowOptions, BorderOptions } from './modal';

interface ImageMatch { lineNumber: number; start: number; end: number; path: string; alt: string; raw: string; kind: 'markdown' | 'wikilink' | 'html'; }

interface LastAction {
	originalPaths: string[];     // Original image paths
	backupPaths: string[];       // Backup paths in hidden folder
	localBackupPaths: string[];  // Local backup paths in same folder
	newPaths: string[];          // New processed image paths
	notePath: string;            // Path to the note that was modified
	timestamp: number;           // When the action was performed
}

// Helper class for concurrent processing
class PromiseQueue {
    private concurrency: number;
    private current: number = 0;
    private queue: (() => Promise<void>)[] = [];

    constructor(concurrency: number) {
        this.concurrency = concurrency;
    }

    add<T>(task: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await task();
                    resolve(result);
                } catch (e) {
                    reject(e);
                }
            });
            this.next();
        });
    }

    private next() {
        if (this.current >= this.concurrency || this.queue.length === 0) return;
        this.current++;
        const task = this.queue.shift();
        if (task) {
            task().finally(() => {
                this.current--;
                this.next();
            });
        }
    }
}

export default class ImageRoundedFramePlugin extends Plugin {
	settings!: RoundedFrameSettings;
	private style = new RoundedStyleManager();
	private lastAction: LastAction | null = null;
	private readonly BACKUP_FOLDER = '.obsidian-image-round-edges-backups';
	private progressPopup: HTMLElement | null = null;
	private readonly DEBUG_LOG_PATH = 'image-rounded-frame-debug.log';

	async onload(): Promise<void> {
		await this.loadSettings();
		this.ensureUiStyles();
		this.addSettingTab(new RoundedFrameSettingTab(this.app, this));
		await this.ensurePythonScript();

        // Command: apply to images currently visible in the active view
        this.addCommand({
            id: 'rounded-frame-apply-visible',
            name: 'Rounded frame: apply to visible images',
            callback: () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) {
                    new Notice('Open a note to use this command', 2000);
                    return;
                }
                const visible = this.getVisibleImages(view);
                if (visible.length === 0) {
                    new Notice('No visible images found in the active note', 2000);
                    return;
                }

                const matches: ImageMatch[] = [];
                for (const img of visible) {
                    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                    const m = this.locateMatchBySrc(view, src);
                    if (m) matches.push(m);
                }
                const unique = this.uniqueMatches(matches);
                if (unique.length === 0) {
                    new Notice('Could not resolve image references in this note', 2000);
                    return;
                }

                const imageSources = visible.map(img => img.getAttribute('src') || img.getAttribute('data-src') || '').filter(src => src);
                const initial = this.getInitialRadius();
                const modal = new RoundedFrameModal(this.app, {
                    initialRadius: initial.radius,
                    initialUnit: initial.unit,
                    defaultPercent: this.settings.defaultPercent,
                    defaultPx: this.settings.defaultPx,
                    imageSources: imageSources,
                    enableShadow: this.settings.enableShadow,
                    shadowColor: this.settings.shadowColor,
                    shadowBlur: this.settings.shadowBlur,
                    shadowOffset: this.settings.shadowOffset,
                    enableBorder: this.settings.enableBorder,
                    borderColor: this.settings.borderColor,
                    borderWidth: this.settings.borderWidth,
                    borderStyle: this.settings.borderStyle,
                    onSubmit: (radius, unit, shadow, border) => this.applyRoundedFrameToMatches(view, unique, radius, unit, shadow, border),
                });
                modal.open();
            },
        });

        // Command: apply to all images in the current note
        this.addCommand({
            id: 'rounded-frame-apply-all',
            name: 'Rounded frame: apply to all images in note',
            callback: () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) {
                    new Notice('Open a note to use this command', 2000);
                    return;
                }
                const all = this.getAllMatches(view);
                if (all.length === 0) {
                    new Notice('No image references found in this note', 2000);
                    return;
                }

                const initial = this.getInitialRadius();
                const modal = new RoundedFrameModal(this.app, {
                    initialRadius: initial.radius,
                    initialUnit: initial.unit,
                    defaultPercent: this.settings.defaultPercent,
                    defaultPx: this.settings.defaultPx,
                    imageSources: [], // Will show generic preview for all images
                    enableShadow: this.settings.enableShadow,
                    shadowColor: this.settings.shadowColor,
                    shadowBlur: this.settings.shadowBlur,
                    shadowOffset: this.settings.shadowOffset,
                    enableBorder: this.settings.enableBorder,
                    borderColor: this.settings.borderColor,
                    borderWidth: this.settings.borderWidth,
                    borderStyle: this.settings.borderStyle,
                    onSubmit: (radius, unit, shadow, border) => this.applyRoundedFrameToMatches(view, all, radius, unit, shadow, border),
                });
                modal.open();
            },
        });

        // Command: process all images in current subfolder
        this.addCommand({
            id: 'rounded-frame-process-subfolder',
            name: 'Rounded frame: process all images in current subfolder',
            callback: () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view || !view.file) {
                    new Notice('Open a note inside the target folder to use this', 3000);
                    return;
                }
                // Process asynchronously
                this.processSubfolderImages(view);
            },
        });

        // Command: process all images in vault
        this.addCommand({
            id: 'rounded-frame-process-vault',
            name: 'Rounded frame: process all images in vault',
            callback: () => {
                // Process asynchronously
                this.processVaultImages();
            },
        });

        // Command: undo last action
        this.addCommand({
            id: 'rounded-frame-undo-last',
            name: 'Rounded frame: undo last action',
            callback: () => {
                if (!this.lastAction) {
                    new Notice('No action to undo', 2000);
                    return;
                }
                this.undoLastAction();
            },
        });

        // Command: confirm last action
        this.addCommand({
            id: 'rounded-frame-confirm-last',
            name: 'Rounded frame: confirm last action',
            callback: () => {
                if (!this.lastAction) {
                    new Notice('No action to confirm', 2000);
                    return;
                }
                this.confirmLastAction();
            },
        });

        // Command: emergency recovery - scan for backup files
        this.addCommand({
            id: 'rounded-frame-emergency-recovery',
            name: 'Rounded frame: emergency recovery (scan for backups)',
            callback: () => {
                this.emergencyRecoveryScan();
            },
        });

        // Command: force cleanup all backups
        this.addCommand({
            id: 'rounded-frame-cleanup-backups',
            name: 'Rounded frame: cleanup all backup files',
            callback: async () => {
                const confirmed = confirm('This will permanently delete ALL backup files in your vault. This action cannot be undone. Continue?');
                if (confirmed) {
                    await this.forceCleanupAllBackups();
                }
            },
        });
	}

	private async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async onunload(): Promise<void> {
		// Clean up any active confirmation popup
		this.removeActionConfirmationPopup();
	}

	private ensureUiStyles(): void {
		if (document.head.querySelector('#rounded-frame-ui')) return;
		const style = document.createElement('style');
		style.id = 'rounded-frame-ui';
		style.textContent = `
			.rounded-frame-modal{padding:20px;min-width:360px;}
			.rounded-frame-effect-row{display:flex;gap:8px;margin-bottom:12px;}
			.rounded-frame-effect-row button{flex:1;}
			.rounded-frame-unit-row{display:flex;gap:8px;margin-bottom:12px;}
			.rounded-frame-unit-row button{flex:1;}
			.rounded-frame-section{margin-bottom:12px;}
			.rounded-frame-hidden{display:none;}
			.rounded-frame-slider{width:100%;}
			.rounded-frame-number{width:100%;}
			.rounded-frame-preview{display:flex;flex-direction:column;gap:16px;margin:16px 0;}
			.rounded-frame-thumbnail-container{text-align:center;}
			.rounded-frame-thumbnail-container h4{margin:0 0 8px 0;font-size:1em;}
			.rounded-frame-preview-thumbnail{display:block;margin:0 auto;border-radius:4px;}
			.rounded-frame-images-container{text-align:center;}
			.rounded-frame-images-container h4{margin:0 0 8px 0;font-size:1em;}
			.rounded-frame-preview-img{max-width:80px;max-height:80px;margin:2px;border:1px solid var(--background-modifier-border);object-fit:contain;border-radius:2px;}
			.rounded-frame-button-row{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;}
			.rounded-frame-shadow-section, .rounded-frame-border-section{margin:12px 0;padding:12px;border:1px solid var(--background-modifier-border);border-radius:6px;}
			.rounded-frame-control-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
			.rounded-frame-control-row span:first-child{min-width:80px;}
			.rounded-frame-control-row input[type="color"]{width:40px;height:30px;border:none;border-radius:4px;cursor:pointer;}
			.rounded-frame-control-row input[type="range"]{flex:1;}
			.rounded-frame-control-row select{width:100px;}
		`;
		document.head.appendChild(style);
	}

	private async ensurePythonScript(): Promise<void> {
		const pythonScript = path.join(this.app.vault.configDir, 'plugins', 'image-rounded-frame', 'round_image.py');
		const pluginDir = path.dirname(pythonScript);
		
		if (!fs.existsSync(pluginDir)) {
			fs.mkdirSync(pluginDir, { recursive: true });
		}
		
		// If script missing or too small, (re)write embedded version
		let shouldWrite = false;
		try {
			if (!fs.existsSync(pythonScript)) shouldWrite = true;
			else {
				const stat = fs.statSync(pythonScript);
				if (stat.size < 5000) shouldWrite = true; // ensure full script present
			}
		} catch { shouldWrite = true; }
		
		if (shouldWrite) {
			try {
				fs.writeFileSync(pythonScript, PY_ROUND_IMAGE, { encoding: 'utf-8' });
				fs.chmodSync(pythonScript, 0o755);
			} catch (e) {
				console.warn('Failed to materialize embedded python script:', e);
			}
		}
	}

	private refreshMatch(editor: any, match: ImageMatch): ImageMatch | null {
		const line = editor.getLine(match.lineNumber);
		return line.slice(match.start, match.end) === match.raw
			? match
			: this.findMatchInLine(line, match.lineNumber, { targetSrc: match.path }) ?? null;
	}

	private findMatchInLine(line: string, lineNumber: number, opts: { targetSrc?: string; cursorCh?: number } = {}): ImageMatch | null {
		const candidates = this.collectMatches(line, lineNumber);
		if (opts.targetSrc) {
			const matched = candidates.find((c) => this.pathsMatch(opts.targetSrc!, c.path));
			if (matched) return matched;
		}
		if (opts.cursorCh !== undefined) {
			const matched = candidates.find((c) => opts.cursorCh! >= c.start && opts.cursorCh! <= c.end);
			if (matched) return matched;
		}
		return candidates[0] ?? null;
	}

	private locateMatchBySrc(view: MarkdownView, src: string): ImageMatch | null {
		if (!src) return null;
		const lines = view.editor.getValue().split('\n');
		for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
			const match = this.findMatchInLine(lines[lineNumber], lineNumber, { targetSrc: src });
			if (match) return match;
		}
		return null;
	}

    private getAllMatches(view: MarkdownView): ImageMatch[] {
        const out: ImageMatch[] = [];
        const lines = view.editor.getValue().split('\n');
        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const list = this.collectMatches(lines[lineNumber], lineNumber);
            for (const m of list) out.push(m);
        }
        return this.uniqueMatches(out);
    }

	private getVisibleImages(view: MarkdownView): HTMLImageElement[] {
		const root = view.containerEl;
		const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
		const viewportH = window.innerHeight || document.documentElement.clientHeight;
		return imgs.filter((img) => {
			const r = img.getBoundingClientRect();
			const visible = r.bottom > 0 && r.top < viewportH && r.width > 0 && r.height > 0;
			const src = img.getAttribute('src') || img.getAttribute('data-src');
			return visible && !!src;
		});
	}

	private uniqueMatches(matches: ImageMatch[]): ImageMatch[] {
		const seen = new Set<string>();
		const out: ImageMatch[] = [];
		for (const m of matches) {
			const key = `${m.lineNumber}:${m.start}:${m.end}`;
			if (!seen.has(key)) { seen.add(key); out.push(m); }
		}
		return out;
	}

    private async applyRoundedFrameToMatches(view: MarkdownView, matches: ImageMatch[], radius: number, unit: RadiusUnit, shadow?: ShadowOptions, border?: BorderOptions): Promise<void> {
		const editor = view.editor;
		const refreshed: ImageMatch[] = [];
		for (const m of matches) {
			const updated = this.refreshMatch(editor, m);
			if (updated) refreshed.push(updated);
		}
		// Sort by line number, then by start position (descending for same line to avoid position shifts)
		refreshed.sort((a, b) => {
			if (a.lineNumber !== b.lineNumber) {
				return b.lineNumber - a.lineNumber; // Process later lines first
			}
			return b.start - a.start; // Process later positions first in same line
		});

		// Queue-based processing with delay and progress popup
		await this.processImagesQueueFromMatches(view, refreshed, radius, unit, shadow, border);
		return;
	}

	private async getImagesInCurrentSubfolder(view: MarkdownView): Promise<TFile[]> {
		if (!view.file) return [];

		const currentFile = view.file;
		const currentFolder = currentFile.parent;
		if (!currentFolder) return [];

		// Get all referenced images from markdown files in current folder
		const referencedImages = await this.getReferencedImagesInFolder(currentFolder);

		// Also get physical image files in the folder
		const physicalImages = this.getPhysicalImagesInFolder(currentFolder);

		// Combine and deduplicate
		const allImages = new Map<string, TFile>();

		// Add referenced images first (higher priority)
		for (const img of referencedImages) {
			allImages.set(img.path, img);
		}

		// Add physical images
		for (const img of physicalImages) {
			allImages.set(img.path, img);
		}

		return Array.from(allImages.values());
	}

	private async getReferencedImagesInFolder(folder: TFolder): Promise<TFile[]> {
		const referencedImages: TFile[] = [];
		const markdownFiles = this.getMarkdownFilesInFolder(folder);

		for (const mdFile of markdownFiles) {
			const content = await this.readFileContent(mdFile);
			if (!content) continue;

			const imageRefs = this.extractImageReferences(content);

			for (const imagePath of imageRefs) {
				const resolvedFile = this.resolveImageFile(imagePath, mdFile);
				if (resolvedFile && !referencedImages.some(img => img.path === resolvedFile.path)) {
					referencedImages.push(resolvedFile);
				}
			}
		}

		return referencedImages;
	}

	private getPhysicalImagesInFolder(folder: TFolder): TFile[] {
		const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
		const folderPath = folder.path;

		// Get all files in vault and filter for images in current folder path
		const allFiles = this.app.vault.getFiles();
		const imagesInFolder: TFile[] = [];

		for (const file of allFiles) {
			// Check if file path starts with the folder path (includes subfolders)
			if (file.path.startsWith(folderPath + '/')) {
				const extension = file.extension.toLowerCase();
				if (imageExtensions.includes(extension)) {
					imagesInFolder.push(file);
				}
			}
		}

		return imagesInFolder;
	}

	private getMarkdownFilesInFolder(folder: TFolder): TFile[] {
		const markdownFiles: TFile[] = [];
		const folderPath = folder.path;

		const allFiles = this.app.vault.getFiles();
		for (const file of allFiles) {
			if (file.path.startsWith(folderPath + '/') && file.extension.toLowerCase() === 'md') {
				markdownFiles.push(file);
			}
		}

		return markdownFiles;
	}

	private async readFileContent(file: TFile): Promise<string | null> {
		try {
			// Read the actual file content from vault
			const content = await this.app.vault.read(file);
			return content;
		} catch (error) {
			console.error('Error reading file:', file.path, error);
			return null;
		}
	}

	private extractImageReferences(content: string): string[] {
		const imageRefs: string[] = [];

		// Markdown image syntax: ![alt](path)
		// Updated to support <path with spaces> as well
		const mdRegex = /!\[([^\]]*)\]\((?:<([^>]+)>|([^)\s]+))(?:\s+"([^"]*)")?\)/g;
		let mdMatch;
		while ((mdMatch = mdRegex.exec(content)) !== null) {
			const pathGroup = mdMatch[2] || mdMatch[3];
			if (pathGroup) imageRefs.push(pathGroup.trim());
		}

		// Wikilink image syntax: ![[path|alt]]
		const wikiRegex = /!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
		let wikiMatch;
		while ((wikiMatch = wikiRegex.exec(content)) !== null) {
			imageRefs.push(wikiMatch[1].trim());
		}

		// HTML img tags: <img src="path">
		const htmlRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
		let htmlMatch;
		while ((htmlMatch = htmlRegex.exec(content)) !== null) {
			imageRefs.push(htmlMatch[1].trim());
		}

		return imageRefs;
	}

	private resolveImageFile(imagePath: string, sourceFile: TFile): TFile | null {
        // Use the native resolver first for consistency
        const dest = this.app.metadataCache.getFirstLinkpathDest(imagePath, sourceFile.path);
        if (dest) return dest;

		// URL-decode the path
		let decodedPath: string;
		try {
			decodedPath = decodeURIComponent(imagePath);
		} catch (error) {
			decodedPath = imagePath;
		}

        // Try manual resolution for relative paths if metadataCache fails (e.g. for non-standard links)
		// 1. First try as direct vault path (most common in Obsidian)
		try {
			const file = this.app.vault.getAbstractFileByPath(decodedPath) as TFile;
			if (file) return file;
		} catch (error) {}

		// 2. Handle explicit relative paths
		if (decodedPath.startsWith('./') || decodedPath.startsWith('../')) {
			const sourceDir = sourceFile.parent?.path || '';
			let resolvedPath = decodedPath;

			if (decodedPath.startsWith('./')) {
				resolvedPath = sourceDir ? `${sourceDir}/${decodedPath.substring(2)}` : decodedPath.substring(2);
			} else {
				// Handle ../ relative paths
				let currentDir = sourceDir;
				let relPath = decodedPath;

				while (relPath.startsWith('../')) {
					const parentDir = currentDir.substring(0, currentDir.lastIndexOf('/'));
					currentDir = parentDir || '';
					relPath = relPath.substring(3);
				}

				resolvedPath = currentDir ? `${currentDir}/${relPath}` : relPath;
			}

			try {
				const file = this.app.vault.getAbstractFileByPath(resolvedPath) as TFile;
				return file || null;
			} catch (error) {}
		}

		return null;
	}

	private async getImagesInVault(): Promise<TFile[]> {
		const rootFolder = this.app.vault.getRoot();

		// Get all referenced images from markdown files in vault
		const referencedImages = await this.getReferencedImagesInFolder(rootFolder);

		// Also get physical image files in the vault
		const physicalImages = this.getPhysicalImagesInFolder(rootFolder);

		// Combine and deduplicate
		const allImages = new Map<string, TFile>();

		// Add referenced images first (higher priority)
		for (const img of referencedImages) {
			allImages.set(img.path, img);
		}

		// Add physical images
		for (const img of physicalImages) {
			allImages.set(img.path, img);
		}

		return Array.from(allImages.values());
	}

	private getImageFilesInFolder(folder: TFolder): TFile[] {
		const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
		const images: TFile[] = [];

		// Add images from current folder
		for (const item of folder.children) {
			if (item instanceof TFile) {
				const extension = item.extension.toLowerCase();
				if (imageExtensions.includes(extension)) {
					images.push(item);
				}
			}
		}

		// Recursively add images from subfolders
		for (const item of folder.children) {
			if (item instanceof TFolder) {
				images.push(...this.getImageFilesInFolder(item));
			}
		}

		return images;
	}

	private async processSubfolderImages(view: MarkdownView): Promise<void> {
		try {
			const subfolderImages = await this.getImagesInCurrentSubfolder(view);
			if (subfolderImages.length === 0) {
				new Notice('No images found in current subfolder', 2000);
				return;
			}

			const modal = new RoundedFrameModal(this.app, {
				initialRadius: this.settings.defaultPercent,
				initialUnit: this.settings.defaultUnit,
				defaultPercent: this.settings.defaultPercent,
				defaultPx: this.settings.defaultPx,
				imageSources: [], // No preview for bulk operations
				enableShadow: this.settings.enableShadow,
				shadowColor: this.settings.shadowColor,
				shadowBlur: this.settings.shadowBlur,
				shadowOffset: this.settings.shadowOffset,
				enableBorder: this.settings.enableBorder,
				borderColor: this.settings.borderColor,
				borderWidth: this.settings.borderWidth,
				onSubmit: async (radius, unit, shadow, border) => {
					await this.processBulkImages(view, subfolderImages, radius, unit, shadow, border);
					new Notice(`Processed ${subfolderImages.length} images in subfolder`, 3000);
				},
			});
			modal.open();
		} catch (error) {
			new Notice('Error processing subfolder images', 3000);
			console.error(error);
		}
	}

	private async processVaultImages(): Promise<void> {
		try {
			const vaultImages = await this.getImagesInVault();
			if (vaultImages.length === 0) {
				new Notice('No images found in vault', 2000);
				return;
			}

			const modal = new RoundedFrameModal(this.app, {
				initialRadius: this.settings.defaultPercent,
				initialUnit: this.settings.defaultUnit,
				defaultPercent: this.settings.defaultPercent,
				defaultPx: this.settings.defaultPx,
				imageSources: [], // No preview for bulk operations
				enableShadow: this.settings.enableShadow,
				shadowColor: this.settings.shadowColor,
				shadowBlur: this.settings.shadowBlur,
				shadowOffset: this.settings.shadowOffset,
				enableBorder: this.settings.enableBorder,
				borderColor: this.settings.borderColor,
				borderWidth: this.settings.borderWidth,
				onSubmit: async (radius, unit, shadow, border) => {
					await this.processBulkImages(null, vaultImages, radius, unit, shadow, border);
					new Notice(`Processed ${vaultImages.length} images in vault`, 3000);
				},
			});
			modal.open();
		} catch (error) {
			new Notice('Error processing vault images', 3000);
			console.error(error);
		}
	}

	private async processBulkImages(view: MarkdownView | null, imageFiles: TFile[], radius: number, unit: RadiusUnit, shadow?: ShadowOptions, border?: BorderOptions): Promise<void> {
		await this.processImageFilesQueue(view, imageFiles, radius, unit, shadow, border);
		return;
	}

	private getRelativePathForNote(view: MarkdownView, absolutePath: string): string {
		const originalPath = absolutePath;
		const currentFile = view.file;
		let finalPath = absolutePath;

		// If original path was relative, make new path relative too
		if (originalPath.startsWith('./') && currentFile) {
			const newFile = this.app.vault.getAbstractFileByPath(absolutePath) as TFile | null;
			if (newFile) {
				const currentDir = currentFile.parent?.path || '';
				const newFileDir = newFile.parent?.path || '';

				if (newFileDir === currentDir) {
					// Same directory - just filename
					finalPath = './' + newFile.basename + '.' + newFile.extension;
				} else if (currentDir && newFileDir.startsWith(currentDir + '/')) {
					// New file is in subdirectory
					const subPath = newFileDir.substring(currentDir.length + 1);
					finalPath = './' + subPath + '/' + newFile.basename + '.' + newFile.extension;
				} else {
					// Different directory - calculate relative path
					const currentParts = currentDir.split('/').filter(p => p);
					const newParts = newFileDir.split('/').filter(p => p);

					let commonLength = 0;
					while (commonLength < currentParts.length && commonLength < newParts.length &&
						   currentParts[commonLength] === newParts[commonLength]) {
						commonLength++;
					}

					const upLevels = currentParts.length - commonLength;
					const relativeParts = newParts.slice(commonLength);
					const fileName = newFile.basename + '.' + newFile.extension;

					if (upLevels === 0 && relativeParts.length === 0) {
						finalPath = './' + fileName;
					} else {
						finalPath = '../'.repeat(upLevels) + relativeParts.join('/') + '/' + fileName;
					}
				}
			}
		} else if (!originalPath.startsWith('/') && !/^[A-Za-z]:/.test(originalPath) && !originalPath.startsWith('./') && currentFile) {
			// Original was relative without ./ prefix - try to preserve format
			const newFile = this.app.vault.getAbstractFileByPath(absolutePath) as TFile | null;
			if (newFile) {
				const currentDir = currentFile.parent?.path || '';
				const newFileDir = newFile.parent?.path || '';

				if (newFileDir === currentDir) {
					finalPath = newFile.basename + '.' + newFile.extension;
				}
			}
		}
		return finalPath;
	}

	private buildReference(match: ImageMatch, newPath: string): string {
		// Rebuild the reference string based on the match type
		if (match.kind === 'markdown') {
			return `![${match.alt}](${newPath})`;
		} else if (match.kind === 'wikilink') {
			return `![[${newPath}|${match.alt}]]`;
		} else {
			// HTML fallback
			return `<img src="${newPath}" alt="${match.alt}">`;
		}
	}


	private collectMatches(line: string, lineNumber: number): ImageMatch[] {
		const matches: ImageMatch[] = [];
		// Markdown image syntax: ![alt](path) - updated for <> support
		const mdRegex = /!\[([^\]]*)\]\((?:<([^>]+)>|([^)\s]+))(?:\s+"([^"]*)")?\)/g;
		let md: RegExpExecArray | null;
		while ((md = mdRegex.exec(line)) !== null) {
			const pathGroup = md[2] || md[3];
			const rawPath = (pathGroup || '').trim();
			const safePath = this.sanitizeImagePath(rawPath);
			if (!safePath) continue;
			matches.push({
				lineNumber,
				start: md.index,
				end: md.index + md[0].length,
				path: safePath,
				alt: (md[1] || '').trim(),
				raw: md[0],
				kind: 'markdown',
			});
		}
		const wikiRegex = /!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
		let wiki: RegExpExecArray | null;
		while ((wiki = wikiRegex.exec(line)) !== null) {
			const path = wiki[1].trim();
			const alt = (wiki[2] || wiki[1] || '').trim();
			matches.push({
				lineNumber,
				start: wiki.index,
				end: wiki.index + wiki[0].length,
				path,
				alt,
				raw: wiki[0],
				kind: 'wikilink',
			});
		}
		const htmlRegex = /<img\s+[^>]*>/gi;
		let tag: RegExpExecArray | null;
		while ((tag = htmlRegex.exec(line)) !== null) {
			const raw = tag[0];
			const path = this.getAttr(raw, 'src');
			if (!path) continue;
			const safePath = this.sanitizeImagePath(path);
			if (!safePath) continue;
			matches.push({
				lineNumber,
				start: tag.index,
				end: tag.index + raw.length,
				path: safePath,
				alt: this.getAttr(raw, 'alt') ?? '',
				raw,
				kind: 'html',
			});
		}

		return matches;
	}

	private getAttr(tag: string, name: string): string | null {
		const attr = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
		if (!attr) return null;
		return (attr[2] ?? attr[3] ?? '').trim();
	}

	private sanitizeImagePath(raw: string): string | null {
		if (!raw) return null;
		let p = raw.trim();

		// 1) If the raw contains a full markdown image pattern, extract its ( ... ) content
		try {
			const mdMatch = /!\[[^\]]*\]\(([^)]+)\)/.exec(p);
			if (mdMatch && mdMatch[1]) {
				p = mdMatch[1].trim();
			}
		} catch {}

		// 2) If the raw contains a wikilink image pattern, extract the [[ ... ]] target (before optional |)
		try {
			const wikiMatch = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/.exec(p);
			if (wikiMatch && wikiMatch[1]) {
				p = wikiMatch[1].trim();
			}
		} catch {}

		// 3) If still malformed and contains parentheses, try to take the innermost (...) if it looks like an image
		if (p.includes('(') && p.includes(')')) {
			const lastOpen = p.lastIndexOf('(');
			const lastClose = p.indexOf(')', lastOpen + 1);
			if (lastOpen >= 0 && lastClose > lastOpen) {
				const inner = p.slice(lastOpen + 1, lastClose).trim();
				if (/(\.(png|jpg|jpeg|gif|webp|bmp|svg))(\?|#|$)/i.test(inner)) {
					p = inner;
				}
			}
		}

		// 4) Normalize slashes & decode
		p = p.replace(/\\+/g, '/');
		try { p = decodeURIComponent(p); } catch {}
		p = p.replace(/^\.\//, '');

		// 5) If the whole string still includes junk, try to pick the last token that ends with a valid image extension
		const tokenMatchAll = p.match(/[^\s"'()]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg)(?:[?#][^\s"'()]*)?/ig);
		if (tokenMatchAll && tokenMatchAll.length > 0) {
			p = tokenMatchAll[tokenMatchAll.length - 1];
		}

		// 6) Trim to end of extension if followed by query/hash
		const exts = ['png','jpg','jpeg','gif','webp','bmp','svg'];
		let bestEnd = -1;
		for (const ext of exts) {
			const re = new RegExp(`\\.${ext}(?:[?#].*|$)`, 'i');
			const m = re.exec(p);
			if (m && m.index + ('.' + ext).length > bestEnd) {
				bestEnd = m.index + ('.' + ext).length;
			}
		}
		if (bestEnd > 0) p = p.slice(0, bestEnd);

		// 7) Basic sanity: must not contain control characters or unmatched quotes
		if (/\n|\r/.test(p)) return null;
		return p || null;
	}

	private resolveTFile(view: MarkdownView, link: string): TFile | null {
		if (/^https?:/i.test(link)) return null;
		
		// Sanitize first
		const sanitized = this.sanitizeImagePath(link);
		const candidate = sanitized ?? link;
		
		// Decode URL-encoded paths
		let decodedLink = candidate;
		// Remove leading ./ if present
		decodedLink = decodedLink.replace(/^\.\//, '');
		
		const base = view.file?.path ?? '';
		
		// Try multiple resolution strategies
		let file = this.app.metadataCache.getFirstLinkpathDest(decodedLink, base);
		if (file) return file;
		
		// Try direct path lookup
		file = this.app.vault.getAbstractFileByPath(decodedLink) as TFile | null;
		if (file) return file;
		
		// Try relative to current file
		if (view.file) {
			const parentPath = view.file.parent?.path ?? '';
			const fullPath = parentPath ? `${parentPath}/${decodedLink}` : decodedLink;
			file = this.app.vault.getAbstractFileByPath(fullPath) as TFile | null;
			if (file) return file;
		}
		
		return null;
	}

	private async ensureBackupFolder(): Promise<void> {
		try {
			const backupFolder = this.app.vault.getAbstractFileByPath(this.BACKUP_FOLDER);
			if (!backupFolder) {
				await this.app.vault.createFolder(this.BACKUP_FOLDER);
			}
		} catch (error) {
			console.warn('Failed to create backup folder:', error);
		}
	}

	private async createBackup(originalPath: string): Promise<string> {
		await this.ensureBackupFolder();

		const timestamp = Date.now();
		const filename = path.basename(originalPath);
		const backupPath = `${this.BACKUP_FOLDER}/${timestamp}-${filename}`;

		try {
			const originalFile = this.app.vault.getAbstractFileByPath(originalPath);
			if (originalFile && originalFile instanceof TFile) {
				const content = await this.app.vault.readBinary(originalFile);
				await this.app.vault.createBinary(backupPath, content);
				return backupPath;
			}
		} catch (error) {
			console.error(`Failed to create backup for ${originalPath}:`, error);
		}
		return '';
	}

	private async createLocalBackup(originalPath: string): Promise<string> {
		const dirname = path.dirname(originalPath);
		const filename = path.basename(originalPath);
		const ext = path.extname(filename);
		const base = path.basename(filename, ext);
		const timestamp = Date.now();
		const backupPath = dirname ? `${dirname}/${base}.backup-${timestamp}${ext}` : `${base}.backup-${timestamp}${ext}`;

		try {
			const originalFile = this.app.vault.getAbstractFileByPath(originalPath);
			if (originalFile && originalFile instanceof TFile) {
				const content = await this.app.vault.readBinary(originalFile);
				await this.app.vault.createBinary(backupPath, content);
				console.log(`Created local backup: ${backupPath}`);
				return backupPath;
			}
		} catch (error) {
			console.error(`Failed to create local backup for ${originalPath}:`, error);
		}
		return '';
	}

	private async restoreFromBackup(backupPath: string, targetPath: string): Promise<boolean> {
		try {
			const backupFile = this.app.vault.getAbstractFileByPath(backupPath);
			if (backupFile && backupFile instanceof TFile) {
				const content = await this.app.vault.readBinary(backupFile);
				await this.app.vault.createBinary(targetPath, content);
				return true;
			}
		} catch (error) {
			console.error(`Failed to restore from backup ${backupPath}:`, error);
		}
		return false;
	}

	private async clearLastActionBackups(): Promise<void> {
		if (!this.lastAction) return;

		// Delete hidden folder backups
		for (const backupPath of this.lastAction.backupPaths) {
			try {
				const backupFile = this.app.vault.getAbstractFileByPath(backupPath);
				if (backupFile && backupFile instanceof TFile) {
					await this.app.vault.delete(backupFile);
				}
			} catch (error) {
				console.warn(`Failed to delete backup ${backupPath}:`, error);
			}
		}

		// Delete local backups
		for (const localBackupPath of this.lastAction.localBackupPaths) {
			try {
				const localBackupFile = this.app.vault.getAbstractFileByPath(localBackupPath);
				if (localBackupFile && localBackupFile instanceof TFile) {
					await this.app.vault.delete(localBackupFile);
					console.log(`Cleaned up local backup: ${localBackupPath}`);
				}
			} catch (error) {
				console.warn(`Failed to delete local backup ${localBackupPath}:`, error);
			}
		}

		this.lastAction = null;
	}

	private async undoLastAction(): Promise<void> {
		if (!this.lastAction) {
			new Notice('No action to undo', 2000);
			return;
		}

		let successCount = 0;
		let failCount = 0;

		// Restore original images from backups (try hidden folder first, then local)
		for (let i = 0; i < this.lastAction.originalPaths.length; i++) {
			const originalPath = this.lastAction.originalPaths[i];
			let restored = false;

			// Try hidden folder backup first
			if (i < this.lastAction.backupPaths.length) {
				const backupPath = this.lastAction.backupPaths[i];
				if (await this.restoreFromBackup(backupPath, originalPath)) {
					restored = true;
				}
			}

			// If hidden folder backup failed, try local backup
			if (!restored && i < this.lastAction.localBackupPaths.length) {
				const localBackupPath = this.lastAction.localBackupPaths[i];
				if (await this.restoreFromBackup(localBackupPath, originalPath)) {
					restored = true;
					console.log(`Restored from local backup: ${localBackupPath}`);
				}
			}

			if (restored) {
				successCount++;
			} else {
				failCount++;
			}
		}

		// Delete the processed images
		for (const newPath of this.lastAction.newPaths) {
			try {
				const processedFile = this.app.vault.getAbstractFileByPath(newPath);
				if (processedFile && processedFile instanceof TFile) {
					await this.app.vault.delete(processedFile);
				}
			} catch (error) {
				console.warn(`Failed to delete processed image ${newPath}:`, error);
				failCount++;
			}
		}

		// Clear backups and reset last action
		await this.clearLastActionBackups();

		if (failCount === 0) {
			new Notice(`Successfully undone last action (${successCount} images restored)`, 3000);
		} else {
			new Notice(`Partially undone last action (${successCount} restored, ${failCount} failed)`, 3000);
		}
	}

	private async confirmLastAction(): Promise<void> {
		if (!this.lastAction) {
			new Notice('No action to confirm', 2000);
			return;
		}

		// Delete all backups since the action is confirmed
		await this.clearLastActionBackups();

		new Notice('Last action confirmed - backups cleaned up', 2000);
	}

	private async emergencyRecoveryScan(): Promise<void> {
		const allFiles = this.app.vault.getFiles();
		const backupFiles: TFile[] = [];
		const localBackupFiles: TFile[] = [];

		// Scan for backup files
		for (const file of allFiles) {
			if (file.path.startsWith(this.BACKUP_FOLDER + '/')) {
				backupFiles.push(file);
			} else if (file.name.includes('.backup-')) {
				localBackupFiles.push(file);
			}
		}

		const totalBackups = backupFiles.length + localBackupFiles.length;

		if (totalBackups === 0) {
			new Notice('No backup files found in vault', 3000);
			return;
		}

		// Show recovery options
		const message = `Found ${totalBackups} backup files:\n` +
			`• ${backupFiles.length} in hidden backup folder\n` +
			`• ${localBackupFiles.length} local backups\n\n` +
			`Check the console for detailed file list.`;

		new Notice(message, 5000);
		console.log('=== EMERGENCY RECOVERY SCAN ===');
		console.log('Hidden backup folder files:');
		backupFiles.forEach(file => console.log(`  ${file.path} (${file.stat.size} bytes)`));
		console.log('Local backup files:');
		localBackupFiles.forEach(file => console.log(`  ${file.path} (${file.stat.size} bytes)`));
		console.log('=== END RECOVERY SCAN ===');
		console.log('To restore files manually:');
		console.log('1. Identify the backup file you want to restore');
		console.log('2. Copy it to replace the original file path');
		console.log('3. Delete the backup file when done');
	}

	private async forceCleanupAllBackups(): Promise<void> {
		const allFiles = this.app.vault.getFiles();
		let deletedCount = 0;

		// Delete all backup files
		for (const file of allFiles) {
			if (file.path.startsWith(this.BACKUP_FOLDER + '/') || file.name.includes('.backup-')) {
				try {
					await this.app.vault.delete(file);
					deletedCount++;
				} catch (error) {
					console.warn(`Failed to delete backup file: ${file.path}`, error);
				}
			}
		}

		// Clear last action tracking
		this.lastAction = null;

		if (deletedCount > 0) {
			new Notice(`Cleaned up ${deletedCount} backup files`, 3000);
		} else {
			new Notice('No backup files found to clean up', 2000);
		}
	}

	private showActionConfirmationPopup(): void {
		if (!this.lastAction) return;

		// Remove any existing popup
		this.removeActionConfirmationPopup();

		// Create the popup container
		const popup = document.createElement('div');
		popup.id = 'rounded-frame-confirmation-popup';
		popup.style.cssText = `
			position: fixed;
			top: 20px;
			right: 20px;
			background: var(--background-primary, #ffffff);
			border: 2px solid var(--interactive-accent, #4a90e2);
			border-radius: 8px;
			padding: 16px;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
			z-index: 10000;
			max-width: 350px;
			font-family: var(--font-interface, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
			color: var(--text-normal, #333333);
		`;

		// Create content
		const title = document.createElement('div');
		title.textContent = '✅ Image Processing Complete';
		title.style.cssText = `
			font-weight: bold;
			font-size: 14px;
			margin-bottom: 8px;
			color: var(--text-accent, #4a90e2);
		`;

		const message = document.createElement('div');
		const imageCount = this.lastAction.newPaths.length;
		message.textContent = `Successfully processed ${imageCount} image${imageCount !== 1 ? 's' : ''}. Backups created for safety.`;
		message.style.cssText = `
			font-size: 13px;
			margin-bottom: 12px;
			line-height: 1.4;
		`;

		const question = document.createElement('div');
		question.textContent = 'Keep the changes or revert?';
		question.style.cssText = `
			font-size: 12px;
			margin-bottom: 12px;
			font-style: italic;
			color: var(--text-muted, #888888);
		`;

		// Create button container
		const buttonContainer = document.createElement('div');
		buttonContainer.style.cssText = `
			display: flex;
			gap: 8px;
			justify-content: flex-end;
		`;

		// Confirm button
		const confirmButton = document.createElement('button');
		confirmButton.textContent = '✅ Confirm';
		confirmButton.style.cssText = `
			padding: 6px 12px;
			background: var(--interactive-accent, #4a90e2);
			color: var(--text-on-accent, #ffffff);
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
			font-weight: 500;
			transition: background-color 0.2s;
		`;
		confirmButton.onmouseover = () => {
			confirmButton.style.background = 'var(--interactive-accent-hover, #357abd)';
		};
		confirmButton.onmouseout = () => {
			confirmButton.style.background = 'var(--interactive-accent, #4a90e2)';
		};
		confirmButton.onclick = async () => {
			await this.confirmLastAction();
			this.removeActionConfirmationPopup();
		};

		// Undo button
		const undoButton = document.createElement('button');
		undoButton.textContent = '↶ Undo';
		undoButton.style.cssText = `
			padding: 6px 12px;
			background: var(--background-modifier-error, #ff6b6b);
			color: var(--text-on-accent, #ffffff);
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
			font-weight: 500;
			transition: background-color 0.2s;
		`;
		undoButton.onmouseover = () => {
			undoButton.style.background = 'var(--background-modifier-error-hover, #ff5252)';
		};
		undoButton.onmouseout = () => {
			undoButton.style.background = 'var(--background-modifier-error, #ff6b6b)';
		};
		undoButton.onclick = async () => {
			await this.undoLastAction();
			this.removeActionConfirmationPopup();
		};

		// Dismiss button (X)
		const dismissButton = document.createElement('button');
		dismissButton.textContent = '✕';
		dismissButton.style.cssText = `
			position: absolute;
			top: 8px;
			right: 8px;
			background: none;
			border: none;
			cursor: pointer;
			font-size: 16px;
			color: var(--text-muted, #888888);
			padding: 0;
			width: 20px;
			height: 20px;
			display: flex;
			align-items: center;
			justify-content: center;
		`;
		dismissButton.onclick = () => {
			this.removeActionConfirmationPopup();
		};

		// Auto-dismiss after 30 seconds
		setTimeout(() => {
			this.removeActionConfirmationPopup();
		}, 30000);

		// Assemble the popup
		buttonContainer.appendChild(undoButton);
		buttonContainer.appendChild(confirmButton);

		popup.appendChild(dismissButton);
		popup.appendChild(title);
		popup.appendChild(message);
		popup.appendChild(question);
		popup.appendChild(buttonContainer);

		// Add to document
		document.body.appendChild(popup);

		// Add fade-in animation
		popup.style.opacity = '0';
		popup.style.transform = 'translateY(-10px)';
		setTimeout(() => {
			popup.style.transition = 'all 0.3s ease';
			popup.style.opacity = '1';
			popup.style.transform = 'translateY(0)';
		}, 10);
	}

	private removeActionConfirmationPopup(): void {
		const existingPopup = document.getElementById('rounded-frame-confirmation-popup');
		if (existingPopup) {
			existingPopup.style.transition = 'all 0.3s ease';
			existingPopup.style.opacity = '0';
			existingPopup.style.transform = 'translateY(-10px)';
			setTimeout(() => {
				if (existingPopup.parentNode) {
					existingPopup.parentNode.removeChild(existingPopup);
				}
			}, 300);
		}
	}

	private async roundImageFile(file: TFile, radius: number, unit: RadiusUnit, shadow?: ShadowOptions, border?: BorderOptions): Promise<{ blob: Blob; newPath: string }> {
		const folder = file.parent?.path ?? '';
		const base = file.basename;
		const suffix = unit === 'percent' ? `${radius}p` : `${radius}px`;
		const newPath = folder ? `${folder}/${base}-rounded-${suffix}.png` : `${base}-rounded-${suffix}.png`;

		// Create temporary file path for safe processing
		const tempPath = `${newPath}.processing-${Date.now()}`;

		try {
			// Try Python first, process to temporary location
			await this.roundImageWithPython(file.path, tempPath, radius, unit, shadow, border);

			// Verify the temporary file was created and is valid
			const tempFile = this.app.vault.getAbstractFileByPath(tempPath);
			if (!tempFile || !(tempFile instanceof TFile)) {
				throw new Error(`Failed to create temporary processed file: ${tempPath}`);
			}

			// Verify file size is reasonable (not empty/corrupted)
			if (tempFile.stat.size === 0) {
				throw new Error(`Processed file is empty: ${tempPath}`);
			}

			// Read the result from temporary location
			const arrayBuffer = await this.app.vault.readBinary(tempFile);

			// Write to final location (overwrite or create)
			await this.writeRoundedVersion(newPath, new Blob([arrayBuffer], { type: 'image/png' }));
			// Cleanup temp file
			try { await this.app.vault.delete(tempFile as TFile); } catch {}

			return { blob: new Blob([arrayBuffer], { type: 'image/png' }), newPath };

		} catch (pythonError) {
			// Clean up temporary file if it exists
			try {
				const tempFile = this.app.vault.getAbstractFileByPath(tempPath);
				if (tempFile && tempFile instanceof TFile) {
					await this.app.vault.delete(tempFile);
				}
			} catch (cleanupError) {
				console.warn(`Failed to cleanup temporary file ${tempPath}:`, cleanupError);
			}

			// Fallback to Canvas method with same safe approach
			try {
				const result = await this.roundImageWithCanvas(file, radius, unit);
				// Write directly to final location (overwrite or create)
				await this.writeRoundedVersion(newPath, result.blob);
				return { blob: result.blob, newPath };

			} catch (canvasError) {
				// If both methods fail, throw the original error
				throw new Error(`Image processing failed for ${file.path}. Python error: ${pythonError.message}, Canvas error: ${canvasError.message}`);
			}
		}
	}

	private async roundImageWithPython(inputPath: string, outputPath: string, radius: number, unit: RadiusUnit,
		shadow?: ShadowOptions, border?: BorderOptions): Promise<void> {
		const pythonScript = path.join(this.app.vault.configDir, 'plugins', 'image-rounded-frame', 'round_image.py');
		// Use Obsidian's file system methods instead of direct path access
		const inputFile = this.app.vault.getAbstractFileByPath(inputPath) as TFile;
		if (!inputFile) throw new Error(`File not found: ${inputPath}`);
		
		if (!fs.existsSync(pythonScript)) {
			throw new Error('Python script not found. Please ensure round_image.py is in the plugin directory.');
		}
		
		// Get full paths using adapter
		const adapter = this.app.vault.adapter as any;
		const vaultBase = adapter.basePath || '';
		const fullInputPath = vaultBase ? path.join(vaultBase, inputPath) : inputPath;
		const fullOutputPath = vaultBase ? path.join(vaultBase, outputPath) : outputPath;

		// Ensure output directory exists
		const outputDir = path.dirname(fullOutputPath);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}

		// Try python3 first, then python
		let pythonCmd = 'python3';
		try {
			await execAsync(`which python3`);
		} catch {
			pythonCmd = 'python';
		}

		// Build command with effects parameters if provided
		let command = `${pythonCmd} "${pythonScript}" "${fullInputPath}" "${fullOutputPath}" ${radius} ${unit}`;

		if (shadow || border) {
			const shadowEnabled = shadow?.enabled ?? false;
			const shadowColor = shadow?.color ?? '#000000';
			const shadowBlur = shadow?.blur ?? 10;
			const shadowOffset = shadow?.offset ?? 5;

			const borderEnabled = border?.enabled ?? false;
			const borderColor = border?.color ?? '#cccccc';
			const borderWidth = border?.width ?? 2;
			const borderStyle = border?.style ?? 'solid';

			command += ` ${shadowEnabled} "${shadowColor}" ${shadowBlur} ${shadowOffset} ${borderEnabled} "${borderColor}" ${borderWidth} ${borderStyle}`;
		}

		const { stdout, stderr } = await execAsync(command, { timeout: 30000 });

		if (stderr && !stdout.includes('SUCCESS')) {
			throw new Error(`Python error: ${stderr}`);
		}
	}

	private async roundImageWithCanvas(file: TFile, radius: number, unit: RadiusUnit): Promise<{ blob: Blob; newPath: string }> {
		const arrayBuffer = await this.app.vault.readBinary(file);
		const blob = new Blob([arrayBuffer]);
		const img = await this.loadImageFromBlob(blob);
		
		const w = img.naturalWidth;
		const h = img.naturalHeight;
		const baseDimension = Math.min(w, h);
		const maxRadius = baseDimension / 2;
		
		let radiusPx: number;
		if (unit === 'percent') {
			radiusPx = (radius / 100) * baseDimension;
		} else {
			radiusPx = radius;
		}
		radiusPx = Math.min(radiusPx, maxRadius);
		radiusPx = Math.max(0, radiusPx);

		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d')!;
		
		ctx.drawImage(img, 0, 0, w, h);
		ctx.globalCompositeOperation = 'destination-in';
		ctx.beginPath();
		this.drawRoundedRect(ctx, 0, 0, w, h, radiusPx);
		ctx.closePath();
		ctx.fill();

		const roundedBlob: Blob = await new Promise((resolve, reject) => {
			canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
		});

		const folder = file.parent?.path ?? '';
		const base = file.basename;
		const suffix = unit === 'percent' ? `${radius}p` : `${radius}px`;
		const newPath = folder ? `${folder}/${base}-rounded-${suffix}.png` : `${base}-rounded-${suffix}.png`;

		return { blob: roundedBlob, newPath };
	}

	private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
		const rr = Math.min(r, w / 2, h / 2);
		ctx.moveTo(x + rr, y);
		ctx.lineTo(x + w - rr, y);
		ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
		ctx.lineTo(x + w, y + h - rr);
		ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
		ctx.lineTo(x + rr, y + h);
		ctx.quadraticCurveTo(x, y, x + h, y + h - rr);
		ctx.lineTo(x, y + rr);
		ctx.quadraticCurveTo(x, y, x + rr, y);
	}

	private async loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = URL.createObjectURL(blob);
		});
	}

	private async writeRoundedVersion(path: string, blob: Blob): Promise<void> {
		const arrayBuffer = await blob.arrayBuffer();
		const existing = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		
		if (existing) {
			await this.app.vault.modifyBinary(existing, arrayBuffer);
		} else {
			await this.app.vault.createBinary(path, arrayBuffer);
		}
	}

	private updateReference(editor: any, view: MarkdownView, match: ImageMatch, newPath: string): void {
		const finalPath = this.getRelativePathForNote(view, newPath);

		// URL-encode path if it contains spaces (like original might have been)
		const originalPath = match.path;
		let processedPath = finalPath;
		if (originalPath.includes('%20') || originalPath.includes(' ')) {
			processedPath = finalPath.replace(/ /g, '%20');
		}

		const replacement = this.buildReference(match, processedPath);
		editor.replaceRange(replacement, { line: match.lineNumber, ch: match.start }, { line: match.lineNumber, ch: match.end });
	}

	private resolvePreviewSrc(view: MarkdownView, match: ImageMatch): string | null {
		const path = match.path;
		if (/^https?:/i.test(path)) return path;
		const file = view.file;
		const resolved = this.app.metadataCache.getFirstLinkpathDest(path, file?.path ?? '');
		if (resolved) return this.app.vault.getResourcePath(resolved);
		return path;
	}

	private storeLast(radius: number, unit: RadiusUnit): void {
		if (!this.settings.rememberLast) return;
		this.settings.lastUnit = unit;
		if (unit === 'percent') this.settings.lastPercent = radius; else this.settings.lastPx = radius;
		void this.saveSettings();
	}

	private getInitialRadius(): { radius: number; unit: RadiusUnit } {
		const useLast = this.settings.rememberLast;
		const unit = useLast ? this.settings.lastUnit : this.settings.defaultUnit;
		const radius = unit === 'percent'
			? (useLast ? this.settings.lastPercent : this.settings.defaultPercent)
			: (useLast ? this.settings.lastPx : this.settings.defaultPx);
		return { unit, radius };
	}

	private pathsMatch(a: string, b: string): boolean {
		// Decode URL-encoded paths before comparison
		const decode = (value: string) => {
			try {
				return decodeURIComponent(value);
			} catch {
				return value;
			}
		};
		const norm = (value: string) => {
			const decoded = decode(value);
			return decoded.split('?')[0].replace(/\\+/g, '/').toLowerCase().replace(/^\.\//, '');
		};
		const left = norm(a);
		const right = norm(b);
		return left === right || left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
	}

	private escapeAttr(value: string): string {
		return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	private async sleep(ms: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	private async appendDebugLog(event: string, details?: Record<string, any>): Promise<void> {
		try {
			const timestamp = new Date().toISOString();
			let entry = `[${timestamp}] ${event}`;
			if (details) {
				entry += `\n${JSON.stringify(details, null, 2)}`;
			}
			entry += `\n`;

			const existing = this.app.vault.getAbstractFileByPath(this.DEBUG_LOG_PATH) as TFile | null;
			if (existing) {
				const prev = await this.app.vault.read(existing);
				await this.app.vault.modify(existing, prev + entry);
			} else {
				await this.app.vault.create(this.DEBUG_LOG_PATH, entry);
			}
		} catch (e) {
			console.warn('Failed to write debug log:', e);
		}
	}

	private startProgressPopup(total: number): void {
		this.removeProgressPopup();
		const popup = document.createElement('div');
		popup.id = 'rounded-frame-progress-popup';
		popup.style.cssText = `
			position: fixed;
			top: 20px;
			right: 20px;
			background: var(--background-secondary, #f5f5f5);
			border: 1px solid var(--background-modifier-border, #ccc);
			border-radius: 8px;
			padding: 12px 14px;
			box-shadow: 0 4px 12px rgba(0,0,0,0.2);
			z-index: 10000;
			min-width: 260px;
			font-size: 12px;
		`;
		popup.innerHTML = `
			<div style="font-weight:600;margin-bottom:6px;">Processing images…</div>
			<div id="rf-progress-text">0/${total} done (0 success, 0 failed)</div>
			<div id="rf-progress-current" style="margin-top:6px;color:var(--text-muted,#888);"></div>
		`;
		document.body.appendChild(popup);
		this.progressPopup = popup;
	}

	private updateProgressPopup(done: number, success: number, failed: number, total: number, current?: string): void {
		const popup = this.progressPopup;
		if (!popup) return;
		const textEl = popup.querySelector('#rf-progress-text') as HTMLElement | null;
		if (textEl) textEl.textContent = `${done}/${total} done (${success} success, ${failed} failed)`;
		const curEl = popup.querySelector('#rf-progress-current') as HTMLElement | null;
		if (curEl) curEl.textContent = current ? `Current: ${current}` : '';
	}

	private finishProgressPopup(summary: string): void {
		const popup = this.progressPopup;
		if (!popup) return;
		const textEl = popup.querySelector('#rf-progress-text') as HTMLElement | null;
		if (textEl) textEl.textContent = summary;
		setTimeout(() => this.removeProgressPopup(), 1500);
	}

	private removeProgressPopup(): void {
		if (this.progressPopup && this.progressPopup.parentElement) {
			this.progressPopup.parentElement.removeChild(this.progressPopup);
		}
		this.progressPopup = null;
	}

	private async processImagesQueueFromMatches(view: MarkdownView, refreshed: ImageMatch[], radius: number, unit: RadiusUnit, shadow?: ShadowOptions, border?: BorderOptions): Promise<void> {
		// Update styles once
		this.style.updateStyles(radius, unit, shadow, border);

		const total = refreshed.length;
		let done = 0, success = 0, failed = 0;
		const originalPaths: string[] = [];
		const backupPaths: string[] = [];
		const localBackupPaths: string[] = [];
		const newPaths: string[] = [];
        const successMatches: { match: ImageMatch, newPath: string }[] = [];

		this.startProgressPopup(total);

        // Use PromiseQueue for concurrency (limit to 3 concurrent items to prevent freezing)
        const queue = new PromiseQueue(3);
        const tasks: Promise<void>[] = [];

		for (const m of refreshed) {
            tasks.push(queue.add(async () => {
                this.updateProgressPopup(done, success, failed, total, m.path);
                
                try {
                    const file = this.resolveTFile(view, m.path);
                    if (!file) { 
                        await this.appendDebugLog('FILE_NOT_FOUND', { path: m.path, mode: 'note' }); 
                        failed++; done++; this.updateProgressPopup(done, success, failed, total); 
                        return; 
                    }

                    // Ensure readable
                    try { await this.app.vault.readBinary(file); } catch (readErr: any) { await this.appendDebugLog('READ_FAILED', { path: m.path, error: String(readErr) }); failed++; done++; this.updateProgressPopup(done, success, failed, total); return; }

                    // Backups - require at least ONE to succeed
                    const hiddenBackup = await this.createBackup(file.path);
                    const localBackup = await this.createLocalBackup(file.path);
                    if (!hiddenBackup && !localBackup) { await this.appendDebugLog('BACKUP_FAILED', { path: file.path }); failed++; done++; this.updateProgressPopup(done, success, failed, total); return; }

                    try {
                        const { newPath } = await this.roundImageFile(file, radius, unit, shadow, border);
                        const finalFile = this.app.vault.getAbstractFileByPath(newPath);
                        if (!finalFile || !(finalFile instanceof TFile) || finalFile.stat.size === 0) {
                            // cleanup backups since nothing changed
                            if (hiddenBackup) { const f = this.app.vault.getAbstractFileByPath(hiddenBackup) as TFile | null; if (f) await this.app.vault.delete(f); }
                            if (localBackup) { const f2 = this.app.vault.getAbstractFileByPath(localBackup) as TFile | null; if (f2) await this.app.vault.delete(f2); }
                            await this.appendDebugLog('PROCESSING_OUTPUT_INVALID', { source: file.path, output: newPath });
                            failed++; done++; this.updateProgressPopup(done, success, failed, total); return;
                        }

                        // Store success for later batch update
                        successMatches.push({ match: m, newPath });

                        originalPaths.push(file.path);
                        if (hiddenBackup) backupPaths.push(hiddenBackup);
                        if (localBackup) localBackupPaths.push(localBackup);
                        newPaths.push(newPath);
                        success++;
                    } catch (err: any) {
                        // On failure, try to remove backups to avoid clutter if nothing changed
                        try { if (hiddenBackup) { const bf = this.app.vault.getAbstractFileByPath(hiddenBackup) as TFile | null; if (bf) await this.app.vault.delete(bf); } } catch {}
                        try { if (localBackup) { const lbf = this.app.vault.getAbstractFileByPath(localBackup) as TFile | null; if (lbf) await this.app.vault.delete(lbf); } } catch {}
                        await this.appendDebugLog('PROCESSING_EXCEPTION', { path: file.path, error: String(err?.stack || err) });
                        failed++;
                    }

                    done++;
                    this.updateProgressPopup(done, success, failed, total);
                } catch (outer: any) {
                    await this.appendDebugLog('UNEXPECTED_FAILURE_NOTE', { path: m.path, error: String(outer) });
                    failed++; done++;
                    this.updateProgressPopup(done, success, failed, total);
                }
            }));
		}

        // Wait for all tasks
        await Promise.all(tasks);

        // Apply editor updates in batch
        // We need to re-verify line numbers or just trust descending order if document hasn't changed.
        // Since we blocked (await Promise.all), if user didn't edit, it's fine.
        // We should sort successMatches descending to be safe for `replaceRange`
        successMatches.sort((a, b) => {
            if (a.match.lineNumber !== b.match.lineNumber) {
                return b.match.lineNumber - a.match.lineNumber;
            }
            return b.match.start - a.match.start;
        });

        // Apply changes
        if (successMatches.length > 0) {
            view.editor.transaction({
                selections: [],
                changes: successMatches.map(item => {
                    const match = item.match;
                    const finalPath = this.getRelativePathForNote(view, item.newPath);
                    let processedPath = finalPath;
                    if (match.path.includes('%20') || match.path.includes(' ')) {
                        processedPath = finalPath.replace(/ /g, '%20');
                    }
                    const replacement = this.buildReference(match, processedPath);
                    return {
                        from: { line: match.lineNumber, ch: match.start },
                        to: { line: match.lineNumber, ch: match.end },
                        text: replacement
                    };
                })
            });
        }

		if (newPaths.length > 0) {
			this.lastAction = { originalPaths, backupPaths, localBackupPaths, newPaths, notePath: view.file?.path ?? '', timestamp: Date.now() };
			this.showActionConfirmationPopup();
		}

		this.finishProgressPopup(`Completed ${done}/${total}: ${success} success, ${failed} failed`);
		if (failed > 0) { await this.appendDebugLog('SUMMARY_NOTE', { total, success, failed, note: view.file?.path ?? '' }); }
		this.storeLast(radius, unit);
	}

	private async processImageFilesQueue(view: MarkdownView | null, imageFiles: TFile[], radius: number, unit: RadiusUnit, shadow?: ShadowOptions, border?: BorderOptions): Promise<void> {
		this.style.updateStyles(radius, unit, shadow, border);
		const total = imageFiles.length;
		let done = 0, success = 0, failed = 0;
		const originalPaths: string[] = [];
		const backupPaths: string[] = [];
		const localBackupPaths: string[] = [];
		const newPaths: string[] = [];

		this.startProgressPopup(total);

        const queue = new PromiseQueue(3);
        const tasks: Promise<void>[] = [];

		for (const imageFile of imageFiles) {
            tasks.push(queue.add(async () => {
                this.updateProgressPopup(done, success, failed, total, imageFile.path);
                
                try {
                    try { await this.app.vault.readBinary(imageFile); } catch (readErr: any) { await this.appendDebugLog('READ_FAILED', { path: imageFile.path, error: String(readErr) }); failed++; done++; this.updateProgressPopup(done, success, failed, total); return; }
                    const hiddenBackup = await this.createBackup(imageFile.path);
                    const localBackup = await this.createLocalBackup(imageFile.path);
                    if (!hiddenBackup && !localBackup) { await this.appendDebugLog('BACKUP_FAILED', { path: imageFile.path }); failed++; done++; this.updateProgressPopup(done, success, failed, total); return; }

                    try {
                        const { newPath } = await this.roundImageFile(imageFile, radius, unit, shadow, border);
                        const finalFile = this.app.vault.getAbstractFileByPath(newPath);
                        if (!finalFile || !(finalFile instanceof TFile) || finalFile.stat.size === 0) {
                            if (hiddenBackup) { const f = this.app.vault.getAbstractFileByPath(hiddenBackup) as TFile | null; if (f) await this.app.vault.delete(f); }
                            if (localBackup) { const f2 = this.app.vault.getAbstractFileByPath(localBackup) as TFile | null; if (f2) await this.app.vault.delete(f2); }
                            await this.appendDebugLog('PROCESSING_OUTPUT_INVALID', { source: imageFile.path, output: newPath });
                            failed++; done++; this.updateProgressPopup(done, success, failed, total); return;
                        }
                        originalPaths.push(imageFile.path);
                        if (hiddenBackup) backupPaths.push(hiddenBackup);
                        if (localBackup) localBackupPaths.push(localBackup);
                        newPaths.push(newPath);
                        success++;
                    } catch (err: any) {
                        try { if (hiddenBackup) { const bf = this.app.vault.getAbstractFileByPath(hiddenBackup) as TFile | null; if (bf) await this.app.vault.delete(bf); } } catch {}
                        try { if (localBackup) { const lbf = this.app.vault.getAbstractFileByPath(localBackup) as TFile | null; if (lbf) await this.app.vault.delete(lbf); } } catch {}
                        await this.appendDebugLog('PROCESSING_EXCEPTION', { path: imageFile.path, error: String(err?.stack || err) });
                        failed++;
                    }

                    done++;
                    this.updateProgressPopup(done, success, failed, total);
                } catch (outer: any) {
                    await this.appendDebugLog('UNEXPECTED_FAILURE_BULK', { path: imageFile.path, error: String(outer) });
                    failed++; done++;
                    this.updateProgressPopup(done, success, failed, total);
                }
            }));
		}
        
        await Promise.all(tasks);

		if (newPaths.length > 0) {
			this.lastAction = { originalPaths, backupPaths, localBackupPaths, newPaths, notePath: view?.file?.path ?? '', timestamp: Date.now() };
			this.showActionConfirmationPopup();
		}
		this.finishProgressPopup(`Completed ${done}/${total}: ${success} success, ${failed} failed`);
		if (failed > 0) { await this.appendDebugLog('SUMMARY_BULK', { total, success, failed }); }
	}
}
