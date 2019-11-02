"use strict";

import {PointAttributes, PointAttribute} from "../../PointAttributes.js";
import {Global} from "../../Global.js";
import {PointCloudTree, PointCloudTreeNode} from "../PointCloudTree.js";

class PointCloudArena4DGeometryNode
{
	constructor()
	{
		this.left = null;
		this.right = null;
		this.boundingBox = null;
		this.number = null;
		this.pcoGeometry = null;
		this.loaded = false;
		this.numPoints = 0;
		this.level = 0;
		this.children = [];
		this.oneTimeDisposeHandlers = [];
	}

	isGeometryNode()
	{
		return true;
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

		if(this.left)
		{
			children.push(this.left);
		}

		if(this.right)
		{
			children.push(this.right);
		}

		return children;
	}

	getLevel()
	{
		return this.level;
	}

	load()
	{
		if(this.loaded || this.loading)
		{
			return;
		}

		if(Global.numNodesLoading >= Global.maxNodesLoading)
		{
			return;
		}

		this.loading = true;

		Global.numNodesLoading++;

		var self = this;
		var url = this.pcoGeometry.url + "?node=" + this.number;
		
		var xhr = new XMLHttpRequest();
		xhr.overrideMimeType("text/plain");
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";
		xhr.onload = function()
		{
			try
			{
				var buffer = xhr.response;
				var sourceView = new DataView(buffer);
				var numPoints = buffer.byteLength / 17;
				var bytesPerPoint = 28;

				var data = new ArrayBuffer(numPoints * bytesPerPoint);
				var targetView = new DataView(data);

				var attributes = [
					PointAttribute.POSITION_CARTESIAN,
					PointAttribute.RGBA_PACKED,
					PointAttribute.INTENSITY,
					PointAttribute.CLASSIFICATION,
				];

				var position = new Float32Array(numPoints * 3);
				var color = new Uint8Array(numPoints * 4);
				var intensities = new Float32Array(numPoints);
				var classifications = new Uint8Array(numPoints);
				var indices = new ArrayBuffer(numPoints * 4);
				var u32Indices = new Uint32Array(indices);

				var tightBoundingBox = new THREE.Box3();

				for(var i = 0; i < numPoints; i++)
				{
					var x = sourceView.getFloat32(i * 17 + 0, true) + self.boundingBox.min.x;
					var y = sourceView.getFloat32(i * 17 + 4, true) + self.boundingBox.min.y;
					var z = sourceView.getFloat32(i * 17 + 8, true) + self.boundingBox.min.z;

					var r = sourceView.getUint8(i * 17 + 12, true);
					var g = sourceView.getUint8(i * 17 + 13, true);
					var b = sourceView.getUint8(i * 17 + 14, true);

					var intensity = sourceView.getUint8(i * 17 + 15, true);

					var classification = sourceView.getUint8(i * 17 + 16, true);

					tightBoundingBox.expandByPoint(new THREE.Vector3(x, y, z));

					position[i * 3 + 0] = x;
					position[i * 3 + 1] = y;
					position[i * 3 + 2] = z;

					color[i * 4 + 0] = r;
					color[i * 4 + 1] = g;
					color[i * 4 + 2] = b;
					color[i * 4 + 3] = 255;

					intensities[i] = intensity;
					classifications[i] = classification;

					u32Indices[i] = i;
				}

				var geometry = new THREE.BufferGeometry();
				geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
				geometry.setAttribute("color", new THREE.BufferAttribute(color, 4, true));
				geometry.setAttribute("intensity", new THREE.BufferAttribute(intensities, 1));
				geometry.setAttribute("classification", new THREE.BufferAttribute(classifications, 1));
				{
					var bufferAttribute = new THREE.BufferAttribute(new Uint8Array(indices), 4, true);
					geometry.setAttribute("indices", bufferAttribute);
				}

				self.geometry = geometry;
				self.numPoints = numPoints;
				self.loaded = true;
				self.loading = false;
				Global.numNodesLoading--;
			}
			catch(e)
			{
				console.error("Potree: Exception thrown parsing points.", e);
				Global.numNodesLoading--;
			}

		};
		xhr.onerror = function()
		{
			Global.numNodesLoading--;
			console.log("Potree: Failed to load file, " + xhr.status + ", file: " + url);
		};
		xhr.send(null);
	}

	dispose()
	{
		if(this.geometry && this.parent != null)
		{
			this.geometry.dispose();
			this.geometry = null;
			this.loaded = false;

			//this.dispatchEvent( { type: "dispose" } );
			for(var i = 0; i < this.oneTimeDisposeHandlers.length; i++)
			{
				var handler = this.oneTimeDisposeHandlers[i];
				handler();
			}
			this.oneTimeDisposeHandlers = [];
		}
	}

	getNumPoints()
	{
		return this.numPoints;
	}
};

class PointCloudArena4DGeometry extends THREE.EventDispatcher
{
	constructor()
	{
		super();

		this.numPoints = 0;
		this.version = 0;
		this.boundingBox = null;
		this.numNodes = 0;
		this.name = null;
		this.provider = null;
		this.url = null;
		this.root = null;
		this.levels = 0;
		this._spacing = null;
		this.pointAttributes = new PointAttributes([
			"POSITION_CARTESIAN",
			"COLOR_PACKED"
		]);
	}

	static load(url, callback)
	{
		var xhr = new XMLHttpRequest();
		xhr.overrideMimeType("text/plain");
		xhr.open("GET", url + "?info", true);

		xhr.onreadystatechange = function()
		{
			try
			{
				if(xhr.readyState === 4 && xhr.status === 200)
				{
					var response = JSON.parse(xhr.responseText);

					var geometry = new PointCloudArena4DGeometry();
					geometry.url = url;
					geometry.name = response.Name;
					geometry.provider = response.Provider;
					geometry.numNodes = response.Nodes;
					geometry.numPoints = response.Points;
					geometry.version = response.Version;
					geometry.boundingBox = new THREE.Box3(
						new THREE.Vector3().fromArray(response.BoundingBox.slice(0, 3)),
						new THREE.Vector3().fromArray(response.BoundingBox.slice(3, 6))
					);
					if(response.Spacing)
					{
						geometry.spacing = response.Spacing;
					}

					var offset = geometry.boundingBox.min.clone().multiplyScalar(-1);

					geometry.boundingBox.min.add(offset);
					geometry.boundingBox.max.add(offset);
					geometry.offset = offset;

					var center = new THREE.Vector3();
					geometry.boundingBox.getCenter(center);
					var radius = geometry.boundingBox.getSize(new THREE.Vector3()).length() / 2;
					geometry.boundingSphere = new THREE.Sphere(center, radius);

					geometry.loadHierarchy();

					callback(geometry);
				}
				else if(xhr.readyState === 4)
				{
					callback(null);
				}
			}
			catch(e)
			{
				console.error(e.message);
				callback(null);
			}
		};

		xhr.send(null);
	};

	loadHierarchy()
	{
		var url = this.url + "?tree";
		
		var xhr = new XMLHttpRequest();
		xhr.overrideMimeType("text/plain");
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";

		xhr.onreadystatechange = () =>
		{
			if(!(xhr.readyState === 4 && xhr.status === 200))
			{
				return;
			}

			var buffer = xhr.response;
			var numNodes = buffer.byteLength / 3;
			var view = new DataView(buffer);
			var stack = [];
			var root = null;

			var levels = 0;

			//TODO Debug: var start = new Date().getTime();
			//read hierarchy
			for(var i = 0; i < numNodes; i++)
			{
				var mask = view.getUint8(i * 3 + 0, true);

				var hasLeft = (mask & 1) > 0;
				var hasRight = (mask & 2) > 0;
				var splitX = (mask & 4) > 0;
				var splitY = (mask & 8) > 0;
				var splitZ = (mask & 16) > 0;
				var split = null;
				if(splitX)
				{
					split = "X";
				}
				else if(splitY)
				{
					split = "Y";
				}
				if(splitZ)
				{
					split = "Z";
				}

				var node = new PointCloudArena4DGeometryNode();
				node.hasLeft = hasLeft;
				node.hasRight = hasRight;
				node.split = split;
				node.isLeaf = !hasLeft && !hasRight;
				node.number = i;
				node.left = null;
				node.right = null;
				node.pcoGeometry = this;
				node.level = stack.length;
				levels = Math.max(levels, node.level);

				

				if(stack.length > 0)
				{
					var parent = stack[stack.length - 1];
					node.boundingBox = parent.boundingBox.clone();
					var parentBBSize = parent.boundingBox.getSize(new THREE.Vector3());

					if(parent.hasLeft && !parent.left)
					{
						parent.left = node;
						parent.children.push(node);

						if(parent.split === "X")
						{
							node.boundingBox.max.x = node.boundingBox.min.x + parentBBSize.x / 2;
						}
						else if(parent.split === "Y")
						{
							node.boundingBox.max.y = node.boundingBox.min.y + parentBBSize.y / 2;
						}
						else if(parent.split === "Z")
						{
							node.boundingBox.max.z = node.boundingBox.min.z + parentBBSize.z / 2;
						}

						
						var center = new THREE.Vector3();
						node.boundingBox.getCenter(center);
						var radius = node.boundingBox.getSize(new THREE.Vector3()).length() / 2;
						node.boundingSphere = new THREE.Sphere(center, radius);
					}
					else
					{
						parent.right = node;
						parent.children.push(node);

						if(parent.split === "X")
						{
							node.boundingBox.min.x = node.boundingBox.min.x + parentBBSize.x / 2;
						}
						else if(parent.split === "Y")
						{
							node.boundingBox.min.y = node.boundingBox.min.y + parentBBSize.y / 2;
						}
						else if(parent.split === "Z")
						{
							node.boundingBox.min.z = node.boundingBox.min.z + parentBBSize.z / 2;
						}

						var center = new THREE.Vector3();
						node.boundingBox.getCenter(center);
						var radius = node.boundingBox.getSize(new THREE.Vector3()).length() / 2;
						node.boundingSphere = new THREE.Sphere(center, radius);
					}
				}
				else
				{
					root = node;
					root.boundingBox = this.boundingBox.clone();

					var center = new THREE.Vector3();
					root.boundingBox.getCenter(center);
					var radius = root.boundingBox.getSize(new THREE.Vector3()).length() / 2;
					root.boundingSphere = new THREE.Sphere(center, radius);
				}

				var bbSize = node.boundingBox.getSize(new THREE.Vector3());
				node.spacing = ((bbSize.x + bbSize.y + bbSize.z) / 3) / 75;
				node.estimatedSpacing = node.spacing;

				stack.push(node);

				if(node.isLeaf)
				{
					var done = false;
					while(!done && stack.length > 0)
					{
						stack.pop();

						var top = stack[stack.length - 1];

						done = stack.length > 0 && top.hasRight && top.right == null;
					}
				}
			}

			this.root = root;
			this.levels = levels;

			this.dispatchEvent(
			{
				type: "hierarchy_loaded"
			});
		};

		xhr.send(null);
	};

	get spacing()
	{
		if(this._spacing)
		{
			return this._spacing;
		}
		else if(this.root)
		{
			return this.root.spacing;
		}
	}

	set spacing(value)
	{
		this._spacing = value;
	}
};

export {PointCloudArena4DGeometry, PointCloudArena4DGeometryNode};
