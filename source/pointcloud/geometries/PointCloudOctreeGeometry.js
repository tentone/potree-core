"use strict";

import {POCLoader} from "../../loaders/POCLoader.js";
import {Global} from "../../Global.js";
import {PointCloudTree, PointCloudTreeNode} from "../PointCloudTree.js";

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
};

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
		this.boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
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
		var children = [];

		for(var i = 0; i < 8; i++)
		{
			if(this.children[i])
			{
				children.push(this.children[i]);
			}
		}

		return children;
	}

	getURL()
	{
		var url = "";
		var version = this.pcoGeometry.loader.version;

		if(version.equalOrHigher("1.5"))
		{
			url = this.pcoGeometry.octreeDir + "/" + this.getHierarchyPath() + "/" + this.name;
		}
		else if(version.equalOrHigher("1.4"))
		{
			url = this.pcoGeometry.octreeDir + "/" + this.name;
		}
		else if(version.upTo("1.3"))
		{
			url = this.pcoGeometry.octreeDir + "/" + this.name;
		}

		return url;
	}

	getHierarchyPath()
	{
		var path = "r/";
		var hierarchyStepSize = this.pcoGeometry.hierarchyStepSize;
		var indices = this.name.substr(1);

		var numParts = Math.floor(indices.length / hierarchyStepSize);
		for(var i = 0; i < numParts; i++)
		{
			path += indices.substr(i * hierarchyStepSize, hierarchyStepSize) + "/";
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
		if(this.loading === true || this.loaded === true || Global.numNodesLoading >= Global.maxNodesLoading)
		{
			return;
		}

		this.loading = true;
		Global.numNodesLoading++;

		try
		{
			if(this.pcoGeometry.loader.version.equalOrHigher("1.5"))
			{
				if((this.level % this.pcoGeometry.hierarchyStepSize) === 0 && this.hasChildren)
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
		catch(e)
		{
			Global.numNodesLoading--;
			console.error("Potree: Exception thrown loading points file.", e);
		}

	}

	loadPoints()
	{
		this.pcoGeometry.loader.load(this);
	}

	loadHierachyThenPoints()
	{
		var node = this;

		var callback = function(node, hbuffer)
		{
			var view = new DataView(hbuffer);

			var stack = [];
			var children = view.getUint8(0);
			var numPoints = view.getUint32(1, true);
			node.numPoints = numPoints;
			stack.push({children: children, numPoints: numPoints, name: node.name});

			var decoded = [];
			var offset = 5;

			while(stack.length > 0)
			{
				var snode = stack.shift();
				var mask = 1;
				for(var i = 0; i < 8; i++)
				{
					if((snode.children & mask) !== 0)
					{
						var childName = snode.name + i;
						var childChildren = view.getUint8(offset);
						var childNumPoints = view.getUint32(offset + 1, true);

						stack.push({children: childChildren, numPoints: childNumPoints, name: childName});
						decoded.push({children: childChildren, numPoints: childNumPoints, name: childName});

						offset += 5;
					}

					mask = mask * 2;
				}

				if(offset === hbuffer.byteLength)
				{
					break;
				}
			}

			var nodes = {};
			nodes[node.name] = node;
			var pco = node.pcoGeometry;

			for(var i = 0; i < decoded.length; i++)
			{
				var name = decoded[i].name;
				var decodedNumPoints = decoded[i].numPoints;
				var index = parseInt(name.charAt(name.length - 1));
				var parentName = name.substring(0, name.length - 1);
				var parentNode = nodes[parentName];
				var level = name.length - 1;
				var boundingBox = POCLoader.createChildAABB(parentNode.boundingBox, index);

				var currentNode = new PointCloudOctreeGeometryNode(name, pco, boundingBox);
				currentNode.level = level;
				currentNode.numPoints = decodedNumPoints;
				currentNode.hasChildren = decoded[i].children > 0;
				currentNode.spacing = pco.spacing / Math.pow(2, level);
				parentNode.addChild(currentNode);
				nodes[name] = currentNode;
			}

			node.loadPoints();
		};
		
		if((node.level % node.pcoGeometry.hierarchyStepSize) === 0)
		{
			var hurl = node.pcoGeometry.octreeDir + "/" + node.getHierarchyPath() + "/" + node.name + ".hrc";
			var xhr = new XMLHttpRequest();
			xhr.open("GET", hurl, true);
			xhr.responseType = "arraybuffer";
			xhr.overrideMimeType("text/plain; charset=x-user-defined");
			xhr.onload = function(event)
			{
				try
				{
					callback(node, xhr.response);
				}
				catch(e)
				{
					Global.numNodesLoading--;
					console.error("Potree: Exception thrown parsing points.", e);
				}
			};
			xhr.onerror = function(event)
			{
				Global.numNodesLoading--;
				console.error("Potree: Failed to load file.", xhr.status, hurl, event);
			}
			xhr.send(null);
		}
	}

	getNumPoints()
	{
		return this.numPoints;
	}

	dispose()
	{
		if(this.geometry && this.parent != null)
		{
			this.geometry.dispose();
			this.geometry = null;
			this.loaded = false;

			for(var i = 0; i < this.oneTimeDisposeHandlers.length; i++)
			{
				var handler = this.oneTimeDisposeHandlers[i];
				handler();
			}
			this.oneTimeDisposeHandlers = [];
		}
	}

}

PointCloudOctreeGeometryNode.IDCount = 0;

Object.assign(PointCloudOctreeGeometryNode.prototype, THREE.EventDispatcher.prototype);

export {PointCloudOctreeGeometry, PointCloudOctreeGeometryNode};