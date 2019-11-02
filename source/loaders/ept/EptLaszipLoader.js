"use strict";

import {Global} from "../../Global.js";
import {LASFile, LASDecoder} from "../LASLoader.js";
import {WorkerManager} from "../../utils/WorkerManager.js";

/**
 * laslaz code taken and adapted from plas.io js-laslaz
 *	http://plas.io/
 *	https://github.com/verma/plasio
 *
 * Thanks to Uday Verma and Howard Butler
 *
 */
class EptLaszipLoader
{
	load(node)
	{
		if(node.loaded)
		{
			return;
		}

		var url = node.url() + ".laz";

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

		xhr.send(null);
	}

	parse(node, buffer)
	{
		var lf = new LASFile(buffer);
		var handler = new EptLazBatcher(node);

		lf.open()
		.then(() =>
		{
			lf.isOpen = true;
			return lf.getHeader();
		})
		.then((header) =>
		{
			var i = 0;
			var np = header.pointsCount;

			var toArray = (v) => [v.x, v.y, v.z];
			var mins = toArray(node.key.b.min);
			var maxs = toArray(node.key.b.max);

			var read = () =>
			{
				var p = lf.readData(1000000, 0, 1);
				return p.then(function (data)
				{
					var d = new LASDecoder(
							data.buffer,
							header.pointsFormatId,
							header.pointsStructSize,
							data.count,
							header.scale,
							header.offset,
							mins,
							maxs);
					d.extraBytes = header.extraBytes;
					d.pointsFormatId = header.pointsFormatId;
					handler.push(d);

					i += data.count;

					if(data.hasMoreData)
					{
						return read();
					}
					else
					{
						header.totalRead = i;
						header.versionAsString = lf.versionAsString;
						header.isCompressed = lf.isCompressed;
						return null;
					}
				});
			};

			return read();
		})
		.then(() => lf.close())
		.then(() => lf.isOpen = false)
		.catch((err) =>
		{
			console.log("Error reading LAZ:", err);
			if(lf.isOpen)
			{
				lf.close().then(() =>
				{
					lf.isOpen = false;
					throw err;
				});
			}
			else throw err;
		});
	}
};

class EptLazBatcher
{
	constructor(node)
	{
		this.node = node;
	}

	push(las)
	{
		var worker = Global.workerPool.getWorker(WorkerManager.EPT_LAS_ZIP_DECODER);

		worker.onmessage = (e) =>
		{
			var g = new THREE.BufferGeometry();
			var numPoints = las.pointsCount;

			var positions = new Float32Array(e.data.position);
			var colors = new Uint8Array(e.data.color);

			var intensities = new Float32Array(e.data.intensity);
			var classifications = new Uint8Array(e.data.classification);
			var returnNumbers = new Uint8Array(e.data.returnNumber);
			var numberOfReturns = new Uint8Array(e.data.numberOfReturns);
			var pointSourceIDs = new Uint16Array(e.data.pointSourceID);
			var indices = new Uint8Array(e.data.indices);

			g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
			g.setAttribute("color", new THREE.BufferAttribute(colors, 4, true));
			g.setAttribute("intensity", new THREE.BufferAttribute(intensities, 1));
			g.setAttribute("classification", new THREE.BufferAttribute(classifications, 1));
			g.setAttribute("returnNumber", new THREE.BufferAttribute(returnNumbers, 1));
			g.setAttribute("numberOfReturns", new THREE.BufferAttribute(numberOfReturns, 1));
			g.setAttribute("pointSourceID", new THREE.BufferAttribute(pointSourceIDs, 1));
			g.setAttribute("indices", new THREE.BufferAttribute(indices, 4));
			g.attributes.indices.normalized = true;

			var tightBoundingBox = new THREE.Box3(
				new THREE.Vector3().fromArray(e.data.tightBoundingBox.min),
				new THREE.Vector3().fromArray(e.data.tightBoundingBox.max)
			);

			this.node.doneLoading(g, tightBoundingBox, numPoints, new THREE.Vector3(...e.data.mean));

			Global.workerPool.returnWorker(WorkerManager.EPT_LAS_ZIP_DECODER, worker);
		};

		var message = {
			buffer: las.arrayb,
			numPoints: las.pointsCount,
			pointSize: las.pointSize,
			pointFormatID: las.pointsFormatId,
			scale: las.scale,
			offset: las.offset,
			mins: las.mins,
			maxs: las.maxs
		};

		worker.postMessage(message, [message.buffer]);
	};
};

export {EptLaszipLoader, EptLazBatcher};
