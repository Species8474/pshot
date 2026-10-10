/*
 * pshot - CS6 patterns: Edit > Define Pattern, and the pattern list used by
 * Edit > Fill, the Pattern Overlay style, Pattern fill layers and the Pattern
 * Stamp tool. Like CS6 presets, patterns are shared by all documents and are
 * not History states.
 */

function make(w, h, draw) {
	var c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	draw(c.getContext('2d'), w, h);
	return c;
}

function defaults() {
	return [
		{ name: 'Checkerboard', canvas: make(16, 16, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8); }) },
		{ name: 'Diagonal Lines', canvas: make(12, 12, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 12, 12); g.strokeStyle = '#333'; g.lineWidth = 2; g.beginPath(); g.moveTo(-3, 3); g.lineTo(3, -3); g.moveTo(0, 12); g.lineTo(12, 0); g.moveTo(9, 15); g.lineTo(15, 9); g.stroke(); }) },
		{ name: 'Dots', canvas: make(14, 14, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 14, 14); g.fillStyle = '#222'; g.beginPath(); g.arc(7, 7, 3, 0, Math.PI * 2); g.fill(); }) },
		{ name: 'Bricks', canvas: make(32, 16, (g) => {
			g.fillStyle = '#a0522d'; g.fillRect(0, 0, 32, 16);
			g.fillStyle = '#d8d0c0'; g.fillRect(0, 7, 32, 2); g.fillRect(0, 15, 32, 1);
			g.fillRect(15, 0, 2, 7); g.fillRect(0, 9, 1, 6); g.fillRect(31, 9, 1, 6);
		}) },
		{ name: 'Noise', canvas: make(64, 64, (g, w, h) => {
			var img = g.createImageData(w, h);
			for (var i = 0; i < img.data.length; i += 4) { var v = 96 + Math.random() * 96; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
			g.putImageData(img, 0, 0);
		}) },
		{ name: 'Grid', canvas: make(16, 16, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#7a9cc6'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16); }) },
	];
}

class Ps_patterns_class {

	constructor() {
		this.list = defaults();
	}

	names() {
		return this.list.map(p => p.name);
	}

	get(name) {
		return (this.list.find(p => p.name == name) || this.list[0]).canvas;
	}

	/**
	 * a CanvasPattern for ctx, scaled (percent)
	 */
	pattern(ctx, name, scale) {
		var src = this.get(name);
		var s = (scale || 100) / 100;
		if (s != 1) {
			var scaled = document.createElement('canvas');
			scaled.width = Math.max(1, Math.round(src.width * s));
			scaled.height = Math.max(1, Math.round(src.height * s));
			scaled.getContext('2d').drawImage(src, 0, 0, scaled.width, scaled.height);
			src = scaled;
		}
		return ctx.createPattern(src, 'repeat');
	}

	/**
	 * a canvas of the given size tiled with the pattern; ox/oy align it to the document
	 */
	tiled(name, w, h, scale, ox, oy) {
		var c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		var ctx = c.getContext('2d');
		ctx.translate(-(ox || 0), -(oy || 0));
		ctx.fillStyle = this.pattern(ctx, name, scale);
		ctx.fillRect(ox || 0, oy || 0, w, h);
		return c;
	}

	add(name, canvas) {
		var existing = this.list.findIndex(p => p.name == name);
		var entry = { name: name, canvas: canvas };
		if (existing >= 0) this.list[existing] = entry;
		else this.list.push(entry);
	}

	remove(name) {
		if (this.list.length > 1) this.list = this.list.filter(p => p.name != name);
	}

	rename(name, to) {
		var p = this.list.find(x => x.name == name);
		if (p && to && !this.list.some(x => x.name == to)) p.name = to;
	}

	next_name() {
		var n = 0;
		for (var p of this.list) {
			var m = /^Pattern (\d+)$/.exec(p.name);
			if (m) n = Math.max(n, parseInt(m[1]));
		}
		return 'Pattern ' + (n + 1);
	}

	/**
	 * <select> for a dialog
	 */
	select_html(id, value) {
		return '<select id="' + id + '">' + this.names().map(n => '<option' + (n == value ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>';
	}
}

const Patterns = new Ps_patterns_class();

export default Patterns;
