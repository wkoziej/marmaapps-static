/**
 * @typedef {import('../../types/types').MarmaPoint} MarmaPoint
 */

import { ErrorMessages } from '../../constants/textConstants.js';

/**
 * Kontroler zarządzający logiką wyszukiwania punktów marma.
 */
export class SearchController {
    /**
     * @param {import('./SearchState').SearchState} searchState - Stan wyszukiwania
     * @param {import('../../services/ApiService').ApiService} apiService - Serwis API
     * @param {import('../../managers/PointManager').PointManager} pointManager - Manager punktów
     */
    constructor(searchState, apiService, pointManager) {
        this.searchState = searchState;
        this.apiService = apiService;
        this.pointManager = pointManager;
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
            this.searchState.setError(ErrorMessages.NO_INPUT);
            this.pointManager.clearPoints();
            return;
        }

        if (this.searchState.isProcessing) {
            return;
        }

        try {
            this.searchState.setProcessing(true);
            this.searchState.setSelectedPoint(null);
            this.pointManager.clearPoints();
            
            const answer = await this.apiService.getAnswer(searchText);
            console.log('API response:', answer);
            
            const points = answer?.points || [];
            console.log('Points:', points);

            if (points.length > 0) {
                this.searchState.setSearchResults(points);
                this.pointManager.updatePoints(points);
            } else {
                this.searchState.setError(ErrorMessages.NO_RESULTS);
                this.pointManager.clearPoints();
            }
        } catch (error) {
            console.error('Search error:', error);
            this.searchState.setError(ErrorMessages.API_ERROR);
            this.pointManager.clearPoints();
        } finally {
            this.searchState.setProcessing(false);
        }
    }

    /**
     * Resetuje stan wyszukiwania
     */
    reset() {
        this.searchState.reset();
        this.pointManager.clearPoints();
    }
} 