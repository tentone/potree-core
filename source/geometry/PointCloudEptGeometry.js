import {Vector3, Box3, Sphere} from 'three';
import {EPTBinaryLoader} from '../loaders/ept/EPTBinaryLoader';
import {EPTLaszipLoader} from '../loaders/ept/EPTLaszipLoader';
import {PointCloudTreeNode} from '../pointcloud/PointCloudTree.js';
import {Global} from '../Global.js';
import {XHRFactory} from '../XHRFactory.js';
import {Version} from '../Version';

class Utils
{
	static toVector3(v, offset)
	{
		return new Vector3().fromArray(v, offset || 0);
	}

	static toBox3(b)
	{
		return new Box3(Utils.toVector3(b), Utils.toVector3(b, 3));
	};

	static findDim(schema, name)
	{
		const dim = schema.find((dim) => {return dim.name === name;});
		if (!dim) {throw new Error('Failed to find ' + name + ' in schema');}
		return dim;
	}

	static sphereFrom(b)
	{
		return b.getBoundingSphere(new Sphere());
	}
}

class PointCloudEptGeometry
{
	constructor(url, info)
	{
		const version = info.version;
		const schema = info.schema;
		const bounds = info.bounds;
		const boundsConforming = info.boundsConforming;

		const xyz = [
			Utils.findDim(schema, 'X'),
			Utils.findDim(schema, 'Y'),
			Utils.findDim(schema, 'Z')
		];
		const scale = xyz.map((d) => {return d.scale || 1;});
		const offset = xyz.map((d) => {return d.offset || 0;});

		this.eptScale = Utils.toVector3(scale);
		this.eptOffset = Utils.toVector3(offset);

		this.url = url;
		this.info = info;
		this.type = 'ept';

		this.schema = schema;
		this.span = info.span || info.ticks;
		this.boundingBox = Utils.toBox3(bounds);
		this.tightBoundingBox = Utils.toBox3(boundsConforming);
		this.offset = Utils.toVector3([0, 0, 0]);
		this.boundingSphere = Utils.sphereFrom(this.boundingBox);
		this.tightBoundingSphere = Utils.sphereFrom(this.tightBoundingBox);
		this.version = new Version('1.6');

		this.projection = null;
		this.fallbackProjection = null;

		if (info.srs && info.srs.horizontal)
		{
			this.projection = info.srs.authority + ':' + info.srs.horizontal;
		}

		if (info.srs.wkt)
		{
			if (!this.projection) {this.projection = info.srs.wkt;}
			else {this.fallbackProjection = info.srs.wkt;}
		}

		this.pointAttributes = 'LAZ';
		this.spacing =
			(this.boundingBox.max.x - this.boundingBox.min.x) / this.span;

		const hierarchyType = info.hierarchyType || 'json';

		const dataType = info.dataType || 'laszip';
		this.loader = dataType === 'binary' ? new EPTBinaryLoader() : new EPTLaszipLoader();
	}
}

class EptKey
{
	constructor(ept, b, d, x, y, z)
	{
		this.ept = ept;
		this.b = b;
		this.d = d;
		this.x = x || 0;
		this.y = y || 0;
		this.z = z || 0;
	}

	name()
	{
		return this.d + '-' + this.x + '-' + this.y + '-' + this.z;
	}

	step(a, b, c)
	{
		const min = this.b.min.clone();
		const max = this.b.max.clone();
		const dst = new Vector3().subVectors(max, min);

		if (a) {min.x += dst.x / 2;}
		else {max.x -= dst.x / 2;}

		if (b) {min.y += dst.y / 2;}
		else {max.y -= dst.y / 2;}

		if (c) {min.z += dst.z / 2;}
		else {max.z -= dst.z / 2;}

		return new EptKey(
			this.ept,
			new Box3(min, max),
			this.d + 1,
			this.x * 2 + a,
			this.y * 2 + b,
			this.z * 2 + c);
	}

	children()
	{
		let result = [];
		for (let a = 0; a < 2; ++a)
		{
			for (let b = 0; b < 2; ++b)
			{
				for (let c = 0; c < 2; ++c)
				{
					const add = this.step(a, b, c).name();
					if (!result.includes(add)) {result = result.concat(add);}
				}
			}
		}
		return result;
	}
}

class PointCloudEptGeometryNode extends PointCloudTreeNode
{
	constructor(ept, b, d, x, y, z) 
	{
		super();

		this.ept = ept;
		this.key = new EptKey(
			this.ept,
			b || this.ept.boundingBox,
			d || 0,
			x,
			y,
			z);

		this.id = PointCloudEptGeometryNode.IDCount++;
		this.geometry = null;
		this.boundingBox = this.key.b;
		this.tightBoundingBox = this.boundingBox;
		this.spacing = this.ept.spacing / Math.pow(2, this.key.d);
		this.boundingSphere = Utils.sphereFrom(this.boundingBox);

		// These are set during hierarchy loading.
		this.hasChildren = false;
		this.children = { };
		this.numPoints = -1;

		this.level = this.key.d;
		this.loaded = false;
		this.loading = false;
		this.oneTimeDisposeHandlers = [];

		const k = this.key;
		this.name = this.toPotreeName(k.d, k.x, k.y, k.z);
		this.index = parseInt(this.name.charAt(this.name.length - 1));
	}

	isGeometryNode() {return true;}

	getLevel() {return this.level;}

	isTreeNode() {return false;}

	isLoaded() {return this.loaded;}

	getBoundingSphere() {return this.boundingSphere;}

	getBoundingBox() {return this.boundingBox;}

	url() {return this.ept.url + 'ept-data/' + this.filename();}

	getNumPoints() {return this.numPoints;}

	filename() {return this.key.name();}

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

	addChild(child)
	{
		this.children[child.index] = child;
		child.parent = this;
	}

	load()
	{
		if (this.loaded || this.loading || Global.numNodesLoading >= Global.maxNodesLoading)
		{
			return;
		}

		this.loading = true;
		Global.numNodesLoading++;

		if (this.numPoints === -1)
		{
			this.loadHierarchy();
		}
		this.loadPoints();
	}

	loadPoints()
	{
		this.ept.loader.load(this);
	}

	async loadHierarchy()
	{
		const nodes = { };
		nodes[this.filename()] = this;
		this.hasChildren = false;

		const eptHierarchyFile = `${this.ept.url}ept-hierarchy/${this.filename()}.json`;

		const response = await XHRFactory.fetch(eptHierarchyFile);
		const hier = await response.json();

		// Since we want to traverse top-down, and 10 comes
		// lexicographically before 9 (for example), do a deep sort.
		const keys = Object.keys(hier).sort((a, b) => 
		{
			const [da, xa, ya, za] = a.split('-').map((n) => {return parseInt(n, 10);});
			const [db, xb, yb, zb] = b.split('-').map((n) => {return parseInt(n, 10);});
			if (da < db) {return -1;} if (da > db) {return 1;}
			if (xa < xb) {return -1;} if (xa > xb) {return 1;}
			if (ya < yb) {return -1;} if (ya > yb) {return 1;}
			if (za < zb) {return -1;} if (za > zb) {return 1;}
			return 0;
		});

		keys.forEach((v) => 
		{
			const [d, x, y, z] = v.split('-').map((n) => {return parseInt(n, 10);});
			const a = x & 1, b = y & 1, c = z & 1;
			const parentName =
				d - 1 + '-' + (x >> 1) + '-' + (y >> 1) + '-' + (z >> 1);

			const parentNode = nodes[parentName];
			if (!parentNode) {return;}
			parentNode.hasChildren = true;

			const key = parentNode.key.step(a, b, c);

			const node = new PointCloudEptGeometryNode(
				this.ept,
				key.b,
				key.d,
				key.x,
				key.y,
				key.z);

			node.level = d;
			node.numPoints = hier[v];

			parentNode.addChild(node);
			nodes[key.name()] = node;
		});
	}

	doneLoading(bufferGeometry, tightBoundingBox, np, mean)
	{
		bufferGeometry.boundingBox = this.boundingBox;
		this.geometry = bufferGeometry;
		this.tightBoundingBox = tightBoundingBox;
		this.numPoints = np;
		this.mean = mean;
		this.loaded = true;
		this.loading = false;
		Global.numNodesLoading--;
	}

	toPotreeName(d, x, y, z)
	{
		let name = 'r';

		for (let i = 0; i < d; ++i)
		{
			const shift = d - i - 1;
			const mask = 1 << shift;
			let step = 0;

			if (x & mask) {step += 4;}
			if (y & mask) {step += 2;}
			if (z & mask) {step += 1;}

			name += step;
		}

		return name;
	}

	dispose()
	{
		if (this.geometry && this.parent !== null)
		{
			this.geometry.dispose();
			this.geometry = null;
			this.loaded = false;

			// this.dispatchEvent( { type: "dispose" } );
			for (let i = 0; i < this.oneTimeDisposeHandlers.length; i++)
			{
				const handler = this.oneTimeDisposeHandlers[i];
				handler();
			}
			
			this.oneTimeDisposeHandlers = [];
		}
	}
}

PointCloudEptGeometryNode.IDCount = 0;

export {PointCloudEptGeometry, PointCloudEptGeometryNode, EptKey};
