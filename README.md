# Potree

 - This project is based on Potree V1.6 the following elements were removed from the library
 	- PotreeViewer
 	- Controls, Input, GUI, Tools
 	- Anotations, Actions, ProfileRequest
 	- Potree.startQuery, Potree.endQuery and Potree.resolveQueries
 	- Potree.timerQueries
 	- Potree.MOUSE, Potree.CameraMode
 	- PotreeRenderer, RepRenderer, Potree.Renderer
	- JQuery, TWEEN and Proj4 dependencies

### Example
 - TODO

### Documentation
 - Potree.PointCloudMaterial
	- Material based on rawshader material used to render Potree pointclouds.

### Setup
 - Download the custom build from the build folder
 - Include it alonside the worker folder in your project
 - Download threejs from github repository
 	- https://github.com/mrdoob/three.js/tree/dev/build

### Create Point Clouds
 - Use the Potree Converter tool to create point cloud data from LAS, ZLAS or BIN point cloud files
    - https://github.com/potree/PotreeConverter/releases

### Dependencies
 - Three.js
 - Closure compiler

### License
 - Thank you to Markus Schütz developing Potree.
 - This project is distributed under MIT license (Available on GitHub page)