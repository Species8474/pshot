/*
 * pshot - CS6 bristle brush tips (Brush panel > Brush Tip Shape for bristle
 * presets): Shape (Round / Flat x Point, Blunt, Curve, Angle, Fan), Bristles,
 * Length, Thickness, Stiffness, Angle. Each bristle draws its own line along
 * the stroke, offset by its place in the tip; points and curves load the
 * middle bristles more, low stiffness lets the bristles wander, long
 * bristles lay down less paint.
 */

const SHAPES = ['Round Point', 'Round Blunt', 'Round Curve', 'Round Angle', 'Round Fan', 'Flat Point', 'Flat Blunt', 'Flat Curve', 'Flat Angle', 'Flat Fan'];

function rnd(i, s) {
	var v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
	return v - Math.floor(v);
}

/**
 * the bristles as unit offsets in the tip (x along the tip's width) and weights
 */
function layout(p) {
	var shape = p.bristle_shape || 'Round Point';
	var flat = shape.indexOf('Flat') === 0, kind = shape.split(' ')[1];
	var n = Math.max(4, Math.round((p.bristles == null ? 35 : p.bristles) / 100 * 90));
	var out = [];
	for (var i = 0; i < n; i++) {
		var x, y;
		if (flat || kind == 'Fan') {
			//a row of bristles (fan: wider and thinner)
			x = (i / (n - 1)) * 2 - 1;
			y = (rnd(i, 2) - 0.5) * (kind == 'Fan' ? 0.12 : 0.35);
			if (kind == 'Fan') x *= 1.15;
		}
		else {
			//a round tuft: even spread in the circle
			var a = i * 2.39996, r = Math.sqrt((i + 0.5) / n);
			x = Math.cos(a) * r;
			y = Math.sin(a) * r;
		}
		var d = flat || kind == 'Fan' ? Math.abs(x) : Math.hypot(x, y);
		var w = 1;
		if (kind == 'Point') w = Math.max(0.15, 1 - d * d);
		else if (kind == 'Curve') w = Math.max(0.2, Math.cos(d * Math.PI / 2));
		else if (kind == 'Angle') w = Math.max(0.15, 0.55 + 0.45 * x);
		else if (kind == 'Fan') w = 0.55 + 0.45 * rnd(i, 3);
		out.push({ x: x, y: y, w: w, s: rnd(i, 7) });
	}
	return out;
}

/**
 * a stroke (points [x, y, size]) drawn with the bristles
 */
function render_bristles(ctx, group, p, color) {
	if (!group.length) return;
	var bristles = layout(p);
	var size = p.size || 25, angle = (p.angle || 0) * Math.PI / 180;
	var thick = Math.max(0.8, (p.bristle_thickness == null ? 2 : p.bristle_thickness) / 100 * size * 0.8);
	var stiff = (p.stiffness == null ? 50 : p.stiffness) / 100;
	var load = 0.45 + 0.5 * (1 - (p.bristle_length == null ? 25 : p.bristle_length) / 100 * 0.6);
	var flow = (p.flow == null ? 100 : p.flow) / 100;
	var cos = Math.cos(angle), sin = Math.sin(angle);
	ctx.save();
	ctx.strokeStyle = color;
	ctx.fillStyle = color;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.lineWidth = thick;
	for (var bi = 0; bi < bristles.length; bi++) {
		var b = bristles[bi];
		ctx.globalAlpha = Math.min(1, b.w * load * flow);
		ctx.beginPath();
		for (var k = 0; k < group.length; k++) {
			var q = group[k], r = (q[2] || size) / 2;
			//soft bristles wander a little along the stroke
			var wob = (1 - stiff) * 0.25 * Math.sin(k * 0.35 + b.s * 20);
			var lx = (b.x + wob) * r, ly = (b.y + wob * 0.5) * r;
			var x = q[0] + lx * cos - ly * sin, y = q[1] + lx * sin + ly * cos;
			if (k == 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		if (group.length == 1) {
			ctx.arc(group[0][0] + b.x * size / 2 * cos, group[0][1] + b.x * size / 2 * sin, thick / 2, 0, Math.PI * 2);
			ctx.fill();
		}
		else ctx.stroke();
	}
	ctx.restore();
}

/**
 * the preset thumbnail: a short bristle stroke
 */
function bristle_thumb(preset, px) {
	var c = document.createElement('canvas');
	c.width = c.height = px;
	var g = c.getContext('2d');
	var pts = [];
	for (var i = 0; i <= 8; i++) pts.push([px * 0.25 + i * px * 0.06, px * 0.7 - Math.sin(i / 8 * Math.PI) * px * 0.35, px * 0.45]);
	render_bristles(g, pts, Object.assign({}, preset, { size: px * 0.45, flow: 100 }), '#000');
	return c;
}

export { SHAPES as BRISTLE_SHAPES, render_bristles, bristle_thumb };
