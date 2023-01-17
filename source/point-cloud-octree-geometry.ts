import {Box3, Vector3} from 'three';
import {BinaryLoader, XhrRequest} from './loading';
import {PointAttributes} from './point-attributes';
import {PointCloudOctreeGeometryNode} from './point-cloud-octree-geometry-node';

export class PointCloudOctreeGeometry 
{
	public disposed: boolean = false;

	public needsUpdate: boolean = true;

	public root!: PointCloudOctreeGeometryNode;

	public octreeDir: string = '';

	public hierarchyStepSize: number = -1;

	public nodes: Record<string, PointCloudOctreeGeometryNode> = {};

	public numNodesLoading: number = 0;

	public maxNumNodesLoading: number = 3;

	public spacing: number = 0;

	public pointAttributes: PointAttributes = new PointAttributes([]);

	public projection: any = null;

	public url: string | null = null;

	constructor(
    public loader: BinaryLoader,
    public boundingBox: Box3,
    public tightBoundingBox: Box3,
    public offset: Vector3,
    public xhrRequest: XhrRequest,
	) {}

	dispose(): void 
	{
		this.loader.dispose();
		this.root.traverse((node) => {return node.dispose();});

		this.disposed = true;
	}

	addNodeLoadedCallback(callback: (node: PointCloudOctreeGeometryNode)=> void): void 
	{
		this.loader.callbacks.push(callback);
	}

	clearNodeLoadedCallbacks(): void 
	{
		this.loader.callbacks = [];
	}
}
