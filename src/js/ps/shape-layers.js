/*
 * pshot - CS6 shape layers: a fill color (and optional stroke) shown through a
 * path. layer.type = 'ps_shape', layer.ps_shape = { subpaths, bx, by, bw, bh,
 * fill, stroke: { color, width } }. The path is stored in document
 * coordinates for the box bx/by/bw/bh; the layer's x/y/width/height/rotate
 * (Free Transform) map it to its current place. Saved to PSD as a real shape
 * layer (vectorFill + vectorStroke + vectorMask).
 */

import app from './../app.js';
import config from './../config.js';

function hex_rgb(hex) {
	return { r: parseInt(hex.substr(1, 2), 16), g: parseInt(hex.substr(3, 2), 16), b: parseInt(hex.substr(5, 2), 16) };
}

function rgb_hex(c) {
	if (!c) return '#000000';
	var h = (v) => Math.max(0, Math.min(255, Math.round(v || 0))).toString(16).padStart(2, '0');
	return '#' + h(c.r) + h(c.g) + h(c.b);
}

class Ps_shape_layers_class {

	/**
	 * document-space point mapping for the layer's current geometry
	 */
	mapper(layer) {
		var sh = layer.ps_shape;
		var sx = sh.bw ? layer.width / sh.bw : 1, sy = sh.bh ? layer.height / sh.bh : 1;
		var a = (layer.rotate || 0) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
		var cx = layer.x + layer.width / 2, cy = layer.y + layer.height / 2;
		return (x, y) => {
			var px = layer.x + (x - sh.bx) * sx, py = layer.y + (y - sh.by) * sy;
			if (!a) return [px, py];
			var dx = px - cx, dy = py - cy;
			return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
		};
	}

	/**
	 * the shape's subpaths at the layer's current geometry
	 */
	current_subpaths(layer) {
		var m = this.mapper(layer);
		return layer.ps_shape.subpaths.map(sp => ({
			closed: sp.closed,
			pts: sp.pts.map(p => {
				var a = m(p.x, p.y), i = m(p.ix, p.iy), o = m(p.ox, p.oy);
				return { x: a[0], y: a[1], ix: i[0], iy: i[1], ox: o[0], oy: o[1] };
			}),
		}));
	}

	path2d(subpaths) {
		var p = new Path2D();
		for (var sp of subpaths) {
			var pts = sp.pts;
			if (!pts.length) continue;
			p.moveTo(pts[0].x, pts[0].y);
			var n = sp.closed ? pts.length : pts.length - 1;
			for (var i = 0; i < n; i++) {
				var a = pts[i], b = pts[(i + 1) % pts.length];
				p.bezierCurveTo(a.ox, a.oy, b.ix, b.iy, b.x, b.y);
			}
			if (sp.closed) p.closePath();
		}
		return p;
	}

	render(ctx, layer) {
		var sh = layer.ps_shape;
		if (!sh) return;
		var path = this.path2d(this.current_subpaths(layer));
		ctx.save();
		if (sh.fill) {
			ctx.fillStyle = sh.fill;
			ctx.fill(path);
		}
		if (sh.stroke && sh.stroke.width > 0) {
			ctx.strokeStyle = sh.stroke.color;
			ctx.lineWidth = sh.stroke.width;
			ctx.lineJoin = 'miter';
			ctx.stroke(path);
		}
		ctx.restore();
	}

	/**
	 * a new shape layer from subpaths (document coordinates)
	 */
	async create(name, subpaths, fill, stroke, description) {
		var xs = [], ys = [];
		subpaths.forEach(sp => sp.pts.forEach(p => { xs.push(p.x); ys.push(p.y); }));
		var bx = Math.min.apply(null, xs), by = Math.min.apply(null, ys);
		var bw = Math.max(1, Math.max.apply(null, xs) - bx), bh = Math.max(1, Math.max.apply(null, ys) - by);
		await app.State.do_action(new app.Actions.Bundle_action('shape_layer', description || name, [
			new app.Actions.Insert_layer_action({
				name: name, type: 'ps_shape', x: bx, y: by, width: bw, height: bh, rotate: 0, is_vector: true,
				ps_shape: { subpaths: subpaths, bx: bx, by: by, bw: bw, bh: bh, fill: fill, stroke: stroke },
			}),
		]));
		//CS6: the new shape's path is targeted in the Paths panel
		config.ps_path_active = 'layer';
		app.GUI.GUI_layers.render_layers();
		app.GUI.Ps_workspace.Paths.changed();
	}

	/**
	 * Pen options bar Make: Shape - a shape layer from the active path
	 */
	from_current_path() {
		var path = app.GUI.Ps_workspace.Paths.active();
		if (!path || !path.subpaths.length || config.ps_path_active == 'layer') {
			app.GUI.Ps_workspace.status_message('Make Shape needs an active path.');
			return;
		}
		this.create(this.next_name('Shape'), JSON.parse(JSON.stringify(path.subpaths)), config.COLOR, null, 'New Shape Layer');
	}

	/**
	 * Pen tool in Shape mode: an empty shape layer whose path the pen then draws
	 */
	async create_empty(x, y) {
		await app.State.do_action(new app.Actions.Bundle_action('shape_layer', 'New Shape Layer', [
			new app.Actions.Insert_layer_action({
				name: this.next_name('Shape'), type: 'ps_shape', x: x, y: y, width: 1, height: 1, rotate: 0, is_vector: true,
				ps_shape: { subpaths: [], bx: x, by: y, bw: 1, bh: 1, fill: config.COLOR, stroke: null },
			}),
		]));
		config.ps_path_active = 'layer';
		app.GUI.GUI_layers.render_layers();
	}

	next_name(base) {
		var n = 0;
		var re = new RegExp('^' + base + ' (\\d+)$');
		for (var l of config.layers) { var m = re.exec(l.name || ''); if (m) n = Math.max(n, parseInt(m[1])); }
		return base + ' ' + (n + 1);
	}

	/**
	 * Layer > Layer Content Options (or double-click): the fill color
	 */
	edit_fill(layer) {
		layer = layer || config.layer;
		if (!layer || layer.type != 'ps_shape') return false;
		var sh = layer.ps_shape;
		app.GUI.Ps_workspace.color_dialog('Pick a solid color:', sh.fill || config.COLOR, (hex) => {
			app.State.do_action(new app.Actions.Bundle_action('shape_layer', 'Change Fill Color', [
				new app.Actions.Update_layer_action(layer.id, { ps_shape: Object.assign({}, sh, { fill: hex }) }),
			]));
		});
		return true;
	}

	/**
	 * Layers panel vector mask thumbnail: the shape in white on grey
	 */
	thumb(canvas, layer) {
		var ctx = canvas.getContext('2d');
		var w = canvas.width, h = canvas.height, s = Math.min(w / config.WIDTH, h / config.HEIGHT);
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = '#9a9a9a';
		ctx.fillRect(0, 0, w, h);
		ctx.setTransform(s, 0, 0, s, (w - config.WIDTH * s) / 2, (h - config.HEIGHT * s) / 2);
		ctx.fillStyle = '#ffffff';
		ctx.fill(this.path2d(this.current_subpaths(layer)));
		ctx.setTransform(1, 0, 0, 1, 0, 0);
	}

	// ---------- PSD ----------

	to_psd(layer) {
		var sh = layer.ps_shape;
		var subpaths = this.current_subpaths(layer);
		return {
			vectorFill: sh.fill ? { type: 'color', color: hex_rgb(sh.fill) } : undefined,
			vectorStroke: sh.stroke ? {
				strokeEnabled: true, fillEnabled: !!sh.fill, lineWidth: { units: 'Pixels', value: sh.stroke.width },
				lineAlignment: 'center', content: { type: 'color', color: hex_rgb(sh.stroke.color) }, opacity: 1,
			} : { strokeEnabled: false, fillEnabled: !!sh.fill },
			vectorMask: {
				paths: subpaths.map(sp => ({
					open: !sp.closed, fillRule: 'non-zero', operation: 'combine',
					knots: sp.pts.map(p => ({ linked: false, points: [p.ix, p.iy, p.x, p.y, p.ox, p.oy] })),
				})),
			},
		};
	}

	/**
	 * PSD shape layer -> ps_shape layer settings (or null)
	 */
	from_psd(child) {
		if (!child.vectorMask || !child.vectorFill || child.vectorFill.type != 'color') return null;
		var subpaths = (child.vectorMask.paths || []).map(bp => ({
			closed: !bp.open,
			pts: (bp.knots || []).map(k => ({ ix: k.points[0], iy: k.points[1], x: k.points[2], y: k.points[3], ox: k.points[4], oy: k.points[5] })),
		})).filter(sp => sp.pts.length);
		if (!subpaths.length) return null;
		var xs = [], ys = [];
		subpaths.forEach(sp => sp.pts.forEach(p => { xs.push(p.x); ys.push(p.y); }));
		var bx = Math.min.apply(null, xs), by = Math.min.apply(null, ys);
		var bw = Math.max(1, Math.max.apply(null, xs) - bx), bh = Math.max(1, Math.max.apply(null, ys) - by);
		var vs = child.vectorStroke;
		var stroke = vs && vs.strokeEnabled && vs.content && vs.content.color ? { color: rgb_hex(vs.content.color), width: vs.lineWidth && vs.lineWidth.value != null ? vs.lineWidth.value : 3 } : null;
		var fill = vs && vs.fillEnabled === false ? null : rgb_hex(child.vectorFill.color);
		return {
			name: child.name || 'Shape', type: 'ps_shape', x: bx, y: by, width: bw, height: bh, rotate: 0, is_vector: true,
			ps_shape: { subpaths: subpaths, bx: bx, by: by, bw: bw, bh: bh, fill: fill, stroke: stroke },
		};
	}
}

export default Ps_shape_layers_class;
