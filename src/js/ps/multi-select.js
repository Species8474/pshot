/*
 * pshot - CS6 multiple layer selection.
 *
 * miniPaint has one active layer (config.layer). The extra selected layers are
 * kept in `ids`, which is only valid while it contains the active layer: any
 * other way of changing the active layer (keyboard, new layer, undo) drops the
 * multiple selection by itself.
 */

import app from './../app.js';
import config from './../config.js';

class Ps_multi_select_class {

	constructor() {
		this.ids = [];
	}

	groups() {
		return app.GUI.Ps_workspace.Groups;
	}

	/**
	 * selected layers, top first (Layers panel order)
	 */
	selected() {
		if (!config.layer) return [];
		if (this.ids.length < 2 || !this.ids.includes(config.layer.id)) {
			return [config.layer];
		}
		return this.groups().ordered().filter(l => this.ids.includes(l.id));
	}

	is_selected(layer) {
		return this.selected().includes(layer);
	}

	multiple() {
		return this.selected().length > 1;
	}

	clear() {
		this.ids = [];
	}

	/**
	 * Layers panel click on a row. Returns true when handled here.
	 */
	click(layer, event) {
		var ctrl = event.ctrlKey || event.metaKey;
		if (!ctrl && !event.shiftKey) {
			this.clear();
			return false;
		}
		var current = this.selected().map(l => l.id);
		if (event.shiftKey) {
			//range from the active layer to the clicked one, in panel order
			var list = this.groups().ordered().filter(l => this.visible_in_panel(l));
			var a = list.indexOf(config.layer), b = list.indexOf(layer);
			if (a < 0 || b < 0) return false;
			var range = list.slice(Math.min(a, b), Math.max(a, b) + 1).map(l => l.id);
			this.ids = ctrl ? Array.from(new Set(current.concat(range))) : range;
			if (!this.ids.includes(config.layer.id)) this.ids.push(config.layer.id);
			app.GUI.GUI_layers.render_layers();
			return true;
		}
		//Ctrl+click toggles
		if (current.includes(layer.id)) {
			if (current.length == 1) return true;
			this.ids = current.filter(id => id != layer.id);
			if (layer.id == config.layer.id) {
				var next = this.ids[0];
				var keep = this.ids.slice();
				app.State.do_action(new app.Actions.Select_layer_action(next)).then(() => {
					this.ids = keep;
					app.GUI.GUI_layers.render_layers();
				});
				return true;
			}
			app.GUI.GUI_layers.render_layers();
			return true;
		}
		var keep_ids = current.concat([layer.id]);
		app.State.do_action(new app.Actions.Select_layer_action(layer.id)).then(() => {
			this.ids = keep_ids;
			app.GUI.GUI_layers.render_layers();
		});
		return true;
	}

	visible_in_panel(layer) {
		return !this.groups().ancestors(layer).some(g => g.ps_collapsed);
	}

	/**
	 * selected layers without those already inside a selected group
	 */
	top_level() {
		var sel = this.selected();
		return sel.filter(l => !this.groups().ancestors(l).some(g => sel.includes(g)));
	}

	/**
	 * movable pixel/text/shape layers of the selection (group contents included)
	 */
	members() {
		var out = [];
		for (var l of this.top_level()) {
			var list = this.groups().is_group(l) ? this.groups().descendants(l) : [l];
			for (var m of list) {
				if (m.type != 'ps_group' && m.type != 'ps_adjust' && m.x != null && !out.includes(m)) out.push(m);
			}
		}
		return out;
	}

	// ---------- operations ----------

	async delete() {
		var actions = [];
		for (var l of this.top_level()) {
			if (this.groups().is_group(l)) actions.push(...this.groups().delete_actions(l));
			else actions.push(new app.Actions.Delete_layer_action(l.id, true));
		}
		this.clear();
		await app.State.do_action(new app.Actions.Bundle_action('delete_layers', 'Delete Layers', actions));
		this.groups().after_change();
	}

	/**
	 * Ctrl+G with several layers: one new group around all of them
	 */
	async group() {
		var Groups = this.groups();
		var sel = this.top_level();
		var top = sel[0];
		var parent_id = top.ps_parent || null;
		this.clear();
		await app.State.do_action(new app.Actions.Bundle_action('group_layers', 'Group Layers', [
			new app.Actions.Insert_layer_action({ type: 'ps_group', name: Groups.next_name(), ps_parent: parent_id }, false),
		]));
		var group = config.layer;
		//the selected layers (with their contents) move into the group, in their order, where the top one was
		var moving = [];
		for (var l of sel) {
			moving.push(l);
			if (Groups.is_group(l)) moving.push(...Groups.descendants(l));
		}
		var ordered_moving = Groups.ordered().filter(l => moving.includes(l));
		var list = Groups.ordered().filter(l => l !== group && !moving.includes(l));
		//ordered() is top first: the group goes where the top selected layer was
		var all = Groups.ordered().filter(l => l !== group);
		var index = all.slice(0, all.indexOf(top)).filter(l => list.includes(l)).length;
		list.splice(index, 0, group, ...ordered_moving);
		var parents = {};
		for (var s of sel) parents[s.id] = group.id;
		await Groups.merge_into_last(Groups.restack_actions(list, parents));
		group.ps_collapsed = false;
		Groups.after_change();
	}

	/**
	 * Layer > Merge Layers (Ctrl+E with several layers selected)
	 */
	async merge() {
		var sel = this.members().filter(l => l.visible !== false);
		if (sel.length < 2) return;
		var canvas = document.createElement('canvas');
		canvas.width = config.WIDTH;
		canvas.height = config.HEIGHT;
		var ctx = canvas.getContext('2d');
		var bottom_up = this.groups().ordered().filter(l => sel.includes(l)).reverse();
		for (var l of bottom_up) {
			ctx.save();
			ctx.globalAlpha = (l.opacity == null ? 100 : l.opacity) / 100;
			ctx.globalCompositeOperation = l.composition || 'source-over';
			l._ps_ignore_groups = true;
			app.Layers.render_object(ctx, l);
			delete l._ps_ignore_groups;
			ctx.restore();
		}
		var top = bottom_up[bottom_up.length - 1];
		var actions = [new app.Actions.Insert_layer_action({
			type: 'image', name: top.name, order: top.order, ps_parent: top.ps_parent || null,
			x: 0, y: 0, width: canvas.width, height: canvas.height, width_original: canvas.width, height_original: canvas.height,
			data: canvas.toDataURL('image/png'),
		}, false)];
		for (var d of this.top_level()) {
			if (this.groups().is_group(d)) actions.push(...this.groups().delete_actions(d));
			else actions.push(new app.Actions.Delete_layer_action(d.id, true));
		}
		this.clear();
		await app.State.do_action(new app.Actions.Bundle_action('merge_layers', 'Merge Layers', actions));
		this.groups().after_change();
	}

	/**
	 * bounds of a layer's visible pixels, in document coordinates
	 */
	bounds(layer) {
		var trim = app.GUI.modules['image/trim'];
		if (trim && (layer.type == 'image' || layer.type == 'text' || layer.type == 'ps_group')) {
			var list = layer.type == 'ps_group' ? this.groups().descendants(layer).filter(l => l.type != 'ps_group' && l.x != null) : [layer];
			var box = null;
			for (var l of list) {
				var t = trim.get_trim_info(l.id);
				var w = Math.max(l.width, config.WIDTH) - t.left - t.right, h = Math.max(l.height, config.HEIGHT) - t.top - t.bottom;
				if (w <= 0 || h <= 0) continue;
				var b = { x: t.left, y: t.top, width: w, height: h };
				box = box ? this.union(box, b) : b;
			}
			if (box) return box;
		}
		return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
	}

	union(a, b) {
		var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
		return { x: x, y: y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
	}

	/**
	 * moves every member of `layer` (or the layer itself) by dx, dy
	 */
	move_actions(layer, dx, dy) {
		var list = this.groups().is_group(layer) ? this.groups().descendants(layer).filter(l => l.type != 'ps_group' && l.x != null) : [layer];
		return list.filter(() => dx || dy).map(l => new app.Actions.Update_layer_action(l.id, { x: l.x + dx, y: l.y + dy }));
	}

	/**
	 * Align: several layers align to their common bounds (or to the selection)
	 */
	align(mode, selection_box) {
		var layers = this.top_level();
		var boxes = layers.map(l => this.bounds(l));
		var box = selection_box || boxes.reduce((a, b) => this.union(a, b));
		var actions = [];
		layers.forEach((l, i) => {
			var b = boxes[i], dx = 0, dy = 0;
			if (mode == 'top') dy = box.y - b.y;
			if (mode == 'bottom') dy = box.y + box.height - (b.y + b.height);
			if (mode == 'vcenter') dy = Math.round(box.y + box.height / 2 - (b.y + b.height / 2));
			if (mode == 'left') dx = box.x - b.x;
			if (mode == 'right') dx = box.x + box.width - (b.x + b.width);
			if (mode == 'hcenter') dx = Math.round(box.x + box.width / 2 - (b.x + b.width / 2));
			actions.push(...this.move_actions(l, dx, dy));
		});
		if (actions.length) {
			app.State.do_action(new app.Actions.Bundle_action('align', 'Align', actions));
		}
	}

	/**
	 * Distribute (3+ layers): equal spacing of the chosen edge or center
	 */
	distribute(mode) {
		var layers = this.top_level();
		if (layers.length < 3) return;
		var edge = (b) => ({
			top: b.y, vcenter: b.y + b.height / 2, bottom: b.y + b.height,
			left: b.x, hcenter: b.x + b.width / 2, right: b.x + b.width,
		})[mode];
		var vertical = ['top', 'vcenter', 'bottom'].includes(mode);
		var items = layers.map(l => ({ layer: l, pos: edge(this.bounds(l)) })).sort((a, b) => a.pos - b.pos);
		var first = items[0].pos, last = items[items.length - 1].pos;
		var step = (last - first) / (items.length - 1);
		var actions = [];
		items.forEach((it, i) => {
			var d = Math.round(first + step * i - it.pos);
			actions.push(...this.move_actions(it.layer, vertical ? 0 : d, vertical ? d : 0));
		});
		if (actions.length) {
			app.State.do_action(new app.Actions.Bundle_action('distribute', 'Distribute', actions));
		}
	}

	/**
	 * Move tool drag with several layers selected moves all of them (CS6)
	 */
	install_move() {
		var job = null;
		var world = (e) => {
			var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
			return app.Layers.get_world_coords(e.clientX - rect.left, e.clientY - rect.top);
		};
		document.addEventListener('mousedown', (e) => {
			if (config.TOOL.name != 'select' || e.button != 0 || !this.multiple()) return;
			if (e.target.id != 'canvas_minipaint' && e.target.id != 'main_wrapper') return;
			var members = this.members();
			if (members.length == 0) return;
			e.stopImmediatePropagation();
			e.preventDefault();
			job = { start: world(e), members: members, origin: members.map(l => ({ x: l.x, y: l.y })) };
		}, true);
		document.addEventListener('mousemove', (e) => {
			if (!job) return;
			e.stopImmediatePropagation();
			var p = world(e);
			var dx = Math.round(p.x - job.start.x), dy = Math.round(p.y - job.start.y);
			job.members.forEach((l, i) => { l.x = job.origin[i].x + dx; l.y = job.origin[i].y + dy; });
			config.need_render = true;
		}, true);
		document.addEventListener('mouseup', (e) => {
			if (!job) return;
			e.stopImmediatePropagation();
			var j = job;
			job = null;
			var actions = [];
			j.members.forEach((l, i) => {
				var x = l.x, y = l.y;
				l.x = j.origin[i].x;
				l.y = j.origin[i].y;
				if (x != l.x || y != l.y) actions.push(new app.Actions.Update_layer_action(l.id, { x: x, y: y }));
			});
			if (actions.length) {
				var keep = this.ids.slice();
				app.State.do_action(new app.Actions.Bundle_action('move', 'Move', actions)).then(() => { this.ids = keep; });
			}
		}, true);
	}
}

export default Ps_multi_select_class;
