/** Nawigacja przeglądarki (osobny moduł, aby testy mogły ją podmienić). */

/** @param {string} url */
export function redirect(url) {
    window.location.replace(url);
}

export function currentPathname() {
    return window.location.pathname;
}
