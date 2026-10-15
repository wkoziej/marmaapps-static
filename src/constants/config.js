/**
 * @typedef {Object} ApiConfig
 * @property {number} DEFAULT_TIMEOUT - Domyślny timeout dla zapytań API (ms)
 * @property {string} DEFAULT_FONT - Domyślna czcionka dla etykiet
 * @property {number} DEFAULT_FONT_SIZE - Domyślny rozmiar czcionki
 */

export const ApiConfig = {
    DEFAULT_TIMEOUT: 20000,
    DEFAULT_FONT: 'Arial',
    DEFAULT_FONT_SIZE: 32
};

/**
 * @typedef {Object} SceneConfig
 * @property {number} CAMERA_FOV - Pole widzenia kamery
 * @property {number} CAMERA_NEAR - Najbliższa płaszczyzna przycinania
 * @property {number} CAMERA_FAR - Najdalsza płaszczyzna przycinania
 */

export const SceneConfig = {
    CAMERA_FOV: 75,
    CAMERA_NEAR: 0.1,
    CAMERA_FAR: 1000
};

/**
 * @typedef {Object} PointConfig
 * @property {number} DEFAULT_POINT_SIZE - Domyślny rozmiar punktu
 * @property {number} SELECTED_POINT_SIZE - Rozmiar zaznaczonego punktu
 * @property {number} DEFAULT_COLOR - Domyślny kolor punktu
 * @property {number} SELECTED_COLOR - Kolor zaznaczonego punktu
 */

export const PointConfig = {
    DEFAULT_POINT_SIZE: 0.004,
    SELECTED_POINT_SIZE: 0.006,
    DEFAULT_COLOR: 0x00ff00,
    SELECTED_COLOR: 0xff0000
};
