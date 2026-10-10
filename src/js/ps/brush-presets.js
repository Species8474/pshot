/*
 * pshot - CS6 brush presets: the default set (round brushes and sampled tips),
 * user presets (Edit > Define Brush Preset, New Brush Preset), the Brush
 * Preset picker grid and the Brush Presets panel.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';
import { tip_canvas, define_tip } from './brush-tips.js';

//Brush panel settings a preset fully defines (others return to these defaults)
const RESET = {
	tip: '', hardness: 100, spacing: 25, angle: 0, roundness: 100, size_jitter: 0, angle_jitter: 0, roundness_jitter: 0,
	scatter: 0, both_axes: false, count: 1, count_jitter: 0, opacity_jitter: 0, color_dynamics: false, noise: false, wet_edges: false,
};

function round_presets() {
	var list = [];
	[1, 3, 5, 9, 13, 19].forEach(s => list.push({ name: 'Soft Round', size: s, hardness: 0 }));
	[1, 3, 5, 9, 13, 19].forEach(s => list.push({ name: 'Hard Round', size: s, hardness: 100 }));
	[5, 11, 17, 21, 27, 35, 45, 65, 100, 200, 300].forEach(s => list.push({ name: 'Soft Round', size: s, hardness: 0 }));
	[9, 13, 19, 17, 45, 65, 100, 200, 300].forEach(s => list.push({ name: 'Hard Round', size: s, hardness: 100 }));
	return list;
}

const DEFAULTS = round_presets().concat([
	...[14, 24, 27, 39, 46, 59].map(s => ({ name: 'Spatter', size: s, tip: 'Spatter', spacing: 25 })),
	...[11, 17, 23, 36, 44, 60].map(s => ({ name: 'Chalk', size: s, tip: 'Chalk', spacing: 25 })),
	...[14, 26, 33, 42, 55, 70].map(s => ({ name: 'Star', size: s, tip: 'Star', spacing: 25 })),
	{ name: 'Dune Grass', size: 112, tip: 'Dune Grass', spacing: 25, size_jitter: 40, angle_jitter: 8 },
	{ name: 'Grass', size: 134, tip: 'Grass', spacing: 25, size_jitter: 40, angle_jitter: 8, scatter: 30 },
	{ name: 'Scattered Maple Leaves', size: 74, tip: 'Maple Leaf', spacing: 70, size_jitter: 60, angle_jitter: 100, scatter: 120, color_dynamics: true },
	{ name: 'Scattered Leaves', size: 95, tip: 'Scattered Leaves', spacing: 50, size_jitter: 40, angle_jitter: 100, scatter: 60 },
	{ name: 'Flowing Stars', size: 42, tip: 'Flowing Stars', spacing: 60, size_jitter: 50, angle_jitter: 100, scatter: 80 },
	{ name: 'Fuzzball', size: 192, tip: 'Fuzzball', spacing: 25 },
]);

var USER = [];
try { USER = JSON.parse(localStorage.getItem('pshot_brush_presets_v1') || '[]'); } catch (e) { USER = []; }

function save_user() {
	try { localStorage.setItem('pshot_brush_presets_v1', JSON.stringify(USER)); } catch (e) { /* storage blocked */ }
}

function brush_attrs() {
	return config.TOOLS.find(t => t.name == 'brush').attributes;
}

class Ps_brush_presets_class {

	list() {
		return DEFAULTS.concat(USER);
	}

	/**
	 * a preset applies its tip and dynamics to the Brush tool, and its size and
	 * hardness to the current painting tool
	 */
	apply(preset) {
		var a = brush_attrs();
		Object.assign(a, RESET, preset);
		delete a.name;
		var t = config.TOOL.attributes;
		if (t !== a) {
			if ('size' in t) t.size = preset.size;
			if ('hardness' in t) t.hardness = preset.hardness == null ? 100 : preset.hardness;
		}
		this.current = preset;
		app.GUI.Ps_workspace.Options_bar.render();
		this.render();
		var bp = document.getElementById('ps_brush_panel');
		if (bp && bp.closest('.ps_popout')) app.GUI.Ps_workspace.Brush_panel.render(bp);
	}

	/**
	 * a small preview of the preset's tip
	 */
	thumb(preset, px) {
		var c = document.createElement('canvas');
		c.width = c.height = px;
		var g = c.getContext('2d');
		var s = Math.max(2, Math.min(px - 4, preset.size * (preset.size > px - 4 ? (px - 4) / preset.size : 1)));
		g.fillStyle = '#000';
		if (preset.tip) {
			var tip = tip_canvas(preset.tip);
			if (tip) {
				var k = (px - 6) / Math.max(tip.width, tip.height);
				g.drawImage(tip, (px - tip.width * k) / 2, (px - tip.height * k) / 2, tip.width * k, tip.height * k);
			}
		}
		else {
			var r = s / 2;
			var grad = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, Math.max(0.5, r));
			var hard = preset.hardness == null ? 100 : preset.hardness;
			grad.addColorStop(0, '#000');
			grad.addColorStop(Math.min(0.999, hard / 100), '#000');
			grad.addColorStop(1, 'rgba(0,0,0,0)');
			g.fillStyle = grad;
			g.beginPath();
			g.arc(px / 2, px / 2, Math.max(0.5, r), 0, Math.PI * 2);
			g.fill();
		}
		return c;
	}

	/**
	 * preset cells (picker grid / panel list) in `host`
	 */
	fill(host, list_mode) {
		host.innerHTML = '';
		this.list().forEach((p, i) => {
			var cell = document.createElement('div');
			cell.className = list_mode ? 'ps_bpre_row' : 'ps_bpre_cell';
			cell.title = p.name + ' ' + p.size;
			var th = this.thumb(p, list_mode ? 30 : 34);
			th.className = 'ps_bpre_thumb';
			cell.appendChild(th);
			var label = document.createElement('span');
			label.className = 'ps_bpre_size';
			label.textContent = list_mode ? p.name + ' ' + p.size : p.size;
			cell.appendChild(label);
			if (this.current === p) cell.classList.add('active');
			cell.addEventListener('click', () => this.apply(p));
			if (i >= DEFAULTS.length) {
				cell.addEventListener('contextmenu', (e) => {
					e.preventDefault();
					if (confirm('Delete the brush preset "' + p.name + '"?')) this.remove(p);
				});
			}
			host.appendChild(cell);
		});
	}

	user_list() {
		return USER;
	}

	rename(preset, name) {
		if (USER.includes(preset) && name) {
			preset.name = name;
			save_user();
		}
	}

	import_presets(list) {
		for (var p of list || []) USER.push(p);
		save_user();
	}

	remove(preset) {
		var i = USER.indexOf(preset);
		if (i < 0) return;
		USER.splice(i, 1);
		save_user();
		if (this.current === preset) this.current = null;
		this.render();
	}

	/**
	 * the Brush tool's current settings as a new preset
	 */
	new_preset() {
		var POP = new Dialog_class();
		POP.show({
			title: 'Brush Name',
			params: [{ name: 'name', title: 'Name:', value: 'Brush ' + (USER.length + 1) }],
			on_finish: (p) => {
				var a = brush_attrs(), preset = { name: p.name || 'Brush', size: a.size };
				for (var k in RESET) if (a[k] !== RESET[k] && a[k] !== undefined) preset[k] = a[k];
				USER.push(preset);
				save_user();
				this.current = preset;
				this.render();
			},
		});
	}

	/**
	 * Edit > Define Brush Preset: the selection (or the whole image) as a sampled tip
	 */
	define() {
		var Selection = app.GUI.Ps_workspace.Selection;
		var flat = document.createElement('canvas');
		flat.width = config.WIDTH;
		flat.height = config.HEIGHT;
		var fctx = flat.getContext('2d', { willReadFrequently: true });
		app.Layers.convert_layers_to_canvas(fctx, null, false);
		var x = 0, y = 0, w = config.WIDTH, h = config.HEIGHT;
		if (Selection.has() && Selection.bounds) {
			var b = Selection.bounds;
			x = b.x; y = b.y; w = b.width; h = b.height;
			//outside the selection counts as white
			fctx.globalCompositeOperation = 'destination-in';
			fctx.drawImage(Selection.mask, 0, 0);
			fctx.globalCompositeOperation = 'source-over';
		}
		//trim the white (and transparent) margin
		var d = fctx.getImageData(x, y, w, h).data, x0 = w, y0 = h, x1 = -1, y1 = -1;
		for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
			var o = (yy * w + xx) * 4;
			if (d[o + 3] > 8 && (d[o] < 250 || d[o + 1] < 250 || d[o + 2] < 250)) {
				if (xx < x0) x0 = xx;
				if (xx > x1) x1 = xx;
				if (yy < y0) y0 = yy;
				if (yy > y1) y1 = yy;
			}
		}
		if (x1 < 0) {
			app.GUI.Ps_workspace.status_message('Could not define the brush because the area is empty (white).');
			return;
		}
		var tw = x1 - x0 + 1, th = y1 - y0 + 1;
		var k = Math.min(1, 2500 / Math.max(tw, th));
		var crop = document.createElement('canvas');
		crop.width = Math.max(1, Math.round(tw * k));
		crop.height = Math.max(1, Math.round(th * k));
		crop.getContext('2d').drawImage(flat, x + x0, y + y0, tw, th, 0, 0, crop.width, crop.height);
		var POP = new Dialog_class();
		POP.show({
			title: 'Brush Name',
			params: [{ name: 'name', title: 'Name:', value: 'Sampled Brush ' + (USER.length + 1) }],
			on_finish: (p) => {
				var name = p.name || 'Sampled Brush';
				define_tip(name, crop);
				var preset = { name: name, size: Math.max(crop.width, crop.height), tip: name, spacing: 25 };
				USER.push(preset);
				save_user();
				this.apply(preset);
				app.GUI.Ps_workspace.status_message('Brush preset "' + name + '" defined.');
			},
		});
	}

	// ---------- Brush Presets panel ----------

	render() {
		var el = document.getElementById('ps_brush_presets');
		if (!el || !el.closest('.ps_popout, .ps_panel.active')) return;
		var a = brush_attrs();
		el.innerHTML = '<div class="ps_bpre_top"><span>Size:</span><input type="range" min="1" max="2500" value="' + a.size + '"><span class="ps_bpre_px">' + a.size + ' px</span></div>'
			+ '<div class="ps_bpre_list"></div>'
			+ '<div class="ps_panel_footer"><button type="button" data-a="panel" title="Toggle the Brush panel">&#9998;</button>'
			+ '<button type="button" data-a="new" title="Create new brush">&#43;</button>'
			+ '<button type="button" data-a="delete" title="Delete brush"' + (this.current && USER.includes(this.current) ? '' : ' class="disabled"') + '>&#128465;</button></div>';
		this.fill(el.querySelector('.ps_bpre_list'), true);
		var range = el.querySelector('input[type=range]');
		range.addEventListener('input', () => {
			a.size = parseInt(range.value);
			if ('size' in config.TOOL.attributes) config.TOOL.attributes.size = a.size;
			el.querySelector('.ps_bpre_px').textContent = a.size + ' px';
		});
		range.addEventListener('change', () => app.GUI.Ps_workspace.Options_bar.render());
		el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
			if (b.classList.contains('disabled')) return;
			if (b.dataset.a == 'panel') app.GUI.Ps_workspace.toggle_panel('brush');
			if (b.dataset.a == 'new') this.new_preset();
			if (b.dataset.a == 'delete') this.remove(this.current);
		}));
	}
}

export default Ps_brush_presets_class;
