import { createPoint, createLabel, clearCustomPoints, clearLabels } from "../utils/pointUtils.js";
import { getPointDisplayName } from "../utils/pointName.js";

/**
 * Klasa odpowiedzialna za zarządzanie punktami marma w scenie 3D.
 * @implements {IPointManager}
 */
export class PointManager {
    /**
     * @param {THREE.Scene} scene - Scena Three.js
     * @param {HTMLInputElement} labelCheckbox - Checkbox kontrolujący widoczność etykiet
     */
    constructor(scene, labelCheckbox) {
        this.scene = scene;
        this.labelCheckbox = labelCheckbox;
        this.points = [];
        this.selectedPoint = null;
    }

    /**
     * Konwertuje współrzędne z formatu API do formatu Three.js
     * @param {Object} coordinate - Współrzędne z API
     * @returns {Object} Przekonwertowane współrzędne
     */
    convertCoordinates(coordinate) {
        return {
            x: coordinate.x,
            y: coordinate.z,
            z: -coordinate.y
        };
    }

    /**
     * Aktualizuje punkty na scenie
     * @param {Array} pointsData - Dane punktów z API
     */
    updatePoints(pointsData) {
        this.clearPoints();
        this.points = pointsData;
        
        pointsData.forEach(pointData => {
            const names = getPointDisplayName(pointData);
            
            pointData.coordinates.forEach(coordinate => {
                if (coordinate.label) {
                    const convertedPosition = this.convertCoordinates(coordinate);
                    const isSelected = this.selectedPoint && this.selectedPoint.name === pointData.name;
                    
                    this.addPoint(
                        names,
                        isSelected ? 0xff0000 : 0x00ff00,
                        convertedPosition,
                        isSelected ? 0.006 : 0.004
                    );
                }
            });
        });
    }

    /**
     * Dodaje pojedynczy punkt do sceny
     * @param {string} label - Etykieta punktu
     * @param {number} color - Kolor punktu w formacie hex
     * @param {Object} position - Pozycja punktu
     * @param {number} size - Rozmiar punktu
     */
    addPoint(label, color, position, size) {
        const point = createPoint(size, position, color);
        this.scene.add(point);
        point.userData.isCustomPoint = true;

        if (this.labelCheckbox?.checked) {
            const labelSprite = createLabel(label, 14, "Arial", "rgba(0, 0, 0, 1)");
            labelSprite.position.set(
                position.x,
                position.y + 0.02,
                position.z
            );
            this.scene.add(labelSprite);
            labelSprite.userData.isCustomPoint = true;
            labelSprite.userData.isLabel = true;
        }
    }

    /**
     * Usuwa wszystkie punkty ze sceny
     */
    clearPoints() {
        clearCustomPoints(this.scene);
        clearLabels(this.scene);
    }

    /**
     * Ustawia wybrany punkt
     * @param {Object} point - Wybrany punkt
     */
    setSelectedPoint(point) {
        this.selectedPoint = point;
        this.updatePoints(this.points);
    }

    /**
     * Pobiera wszystkie punkty
     * @returns {Array} Lista punktów
     */
    getPoints() {
        return this.points;
    }

    toggleLabels(show) {
        this.labelCheckbox = { checked: show };
        this.updatePoints(this.points);
    }
}
