function CustomView(buffer) 
{
	this.buffer = buffer;
	this.u8 = new Uint8Array(buffer);

	const tmp = new ArrayBuffer(4);
	const tmpf = new Float32Array(tmp);
	const tmpu8 = new Uint8Array(tmp);

	this.getUint32 = function(i) 
	{
		return this.u8[i + 3] << 24 | this.u8[i + 2] << 16 | this.u8[i + 1] << 8 | this.u8[i];
	};

	this.getUint16 = function(i) 
	{
		return this.u8[i + 1] << 8 | this.u8[i];
	};

	this.getFloat = function(i) 
	{
		tmpu8[0] = this.u8[i + 0];
		tmpu8[1] = this.u8[i + 1];
		tmpu8[2] = this.u8[i + 2];
		tmpu8[3] = this.u8[i + 3];

		return tmpf[0];
	};

	this.getUint8 = function(i) 
	{
		return this.u8[i];
	};
}

const decompress = function(schema, input, numPoints) 
{
	const x = new Module.DynamicLASZip();

	const abInt = new Uint8Array(input);
	const buf = Module._malloc(input.byteLength);

	Module.HEAPU8.set(abInt, buf);
	x.open(buf, input.byteLength);

	let pointSize = 0;

	schema.forEach(function(f) 
	{
		pointSize += f.size;
		if (f.type === 'floating') {x.addFieldFloating(f.size);}
		else if (f.type === 'unsigned') {x.addFieldUnsigned(f.size);}
		else if (f.type === 'signed') {x.addFieldSigned(f.size);}
		else 
		{
			if (PRODUCTION) 
			{
				throw new Error();
			}
			else 
			{
				throw new Error('Unrecognized field desc:', f);
			}
		}
	});

	const out = Module._malloc(numPoints * pointSize);

	for (let i = 0; i < numPoints; i++) 
	{
		x.getPoint(out + i * pointSize);
	}

	const ret = new Uint8Array(numPoints * pointSize);
	ret.set(Module.HEAPU8.subarray(out, out + numPoints * pointSize));

	Module._free(out);
	Module._free(buf);

	return ret.buffer;
};


onmessage = function(event) 
{
	const NUM_POINTS_BYTES = 4;

	let buffer = event.data.buffer;
	const numPoints = new DataView(
		buffer,
		buffer.byteLength - NUM_POINTS_BYTES,
		NUM_POINTS_BYTES
	).getUint32(0, true);
	buffer = buffer.slice(0, buffer.byteLength - NUM_POINTS_BYTES);
	buffer = decompress(event.data.schema, buffer, numPoints);

	const pointAttributes = event.data.pointAttributes;
	const cv = new CustomView(buffer);
	const version = new Potree.Version(event.data.version);
	const nodeOffset = event.data.offset;
	const scale = event.data.scale;

	const tightBoxMin = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
	const tightBoxMax = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
	const mean = [0, 0, 0];

	const attributeBuffers = {};
	let inOffset = 0;
	for (const pointAttribute of pointAttributes.attributes) 
	{
		if (pointAttribute.name === Potree.PointAttribute.POSITION_CARTESIAN.name) 
		{
			const buff = new ArrayBuffer(numPoints * 4 * 3);
			const positions = new Float32Array(buff);

			for (let j = 0; j < numPoints; j++) 
			{
				const ux = cv.getUint32(inOffset + j * pointAttributes.byteSize + 0);
				const uy = cv.getUint32(inOffset + j * pointAttributes.byteSize + 4);
				const uz = cv.getUint32(inOffset + j * pointAttributes.byteSize + 8);

				const x = scale * ux + nodeOffset[0];
				const y = scale * uy + nodeOffset[1];
				const z = scale * uz + nodeOffset[2];

				positions[3 * j + 0] = x;
				positions[3 * j + 1] = y;
				positions[3 * j + 2] = z;

				mean[0] += x / numPoints;
				mean[1] += y / numPoints;
				mean[2] += z / numPoints;

				tightBoxMin[0] = Math.min(tightBoxMin[0], x);
				tightBoxMin[1] = Math.min(tightBoxMin[1], y);
				tightBoxMin[2] = Math.min(tightBoxMin[2], z);

				tightBoxMax[0] = Math.max(tightBoxMax[0], x);
				tightBoxMax[1] = Math.max(tightBoxMax[1], y);
				tightBoxMax[2] = Math.max(tightBoxMax[2], z);
			}

			attributeBuffers[pointAttribute.name] = {buffer: buff, attribute: pointAttribute};
		}
		else if (pointAttribute.name === Potree.PointAttribute.COLOR_PACKED.name) 
		{
			const buff = new ArrayBuffer(numPoints * 4);
			const colors = new Uint8Array(buff);
			const div = event.data.normalize.color ? 256 : 1;

			for (let j = 0; j < numPoints; j++) 
			{
				const r = cv.getUint16(inOffset + j * pointAttributes.byteSize + 0) / div;
				const g = cv.getUint16(inOffset + j * pointAttributes.byteSize + 2) / div;
				const b = cv.getUint16(inOffset + j * pointAttributes.byteSize + 4) / div;

				colors[4 * j + 0] = r;
				colors[4 * j + 1] = g;
				colors[4 * j + 2] = b;
			}

			attributeBuffers[pointAttribute.name] = {buffer: buff, attribute: pointAttribute};
		}
		else if (pointAttribute.name === Potree.PointAttribute.INTENSITY.name) 
		{
			const buff = new ArrayBuffer(numPoints * 4);
			const intensities = new Float32Array(buff);

			for (let j = 0; j < numPoints; j++) 
			{
				const intensity = cv.getUint16(inOffset + j * pointAttributes.byteSize, true);
				intensities[j] = intensity;
			}

			attributeBuffers[pointAttribute.name] = {buffer: buff, attribute: pointAttribute};
		}
		else if (pointAttribute.name === Potree.PointAttribute.CLASSIFICATION.name) 
		{
			const buff = new ArrayBuffer(numPoints);
			const classifications = new Uint8Array(buff);

			for (let j = 0; j < numPoints; j++) 
			{
				const classification = cv.getUint8(inOffset + j * pointAttributes.byteSize);
				classifications[j] = classification;
			}

			attributeBuffers[pointAttribute.name] = {buffer: buff, attribute: pointAttribute};
		}

		inOffset += pointAttribute.byteSize;
	}

	{
		// add indices
		const buff = new ArrayBuffer(numPoints * 4);
		const indices = new Uint32Array(buff);

		for (let i = 0; i < numPoints; i++) 
		{
			indices[i] = i;
		}

		attributeBuffers[Potree.PointAttribute.INDICES.name] = {
			buffer: buff,
			attribute: Potree.PointAttribute.INDICES
		};
	}

	const message = {
		numPoints: numPoints,
		mean: mean,
		attributeBuffers: attributeBuffers,
		tightBoundingBox: {min: tightBoxMin, max: tightBoxMax}
	};

	const transferables = [];
	for (const property in message.attributeBuffers) 
	{
		transferables.push(message.attributeBuffers[property].buffer);
	}
	transferables.push(buffer);

	postMessage(message, transferables);
};
