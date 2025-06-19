import {IPointCloudTreeNode} from './../types';
import {Box3, Sphere, BufferGeometry} from 'three';
import {OctreeGeometry} from './OctreeGeometry';

/**
 * Represents a node in an octree structure for point cloud geometry.
 */
export class OctreeGeometryNode implements IPointCloudTreeNode {

	/** Indicates if the node's geometry has been loaded. */
	public loaded: boolean = false;

	/** Indicates if the node's geometry is currently loading. */
	public loading: boolean = false;

	/** Reference to the parent node, or null if this is the root. */
	public parent: OctreeGeometryNode | null = null;

	/** The geometry data associated with this node, or null if not loaded. */
	public geometry: BufferGeometry | null = null;

	/** Optional type identifier for the node. */
	public nodeType?: number;

	/** Optional byte offset for the node's data in the source file. */
	public byteOffset?: bigint;

	/** Optional byte size of the node's data in the source file. */
	public byteSize?: bigint;

	/** Optional byte offset for the node's hierarchy data. */
	public hierarchyByteOffset?: bigint;

	/** Optional byte size of the node's hierarchy data. */
	public hierarchyByteSize?: bigint;

	/** Indicates if the node has children. */
	public hasChildren: boolean = false;

	/** The spacing value for the node's points. */
	public spacing!: number;

	/** Optional density value for the node's points. */
	public density?: number;

	/** Indicates if the node is a leaf node (has no children). */
	public isLeafNode: boolean = true;

	/** Indicates if this node is a tree node (always false for geometry nodes). */
	public readonly isTreeNode: boolean = false;

	/** Indicates if this node is a geometry node (always true). */
	public readonly isGeometryNode: boolean = true;

	/** Array of child nodes (up to 8 for an octree), or null if no child at that position. */
	public readonly children: ReadonlyArray<OctreeGeometryNode | null> = [
		null,
		null,
		null,
		null,
		null,
		null,
		null,
		null
	];

	/** Static counter for generating unique node IDs. */
	public static IDCount = 0;

	/** Unique identifier for this node. */
	public id: number;

	/** Index of this node within its parent. */
	public index: number;

	/** Bounding sphere enclosing the node's geometry. */
	public boundingSphere: Sphere;

	/** Number of points contained in this node. */
	public numPoints: number;

	/** Level of the node in the octree hierarchy. */
	public level!: number;

	/** Array of handlers to be called once when the node is disposed. */
	public oneTimeDisposeHandlers: Function[];

	constructor(public name: string, public octreeGeometry: OctreeGeometry, public boundingBox: Box3) {
		this.id = OctreeGeometryNode.IDCount++;
		this.index = parseInt(name.charAt(name.length - 1));
		this.boundingSphere = boundingBox.getBoundingSphere(new Sphere());
		this.numPoints = 0;
		this.oneTimeDisposeHandlers = [];
	}

	public getLevel() {
		return this.level;
	}

	public isLoaded() {
		return this.loaded;
	}

	public getBoundingSphere() {
		return this.boundingSphere;
	}

	public getBoundingBox() {
		return this.boundingBox;
	}

	public load() {
		if (this.octreeGeometry.numNodesLoading >= this.octreeGeometry.maxNumNodesLoading) {
			return;
		}

		if (this.octreeGeometry.loader) {
			this.octreeGeometry.loader.load(this);
		}
	}

	public getNumPoints() {
		return this.numPoints;
	}

	public dispose(): void {
		if (this.geometry && this.parent != null) {
			this.geometry.dispose();
			this.geometry = null;
			this.loaded = false;

			for (let i = 0; i < this.oneTimeDisposeHandlers.length; i++) {
				let handler = this.oneTimeDisposeHandlers[i];
				handler();
			}
			this.oneTimeDisposeHandlers = [];
		}
	}

	public traverse(cb: (node: OctreeGeometryNode) => void, includeSelf = true): void {
		const stack: OctreeGeometryNode[] = includeSelf ? [this] : [];
		let current: OctreeGeometryNode | undefined;

		while ((current = stack.pop()) !== undefined) {
			cb(current);

			for (const child of current.children) {
				if (child !== null) {
					stack.push(child);
				}
			}
		}
	}
}

OctreeGeometryNode.IDCount = 0;
