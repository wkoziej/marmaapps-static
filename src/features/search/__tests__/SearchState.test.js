import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { SearchState } from '../SearchState.js';

describe('SearchState', () => {
    let searchState;
    let mockListener;

    beforeEach(() => {
        searchState = new SearchState();
        mockListener = vi.fn();
        searchState.addListener(mockListener);
    });

    test('powinien zainicjalizować się z domyślnymi wartościami', () => {
        expect(searchState.isProcessing).toBe(false);
        expect(searchState.searchResults).toEqual([]);
        expect(searchState.selectedPoint).toBeNull();
        expect(searchState.error).toBeNull();
    });

    test('powinien ustawić stan przetwarzania i powiadomić listenery', () => {
        searchState.setProcessing(true);
        
        expect(searchState.isProcessing).toBe(true);
        expect(mockListener).toHaveBeenCalledWith(searchState);
    });

    test('powinien ustawić wyniki wyszukiwania i powiadomić listenery', () => {
        const mockResults = [
            { 
                doc: { 
                    names: ['Test Point'],
                    location_in_polish: 'Test Location'
                }
            }
        ];

        searchState.setSearchResults(mockResults);
        
        expect(searchState.searchResults).toBe(mockResults);
        expect(searchState.error).toBeNull();
        expect(mockListener).toHaveBeenCalledWith(searchState);
    });

    test('powinien ustawić wybrany punkt i powiadomić listenery', () => {
        const mockPoint = { 
            doc: { 
                names: ['Test Point'],
                location_in_polish: 'Test Location'
            }
        };

        searchState.setSelectedPoint(mockPoint);
        
        expect(searchState.selectedPoint).toBe(mockPoint);
        expect(mockListener).toHaveBeenCalledWith(searchState);
    });

    test('powinien ustawić błąd i powiadomić listenery', () => {
        const errorMessage = 'Test error';
        searchState.setError(errorMessage);
        
        expect(searchState.error).toBe(errorMessage);
        expect(mockListener).toHaveBeenCalledWith(searchState);
    });

    test('powinien zresetować stan i powiadomić listenery', () => {
        // Przygotowanie stanu
        searchState.setProcessing(true);
        searchState.setSearchResults([{ doc: { names: ['Test'] } }]);
        searchState.setSelectedPoint({ doc: { names: ['Test'] } });
        searchState.setError('Test error');
        
        // Reset mockListener aby sprawdzić tylko wywołanie po reset()
        mockListener.mockClear();
        
        // Wykonanie
        searchState.reset();
        
        // Weryfikacja
        expect(searchState.isProcessing).toBe(false);
        expect(searchState.searchResults).toEqual([]);
        expect(searchState.selectedPoint).toBeNull();
        expect(searchState.error).toBeNull();
        expect(mockListener).toHaveBeenCalledWith(searchState);
    });

    test('powinien usunąć listener', () => {
        searchState.removeListener(mockListener);
        searchState.setProcessing(true);
        
        expect(mockListener).not.toHaveBeenCalled();
    });
}); 