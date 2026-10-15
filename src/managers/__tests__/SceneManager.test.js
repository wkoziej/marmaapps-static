import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { SceneManager } from '../SceneManager';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

vi.useFakeTimers();

describe('SceneManager', () => {
  let sceneManager;
  let container;
  let appendChildMock;

  beforeEach(() => {
    // Przygotowanie kontenera
    container = document.createElement('div');
    Object.defineProperties(container, {
      offsetWidth: { value: 800, configurable: true },
      offsetHeight: { value: 600, configurable: true }
    });
    
    // Mock dla appendChild
    appendChildMock = vi.fn();
    container.appendChild = appendChildMock;
    
    // Inicjalizacja SceneManager
    sceneManager = new SceneManager(container);
  });

  afterEach(() => {
    // Czyszczenie event listenerów
    if (sceneManager && sceneManager.onWindowResize) {
      window.removeEventListener('resize', sceneManager.onWindowResize);
    }
  });

  test('powinien poprawnie zainicjalizować scenę', () => {
    // Weryfikacja podstawowych komponentów
    expect(sceneManager.scene).toBeDefined();
    expect(sceneManager.camera).toBeDefined();
    expect(sceneManager.renderer).toBeDefined();
    expect(sceneManager.controls).toBeDefined();
    
    // Weryfikacja ustawień kamery
    expect(sceneManager.camera.position.z).toBe(1);
    expect(sceneManager.camera.position.x).toBe(1);
    
    // Weryfikacja renderera
    expect(appendChildMock).toHaveBeenCalledWith(sceneManager.renderer.domElement);
  });

  test('powinien aktualizować rozmiar renderera', () => {
    // Zmiana rozmiaru kontenera
    Object.defineProperties(container, {
      offsetWidth: { value: 1024, configurable: true },
      offsetHeight: { value: 768, configurable: true }
    });
    
    // Wykonanie
    sceneManager.updateRendererSize();
    
    // Weryfikacja
    expect(sceneManager.camera.aspect).toBe(1024 / 768);
    expect(sceneManager.renderer.setSize).toHaveBeenCalledWith(1024, 768);
  });

  test('powinien obsługiwać zmianę rozmiaru okna', () => {
    // Przygotowanie spy dla updateRendererSize
    const updateRendererSizeSpy = vi.spyOn(sceneManager, 'updateRendererSize');
    
    // Symulacja zmiany rozmiaru okna
    window.dispatchEvent(new Event('resize'));
    
    // Weryfikacja
    expect(updateRendererSizeSpy).toHaveBeenCalled();
  });

  test('powinien animować scenę', () => {
    // Przygotowanie spy dla requestAnimationFrame
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame');
    
    // Wykonanie
    sceneManager.animate();
    
    // Weryfikacja
    expect(requestAnimationFrameSpy).toHaveBeenCalled();
    expect(sceneManager.controls.update).toHaveBeenCalled();
    expect(sceneManager.renderer.render).toHaveBeenCalledWith(
      sceneManager.scene,
      sceneManager.camera
    );
  });

  test('powinien ładować model', async () => {
    // Przygotowanie
    const modelPath = '/path/to/model.gltf';
    const mockGLTF = {
      scene: {
        traverse: vi.fn(callback => {
          callback({ isMesh: true, material: {} });
        }),
        clone: vi.fn()
      }
    };
    
    // Wykonanie
    const loadPromise = sceneManager.loadModel(modelPath);
    
    // Weryfikacja
    await expect(loadPromise).resolves.toEqual(expect.objectContaining({
      scene: expect.any(Object)
    }));
    expect(sceneManager.scene.add).toHaveBeenCalled();
  });

  test('powinien obsłużyć błąd ładowania modelu', async () => {
    // Przygotowanie
    const modelPath = '/path/to/model.gltf';
    const mockError = new Error('Failed to load model');
    
    // Nadpisanie implementacji GLTFLoader dla tego testu
    vi.spyOn(sceneManager.loader, 'load').mockImplementation((path, onLoad, onProgress, onError) => {
      onError(mockError);
    });
    
    // Wykonanie i weryfikacja
    await expect(sceneManager.loadModel(modelPath)).rejects.toThrow('Failed to load model');
  });
}); 