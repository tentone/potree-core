"use strict";

/**
 * laslaz code taken and adapted from plas.io js-laslaz
 *	http://plas.io/
 *  https://github.com/verma/plasio
 *
 * Thanks to Uday Verma and Howard Butler
 */
Potree.LasLazLoader = class LasLazLoader
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

	static progressCB()
	{}

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
					console.log("Potree: Failed to load file! HTTP status: " + xhr.status + ", file: " + url);
				}
			}
		};

		xhr.send(null);
	}

	parse(node, buffer)
	{
		var lf = new LASFile(buffer);
		var handler = new Potree.LasLazBatcher(node);

		//
		//DEBUG
		//
		//invoke the laz decompress worker thousands of times to check for memory leaks
		//until 2018/03/05, it tended to run out of memory at ~6230 invocations
		//
		//
		//lf.open()
		//.then( msg => {
		//	lf.isOpen = true;
		//	return lf;
		//}).catch( msg => {
		//	console.log("failed to open file. :(");	
		//}).then( lf => {
		//	return lf.getHeader().then(function (h) {
		//		return [lf, h];
		//	});
		//}).then( v => {
		//	var lf = v[0];
		//	var header = v[1];

		//	lf.readData(1000000, 0, 1)
		//	.then( v => {
		//		console.log("read");

		//		this.parse(node, buffer);
		//	}).then (v => {
		//		lf.close();	
		//	});

		//})

		lf.open()
			.then(msg =>
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
				var lf = v[0];
				var header = v[1];

				var skip = 1;
				var totalRead = 0;
				var totalToRead = (skip <= 1 ? header.pointsCount : header.pointsCount / skip);
				var reader = function()
				{
					var p = lf.readData(1000000, 0, skip);
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
						Potree.LasLazLoader.progressCB(totalRead / totalToRead);

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
				var lf = v[0];
				//we"re done loading this file
				//
				Potree.LasLazLoader.progressCB(1);

				//Close it
				return lf.close().then(function()
				{
					lf.isOpen = false;

					return v.slice(1);
				}).catch(e =>
				{
					//If there was a cancellation, make sure the file is closed, if the file is open
					//close and then fail
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

	handle(node, url)
	{

	}
};

Potree.LasLazBatcher = class LasLazBatcher
{
	constructor(node)
	{
		this.node = node;
	}

	push(lasBuffer)
	{
		var self = this;

		var message =
		{
			buffer: lasBuffer.arrayb,
			numPoints: lasBuffer.pointsCount,
			pointSize: lasBuffer.pointSize,
			pointFormatID: 2,
			scale: lasBuffer.scale,
			offset: lasBuffer.offset,
			mins: lasBuffer.mins,
			maxs: lasBuffer.maxs
		};

		Potree.workerPool.addTask(Potree.scriptPath + "/workers/LASDecoderWorker.js", 0, function(e)
		{
			var geometry = new THREE.BufferGeometry();
			var numPoints = lasBuffer.pointsCount;

			var positions = new Float32Array(e.data.position);
			var colors = new Uint8Array(e.data.color);
			var intensities = new Float32Array(e.data.intensity);
			var classifications = new Uint8Array(e.data.classification);
			var returnNumbers = new Uint8Array(e.data.returnNumber);
			var numberOfReturns = new Uint8Array(e.data.numberOfReturns);
			var pointSourceIDs = new Uint16Array(e.data.pointSourceID);
			var indices = new Uint8Array(e.data.indices);

			geometry.addAttribute("position", new THREE.BufferAttribute(positions, 3));
			geometry.addAttribute("color", new THREE.BufferAttribute(colors, 4, true));
			geometry.addAttribute("intensity", new THREE.BufferAttribute(intensities, 1));
			geometry.addAttribute("classification", new THREE.BufferAttribute(classifications, 1));
			geometry.addAttribute("returnNumber", new THREE.BufferAttribute(returnNumbers, 1));
			geometry.addAttribute("numberOfReturns", new THREE.BufferAttribute(numberOfReturns, 1));
			geometry.addAttribute("pointSourceID", new THREE.BufferAttribute(pointSourceIDs, 1));
			//geometry.addAttribute("normal", new THREE.BufferAttribute(new Float32Array(numPoints * 3), 3));
			geometry.addAttribute("indices", new THREE.BufferAttribute(indices, 4));
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
			Potree.numNodesLoading--;
			self.node.mean = new THREE.Vector3(...e.data.mean);
		}, message, [message.buffer]);
	};
};
