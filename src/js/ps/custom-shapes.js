/*
 * pshot - Custom Shape Tool shapes (CS6 default set style). Each shape is an
 * SVG path in a 100 x 100 box, turned into pshot subpaths fitted to the
 * dragged box.
 */

const SHAPES = {
	'Arrow 2': 'M0 35 L60 35 L60 10 L100 50 L60 90 L60 65 L0 65 Z',
	'Arrow 9': 'M0 50 L30 15 L30 35 L70 35 L70 15 L100 50 L70 85 L70 65 L30 65 L30 85 Z',
	'Arrow 17': 'M10 10 L90 50 L10 90 L30 50 Z',
	'Heart': 'M50 92 C20 70 0 52 0 30 C0 14 12 4 26 4 C38 4 46 12 50 22 C54 12 62 4 74 4 C88 4 100 14 100 30 C100 52 80 70 50 92 Z',
	'Heart Card': 'M50 100 C20 72 0 54 0 30 C0 12 13 0 27 0 C39 0 47 8 50 18 C53 8 61 0 73 0 C87 0 100 12 100 30 C100 54 80 72 50 100 Z',
	'Spade Card': 'M50 0 C70 22 100 38 100 60 C100 76 88 84 76 84 C66 84 58 78 54 70 C56 82 62 92 70 100 L30 100 C38 92 44 82 46 70 C42 78 34 84 24 84 C12 84 0 76 0 60 C0 38 30 22 50 0 Z',
	'Club Card': 'M50 0 C64 0 72 10 72 22 C72 30 68 36 62 40 C70 36 76 34 82 34 C94 34 100 44 100 56 C100 70 90 78 78 78 C68 78 60 72 55 64 C56 80 62 92 70 100 L30 100 C38 92 44 80 45 64 C40 72 32 78 22 78 C10 78 0 70 0 56 C0 44 6 34 18 34 C24 34 30 36 38 40 C32 36 28 30 28 22 C28 10 36 0 50 0 Z',
	'Diamond Card': 'M50 0 L88 50 L50 100 L12 50 Z',
	'5 Point Star': 'M50 0 L61.8 35.4 L99 35.4 L69 57.3 L80.3 92.7 L50 70.8 L19.7 92.7 L31 57.3 L1 35.4 L38.2 35.4 Z',
	'8 Point Star': 'M50 0 L60 26 L85 15 L74 40 L100 50 L74 60 L85 85 L60 74 L50 100 L40 74 L15 85 L26 60 L0 50 L26 40 L15 15 L40 26 Z',
	'Talk 1': 'M10 0 L90 0 C96 0 100 4 100 10 L100 60 C100 66 96 70 90 70 L40 70 L18 92 L22 70 L10 70 C4 70 0 66 0 60 L0 10 C0 4 4 0 10 0 Z',
	'Talk 2': 'M50 0 C78 0 100 16 100 36 C100 56 78 72 50 72 C44 72 38 71 33 70 L12 88 L18 64 C6 57 0 47 0 36 C0 16 22 0 50 0 Z',
	'Checkmark': 'M0 52 L14 38 L38 62 L86 10 L100 24 L38 90 Z',
	'Cross': 'M15 0 L50 35 L85 0 L100 15 L65 50 L100 85 L85 100 L50 65 L15 100 L0 85 L35 50 L0 15 Z',
	'Plus': 'M35 0 L65 0 L65 35 L100 35 L100 65 L65 65 L65 100 L35 100 L35 65 L0 65 L0 35 L35 35 Z',
	'Envelope': 'M0 15 L100 15 L100 85 L0 85 Z M6 21 L50 55 L94 21 Z',
	'Crescent': 'M60 0 C30 6 10 26 10 50 C10 74 30 94 60 100 C36 88 26 70 26 50 C26 30 36 12 60 0 Z',
	'Lightning': 'M55 0 L15 55 L45 55 L30 100 L85 38 L54 38 L72 0 Z',
	'Registration Target': 'M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z M50 12 C29 12 12 29 12 50 C12 71 29 88 50 88 C71 88 88 71 88 50 C88 29 71 12 50 12 Z M46 20 L54 20 L54 46 L80 46 L80 54 L54 54 L54 80 L46 80 L46 54 L20 54 L20 46 L46 46 Z',
	'Tile 1': 'M0 0 L45 0 L45 45 L0 45 Z M55 0 L100 0 L100 45 L55 45 Z M0 55 L45 55 L45 100 L0 100 Z M55 55 L100 55 L100 100 L55 100 Z',
};

/**
 * SVG path data (M L H V C Z, absolute) -> subpaths [{ closed, pts: [{x,y,ix,iy,ox,oy}] }] in the 100 box
 */
function parse(d) {
	var tokens = d.match(/[MLHVCZ]|-?\d*\.?\d+/gi);
	var subpaths = [], cur = null, i = 0, x = 0, y = 0, cmd = null;
	var num = () => parseFloat(tokens[i++]);
	var add = (px, py) => { var p = { x: px, y: py, ix: px, iy: py, ox: px, oy: py }; cur.pts.push(p); return p; };
	while (i < tokens.length) {
		if (/[MLHVCZ]/i.test(tokens[i])) cmd = tokens[i++].toUpperCase();
		if (cmd == 'M') { x = num(); y = num(); cur = { closed: false, pts: [] }; subpaths.push(cur); add(x, y); cmd = 'L'; }
		else if (cmd == 'L') { x = num(); y = num(); add(x, y); }
		else if (cmd == 'H') { x = num(); add(x, y); }
		else if (cmd == 'V') { y = num(); add(x, y); }
		else if (cmd == 'C') {
			var c1x = num(), c1y = num(), c2x = num(), c2y = num();
			x = num(); y = num();
			var last = cur.pts[cur.pts.length - 1];
			last.ox = c1x; last.oy = c1y;
			var p = add(x, y);
			p.ix = c2x; p.iy = c2y;
		}
		else if (cmd == 'Z') {
			cur.closed = true;
			//a closing point on top of the first anchor merges into it
			var f = cur.pts[0], l = cur.pts[cur.pts.length - 1];
			if (cur.pts.length > 1 && Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) {
				f.ix = l.ix; f.iy = l.iy;
				cur.pts.pop();
			}
			cmd = null;
		}
		else i++;
	}
	return subpaths;
}

//user shapes (Edit > Define Custom Shape): subpaths in the 100 box, kept in browser storage
var USER = {};
try { USER = JSON.parse(localStorage.getItem('pshot_custom_shapes_v1') || '{}'); } catch (e) { USER = {}; }

function names() {
	return Object.keys(SHAPES).concat(Object.keys(USER));
}

/**
 * Edit > Define Custom Shape: document subpaths -> a named shape
 */
function define(name, subpaths) {
	var xs = [], ys = [];
	subpaths.forEach(sp => sp.pts.forEach(p => { xs.push(p.x, p.ix, p.ox); ys.push(p.y, p.iy, p.oy); }));
	var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
	var s = 100 / Math.max(1e-6, Math.max(Math.max.apply(null, xs) - x0, Math.max.apply(null, ys) - y0));
	var n = (v, o) => Math.round((v - o) * s * 100) / 100;
	USER[name] = subpaths.map(sp => ({ closed: sp.closed, pts: sp.pts.map(p => ({ x: n(p.x, x0), y: n(p.y, y0), ix: n(p.ix, x0), iy: n(p.iy, y0), ox: n(p.ox, x0), oy: n(p.oy, y0) })) }));
	try { localStorage.setItem('pshot_custom_shapes_v1', JSON.stringify(USER)); } catch (e) { /* storage blocked */ }
}

/**
 * the shape fitted into the box (document coordinates)
 */
function fitted(name, x, y, w, h) {
	var src = USER[name] ? JSON.parse(JSON.stringify(USER[name])) : parse(SHAPES[name] || SHAPES[Object.keys(SHAPES)[0]]);
	//user shapes keep their proportions inside the 100 box
	var m = (px, py) => [x + px / 100 * w, y + py / 100 * h];
	return src.map(sp => ({
		closed: sp.closed,
		pts: sp.pts.map(p => {
			var a = m(p.x, p.y), i = m(p.ix, p.iy), o = m(p.ox, p.oy);
			return { x: a[0], y: a[1], ix: i[0], iy: i[1], ox: o[0], oy: o[1] };
		}),
	}));
}

function user_names() {
	return Object.keys(USER);
}

function remove(name) {
	delete USER[name];
	try { localStorage.setItem('pshot_custom_shapes_v1', JSON.stringify(USER)); } catch (e) { /* storage blocked */ }
}

function rename(name, to) {
	if (!USER[name] || !to || USER[to] || SHAPES[to]) return;
	USER[to] = USER[name];
	remove(name);
}

function user_data() {
	return USER;
}

function import_shapes(data) {
	Object.assign(USER, data || {});
	try { localStorage.setItem('pshot_custom_shapes_v1', JSON.stringify(USER)); } catch (e) { /* storage blocked */ }
}

export { names, fitted, define, user_names, remove, rename, user_data, import_shapes };
