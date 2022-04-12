import {Vector3, Box3, Line3, Points, Box2, Sphere, Object3D, Matrix4, NoBlending, NearestFilter, Ray, Vector4} from "three";
import {HelperUtils} from "../utils/HelperUtils.js";
import {PointColorType} from "../Potree.js";
import {Global} from "../Global.js";
import {PointCloudOctreeGeometryNode} from "./geometries/PointCloudOctreeGeometry.js";
import {PointCloudTree, PointCloudTreeNode} from "./PointCloudTree.js";
import {PointCloudMaterial} from "./materials/PointCloudMaterial.js";
import {Scene, Vector2, WebGLRenderTarget} from "three";

class PointCloudOctreeNode extends PointCloudTreeNode
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
		var children = [];

		for (var i = 0; i < 8; i++)
		{
			if (this.children[i])
			{
				children.push(this.children[i]);
			}
		}

		return children;
	}

	getPointsInBox(boxNode)
	{

		if (!this.sceneNode)
		{
			return null;
		}

		var buffer = this.geometryNode.buffer;

		var posOffset = buffer.offset("position");
		var stride = buffer.stride;
		var view = new DataView(buffer.data);

		var worldToBox = new Matrix4().getInverse(boxNode.matrixWorld);
		var objectToBox = new Matrix4().multiplyMatrices(worldToBox, this.sceneNode.matrixWorld);

		var inBox = [];

		var pos = new Vector4();
		for (var i = 0; i < buffer.numElements; i++)
		{
			var x = view.getFloat32(i * stride + posOffset + 0, true);
			var y = view.getFloat32(i * stride + posOffset + 4, true);
			var z = view.getFloat32(i * stride + posOffset + 8, true);

			pos.set(x, y, z, 1);
			pos.applyMatrix4(objectToBox);

			if (-0.5 < pos.x && pos.x < 0.5)
			{
				if (-0.5 < pos.y && pos.y < 0.5)
				{
					if (-0.5 < pos.z && pos.z < 0.5)
					{
						pos.set(x, y, z, 1).applyMatrix4(this.sceneNode.matrixWorld);
						inBox.push(new Vector3(pos.x, pos.y, pos.z));
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

class PointCloudOctree extends PointCloudTree
{
	constructor(geometry, material)
	{
		super();

		this.pointBudget = Infinity;
		this.pcoGeometry = geometry;
		this.boundingBox = this.pcoGeometry.boundingBox;
		this.boundingSphere = this.boundingBox.getBoundingSphere(new Sphere());
		this.material = material || new PointCloudMaterial();
		this.visiblePointsTarget = 2 * 1000 * 1000;
		this.minimumNodePixelSize = 150;
		this.level = 0;
		this.position.copy(geometry.offset);
		this.updateMatrix();

		this.showBoundingBox = false;
		this.boundingBoxNodes = [];
		this.loadQueue = [];
		this.visibleBounds = new Box3();
		this.visibleNodes = [];
		this.visibleGeometry = [];
		this.generateDEM = false;
		this.profileRequests = [];
		this.name = "";

		this.tempVector3 = new Vector3();

		var box = [this.pcoGeometry.tightBoundingBox, this.getBoundingBoxWorld()].find((v) => {return v !== undefined;});

		this.updateMatrixWorld(true);
		box = HelperUtils.computeTransformedBoundingBox(box, this.matrixWorld);

		var bMin = box.min.z;
		var bMax = box.max.z;
		this.material.heightMin = bMin;
		this.material.heightMax = bMax;

		// TODO <read projection from file instead>
		this.projection = geometry.projection;

		this.root = this.pcoGeometry.root;
	}

	setName(name)
	{
		if (this.name !== name)
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
		var node = new PointCloudOctreeNode();
		var sceneNode = new Points(geometryNode.geometry, this.material);
		sceneNode.name = geometryNode.name;
		sceneNode.position.copy(geometryNode.boundingBox.min);
		sceneNode.frustumCulled = true;
		sceneNode.onBeforeRender = (renderer, scene, camera, geometry, material, group) =>
		{
			var vnStart = null;
			if (this.visibleNodeTextureOffsets)
			{
				vnStart = this.visibleNodeTextureOffsets.get(node);
			}

			var pcIndex = node.pcIndex ? node.pcIndex : this.visibleNodes.indexOf(node);
			var level = geometryNode.getLevel();
	
			material.uniforms.level.value = level;
			material.uniforms.vnStart.value = vnStart;
			material.uniforms.uPCIndex.value = pcIndex;
			this.updateMaterial(material, camera, renderer);
		};

		node.geometryNode = geometryNode;
		node.sceneNode = sceneNode;
		node.pointcloud = this;
		node.children = {};
		for (var key in geometryNode.children)
		{
			node.children[key] = geometryNode.children[key];
		}

		if (!parent)
		{
			this.root = node;
			this.add(sceneNode);
		}
		else
		{
			var childIndex = parseInt(geometryNode.name[geometryNode.name.length - 1]);
			parent.sceneNode.add(sceneNode);
			parent.children[childIndex] = node;
		}

		var disposeListener = function()
		{
			var childIndex = parseInt(geometryNode.name[geometryNode.name.length - 1]);
			parent.sceneNode.remove(node.sceneNode);
			parent.children[childIndex] = geometryNode;
		};
		geometryNode.oneTimeDisposeHandlers.push(disposeListener);


		return node;
	}

	updateVisibleBounds()
	{
		var leafNodes = [];
		for (var i = 0; i < this.visibleNodes.length; i++)
		{
			var node = this.visibleNodes[i];
			var isLeaf = true;

			for (var j = 0; j < node.children.length; j++)
			{
				var child = node.children[j];
				if (child instanceof PointCloudOctreeNode)
				{
					isLeaf = isLeaf && !child.sceneNode.visible;
				}
				else if (child instanceof PointCloudOctreeGeometryNode)
				{
					isLeaf = true;
				}
			}

			if (isLeaf)
			{
				leafNodes.push(node);
			}
		}

		this.visibleBounds.min = new Vector3(Infinity, Infinity, Infinity);
		this.visibleBounds.max = new Vector3(-Infinity, -Infinity, -Infinity);

		for (var i = 0; i < leafNodes.length; i++)
		{
			var node = leafNodes[i];
			this.visibleBounds.expandByPoint(node.getBoundingBox().min);
			this.visibleBounds.expandByPoint(node.getBoundingBox().max);
		}
	}

	updateMaterial(material, camera, renderer)
	{
		var octtreeSpacing = this.pcoGeometry.spacing * Math.max(this.scale.x, this.scale.y, this.scale.z);
		var octreeSize = this.pcoGeometry.boundingBox.getSize(new Vector3()).x;

		material.uniforms.fov.value = camera.fov * (Math.PI / 180);
		material.uniforms.uScreenWidth.value = renderer.domElement.clientWidth;
		material.uniforms.uScreenHeight.value = renderer.domElement.clientHeight;
		material.uniforms.uOctreeSpacing.value = octtreeSpacing;
		material.uniforms.near.value = camera.near;
		material.uniforms.far.value = camera.far;
		material.uniforms.octreeSize.value = octreeSize;

		material.uniformsNeedUpdate = true;
	}

	computeVisibilityTextureData(nodes, camera)
	{
		if (Global.measureTimings)
		{
			performance.mark("computeVisibilityTextureData-start");
		}

		var data = new Uint8Array(nodes.length * 4);
		var visibleNodeTextureOffsets = new Map();

		// copy array
		nodes = nodes.slice();

		// sort by level and index, e.g. r, r0, r3, r4, r01, r07, r30, ...
		var sort = function(a, b)
		{
			var na = a.geometryNode.name;
			var nb = b.geometryNode.name;
			if (na.length !== nb.length) {return na.length - nb.length;}
			if (na < nb) {return -1;}
			if (na > nb) {return 1;}
			return 0;
		};
		nodes.sort(sort);

		// code sample taken from js src/math/Ray.js
		var v1 = new Vector3();
		var intersectSphereBack = (ray, sphere) =>
		{
			v1.subVectors(sphere.center, ray.origin);
			var tca = v1.dot(ray.direction);
			var d2 = v1.dot(v1) - tca * tca;
			var radius2 = sphere.radius * sphere.radius;

			if (d2 > radius2)
			{
				return null;
			}

			var thc = Math.sqrt(radius2 - d2);

			// t1 = second intersect point - exit point on back of sphere
			var t1 = tca + thc;

			if (t1 < 0)
			{
				return null;
			}

			return t1;
		};

		var lodRanges = new Map();
		var leafNodeLodRanges = new Map();

		for (var i = 0; i < nodes.length; i++)
		{
			var node = nodes[i];

			visibleNodeTextureOffsets.set(node, i);

			var children = [];
			for (var j = 0; j < 8; j++)
			{
				var child = node.children[j];

				if (child && child.constructor === PointCloudOctreeNode && nodes.includes(child, i))
				{
					children.push(child);
				}
			}

			data[i * 4] = 0;
			data[i * 4 + 1] = 0;
			data[i * 4 + 2] = 0;
			data[i * 4 + 3] = node.getLevel();
			for (var j = 0; j < children.length; j++)
			{
				var child = children[j];
				var index = parseInt(child.geometryNode.name.substr(-1));
				data[i * 4] += Math.pow(2, index);

				if (j === 0)
				{
					var vArrayIndex = nodes.indexOf(child, i);

					data[i * 4 + 1] = vArrayIndex - i >> 8;
					data[i * 4 + 2] = (vArrayIndex - i) % 256;
				}
			}

			// TODO performance optimization
			// for some reason, this part can be extremely slow in chrome during a debugging session, but not during profiling
			var bBox = node.getBoundingBox().clone();
			// bBox.applyMatrix4(node.sceneNode.matrixWorld);
			// bBox.applyMatrix4(camera.matrixWorldInverse);
			var bSphere = bBox.getBoundingSphere(new Sphere());
			bSphere.applyMatrix4(node.sceneNode.matrixWorld);
			bSphere.applyMatrix4(camera.matrixWorldInverse);

			var ray = new Ray(camera.position, camera.getWorldDirection(this.tempVector3));
			var distance = intersectSphereBack(ray, bSphere);
			var distance2 = bSphere.center.distanceTo(camera.position) + bSphere.radius;
			if (distance === null)
			{
				distance = distance2;
			}
			distance = Math.max(distance, distance2);

			if (!lodRanges.has(node.getLevel()))
			{
				lodRanges.set(node.getLevel(), distance);
			}
			else
			{
				var prevDistance = lodRanges.get(node.getLevel());
				var newDistance = Math.max(prevDistance, distance);
				lodRanges.set(node.getLevel(), newDistance);
			}

			if (!node.geometryNode.hasChildren)
			{
				var value = {
					distance: distance,
					i: i
				};
				leafNodeLodRanges.set(node, value);
			}
		}

		for (var [node, value] of leafNodeLodRanges)
		{
			var level = node.getLevel();
			var distance = value.distance;
			var i = value.i;

			if (level < 4)
			{
				continue;
			}
			for (var [lod, range] of lodRanges)
			{
				if (distance < range * 1.2)
				{
					data[i * 4 + 3] = lod;
				}
			}
		}

		if (Global.measureTimings)
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
		var bbWorld = node.boundingBox.clone().applyMatrix4(this.matrixWorld);
		var bsWorld = bbWorld.getBoundingSphere(new Sphere());

		var intersects = false;

		for (var i = 0; i < profile.points.length - 1; i++)
		{

			var start = new Vector3(profile.points[i].x, profile.points[i].y, bsWorld.center.z);
			var end = new Vector3(profile.points[i + 1].x, profile.points[i + 1].y, bsWorld.center.z);

			var closest = new Line3(start, end).closestPointToPoint(bsWorld.center, true);
			var distance = closest.distanceTo(bsWorld.center);

			intersects = intersects || distance < bsWorld.radius + profile.width;
		}

		return intersects;
	}

	nodesOnRay(nodes, ray)
	{
		var nodesOnRay = [];

		var _ray = ray.clone();
		for (var i = 0; i < nodes.length; i++)
		{
			var node = nodes[i];
			// var inverseWorld = new Matrix4().getInverse(node.matrixWorld);
			// var sphere = node.getBoundingSphere(new Sphere()).clone().applyMatrix4(node.sceneNode.matrixWorld);
			var sphere = node.getBoundingSphere(new Sphere()).clone().applyMatrix4(this.matrixWorld);

			if (_ray.intersectsSphere(sphere))
			{
				nodesOnRay.push(node);
			}
		}

		return nodesOnRay;
	}

	updateMatrixWorld(force)
	{
		if (this.matrixAutoUpdate === true) {this.updateMatrix();}

		if (this.matrixWorldNeedsUpdate === true || force === true)
		{
			if (!this.parent)
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
		var stack = [];
		for (var i = 0; i < object.children.length; i++)
		{
			var child = object.children[i];
			if (child.visible)
			{
				stack.push(child);
			}
		}

		while (stack.length > 0)
		{
			var object = stack.shift();

			object.visible = false;

			for (var i = 0; i < object.children.length; i++)
			{
				var child = object.children[i];
				if (child.visible)
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
		var box = this.boundingBox;
		var transform = this.matrixWorld;
		var tBox = HelperUtils.computeTransformedBoundingBox(box, transform);

		this.position.set(0, 0, 0).sub(tBox.getCenter(new Vector3()));
	};

	moveToGroundPlane()
	{
		this.updateMatrixWorld(true);
		var box = this.boundingBox;
		var transform = this.matrixWorld;
		var tBox = HelperUtils.computeTransformedBoundingBox(box, transform);
		this.position.y += -tBox.min.y;
	};

	getBoundingBoxWorld()
	{
		this.updateMatrixWorld(true);
		var box = this.boundingBox;
		var transform = this.matrixWorld;
		var tBox = HelperUtils.computeTransformedBoundingBox(box, transform);

		return tBox;
	};

	/**
	 * returns points inside the profile points
	 *
	 * maxDepth:		search points up to the given octree depth
	 *
	 *
	 * The return value is an array with all segments of the profile path
	 *  var segment = {
	 * 		start: 	Vector3,
	 * 		end: 	Vector3,
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
		if (callback)
		{
			// var request = new Potree.ProfileRequest(this, profile, maxDepth, callback);
			// this.profileRequests.push(request);
			// return request;
		}

		var points = {
			segments: [],
			boundingBox: new Box3(),
			projectedBoundingBox: new Box2()
		};

		// evaluate segments
		for (var i = 0; i < profile.points.length - 1; i++)
		{
			var start = profile.points[i];
			var end = profile.points[i + 1];
			var ps = this.getProfile(start, end, profile.width, maxDepth);

			var segment = {
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
		var mileage = new Vector3();
		for (var i = 0; i < points.segments.length; i++)
		{
			var segment = points.segments[i];
			var start = segment.start;
			var end = segment.end;

			var project = (function(_start, _end, _mileage, _boundingBox)
			{
				var start = _start;
				var end = _end;
				var mileage = _mileage;
				var boundingBox = _boundingBox;

				var xAxis = new Vector3(1, 0, 0);
				var dir = new Vector3().subVectors(end, start);
				dir.y = 0;
				dir.normalize();
				var alpha = Math.acos(xAxis.dot(dir));
				if (dir.z > 0)
				{
					alpha = -alpha;
				}

				return function(position)
				{
					var toOrigin = new Matrix4().makeTranslation(-start.x, -boundingBox.min.y, -start.z);
					var alignWithX = new Matrix4().makeRotationY(-alpha);
					var applyMileage = new Matrix4().makeTranslation(mileage.x, 0, 0);

					var pos = position.clone();
					pos.applyMatrix4(toOrigin);
					pos.applyMatrix4(alignWithX);
					pos.applyMatrix4(applyMileage);

					return pos;
				};
			}(start, end, mileage.clone(), points.boundingBox.clone()));

			segment.project = project;

			mileage.x += new Vector3(start.x, 0, start.z).distanceTo(new Vector3(end.x, 0, end.z));
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
		// var request = new Potree.ProfileRequest(start, end, width, depth, callback);
		// this.profileRequests.push(request);
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
		var renderer = viewer.renderer;
		var pRenderer = viewer.pRenderer;

		performance.mark("pick-start");

		var getVal = (a, b) => {return a !== undefined ? a : b;};

		var pickWindowSize = getVal(params.pickWindowSize, 17);

		var size = renderer.getSize(new Vector3());

		var width = Math.ceil(getVal(params.width, size.width));
		var height = Math.ceil(getVal(params.height, size.height));

		var pointSizeType = getVal(params.pointSizeType, this.material.pointSizeType);
		var pointSize = getVal(params.pointSize, this.material.size);

		var nodes = this.nodesOnRay(this.visibleNodes, ray);

		if (nodes.length === 0)
		{
			return null;
		}

		if (!this.pickState)
		{
			var scene = new Scene();

			var material = new PointCloudMaterial();
			material.pointColorType = PointColorType.POINT_INDEX;

			var renderTarget = new WebGLRenderTarget(
				1, 1,
				{
					minFilter: LinearFilter,
					magFilter: NearestFilter,
					format: RGBAFormat
				}
			);

			this.pickState = {
				renderTarget: renderTarget,
				material: material,
				scene: scene
			};
		};

		var pickState = this.pickState;
		var pickMaterial = pickState.material;

		// Update pick material
		pickMaterial.pointSizeType = pointSizeType;
		pickMaterial.shape = this.material.shape;

		pickMaterial.size = pointSize;
		pickMaterial.uniforms.minSize.value = this.material.uniforms.minSize.value;
		pickMaterial.uniforms.maxSize.value = this.material.uniforms.maxSize.value;
		pickMaterial.classification = this.material.classification;
		pickMaterial.clippingPlanes = this.material.clippingPlanes;
		pickMaterial.clipping = this.material.clipping;

		this.updateMaterial(pickMaterial, camera, renderer);

		pickState.renderTarget.setSize(width, height);

		var pixelPos = new Vector2(params.x, params.y);

		var gl = renderer.getContext();
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(parseInt(pixelPos.x - (pickWindowSize - 1) / 2), parseInt(pixelPos.y - (pickWindowSize - 1) / 2), parseInt(pickWindowSize), parseInt(pickWindowSize));

		renderer.state.buffers.depth.setTest(pickMaterial.depthTest);
		renderer.state.buffers.depth.setMask(pickMaterial.depthWrite);
		renderer.state.setBlending(NoBlending);

		// Render
		renderer.setRenderTarget(pickState.renderTarget);
		gl.clearColor(0, 0, 0, 0);
		renderer.clearTarget(pickState.renderTarget, true, true, true);

		var tmp = this.material;
		this.material = pickMaterial;

		pRenderer.renderOctree(this, nodes, camera, pickState.renderTarget);

		this.material = tmp;

		var clamp = (number, min, max) => {return Math.min(Math.max(min, number), max);};

		var x = parseInt(clamp(pixelPos.x - (pickWindowSize - 1) / 2, 0, width));
		var y = parseInt(clamp(pixelPos.y - (pickWindowSize - 1) / 2, 0, height));
		var w = parseInt(Math.min(x + pickWindowSize, width) - x);
		var h = parseInt(Math.min(y + pickWindowSize, height) - y);

		var pixelCount = w * h;
		var buffer = new Uint8Array(4 * pixelCount);

		gl.readPixels(x, y, pickWindowSize, pickWindowSize, gl.RGBA, gl.UNSIGNED_BYTE, buffer);

		renderer.setRenderTarget(null);
		renderer.resetGLState();
		renderer.setScissorTest(false);
		gl.disable(gl.SCISSOR_TEST);

		var pixels = buffer;
		var ibuffer = new Uint32Array(buffer.buffer);

		// find closest hit inside pixelWindow boundaries
		var min = Number.MAX_VALUE;
		var hits = [];

		for (var u = 0; u < pickWindowSize; u++)
		{
			for (var v = 0; v < pickWindowSize; v++)
			{
				var offset = u + v * pickWindowSize;
				var distance = Math.pow(u - (pickWindowSize - 1) / 2, 2) + Math.pow(v - (pickWindowSize - 1) / 2, 2);

				var pcIndex = pixels[4 * offset + 3];
				pixels[4 * offset + 3] = 0;
				var pIndex = ibuffer[offset];

				if (!(pcIndex === 0 && pIndex === 0) && pcIndex !== undefined && pIndex !== undefined)
				{
					var hit = {
						pIndex: pIndex,
						pcIndex: pcIndex,
						distanceToCenter: distance
					};

					if (params.all)
					{
						hits.push(hit);
					}
					else
					{
						if (hits.length > 0)
						{
							if (distance < hits[0].distanceToCenter)
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

		for (var hit of hits)
		{
			var point = {};

			if (!nodes[hit.pcIndex])
			{
				return null;
			}

			var node = nodes[hit.pcIndex];
			var pc = node.sceneNode;
			var geometry = node.geometryNode.geometry;

			for (var attributeName in geometry.attributes)
			{
				var attribute = geometry.attributes[attributeName];

				if (attributeName === "position")
				{
					var x = attribute.array[3 * hit.pIndex];
					var y = attribute.array[3 * hit.pIndex + 1];
					var z = attribute.array[3 * hit.pIndex + 2];

					var position = new Vector3(x, y, z);
					position.applyMatrix4(pc.matrixWorld);

					point[attributeName] = position;
				}

				/*
				else if(attributeName === "indices")
				{

				}
				else
				{
					//if (values.itemSize === 1) {
					//	point[attribute.name] = values.array[hit.pIndex];
					//} else {
					//	var value = [];
					//	for (var j = 0; j < values.itemSize; j++) {
					//		value.push(values.array[values.itemSize * hit.pIndex + j]);
					//	}
					//	point[attribute.name] = value;
					//}
				}
				*/

			}

			hit.point = point;
		}

		performance.mark("pick-end");
		performance.measure("pick", "pick-start", "pick-end");

		if (params.all)
		{
			return hits.map((hit) => {return hit.point;});
		}
		else
		{
			if (hits.length === 0)
			{
				return null;
			}
			else
			{
				return hits[0].point;
				// var sorted = hits.sort((a, b) => a.distanceToCenter - b.distanceToCenter);
				// return sorted[0].point;
			}
		}

	};

	*getFittedBoxGen(boxNode)
	{
		var shrinkedLocalBounds = new Box3();
		var worldToBox = new Matrix4().getInverse(boxNode.matrixWorld);

		for (var node of this.visibleNodes)
		{
			if (!node.sceneNode)
			{
				continue;
			}

			var buffer = node.geometryNode.buffer;

			var posOffset = buffer.offset("position");
			var stride = buffer.stride;
			var view = new DataView(buffer.data);

			var objectToBox = new Matrix4().multiplyMatrices(worldToBox, node.sceneNode.matrixWorld);

			var pos = new Vector4();
			for (var i = 0; i < buffer.numElements; i++)
			{
				var x = view.getFloat32(i * stride + posOffset + 0, true);
				var y = view.getFloat32(i * stride + posOffset + 4, true);
				var z = view.getFloat32(i * stride + posOffset + 8, true);

				pos.set(x, y, z, 1);
				pos.applyMatrix4(objectToBox);

				if (-0.5 < pos.x && pos.x < 0.5)
				{
					if (-0.5 < pos.y && pos.y < 0.5)
					{
						if (-0.5 < pos.z && pos.z < 0.5)
						{
							shrinkedLocalBounds.expandByPoint(pos);
						}
					}
				}
			}

			yield;
		}


		var fittedPosition = shrinkedLocalBounds.getCenter(new Vector3()).applyMatrix4(boxNode.matrixWorld);

		var fitted = new Object3D();
		fitted.position.copy(fittedPosition);
		fitted.scale.copy(boxNode.scale);
		fitted.rotation.copy(boxNode.rotation);

		var ds = new Vector3().subVectors(shrinkedLocalBounds.max, shrinkedLocalBounds.min);
		fitted.scale.multiply(ds);

		yield fitted;
	}

	getFittedBox(boxNode, maxLevel = Infinity)
	{
		var shrinkedLocalBounds = new Box3();
		var worldToBox = new Matrix4().getInverse(boxNode.matrixWorld);

		for (var node of this.visibleNodes)
		{
			if (!node.sceneNode || node.getLevel() > maxLevel)
			{
				continue;
			}

			var buffer = node.geometryNode.buffer;

			var posOffset = buffer.offset("position");
			var stride = buffer.stride;
			var view = new DataView(buffer.data);

			var objectToBox = new Matrix4().multiplyMatrices(worldToBox, node.sceneNode.matrixWorld);

			var pos = new Vector4();
			for (var i = 0; i < buffer.numElements; i++)
			{
				var x = view.getFloat32(i * stride + posOffset + 0, true);
				var y = view.getFloat32(i * stride + posOffset + 4, true);
				var z = view.getFloat32(i * stride + posOffset + 8, true);

				pos.set(x, y, z, 1);
				pos.applyMatrix4(objectToBox);

				if (-0.5 < pos.x && pos.x < 0.5)
				{
					if (-0.5 < pos.y && pos.y < 0.5)
					{
						if (-0.5 < pos.z && pos.z < 0.5)
						{
							shrinkedLocalBounds.expandByPoint(pos);
						}
					}
				}
			}
		}

		var fittedPosition = shrinkedLocalBounds.getCenter(new Vector3()).applyMatrix4(boxNode.matrixWorld);

		var fitted = new Object3D();
		fitted.position.copy(fittedPosition);
		fitted.scale.copy(boxNode.scale);
		fitted.rotation.copy(boxNode.rotation);

		var ds = new Vector3().subVectors(shrinkedLocalBounds.max, shrinkedLocalBounds.min);
		fitted.scale.multiply(ds);

		return fitted;
	}

	get progress()
	{
		return this.visibleNodes.length / this.visibleGeometry.length;
	}

	find(name)
	{
		var node = null;
		for (var char of name)
		{
			if (char === "r")
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

export {PointCloudOctree, PointCloudOctreeNode};
