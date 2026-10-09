/*
 * pshot - CS6 layer groups.
 *
 * A group is a layer of type 'ps_group' (it draws nothing). Members point to
 * it with ps_parent. normalize() keeps the stack in panel order: every group
 * directly above its members, nested groups included.
 */

import app from './../app.js';
import config from './../config.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

class Ps_groups_class {

	is_group(layer) {
		return !!layer && layer.type == 'ps_group';
	}

	get(id) {
		return id == null ? null : config.layers.find(l => l.id == id) || null;
	}

	parent(layer) {
		var p = this.get(layer.ps_parent);
		return p && this.is_group(p) ? p : null;
	}

	ancestors(layer) {
		var list = [];
		var p = this.parent(layer);
		var guard = 0;
		while (p && guard++ < 100) {
			list.push(p);
			p = this.parent(p);
		}
		return list;
	}

	depth(layer) {
		return this.ancestors(layer).length;
	}

	/** visible = itself and every enclosing group visible */
	effectively_visible(layer) {
		return layer.visible != false && this.ancestors(layer).every(g => g.visible != false);
	}

	/** product of the enclosing groups' opacity (0..1) */
	group_opacity(layer) {
		return this.ancestors(layer).reduce((a, g) => a * (g.opacity == null ? 1 : g.opacity / 100), 1);
	}

	descendants(group) {
		var out = [];
		for (var l of config.layers) {
			if (this.ancestors(l).includes(group)) {
				out.push(l);
			}
		}
		return out;
	}

	/**
	 * the stack top-first as it should be: each group followed by its members
	 */
	ordered() {
		var sorted = config.layers.concat().sort((a, b) => b.order - a.order);
		var children = new Map();
		var top = [];
		for (var l of sorted) {
			var p = this.parent(l);
			if (p && p !== l) {
				if (!children.has(p.id)) children.set(p.id, []);
				children.get(p.id).push(l);
			}
			else {
				top.push(l);
			}
		}
		var out = [];
		var seen = new Set();
		var emit = (layer) => {
			if (seen.has(layer.id)) return;
			seen.add(layer.id);
			out.push(layer);
			for (var c of children.get(layer.id) || []) emit(c);
		};
		top.forEach(emit);
		//anything left (cycles) goes at the bottom
		sorted.forEach(l => { if (!seen.has(l.id)) { seen.add(l.id); out.push(l); } });
		return out;
	}

	/**
	 * reassign order values so the stack matches ordered(); not recorded in History
	 */
	normalize() {
		var list = this.ordered();
		var n = list.length;
		var changed = false;
		list.forEach((layer, i) => {
			var order = n - i;
			if (layer.order !== order) {
				layer.order = order;
				changed = true;
			}
		});
		if (changed) {
			config.need_render = true;
		}
		return changed;
	}

	/**
	 * undoable full re-stack: `list` top-first, `parents` = {id: parent id}
	 */
	restack_actions(list, parents) {
		var actions = [];
		var n = list.length;
		list.forEach((layer, i) => {
			if (layer.order !== n - i) {
				actions.push(new app.Actions.Set_object_property_action(layer, 'order', n - i));
			}
			if (parents && layer.id in parents && (layer.ps_parent || null) !== parents[layer.id]) {
				actions.push(new app.Actions.Set_object_property_action(layer, 'ps_parent', parents[layer.id]));
			}
		});
		return actions;
	}

	next_name() {
		var n = 0;
		for (var l of config.layers) {
			var m = /^Group (\d+)$/.exec(l.name);
			if (m) n = Math.max(n, parseInt(m[1]));
		}
		return 'Group ' + (n + 1);
	}

	/**
	 * Layer > Group Layers (Ctrl+G): wrap the active layer in a new group
	 */
	async group_layers() {
		var layer = config.layer;
		if (!layer) return;
		var parent_id = layer.ps_parent || null;
		await app.State.do_action(new app.Actions.Bundle_action('group_layers', 'Group Layers', [
			new app.Actions.Insert_layer_action({ type: 'ps_group', name: this.next_name(), ps_parent: parent_id }, false),
		]));
		var group = config.layer;
		//place the group where the layer was, the layer inside it
		var list = this.ordered().filter(l => l !== group);
		var index = list.indexOf(layer);
		list.splice(index, 0, group);
		var parents = {};
		parents[layer.id] = group.id;
		var actions = this.restack_actions(list, parents);
		await this.merge_into_last(actions);
		group.ps_collapsed = false;
		this.after_change();
	}

	/**
	 * Layer > New > Group: empty group above the active layer
	 */
	async new_group() {
		var active = config.layer;
		var parent_id = active ? (this.is_group(active) ? active.id : active.ps_parent || null) : null;
		await app.State.do_action(new app.Actions.Bundle_action('new_group', 'New Group', [
			new app.Actions.Insert_layer_action({ type: 'ps_group', name: this.next_name(), ps_parent: parent_id }, false),
		]));
		this.after_change();
	}

	/**
	 * Layer > Ungroup Layers (Shift+Ctrl+G)
	 */
	async ungroup() {
		var group = config.layer;
		if (!this.is_group(group)) {
			return;
		}
		var actions = [];
		for (var l of config.layers) {
			if (l.ps_parent == group.id) {
				actions.push(new app.Actions.Set_object_property_action(l, 'ps_parent', group.ps_parent || null));
			}
		}
		actions.push(new app.Actions.Delete_layer_action(group.id, true));
		await app.State.do_action(new app.Actions.Bundle_action('ungroup', 'Ungroup Layers', actions));
		this.after_change();
	}

	/**
	 * deleting a group deletes its contents (CS6 "Group and Contents")
	 */
	delete_actions(group) {
		var actions = [];
		for (var l of this.descendants(group)) {
			actions.push(new app.Actions.Delete_layer_action(l.id, true));
		}
		actions.push(new app.Actions.Delete_layer_action(group.id, true));
		return actions;
	}

	async delete_group(group) {
		await app.State.do_action(new app.Actions.Bundle_action('delete_group', 'Delete Group', this.delete_actions(group)));
		this.after_change();
	}

	/**
	 * Layers panel drag and drop: put `layer` (and its contents) above/below `target`.
	 * Dropping onto the lower half of an expanded group's row puts it inside the group.
	 */
	async move(layer, target, above) {
		if (layer === target || this.ancestors(target).includes(layer)) {
			return;
		}
		var moving = [layer].concat(this.is_group(layer) ? this.descendants(layer) : []);
		var list = this.ordered().filter(l => !moving.includes(l));
		var index = list.indexOf(target);
		var parent_id;
		if (!above && this.is_group(target) && !target.ps_collapsed) {
			//into the group, at its top
			parent_id = target.id;
			index = index + 1;
		}
		else {
			parent_id = target.ps_parent || null;
			if (!above) {
				//below the target and everything inside it
				index = index + 1 + (this.is_group(target) ? this.descendants(target).filter(l => list.includes(l)).length : 0);
			}
		}
		var ordered_moving = this.ordered().filter(l => moving.includes(l));
		list.splice(index, 0, ...ordered_moving);
		var parents = {};
		parents[layer.id] = parent_id;
		var actions = this.restack_actions(list, parents);
		if (actions.length == 0) {
			return;
		}
		await app.State.do_action(new app.Actions.Bundle_action('layer_order', 'Layer Order', actions));
		this.after_change();
	}

	async merge_into_last(actions) {
		if (actions.length == 0) {
			return;
		}
		var history = app.State.action_history;
		var last = history[history.length - 1];
		await app.State.do_action(new app.Actions.Bundle_action(last.action_id, last.action_description, actions), {
			merge_with_history: [last.action_id],
		});
	}

	after_change() {
		this.normalize();
		app.GUI.GUI_layers.render_layers();
		config.need_render = true;
	}

	/**
	 * Move tool on a selected group moves all of its members (CS6)
	 */
	install_group_move() {
		var job = null;
		var world = (e) => {
			var rect = document.getElementById('canvas_minipaint').getBoundingClientRect();
			return app.Layers.get_world_coords(e.clientX - rect.left, e.clientY - rect.top);
		};
		document.addEventListener('mousedown', (e) => {
			if (config.TOOL.name != 'select' || e.button != 0 || !this.is_group(config.layer)) return;
			if (e.target.id != 'canvas_minipaint' && e.target.id != 'main_wrapper') return;
			var members = this.descendants(config.layer).filter(l => l.type != 'ps_group' && l.x != null);
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
				if (x != l.x || y != l.y) {
					actions.push(new app.Actions.Update_layer_action(l.id, { x: x, y: y }));
				}
			});
			if (actions.length) {
				app.State.do_action(new app.Actions.Bundle_action('move', 'Move', actions));
			}
		}, true);
	}

	toggle_collapsed(group) {
		group.ps_collapsed = !group.ps_collapsed;
		app.GUI.GUI_layers.render_layers();
	}

	/**
	 * pixel tools can't work on a group
	 */
	guard(tool_name) {
		if (this.is_group(config.layer)) {
			alertify.error('Could not use the ' + tool_name + ' because the target layer is a group. Select a layer inside the group.');
			return false;
		}
		return true;
	}
}

export default Ps_groups_class;
