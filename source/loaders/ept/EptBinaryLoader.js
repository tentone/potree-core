import {Vector3, Box3, BufferAttribute, BufferGeometry} from "three";
import {Global} from "../../Global.js";
import {WorkerManager} from "../../utils/WorkerManager.js";
import {XHRFactory} from "../../XHRFactory.js";

class EptBinaryLoader
{
	load(node)
	{
		if (node.loaded) {return;}

		const url = node.url() + ".bin";

		const xhr = XHRFactory.createXMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";
		xhr.overrideMimeType("text/plain; charset=x-user-defined");
		xhr.onreadystatechange = () =>
		{
			if (xhr.readyState === 4)
			{
				if (xhr.status === 200)
				{
					const buffer = xhr.response;
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
		const worker = Global.workerPool.getWorker(WorkerManager.EPT_BINARY_DECODER);

		worker.onmessage = function(e)
		{
			const g = new BufferGeometry();
			const numPoints = e.data.numPoints;

			const position = new Float32Array(e.data.position);
			g.setAttribute("position", new BufferAttribute(position, 3));

			const indices = new Uint8Array(e.data.indices);
			g.setAttribute("indices", new BufferAttribute(indices, 4));

			if (e.data.color)
			{
				const color = new Uint8Array(e.data.color);
				g.setAttribute("color", new BufferAttribute(color, 4, true));
			}
			if (e.data.intensity)
			{
				const intensity = new Float32Array(e.data.intensity);
				g.setAttribute("intensity", new BufferAttribute(intensity, 1));
			}
			if (e.data.classification)
			{
				const classification = new Uint8Array(e.data.classification);
				g.setAttribute("classification", new BufferAttribute(classification, 1));
			}
			if (e.data.returnNumber)
			{
				const returnNumber = new Uint8Array(e.data.returnNumber);
				g.setAttribute("returnNumber", new BufferAttribute(returnNumber, 1));
			}
			if (e.data.numberOfReturns)
			{
				const numberOfReturns = new Uint8Array(e.data.numberOfReturns);
				g.setAttribute("numberOfReturns", new BufferAttribute(numberOfReturns, 1));
			}
			if (e.data.pointSourceId)
			{
				const pointSourceId = new Uint16Array(e.data.pointSourceId);
				g.setAttribute("pointSourceID", new BufferAttribute(pointSourceId, 1));
			}

			g.attributes.indices.normalized = true;

			const tightBoundingBox = new Box3(
				new Vector3().fromArray(e.data.tightBoundingBox.min),
				new Vector3().fromArray(e.data.tightBoundingBox.max)
			);

			node.doneLoading(g, tightBoundingBox, numPoints, new Vector3(...e.data.mean));

			Global.workerPool.returnWorker(WorkerManager.EPT_BINARY_DECODER, worker);
		};

		const toArray = (v) =>
		{
			return [v.x, v.y, v.z];
		};
		const message = {
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
