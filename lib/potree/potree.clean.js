"use strict";

function Potree(){}

Potree.framenumber = 0;
Potree.numNodesLoading = 0;
Potree.maxNodesLoading = 4;
Potree.debug = {};
Potree.scriptPath = null;
Potree.pointLoadLimit = Infinity;

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
	console.error("Potree was unable to find its script path using document.currentScript. Is Potree included with a script tag? Does your browser support this function?");
}

Potree.resourcePath = Potree.scriptPath + "/resources";

Potree.ClipTask = {
	NONE: 0,
	HIGHLIGHT: 1,
	SHOW_INSIDE: 2,
	SHOW_OUTSIDE: 3
};

Potree.ClipMethod = {
	INSIDE_ANY: 0,
	INSIDE_ALL: 1
};

Potree.measureTimings = false;
Potree.tempVector3 = new THREE.Vector3();

Potree.updatePointClouds = function(pointclouds, camera, renderer)
{
	if(!Potree.lru)
	{
		Potree.lru = new LRU();
	}

	for(let pointcloud of pointclouds)
	{
		let start = performance.now();

		for(let profileRequest of pointcloud.profileRequests)
		{
			profileRequest.update();

			let duration = performance.now() - start;
			if(duration > 5)
			{
				break;
			}
		}

		let duration = performance.now() - start;
	}

	let result = Potree.updateVisibility(pointclouds, camera, renderer);

	for(let pointcloud of pointclouds)
	{
		pointcloud.updateMaterial(pointcloud.material, pointcloud.visibleNodes, camera, renderer);
		pointcloud.updateVisibleBounds();
	}

	Potree.getLRU().freeMemory();

	return result;
};

Potree.getLRU = function()
{
	if(!Potree.lru)
	{
		Potree.lru = new LRU();
	}

	return Potree.lru;
};

Potree.updateVisibilityStructures = function(pointclouds, camera, renderer)
{
	let frustums = [];
	let camObjPositions = [];
	let priorityQueue = new BinaryHeap(function(x)
	{
		return 1 / x.weight;
	});

	for(let i = 0; i < pointclouds.length; i++)
	{
		let pointcloud = pointclouds[i];

		if(!pointcloud.initialized())
		{
			continue;
		}

		pointcloud.numVisibleNodes = 0;
		pointcloud.numVisiblePoints = 0;
		pointcloud.deepestVisibleLevel = 0;
		pointcloud.visibleNodes = [];
		pointcloud.visibleGeometry = [];

		// frustum in object space
		camera.updateMatrixWorld();
		let frustum = new THREE.Frustum();
		let viewI = camera.matrixWorldInverse;
		let world = pointcloud.matrixWorld;

		// use close near plane for frustum intersection
		let frustumCam = camera.clone();
		frustumCam.near = Math.min(camera.near, 0.1);
		frustumCam.updateProjectionMatrix();
		let proj = camera.projectionMatrix;

		let fm = new THREE.Matrix4().multiply(proj).multiply(viewI).multiply(world);
		frustum.setFromMatrix(fm);
		frustums.push(frustum);

		// camera position in object space
		let view = camera.matrixWorld;
		let worldI = new THREE.Matrix4().getInverse(world);
		let camMatrixObject = new THREE.Matrix4().multiply(worldI).multiply(view);
		let camObjPos = new THREE.Vector3().setFromMatrixPosition(camMatrixObject);
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

		// hide all previously visible nodes
		if(pointcloud.root.isTreeNode())
		{
			pointcloud.hideDescendants(pointcloud.root.sceneNode);
		}

		for(let j = 0; j < pointcloud.boundingBoxNodes.length; j++)
		{
			pointcloud.boundingBoxNodes[j].visible = false;
		}
	}

	return {
		"frustums": frustums,
		"camObjPositions": camObjPositions,
		"priorityQueue": priorityQueue
	};
};

Potree.getDEMWorkerInstance = function()
{
	if(!Potree.DEMWorkerInstance)
	{
		let workerPath = Potree.scriptPath + "/workers/DEMWorker.js";
		Potree.DEMWorkerInstance = Potree.workerPool.getWorker(workerPath);
	}

	return Potree.DEMWorkerInstance;
};

Potree.updateVisibility = function(pointclouds, camera, renderer)
{

	let numVisibleNodes = 0;
	let numVisiblePoints = 0;

	let numVisiblePointsInPointclouds = new Map(pointclouds.map(pc => [pc, 0]));

	let visibleNodes = [];
	let visibleGeometry = [];
	let unloadedGeometry = [];

	let lowestSpacing = Infinity;

	// calculate object space frustum and cam pos and setup priority queue
	let s = Potree.updateVisibilityStructures(pointclouds, camera, renderer);
	let frustums = s.frustums;
	let camObjPositions = s.camObjPositions;
	let priorityQueue = s.priorityQueue;

	let loadedToGPUThisFrame = 0;

	let domWidth = renderer.domElement.clientWidth;
	let domHeight = renderer.domElement.clientHeight;

	// check if pointcloud has been transformed
	// some code will only be executed if changes have been detected
	if(!Potree._pointcloudTransformVersion)
	{
		Potree._pointcloudTransformVersion = new Map();
	}
	let pointcloudTransformVersion = Potree._pointcloudTransformVersion;
	for(let pointcloud of pointclouds)
	{

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
			let version = pointcloudTransformVersion.get(pointcloud);

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

	while(priorityQueue.size() > 0)
	{
		let element = priorityQueue.pop();
		let node = element.node;
		let parent = element.parent;
		let pointcloud = pointclouds[element.pointcloud];
		let box = node.getBoundingBox();
		let frustum = frustums[element.pointcloud];
		let camObjPos = camObjPositions[element.pointcloud];

		let insideFrustum = frustum.intersectsBox(box);
		let maxLevel = pointcloud.maxLevel || Infinity;
		let level = node.getLevel();
		let visible = insideFrustum;
		visible = visible && !(numVisiblePointsInPointclouds.get(pointcloud) + node.getNumPoints() > pointcloud.pointBudget);
		visible = visible && level < maxLevel;

		if(false && pointcloud.material.clipBoxes.length > 0)
		{

			//node.debug = false;

			let numIntersecting = 0;
			let numIntersectionVolumes = 0;

			for(let clipBox of pointcloud.material.clipBoxes)
			{

				let pcWorldInverse = new THREE.Matrix4().getInverse(pointcloud.matrixWorld);
				let toPCObject = pcWorldInverse.multiply(clipBox.box.matrixWorld);

				let px = new THREE.Vector3(+1, 0, 0).applyMatrix4(toPCObject);
				let nx = new THREE.Vector3(-1, 0, 0).applyMatrix4(toPCObject);
				let py = new THREE.Vector3(0, +1, 0).applyMatrix4(toPCObject);
				let ny = new THREE.Vector3(0, -1, 0).applyMatrix4(toPCObject);
				let pz = new THREE.Vector3(0, 0, +1).applyMatrix4(toPCObject);
				let nz = new THREE.Vector3(0, 0, -1).applyMatrix4(toPCObject);

				let pxN = new THREE.Vector3().subVectors(nx, px).normalize();
				let nxN = pxN.clone().multiplyScalar(-1);
				let pyN = new THREE.Vector3().subVectors(ny, py).normalize();
				let nyN = pyN.clone().multiplyScalar(-1);
				let pzN = new THREE.Vector3().subVectors(nz, pz).normalize();
				let nzN = pzN.clone().multiplyScalar(-1);

				let pxPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(pxN, px);
				let nxPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(nxN, nx);
				let pyPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(pyN, py);
				let nyPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(nyN, ny);
				let pzPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(pzN, pz);
				let nzPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(nzN, nz);

				let frustum = new THREE.Frustum(pxPlane, nxPlane, pyPlane, nyPlane, pzPlane, nzPlane);
				let intersects = frustum.intersectsBox(box);

				if(intersects)
				{
					numIntersecting++;
				}
				numIntersectionVolumes++;
			}

			let insideAny = numIntersecting > 0;
			let insideAll = numIntersecting === numIntersectionVolumes;

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

		// TODO: not used, same as the declaration?
		// numVisibleNodes++;
		numVisiblePoints += node.getNumPoints();
		let numVisiblePointsInPointcloud = numVisiblePointsInPointclouds.get(pointcloud);
		numVisiblePointsInPointclouds.set(pointcloud, numVisiblePointsInPointcloud + node.getNumPoints());

		pointcloud.numVisibleNodes++;
		pointcloud.numVisiblePoints += node.getNumPoints();

		if(node.isGeometryNode() && (!parent || parent.isTreeNode()))
		{
			if(node.isLoaded() && loadedToGPUThisFrame < 2)
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
			Potree.getLRU().touch(node.geometryNode);
			node.sceneNode.visible = true;
			node.sceneNode.material = pointcloud.material;

			visibleNodes.push(node);
			pointcloud.visibleNodes.push(node);

			if(node._transformVersion === undefined)
			{
				node._transformVersion = -1;
			}
			let transformVersion = pointcloudTransformVersion.get(pointcloud);
			if(node._transformVersion !== transformVersion.number)
			{
				node.sceneNode.updateMatrix();
				node.sceneNode.matrixWorld.multiplyMatrices(pointcloud.matrixWorld, node.sceneNode.matrix);
				node._transformVersion = transformVersion.number;
			}

			if(pointcloud.showBoundingBox && !node.boundingBoxNode && node.getBoundingBox)
			{
				let boxHelper = new Potree.Box3Helper(node.getBoundingBox());
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

		// add child nodes to priorityQueue
		let children = node.getChildren();
		for(let i = 0; i < children.length; i++)
		{
			let child = children[i];

			let weight = 0;
			if(camera.isPerspectiveCamera)
			{
				let sphere = child.getBoundingSphere(new THREE.Sphere());
				let center = sphere.center;
				//let distance = sphere.center.distanceTo(camObjPos);

				let dx = camObjPos.x - center.x;
				let dy = camObjPos.y - center.y;
				let dz = camObjPos.z - center.z;

				let dd = dx * dx + dy * dy + dz * dz;
				let distance = Math.sqrt(dd);

				let radius = sphere.radius;

				let fov = (camera.fov * Math.PI) / 180;
				let slope = Math.tan(fov / 2);
				let projFactor = (0.5 * domHeight) / (slope * distance);
				let screenPixelRadius = radius * projFactor;

				if(screenPixelRadius < pointcloud.minimumNodePixelSize)
				{
					continue;
				}

				weight = screenPixelRadius;

				if(distance - radius < 0)
				{
					weight = Number.MAX_VALUE;
				}
			}
			else
			{
				// TODO ortho visibility
				let bb = child.getBoundingBox();
				let distance = child.getBoundingSphere(new THREE.Sphere()).center.distanceTo(camObjPos);
				let diagonal = bb.max.clone().sub(bb.min).length();
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
	} // end priority queue loop

	{ // update DEM
		let maxDEMLevel = 4;
		let candidates = pointclouds
			.filter(p => (p.generateDEM && p.dem instanceof Potree.DEM));
		for(let pointcloud of candidates)
		{
			let updatingNodes = pointcloud.visibleNodes.filter(n => n.getLevel() <= maxDEMLevel);
			pointcloud.dem.update(updatingNodes);
		}
	}

	for(let i = 0; i < Math.min(Potree.maxNodesLoading, unloadedGeometry.length); i++)
	{
		unloadedGeometry[i].load();
	}

	return {
		visibleNodes: visibleNodes,
		numVisiblePoints: numVisiblePoints,
		lowestSpacing: lowestSpacing
	};
};

// Copied from three.js: WebGLRenderer.js
Potree.paramThreeToGL = function paramThreeToGL(_gl, p)
{

	let extension;

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

	if(p === THREE.RGB_S3TC_DXT1_Format || p === RGBA_S3TC_DXT1_Format ||
		p === THREE.RGBA_S3TC_DXT3_Format || p === RGBA_S3TC_DXT5_Format)
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

	if(p === THREE.RGB_PVRTC_4BPPV1_Format || p === THREE.RGB_PVRTC_2BPPV1_Format ||
		p === THREE.RGBA_PVRTC_4BPPV1_Format || p === THREE.RGBA_PVRTC_2BPPV1_Format)
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

Potree.attributeLocations = {
	"position": 0,
	"color": 1,
	"intensity": 2,
	"classification": 3,
	"returnNumber": 4,
	"numberOfReturns": 5,
	"pointSourceID": 6,
	"indices": 7,
	"normal": 8,
	"spacing": 9,
};

class EnumItem
{
	constructor(object)
	{
		for(let key of Object.keys(object))
		{
			this[key] = object[key];
		}
	}

	inspect()
	{
		return `Enum(${this.name}: ${this.value})`;
	}
};

class Enum
{
	constructor(object)
	{
		this.object = object;

		for(let key of Object.keys(object))
		{
			let value = object[key];

			if(typeof value === "object")
			{
				value.name = key;
			}
			else
			{
				value = {
					name: key,
					value: value
				};
			}

			this[key] = new EnumItem(value);
		}
	}

	fromValue(value)
	{
		for(let key of Object.keys(this.object))
		{
			if(this[key].value === value)
			{
				return this[key];
			}
		}

		throw new Error(`No enum for value: ${value}`);
	}

};

Potree.Points = class Points
{
	constructor()
	{
		this.boundingBox = new THREE.Box3();
		this.numPoints = 0;
		this.data = {};
	}

	add(points)
	{
		let currentSize = this.numPoints;
		let additionalSize = points.numPoints;
		let newSize = currentSize + additionalSize;

		let thisAttributes = Object.keys(this.data);
		let otherAttributes = Object.keys(points.data);
		let attributes = new Set([...thisAttributes, ...otherAttributes]);

		for(let attribute of attributes)
		{
			if(thisAttributes.includes(attribute) && otherAttributes.includes(attribute))
			{
				// attribute in both, merge
				let Type = this.data[attribute].constructor;
				let merged = new Type(this.data[attribute].length + points.data[attribute].length);
				merged.set(this.data[attribute], 0);
				merged.set(points.data[attribute], this.data[attribute].length);
				this.data[attribute] = merged;
			}
			else if(thisAttributes.includes(attribute) && !otherAttributes.includes(attribute))
			{
				// attribute only in this; take over this and expand to new size
				let elementsPerPoint = this.data[attribute].length / this.numPoints;
				let Type = this.data[attribute].constructor;
				let expanded = new Type(elementsPerPoint * newSize);
				expanded.set(this.data[attribute], 0);
				this.data[attribute] = expanded;
			}
			else if(!thisAttributes.includes(attribute) && otherAttributes.includes(attribute))
			{
				// attribute only in points to be added; take over new points and expand to new size
				let elementsPerPoint = points.data[attribute].length / points.numPoints;
				let Type = points.data[attribute].constructor;
				let expanded = new Type(elementsPerPoint * newSize);
				expanded.set(points.data[attribute], elementsPerPoint * currentSize);
				this.data[attribute] = expanded;
			}
		}

		this.numPoints = newSize;

		this.boundingBox.union(points.boundingBox);
	}
};

Potree.Shader = class Shader
{
	constructor(gl, name, vsSource, fsSource)
	{
		this.gl = gl;
		this.name = name;
		this.vsSource = vsSource;
		this.fsSource = fsSource;

		this.cache = new Map();

		this.vs = null;
		this.fs = null;
		this.program = null;

		this.uniformLocations = {};
		this.attributeLocations = {};

		this.update(vsSource, fsSource);
	}

	update(vsSource, fsSource)
	{
		this.vsSource = vsSource;
		this.fsSource = fsSource;

		this.linkProgram();
	}

	compileShader(shader, source)
	{
		let gl = this.gl;

		gl.shaderSource(shader, source);

		gl.compileShader(shader);

		let success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
		if(!success)
		{
			let info = gl.getShaderInfoLog(shader);
			let numberedSource = source.split("\n").map((a, i) => `${i + 1}`.padEnd(5) + a).join("\n");
			throw `could not compile shader ${this.name}: ${info}, \n${numberedSource}`;
		}
	}

	linkProgram()
	{

		let gl = this.gl;

		this.uniformLocations = {};
		this.attributeLocations = {};

		gl.useProgram(null);

		let cached = this.cache.get(`${this.vsSource}, ${this.fsSource}`);
		if(cached)
		{
			this.program = cached.program;
			this.vs = cached.vs;
			this.fs = cached.fs;
			this.attributeLocations = cached.attributeLocations;
			this.uniformLocations = cached.uniformLocations;

			return;
		}
		else
		{
			this.vs = gl.createShader(gl.VERTEX_SHADER);
			this.fs = gl.createShader(gl.FRAGMENT_SHADER);
			this.program = gl.createProgram();

			for(let name of Object.keys(Potree.attributeLocations))
			{
				let location = Potree.attributeLocations[name];
				gl.bindAttribLocation(this.program, location, name);
			}

			this.compileShader(this.vs, this.vsSource);
			this.compileShader(this.fs, this.fsSource);

			let program = this.program;

			gl.attachShader(program, this.vs);
			gl.attachShader(program, this.fs);

			gl.linkProgram(program);

			gl.detachShader(program, this.vs);
			gl.detachShader(program, this.fs);

			let success = gl.getProgramParameter(program, gl.LINK_STATUS);
			if(!success)
			{
				let info = gl.getProgramInfoLog(program);
				throw `could not link program ${this.name}: ${info}`;
			}

			// attribute locations
			let numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

			for(let i = 0; i < numAttributes; i++)
			{
				let attribute = gl.getActiveAttrib(program, i);

				let location = gl.getAttribLocation(program, attribute.name);

				this.attributeLocations[attribute.name] = location;
			}

			// uniform locations
			let numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);

			for(let i = 0; i < numUniforms; i++)
			{
				let uniform = gl.getActiveUniform(program, i);

				let location = gl.getUniformLocation(program, uniform.name);

				this.uniformLocations[uniform.name] = location;
			}

			let cached = {
				program: this.program,
				vs: this.vs,
				fs: this.fs,
				attributeLocations: this.attributeLocations,
				uniformLocations: this.uniformLocations
			};

			this.cache.set(`${this.vsSource}, ${this.fsSource}`, cached);
		}
	}

	setUniformMatrix4(name, value)
	{
		const gl = this.gl;
		const location = this.uniformLocations[name];

		if(location == null)
		{
			return;
		}

		let tmp = new Float32Array(value.elements);
		gl.uniformMatrix4fv(location, false, tmp);
	}

	setUniform1f(name, value)
	{
		const gl = this.gl;
		const location = this.uniformLocations[name];

		if(location == null)
		{
			return;
		}

		gl.uniform1f(location, value);
	}

	setUniformBoolean(name, value)
	{
		const gl = this.gl;
		const location = this.uniformLocations[name];

		if(location == null)
		{
			return;
		}

		gl.uniform1i(location, value);
	}

	setUniformTexture(name, value)
	{
		const gl = this.gl;
		const location = this.uniformLocations[name];

		if(location == null)
		{
			return;
		}

		gl.uniform1i(location, value);
	}

	setUniform2f(name, value)
	{
		const gl = this.gl;
		const location = this.uniformLocations[name];

		if(location == null)
		{
			return;
		}

		gl.uniform2f(location, value[0], value[1]);
	}

	setUniform3f(name, value)
	{
		const gl = this.gl;
		const location = this.uniformLocations[name];

		if(location == null)
		{
			return;
		}

		gl.uniform3f(location, value[0], value[1], value[2]);
	}

	setUniform(name, value)
	{

		if(value.constructor === THREE.Matrix4)
		{
			this.setUniformMatrix4(name, value);
		}
		else if(typeof value === "number")
		{
			this.setUniform1f(name, value);
		}
		else if(typeof value === "boolean")
		{
			this.setUniformBoolean(name, value);
		}
		else if(value instanceof Potree.WebGLTexture)
		{
			this.setUniformTexture(name, value);
		}
		else if(value instanceof Array)
		{
			if(value.length === 2)
			{
				this.setUniform2f(name, value);
			}
			else if(value.length === 3)
			{
				this.setUniform3f(name, value);
			}
		}
		else
		{
			console.error("unhandled uniform type: ", name, value);
		}

	}

	setUniform1i(name, value)
	{
		let gl = this.gl;
		let location = this.uniformLocations[name];

		if(location == null)
		{
			return;
		}

		gl.uniform1i(location, value);
	}

};

Potree.WebGLTexture = class WebGLTexture
{

	constructor(gl, texture)
	{
		this.gl = gl;

		this.texture = texture;
		this.id = gl.createTexture();

		this.target = gl.TEXTURE_2D;
		this.version = -1;

		this.update(texture);
	}

	update()
	{
		if(!this.texture.image)
		{
			this.version = this.texture.version;
			return;
		}

		let gl = this.gl;
		let texture = this.texture;

		if(this.version === texture.version)
		{
			return;
		}

		this.target = gl.TEXTURE_2D;

		gl.bindTexture(this.target, this.id);

		let level = 0;
		let internalFormat = Potree.paramThreeToGL(gl, texture.format);
		let width = texture.image.width;
		let height = texture.image.height;
		let border = 0;
		let srcFormat = internalFormat;
		let srcType = Potree.paramThreeToGL(gl, texture.type);
		let data;

		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, texture.flipY);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, texture.unpackAlignment);

		if(texture instanceof THREE.DataTexture)
		{
			data = texture.image.data;

			gl.texParameteri(this.target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(this.target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

			gl.texParameteri(this.target, gl.TEXTURE_MAG_FILTER, Potree.paramThreeToGL(gl, texture.magFilter));
			gl.texParameteri(this.target, gl.TEXTURE_MIN_FILTER, Potree.paramThreeToGL(gl, texture.minFilter));

			gl.texImage2D(this.target, level, internalFormat,
				width, height, border, srcFormat, srcType,
				data);
		}
		else if(texture instanceof THREE.CanvasTexture)
		{
			data = texture.image;

			gl.texParameteri(this.target, gl.TEXTURE_WRAP_S, Potree.paramThreeToGL(gl, texture.wrapS));
			gl.texParameteri(this.target, gl.TEXTURE_WRAP_T, Potree.paramThreeToGL(gl, texture.wrapT));

			gl.texParameteri(this.target, gl.TEXTURE_MAG_FILTER, Potree.paramThreeToGL(gl, texture.magFilter));
			gl.texParameteri(this.target, gl.TEXTURE_MIN_FILTER, Potree.paramThreeToGL(gl, texture.minFilter));

			gl.texImage2D(this.target, level, internalFormat,
				internalFormat, srcType, data);
		}

		gl.bindTexture(this.target, null);

		this.version = texture.version;
	}

};

Potree.WebGLBuffer = class WebGLBuffer
{
	constructor()
	{
		this.numElements = 0;
		this.vao = null;
		this.vbos = new Map();
	}
};

//
// index is in order xyzxyzxyz
//
Potree.DEMNode = class DEMNode
{
	constructor(name, box, tileSize)
	{
		this.name = name;
		this.box = box;
		this.tileSize = tileSize;
		this.level = this.name.length - 1;
		this.data = new Float32Array(tileSize * tileSize);
		this.data.fill(-Infinity);
		this.children = [];

		this.mipMap = [this.data];
		this.mipMapNeedsUpdate = true;
	}

	createMipMap()
	{
		this.mipMap = [this.data];

		let sourceSize = this.tileSize;
		let mipSize = parseInt(sourceSize / 2);
		let mipSource = this.data;
		while(mipSize > 1)
		{
			let mipData = new Float32Array(mipSize * mipSize);

			for(let i = 0; i < mipSize; i++)
			{
				for(let j = 0; j < mipSize; j++)
				{
					let h00 = mipSource[2 * i + 0 + 2 * j * sourceSize];
					let h01 = mipSource[2 * i + 0 + 2 * j * sourceSize + sourceSize];
					let h10 = mipSource[2 * i + 1 + 2 * j * sourceSize];
					let h11 = mipSource[2 * i + 1 + 2 * j * sourceSize + sourceSize];

					let [height, weight] = [0, 0];

					if(isFinite(h00))
					{
						height += h00;
						weight += 1;
					};
					if(isFinite(h01))
					{
						height += h01;
						weight += 1;
					};
					if(isFinite(h10))
					{
						height += h10;
						weight += 1;
					};
					if(isFinite(h11))
					{
						height += h11;
						weight += 1;
					};

					height = height / weight;

					// let hs = [h00, h01, h10, h11].filter(h => isFinite(h));
					// let height = hs.reduce( (a, v, i) => a + v, 0) / hs.length;

					mipData[i + j * mipSize] = height;
				}
			}

			this.mipMap.push(mipData);

			mipSource = mipData;
			sourceSize = mipSize;
			mipSize = parseInt(mipSize / 2);
		}

		this.mipMapNeedsUpdate = false;
	}

	uv(position)
	{
		let boxSize = this.box.getSize(new THREE.Vector3());

		let u = (position.x - this.box.min.x) / boxSize.x;
		let v = (position.y - this.box.min.y) / boxSize.y;

		return [u, v];
	}

	heightAtMipMapLevel(position, mipMapLevel)
	{
		let uv = this.uv(position);

		let tileSize = parseInt(this.tileSize / parseInt(2 ** mipMapLevel));
		let data = this.mipMap[mipMapLevel];

		let i = Math.min(uv[0] * tileSize, tileSize - 1);
		let j = Math.min(uv[1] * tileSize, tileSize - 1);

		let a = i % 1;
		let b = j % 1;

		let [i0, i1] = [Math.floor(i), Math.ceil(i)];
		let [j0, j1] = [Math.floor(j), Math.ceil(j)];

		let h00 = data[i0 + tileSize * j0];
		let h01 = data[i0 + tileSize * j1];
		let h10 = data[i1 + tileSize * j0];
		let h11 = data[i1 + tileSize * j1];

		let wh00 = isFinite(h00) ? (1 - a) * (1 - b) : 0;
		let wh01 = isFinite(h01) ? (1 - a) * b : 0;
		let wh10 = isFinite(h10) ? a * (1 - b) : 0;
		let wh11 = isFinite(h11) ? a * b : 0;

		let wsum = wh00 + wh01 + wh10 + wh11;
		wh00 = wh00 / wsum;
		wh01 = wh01 / wsum;
		wh10 = wh10 / wsum;
		wh11 = wh11 / wsum;

		if(wsum === 0)
		{
			return null;
		}

		let h = 0;

		if(isFinite(h00)) h += h00 * wh00;
		if(isFinite(h01)) h += h01 * wh01;
		if(isFinite(h10)) h += h10 * wh10;
		if(isFinite(h11)) h += h11 * wh11;

		return h;
	}

	height(position)
	{
		let h = null;

		for(let i = 0; i < this.mipMap.length; i++)
		{
			h = this.heightAtMipMapLevel(position, i);

			if(h !== null)
			{
				return h;
			}
		}

		return h;
	}

	traverse(handler, level = 0)
	{
		handler(this, level);

		for(let child of this.children.filter(c => c !== undefined))
		{
			child.traverse(handler, level + 1);
		}
	}
};

Potree.DEM = class DEM
{
	constructor(pointcloud)
	{
		this.pointcloud = pointcloud;
		this.matrix = null;
		this.boundingBox = null;
		this.tileSize = 64;
		this.root = null;
		this.version = 0;
	}

	// expands the tree to all nodes that intersect <box> at <level>
	// returns the intersecting nodes at <level>
	expandAndFindByBox(box, level)
	{
		if(level === 0)
		{
			return [this.root];
		}

		let result = [];
		let stack = [this.root];

		while(stack.length > 0)
		{
			let node = stack.pop();
			let nodeBoxSize = node.box.getSize(new THREE.Vector3());

			// check which children intersect by transforming min/max to quadrants
			let min = {
				x: (box.min.x - node.box.min.x) / nodeBoxSize.x,
				y: (box.min.y - node.box.min.y) / nodeBoxSize.y
			};
			let max = {
				x: (box.max.x - node.box.max.x) / nodeBoxSize.x,
				y: (box.max.y - node.box.max.y) / nodeBoxSize.y
			};

			min.x = min.x < 0.5 ? 0 : 1;
			min.y = min.y < 0.5 ? 0 : 1;
			max.x = max.x < 0.5 ? 0 : 1;
			max.y = max.y < 0.5 ? 0 : 1;

			let childIndices;
			if(min.x === 0 && min.y === 0 && max.x === 1 && max.y === 1)
			{
				childIndices = [0, 1, 2, 3];
			}
			else if(min.x === max.x && min.y === max.y)
			{
				childIndices = [(min.x << 1) | min.y];
			}
			else
			{
				childIndices = [(min.x << 1) | min.y, (max.x << 1) | max.y];
			}

			for(let index of childIndices)
			{
				if(node.children[index] === undefined)
				{
					let childBox = node.box.clone();

					if((index & 2) > 0)
					{
						childBox.min.x += nodeBoxSize.x / 2.0;
					}
					else
					{
						childBox.max.x -= nodeBoxSize.x / 2.0;
					}

					if((index & 1) > 0)
					{
						childBox.min.y += nodeBoxSize.y / 2.0;
					}
					else
					{
						childBox.max.y -= nodeBoxSize.y / 2.0;
					}

					let child = new Potree.DEMNode(node.name + index, childBox, this.tileSize);
					node.children[index] = child;
				}

				let child = node.children[index];

				if(child.level < level)
				{
					stack.push(child);
				}
				else
				{
					result.push(child);
				}
			}
		}

		return result;
	}

	childIndex(uv)
	{
		let [x, y] = uv.map(n => n < 0.5 ? 0 : 1);

		let index = (x << 1) | y;

		return index;
	}

	height(position)
	{
		// return this.root.height(position);

		if(!this.root)
		{
			return 0;
		}

		let height = null;
		let list = [this.root];
		while(true)
		{
			let node = list[list.length - 1];

			let currentHeight = node.height(position);

			if(currentHeight !== null)
			{
				height = currentHeight;
			}

			let uv = node.uv(position);
			let childIndex = this.childIndex(uv);

			if(node.children[childIndex])
			{
				list.push(node.children[childIndex]);
			}
			else
			{
				break;
			}
		}

		return height + this.pointcloud.position.z;
	}

	update(visibleNodes)
	{
		if(Potree.getDEMWorkerInstance().working)
		{
			return;
		}

		// check if point cloud transformation changed
		if(this.matrix === null || !this.matrix.equals(this.pointcloud.matrixWorld))
		{
			this.matrix = this.pointcloud.matrixWorld.clone();
			this.boundingBox = this.pointcloud.boundingBox.clone().applyMatrix4(this.matrix);
			this.root = new Potree.DEMNode("r", this.boundingBox, this.tileSize);
			this.version++;
		}

		// find node to update
		let node = null;
		for(let vn of visibleNodes)
		{
			if(vn.demVersion === undefined || vn.demVersion < this.version)
			{
				node = vn;
				break;
			}
		}
		if(node === null)
		{
			return;
		}

		// update node
		let projectedBox = node.getBoundingBox().clone().applyMatrix4(this.matrix);
		let projectedBoxSize = projectedBox.getSize(new THREE.Vector3());

		let targetNodes = this.expandAndFindByBox(projectedBox, node.getLevel());
		node.demVersion = this.version;

		Potree.getDEMWorkerInstance().onmessage = (e) =>
		{
			let data = new Float32Array(e.data.dem.data);

			for(let demNode of targetNodes)
			{
				let boxSize = demNode.box.getSize(new THREE.Vector3());

				for(let i = 0; i < this.tileSize; i++)
				{
					for(let j = 0; j < this.tileSize; j++)
					{
						let u = (i / (this.tileSize - 1));
						let v = (j / (this.tileSize - 1));

						let x = demNode.box.min.x + u * boxSize.x;
						let y = demNode.box.min.y + v * boxSize.y;

						let ix = this.tileSize * (x - projectedBox.min.x) / projectedBoxSize.x;
						let iy = this.tileSize * (y - projectedBox.min.y) / projectedBoxSize.y;

						if(ix < 0 || ix > this.tileSize)
						{
							continue;
						}

						if(iy < 0 || iy > this.tileSize)
						{
							continue;
						}

						ix = Math.min(Math.floor(ix), this.tileSize - 1);
						iy = Math.min(Math.floor(iy), this.tileSize - 1);

						demNode.data[i + this.tileSize * j] = data[ix + this.tileSize * iy];
					}
				}

				demNode.createMipMap();
				demNode.mipMapNeedsUpdate = true;

				Potree.getDEMWorkerInstance().working = false;
			}

			// TODO only works somewhat if there is no rotation to the point cloud

			// let target = targetNodes[0];
			// target.data = new Float32Array(data);
			//
			//
			/// /node.dem = e.data.dem;
			//
			// Potree.getDEMWorkerInstance().working = false;
			//
			// { // create scene objects for debugging
			//	//for(let demNode of targetNodes){
			//		let bb = new Potree.Box3Helper(box);
			//		viewer.scene.scene.add(bb);
			//
			//		createDEMMesh(this, target);
			//	//}
			//
			// }
		};

		let position = node.geometryNode.geometry.attributes.position.array;
		let message = {
			boundingBox:
			{
				min: node.getBoundingBox().min.toArray(),
				max: node.getBoundingBox().max.toArray()
			},
			position: new Float32Array(position).buffer
		};
		let transferables = [message.position];
		Potree.getDEMWorkerInstance().working = true;
		Potree.getDEMWorkerInstance().postMessage(message, transferables);
	}
};

Potree.PointCloudTreeNode = class
{
	constructor()
	{
		this.needsTransformUpdate = true;
	}

	getChildren(){}

	getBoundingBox(){}

	isLoaded(){}

	isGeometryNode(){}

	isTreeNode(){}

	getLevel(){}

	getBoundingSphere(){}
};

Potree.PointCloudTree = class PointCloudTree extends THREE.Object3D
{
	constructor()
	{
		super();

		this.dem = new Potree.DEM(this);
	}

	initialized()
	{
		return this.root !== null;
	}
};

Potree.WorkerPool = class WorkerPool
{
	constructor()
	{
		this.workers = {};
	}

	getWorker(url)
	{
		if(!this.workers[url])
		{
			this.workers[url] = [];
		}

		if(this.workers[url].length === 0)
		{
			let worker = new Worker(url);
			this.workers[url].push(worker);
		}

		let worker = this.workers[url].pop();

		return worker;
	}

	returnWorker(url, worker)
	{
		this.workers[url].push(worker);
	}
};

Potree.workerPool = new Potree.WorkerPool();

/**
 * @class Loads mno files and returns a PointcloudOctree
 * for a description of the mno binary file format, read mnoFileFormat.txt
 *
 * @author Markus Schuetz
 */
Potree.POCLoader = function(){};

/**
 * @return a point cloud octree with the root node data loaded.
 * loading of descendants happens asynchronously when they"re needed
 *
 * @param url
 * @param loadingFinishedListener executed after loading the binary has been finished
 */
Potree.POCLoader.load = function load(url, callback)
{
	try
	{
		let pco = new Potree.PointCloudOctreeGeometry();
		pco.url = url;
		let xhr = Potree.XHRFactory.createXMLHttpRequest();
		xhr.open("GET", url, true);

		xhr.onreadystatechange = function()
		{
			if(xhr.readyState === 4 && (xhr.status === 200 || xhr.status === 0))
			{
				let fMno = JSON.parse(xhr.responseText);

				let version = new Potree.Version(fMno.version);

				// assume octreeDir is absolute if it starts with http
				if(fMno.octreeDir.indexOf("http") === 0)
				{
					pco.octreeDir = fMno.octreeDir;
				}
				else
				{
					pco.octreeDir = url + "/../" + fMno.octreeDir;
				}

				pco.spacing = fMno.spacing;
				pco.hierarchyStepSize = fMno.hierarchyStepSize;

				pco.pointAttributes = fMno.pointAttributes;

				let min = new THREE.Vector3(fMno.boundingBox.lx, fMno.boundingBox.ly, fMno.boundingBox.lz);
				let max = new THREE.Vector3(fMno.boundingBox.ux, fMno.boundingBox.uy, fMno.boundingBox.uz);
				let boundingBox = new THREE.Box3(min, max);
				let tightBoundingBox = boundingBox.clone();

				if(fMno.tightBoundingBox)
				{
					tightBoundingBox.min.copy(new THREE.Vector3(fMno.tightBoundingBox.lx, fMno.tightBoundingBox.ly, fMno.tightBoundingBox.lz));
					tightBoundingBox.max.copy(new THREE.Vector3(fMno.tightBoundingBox.ux, fMno.tightBoundingBox.uy, fMno.tightBoundingBox.uz));
				}

				let offset = min.clone();

				boundingBox.min.sub(offset);
				boundingBox.max.sub(offset);

				tightBoundingBox.min.sub(offset);
				tightBoundingBox.max.sub(offset);

				pco.projection = fMno.projection;
				pco.boundingBox = boundingBox;
				pco.tightBoundingBox = tightBoundingBox;
				pco.boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
				pco.tightBoundingSphere = tightBoundingBox.getBoundingSphere(new THREE.Sphere());
				pco.offset = offset;
				if(fMno.pointAttributes === "LAS")
				{
					pco.loader = new Potree.LasLazLoader(fMno.version);
				}
				else if(fMno.pointAttributes === "LAZ")
				{
					pco.loader = new Potree.LasLazLoader(fMno.version);
				}
				else
				{
					pco.loader = new Potree.BinaryLoader(fMno.version, boundingBox, fMno.scale);
					pco.pointAttributes = new Potree.PointAttributes(pco.pointAttributes);
				}

				let nodes = {};

				{ // load root
					let name = "r";

					let root = new Potree.PointCloudOctreeGeometryNode(name, pco, boundingBox);
					root.level = 0;
					root.hasChildren = true;
					root.spacing = pco.spacing;
					if(version.upTo("1.5"))
					{
						root.numPoints = fMno.hierarchy[0][1];
					}
					else
					{
						root.numPoints = 0;
					}
					pco.root = root;
					pco.root.load();
					nodes[name] = root;
				}

				// load remaining hierarchy
				if(version.upTo("1.4"))
				{
					for(let i = 1; i < fMno.hierarchy.length; i++)
					{
						let name = fMno.hierarchy[i][0];
						let numPoints = fMno.hierarchy[i][1];
						let index = parseInt(name.charAt(name.length - 1));
						let parentName = name.substring(0, name.length - 1);
						let parentNode = nodes[parentName];
						let level = name.length - 1;
						let boundingBox = Potree.POCLoader.createChildAABB(parentNode.boundingBox, index);

						let node = new Potree.PointCloudOctreeGeometryNode(name, pco, boundingBox);
						node.level = level;
						node.numPoints = numPoints;
						node.spacing = pco.spacing / Math.pow(2, level);
						parentNode.addChild(node);
						nodes[name] = node;
					}
				}

				pco.nodes = nodes;

				callback(pco);
			}
		};

		xhr.send(null);
	}
	catch(e)
	{
		console.log("loading failed: \"" + url + "\"");
		console.log(e);

		callback();
	}
};

Potree.POCLoader.loadPointAttributes = function(mno)
{
	let fpa = mno.pointAttributes;
	let pa = new Potree.PointAttributes();

	for(let i = 0; i < fpa.length; i++)
	{
		let pointAttribute = Potree.PointAttribute[fpa[i]];
		pa.add(pointAttribute);
	}

	return pa;
};

Potree.POCLoader.createChildAABB = function(aabb, index)
{
	let min = aabb.min.clone();
	let max = aabb.max.clone();
	let size = new THREE.Vector3().subVectors(max, min);

	if((index & 0b0001) > 0)
	{
		min.z += size.z / 2;
	}
	else
	{
		max.z -= size.z / 2;
	}

	if((index & 0b0010) > 0)
	{
		min.y += size.y / 2;
	}
	else
	{
		max.y -= size.y / 2;
	}

	if((index & 0b0100) > 0)
	{
		min.x += size.x / 2;
	}
	else
	{
		max.x -= size.x / 2;
	}

	return new THREE.Box3(min, max);
};

Potree.PointAttributeNames = {};

Potree.PointAttributeNames.POSITION_CARTESIAN = 0; // float x, y, z;
Potree.PointAttributeNames.COLOR_PACKED = 1; // byte r, g, b, a; 	I = [0,1]
Potree.PointAttributeNames.COLOR_FLOATS_1 = 2; // float r, g, b; 		I = [0,1]
Potree.PointAttributeNames.COLOR_FLOATS_255 = 3; // float r, g, b; 		I = [0,255]
Potree.PointAttributeNames.NORMAL_FLOATS = 4; // float x, y, z;
Potree.PointAttributeNames.FILLER = 5;
Potree.PointAttributeNames.INTENSITY = 6;
Potree.PointAttributeNames.CLASSIFICATION = 7;
Potree.PointAttributeNames.NORMAL_SPHEREMAPPED = 8;
Potree.PointAttributeNames.NORMAL_OCT16 = 9;
Potree.PointAttributeNames.NORMAL = 10;
Potree.PointAttributeNames.RETURN_NUMBER = 11;
Potree.PointAttributeNames.NUMBER_OF_RETURNS = 12;
Potree.PointAttributeNames.SOURCE_ID = 13;
Potree.PointAttributeNames.INDICES = 14;
Potree.PointAttributeNames.SPACING = 15;

/**
 * Some types of possible point attribute data formats
 *
 * @class
 */
Potree.PointAttributeTypes = {
	DATA_TYPE_DOUBLE:
	{
		ordinal: 0,
		size: 8
	},
	DATA_TYPE_FLOAT:
	{
		ordinal: 1,
		size: 4
	},
	DATA_TYPE_INT8:
	{
		ordinal: 2,
		size: 1
	},
	DATA_TYPE_UINT8:
	{
		ordinal: 3,
		size: 1
	},
	DATA_TYPE_INT16:
	{
		ordinal: 4,
		size: 2
	},
	DATA_TYPE_UINT16:
	{
		ordinal: 5,
		size: 2
	},
	DATA_TYPE_INT32:
	{
		ordinal: 6,
		size: 4
	},
	DATA_TYPE_UINT32:
	{
		ordinal: 7,
		size: 4
	},
	DATA_TYPE_INT64:
	{
		ordinal: 8,
		size: 8
	},
	DATA_TYPE_UINT64:
	{
		ordinal: 9,
		size: 8
	}
};

let i = 0;
for(let obj in Potree.PointAttributeTypes)
{
	Potree.PointAttributeTypes[i] = Potree.PointAttributeTypes[obj];
	i++;
}

/**
 * A single point attribute such as color/normal/.. and its data format/number of elements/...
 *
 * @class
 * @param name
 * @param type
 * @param size
 * @returns
 */
Potree.PointAttribute = function(name, type, numElements)
{
	this.name = name;
	this.type = type;
	this.numElements = numElements;
	this.byteSize = this.numElements * this.type.size;
};

Potree.PointAttribute.POSITION_CARTESIAN = new Potree.PointAttribute(
	Potree.PointAttributeNames.POSITION_CARTESIAN,
	Potree.PointAttributeTypes.DATA_TYPE_FLOAT, 3);

Potree.PointAttribute.RGBA_PACKED = new Potree.PointAttribute(
	Potree.PointAttributeNames.COLOR_PACKED,
	Potree.PointAttributeTypes.DATA_TYPE_INT8, 4);

Potree.PointAttribute.COLOR_PACKED = Potree.PointAttribute.RGBA_PACKED;

Potree.PointAttribute.RGB_PACKED = new Potree.PointAttribute(
	Potree.PointAttributeNames.COLOR_PACKED,
	Potree.PointAttributeTypes.DATA_TYPE_INT8, 3);

Potree.PointAttribute.NORMAL_FLOATS = new Potree.PointAttribute(
	Potree.PointAttributeNames.NORMAL_FLOATS,
	Potree.PointAttributeTypes.DATA_TYPE_FLOAT, 3);

Potree.PointAttribute.FILLER_1B = new Potree.PointAttribute(
	Potree.PointAttributeNames.FILLER,
	Potree.PointAttributeTypes.DATA_TYPE_UINT8, 1);

Potree.PointAttribute.INTENSITY = new Potree.PointAttribute(
	Potree.PointAttributeNames.INTENSITY,
	Potree.PointAttributeTypes.DATA_TYPE_UINT16, 1);

Potree.PointAttribute.CLASSIFICATION = new Potree.PointAttribute(
	Potree.PointAttributeNames.CLASSIFICATION,
	Potree.PointAttributeTypes.DATA_TYPE_UINT8, 1);

Potree.PointAttribute.NORMAL_SPHEREMAPPED = new Potree.PointAttribute(
	Potree.PointAttributeNames.NORMAL_SPHEREMAPPED,
	Potree.PointAttributeTypes.DATA_TYPE_UINT8, 2);

Potree.PointAttribute.NORMAL_OCT16 = new Potree.PointAttribute(
	Potree.PointAttributeNames.NORMAL_OCT16,
	Potree.PointAttributeTypes.DATA_TYPE_UINT8, 2);

Potree.PointAttribute.NORMAL = new Potree.PointAttribute(
	Potree.PointAttributeNames.NORMAL,
	Potree.PointAttributeTypes.DATA_TYPE_FLOAT, 3);

Potree.PointAttribute.RETURN_NUMBER = new Potree.PointAttribute(
	Potree.PointAttributeNames.RETURN_NUMBER,
	Potree.PointAttributeTypes.DATA_TYPE_UINT8, 1);

Potree.PointAttribute.NUMBER_OF_RETURNS = new Potree.PointAttribute(
	Potree.PointAttributeNames.NUMBER_OF_RETURNS,
	Potree.PointAttributeTypes.DATA_TYPE_UINT8, 1);

Potree.PointAttribute.SOURCE_ID = new Potree.PointAttribute(
	Potree.PointAttributeNames.SOURCE_ID,
	Potree.PointAttributeTypes.DATA_TYPE_UINT8, 1);

Potree.PointAttribute.INDICES = new Potree.PointAttribute(
	Potree.PointAttributeNames.INDICES,
	Potree.PointAttributeTypes.DATA_TYPE_UINT32, 1);

Potree.PointAttribute.SPACING = new Potree.PointAttribute(
	Potree.PointAttributeNames.SPACING,
	Potree.PointAttributeTypes.DATA_TYPE_FLOAT, 1);

/**
 * Ordered list of PointAttributes used to identify how points are aligned in a buffer.
 *
 * @class
 *
 */
Potree.PointAttributes = function(pointAttributes)
{
	this.attributes = [];
	this.byteSize = 0;
	this.size = 0;

	if(pointAttributes != null)
	{
		for(let i = 0; i < pointAttributes.length; i++)
		{
			let pointAttributeName = pointAttributes[i];
			let pointAttribute = Potree.PointAttribute[pointAttributeName];
			this.attributes.push(pointAttribute);
			this.byteSize += pointAttribute.byteSize;
			this.size++;
		}
	}
};

Potree.PointAttributes.prototype.add = function(pointAttribute)
{
	this.attributes.push(pointAttribute);
	this.byteSize += pointAttribute.byteSize;
	this.size++;
};

Potree.PointAttributes.prototype.hasColors = function()
{
	for(let name in this.attributes)
	{
		let pointAttribute = this.attributes[name];
		if(pointAttribute.name === Potree.PointAttributeNames.COLOR_PACKED)
		{
			return true;
		}
	}

	return false;
};

Potree.PointAttributes.prototype.hasNormals = function()
{
	for(let name in this.attributes)
	{
		let pointAttribute = this.attributes[name];
		if(
			pointAttribute === Potree.PointAttribute.NORMAL_SPHEREMAPPED ||
			pointAttribute === Potree.PointAttribute.NORMAL_FLOATS ||
			pointAttribute === Potree.PointAttribute.NORMAL ||
			pointAttribute === Potree.PointAttribute.NORMAL_OCT16)
		{
			return true;
		}
	}

	return false;
};

Potree.BinaryLoader = class BinaryLoader
{

	constructor(version, boundingBox, scale)
	{
		if(typeof(version) === "string")
		{
			this.version = new Potree.Version(version);
		}
		else
		{
			this.version = version;
		}

		this.boundingBox = boundingBox;
		this.scale = scale;
	}

	load(node)
	{
		if(node.loaded)
		{
			return;
		}

		let url = node.getURL();

		if(this.version.equalOrHigher("1.4"))
		{
			url += ".bin";
		}

		let xhr = Potree.XHRFactory.createXMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";
		xhr.overrideMimeType("text/plain; charset=x-user-defined");
		xhr.onreadystatechange = () =>
		{
			if(xhr.readyState === 4)
			{
				if((xhr.status === 200 || xhr.status === 0) && xhr.response !== null)
				{
					let buffer = xhr.response;
					this.parse(node, buffer);
				}
				else
				{
					throw new Error(`Failed to load file! HTTP status: ${xhr.status}, file: ${url}`);
				}
			}
		};

		try
		{
			xhr.send(null);
		}
		catch(e)
		{
			console.log("fehler beim laden der punktwolke: " + e);
		}
	};

	parse(node, buffer)
	{
		let pointAttributes = node.pcoGeometry.pointAttributes;
		let numPoints = buffer.byteLength / node.pcoGeometry.pointAttributes.byteSize;

		if(this.version.upTo("1.5"))
		{
			node.numPoints = numPoints;
		}

		let workerPath = Potree.scriptPath + "/workers/BinaryDecoderWorker.js";
		let worker = Potree.workerPool.getWorker(workerPath);

		worker.onmessage = function(e)
		{

			let data = e.data;
			let buffers = data.attributeBuffers;
			let tightBoundingBox = new THREE.Box3(
				new THREE.Vector3().fromArray(data.tightBoundingBox.min),
				new THREE.Vector3().fromArray(data.tightBoundingBox.max)
			);

			Potree.workerPool.returnWorker(workerPath, worker);

			let geometry = new THREE.BufferGeometry();

			for(let property in buffers)
			{
				let buffer = buffers[property].buffer;

				if(parseInt(property) === Potree.PointAttributeNames.POSITION_CARTESIAN)
				{
					geometry.addAttribute("position", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.COLOR_PACKED)
				{
					geometry.addAttribute("color", new THREE.BufferAttribute(new Uint8Array(buffer), 4, true));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.INTENSITY)
				{
					geometry.addAttribute("intensity", new THREE.BufferAttribute(new Float32Array(buffer), 1));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.CLASSIFICATION)
				{
					geometry.addAttribute("classification", new THREE.BufferAttribute(new Uint8Array(buffer), 1));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.NORMAL_SPHEREMAPPED)
				{
					geometry.addAttribute("normal", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.NORMAL_OCT16)
				{
					geometry.addAttribute("normal", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.NORMAL)
				{
					geometry.addAttribute("normal", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.INDICES)
				{
					let bufferAttribute = new THREE.BufferAttribute(new Uint8Array(buffer), 4);
					bufferAttribute.normalized = true;
					geometry.addAttribute("indices", bufferAttribute);
				}
				else if(parseInt(property) === Potree.PointAttributeNames.SPACING)
				{
					let bufferAttribute = new THREE.BufferAttribute(new Float32Array(buffer), 1);
					geometry.addAttribute("spacing", bufferAttribute);
				}
			}

			tightBoundingBox.max.sub(tightBoundingBox.min);
			tightBoundingBox.min.set(0, 0, 0);

			let numPoints = e.data.buffer.byteLength / pointAttributes.byteSize;

			node.numPoints = numPoints;
			node.geometry = geometry;
			node.mean = new THREE.Vector3(...data.mean);
			node.tightBoundingBox = tightBoundingBox;
			node.loaded = true;
			node.loading = false;
			node.estimatedSpacing = data.estimatedSpacing;
			Potree.numNodesLoading--;
		};

		let message = {
			buffer: buffer,
			pointAttributes: pointAttributes,
			version: this.version.version,
			min: [node.boundingBox.min.x, node.boundingBox.min.y, node.boundingBox.min.z],
			offset: [node.pcoGeometry.offset.x, node.pcoGeometry.offset.y, node.pcoGeometry.offset.z],
			scale: this.scale,
			spacing: node.spacing,
			hasChildren: node.hasChildren,
			name: node.name
		};
		worker.postMessage(message, [message.buffer]);
	};

};

Potree.GreyhoundBinaryLoader = class
{

	constructor(version, boundingBox, scale)
	{
		if(typeof(version) === "string")
		{
			this.version = new Potree.Version(version);
		}
		else
		{
			this.version = version;
		}

		this.boundingBox = boundingBox;
		this.scale = scale;
	}

	load(node)
	{
		if(node.loaded) return;

		let scope = this;
		let url = node.getURL();

		let xhr = Potree.XHRFactory.createXMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";
		xhr.overrideMimeType("text/plain; charset=x-user-defined");

		xhr.onreadystatechange = function()
		{
			if(xhr.readyState === 4)
			{
				if(xhr.status === 200 || xhr.status === 0)
				{
					let buffer = xhr.response;
					scope.parse(node, buffer);
				}
				else
				{
					console.log(
						"Failed to load file! HTTP status:", xhr.status,
						"file:", url);
				}
			}
		};

		try
		{
			xhr.send(null);
		}
		catch(e)
		{
			console.log("error loading point cloud: " + e);
		}
	}

	parse(node, buffer)
	{
		let NUM_POINTS_BYTES = 4;

		let view = new DataView(
			buffer, buffer.byteLength - NUM_POINTS_BYTES, NUM_POINTS_BYTES);
		let numPoints = view.getUint32(0, true);
		let pointAttributes = node.pcoGeometry.pointAttributes;

		node.numPoints = numPoints;

		let workerPath = Potree.scriptPath + "/workers/GreyhoundBinaryDecoderWorker.js";
		let worker = Potree.workerPool.getWorker(workerPath);

		worker.onmessage = function(e)
		{

			let data = e.data;
			let buffers = data.attributeBuffers;
			let tightBoundingBox = new THREE.Box3(
				new THREE.Vector3().fromArray(data.tightBoundingBox.min),
				new THREE.Vector3().fromArray(data.tightBoundingBox.max)
			);

			Potree.workerPool.returnWorker(workerPath, worker);

			let geometry = new THREE.BufferGeometry();

			for(let property in buffers)
			{
				let buffer = buffers[property].buffer;

				if(parseInt(property) === Potree.PointAttributeNames.POSITION_CARTESIAN)
				{
					geometry.addAttribute("position", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.COLOR_PACKED)
				{
					geometry.addAttribute("color", new THREE.BufferAttribute(new Uint8Array(buffer), 4, true));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.INTENSITY)
				{
					geometry.addAttribute("intensity", new THREE.BufferAttribute(new Float32Array(buffer), 1));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.CLASSIFICATION)
				{
					geometry.addAttribute("classification", new THREE.BufferAttribute(new Uint8Array(buffer), 1));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.NORMAL_SPHEREMAPPED)
				{
					geometry.addAttribute("normal", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.NORMAL_OCT16)
				{
					geometry.addAttribute("normal", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.NORMAL)
				{
					geometry.addAttribute("normal", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.INDICES)
				{
					let bufferAttribute = new THREE.BufferAttribute(new Uint8Array(buffer), 4);
					bufferAttribute.normalized = true;
					geometry.addAttribute("indices", bufferAttribute);
				}
				else if(parseInt(property) === Potree.PointAttributeNames.SPACING)
				{
					let bufferAttribute = new THREE.BufferAttribute(new Float32Array(buffer), 1);
					geometry.addAttribute("spacing", bufferAttribute);
				}
			}

			tightBoundingBox.max.sub(tightBoundingBox.min);
			tightBoundingBox.min.set(0, 0, 0);

			node.numPoints = data.numPoints;
			node.geometry = geometry;
			node.mean = new THREE.Vector3(...data.mean);
			node.tightBoundingBox = tightBoundingBox;
			node.loaded = true;
			node.loading = false;
			Potree.numNodesLoading--;
		};

		let bb = node.boundingBox;
		let nodeOffset = node.pcoGeometry.boundingBox.getCenter().sub(node.boundingBox.min);

		let message = {
			buffer: buffer,
			pointAttributes: pointAttributes,
			version: this.version.version,
			schema: node.pcoGeometry.schema,
			min: [bb.min.x, bb.min.y, bb.min.z],
			max: [bb.max.x, bb.max.y, bb.max.z],
			offset: nodeOffset.toArray(),
			scale: this.scale,
			normalize: node.pcoGeometry.normalize
		};

		worker.postMessage(message, [message.buffer]);
	}
}

/**
 * @class Loads greyhound metadata and returns a PointcloudOctree
 *
 * @author Maarten van Meersbergen
 * @author Oscar Martinez Rubi
 * @author Connor Manning
 */

class GreyhoundUtils
{
	static getQueryParam(name)
	{
		name = name.replace(/[[\]]/g, "\\$&");
		let regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)");
		let results = regex.exec(window.location.href);
		if(!results) return null;
		if(!results[2]) return "";
		return decodeURIComponent(results[2].replace(/\+/g, " "));
	}

	static createSchema(attributes)
	{
		let schema = [
			{
				"name": "X",
				"size": 4,
				"type": "signed"
			},
			{
				"name": "Y",
				"size": 4,
				"type": "signed"
			},
			{
				"name": "Z",
				"size": 4,
				"type": "signed"
			}
		];

		// Once we include options in the UI to load a dynamic list of available
		// attributes for visualization (f.e. Classification, Intensity etc.)
		// we will be able to ask for that specific attribute from the server,
		// where we are now requesting all attributes for all points all the time.
		// If we do that though, we also need to tell Potree to redraw the points
		// that are already loaded (with different attributes).
		// This is not default behaviour.
		attributes.forEach(function(item)
		{
			if(item === "COLOR_PACKED")
			{
				schema.push(
				{
					"name": "Red",
					"size": 2,
					"type": "unsigned"
				});
				schema.push(
				{
					"name": "Green",
					"size": 2,
					"type": "unsigned"
				});
				schema.push(
				{
					"name": "Blue",
					"size": 2,
					"type": "unsigned"
				});
			}
			else if(item === "INTENSITY")
			{
				schema.push(
				{
					"name": "Intensity",
					"size": 2,
					"type": "unsigned"
				});
			}
			else if(item === "CLASSIFICATION")
			{
				schema.push(
				{
					"name": "Classification",
					"size": 1,
					"type": "unsigned"
				});
			}
		});

		return schema;
	}

	static fetch(url, cb)
	{
		let xhr = Potree.XHRFactory.createXMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.onreadystatechange = function()
		{
			if(xhr.readyState === 4)
			{
				if(xhr.status === 200 || xhr.status === 0)
				{
					cb(null, xhr.responseText);
				}
				else
				{
					cb(xhr.responseText);
				}
			}
		};
		xhr.send(null);
	};

	static fetchBinary(url, cb)
	{
		let xhr = Potree.XHRFactory.createXMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";
		xhr.onreadystatechange = function()
		{
			if(xhr.readyState === 4)
			{
				if(xhr.status === 200 || xhr.status === 0)
				{
					cb(null, xhr.response);
				}
				else
				{
					cb(xhr.responseText);
				}
			}
		};
		xhr.send(null);
	};

	static pointSizeFrom(schema)
	{
		return schema.reduce((p, c) => p + c.size, 0);
	};

	static getNormalization(serverURL, baseDepth, cb)
	{
		let s = [
			{
				"name": "X",
				"size": 4,
				"type": "floating"
			},
			{
				"name": "Y",
				"size": 4,
				"type": "floating"
			},
			{
				"name": "Z",
				"size": 4,
				"type": "floating"
			},
			{
				"name": "Red",
				"size": 2,
				"type": "unsigned"
			},
			{
				"name": "Green",
				"size": 2,
				"type": "unsigned"
			},
			{
				"name": "Blue",
				"size": 2,
				"type": "unsigned"
			},
			{
				"name": "Intensity",
				"size": 2,
				"type": "unsigned"
			}
		];

		let url = serverURL + "read?depth=" + baseDepth +
			"&schema=" + JSON.stringify(s);

		GreyhoundUtils.fetchBinary(url, function(err, buffer)
		{
			if(err) throw new Error(err);

			let view = new DataView(buffer);
			let numBytes = buffer.byteLength - 4;
			// TODO Unused: let numPoints = view.getUint32(numBytes, true);
			let pointSize = GreyhoundUtils.pointSizeFrom(s);

			let colorNorm = false;
			let intensityNorm = false;

			for(let offset = 0; offset < numBytes; offset += pointSize)
			{
				if(view.getUint16(offset + 12, true) > 255 ||
					view.getUint16(offset + 14, true) > 255 ||
					view.getUint16(offset + 16, true) > 255)
				{
					colorNorm = true;
				}

				if(view.getUint16(offset + 18, true) > 255)
				{
					intensityNorm = true;
				}

				if(colorNorm && intensityNorm) break;
			}

			if(colorNorm) console.log("Normalizing color");
			if(intensityNorm) console.log("Normalizing intensity");

			cb(null,
			{
				color: colorNorm,
				intensity: intensityNorm
			});
		});
	};
};

Potree.GreyhoundLoader = function() {};
Potree.GreyhoundLoader.loadInfoJSON = function load(url, callback)
{};

/**
 * @return a point cloud octree with the root node data loaded.
 * loading of descendants happens asynchronously when they"re needed
 *
 * @param url
 * @param loadingFinishedListener executed after loading the binary has been
 * finished
 */
Potree.GreyhoundLoader.load = function load(url, callback)
{
	let HIERARCHY_STEP_SIZE = 5;

	try
	{
		// We assume everything ater the string "greyhound://" is the server url
		let serverURL = url.split("greyhound://")[1];
		if(serverURL.split("http://").length === 1 && serverURL.split("https://").length === 1)
		{
			serverURL = "http://" + serverURL;
		}

		GreyhoundUtils.fetch(serverURL + "info", function(err, data)
		{
			if(err) throw new Error(err);

			/* We parse the result of the info query, which should be a JSON
			 * datastructure somewhat like:
			{
			  "bounds": [635577, 848882, -1000, 639004, 853538, 2000],
			  "numPoints": 10653336,
			  "schema": [
			      { "name": "X", "size": 8, "type": "floating" },
			      { "name": "Y", "size": 8, "type": "floating" },
			      { "name": "Z", "size": 8, "type": "floating" },
			      { "name": "Intensity", "size": 2, "type": "unsigned" },
			      { "name": "OriginId", "size": 4, "type": "unsigned" },
			      { "name": "Red", "size": 2, "type": "unsigned" },
			      { "name": "Green", "size": 2, "type": "unsigned" },
			      { "name": "Blue", "size": 2, "type": "unsigned" }
			  ],
			  "srs": "<omitted for brevity>",
			  "type": "octree"
			}
			*/
			let greyhoundInfo = JSON.parse(data);
			let version = new Potree.Version("1.4");

			let bounds = greyhoundInfo.bounds;
			// TODO Unused: let boundsConforming = greyhoundInfo.boundsConforming;

			// TODO Unused: let width = bounds[3] - bounds[0];
			// TODO Unused: let depth = bounds[4] - bounds[1];
			// TODO Unused: let height = bounds[5] - bounds[2];
			// TODO Unused: let radius = width / 2;
			let scale = greyhoundInfo.scale || 0.01;
			if(Array.isArray(scale))
			{
				scale = Math.min(scale[0], scale[1], scale[2]);
			}

			if(GreyhoundUtils.getQueryParam("scale"))
			{
				scale = parseFloat(GreyhoundUtils.getQueryParam("scale"));
			}

			let baseDepth = Math.max(8, greyhoundInfo.baseDepth);

			// Ideally we want to change this bit completely, since
			// greyhound"s options are wider than the default options for
			// visualizing pointclouds. If someone ever has time to build a
			// custom ui element for greyhound, the schema options from
			// this info request should be given to the UI, so the user can
			// choose between them. The selected option can then be
			// directly requested from the server in the
			// PointCloudGreyhoundGeometryNode without asking for
			// attributes that we are not currently visualizing.  We assume
			// XYZ are always available.
			let attributes = ["POSITION_CARTESIAN"];

			// To be careful, we only add COLOR_PACKED as an option if all
			// colors are actually found.
			let red = false;
			let green = false;
			let blue = false;

			greyhoundInfo.schema.forEach(function(entry)
			{
				// Intensity and Classification are optional.
				if(entry.name === "Intensity")
				{
					attributes.push("INTENSITY");
				}
				if(entry.name === "Classification")
				{
					attributes.push("CLASSIFICATION");
				}

				if(entry.name === "Red") red = true;
				else if(entry.name === "Green") green = true;
				else if(entry.name === "Blue") blue = true;
			});

			if(red && green && blue) attributes.push("COLOR_PACKED");

			// Fill in geometry fields.
			let pgg = new Potree.PointCloudGreyhoundGeometry();
			pgg.serverURL = serverURL;
			pgg.spacing = (bounds[3] - bounds[0]) / Math.pow(2, baseDepth);
			pgg.baseDepth = baseDepth;
			pgg.hierarchyStepSize = HIERARCHY_STEP_SIZE;

			pgg.schema = GreyhoundUtils.createSchema(attributes);
			let pointSize = GreyhoundUtils.pointSizeFrom(pgg.schema);

			pgg.pointAttributes = new Potree.PointAttributes(attributes);
			pgg.pointAttributes.byteSize = pointSize;

			let boundingBox = new THREE.Box3(
				new THREE.Vector3().fromArray(bounds, 0),
				new THREE.Vector3().fromArray(bounds, 3)
			);

			let offset = boundingBox.min.clone();

			boundingBox.max.sub(boundingBox.min);
			boundingBox.min.set(0, 0, 0);

			pgg.projection = greyhoundInfo.srs;
			pgg.boundingBox = boundingBox;
			pgg.boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());

			pgg.scale = scale;
			pgg.offset = offset;

			console.log("Scale:", scale);
			console.log("Offset:", offset);
			console.log("Bounds:", boundingBox);

			pgg.loader = new Potree.GreyhoundBinaryLoader(version, boundingBox, pgg.scale);

			let nodes = {};

			{ // load root
				let name = "r";

				let root = new Potree.PointCloudGreyhoundGeometryNode(
					name, pgg, boundingBox,
					scale, offset
				);

				root.level = 0;
				root.hasChildren = true;
				root.numPoints = greyhoundInfo.numPoints;
				root.spacing = pgg.spacing;
				pgg.root = root;
				pgg.root.load();
				nodes[name] = root;
			}

			pgg.nodes = nodes;

			GreyhoundUtils.getNormalization(serverURL, greyhoundInfo.baseDepth,
				function(_, normalize)
				{
					if(normalize.color) pgg.normalize.color = true;
					if(normalize.intensity) pgg.normalize.intensity = true;

					callback(pgg);
				}
			);
		});
	}
	catch(e)
	{
		console.log("loading failed: \"" + url + "\"");
		console.log(e);
		callback();
	}
};

Potree.GreyhoundLoader.loadPointAttributes = function(mno)
{
	let fpa = mno.pointAttributes;
	let pa = new Potree.PointAttributes();

	for(let i = 0; i < fpa.length; i++)
	{
		let pointAttribute = Potree.PointAttribute[fpa[i]];
		pa.add(pointAttribute);
	}

	return pa;
};

Potree.GreyhoundLoader.createChildAABB = function(aabb, childIndex)
{
	let min = aabb.min;
	let max = aabb.max;
	let dHalfLength = new THREE.Vector3().copy(max).sub(min).multiplyScalar(0.5);
	let xHalfLength = new THREE.Vector3(dHalfLength.x, 0, 0);
	let yHalfLength = new THREE.Vector3(0, dHalfLength.y, 0);
	let zHalfLength = new THREE.Vector3(0, 0, dHalfLength.z);

	let cmin = min;
	let cmax = new THREE.Vector3().add(min).add(dHalfLength);

	if(childIndex === 1)
	{
		min = new THREE.Vector3().copy(cmin).add(zHalfLength);
		max = new THREE.Vector3().copy(cmax).add(zHalfLength);
	}
	else if(childIndex === 3)
	{
		min = new THREE.Vector3().copy(cmin).add(zHalfLength).add(yHalfLength);
		max = new THREE.Vector3().copy(cmax).add(zHalfLength).add(yHalfLength);
	}
	else if(childIndex === 0)
	{
		min = cmin;
		max = cmax;
	}
	else if(childIndex === 2)
	{
		min = new THREE.Vector3().copy(cmin).add(yHalfLength);
		max = new THREE.Vector3().copy(cmax).add(yHalfLength);
	}
	else if(childIndex === 5)
	{
		min = new THREE.Vector3().copy(cmin).add(zHalfLength).add(xHalfLength);
		max = new THREE.Vector3().copy(cmax).add(zHalfLength).add(xHalfLength);
	}
	else if(childIndex === 7)
	{
		min = new THREE.Vector3().copy(cmin).add(dHalfLength);
		max = new THREE.Vector3().copy(cmax).add(dHalfLength);
	}
	else if(childIndex === 4)
	{
		min = new THREE.Vector3().copy(cmin).add(xHalfLength);
		max = new THREE.Vector3().copy(cmax).add(xHalfLength);
	}
	else if(childIndex === 6)
	{
		min = new THREE.Vector3().copy(cmin).add(xHalfLength).add(yHalfLength);
		max = new THREE.Vector3().copy(cmax).add(xHalfLength).add(yHalfLength);
	}

	return new THREE.Box3(min, max);
};

/**
 * laslaz code taken and adapted from plas.io js-laslaz
 *	http://plas.io/
 *  https://github.com/verma/plasio
 *
 * Thanks to Uday Verma and Howard Butler
 *
 */

Potree.LasLazLoader = class LasLazLoader
{
	constructor(version)
	{
		if(typeof(version) === "string")
		{
			this.version = new Potree.Version(version);
		}
		else
		{
			this.version = version;
		}
	}

	static progressCB()
	{}

	load(node)
	{
		if(node.loaded)
		{
			return;
		}

		let pointAttributes = node.pcoGeometry.pointAttributes;

		let url = node.getURL();

		if(this.version.equalOrHigher("1.4"))
		{
			url += "." + pointAttributes.toLowerCase();
		}

		let xhr = Potree.XHRFactory.createXMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";
		xhr.overrideMimeType("text/plain; charset=x-user-defined");
		xhr.onreadystatechange = () =>
		{
			if(xhr.readyState === 4)
			{
				if(xhr.status === 200)
				{
					let buffer = xhr.response;
					this.parse(node, buffer);
				}
				else
				{
					console.log("Failed to load file! HTTP status: " + xhr.status + ", file: " + url);
				}
			}
		};

		xhr.send(null);
	}

	parse(node, buffer)
	{
		let lf = new LASFile(buffer);
		let handler = new Potree.LasLazBatcher(node);

		//
		// DEBUG
		//
		// invoke the laz decompress worker thousands of times to check for memory leaks
		// until 2018/03/05, it tended to run out of memory at ~6230 invocations
		// 
		//
		//lf.open()
		//.then( msg => {
		//	lf.isOpen = true;
		//	return lf;
		//}).catch( msg => {
		//	console.log("failed to open file. :(");	
		//}).then( lf => {
		//	return lf.getHeader().then(function (h) {
		//		return [lf, h];
		//	});
		//}).then( v => {
		//	let lf = v[0];
		//	let header = v[1];

		//	lf.readData(1000000, 0, 1)
		//	.then( v => {
		//		console.log("read");

		//		this.parse(node, buffer);
		//	}).then (v => {
		//		lf.close();	
		//	});

		//})

		lf.open()
			.then(msg =>
			{
				lf.isOpen = true;
				return lf;
			}).catch(msg =>
			{
				console.log("failed to open file. :(");
			}).then(lf =>
			{
				return lf.getHeader().then(function(h)
				{
					return [lf, h];
				});
			}).then(v =>
			{
				let lf = v[0];
				let header = v[1];

				let skip = 1;
				let totalRead = 0;
				let totalToRead = (skip <= 1 ? header.pointsCount : header.pointsCount / skip);
				let reader = function()
				{
					let p = lf.readData(1000000, 0, skip);
					return p.then(function(data)
					{
						handler.push(new LASDecoder(data.buffer,
							header.pointsFormatId,
							header.pointsStructSize,
							data.count,
							header.scale,
							header.offset,
							header.mins, header.maxs));

						totalRead += data.count;
						Potree.LasLazLoader.progressCB(totalRead / totalToRead);

						if(data.hasMoreData)
						{
							return reader();
						}
						else
						{
							header.totalRead = totalRead;
							header.versionAsString = lf.versionAsString;
							header.isCompressed = lf.isCompressed;
							return [lf, header, handler];
						}
					});
				};

				return reader();
			}).then(v =>
			{
				let lf = v[0];
				// we"re done loading this file
				//
				Potree.LasLazLoader.progressCB(1);

				// Close it
				return lf.close().then(function()
				{
					lf.isOpen = false;

					return v.slice(1);
				}).catch(e =>
				{
					// If there was a cancellation, make sure the file is closed, if the file is open
					// close and then fail
					if(lf.isOpen)
					{
						return lf.close().then(function()
						{
							lf.isOpen = false;
							throw e;
						});
					}
					throw e;
				});
			});
	}

	handle(node, url)
	{

	}
};

Potree.LasLazBatcher = class LasLazBatcher
{
	constructor(node)
	{
		this.node = node;
	}

	push(lasBuffer)
	{
		let workerPath = Potree.scriptPath + "/workers/LASDecoderWorker.js";
		let worker = Potree.workerPool.getWorker(workerPath);
		let node = this.node;

		worker.onmessage = (e) =>
		{
			let geometry = new THREE.BufferGeometry();
			let numPoints = lasBuffer.pointsCount;

			let positions = new Float32Array(e.data.position);
			let colors = new Uint8Array(e.data.color);
			let intensities = new Float32Array(e.data.intensity);
			let classifications = new Uint8Array(e.data.classification);
			let returnNumbers = new Uint8Array(e.data.returnNumber);
			let numberOfReturns = new Uint8Array(e.data.numberOfReturns);
			let pointSourceIDs = new Uint16Array(e.data.pointSourceID);
			let indices = new Uint8Array(e.data.indices);

			geometry.addAttribute("position", new THREE.BufferAttribute(positions, 3));
			geometry.addAttribute("color", new THREE.BufferAttribute(colors, 4, true));
			geometry.addAttribute("intensity", new THREE.BufferAttribute(intensities, 1));
			geometry.addAttribute("classification", new THREE.BufferAttribute(classifications, 1));
			geometry.addAttribute("returnNumber", new THREE.BufferAttribute(returnNumbers, 1));
			geometry.addAttribute("numberOfReturns", new THREE.BufferAttribute(numberOfReturns, 1));
			geometry.addAttribute("pointSourceID", new THREE.BufferAttribute(pointSourceIDs, 1));
			//geometry.addAttribute("normal", new THREE.BufferAttribute(new Float32Array(numPoints * 3), 3));
			geometry.addAttribute("indices", new THREE.BufferAttribute(indices, 4));
			geometry.attributes.indices.normalized = true;

			let tightBoundingBox = new THREE.Box3(
				new THREE.Vector3().fromArray(e.data.tightBoundingBox.min),
				new THREE.Vector3().fromArray(e.data.tightBoundingBox.max)
			);

			geometry.boundingBox = this.node.boundingBox;
			this.node.tightBoundingBox = tightBoundingBox;

			this.node.geometry = geometry;
			this.node.numPoints = numPoints;
			this.node.loaded = true;
			this.node.loading = false;
			Potree.numNodesLoading--;
			this.node.mean = new THREE.Vector3(...e.data.mean);

			//debugger;

			Potree.workerPool.returnWorker(workerPath, worker);
		};

		let message = {
			buffer: lasBuffer.arrayb,
			numPoints: lasBuffer.pointsCount,
			pointSize: lasBuffer.pointSize,
			pointFormatID: 2,
			scale: lasBuffer.scale,
			offset: lasBuffer.offset,
			mins: lasBuffer.mins,
			maxs: lasBuffer.maxs
		};
		worker.postMessage(message, [message.buffer]);
	};
};

//
//
//
// how to calculate the radius of a projected sphere in screen space
// http://stackoverflow.com/questions/21648630/radius-of-projected-sphere-in-screen-space
// http://stackoverflow.com/questions/3717226/radius-of-projected-sphere
//

//
// to get a ready to use gradient array from a chroma.js gradient:
// http://gka.github.io/chroma.js/
//
// let stops = [];
// for(let i = 0; i <= 10; i++){
//	let range = chroma.scale(["yellow", "navy"]).mode("lch").domain([10,0])(i)._rgb
//		.slice(0, 3)
//		.map(v => (v / 255).toFixed(4))
//		.join(", ");
//
//	let line = `[${i / 10}, new THREE.Color(${range})],`;
//
//	stops.push(line);
// }
// stops.join("\n");

// to get a ready to use gradient array from matplotlib:
// import matplotlib.pyplot as plt
// import matplotlib.colors as colors
//
// norm = colors.Normalize(vmin=0,vmax=1)
// cmap = plt.cm.viridis
//
// for i in range(0,11):
//    u = i / 10
//    rgb = cmap(norm(u))[0:3]
//    rgb = ["{0:.3f}".format(v) for v in rgb]
//    rgb = "[" + str(u) + ", new THREE.Color(" +  ", ".join(rgb) + ")],"
//    print(rgb)

Potree.Gradients = {
	RAINBOW: [
		[0, new THREE.Color(0.278, 0, 0.714)],
		[1 / 6, new THREE.Color(0, 0, 1)],
		[2 / 6, new THREE.Color(0, 1, 1)],
		[3 / 6, new THREE.Color(0, 1, 0)],
		[4 / 6, new THREE.Color(1, 1, 0)],
		[5 / 6, new THREE.Color(1, 0.64, 0)],
		[1, new THREE.Color(1, 0, 0)]
	],
	// From chroma spectral http://gka.github.io/chroma.js/
	SPECTRAL: [
		[0, new THREE.Color(0.3686, 0.3098, 0.6353)],
		[0.1, new THREE.Color(0.1961, 0.5333, 0.7412)],
		[0.2, new THREE.Color(0.4000, 0.7608, 0.6471)],
		[0.3, new THREE.Color(0.6706, 0.8667, 0.6431)],
		[0.4, new THREE.Color(0.9020, 0.9608, 0.5961)],
		[0.5, new THREE.Color(1.0000, 1.0000, 0.7490)],
		[0.6, new THREE.Color(0.9961, 0.8784, 0.5451)],
		[0.7, new THREE.Color(0.9922, 0.6824, 0.3804)],
		[0.8, new THREE.Color(0.9569, 0.4275, 0.2627)],
		[0.9, new THREE.Color(0.8353, 0.2431, 0.3098)],
		[1, new THREE.Color(0.6196, 0.0039, 0.2588)]
	],
	PLASMA: [
		[0.0, new THREE.Color(0.241, 0.015, 0.610)],
		[0.1, new THREE.Color(0.387, 0.001, 0.654)],
		[0.2, new THREE.Color(0.524, 0.025, 0.653)],
		[0.3, new THREE.Color(0.651, 0.125, 0.596)],
		[0.4, new THREE.Color(0.752, 0.227, 0.513)],
		[0.5, new THREE.Color(0.837, 0.329, 0.431)],
		[0.6, new THREE.Color(0.907, 0.435, 0.353)],
		[0.7, new THREE.Color(0.963, 0.554, 0.272)],
		[0.8, new THREE.Color(0.992, 0.681, 0.195)],
		[0.9, new THREE.Color(0.987, 0.822, 0.144)],
		[1.0, new THREE.Color(0.940, 0.975, 0.131)]
	],
	YELLOW_GREEN: [
		[0, new THREE.Color(0.1647, 0.2824, 0.3451)],
		[0.1, new THREE.Color(0.1338, 0.3555, 0.4227)],
		[0.2, new THREE.Color(0.0610, 0.4319, 0.4864)],
		[0.3, new THREE.Color(0.0000, 0.5099, 0.5319)],
		[0.4, new THREE.Color(0.0000, 0.5881, 0.5569)],
		[0.5, new THREE.Color(0.1370, 0.6650, 0.5614)],
		[0.6, new THREE.Color(0.2906, 0.7395, 0.5477)],
		[0.7, new THREE.Color(0.4453, 0.8099, 0.5201)],
		[0.8, new THREE.Color(0.6102, 0.8748, 0.4850)],
		[0.9, new THREE.Color(0.7883, 0.9323, 0.4514)],
		[1, new THREE.Color(0.9804, 0.9804, 0.4314)]
	],
	VIRIDIS: [
		[0.0, new THREE.Color(0.267, 0.005, 0.329)],
		[0.1, new THREE.Color(0.283, 0.141, 0.458)],
		[0.2, new THREE.Color(0.254, 0.265, 0.530)],
		[0.3, new THREE.Color(0.207, 0.372, 0.553)],
		[0.4, new THREE.Color(0.164, 0.471, 0.558)],
		[0.5, new THREE.Color(0.128, 0.567, 0.551)],
		[0.6, new THREE.Color(0.135, 0.659, 0.518)],
		[0.7, new THREE.Color(0.267, 0.749, 0.441)],
		[0.8, new THREE.Color(0.478, 0.821, 0.318)],
		[0.9, new THREE.Color(0.741, 0.873, 0.150)],
		[1.0, new THREE.Color(0.993, 0.906, 0.144)]
	],
	INFERNO: [
		[0.0, new THREE.Color(0.077, 0.042, 0.206)],
		[0.1, new THREE.Color(0.225, 0.036, 0.388)],
		[0.2, new THREE.Color(0.373, 0.074, 0.432)],
		[0.3, new THREE.Color(0.522, 0.128, 0.420)],
		[0.4, new THREE.Color(0.665, 0.182, 0.370)],
		[0.5, new THREE.Color(0.797, 0.255, 0.287)],
		[0.6, new THREE.Color(0.902, 0.364, 0.184)],
		[0.7, new THREE.Color(0.969, 0.516, 0.063)],
		[0.8, new THREE.Color(0.988, 0.683, 0.072)],
		[0.9, new THREE.Color(0.961, 0.859, 0.298)],
		[1.0, new THREE.Color(0.988, 0.998, 0.645)]
	],
	GRAYSCALE: [
		[0, new THREE.Color(0, 0, 0)],
		[1, new THREE.Color(1, 1, 1)]
	]
};

Potree.Classification = {
	"DEFAULT":
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
		"DEFAULT": new THREE.Vector4(0.3, 0.6, 0.6, 0.5)
	}
};

Potree.PointSizeType = {
	FIXED: 0,
	ATTENUATED: 1,
	ADAPTIVE: 2
};

Potree.PointShape = {
	SQUARE: 0,
	CIRCLE: 1,
	PARABOLOID: 2
};

Potree.PointColorType = {
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

Potree.TreeType = {
	OCTREE: 0,
	KDTREE: 1
};

/**
 *
 * @param node
 * @class an item in the lru list.
 */
function LRUItem(node)
{
	this.previous = null;
	this.next = null;
	this.node = node;
}

/**
 *
 * @class A doubly-linked-list of the least recently used elements.
 */
function LRU()
{
	// the least recently used item
	this.first = null;
	// the most recently used item
	this.last = null;
	// a list of all items in the lru list
	this.items = {};
	this.elements = 0;
	this.numPoints = 0;
}

/**
 * number of elements in the list
 *
 * @returns {Number}
 */
LRU.prototype.size = function()
{
	return this.elements;
};

LRU.prototype.contains = function(node)
{
	return this.items[node.id] == null;
};

/**
 * makes node the most recently used item. if the list does not contain node, it will be added.
 *
 * @param node
 */
LRU.prototype.touch = function(node)
{
	if(!node.loaded)
	{
		return;
	}

	let item;
	if(this.items[node.id] == null)
	{
		// add to list
		item = new LRUItem(node);
		item.previous = this.last;
		this.last = item;
		if(item.previous !== null)
		{
			item.previous.next = item;
		}

		this.items[node.id] = item;
		this.elements++;

		if(this.first === null)
		{
			this.first = item;
		}
		this.numPoints += node.numPoints;
	}
	else
	{
		// update in list
		item = this.items[node.id];
		if(item.previous === null)
		{
			// handle touch on first element
			if(item.next !== null)
			{
				this.first = item.next;
				this.first.previous = null;
				item.previous = this.last;
				item.next = null;
				this.last = item;
				item.previous.next = item;
			}
		}
		else if(item.next === null)
		{
			// handle touch on last element
		}
		else
		{
			// handle touch on any other element
			item.previous.next = item.next;
			item.next.previous = item.previous;
			item.previous = this.last;
			item.next = null;
			this.last = item;
			item.previous.next = item;
		}
	}
};

LRU.prototype.remove = function remove(node)
{
	let lruItem = this.items[node.id];
	if(lruItem)
	{
		if(this.elements === 1)
		{
			this.first = null;
			this.last = null;
		}
		else
		{
			if(!lruItem.previous)
			{
				this.first = lruItem.next;
				this.first.previous = null;
			}
			if(!lruItem.next)
			{
				this.last = lruItem.previous;
				this.last.next = null;
			}
			if(lruItem.previous && lruItem.next)
			{
				lruItem.previous.next = lruItem.next;
				lruItem.next.previous = lruItem.previous;
			}
		}

		delete this.items[node.id];
		this.elements--;
		this.numPoints -= node.numPoints;
	}
};

LRU.prototype.getLRUItem = function()
{
	if(this.first === null)
	{
		return null;
	}
	let lru = this.first;

	return lru.node;
};

LRU.prototype.toString = function()
{
	let string = "{ ";
	let curr = this.first;
	while(curr !== null)
	{
		string += curr.node.id;
		if(curr.next !== null)
		{
			string += ", ";
		}
		curr = curr.next;
	}
	string += "}";
	string += "(" + this.size() + ")";
	return string;
};

LRU.prototype.freeMemory = function()
{
	if(this.elements <= 1)
	{
		return;
	}

	while(this.numPoints > Potree.pointLoadLimit)
	{
		let element = this.first;
		let node = element.node;
		this.disposeDescendants(node);
	}
};

LRU.prototype.disposeDescendants = function(node)
{
	let stack = [];
	stack.push(node);
	while(stack.length > 0)
	{
		let current = stack.pop();

		// console.log(current);

		current.dispose();
		this.remove(current);

		for(let key in current.children)
		{
			if(current.children.hasOwnProperty(key))
			{
				let child = current.children[key];
				if(child.loaded)
				{
					stack.push(current.children[key]);
				}
			}
		}
	}
};

Potree.PointCloudOctreeNode = class PointCloudOctreeNode extends Potree.PointCloudTreeNode
{
	constructor()
	{
		super();

		this.children = {};
		this.sceneNode = null;
		this.octree = null;
	}

	getNumPoints()
	{
		return this.geometryNode.numPoints;
	}

	isLoaded()
	{
		return true;
	}

	isTreeNode()
	{
		return true;
	}

	isGeometryNode()
	{
		return false;
	}

	getLevel()
	{
		return this.geometryNode.level;
	}

	getBoundingSphere()
	{
		return this.geometryNode.boundingSphere;
	}

	getBoundingBox()
	{
		return this.geometryNode.boundingBox;
	}

	getChildren()
	{
		let children = [];

		for(let i = 0; i < 8; i++)
		{
			if(this.children[i])
			{
				children.push(this.children[i]);
			}
		}

		return children;
	}

	getPointsInBox(boxNode)
	{

		if(!this.sceneNode)
		{
			return null;
		}

		let buffer = this.geometryNode.buffer;

		let posOffset = buffer.offset("position");
		let stride = buffer.stride;
		let view = new DataView(buffer.data);

		let worldToBox = new THREE.Matrix4().getInverse(boxNode.matrixWorld);
		let objectToBox = new THREE.Matrix4().multiplyMatrices(worldToBox, this.sceneNode.matrixWorld);

		let inBox = [];

		let pos = new THREE.Vector4();
		for(let i = 0; i < buffer.numElements; i++)
		{
			let x = view.getFloat32(i * stride + posOffset + 0, true);
			let y = view.getFloat32(i * stride + posOffset + 4, true);
			let z = view.getFloat32(i * stride + posOffset + 8, true);

			pos.set(x, y, z, 1);
			pos.applyMatrix4(objectToBox);

			if(-0.5 < pos.x && pos.x < 0.5)
			{
				if(-0.5 < pos.y && pos.y < 0.5)
				{
					if(-0.5 < pos.z && pos.z < 0.5)
					{
						pos.set(x, y, z, 1).applyMatrix4(this.sceneNode.matrixWorld);
						inBox.push(new THREE.Vector3(pos.x, pos.y, pos.z));
					}
				}
			}
		}

		return inBox;
	}

	get name()
	{
		return this.geometryNode.name;
	}
};

Potree.PointCloudOctree = class extends Potree.PointCloudTree
{
	constructor(geometry, material)
	{
		super();

		this.pointBudget = Infinity;
		this.pcoGeometry = geometry;
		this.boundingBox = this.pcoGeometry.boundingBox;
		this.boundingSphere = this.boundingBox.getBoundingSphere(new THREE.Sphere());
		this.material = material || new Potree.PointCloudMaterial();
		this.visiblePointsTarget = 2 * 1000 * 1000;
		this.minimumNodePixelSize = 150;
		this.level = 0;
		this.position.copy(geometry.offset);
		this.updateMatrix();

		this.showBoundingBox = false;
		this.boundingBoxNodes = [];
		this.loadQueue = [];
		this.visibleBounds = new THREE.Box3();
		this.visibleNodes = [];
		this.visibleGeometry = [];
		this.generateDEM = false;
		this.profileRequests = [];
		this.name = "";

		{
			let box = [this.pcoGeometry.tightBoundingBox, this.getBoundingBoxWorld()]
				.find(v => v !== undefined);

			this.updateMatrixWorld(true);
			box = Potree.utils.computeTransformedBoundingBox(box, this.matrixWorld);

			let bMin = box.min.z;
			let bMax = box.max.z;
			this.material.heightMin = bMin;
			this.material.heightMax = bMax;
		}

		// TODO read projection from file instead
		this.projection = geometry.projection;

		this.root = this.pcoGeometry.root;
	}

	setName(name)
	{
		if(this.name !== name)
		{
			this.name = name;
			this.dispatchEvent(
			{
				type: "name_changed",
				name: name,
				pointcloud: this
			});
		}
	}

	getName()
	{
		return this.name;
	}

	toTreeNode(geometryNode, parent)
	{
		let node = new Potree.PointCloudOctreeNode();

		let sceneNode = new THREE.Points(geometryNode.geometry, this.material);
		sceneNode.name = geometryNode.name;
		sceneNode.position.copy(geometryNode.boundingBox.min);
		sceneNode.frustumCulled = true;
		sceneNode.onBeforeRender = (_this, scene, camera, geometry, material, group) =>
		{
			if(material.program)
			{
				_this.getContext().useProgram(material.program.program);

				if(material.program.getUniforms().map.level)
				{
					let level = geometryNode.getLevel();
					material.uniforms.level.value = level;
					material.program.getUniforms().map.level.setValue(_this.getContext(), level);
				}

				if(this.visibleNodeTextureOffsets && material.program.getUniforms().map.vnStart)
				{
					let vnStart = this.visibleNodeTextureOffsets.get(node);
					material.uniforms.vnStart.value = vnStart;
					material.program.getUniforms().map.vnStart.setValue(_this.getContext(), vnStart);
				}

				if(material.program.getUniforms().map.pcIndex)
				{
					let i = node.pcIndex ? node.pcIndex : this.visibleNodes.indexOf(node);
					material.uniforms.pcIndex.value = i;
					material.program.getUniforms().map.pcIndex.setValue(_this.getContext(), i);
				}
			}
		};

		node.geometryNode = geometryNode;
		node.sceneNode = sceneNode;
		node.pointcloud = this;
		node.children = {};
		for(let key in geometryNode.children)
		{
			node.children[key] = geometryNode.children[key];
		}

		if(!parent)
		{
			this.root = node;
			this.add(sceneNode);
		}
		else
		{
			let childIndex = parseInt(geometryNode.name[geometryNode.name.length - 1]);
			parent.sceneNode.add(sceneNode);
			parent.children[childIndex] = node;
		}

		let disposeListener = function()
		{
			let childIndex = parseInt(geometryNode.name[geometryNode.name.length - 1]);
			parent.sceneNode.remove(node.sceneNode);
			parent.children[childIndex] = geometryNode;
		};
		geometryNode.oneTimeDisposeHandlers.push(disposeListener);

		return node;
	}

	updateVisibleBounds()
	{
		let leafNodes = [];
		for(let i = 0; i < this.visibleNodes.length; i++)
		{
			let node = this.visibleNodes[i];
			let isLeaf = true;

			for(let j = 0; j < node.children.length; j++)
			{
				let child = node.children[j];
				if(child instanceof Potree.PointCloudOctreeNode)
				{
					isLeaf = isLeaf && !child.sceneNode.visible;
				}
				else if(child instanceof Potree.PointCloudOctreeGeometryNode)
				{
					isLeaf = true;
				}
			}

			if(isLeaf)
			{
				leafNodes.push(node);
			}
		}

		this.visibleBounds.min = new THREE.Vector3(Infinity, Infinity, Infinity);
		this.visibleBounds.max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
		for(let i = 0; i < leafNodes.length; i++)
		{
			let node = leafNodes[i];

			this.visibleBounds.expandByPoint(node.getBoundingBox().min);
			this.visibleBounds.expandByPoint(node.getBoundingBox().max);
		}
	}

	updateMaterial(material, visibleNodes, camera, renderer)
	{
		material.fov = camera.fov * (Math.PI / 180);
		material.screenWidth = renderer.domElement.clientWidth;
		material.screenHeight = renderer.domElement.clientHeight;
		material.spacing = this.pcoGeometry.spacing * Math.max(this.scale.x, this.scale.y, this.scale.z);
		material.near = camera.near;
		material.far = camera.far;
		material.uniforms.octreeSize.value = this.pcoGeometry.boundingBox.getSize(new THREE.Vector3()).x;
	}

	computeVisibilityTextureData(nodes, camera)
	{

		if(Potree.measureTimings) performance.mark("computeVisibilityTextureData-start");

		let data = new Uint8Array(nodes.length * 4);
		let visibleNodeTextureOffsets = new Map();

		// copy array
		nodes = nodes.slice();

		// sort by level and index, e.g. r, r0, r3, r4, r01, r07, r30, ...
		let sort = function(a, b)
		{
			let na = a.geometryNode.name;
			let nb = b.geometryNode.name;
			if(na.length !== nb.length) return na.length - nb.length;
			if(na < nb) return -1;
			if(na > nb) return 1;
			return 0;
		};
		nodes.sort(sort);

		// code sample taken from three.js src/math/Ray.js
		let v1 = new THREE.Vector3();
		let intersectSphereBack = (ray, sphere) =>
		{
			v1.subVectors(sphere.center, ray.origin);
			let tca = v1.dot(ray.direction);
			let d2 = v1.dot(v1) - tca * tca;
			let radius2 = sphere.radius * sphere.radius;

			if(d2 > radius2)
			{
				return null;
			}

			let thc = Math.sqrt(radius2 - d2);

			// t1 = second intersect point - exit point on back of sphere
			let t1 = tca + thc;

			if(t1 < 0)
			{
				return null;
			}

			return t1;
		};

		let lodRanges = new Map();
		let leafNodeLodRanges = new Map();

		for(let i = 0; i < nodes.length; i++)
		{
			let node = nodes[i];

			visibleNodeTextureOffsets.set(node, i);

			let children = [];
			for(let j = 0; j < 8; j++)
			{
				let child = node.children[j];

				if(child && child.constructor === Potree.PointCloudOctreeNode && nodes.includes(child, i))
				{
					children.push(child);
				}
			}

			let spacing = node.geometryNode.estimatedSpacing;
			let isLeafNode;

			data[i * 4 + 0] = 0;
			data[i * 4 + 1] = 0;
			data[i * 4 + 2] = 0;
			data[i * 4 + 3] = node.getLevel();
			for(let j = 0; j < children.length; j++)
			{
				let child = children[j];
				let index = parseInt(child.geometryNode.name.substr(-1));
				data[i * 4 + 0] += Math.pow(2, index);

				if(j === 0)
				{
					let vArrayIndex = nodes.indexOf(child, i);

					data[i * 4 + 1] = (vArrayIndex - i) >> 8;
					data[i * 4 + 2] = (vArrayIndex - i) % 256;
				}
			}

			{
				// TODO performance optimization
				// for some reason, this part can be extremely slow in chrome during a debugging session, but not during profiling
				let bBox = node.getBoundingBox().clone();
				//bBox.applyMatrix4(node.sceneNode.matrixWorld);
				//bBox.applyMatrix4(camera.matrixWorldInverse);
				let bSphere = bBox.getBoundingSphere(new THREE.Sphere());
				bSphere.applyMatrix4(node.sceneNode.matrixWorld);
				bSphere.applyMatrix4(camera.matrixWorldInverse);

				let ray = new THREE.Ray(camera.position, camera.getWorldDirection(Potree.tempVector3));
				let distance = intersectSphereBack(ray, bSphere);
				let distance2 = bSphere.center.distanceTo(camera.position) + bSphere.radius;
				if(distance === null)
				{
					distance = distance2;
				}
				distance = Math.max(distance, distance2);

				if(!lodRanges.has(node.getLevel()))
				{
					lodRanges.set(node.getLevel(), distance);
				}
				else
				{
					let prevDistance = lodRanges.get(node.getLevel());
					let newDistance = Math.max(prevDistance, distance);
					lodRanges.set(node.getLevel(), newDistance);
				}

				if(!node.geometryNode.hasChildren)
				{
					let value = {
						distance: distance,
						i: i
					};
					leafNodeLodRanges.set(node, value);
				}

			}
		}

		for(let [node, value] of leafNodeLodRanges)
		{
			let level = node.getLevel();
			let distance = value.distance;
			let i = value.i;

			if(level < 4)
			{
				continue;
			}
			for(let [lod, range] of lodRanges)
			{
				if(distance < range * 1.2)
				{
					data[i * 4 + 3] = lod;
				}
			}
		}

		if(Potree.measureTimings)
		{
			performance.mark("computeVisibilityTextureData-end");
			performance.measure("render.computeVisibilityTextureData", "computeVisibilityTextureData-start", "computeVisibilityTextureData-end");
		}

		return {
			data: data,
			offsets: visibleNodeTextureOffsets
		};
	}

	nodeIntersectsProfile(node, profile)
	{
		let bbWorld = node.boundingBox.clone().applyMatrix4(this.matrixWorld);
		let bsWorld = bbWorld.getBoundingSphere(new THREE.Sphere());

		let intersects = false;

		for(let i = 0; i < profile.points.length - 1; i++)
		{

			let start = new THREE.Vector3(profile.points[i + 0].x, profile.points[i + 0].y, bsWorld.center.z);
			let end = new THREE.Vector3(profile.points[i + 1].x, profile.points[i + 1].y, bsWorld.center.z);

			let closest = new THREE.Line3(start, end).closestPointToPoint(bsWorld.center, true);
			let distance = closest.distanceTo(bsWorld.center);

			intersects = intersects || (distance < (bsWorld.radius + profile.width));
		}

		//console.log(`${node.name}: ${intersects}`);

		return intersects;
	}

	nodesOnRay(nodes, ray)
	{
		let nodesOnRay = [];

		let _ray = ray.clone();
		for(let i = 0; i < nodes.length; i++)
		{
			let node = nodes[i];
			// let inverseWorld = new THREE.Matrix4().getInverse(node.matrixWorld);
			// let sphere = node.getBoundingSphere(new THREE.Sphere()).clone().applyMatrix4(node.sceneNode.matrixWorld);
			let sphere = node.getBoundingSphere(new THREE.Sphere()).clone().applyMatrix4(this.matrixWorld);

			if(_ray.intersectsSphere(sphere))
			{
				nodesOnRay.push(node);
			}
		}

		return nodesOnRay;
	}

	updateMatrixWorld(force)
	{
		if(this.matrixAutoUpdate === true) this.updateMatrix();

		if(this.matrixWorldNeedsUpdate === true || force === true)
		{
			if(!this.parent)
			{
				this.matrixWorld.copy(this.matrix);
			}
			else
			{
				this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
			}

			this.matrixWorldNeedsUpdate = false;

			force = true;
		}
	}

	hideDescendants(object)
	{
		let stack = [];
		for(let i = 0; i < object.children.length; i++)
		{
			let child = object.children[i];
			if(child.visible)
			{
				stack.push(child);
			}
		}

		while(stack.length > 0)
		{
			let object = stack.shift();

			object.visible = false;

			for(let i = 0; i < object.children.length; i++)
			{
				let child = object.children[i];
				if(child.visible)
				{
					stack.push(child);
				}
			}
		}
	}

	moveToOrigin()
	{
		this.position.set(0, 0, 0);
		this.updateMatrixWorld(true);
		let box = this.boundingBox;
		let transform = this.matrixWorld;
		let tBox = Potree.utils.computeTransformedBoundingBox(box, transform);
		this.position.set(0, 0, 0).sub(tBox.getCenter());
	};

	moveToGroundPlane()
	{
		this.updateMatrixWorld(true);
		let box = this.boundingBox;
		let transform = this.matrixWorld;
		let tBox = Potree.utils.computeTransformedBoundingBox(box, transform);
		this.position.y += -tBox.min.y;
	};

	getBoundingBoxWorld()
	{
		this.updateMatrixWorld(true);
		let box = this.boundingBox;
		let transform = this.matrixWorld;
		let tBox = Potree.utils.computeTransformedBoundingBox(box, transform);

		return tBox;
	};

	/**
	 * returns points inside the profile points
	 *
	 * maxDepth:		search points up to the given octree depth
	 *
	 *
	 * The return value is an array with all segments of the profile path
	 *  let segment = {
	 * 		start: 	THREE.Vector3,
	 * 		end: 	THREE.Vector3,
	 * 		points: {}
	 * 		project: function()
	 *  };
	 *
	 * The project() function inside each segment can be used to transform
	 * that segments point coordinates to line up along the x-axis.
	 *
	 *
	 */
	getPointsInProfile(profile, maxDepth, callback)
	{
		if(callback)
		{
			let request = new Potree.ProfileRequest(this, profile, maxDepth, callback);
			this.profileRequests.push(request);

			return request;
		}

		let points = {
			segments: [],
			boundingBox: new THREE.Box3(),
			projectedBoundingBox: new THREE.Box2()
		};

		// evaluate segments
		for(let i = 0; i < profile.points.length - 1; i++)
		{
			let start = profile.points[i];
			let end = profile.points[i + 1];
			let ps = this.getProfile(start, end, profile.width, maxDepth);

			let segment = {
				start: start,
				end: end,
				points: ps,
				project: null
			};

			points.segments.push(segment);

			points.boundingBox.expandByPoint(ps.boundingBox.min);
			points.boundingBox.expandByPoint(ps.boundingBox.max);
		}

		// add projection functions to the segments
		let mileage = new THREE.Vector3();
		for(let i = 0; i < points.segments.length; i++)
		{
			let segment = points.segments[i];
			let start = segment.start;
			let end = segment.end;

			let project = (function(_start, _end, _mileage, _boundingBox)
			{
				let start = _start;
				let end = _end;
				let mileage = _mileage;
				let boundingBox = _boundingBox;

				let xAxis = new THREE.Vector3(1, 0, 0);
				let dir = new THREE.Vector3().subVectors(end, start);
				dir.y = 0;
				dir.normalize();
				let alpha = Math.acos(xAxis.dot(dir));
				if(dir.z > 0)
				{
					alpha = -alpha;
				}

				return function(position)
				{
					let toOrigin = new THREE.Matrix4().makeTranslation(-start.x, -boundingBox.min.y, -start.z);
					let alignWithX = new THREE.Matrix4().makeRotationY(-alpha);
					let applyMileage = new THREE.Matrix4().makeTranslation(mileage.x, 0, 0);

					let pos = position.clone();
					pos.applyMatrix4(toOrigin);
					pos.applyMatrix4(alignWithX);
					pos.applyMatrix4(applyMileage);

					return pos;
				};
			}(start, end, mileage.clone(), points.boundingBox.clone()));

			segment.project = project;

			mileage.x += new THREE.Vector3(start.x, 0, start.z).distanceTo(new THREE.Vector3(end.x, 0, end.z));
			mileage.y += end.y - start.y;
		}

		points.projectedBoundingBox.min.x = 0;
		points.projectedBoundingBox.min.y = points.boundingBox.min.y;
		points.projectedBoundingBox.max.x = mileage.x;
		points.projectedBoundingBox.max.y = points.boundingBox.max.y;

		return points;
	}

	/**
	 * returns points inside the given profile bounds.
	 *
	 * start:
	 * end:
	 * width:
	 * depth:		search points up to the given octree depth
	 * callback:	if specified, points are loaded before searching
	 *
	 *
	 */
	getProfile(start, end, width, depth, callback)
	{
		let request = new Potree.ProfileRequest(start, end, width, depth, callback);
		this.profileRequests.push(request);
	};

	getVisibleExtent()
	{
		return this.visibleBounds.applyMatrix4(this.matrixWorld);
	};

	/**
	 *
	 *
	 *
	 * params.pickWindowSize:	Look for points inside a pixel window of this size.
	 * 							Use odd values: 1, 3, 5, ...
	 *
	 *
	 * TODO: only draw pixels that are actually read with readPixels().
	 *
	 */
	pick(viewer, camera, ray, params = {})
	{

		let renderer = viewer.renderer;
		let pRenderer = viewer.pRenderer;

		performance.mark("pick-start");

		let getVal = (a, b) => a !== undefined ? a : b;

		let pickWindowSize = getVal(params.pickWindowSize, 17);
		let pickOutsideClipRegion = getVal(params.pickOutsideClipRegion, false);

		let size = renderer.getSize(new THREE.Vector3());

		let width = Math.ceil(getVal(params.width, size.width));
		let height = Math.ceil(getVal(params.height, size.height));

		let pointSizeType = getVal(params.pointSizeType, this.material.pointSizeType);
		let pointSize = getVal(params.pointSize, this.material.size);

		let nodes = this.nodesOnRay(this.visibleNodes, ray);

		if(nodes.length === 0)
		{
			return null;
		}

		if(!this.pickState)
		{
			let scene = new THREE.Scene();

			let material = new Potree.PointCloudMaterial();
			material.pointColorType = Potree.PointColorType.POINT_INDEX;

			let renderTarget = new THREE.WebGLRenderTarget(
				1, 1,
				{
					minFilter: THREE.LinearFilter,
					magFilter: THREE.NearestFilter,
					format: THREE.RGBAFormat
				}
			);

			this.pickState = {
				renderTarget: renderTarget,
				material: material,
				scene: scene
			};
		};

		let pickState = this.pickState;
		let pickMaterial = pickState.material;

		{ // update pick material
			pickMaterial.pointSizeType = pointSizeType;
			pickMaterial.shape = this.material.shape;

			pickMaterial.size = pointSize;
			pickMaterial.uniforms.minSize.value = this.material.uniforms.minSize.value;
			pickMaterial.uniforms.maxSize.value = this.material.uniforms.maxSize.value;
			pickMaterial.classification = this.material.classification;
			if(params.pickClipped)
			{
				pickMaterial.clipBoxes = this.material.clipBoxes;
				if(this.material.clipTask === Potree.ClipTask.HIGHLIGHT)
				{
					pickMaterial.clipTask = Potree.ClipTask.NONE;
				}
				else
				{
					pickMaterial.clipTask = this.material.clipTask;
				}
			}
			else
			{
				pickMaterial.clipBoxes = [];
			}

			this.updateMaterial(pickMaterial, nodes, camera, renderer);
		}

		pickState.renderTarget.setSize(width, height);

		let pixelPos = new THREE.Vector2(params.x, params.y);

		let gl = renderer.getContext();
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(
			parseInt(pixelPos.x - (pickWindowSize - 1) / 2),
			parseInt(pixelPos.y - (pickWindowSize - 1) / 2),
			parseInt(pickWindowSize), parseInt(pickWindowSize));

		renderer.state.buffers.depth.setTest(pickMaterial.depthTest);
		renderer.state.buffers.depth.setMask(pickMaterial.depthWrite);
		renderer.state.setBlending(THREE.NoBlending);

		{ // RENDER
			renderer.setRenderTarget(pickState.renderTarget);
			gl.clearColor(0, 0, 0, 0);
			renderer.clearTarget(pickState.renderTarget, true, true, true);

			let tmp = this.material;
			this.material = pickMaterial;

			pRenderer.renderOctree(this, nodes, camera, pickState.renderTarget);

			this.material = tmp;
		}

		let clamp = (number, min, max) => Math.min(Math.max(min, number), max);

		let x = parseInt(clamp(pixelPos.x - (pickWindowSize - 1) / 2, 0, width));
		let y = parseInt(clamp(pixelPos.y - (pickWindowSize - 1) / 2, 0, height));
		let w = parseInt(Math.min(x + pickWindowSize, width) - x);
		let h = parseInt(Math.min(y + pickWindowSize, height) - y);

		let pixelCount = w * h;
		let buffer = new Uint8Array(4 * pixelCount);

		gl.readPixels(x, y, pickWindowSize, pickWindowSize, gl.RGBA, gl.UNSIGNED_BYTE, buffer);

		renderer.setRenderTarget(null);
		renderer.resetGLState();
		renderer.setScissorTest(false);
		gl.disable(gl.SCISSOR_TEST);

		let pixels = buffer;
		let ibuffer = new Uint32Array(buffer.buffer);

		// find closest hit inside pixelWindow boundaries
		let min = Number.MAX_VALUE;
		let hits = [];
		for(let u = 0; u < pickWindowSize; u++)
		{
			for(let v = 0; v < pickWindowSize; v++)
			{
				let offset = (u + v * pickWindowSize);
				let distance = Math.pow(u - (pickWindowSize - 1) / 2, 2) + Math.pow(v - (pickWindowSize - 1) / 2, 2);

				let pcIndex = pixels[4 * offset + 3];
				pixels[4 * offset + 3] = 0;
				let pIndex = ibuffer[offset];

				if(!(pcIndex === 0 && pIndex === 0) && (pcIndex !== undefined) && (pIndex !== undefined))
				{
					let hit = {
						pIndex: pIndex,
						pcIndex: pcIndex,
						distanceToCenter: distance
					};

					if(params.all)
					{
						hits.push(hit);
					}
					else
					{
						if(hits.length > 0)
						{
							if(distance < hits[0].distanceToCenter)
							{
								hits[0] = hit;
							}
						}
						else
						{
							hits.push(hit);
						}
					}

				}
			}
		}

		for(let hit of hits)
		{
			let point = {};

			if(!nodes[hit.pcIndex])
			{
				return null;
			}

			let node = nodes[hit.pcIndex];
			let pc = node.sceneNode;
			let geometry = node.geometryNode.geometry;

			for(let attributeName in geometry.attributes)
			{
				let attribute = geometry.attributes[attributeName];

				if(attributeName === "position")
				{
					let x = attribute.array[3 * hit.pIndex + 0];
					let y = attribute.array[3 * hit.pIndex + 1];
					let z = attribute.array[3 * hit.pIndex + 2];

					let position = new THREE.Vector3(x, y, z);
					position.applyMatrix4(pc.matrixWorld);

					point[attributeName] = position;
				}
				else if(attributeName === "indices")
				{

				}
				else
				{
					//if (values.itemSize === 1) {
					//	point[attribute.name] = values.array[hit.pIndex];
					//} else {
					//	let value = [];
					//	for (let j = 0; j < values.itemSize; j++) {
					//		value.push(values.array[values.itemSize * hit.pIndex + j]);
					//	}
					//	point[attribute.name] = value;
					//}
				}

			}

			hit.point = point;
		}

		performance.mark("pick-end");
		performance.measure("pick", "pick-start", "pick-end");

		if(params.all)
		{
			return hits.map(hit => hit.point);
		}
		else
		{
			if(hits.length === 0)
			{
				return null;
			}
			else
			{
				return hits[0].point;
				//let sorted = hits.sort( (a, b) => a.distanceToCenter - b.distanceToCenter);

				//return sorted[0].point;
			}
		}

	};

	* getFittedBoxGen(boxNode)
	{
		let start = performance.now();

		let shrinkedLocalBounds = new THREE.Box3();
		let worldToBox = new THREE.Matrix4().getInverse(boxNode.matrixWorld);

		for(let node of this.visibleNodes)
		{
			if(!node.sceneNode)
			{
				continue;
			}

			let buffer = node.geometryNode.buffer;

			let posOffset = buffer.offset("position");
			let stride = buffer.stride;
			let view = new DataView(buffer.data);

			let objectToBox = new THREE.Matrix4().multiplyMatrices(worldToBox, node.sceneNode.matrixWorld);

			let pos = new THREE.Vector4();
			for(let i = 0; i < buffer.numElements; i++)
			{
				let x = view.getFloat32(i * stride + posOffset + 0, true);
				let y = view.getFloat32(i * stride + posOffset + 4, true);
				let z = view.getFloat32(i * stride + posOffset + 8, true);

				pos.set(x, y, z, 1);
				pos.applyMatrix4(objectToBox);

				if(-0.5 < pos.x && pos.x < 0.5)
				{
					if(-0.5 < pos.y && pos.y < 0.5)
					{
						if(-0.5 < pos.z && pos.z < 0.5)
						{
							shrinkedLocalBounds.expandByPoint(pos);
						}
					}
				}
			}

			yield;
		}

		let fittedPosition = shrinkedLocalBounds.getCenter().applyMatrix4(boxNode.matrixWorld);

		let fitted = new THREE.Object3D();
		fitted.position.copy(fittedPosition);
		fitted.scale.copy(boxNode.scale);
		fitted.rotation.copy(boxNode.rotation);

		let ds = new THREE.Vector3().subVectors(shrinkedLocalBounds.max, shrinkedLocalBounds.min);
		fitted.scale.multiply(ds);

		let duration = performance.now() - start;
		console.log("duration: ", duration);

		yield fitted;
	}

	getFittedBox(boxNode, maxLevel = Infinity)
	{

		maxLevel = Infinity;

		let start = performance.now();

		let shrinkedLocalBounds = new THREE.Box3();
		let worldToBox = new THREE.Matrix4().getInverse(boxNode.matrixWorld);

		for(let node of this.visibleNodes)
		{
			if(!node.sceneNode || node.getLevel() > maxLevel)
			{
				continue;
			}

			let buffer = node.geometryNode.buffer;

			let posOffset = buffer.offset("position");
			let stride = buffer.stride;
			let view = new DataView(buffer.data);

			let objectToBox = new THREE.Matrix4().multiplyMatrices(worldToBox, node.sceneNode.matrixWorld);

			let pos = new THREE.Vector4();
			for(let i = 0; i < buffer.numElements; i++)
			{
				let x = view.getFloat32(i * stride + posOffset + 0, true);
				let y = view.getFloat32(i * stride + posOffset + 4, true);
				let z = view.getFloat32(i * stride + posOffset + 8, true);

				pos.set(x, y, z, 1);
				pos.applyMatrix4(objectToBox);

				if(-0.5 < pos.x && pos.x < 0.5)
				{
					if(-0.5 < pos.y && pos.y < 0.5)
					{
						if(-0.5 < pos.z && pos.z < 0.5)
						{
							shrinkedLocalBounds.expandByPoint(pos);
						}
					}
				}
			}
		}

		let fittedPosition = shrinkedLocalBounds.getCenter().applyMatrix4(boxNode.matrixWorld);

		let fitted = new THREE.Object3D();
		fitted.position.copy(fittedPosition);
		fitted.scale.copy(boxNode.scale);
		fitted.rotation.copy(boxNode.rotation);

		let ds = new THREE.Vector3().subVectors(shrinkedLocalBounds.max, shrinkedLocalBounds.min);
		fitted.scale.multiply(ds);

		let duration = performance.now() - start;
		console.log("duration: ", duration);

		return fitted;
	}

	get progress()
	{
		return this.visibleNodes.length / this.visibleGeometry.length;
	}

	find(name)
	{
		let node = null;
		for(let char of name)
		{
			if(char === "r")
			{
				node = this.root;
			}
			else
			{
				node = node.children[char];
			}
		}

		return node;
	}
};

Potree.PointCloudOctreeGeometry = class PointCloudOctreeGeometry
{

	constructor()
	{
		this.url = null;
		this.octreeDir = null;
		this.spacing = 0;
		this.boundingBox = null;
		this.root = null;
		this.nodes = null;
		this.pointAttributes = null;
		this.hierarchyStepSize = -1;
		this.loader = null;
	}
};

Potree.PointCloudOctreeGeometryNode = class PointCloudOctreeGeometryNode extends Potree.PointCloudTreeNode
{

	constructor(name, pcoGeometry, boundingBox)
	{
		super();

		this.id = Potree.PointCloudOctreeGeometryNode.IDCount++;
		this.name = name;
		this.index = parseInt(name.charAt(name.length - 1));
		this.pcoGeometry = pcoGeometry;
		this.geometry = null;
		this.boundingBox = boundingBox;
		this.boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
		this.children = {};
		this.numPoints = 0;
		this.level = null;
		this.loaded = false;
		this.oneTimeDisposeHandlers = [];
	}

	isGeometryNode()
	{
		return true;
	}

	getLevel()
	{
		return this.level;
	}

	isTreeNode()
	{
		return false;
	}

	isLoaded()
	{
		return this.loaded;
	}

	getBoundingSphere()
	{
		return this.boundingSphere;
	}

	getBoundingBox()
	{
		return this.boundingBox;
	}

	getChildren()
	{
		let children = [];

		for(let i = 0; i < 8; i++)
		{
			if(this.children[i])
			{
				children.push(this.children[i]);
			}
		}

		return children;
	}

	getURL()
	{
		let url = "";

		let version = this.pcoGeometry.loader.version;

		if(version.equalOrHigher("1.5"))
		{
			url = this.pcoGeometry.octreeDir + "/" + this.getHierarchyPath() + "/" + this.name;
		}
		else if(version.equalOrHigher("1.4"))
		{
			url = this.pcoGeometry.octreeDir + "/" + this.name;
		}
		else if(version.upTo("1.3"))
		{
			url = this.pcoGeometry.octreeDir + "/" + this.name;
		}

		return url;
	}

	getHierarchyPath()
	{
		let path = "r/";

		let hierarchyStepSize = this.pcoGeometry.hierarchyStepSize;
		let indices = this.name.substr(1);

		let numParts = Math.floor(indices.length / hierarchyStepSize);
		for(let i = 0; i < numParts; i++)
		{
			path += indices.substr(i * hierarchyStepSize, hierarchyStepSize) + "/";
		}

		path = path.slice(0, -1);

		return path;
	}

	addChild(child)
	{
		this.children[child.index] = child;
		child.parent = this;
	}

	load()
	{
		if(this.loading === true || this.loaded === true || Potree.numNodesLoading >= Potree.maxNodesLoading)
		{
			return;
		}

		this.loading = true;

		Potree.numNodesLoading++;

		if(this.pcoGeometry.loader.version.equalOrHigher("1.5"))
		{
			if((this.level % this.pcoGeometry.hierarchyStepSize) === 0 && this.hasChildren)
			{
				this.loadHierachyThenPoints();
			}
			else
			{
				this.loadPoints();
			}
		}
		else
		{
			this.loadPoints();
		}
	}

	loadPoints()
	{
		this.pcoGeometry.loader.load(this);
	}

	loadHierachyThenPoints()
	{
		let node = this;

		// load hierarchy
		let callback = function(node, hbuffer)
		{
			let view = new DataView(hbuffer);

			let stack = [];
			let children = view.getUint8(0);
			let numPoints = view.getUint32(1, true);
			node.numPoints = numPoints;
			stack.push(
			{
				children: children,
				numPoints: numPoints,
				name: node.name
			});

			let decoded = [];

			let offset = 5;
			while(stack.length > 0)
			{
				let snode = stack.shift();
				let mask = 1;
				for(let i = 0; i < 8; i++)
				{
					if((snode.children & mask) !== 0)
					{
						let childName = snode.name + i;

						let childChildren = view.getUint8(offset);
						let childNumPoints = view.getUint32(offset + 1, true);

						stack.push(
						{
							children: childChildren,
							numPoints: childNumPoints,
							name: childName
						});

						decoded.push(
						{
							children: childChildren,
							numPoints: childNumPoints,
							name: childName
						});

						offset += 5;
					}

					mask = mask * 2;
				}

				if(offset === hbuffer.byteLength)
				{
					break;
				}
			}

			// console.log(decoded);

			let nodes = {};
			nodes[node.name] = node;
			let pco = node.pcoGeometry;

			for(let i = 0; i < decoded.length; i++)
			{
				let name = decoded[i].name;
				let decodedNumPoints = decoded[i].numPoints;
				let index = parseInt(name.charAt(name.length - 1));
				let parentName = name.substring(0, name.length - 1);
				let parentNode = nodes[parentName];
				let level = name.length - 1;
				let boundingBox = Potree.POCLoader.createChildAABB(parentNode.boundingBox, index);

				let currentNode = new Potree.PointCloudOctreeGeometryNode(name, pco, boundingBox);
				currentNode.level = level;
				currentNode.numPoints = decodedNumPoints;
				currentNode.hasChildren = decoded[i].children > 0;
				currentNode.spacing = pco.spacing / Math.pow(2, level);
				parentNode.addChild(currentNode);
				nodes[name] = currentNode;
			}

			node.loadPoints();
		};
		if((node.level % node.pcoGeometry.hierarchyStepSize) === 0)
		{
			// let hurl = node.pcoGeometry.octreeDir + "/../hierarchy/" + node.name + ".hrc";
			let hurl = node.pcoGeometry.octreeDir + "/" + node.getHierarchyPath() + "/" + node.name + ".hrc";

			let xhr = Potree.XHRFactory.createXMLHttpRequest();
			xhr.open("GET", hurl, true);
			xhr.responseType = "arraybuffer";
			xhr.overrideMimeType("text/plain; charset=x-user-defined");
			xhr.onreadystatechange = () =>
			{
				if(xhr.readyState === 4)
				{
					if(xhr.status === 200 || xhr.status === 0)
					{
						let hbuffer = xhr.response;
						callback(node, hbuffer);
					}
					else
					{
						console.log("Failed to load file! HTTP status: " + xhr.status + ", file: " + hurl);
						Potree.numNodesLoading--;
					}
				}
			};
			try
			{
				xhr.send(null);
			}
			catch(e)
			{
				console.log("fehler beim laden der punktwolke: " + e);
			}
		}
	}

	getNumPoints()
	{
		return this.numPoints;
	}

	dispose()
	{
		if(this.geometry && this.parent != null)
		{
			this.geometry.dispose();
			this.geometry = null;
			this.loaded = false;

			// this.dispatchEvent( { type: "dispose" } );
			for(let i = 0; i < this.oneTimeDisposeHandlers.length; i++)
			{
				let handler = this.oneTimeDisposeHandlers[i];
				handler();
			}
			this.oneTimeDisposeHandlers = [];
		}
	}

}

Potree.PointCloudOctreeGeometryNode.IDCount = 0;

Object.assign(Potree.PointCloudOctreeGeometryNode.prototype, THREE.EventDispatcher.prototype);

Potree.PointCloudGreyhoundGeometry = function()
{
	this.spacing = 0;
	this.boundingBox = null;
	this.root = null;
	this.nodes = null;
	this.pointAttributes = {};
	this.hierarchyStepSize = -1;
	this.loader = null;
	this.schema = null;

	this.baseDepth = null;
	this.offset = null;
	this.projection = null;

	this.boundingSphere = null;

	// the serverURL will contain the base URL of the greyhound server. f.e. http://dev.greyhound.io/resource/autzen/
	this.serverURL = null;

	this.normalize = {
		color: false,
		intensity: false
	};
};

Potree.PointCloudGreyhoundGeometryNode = function(
	name, pcoGeometry, boundingBox, scale, offset)
{
	this.id = Potree.PointCloudGreyhoundGeometryNode.IDCount++;
	this.name = name;
	this.index = parseInt(name.charAt(name.length - 1));
	this.pcoGeometry = pcoGeometry;
	this.geometry = null;
	this.boundingBox = boundingBox;
	this.boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
	this.scale = scale;
	this.offset = offset;
	this.children = {};
	this.numPoints = 0;
	this.level = null;
	this.loaded = false;
	this.oneTimeDisposeHandlers = [];
	this.baseLoaded = false;

	let bounds = this.boundingBox.clone();
	bounds.min.sub(this.pcoGeometry.boundingBox.getCenter());
	bounds.max.sub(this.pcoGeometry.boundingBox.getCenter());

	if(this.scale)
	{
		bounds.min.multiplyScalar(1 / this.scale);
		bounds.max.multiplyScalar(1 / this.scale);
	}

	// This represents the bounds for this node in the reference frame of the
	// global bounds from `info`, centered around the origin, and then scaled
	// by our selected scale.
	this.greyhoundBounds = bounds;

	// This represents the offset between the coordinate system described above
	// and our pcoGeometry bounds.
	this.greyhoundOffset = this.pcoGeometry.offset.clone().add(
		this.pcoGeometry.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5)
	);
};

Potree.PointCloudGreyhoundGeometryNode.IDCount = 0;

Potree.PointCloudGreyhoundGeometryNode.prototype =
	Object.create(Potree.PointCloudTreeNode.prototype);

Potree.PointCloudGreyhoundGeometryNode.prototype.isGeometryNode = function()
{
	return true;
};

Potree.PointCloudGreyhoundGeometryNode.prototype.isTreeNode = function()
{
	return false;
};

Potree.PointCloudGreyhoundGeometryNode.prototype.isLoaded = function()
{
	return this.loaded;
};

Potree.PointCloudGreyhoundGeometryNode.prototype.getBoundingSphere = function()
{
	return this.boundingSphere;
};

Potree.PointCloudGreyhoundGeometryNode.prototype.getBoundingBox = function()
{
	return this.boundingBox;
};

Potree.PointCloudGreyhoundGeometryNode.prototype.getLevel = function()
{
	return this.level;
};

Potree.PointCloudGreyhoundGeometryNode.prototype.getChildren = function()
{
	let children = [];

	for(let i = 0; i < 8; ++i)
	{
		if(this.children[i])
		{
			children.push(this.children[i]);
		}
	}

	return children;
};

Potree.PointCloudGreyhoundGeometryNode.prototype.getURL = function()
{
	let schema = this.pcoGeometry.schema;
	let bounds = this.greyhoundBounds;

	let boundsString =
		bounds.min.x + "," + bounds.min.y + "," + bounds.min.z + "," +
		bounds.max.x + "," + bounds.max.y + "," + bounds.max.z;

	let url = "" + this.pcoGeometry.serverURL +
		"read?depthBegin=" +
		(this.baseLoaded ? (this.level + this.pcoGeometry.baseDepth) : 0) +
		"&depthEnd=" + (this.level + this.pcoGeometry.baseDepth + 1) +
		"&bounds=[" + boundsString + "]" +
		"&schema=" + JSON.stringify(schema) +
		"&compress=true";

	if(this.scale)
	{
		url += "&scale=" + this.scale;
	}

	if(this.greyhoundOffset)
	{
		let offset = this.greyhoundOffset;
		url += "&offset=[" + offset.x + "," + offset.y + "," + offset.z + "]";
	}

	if(!this.baseLoaded) this.baseLoaded = true;

	return url;
};

Potree.PointCloudGreyhoundGeometryNode.prototype.addChild = function(child)
{
	this.children[child.index] = child;
	child.parent = this;
};

Potree.PointCloudGreyhoundGeometryNode.prototype.load = function()
{
	if(
		this.loading === true ||
		this.loaded === true ||
		Potree.numNodesLoading >= Potree.maxNodesLoading)
	{
		return;
	}

	this.loading = true;
	Potree.numNodesLoading++;

	if(
		this.level % this.pcoGeometry.hierarchyStepSize === 0 &&
		this.hasChildren)
	{
		this.loadHierarchyThenPoints();
	}
	else
	{
		this.loadPoints();
	}
};

Potree.PointCloudGreyhoundGeometryNode.prototype.loadPoints = function()
{
	this.pcoGeometry.loader.load(this);
};

Potree.PointCloudGreyhoundGeometryNode.prototype.loadHierarchyThenPoints = function()
{
	// From Greyhound (Cartesian) ordering for the octree to Potree-default
	let transform = [0, 2, 1, 3, 4, 6, 5, 7];

	let makeBitMask = function(node)
	{
		let mask = 0;
		Object.keys(node).forEach(function(key)
		{
			if(key === "swd") mask += 1 << transform[0];
			else if(key === "nwd") mask += 1 << transform[1];
			else if(key === "swu") mask += 1 << transform[2];
			else if(key === "nwu") mask += 1 << transform[3];
			else if(key === "sed") mask += 1 << transform[4];
			else if(key === "ned") mask += 1 << transform[5];
			else if(key === "seu") mask += 1 << transform[6];
			else if(key === "neu") mask += 1 << transform[7];
		});
		return mask;
	};

	let parseChildrenCounts = function(base, parentName, stack)
	{
		let keys = Object.keys(base);
		let child;
		let childName;

		keys.forEach(function(key)
		{
			if(key === "n") return;
			switch(key)
			{
				case "swd":
					child = base.swd;
					childName = parentName + transform[0];
					break;
				case "nwd":
					child = base.nwd;
					childName = parentName + transform[1];
					break;
				case "swu":
					child = base.swu;
					childName = parentName + transform[2];
					break;
				case "nwu":
					child = base.nwu;
					childName = parentName + transform[3];
					break;
				case "sed":
					child = base.sed;
					childName = parentName + transform[4];
					break;
				case "ned":
					child = base.ned;
					childName = parentName + transform[5];
					break;
				case "seu":
					child = base.seu;
					childName = parentName + transform[6];
					break;
				case "neu":
					child = base.neu;
					childName = parentName + transform[7];
					break;
				default:
					break;
			}

			stack.push(
			{
				children: makeBitMask(child),
				numPoints: child.n,
				name: childName
			});

			parseChildrenCounts(child, childName, stack);
		});
	};

	// Load hierarchy.
	let callback = function(node, greyhoundHierarchy)
	{
		let decoded = [];
		node.numPoints = greyhoundHierarchy.n;
		parseChildrenCounts(greyhoundHierarchy, node.name, decoded);

		let nodes = {};
		nodes[node.name] = node;
		let pgg = node.pcoGeometry;

		for(let i = 0; i < decoded.length; i++)
		{
			let name = decoded[i].name;
			let numPoints = decoded[i].numPoints;
			let index = parseInt(name.charAt(name.length - 1));
			let parentName = name.substring(0, name.length - 1);
			let parentNode = nodes[parentName];
			let level = name.length - 1;
			let boundingBox = Potree.GreyhoundLoader.createChildAABB(
				parentNode.boundingBox, index);

			let currentNode = new Potree.PointCloudGreyhoundGeometryNode(
				name, pgg, boundingBox, node.scale, node.offset);

			currentNode.level = level;
			currentNode.numPoints = numPoints;
			currentNode.hasChildren = decoded[i].children > 0;
			currentNode.spacing = pgg.spacing / Math.pow(2, level);
			parentNode.addChild(currentNode);
			nodes[name] = currentNode;
		}

		node.loadPoints();
	};

	if(this.level % this.pcoGeometry.hierarchyStepSize === 0)
	{
		let depthBegin = this.level + this.pcoGeometry.baseDepth;
		let depthEnd = depthBegin + this.pcoGeometry.hierarchyStepSize + 2;

		let bounds = this.greyhoundBounds;

		let boundsString =
			bounds.min.x + "," + bounds.min.y + "," + bounds.min.z + "," +
			bounds.max.x + "," + bounds.max.y + "," + bounds.max.z;

		let hurl = "" + this.pcoGeometry.serverURL +
			"hierarchy?bounds=[" + boundsString + "]" +
			"&depthBegin=" + depthBegin +
			"&depthEnd=" + depthEnd;

		if(this.scale)
		{
			hurl += "&scale=" + this.scale;
		}

		if(this.greyhoundOffset)
		{
			let offset = this.greyhoundOffset;
			hurl += "&offset=[" + offset.x + "," + offset.y + "," + offset.z + "]";
		}

		let xhr = Potree.XHRFactory.createXMLHttpRequest();
		xhr.open("GET", hurl, true);

		let that = this;
		xhr.onreadystatechange = function()
		{
			if(xhr.readyState === 4)
			{
				if(xhr.status === 200 || xhr.status === 0)
				{
					let greyhoundHierarchy = JSON.parse(xhr.responseText) ||
					{};
					callback(that, greyhoundHierarchy);
				}
				else
				{
					console.log(
						"Failed to load file! HTTP status:", xhr.status,
						"file:", hurl
					);
				}
			}
		};

		try
		{
			xhr.send(null);
		}
		catch(e)
		{
			console.log("fehler beim laden der punktwolke: " + e);
		}
	}
};

Potree.PointCloudGreyhoundGeometryNode.prototype.getNumPoints = function()
{
	return this.numPoints;
};

Potree.PointCloudGreyhoundGeometryNode.prototype.dispose = function()
{
	if(this.geometry && this.parent != null)
	{
		this.geometry.dispose();
		this.geometry = null;
		this.loaded = false;

		// this.dispatchEvent( { type: "dispose" } );
		for(let i = 0; i < this.oneTimeDisposeHandlers.length; i++)
		{
			let handler = this.oneTimeDisposeHandlers[i];
			handler();
		}
		this.oneTimeDisposeHandlers = [];
	}
};

Object.assign(Potree.PointCloudGreyhoundGeometryNode.prototype, THREE.EventDispatcher.prototype);

Potree.utils = class
{
	static loadShapefileFeatures(file, callback)
	{
		let features = [];

		let handleFinish = () =>
		{
			callback(features);
		};

		shapefile.open(file)
			.then(source =>
			{
				source.read()
					.then(function log(result)
					{
						if(result.done)
						{
							handleFinish();
							return;
						}

						// console.log(result.value);

						if(result.value && result.value.type === "Feature" && result.value.geometry !== undefined)
						{
							features.push(result.value);
						}

						return source.read().then(log);
					});
			});
	}

	static toString(value)
	{
		if(value instanceof THREE.Vector3)
		{
			return value.x.toFixed(2) + ", " + value.y.toFixed(2) + ", " + value.z.toFixed(2);
		}
		else
		{
			return "" + value;
		}
	}

	static normalizeURL(url)
	{
		let u = new URL(url);

		return u.protocol + "//" + u.hostname + u.pathname.replace(/\/+/g, "/");
	};

	static pathExists(url)
	{
		let req = Potree.XHRFactory.createXMLHttpRequest();
		req.open("GET", url, false);
		req.send(null);
		if(req.status !== 200)
		{
			return false;
		}
		return true;
	};

	static debugSphere(parent, position, scale, color)
	{
		let geometry = new THREE.SphereGeometry(1, 8, 8);
		let material;

		if(color !== undefined)
		{
			material = new THREE.MeshBasicMaterial(
			{
				color: color
			});
		}
		else
		{
			material = new THREE.MeshNormalMaterial();
		}
		let sphere = new THREE.Mesh(geometry, material);
		sphere.position.copy(position);
		sphere.scale.set(scale, scale, scale);
		parent.add(sphere);
	}

	static debugLine(parent, start, end, color)
	{
		let material = new THREE.LineBasicMaterial(
		{
			color: color
		});
		let geometry = new THREE.Geometry();
		geometry.vertices.push(start, end);
		let tl = new THREE.Line(geometry, material);
		parent.add(tl);
	}

	/**
	 * adapted from mhluska at https://github.com/mrdoob/three.js/issues/1561
	 */
	static computeTransformedBoundingBox(box, transform)
	{
		let vertices = [
			new THREE.Vector3(box.min.x, box.min.y, box.min.z).applyMatrix4(transform),
			new THREE.Vector3(box.min.x, box.min.y, box.min.z).applyMatrix4(transform),
			new THREE.Vector3(box.max.x, box.min.y, box.min.z).applyMatrix4(transform),
			new THREE.Vector3(box.min.x, box.max.y, box.min.z).applyMatrix4(transform),
			new THREE.Vector3(box.min.x, box.min.y, box.max.z).applyMatrix4(transform),
			new THREE.Vector3(box.min.x, box.max.y, box.max.z).applyMatrix4(transform),
			new THREE.Vector3(box.max.x, box.max.y, box.min.z).applyMatrix4(transform),
			new THREE.Vector3(box.max.x, box.min.y, box.max.z).applyMatrix4(transform),
			new THREE.Vector3(box.max.x, box.max.y, box.max.z).applyMatrix4(transform)
		];

		let boundingBox = new THREE.Box3();
		boundingBox.setFromPoints(vertices);

		return boundingBox;
	};

	/**
	 * add separators to large numbers
	 *
	 * @param nStr
	 * @returns
	 */
	static addCommas(nStr)
	{
		nStr += "";
		let x = nStr.split(".");
		let x1 = x[0];
		let x2 = x.length > 1 ? "." + x[1] : "";
		let rgx = /(\d+)(\d{3})/;
		while(rgx.test(x1))
		{
			x1 = x1.replace(rgx, "$1" + "," + "$2");
		}
		return x1 + x2;
	};

	static removeCommas(str)
	{
		return str.replace(/,/g, "");
	}

	/**
	 * create worker from a string
	 *
	 * code from http://stackoverflow.com/questions/10343913/how-to-create-a-web-worker-from-a-string
	 */
	static createWorker(code)
	{
		let blob = new Blob([code],
		{
			type: "application/javascript"
		});
		let worker = new Worker(URL.createObjectURL(blob));

		return worker;
	};

	static getMousePointCloudIntersection(mouse, camera, viewer, pointclouds, params = {})
	{

		let renderer = viewer.renderer;

		let nmouse = {
			x: (mouse.x / renderer.domElement.clientWidth) * 2 - 1,
			y: -(mouse.y / renderer.domElement.clientHeight) * 2 + 1
		};

		let pickParams = {};

		if(params.pickClipped)
		{
			pickParams.pickClipped = params.pickClipped;
		}

		pickParams.x = mouse.x;
		pickParams.y = renderer.domElement.clientHeight - mouse.y;

		let raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(nmouse, camera);
		let ray = raycaster.ray;

		let selectedPointcloud = null;
		let closestDistance = Infinity;
		let closestIntersection = null;
		let closestPoint = null;

		for(let pointcloud of pointclouds)
		{
			let point = pointcloud.pick(viewer, camera, ray, pickParams);

			if(!point)
			{
				continue;
			}

			let distance = camera.position.distanceTo(point.position);

			if(distance < closestDistance)
			{
				closestDistance = distance;
				selectedPointcloud = pointcloud;
				closestIntersection = point.position;
				closestPoint = point;
			}
		}

		if(selectedPointcloud)
		{
			return {
				location: closestIntersection,
				distance: closestDistance,
				pointcloud: selectedPointcloud,
				point: closestPoint
			};
		}
		else
		{
			return null;
		}
	};

	static pixelsArrayToImage(pixels, width, height)
	{
		let canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;

		let context = canvas.getContext("2d");

		pixels = new pixels.constructor(pixels);

		for(let i = 0; i < pixels.length; i++)
		{
			pixels[i * 4 + 3] = 255;
		}

		let imageData = context.createImageData(width, height);
		imageData.data.set(pixels);
		context.putImageData(imageData, 0, 0);

		let img = new Image();
		img.src = canvas.toDataURL();
		// img.style.transform = "scaleY(-1)";

		return img;
	};

	static pixelsArrayToDataUrl(pixels, width, height)
	{
		let canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;

		let context = canvas.getContext("2d");

		pixels = new pixels.constructor(pixels);

		for(let i = 0; i < pixels.length; i++)
		{
			pixels[i * 4 + 3] = 255;
		}

		let imageData = context.createImageData(width, height);
		imageData.data.set(pixels);
		context.putImageData(imageData, 0, 0);

		let dataURL = canvas.toDataURL();

		return dataURL;
	};

	static pixelsArrayToCanvas(pixels, width, height)
	{
		let canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;

		let context = canvas.getContext("2d");

		pixels = new pixels.constructor(pixels);

		//for (let i = 0; i < pixels.length; i++) {
		//	pixels[i * 4 + 3] = 255;
		//}

		// flip vertically
		let bytesPerLine = width * 4;
		for(let i = 0; i < parseInt(height / 2); i++)
		{
			let j = height - i - 1;

			let lineI = pixels.slice(i * bytesPerLine, i * bytesPerLine + bytesPerLine);
			let lineJ = pixels.slice(j * bytesPerLine, j * bytesPerLine + bytesPerLine);
			pixels.set(lineJ, i * bytesPerLine);
			pixels.set(lineI, j * bytesPerLine);
		}

		let imageData = context.createImageData(width, height);
		imageData.data.set(pixels);
		context.putImageData(imageData, 0, 0);

		return canvas;
	};

	static mouseToRay(mouse, camera, width, height)
	{

		let normalizedMouse = {
			x: (mouse.x / width) * 2 - 1,
			y: -(mouse.y / height) * 2 + 1
		};

		let vector = new THREE.Vector3(normalizedMouse.x, normalizedMouse.y, 0.5);
		let origin = new THREE.Vector3(normalizedMouse.x, normalizedMouse.y, 0);
		vector.unproject(camera);
		origin.unproject(camera);
		let direction = new THREE.Vector3().subVectors(vector, origin).normalize();

		let ray = new THREE.Ray(origin, direction);

		return ray;
	}

	static projectedRadius(radius, camera, distance, screenWidth, screenHeight)
	{
		if(camera instanceof THREE.OrthographicCamera)
		{
			return Potree.utils.projectedRadiusOrtho(radius, camera.projectionMatrix, screenWidth, screenHeight);
		}
		else if(camera instanceof THREE.PerspectiveCamera)
		{
			return Potree.utils.projectedRadiusPerspective(radius, camera.fov * Math.PI / 180, distance, screenHeight);
		}
		else
		{
			throw new Error("invalid parameters");
		}
	}

	static projectedRadiusPerspective(radius, fov, distance, screenHeight)
	{
		let projFactor = (1 / Math.tan(fov / 2)) / distance;
		projFactor = projFactor * screenHeight / 2;

		return radius * projFactor;
	};

	static projectedRadiusOrtho(radius, proj, screenWidth, screenHeight)
	{
		let p1 = new THREE.Vector4(0);
		let p2 = new THREE.Vector4(radius);

		p1.applyMatrix4(proj);
		p2.applyMatrix4(proj);
		p1 = new THREE.Vector3(p1.x, p1.y, p1.z);
		p2 = new THREE.Vector3(p2.x, p2.y, p2.z);
		p1.x = (p1.x + 1.0) * 0.5 * screenWidth;
		p1.y = (p1.y + 1.0) * 0.5 * screenHeight;
		p2.x = (p2.x + 1.0) * 0.5 * screenWidth;
		p2.y = (p2.y + 1.0) * 0.5 * screenHeight;
		return p1.distanceTo(p2);
	}

	static topView(camera, node)
	{
		camera.position.set(0, 1, 0);
		camera.rotation.set(-Math.PI / 2, 0, 0);
		camera.zoomTo(node, 1);
	};

	static frontView(camera, node)
	{
		camera.position.set(0, 0, 1);
		camera.rotation.set(0, 0, 0);
		camera.zoomTo(node, 1);
	};

	static leftView(camera, node)
	{
		camera.position.set(-1, 0, 0);
		camera.rotation.set(0, -Math.PI / 2, 0);
		camera.zoomTo(node, 1);
	};

	static rightView(camera, node)
	{
		camera.position.set(1, 0, 0);
		camera.rotation.set(0, Math.PI / 2, 0);
		camera.zoomTo(node, 1);
	};

	/**
	 *
	 * 0: no intersection
	 * 1: intersection
	 * 2: fully inside
	 */
	static frustumSphereIntersection(frustum, sphere)
	{
		let planes = frustum.planes;
		let center = sphere.center;
		let negRadius = -sphere.radius;

		let minDistance = Number.MAX_VALUE;

		for(let i = 0; i < 6; i++)
		{
			let distance = planes[i].distanceToPoint(center);

			if(distance < negRadius)
			{
				return 0;
			}

			minDistance = Math.min(minDistance, distance);
		}

		return(minDistance >= sphere.radius) ? 2 : 1;
	};

	// code taken from three.js
	// ImageUtils - generateDataTexture()
	static generateDataTexture(width, height, color)
	{
		let size = width * height;
		let data = new Uint8Array(4 * width * height);

		let r = Math.floor(color.r * 255);
		let g = Math.floor(color.g * 255);
		let b = Math.floor(color.b * 255);

		for(let i = 0; i < size; i++)
		{
			data[i * 3] = r;
			data[i * 3 + 1] = g;
			data[i * 3 + 2] = b;
		}

		let texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
		texture.needsUpdate = true;
		texture.magFilter = THREE.NearestFilter;

		return texture;
	};
};


Potree.Version = function(version)
{
	this.version = version;
	let vmLength = (version.indexOf(".") === -1) ? version.length : version.indexOf(".");
	this.versionMajor = parseInt(version.substr(0, vmLength));
	this.versionMinor = parseInt(version.substr(vmLength + 1));
	if(this.versionMinor.length === 0)
	{
		this.versionMinor = 0;
	}
};

Potree.Version.prototype.newerThan = function(version)
{
	let v = new Potree.Version(version);

	if(this.versionMajor > v.versionMajor)
	{
		return true;
	}
	else if(this.versionMajor === v.versionMajor && this.versionMinor > v.versionMinor)
	{
		return true;
	}
	else
	{
		return false;
	}
};

Potree.Version.prototype.equalOrHigher = function(version)
{
	let v = new Potree.Version(version);

	if(this.versionMajor > v.versionMajor)
	{
		return true;
	}
	else if(this.versionMajor === v.versionMajor && this.versionMinor >= v.versionMinor)
	{
		return true;
	}
	else
	{
		return false;
	}
};

Potree.Version.prototype.upTo = function(version)
{
	return !this.newerThan(version);
};

Potree.PointCloudArena4DNode = class PointCloudArena4DNode extends Potree.PointCloudTreeNode
{
	constructor()
	{
		super();

		this.left = null;
		this.right = null;
		this.sceneNode = null;
		this.kdtree = null;
	}

	getNumPoints()
	{
		return this.geometryNode.numPoints;
	}

	isLoaded()
	{
		return true;
	}

	isTreeNode()
	{
		return true;
	}

	isGeometryNode()
	{
		return false;
	}

	getLevel()
	{
		return this.geometryNode.level;
	}

	getBoundingSphere()
	{
		return this.geometryNode.boundingSphere;
	}

	getBoundingBox()
	{
		return this.geometryNode.boundingBox;
	}

	toTreeNode(child)
	{
		let geometryNode = null;

		if(this.left === child)
		{
			geometryNode = this.left;
		}
		else if(this.right === child)
		{
			geometryNode = this.right;
		}

		if(!geometryNode.loaded)
		{
			return;
		}

		let node = new Potree.PointCloudArena4DNode();
		let sceneNode = THREE.PointCloud(geometryNode.geometry, this.kdtree.material);
		sceneNode.visible = false;

		node.kdtree = this.kdtree;
		node.geometryNode = geometryNode;
		node.sceneNode = sceneNode;
		node.parent = this;
		node.left = this.geometryNode.left;
		node.right = this.geometryNode.right;
	}

	getChildren()
	{
		let children = [];

		if(this.left)
		{
			children.push(this.left);
		}

		if(this.right)
		{
			children.push(this.right);
		}

		return children;
	}
};

Potree.PointCloudArena4D = class PointCloudArena4D extends Potree.PointCloudTree
{
	constructor(geometry)
	{
		super();

		this.root = null;
		if(geometry.root)
		{
			this.root = geometry.root;
		}
		else
		{
			geometry.addEventListener("hierarchy_loaded", () =>
			{
				this.root = geometry.root;
			});
		}

		this.visiblePointsTarget = 2 * 1000 * 1000;
		this.minimumNodePixelSize = 150;

		this.position.sub(geometry.offset);
		this.updateMatrix();

		this.numVisibleNodes = 0;
		this.numVisiblePoints = 0;

		this.boundingBoxNodes = [];
		this.loadQueue = [];
		this.visibleNodes = [];

		this.pcoGeometry = geometry;
		this.boundingBox = this.pcoGeometry.boundingBox;
		this.boundingSphere = this.pcoGeometry.boundingSphere;
		this.material = new Potree.PointCloudMaterial(
		{
			vertexColors: THREE.VertexColors,
			size: 0.05,
			treeType: Potree.TreeType.KDTREE
		});
		this.material.sizeType = Potree.PointSizeType.ATTENUATED;
		this.material.size = 0.05;
		this.profileRequests = [];
		this.name = "";
	}

	getBoundingBoxWorld()
	{
		this.updateMatrixWorld(true);
		let box = this.boundingBox;
		let transform = this.matrixWorld;
		let tBox = Potree.utils.computeTransformedBoundingBox(box, transform);

		return tBox;
	};

	setName(name)
	{
		if(this.name !== name)
		{
			this.name = name;
			this.dispatchEvent(
			{
				type: "name_changed",
				name: name,
				pointcloud: this
			});
		}
	}

	getName()
	{
		return this.name;
	}

	getLevel()
	{
		return this.level;
	}

	toTreeNode(geometryNode, parent)
	{
		let node = new Potree.PointCloudArena4DNode();

		let sceneNode = new THREE.Points(geometryNode.geometry, this.material);
		sceneNode.frustumCulled = true;
		sceneNode.onBeforeRender = (_this, scene, camera, geometry, material, group) =>
		{
			if(material.program)
			{
				_this.getContext().useProgram(material.program.program);

				if(material.program.getUniforms().map.level)
				{
					let level = geometryNode.getLevel();
					material.uniforms.level.value = level;
					material.program.getUniforms().map.level.setValue(_this.getContext(), level);
				}

				if(this.visibleNodeTextureOffsets && material.program.getUniforms().map.vnStart)
				{
					let vnStart = this.visibleNodeTextureOffsets.get(node);
					material.uniforms.vnStart.value = vnStart;
					material.program.getUniforms().map.vnStart.setValue(_this.getContext(), vnStart);
				}

				if(material.program.getUniforms().map.pcIndex)
				{
					let i = node.pcIndex ? node.pcIndex : this.visibleNodes.indexOf(node);
					material.uniforms.pcIndex.value = i;
					material.program.getUniforms().map.pcIndex.setValue(_this.getContext(), i);
				}
			}
		};

		node.geometryNode = geometryNode;
		node.sceneNode = sceneNode;
		node.pointcloud = this;
		node.left = geometryNode.left;
		node.right = geometryNode.right;

		if(!parent)
		{
			this.root = node;
			this.add(sceneNode);
		}
		else
		{
			parent.sceneNode.add(sceneNode);

			if(parent.left === geometryNode)
			{
				parent.left = node;
			}
			else if(parent.right === geometryNode)
			{
				parent.right = node;
			}
		}

		let disposeListener = function()
		{
			parent.sceneNode.remove(node.sceneNode);

			if(parent.left === node)
			{
				parent.left = geometryNode;
			}
			else if(parent.right === node)
			{
				parent.right = geometryNode;
			}
		};
		geometryNode.oneTimeDisposeHandlers.push(disposeListener);

		return node;
	}

	updateMaterial(material, visibleNodes, camera, renderer)
	{
		material.fov = camera.fov * (Math.PI / 180);
		material.screenWidth = renderer.domElement.clientWidth;
		material.screenHeight = renderer.domElement.clientHeight;
		material.spacing = this.pcoGeometry.spacing;
		material.near = camera.near;
		material.far = camera.far;

		// reduce shader source updates by setting maxLevel slightly higher than actually necessary
		if(this.maxLevel > material.levels)
		{
			material.levels = this.maxLevel + 2;
		}

		// material.uniforms.octreeSize.value = this.boundingBox.size().x;
		let bbSize = this.boundingBox.getSize(new THREE.Vector3());
		material.bbSize = [bbSize.x, bbSize.y, bbSize.z];
	}

	updateVisibleBounds()
	{

	}

	hideDescendants(object)
	{
		let stack = [];
		for(let i = 0; i < object.children.length; i++)
		{
			let child = object.children[i];
			if(child.visible)
			{
				stack.push(child);
			}
		}

		while(stack.length > 0)
		{
			let child = stack.shift();

			child.visible = false;
			if(child.boundingBoxNode)
			{
				child.boundingBoxNode.visible = false;
			}

			for(let i = 0; i < child.children.length; i++)
			{
				let childOfChild = child.children[i];
				if(childOfChild.visible)
				{
					stack.push(childOfChild);
				}
			}
		}
	}

	updateMatrixWorld(force)
	{
		// node.matrixWorld.multiplyMatrices( node.parent.matrixWorld, node.matrix );

		if(this.matrixAutoUpdate === true) this.updateMatrix();

		if(this.matrixWorldNeedsUpdate === true || force === true)
		{
			if(this.parent === undefined)
			{
				this.matrixWorld.copy(this.matrix);
			}
			else
			{
				this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
			}

			this.matrixWorldNeedsUpdate = false;

			force = true;
		}
	}

	nodesOnRay(nodes, ray)
	{
		let nodesOnRay = [];

		let _ray = ray.clone();
		for(let i = 0; i < nodes.length; i++)
		{
			let node = nodes[i];
			let sphere = node.getBoundingSphere(new THREE.Sphere()).clone().applyMatrix4(node.sceneNode.matrixWorld);
			// TODO Unused: let box = node.getBoundingBox().clone().applyMatrix4(node.sceneNode.matrixWorld);

			if(_ray.intersectsSphere(sphere))
			{
				nodesOnRay.push(node);
			}
			// if(_ray.isIntersectionBox(box)){
			//	nodesOnRay.push(node);
			// }
		}

		return nodesOnRay;
	}

	pick(viewer, camera, ray, params = {})
	{

		let renderer = viewer.renderer;
		let pRenderer = viewer.pRenderer;

		performance.mark("pick-start");

		let getVal = (a, b) => a !== undefined ? a : b;

		let pickWindowSize = getVal(params.pickWindowSize, 17);
		let pickOutsideClipRegion = getVal(params.pickOutsideClipRegion, false);

		let size = renderer.getSize(new THREE.Vector3());

		let width = Math.ceil(getVal(params.width, size.width));
		let height = Math.ceil(getVal(params.height, size.height));

		let pointSizeType = getVal(params.pointSizeType, this.material.pointSizeType);
		let pointSize = getVal(params.pointSize, this.material.size);

		let nodes = this.nodesOnRay(this.visibleNodes, ray);

		if(nodes.length === 0)
		{
			return null;
		}

		if(!this.pickState)
		{
			let scene = new THREE.Scene();

			let material = new Potree.PointCloudMaterial();
			material.pointColorType = Potree.PointColorType.POINT_INDEX;

			let renderTarget = new THREE.WebGLRenderTarget(
				1, 1,
				{
					minFilter: THREE.LinearFilter,
					magFilter: THREE.NearestFilter,
					format: THREE.RGBAFormat
				}
			);

			this.pickState = {
				renderTarget: renderTarget,
				material: material,
				scene: scene
			};
		};

		let pickState = this.pickState;
		let pickMaterial = pickState.material;

		{ // update pick material
			pickMaterial.pointSizeType = pointSizeType;
			pickMaterial.shape = this.material.shape;

			pickMaterial.size = pointSize;
			pickMaterial.uniforms.minSize.value = this.material.uniforms.minSize.value;
			pickMaterial.uniforms.maxSize.value = this.material.uniforms.maxSize.value;
			pickMaterial.classification = this.material.classification;
			if(params.pickClipped)
			{
				pickMaterial.clipBoxes = this.material.clipBoxes;
				if(this.material.clipTask === Potree.ClipTask.HIGHLIGHT)
				{
					pickMaterial.clipTask = Potree.ClipTask.NONE;
				}
				else
				{
					pickMaterial.clipTask = this.material.clipTask;
				}
			}
			else
			{
				pickMaterial.clipBoxes = [];
			}

			this.updateMaterial(pickMaterial, nodes, camera, renderer);
		}

		pickState.renderTarget.setSize(width, height);

		let pixelPos = new THREE.Vector2(params.x, params.y);

		let gl = renderer.getContext();
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(
			parseInt(pixelPos.x - (pickWindowSize - 1) / 2),
			parseInt(pixelPos.y - (pickWindowSize - 1) / 2),
			parseInt(pickWindowSize), parseInt(pickWindowSize));

		renderer.state.buffers.depth.setTest(pickMaterial.depthTest);
		renderer.state.buffers.depth.setMask(pickMaterial.depthWrite);
		renderer.state.setBlending(THREE.NoBlending);

		renderer.clearTarget(pickState.renderTarget, true, true, true);

		{ // RENDER
			renderer.setRenderTarget(pickState.renderTarget);
			gl.clearColor(0, 0, 0, 0);
			renderer.clearTarget(pickState.renderTarget, true, true, true);

			let tmp = this.material;
			this.material = pickMaterial;

			pRenderer.renderOctree(this, nodes, camera, pickState.renderTarget);

			this.material = tmp;
		}

		let clamp = (number, min, max) => Math.min(Math.max(min, number), max);

		let x = parseInt(clamp(pixelPos.x - (pickWindowSize - 1) / 2, 0, width));
		let y = parseInt(clamp(pixelPos.y - (pickWindowSize - 1) / 2, 0, height));
		let w = parseInt(Math.min(x + pickWindowSize, width) - x);
		let h = parseInt(Math.min(y + pickWindowSize, height) - y);

		let pixelCount = w * h;
		let buffer = new Uint8Array(4 * pixelCount);

		gl.readPixels(x, y, pickWindowSize, pickWindowSize, gl.RGBA, gl.UNSIGNED_BYTE, buffer);

		renderer.setRenderTarget(null);
		renderer.resetGLState();
		renderer.setScissorTest(false);
		gl.disable(gl.SCISSOR_TEST);

		let pixels = buffer;
		let ibuffer = new Uint32Array(buffer.buffer);

		// find closest hit inside pixelWindow boundaries
		let min = Number.MAX_VALUE;
		let hits = [];
		for(let u = 0; u < pickWindowSize; u++)
		{
			for(let v = 0; v < pickWindowSize; v++)
			{
				let offset = (u + v * pickWindowSize);
				let distance = Math.pow(u - (pickWindowSize - 1) / 2, 2) + Math.pow(v - (pickWindowSize - 1) / 2, 2);

				let pcIndex = pixels[4 * offset + 3];
				pixels[4 * offset + 3] = 0;
				let pIndex = ibuffer[offset];

				if(!(pcIndex === 0 && pIndex === 0) && (pcIndex !== undefined) && (pIndex !== undefined))
				{
					let hit = {
						pIndex: pIndex,
						pcIndex: pcIndex,
						distanceToCenter: distance
					};

					if(params.all)
					{
						hits.push(hit);
					}
					else
					{
						if(hits.length > 0)
						{
							if(distance < hits[0].distanceToCenter)
							{
								hits[0] = hit;
							}
						}
						else
						{
							hits.push(hit);
						}
					}

				}
			}
		}

		for(let hit of hits)
		{
			let point = {};

			if(!nodes[hit.pcIndex])
			{
				return null;
			}

			let node = nodes[hit.pcIndex];
			let pc = node.sceneNode;
			let geometry = node.geometryNode.geometry;

			for(let attributeName in geometry.attributes)
			{
				let attribute = geometry.attributes[attributeName];

				if(attributeName === "position")
				{
					let x = attribute.array[3 * hit.pIndex + 0];
					let y = attribute.array[3 * hit.pIndex + 1];
					let z = attribute.array[3 * hit.pIndex + 2];

					let position = new THREE.Vector3(x, y, z);
					position.applyMatrix4(pc.matrixWorld);

					point[attributeName] = position;
				}

			}

			hit.point = point;
		}

		performance.mark("pick-end");
		performance.measure("pick", "pick-start", "pick-end");

		if(params.all)
		{
			return hits.map(hit => hit.point);
		}
		else
		{
			if(hits.length === 0)
			{
				return null;
			}
			else
			{
				return hits[0].point;
			}
		}
	}

	computeVisibilityTextureData(nodes)
	{

		if(Potree.measureTimings) performance.mark("computeVisibilityTextureData-start");

		let data = new Uint8Array(nodes.length * 3);
		let visibleNodeTextureOffsets = new Map();

		// copy array
		nodes = nodes.slice();

		// sort by level and number
		let sort = function(a, b)
		{
			let la = a.geometryNode.level;
			let lb = b.geometryNode.level;
			let na = a.geometryNode.number;
			let nb = b.geometryNode.number;
			if(la !== lb) return la - lb;
			if(na < nb) return -1;
			if(na > nb) return 1;
			return 0;
		};
		nodes.sort(sort);

		let visibleNodeNames = [];
		for(let i = 0; i < nodes.length; i++)
		{
			visibleNodeNames.push(nodes[i].geometryNode.number);
		}

		for(let i = 0; i < nodes.length; i++)
		{
			let node = nodes[i];

			visibleNodeTextureOffsets.set(node, i);

			let b1 = 0; // children
			let b2 = 0; // offset to first child
			let b3 = 0; // split

			if(node.geometryNode.left && visibleNodeNames.indexOf(node.geometryNode.left.number) > 0)
			{
				b1 += 1;
				b2 = visibleNodeNames.indexOf(node.geometryNode.left.number) - i;
			}
			if(node.geometryNode.right && visibleNodeNames.indexOf(node.geometryNode.right.number) > 0)
			{
				b1 += 2;
				b2 = (b2 === 0) ? visibleNodeNames.indexOf(node.geometryNode.right.number) - i : b2;
			}

			if(node.geometryNode.split === "X")
			{
				b3 = 1;
			}
			else if(node.geometryNode.split === "Y")
			{
				b3 = 2;
			}
			else if(node.geometryNode.split === "Z")
			{
				b3 = 4;
			}

			data[i * 3 + 0] = b1;
			data[i * 3 + 1] = b2;
			data[i * 3 + 2] = b3;
		}

		if(Potree.measureTimings)
		{
			performance.mark("computeVisibilityTextureData-end");
			performance.measure("render.computeVisibilityTextureData", "computeVisibilityTextureData-start", "computeVisibilityTextureData-end");
		}

		return {
			data: data,
			offsets: visibleNodeTextureOffsets
		};
	}

	get progress()
	{
		if(this.pcoGeometry.root)
		{
			return Potree.numNodesLoading > 0 ? 0 : 1;
		}
		else
		{
			return 0;
		}
	}
};

Potree.PointCloudArena4DGeometryNode = class PointCloudArena4DGeometryNode
{

	constructor()
	{
		this.left = null;
		this.right = null;
		this.boundingBox = null;
		this.number = null;
		this.pcoGeometry = null;
		this.loaded = false;
		this.numPoints = 0;
		this.level = 0;
		this.children = [];
		this.oneTimeDisposeHandlers = [];
	}

	isGeometryNode()
	{
		return true;
	}

	isTreeNode()
	{
		return false;
	}

	isLoaded()
	{
		return this.loaded;
	}

	getBoundingSphere()
	{
		return this.boundingSphere;
	}

	getBoundingBox()
	{
		return this.boundingBox;
	}

	getChildren()
	{
		let children = [];

		if(this.left)
		{
			children.push(this.left);
		}

		if(this.right)
		{
			children.push(this.right);
		}

		return children;
	}

	getLevel()
	{
		return this.level;
	}

	load()
	{
		if(this.loaded || this.loading)
		{
			return;
		}

		if(Potree.numNodesLoading >= Potree.maxNodesLoading)
		{
			return;
		}

		this.loading = true;

		Potree.numNodesLoading++;

		let url = this.pcoGeometry.url + "?node=" + this.number;
		let xhr = Potree.XHRFactory.createXMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";

		let node = this;

		xhr.onreadystatechange = function()
		{
			if(!(xhr.readyState === 4 && xhr.status === 200))
			{
				return;
			}

			let buffer = xhr.response;
			let sourceView = new DataView(buffer);
			let numPoints = buffer.byteLength / 17;
			let bytesPerPoint = 28;

			let data = new ArrayBuffer(numPoints * bytesPerPoint);
			let targetView = new DataView(data);

			let attributes = [
				Potree.PointAttribute.POSITION_CARTESIAN,
				Potree.PointAttribute.RGBA_PACKED,
				Potree.PointAttribute.INTENSITY,
				Potree.PointAttribute.CLASSIFICATION,
			];

			let position = new Float32Array(numPoints * 3);
			let color = new Uint8Array(numPoints * 4);
			let intensities = new Float32Array(numPoints);
			let classifications = new Uint8Array(numPoints);
			let indices = new ArrayBuffer(numPoints * 4);
			let u32Indices = new Uint32Array(indices);

			let tightBoundingBox = new THREE.Box3();

			for(let i = 0; i < numPoints; i++)
			{
				let x = sourceView.getFloat32(i * 17 + 0, true) + node.boundingBox.min.x;
				let y = sourceView.getFloat32(i * 17 + 4, true) + node.boundingBox.min.y;
				let z = sourceView.getFloat32(i * 17 + 8, true) + node.boundingBox.min.z;

				let r = sourceView.getUint8(i * 17 + 12, true);
				let g = sourceView.getUint8(i * 17 + 13, true);
				let b = sourceView.getUint8(i * 17 + 14, true);

				let intensity = sourceView.getUint8(i * 17 + 15, true);

				let classification = sourceView.getUint8(i * 17 + 16, true);

				tightBoundingBox.expandByPoint(new THREE.Vector3(x, y, z));

				position[i * 3 + 0] = x;
				position[i * 3 + 1] = y;
				position[i * 3 + 2] = z;

				color[i * 4 + 0] = r;
				color[i * 4 + 1] = g;
				color[i * 4 + 2] = b;
				color[i * 4 + 3] = 255;

				intensities[i] = intensity;
				classifications[i] = classification;

				u32Indices[i] = i;
			}

			let geometry = new THREE.BufferGeometry();

			geometry.addAttribute("position", new THREE.BufferAttribute(position, 3));
			geometry.addAttribute("color", new THREE.BufferAttribute(color, 4, true));
			geometry.addAttribute("intensity", new THREE.BufferAttribute(intensities, 1));
			geometry.addAttribute("classification", new THREE.BufferAttribute(classifications, 1));
			{
				let bufferAttribute = new THREE.BufferAttribute(new Uint8Array(indices), 4, true);
				//bufferAttribute.normalized = true;
				geometry.addAttribute("indices", bufferAttribute);
			}

			node.geometry = geometry;
			node.numPoints = numPoints;
			node.loaded = true;
			node.loading = false;
			Potree.numNodesLoading--;
		};

		xhr.send(null);
	}

	dispose()
	{
		if(this.geometry && this.parent != null)
		{
			this.geometry.dispose();
			this.geometry = null;
			this.loaded = false;

			// this.dispatchEvent( { type: "dispose" } );
			for(let i = 0; i < this.oneTimeDisposeHandlers.length; i++)
			{
				let handler = this.oneTimeDisposeHandlers[i];
				handler();
			}
			this.oneTimeDisposeHandlers = [];
		}
	}

	getNumPoints()
	{
		return this.numPoints;
	}
};

Potree.PointCloudArena4DGeometry = class PointCloudArena4DGeometry extends THREE.EventDispatcher
{

	constructor()
	{
		super();

		this.numPoints = 0;
		this.version = 0;
		this.boundingBox = null;
		this.numNodes = 0;
		this.name = null;
		this.provider = null;
		this.url = null;
		this.root = null;
		this.levels = 0;
		this._spacing = null;
		this.pointAttributes = new Potree.PointAttributes([
			"POSITION_CARTESIAN",
			"COLOR_PACKED"
		]);
	}

	static load(url, callback)
	{
		let xhr = Potree.XHRFactory.createXMLHttpRequest();
		xhr.open("GET", url + "?info", true);

		xhr.onreadystatechange = function()
		{
			try
			{
				if(xhr.readyState === 4 && xhr.status === 200)
				{
					let response = JSON.parse(xhr.responseText);

					let geometry = new Potree.PointCloudArena4DGeometry();
					geometry.url = url;
					geometry.name = response.Name;
					geometry.provider = response.Provider;
					geometry.numNodes = response.Nodes;
					geometry.numPoints = response.Points;
					geometry.version = response.Version;
					geometry.boundingBox = new THREE.Box3(
						new THREE.Vector3().fromArray(response.BoundingBox.slice(0, 3)),
						new THREE.Vector3().fromArray(response.BoundingBox.slice(3, 6))
					);
					if(response.Spacing)
					{
						geometry.spacing = response.Spacing;
					}

					let offset = geometry.boundingBox.min.clone().multiplyScalar(-1);

					geometry.boundingBox.min.add(offset);
					geometry.boundingBox.max.add(offset);
					geometry.offset = offset;

					let center = geometry.boundingBox.getCenter();
					let radius = geometry.boundingBox.getSize(new THREE.Vector3()).length() / 2;
					geometry.boundingSphere = new THREE.Sphere(center, radius);

					geometry.loadHierarchy();

					callback(geometry);
				}
				else if(xhr.readyState === 4)
				{
					callback(null);
				}
			}
			catch(e)
			{
				console.error(e.message);
				callback(null);
			}
		};

		xhr.send(null);
	};

	loadHierarchy()
	{
		let url = this.url + "?tree";
		let xhr = Potree.XHRFactory.createXMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";

		xhr.onreadystatechange = () =>
		{
			if(!(xhr.readyState === 4 && xhr.status === 200))
			{
				return;
			}

			let buffer = xhr.response;
			let numNodes = buffer.byteLength / 3;
			let view = new DataView(buffer);
			let stack = [];
			let root = null;

			let levels = 0;

			// TODO Debug: let start = new Date().getTime();
			// read hierarchy
			for(let i = 0; i < numNodes; i++)
			{
				let mask = view.getUint8(i * 3 + 0, true);

				let hasLeft = (mask & 1) > 0;
				let hasRight = (mask & 2) > 0;
				let splitX = (mask & 4) > 0;
				let splitY = (mask & 8) > 0;
				let splitZ = (mask & 16) > 0;
				let split = null;
				if(splitX)
				{
					split = "X";
				}
				else if(splitY)
				{
					split = "Y";
				}
				if(splitZ)
				{
					split = "Z";
				}

				let node = new Potree.PointCloudArena4DGeometryNode();
				node.hasLeft = hasLeft;
				node.hasRight = hasRight;
				node.split = split;
				node.isLeaf = !hasLeft && !hasRight;
				node.number = i;
				node.left = null;
				node.right = null;
				node.pcoGeometry = this;
				node.level = stack.length;
				levels = Math.max(levels, node.level);

				if(stack.length > 0)
				{
					let parent = stack[stack.length - 1];
					node.boundingBox = parent.boundingBox.clone();
					let parentBBSize = parent.boundingBox.getSize(new THREE.Vector3());

					if(parent.hasLeft && !parent.left)
					{
						parent.left = node;
						parent.children.push(node);

						if(parent.split === "X")
						{
							node.boundingBox.max.x = node.boundingBox.min.x + parentBBSize.x / 2;
						}
						else if(parent.split === "Y")
						{
							node.boundingBox.max.y = node.boundingBox.min.y + parentBBSize.y / 2;
						}
						else if(parent.split === "Z")
						{
							node.boundingBox.max.z = node.boundingBox.min.z + parentBBSize.z / 2;
						}

						let center = node.boundingBox.getCenter();
						let radius = node.boundingBox.getSize(new THREE.Vector3()).length() / 2;
						node.boundingSphere = new THREE.Sphere(center, radius);
					}
					else
					{
						parent.right = node;
						parent.children.push(node);

						if(parent.split === "X")
						{
							node.boundingBox.min.x = node.boundingBox.min.x + parentBBSize.x / 2;
						}
						else if(parent.split === "Y")
						{
							node.boundingBox.min.y = node.boundingBox.min.y + parentBBSize.y / 2;
						}
						else if(parent.split === "Z")
						{
							node.boundingBox.min.z = node.boundingBox.min.z + parentBBSize.z / 2;
						}

						let center = node.boundingBox.getCenter();
						let radius = node.boundingBox.getSize(new THREE.Vector3()).length() / 2;
						node.boundingSphere = new THREE.Sphere(center, radius);
					}
				}
				else
				{
					root = node;
					root.boundingBox = this.boundingBox.clone();
					let center = root.boundingBox.getCenter();
					let radius = root.boundingBox.getSize(new THREE.Vector3()).length() / 2;
					root.boundingSphere = new THREE.Sphere(center, radius);
				}

				let bbSize = node.boundingBox.getSize(new THREE.Vector3());
				node.spacing = ((bbSize.x + bbSize.y + bbSize.z) / 3) / 75;
				node.estimatedSpacing = node.spacing;

				stack.push(node);

				if(node.isLeaf)
				{
					let done = false;
					while(!done && stack.length > 0)
					{
						stack.pop();

						let top = stack[stack.length - 1];

						done = stack.length > 0 && top.hasRight && top.right == null;
					}
				}
			}

			this.root = root;
			this.levels = levels;

			this.dispatchEvent(
			{
				type: "hierarchy_loaded"
			});
		};

		xhr.send(null);
	};

	get spacing()
	{
		if(this._spacing)
		{
			return this._spacing;
		}
		else if(this.root)
		{
			return this.root.spacing;
		}
	}

	set spacing(value)
	{
		this._spacing = value;
	}

};

Potree.GLProgram = class GLProgram
{
	constructor(gl, material)
	{
		this.gl = gl;
		this.material = material;
		this.program = gl.createProgram();;

		this.recompile();
	}

	compileShader(type, source)
	{
		let gl = this.gl;

		let vs = gl.createShader(type);

		gl.shaderSource(vs, source);
		gl.compileShader(vs);

		let success = gl.getShaderParameter(vs, gl.COMPILE_STATUS);
		if(!success)
		{
			console.error("could not compile shader:");

			let log = gl.getShaderInfoLog(vs);
			console.error(log, source);

			return null;
		}

		return vs;
	}

	recompile()
	{
		let gl = this.gl;

		let vs = this.compileShader(gl.VERTEX_SHADER, this.material.vertexShader);
		let fs = this.compileShader(gl.FRAGMENT_SHADER, this.material.fragmentShader);

		if(vs === null || fs === null)
		{
			return;
		}

		// PROGRAM
		let program = this.program;
		gl.attachShader(program, vs);
		gl.attachShader(program, fs);
		gl.linkProgram(program);
		let success = gl.getProgramParameter(program, gl.LINK_STATUS);
		if(!success)
		{
			console.error("could not compile/link program:");
			console.error(this.material.vertexShader);
			console.error(this.material.fragmentShader);

			return;
		}

		gl.detachShader(program, vs);
		gl.detachShader(program, fs);
		gl.deleteShader(vs);
		gl.deleteShader(fs);

		gl.useProgram(program);

		// UNIFORMS
		let uniforms = {};
		let n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);

		for(let i = 0; i < n; i++)
		{
			let uniform = gl.getActiveUniform(program, i);
			let name = uniform.name;
			let loc = gl.getUniformLocation(program, name);

			uniforms[name] = loc;
		}

		this.uniforms = uniforms;
	}
};
