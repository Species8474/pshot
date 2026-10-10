/*
 * pshot - sampled brush tips (CS6 default set style, drawn procedurally) and
 * user tips from Edit > Define Brush Preset. A tip is an alpha mask canvas;
 * the Brush tool's dab engine scales, rotates and colors it.
 */

function rng(seed) {
	var s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		var t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function star(g, cx, cy, r1, r2, n, rot) {
	g.beginPath();
	for (var i = 0; i < n * 2; i++) {
		var r = i % 2 ? r2 : r1, a = rot + i * Math.PI / n;
		g.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r);
	}
	g.closePath();
	g.fill();
}

function maple(g, cx, cy, s, rot) {
	g.save();
	g.translate(cx, cy);
	g.rotate(rot);
	g.scale(s / 100, s / 100);
	g.beginPath();
	var pts = [[0, -50], [10, -28], [26, -36], [22, -14], [46, -20], [36, -2], [50, 6], [22, 14], [26, 30], [4, 20], [2, 48], [-2, 48], [-4, 20], [-26, 30], [-22, 14], [-50, 6], [-36, -2], [-46, -20], [-22, -14], [-26, -36], [-10, -28]];
	pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
	g.closePath();
	g.fill();
	g.restore();
}

function leaf(g, cx, cy, s, rot) {
	g.save();
	g.translate(cx, cy);
	g.rotate(rot);
	g.scale(s / 100, s / 100);
	g.beginPath();
	g.moveTo(0, -50);
	g.bezierCurveTo(30, -30, 30, 20, 0, 40);
	g.bezierCurveTo(-30, 20, -30, -30, 0, -50);
	g.fill();
	g.fillRect(-1.5, 38, 3, 12);
	g.restore();
}

function blades(g, w, h, n, seed, tall) {
	var r = rng(seed);
	for (var i = 0; i < n; i++) {
		var x = w * (0.15 + 0.7 * r()), lean = (r() - 0.5) * w * 0.5, top = h * (tall ? 0.02 + 0.2 * r() : 0.15 + 0.35 * r());
		var bw = 1.5 + r() * 3;
		g.beginPath();
		g.moveTo(x - bw, h);
		g.quadraticCurveTo(x - bw / 2 + lean * 0.3, (h + top) / 2, x + lean, top);
		g.quadraticCurveTo(x + bw / 2 + lean * 0.3, (h + top) / 2, x + bw, h);
		g.closePath();
		g.fill();
	}
}

//name -> [width, height, draw(g, w, h)]
const BUILTIN = {
	'Star': [100, 100, (g, w, h) => star(g, w / 2, h / 2 + 4, 48, 20, 5, 0)],
	'Spatter': [100, 100, (g, w, h) => {
		var r = rng(7);
		for (var i = 0; i < 70; i++) {
			var a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 46, s = 0.6 + r() * (d < 20 ? 6 : 3);
			g.beginPath();
			g.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, s, 0, Math.PI * 2);
			g.fill();
		}
	}],
	'Chalk': [100, 100, (g, w, h) => {
		var r = rng(11);
		var img = g.getImageData(0, 0, w, h), d = img.data;
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
			var rr = Math.hypot(x - w / 2, (y - h / 2) * 1.15) / (w / 2);
			if (rr > 1) continue;
			var v = (1 - Math.pow(rr, 3)) * (r() < 0.55 ? 0.35 + r() * 0.65 : r() * 0.25);
			d[(y * w + x) * 4 + 3] = v * 255;
		}
		g.putImageData(img, 0, 0);
	}],
	'Grass': [80, 134, (g, w, h) => blades(g, w, h, 9, 3, false)],
	'Dune Grass': [70, 112, (g, w, h) => blades(g, w, h, 5, 5, true)],
	'Scattered Maple Leaves': [100, 100, (g, w, h) => {
		var r = rng(13);
		for (var i = 0; i < 5; i++) maple(g, 18 + r() * 64, 18 + r() * 64, 22 + r() * 18, r() * 6.28);
	}],
	'Scattered Leaves': [100, 100, (g, w, h) => {
		var r = rng(17);
		for (var i = 0; i < 6; i++) leaf(g, 15 + r() * 70, 15 + r() * 70, 22 + r() * 16, r() * 6.28);
	}],
	'Flowing Stars': [100, 100, (g, w, h) => {
		var r = rng(19);
		for (var i = 0; i < 9; i++) star(g, 12 + r() * 76, 12 + r() * 76, 4 + r() * 9, 2 + r() * 3, 5, r());
	}],
	'Fuzzball': [100, 100, (g, w, h) => {
		var r = rng(23);
		g.lineWidth = 1;
		g.strokeStyle = '#000';
		for (var i = 0; i < 220; i++) {
			var a = r() * Math.PI * 2, l = 20 + r() * 28;
			g.globalAlpha = 0.25 + r() * 0.5;
			g.beginPath();
			g.moveTo(w / 2, h / 2);
			g.lineTo(w / 2 + Math.cos(a) * l, h / 2 + Math.sin(a) * l);
			g.stroke();
		}
		g.globalAlpha = 1;
	}],
	'Maple Leaf': [100, 100, (g, w, h) => maple(g, w / 2, h / 2, 96, 0)],
};

var cache = {};
var USER = {};
try { USER = JSON.parse(localStorage.getItem('pshot_brush_tips_v1') || '{}'); } catch (e) { USER = {}; }

/**
 * the tip's alpha mask (null while a user tip is still decoding)
 */
function tip_canvas(name) {
	if (cache[name]) return cache[name];
	if (BUILTIN[name]) {
		var [w, h, draw] = BUILTIN[name];
		var c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		var g = c.getContext('2d', { willReadFrequently: true });
		g.fillStyle = '#000';
		draw(g, w, h);
		cache[name] = c;
		return c;
	}
	if (USER[name]) {
		var img = new Image();
		img.onload = () => {
			var uc = document.createElement('canvas');
			uc.width = img.width;
			uc.height = img.height;
			uc.getContext('2d').drawImage(img, 0, 0);
			cache[name] = uc;
		};
		img.src = USER[name];
		cache[name] = null;
	}
	return null;
}

function tip_names() {
	return Object.keys(BUILTIN).concat(Object.keys(USER));
}

/**
 * Edit > Define Brush Preset: grayscale image -> tip (dark = paint)
 */
function define_tip(name, canvas) {
	var w = canvas.width, h = canvas.height;
	var src = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
	var out = document.createElement('canvas');
	out.width = w;
	out.height = h;
	var octx = out.getContext('2d');
	var img = octx.createImageData(w, h), d = img.data;
	for (var i = 0; i < src.length; i += 4) {
		var lum = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
		//transparent pixels count as white
		var a = src[i + 3] / 255;
		d[i + 3] = (255 - lum) * a;
	}
	octx.putImageData(img, 0, 0);
	cache[name] = out;
	USER[name] = out.toDataURL();
	try { localStorage.setItem('pshot_brush_tips_v1', JSON.stringify(USER)); } catch (e) { /* storage full or blocked */ }
	return out;
}

function user_tips() {
	return USER;
}

function import_tips(data) {
	for (var k in data || {}) { USER[k] = data[k]; delete cache[k]; }
	try { localStorage.setItem('pshot_brush_tips_v1', JSON.stringify(USER)); } catch (e) { /* storage full or blocked */ }
}

export { tip_canvas, tip_names, define_tip, user_tips, import_tips };
