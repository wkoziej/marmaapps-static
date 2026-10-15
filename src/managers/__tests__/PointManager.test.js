import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { PointManager } from '../PointManager';
import { Scene } from 'three';

describe('PointManager', () => {
  let pointManager;
  let scene;
  let labelCheckbox;

  beforeEach(() => {
    scene = new Scene();
    labelCheckbox = { checked: true };
    pointManager = new PointManager(scene, labelCheckbox);
  });

  test('powinien prawidłowo konwertować współrzędne', () => {
    const input = { x: 1, y: 2, z: 3 };
    const expected = { x: 1, y: 3, z: -2 };
    
    const result = pointManager.convertCoordinates(input);
    
    expect(result).toEqual(expected);
  });

  test('powinien dodawać punkt do sceny', () => {
    const label = 'Test Point';
    const color = 0x00ff00;
    const position = { x: 1, y: 2, z: 3 };
    const size = 0.004;

    pointManager.addPoint(label, color, position, size);

    expect(scene.add).toHaveBeenCalled();
  });

  test('powinien czyścić punkty ze sceny', () => {
    const point = { userData: { isCustomPoint: true } };
    scene.children.push(point);
    
    pointManager.clearPoints();
    
    expect(scene.remove).toHaveBeenCalledWith(point);
  });
}); 