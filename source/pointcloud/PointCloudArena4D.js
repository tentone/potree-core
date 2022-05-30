import {Vector3, Vector2, Sphere, Points, NoBlending, NearestFilter, Scene, WebGLRenderTarget} from 'three';
import {Utils} from '../utils/Utils.js';
import {Global} from '../Global.js';
import {TreeType, PointSizeType, PointColorType} from '../Potree.js';
import {PointCloudMaterial} from '../materials/PointCloudMaterial.js';
import {PointCloudTree, PointCloudTreeNode} from './PointCloudTree.js';

class PointCloudArena4DNode extends PointCloudTreeNode
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

		if (this.left === child)
		{
			geometryNode = this.left;
		}
		else if (this.right === child)
		{
			geometryNode = this.right;
		}

		if (!geometryNode.loaded)
		{
			return;
		}

		const node = new PointCloudArena4DNode();
		const sceneNode = PointCloud(geometryNode.geometry, this.kdtree.material);
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
		const children = [];

		if (this.left)
		{
			children.push(this.left);
		}

		if (this.right)
		{
			children.push(this.right);
		}

		return children;
	}
}

class PointCloudArena4D extends PointCloudTree
{
	constructor(geometry)
	{
		super();

		this.root = null;
		if (geometry.root)
		{
			this.root = geometry.root;
		}
		else
		{
			geometry.addEventListener('hierarchy_loaded', () =>
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
		this.material = new PointCloudMaterial(
			{
				vertexColors: VertexColors,
				size: 0.05,
				treeType: TreeType.KDTREE
			});
		this.material.sizeType = PointSizeType.ATTENUATED;
		this.material.size = 0.05;
		this.profileRequests = [];
		this.name = '';
	}

	getBoundingBoxWorld()
	{
		this.updateMatrixWorld(true);
		const box = this.boundingBox;
		const transform = this.matrixWorld;
		const tBox = Utils.computeTransformedBoundingBox(box, transform);

		return tBox;
	};

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

	getLevel()
	{
		return this.level;
	}

	toTreeNode(geometryNode, parent)
	{
		const node = new PointCloudArena4DNode();

		const sceneNode = new Points(geometryNode.geometry, this.material);
		sceneNode.frustumCulled = true;
		sceneNode.onBeforeRender = (_this, scene, camera, geometry, material, group) =>
		{
			if (material.program)
			{
				_this.getContext().useProgram(material.program.program);

				if (material.program.getUniforms().map.level)
				{
					const level = geometryNode.getLevel();
					material.uniforms.level.value = level;
					material.program.getUniforms().map.level.setValue(_this.getContext(), level);
				}

				if (this.visibleNodeTextureOffsets && material.program.getUniforms().map.vnStart)
				{
					const vnStart = this.visibleNodeTextureOffsets.get(node);
					material.uniforms.vnStart.value = vnStart;
					material.program.getUniforms().map.vnStart.setValue(_this.getContext(), vnStart);
				}

				if (material.program.getUniforms().map.pcIndex)
				{
					const i = node.pcIndex ? node.pcIndex : this.visibleNodes.indexOf(node);
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

		if (!parent)
		{
			this.root = node;
			this.add(sceneNode);
		}
		else
		{
			parent.sceneNode.add(sceneNode);

			if (parent.left === geometryNode)
			{
				parent.left = node;
			}
			else if (parent.right === geometryNode)
			{
				parent.right = node;
			}
		}

		const disposeListener = function()
		{
			parent.sceneNode.remove(node.sceneNode);

			if (parent.left === node)
			{
				parent.left = geometryNode;
			}
			else if (parent.right === node)
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
		if (this.maxLevel > material.levels)
		{
			material.levels = this.maxLevel + 2;
		}

		// material.uniforms.octreeSize.value = this.boundingBox.size().x;
		const bbSize = this.boundingBox.getSize(new Vector3());
		material.bbSize = [bbSize.x, bbSize.y, bbSize.z];
	}

	updateVisibleBounds()
	{

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
			var child = stack.shift();

			child.visible = false;
			if (child.boundingBoxNode)
			{
				child.boundingBoxNode.visible = false;
			}

			for (var i = 0; i < child.children.length; i++)
			{
				const childOfChild = child.children[i];
				if (childOfChild.visible)
				{
					stack.push(childOfChild);
				}
			}
		}
	}

	updateMatrixWorld(force)
	{
		// node.matrixWorld.multiplyMatrices( node.parent.matrixWorld, node.matrix );

		if (this.matrixAutoUpdate === true) {this.updateMatrix();}

		if (this.matrixWorldNeedsUpdate === true || force === true)
		{
			if (this.parent === undefined)
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
		const nodesOnRay = [];

		const _ray = ray.clone();
		for (let i = 0; i < nodes.length; i++)
		{
			const node = nodes[i];
			const sphere = node.getBoundingSphere(new Sphere()).clone().applyMatrix4(node.sceneNode.matrixWorld);
			// TODO Unused: var box = node.getBoundingBox().clone().applyMatrix4(node.sceneNode.matrixWorld);

			if (_ray.intersectsSphere(sphere))
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
		this.updateMaterial(pickMaterial, nodes, camera, renderer);

		pickState.renderTarget.setSize(width, height);

		const pixelPos = new Vector2(params.x, params.y);

		const gl = renderer.getContext();
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(parseInt(pixelPos.x - (pickWindowSize - 1) / 2), parseInt(pixelPos.y - (pickWindowSize - 1) / 2), parseInt(pickWindowSize), parseInt(pickWindowSize));

		renderer.state.buffers.depth.setTest(pickMaterial.depthTest);
		renderer.state.buffers.depth.setMask(pickMaterial.depthWrite);
		renderer.state.setBlending(NoBlending);

		renderer.clearTarget(pickState.renderTarget, true, true, true);
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
			}
		}
	}

	computeVisibilityTextureData(nodes)
	{
		if (Global.measureTimings)
		{
			performance.mark('computeVisibilityTextureData-start');
		}

		const data = new Uint8Array(nodes.length * 3);
		const visibleNodeTextureOffsets = new Map();

		// copy array
		nodes = nodes.slice();

		// sort by level and number
		const sort = function(a, b)
		{
			const la = a.geometryNode.level;
			const lb = b.geometryNode.level;
			const na = a.geometryNode.number;
			const nb = b.geometryNode.number;
			if (la !== lb) {return la - lb;}
			if (na < nb) {return -1;}
			if (na > nb) {return 1;}
			return 0;
		};
		nodes.sort(sort);

		const visibleNodeNames = [];
		for (var i = 0; i < nodes.length; i++)
		{
			visibleNodeNames.push(nodes[i].geometryNode.number);
		}

		for (var i = 0; i < nodes.length; i++)
		{
			const node = nodes[i];

			visibleNodeTextureOffsets.set(node, i);

			let b1 = 0; // children
			let b2 = 0; // offset to first child
			let b3 = 0; // split

			if (node.geometryNode.left && visibleNodeNames.indexOf(node.geometryNode.left.number) > 0)
			{
				b1 += 1;
				b2 = visibleNodeNames.indexOf(node.geometryNode.left.number) - i;
			}
			if (node.geometryNode.right && visibleNodeNames.indexOf(node.geometryNode.right.number) > 0)
			{
				b1 += 2;
				b2 = b2 === 0 ? visibleNodeNames.indexOf(node.geometryNode.right.number) - i : b2;
			}

			if (node.geometryNode.split === 'X')
			{
				b3 = 1;
			}
			else if (node.geometryNode.split === 'Y')
			{
				b3 = 2;
			}
			else if (node.geometryNode.split === 'Z')
			{
				b3 = 4;
			}

			data[i * 3] = b1;
			data[i * 3 + 1] = b2;
			data[i * 3 + 2] = b3;
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

	get progress()
	{
		if (this.pcoGeometry.root)
		{
			return Global.numNodesLoading > 0 ? 0 : 1;
		}
		else
		{
			return 0;
		}
	}
}

export {PointCloudArena4D, PointCloudArena4DNode};
