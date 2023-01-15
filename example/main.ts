import { Vector3 } from 'three';
import { PointCloudOctree } from '../source';
import { Viewer } from './viewer';
import "./main.css"

const targetEl = document.createElement('div');
targetEl.className = 'container';
document.body.appendChild(targetEl);

const viewer = new Viewer();
viewer.initialize(targetEl);
const camera = viewer.camera;
camera.far = 1000;
camera.updateProjectionMatrix();
camera.position.set(0, 0, 10);
camera.lookAt(new Vector3());

let pointCloud: PointCloudOctree | undefined;
let loaded: boolean = false;

const unloadBtn = document.createElement('button');
unloadBtn.textContent = 'Unload';
unloadBtn.addEventListener('click', () => {
  if (!loaded) {
    return;
  }

  viewer.unload();
  loaded = false;
  pointCloud = undefined;
});

viewer.load('metadata.json', 'https://static.thelostmetropolis.org/BigShotCleanV2/').then(pco => {
  pointCloud = pco;
  pointCloud.material.size = 1.0;
  pointCloud.material.shape = 2;
  pointCloud.material.inputColorEncoding = 1;
  pointCloud.material.outputColorEncoding = 1;
  pointCloud.position.set(0, -2, 1)
  pointCloud.scale.set(.1, .1, .1);
  viewer.add(pco);
});

