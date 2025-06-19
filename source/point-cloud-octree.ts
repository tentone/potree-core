import {OctreeGeometry} from './loading2/OctreeGeometry';
import {Box3, Camera, Object3D, Points, Ray, Sphere, Vector3, WebGLRenderer} from 'three';
import {DEFAULT_MIN_NODE_PIXEL_SIZE} from './constants';
import {PointCloudMaterial, PointSizeType} from './materials';
import {PointCloudOctreeGeometryNode} from './point-cloud-octree-geometry-node';
import {PointCloudOctreeNode} from './point-cloud-octree-node';
import {PickParams, PointCloudOctreePicker} from './point-cloud-octree-picker';
import {PointCloudTree} from './point-cloud-tree';
import {IPointCloudTreeNode, IPotree, PickPoint, PCOGeometry} from './types';
import {computeTransformedBoundingBox} from './utils/bounds';

export class PointCloudOctree extends PointCloudTree 
{	
	/**
	 * The name of the point cloud octree.
	 */
	public potree: IPotree;

	/**
	 * Indicates whether the point cloud octree has been disposed.
	 * 
	 * This is set to true when the octree is disposed, and can be used to check if the octree is still valid.
	 */
	public disposed: boolean = false;

	/**
	 * The geometry of the point cloud octree.
	 * 
	 * This contains the root node and other properties related to the point cloud geometry.
	 */
	public pcoGeometry: PCOGeometry;

	/**
	 * The bounding box of the point cloud octree.
	 * 
	 * This is used to define the spatial extent of the point cloud.
	 */
	public boundingBox: Box3;

	/**
	 * The bounding sphere of the point cloud octree.
	 * 
	 * This is used for spatial queries and to determine visibility.
	 */
	public boundingSphere: Sphere;

	/**
	 * The position of the point cloud octree in the 3D space.
	 * 
	 * This is used to position the octree in the scene.
	 */
	public level: number = 0;

	/**
	 * The maximum level of detail for the point cloud octree.
	 * 
	 * This is used to limit the depth of the octree when rendering or processing.
	 */
	public maxLevel: number = Infinity;

	/**
	 * The minimum radius of a node's bounding sphere on the screen in order to be displayed.
	 */
	public minNodePixelSize: number = DEFAULT_MIN_NODE_PIXEL_SIZE;

	/**
	 * The root node of the point cloud octree.
	 */
	public root: IPointCloudTreeNode | null = null;

	/**
	 * Bounding box nodes for visualization.
	 */
	public boundingBoxNodes: Object3D[] = [];

	/**
	 * An array of visible nodes in the point cloud octree.
	 * 
	 * These nodes are currently visible in the scene and can be rendered.
	 */
	public visibleNodes: PointCloudOctreeNode[] = [];

	/**
	 * An array of visible geometry nodes in the point cloud octree.
	 * 
	 * These nodes contain the geometry data for rendering and are currently visible.
	 */
	public visibleGeometry: PointCloudOctreeGeometryNode[] = [];

	/**
	 * The number of visible points in the point cloud octree.
	 * 
	 * This is used to keep track of how many points are currently visible in the scene.
	 */
	public numVisiblePoints: number = 0;

	/**
	 * Indicates whether the bounding box should be shown in the scene.
	 * 
	 * This can be toggled to visualize the spatial extent of the point cloud octree.
	 */
	public showBoundingBox: boolean = false;

	// @ts-ignore
	private _material: PointCloudMaterial = null;

	/**
	 * The bounds of the visible area in the point cloud octree.
	 * 
	 * This is used to determine which nodes are currently visible based on the camera's frustum.
	 */
	private visibleBounds: Box3 = new Box3();

	/**
	 * The picker used for picking points in the point cloud octree.
	 * 
	 * This is used to interact with the point cloud, such as selecting points or querying information.
	 */
	private picker: PointCloudOctreePicker | undefined;

	public constructor(
		potree: IPotree,
		pcoGeometry: PCOGeometry,
		material?: PointCloudMaterial,
	) 
	{
		super();

		this.name = '';
		this.potree = potree;
		this.root = pcoGeometry.root;
		this.pcoGeometry = pcoGeometry;
		this.boundingBox = pcoGeometry.boundingBox;
		this.boundingSphere = this.boundingBox.getBoundingSphere(new Sphere());

		this.position.copy(pcoGeometry.offset);
		this.updateMatrix();

		this.material = material || (pcoGeometry instanceof OctreeGeometry ? new PointCloudMaterial({newFormat: true}) : new PointCloudMaterial());
	}

	public dispose(): void 
	{
		if (this.root) 
		{
			this.root.dispose();
		}

		this.pcoGeometry.root.traverse((n: IPointCloudTreeNode) => {return this.potree.lru.remove(n);});
		this.pcoGeometry.dispose();
		this.material.dispose();

		this.visibleNodes = [];
		this.visibleGeometry = [];

		if (this.picker) 
		{
			this.picker.dispose();
			this.picker = undefined;
		}

		this.disposed = true;
	}
	
	public get material(): PointCloudMaterial
	{
		return this._material;
	}

	public set material(material: PointCloudMaterial)
	{
		this._material = material;
		this.updateMatrixWorld(true);

		const {min, max} = computeTransformedBoundingBox(
			this.pcoGeometry.tightBoundingBox || this.getBoundingBoxWorld(),
			this.matrixWorld,
		);

		const bWidth = max.z - min.z;
		this.material.heightMin = min.z - 0.2 * bWidth;
		this.material.heightMax = max.z + 0.2 * bWidth;
	}

	public get pointSizeType(): PointSizeType 
	{
		return this.material.pointSizeType;
	}

	public set pointSizeType(value: PointSizeType) 
	{
		this.material.pointSizeType = value;
	}

	public toTreeNode(
		geometryNode: PointCloudOctreeGeometryNode,
		parent?: PointCloudOctreeNode | null,
	): PointCloudOctreeNode 
	{
		const points = new Points(geometryNode.geometry, this.material);
		const node = new PointCloudOctreeNode(geometryNode, points);
		points.name = geometryNode.name;
		points.position.copy(geometryNode.boundingBox.min);
		points.frustumCulled = false;
		points.onBeforeRender = PointCloudMaterial.makeOnBeforeRender(this, node);

		if (parent) 
		{
			parent.sceneNode.add(points);
			parent.children[geometryNode.index] = node;

			geometryNode.oneTimeDisposeHandlers.push(() => 
			{
				node.disposeSceneNode();
				parent.sceneNode.remove(node.sceneNode);
				// Replace the tree node (rendered and in the GPU) with the geometry node.
				parent.children[geometryNode.index] = geometryNode;
			});
		}
		else 
		{
			this.root = node;
			this.add(points);
		}

		return node;
	}

	public updateVisibleBounds() 
	{
		const bounds = this.visibleBounds;
		bounds.min.set(Infinity, Infinity, Infinity);
		bounds.max.set(-Infinity, -Infinity, -Infinity);

		for (const node of this.visibleNodes) 
		{
			if (node.isLeafNode) 
			{
				bounds.expandByPoint(node.boundingBox.min);
				bounds.expandByPoint(node.boundingBox.max);
			}
		}
	}

	public updateBoundingBoxes(): void 
	{
		if (!this.showBoundingBox || !this.parent) 
		{
			return;
		}
		// Above: If we're not showing the bounding box or we don't have a parent, we can't update it.

		let bbRoot: any = this.parent.getObjectByName('bbroot');
		if (!bbRoot) 
		{
			bbRoot = new Object3D();
			bbRoot.name = 'bbroot';
			this.parent.add(bbRoot);
		}
		// Above: If we don't have a root object, we need to create one.

		const visibleBoxes: (Object3D | null)[] = [];
		for (const node of this.visibleNodes) 
		{
			if (node.boundingBoxNode !== undefined && node.isLeafNode) 
			{
				visibleBoxes.push(node.boundingBoxNode);
			}
		}

		bbRoot.children = visibleBoxes;
	}

	public updateMatrixWorld(force: boolean): void 
	{
		if (this.matrixAutoUpdate === true) 
		{
			this.updateMatrix();
		}

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

	public hideDescendants(object: Object3D): void 
	{
		const toHide: Object3D[] = [];
		addVisibleChildren(object);

		while (toHide.length > 0) 
		{
			const objToHide = toHide.shift()!;
			objToHide.visible = false;
			addVisibleChildren(objToHide);
		}

		function addVisibleChildren(obj: Object3D) 
		{
			for (const child of obj.children) 
			{
				if (child.visible) 
				{
					toHide.push(child);
				}
			}
		}
	}

	public moveToOrigin(): void 
	{
		this.position.set(0, 0, 0); // Reset, then the matrix will be updated in getBoundingBoxWorld()
		this.position.set(0, 0, 0).sub(this.getBoundingBoxWorld().getCenter(new Vector3()));
	}

	public moveToGroundPlane(): void 
	{
		this.position.y += -this.getBoundingBoxWorld().min.y;
	}

	public getBoundingBoxWorld(): Box3 
	{
		this.updateMatrixWorld(true);
		return computeTransformedBoundingBox(this.boundingBox, this.matrixWorld);
	}

	public getVisibleExtent() 
	{
		return this.visibleBounds.applyMatrix4(this.matrixWorld);
	}

	public pick(
		renderer: WebGLRenderer,
		camera: Camera,
		ray: Ray,
		params: Partial<PickParams> = {},
	): PickPoint | null 
	{
		this.picker = this.picker || new PointCloudOctreePicker();
		return this.picker.pick(renderer, camera, ray, [this], params);
	}

	public get progress() 
	{
		return this.visibleGeometry.length === 0
			? 0
			: this.visibleNodes.length / this.visibleGeometry.length;
	}
}
