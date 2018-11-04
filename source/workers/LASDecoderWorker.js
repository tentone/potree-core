"use strict";

function readUsingTempArrays(event)
{
	var buffer = event.data.buffer;
	var numPoints = event.data.numPoints;
	var sourcePointSize = event.data.pointSize;
	var pointFormatID = event.data.pointFormatID;
	var scale = event.data.scale;
	var offset = event.data.offset;

	var temp = new ArrayBuffer(4);
	var tempUint8 = new Uint8Array(temp);
	var tempUint16 = new Uint16Array(temp);
	var tempInt32 = new Int32Array(temp);
	var sourceUint8 = new Uint8Array(buffer);
	var sourceView = new DataView(buffer);
	
	var targetPointSize = 20;
	var targetBuffer = new ArrayBuffer(numPoints * targetPointSize);
	var targetView = new DataView(targetBuffer);

	var tightBoundingBox =
	{
		min: [ Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY ],
		max: [ Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY ]
	};

	var mean = [0, 0, 0];

	var pBuff = new ArrayBuffer(numPoints * 3 * 4);
	var cBuff = new ArrayBuffer(numPoints * 4);
	var iBuff = new ArrayBuffer(numPoints * 4);
	var clBuff = new ArrayBuffer(numPoints);
	var rnBuff = new ArrayBuffer(numPoints);
	var nrBuff = new ArrayBuffer(numPoints);
	var psBuff = new ArrayBuffer(numPoints * 2);

	var positions = new Float32Array(pBuff);
	var colors = new Uint8Array(cBuff);
	var intensities = new Float32Array(iBuff);
	var classifications = new Uint8Array(clBuff);
	var returnNumbers = new Uint8Array(rnBuff);
	var numberOfReturns = new Uint8Array(nrBuff);
	var pointSourceIDs = new Uint16Array(psBuff);
	
	for(var i = 0; i < numPoints; i++)
	{
		//POSITION
		tempUint8[0] = sourceUint8[i * sourcePointSize + 0];
		tempUint8[1] = sourceUint8[i * sourcePointSize + 1];
		tempUint8[2] = sourceUint8[i * sourcePointSize + 2];
		tempUint8[3] = sourceUint8[i * sourcePointSize + 3];
		var x = tempInt32[0];
		
		tempUint8[0] = sourceUint8[i * sourcePointSize + 4];
		tempUint8[1] = sourceUint8[i * sourcePointSize + 5];
		tempUint8[2] = sourceUint8[i * sourcePointSize + 6];
		tempUint8[3] = sourceUint8[i * sourcePointSize + 7];
		var y = tempInt32[0];
		
		tempUint8[0] = sourceUint8[i * sourcePointSize + 8];
		tempUint8[1] = sourceUint8[i * sourcePointSize + 9];
		tempUint8[2] = sourceUint8[i * sourcePointSize + 10];
		tempUint8[3] = sourceUint8[i * sourcePointSize + 11];
		var z = tempInt32[0];
		
		x = x * scale[0] + offset[0] - event.data.mins[0];
		y = y * scale[1] + offset[1] - event.data.mins[1];
		z = z * scale[2] + offset[2] - event.data.mins[2];

		positions[3 * i + 0] = x;
		positions[3 * i + 1] = y;
		positions[3 * i + 2] = z;

		mean[0] += x / numPoints;
		mean[1] += y / numPoints;
		mean[2] += z / numPoints;

		tightBoundingBox.min[0] = Math.min(tightBoundingBox.min[0], x);
		tightBoundingBox.min[1] = Math.min(tightBoundingBox.min[1], y);
		tightBoundingBox.min[2] = Math.min(tightBoundingBox.min[2], z);

		tightBoundingBox.max[0] = Math.max(tightBoundingBox.max[0], x);
		tightBoundingBox.max[1] = Math.max(tightBoundingBox.max[1], y);
		tightBoundingBox.max[2] = Math.max(tightBoundingBox.max[2], z);

		//INTENSITY
		tempUint8[0] = sourceUint8[i * sourcePointSize + 12];
		tempUint8[1] = sourceUint8[i * sourcePointSize + 13];
		var intensity = tempUint16[0];
		intensities[i] = intensity;

		//RETURN NUMBER, stored in the first 3 bits - 00000111
		var returnNumber = sourceUint8[i * sourcePointSize + 14] & 0b111;
		returnNumbers[i] = returnNumber;

		//NUMBER OF RETURNS, stored in 00111000
		numberOfReturns[i] = (sourceUint8[i * pointSize + 14] & 0b111000) >> 3;

		debugger;

		//CLASSIFICATION
		var classification = sourceUint8[i * sourcePointSize + 15];
		classifications[i] = classification;

		//POINT SOURCE ID
		tempUint8[0] = sourceUint8[i * sourcePointSize + 18];
		tempUint8[1] = sourceUint8[i * sourcePointSize + 19];
		var pointSourceID = tempUint16[0];
		pointSourceIDs[i] = pointSourceID;

		//COLOR, if available
		if (pointFormatID === 2)
		{
			tempUint8[0] = sourceUint8[i * sourcePointSize + 20];
			tempUint8[1] = sourceUint8[i * sourcePointSize + 21];
			var r = tempUint16[0];

			tempUint8[0] = sourceUint8[i * sourcePointSize + 22];
			tempUint8[1] = sourceUint8[i * sourcePointSize + 23];
			var g = tempUint16[0];

			tempUint8[0] = sourceUint8[i * sourcePointSize + 24];
			tempUint8[1] = sourceUint8[i * sourcePointSize + 25];
			var b = tempUint16[0];

			r = r / 256;
			g = g / 256;
			b = b / 256;
			colors[4 * i + 0] = r;
			colors[4 * i + 1] = g;
			colors[4 * i + 2] = b;
		}
	}

	var indices = new ArrayBuffer(numPoints * 4);
	var iIndices = new Uint32Array(indices);

	for(var i = 0; i < numPoints; i++)
	{
		iIndices[i] = i;
	}

	
	var message =
	{
		mean: mean,
		position: pBuff,
		color: cBuff,
		intensity: iBuff,
		classification: clBuff,
		returnNumber: rnBuff,
		numberOfReturns: nrBuff,
		pointSourceID: psBuff,
		tightBoundingBox: tightBoundingBox,
		indices: indices
	};

	var transferables =
	[
		message.position,
		message.color,
		message.intensity,
		message.classification,
		message.returnNumber,
		message.numberOfReturns,
		message.pointSourceID,
		message.indices
	];

	debugger;

	postMessage(message, transferables);
};

function readUsingDataView(event)
{
	var buffer = event.data.buffer;
	var numPoints = event.data.numPoints;
	var sourcePointSize = event.data.pointSize;
	var pointFormatID = event.data.pointFormatID;
	var scale = event.data.scale;
	var offset = event.data.offset;

	var sourceUint8 = new Uint8Array(buffer);
	var sourceView = new DataView(buffer);
	
	var targetPointSize = 40;
	var targetBuffer = new ArrayBuffer(numPoints * targetPointSize);
	var targetView = new DataView(targetBuffer);

	var tightBoundingBox =
	{
		min: [ Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY ],
		max: [ Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY ]
	};

	var mean = [0, 0, 0];

	var pBuff = new ArrayBuffer(numPoints * 3 * 4);
	var cBuff = new ArrayBuffer(numPoints * 4);
	var iBuff = new ArrayBuffer(numPoints * 4);
	var clBuff = new ArrayBuffer(numPoints);
	var rnBuff = new ArrayBuffer(numPoints);
	var nrBuff = new ArrayBuffer(numPoints);
	var psBuff = new ArrayBuffer(numPoints * 2);

	var positions = new Float32Array(pBuff);
	var colors = new Uint8Array(cBuff);
	var intensities = new Float32Array(iBuff);
	var classifications = new Uint8Array(clBuff);
	var returnNumbers = new Uint8Array(rnBuff);
	var numberOfReturns = new Uint8Array(nrBuff);
	var pointSourceIDs = new Uint16Array(psBuff);
	
	for (var i = 0; i < numPoints; i++)
	{
		//POSITION
		var ux = sourceView.getInt32(i * sourcePointSize + 0, true);
		var uy = sourceView.getInt32(i * sourcePointSize + 4, true);
		var uz = sourceView.getInt32(i * sourcePointSize + 8, true);

		x = ux * scale[0] + offset[0] - event.data.mins[0];
		y = uy * scale[1] + offset[1] - event.data.mins[1];
		z = uz * scale[2] + offset[2] - event.data.mins[2];

		positions[3 * i + 0] = x;
		positions[3 * i + 1] = y;
		positions[3 * i + 2] = z;

		mean[0] += x / numPoints;
		mean[1] += y / numPoints;
		mean[2] += z / numPoints;

		tightBoundingBox.min[0] = Math.min(tightBoundingBox.min[0], x);
		tightBoundingBox.min[1] = Math.min(tightBoundingBox.min[1], y);
		tightBoundingBox.min[2] = Math.min(tightBoundingBox.min[2], z);

		tightBoundingBox.max[0] = Math.max(tightBoundingBox.max[0], x);
		tightBoundingBox.max[1] = Math.max(tightBoundingBox.max[1], y);
		tightBoundingBox.max[2] = Math.max(tightBoundingBox.max[2], z);

		//INTENSITY
		var intensity = sourceView.getUint16(i * sourcePointSize + 12, true);
		intensities[i] = intensity;

		//RETURN NUMBER, stored in the first 3 bits - 00000111
		//number of returns stored in next 3 bits   - 00111000
		var returnNumberAndNumberOfReturns = sourceView.getUint8(i * sourcePointSize + 14, true);
		var returnNumber = returnNumberAndNumberOfReturns & 0b0111;
		var numberOfReturn = (returnNumberAndNumberOfReturns & 0b00111000) >> 3;
		returnNumbers[i] = returnNumber;
		numberOfReturns[i] = numberOfReturn;

		//CLASSIFICATION
		var classification = sourceView.getUint8(i * sourcePointSize + 15, true);
		classifications[i] = classification;

		//POINT SOURCE ID
		var pointSourceID = sourceView.getUint16(i * sourcePointSize + 18, true);
		pointSourceIDs[i] = pointSourceID;

		//COLOR, if available
		if (pointFormatID === 2) {			
			var r = sourceView.getUint16(i * sourcePointSize + 20, true) / 256;
			var g = sourceView.getUint16(i * sourcePointSize + 22, true) / 256;
			var b = sourceView.getUint16(i * sourcePointSize + 24, true) / 256;

			colors[4 * i + 0] = r;
			colors[4 * i + 1] = g;
			colors[4 * i + 2] = b;
			colors[4 * i + 3] = 255;
		}
	}

	var indices = new ArrayBuffer(numPoints * 4);
	var iIndices = new Uint32Array(indices);
	for (var i = 0; i < numPoints; i++)
	{
		iIndices[i] = i;
	}

	var message =
	{
		mean: mean,
		position: pBuff,
		color: cBuff,
		intensity: iBuff,
		classification: clBuff,
		returnNumber: rnBuff,
		numberOfReturns: nrBuff,
		pointSourceID: psBuff,
		tightBoundingBox: tightBoundingBox,
		indices: indices
	};

	var transferables =
	[
		message.position,
		message.color,
		message.intensity,
		message.classification,
		message.returnNumber,
		message.numberOfReturns,
		message.pointSourceID,
		message.indices
	];

	postMessage(message, transferables);
};

onmessage = readUsingDataView;
//onmessage = readUsingTempArrays;
