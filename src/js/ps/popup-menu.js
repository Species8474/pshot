/*
 * pshot - small CS6-style popup menu (flyouts, fx / adjustment buttons, panel menus).
 *
 * items: [{ name, shortcut?, action?: fn, checked?: bool, icon?: svg body, divider?: true }]
 * An item without an action is shown greyed out.
 */

import Dialog_class from './../libs/popup.js';

var open_menu = null;

function close_popup_menu() {
	if (open_menu) {
		open_menu.remove();
		open_menu = null;
		document.removeEventListener('mousedown', on_outside, true);
		document.removeEventListener('keydown', on_key, true);
	}
}

function on_outside(event) {
	if (open_menu && !open_menu.contains(event.target)) {
		close_popup_menu();
	}
}

function on_key(event) {
	if (event.key === 'Escape') {
		close_popup_menu();
		event.stopPropagation();
	}
}

/**
 * @param {HTMLElement} anchor element the menu is attached to
 * @param {Array} items
 * @param {object} opts { placement: 'below' | 'right' , point: {x, y}, className }
 */
function show_popup_menu(anchor, items, opts = {}) {
	close_popup_menu();

	var menu = document.createElement('ul');
	menu.className = 'menu_dropdown ps_popup_menu ' + (opts.className || '');
	menu.setAttribute('role', 'menu');

	items.forEach(function (item) {
		var li = document.createElement('li');
		if (item.divider) {
			li.setAttribute('role', 'presentation');
			li.innerHTML = '<hr>';
			menu.appendChild(li);
			return;
		}
		var a = document.createElement('a');
		a.setAttribute('role', 'menuitem');
		a.href = 'javascript:void(0)';
		if (!item.action) {
			a.className = 'disabled';
			a.setAttribute('aria-disabled', 'true');
		}
		var html = '<span class="check">' + (item.checked ? (opts.mark || '&#10003;') : '') + '</span>';
		if (item.icon) {
			html += '<svg class="ps_menu_icon" viewBox="0 0 18 18" width="16" height="16">' + item.icon + '</svg>';
		}
		html += '<span class="name">' + item.name + '</span>';
		if (item.shortcut) {
			html += '<span class="shortcut">' + item.shortcut + '</span>';
		}
		a.innerHTML = html;
		//don't take focus (e.g. from the type editor the menu acts on)
		a.addEventListener('mousedown', function (event) {
			event.preventDefault();
		});
		a.addEventListener('mouseup', function (event) {
			event.preventDefault();
			//the release of the right-click that opened a context menu under the mouse
			if (event.button == 2) {
				return;
			}
			if (!item.action) {
				return;
			}
			close_popup_menu();
			item.action();
		});
		li.appendChild(a);
		menu.appendChild(li);
	});

	document.body.appendChild(menu);
	var rect = anchor.getBoundingClientRect();
	var mrect = menu.getBoundingClientRect();
	var left, top;
	if (opts.point) {
		//context menus open at the mouse
		left = opts.point.x;
		top = opts.point.y;
	}
	else if (opts.placement === 'above') {
		left = rect.left;
		top = Math.max(0, rect.top - mrect.height - 1);
	}
	else if (opts.placement === 'right') {
		left = rect.right + 1;
		top = rect.top;
	}
	else {
		left = rect.left;
		top = rect.bottom + 1;
	}
	if (left + mrect.width > window.innerWidth) {
		left = Math.max(0, window.innerWidth - mrect.width - 2);
	}
	if (top + mrect.height > window.innerHeight) {
		top = Math.max(0, (opts.point ? opts.point.y : (opts.placement === 'right' ? window.innerHeight : rect.top)) - mrect.height - 2);
	}
	menu.style.left = left + 'px';
	menu.style.top = top + 'px';

	open_menu = menu;
	//register on next tick so the opening click doesn't close it
	setTimeout(function () {
		document.addEventListener('mousedown', on_outside, true);
		document.addEventListener('keydown', on_key, true);
	}, 0);
	return menu;
}

/**
 * a one-field Name dialog (Rename Swatch..., Rename Brush..., ...)
 */
function prompt_name(title, value, on_ok) {
	var POP = new Dialog_class();
	POP.show({
		title: title,
		params: [{ name: 'name', title: 'Name:', value: value }],
		on_finish: (p) => { if (p.name) on_ok(p.name); },
	});
}

export { show_popup_menu, close_popup_menu, prompt_name };
