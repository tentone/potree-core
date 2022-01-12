"use strict";

import * as THREE from 'three';

import { PointCloudOctreeGeometryNode } from "./geometries/PointCloudOctreeGeometry.js";
import { HelperUtils } from "../utils/HelperUtils.js";
import { PointCloudTree, PointCloudTreeNode } from "./PointCloudTree.js";
import { PointCloudMaterial } from "./materials/PointCloudMaterial.js";
import { PointColorType, PointSizeType, ClipTask, PointShape } from "../Potree.js";
import { Global } from "../Global.js";

class PointCloudOctreeNode extends PointCloudTreeNode {
	constructor() {
		super();

		this.children = {};
		this.sceneNode = null;
		this.octree = null;
	}

	getNumPoints() {
		return this.geometryNode.numPoints;
	}

	isLoaded() {
		return true;
	}

	isTreeNode() {
		return true;
	}

	isGeometryNode() {
		return false;
	}

	getLevel() {
		return this.geometryNode.level;
	}

	getBoundingSphere() {
		return this.geometryNode.boundingSphere;
	}

	getBoundingBox() {
		return this.geometryNode.boundingBox;
	}

	getChildren() {
		let children = [];

		for (let i = 0; i < 8; i++) {
			if (this.children[i]) {
				children.push(this.children[i]);
			}
		}

		return children;
	}

	getPointsInBox(boxNode) {

		if (!this.sceneNode) {
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
		for (let i = 0; i < buffer.numElements; i++) {
			let x = view.getFloat32(i * stride + posOffset + 0, true);
			let y = view.getFloat32(i * stride + posOffset + 4, true);
			let z = view.getFloat32(i * stride + posOffset + 8, true);

			pos.set(x, y, z, 1);
			pos.applyMatrix4(objectToBox);

			if (-0.5 < pos.x && pos.x < 0.5) {
				if (-0.5 < pos.y && pos.y < 0.5) {
					if (-0.5 < pos.z && pos.z < 0.5) {
						pos.set(x, y, z, 1).applyMatrix4(this.sceneNode.matrixWorld);
						inBox.push(new THREE.Vector3(pos.x, pos.y, pos.z));
					}
				}
			}
		}

		return inBox;
	}

	get name() {
		return this.geometryNode.name;
	}
};

class PointCloudOctree extends PointCloudTree {
	constructor(geometry, material) {
		super();

		this.pointBudget = Infinity;
		this.pcoGeometry = geometry;
		this.boundingBox = this.pcoGeometry.boundingBox;
		this.boundingSphere = this.boundingBox.getBoundingSphere(new THREE.Sphere());
		this.material = material || new PointCloudMaterial();
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

		this.tempVector3 = new THREE.Vector3();

		let box = [this.pcoGeometry.tightBoundingBox, this.getBoundingBoxWorld()].find(v => v !== undefined);

		this.updateMatrixWorld(true);
		box = HelperUtils.computeTransformedBoundingBox(box, this.matrixWorld);

		let bMin = box.min.z;
		let bMax = box.max.z;
		this.material.heightMin = bMin;
		this.material.heightMax = bMax;

		//TODO <read projection from file instead>
		this.projection = geometry.projection;

		this.root = this.pcoGeometry.root;
	}

	setName(name) {
		if (this.name !== name) {
			this.name = name;
			this.dispatchEvent(
				{
					type: "name_changed",
					name: name,
					pointcloud: this
				});
		}
	}

	getName() {
		return this.name;
	}

	toTreeNode(geometryNode, parent) {
		let node = new PointCloudOctreeNode();

		let sceneNode = new THREE.Points(geometryNode.geometry, this.material);
		sceneNode.name = geometryNode.name;
		sceneNode.position.copy(geometryNode.boundingBox.min);
		sceneNode.frustumCulled = true;
		sceneNode.onBeforeRender = (_this, scene, camera, geometry, material, group) => {
			if (material.program) {
				_this.getContext().useProgram(material.program.program);

				if (material.program.getUniforms().map.level) {
					let level = geometryNode.getLevel();
					material.uniforms.level.value = level;
					material.program.getUniforms().map.level.setValue(_this.getContext(), level);
				}

				if (this.visibleNodeTextureOffsets && material.program.getUniforms().map.vnStart) {
					let vnStart = this.visibleNodeTextureOffsets.get(node);
					material.uniforms.vnStart.value = vnStart;
					material.program.getUniforms().map.vnStart.setValue(_this.getContext(), vnStart);
				}

				if (material.program.getUniforms().map.pcIndex) {
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
		for (let key in geometryNode.children) {
			node.children[key] = geometryNode.children[key];
		}

		if (!parent) {
			this.root = node;
			this.add(sceneNode);
		}
		else {
			let childIndex = parseInt(geometryNode.name[geometryNode.name.length - 1]);
			parent.sceneNode.add(sceneNode);
			parent.children[childIndex] = node;
		}

		let disposeListener = function () {
			let childIndex = parseInt(geometryNode.name[geometryNode.name.length - 1]);
			parent.sceneNode.remove(node.sceneNode);
			parent.children[childIndex] = geometryNode;
		};
		geometryNode.oneTimeDisposeHandlers.push(disposeListener);


		return node;
	}

	updateVisibleBounds() {
		let leafNodes = [];
		for (let i = 0; i < this.visibleNodes.length; i++) {
			let node = this.visibleNodes[i];
			let isLeaf = true;

			for (let j = 0; j < node.children.length; j++) {
				let child = node.children[j];
				if (child instanceof PointCloudOctreeNode) {
					isLeaf = isLeaf && !child.sceneNode.visible;
				}
				else if (child instanceof PointCloudOctreeGeometryNode) {
					isLeaf = true;
				}
			}

			if (isLeaf) {
				leafNodes.push(node);
			}
		}

		this.visibleBounds.min = new THREE.Vector3(Infinity, Infinity, Infinity);
		this.visibleBounds.max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

		for (let i = 0; i < leafNodes.length; i++) {
			let node = leafNodes[i];
			this.visibleBounds.expandByPoint(node.getBoundingBox().min);
			this.visibleBounds.expandByPoint(node.getBoundingBox().max);
		}
	}

	updateMaterial(material, visibleNodes, camera, renderer) {
		material.fov = camera.fov * (Math.PI / 180);
		material.screenWidth = renderer.domElement.clientWidth;
		material.screenHeight = renderer.domElement.clientHeight;
		material.spacing = this.pcoGeometry.spacing * Math.max(this.scale.x, this.scale.y, this.scale.z);
		material.near = camera.near;
		material.far = camera.far;
		material.uniforms.octreeSize.value = this.pcoGeometry.boundingBox.getSize(new THREE.Vector3()).x;
	}

	computeVisibilityTextureData(nodes, camera) {
		if (Global.measureTimings) {
			performance.mark("computeVisibilityTextureData-start");
		}

		let data = new Uint8Array(nodes.length * 4);
		let visibleNodeTextureOffsets = new Map();

		//copy array
		nodes = nodes.slice();

		//sort by level and index, e.g. r, r0, r3, r4, r01, r07, r30, ...
		let sort = function (a, b) {
			let na = a.geometryNode.name;
			let nb = b.geometryNode.name;
			if (na.length !== nb.length) return na.length - nb.length;
			if (na < nb) return -1;
			if (na > nb) return 1;
			return 0;
		};
		nodes.sort(sort);

		//code sample taken from three.js src/math/Ray.js
		let v1 = new THREE.Vector3();
		let intersectSphereBack = (ray, sphere) => {
			v1.subVectors(sphere.center, ray.origin);
			let tca = v1.dot(ray.direction);
			let d2 = v1.dot(v1) - tca * tca;
			let radius2 = sphere.radius * sphere.radius;

			if (d2 > radius2) {
				return null;
			}

			let thc = Math.sqrt(radius2 - d2);

			//t1 = second intersect point - exit point on back of sphere
			let t1 = tca + thc;

			if (t1 < 0) {
				return null;
			}

			return t1;
		};

		let lodRanges = new Map();
		let leafNodeLodRanges = new Map();

		for (let i = 0; i < nodes.length; i++) {
			let node = nodes[i];

			visibleNodeTextureOffsets.set(node, i);

			let children = [];
			for (let j = 0; j < 8; j++) {
				let child = node.children[j];

				if (child && child.constructor === PointCloudOctreeNode && nodes.includes(child, i)) {
					children.push(child);
				}
			}

			let spacing = node.geometryNode.estimatedSpacing;
			let isLeafNode;

			data[i * 4 + 0] = 0;
			data[i * 4 + 1] = 0;
			data[i * 4 + 2] = 0;
			data[i * 4 + 3] = node.getLevel();
			for (let j = 0; j < children.length; j++) {
				let child = children[j];
				let index = parseInt(child.geometryNode.name.substr(-1));
				data[i * 4 + 0] += Math.pow(2, index);

				if (j === 0) {
					let vArrayIndex = nodes.indexOf(child, i);

					data[i * 4 + 1] = (vArrayIndex - i) >> 8;
					data[i * 4 + 2] = (vArrayIndex - i) % 256;
				}
			}

			//TODO performance optimization
			//for some reason, this part can be extremely slow in chrome during a debugging session, but not during profiling
			let bBox = node.getBoundingBox().clone();
			//bBox.applyMatrix4(node.sceneNode.matrixWorld);
			//bBox.applyMatrix4(camera.matrixWorldInverse);
			let bSphere = bBox.getBoundingSphere(new THREE.Sphere());
			bSphere.applyMatrix4(node.sceneNode.matrixWorld);
			bSphere.applyMatrix4(camera.matrixWorldInverse);

			let ray = new THREE.Ray(camera.position, camera.getWorldDirection(this.tempVector3));
			let distance = intersectSphereBack(ray, bSphere);
			let distance2 = bSphere.center.distanceTo(camera.position) + bSphere.radius;
			if (distance === null) {
				distance = distance2;
			}
			distance = Math.max(distance, distance2);

			if (!lodRanges.has(node.getLevel())) {
				lodRanges.set(node.getLevel(), distance);
			}
			else {
				let prevDistance = lodRanges.get(node.getLevel());
				let newDistance = Math.max(prevDistance, distance);
				lodRanges.set(node.getLevel(), newDistance);
			}

			if (!node.geometryNode.hasChildren) {
				let value = {
					distance: distance,
					i: i
				};
				leafNodeLodRanges.set(node, value);
			}
		}

		for (let [node, value] of leafNodeLodRanges) {
			let level = node.getLevel();
			let distance = value.distance;
			let i = value.i;

			if (level < 4) {
				continue;
			}
			for (let [lod, range] of lodRanges) {
				if (distance < range * 1.2) {
					data[i * 4 + 3] = lod;
				}
			}
		}

		if (Global.measureTimings) {
			performance.mark("computeVisibilityTextureData-end");
			performance.measure("render.computeVisibilityTextureData", "computeVisibilityTextureData-start", "computeVisibilityTextureData-end");
		}

		return {
			data: data,
			offsets: visibleNodeTextureOffsets
		};
	}

	nodeIntersectsProfile(node, profile) {
		let bbWorld = node.boundingBox.clone().applyMatrix4(this.matrixWorld);
		let bsWorld = bbWorld.getBoundingSphere(new THREE.Sphere());

		let intersects = false;

		for (let i = 0; i < profile.points.length - 1; i++) {

			let start = new THREE.Vector3(profile.points[i + 0].x, profile.points[i + 0].y, bsWorld.center.z);
			let end = new THREE.Vector3(profile.points[i + 1].x, profile.points[i + 1].y, bsWorld.center.z);

			let closest = new THREE.Line3(start, end).closestPointToPoint(bsWorld.center, true);
			let distance = closest.distanceTo(bsWorld.center);

			intersects = intersects || (distance < (bsWorld.radius + profile.width));
		}

		return intersects;
	}

	nodesOnRay(nodes, ray) {
		let nodesOnRay = [];
		let _ray = ray.clone();

		for (let i = 0; i < nodes.length; i++) {
			let node = nodes[i];
			let sphere = node.getBoundingSphere().clone().applyMatrix4(this.matrixWorld);

			if (_ray.intersectsSphere(sphere)) {
				nodesOnRay.push(node);
			}
		}

		return nodesOnRay;
	}

	updateMatrixWorld(force) {
		if (this.matrixAutoUpdate === true) this.updateMatrix();

		if (this.matrixWorldNeedsUpdate === true || force === true) {
			if (!this.parent) {
				this.matrixWorld.copy(this.matrix);
			}
			else {
				this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
			}

			this.matrixWorldNeedsUpdate = false;

			force = true;
		}
	}

	hideDescendants(object) {
		let stack = [];
		for (let i = 0; i < object.children.length; i++) {
			let child = object.children[i];
			if (child.visible) {
				stack.push(child);
			}
		}

		while (stack.length > 0) {
			let object = stack.shift();

			object.visible = false;

			for (let i = 0; i < object.children.length; i++) {
				let child = object.children[i];
				if (child.visible) {
					stack.push(child);
				}
			}
		}
	}

	moveToOrigin() {
		this.position.set(0, 0, 0);
		this.updateMatrixWorld(true);
		let box = this.boundingBox;
		let transform = this.matrixWorld;
		let tBox = HelperUtils.computeTransformedBoundingBox(box, transform);

		this.position.set(0, 0, 0).sub(tBox.getCenter(new THREE.Vector3()));
	};

	moveToGroundPlane() {
		this.updateMatrixWorld(true);
		let box = this.boundingBox;
		let transform = this.matrixWorld;
		let tBox = HelperUtils.computeTransformedBoundingBox(box, transform);
		this.position.y += -tBox.min.y;
	};

	getBoundingBoxWorld() {
		this.updateMatrixWorld(true);
		let box = this.boundingBox;
		let transform = this.matrixWorld;
		let tBox = HelperUtils.computeTransformedBoundingBox(box, transform);

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
	getPointsInProfile(profile, maxDepth, callback) {
		if (callback) {
			//let request = new Potree.ProfileRequest(this, profile, maxDepth, callback);
			//this.profileRequests.push(request);
			//return request;
		}

		let points = {
			segments: [],
			boundingBox: new THREE.Box3(),
			projectedBoundingBox: new THREE.Box2()
		};

		//evaluate segments
		for (let i = 0; i < profile.points.length - 1; i++) {
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

		//add projection functions to the segments
		let mileage = new THREE.Vector3();
		for (let i = 0; i < points.segments.length; i++) {
			let segment = points.segments[i];
			let start = segment.start;
			let end = segment.end;

			let project = (function (_start, _end, _mileage, _boundingBox) {
				let start = _start;
				let end = _end;
				let mileage = _mileage;
				let boundingBox = _boundingBox;

				let xAxis = new THREE.Vector3(1, 0, 0);
				let dir = new THREE.Vector3().subVectors(end, start);
				dir.y = 0;
				dir.normalize();
				let alpha = Math.acos(xAxis.dot(dir));
				if (dir.z > 0) {
					alpha = -alpha;
				}

				return function (position) {
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
	getProfile(start, end, width, depth, callback) {
		//let request = new Potree.ProfileRequest(start, end, width, depth, callback);
		//this.profileRequests.push(request);
	};

	getVisibleExtent() {
		return this.visibleBounds.applyMatrix4(this.matrixWorld);
	};

	/**
	 * Pick the point(s) closest to the specified pointer position
	 *
	 * @param {THREE.WebGLRenderer} renderer
	 * @param {Potree.BasicGroup} pRenderer
	 * @param {THREE.Camera} camera
	 * @param {THREE.Ray} ray
	 * @param {*} params	{ x, y }
	 * @returns
	 */
	pick(renderer, pRenderer, camera, ray, params = {}) {

		performance.mark("pick-start");

		let getVal = (a, b) => a !== undefined ? a : b;

		// Ensure pick window is an odd value
		let pickWindowSize = ~~((params.pickWindowSize || 17) / 2) + 1;

		let size = renderer.getSize(new THREE.Vector2());
		let width = Math.ceil(getVal(params.width, size.width));
		let height = Math.ceil(getVal(params.height, size.height));

		let pointSizeType = getVal(params.pointSizeType, this.material.pointSizeType);
		let pointSize = getVal(params.pointSize, this.material.size);

		let nodes = this.nodesOnRay(this.visibleNodes, ray);

		if (nodes.length === 0) {
			return null;
		}

		if (!this.pickState) {
			let scene = new THREE.Scene();

			let material = new PointCloudMaterial();
			material.pointColorType = PointColorType.POINT_INDEX;

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

			if (params.pickClipped) {
				pickMaterial.clipBoxes = this.material.clipBoxes;
				if (this.material.clipTask === ClipTask.HIGHLIGHT) {
					pickMaterial.clipTask = ClipTask.NONE;
				} else {
					pickMaterial.clipTask = this.material.clipTask;
				}
			} else {
				pickMaterial.clipBoxes = [];
			}

			this.updateMaterial(pickMaterial, nodes, camera, renderer);
		}

		pickState.renderTarget.setSize(width, height);

		let pixelPos = new THREE.Vector2(params.x, params.y);

		let gl = renderer.getContext();
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(
			~~(pixelPos.x - (pickWindowSize - 1) / 2),
			~~(pixelPos.y - (pickWindowSize - 1) / 2),
			~~pickWindowSize,
			~~pickWindowSize
		);

		renderer.state.buffers.depth.setTest(pickMaterial.depthTest);
		renderer.state.buffers.depth.setMask(pickMaterial.depthWrite);
		renderer.state.setBlending(THREE.NoBlending);

		{ // RENDER
			renderer.setRenderTarget(pickState.renderTarget);
			gl.clearColor(0, 0, 0, 0);
			renderer.clear(true, true, true);

			let tmp = this.material;
			this.material = pickMaterial;

			pRenderer.renderOctree(renderer, this, nodes, camera, pickState.renderTarget);

			this.material = tmp;
		}

		let clamp = (number, min, max) => Math.min(Math.max(min, number), max);

		let x = ~~(clamp(pixelPos.x - (pickWindowSize - 1) / 2, 0, width));
		let y = ~~(clamp(pixelPos.y - (pickWindowSize - 1) / 2, 0, height));
		let w = ~~(Math.min(x + pickWindowSize, width) - x);
		let h = ~~(Math.min(y + pickWindowSize, height) - y);

		let pixelCount = w * h;
		let buffer = new Uint8Array(4 * pixelCount);

		gl.readPixels(x, y, pickWindowSize, pickWindowSize, gl.RGBA, gl.UNSIGNED_BYTE, buffer);

		renderer.setRenderTarget(null);
		renderer.state.reset();
		renderer.setScissorTest(false);
		gl.disable(gl.SCISSOR_TEST);

		let pixels = buffer;
		let ibuffer = new Uint32Array(buffer.buffer);

		// find closest hit inside pixelWindow boundaries
		let hits = [];

		for (let u = 0; u < pickWindowSize; u++) {
			for (let v = 0; v < pickWindowSize; v++) {
				let offset = (u + v * pickWindowSize);
				let distance = Math.pow(u - (pickWindowSize - 1) / 2, 2) + Math.pow(v - (pickWindowSize - 1) / 2, 2);

				let pcIndex = pixels[4 * offset + 3];
				pixels[4 * offset + 3] = 0;
				let pIndex = ibuffer[offset];

				if (!(pcIndex === 0 && pIndex === 0) && (pcIndex !== undefined) && (pIndex !== undefined)) {
					let hit = {
						pIndex: pIndex,
						pcIndex: pcIndex,
						distanceToCenter: distance
					};

					if (params.all) {
						hits.push(hit);
					} else {
						if (hits.length > 0) {
							if (distance < hits[0].distanceToCenter) {
								hits[0] = hit;
							}
						} else {
							hits.push(hit);
						}
					}

				}
			}
		}

		if (params.debug) { // open iframe showing picked pixels
			let iframe = document.querySelector('#pickIframe');

			if (!iframe) {
				iframe = document.createElement('IFRAME');
				iframe.id = 'pickIframe';
				iframe.style.width = w + 'px';
				iframe.style.height = h + 'px';
				iframe.style.position = 'fixed';
				iframe.style.zIndex = '99999';
				iframe.style.top = '1px';
				iframe.style.left = '1px';
				iframe.style.transform = 'scaleY(-1)';
				iframe.frameBorder = '0';
				document.body.append(iframe);
			}

			let img = HelperUtils.pixelsArrayToImage(buffer, w, h);
			iframe.src = img.src;
		}

		for (let hit of hits) {
			let point = {};

			if (!nodes[hit.pcIndex]) {
				return null;
			}

			let node = nodes[hit.pcIndex];
			let pc = node.sceneNode;
			let geometry = node.geometryNode.geometry;

			for (let attributeName in geometry.attributes) {
				let attribute = geometry.attributes[attributeName];

				if (attributeName === 'position') {
					let x = attribute.array[3 * hit.pIndex + 0];
					let y = attribute.array[3 * hit.pIndex + 1];
					let z = attribute.array[3 * hit.pIndex + 2];

					let position = new THREE.Vector3(x, y, z);
					position.applyMatrix4(pc.matrixWorld);

					point[attributeName] = position;
				} else if (attributeName === 'indices') {
				} else {
					let values = attribute.array.slice(attribute.itemSize * hit.pIndex, attribute.itemSize * (hit.pIndex + 1));
					let value;

					if (attribute.potree) {
						const { scale, offset } = attribute.potree;
						values = values.map(v => v / scale + offset);
					}

					switch (attributeName) {
						case 'color':
							const rgb = [...values].map(v => v / 255);
							value = new THREE.Color(...rgb);
							break;
						default:
							value = values.length === 1 ? values[0] : values;
							break;
					}

					point[attributeName] = value;
				}

			}

			hit.point = point;
		}

		performance.mark("pick-end");
		performance.measure("pick", "pick-start", "pick-end");

		if (params.all) {
			return hits.map(hit => hit.point);
		} else {
			if (hits.length === 0) {
				return null;
			} else {
				return hits[0].point;
			}
		}

	}

	*getFittedBoxGen(boxNode) {
		let shrinkedLocalBounds = new THREE.Box3();
		let worldToBox = new THREE.Matrix4().getInverse(boxNode.matrixWorld);

		for (let node of this.visibleNodes) {
			if (!node.sceneNode) {
				continue;
			}

			let buffer = node.geometryNode.buffer;

			let posOffset = buffer.offset("position");
			let stride = buffer.stride;
			let view = new DataView(buffer.data);

			let objectToBox = new THREE.Matrix4().multiplyMatrices(worldToBox, node.sceneNode.matrixWorld);

			let pos = new THREE.Vector4();
			for (let i = 0; i < buffer.numElements; i++) {
				let x = view.getFloat32(i * stride + posOffset + 0, true);
				let y = view.getFloat32(i * stride + posOffset + 4, true);
				let z = view.getFloat32(i * stride + posOffset + 8, true);

				pos.set(x, y, z, 1);
				pos.applyMatrix4(objectToBox);

				if (-0.5 < pos.x && pos.x < 0.5) {
					if (-0.5 < pos.y && pos.y < 0.5) {
						if (-0.5 < pos.z && pos.z < 0.5) {
							shrinkedLocalBounds.expandByPoint(pos);
						}
					}
				}
			}

			yield;
		}


		let fittedPosition = shrinkedLocalBounds.getCenter(new THREE.Vector3()).applyMatrix4(boxNode.matrixWorld);

		let fitted = new THREE.Object3D();
		fitted.position.copy(fittedPosition);
		fitted.scale.copy(boxNode.scale);
		fitted.rotation.copy(boxNode.rotation);

		let ds = new THREE.Vector3().subVectors(shrinkedLocalBounds.max, shrinkedLocalBounds.min);
		fitted.scale.multiply(ds);

		yield fitted;
	}

	getFittedBox(boxNode, maxLevel = Infinity) {
		let shrinkedLocalBounds = new THREE.Box3();
		let worldToBox = new THREE.Matrix4().getInverse(boxNode.matrixWorld);

		for (let node of this.visibleNodes) {
			if (!node.sceneNode || node.getLevel() > maxLevel) {
				continue;
			}

			let buffer = node.geometryNode.buffer;

			let posOffset = buffer.offset("position");
			let stride = buffer.stride;
			let view = new DataView(buffer.data);

			let objectToBox = new THREE.Matrix4().multiplyMatrices(worldToBox, node.sceneNode.matrixWorld);

			let pos = new THREE.Vector4();
			for (let i = 0; i < buffer.numElements; i++) {
				let x = view.getFloat32(i * stride + posOffset + 0, true);
				let y = view.getFloat32(i * stride + posOffset + 4, true);
				let z = view.getFloat32(i * stride + posOffset + 8, true);

				pos.set(x, y, z, 1);
				pos.applyMatrix4(objectToBox);

				if (-0.5 < pos.x && pos.x < 0.5) {
					if (-0.5 < pos.y && pos.y < 0.5) {
						if (-0.5 < pos.z && pos.z < 0.5) {
							shrinkedLocalBounds.expandByPoint(pos);
						}
					}
				}
			}
		}

		let fittedPosition = shrinkedLocalBounds.getCenter(new THREE.Vector3()).applyMatrix4(boxNode.matrixWorld);

		let fitted = new THREE.Object3D();
		fitted.position.copy(fittedPosition);
		fitted.scale.copy(boxNode.scale);
		fitted.rotation.copy(boxNode.rotation);

		let ds = new THREE.Vector3().subVectors(shrinkedLocalBounds.max, shrinkedLocalBounds.min);
		fitted.scale.multiply(ds);

		return fitted;
	}

	get progress() {
		return this.visibleNodes.length / this.visibleGeometry.length;
	}

	find(name) {
		let node = null;
		for (let char of name) {
			if (char === "r") {
				node = this.root;
			}
			else {
				node = node.children[char];
			}
		}

		return node;
	}
};

export { PointCloudOctree, PointCloudOctreeNode };