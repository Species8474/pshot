/*
 * pshot - CS6 Layer Comps panel: named snapshots of each layer's visibility,
 * position and layer style, applied back with one History step.
 * Comps live with the document (config.ps_comps).
 */

import app from './../app.js';
import config from './../config.js';
import Dialog_class from './../libs/popup.js';

const S = 'fill="none" stroke="currentColor" stroke-width="1.2"';

class Ps_layer_comps_class {

	list() {
		return config.ps_comps || [];
	}

	capture(name) {
		var layers = {};
		for (var l of config.layers) {
			layers[l.id] = { visible: l.visible !== false, x: l.x, y: l.y, ps_styles: l.ps_styles ? JSON.parse(JSON.stringify(l.ps_styles)) : null };
		}
		return { name: name, layers: layers };
	}

	async set_list(list, active, description) {
		await app.State.do_action(new app.Actions.Bundle_action('layer_comp', description, [
			new app.Actions.Update_config_action({ ps_comps: list, ps_comp_active: active }),
		]));
		this.render();
	}

	new_comp() {
		var POP = new Dialog_class();
		var n = this.list().length + 1;
		POP.show({
			title: 'New Layer Comp',
			params: [
				{ name: 'name', title: 'Name:', value: 'Layer Comp ' + n },
				{ title: 'Apply To Layers:' },
				{ name: 'visibility', title: 'Visibility', value: true },
				{ name: 'position', title: 'Position', value: true },
				{ name: 'appearance', title: 'Appearance (Layer Style)', value: true },
			],
			on_finish: (params) => {
				var comp = this.capture(params.name || 'Layer Comp ' + n);
				comp.use = { visibility: !!params.visibility, position: !!params.position, appearance: !!params.appearance };
				var list = this.list().concat([comp]);
				this.set_list(list, list.length - 1, 'New Layer Comp');
			},
		});
	}

	async apply(index) {
		var comp = this.list()[index];
		if (!comp) return;
		var use = comp.use || { visibility: true, position: true, appearance: true };
		var actions = [];
		for (var l of config.layers) {
			var s = comp.layers[l.id];
			if (!s) continue;
			var settings = {};
			if (use.visibility && (l.visible !== false) != s.visible) settings.visible = s.visible;
			if (use.position && (l.x != s.x || l.y != s.y)) { settings.x = s.x; settings.y = s.y; }
			if (use.appearance && JSON.stringify(l.ps_styles || null) != JSON.stringify(s.ps_styles)) settings.ps_styles = s.ps_styles;
			if (Object.keys(settings).length) actions.push(new app.Actions.Update_layer_action(l.id, settings));
		}
		actions.push(new app.Actions.Update_config_action({ ps_comp_active: index }));
		await app.State.do_action(new app.Actions.Bundle_action('layer_comp', 'Apply Layer Comp', actions));
		app.GUI.GUI_layers.render_layers();
		this.render();
	}

	update(index) {
		var comp = this.list()[index];
		if (!comp) return;
		var list = this.list().slice();
		var updated = this.capture(comp.name);
		updated.use = comp.use;
		list[index] = updated;
		this.set_list(list, index, 'Update Layer Comp');
	}

	remove(index) {
		var list = this.list().slice();
		list.splice(index, 1);
		this.set_list(list, -1, 'Delete Layer Comp');
	}

	render() {
		var el = document.getElementById('ps_layer_comps');
		if (!el) return;
		var active = config.ps_comp_active == null ? -1 : config.ps_comp_active;
		var html = '<div class="ps_comps_list">'
			+ '<div class="ps_comp_row' + (active < 0 ? ' applied' : '') + '"><span class="ps_comp_mark"></span><span>Last Document State</span></div>';
		this.list().forEach((c, i) => {
			html += '<div class="ps_comp_row' + (i == active ? ' applied' : '') + '" data-comp="' + i + '"><span class="ps_comp_mark">' + (i == active ? '&#9654;' : '') + '</span><span>'
				+ app.GUI.Ps_workspace.Helper.escapeHtml(c.name) + '</span></div>';
		});
		html += '</div><div class="ps_panel_footer">'
			+ '<button type="button" data-cmd="prev" title="Apply previous selected layer comp"><svg viewBox="0 0 18 18" width="16" height="16"><path d="M11 4L6 9l5 5" ' + S + '/></svg></button>'
			+ '<button type="button" data-cmd="next" title="Apply next selected layer comp"><svg viewBox="0 0 18 18" width="16" height="16"><path d="M7 4l5 5-5 5" ' + S + '/></svg></button>'
			+ '<button type="button" data-cmd="update" title="Update layer comp"><svg viewBox="0 0 18 18" width="16" height="16"><path d="M4 9a5 5 0 1 0 2-4M3 2v4h4" ' + S + '/></svg></button>'
			+ '<button type="button" data-cmd="new" title="Create new layer comp"><svg viewBox="0 0 18 18" width="16" height="16"><rect x="4" y="3" width="10" height="12" ' + S + '/><path d="M11 3v3h3" ' + S + '/></svg></button>'
			+ '<button type="button" data-cmd="delete" title="Delete layer comp"><svg viewBox="0 0 18 18" width="16" height="16"><path d="M5 5h8l-.8 10H5.8zM4 5h10M7.5 3h3" ' + S + '/></svg></button></div>';
		el.innerHTML = html;
		el.querySelectorAll('[data-comp]').forEach((row) => row.addEventListener('click', () => this.apply(parseInt(row.dataset.comp))));
		el.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => {
			var n = this.list().length;
			var cmd = b.dataset.cmd;
			if (cmd == 'new') this.new_comp();
			else if (!n) return;
			else if (cmd == 'prev') this.apply(((active < 0 ? 0 : active) - 1 + n) % n);
			else if (cmd == 'next') this.apply(((active < 0 ? -1 : active) + 1) % n);
			else if (cmd == 'update' && active >= 0) this.update(active);
			else if (cmd == 'delete' && active >= 0) this.remove(active);
		}));
	}
}

export default Ps_layer_comps_class;
