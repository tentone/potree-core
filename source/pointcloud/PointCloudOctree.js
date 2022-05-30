import {Vector3, Box3, Line3, Points, Box2, Sphere, Object3D, Matrix4, NoBlending, NearestFilter, Ray, Vector4, Scene, Vector2, WebGLRenderTarget} from 'three';
import {Utils} from '../utils/Utils';
import {PointColorType} from '../Enums';
import {Global} from '../Global';
import {PointCloudOctreeGeometryNode} from '../geometry/PointCloudOctreeGeometry';
import {PointCloudMaterial} from '../materials/PointCloudMaterial';
import {PointCloudTree, PointCloudTreeNode} from './PointCloudTree';

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
		const children = [];

		for (let i = 0; i < 8; i++)
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

		const buffer = this.geometryNode.buffer;

		const posOffset = buffer.offset('position');
		const stride = buffer.stride;
		const view = new DataView(buffer.data);

		const worldToBox = new Matrix4().getInverse(boxNode.matrixWorld);
		const objectToBox = new Matrix4().multiplyMatrices(worldToBox, this.sceneNode.matrixWorld);

		const inBox = [];

		const pos = new Vector4();
		for (let i = 0; i < buffer.numElements; i++)
		{
			const x = view.getFloat32(i * stride + posOffset + 0, true);
			const y = view.getFloat32(i * stride + posOffset + 4, true);
			const z = view.getFloat32(i * stride + posOffset + 8, true);

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
}

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
		this.name = '';

		this.tempVector3 = new Vector3();

		let box = [this.pcoGeometry.tightBoundingBox, this.getBoundingBoxWorld()].find((v) => {return v !== undefined;});

		this.updateMatrixWorld(true);
		box = Utils.computeTransformedBoundingBox(box, this.matrixWorld);

		const bMin = box.min.z;
		const bMax = box.max.z;
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
					type: 'name_changed',
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
		const node = new PointCloudOctreeNode();
		const sceneNode = new Points(geometryNode.geometry, this.material);
		sceneNode.name = geometryNode.name;
		sceneNode.position.copy(geometryNode.boundingBox.min);
		sceneNode.frustumCulled = true;
		sceneNode.onBeforeRender = (renderer, scene, camera, geometry, material, group) =>
		{
			let vnStart = null;
			if (this.visibleNodeTextureOffsets)
			{
				vnStart = this.visibleNodeTextureOffsets.get(node);
			}

			const pcIndex = node.pcIndex ? node.pcIndex : this.visibleNodes.indexOf(node);
			const level = geometryNode.getLevel();
	
			material.uniforms.level.value = level;
			material.uniforms.vnStart.value = vnStart;
			material.uniforms.uPCIndex.value = pcIndex;
			this.updateMaterial(material, camera, renderer);
		};

		node.geometryNode = geometryNode;
		node.sceneNode = sceneNode;
		node.pointcloud = this;
		node.children = {};
		for (const key in geometryNode.children)
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
			const childIndex = parseInt(geometryNode.name[geometryNode.name.length - 1]);
			parent.sceneNode.add(sceneNode);
			parent.children[childIndex] = node;
		}

		const disposeListener = function()
		{
			const childIndex = parseInt(geometryNode.name[geometryNode.name.length - 1]);
			parent.sceneNode.remove(node.sceneNode);
			parent.children[childIndex] = geometryNode;
		};
		geometryNode.oneTimeDisposeHandlers.push(disposeListener);


		return node;
	}

	updateVisibleBounds()
	{
		let i;
		let node;
		const leafNodes = [];
		for (i = 0; i < this.visibleNodes.length; i++)
		{
			node = this.visibleNodes[i];
			let isLeaf = true;

			for (let j = 0; j < node.children.length; j++)
			{
				const child = node.children[j];
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

		for (i = 0; i < leafNodes.length; i++)
		{
			node = leafNodes[i];
			this.visibleBounds.expandByPoint(node.getBoundingBox().min);
			this.visibleBounds.expandByPoint(node.getBoundingBox().max);
		}
	}

	updateMaterial(material, camera, renderer)
	{
		const octtreeSpacing = this.pcoGeometry.spacing * Math.max(this.scale.x, this.scale.y, this.scale.z);
		const octreeSize = this.pcoGeometry.boundingBox.getSize(new Vector3()).x;

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
			performance.mark('computeVisibilityTextureData-start');
		}

		const data = new Uint8Array(nodes.length * 4);
		const visibleNodeTextureOffsets = new Map();

		// copy array
		nodes = nodes.slice();

		// sort by level and index, e.g. r, r0, r3, r4, r01, r07, r30, ...
		const sort = function(a, b)
		{
			const na = a.geometryNode.name;
			const nb = b.geometryNode.name;
			if (na.length !== nb.length) {return na.length - nb.length;}
			if (na < nb) {return -1;}
			if (na > nb) {return 1;}
			return 0;
		};
		nodes.sort(sort);

		// code sample taken from js src/math/Ray.js
		const v1 = new Vector3();
		const intersectSphereBack = (ray, sphere) =>
		{
			v1.subVectors(sphere.center, ray.origin);
			const tca = v1.dot(ray.direction);
			const d2 = v1.dot(v1) - tca * tca;
			const radius2 = sphere.radius * sphere.radius;

			if (d2 > radius2)
			{
				return null;
			}

			const thc = Math.sqrt(radius2 - d2);

			// t1 = second intersect point - exit point on back of sphere
			const t1 = tca + thc;

			if (t1 < 0)
			{
				return null;
			}

			return t1;
		};

		const lodRanges = new Map();
		const leafNodeLodRanges = new Map();

		for (var i = 0; i < nodes.length; i++)
		{
			var node = nodes[i];

			visibleNodeTextureOffsets.set(node, i);

			const children = [];
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
				const index = parseInt(child.geometryNode.name.substr(-1));
				data[i * 4] += Math.pow(2, index);

				if (j === 0)
				{
					const vArrayIndex = nodes.indexOf(child, i);

					data[i * 4 + 1] = vArrayIndex - i >> 8;
					data[i * 4 + 2] = (vArrayIndex - i) % 256;
				}
			}

			// For some reason, this part can be extremely slow in chrome during a debugging session, but not during profiling
			const bBox = node.getBoundingBox().clone();
			// bBox.applyMatrix4(node.sceneNode.matrixWorld);
			// bBox.applyMatrix4(camera.matrixWorldInverse);

			const bSphere = bBox.getBoundingSphere(new Sphere());
			bSphere.applyMatrix4(node.sceneNode.matrixWorld);
			bSphere.applyMatrix4(camera.matrixWorldInverse);

			const ray = new Ray(camera.position, camera.getWorldDirection(this.tempVector3));
			var distance = intersectSphereBack(ray, bSphere);
			const distance2 = bSphere.center.distanceTo(camera.position) + bSphere.radius;
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
				const prevDistance = lodRanges.get(node.getLevel());
				const newDistance = Math.max(prevDistance, distance);
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
			const level = node.getLevel();
			var distance = value.distance;
			var i = value.i;

			if (level < 4)
			{
				continue;
			}
			for (const [lod, range] of lodRanges)
			{
				if (distance < range * 1.2)
				{
					data[i * 4 + 3] = lod;
				}
			}
		}

		if (Global.measureTimings)
		{
			performance.mark('computeVisibilityTextureData-end');
			performance.measure('render.computeVisibilityTextureData', 'computeVisibilityTextureData-start', 'computeVisibilityTextureData-end');
		}

		return {
			data: data,
			offsets: visibleNodeTextureOffsets
		};
	}

	nodeIntersectsProfile(node, profile)
	{
		const bbWorld = node.boundingBox.clone().applyMatrix4(this.matrixWorld);
		const bsWorld = bbWorld.getBoundingSphere(new Sphere());

		let intersects = false;

		for (let i = 0; i < profile.points.length - 1; i++)
		{

			const start = new Vector3(profile.points[i].x, profile.points[i].y, bsWorld.center.z);
			const end = new Vector3(profile.points[i + 1].x, profile.points[i + 1].y, bsWorld.center.z);

			const closest = new Vector3();
			new Line3(start, end).closestPointToPoint(bsWorld.center, true, closest);

			const distance = closest.distanceTo(bsWorld.center);

			intersects = intersects || distance < bsWorld.radius + profile.width;
		}

		return intersects;
	}

	nodesOnRay(nodes, ray)
	{
		const nodesOnRay = [];

		const _ray = ray.clone();
		for (let i = 0; i < nodes.length; i++)
		{
			const node = nodes[i];
			// var inverseWorld = new Matrix4().getInverse(node.matrixWorld);
			// var sphere = node.getBoundingSphere(new Sphere()).clone().applyMatrix4(node.sceneNode.matrixWorld);
			const sphere = node.getBoundingSphere(new Sphere()).clone().applyMatrix4(this.matrixWorld);

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
		const stack = [];
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
		const box = this.boundingBox;
		const transform = this.matrixWorld;
		const tBox = Utils.computeTransformedBoundingBox(box, transform);

		this.position.set(0, 0, 0).sub(tBox.getCenter(new Vector3()));
	};

	moveToGroundPlane()
	{
		this.updateMatrixWorld(true);
		const box = this.boundingBox;
		const transform = this.matrixWorld;
		const tBox = Utils.computeTransformedBoundingBox(box, transform);
		this.position.y += -tBox.min.y;
	};

	getBoundingBoxWorld()
	{
		this.updateMatrixWorld(true);
		const box = this.boundingBox;
		const transform = this.matrixWorld;
		const tBox = Utils.computeTransformedBoundingBox(box, transform);

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

		const points = {
			segments: [],
			boundingBox: new Box3(),
			projectedBoundingBox: new Box2()
		};

		// evaluate segments
		for (var i = 0; i < profile.points.length - 1; i++)
		{
			var start = profile.points[i];
			var end = profile.points[i + 1];
			const ps = this.getProfile(start, end, profile.width, maxDepth);

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
		const mileage = new Vector3();
		for (var i = 0; i < points.segments.length; i++)
		{
			var segment = points.segments[i];
			var start = segment.start;
			var end = segment.end;

			const project = (function(_start, _end, _mileage, _boundingBox)
			{
				const start = _start;
				const end = _end;
				const mileage = _mileage;
				const boundingBox = _boundingBox;

				const xAxis = new Vector3(1, 0, 0);
				const dir = new Vector3().subVectors(end, start);
				dir.y = 0;
				dir.normalize();
				let alpha = Math.acos(xAxis.dot(dir));
				if (dir.z > 0)
				{
					alpha = -alpha;
				}

				return function(position)
				{
					const toOrigin = new Matrix4().makeTranslation(-start.x, -boundingBox.min.y, -start.z);
					const alignWithX = new Matrix4().makeRotationY(-alpha);
					const applyMileage = new Matrix4().makeTranslation(mileage.x, 0, 0);

					const pos = position.clone();
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
		const renderer = viewer.renderer;
		const pRenderer = viewer.pRenderer;

		performance.mark('pick-start');

		const getVal = (a, b) => {return a !== undefined ? a : b;};

		const pickWindowSize = getVal(params.pickWindowSize, 17);

		const size = renderer.getSize(new Vector3());

		const width = Math.ceil(getVal(params.width, size.width));
		const height = Math.ceil(getVal(params.height, size.height));

		const pointSizeType = getVal(params.pointSizeType, this.material.pointSizeType);
		const pointSize = getVal(params.pointSize, this.material.size);

		const nodes = this.nodesOnRay(this.visibleNodes, ray);

		if (nodes.length === 0)
		{
			return null;
		}

		if (!this.pickState)
		{
			const scene = new Scene();

			const material = new PointCloudMaterial();
			material.pointColorType = PointColorType.POINT_INDEX;

			const renderTarget = new WebGLRenderTarget(
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
		}

		const pickState = this.pickState;
		const pickMaterial = pickState.material;

		// Update pick material
		pickMaterial.pointSizeType = pointSizeType;
		pickMaterial.shape = this.material.shape;

		pickMaterial.size = pointSize;
		pickMaterial.uniforms.minSize.value = this.material.uniforms.minSize.value;
		pickMaterial.uniforms.maxSize.value = this.material.uniforms.maxSize.value;

		this.updateMaterial(pickMaterial, camera, renderer);

		pickState.renderTarget.setSize(width, height);

		const pixelPos = new Vector2(params.x, params.y);

		const gl = renderer.getContext();
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(parseInt(pixelPos.x - (pickWindowSize - 1) / 2), parseInt(pixelPos.y - (pickWindowSize - 1) / 2), parseInt(pickWindowSize), parseInt(pickWindowSize));

		renderer.state.buffers.depth.setTest(pickMaterial.depthTest);
		renderer.state.buffers.depth.setMask(pickMaterial.depthWrite);
		renderer.state.setBlending(NoBlending);

		// Render
		renderer.setRenderTarget(pickState.renderTarget);
		gl.clearColor(0, 0, 0, 0);
		renderer.clearTarget(pickState.renderTarget, true, true, true);

		const tmp = this.material;
		this.material = pickMaterial;

		pRenderer.renderOctree(this, nodes, camera, pickState.renderTarget);

		this.material = tmp;

		const clamp = (number, min, max) => {return Math.min(Math.max(min, number), max);};

		var x = parseInt(clamp(pixelPos.x - (pickWindowSize - 1) / 2, 0, width));
		var y = parseInt(clamp(pixelPos.y - (pickWindowSize - 1) / 2, 0, height));
		const w = parseInt(Math.min(x + pickWindowSize, width) - x);
		const h = parseInt(Math.min(y + pickWindowSize, height) - y);

		const pixelCount = w * h;
		const buffer = new Uint8Array(4 * pixelCount);

		gl.readPixels(x, y, pickWindowSize, pickWindowSize, gl.RGBA, gl.UNSIGNED_BYTE, buffer);

		renderer.setRenderTarget(null);
		renderer.resetGLState();
		renderer.setScissorTest(false);
		gl.disable(gl.SCISSOR_TEST);

		const pixels = buffer;
		const ibuffer = new Uint32Array(buffer.buffer);

		// find closest hit inside pixelWindow boundaries
		const min = Number.MAX_VALUE;
		const hits = [];

		for (let u = 0; u < pickWindowSize; u++)
		{
			for (let v = 0; v < pickWindowSize; v++)
			{
				const offset = u + v * pickWindowSize;
				const distance = Math.pow(u - (pickWindowSize - 1) / 2, 2) + Math.pow(v - (pickWindowSize - 1) / 2, 2);

				const pcIndex = pixels[4 * offset + 3];
				pixels[4 * offset + 3] = 0;
				const pIndex = ibuffer[offset];

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
			const point = {};

			if (!nodes[hit.pcIndex])
			{
				return null;
			}

			const node = nodes[hit.pcIndex];
			const pc = node.sceneNode;
			const geometry = node.geometryNode.geometry;

			for (const attributeName in geometry.attributes)
			{
				const attribute = geometry.attributes[attributeName];

				if (attributeName === 'position')
				{
					var x = attribute.array[3 * hit.pIndex];
					var y = attribute.array[3 * hit.pIndex + 1];
					const z = attribute.array[3 * hit.pIndex + 2];

					const position = new Vector3(x, y, z);
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

		performance.mark('pick-end');
		performance.measure('pick', 'pick-start', 'pick-end');

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
		const shrinkedLocalBounds = new Box3();
		const worldToBox = new Matrix4().getInverse(boxNode.matrixWorld);

		for (const node of this.visibleNodes)
		{
			if (!node.sceneNode)
			{
				continue;
			}

			const buffer = node.geometryNode.buffer;

			const posOffset = buffer.offset('position');
			const stride = buffer.stride;
			const view = new DataView(buffer.data);

			const objectToBox = new Matrix4().multiplyMatrices(worldToBox, node.sceneNode.matrixWorld);

			const pos = new Vector4();
			for (let i = 0; i < buffer.numElements; i++)
			{
				const x = view.getFloat32(i * stride + posOffset + 0, true);
				const y = view.getFloat32(i * stride + posOffset + 4, true);
				const z = view.getFloat32(i * stride + posOffset + 8, true);

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


		const fittedPosition = shrinkedLocalBounds.getCenter(new Vector3()).applyMatrix4(boxNode.matrixWorld);

		const fitted = new Object3D();
		fitted.position.copy(fittedPosition);
		fitted.scale.copy(boxNode.scale);
		fitted.rotation.copy(boxNode.rotation);

		const ds = new Vector3().subVectors(shrinkedLocalBounds.max, shrinkedLocalBounds.min);
		fitted.scale.multiply(ds);

		yield fitted;
	}

	getFittedBox(boxNode, maxLevel = Infinity)
	{
		const shrinkedLocalBounds = new Box3();
		const worldToBox = new Matrix4().getInverse(boxNode.matrixWorld);

		for (const node of this.visibleNodes)
		{
			if (!node.sceneNode || node.getLevel() > maxLevel)
			{
				continue;
			}

			const buffer = node.geometryNode.buffer;

			const posOffset = buffer.offset('position');
			const stride = buffer.stride;
			const view = new DataView(buffer.data);

			const objectToBox = new Matrix4().multiplyMatrices(worldToBox, node.sceneNode.matrixWorld);

			const pos = new Vector4();
			for (let i = 0; i < buffer.numElements; i++)
			{
				const x = view.getFloat32(i * stride + posOffset + 0, true);
				const y = view.getFloat32(i * stride + posOffset + 4, true);
				const z = view.getFloat32(i * stride + posOffset + 8, true);

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

		const fittedPosition = shrinkedLocalBounds.getCenter(new Vector3()).applyMatrix4(boxNode.matrixWorld);

		const fitted = new Object3D();
		fitted.position.copy(fittedPosition);
		fitted.scale.copy(boxNode.scale);
		fitted.rotation.copy(boxNode.rotation);

		const ds = new Vector3().subVectors(shrinkedLocalBounds.max, shrinkedLocalBounds.min);
		fitted.scale.multiply(ds);

		return fitted;
	}

	get progress()
	{
		return this.visibleNodes.length / this.visibleGeometry.length;
	}

	find(name)
	{
		let node = null;
		for (const char of name)
		{
			if (char === 'r')
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
}

export {PointCloudOctree, PointCloudOctreeNode};
