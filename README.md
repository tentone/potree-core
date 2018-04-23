# Potree Loader

### How to use it
 - Include three.js and potree in your project code

### Example
 - TODO

### Setup
 - Download threejs from github repository
 	- https://github.com/mrdoob/three.js/tree/dev/build
 - Download potree source code from GitHub and and build it
    - https://github.com/potree/potree
    - cd potree
    - npm install
    - npm install -g gulp
    - gulp watch

### To do
 - Remove JQuery, TWEEN and Proj4 dependencies
 - Remove all the CSS based anotation system out
 - Create a pre-bundled build with potree and binary heap

### Dependencies
 - BinaryHeap
 - JQuery
 - Proj4
 - Three.js
 - tweenjs

### Create Point Clouds
 - Use the Potree Converter tool to create point cloud data from LAS, ZLAS or BIN point cloud files
    - https://github.com/potree/PotreeConverter/releases

### License
 - Thank you to Markus Schütz for his work on Potree.
 - This project is under MIT license (Available on GitHub page)