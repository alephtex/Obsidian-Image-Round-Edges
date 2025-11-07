// 1. Maintain CSS rules for radius/unit combinations
// 2. Ensure base class styling exists once
// 3. Expose helper to register new radius combos on demand
// 4. Handle shadow and border effects

import type { RadiusUnit } from './settings';
import type { ShadowOptions, BorderOptions } from './modal';

const CLASS_NAME = 'rounded-frame-img';

export class RoundedStyleManager {
	private styleEl: HTMLStyleElement;
	private seen = new Set<string>();
	private currentShadow?: ShadowOptions;
	private currentBorder?: BorderOptions;

	constructor() {
		this.styleEl = document.head.querySelector('#rounded-frame-style') as HTMLStyleElement;
		if (!this.styleEl) {
			this.styleEl = document.createElement('style');
			this.styleEl.id = 'rounded-frame-style';
			document.head.appendChild(this.styleEl);
			// Base styling - effects applied dynamically
			this.appendRule(`img.${CLASS_NAME}{display:inline-block;}`);
		}
	}

	ensureRule(unit: 'percent' | 'px', value: number): string {
		// Rule registration kept for compatibility, but actual radius is calculated via JavaScript
		// based on image dimensions to ensure corners point to center
		return CLASS_NAME;
	}

	updateStyles(radius: number, unit: RadiusUnit, shadow?: ShadowOptions, border?: BorderOptions): void {
		this.currentShadow = shadow;
		this.currentBorder = border;

		// Clear existing rules
		while (this.styleEl.firstChild) {
			this.styleEl.removeChild(this.styleEl.firstChild);
		}

		// Build new CSS rule
		let cssRule = `img.${CLASS_NAME} { display: inline-block;`;

		// Add border if enabled
		if (border?.enabled) {
			cssRule += ` border: ${border.width}px solid ${border.color};`;
		}

		// Add shadow if enabled
		if (shadow?.enabled) {
			cssRule += ` box-shadow: ${shadow.offset}px ${shadow.offset}px ${shadow.blur}px ${shadow.color};`;
		}

		cssRule += ` }`;

		this.appendRule(cssRule);
	}

	private appendRule(rule: string) {
		this.styleEl.appendChild(document.createTextNode(`${rule}\n`));
	}
}

