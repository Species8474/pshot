/*
 * pshot - the shape tools' CS6 tool modes (options bar: Shape / Path / Pixels).
 * miniPaint draws the shape as a temporary vector layer; in Shape mode it
 * becomes a CS6 shape layer (ps/shape-layers.js),
 * in Path mode a subpath of the Work Path, in Pixels mode it is painted into
 * the active pixel layer. The temporary layer is undone so History shows only
 * the result.
 */

import app from './../app.js';
import config from './../config.js';
import { point } from './paths.js';
import { fitted } from './custom-shapes.js';

const SHAPE_TOOLS = ['rectangle', 'ellipse', 'pentagon', 'line'];
const KAPPA = 0.5522847498;

function ellipse_subpath(x, y, w, h) {
	var cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = rx * KAPPA, ky = ry * KAPPA;
	return { closed: true, pts: [
		{ x: cx, y: y, ix: cx - kx, iy: y, ox: cx + kx, oy: y },
		{ x: x + w, y: cy, ix: x + w, iy: cy - ky, ox: x + w, oy: cy + ky },
		{ x: cx, y: y + h, ix: cx + kx, iy: y + h, ox: cx - kx, oy: y + h },
		{ x: x, y: cy, ix: x, iy: cy + ky, ox: x, oy: cy - ky },
	] };
}

function rect_subpath(x, y, w, h, r) {
	if (!r) {
		return { closed: true, pts: [point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h)] };
	}
	r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
	var k = r * KAPPA;
	var c = (px, py, ix, iy, ox, oy) => ({ x: px, y: py, ix: ix, iy: iy, ox: ox, oy: oy });
	return { closed: true, pts: [
		c(x + r, y, x + r, y, x + r, y), c(x + w - r, y, x + w - r, y, x + w - r + k, y),
		c(x + w, y + r, x + w, y + r - k, x + w, y + r), c(x + w, y + h - r, x + w, y + h - r, x + w, y + h - r + k),
		c(x + w - r, y + h, x + w - r + k, y + h, x + w - r, y + h), c(x + r, y + h, x + r, y + h, x + r - k, y + h),
		c(x, y + h - r, x, y + h - r + k, x, y + h - r), c(x, y + r, x, y + r, x, y + r - k),
	].map((p, i, all) => {
		//incoming handles of the corner arcs
		if (i == 0) p.ix = x + r - k;
		if (i == 2) p.iy = y + r - k;
		if (i == 4) p.ix = x + w - r + k;
		if (i == 6) p.iy = y + h - r + k;
		return p;
	}) };
}

//CS6 Polygon: a regular polygon (Sides) in the dragged box, a vertex at the top
function polygon_subpath(x, y, w, h) {
	var n = Math.max(3, Math.min(100, Math.round(config.TOOL.attributes.sides || 5)));
	var cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2, pts = [];
	for (var i = 0; i < n; i++) {
		var a = -Math.PI / 2 + i * Math.PI * 2 / n;
		pts.push(point(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
	}
	return { closed: true, pts: pts };
}

function install_shape_modes() {
	var pending = null;
	document.addEventListener('mousedown', () => {
		if (!SHAPE_TOOLS.includes(config.TOOL.name)) return;
		var mode = config.TOOL.attributes.shape_mode || 'Shape';
		pending = { mode: mode, before: config.layer, history: app.State.action_history_index };
	}, true);
	document.addEventListener('mouseup', () => {
		if (!pending) return;
		var job = pending;
		pending = null;
		//let the tool finish its own mouseup (async History merge)
		setTimeout(() => convert(job), 60);
	});
}

async function convert(job) {
	var layer = config.layer;
	if (!layer || layer === job.before || !SHAPE_TOOLS.includes(layer.type) || app.State.action_history_index <= job.history) return;
	var w = layer.width, h = layer.height;
	if (!w || !h) return;
	var Paths = app.GUI.Ps_workspace.Paths;
	var subpath = null, pixels = null;
	if (job.mode == 'Shape') {
		var sx0 = Math.min(layer.x, layer.x + w), sy0 = Math.min(layer.y, layer.y + h), sw = Math.abs(w), shh = Math.abs(h);
		var radius = (layer.params && layer.params.radius && (layer.params.radius.value != null ? layer.params.radius.value : layer.params.radius)) || 0;
		var shape_path = null, name = 'Shape', custom = layer.type == 'rectangle' && config.TOOL.attributes.custom;
		if (custom) { shape_path = fitted(custom, sx0, sy0, sw, shh); name = 'Shape'; }
		else if (layer.type == 'rectangle') { shape_path = rect_subpath(sx0, sy0, sw, shh, radius); name = radius ? 'Rounded Rectangle' : 'Rectangle'; }
		else if (layer.type == 'ellipse') { shape_path = ellipse_subpath(sx0, sy0, sw, shh); name = 'Ellipse'; }
		else if (layer.type == 'pentagon') { shape_path = polygon_subpath(sx0, sy0, sw, shh); name = 'Polygon'; }
		else if (layer.type == 'line') {
			//CS6 lines are thin filled rectangles (Weight)
			var len = Math.hypot(w, h) || 1, wt = Math.max(1, (layer.params && layer.params.size) || 1) / 2;
			var nx = -h / len * wt, ny = w / len * wt;
			shape_path = { closed: true, pts: [point(layer.x + nx, layer.y + ny), point(layer.x + w + nx, layer.y + h + ny), point(layer.x + w - nx, layer.y + h - ny), point(layer.x - nx, layer.y - ny)] };
		}
		if (!shape_path) return;
		var p = layer.params || {};
		var line = layer.type == 'line';
		var fill = line ? (layer.color || config.COLOR) : (p.fill === false ? null : (p.fill_color || config.COLOR));
		var stroke = !line && p.border ? { color: p.border_color || '#000000', width: p.border_size || 1 } : null;
		while (app.State.action_history_index > job.history && app.State.can_undo()) {
			await app.State.undo_action();
		}
		app.State.action_history.length = app.State.action_history_index;
		var Shapes = app.GUI.Ps_workspace.Shapes;
		var tool_names = { rectangle: custom ? 'Custom Shape Tool' : 'Rectangle Tool', ellipse: 'Ellipse Tool', line: 'Line Tool', pentagon: 'Polygon Tool' };
		await Shapes.create(Shapes.next_name(name), Array.isArray(shape_path) ? shape_path : [shape_path], fill, stroke, tool_names[layer.type], custom ? 'evenodd' : 'nonzero');
		return;
	}
	if (job.mode == 'Path') {
		var x = Math.min(layer.x, layer.x + w), y = Math.min(layer.y, layer.y + h), aw = Math.abs(w), ah = Math.abs(h);
		if (layer.type == 'rectangle' && config.TOOL.attributes.custom) subpath = fitted(config.TOOL.attributes.custom, x, y, aw, ah);
		else if (layer.type == 'rectangle') subpath = rect_subpath(x, y, aw, ah, (layer.params && layer.params.radius && (layer.params.radius.value || layer.params.radius)) || 0);
		else if (layer.type == 'ellipse') subpath = ellipse_subpath(x, y, aw, ah);
		else if (layer.type == 'line') subpath = { closed: false, pts: [point(layer.x, layer.y), point(layer.x + w, layer.y + h)] };
		else if (layer.type == 'pentagon') subpath = polygon_subpath(x, y, aw, ah);
	}
	if (!subpath) {
		pixels = document.createElement('canvas');
		pixels.width = config.WIDTH;
		pixels.height = config.HEIGHT;
		//CS6 Pixels mode paints with the foreground color
		var as_pixels = Object.assign(Object.create(Object.getPrototypeOf(layer)), layer, {
			color: config.COLOR,
			params: Object.assign({}, layer.params, { fill: true, fill_color: config.COLOR, border: false }),
		});
		if (layer.type == 'rectangle' && config.TOOL.attributes.custom) {
			//custom shapes paint their path with the foreground color
			var cx0 = Math.min(layer.x, layer.x + w), cy0 = Math.min(layer.y, layer.y + h);
			var pctx = pixels.getContext('2d');
			pctx.fillStyle = config.COLOR;
			pctx.fill(app.GUI.Ps_workspace.Shapes.path2d(fitted(config.TOOL.attributes.custom, cx0, cy0, Math.abs(w), Math.abs(h))), 'evenodd');
		}
		else app.Layers.render_object(pixels.getContext('2d'), job.mode == 'Pixels' ? as_pixels : layer);
	}
	//remove the temporary shape layer from the document and History
	while (app.State.action_history_index > job.history && app.State.can_undo()) {
		await app.State.undo_action();
	}
	app.State.action_history.length = app.State.action_history_index;
	if (job.mode == 'Path') {
		//shape tools in Path mode draw into the Work Path, not a targeted shape layer's path
		if (config.ps_path_active == 'layer') config.ps_path_active = -1;
		if (subpath) {
			var ed = Paths.editable();
			(Array.isArray(subpath) ? subpath : [subpath]).forEach(sp => ed.path.subpaths.push(sp));
			await Paths.commit(ed.paths, ed.index, ed.path.subpaths.length == 1 ? 'New Work Path' : 'Add Shape');
		}
		else {
			//polygons: trace the shape
			await Paths.from_selection(0.75, pixels);
		}
		return;
	}
	//Pixels: paint into the active pixel layer
	var target = config.layer;
	if (!target || target.type != 'image' || !target.link) {
		app.GUI.Ps_workspace.status_message('Pixels mode needs a pixel layer.');
		return;
	}
	var out = document.createElement('canvas');
	out.width = target.width_original;
	out.height = target.height_original;
	var octx = out.getContext('2d');
	octx.drawImage(target.link, 0, 0);
	var sx = target.width_original / target.width, sy = target.height_original / target.height;
	octx.setTransform(sx, 0, 0, sy, -target.x * sx, -target.y * sy);
	if (target.ps_lock && target.ps_lock.transparent) octx.globalCompositeOperation = 'source-atop';
	octx.drawImage(pixels, 0, 0);
	var names = { rectangle: 'Rectangle Tool', ellipse: 'Ellipse Tool', pentagon: 'Polygon Tool', line: 'Line Tool' };
	await app.State.do_action(new app.Actions.Bundle_action('shape_pixels', names[layer.type] || 'Shape', [
		new app.Actions.Update_layer_image_action(app.GUI.Ps_workspace.Selection.restrict(out, target), target.id),
	]));
}

export { install_shape_modes };
