/*
 * pshot - CS6 File > Open Recent: the files opened lately, kept in the
 * browser (IndexedDB, the file itself, since a web page cannot reopen a path),
 * as many as Preferences > File Handling > Recent File List Contains.
 */

import app from './../app.js';
import menuDefinition from './../config-menu.js';

const DB = 'pshot_recent', STORE = 'files';

function db() {
	return new Promise((resolve, reject) => {
		var req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function tx(mode, fn) {
	return db().then((d) => new Promise((resolve, reject) => {
		var t = d.transaction(STORE, mode), store = t.objectStore(STORE), out = fn(store);
		t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
		t.onerror = () => reject(t.error);
	}));
}

class Ps_recent_files_class {

	constructor() {
		this.items = [];
	}

	limit() {
		var prefs = app.GUI.Ps_workspace.Preferences;
		return Math.max(0, Math.min(100, parseInt(prefs ? prefs.values.recent_count : 10) || 0));
	}

	async load() {
		try {
			var all = await tx('readonly', (s) => s.getAll());
			this.items = (all || []).map(r => ({ id: r.id, name: r.name, time: r.time })).sort((a, b) => b.time - a.time);
		} catch (e) {
			this.items = [];
		}
		this.render_menu();
	}

	/**
	 * a file was opened: it goes to the top of the list
	 */
	async add(file) {
		if (!file || !file.name || this.limit() == 0) return;
		var id = file.name + '|' + file.size + '|' + (file.lastModified || 0);
		try {
			await tx('readwrite', (s) => s.put({ id: id, name: file.name, type: file.type, time: Date.now(), blob: file }));
			await this.trim();
		} catch (e) { /* storage blocked or full */ }
		await this.load();
	}

	async trim() {
		var all = (await tx('readonly', (s) => s.getAll()) || []).sort((a, b) => b.time - a.time);
		var extra = all.slice(this.limit());
		if (extra.length) await tx('readwrite', (s) => extra.forEach(r => s.delete(r.id)));
	}

	async open(id) {
		var rec = await tx('readonly', (s) => s.get(id));
		if (!rec) {
			app.GUI.Ps_workspace.status_message('That file is no longer in the recent list.');
			return null;
		}
		return new File([rec.blob], rec.name, { type: rec.type || '' });
	}

	async clear() {
		try { await tx('readwrite', (s) => s.clear()); } catch (e) { /* storage blocked */ }
		await this.load();
	}

	/**
	 * File > Open Recent lists the files, then Clear Recent File List
	 */
	render_menu() {
		var file = menuDefinition.find(m => m.name == 'File');
		var entry = file && file.children.find(c => c.name == 'Open Recent');
		if (!entry) return;
		var list = this.items.slice(0, this.limit()).map(r => ({ name: app.GUI.Ps_workspace.Helper.escapeHtml(r.name), target: 'ps/commands.open_recent', parameter: r.id }));
		entry.children = list.length ? list.concat([{ divider: true }, { name: 'Clear Recent File List', target: 'ps/commands.clear_recent' }]) : [];
	}
}

export default Ps_recent_files_class;
