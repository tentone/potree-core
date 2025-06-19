import {Box3, BufferGeometry, EventDispatcher, Object3D, Points, Sphere} from 'three';
import {PointCloudOctreeGeometryNode} from './point-cloud-octree-geometry-node';
import {IPointCloudTreeNode} from './types';

export class PointCloudOctreeNode extends EventDispatcher implements IPointCloudTreeNode 
{	
	/**
	 * Unique identifier for the node, automatically incremented.
	 */
	public geometryNode: PointCloudOctreeGeometryNode;

	/**
	 * The scene node that represents this octree node in the 3D scene.
	 * 
	 * It contains the points of the point cloud.
	 */
	public sceneNode: Points;

	/**
	 * The index of the point cloud in the scene, if applicable.
	 * 
	 * This is used to identify which point cloud this node belongs to.
	 */
	public pcIndex: number | undefined = undefined;

	/**
	 * The bounding box node for this octree node, if applicable.
	 * 
	 * This is used for visualizing the bounding box in the scene.
	 */
	public boundingBoxNode: Object3D | null = null;

	/**
	 * An array of child nodes, which can be null if there are no children at that position.
	 * 
	 * This is used to traverse the octree structure.
	 */
	public readonly children: (IPointCloudTreeNode | null)[];

	/**
	 * Indicates whether the node's geometry has been loaded.
	 */
	public readonly loaded = true;

	/**
	 * Indicates whether the node is currently loading.
	 */
	public readonly isTreeNode: boolean = true;

	/**
	 * Indicates whether this node is a geometry node.
	 * 
	 * This is always false for PointCloudOctreeNode, as it represents a tree node.
	 */
	public readonly isGeometryNode: boolean = false;

	public constructor(geometryNode: PointCloudOctreeGeometryNode, sceneNode: Points) 
	{
		super();

		this.geometryNode = geometryNode;
		this.sceneNode = sceneNode;
		this.children = geometryNode.children.slice();
	}

	/**
	 * Disposes of the resources used by this node.
	 * 
	 * This method should be called when the node is no longer needed to free up memory.
	 */
	public dispose(): void 
	{
		this.geometryNode.dispose();
	}

	/**
	 * Disposes of the scene node associated with this octree node.
	 * 
	 * This method removes the geometry and its attributes from the scene node to free up resources.
	 */
	public disposeSceneNode(): void 
	{
		const node = this.sceneNode;

		if (node.geometry instanceof BufferGeometry) 
		{
			const attributes = node.geometry.attributes;

			// tslint:disable-next-line:forin
			for (const key in attributes) 
			{
				if (key === 'position') 
				{
					delete (attributes[key] as any).array;
				}

				delete attributes[key];
			}

			node.geometry.dispose();
			node.geometry = undefined as any;
		}
	}

	/**
	 * Traverses the octree node and executes a callback function for each node.
	 * 
	 * @param cb - The callback function to execute for each node.
	 * @param includeSelf - If true, the callback will also be executed for this node.
	 */
	public traverse(cb: (node: IPointCloudTreeNode)=> void, includeSelf?: boolean): void 
	{
		this.geometryNode.traverse(cb, includeSelf);
	}

	public get id() 
	{
		return this.geometryNode.id;
	}

	public get name() 
	{
		return this.geometryNode.name;
	}

	public get level(): number 
	{
		return this.geometryNode.level;
	}

	public get isLeafNode(): boolean 
	{
		return this.geometryNode.isLeafNode;
	}

	public get numPoints(): number 
	{
		return this.geometryNode.numPoints;
	}

	public get index() 
	{
		return this.geometryNode.index;
	}

	public get boundingSphere(): Sphere 
	{
		return this.geometryNode.boundingSphere;
	}

	public get boundingBox(): Box3 
	{
		return this.geometryNode.boundingBox;
	}

	public get spacing() 
	{
		return this.geometryNode.spacing;
	}
}
