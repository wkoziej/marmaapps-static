import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { setUpControls, setUpLights } from "../utils/sceneSetup.js";

export class SceneManager {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            75,
            container.offsetWidth / container.offsetHeight,
            0.1,
            1000
        );
        this.renderer = new THREE.WebGLRenderer();
        this.loader = new GLTFLoader();

        // Setup initial camera position
        this.camera.position.z = 1;
        this.camera.position.x = 1;

        // Setup scene
        this.scene.background = new THREE.Color(0xffffff);
        this.controls = setUpControls(this.camera, this.renderer);
        
        // Setup renderer
        this.updateRendererSize();
        this.container.appendChild(this.renderer.domElement);

        // Setup lights
        setUpLights(this.scene);

        // Bind methods
        this.animate = this.animate.bind(this);
        this.onWindowResize = this.onWindowResize.bind(this);

        // Add event listeners
        window.addEventListener('resize', this.onWindowResize, false);

        // Start animation loop
        this.animate();
    }

    updateRendererSize() {
        this.camera.aspect = this.container.offsetWidth / this.container.offsetHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.offsetWidth, this.container.offsetHeight);
    }

    onWindowResize() {
        this.updateRendererSize();
    }

    animate() {
        requestAnimationFrame(this.animate);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    loadModel(modelPath) {
        return new Promise((resolve, reject) => {
            this.loader.load(
                modelPath,
                (gltf) => {
                    gltf.scene.traverse((object) => {
                        if (object.isMesh) {
                            object.material.transparent = true;
                            object.material.opacity = 0.99;
                        }
                    });
                    this.scene.add(gltf.scene);
                    console.log("Model loaded and added to scene!");
                    resolve(gltf);
                },
                undefined,
                (error) => {
                    console.error(error);
                    reject(error);
                }
            );
        });
    }

    getScene() {
        return this.scene;
    }
}
