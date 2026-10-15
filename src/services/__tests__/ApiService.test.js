import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiService, ApiError, SessionExpiredError } from '../ApiService.js';
import { ErrorMessages } from '../../constants/textConstants.js';

const BASE_URL = 'https://projekt.example.supabase.co';
const API_KEY = 'sb_publishable_test';
const TOKEN = 'jwt-sesji-testowej';

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

describe('ApiService', () => {
    let fetchFn;
    let getAccessToken;
    let api;

    beforeEach(() => {
        fetchFn = vi.fn();
        getAccessToken = vi.fn().mockResolvedValue(TOKEN);
        api = new ApiService({ baseUrl: BASE_URL, apiKey: API_KEY, getAccessToken, fetchFn });
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('getAnswer', () => {
        test('wysyła GET do funkcji Edge search z frazą, tokenem sesji i kluczem publicznym', async () => {
            const answer = { points: [{ name: 'Punkt', location: 'Głowa', doc: {}, coordinates: [] }] };
            fetchFn.mockResolvedValue(jsonResponse(200, { answer }));

            const result = await api.getAnswer('ból karku');

            expect(result).toEqual(answer);
            expect(fetchFn).toHaveBeenCalledTimes(1);
            const [url, options] = fetchFn.mock.calls[0];
            expect(url).toBe(`${BASE_URL}/functions/v1/search?problem=${encodeURIComponent('ból karku')}`);
            expect(options.method).toBe('GET');
            expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
            expect(options.headers.apikey).toBe(API_KEY);
        });

        test('usuwa końcowy ukośnik z adresu bazowego', async () => {
            api = new ApiService({ baseUrl: `${BASE_URL}/`, apiKey: API_KEY, getAccessToken, fetchFn });
            fetchFn.mockResolvedValue(jsonResponse(200, { answer: { points: [] } }));

            await api.getAnswer('Tala');

            expect(fetchFn.mock.calls[0][0]).toBe(`${BASE_URL}/functions/v1/search?problem=Tala`);
        });

        test('401 z funkcji → SessionExpiredError', async () => {
            fetchFn.mockResolvedValue(jsonResponse(401, { error: 'Sesja wygasła' }));

            await expect(api.getAnswer('Tala')).rejects.toBeInstanceOf(SessionExpiredError);
        });

        test('401 z bramy w innym formacie (bez JSON) → SessionExpiredError', async () => {
            fetchFn.mockResolvedValue(new Response('Invalid JWT', { status: 401 }));

            const error = await api.getAnswer('Tala').catch(e => e);

            expect(error).toBeInstanceOf(SessionExpiredError);
            expect(error.message).toBe(ErrorMessages.SESSION_EXPIRED);
        });

        test('brak tokenu sesji → SessionExpiredError bez wysyłania żądania', async () => {
            getAccessToken.mockResolvedValue(null);

            await expect(api.getAnswer('Tala')).rejects.toBeInstanceOf(SessionExpiredError);
            expect(fetchFn).not.toHaveBeenCalled();
        });

        test.each([
            [400, ErrorMessages.BAD_REQUEST],
            [403, ErrorMessages.FORBIDDEN],
            [429, ErrorMessages.TOO_MANY_REQUESTS],
            [502, ErrorMessages.SERVICE_UNAVAILABLE],
            [500, ErrorMessages.API_ERROR],
            [405, ErrorMessages.API_ERROR]
        ])('odpowiedź %i → ApiError z komunikatem PL', async (status, message) => {
            fetchFn.mockResolvedValue(jsonResponse(status, { error: 'komunikat z serwera' }));

            const error = await api.getAnswer('Tala').catch(e => e);

            expect(error).toBeInstanceOf(ApiError);
            expect(error).not.toBeInstanceOf(SessionExpiredError);
            expect(error.status).toBe(status);
            expect(error.message).toBe(message);
        });

        test('przekroczenie czasu → błąd "Request timed out" i przerwanie żądania', async () => {
            vi.useFakeTimers();
            let signal;
            fetchFn.mockImplementation((url, options) => {
                signal = options.signal;
                return new Promise(() => {});
            });
            api = new ApiService({ baseUrl: BASE_URL, apiKey: API_KEY, getAccessToken, fetchFn, timeout: 1000 });

            const pending = api.getAnswer('Tala').catch(e => e);
            await vi.advanceTimersByTimeAsync(1000);
            const error = await pending;

            expect(error).toBeInstanceOf(Error);
            expect(error.message).toBe('Request timed out');
            expect(signal.aborted).toBe(true);
        });

        test('błąd sieci jest przekazywany dalej', async () => {
            fetchFn.mockRejectedValue(new TypeError('Failed to fetch'));

            await expect(api.getAnswer('Tala')).rejects.toThrow('Failed to fetch');
        });
    });
});
