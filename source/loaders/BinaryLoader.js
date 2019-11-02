"use strict";

import {PointAttributeNames} from "../PointAttributes.js";
import {VersionUtils} from "../utils/VersionUtils.js";
import {WorkerManager} from "../utils/WorkerManager.js";
import {Global} from "../Global.js";

class BinaryLoader
{
	constructor(version, boundingBox, scale)
	{
		if(typeof(version) === "string")
		{
			this.version = new VersionUtils(version);
		}
		else
		{
			this.version = version;
		}

		this.boundingBox = boundingBox;
		this.scale = scale;
	}

	load(node)
	{
		if(node.loaded)
		{
			return;
		}

		var url = node.getURL();

		if(this.version.equalOrHigher("1.4"))
		{
			url += ".bin";
		}
		
		var self = this;
		var xhr = new XMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";
		xhr.overrideMimeType("text/plain; charset=x-user-defined");
		xhr.onload = function()
		{
			try
			{
				self.parse(node, xhr.response);
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
			console.error("Potree: Failed to load file.", xhr, url);
		};

		xhr.send(null);
	};

	parse(node, buffer)
	{
		var pointAttributes = node.pcoGeometry.pointAttributes;
		var numPoints = buffer.byteLength / node.pcoGeometry.pointAttributes.byteSize;

		if(this.version.upTo("1.5"))
		{
			node.numPoints = numPoints;
		}

		var message =
		{
			buffer: buffer,
			pointAttributes: pointAttributes,
			version: this.version.version,
			min: [node.boundingBox.min.x, node.boundingBox.min.y, node.boundingBox.min.z],
			offset: [node.pcoGeometry.offset.x, node.pcoGeometry.offset.y, node.pcoGeometry.offset.z],
			scale: this.scale,
			spacing: node.spacing,
			hasChildren: node.hasChildren,
			name: node.name
		};

		Global.workerPool.runTask(WorkerManager.BINARY_DECODER, function(e)
		{
			var data = e.data;

			if(data.error !== undefined)
			{
				Global.numNodesLoading--;
				console.error("Potree: Binary worker error.", data);
				return;
			}

			var buffers = data.attributeBuffers;
			var tightBoundingBox = new THREE.Box3(new THREE.Vector3().fromArray(data.tightBoundingBox.min), new THREE.Vector3().fromArray(data.tightBoundingBox.max));
			var geometry = new THREE.BufferGeometry();

			for(var property in buffers)
			{
				var buffer = buffers[property].buffer;

				if(parseInt(property) === PointAttributeNames.POSITION_CARTESIAN)
				{
					geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === PointAttributeNames.COLOR_PACKED)
				{
					geometry.setAttribute("color", new THREE.BufferAttribute(new Uint8Array(buffer), 4, true));
				}
				else if(parseInt(property) === PointAttributeNames.INTENSITY)
				{
					geometry.setAttribute("intensity", new THREE.BufferAttribute(new Float32Array(buffer), 1));
				}
				else if(parseInt(property) === PointAttributeNames.CLASSIFICATION)
				{
					geometry.setAttribute("classification", new THREE.BufferAttribute(new Uint8Array(buffer), 1));
				}
				else if(parseInt(property) === PointAttributeNames.NORMAL_SPHEREMAPPED)
				{
					geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === PointAttributeNames.NORMAL_OCT16)
				{
					geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === PointAttributeNames.NORMAL)
				{
					geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === PointAttributeNames.INDICES)
				{
					var bufferAttribute = new THREE.BufferAttribute(new Uint8Array(buffer), 4);
					bufferAttribute.normalized = true;
					geometry.setAttribute("indices", bufferAttribute);
				}
				else if(parseInt(property) === PointAttributeNames.SPACING)
				{
					var bufferAttribute = new THREE.BufferAttribute(new Float32Array(buffer), 1);
					geometry.setAttribute("spacing", bufferAttribute);
				}
			}

			tightBoundingBox.max.sub(tightBoundingBox.min);
			tightBoundingBox.min.set(0, 0, 0);

			var numPoints = e.data.buffer.byteLength / pointAttributes.byteSize;

			node.numPoints = numPoints;
			node.geometry = geometry;
			node.mean = new THREE.Vector3(...data.mean);
			node.tightBoundingBox = tightBoundingBox;
			node.loaded = true;
			node.loading = false;
			node.estimatedSpacing = data.estimatedSpacing;
			Global.numNodesLoading--;
		}, message, [message.buffer]);
	};
};

export {BinaryLoader};
