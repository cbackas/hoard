// Route paths, shared by the router and the views that link or post to them.

export const SIGN_IN_PATH = "/sign-in";
export const SIGN_IN_CALLBACK_PATH = `${SIGN_IN_PATH}/callback`;
export const SIGN_OUT_PATH = "/sign-out";
export const SERVERS_PATH = "/servers";
/** The account menu's server submenu fetches its items from here. */
export const SERVER_MENU_PATH = `${SERVERS_PATH}/menu`;
/** The header's Library index counts, which poll here while the index builds. */
export const LIBRARY_PATH = "/library";
export const LIBRARY_REFRESH_PATH = `${LIBRARY_PATH}/refresh`;
