import {Sphere, EventDispatcher} from 'three';
import {POCLoader} from '../../loaders/POCLoader.js';
import {Global} from '../../Global.js';
import {PointCloudTreeNode} from '../PointCloudTree.js';
import {XHRFactory} from '../../XHRFactory.js';

class PointCloudOctreeGeometry
{
	constructor()
	{
		this.url = null;
		this.octreeDir = null;
		this.spacing = 0;
		this.boundingBox = null;
		this.root = null;
		this.nodes = null;
		this.pointAttributes = null;
		this.hierarchyStepSize = -1;
		this.loader = null;
	}
}

class PointCloudOctreeGeometryNode extends PointCloudTreeNode
{
	constructor(name, pcoGeometry, boundingBox)
	{
		super();

		this.id = PointCloudOctreeGeometryNode.IDCount++;
		this.name = name;
		this.index = parseInt(name.charAt(name.length - 1));
		this.pcoGeometry = pcoGeometry;
		this.geometry = null;
		this.boundingBox = boundingBox;
		this.boundingSphere = boundingBox.getBoundingSphere(new Sphere());
		this.children = {};
		this.numPoints = 0;
		this.level = null;
		this.loaded = false;
		this.oneTimeDisposeHandlers = [];
	}

	isGeometryNode()
	{
		return true;
	}

	getLevel()
	{
		return this.level;
	}

	isTreeNode()
	{
		return false;
	}

	isLoaded()
	{
		return this.loaded;
	}

	getBoundingSphere()
	{
		return this.boundingSphere;
	}

	getBoundingBox()
	{
		return this.boundingBox;
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

	getURL()
	{
		let url = '';
		const version = this.pcoGeometry.loader.version;

		if (version.equalOrHigher('1.5'))
		{
			url = this.pcoGeometry.octreeDir + '/' + this.getHierarchyPath() + '/' + this.name;
		}
		else if (version.equalOrHigher('1.4'))
		{
			url = this.pcoGeometry.octreeDir + '/' + this.name;
		}
		else if (version.upTo('1.3'))
		{
			url = this.pcoGeometry.octreeDir + '/' + this.name;
		}

		return url;
	}

	getHierarchyPath()
	{
		let path = 'r/';
		const hierarchyStepSize = this.pcoGeometry.hierarchyStepSize;
		const indices = this.name.substr(1);

		const numParts = Math.floor(indices.length / hierarchyStepSize);
		for (let i = 0; i < numParts; i++)
		{
			path += indices.substr(i * hierarchyStepSize, hierarchyStepSize) + '/';
		}

		path = path.slice(0, -1);

		return path;
	}

	addChild(child)
	{
		this.children[child.index] = child;
		child.parent = this;
	}

	load()
	{
		if (this.loading === true || this.loaded === true || Global.numNodesLoading >= Global.maxNodesLoading)
		{
			return;
		}

		this.loading = true;
		Global.numNodesLoading++;

		try
		{
			if (this.pcoGeometry.loader.version.equalOrHigher('1.5'))
			{
				if (this.level % this.pcoGeometry.hierarchyStepSize === 0 && this.hasChildren)
				{
					this.loadHierachyThenPoints();
				}
				else
				{
					this.loadPoints();
				}
			}
			else
			{
				this.loadPoints();
			}
		}
		catch (e)
		{
			Global.numNodesLoading--;
			console.error('Potree: Exception thrown loading points file.', e);
		}

	}

	loadPoints()
	{
		this.pcoGeometry.loader.load(this);
	}

	loadHierachyThenPoints()
	{
		const node = this;

		const callback = function(node, hbuffer)
		{
			const view = new DataView(hbuffer);

			const stack = [];
			const children = view.getUint8(0);
			const numPoints = view.getUint32(1, true);
			node.numPoints = numPoints;
			stack.push({children: children, numPoints: numPoints, name: node.name});

			const decoded = [];
			let offset = 5;

			while (stack.length > 0)
			{
				const snode = stack.shift();
				let mask = 1;
				for (var i = 0; i < 8; i++)
				{
					if ((snode.children & mask) !== 0)
					{
						const childName = snode.name + i;
						const childChildren = view.getUint8(offset);
						const childNumPoints = view.getUint32(offset + 1, true);

						stack.push({children: childChildren, numPoints: childNumPoints, name: childName});
						decoded.push({children: childChildren, numPoints: childNumPoints, name: childName});

						offset += 5;
					}

					mask = mask * 2;
				}

				if (offset === hbuffer.byteLength)
				{
					break;
				}
			}

			const nodes = {};
			nodes[node.name] = node;
			const pco = node.pcoGeometry;

			for (var i = 0; i < decoded.length; i++)
			{
				const name = decoded[i].name;
				const decodedNumPoints = decoded[i].numPoints;
				const index = parseInt(name.charAt(name.length - 1));
				const parentName = name.substring(0, name.length - 1);
				const parentNode = nodes[parentName];
				const level = name.length - 1;
				const boundingBox = POCLoader.createChildAABB(parentNode.boundingBox, index);

				const currentNode = new PointCloudOctreeGeometryNode(name, pco, boundingBox);
				currentNode.level = level;
				currentNode.numPoints = decodedNumPoints;
				currentNode.hasChildren = decoded[i].children > 0;
				currentNode.spacing = pco.spacing / Math.pow(2, level);
				parentNode.addChild(currentNode);
				nodes[name] = currentNode;
			}

			node.loadPoints();
		};
		
		if (node.level % node.pcoGeometry.hierarchyStepSize === 0)
		{
			const hurl = node.pcoGeometry.octreeDir + '/' + node.getHierarchyPath() + '/' + node.name + '.hrc';
			const xhr = XHRFactory.createXMLHttpRequest();
			xhr.open('GET', hurl, true);
			xhr.responseType = 'arraybuffer';
			xhr.overrideMimeType('text/plain; charset=x-user-defined');
			xhr.onload = function(event)
			{
				try
				{
					callback(node, xhr.response);
				}
				catch (e)
				{
					Global.numNodesLoading--;
					console.error('Potree: Exception thrown parsing points.', e);
				}
			};
			xhr.onerror = function(event)
			{
				Global.numNodesLoading--;
				console.error('Potree: Failed to load file.', xhr.status, hurl, event);
			};
			xhr.send(null);
		}
	}

	getNumPoints()
	{
		return this.numPoints;
	}

	dispose()
	{
		if (this.geometry && this.parent !== null)
		{
			this.geometry.dispose();
			this.geometry = null;
			this.loaded = false;

			for (let i = 0; i < this.oneTimeDisposeHandlers.length; i++)
			{
				const handler = this.oneTimeDisposeHandlers[i];
				handler();
			}
			this.oneTimeDisposeHandlers = [];
		}
	}

}

PointCloudOctreeGeometryNode.IDCount = 0;

Object.assign(PointCloudOctreeGeometryNode.prototype, EventDispatcher.prototype);

export {PointCloudOctreeGeometry, PointCloudOctreeGeometryNode};
