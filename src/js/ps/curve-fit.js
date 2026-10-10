/*
 * pshot - fitting cubic Bezier curves to traced outlines (Make Work Path).
 * Philip J. Schneider's algorithm ("An Algorithm for Automatically Fitting
 * Digitized Curves", Graphics Gems, 1990): least-squares cubics with Newton
 * reparameterization, split where the error is largest.
 */

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => { var l = len(a) || 1; return [a[0] / l, a[1] / l]; };

function bezier(b, t) {
	var mt = 1 - t;
	return add(add(mul(b[0], mt * mt * mt), mul(b[1], 3 * mt * mt * t)), add(mul(b[2], 3 * mt * t * t), mul(b[3], t * t * t)));
}

function bezier_d1(b, t) {
	var mt = 1 - t;
	return add(add(mul(sub(b[1], b[0]), 3 * mt * mt), mul(sub(b[2], b[1]), 6 * mt * t)), mul(sub(b[3], b[2]), 3 * t * t));
}

function bezier_d2(b, t) {
	return add(mul(add(sub(b[2], mul(b[1], 2)), b[0]), 6 * (1 - t)), mul(add(sub(b[3], mul(b[2], 2)), b[1]), 6 * t));
}

function chord_params(pts) {
	var u = [0];
	for (var i = 1; i < pts.length; i++) u.push(u[i - 1] + len(sub(pts[i], pts[i - 1])));
	var total = u[u.length - 1] || 1;
	return u.map(v => v / total);
}

function generate(pts, u, t1, t2) {
	var p0 = pts[0], p3 = pts[pts.length - 1];
	var C = [[0, 0], [0, 0]], X = [0, 0];
	for (var i = 0; i < pts.length; i++) {
		var t = u[i], mt = 1 - t;
		var a1 = mul(t1, 3 * mt * mt * t), a2 = mul(t2, 3 * mt * t * t);
		C[0][0] += dot(a1, a1); C[0][1] += dot(a1, a2); C[1][1] += dot(a2, a2);
		var tmp = sub(pts[i], add(mul(p0, mt * mt * mt + 3 * mt * mt * t), mul(p3, 3 * mt * t * t + t * t * t)));
		X[0] += dot(a1, tmp); X[1] += dot(a2, tmp);
	}
	C[1][0] = C[0][1];
	var det = C[0][0] * C[1][1] - C[0][1] * C[1][0];
	var seg = len(sub(p3, p0)), eps = 1e-6 * seg;
	var al = det ? (X[0] * C[1][1] - X[1] * C[0][1]) / det : 0, ar = det ? (C[0][0] * X[1] - C[1][0] * X[0]) / det : 0;
	if (al < eps || ar < eps) al = ar = seg / 3;
	return [p0, add(p0, mul(t1, al)), add(p3, mul(t2, ar)), p3];
}

function max_error(pts, b, u) {
	var max = 0, at = Math.floor(pts.length / 2);
	for (var i = 1; i < pts.length - 1; i++) {
		var d = len(sub(bezier(b, u[i]), pts[i]));
		if (d > max) { max = d; at = i; }
	}
	return [max, at];
}

function newton(b, p, t) {
	var d = sub(bezier(b, t), p), d1 = bezier_d1(b, t), d2 = bezier_d2(b, t);
	var den = dot(d1, d1) + dot(d, d2);
	return den ? t - dot(d, d1) / den : t;
}

function fit(pts, t1, t2, error, out) {
	if (pts.length == 2) {
		var dist = len(sub(pts[1], pts[0])) / 3;
		out.push([pts[0], add(pts[0], mul(t1, dist)), add(pts[1], mul(t2, dist)), pts[1]]);
		return;
	}
	var u = chord_params(pts), b = generate(pts, u, t1, t2), e = max_error(pts, b, u);
	if (e[0] < error) { out.push(b); return; }
	if (e[0] < error * 4) {
		for (var it = 0; it < 4; it++) {
			u = u.map((t, i) => newton(b, pts[i], t));
			b = generate(pts, u, t1, t2);
			e = max_error(pts, b, u);
			if (e[0] < error) { out.push(b); return; }
		}
	}
	var s = Math.max(1, Math.min(pts.length - 2, e[1]));
	var tc = norm(sub(pts[s - 1], pts[s + 1]));
	fit(pts.slice(0, s + 1), t1, tc, error, out);
	fit(pts.slice(s), mul(tc, -1), t2, error, out);
}

/**
 * an open run of points (corners at both ends) -> cubic segments [p0, c1, c2, p3]
 */
function fit_curve(pts, error, t1, t2) {
	if (pts.length < 2) return [];
	t1 = t1 || norm(sub(pts[1], pts[0]));
	t2 = t2 || norm(sub(pts[pts.length - 2], pts[pts.length - 1]));
	var out = [];
	fit(pts, t1, t2, error, out);
	return out;
}

/**
 * a closed traced loop (pixel corner points) -> subpath points with handles
 * { x, y, ix, iy, ox, oy }: straight runs stay corners, curves get handles
 */
function fit_loop(loop, error) {
	var n = loop.length;
	if (n < 4) return loop.map(p => ({ x: p.x, y: p.y, ix: p.x, iy: p.y, ox: p.x, oy: p.y }));
	//smooth the pixel staircase
	var P = loop.map((p, i) => {
		var a = loop[(i - 1 + n) % n], c = loop[(i + 1) % n];
		return [(a.x + 2 * p.x + c.x) / 4, (a.y + 2 * p.y + c.y) / 4];
	});
	//corners: where the direction turns sharply over a few points
	var w = Math.max(2, Math.min(6, Math.floor(n / 8)));
	var corners = [];
	for (var i = 0; i < n; i++) {
		var v1 = norm(sub(P[i], P[(i - w + n) % n])), v2 = norm(sub(P[(i + w) % n], P[i]));
		if (dot(v1, v2) < 0.35) corners.push(i);
	}
	//one point per corner cluster (the sharpest)
	var picked = [];
	for (var c of corners) {
		if (picked.length && (c - picked[picked.length - 1]) <= w) continue;
		picked.push(c);
	}
	if (picked.length > 1 && (picked[0] + n - picked[picked.length - 1]) <= w) picked.pop();
	var smooth_split = !picked.length;
	if (smooth_split) picked = [0, Math.floor(n / 2)];
	var segs = [];
	for (var k = 0; k < picked.length; k++) {
		var from = picked[k], to = picked[(k + 1) % picked.length];
		var run = [];
		for (var j = from; ; j = (j + 1) % n) {
			run.push(P[j]);
			if (j == to && run.length > 1) break;
		}
		var t1 = null, t2 = null;
		if (smooth_split) {
			//no corners: keep the curve smooth through the split points
			t1 = norm(sub(P[(from + 1) % n], P[(from - 1 + n) % n]));
			t2 = norm(sub(P[(to - 1 + n) % n], P[(to + 1) % n]));
		}
		segs = segs.concat(fit_curve(run, error, t1, t2));
	}
	var out = segs.map(b => ({ x: b[0][0], y: b[0][1], ix: b[0][0], iy: b[0][1], ox: b[1][0], oy: b[1][1] }));
	segs.forEach((b, i) => {
		var next = out[(i + 1) % out.length];
		next.ix = b[2][0];
		next.iy = b[2][1];
	});
	return out;
}

export { fit_curve, fit_loop };
