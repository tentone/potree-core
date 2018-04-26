# Potree Object

 - This project is based on Potree V1.6
 - The following elements were removed from the library
 	- PotreeViewer
 	- Controls, Input, GUI, Tools
 	- Anotations, Actions, ProfileRequest
 	- Potree.startQuery, Potree.endQuery and Potree.resolveQueries
 	- Potree.timerQueries
 	- Potree.MOUSE, Potree.CameraMode
 	- PotreeRenderer, RepRenderer, Potree.Renderer
	- JQuery, TWEEN and Proj4 dependencies
 - The following classes were rewritten
    - XHRFactory

### How to use
 - Download the custom build from the build folder
 - Include it alonside the worker folder in your project
 - Download threejs from github repository
 	- https://github.com/mrdoob/three.js/tree/dev/build

### Example

 - Bellow its a fully functional example of how to use this wrapper to load potree point clouds to a THREE.js project

```javascript
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10000);

var canvas = document.createElement("canvas");
canvas.style.position = "absolute";
canvas.style.top = "0px";
canvas.style.left = "0px";
canvas.style.width = "100%";
canvas.style.height = "100%";
document.body.appendChild(canvas);

var renderer = new THREE.WebGLRenderer({canvas:canvas});

var geometry = new THREE.BoxGeometry(1, 1, 1);
var material = new THREE.MeshBasicMaterial({color: 0x00ff00});
var cube = new THREE.Mesh(geometry, material);
scene.add(cube);

var controls = new THREE.OrbitControls(camera, canvas);
camera.position.z = 10;

var points = new Potree.Object(renderer);
points.setPointBudget(10000000)
scene.add(points);

Potree.loadPointCloud("data/test/cloud.js", name, function(data)
{
	var pointcloud = data.pointcloud;
	points.add(pointcloud);
});

function loop()
{
	controls.update();
	renderer.render(scene, camera);
	requestAnimationFrame(loop);
};
loop();

document.body.onresize = function()
{
	var width = window.innerWidth;
	var height = window.innerHeight;
	renderer.setSize(width, height);
	camera.aspect = width / height;
	camera.updateProjectionMatrix();
}
document.body.onresize();
```

### Building
 - The output javascript is not a module of any kind
 - The project can be build using closure
    - npm install
    - npm run build

### Create Point Clouds
 - Use the Potree Converter tool to create point cloud data from LAS, ZLAS or BIN point cloud files
    - https://github.com/potree/PotreeConverter/releases

### Dependencies
 - Three.js
 - Closure compiler

### License
 - Thank you to Markus Schütz developing Potree.
 - This project is distributed under MIT license (Available on GitHub page)
