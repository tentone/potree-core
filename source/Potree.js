"use strict";

function Potree(){}

Potree.maxNodesLoadGPUFrame = 50;
Potree.maxDEMLevel = 32;
Potree.maxNodesLoading = navigator.hardwareConcurrency !== undefined ? navigator.hardwareConcurrency : 4;
Potree.pointLoadLimit = 1e10;

Potree.framenumber = 0;
Potree.numNodesLoading = 0;
Potree.debug = {};
Potree.scriptPath = null;
Potree.resourcePath = null;
Potree.measureTimings = false;
Potree.tempVector3 = new THREE.Vector3();

Potree.workerPool = new WorkerPool();
Potree.lru = new LRU();

Potree.getWorkerPath = function()
{
	if(document.currentScript.src)
	{
		Potree.scriptPath = new URL(document.currentScript.src + "/..").href;
		if(Potree.scriptPath.slice(-1) === "/")
		{
			Potree.scriptPath = Potree.scriptPath.slice(0, -1);
		}
	}
	else
	{
		console.error("Potree: Was unable to find its script path using document.currentScript.");
	}
	Potree.resourcePath = Potree.scriptPath + "/resources";
};

Potree.getWorkerPath();

Potree.getDEMWorkerInstance = function()
{
	if(!PotreeDEMWorkerInstance)
	{
		var workerPath = Potree.scriptPath + "/workers/DEMWorker.js";
		PotreeDEMWorkerInstance = Potree.workerPool.getWorker(workerPath);
	}

	return PotreeDEMWorkerInstance;
};

Potree.attributeLocations =
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

Potree.Classification =
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

Potree.ClipTask =
{
	NONE: 0,
	HIGHLIGHT: 1,
	SHOW_INSIDE: 2,
	SHOW_OUTSIDE: 3
};

Potree.ClipMethod =
{
	INSIDE_ANY: 0,
	INSIDE_ALL: 1
};

Potree.PointSizeType =
{
	FIXED: 0,
	ATTENUATED: 1,
	ADAPTIVE: 2
};

Potree.PointShape =
{
	SQUARE: 0,
	CIRCLE: 1,
	PARABOLOID: 2
};

Potree.PointColorType =
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

Potree.TreeType =
{
	OCTREE: 0,
	KDTREE: 1
};

Potree.loadPointCloud = function(path, name, callback)
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
		Potree.GreyhoundLoader.load(path, function(geometry)
		{
			if(geometry)
			{
				loaded(new PointCloudOctree(geometry));
			}
		});
	}
	//Potree point cloud
	else if(path.indexOf("cloud.js") > 0)
	{
		Potree.POCLoader.load(path, function(geometry)
		{
			if(geometry)
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
			if(geometry)
			{
				loaded(new PointCloudArena4D(geometry));
			}
		});
	}
	else
	{
		console.error(new Error("Failed to load point cloud from URL " + path));
	}
};

Potree.updateVisibility = function(pointclouds, camera, renderer)
{
	var numVisibleNodes = 0;
	var numVisiblePoints = 0;
	var numVisiblePointsInPointclouds = new Map(pointclouds.map(pc => [pc, 0]));
	var visibleNodes = [];
	var visibleGeometry = [];
	var unloadedGeometry = [];
	var lowestSpacing = Infinity;

	//Calculate object space frustum and cam pos and setup priority queue
	var structures = Potree.updateVisibilityStructures(pointclouds, camera, renderer);
	var frustums = structures.frustums;
	var camObjPositions = structures.camObjPositions;
	var priorityQueue = structures.priorityQueue;

	var loadedToGPUThisFrame = 0;
	var domWidth = renderer.domElement.clientWidth;
	var domHeight = renderer.domElement.clientHeight;

	//Check if pointcloud has been transformed, some code will only be executed if changes have been detected
	if(!Potree._pointcloudTransformVersion)
	{
		Potree._pointcloudTransformVersion = new Map();
	}

	var pointcloudTransformVersion = Potree._pointcloudTransformVersion;
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

			if(pointcloud.material.clipTask === Potree.ClipTask.SHOW_INSIDE)
			{
				if(pointcloud.material.clipMethod === Potree.ClipMethod.INSIDE_ANY && insideAny)
				{
					//node.debug = true
				}
				else if(pointcloud.material.clipMethod === Potree.ClipMethod.INSIDE_ALL && insideAll)
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
			if(node.isLoaded() && loadedToGPUThisFrame < Potree.maxNodesLoadGPUFrame)
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
			Potree.lru.touch(node.geometryNode);

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
	var candidates = pointclouds.filter(p => (p.generateDEM && p.dem instanceof PotreeDEM));
	for(var pointcloud of candidates)
	{
		var updatingNodes = pointcloud.visibleNodes.filter(n => n.getLevel() <= Potree.maxDEMLevel);
		pointcloud.dem.update(updatingNodes);
	}
	
	for(var i = 0; i < Math.min(Potree.maxNodesLoading, unloadedGeometry.length); i++)
	{
		unloadedGeometry[i].load();
	}

	return {
		visibleNodes: visibleNodes,
		numVisiblePoints: numVisiblePoints,
		lowestSpacing: lowestSpacing
	};
};

Potree.updatePointClouds = function(pointclouds, camera, renderer)
{
	/*
	for(var pointcloud of pointclouds)
	{
		var start = performance.now();

		for(var profileRequest of pointcloud.profileRequests)
		{
			profileRequest.update();

			var duration = performance.now() - start;
			if(duration > 5)
			{
				break;
			}
		}

		var duration = performance.now() - start;
	}
	*/

	var result = Potree.updateVisibility(pointclouds, camera, renderer);

	for(var i = 0; i < pointclouds.length; i++)
	{
		pointclouds[i].updateMaterial(pointclouds[i].material, pointclouds[i].visibleNodes, camera, renderer);
		pointclouds[i].updateVisibleBounds();
	}

	Potree.lru.freeMemory();

	return result;
};

Potree.updateVisibilityStructures = function(pointclouds, camera, renderer)
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
		frustumCam.near = Math.min(camera.near, 0.1);
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
};

Potree.shuffleArray = function(array)
{
	for(var i = array.length - 1; i > 0; i--)
	{
		var j = Math.floor(Math.random() * (i + 1));
		var temp = array[i];
		array[i] = array[j];
		array[j] = temp;
	}
};


//Copied from three.js: WebGLRenderer.js
Potree.paramThreeToGL = function(_gl, p)
{
	var extension;

	if(p === THREE.RepeatWrapping) return _gl.REPEAT;
	if(p === THREE.ClampToEdgeWrapping) return _gl.CLAMP_TO_EDGE;
	if(p === THREE.MirroredRepeatWrapping) return _gl.MIRRORED_REPEAT;

	if(p === THREE.NearestFilter) return _gl.NEAREST;
	if(p === THREE.NearestMipMapNearestFilter) return _gl.NEAREST_MIPMAP_NEAREST;
	if(p === THREE.NearestMipMapLinearFilter) return _gl.NEAREST_MIPMAP_LINEAR;

	if(p === THREE.LinearFilter) return _gl.LINEAR;
	if(p === THREE.LinearMipMapNearestFilter) return _gl.LINEAR_MIPMAP_NEAREST;
	if(p === THREE.LinearMipMapLinearFilter) return _gl.LINEAR_MIPMAP_LINEAR;

	if(p === THREE.UnsignedByteType) return _gl.UNSIGNED_BYTE;
	if(p === THREE.UnsignedShort4444Type) return _gl.UNSIGNED_SHORT_4_4_4_4;
	if(p === THREE.UnsignedShort5551Type) return _gl.UNSIGNED_SHORT_5_5_5_1;
	if(p === THREE.UnsignedShort565Type) return _gl.UNSIGNED_SHORT_5_6_5;

	if(p === THREE.ByteType) return _gl.BYTE;
	if(p === THREE.ShortType) return _gl.SHORT;
	if(p === THREE.UnsignedShortType) return _gl.UNSIGNED_SHORT;
	if(p === THREE.IntType) return _gl.INT;
	if(p === THREE.UnsignedIntType) return _gl.UNSIGNED_INT;
	if(p === THREE.FloatType) return _gl.FLOAT;

	if(p === THREE.HalfFloatType)
	{
		extension = extensions.get("OES_texture_half_float");
		if(extension !== null) return extension.HALF_FLOAT_OES;
	}

	if(p === THREE.AlphaFormat) return _gl.ALPHA;
	if(p === THREE.RGBFormat) return _gl.RGB;
	if(p === THREE.RGBAFormat) return _gl.RGBA;
	if(p === THREE.LuminanceFormat) return _gl.LUMINANCE;
	if(p === THREE.LuminanceAlphaFormat) return _gl.LUMINANCE_ALPHA;
	if(p === THREE.DepthFormat) return _gl.DEPTH_COMPONENT;
	if(p === THREE.DepthStencilFormat) return _gl.DEPTH_STENCIL;

	if(p === THREE.AddEquation) return _gl.FUNC_ADD;
	if(p === THREE.SubtractEquation) return _gl.FUNC_SUBTRACT;
	if(p === THREE.ReverseSubtractEquation) return _gl.FUNC_REVERSE_SUBTRACT;

	if(p === THREE.ZeroFactor) return _gl.ZERO;
	if(p === THREE.OneFactor) return _gl.ONE;
	if(p === THREE.SrcColorFactor) return _gl.SRC_COLOR;
	if(p === THREE.OneMinusSrcColorFactor) return _gl.ONE_MINUS_SRC_COLOR;
	if(p === THREE.SrcAlphaFactor) return _gl.SRC_ALPHA;
	if(p === THREE.OneMinusSrcAlphaFactor) return _gl.ONE_MINUS_SRC_ALPHA;
	if(p === THREE.DstAlphaFactor) return _gl.DST_ALPHA;
	if(p === THREE.OneMinusDstAlphaFactor) return _gl.ONE_MINUS_DST_ALPHA;

	if(p === THREE.DstColorFactor) return _gl.DST_COLOR;
	if(p === THREE.OneMinusDstColorFactor) return _gl.ONE_MINUS_DST_COLOR;
	if(p === THREE.SrcAlphaSaturateFactor) return _gl.SRC_ALPHA_SATURATE;

	if(p === THREE.RGB_S3TC_DXT1_Format || p === RGBA_S3TC_DXT1_Format || p === THREE.RGBA_S3TC_DXT3_Format || p === RGBA_S3TC_DXT5_Format)
	{
		extension = extensions.get("WEBGL_compressed_texture_s3tc");

		if(extension !== null)
		{
			if(p === THREE.RGB_S3TC_DXT1_Format) return extension.COMPRESSED_RGB_S3TC_DXT1_EXT;
			if(p === THREE.RGBA_S3TC_DXT1_Format) return extension.COMPRESSED_RGBA_S3TC_DXT1_EXT;
			if(p === THREE.RGBA_S3TC_DXT3_Format) return extension.COMPRESSED_RGBA_S3TC_DXT3_EXT;
			if(p === THREE.RGBA_S3TC_DXT5_Format) return extension.COMPRESSED_RGBA_S3TC_DXT5_EXT;
		}
	}

	if(p === THREE.RGB_PVRTC_4BPPV1_Format || p === THREE.RGB_PVRTC_2BPPV1_Format || p === THREE.RGBA_PVRTC_4BPPV1_Format || p === THREE.RGBA_PVRTC_2BPPV1_Format)
	{
		extension = extensions.get("WEBGL_compressed_texture_pvrtc");

		if(extension !== null)
		{
			if(p === THREE.RGB_PVRTC_4BPPV1_Format) return extension.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;
			if(p === THREE.RGB_PVRTC_2BPPV1_Format) return extension.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;
			if(p === THREE.RGBA_PVRTC_4BPPV1_Format) return extension.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;
			if(p === THREE.RGBA_PVRTC_2BPPV1_Format) return extension.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG;
		}
	}

	if(p === THREE.RGB_ETC1_Format)
	{
		extension = extensions.get("WEBGL_compressed_texture_etc1");
		if(extension !== null) return extension.COMPRESSED_RGB_ETC1_WEBGL;
	}

	if(p === THREE.MinEquation || p === THREE.MaxEquation)
	{
		extension = extensions.get("EXT_blend_minmax");

		if(extension !== null)
		{
			if(p === THREE.MinEquation) return extension.MIN_EXT;
			if(p === THREE.MaxEquation) return extension.MAX_EXT;
		}
	}

	if(p === UnsignedInt248Type)
	{
		extension = extensions.get("WEBGL_depth_texture");
		if(extension !== null) return extension.UNSIGNED_INT_24_8_WEBGL;
	}

	return 0;
};