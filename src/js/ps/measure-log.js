/*
 * pshot - CS6 measurement: Image > Analysis > Record Measurements (selection,
 * Ruler or Count source), Set Measurement Scale, Select Data Points, and the
 * Measurement Log panel docked in the bottom bar.
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';

//data points: key, column title, sources it applies to
const POINTS = [
	['label', 'Label', 'all'],
	['date', 'Date and Time', 'all'],
	['document', 'Document', 'all'],
	['source', 'Source', 'all'],
	['scale', 'Scale', 'all'],
	['units', 'Scale Units', 'all'],
	['factor', 'Scale Factor', 'all'],
	['count', 'Count', 'all'],
	['area', 'Area', 'Selection'],
	['perimeter', 'Perimeter', 'Selection'],
	['circularity', 'Circularity', 'Selection'],
	['height', 'Height', 'Selection'],
	['width', 'Width', 'Selection'],
	['gray', 'Gray Value (Mean)', 'Selection'],
	['density', 'Integrated Density', 'Selection'],
	['length', 'Length', 'Ruler'],
	['angle', 'Angle', 'Ruler'],
];

class Ps_measure_log_class {

	constructor() {
		this.rows = [];
		this.selected = new Set();
		this.scale = { pixels: 1, length: 1, units: 'pixels' };
		this.points = POINTS.map(p => p[0]);
		this.next_id = 1;
		this.open = false;
	}

	measure_tool() {
		return app.GUI.GUI_tools.tools_modules.ps_measure.object;
	}

	/**
	 * Image > Analysis > Record Measurements (Shift+Ctrl+M)
	 */
	record() {
		var Selection = app.GUI.Ps_workspace.Selection;
		var tool = this.measure_tool();
		var f = this.scale.length / this.scale.pixels;
		var round = (v) => Math.round(v * 1000) / 1000;
		var doc = app.GUI.Ps_workspace.Documents.current();
		var base = {
			date: new Date().toLocaleString(),
			document: doc.name || 'Untitled',
			scale: this.scale.pixels + ' pixels = ' + round(this.scale.length) + ' ' + this.scale.units,
			units: this.scale.units,
			factor: round(f),
		};
		var row;
		if (Selection.has()) {
			row = Object.assign(base, { source: 'Selection', count: 1 }, this.selection_stats(Selection.mask, f));
		}
		else if (tool.ruler) {
			var m = tool.measure();
			row = Object.assign(base, { source: 'Ruler Tool', count: 1, length: round(m.l * f), angle: round(m.a) });
		}
		else if (tool.counts.length) {
			row = Object.assign(base, { source: 'Count Tool', count: tool.counts.length });
		}
		else {
			app.GUI.Ps_workspace.status_message('Record Measurements needs a selection, a Ruler line or Count markers.');
			return;
		}
		row.id = this.next_id++;
		row.label = 'Measurement ' + row.id;
		this.rows.push(row);
		this.show(true);
	}

	selection_stats(mask, f) {
		var w = mask.width, h = mask.height;
		var m = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
		var flat = document.createElement('canvas');
		flat.width = w;
		flat.height = h;
		app.Layers.convert_layers_to_canvas(flat.getContext('2d'), null, false);
		var img = flat.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
		var inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[(y * w + x) * 4 + 3] > 127;
		var area = 0, gray = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < w; x++) {
				if (!inside(x, y)) continue;
				area++;
				var o = (y * w + x) * 4;
				gray += 0.299 * img[o] + 0.587 * img[o + 1] + 0.114 * img[o + 2];
				if (x < x0) x0 = x;
				if (x > x1) x1 = x;
				if (y < y0) y0 = y;
				if (y > y1) y1 = y;
			}
		}
		var round = (v) => Math.round(v * 1000) / 1000;
		//the length of the traced (simplified) outline
		var perimeter = 0;
		for (var sp of app.GUI.Ps_workspace.Paths.trace_mask(mask, 1.5)) {
			for (var i = 0; i < sp.pts.length; i++) {
				var a = sp.pts[i], b = sp.pts[(i + 1) % sp.pts.length];
				perimeter += Math.hypot(b.x - a.x, b.y - a.y);
			}
		}
		var mean = area ? gray / area : 0;
		return {
			area: round(area * f * f),
			perimeter: round(perimeter * f),
			circularity: perimeter ? round(Math.min(1, 4 * Math.PI * area / (perimeter * perimeter))) : 0,
			height: round((y1 - y0 + 1) * f),
			width: round((x1 - x0 + 1) * f),
			gray: round(mean),
			density: round(mean * area * f * f),
		};
	}

	/**
	 * Image > Analysis > Set Measurement Scale > Default / Custom...
	 */
	set_scale(kind) {
		if (kind != 'custom') {
			this.scale = { pixels: 1, length: 1, units: 'pixels' };
			app.GUI.Ps_workspace.status_message('Measurement scale: 1 pixel = 1 pixel');
			return;
		}
		var tool = this.measure_tool();
		var ruler_len = tool.ruler ? Math.round(tool.measure().l * 100) / 100 : this.scale.pixels;
		var POP = new Dialog_class();
		POP.show({
			title: 'Measurement Scale',
			params: [
				{ name: 'pixels', title: 'Pixel Length:', value: ruler_len },
				{ name: 'length', title: 'Logical Length:', value: this.scale.length },
				{ name: 'units', title: 'Logical Units:', value: this.scale.units },
			],
			on_finish: (p) => {
				var px = parseFloat(p.pixels), len = parseFloat(p.length);
				if (!(px > 0) || !(len > 0)) return;
				this.scale = { pixels: px, length: len, units: String(p.units || 'pixels') };
				this.render();
			},
		});
	}

	/**
	 * Image > Analysis > Select Data Points > Default / Custom...
	 */
	select_points(kind) {
		if (kind != 'custom') {
			this.points = POINTS.map(p => p[0]);
			this.render();
			return;
		}
		var POP = new Dialog_class();
		POP.show({
			title: 'Select Data Points',
			params: POINTS.map(p => ({ name: p[0], title: p[1] + (p[2] != 'all' ? ' (' + p[2] + ')' : ''), value: this.points.includes(p[0]) })),
			on_finish: (params) => {
				this.points = POINTS.map(p => p[0]).filter(k => params[k]);
				this.render();
			},
		});
	}

	/**
	 * Image > Analysis > Place Scale Marker: a group with a bar of the given
	 * logical length and its label, at the bottom left of the document
	 */
	place_scale_marker() {
		var POP = new Dialog_class();
		POP.show({
			title: 'Measurement Scale Marker',
			params: [
				{ name: 'length', title: 'Length:', value: Math.round(this.scale.length * 100) / 100 },
				{ name: 'size', title: 'Font Size (pt):', value: 12 },
				{ name: 'text', title: 'Display Text', value: true },
				{ name: 'position', title: 'Text Position:', values: ['Bottom', 'Top'], value: 'Bottom' },
				{ name: 'color', title: 'Color:', values: ['Black', 'White'], value: 'Black' },
			],
			on_finish: (p) => this.make_marker(parseFloat(p.length), parseFloat(p.size) || 12, p.text, p.position, p.color),
		});
	}

	async make_marker(length, size, show_text, position, color_name) {
		var f = this.scale.length / this.scale.pixels;
		if (!(length > 0)) return;
		var px = Math.max(2, Math.round(length / f));
		var color = color_name == 'White' ? '#ffffff' : '#000000';
		var bar_h = Math.max(2, Math.round(size / 3));
		var margin = Math.round(size);
		var text_h = Math.round(size * 1.4);
		var x = margin, bar_y = config.HEIGHT - margin - bar_h - (show_text && position == 'Bottom' ? text_h : 0);
		var Groups = app.GUI.Ps_workspace.Groups;
		var gid = app.Layers.auto_increment;
		var pt = (a, b) => ({ x: a, y: b, ix: a, iy: b, ox: a, oy: b });
		var bar = [{ closed: true, pts: [pt(x, bar_y), pt(x + px, bar_y), pt(x + px, bar_y + bar_h), pt(x, bar_y + bar_h)] }];
		var actions = [
			new app.Actions.Insert_layer_action({ type: 'ps_group', name: 'Measurement Scale Marker', ps_parent: null }, false),
			new app.Actions.Insert_layer_action({
				name: 'Scale Line', type: 'ps_shape', x: x, y: bar_y, width: px, height: bar_h, rotate: 0, is_vector: true, ps_parent: gid,
				ps_shape: { subpaths: bar, bx: x, by: bar_y, bw: px, bh: bar_h, fill: color, stroke: null },
			}, false),
		];
		if (show_text) {
			var label = (Math.round(length * 1000) / 1000) + ' ' + this.scale.units;
			var ty = position == 'Bottom' ? bar_y + bar_h + 2 : bar_y - text_h - 2;
			actions.push(new app.Actions.Insert_layer_action({
				type: 'text', name: label, x: x, y: ty, width: px, height: text_h, ps_parent: gid,
				params: { boundary: 'box', kerning: 'metrics', text_direction: 'ltr', wrap_direction: 'ttb', halign: 'center', valign: 'top', wrap: 'word' },
				render_function: ['text', 'render'], is_vector: true,
				data: [[{ text: label, meta: { size: size, family: 'Arial', fill_color: color } }]],
			}, false));
		}
		await app.State.do_action(new app.Actions.Bundle_action('scale_marker', 'Place Scale Marker', actions));
		Groups.after_change();
	}

	// ---------- panel (bottom dock) ----------

	toggle() {
		this.show(!this.open);
	}

	show(open) {
		this.open = open;
		var app_el = document.getElementById('ps_app');
		app_el.classList.toggle('bottom_open', open);
		var tab = document.getElementById('ps_tab_measure_log');
		if (open && !tab) {
			tab = document.createElement('button');
			tab.type = 'button';
			tab.className = 'ps_bottomtab';
			tab.id = 'ps_tab_measure_log';
			tab.textContent = 'Measurement Log';
			tab.addEventListener('click', () => this.show(!document.getElementById('ps_app').classList.contains('bottom_open')));
			document.querySelector('#ps_bottombar .ps_bottomtabs').appendChild(tab);
		}
		if (tab) tab.classList.toggle('active', open);
		this.render();
		app.GUI.Ps_workspace.relayout();
	}

	render() {
		var el = document.getElementById('ps_measure_log');
		if (!el || !this.open) return;
		var cols = POINTS.filter(p => this.points.includes(p[0]));
		var esc = (v) => app.GUI.Ps_workspace.Helper.escapeHtml(v == null ? '' : String(v));
		var html = '<div class="ps_mlog_bar">'
			+ '<button type="button" data-a="record">Record Measurements</button>'
			+ '<span class="ps_mlog_spacer"></span>'
			+ '<button type="button" data-a="all" title="Select all measurements">Select All</button>'
			+ '<button type="button" data-a="none" title="Deselect all measurements">Deselect All</button>'
			+ '<button type="button" data-a="export" title="Export selected measurements"' + (this.rows.length ? '' : ' disabled') + '>Export</button>'
			+ '<button type="button" data-a="delete" title="Delete selected measurements"' + (this.selected.size ? '' : ' disabled') + '>Delete</button>'
			+ '</div><div class="ps_mlog_table"><table><thead><tr>'
			+ cols.map(c => '<th>' + c[1] + '</th>').join('') + '</tr></thead><tbody>';
		for (var r of this.rows) {
			html += '<tr data-id="' + r.id + '"' + (this.selected.has(r.id) ? ' class="selected"' : '') + '>' + cols.map(c => '<td>' + esc(r[c[0]]) + '</td>').join('') + '</tr>';
		}
		html += '</tbody></table></div>';
		el.innerHTML = html;
		el.querySelectorAll('tbody tr').forEach(tr => tr.addEventListener('click', (e) => {
			var id = parseInt(tr.dataset.id);
			if (!(e.ctrlKey || e.metaKey || e.shiftKey)) this.selected.clear();
			if (this.selected.has(id)) this.selected.delete(id);
			else this.selected.add(id);
			this.render();
		}));
		el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
			var a = b.dataset.a;
			if (a == 'record') this.record();
			if (a == 'all') { this.rows.forEach(r => this.selected.add(r.id)); this.render(); }
			if (a == 'none') { this.selected.clear(); this.render(); }
			if (a == 'delete') { this.rows = this.rows.filter(r => !this.selected.has(r.id)); this.selected.clear(); this.render(); }
			if (a == 'export') this.export_csv(cols);
		}));
	}

	export_csv(cols) {
		var rows = this.selected.size ? this.rows.filter(r => this.selected.has(r.id)) : this.rows;
		var cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
		var csv = [cols.map(c => cell(c[1])).join(',')].concat(rows.map(r => cols.map(c => cell(r[c[0]])).join(','))).join('\r\n');
		var a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
		a.download = 'Measurement Log.csv';
		document.body.appendChild(a);
		a.click();
		a.remove();
	}
}

export default Ps_measure_log_class;
