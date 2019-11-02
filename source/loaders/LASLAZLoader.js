"use strict";

import {VersionUtils} from "../utils/VersionUtils.js";
import {WorkerManager} from "../utils/WorkerManager.js";
import {LASLoader, LAZLoader, LASFile, LASDecoder} from "./LASLoader.js";
import {Global} from "../Global.js";

/**
 * laslaz code taken and adapted from plas.io js-laslaz
 *	http://plas.io/
 *  https://github.com/verma/plasio
 *
 * Thanks to Uday Verma and Howard Butler
 */
class LASLAZLoader
{
	constructor(version)
	{
		if(typeof(version) === "string")
		{
			this.version = new VersionUtils(version);
		}
		else
		{
			this.version = version;
		}
	}

	load(node)
	{
		if(node.loaded)
		{
			return;
		}

		var pointAttributes = node.pcoGeometry.pointAttributes;
		var url = node.getURL();

		if(this.version.equalOrHigher("1.4"))
		{
			url += "." + pointAttributes.toLowerCase();
		}

		var self = this;

		var xhr = new XMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";
		xhr.overrideMimeType("text/plain; charset=x-user-defined");
		xhr.onload = function()
		{
			if(xhr.response instanceof ArrayBuffer)
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
			}
			else
			{
				Global.numNodesLoading--;
				console.log("Potree: LASLAZLoader xhr response is not a ArrayBuffer.");
			}
		};
		xhr.onerror = function()
		{
			Global.numNodesLoading--;
			console.log("Potree: LASLAZLoader failed to load file, " + xhr.status + ", file: " + url);
		};
		xhr.send(null);
	}

	parse(node, buffer)
	{
		var lf = new LASFile(buffer);
		var handler = new LASLAZBatcher(node);

		lf.open() .then(msg =>
		{
			lf.isOpen = true;
			return lf;
		}).catch(msg =>
		{
			console.log("Potree: Failed to open file.");
		}).then(lf =>
		{
			return lf.getHeader().then(function(h)
			{
				return [lf, h];
			});
		}).then(v =>
		{
			let lf = v[0];
			let header = v[1];
			let skip = 1;
			let totalRead = 0;
			let totalToRead = (skip <= 1 ? header.pointsCount : header.pointsCount / skip);

			var reader = function()
			{
				let p = lf.readData(1000000, 0, skip);

				return p.then(function(data)
				{
					handler.push(new LASDecoder(data.buffer,
						header.pointsFormatId,
						header.pointsStructSize,
						data.count,
						header.scale,
						header.offset,
						header.mins, header.maxs));

					totalRead += data.count;

					if(data.hasMoreData)
					{
						return reader();
					}
					else
					{
						header.totalRead = totalRead;
						header.versionAsString = lf.versionAsString;
						header.isCompressed = lf.isCompressed;
						return [lf, header, handler];
					}
				});
			};

			return reader();
		}).then(v =>
		{
			let lf = v[0];

			//Close it
			return lf.close().then(function()
			{
				lf.isOpen = false;
				return v.slice(1);
			}).catch(e =>
			{
				//If there was a cancellation, make sure the file is closed, if the file is open close and then fail
				if(lf.isOpen)
				{
					return lf.close().then(function()
					{
						lf.isOpen = false;
						throw e;
					});
				}
				throw e;
			});
		});
	}

	handle(node, url){}
};

class LASLAZBatcher
{
	constructor(node)
	{
		this.node = node;
	}

	push(data)
	{
		var self = this;

		var message =
		{
			buffer: data.arrayb,
			numPoints: data.pointsCount,
			pointSize: data.pointSize,
			pointFormatID: 2,
			scale: data.scale,
			offset: data.offset,
			mins: data.mins,
			maxs: data.maxs
		};

		var worker = Global.workerPool.getWorker(WorkerManager.LAS_DECODER);
		worker.onmessage = function(e)
		{
			var geometry = new THREE.BufferGeometry();
			var numPoints = data.pointsCount;

			var positions = new Float32Array(e.data.position);
			var colors = new Uint8Array(e.data.color);
			var intensities = new Float32Array(e.data.intensity);
			var classifications = new Uint8Array(e.data.classification);
			var returnNumbers = new Uint8Array(e.data.returnNumber);
			var numberOfReturns = new Uint8Array(e.data.numberOfReturns);
			var pointSourceIDs = new Uint16Array(e.data.pointSourceID);
			var indices = new Uint8Array(e.data.indices);

			geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
			geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4, true));
			geometry.setAttribute("intensity", new THREE.BufferAttribute(intensities, 1));
			geometry.setAttribute("classification", new THREE.BufferAttribute(classifications, 1));
			geometry.setAttribute("returnNumber", new THREE.BufferAttribute(returnNumbers, 1));
			geometry.setAttribute("numberOfReturns", new THREE.BufferAttribute(numberOfReturns, 1));
			geometry.setAttribute("pointSourceID", new THREE.BufferAttribute(pointSourceIDs, 1));
			//geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(numPoints * 3), 3));
			geometry.setAttribute("indices", new THREE.BufferAttribute(indices, 4));
			geometry.attributes.indices.normalized = true;

			var tightBoundingBox = new THREE.Box3
			(
				new THREE.Vector3().fromArray(e.data.tightBoundingBox.min),
				new THREE.Vector3().fromArray(e.data.tightBoundingBox.max)
			);

			geometry.boundingBox = self.node.boundingBox;
			self.node.tightBoundingBox = tightBoundingBox;

			self.node.geometry = geometry;
			self.node.numPoints = numPoints;
			self.node.loaded = true;
			self.node.loading = false;
			Global.numNodesLoading--;
			self.node.mean = new THREE.Vector3(...e.data.mean);

			Global.workerPool.returnWorker(WorkerManager.LAS_DECODER, worker);
		};

		worker.postMessage(message, [message.buffer]);
	};
};

export {LASLAZLoader};
