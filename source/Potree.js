import {Vector3, Sphere, Matrix4, Vector4, Box3Helper, Frustum} from 'three';
import {POCLoader} from './loaders/POCLoader.js';
import {EPTLoader} from './loaders/EPTLoader.js';
import {PointCloudOctree} from './pointcloud/PointCloudOctree.js';
import {PointCloudArena4D} from './pointcloud/PointCloudArena4D.js';
import {PointCloudArena4DGeometry} from './geometry/PointCloudArena4DGeometry.js';
import {BinaryHeap} from './utils/BinaryHeap.js';
import {Global} from './Global.js';
import Derp from './materials/shaders/blur.vs';

console.log(Derp);

const AttributeLocations =
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
		spacing: 9
	};

const Classification =
	{
		DEFAULT:
			{
				0: new Vector4(0.5, 0.5, 0.5, 1.0),
				1: new Vector4(0.5, 0.5, 0.5, 1.0),
				2: new Vector4(0.63, 0.32, 0.18, 1.0),
				3: new Vector4(0.0, 1.0, 0.0, 1.0),
				4: new Vector4(0.0, 0.8, 0.0, 1.0),
				5: new Vector4(0.0, 0.6, 0.0, 1.0),
				6: new Vector4(1.0, 0.66, 0.0, 1.0),
				7: new Vector4(1.0, 0, 1.0, 1.0),
				8: new Vector4(1.0, 0, 0.0, 1.0),
				9: new Vector4(0.0, 0.0, 1.0, 1.0),
				12: new Vector4(1.0, 1.0, 0.0, 1.0),
				DEFAULT: new Vector4(0.3, 0.6, 0.6, 0.5)
			}
	};

const PointSizeType =
	{
		FIXED: 0,
		ATTENUATED: 1,
		ADAPTIVE: 2
	};

const PointShape =
	{
		SQUARE: 0,
		CIRCLE: 1,
		PARABOLOID: 2
	};

const PointColorType =
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

const TreeType =
	{
		OCTREE: 0,
		KDTREE: 1
	};

function loadPointCloud(path, name, callback) 
{
	const loaded = function(pointcloud)
	{
		if (name !== undefined)
		{
			pointcloud.name = name;
		}

		callback(
			{
				type: 'pointcloud_loaded',
				pointcloud: pointcloud
			});
	};


	// Potree point cloud
	if (path.indexOf('cloud.js') > 0) 
	{
		POCLoader.load(path, function(geometry) 
		{
			if (geometry !== undefined) 
			{
				loaded(new PointCloudOctree(geometry));
			}
		});
	}
	else if (path.indexOf('ept.json') > 0) 
	{
		EPTLoader.load(path, function(geometry) 
		{
			if (geometry !== undefined) 
			{
				loaded(new PointCloudOctree(geometry));
			}
		});
	}
	// Arena 4D point cloud
	else if (path.indexOf('.vpc') > 0) 
	{
		PointCloudArena4DGeometry.load(path, function(geometry) 
		{
			if (geometry !== undefined) 
			{
				loaded(new PointCloudArena4D(geometry));
			}
		});
	}
	else 
	{
		throw new Error('Potree: Failed to load point cloud from URL ' + path);
	}
}

function updateVisibility(pointclouds, camera, renderer, totalPointBudget) 
{
	let numVisibleNodes = 0;
	let numVisiblePoints = 0;

	const numVisiblePointsInPointclouds = new Map(pointclouds.map((pc) =>
	{
		return [pc, 0];
	}));

	const visibleNodes = [];
	const visibleGeometry = [];
	const unloadedGeometry = [];
	let lowestSpacing = Infinity;

	// Calculate object space frustum and cam pos and setup priority queue
	const structures = updateVisibilityStructures(pointclouds, camera, renderer);
	const frustums = structures.frustums;
	const camObjPositions = structures.camObjPositions;
	const priorityQueue = structures.priorityQueue;

	let loadedToGPUThisFrame = 0;
	const domWidth = renderer.domElement.clientWidth;
	const domHeight = renderer.domElement.clientHeight;

	// Check if pointcloud has been transformed, some code will only be executed if changes have been detected
	if (!Global.pointcloudTransformVersion) 
	{
		Global.pointcloudTransformVersion = new Map();
	}

	const pointcloudTransformVersion = Global.pointcloudTransformVersion;

	for (var i = 0; i < pointclouds.length; i++) 
	{
		var pointcloud = pointclouds[i];

		if (!pointcloud.visible) 
		{
			continue;
		}

		pointcloud.updateMatrixWorld();

		if (!pointcloudTransformVersion.has(pointcloud)) 
		{
			pointcloudTransformVersion.set(pointcloud,
				{
					number: 0,
					transform: pointcloud.matrixWorld.clone()
				});
		}
		else 
		{
			const version = pointcloudTransformVersion.get(pointcloud);
			if (!version.transform.equals(pointcloud.matrixWorld)) 
			{
				version.number++;
				version.transform.copy(pointcloud.matrixWorld);

				pointcloud.dispatchEvent(
					{
						type: 'transformation_changed',
						target: pointcloud
					});
			}
		}
	}

	// Process priority queue
	while (priorityQueue.size() > 0) 
	{
		const element = priorityQueue.pop();
		let node = element.node;
		const parent = element.parent;
		var pointcloud = pointclouds[element.pointcloud];
		const box = node.getBoundingBox();
		const frustum = frustums[element.pointcloud];
		const camObjPos = camObjPositions[element.pointcloud];

		const insideFrustum = frustum.intersectsBox(box);
		const maxLevel = pointcloud.maxLevel || Infinity;
		const level = node.getLevel();

		let visible = insideFrustum;
		// Within 'global' total budget?
		visible = visible && numVisiblePoints + node.getNumPoints() <= totalPointBudget;
		// Within budget of the point cloud?
		visible = visible && !(numVisiblePointsInPointclouds.get(pointcloud) + node.getNumPoints() > pointcloud.pointBudget);
		visible = visible && level < maxLevel;

		if (node.spacing) 
		{
			lowestSpacing = Math.min(lowestSpacing, node.spacing);
		}
		else if (node.geometryNode && node.geometryNode.spacing) 
		{
			lowestSpacing = Math.min(lowestSpacing, node.geometryNode.spacing);
		}

		if (!visible) 
		{
			continue;
		}

		numVisibleNodes++;
		numVisiblePoints += node.getNumPoints();

		const numVisiblePointsInPointcloud = numVisiblePointsInPointclouds.get(pointcloud);
		numVisiblePointsInPointclouds.set(pointcloud, numVisiblePointsInPointcloud + node.getNumPoints());

		pointcloud.numVisibleNodes++;
		pointcloud.numVisiblePoints += node.getNumPoints();

		if (node.isGeometryNode() && (!parent || parent.isTreeNode())) 
		{
			if (node.isLoaded() && loadedToGPUThisFrame < Global.maxNodesLoadGPUFrame) 
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

		if (node.isTreeNode()) 
		{
			Global.lru.touch(node.geometryNode);

			node.sceneNode.visible = true;
			node.sceneNode.material = pointcloud.material;

			visibleNodes.push(node);
			pointcloud.visibleNodes.push(node);

			if (node._transformVersion === undefined) 
			{
				node._transformVersion = -1;
			}

			const transformVersion = pointcloudTransformVersion.get(pointcloud);
			if (node._transformVersion !== transformVersion.number) 
			{
				node.sceneNode.updateMatrix();
				node.sceneNode.matrixWorld.multiplyMatrices(pointcloud.matrixWorld, node.sceneNode.matrix);
				node._transformVersion = transformVersion.number;
			}

			if (pointcloud.showBoundingBox && !node.boundingBoxNode && node.getBoundingBox) 
			{
				const boxHelper = new Box3Helper(node.getBoundingBox());
				boxHelper.matrixAutoUpdate = false;
				pointcloud.boundingBoxNodes.push(boxHelper);
				node.boundingBoxNode = boxHelper;
				node.boundingBoxNode.matrix.copy(pointcloud.matrixWorld);
			}
			else if (pointcloud.showBoundingBox) 
			{
				node.boundingBoxNode.visible = true;
				node.boundingBoxNode.matrix.copy(pointcloud.matrixWorld);
			}
			else if (!pointcloud.showBoundingBox && node.boundingBoxNode) 
			{
				node.boundingBoxNode.visible = false;
			}
		}

		// Add child nodes to priorityQueue
		const children = node.getChildren();
		for (var i = 0; i < children.length; i++) 
		{
			const child = children[i];
			let weight = 0;

			// Perspective camera
			if (camera.isPerspectiveCamera) 
			{
				const sphere = child.getBoundingSphere(new Sphere());
				const center = sphere.center;
				var distance = sphere.center.distanceTo(camObjPos);

				const radius = sphere.radius;
				const fov = camera.fov * Math.PI / 180;
				const slope = Math.tan(fov / 2);
				const projFactor = 0.5 * domHeight / (slope * distance);
				const screenPixelRadius = radius * projFactor;

				// If pixel radius bellow minimum discard
				if (screenPixelRadius < pointcloud.minimumNodePixelSize) 
				{
					continue;
				}

				weight = screenPixelRadius;

				// Really close to the camera
				if (distance - radius < 0) 
				{
					weight = Number.MAX_VALUE;
				}
			}
			// Orthographic camera
			else 
			{
				// TODO <IMPROVE VISIBILITY>
				const bb = child.getBoundingBox();
				var distance = child.getBoundingSphere(new Sphere()).center.distanceTo(camObjPos);
				const diagonal = bb.max.clone().sub(bb.min).length();
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

	// Update DEM
	const candidates = pointclouds.filter((p) =>
	{
		return p.generateDEM && p.dem instanceof DEM;
	});

	for (var pointcloud of candidates) 
	{
		const updatingNodes = pointcloud.visibleNodes.filter((n) =>
		{
			return n.getLevel() <= Global.maxDEMLevel;
		});
		pointcloud.dem.update(updatingNodes);
	}

	for (var i = 0; i < Math.min(Global.maxNodesLoading, unloadedGeometry.length); i++) 
	{
		unloadedGeometry[i].load();
	}

	return {
		visibleNodes: visibleNodes,
		numVisiblePoints: numVisiblePoints,
		lowestSpacing: lowestSpacing
	};
}

function updatePointClouds(pointclouds, camera, renderer, totalPointBudget) 
{
	const result = updateVisibility(pointclouds, camera, renderer, totalPointBudget);

	for (let i = 0; i < pointclouds.length; i++)
	{
		pointclouds[i].updateMaterial(pointclouds[i].material, camera, renderer);
		pointclouds[i].updateVisibleBounds();
	}

	Global.lru.freeMemory();

	return result;
}

function updateVisibilityStructures(pointclouds, camera, renderer) 
{
	const frustums = [];
	const camObjPositions = [];
	const priorityQueue = new BinaryHeap(function(x)
	{
		return 1 / x.weight;
	});

	for (let i = 0; i < pointclouds.length; i++)
	{
		const pointcloud = pointclouds[i];

		if (!pointcloud.initialized()) 
		{
			continue;
		}

		pointcloud.numVisibleNodes = 0;
		pointcloud.numVisiblePoints = 0;
		pointcloud.deepestVisibleLevel = 0;
		pointcloud.visibleNodes = [];
		pointcloud.visibleGeometry = [];

		// Frustum in object space
		camera.updateMatrixWorld();
		const frustum = new Frustum();
		const viewI = camera.matrixWorldInverse;
		const world = pointcloud.matrixWorld;

		// Use close near plane for frustum intersection
		const frustumCam = camera.clone();
		frustumCam.near = camera.near; // Math.min(camera.near, 0.1);
		frustumCam.updateProjectionMatrix();
		const proj = camera.projectionMatrix;

		const fm = new Matrix4().multiply(proj).multiply(viewI).multiply(world);
		frustum.setFromProjectionMatrix(fm);
		frustums.push(frustum);

		// Camera position in object space
		const view = camera.matrixWorld;
		// var worldI = new Matrix4().getInverse(world);
		const worldI = world.clone().invert();
		const camMatrixObject = new Matrix4().multiply(worldI).multiply(view);
		const camObjPos = new Vector3().setFromMatrixPosition(camMatrixObject);
		camObjPositions.push(camObjPos);

		if (pointcloud.visible && pointcloud.root !== null) 
		{
			priorityQueue.push(
				{
					pointcloud: i,
					node: pointcloud.root,
					weight: Number.MAX_VALUE
				});
		}

		// Hide all previously visible nodes
		if (pointcloud.root.isTreeNode()) 
		{
			pointcloud.hideDescendants(pointcloud.root.sceneNode);
		}

		for (let j = 0; j < pointcloud.boundingBoxNodes.length; j++)
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
	PointSizeType,
	PointShape,
	PointColorType,
	TreeType,
	loadPointCloud,
	updateVisibility,
	updatePointClouds,
	updateVisibilityStructures
};
