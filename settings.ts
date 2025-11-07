// 1. Define settings schema and defaults
// 2. Provide tab UI for adjusting defaults and persistence
// 3. Sync user changes back into plugin storage

import { App, PluginSettingTab, Setting } from 'obsidian';
import type ImageRoundedFramePlugin from './main';

export type RadiusUnit = 'percent' | 'px';

export interface RoundedFrameSettings {
	defaultUnit: RadiusUnit;
	defaultPercent: number;
	defaultPx: number;
	rememberLast: boolean;
	lastUnit: RadiusUnit;
	lastPercent: number;
	lastPx: number;
	// New shadow and border options
	enableShadow: boolean;
	shadowColor: string;
	shadowBlur: number;
	shadowOffset: number;
	enableBorder: boolean;
	borderColor: string;
	borderWidth: number;
	borderStyle: 'solid' | 'dashed' | 'dotted';
}

export const DEFAULT_SETTINGS: RoundedFrameSettings = {
	defaultUnit: 'percent',
	defaultPercent: 25,
	defaultPx: 24,
	rememberLast: true,
	lastUnit: 'percent',
	lastPercent: 25,
	lastPx: 24,
	// New shadow and border defaults
	enableShadow: false,
	shadowColor: '#000000',
	shadowBlur: 10,
	shadowOffset: 5,
	enableBorder: false,
	borderColor: '#cccccc',
	borderWidth: 2,
	borderStyle: 'solid',
};

export class RoundedFrameSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: ImageRoundedFramePlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Image Rounded Frame' });

		new Setting(containerEl)
			.setName('Default unit')
			.setDesc('Initial unit whenever you add a rounded frame.')
			.addDropdown((dropdown) => {
				dropdown.addOption('percent', 'Percent').addOption('px', 'Pixels');
				dropdown.setValue(this.plugin.settings.defaultUnit);
				dropdown.onChange(async (value) => {
					this.plugin.settings.defaultUnit = value as RadiusUnit;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Default percent radius')
			.setDesc('Used when unit is percent.')
			.addSlider((slider) => {
				slider
					.setLimits(0, 100, 1)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.defaultPercent);
				slider.onChange(async (value) => {
					this.plugin.settings.defaultPercent = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Default pixel radius')
			.setDesc('Used when unit is pixels.')
			.addText((text) => {
				text
					.setPlaceholder('24')
					.setValue(String(this.plugin.settings.defaultPx))
					.onChange(async (value) => {
						const numeric = Number(value);
						this.plugin.settings.defaultPx = Number.isFinite(numeric) ? Math.max(0, Math.min(400, numeric)) : 0;
						text.setValue(String(this.plugin.settings.defaultPx));
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Remember last used values')
			.setDesc('Reuse the most recent radius and unit until Obsidian restarts.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.rememberLast);
				toggle.onChange(async (value) => {
					this.plugin.settings.rememberLast = value;
					await this.plugin.saveSettings();
				});
			});

		// Shadow settings
		containerEl.createEl('h3', { text: 'Shadow Effects' });

		new Setting(containerEl)
			.setName('Enable shadow')
			.setDesc('Add a shadow effect to rounded images.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.enableShadow);
				toggle.onChange(async (value) => {
					this.plugin.settings.enableShadow = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Shadow color')
			.setDesc('Color of the shadow effect.')
			.addText((text) => {
				text.setValue(this.plugin.settings.shadowColor);
				text.onChange(async (value) => {
					this.plugin.settings.shadowColor = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Shadow blur')
			.setDesc('Blur radius of the shadow (0-50px).')
			.addSlider((slider) => {
				slider
					.setLimits(0, 50, 1)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.shadowBlur);
				slider.onChange(async (value) => {
					this.plugin.settings.shadowBlur = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Shadow offset')
			.setDesc('Offset of the shadow (0-20px).')
			.addSlider((slider) => {
				slider
					.setLimits(0, 20, 1)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.shadowOffset);
				slider.onChange(async (value) => {
					this.plugin.settings.shadowOffset = value;
					await this.plugin.saveSettings();
				});
			});

		// Border settings
		containerEl.createEl('h3', { text: 'Border Effects' });

		new Setting(containerEl)
			.setName('Enable border')
			.setDesc('Add a border around rounded images.')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.enableBorder);
				toggle.onChange(async (value) => {
					this.plugin.settings.enableBorder = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Border color')
			.setDesc('Color of the border.')
			.addText((text) => {
				text.setValue(this.plugin.settings.borderColor);
				text.onChange(async (value) => {
					this.plugin.settings.borderColor = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Border width')
			.setDesc('Width of the border (1-10px).')
			.addSlider((slider) => {
				slider
					.setLimits(1, 10, 1)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.borderWidth);
				slider.onChange(async (value) => {
					this.plugin.settings.borderWidth = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Border style')
			.setDesc('Style of the border.')
			.addDropdown((dropdown) => {
				dropdown.addOption('solid', 'Solid');
				dropdown.addOption('dashed', 'Dashed');
				dropdown.addOption('dotted', 'Dotted');
				dropdown.setValue(this.plugin.settings.borderStyle);
				dropdown.onChange(async (value) => {
					this.plugin.settings.borderStyle = value as 'solid' | 'dashed' | 'dotted';
					await this.plugin.saveSettings();
				});
			});
	}
}

