/**
 * Nazwa punktu do wyświetlenia: nazwy z opisu (`doc.names`), a gdy opisu brak — pole `name`.
 * Punkt bez dokumentu ma `doc` równe `{}` (lub `null` w starszych odpowiedziach).
 * @param {{name?: string, doc?: {names?: string[]}|null}} point
 * @returns {string}
 */
export function getPointDisplayName(point) {
    const names = point?.doc?.names;
    if (Array.isArray(names) && names.length > 0) {
        return names.join(', ');
    }
    return point?.name ?? '';
}
