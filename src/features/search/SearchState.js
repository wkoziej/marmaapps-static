/**
 * @typedef {import('../../types/types').MarmaPoint} MarmaPoint
 */

/**
 * Klasa zarządzająca stanem wyszukiwania punktów marma.
 */
export class SearchState {
    constructor() {
        /** @type {boolean} */
        this.isProcessing = false;
        
        /** @type {MarmaPoint[]} */
        this.searchResults = [];
        
        /** @type {MarmaPoint|null} */
        this.selectedPoint = null;
        
        /** @type {string|null} */
        this.error = null;
        
        /** @type {Set<Function>} */
        this.listeners = new Set();
    }

    /**
     * Dodaje listener na zmiany stanu
     * @param {Function} listener 
     */
    addListener(listener) {
        this.listeners.add(listener);
    }

    /**
     * Usuwa listener zmian stanu
     * @param {Function} listener 
     */
    removeListener(listener) {
        this.listeners.delete(listener);
    }

    /**
     * Powiadamia listenery o zmianie stanu
     */
    notifyListeners() {
        this.listeners.forEach(listener => listener(this));
    }

    /**
     * Ustawia stan przetwarzania
     * @param {boolean} isProcessing 
     */
    setProcessing(isProcessing) {
        this.isProcessing = isProcessing;
        this.notifyListeners();
    }

    /**
     * Ustawia wyniki wyszukiwania
     * @param {MarmaPoint[]} results 
     */
    setSearchResults(results) {
        this.searchResults = results;
        this.error = null;
        this.notifyListeners();
    }

    /**
     * Ustawia wybrany punkt
     * @param {MarmaPoint|null} point 
     */
    setSelectedPoint(point) {
        this.selectedPoint = point;
        this.notifyListeners();
    }

    /**
     * Ustawia błąd
     * @param {string|null} error 
     */
    setError(error) {
        this.error = error;
        this.notifyListeners();
    }

    /**
     * Resetuje stan
     */
    reset() {
        this.isProcessing = false;
        this.searchResults = [];
        this.selectedPoint = null;
        this.error = null;
        this.notifyListeners();
    }
} 