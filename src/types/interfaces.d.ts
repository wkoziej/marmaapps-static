import { Scene } from 'three';
import { MarmaPoint } from './types';

export interface IPoint {
    doc: {
        names: string[];
        actions_in_polish: string;
        indications_in_polish: string;
        doshic_subtype_orig: string;
        location_in_polish: string;
        treatment_PL: string;
        commentary_PL: string;
        [key: string]: any;
    };
}

export interface IPointManager {
    /**
     * Scena Three.js do której dodawane są punkty
     */
    scene: Scene;
    
    /**
     * Checkbox kontrolujący widoczność etykiet
     */
    labelCheckbox: HTMLInputElement;
    
    /**
     * Lista wszystkich punktów
     */
    points: MarmaPoint[];
    
    /**
     * Aktualnie wybrany punkt
     */
    selectedPoint: MarmaPoint | null;

    /**
     * Konwertuje współrzędne z formatu API do formatu Three.js
     */
    convertCoordinates(coordinate: Coordinate): Coordinate;

    /**
     * Aktualizuje punkty na scenie
     */
    updatePoints(pointsData: MarmaPoint[]): void;

    /**
     * Dodaje pojedynczy punkt do sceny
     */
    addPoint(label: string, color: number, position: Coordinate, size: number): void;

    /**
     * Usuwa wszystkie punkty ze sceny
     */
    clearPoints(): void;

    /**
     * Ustawia wybrany punkt
     */
    setSelectedPoint(point: MarmaPoint): void;

    /**
     * Pobiera wszystkie punkty
     */
    getPoints(): MarmaPoint[];
}
