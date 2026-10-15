/**
 * Adresy stron aplikacji i cel powrotu po logowaniu (ochrona przed open redirect).
 * Wszystkie adresy są względne wobec `import.meta.env.BASE_URL` (`base` Vite, np. "/marmaapps-static/").
 */

/** Strony, na które wolno wrócić po logowaniu. '' = strona startowa (index.html). */
export const APP_PAGES = Object.freeze(['', 'index.html', 'points.html']);

/**
 * Zwraca bezpieczny cel powrotu: tylko nazwa strony z `APP_PAGES`.
 * Każda inna wartość (adres absolutny, `//host`, `/\host`, `javascript:`, warianty zakodowane,
 * ścieżki z `..`, parametry) daje stronę startową. Brak dekodowania: porównanie dokładne z listą.
 * @param {unknown} raw - Wartość parametru `next`
 * @returns {string}
 */
export function safeNext(raw) {
    if (typeof raw !== 'string') {
        return '';
    }
    const page = raw.startsWith('./') ? raw.slice(2) : raw;
    return APP_PAGES.includes(page) ? page : '';
}

/**
 * Strona aplikacji dla ścieżki z `location.pathname`.
 * @param {string} pathname
 * @param {string} baseUrl
 * @returns {string} Nazwa strony z `APP_PAGES` ('' dla strony startowej i nieznanych ścieżek)
 */
export function currentPage(pathname, baseUrl) {
    if (typeof pathname !== 'string' || !pathname.startsWith(baseUrl)) {
        return '';
    }
    return safeNext(pathname.slice(baseUrl.length));
}

/**
 * Adres strony logowania z celem powrotu (bez parametru, gdy celem jest strona startowa).
 * @param {string} baseUrl
 * @param {string} next
 */
export function loginUrl(baseUrl, next) {
    const page = safeNext(next);
    return page ? `${baseUrl}login.html?next=${encodeURIComponent(page)}` : `${baseUrl}login.html`;
}

/**
 * Adres strony aplikacji; nieznany cel daje stronę startową.
 * @param {string} baseUrl
 * @param {string} page
 */
export function pageUrl(baseUrl, page) {
    return `${baseUrl}${safeNext(page)}`;
}
