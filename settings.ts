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
}

export const DEFAULT_SETTINGS: RoundedFrameSettings = {
	defaultUnit: 'percent',
	defaultPercent: 25,
	defaultPx: 24,
	rememberLast: true,
	lastUnit: 'percent',
	lastPercent: 25,
	lastPx: 24,
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
	}
}

