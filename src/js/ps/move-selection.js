/*
 * pshot - CS6 Move tool with an active selection: drag moves the selected
 * pixels (leaving transparency / the background color behind), Alt+drag moves
 * a copy. The selection outline moves with them.
 */

import app from './../app.js';
import config from './../config.js';
import { ensure_pixel_layer } from './pixel-layer.js';
import { Base_action } from './../actions/base.js';

class Move_selection_action extends Base_action {
	constructor(selection, mask) {
		super('ps_selection', 'Move Selection');
		this.selection = selection;
		this.mask = mask;
		this.old = null;
	}
	async do() {
		super.do();
		this.old = this.selection.mask;
		this.selection.set_mask_direct(this.mask);
	}
	async undo() {
		super.undo();
		this.selection.set_mask_direct(this.old);
	}
}

function canvas_of(w, h) {
	var c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return c;
}

function is_background(layer) {
	var layers = app.Layers.get_sorted_layers();
	return layer.name == 'Background' && layers[layers.length - 1] === layer;
}

function install_move_selection() {
	var job = null;

	var world = (event) => {
		var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
		return app.Layers.get_world_coords(event.clientX - rect.left, event.clientY - rect.top);
	};

	var compose = (j, dx, dy) => {
		var out = canvas_of(j.w, j.h);
		var ctx = out.getContext('2d');
		ctx.drawImage(j.hole, 0, 0);
		ctx.drawImage(j.piece, Math.round(dx * j.sx), Math.round(dy * j.sy));
		return out;
	};

	document.addEventListener('mousedown', (event) => {
		var selection = app.GUI.Ps_workspace.Selection;
		if (config.TOOL.name != 'select' || !selection.has() || event.button != 0 || config.space_hand) {
			return;
		}
		if (event.target.id != 'canvas_minipaint' && event.target.id != 'main_wrapper') {
			return;
		}
		ensure_pixel_layer();
		var layer = config.layer;
		if (!layer || layer.type != 'image' || !layer.link) {
			return;
		}
		event.stopPropagation();
		event.preventDefault();

		var w = layer.width_original, h = layer.height_original;
		var base = canvas_of(w, h);
		base.getContext('2d').drawImage(layer.link, 0, 0);
		var mask = selection.mask_for_layer(layer);

		var piece = canvas_of(w, h);
		var pctx = piece.getContext('2d');
		pctx.drawImage(base, 0, 0);
		pctx.globalCompositeOperation = 'destination-in';
		pctx.drawImage(mask, 0, 0);

		var hole = canvas_of(w, h);
		var hctx = hole.getContext('2d');
		hctx.drawImage(base, 0, 0);
		if (!event.altKey) {
			hctx.globalCompositeOperation = 'destination-out';
			hctx.drawImage(mask, 0, 0);
			if (is_background(layer)) {
				//moving pixels off the Background reveals the background color
				hctx.globalCompositeOperation = 'destination-over';
				hctx.fillStyle = config.BG_COLOR;
				hctx.fillRect(0, 0, w, h);
			}
		}
		job = {
			layer: layer, w: w, h: h, piece: piece, hole: hole, start: world(event),
			sx: w / layer.width, sy: h / layer.height, dx: 0, dy: 0, copy: event.altKey,
		};
	}, true);

	document.addEventListener('mousemove', (event) => {
		if (!job) {
			return;
		}
		event.stopPropagation();
		var p = world(event);
		job.dx = Math.round(p.x - job.start.x);
		job.dy = Math.round(p.y - job.start.y);
		job.layer.link_canvas = compose(job, job.dx, job.dy);
		app.GUI.Ps_workspace.Selection.offset = { x: job.dx, y: job.dy };
		config.need_render = true;
	}, true);

	document.addEventListener('mouseup', (event) => {
		if (!job) {
			return;
		}
		event.stopPropagation();
		var current = job;
		job = null;
		var selection = app.GUI.Ps_workspace.Selection;
		selection.offset = null;
		delete current.layer.link_canvas;
		if (current.dx == 0 && current.dy == 0) {
			config.need_render = true;
			return;
		}
		var result = compose(current, current.dx, current.dy);
		var moved_mask = canvas_of(selection.mask.width, selection.mask.height);
		moved_mask.getContext('2d').drawImage(selection.mask, current.dx, current.dy);
		app.State.do_action(new app.Actions.Bundle_action('move', current.copy ? 'Move (copy)' : 'Move', [
			new app.Actions.Update_layer_image_action(result, current.layer.id),
			new Move_selection_action(selection, moved_mask),
		]));
	}, true);
}

export { install_move_selection };
