import {NodeLoader, Metadata} from './OctreeLoader';
import {Box3, Sphere, Vector3} from 'three';
import {PointAttributes} from './PointAttributes';
import {OctreeGeometryNode} from './OctreeGeometryNode';
import {MAX_NUM_NODES_LOADING} from '../constants';

export class OctreeGeometry {
	public root!: OctreeGeometryNode;

	public url: string | null = null;

	public pointAttributes: PointAttributes | null = null;

	public spacing: number = 0;

	public tightBoundingBox: Box3;

	public numNodesLoading: number = 0;

	/**
	 * Maximum number of concurrent node loads for this geometry. `Potree.updatePointClouds()`
	 * overwrites it with `Potree.maxNumNodesLoading`.
	 */
	public maxNumNodesLoading: number = MAX_NUM_NODES_LOADING;

	public boundingSphere: Sphere;

	public tightBoundingSphere: Sphere;

	public offset!: Vector3;

	public scale!: [number, number, number];

	public disposed: boolean = false;

	public projection?: Metadata['projection'];

	constructor(
		public loader: NodeLoader,
		public boundingBox: Box3, // Need to be get from metadata.json
	) {
		this.tightBoundingBox = this.boundingBox.clone();
		this.boundingSphere = this.boundingBox.getBoundingSphere(new Sphere());
		this.tightBoundingSphere = this.boundingBox.getBoundingSphere(new Sphere());
	}

	public dispose(): void {
		// this.loader.dispose();
		this.root.traverse((node) => { return node.dispose(); });
		// node.dispose() skips the root, which keeps the LRU cache from disposing of it.
		this.root.geometry?.dispose();
		this.disposed = true;
	}
}
