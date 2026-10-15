import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { SearchView } from '../SearchView.js';

describe('SearchView', () => {
    let searchView;
    let searchContainer;
    let resultsContainer;
    let detailsContainer;
    let controller;
    let searchInput;
    let searchButton;
    
    beforeEach(() => {
        // Przygotowanie elementów DOM
        searchContainer = document.createElement('div');
        resultsContainer = document.createElement('div');
        detailsContainer = document.createElement('div');
        
        // Tworzenie i konfiguracja elementów formularza
        searchInput = document.createElement('input');
        searchInput.id = 'search-bar__input';
        searchInput.name = 'search-bar__input';
        searchInput.className = 'search-bar__input';
        
        searchButton = document.createElement('button');
        searchButton.id = 'search-bar__button';
        searchButton.className = 'search-bar__button';
        
        // Tworzenie kontenera na szczegóły
        const detailsContent = document.createElement('div');
        detailsContent.id = 'point-details__content';
        
        // Dodawanie elementów do odpowiednich kontenerów
        searchContainer.appendChild(searchInput);
        searchContainer.appendChild(searchButton);
        detailsContainer.appendChild(detailsContent);
        
        // Dodanie elementów do dokumentu
        document.body.appendChild(searchContainer);
        document.body.appendChild(resultsContainer);
        document.body.appendChild(detailsContainer);
        
        // Mock kontrolera
        controller = {
            search: vi.fn(),
            handlePointClick: vi.fn()
        };
        
        // Inicjalizacja widoku
        searchView = new SearchView(searchContainer, resultsContainer, detailsContainer, controller);
    });
    
    // Dodaj czyszczenie po każdym teście
    afterEach(() => {
        document.body.innerHTML = '';
    });
    
    describe('handleSearch', () => {
        test('powinien wywołać wyszukiwanie z wartością z inputa', async () => {
            searchInput.value = 'test query';
            
            await searchView.handleSearch();
            
            expect(controller.search).toHaveBeenCalledWith('test query');
        });
    });
    
    describe('updateView', () => {
        test('powinien wyświetlić stan ładowania', () => {
            const state = {
                isProcessing: true,
                searchResults: [],
                selectedPoint: null,
                error: null
            };
            
            // Najpierw wyczyść kontener wyników
            resultsContainer.innerHTML = '';
            
            searchView.updateView(state);
            
            expect(searchButton.textContent).toBe('⌛');
            
            // Sprawdź, czy element ładowania został utworzony
            const loadingElement = resultsContainer.querySelector('.search-results__loading');
            expect(loadingElement).toBeTruthy();
            expect(loadingElement.textContent).toBe('Szukam...');
        });
        
        test('powinien wyświetlić błąd', () => {
            const state = {
                isProcessing: false,
                searchResults: [],
                selectedPoint: null,
                error: 'Test error'
            };
            
            searchView.updateView(state);
            
            expect(resultsContainer.textContent).toBe('Test error');
        });
        
        test('powinien wyświetlić wyniki wyszukiwania', () => {
            const state = {
                isProcessing: false,
                searchResults: [
                    { doc: { names: ['Point 1'] } },
                    { doc: { names: ['Point 2'] } }
                ],
                selectedPoint: null,
                error: null
            };
            
            searchView.updateView(state);
            
            const items = resultsContainer.querySelectorAll('.search-results__item');
            expect(items.length).toBe(2);
            expect(items[0].textContent).toBe('Point 1');
            expect(items[1].textContent).toBe('Point 2');
        });
        
        test('powinien wyświetlić szczegóły wybranego punktu', () => {
            const state = {
                isProcessing: false,
                searchResults: [],
                selectedPoint: {
                    doc: {
                        names: ['Test Point'],
                        actions_in_polish: 'Action 1\nAction 2',
                        location_in_polish: 'Test Location'
                    }
                },
                error: null
            };
            
            searchView.updateView(state);
            
            expect(detailsContainer.style.display).toBe('block');
            expect(detailsContainer.querySelector('.point-details__section')).toBeTruthy();
        });
    });
    
    describe('handlePointClick', () => {
        test('powinien zaktualizować zaznaczenie i wywołać kontroler', () => {
            const point = { doc: { names: ['Test Point'] } };
            const listItem = document.createElement('div');
            listItem.className = 'search-results__item';
            
            searchView.handlePointClick(point, listItem);
            
            expect(listItem.classList.contains('search-results__item--selected')).toBe(true);
            expect(controller.handlePointClick).toHaveBeenCalledWith(point);
        });
    });
    
    describe('createSection', () => {
        test('powinien utworzyć klikalną sekcję', () => {
            const section = searchView.createSection('Test Title', ['Item 1', 'Item 2'], true);
            
            expect(section.querySelector('.point-details__subtitle').textContent).toBe('Test Title');
            expect(section.querySelectorAll('.point-details__link').length).toBe(2);
        });
        
        test('powinien utworzyć sekcję z tekstem', () => {
            const section = searchView.createSection('Test Title', ['Test Content'], false);
            
            expect(section.querySelector('.point-details__subtitle').textContent).toBe('Test Title');
            expect(section.querySelector('.point-details__text').textContent).toBe('Test Content');
        });
    });
}); 