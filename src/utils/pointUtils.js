import * as THREE from "three";

export function createPoint(size, position = { x: 0, y: 0, z: 0 }, color) {
  const sphereGeometry = new THREE.SphereGeometry(size, 32, 32);
  const sphereMaterial = new THREE.MeshBasicMaterial({ color: color });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.position.set(position.x, position.y, position.z);
  return sphere;
}

export function clearLabels(scene) {
  const removableLabels = scene.children.filter(
    (child) => child.userData.isLabel
  );
  removableLabels.forEach((label) => scene.remove(label));
}

export function createLabel(
  text,
  fontSize = 32,
  fontFace = "Arial",
  textColor = "#FFFFFF"
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = `${fontSize}px ${fontFace}`;
  context.fillStyle = textColor;
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(0.5, 0.25, 1.0);

  return sprite;
}

export function clearCustomPoints(scene) {
  const removableObjects = scene.children.filter(
    (child) => child.userData.isCustomPoint
  );
  removableObjects.forEach((object) => scene.remove(object));
}

export function addPointAndLabel(
  labelText = "Moja Kula",
  color,
  position = { x: 0, y: 0, z: 0 },
  size = 0.025,
  scene,
  labelCheckbox
) {
  const sphere = createPoint(size, position, color);
  scene.add(sphere);

  if (labelCheckbox?.checked ?? true) {
    const label = createLabel(labelText, 14, "Arial", "rgba(0, 0, 0, 1)");
    label.position.set(
      sphere.position.x,
      sphere.position.y + 0.02,
      sphere.position.z
    );
    scene.add(label);
    label.userData.isCustomPoint = true;
    label.userData.isLabel = true;
  }
  sphere.userData.isCustomPoint = true;
  return sphere;
}
