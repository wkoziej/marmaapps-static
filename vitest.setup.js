// Przeniesione z djangoapp/jest.setup.js (Jest -> Vitest).
import { vi } from 'vitest';

// Mock dla Canvas API
const originalCreateElement = document.createElement.bind(document);
globalThis.document.createElement = (tag, options) => {
  if (tag === 'canvas') {
    return {
      getContext: () => ({
        font: '',
        fillStyle: '',
        fillText: vi.fn(),
        measureText: () => ({ width: 100 }),
        canvas: {
          width: 256,
          height: 256
        }
      })
    };
  }
  return originalCreateElement(tag, options);
};

// Mock dla Three.js
const mockCanvas = document.createElement('canvas');
Object.defineProperties(mockCanvas, {
  clientWidth: { value: 800 },
  clientHeight: { value: 600 }
});

// vi.mock jest wynoszone na początek pliku, więc mockCanvas trzeba przekazać przez globalThis.
globalThis.__mockCanvas = mockCanvas;

// Konstruktory jako zwykłe funkcje (vi.fn(function ...)), bo kod woła je przez `new`.
vi.mock('three', () => ({
  Scene: vi.fn(function () {
    return {
      add: vi.fn(),
      remove: vi.fn(),
      children: [],
      background: null
    };
  }),
  WebGLRenderer: vi.fn(function () {
    return {
      setSize: vi.fn(),
      render: vi.fn(),
      domElement: globalThis.__mockCanvas
    };
  }),
  PerspectiveCamera: vi.fn(function () {
    return {
      position: {
        x: 0,
        y: 0,
        z: 0
      },
      aspect: 1,
      updateProjectionMatrix: vi.fn()
    };
  }),
  Vector3: vi.fn(function (x, y, z) { return { x, y, z }; }),
  Mesh: vi.fn(function () {
    return {
      position: {
        set: vi.fn()
      },
      userData: {}
    };
  }),
  SphereGeometry: vi.fn(),
  MeshBasicMaterial: vi.fn(),
  Sprite: vi.fn(function () {
    return {
      position: {
        set: vi.fn()
      },
      scale: {
        set: vi.fn()
      },
      userData: {}
    };
  }),
  SpriteMaterial: vi.fn(),
  CanvasTexture: vi.fn(function () {
    return {
      minFilter: null,
      needsUpdate: false
    };
  }),
  LinearFilter: 'LinearFilter',
  Color: vi.fn(),
  DirectionalLight: vi.fn(function () {
    return {
      position: {
        set: vi.fn()
      },
      target: {
        position: {
          set: vi.fn()
        }
      },
      shadow: {
        mapSize: {
          width: 512,
          height: 512
        },
        camera: {
          near: 0.5,
          far: 500
        }
      },
      castShadow: false
    };
  }),
  AmbientLight: vi.fn(function () {
    return {
      intensity: 0.5
    };
  })
}));

// Mock dla GLTFLoader (three/examples/jsm zamiast kopii pliku)
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: vi.fn(function () {
    return {
      load: vi.fn((url, onLoad) => {
        onLoad({
          scene: {
            traverse: vi.fn(callback => {
              callback({
                isMesh: true,
                material: {
                  transparent: false,
                  opacity: 1
                }
              });
            }),
            clone: vi.fn()
          }
        });
      })
    };
  })
}));

// Mock dla OrbitControls
vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: vi.fn(function () {
    return {
      update: vi.fn()
    };
  })
}));

// Globalne mocki DOM
globalThis.ResizeObserver = vi.fn(function () {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  };
});

// Helper do testowania eventów
globalThis.createEvent = (eventName, detail = {}) => {
  return new CustomEvent(eventName, { detail });
};
