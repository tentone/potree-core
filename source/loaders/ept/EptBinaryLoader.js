"use strict";

import {Global} from "../../Global.js";
import {WorkerManager} from "../../utils/WorkerManager.js";

class EptBinaryLoader
{
	load(node)
	{
		if(node.loaded) return;

		var url = node.url() + ".bin";

		var xhr = new XMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";
		xhr.overrideMimeType("text/plain; charset=x-user-defined");
		xhr.onreadystatechange = () =>
		{
			if(xhr.readyState === 4)
			{
				if(xhr.status === 200)
				{
					var buffer = xhr.response;
					this.parse(node, buffer);
				}
				else
				{
					console.log("Failed " + url + ": " + xhr.status);
				}
			}
		};

		try
		{
			xhr.send(null);
		}
		catch (e)
		{
			console.log("Failed request: " + e);
		}
	}

	parse(node, buffer)
	{
		var worker = Global.workerPool.getWorker(WorkerManager.EPT_BINARY_DECODER);

		worker.onmessage = function(e)
		{
			var g = new THREE.BufferGeometry();
			var numPoints = e.data.numPoints;

			var position = new Float32Array(e.data.position);
			g.setAttribute("position", new THREE.BufferAttribute(position, 3));

			var indices = new Uint8Array(e.data.indices);
			g.setAttribute("indices", new THREE.BufferAttribute(indices, 4));

			if(e.data.color)
			{
				var color = new Uint8Array(e.data.color);
				g.setAttribute("color", new THREE.BufferAttribute(color, 4, true));
			}
			if(e.data.intensity)
			{
				var intensity = new Float32Array(e.data.intensity);
				g.setAttribute("intensity", new THREE.BufferAttribute(intensity, 1));
			}
			if(e.data.classification)
			{
				var classification = new Uint8Array(e.data.classification);
				g.setAttribute("classification", new THREE.BufferAttribute(classification, 1));
			}
			if(e.data.returnNumber)
			{
				var returnNumber = new Uint8Array(e.data.returnNumber);
				g.setAttribute("returnNumber", new THREE.BufferAttribute(returnNumber, 1));
			}
			if(e.data.numberOfReturns)
			{
				var numberOfReturns = new Uint8Array(e.data.numberOfReturns);
				g.setAttribute("numberOfReturns", new THREE.BufferAttribute(numberOfReturns, 1));
			}
			if(e.data.pointSourceId)
			{
				var pointSourceId = new Uint16Array(e.data.pointSourceId);
				g.setAttribute("pointSourceID", new THREE.BufferAttribute(pointSourceId, 1));
			}

			g.attributes.indices.normalized = true;

			var tightBoundingBox = new THREE.Box3(
				new THREE.Vector3().fromArray(e.data.tightBoundingBox.min),
				new THREE.Vector3().fromArray(e.data.tightBoundingBox.max)
			);

			node.doneLoading(g, tightBoundingBox, numPoints, new THREE.Vector3(...e.data.mean));

			Global.workerPool.returnWorker(WorkerManager.EPT_BINARY_DECODER, worker);
		};

		var toArray = (v) => [v.x, v.y, v.z];
		var message = {
			buffer: buffer,
			schema: node.ept.schema,
			scale: node.ept.eptScale,
			offset: node.ept.eptOffset,
			mins: toArray(node.key.b.min)
		};

		worker.postMessage(message, [message.buffer]);
	}
};

export {EptBinaryLoader};
