// 1. Maintain CSS rules for radius/unit combinations
// 2. Ensure base class styling exists once
// 3. Expose helper to register new radius combos on demand

const CLASS_NAME = 'rounded-frame-img';

export class RoundedStyleManager {
	private styleEl: HTMLStyleElement;
	private seen = new Set<string>();

	constructor() {
		this.styleEl = document.head.querySelector('#rounded-frame-style') as HTMLStyleElement;
		if (!this.styleEl) {
			this.styleEl = document.createElement('style');
			this.styleEl.id = 'rounded-frame-style';
			document.head.appendChild(this.styleEl);
			// Base styling - border-radius applied dynamically via JavaScript
			this.appendRule(`img.${CLASS_NAME}{display:inline-block;border:2px solid var(--background-modifier-border);}`);
		}
	}

	ensureRule(unit: 'percent' | 'px', value: number): string {
		// Rule registration kept for compatibility, but actual radius is calculated via JavaScript
		// based on image dimensions to ensure corners point to center
		return CLASS_NAME;
	}

	private appendRule(rule: string) {
		this.styleEl.appendChild(document.createTextNode(`${rule}\n`));
	}
}

