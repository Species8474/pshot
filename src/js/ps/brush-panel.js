/*
 * pshot - CS6 Brush panel (F5): Brush Tip Shape (size, angle, roundness,
 * hardness, spacing), Shape Dynamics (size / angle / roundness jitter),
 * Scattering (both axes, count), Color Dynamics, Transfer, Noise, Wet Edges
 * and the stroke preview. Edits the Brush tool's settings.
 */

import app from './../app.js';
import config from './../config.js';
import Patterns from './patterns.js';
import { tip_names } from './brush-tips.js';

//[id, title, enable: attribute keys that are on when > 0 / true]
const SECTIONS = [
	['tip', 'Brush Tip Shape', null],
	['dynamics', 'Shape Dynamics', ['size_jitter', 'angle_jitter', 'roundness_jitter']],
	['scatter', 'Scattering', ['scatter']],
	['texture', 'Texture', ['texture']],
	['dual', 'Dual Brush', ['dual']],
	['color', 'Color Dynamics', ['color_dynamics']],
	['transfer', 'Transfer', ['opacity_jitter']],
	['pose', 'Brush Pose', ['pose']],
	['noise', 'Noise', ['noise']],
	['wet', 'Wet Edges', ['wet_edges']],
	['buildup', 'Build-up', ['airbrush']],
	['smoothing', 'Smoothing', ['smoothing']],
	['protect', 'Protect Texture', ['protect_texture']],
];
//turning a section on gives it a visible default
const ON = { size_jitter: 50, scatter: 100, opacity_jitter: 50, color_dynamics: true, noise: true, wet_edges: true, texture: true, dual: true, pose: true, airbrush: true, smoothing: true, protect_texture: true };

function attrs() {
	return config.TOOLS.find(t => t.name == 'brush').attributes;
}

class Ps_brush_panel_class {

	constructor() {
		this.section = 'tip';
	}

	render(host) {
		var a = attrs();
		var row = (key, label, min, max, unit) => '<div class="ps_bp_field"><span>' + label + '</span><input type="range" data-key="' + key + '" min="' + min + '" max="' + max + '" value="' + a[key] + '"><input type="number" data-num="' + key + '" min="' + min + '" max="' + max + '" value="' + a[key] + '"><span class="ps_bp_unit">' + (unit || '') + '</span></div>';
		var check = (key, label) => '<label class="ps_adj_check"><input type="checkbox" data-check="' + key + '"' + (a[key] ? ' checked' : '') + '> ' + label + '</label>';
		var sel = (key, label, values) => '<div class="ps_bp_field"><span>' + label + '</span><select data-sel="' + key + '">' + values.map(v => '<option' + (a[key] == v || (!a[key] && v == values[0]) ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></div>';
		var right = '';
		if (this.section == 'tip') {
			right = row('size', 'Size:', 1, 2500, 'px') + row('angle', 'Angle:', -180, 180, '°') + row('roundness', 'Roundness:', 1, 100, '%')
				+ row('hardness', 'Hardness:', 0, 100, '%') + '<label class="ps_adj_check"><input type="checkbox" class="ps_bp_spacing_on"' + (a.spacing_off ? '' : ' checked') + '> Spacing</label>' + row('spacing', 'Spacing:', 1, 1000, '%');
		}
		else if (this.section == 'dynamics') right = row('size_jitter', 'Size Jitter:', 0, 100, '%') + row('angle_jitter', 'Angle Jitter:', 0, 100, '%')
			+ row('roundness_jitter', 'Roundness Jitter:', 0, 100, '%') + row('min_roundness', 'Minimum Roundness:', 1, 100, '%');
		else if (this.section == 'scatter') right = row('scatter', 'Scatter:', 0, 1000, '%') + check('both_axes', 'Both Axes') + row('count', 'Count:', 1, 16, '') + row('count_jitter', 'Count Jitter:', 0, 100, '%');
		else if (this.section == 'color') right = row('fgbg_jitter', 'Foreground/Background Jitter:', 0, 100, '%') + row('hue_jitter', 'Hue Jitter:', 0, 100, '%')
			+ row('sat_jitter', 'Saturation Jitter:', 0, 100, '%') + row('bright_jitter', 'Brightness Jitter:', 0, 100, '%') + row('purity', 'Purity:', -100, 100, '%');
		else if (this.section == 'transfer') right = row('opacity_jitter', 'Opacity Jitter:', 0, 100, '%') + row('flow', 'Flow:', 1, 100, '%');
		else if (this.section == 'texture') {
			right = sel('texture_pattern', 'Pattern:', Patterns.names()) + check('texture_invert', 'Invert') + row('texture_scale', 'Scale:', 1, 1000, '%')
				+ '<label class="ps_adj_check"><input type="checkbox" checked disabled> Texture Each Tip</label>'
				+ sel('texture_mode', 'Mode:', ['Multiply', 'Subtract', 'Darken', 'Overlay', 'Color Dodge', 'Color Burn', 'Linear Burn', 'Hard Mix', 'Linear Height', 'Height']) + row('texture_depth', 'Depth:', 0, 100, '%');
		}
		else if (this.section == 'dual') {
			var tips = ['Round'].concat(tip_names());
			right = sel('dual_mode', 'Mode:', ['Multiply', 'Darken', 'Overlay', 'Color Dodge', 'Color Burn', 'Linear Burn', 'Hard Mix'])
				+ '<div class="ps_bp_field"><span>Tip:</span><select data-sel="dual_tip">' + tips.map(t => '<option value="' + (t == 'Round' ? '' : t) + '"' + ((a.dual_tip || '') == (t == 'Round' ? '' : t) ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>'
				+ row('dual_size', 'Size:', 1, 2500, 'px') + row('dual_spacing', 'Spacing:', 1, 1000, '%') + row('dual_scatter', 'Scatter:', 0, 1000, '%') + row('dual_count', 'Count:', 1, 16, '');
		}
		else if (this.section == 'pose') right = '<div class="ps_bp_field"><span>Tilt X / Y:</span><input type="number" value="0" disabled><input type="number" value="0" disabled></div>'
			+ row('pose_angle', 'Rotation:', -180, 180, '°') + row('pose_roundness', 'Roundness:', 1, 100, '%') + row('pose_pressure', 'Pressure:', 1, 100, '%');
		else if (this.section == 'buildup') right = '<div class="ps_typ_hint">Paint keeps building up while the pointer rests (the airbrush button in the options bar).</div>';
		else if (this.section == 'smoothing') right = '<div class="ps_typ_hint">Smooths the curves of brush strokes.</div>';
		else if (this.section == 'protect') right = '<div class="ps_typ_hint">Keeps the current texture when another brush preset is chosen.</div>';
		else if (this.section == 'noise') right = '<div class="ps_typ_hint">Adds randomness to the soft edges of the brush tip.</div>';
		else if (this.section == 'wet') right = '<div class="ps_typ_hint">Paint builds up along the edges of the brush stroke, like watercolor.</div>';
		else right = '<div class="ps_typ_hint">Not available in pshot.</div>';
		host.innerHTML = '<div class="ps_brushp">'
			+ '<div class="ps_bp_list"><button type="button" class="ps_bp_presets">Brush Presets</button>'
			+ SECTIONS.map(([k, t, keys]) => '<div class="ps_bp_item' + (k == this.section ? ' active' : '') + (k == 'tip' || keys ? '' : ' disabled') + '" data-section="' + k + '">'
				+ (k == 'tip' ? '' : '<input type="checkbox"' + (keys && keys.some(x => a[x] === true || a[x] > 0) ? ' checked' : '') + (keys ? '' : ' disabled') + ' data-enable="' + (keys ? keys.join(',') : '') + '">') + t + '</div>').join('')
			+ '</div><div class="ps_bp_right">' + right + '</div></div>'
			+ '<canvas class="ps_bp_preview" width="300" height="60"></canvas>';
		host.querySelector('.ps_bp_presets').addEventListener('click', () => app.GUI.Ps_workspace.toggle_panel('brush_presets'));
		host.querySelectorAll('.ps_bp_item').forEach((item) => item.addEventListener('click', (e) => {
			if (item.classList.contains('disabled')) return;
			var en = e.target.dataset && e.target.dataset.enable;
			if (en) {
				//unchecking a section turns its effect off
				var keys = en.split(',');
				if (!e.target.checked) keys.forEach(x => { attrs()[x] = typeof attrs()[x] == 'boolean' ? false : 0; });
				else attrs()[keys[0]] = ON[keys[0]];
				this.section = item.dataset.section;
				this.changed(host);
				return;
			}
			this.section = item.dataset.section;
			this.render(host);
		}));
		var set = (key, v) => {
			if (isNaN(v)) return;
			attrs()[key] = v;
			host.querySelectorAll('[data-key="' + key + '"], [data-num="' + key + '"]').forEach(i => { i.value = v; });
			this.preview(host);
			if (config.TOOL.name == 'brush') app.GUI.GUI_tools.show_action_attributes();
		};
		host.querySelectorAll('[data-key]').forEach(i => i.addEventListener('input', () => set(i.dataset.key, parseFloat(i.value))));
		host.querySelectorAll('[data-num]').forEach(i => i.addEventListener('change', () => set(i.dataset.num, parseFloat(i.value))));
		host.querySelectorAll('[data-check]').forEach(i => i.addEventListener('change', () => { attrs()[i.dataset.check] = i.checked; this.preview(host); }));
		//Spacing off: the dabs follow the pointer's own samples (faster strokes spread them)
		var sp_on = host.querySelector('.ps_bp_spacing_on');
		if (sp_on) sp_on.addEventListener('change', () => { attrs().spacing_off = !sp_on.checked; this.preview(host); });
		host.querySelectorAll('[data-sel]').forEach(i => i.addEventListener('change', () => { attrs()[i.dataset.sel] = i.value; this.preview(host); }));
		this.preview(host);
	}

	changed(host) {
		this.render(host);
		if (config.TOOL.name == 'brush') app.GUI.GUI_tools.show_action_attributes();
	}

	/**
	 * the CS6 stroke preview at the bottom of the panel
	 */
	preview(host) {
		var canvas = host.querySelector('.ps_bp_preview');
		if (!canvas) return;
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		var brush = app.GUI.GUI_tools.tools_modules.brush;
		if (!brush) return;
		var params = Object.assign({}, attrs());
		params.size = Math.min(40, params.size);
		var pts = [];
		for (var x = 20; x <= 280; x += 4) pts.push([x, 30 + Math.sin((x - 20) / 260 * Math.PI * 2) * 12, params.size]);
		var layer = { x: 0, y: 0, data: [pts], params: params, color: '#000000' };
		if (brush.object.use_dabs(params)) {
			ctx.save();
			brush.object.render_dabs(ctx, pts, params, '#000000');
			ctx.restore();
		}
		else {
			brush.object.render(ctx, layer);
		}
	}
}

export default Ps_brush_panel_class;
