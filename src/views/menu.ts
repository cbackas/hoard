// Styles shared by the header's popover menus.

export const MENU_ITEM = "w-full px-4 py-2 text-left text-sm text-neutral-100 hover:bg-neutral-800";
/**
 * A menu panel. The menus are popovers, which the browser closes on a click outside or Esc without any
 * JavaScript; this undoes the popover defaults (centred in the viewport, padded) so CSS anchor positioning
 * can place it next to its button.
 */
export const MENU_PANEL = "m-0 inset-auto w-48 rounded-lg border border-neutral-800 bg-neutral-900 p-0 py-1 text-neutral-100 shadow-lg";
