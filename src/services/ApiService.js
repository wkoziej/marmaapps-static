import { ApiConfig } from '../constants/config.js';

/**
 * @class ApiService
 * @description Klasa odpowiedzialna za komunikację z API
 */
export class ApiService {
    /**
     * @constructor
     * @param {string} baseUrl - Bazowy URL API
     * @param {number} [timeout=ApiConfig.DEFAULT_TIMEOUT] - Timeout zapytań w milisekundach
     */
    constructor(baseUrl, timeout = ApiConfig.DEFAULT_TIMEOUT) {
        this.baseUrl = baseUrl;
        this.timeout = timeout;
    }

    /**
     * Tworzy Promise, który zostanie odrzucony po określonym czasie
     * @param {number} timeout - Czas w milisekundach
     * @returns {Promise} Promise z timeoutem
     */
    createTimeoutPromise(timeout) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Request timed out")), timeout);
        });
    }

    /**
     * Wykonuje zapytanie do API z obsługą timeoutu
     * @param {string} url - URL endpointu
     * @returns {Promise} Promise z odpowiedzią lub błędem
     */
    async fetchWithTimeout(url) {
        try {
            const timeoutPromise = this.createTimeoutPromise(this.timeout);
            const fetchPromise = fetch(url);
            
            const response = await Promise.race([fetchPromise, timeoutPromise]);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error("API request failed:", error);
            throw error;
        }
    }

    /**
     * Pobiera odpowiedź dla zadanego problemu
     * @param {string} problem - Zapytanie użytkownika
     * @returns {Promise} Promise z odpowiedzią
     */
    async getAnswer(problem) {
        const url = `${this.baseUrl}/pointsdb/answer?problem=${encodeURIComponent(problem)}`;
        const data = await this.fetchWithTimeout(url);
        return data.answer;
    }
}
