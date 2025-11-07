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
	onSubmit: (radius: number, unit: RadiusUnit) => void;
}

export class RoundedFrameModal extends Modal {
	private radius: number;
	private unit: RadiusUnit;

	constructor(app: Modal['app'], private opts: ModalOptions) {
		super(app);
		this.radius = opts.initialRadius;
		this.unit = opts.initialUnit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('rounded-frame-modal');

		contentEl.createEl('h2', { text: 'Rounded frame' });

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
		let previewImg: HTMLImageElement | null = null;
		if (this.opts.imageSrc) {
			previewImg = previewContainer.createEl('img', {
				attr: { src: this.opts.imageSrc, alt: 'Preview image' },
			});
			previewImg.addClass('rounded-frame-preview-img');
		}

		const buttonRow = contentEl.createDiv('rounded-frame-button-row');
		const resetBtn = buttonRow.createEl('button', { text: 'Reset' });
		const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
		const applyBtn = buttonRow.createEl('button', { text: 'Apply' });
		applyBtn.addClass('mod-cta');

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
			if (previewImg) {
				// Calculate border-radius symmetrically based on smaller dimension
				const calcRadius = () => {
					const w = previewImg!.naturalWidth || previewImg!.width || previewImg!.offsetWidth;
					const h = previewImg!.naturalHeight || previewImg!.height || previewImg!.offsetHeight;
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
					previewImg!.style.borderRadius = Math.max(0, radiusPx) + 'px';
				};
				
				if (previewImg.complete) {
					calcRadius();
				} else {
					previewImg.addEventListener('load', calcRadius, { once: true });
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

		percentBtn.addEventListener('click', () => setUnit('percent'));
		pixelBtn.addEventListener('click', () => setUnit('px'));

		percentSlider.addEventListener('input', (evt) => {
			percentRadius = Number((evt.target as HTMLInputElement).value);
			this.radius = percentRadius;
			syncUI();
		});

		pixelInput.addEventListener('input', (evt) => {
			const value = Number((evt.target as HTMLInputElement).value);
			pixelRadius = this.clamp(Number.isFinite(value) ? value : 0, 0, 400);
			this.radius = pixelRadius;
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
			syncUI();
		});

		cancelBtn.addEventListener('click', () => this.close());
		applyBtn.addEventListener('click', () => {
			this.opts.onSubmit(this.radius, this.unit);
			this.close();
		});

		setUnit(this.unit);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private clamp(value: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, value));
	}
}

