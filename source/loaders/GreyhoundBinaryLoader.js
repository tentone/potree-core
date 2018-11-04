"use strict";

Potree.GreyhoundBinaryLoader = class
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
		xhr.onreadystatechange = function()
		{
			if(xhr.readyState === 4)
			{
				if(xhr.status === 200 || xhr.status === 0)
				{
					var buffer = xhr.response;
					self.parse(node, buffer);
				}
				else
				{
					console.log("Potree: Failed to load file.", xhr, url);
				}
			}
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
		var nodeOffset = node.pcoGeometry.boundingBox.getCenter().sub(node.boundingBox.min);

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

		Potree.workerPool.addTask(Potree.scriptPath + "/workers/GreyhoundBinaryDecoderWorker.js", function(e)
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

				if(parseInt(property) === Potree.PointAttributeNames.POSITION_CARTESIAN)
				{
					geometry.addAttribute("position", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.COLOR_PACKED)
				{
					geometry.addAttribute("color", new THREE.BufferAttribute(new Uint8Array(buffer), 4, true));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.INTENSITY)
				{
					geometry.addAttribute("intensity", new THREE.BufferAttribute(new Float32Array(buffer), 1));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.CLASSIFICATION)
				{
					geometry.addAttribute("classification", new THREE.BufferAttribute(new Uint8Array(buffer), 1));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.NORMAL_SPHEREMAPPED)
				{
					geometry.addAttribute("normal", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.NORMAL_OCT16)
				{
					geometry.addAttribute("normal", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.NORMAL)
				{
					geometry.addAttribute("normal", new THREE.BufferAttribute(new Float32Array(buffer), 3));
				}
				else if(parseInt(property) === Potree.PointAttributeNames.INDICES)
				{
					var bufferAttribute = new THREE.BufferAttribute(new Uint8Array(buffer), 4);
					bufferAttribute.normalized = true;
					geometry.addAttribute("indices", bufferAttribute);
				}
				else if(parseInt(property) === Potree.PointAttributeNames.SPACING)
				{
					var bufferAttribute = new THREE.BufferAttribute(new Float32Array(buffer), 1);
					geometry.addAttribute("spacing", bufferAttribute);
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
			Potree.numNodesLoading--;
		}, message, [message.buffer]);
	}
}