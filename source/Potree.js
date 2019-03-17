"use strict";

import {GreyhoundLoader} from "./loaders/GreyhoundLoader.js";
import {POCLoader} from "./loaders/POCLoader.js";
import {EptLoader} from "./loaders/EptLoader.js";
import {PointCloudOctree} from "./pointcloud/PointCloudOctree.js";
import {PointCloudArena4D} from "./pointcloud/PointCloudArena4D.js";
import {PointCloudArena4DGeometry} from "./pointcloud/geometries/PointCloudArena4DGeometry.js";
import {BinaryHeap} from "./lib/BinaryHeap.js";
import {Global} from "./Global.js";

var AttributeLocations =
{
	position: 0,
	color: 1,
	intensity: 2,
	classification: 3,
	returnNumber: 4,
	numberOfReturns: 5,
	pointSourceID: 6,
	indices: 7,
	normal: 8,
	spacing: 9,
};

var Classification =
{
	DEFAULT:
	{
		0: new THREE.Vector4(0.5, 0.5, 0.5, 1.0),
		1: new THREE.Vector4(0.5, 0.5, 0.5, 1.0),
		2: new THREE.Vector4(0.63, 0.32, 0.18, 1.0),
		3: new THREE.Vector4(0.0, 1.0, 0.0, 1.0),
		4: new THREE.Vector4(0.0, 0.8, 0.0, 1.0),
		5: new THREE.Vector4(0.0, 0.6, 0.0, 1.0),
		6: new THREE.Vector4(1.0, 0.66, 0.0, 1.0),
		7: new THREE.Vector4(1.0, 0, 1.0, 1.0),
		8: new THREE.Vector4(1.0, 0, 0.0, 1.0),
		9: new THREE.Vector4(0.0, 0.0, 1.0, 1.0),
		12: new THREE.Vector4(1.0, 1.0, 0.0, 1.0),
		DEFAULT: new THREE.Vector4(0.3, 0.6, 0.6, 0.5)
	}
};

var ClipTask =
{
	NONE: 0,
	HIGHLIGHT: 1,
	SHOW_INSIDE: 2,
	SHOW_OUTSIDE: 3
};

var ClipMethod =
{
	INSIDE_ANY: 0,
	INSIDE_ALL: 1
};

var PointSizeType =
{
	FIXED: 0,
	ATTENUATED: 1,
	ADAPTIVE: 2
};

var PointShape =
{
	SQUARE: 0,
	CIRCLE: 1,
	PARABOLOID: 2
};

var PointColorType =
{
	RGB: 0,
	COLOR: 1,
	DEPTH: 2,
	HEIGHT: 3,
	ELEVATION: 3,
	INTENSITY: 4,
	INTENSITY_GRADIENT: 5,
	LOD: 6,
	LEVEL_OF_DETAIL: 6,
	POINT_INDEX: 7,
	CLASSIFICATION: 8,
	RETURN_NUMBER: 9,
	SOURCE: 10,
	NORMAL: 11,
	PHONG: 12,
	RGB_HEIGHT: 13,
	COMPOSITE: 50
};

var TreeType =
{
	OCTREE: 0,
	KDTREE: 1
};

function loadPointCloud(path, name, callback)
{
	var loaded = function(pointcloud)
	{
		if(name !== undefined)
		{
			pointcloud.name = name;
		}
		
		callback(
		{
			type: "pointcloud_loaded",
			pointcloud: pointcloud
		});
	};

	//Greyhound pointcloud server URL.
	if(path.indexOf("greyhound://") === 0)
	{
		GreyhoundLoader.load(path, function(geometry)
		{
			if(geometry !== undefined)
			{
				loaded(new PointCloudOctree(geometry));
			}
		});
	}
	//Potree point cloud
	else if(path.indexOf("cloud.js") > 0)
	{
		POCLoader.load(path, function(geometry)
		{
			if(geometry !== undefined)
			{
				loaded(new PointCloudOctree(geometry));
			}
		});
	}
	else if (path.indexOf('ept.json') > 0)
	{
		EptLoader.load(path, function(geometry)
		{
			if(geometry !== undefined)
			{
				loaded(new PointCloudOctree(geometry));
			}
		});
	}
	//Arena 4D point cloud
	else if(path.indexOf(".vpc") > 0)
	{
		PointCloudArena4DGeometry.load(path, function(geometry)
		{
			if(geometry !== undefined)
			{
				loaded(new PointCloudArena4D(geometry));
			}
		});
	}
	else
	{
		throw new Error("Potree: Failed to load point cloud from URL " + path);
	}
}

function updateVisibility(pointclouds, camera, renderer)
{
	var numVisibleNodes = 0;
	var numVisiblePoints = 0;
	var numVisiblePointsInPointclouds = new Map(pointclouds.map(pc => [pc, 0]));
	var visibleNodes = [];
	var visibleGeometry = [];
	var unloadedGeometry = [];
	var lowestSpacing = Infinity;

	//Calculate object space frustum and cam pos and setup priority queue
	var structures = updateVisibilityStructures(pointclouds, camera, renderer);
	var frustums = structures.frustums;
	var camObjPositions = structures.camObjPositions;
	var priorityQueue = structures.priorityQueue;

	var loadedToGPUThisFrame = 0;
	var domWidth = renderer.domElement.clientWidth;
	var domHeight = renderer.domElement.clientHeight;

	//Check if pointcloud has been transformed, some code will only be executed if changes have been detected
	if(!Global.pointcloudTransformVersion)
	{
		Global.pointcloudTransformVersion = new Map();
	}

	var pointcloudTransformVersion = Global.pointcloudTransformVersion;

	for(var i = 0; i < pointclouds.length; i++)
	{
		var pointcloud = pointclouds[i];

		if(!pointcloud.visible)
		{
			continue;
		}

		pointcloud.updateMatrixWorld();

		if(!pointcloudTransformVersion.has(pointcloud))
		{
			pointcloudTransformVersion.set(pointcloud,
			{
				number: 0,
				transform: pointcloud.matrixWorld.clone()
			});
		}
		else
		{
			var version = pointcloudTransformVersion.get(pointcloud);
			if(!version.transform.equals(pointcloud.matrixWorld))
			{
				version.number++;
				version.transform.copy(pointcloud.matrixWorld);

				pointcloud.dispatchEvent(
				{
					type: "transformation_changed",
					target: pointcloud
				});
			}
		}
	}

	//Process priority queue
	while(priorityQueue.size() > 0)
	{
		var element = priorityQueue.pop();
		var node = element.node;
		var parent = element.parent;
		var pointcloud = pointclouds[element.pointcloud];
		var box = node.getBoundingBox();
		var frustum = frustums[element.pointcloud];
		var camObjPos = camObjPositions[element.pointcloud];

		var insideFrustum = frustum.intersectsBox(box);
		var maxLevel = pointcloud.maxLevel || Infinity;
		var level = node.getLevel();

		var visible = insideFrustum;
		visible = visible && !(numVisiblePointsInPointclouds.get(pointcloud) + node.getNumPoints() > pointcloud.pointBudget);
		visible = visible && level < maxLevel;

		//TODO <CLIPPING TASKS>
		/*
		if(false && pointcloud.material.clipBoxes.length > 0)
		{
			var numIntersecting = 0;
			var numIntersectionVolumes = 0;

			for(var clipBox of pointcloud.material.clipBoxes)
			{
				var pcWorldInverse = new THREE.Matrix4().getInverse(pointcloud.matrixWorld);
				var toPCObject = pcWorldInverse.multiply(clipBox.box.matrixWorld);

				var px = new THREE.Vector3(+1, 0, 0).applyMatrix4(toPCObject);
				var nx = new THREE.Vector3(-1, 0, 0).applyMatrix4(toPCObject);
				var py = new THREE.Vector3(0, +1, 0).applyMatrix4(toPCObject);
				var ny = new THREE.Vector3(0, -1, 0).applyMatrix4(toPCObject);
				var pz = new THREE.Vector3(0, 0, +1).applyMatrix4(toPCObject);
				var nz = new THREE.Vector3(0, 0, -1).applyMatrix4(toPCObject);

				var pxN = new THREE.Vector3().subVectors(nx, px).normalize();
				var nxN = pxN.clone().multiplyScalar(-1);
				var pyN = new THREE.Vector3().subVectors(ny, py).normalize();
				var nyN = pyN.clone().multiplyScalar(-1);
				var pzN = new THREE.Vector3().subVectors(nz, pz).normalize();
				var nzN = pzN.clone().multiplyScalar(-1);

				var pxPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(pxN, px);
				var nxPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(nxN, nx);
				var pyPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(pyN, py);
				var nyPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(nyN, ny);
				var pzPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(pzN, pz);
				var nzPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(nzN, nz);

				var frustum = new THREE.Frustum(pxPlane, nxPlane, pyPlane, nyPlane, pzPlane, nzPlane);
				var intersects = frustum.intersectsBox(box);

				if(intersects)
				{
					numIntersecting++;
				}
				numIntersectionVolumes++;
			}

			var insideAny = numIntersecting > 0;
			var insideAll = numIntersecting === numIntersectionVolumes;

			if(pointcloud.material.clipTask === ClipTask.SHOW_INSIDE)
			{
				if(pointcloud.material.clipMethod === ClipMethod.INSIDE_ANY && insideAny)
				{
					//node.debug = true
				}
				else if(pointcloud.material.clipMethod === ClipMethod.INSIDE_ALL && insideAll)
				{
					//node.debug = true;
				}
				else
				{
					visible = false;
				}
			}
		}
		*/

		if(node.spacing)
		{
			lowestSpacing = Math.min(lowestSpacing, node.spacing);
		}
		else if(node.geometryNode && node.geometryNode.spacing)
		{
			lowestSpacing = Math.min(lowestSpacing, node.geometryNode.spacing);
		}

		if(!visible)
		{
			continue;
		}

		numVisibleNodes++;
		numVisiblePoints += node.getNumPoints();

		var numVisiblePointsInPointcloud = numVisiblePointsInPointclouds.get(pointcloud);
		numVisiblePointsInPointclouds.set(pointcloud, numVisiblePointsInPointcloud + node.getNumPoints());

		pointcloud.numVisibleNodes++;
		pointcloud.numVisiblePoints += node.getNumPoints();

		if(node.isGeometryNode() && (!parent || parent.isTreeNode()))
		{
			if(node.isLoaded() && loadedToGPUThisFrame < Global.maxNodesLoadGPUFrame)
			{
				node = pointcloud.toTreeNode(node, parent);
				loadedToGPUThisFrame++;
			}
			else
			{
				unloadedGeometry.push(node);
				visibleGeometry.push(node);
			}
		}

		if(node.isTreeNode())
		{
			Global.lru.touch(node.geometryNode);

			node.sceneNode.visible = true;
			node.sceneNode.material = pointcloud.material;

			visibleNodes.push(node);
			pointcloud.visibleNodes.push(node);

			if(node._transformVersion === undefined)
			{
				node._transformVersion = -1;
			}

			var transformVersion = pointcloudTransformVersion.get(pointcloud);
			if(node._transformVersion !== transformVersion.number)
			{
				node.sceneNode.updateMatrix();
				node.sceneNode.matrixWorld.multiplyMatrices(pointcloud.matrixWorld, node.sceneNode.matrix);
				node._transformVersion = transformVersion.number;
			}

			if(pointcloud.showBoundingBox && !node.boundingBoxNode && node.getBoundingBox)
			{
				var boxHelper = new THREE.Box3Helper(node.getBoundingBox());
				boxHelper.matrixAutoUpdate = false;
				pointcloud.boundingBoxNodes.push(boxHelper);
				node.boundingBoxNode = boxHelper;
				node.boundingBoxNode.matrix.copy(pointcloud.matrixWorld);
			}
			else if(pointcloud.showBoundingBox)
			{
				node.boundingBoxNode.visible = true;
				node.boundingBoxNode.matrix.copy(pointcloud.matrixWorld);
			}
			else if(!pointcloud.showBoundingBox && node.boundingBoxNode)
			{
				node.boundingBoxNode.visible = false;
			}
		}

		//Add child nodes to priorityQueue
		var children = node.getChildren();
		for(var i = 0; i < children.length; i++)
		{
			var child = children[i];
			var weight = 0;

			//Perspective camera
			if(camera.isPerspectiveCamera)
			{
				var sphere = child.getBoundingSphere(new THREE.Sphere());
				var center = sphere.center;
				var distance = sphere.center.distanceTo(camObjPos);

				var radius = sphere.radius;
				var fov = (camera.fov * Math.PI) / 180;
				var slope = Math.tan(fov / 2);
				var projFactor = (0.5 * domHeight) / (slope * distance);
				var screenPixelRadius = radius * projFactor;

				//If pixel radius bellow minimum discard
				if(screenPixelRadius < pointcloud.minimumNodePixelSize)
				{
					continue;
				}

				weight = screenPixelRadius;

				//Really close to the camera
				if(distance - radius < 0)
				{
					weight = Number.MAX_VALUE;
				}
			}
			//Orthographic camera
			else
			{
				//TODO <IMPROVE VISIBILITY>
				var bb = child.getBoundingBox();
				var distance = child.getBoundingSphere(new THREE.Sphere()).center.distanceTo(camObjPos);
				var diagonal = bb.max.clone().sub(bb.min).length();
				weight = diagonal / distance;
			}

			priorityQueue.push(
			{
				pointcloud: element.pointcloud,
				node: child,
				parent: node,
				weight: weight
			});
		}
	}

	//Update DEM
	var candidates = pointclouds.filter(p => (p.generateDEM && p.dem instanceof DEM));
	
	for(var pointcloud of candidates)
	{
		var updatingNodes = pointcloud.visibleNodes.filter(n => n.getLevel() <= Global.maxDEMLevel);
		pointcloud.dem.update(updatingNodes);
	}
	
	for(var i = 0; i < Math.min(Global.maxNodesLoading, unloadedGeometry.length); i++)
	{
		unloadedGeometry[i].load();
	}

	return {
		visibleNodes: visibleNodes,
		numVisiblePoints: numVisiblePoints,
		lowestSpacing: lowestSpacing
	};
}

function updatePointClouds(pointclouds, camera, renderer)
{
	var result = updateVisibility(pointclouds, camera, renderer);

	for(var i = 0; i < pointclouds.length; i++)
	{
		pointclouds[i].updateMaterial(pointclouds[i].material, pointclouds[i].visibleNodes, camera, renderer);
		pointclouds[i].updateVisibleBounds();
	}

	Global.lru.freeMemory();

	return result;
}

function updateVisibilityStructures(pointclouds, camera, renderer)
{
	var frustums = [];
	var camObjPositions = [];
	var priorityQueue = new BinaryHeap(function(x)
	{
		return 1 / x.weight;
	});

	for(var i = 0; i < pointclouds.length; i++)
	{
		var pointcloud = pointclouds[i];

		if(!pointcloud.initialized())
		{
			continue;
		}

		pointcloud.numVisibleNodes = 0;
		pointcloud.numVisiblePoints = 0;
		pointcloud.deepestVisibleLevel = 0;
		pointcloud.visibleNodes = [];
		pointcloud.visibleGeometry = [];

		//Frustum in object space
		camera.updateMatrixWorld();
		var frustum = new THREE.Frustum();
		var viewI = camera.matrixWorldInverse;
		var world = pointcloud.matrixWorld;

		//Use close near plane for frustum intersection
		var frustumCam = camera.clone();
		frustumCam.near = camera.near; //Math.min(camera.near, 0.1);
		frustumCam.updateProjectionMatrix();
		var proj = camera.projectionMatrix;

		var fm = new THREE.Matrix4().multiply(proj).multiply(viewI).multiply(world);
		frustum.setFromMatrix(fm);
		frustums.push(frustum);

		//Camera position in object space
		var view = camera.matrixWorld;
		var worldI = new THREE.Matrix4().getInverse(world);
		var camMatrixObject = new THREE.Matrix4().multiply(worldI).multiply(view);
		var camObjPos = new THREE.Vector3().setFromMatrixPosition(camMatrixObject);
		camObjPositions.push(camObjPos);

		if(pointcloud.visible && pointcloud.root !== null)
		{
			priorityQueue.push(
			{
				pointcloud: i,
				node: pointcloud.root,
				weight: Number.MAX_VALUE
			});
		}

		//Hide all previously visible nodes
		if(pointcloud.root.isTreeNode())
		{
			pointcloud.hideDescendants(pointcloud.root.sceneNode);
		}

		for(var j = 0; j < pointcloud.boundingBoxNodes.length; j++)
		{
			pointcloud.boundingBoxNodes[j].visible = false;
		}
	}

	return {
		frustums: frustums,
		camObjPositions: camObjPositions,
		priorityQueue: priorityQueue
	};
}

export {
	AttributeLocations,
	Classification,
	ClipTask,
	ClipMethod,
	PointSizeType,
	PointShape,
	PointColorType,
	TreeType,
	loadPointCloud,
	updateVisibility,
	updatePointClouds,
	updateVisibilityStructures
};
