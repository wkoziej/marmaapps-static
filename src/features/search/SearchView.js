/**
 * @typedef {import('../../types/types').MarmaPoint} MarmaPoint
 */

import { getPointDisplayName } from '../../utils/pointName.js';
import { SectionTitles, UiTexts } from '../../constants/textConstants.js';

/**
 * Widok zarządzający interfejsem użytkownika wyszukiwania.
 */
export class SearchView {
    /**
     * @param {HTMLElement} searchContainer - Kontener wyszukiwarki
     * @param {HTMLElement} resultsContainer - Kontener wyników
     * @param {HTMLElement} detailsContainer - Kontener szczegółów punktu
     * @param {import('./SearchController').SearchController} controller - Kontroler wyszukiwania
     */
    constructor(searchContainer, resultsContainer, detailsContainer, controller) {
        this.searchContainer = searchContainer;
        this.resultsContainer = resultsContainer;
        this.detailsContainer = detailsContainer;
        this.controller = controller;
        
        this.searchInput = searchContainer.querySelector('input[name="search-bar__input"]');
        this.searchButton = searchContainer.querySelector('#search-bar__button');
        
        if (!this.searchInput || !this.searchButton) {
            throw new Error('Nie znaleziono wymaganych elementów formularza wyszukiwania');
        }
        
        this.setupEventListeners();
    }

    /**
     * Konfiguruje nasłuchiwanie zdarzeń
     */
    setupEventListeners() {
        // Obsługa przycisku wyszukiwania
        this.searchButton.addEventListener('click', () => {
            this.handleSearch();
        });

        // Obsługa klawisza Enter
        this.searchInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.handleSearch();
            }
        });
    }

    /**
     * Obsługuje akcję wyszukiwania
     */
    async handleSearch() {
        const searchText = this.searchInput.value;
        await this.controller.search(searchText);
    }

    /**
     * Aktualizuje widok na podstawie stanu
     * @param {import('./SearchState').SearchState} state - Stan wyszukiwania
     */
    updateView(state) {
        // Aktualizacja stanu ładowania
        this.searchButton.textContent = state.isProcessing ? '⌛' : '🔍';

        // Jeśli trwa ładowanie, pokaż stan ładowania i zakończ
        if (state.isProcessing) {
            this.resultsContainer.innerHTML = '';
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'search-results__loading';
            loadingDiv.textContent = UiTexts.SEARCHING;
            this.resultsContainer.appendChild(loadingDiv);
            return;
        }

        // Wyświetlanie błędu
        if (state.error) {
            this.showError(state.error);
            return;
        }

        // Aktualizacja listy wyników
        if (state.searchResults.length > 0) {
            const list = this.createResultsList(state.searchResults);
            this.resultsContainer.innerHTML = '';
            this.resultsContainer.appendChild(list);

            // Przywróć zaznaczenie jeśli jest wybrany punkt
            if (state.selectedPoint) {
                const items = this.resultsContainer.querySelectorAll('.search-results__item');
                items.forEach(item => {
                    if (item.textContent === getPointDisplayName(state.selectedPoint)) {
                        item.classList.add('search-results__item--selected');
                    }
                });
            }
        } else {
            this.resultsContainer.innerHTML = '';
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'search-results__empty';
            emptyDiv.textContent = UiTexts.EMPTY_RESULTS;
            this.resultsContainer.appendChild(emptyDiv);
        }

        // Aktualizacja szczegółów punktu
        if (state.selectedPoint) {
            this.updatePointDetails(state.selectedPoint);
        } else {
            this.detailsContainer.style.display = 'none';
        }
    }

    /**
     * Wyświetla błąd
     * @param {string} message 
     */
    showError(message) {
        this.resultsContainer.innerHTML = '';
        const errorDiv = document.createElement('div');
        errorDiv.className = 'search-results__error';
        errorDiv.textContent = message;
        this.resultsContainer.appendChild(errorDiv);
    }

    /**
     * Tworzy listę wyników
     * @param {MarmaPoint[]} points 
     * @returns {HTMLElement}
     */
    createResultsList(points) {
        const list = document.createElement('div');
        list.className = 'search-results__list';

        points.forEach(point => {
            const listItem = document.createElement('div');
            listItem.className = 'search-results__item';
            listItem.textContent = getPointDisplayName(point);
            listItem.addEventListener('click', () => {
                this.handlePointClick(point, listItem);
            });
            list.appendChild(listItem);
        });

        return list;
    }

    /**
     * Obsługuje kliknięcie w punkt
     * @param {MarmaPoint} point 
     * @param {HTMLElement} listItem 
     */
    handlePointClick(point, listItem) {
        // Aktualizacja zaznaczenia na liście
        const items = document.querySelectorAll('.search-results__item');
        items.forEach(item => item.classList.remove('search-results__item--selected'));
        listItem.classList.add('search-results__item--selected');

        // Aktualizacja kontrolera
        this.controller.handlePointClick(point);
    }

    /**
     * Aktualizuje szczegóły punktu
     * @param {MarmaPoint} point 
     */
    updatePointDetails(point) {
        this.detailsContainer.style.display = 'block';
        const content = this.detailsContainer.querySelector('#point-details__content');
        if (!content) return;

        content.innerHTML = '';
        // Punkt bez opisu ma doc = {} (lub null); wtedy lokalizacja z pola `location`.
        const doc = point.doc ?? {};
        const location = doc.location_in_polish || point.location;
        
        // Działania
        if (doc.actions_in_polish) {
            content.appendChild(this.createSection(
                SectionTitles.ACTIONS,
                doc.actions_in_polish.split('\n'),
                true
            ));
        }
        
        // Wskazania
        if (doc.indications_in_polish) {
            content.appendChild(this.createSection(
                SectionTitles.INDICATIONS,
                doc.indications_in_polish.split('\n'),
                true
            ));
        }
        
        // Typy poddoszy
        if (doc.doshic_subtype_orig) {
            content.appendChild(this.createSection(
                SectionTitles.DOSHIC_SUBTYPE,
                doc.doshic_subtype_orig.split(','),
                true
            ));
        }
        
        // Lokalizacja
        if (location) {
            content.appendChild(this.createSection(
                SectionTitles.LOCATION,
                [location],
                false
            ));
        }
        
        // Leczenie
        if (doc.treatment_in_polish) {
            content.appendChild(this.createSection(
                SectionTitles.TREATMENT,
                [doc.treatment_in_polish],
                false
            ));
        }
        
        // Komentarz
        if (doc.commentary_in_polish) {
            content.appendChild(this.createSection(
                SectionTitles.COMMENTARY,
                [doc.commentary_in_polish],
                false
            ));
        }
    }

    /**
     * Tworzy sekcję szczegółów punktu
     * @param {string} title - Tytuł sekcji
     * @param {string[]} items - Lista elementów
     * @param {boolean} isClickable - Czy elementy mają być klikalne
     * @returns {HTMLElement}
     */
    createSection(title, items, isClickable) {
        const section = document.createElement('div');
        section.className = 'point-details__section';
        
        const titleElement = document.createElement('h3');
        titleElement.className = 'point-details__subtitle';
        titleElement.textContent = title;
        section.appendChild(titleElement);
        
        if (isClickable) {
            const list = document.createElement('ul');
            list.className = 'point-details__list';
            
            items.forEach(item => {
                if (item.trim()) {
                    const listItem = document.createElement('li');
                    listItem.className = 'point-details__item';
                    
                    const link = document.createElement('a');
                    link.href = '#';
                    link.className = 'point-details__link';
                    link.textContent = item.trim();
                    link.addEventListener('click', (event) => {
                        event.preventDefault();
                        this.searchInput.value = item;
                        this.handleSearch();
                    });
                    
                    listItem.appendChild(link);
                    list.appendChild(listItem);
                }
            });
            
            section.appendChild(list);
        } else {
            const text = document.createElement('p');
            text.className = 'point-details__text';
            text.textContent = items[0];
            section.appendChild(text);
        }
        
        return section;
    }
} 