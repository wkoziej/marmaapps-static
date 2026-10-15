/**
 * @typedef {import('../../types/types').MarmaPoint} MarmaPoint
 */

import { ErrorMessages } from '../../constants/textConstants.js';
import { ApiError, SessionExpiredError } from '../../services/ApiService.js';

/**
 * Kontroler zarządzający logiką wyszukiwania punktów marma.
 */
export class SearchController {
    /**
     * @param {import('./SearchState').SearchState} searchState - Stan wyszukiwania
     * @param {import('../../services/ApiService').ApiService} apiService - Serwis API
     * @param {import('../../managers/PointManager').PointManager} pointManager - Manager punktów
     * @param {() => void} [onSessionExpired] - Wywoływane po błędzie sesji (401); przekierowanie do logowania (U7)
     */
    constructor(searchState, apiService, pointManager, onSessionExpired = () => {}) {
        this.searchState = searchState;
        this.apiService = apiService;
        this.pointManager = pointManager;
        this.onSessionExpired = onSessionExpired;
    }

    /**
     * Obsługuje kliknięcie w punkt
     * @param {MarmaPoint} point - Wybrany punkt
     */
    handlePointClick(point) {
        this.searchState.setSelectedPoint(point);
        this.pointManager.setSelectedPoint(point);
    }

    /**
     * Wykonuje wyszukiwanie dla podanego tekstu
     * @param {string} searchText - Tekst do wyszukania
     * @returns {Promise<void>}
     */
    async search(searchText) {
        if (!searchText?.trim()) {
            this.clearResults();
            this.searchState.setError(ErrorMessages.NO_INPUT);
            this.pointManager.clearPoints();
            return;
        }

        if (this.searchState.isProcessing) {
            return;
        }

        try {
            this.searchState.setProcessing(true);
            this.clearResults();
            
            const answer = await this.apiService.getAnswer(searchText);
            const points = answer?.points || [];

            if (points.length > 0) {
                this.searchState.setSearchResults(points);
                this.pointManager.updatePoints(points);
            } else {
                this.searchState.setError(ErrorMessages.NO_RESULTS);
                this.pointManager.clearPoints();
            }
        } catch (error) {
            console.error('Search error:', error);
            if (error instanceof SessionExpiredError) {
                this.onSessionExpired();
            }
            this.searchState.setError(error instanceof ApiError ? error.message : ErrorMessages.API_ERROR);
            this.pointManager.clearPoints();
        } finally {
            this.searchState.setProcessing(false);
        }
    }

    /**
     * Usuwa poprzednie wyniki i wybrany punkt (scena 3D i panel szczegółów nie pokazują starych danych)
     */
    clearResults() {
        this.searchState.setSelectedPoint(null);
        this.searchState.setSearchResults([]);
        this.pointManager.clearPoints();
    }

    /**
     * Resetuje stan wyszukiwania
     */
    reset() {
        this.searchState.reset();
        this.pointManager.clearPoints();
    }
} 