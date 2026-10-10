/*
 * pshot - CS6 font family menu (options bar and Character panel): each font
 * with a "Sample" in that typeface at the Type > Font Preview Size; typing
 * filters the list.
 */

const SIZES = { 'None': 0, 'Small': 11, 'Medium': 14, 'Large': 18, 'Extra Large': 24, 'Huge': 32 };

function preview_size() {
	var v = 'Medium';
	try { v = localStorage.getItem('pshot_font_preview') || 'Medium'; } catch (e) { /* storage blocked */ }
	return SIZES[v] == null ? 'Medium' : v;
}

function set_preview_size(v) {
	try { localStorage.setItem('pshot_font_preview', v); } catch (e) { /* storage blocked */ }
}

function esc(v) {
	return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/**
 * a button showing the font; the menu opens below it
 */
function font_button(fonts, value, on_pick, extra_class) {
	var b = document.createElement('button');
	b.type = 'button';
	b.className = 'ps_font_button' + (extra_class ? ' ' + extra_class : '');
	b.title = 'Set the font family';
	b.innerHTML = '<span class="ps_font_name">' + esc(value) + '</span><span class="ps_caret">&#9662;</span>';
	b.addEventListener('click', () => open_menu(b, fonts, value, on_pick));
	return b;
}

function open_menu(anchor, fonts, value, on_pick) {
	var existing = document.querySelector('.ps_font_menu');
	if (existing) { existing.remove(); return; }
	var px = SIZES[preview_size()];
	var menu = document.createElement('div');
	menu.className = 'ps_font_menu';
	menu.innerHTML = '<input type="text" class="ps_font_filter" placeholder="Font" value=""><div class="ps_font_list"></div>';
	var list = menu.querySelector('.ps_font_list'), filter = menu.querySelector('.ps_font_filter');
	var close = () => {
		menu.remove();
		document.removeEventListener('mousedown', outside, true);
	};
	var render = () => {
		var q = filter.value.trim().toLowerCase();
		list.innerHTML = fonts.filter(f => f && (!q || f.toLowerCase().indexOf(q) >= 0)).map(f => {
			var special = f.indexOf('[') == 0;
			return '<div class="ps_font_row' + (f == value ? ' active' : '') + '" data-font="' + esc(f) + '"><span class="ps_font_label">' + esc(f) + '</span>'
				+ (px && !special ? '<span class="ps_font_sample" style="font-family:&quot;' + esc(f) + '&quot;;font-size:' + px + 'px">Sample</span>' : '') + '</div>';
		}).join('');
		list.querySelectorAll('.ps_font_row').forEach(r => r.addEventListener('click', () => { close(); on_pick(r.dataset.font); }));
		var act = list.querySelector('.ps_font_row.active');
		if (act) act.scrollIntoView({ block: 'nearest' });
	};
	filter.addEventListener('input', render);
	filter.addEventListener('keydown', (e) => {
		e.stopPropagation();
		if (e.key == 'Escape') close();
		if (e.key == 'Enter') {
			var first = list.querySelector('.ps_font_row');
			if (first) { close(); on_pick(first.dataset.font); }
		}
	});
	document.body.appendChild(menu);
	render();
	var r = anchor.getBoundingClientRect();
	menu.style.left = Math.max(0, Math.min(window.innerWidth - menu.offsetWidth - 4, r.left)) + 'px';
	menu.style.top = (r.bottom + 2) + 'px';
	filter.focus();
	var outside = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) close(); };
	setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
}

export { font_button, preview_size, set_preview_size, SIZES as FONT_PREVIEW_SIZES };
