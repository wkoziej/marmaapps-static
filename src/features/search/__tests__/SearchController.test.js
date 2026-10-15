import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { SearchController } from '../SearchController.js';
import { SearchState } from '../SearchState.js';
import { ErrorMessages } from '../../../constants/textConstants.js';

describe('SearchController', () => {
    let searchController;
    let searchState;
    let apiService;
    let pointManager;
    
    beforeEach(() => {
        // Przygotowanie mocków
        searchState = new SearchState();
        apiService = {
            getAnswer: vi.fn()
        };
        pointManager = {
            updatePoints: vi.fn(),
            clearPoints: vi.fn(),
            setSelectedPoint: vi.fn()
        };
        
        // Inicjalizacja kontrolera
        searchController = new SearchController(searchState, apiService, pointManager);
    });
    
    describe('search', () => {
        test('powinien obsłużyć pusty tekst wyszukiwania', async () => {
            await searchController.search('');
            
            expect(searchState.error).toBe(ErrorMessages.NO_INPUT);
            expect(apiService.getAnswer).not.toHaveBeenCalled();
        });
        
        test('powinien zignorować wyszukiwanie gdy poprzednie jest w toku', async () => {
            searchState.setProcessing(true);
            
            await searchController.search('test');
            
            expect(apiService.getAnswer).not.toHaveBeenCalled();
        });
        
        test('powinien obsłużyć sukces wyszukiwania', async () => {
            const mockPoints = [
                { doc: { names: ['Test Point'] } }
            ];
            apiService.getAnswer.mockResolvedValue({ points: mockPoints });
            
            await searchController.search('test');
            
            expect(searchState.isProcessing).toBe(false);
            expect(searchState.searchResults).toBe(mockPoints);
            expect(searchState.error).toBeNull();
            expect(pointManager.updatePoints).toHaveBeenCalledWith(mockPoints);
        });
        
        test('powinien obsłużyć brak wyników', async () => {
            apiService.getAnswer.mockResolvedValue({ points: [] });
            
            await searchController.search('test');
            
            expect(searchState.isProcessing).toBe(false);
            expect(searchState.error).toBe(ErrorMessages.NO_RESULTS);
            expect(pointManager.clearPoints).toHaveBeenCalled();
        });
        
        test('powinien obsłużyć błąd API', async () => {
            apiService.getAnswer.mockRejectedValue(new Error('API Error'));
            
            await searchController.search('test');
            
            expect(searchState.isProcessing).toBe(false);
            expect(searchState.error).toBe(ErrorMessages.API_ERROR);
            expect(pointManager.clearPoints).toHaveBeenCalled();
        });
    });
    
    describe('handlePointClick', () => {
        test('powinien zaktualizować wybrany punkt', () => {
            const mockPoint = { doc: { names: ['Test Point'] } };
            
            searchController.handlePointClick(mockPoint);
            
            expect(searchState.selectedPoint).toBe(mockPoint);
            expect(pointManager.setSelectedPoint).toHaveBeenCalledWith(mockPoint);
        });
    });
    
    describe('reset', () => {
        test('powinien zresetować stan i wyczyścić punkty', () => {
            searchController.reset();
            
            expect(searchState.isProcessing).toBe(false);
            expect(searchState.searchResults).toEqual([]);
            expect(searchState.selectedPoint).toBeNull();
            expect(searchState.error).toBeNull();
            expect(pointManager.clearPoints).toHaveBeenCalled();
        });
    });
}); 