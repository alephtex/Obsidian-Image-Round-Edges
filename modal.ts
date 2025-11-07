// 1. Render modal UI for selecting radius and unit
// 2. Provide live preview and reset logic
// 3. Return chosen radius/unit through callback

import { Modal } from 'obsidian';
import type { RadiusUnit } from './settings';

export interface ModalOptions {
	initialRadius: number;
	initialUnit: RadiusUnit;
	defaultPercent: number;
	defaultPx: number;
	imageSrc?: string;
	imageSources?: string[]; // For multiple image preview
	// Shadow options
	enableShadow?: boolean;
	shadowColor?: string;
	shadowBlur?: number;
	shadowOffset?: number;
	// Border options
	enableBorder?: boolean;
	borderColor?: string;
	borderWidth?: number;
	onSubmit: (radius: number, unit: RadiusUnit, shadow?: ShadowOptions, border?: BorderOptions) => void;
	onUndo?: () => void;
	onRedo?: () => void;
}

export interface ShadowOptions {
	enabled: boolean;
	color: string;
	blur: number;
	offset: number;
}

export interface BorderOptions {
	enabled: boolean;
	color: string;
	width: number;
}

export class RoundedFrameModal extends Modal {
	private radius: number;
	private unit: RadiusUnit;
	private shadow: ShadowOptions;
	private border: BorderOptions;
	private undoStack: Array<{radius: number, unit: RadiusUnit, shadow: ShadowOptions, border: BorderOptions}> = [];
	private redoStack: Array<{radius: number, unit: RadiusUnit, shadow: ShadowOptions, border: BorderOptions}> = [];

	constructor(app: Modal['app'], private opts: ModalOptions) {
		super(app);
		this.radius = opts.initialRadius;
		this.unit = opts.initialUnit;
		this.shadow = {
			enabled: opts.enableShadow ?? false,
			color: opts.shadowColor ?? '#000000',
			blur: opts.shadowBlur ?? 10,
			offset: opts.shadowOffset ?? 5,
		};
		this.border = {
			enabled: opts.enableBorder ?? false,
			color: opts.borderColor ?? '#cccccc',
			width: opts.borderWidth ?? 2,
		};
		this.saveState(); // Initial state for undo
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('rounded-frame-modal');

		contentEl.createEl('h2', { text: 'Rounded frame' });

		// Effect toggles
		const effectRow = contentEl.createDiv('rounded-frame-effect-row');
		const shadowToggle = effectRow.createEl('button', {
			text: 'Shadow',
			attr: { 'data-effect': 'shadow' }
		});
		const borderToggle = effectRow.createEl('button', {
			text: 'Border',
			attr: { 'data-effect': 'border' }
		});

		shadowToggle.classList.toggle('mod-cta', this.shadow.enabled);
		borderToggle.classList.toggle('mod-cta', this.border.enabled);

		const unitRow = contentEl.createDiv('rounded-frame-unit-row');
		const percentBtn = unitRow.createEl('button', { text: 'Percent' });
		const pixelBtn = unitRow.createEl('button', { text: 'Pixels' });

		let percentRadius = this.unit === 'percent' ? this.radius : this.opts.defaultPercent;
		let pixelRadius = this.unit === 'px' ? this.radius : this.opts.defaultPx;

		const percentSection = contentEl.createDiv('rounded-frame-section');
		const percentValue = percentSection.createSpan({ text: `${percentRadius}%` });
		const percentSlider = percentSection.createEl('input', { type: 'range' });
		percentSlider.addClass('rounded-frame-slider');
		percentSlider.min = '0';
		percentSlider.max = '100';
		percentSlider.step = '1';
		percentSlider.value = String(percentRadius);

		const pixelSection = contentEl.createDiv('rounded-frame-section');
		const pixelInput = pixelSection.createEl('input', { type: 'number' });
		pixelInput.addClass('rounded-frame-number');
		pixelInput.min = '0';
		pixelInput.max = '400';
		pixelInput.step = '1';
		pixelInput.value = String(pixelRadius);

		const previewContainer = contentEl.createDiv('rounded-frame-preview');
		let previewImages: HTMLImageElement[] = [];

		// Show multiple images if available, otherwise single image
		const imageSources = this.opts.imageSources || (this.opts.imageSrc ? [this.opts.imageSrc] : []);

		for (const src of imageSources) {
			const img = previewContainer.createEl('img', {
				attr: { src: src, alt: 'Preview image' },
			});
			img.addClass('rounded-frame-preview-img');
			previewImages.push(img);
		}

		const buttonRow = contentEl.createDiv('rounded-frame-button-row');
		const undoBtn = buttonRow.createEl('button', { text: 'Undo' });
		const redoBtn = buttonRow.createEl('button', { text: 'Redo' });
		const resetBtn = buttonRow.createEl('button', { text: 'Reset' });
		const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
		const applyBtn = buttonRow.createEl('button', { text: 'Apply' });
		applyBtn.addClass('mod-cta');

		// Disable undo/redo initially
		undoBtn.disabled = this.undoStack.length <= 1;
		redoBtn.disabled = this.redoStack.length === 0;

		const syncUI = () => {
			if (this.unit === 'percent') {
				percentSection.removeClass('rounded-frame-hidden');
				pixelSection.addClass('rounded-frame-hidden');
				percentSlider.value = String(percentRadius);
				percentValue.setText(`${percentRadius}%`);
			} else {
				pixelSection.removeClass('rounded-frame-hidden');
				percentSection.addClass('rounded-frame-hidden');
				pixelInput.value = String(pixelRadius);
			}
			// Apply styles to all preview images
			for (const img of previewImages) {
				// Calculate border-radius symmetrically based on smaller dimension
				const calcRadius = () => {
					const w = img.naturalWidth || img.width || img.offsetWidth;
					const h = img.naturalHeight || img.height || img.offsetHeight;
					if (!w || !h) return;

					// Use smaller dimension for symmetric rounding
					const baseDimension = Math.min(w, h);
					const maxRadius = baseDimension / 2;

					let radiusPx: number;
					if (this.unit === 'percent') {
						radiusPx = (percentRadius / 100) * baseDimension;
					} else {
						radiusPx = pixelRadius;
					}
					radiusPx = Math.min(radiusPx, maxRadius);

					// Apply all styles
					img.style.borderRadius = Math.max(0, radiusPx) + 'px';

					// Apply shadow if enabled
					if (this.shadow.enabled) {
						img.style.boxShadow = `${this.shadow.offset}px ${this.shadow.offset}px ${this.shadow.blur}px ${this.shadow.color}`;
					} else {
						img.style.boxShadow = '';
					}

					// Apply border if enabled
					if (this.border.enabled) {
						img.style.border = `${this.border.width}px solid ${this.border.color}`;
					} else {
						img.style.border = '';
					}
				};

				if (img.complete) {
					calcRadius();
				} else {
					img.addEventListener('load', calcRadius, { once: true });
				}
			}
		};

		const setUnit = (unit: RadiusUnit) => {
			this.unit = unit;
			this.radius = unit === 'percent' ? percentRadius : pixelRadius;
			percentBtn.toggleClass('mod-cta', unit === 'percent');
			pixelBtn.toggleClass('mod-cta', unit === 'px');
			syncUI();
		};

		// Effect toggles
		shadowToggle.addEventListener('click', () => {
			this.shadow.enabled = !this.shadow.enabled;
			shadowToggle.classList.toggle('mod-cta', this.shadow.enabled);
			this.saveState();
			syncUI();
		});

		borderToggle.addEventListener('click', () => {
			this.border.enabled = !this.border.enabled;
			borderToggle.classList.toggle('mod-cta', this.border.enabled);
			this.saveState();
			syncUI();
		});

		percentBtn.addEventListener('click', () => setUnit('percent'));
		pixelBtn.addEventListener('click', () => setUnit('px'));

		percentSlider.addEventListener('input', (evt) => {
			percentRadius = Number((evt.target as HTMLInputElement).value);
			this.radius = percentRadius;
			this.saveState();
			syncUI();
		});

		pixelInput.addEventListener('input', (evt) => {
			const value = Number((evt.target as HTMLInputElement).value);
			pixelRadius = this.clamp(Number.isFinite(value) ? value : 0, 0, 400);
			this.radius = pixelRadius;
			this.saveState();
			syncUI();
		});

		// Undo/Redo handlers
		undoBtn.addEventListener('click', () => {
			this.undo();
			this.updateUndoRedoButtons(undoBtn, redoBtn);
			syncUI();
		});

		redoBtn.addEventListener('click', () => {
			this.redo();
			this.updateUndoRedoButtons(undoBtn, redoBtn);
			syncUI();
		});

		resetBtn.addEventListener('click', () => {
			if (this.unit === 'percent') {
				percentRadius = this.opts.defaultPercent;
				this.radius = percentRadius;
			} else {
				pixelRadius = this.opts.defaultPx;
				this.radius = pixelRadius;
			}
			this.saveState();
			syncUI();
		});

		cancelBtn.addEventListener('click', () => this.close());
		applyBtn.addEventListener('click', () => {
			this.opts.onSubmit(this.radius, this.unit, this.shadow, this.border);
			this.close();
		});

		setUnit(this.unit);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private saveState(): void {
		const state = {
			radius: this.radius,
			unit: this.unit,
			shadow: { ...this.shadow },
			border: { ...this.border }
		};
		this.undoStack.push(state);
		this.redoStack = []; // Clear redo stack when new action is performed
	}

	private undo(): void {
		if (this.undoStack.length > 1) {
			const currentState = this.undoStack.pop()!;
			this.redoStack.push(currentState);
			const previousState = this.undoStack[this.undoStack.length - 1];
			this.restoreState(previousState);
		}
	}

	private redo(): void {
		if (this.redoStack.length > 0) {
			const state = this.redoStack.pop()!;
			this.undoStack.push(state);
			this.restoreState(state);
		}
	}

	private restoreState(state: {radius: number, unit: RadiusUnit, shadow: ShadowOptions, border: BorderOptions}): void {
		this.radius = state.radius;
		this.unit = state.unit;
		this.shadow = { ...state.shadow };
		this.border = { ...state.border };
	}

	private updateUndoRedoButtons(undoBtn: HTMLButtonElement, redoBtn: HTMLButtonElement): void {
		undoBtn.disabled = this.undoStack.length <= 1;
		redoBtn.disabled = this.redoStack.length === 0;
	}

	private clamp(value: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, value));
	}
}

