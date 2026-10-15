import { ApiConfig } from '../constants/config.js';
import { ErrorMessages } from '../constants/textConstants.js';

const SEARCH_PATH = '/functions/v1/search';

/** Komunikaty dla kodów błędów funkcji Edge `search` (decyzja po statusie, nie po treści). */
const STATUS_MESSAGES = {
    400: ErrorMessages.BAD_REQUEST,
    403: ErrorMessages.FORBIDDEN,
    429: ErrorMessages.TOO_MANY_REQUESTS,
    502: ErrorMessages.SERVICE_UNAVAILABLE
};

/**
 * Błąd odpowiedzi API z komunikatem dla użytkownika (PL).
 */
export class ApiError extends Error {
    /**
     * @param {string} message - Komunikat dla użytkownika
     * @param {number} status - Kod HTTP
     */
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

/**
 * Brak sesji lub sesja nieważna (401). Aplikacja powinna przekierować do logowania.
 */
export class SessionExpiredError extends ApiError {
    constructor() {
        super(ErrorMessages.SESSION_EXPIRED, 401);
        this.name = 'SessionExpiredError';
    }
}

/**
 * @class ApiService
 * @description Klasa odpowiedzialna za komunikację z funkcją Edge `search` (Supabase)
 */
export class ApiService {
    /**
     * @param {Object} options
     * @param {string} options.baseUrl - Adres projektu Supabase (VITE_SUPABASE_URL)
     * @param {string} options.apiKey - Klucz publiczny Supabase (VITE_SUPABASE_PUBLISHABLE_KEY)
     * @param {() => Promise<string|null>} options.getAccessToken - Token sesji (src/auth/session.js)
     * @param {number} [options.timeout=ApiConfig.DEFAULT_TIMEOUT] - Timeout zapytań w milisekundach
     * @param {typeof fetch} [options.fetchFn] - Implementacja fetch (testy)
     */
    constructor({ baseUrl, apiKey, getAccessToken, timeout = ApiConfig.DEFAULT_TIMEOUT, fetchFn }) {
        this.baseUrl = String(baseUrl ?? '').replace(/\/+$/, '');
        this.apiKey = apiKey;
        this.getAccessToken = getAccessToken;
        this.timeout = timeout;
        this.fetchFn = fetchFn ?? ((...args) => fetch(...args));
    }

    /**
     * Wykonuje zapytanie do API z obsługą timeoutu (limit obejmuje także odczyt treści)
     * @template T
     * @param {string} url - URL endpointu
     * @param {Object} headers - Nagłówki żądania
     * @param {(response: Response) => Promise<T>} readResponse - Obsługa odpowiedzi (status, treść)
     * @returns {Promise<T>} Wynik `readResponse`
     */
    async fetchWithTimeout(url, headers, readResponse) {
        const controller = new AbortController();
        let timer;
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
                controller.abort();
                reject(new Error('Request timed out'));
            }, this.timeout);
        });

        try {
            const requestPromise = this.fetchFn(url, { method: 'GET', headers, signal: controller.signal })
                .then(readResponse);
            return await Promise.race([requestPromise, timeoutPromise]);
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Pobiera odpowiedź dla zadanego problemu
     * @param {string} problem - Zapytanie użytkownika
     * @returns {Promise<{points: Array}>} Pole `answer` z odpowiedzi
     * @throws {SessionExpiredError} Brak sesji lub odpowiedź 401
     * @throws {ApiError} Inny kod błędu HTTP
     */
    async getAnswer(problem) {
        try {
            const token = await this.getAccessToken();
            if (!token) {
                throw new SessionExpiredError();
            }

            const url = `${this.baseUrl}${SEARCH_PATH}?problem=${encodeURIComponent(problem)}`;
            return await this.fetchWithTimeout(url, {
                Authorization: `Bearer ${token}`,
                apikey: this.apiKey
            }, async (response) => {
                if (response.status === 401) {
                    throw new SessionExpiredError();
                }
                if (!response.ok) {
                    throw new ApiError(STATUS_MESSAGES[response.status] ?? ErrorMessages.API_ERROR, response.status);
                }

                let data;
                try {
                    data = await response.json();
                } catch {
                    throw new ApiError(ErrorMessages.API_ERROR, response.status);
                }
                if (typeof data?.answer !== 'object' || data.answer === null) {
                    throw new ApiError(ErrorMessages.API_ERROR, response.status);
                }
                return data.answer;
            });
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }
}
