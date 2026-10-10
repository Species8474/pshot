/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

import app from './../../app.js';
import config from './../../config.js';
import menuDefinition from './../../config-menu.js';
import Tools_translate_class from './../../modules/tools/translate.js';

/**
 * class responsible for rendering main menu
 */
class GUI_menu_class {

	constructor() {
		this.eventSubscriptions = {};
		this.dropdownMaxHeightMargin = 15;
		this.menuContainer = null;
		this.menuBarNode = null;
		this.lastFocusedMenuBarLink = 0;
		this.dropdownStack = [];
		this.hover_target = null;
		this.hover_timer = null;

		this.Tools_translate = new Tools_translate_class();
	}

	render_main() {
		this.menuContainer = document.getElementById('main_menu');

		let menuTemplate = '<ul class="menu_bar" role="menubar" tabindex="0">';
		for (let i = 0; i < menuDefinition.length; i++) {
			const item = menuDefinition[i];
			menuTemplate += this.generate_menu_bar_item_template(item, i);
		}
		menuTemplate += '</ul>';

		this.menuContainer.innerHTML = menuTemplate;
		this.menuBarNode = this.menuContainer.querySelector('[role="menubar"]');

		this.menuContainer.addEventListener('click', (event) => { return this.on_click_menu(event); }, true);
		this.menuContainer.addEventListener('keydown', (event) => { return this.on_key_down_menu(event); }, true);
		this.menuContainer.addEventListener('mouseover', (event) => { return this.on_mouse_over_menu(event); });
		this.menuBarNode.addEventListener('focus', (event) => { return this.on_focus_menu_bar(event); });
		this.menuBarNode.addEventListener('blur', (event) => { return this.on_blur_menu_bar(event); });
		this.menuBarNode.querySelectorAll('a').forEach((link) => {
			link.addEventListener('focus', (event) => { return this.on_focus_menu_bar_link(event); });
		});
		document.body.addEventListener('mousedown', (event) => { return this.on_mouse_down_body(event); }, true);
		document.body.addEventListener('touchstart', (event) => { return this.on_mouse_down_body(event); }, true);
		window.addEventListener('resize', (event) => { return this.on_resize_window(event); }, true);
		
		document.body.classList.add('loaded');
		
		if (config.LANG != 'en') {
			this.Tools_translate.translate(config.LANG, this.menuContainer);
		}
	}

	on(eventName, callback) {
		if (!this.eventSubscriptions[eventName]) {
			this.eventSubscriptions[eventName] = [];
		}
		if (!this.eventSubscriptions[eventName].includes(callback)) {
			this.eventSubscriptions[eventName].push(callback);
		}
	}

	emit(eventName, payload, object) {
		if (this.eventSubscriptions[eventName]) {
			for (let callback of this.eventSubscriptions[eventName]) {
				callback(payload, object);
			}
		}
	}

	generate_menu_bar_item_template(definition, index) {
		return `
			<li>
				<a id="main_menu_0_${index}" role="menuitem" tabindex="-1" aria-haspopup="true" aria-expanded="false"
					href="javascript:void(0)" data-level="0" data-index="${ index }"><span class="name trn">${ definition.name }</span></a>
			</li>
		`.trim();
	}

	generate_menu_dropdown_item_template(definition, level, index) {
		if (definition.divider) {
			return `
				<li role="presentation">
					<hr>
				</li>
			`.trim();
		} else {
			const has_children = !!definition.children;
			const disabled = this.is_disabled(definition);
			const checked = this.is_checked(definition);
			let name = definition.name;
			if (definition.dynamic_name) {
				name = this.Ps_commands()[definition.dynamic_name]();
			}
			const hidden = definition.ps_hidden && !this.show_all_items;
			const color = definition.ps_color ? ' ps_menu_color_' + definition.ps_color.toLowerCase() : '';
			return `
				<li${ hidden ? ' style="display:none"' : '' }>
					<a id="main_menu_${ level }_${ index }" role="menuitem" tabindex="-1" aria-haspopup="${ has_children + '' }"
						class="${ disabled ? 'disabled' : '' }${ color }" ${ disabled ? 'aria-disabled="true"' : '' }
						href="${ definition.href ? definition.href : 'javascript:void(0)' }"
						target="${ definition.href ? '_blank' : '_self' }"
						data-level="${ level }" data-index="${ index }">
						<span class="check">${ checked ? '&#10003;' : '' }</span>
						<span class="name">${ name }</span>
						${ !!definition.shortcut ? `
							<span class="shortcut"><span class="sr_only">Shortcut Key:</span>${ definition.shortcut }</span>
						` : `` }
					</a>
				</li>
			`.trim();
		}
	}

	Ps_commands() {
		return app.GUI.modules['ps/commands'];
	}

	/**
	 * CS6 items pshot doesn't implement yet have no target: shown, but greyed out.
	 */
	is_disabled(definition) {
		if (definition.children) {
			return definition.children.length == 0;
		}
		return !definition.target && !definition.href;
	}

	is_checked(definition) {
		if (definition.checked === true) {
			return true;
		}
		if (typeof definition.checked === 'string' && app.GUI.Ps_workspace) {
			return app.GUI.Ps_workspace.is_checked(definition.checked);
		}
		return false;
	}

	/**
	 * CS6: once a menu is open, hovering another menu title switches to it, and
	 * hovering an item opens its submenu (or closes deeper ones).
	 */
	on_mouse_over_menu(event) {
		const target = event.target.closest('a');
		if (!target || target === this.hover_target) {
			return;
		}
		this.hover_target = target;
		const level = parseInt(target.getAttribute('data-level'), 10) || 0;
		if (level === 0) {
			if (this.dropdownStack.length > 0 && target.getAttribute('aria-expanded') !== 'true') {
				this.close_child_dropdowns(0);
				this.toggle_dropdown(target, true);
			}
			return;
		}
		clearTimeout(this.hover_timer);
		this.hover_timer = setTimeout(() => {
			if (target.getAttribute('aria-haspopup') === 'true' && !target.classList.contains('disabled')) {
				if (target.getAttribute('aria-expanded') !== 'true') {
					this.toggle_dropdown(target, true);
				}
			} else if (this.dropdownStack.length > level) {
				this.close_child_dropdowns(level);
			}
		}, 120);
	}

	/**
	 * next focusable (enabled, non-divider) link in a dropdown, wrapping around
	 */
	find_sibling_link(menuParent, linkIndex, step) {
		const links = Array.from(menuParent.querySelectorAll('a[data-index]:not(.disabled)'));
		if (links.length === 0) {
			return null;
		}
		const indexes = links.map(l => parseInt(l.getAttribute('data-index'), 10));
		let pos = indexes.indexOf(linkIndex);
		if (pos === -1) {
			pos = step > 0 ? -1 : 0;
		}
		pos = (pos + step + links.length) % links.length;
		return links[pos];
	}

	on_mouse_down_body(event) {
		const target = event.touches && event.touches.length > 0 ? event.touches[0].target : event.target;

		// Clicked outside of menu; close dropdowns.
		if (target && !this.menuContainer.contains(target)) {
			this.close_child_dropdowns(0);
		}
	}

	on_focus_menu_bar(event) {
		if (document.activeElement === this.menuBarNode) {
			let lastFocusedLink = this.menuBarNode.querySelector(`[data-index="${ this.lastFocusedMenuBarLink }"]`);
			if (!lastFocusedLink) {
				lastFocusedLink = this.menuBarNode.querySelector('a');
			}
			lastFocusedLink.focus();
		}
	}

	on_focus_menu_bar_link(event) {
		this.lastFocusedMenuBarLink = parseInt(event.target.getAttribute('data-index'), 10) || 0;
	}

	on_blur_menu_bar(event) {
		// TODO
	}

	on_key_down_menu(event) {
		const key = event.key;
		const activeElement = document.activeElement;

		if (activeElement && activeElement.tagName === 'A') {
			const linkLevel = parseInt(activeElement.getAttribute('data-level'), 10) || 0;
			const linkIndex = parseInt(activeElement.getAttribute('data-index'), 10) || 0;
			const menuParent = activeElement.closest('ul');
			if (linkLevel === 0) {
				if (['Right', 'ArrowRight'].includes(event.key)) {
					let nextLink = menuParent.querySelector(`[data-index="${ linkIndex + 1 }"]`);
					if (!nextLink) {
						nextLink = menuParent.querySelector(`[data-index="0"]`);
					}
					nextLink.focus();
				}
				else if (['Left', 'ArrowLeft'].includes(event.key)) {
					let previousLink = menuParent.querySelector(`[data-index="${ linkIndex - 1 }"]`);
					if (!previousLink) {
						previousLink = menuParent.querySelector(`[data-index="${ menuParent.querySelectorAll('[data-index]').length - 1 }"]`);
					}
					previousLink.focus();
				}
				else if (['Down', 'ArrowDown'].includes(event.key)) {
					if (activeElement.getAttribute('aria-haspopup') === 'true') {
						event.preventDefault();
						activeElement.click();
					}
				}
				else if (event.key === 'Home') {
					menuParent.querySelector(`[data-index="0"]`).focus();
				}
				else if (event.key === 'End') {
					menuParent.querySelector(`[data-index="${ menuParent.querySelectorAll('[data-index]').length - 1 }"]`).focus();
				}
				else if ([' ', 'Enter'].includes(event.key)) {
					event.preventDefault();
					activeElement.click();
				}
			} else {
				if (['Up', 'ArrowUp'].includes(event.key)) {
					event.preventDefault();
					const previousLink = this.find_sibling_link(menuParent, linkIndex, -1);
					if (previousLink) {
						previousLink.focus();
					}
				}
				else if (['Down', 'ArrowDown'].includes(event.key)) {
					event.preventDefault();
					const nextLink = this.find_sibling_link(menuParent, linkIndex, 1);
					if (nextLink) {
						nextLink.focus();
					}
				}
				else if (['Right', 'ArrowRight'].includes(event.key)) {
					if (activeElement.getAttribute('aria-haspopup') === 'true') {
						activeElement.click();
					}
					else if (this.dropdownStack.length > 1) {
						const opener = this.dropdownStack[linkLevel - 1].opener;
						opener.click();
						opener.focus();
					}
					else {
						const menuBarLinkIndex = parseInt(this.dropdownStack[0].opener.getAttribute('data-index'), 10) || 0;
						let nextLink = this.menuBarNode.querySelector(`[data-index="${ menuBarLinkIndex + 1 }"]`);
						if (!nextLink) {
							nextLink = this.menuBarNode.querySelector(`[data-index="0"]`);
						}
						nextLink.click();
					}
				}
				else if (['Left', 'ArrowLeft'].includes(event.key)) {
					if (this.dropdownStack.length > 1) {
						const opener = this.dropdownStack[linkLevel - 1].opener;
						opener.click();
						opener.focus();
					} else {
						const menuBarLinkIndex = parseInt(this.dropdownStack[0].opener.getAttribute('data-index'), 10) || 0;
						let previousLink = this.menuBarNode.querySelector(`[data-index="${ menuBarLinkIndex - 1 }"]`);
						if (!previousLink) {
							previousLink = this.menuBarNode.querySelector(`[data-index="${ this.menuBarNode.querySelectorAll('[data-index]').length - 1 }"]`);
						}
						previousLink.click();
					}
				}
				else if (event.key === 'Home') {
					menuParent.querySelector(`[data-index="0"]`).focus();
				}
				else if (event.key === 'End') {
					menuParent.querySelector(`[data-index="${ this.dropdownStack[linkLevel - 1].children.length - 1 }"]`).focus();
				}
				else if ([' ', 'Enter'].includes(event.key)) {
					event.preventDefault();
					activeElement.click();
				}
				else if (['Esc', 'Escape'].includes(event.key)) {
					const opener = this.dropdownStack[linkLevel - 1].opener;
					opener.click();
					opener.focus();
				}
				else if (event.key === 'Tab') {
					this.close_child_dropdowns(0);
				}
			}
		}
	}

	on_click_menu(event) {
		const target = event.target.closest('a');

		// Any link in the menu is clicked.
		if (target && target.tagName === 'A') {
			if (target.dataset.showAll) {
				//reopen the same menu with every item
				event.preventDefault();
				this.show_all_items = true;
				this.reopening = true;
				const top = this.dropdownStack[0];
				this.close_child_dropdowns(0);
				if (top && top.opener) this.toggle_dropdown(top.opener, false);
				this.reopening = false;
				return;
			}
			if (target.classList.contains('disabled')) {
				event.preventDefault();
				return;
			}
			const hasPopup = target.getAttribute('aria-haspopup') === 'true';			
			if (hasPopup) {
				this.toggle_dropdown(target, event.isTrusted);
			} else {
				this.trigger_link(target);
			}
		} else {
			this.close_child_dropdowns(0);
		}
	}

	on_resize_window(event) {
		if (this.dropdownStack.length > 0) {
			this.position_dropdowns();
		}
	}

	toggle_dropdown(opener, isTrusted) {
		const linkLevel = parseInt(opener.getAttribute('data-level'), 10) || 0;
		const linkIndex = parseInt(opener.getAttribute('data-index'), 10) || 0;
		if (opener.getAttribute('aria-expanded') === 'true') {
			this.close_child_dropdowns(linkLevel);
		} else {
			const parentList = opener.closest('ul');
			parentList.querySelectorAll('a').forEach((item) => {
				item.setAttribute('aria-expanded', 'false');
			});
			opener.setAttribute('aria-expanded', true);
			this.create_dropdown(opener, linkLevel, linkIndex, !isTrusted);
		}
	}

	trigger_link(link) {
		const level = parseInt(link.getAttribute('data-level'), 10) || 0;
		const index = parseInt(link.getAttribute('data-index'), 10) || 0;

		// Find link definition
		let children = menuDefinition;
		for (let i = 0; i < level; i++) {
			const childIndex = this.dropdownStack[i] != null ? this.dropdownStack[i].index : index;
			children = children[childIndex].children;
		}
		let definition = children[index];

		// Close the dropdown
		this.close_child_dropdowns(0);

		// Emit callback events for triggered links
		if (definition.target) {
			this.emit('select_target', definition.target, definition);
		}
		else if (definition.href) {
			this.emit('select_href', definition.href, null);
		}
	}

	close_child_dropdowns(level) {
		//pshot: hidden menu items come back hidden once the menus close
		if (level == 0 && !this.reopening) this.show_all_items = false;
		for (let i = this.dropdownStack.length - 1; i >= 0; i--) {
			if (i >= level) {
				this.dropdownStack[i].element.parentNode.removeChild(this.dropdownStack[i].element);
				this.dropdownStack[i].opener.setAttribute('aria-expanded', false);
			}
		}
		this.dropdownStack = this.dropdownStack.slice(0, level);
	}

	create_dropdown(opener, level, index, focusAfterCreation) {
		this.close_child_dropdowns(level);

		// Find child list in the menu definition
		let children = menuDefinition;
		for (let i = 0; i <= level; i++) {
			const childIndex = this.dropdownStack[i] != null ? this.dropdownStack[i].index : index;
			children = children[childIndex].children;
		}

		// Create the dropdown element, place it in DOM & position it
		let dropdownElement = document.createElement('ul');
		dropdownElement.className = 'menu_dropdown';
		dropdownElement.role = 'menu';
		dropdownElement.tabIndex = 0;
		dropdownElement.setAttribute('aria-labelledby', 'main_menu_' + level + '_' + index);
		let dropdownTemplate = '';
		for (let i = 0; i < children.length; i++) {
			dropdownTemplate += this.generate_menu_dropdown_item_template(children[i], level + 1, i);
		}
		//pshot: Edit > Menus can hide items; CS6 then ends the menu with Show All Menu Items
		if (!this.show_all_items && children.some(c => c.ps_hidden)) {
			dropdownTemplate += '<li role="presentation"><hr></li><li><a role="menuitem" tabindex="-1" href="javascript:void(0)" data-show-all="1"><span class="check"></span><span class="name">Show All Menu Items</span></a></li>';
		}
		dropdownElement.innerHTML = dropdownTemplate;

		this.menuContainer.appendChild(dropdownElement);

		if (config.LANG != 'en') {
			this.Tools_translate.translate(config.LANG, this.menuContainer);
		}

		if (focusAfterCreation) {
			const firstLink = dropdownElement.querySelector('a:not(.disabled)');
			if (firstLink) {
				firstLink.focus();
			}
		}

		this.dropdownStack.push({
			children,
			opener,
			index,
			element: dropdownElement
		});

		this.position_dropdowns();
	}

	position_dropdowns() {
		const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
		const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

		let topNavHeight = 0;
		for (let level = 0; level < this.dropdownStack.length; level++) {
			const dropdownElement = this.dropdownStack[level].element;
			const openerRect = this.dropdownStack[level].opener.getBoundingClientRect();

			topNavHeight = openerRect.height;
			const dropdownMaxHeight = vh - topNavHeight - this.dropdownMaxHeightMargin;
			dropdownElement.style.maxHeight = dropdownMaxHeight + 'px';
			const dropdownRect = dropdownElement.getBoundingClientRect();

			if (level === 0) {
				dropdownElement.style.top = (openerRect.y + openerRect.height) + 'px';

				let left = openerRect.x;
				if (left + dropdownRect.width > vw) {
					left = openerRect.x + openerRect.width - dropdownRect.width;
				}
				if (left + dropdownRect.width > vw) {
					left = vw - dropdownRect.width;
				}
				if (left < 0) {
					left = 0;
				}
				dropdownElement.style.left = left + 'px';
			} else {
				let top = openerRect.y;
				if (top + dropdownRect.height > vh - this.dropdownMaxHeightMargin) {
					top = vh - this.dropdownMaxHeightMargin - dropdownRect.height;
				}
				dropdownElement.style.top = top + 'px';

				let left = openerRect.x + openerRect.width + 1;
				if (left + dropdownRect.width > vw) {
					left = openerRect.x - dropdownRect.width - 1;
				}
				if (left < 0) {
					if (openerRect.x + (openerRect.width / 2) > vw / 2) {
						left = 1;
					} else {
						left = vw - dropdownRect.width - 1;
						if (left < 0) {
							left = 1;
						}
					}
				}
				dropdownElement.style.left = left + 'px';
			}
		}
	}

}

export default GUI_menu_class;
