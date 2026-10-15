import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function setUpLight(light, position) {
  light.position.set(position.x, position.y, position.z);
  light.castShadow = true; // Włączenie rzucania cieni przez światło
  light.shadow.mapSize.width = 12; // Domyślnie 512, większe wartości dla lepszej jakości cieni
  light.shadow.mapSize.height = 12;
  light.shadow.camera.near = 1.5;
  light.shadow.camera.far = 10;
  return light;
}

export function setUpLights(scene) {
  var light = new THREE.DirectionalLight(0xffffff, 1);
  // Change light parametrs by function
  setUpLight(light, { x: 5, y: 5, z: 5 });
  //const light = createLight(light);
  scene.add(light);
  var light2 = new THREE.DirectionalLight(0xffffff, 1);
  // Change light parametrs by function
  setUpLight(light2, { x: -5, y: -10, z: -5 });
  scene.add(light2);
}

export function setUpControls(camera, renderer) {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = true; // Włącza lub wyłącza możliwość zoomowania
  controls.zoomSpeed = 1.2; // Reguluje szybkość zoomowania
  controls.enableRotate = true; // Włącza lub wyłącza możliwość obracania
  controls.rotateSpeed = 1.0; // Reguluje szybkość obracania
  return controls;
}
