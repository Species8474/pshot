/*
 * pshot - CS6 adjustment / fill / layer style lists shared by the Adjustments
 * panel, the Layers panel buttons and the menus.
 *
 * CS6 creates non-destructive adjustment layers here. pshot doesn't have
 * adjustment layers yet, so each entry runs the matching Image > Adjustments
 * command on the active layer; entries without a target are greyed out.
 */

import app from './../app.js';

function run_target(target, parameter) {
	var parts = target.split('.');
	var module = app.GUI.modules[parts[0]];
	app.GUI.modules['ps/commands'].remember_filter(target);
	module[parts[1]](parameter);
}

const S = 'fill="none" stroke="currentColor" stroke-width="1.2"';

// [name, target, icon] in CS6 Adjustments panel order (two rows)
const ADJUSTMENTS = [
	['Brightness/Contrast', 'ps/commands.brightness_contrast', `<circle cx="9" cy="9" r="3.5" fill="currentColor"/><path d="M9 1.5v2.5M9 14v2.5M1.5 9H4M14 9h2.5M3.7 3.7l1.8 1.8M12.5 12.5l1.8 1.8M3.7 14.3l1.8-1.8M12.5 5.5l1.8-1.8" ${S}/>`, 'brightness_contrast'],
	['Levels', 'ps/commands.levels', `<path d="M1.5 15.5h15M2.5 15V12M4.5 15V8M6.5 15V5M8.5 15V3M10.5 15V6M12.5 15V9M14.5 15v-4" ${S}/>`, 'levels'],
	['Curves', 'ps/commands.curves', `<rect x="2" y="2" width="14" height="14" ${S}/><path d="M2 16C7 15 6 6 16 2" ${S}/>`, 'curves'],
	['Exposure', 'ps/commands.exposure', `<path d="M2 16L16 2V16z" fill="currentColor"/><path d="M4 5.5h4M6 3.5v4M11 13h4" ${S}/>`, 'exposure'],
	['Vibrance', 'ps/commands.vibrance', `<path d="M2 3l7 12.5L16 3z" ${S}/><path d="M5 4.5l4 7.5 4-7.5z" fill="currentColor"/>`, 'vibrance'],
	['Hue/Saturation', 'ps/commands.hue_saturation', `<path d="M2 14L9 3l7 11z" ${S}/><path d="M9 3l7 11H9z" fill="currentColor"/>`, 'hue_saturation'],
	['Color Balance', 'ps/commands.color_balance', `<path d="M9 2v14M3 5.5h12M3 5.5L1 10h4zM15 5.5L13 10h4zM6 16h6" ${S}/>`, 'color_balance'],
	['Black & White', 'effects/black_and_white.black_and_white', `<rect x="2" y="2" width="14" height="14" ${S}/><path d="M2 16L16 2V16z" fill="currentColor"/>`, 'black_white'],
	['Photo Filter', 'ps/commands.photo_filter', `<rect x="1.5" y="5" width="15" height="10" rx="1.5" ${S}/><circle cx="9" cy="10" r="3.2" ${S}/><path d="M6 5l1-2h4l1 2" ${S}/>`, 'photo_filter'],
	['Channel Mixer', 'ps/commands.channel_mixer', `<circle cx="6.5" cy="7" r="4" ${S}/><circle cx="11.5" cy="7" r="4" ${S}/><circle cx="9" cy="11.5" r="4" ${S}/>`, 'channel_mixer'],
	['Color Lookup', null, `<rect x="2" y="2" width="6" height="6" fill="currentColor"/><rect x="10" y="2" width="6" height="6" ${S}/><rect x="2" y="10" width="6" height="6" ${S}/><rect x="10" y="10" width="6" height="6" fill="currentColor"/>`, null],
	['Invert', 'effects/common/invert.invert', `<rect x="2" y="2" width="14" height="14" ${S}/><path d="M2 2h7v14H2z" fill="currentColor"/>`, 'invert'],
	['Posterize', 'image/decrease_colors.decrease_colors', `<path d="M2 16h3.5v-4H9V8h3.5V4H16" ${S}/>`, 'posterize'],
	['Threshold', 'effects/black_and_white.black_and_white', `<path d="M2 14h6V4h8" ${S}/><path d="M8 4v10h8V4z" fill="currentColor"/>`, 'threshold'],
	['Gradient Map', 'ps/commands.gradient_map', `<defs><linearGradient id="psgm" x1="0" x2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".1"/><stop offset="1" stop-color="currentColor"/></linearGradient></defs><rect x="2" y="4" width="14" height="10" fill="url(#psgm)" stroke="currentColor" stroke-width="1"/>`, 'gradient_map'],
	['Selective Color', null, `<circle cx="9" cy="9" r="7" ${S}/><path d="M9 2a7 7 0 0 1 6 3.5L9 9z" fill="currentColor"/><path d="M9 9l-6 3.5A7 7 0 0 0 9 16z" fill="currentColor"/>`, null],
];

const ADJUSTMENT_SEPARATORS_AFTER = ['Exposure', 'Color Lookup'];

function adjustment_items(include_fill) {
	var items = [];
	if (include_fill) {
		items.push({ name: 'Solid Color...', action: () => run_target('ps/commands.new_fill_layer') });
		items.push({ name: 'Gradient...' });
		items.push({ name: 'Pattern...' });
		items.push({ divider: true });
	}
	for (var adj of ADJUSTMENTS) {
		let kind = adj[3];
		var label = adj[0] + (adj[0] == 'Invert' ? '' : '...');
		//CS6: these create adjustment layers
		items.push({ name: label, action: kind ? () => app.GUI.Ps_workspace.Adjustment_layers.create(kind) : null });
		if (ADJUSTMENT_SEPARATORS_AFTER.includes(adj[0])) {
			items.push({ divider: true });
		}
	}
	return items;
}

function layer_style_items() {
	var open = (key) => () => app.GUI.Ps_workspace.Styles.open(null, key);
	return [
		{ name: 'Blending Options...', action: open('blending') },
		{ divider: true },
		{ name: 'Bevel & Emboss...' },
		{ name: 'Stroke...', action: open('stroke') },
		{ name: 'Inner Shadow...', action: open('inner_shadow') },
		{ name: 'Inner Glow...', action: open('inner_glow') },
		{ name: 'Satin...' },
		{ name: 'Color Overlay...', action: open('color_overlay') },
		{ name: 'Gradient Overlay...', action: open('gradient_overlay') },
		{ name: 'Pattern Overlay...' },
		{ name: 'Outer Glow...', action: open('outer_glow') },
		{ name: 'Drop Shadow...', action: open('drop_shadow') },
	];
}

export { ADJUSTMENTS, adjustment_items, layer_style_items, run_target };
