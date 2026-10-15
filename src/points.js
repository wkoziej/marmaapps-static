import { SceneManager } from "./managers/SceneManager.js";
import { PointManager } from "./managers/PointManager.js";
import { ApiService } from "./services/ApiService.js";
import { UiTexts } from './constants/textConstants.js';
import { SearchController } from './features/search/SearchController.js';
import { SearchView } from './features/search/SearchView.js';
import { SearchState } from './features/search/SearchState.js';
import { initLayout } from './layout.js';
import { supabaseConfig, humanModelPath } from './config.js';
import { getAccessToken, onSessionExpired } from './auth/session.js';
import './styles/layout/layout.css';
import './styles/components/search/search-bar.css';
import './styles/components/search/search-results.css';
import './styles/components/search/point-details.css';
import './styles/components/model/model-controls.css';

initLayout('points');

document.addEventListener("DOMContentLoaded", () => {
    // Inicjalizacja głównych komponentów
    const modelContainer = document.getElementById("l-model");
    const searchContainer = document.getElementById("search-bar");
    const resultsContainer = document.getElementById("search-results");
    const detailsContainer = document.getElementById("point-details");
    const labelCheckbox = document.getElementById("model-controls__checkbox");
    
    if (!modelContainer || !resultsContainer || !searchContainer || !detailsContainer) {
        console.error("Nie znaleziono wymaganych elementów DOM");
        return;
    }
    
    const sceneManager = new SceneManager(modelContainer);
    const scene = sceneManager.getScene();
    
    const pointManager = new PointManager(scene, labelCheckbox);
    pointManager.clearPoints();
    
    const apiService = new ApiService({
        baseUrl: supabaseConfig.url,
        apiKey: supabaseConfig.publishableKey,
        getAccessToken
    });

    // Inicjalizacja modułu wyszukiwania
    const searchState = new SearchState();
    const searchController = new SearchController(searchState, apiService, pointManager, onSessionExpired);
    const searchView = new SearchView(
        searchContainer,
        resultsContainer,
        detailsContainer,
        searchController
    );

    // Obsługa zmiany stanu checkboxa etykiet
    if (labelCheckbox) {
        labelCheckbox.addEventListener("change", () => {
            pointManager.toggleLabels(labelCheckbox.checked);
        });
    } else {
        console.warn("Element labelCheckbox nie został znaleziony");
    }

    // Podpięcie obserwatora stanu wyszukiwania
    searchState.addListener((state) => {
        // Aktualizacja widoku
        searchView.updateView(state);
        
        // Aktualizacja modelu 3D
        if (state.selectedPoint) {
            pointManager.setSelectedPoint(state.selectedPoint);
        } else if (state.searchResults.length > 0) {
            pointManager.updatePoints(state.searchResults);
        } else {
            pointManager.clearPoints();
        }
    });

    // Załadowanie modelu
    sceneManager.loadModel(humanModelPath)
        .catch(error => console.error(`${UiTexts.MODEL_LOAD_ERROR}:`, error));
});

