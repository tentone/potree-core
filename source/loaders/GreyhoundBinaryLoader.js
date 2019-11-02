"use strict";

import {PointAttributeNames} from "../PointAttributes.js";
import {VersionUtils} from "../utils/VersionUtils.js";
import {WorkerManager} from "../utils/WorkerManager.js";
import {Global} from "../Global.js";

class GreyhoundBinaryLoader
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
		if(node.loaded) return;

		var self = this;
		var url = node.getURL();

		var xhr = new XMLHttpRequest();
		xhr.overrideMimeType("text/plain");
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
				console.error("Potree: Exception thrown parsing points.", e);
				Global.numNodesLoading--;
			}
		};
		xhr.onerror = function(event)
		{
			Global.numNodesLoading--;
			console.error("Potree: Failed to load file.", xhr, url);
		};
		xhr.send(null);
	}

	parse(node, buffer)
	{
		var NUM_POINTS_BYTES = 4;
		var view = new DataView(buffer, buffer.byteLength - NUM_POINTS_BYTES, NUM_POINTS_BYTES);
		var numPoints = view.getUint32(0, true);
		var pointAttributes = node.pcoGeometry.pointAttributes;

		node.numPoints = numPoints;

		var bb = node.boundingBox;
		var center = new THREE.Vector3();
		var nodeOffset = node.pcoGeometry.boundingBox.getCenter(center).sub(node.boundingBox.min);

		var message =
		{
			buffer: buffer,
			pointAttributes: pointAttributes,
			version: this.version.version,
			schema: node.pcoGeometry.schema,
			min: [bb.min.x, bb.min.y, bb.min.z],
			max: [bb.max.x, bb.max.y, bb.max.z],
			offset: nodeOffset.toArray(),
			scale: this.scale,
			normalize: node.pcoGeometry.normalize
		};

		Global.workerPool.runTask(WorkerManager.GREYHOUND, function(e)
		{
			var data = e.data;
			var buffers = data.attributeBuffers;
			
			var tightBoundingBox = new THREE.Box3
			(
				new THREE.Vector3().fromArray(data.tightBoundingBox.min),
				new THREE.Vector3().fromArray(data.tightBoundingBox.max)
			);

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

			node.numPoints = data.numPoints;
			node.geometry = geometry;
			node.mean = new THREE.Vector3(...data.mean);
			node.tightBoundingBox = tightBoundingBox;
			node.loaded = true;
			node.loading = false;
			Global.numNodesLoading--;
		}, message, [message.buffer]);
	}
}

export {GreyhoundBinaryLoader};