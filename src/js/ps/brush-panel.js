/*
 * pshot - CS6 Brush panel (F5): Brush Tip Shape (size, angle, roundness,
 * hardness, spacing), Shape Dynamics (size jitter), Scattering, Transfer
 * (opacity jitter) and the stroke preview. Edits the Brush tool's settings.
 */

import app from './../app.js';
import config from './../config.js';

const SECTIONS = [
	['tip', 'Brush Tip Shape', null],
	['dynamics', 'Shape Dynamics', 'size_jitter'],
	['scatter', 'Scattering', 'scatter'],
	['texture', 'Texture', null],
	['dual', 'Dual Brush', null],
	['color', 'Color Dynamics', null],
	['transfer', 'Transfer', 'opacity_jitter'],
	['pose', 'Brush Pose', null],
	['noise', 'Noise', null],
	['wet', 'Wet Edges', null],
	['buildup', 'Build-up', null],
	['smoothing', 'Smoothing', null],
	['protect', 'Protect Texture', null],
];

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
		var right = '';
		if (this.section == 'tip') {
			right = row('size', 'Size:', 1, 2500, 'px') + row('angle', 'Angle:', -180, 180, '°') + row('roundness', 'Roundness:', 1, 100, '%')
				+ row('hardness', 'Hardness:', 0, 100, '%') + '<label class="ps_adj_check"><input type="checkbox" checked disabled> Spacing</label>' + row('spacing', 'Spacing:', 1, 1000, '%');
		}
		else if (this.section == 'dynamics') right = row('size_jitter', 'Size Jitter:', 0, 100, '%');
		else if (this.section == 'scatter') right = row('scatter', 'Scatter:', 0, 1000, '%');
		else if (this.section == 'transfer') right = row('opacity_jitter', 'Opacity Jitter:', 0, 100, '%') + row('flow', 'Flow:', 1, 100, '%');
		else right = '<div class="ps_typ_hint">Not available in pshot.</div>';
		host.innerHTML = '<div class="ps_brushp">'
			+ '<div class="ps_bp_list"><button type="button" class="ps_bp_presets disabled">Brush Presets</button>'
			+ SECTIONS.map(([k, t, key]) => '<div class="ps_bp_item' + (k == this.section ? ' active' : '') + (k == 'tip' || key ? '' : ' disabled') + '" data-section="' + k + '">'
				+ (k == 'tip' ? '' : '<input type="checkbox"' + (key && a[key] > 0 ? ' checked' : '') + (key ? '' : ' disabled') + ' data-enable="' + (key || '') + '">') + t + '</div>').join('')
			+ '</div><div class="ps_bp_right">' + right + '</div></div>'
			+ '<canvas class="ps_bp_preview" width="300" height="60"></canvas>';
		host.querySelectorAll('.ps_bp_item').forEach((item) => item.addEventListener('click', (e) => {
			if (item.classList.contains('disabled')) return;
			var en = e.target.dataset && e.target.dataset.enable;
			if (en) {
				//unchecking a section turns its effect off
				if (!e.target.checked) attrs()[en] = 0;
				else if (!attrs()[en]) attrs()[en] = en == 'scatter' ? 100 : 50;
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
