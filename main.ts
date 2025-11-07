// 1. Load persisted radius defaults and initialise helper utilities before any feature work starts.
// 2. Register both editor and preview context menu hooks so users can trigger rounding from any view.
// 3. Locate markdown, wikilink, and HTML image references to understand which element should be updated.
// 4. Present a modal that lets the user pick radius/unit with immediate visual feedback and easy resets.
// 5. Replace the chosen source with an <img> that uses reusable CSS classes for consistent rounded styling.

import { Plugin, MarkdownView, Menu, TFile, TFolder, Notice } from 'obsidian';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);
import { RoundedFrameSettings, DEFAULT_SETTINGS, RoundedFrameSettingTab, RadiusUnit } from './settings';
import { RoundedStyleManager } from './style-manager';
import { RoundedFrameModal, ShadowOptions, BorderOptions } from './modal';

interface ImageMatch { lineNumber: number; start: number; end: number; path: string; alt: string; raw: string; kind: 'markdown' | 'wikilink' | 'html'; }

export default class ImageRoundedFramePlugin extends Plugin {
	settings!: RoundedFrameSettings;
	private style = new RoundedStyleManager();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.ensureUiStyles();
		this.addSettingTab(new RoundedFrameSettingTab(this.app, this));
		await this.ensurePythonScript();

        // Command: apply to images currently visible in the active view
        this.addCommand({
            id: 'rounded-frame-apply-visible',
            name: 'Rounded frame: apply to visible images',
            checkCallback: (checking) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) return false;
                const visible = this.getVisibleImages(view);
                if (checking) return visible.length > 0;
                if (visible.length === 0) return false;

                const matches: ImageMatch[] = [];
                for (const img of visible) {
                    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                    const m = this.locateMatchBySrc(view, src);
                    if (m) matches.push(m);
                }
                const unique = this.uniqueMatches(matches);
                if (unique.length === 0) return false;

                const first = visible[0];
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
                    onSubmit: (radius, unit, shadow, border) => this.applyRoundedFrameToMatches(view, unique, radius, unit, shadow, border),
                });
                modal.open();
                return true;
            },
        });

        // Command: apply to all images in the current note
        this.addCommand({
            id: 'rounded-frame-apply-all',
            name: 'Rounded frame: apply to all images in note',
            checkCallback: (checking) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) return false;
                const all = this.getAllMatches(view);
                if (checking) return all.length > 0;
                if (all.length === 0) return false;

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
                    onSubmit: (radius, unit, shadow, border) => this.applyRoundedFrameToMatches(view, all, radius, unit, shadow, border),
                });
                modal.open();
                return true;
            },
        });

        // Command: process all images in current subfolder
        this.addCommand({
            id: 'rounded-frame-process-subfolder',
            name: 'Rounded frame: process all images in current subfolder',
            checkCallback: (checking) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view || !view.file) return false;

                if (checking) return true; // Always available if there's an active view

                // Process asynchronously
                this.processSubfolderImages(view);
                return true;
            },
        });

        // Command: process all images in vault
        this.addCommand({
            id: 'rounded-frame-process-vault',
            name: 'Rounded frame: process all images in vault',
            checkCallback: (checking) => {
                if (checking) return true; // Always available

                // Process asynchronously
                this.processVaultImages();
                return true;
            },
        });
	}

	private async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private ensureUiStyles(): void {
		if (document.head.querySelector('#rounded-frame-ui')) return;
		const style = document.createElement('style');
		style.id = 'rounded-frame-ui';
		style.textContent = '.rounded-frame-modal{padding:20px;min-width:360px;}.rounded-frame-unit-row{display:flex;gap:8px;margin-bottom:12px;}.rounded-frame-unit-row button{flex:1;}.rounded-frame-section{margin-bottom:12px;}.rounded-frame-hidden{display:none;}.rounded-frame-slider{width:100%;}.rounded-frame-number{width:100%;}.rounded-frame-preview{text-align:center;margin:16px 0;}.rounded-frame-preview-img{max-width:220px;max-height:220px;border:2px solid var(--background-modifier-border);object-fit:contain;}.rounded-frame-button-row{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;}';
		document.head.appendChild(style);
	}

	private async ensurePythonScript(): Promise<void> {
		const pythonScript = path.join(this.app.vault.configDir, 'plugins', 'image-rounded-frame', 'round_image.py');
		const pluginDir = path.dirname(pythonScript);
		
		if (!fs.existsSync(pluginDir)) {
			fs.mkdirSync(pluginDir, { recursive: true });
		}
		
		// Copy script from plugin directory if it exists
		const sourceScript = path.join(__dirname, 'round_image.py');
		if (fs.existsSync(sourceScript) && !fs.existsSync(pythonScript)) {
			fs.copyFileSync(sourceScript, pythonScript);
			fs.chmodSync(pythonScript, 0o755);
		}
	}

// Right-click integrations removed; command-driven flow only

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

		// Update styles once for all images
		this.style.updateStyles(radius, unit, shadow, border);

		// Process all images and collect the updates
		const updates: Array<{match: ImageMatch, newPath: string, success: boolean}> = [];

		for (const m of refreshed) {
			try {
				const file = this.resolveTFile(view, m.path);
				if (!file) {
					new Notice(`Could not find file: ${m.path}`, 2000);
					continue;
				}

				const { blob, newPath } = await this.roundImageFile(file, radius, unit);
				await this.writeRoundedVersion(newPath, blob);
				updates.push({ match: m, newPath, success: true });
			} catch (err) {
				new Notice(`Failed to round image: ${m.path} - ${err}`, 3000);
				updates.push({ match: m, newPath: '', success: false });
			}
		}

		// Apply all reference updates at once (this helps with position management)
		let positionOffset = 0;
		const sortedUpdates = updates.sort((a, b) => {
			if (a.match.lineNumber !== b.match.lineNumber) {
				return a.match.lineNumber - b.match.lineNumber;
			}
			return a.match.start - b.match.start;
		});

		for (const update of sortedUpdates) {
			if (update.success) {
				// Adjust position based on previous updates in the same line
				const adjustedMatch = {
					...update.match,
					start: update.match.start + positionOffset,
					end: update.match.end + positionOffset
				};
				this.updateReference(editor, view, adjustedMatch, update.newPath);
				new Notice(`Rounded image saved: ${update.newPath}`, 1500);

				// Calculate position offset for next updates in same line
				const oldLength = update.match.end - update.match.start;
				const newPath = this.getRelativePathForNote(view, update.newPath);
				const newRef = this.buildReference(update.match, newPath);
				const newLength = newRef.length;
				positionOffset += newLength - oldLength;
			}
		}

		this.storeLast(radius, unit);
	}

	private async getImagesInCurrentSubfolder(view: MarkdownView): Promise<TFile[]> {
		if (!view.file) return [];

		const currentFile = view.file;
		const currentFolder = currentFile.parent;
		if (!currentFolder) return [];

		const folderPath = currentFolder.path;

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

		console.log(`Scanning ${markdownFiles.length} markdown files in folder ${folder.path}`);

		for (const mdFile of markdownFiles) {
			const content = await this.readFileContent(mdFile);
			if (!content) {
				console.log(`Could not read content of ${mdFile.path}`);
				continue;
			}

			console.log(`Processing ${mdFile.path}, content length: ${content.length}`);

			const imageRefs = this.extractImageReferences(content);
			console.log(`Found ${imageRefs.length} image references in ${mdFile.path}:`, imageRefs);

			for (const imagePath of imageRefs) {
				console.log(`Resolving image path: ${imagePath} from ${mdFile.path}`);
				const resolvedFile = this.resolveImageFile(imagePath, mdFile);
				if (resolvedFile) {
					console.log(`Resolved to: ${resolvedFile.path}`);
					if (!referencedImages.some(img => img.path === resolvedFile.path)) {
						referencedImages.push(resolvedFile);
					}
				} else {
					console.log(`Could not resolve: ${imagePath}`);
				}
			}
		}

		console.log(`Total referenced images found: ${referencedImages.length}`);
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

		console.log('Extracting image references from content...');

		// Markdown image syntax: ![alt](path)
		// Updated regex to capture everything until closing parenthesis
		const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
		let mdMatch;
		while ((mdMatch = mdRegex.exec(content)) !== null) {
			const path = mdMatch[2].trim();
			console.log(`Found markdown image: ${path}`);
			imageRefs.push(path);
		}

		// Wikilink image syntax: ![[path|alt]]
		const wikiRegex = /!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
		let wikiMatch;
		while ((wikiMatch = wikiRegex.exec(content)) !== null) {
			const path = wikiMatch[1].trim();
			console.log(`Found wikilink image: ${path}`);
			imageRefs.push(path);
		}

		// HTML img tags: <img src="path">
		const htmlRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
		let htmlMatch;
		while ((htmlMatch = htmlRegex.exec(content)) !== null) {
			const path = htmlMatch[1].trim();
			console.log(`Found HTML image: ${path}`);
			imageRefs.push(path);
		}

		console.log(`Total image references found: ${imageRefs.length}`);
		return imageRefs;
	}

	private resolveImageFile(imagePath: string, sourceFile: TFile): TFile | null {
		console.log(`Resolving image path: "${imagePath}" from source: "${sourceFile.path}"`);

		// URL-decode the path first
		let decodedPath: string;
		try {
			decodedPath = decodeURIComponent(imagePath);
			console.log(`URL-decoded path: "${decodedPath}"`);
		} catch (error) {
			console.log(`Could not URL-decode path, using original: "${imagePath}"`);
			decodedPath = imagePath;
		}

		// Handle absolute paths
		if (decodedPath.startsWith('/')) {
			try {
				const resolved = this.app.vault.getAbstractFileByPath(decodedPath.substring(1)) as TFile;
				console.log(`Resolved absolute path to: ${resolved?.path || 'null'}`);
				return resolved || null;
			} catch (error) {
				console.log(`Error resolving absolute path: ${error}`);
				return null;
			}
		}

		// Handle relative paths
		if (decodedPath.startsWith('./') || decodedPath.startsWith('../') || !decodedPath.includes('/')) {
			const sourceDir = sourceFile.parent?.path || '';
			console.log(`Source directory: "${sourceDir}"`);
			let resolvedPath = decodedPath;

			if (decodedPath.startsWith('./')) {
				resolvedPath = sourceDir ? `${sourceDir}/${decodedPath.substring(2)}` : decodedPath.substring(2);
			} else if (!decodedPath.includes('/')) {
				resolvedPath = sourceDir ? `${sourceDir}/${decodedPath}` : decodedPath;
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

			console.log(`Constructed resolved path: "${resolvedPath}"`);

			try {
				const file = this.app.vault.getAbstractFileByPath(resolvedPath) as TFile;
				console.log(`File resolved to: ${file?.path || 'null'}`);
				return file || null;
			} catch (error) {
				console.log(`Error resolving relative path: ${error}`);
				return null;
			}
		}

		// Handle other paths (might be relative to vault root)
		try {
			const file = this.app.vault.getAbstractFileByPath(decodedPath) as TFile;
			console.log(`Resolved other path to: ${file?.path || 'null'}`);
			return file || null;
		} catch (error) {
			console.log(`Error resolving other path: ${error}`);
			return null;
		}
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
		this.style.updateStyles(radius, unit, shadow, border);

		let processedCount = 0;
		const totalCount = imageFiles.length;

		for (const imageFile of imageFiles) {
			try {
				// Create a virtual "match" for bulk processing
				const virtualMatch: ImageMatch = {
					lineNumber: 0,
					start: 0,
					end: imageFile.basename.length,
					path: imageFile.path,
					alt: imageFile.basename,
					raw: imageFile.basename,
					kind: 'markdown'
				};

				const { blob, newPath } = await this.roundImageFile(imageFile, radius, unit);
				await this.writeRoundedVersion(newPath, blob);

				// For bulk operations, we don't update references in notes since there are no references to update
				// The images are just processed and saved with rounded versions

				processedCount++;
				if (processedCount % 10 === 0 || processedCount === totalCount) {
					new Notice(`Processed ${processedCount}/${totalCount} images`, 1000);
				}
			} catch (err) {
				console.error(`Failed to process image ${imageFile.path}:`, err);
			}
		}

		new Notice(`Bulk processing complete: ${processedCount}/${totalCount} images processed`, 3000);
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
		const mdRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
		let md: RegExpExecArray | null;
		while ((md = mdRegex.exec(line)) !== null) {
			matches.push({
				lineNumber,
				start: md.index,
				end: md.index + md[0].length,
				path: md[2].trim(),
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
			matches.push({
				lineNumber,
				start: tag.index,
				end: tag.index + raw.length,
				path,
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

	private resolveTFile(view: MarkdownView, link: string): TFile | null {
		if (/^https?:/i.test(link)) return null;
		
		// Decode URL-encoded paths
		let decodedLink = decodeURIComponent(link);
		// Remove leading ./ if present
		decodedLink = decodedLink.replace(/^\.\//, '');
		
		const base = view.file?.path ?? '';
		
		// Try multiple resolution strategies
		let file = this.app.metadataCache.getFirstLinkpathDest(decodedLink, base);
		if (file) return file;
		
		// Try with base path resolution
		file = this.app.metadataCache.getFirstLinkpathDest(decodedLink, base);
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

	private async roundImageFile(file: TFile, radius: number, unit: RadiusUnit): Promise<{ blob: Blob; newPath: string }> {
		const folder = file.parent?.path ?? '';
		const base = file.basename;
		const suffix = unit === 'percent' ? `${radius}p` : `${radius}px`;
		const newPath = folder ? `${folder}/${base}-rounded-${suffix}.png` : `${base}-rounded-${suffix}.png`;

		// Try Python first, fallback to Canvas
		try {
			await this.roundImageWithPython(file.path, newPath, radius, unit);
			// Read the result
			const arrayBuffer = await this.app.vault.readBinary(this.app.vault.getAbstractFileByPath(newPath) as TFile);
			return { blob: new Blob([arrayBuffer], { type: 'image/png' }), newPath };
		} catch (pythonError) {
			// Fallback to Canvas method
			return await this.roundImageWithCanvas(file, radius, unit);
		}
	}

	private async roundImageWithPython(inputPath: string, outputPath: string, radius: number, unit: RadiusUnit): Promise<void> {
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

		const command = `${pythonCmd} "${pythonScript}" "${fullInputPath}" "${fullOutputPath}" ${radius} ${unit}`;
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
		ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
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
}
