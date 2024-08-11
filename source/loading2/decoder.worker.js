import {PointAttribute, PointAttributeTypes} from './PointAttributes.ts';

const typedArrayMapping = {
	'int8': Int8Array,
	'int16': Int16Array,
	'int32': Int32Array,
	'int64': Float64Array,
	'uint8': Uint8Array,
	'uint16': Uint16Array,
	'uint32': Uint32Array,
	'uint64': Float64Array,
	'float': Float32Array,
	'double': Float64Array
};

// Potree = {};

onmessage = function(event) 
{

	const {buffer, pointAttributes, scale, name, min, max, size, offset, numPoints} = event.data;

	const tStart = performance.now();

	const view = new DataView(buffer);
	
	const attributeBuffers = {};
	let attributeOffset = 0;

	let bytesPerPoint = 0;
	for (const pointAttribute of pointAttributes.attributes) 
	{
		bytesPerPoint += pointAttribute.byteSize;
	}

	const gridSize = 32;
	const grid = new Uint32Array(gridSize ** 3);
	const toIndex = (x, y, z) => 
	{
		// let dx = gridSize * (x - min.x) / size.x;
		// let dy = gridSize * (y - min.y) / size.y;
		// let dz = gridSize * (z - min.z) / size.z;

		// min is already subtracted
		const dx = gridSize * x / size.x;
		const dy = gridSize * y / size.y;
		const dz = gridSize * z / size.z;

		const ix = Math.min(parseInt(dx), gridSize - 1);
		const iy = Math.min(parseInt(dy), gridSize - 1);
		const iz = Math.min(parseInt(dz), gridSize - 1);

		const index = ix + iy * gridSize + iz * gridSize * gridSize;

		return index;
	};

	let numOccupiedCells = 0;
	for (const pointAttribute of pointAttributes.attributes) 
	{
		
		if (['POSITION_CARTESIAN', 'position'].includes(pointAttribute.name))
		{
			const buff = new ArrayBuffer(numPoints * 4 * 3);
			const positions = new Float32Array(buff);
		
			for (let j = 0; j < numPoints; j++) 
			{
				
				const pointOffset = j * bytesPerPoint;

				const x = view.getInt32(pointOffset + attributeOffset + 0, true) * scale[0] + offset[0] - min.x;
				const y = view.getInt32(pointOffset + attributeOffset + 4, true) * scale[1] + offset[1] - min.y;
				const z = view.getInt32(pointOffset + attributeOffset + 8, true) * scale[2] + offset[2] - min.z;

				const index = toIndex(x, y, z);
				const count = grid[index]++;
				if (count === 0)
				{
					numOccupiedCells++;
				}

				positions[3 * j + 0] = x;
				positions[3 * j + 1] = y;
				positions[3 * j + 2] = z;
			}

			attributeBuffers[pointAttribute.name] = {buffer: buff, attribute: pointAttribute};
		}
		else if (['RGBA', 'rgba'].includes(pointAttribute.name))
		{
			const buff = new ArrayBuffer(numPoints * 4);
			const colors = new Uint8Array(buff);

			for (let j = 0; j < numPoints; j++) 
			{
				const pointOffset = j * bytesPerPoint;

				const r = view.getUint16(pointOffset + attributeOffset + 0, true);
				const g = view.getUint16(pointOffset + attributeOffset + 2, true);
				const b = view.getUint16(pointOffset + attributeOffset + 4, true);

				colors[4 * j + 0] = r > 255 ? r / 256 : r;
				colors[4 * j + 1] = g > 255 ? g / 256 : g;
				colors[4 * j + 2] = b > 255 ? b / 256 : b;
			}

			attributeBuffers[pointAttribute.name] = {buffer: buff, attribute: pointAttribute};
		}
		else 
		{
			const buff = new ArrayBuffer(numPoints * 4);
			const f32 = new Float32Array(buff);

			const TypedArray = typedArrayMapping[pointAttribute.type.name];
			const preciseBuffer = new TypedArray(numPoints);

			let [offset, scale] = [0, 1];

			const getterMap = {
				'int8': view.getInt8,
				'int16': view.getInt16,
				'int32': view.getInt32,
				// 'int64':  view.getInt64,
				'uint8': view.getUint8,
				'uint16': view.getUint16,
				'uint32': view.getUint32,
				// 'uint64': view.getUint64,
				'float': view.getFloat32,
				'double': view.getFloat64
			};
			const getter = getterMap[pointAttribute.type.name].bind(view);

			// compute offset and scale to pack larger types into 32 bit floats
			if (pointAttribute.type.size > 4)
			{
				const [amin, amax] = pointAttribute.range;
				offset = amin;
				scale = 1 / (amax - amin);
			}

			for (let j = 0; j < numPoints; j++)
			{
				const pointOffset = j * bytesPerPoint;
				const value = getter(pointOffset + attributeOffset, true);

				f32[j] = (value - offset) * scale;
				preciseBuffer[j] = value;
			}

			attributeBuffers[pointAttribute.name] = { 
				buffer: buff,
				preciseBuffer: preciseBuffer,
				attribute: pointAttribute,
				offset: offset,
				scale: scale
			};
		}

		attributeOffset += pointAttribute.byteSize;


	}

	const occupancy = parseInt(numPoints / numOccupiedCells);
	// console.log(`${name}: #points: ${numPoints}: #occupiedCells: ${numOccupiedCells}, occupancy: ${occupancy} points/cell`);

	{ // add indices
		const buff = new ArrayBuffer(numPoints * 4);
		const indices = new Uint32Array(buff);

		for (let i = 0; i < numPoints; i++) 
		{
			indices[i] = i;
		}
		
		attributeBuffers['INDICES'] = {buffer: buff, attribute: PointAttribute.INDICES};
	}


	{ // handle attribute vectors
		const vectors = pointAttributes.vectors;

		for (const vector of vectors)
		{

			const {name, attributes} = vector;
			const numVectorElements = attributes.length;
			const buffer = new ArrayBuffer(numVectorElements * numPoints * 4);
			const f32 = new Float32Array(buffer);

			let iElement = 0;
			for (const sourceName of attributes)
			{
				const sourceBuffer = attributeBuffers[sourceName];
				const {offset, scale} = sourceBuffer;
				const view = new DataView(sourceBuffer.buffer);

				const getter = view.getFloat32.bind(view);

				for (let j = 0; j < numPoints; j++)
				{
					const value = getter(j * 4, true);

					f32[j * numVectorElements + iElement] = value / scale + offset;
				}

				iElement++;
			}

			const vecAttribute = new PointAttribute(name, PointAttributeTypes.DATA_TYPE_FLOAT, 3);

			attributeBuffers[name] = { 
				buffer: buffer, 
				attribute: vecAttribute
			};

		}

	}

	// let duration = performance.now() - tStart;
	// let pointsPerMs = numPoints / duration;
	// console.log(`duration: ${duration.toFixed(1)}ms, #points: ${numPoints}, points/ms: ${pointsPerMs.toFixed(1)}`);

	const message = {
		buffer: buffer,
		attributeBuffers: attributeBuffers,
		density: occupancy
	};

	const transferables = [];
	for (const property in message.attributeBuffers) 
	{
		transferables.push(message.attributeBuffers[property].buffer);
	}
	transferables.push(buffer);
	// console.log('new', message)

	postMessage(message, transferables);
};
