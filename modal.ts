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
	borderStyle?: 'solid' | 'dashed' | 'dotted';
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
	style: 'solid' | 'dashed' | 'dotted';
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
			style: opts.borderStyle ?? 'solid',
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

		// Shadow controls section
		const shadowSection = contentEl.createDiv('rounded-frame-shadow-section');
		shadowSection.style.display = this.shadow.enabled ? 'block' : 'none';

		const shadowColorRow = shadowSection.createDiv('rounded-frame-control-row');
		shadowColorRow.createSpan({ text: 'Shadow Color: ' });
		const shadowColorInput = shadowColorRow.createEl('input', { type: 'color' });
		shadowColorInput.value = this.shadow.color;

		const shadowBlurRow = shadowSection.createDiv('rounded-frame-control-row');
		shadowBlurRow.createSpan({ text: 'Blur: ' });
		const shadowBlurValue = shadowBlurRow.createSpan({ text: `${this.shadow.blur}px` });
		const shadowBlurSlider = shadowBlurRow.createEl('input', { type: 'range' });
		shadowBlurSlider.min = '0';
		shadowBlurSlider.max = '50';
		shadowBlurSlider.step = '1';
		shadowBlurSlider.value = String(this.shadow.blur);

		const shadowOffsetRow = shadowSection.createDiv('rounded-frame-control-row');
		shadowOffsetRow.createSpan({ text: 'Offset: ' });
		const shadowOffsetValue = shadowOffsetRow.createSpan({ text: `${this.shadow.offset}px` });
		const shadowOffsetSlider = shadowOffsetRow.createEl('input', { type: 'range' });
		shadowOffsetSlider.min = '0';
		shadowOffsetSlider.max = '20';
		shadowOffsetSlider.step = '1';
		shadowOffsetSlider.value = String(this.shadow.offset);

		// Border controls section
		const borderSection = contentEl.createDiv('rounded-frame-border-section');
		borderSection.style.display = this.border.enabled ? 'block' : 'none';

		const borderColorRow = borderSection.createDiv('rounded-frame-control-row');
		borderColorRow.createSpan({ text: 'Border Color: ' });
		const borderColorInput = borderColorRow.createEl('input', { type: 'color' });
		borderColorInput.value = this.border.color;

		const borderWidthRow = borderSection.createDiv('rounded-frame-control-row');
		borderWidthRow.createSpan({ text: 'Width: ' });
		const borderWidthValue = borderWidthRow.createSpan({ text: `${this.border.width}px` });
		const borderWidthSlider = borderWidthRow.createEl('input', { type: 'range' });
		borderWidthSlider.min = '1';
		borderWidthSlider.max = '10';
		borderWidthSlider.step = '1';
		borderWidthSlider.value = String(this.border.width);

		const borderStyleRow = borderSection.createDiv('rounded-frame-control-row');
		borderStyleRow.createSpan({ text: 'Style: ' });
		const borderStyleSelect = borderStyleRow.createEl('select');
		const solidOption = borderStyleSelect.createEl('option', { text: 'Solid', value: 'solid' });
		const dashedOption = borderStyleSelect.createEl('option', { text: 'Dashed', value: 'dashed' });
		const dottedOption = borderStyleSelect.createEl('option', { text: 'Dotted', value: 'dotted' });
		borderStyleSelect.value = this.border.style;

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
						img.style.border = `${this.border.width}px ${this.border.style} ${this.border.color}`;
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
			shadowSection.style.display = this.shadow.enabled ? 'block' : 'none';
			this.saveState();
			syncUI();
		});

		borderToggle.addEventListener('click', () => {
			this.border.enabled = !this.border.enabled;
			borderToggle.classList.toggle('mod-cta', this.border.enabled);
			borderSection.style.display = this.border.enabled ? 'block' : 'none';
			this.saveState();
			syncUI();
		});

		// Shadow controls
		shadowColorInput.addEventListener('input', (evt) => {
			this.shadow.color = (evt.target as HTMLInputElement).value;
			this.saveState();
			syncUI();
		});

		shadowBlurSlider.addEventListener('input', (evt) => {
			this.shadow.blur = Number((evt.target as HTMLInputElement).value);
			shadowBlurValue.setText(`${this.shadow.blur}px`);
			this.saveState();
			syncUI();
		});

		shadowOffsetSlider.addEventListener('input', (evt) => {
			this.shadow.offset = Number((evt.target as HTMLInputElement).value);
			shadowOffsetValue.setText(`${this.shadow.offset}px`);
			this.saveState();
			syncUI();
		});

		// Border controls
		borderColorInput.addEventListener('input', (evt) => {
			this.border.color = (evt.target as HTMLInputElement).value;
			this.saveState();
			syncUI();
		});

		borderWidthSlider.addEventListener('input', (evt) => {
			this.border.width = Number((evt.target as HTMLInputElement).value);
			borderWidthValue.setText(`${this.border.width}px`);
			this.saveState();
			syncUI();
		});

		borderStyleSelect.addEventListener('change', (evt) => {
			this.border.style = (evt.target as HTMLSelectElement).value as 'solid' | 'dashed' | 'dotted';
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

