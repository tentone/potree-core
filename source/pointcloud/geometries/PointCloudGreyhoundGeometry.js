"use strict";

import {GreyhoundLoader} from "../../loaders/GreyhoundLoader.js";
import {Global} from "../../Global.js";
import {PointCloudTree, PointCloudTreeNode} from "../PointCloudTree.js";

class PointCloudGreyhoundGeometry
{
	constructor()
	{
		this.spacing = 0;
		this.boundingBox = null;
		this.root = null;
		this.nodes = null;
		this.pointAttributes = {};
		this.hierarchyStepSize = -1;
		this.loader = null;
		this.schema = null;

		this.baseDepth = null;
		this.offset = null;
		this.projection = null;

		this.boundingSphere = null;

		// the serverURL will contain the base URL of the greyhound server. f.e. http://dev.greyhound.io/resource/autzen/
		this.serverURL = null;
		this.normalize = {color: false, intensity: false};
	}
}

function PointCloudGreyhoundGeometryNode(name, pcoGeometry, boundingBox, scale, offset)
{
	this.id = PointCloudGreyhoundGeometryNode.IDCount++;
	this.name = name;
	this.index = parseInt(name.charAt(name.length - 1));
	this.pcoGeometry = pcoGeometry;
	this.geometry = null;
	this.boundingBox = boundingBox;
	this.boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
	this.scale = scale;
	this.offset = offset;
	this.children = {};
	this.numPoints = 0;
	this.level = null;
	this.loaded = false;
	this.oneTimeDisposeHandlers = [];
	this.baseLoaded = false;

	var center = new THREE.Vector3();

	var bounds = this.boundingBox.clone();
	bounds.min.sub(this.pcoGeometry.boundingBox.getCenter(center));
	bounds.max.sub(this.pcoGeometry.boundingBox.getCenter(center));

	if(this.scale)
	{
		bounds.min.multiplyScalar(1 / this.scale);
		bounds.max.multiplyScalar(1 / this.scale);
	}

	//This represents the bounds for this node in the reference frame of the
	//global bounds from `info`, centered around the origin, and then scaled
	//by our selected scale.
	this.greyhoundBounds = bounds;

	//This represents the offset between the coordinate system described above
	//and our pcoGeometry bounds.
	this.greyhoundOffset = this.pcoGeometry.offset.clone().add(this.pcoGeometry.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5));
};

PointCloudGreyhoundGeometryNode.IDCount = 0;

PointCloudGreyhoundGeometryNode.prototype = Object.create(PointCloudTreeNode.prototype);

PointCloudGreyhoundGeometryNode.prototype.isGeometryNode = function()
{
	return true;
};

PointCloudGreyhoundGeometryNode.prototype.isTreeNode = function()
{
	return false;
};

PointCloudGreyhoundGeometryNode.prototype.isLoaded = function()
{
	return this.loaded;
};

PointCloudGreyhoundGeometryNode.prototype.getBoundingSphere = function()
{
	return this.boundingSphere;
};

PointCloudGreyhoundGeometryNode.prototype.getBoundingBox = function()
{
	return this.boundingBox;
};

PointCloudGreyhoundGeometryNode.prototype.getLevel = function()
{
	return this.level;
};

PointCloudGreyhoundGeometryNode.prototype.getChildren = function()
{
	var children = [];

	for(var i = 0; i < 8; ++i)
	{
		if(this.children[i])
		{
			children.push(this.children[i]);
		}
	}

	return children;
};

PointCloudGreyhoundGeometryNode.prototype.getURL = function()
{
	var schema = this.pcoGeometry.schema;
	var bounds = this.greyhoundBounds;

	var boundsString = bounds.min.x + "," + bounds.min.y + "," + bounds.min.z + "," + bounds.max.x + "," + bounds.max.y + "," + bounds.max.z;

	var url = "" + this.pcoGeometry.serverURL +
		"read?depthBegin=" +
		(this.baseLoaded ? (this.level + this.pcoGeometry.baseDepth) : 0) +
		"&depthEnd=" + (this.level + this.pcoGeometry.baseDepth + 1) +
		"&bounds=[" + boundsString + "]" +
		"&schema=" + JSON.stringify(schema) +
		"&compress=true";

	if(this.scale)
	{
		url += "&scale=" + this.scale;
	}

	if(this.greyhoundOffset)
	{
		var offset = this.greyhoundOffset;
		url += "&offset=[" + offset.x + "," + offset.y + "," + offset.z + "]";
	}

	if(!this.baseLoaded) this.baseLoaded = true;

	return url;
};

PointCloudGreyhoundGeometryNode.prototype.addChild = function(child)
{
	this.children[child.index] = child;
	child.parent = this;
};

PointCloudGreyhoundGeometryNode.prototype.load = function()
{
	if(this.loading === true || this.loaded === true || Global.numNodesLoading >= Global.maxNodesLoading)
	{
		return;
	}

	this.loading = true;
	Global.numNodesLoading++;

	if(this.level % this.pcoGeometry.hierarchyStepSize === 0 && this.hasChildren)
	{
		this.loadHierarchyThenPoints();
	}
	else
	{
		this.loadPoints();
	}
};

PointCloudGreyhoundGeometryNode.prototype.loadPoints = function()
{
	this.pcoGeometry.loader.load(this);
};

PointCloudGreyhoundGeometryNode.prototype.loadHierarchyThenPoints = function()
{
	//From Greyhound (Cartesian) ordering for the octree to Potree-default
	var transform = [0, 2, 1, 3, 4, 6, 5, 7];

	var makeBitMask = function(node)
	{
		var mask = 0;
		Object.keys(node).forEach(function(key)
		{
			if(key === "swd") mask += 1 << transform[0];
			else if(key === "nwd") mask += 1 << transform[1];
			else if(key === "swu") mask += 1 << transform[2];
			else if(key === "nwu") mask += 1 << transform[3];
			else if(key === "sed") mask += 1 << transform[4];
			else if(key === "ned") mask += 1 << transform[5];
			else if(key === "seu") mask += 1 << transform[6];
			else if(key === "neu") mask += 1 << transform[7];
		});
		return mask;
	};

	var parseChildrenCounts = function(base, parentName, stack)
	{
		var keys = Object.keys(base);
		var child;
		var childName;

		keys.forEach(function(key)
		{
			if(key === "n") return;
			switch(key)
			{
				case "swd":
					child = base.swd;
					childName = parentName + transform[0];
					break;
				case "nwd":
					child = base.nwd;
					childName = parentName + transform[1];
					break;
				case "swu":
					child = base.swu;
					childName = parentName + transform[2];
					break;
				case "nwu":
					child = base.nwu;
					childName = parentName + transform[3];
					break;
				case "sed":
					child = base.sed;
					childName = parentName + transform[4];
					break;
				case "ned":
					child = base.ned;
					childName = parentName + transform[5];
					break;
				case "seu":
					child = base.seu;
					childName = parentName + transform[6];
					break;
				case "neu":
					child = base.neu;
					childName = parentName + transform[7];
					break;
				default:
					break;
			}

			stack.push(
			{
				children: makeBitMask(child),
				numPoints: child.n,
				name: childName
			});

			parseChildrenCounts(child, childName, stack);
		});
	};

	//Load hierarchy.
	var callback = function(node, greyhoundHierarchy)
	{
		var decoded = [];
		node.numPoints = greyhoundHierarchy.n;
		parseChildrenCounts(greyhoundHierarchy, node.name, decoded);

		var nodes = {};
		nodes[node.name] = node;
		var pgg = node.pcoGeometry;

		for(var i = 0; i < decoded.length; i++)
		{
			var name = decoded[i].name;
			var numPoints = decoded[i].numPoints;
			var index = parseInt(name.charAt(name.length - 1));
			var parentName = name.substring(0, name.length - 1);
			var parentNode = nodes[parentName];
			var level = name.length - 1;
			var boundingBox = GreyhoundLoader.createChildAABB(parentNode.boundingBox, index);

			var currentNode = new PointCloudGreyhoundGeometryNode(name, pgg, boundingBox, node.scale, node.offset);
			currentNode.level = level;
			currentNode.numPoints = numPoints;
			currentNode.hasChildren = decoded[i].children > 0;
			currentNode.spacing = pgg.spacing / Math.pow(2, level);

			parentNode.addChild(currentNode);
			nodes[name] = currentNode;
		}

		node.loadPoints();
	};

	if(this.level % this.pcoGeometry.hierarchyStepSize === 0)
	{
		var depthBegin = this.level + this.pcoGeometry.baseDepth;
		var depthEnd = depthBegin + this.pcoGeometry.hierarchyStepSize + 2;

		var bounds = this.greyhoundBounds;

		var boundsString = bounds.min.x + "," + bounds.min.y + "," + bounds.min.z + "," + bounds.max.x + "," + bounds.max.y + "," + bounds.max.z;

		var hurl = "" + this.pcoGeometry.serverURL +
			"hierarchy?bounds=[" + boundsString + "]" +
			"&depthBegin=" + depthBegin +
			"&depthEnd=" + depthEnd;

		if(this.scale)
		{
			hurl += "&scale=" + this.scale;
		}

		if(this.greyhoundOffset)
		{
			var offset = this.greyhoundOffset;
			hurl += "&offset=[" + offset.x + "," + offset.y + "," + offset.z + "]";
		}

		var self = this;
		var xhr = new XMLHttpRequest();
		xhr.overrideMimeType("text/plain");
		xhr.open("GET", hurl, true);
		xhr.onload = function(event)
		{
			try
			{
				callback(self, JSON.parse(xhr.responseText) || {});
			}
			catch(e)
			{
				Global.numNodesLoading--;
				console.error("Potree: Exception thrown parsing points.", e);
			}
		};
		xhr.onerror = function(event)
		{
			console.log("Potree: Failed to load file! HTTP status " + xhr.status + ", file:" + hurl, event);
		}
		xhr.send(null);
	}
};

PointCloudGreyhoundGeometryNode.prototype.getNumPoints = function()
{
	return this.numPoints;
};

PointCloudGreyhoundGeometryNode.prototype.dispose = function()
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
};

Object.assign(PointCloudGreyhoundGeometryNode.prototype, THREE.EventDispatcher.prototype);

export {PointCloudGreyhoundGeometry, PointCloudGreyhoundGeometryNode};