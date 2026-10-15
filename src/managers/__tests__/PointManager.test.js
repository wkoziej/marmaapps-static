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

  test('nie rysuje współrzędnej bez etykiety (label)', () => {
    pointManager.updatePoints([
      {
        name: 'Punkt A',
        doc: { names: ['Punkt A'] },
        coordinates: [
          { x: 1, y: 2, z: 3, label: '' },
          { x: 4, y: 5, z: 6, label: 'Punkt A' }
        ]
      }
    ]);

    const points = scene.add.mock.calls.filter(([obj]) => !obj.userData.isLabel);
    expect(points.length).toBe(1);
  });

  test('punkt z pustym opisem jest rysowany z nazwą jako etykietą', () => {
    const addPoint = vi.spyOn(pointManager, 'addPoint');

    pointManager.updatePoints([
      { name: 'Punkt A', doc: {}, coordinates: [{ x: 1, y: 2, z: 3, label: 'etykieta współrzędnej' }] }
    ]);

    expect(addPoint).toHaveBeenCalledTimes(1);
    expect(addPoint.mock.calls[0][0]).toBe('Punkt A');
  });
});
