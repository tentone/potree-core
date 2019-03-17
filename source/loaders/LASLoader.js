"use strict";

import {WorkerManager} from "../utils/WorkerManager.js";
import {Global} from "../Global.js";

var pointFormatReaders =
[
	function(dv)
	{
		return {
			"position": [ dv.getInt32(0, true), dv.getInt32(4, true), dv.getInt32(8, true)],
			"intensity": dv.getUint16(12, true),
			"classification": dv.getUint8(16, true)
		};
	},
	function(dv)
	{
		return {
			"position": [ dv.getInt32(0, true), dv.getInt32(4, true), dv.getInt32(8, true)],
			"intensity": dv.getUint16(12, true),
			"classification": dv.getUint8(16, true)
		};
	},
	function(dv)
	{
		return {
			"position": [ dv.getInt32(0, true), dv.getInt32(4, true), dv.getInt32(8, true)],
			"intensity": dv.getUint16(12, true),
			"classification": dv.getUint8(16, true),
			"color": [dv.getUint16(20, true), dv.getUint16(22, true), dv.getUint16(24, true)]
		};
	},
	function(dv)
	{
		return {
			"position": [ dv.getInt32(0, true), dv.getInt32(4, true), dv.getInt32(8, true)],
			"intensity": dv.getUint16(12, true),
			"classification": dv.getUint8(16, true),
			"color": [dv.getUint16(28, true), dv.getUint16(30, true), dv.getUint16(32, true)]
		};
	}
];

function readAs(buf, Type, offset, count)
{
	count = (count === undefined || count === 0 ? 1 : count);
	var sub = buf.slice(offset, offset + Type.BYTES_PER_ELEMENT * count);

	var r = new Type(sub);
	if(count === undefined || count === 1)
	{
		return r[0];
	}

	var ret = [];
	for(var i = 0 ; i < count ; i ++)
	{
		ret.push(r[i]);
	}

	return ret;
}

function parseLASHeader(arraybuffer)
{
	var data = {};

	data.pointsOffset = readAs(arraybuffer, Uint32Array, 32*3);
	data.pointsFormatId = readAs(arraybuffer, Uint8Array, 32*3+8);
	data.pointsStructSize = readAs(arraybuffer, Uint16Array, 32*3+8+1);
	data.pointsCount = readAs(arraybuffer, Uint32Array, 32*3 + 11);

	var start = 32*3 + 35;
	data.scale = readAs(arraybuffer, Float64Array, start, 3); start += 24; // 8*3
	data.offset = readAs(arraybuffer, Float64Array, start, 3); start += 24;

	var bounds = readAs(arraybuffer, Float64Array, start, 6); start += 48; // 8*6;
	data.maxs = [bounds[0], bounds[2], bounds[4]];
	data.mins = [bounds[1], bounds[3], bounds[5]];

	return data;
}

// LAS Loader
// Loads uncompressed files
//
function LASLoader(arraybuffer)
{
	this.arraybuffer = arraybuffer;
};

LASLoader.prototype.open = function()
{
	// nothing needs to be done to open this file
	//
	this.readOffset = 0;
	return new Promise(function(res, rej)
	{
		setTimeout(res, 0);
	});
};

LASLoader.prototype.getHeader = function()
{
	var self = this;

	return new Promise(function(res, rej)
	{
		setTimeout(function()
		{
			self.header = parseLASHeader(self.arraybuffer);
			res(self.header);
		}, 0);
	});
};

LASLoader.prototype.readData = function(count, offset, skip)
{
	var self = this;

	return new Promise(function(res, rej)
	{
		setTimeout(function()
		{
			if(!self.header)
				return rej(new Error("Cannot start reading data till a header request is issued"));

			var start;
			if(skip <= 1)
			{
				count = Math.min(count, self.header.pointsCount - self.readOffset);
				start = self.header.pointsOffset + self.readOffset * self.header.pointsStructSize;
				var end = start + count * self.header.pointsStructSize;
				res(
				{
					buffer: self.arraybuffer.slice(start, end),
					count: count,
					hasMoreData: self.readOffset + count < self.header.pointsCount
				});
				self.readOffset += count;
			}
			else
			{
				var pointsToRead = Math.min(count * skip, self.header.pointsCount - self.readOffset);
				var bufferSize = Math.ceil(pointsToRead / skip);
				var pointsRead = 0;

				var buf = new Uint8Array(bufferSize * self.header.pointsStructSize);

				for(var i = 0 ; i < pointsToRead ; i++)
				{
					if(i % skip === 0)
					{
						start = self.header.pointsOffset + self.readOffset * self.header.pointsStructSize;
						var src = new Uint8Array(self.arraybuffer, start, self.header.pointsStructSize);

						buf.set(src, pointsRead * self.header.pointsStructSize);
						pointsRead ++;
					}

					self.readOffset ++;
				}

				res(
				{
					buffer: buf.buffer,
					count: pointsRead,
					hasMoreData: self.readOffset < self.header.pointsCount
				});
			}
		}, 0);
	});
};

LASLoader.prototype.close = function()
{
	var self = this;
	return new Promise(function(res, rej)
	{
		self.arraybuffer = null;
		setTimeout(res, 0);
	});
};

// LAZ Loader
// Uses NaCL module to load LAZ files
//
function LAZLoader(arraybuffer)
{
	var self = this;

	this.arraybuffer = arraybuffer;
	this.nextCB = null;

	this.dorr = function(req, cb)
	{
		self.nextCB = cb;
		
		Global.workerPool.runTask(WorkerManager.LAS_LAZ, function(e)
		{
			if(self.nextCB !== null)
			{
				self.nextCB(e.data);
				self.nextCB = null;
			}
		}, req);
	};
};

LAZLoader.prototype.open = function()
{
	// nothing needs to be done to open this file
	var self = this;
	return new Promise(function(res, rej)
	{
		self.dorr({type:"open", arraybuffer: self.arraybuffer}, function(r)
		{
			if(r.status !== 1)
			{
				return rej(new Error("Failed to open file"));
			}

			res(true);
		});
	});
};

LAZLoader.prototype.getHeader = function()
{
	var self = this;

	return new Promise(function(res, rej)
	{
		self.dorr({type:'header'}, function(r)
		{
			if(r.status !== 1)
			{
				return rej(new Error("Failed to get header"));
			}

			res(r.header);
		});
	});
};

LAZLoader.prototype.readData = function(count, offset, skip)
{
	var self = this;

	return new Promise(function(res, rej)
	{
		self.dorr({type:'read', count: count, offset: offset, skip: skip}, function(r)
		{
			if(r.status !== 1)
				return rej(new Error("Failed to read data"));
			res({
				buffer: r.buffer,
				count: r.count,
				hasMoreData: r.hasMoreData
			});
		});
	});
};

LAZLoader.prototype.close = function()
{
	var self = this;

	return new Promise(function(res, rej)
	{
		self.dorr({type:'close'}, function(r)
		{
			if(r.status !== 1)
			{
				return rej(new Error("Failed to close file"));
			}

			res(true);
		});
	});
};

// A single consistent interface for loading LAS/LAZ files
function LASFile(arraybuffer)
{
	this.arraybuffer = arraybuffer;

	this.determineVersion();
	if(this.version > 12)
	{
		throw new Error("Only file versions <= 1.2 are supported at this time");
	}

	this.determineFormat();
	if(pointFormatReaders[this.formatId] === undefined)
	{
		throw new Error("The point format ID is not supported");
	}

	this.loader = this.isCompressed ? new LAZLoader(this.arraybuffer) : new LASLoader(this.arraybuffer);
};

LASFile.prototype.determineFormat = function()
{
	var formatId = readAs(this.arraybuffer, Uint8Array, 32*3+8);
	var bit_7 = (formatId & 0x80) >> 7;
	var bit_6 = (formatId & 0x40) >> 6;

	if(bit_7 === 1 && bit_6 === 1)
	{
		throw new Error("Old style compression not supported");
	}

	this.formatId = formatId & 0x3f;
	this.isCompressed = (bit_7 === 1 || bit_6 === 1);
};

LASFile.prototype.determineVersion = function()
{
	var ver = new Int8Array(this.arraybuffer, 24, 2);
	this.version = ver[0] * 10 + ver[1];
	this.versionAsString = ver[0] + "." + ver[1];
};

LASFile.prototype.open = function()
{
	return this.loader.open();
};

LASFile.prototype.getHeader = function()
{
	return this.loader.getHeader();
};

LASFile.prototype.readData = function(count, start, skip)
{
	return this.loader.readData(count, start, skip);
};

LASFile.prototype.close = function()
{
	return this.loader.close();
};

// Decodes LAS records into points
function LASDecoder(buffer, pointFormatID, pointSize, pointsCount, scale, offset, mins, maxs)
{
	this.arrayb = buffer;
	this.decoder = pointFormatReaders[pointFormatID];
	this.pointsCount = pointsCount;
	this.pointSize = pointSize;
	this.scale = scale;
	this.offset = offset;
	this.mins = mins;
	this.maxs = maxs;
};

LASDecoder.prototype.getPoint = function(index)
{
	if(index < 0 || index >= this.pointsCount)
	{
		throw new Error("Point index out of range");
	}

	return this.decoder(new DataView(this.arrayb, index * this.pointSize, this.pointSize));
};

export {LASLoader, LAZLoader, LASFile, LASDecoder};