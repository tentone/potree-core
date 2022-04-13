
const PointAttributeNames =
{
	POSITION_CARTESIAN: 0, // float x, y, z,
	COLOR_PACKED: 1, // byte r, g, b, a, I: [0,1]
	COLOR_FLOATS_1: 2, // float r, g, b, I: [0,1]
	COLOR_FLOATS_255: 3, // float r, g, b, I: [0,255]
	NORMAL_FLOATS: 4, // float x, y, z,
	FILLER: 5,
	INTENSITY: 6,
	CLASSIFICATION: 7,
	NORMAL_SPHEREMAPPED: 8,
	NORMAL_OCT16: 9,
	NORMAL: 10,
	RETURN_NUMBER: 11,
	NUMBER_OF_RETURNS: 12,
	SOURCE_ID: 13,
	INDICES: 14,
	SPACING: 15
};

/**
 * Some types of possible point attribute data formats
 *
 * @class
 */
const PointAttributeTypes = {
	DATA_TYPE_DOUBLE: {ordinal: 0, name: 'double', size: 8},
	DATA_TYPE_FLOAT: {ordinal: 1, name: 'float', size: 4},
	DATA_TYPE_INT8: {ordinal: 2, name: 'int8', size: 1},
	DATA_TYPE_UINT8: {ordinal: 3, name: 'uint8', size: 1},
	DATA_TYPE_INT16: {ordinal: 4, name: 'int16', size: 2},
	DATA_TYPE_UINT16: {ordinal: 5, name: 'uint16', size: 2},
	DATA_TYPE_INT32: {ordinal: 6, name: 'int32', size: 4},
	DATA_TYPE_UINT32: {ordinal: 7, name: 'uint32', size: 4},
	DATA_TYPE_INT64: {ordinal: 8, name: 'int64', size: 8},
	DATA_TYPE_UINT64: {ordinal: 9, name: 'uint64', size: 8}
};

let i = 0;
for (const obj in PointAttributeTypes) 
{
	PointAttributeTypes[i] = PointAttributeTypes[obj];
	i++;
}

/**
 * A single point attribute such as color/normal/.. and its data format/number of elements/...
 */
class PointAttribute
{

	constructor(name, type, numElements)
	{
		this.name = name;
		this.type = type;
		this.numElements = numElements;
		this.byteSize = this.numElements * this.type.size;
		this.description = '';
		this.range = [Infinity, -Infinity];
	}
}

PointAttribute.POSITION_CARTESIAN = new PointAttribute(PointAttributeNames.POSITION_CARTESIAN, PointAttributeTypes.DATA_TYPE_FLOAT, 3);
PointAttribute.RGBA_PACKED = new PointAttribute(PointAttributeNames.COLOR_PACKED, PointAttributeTypes.DATA_TYPE_INT8, 4);
PointAttribute.COLOR_PACKED = PointAttribute.RGBA_PACKED;
PointAttribute.RGB_PACKED = new PointAttribute(PointAttributeNames.COLOR_PACKED, PointAttributeTypes.DATA_TYPE_INT8, 3);
PointAttribute.NORMAL_FLOATS = new PointAttribute(PointAttributeNames.NORMAL_FLOATS, PointAttributeTypes.DATA_TYPE_FLOAT, 3);
PointAttribute.FILLER_1B = new PointAttribute(PointAttributeNames.FILLER, PointAttributeTypes.DATA_TYPE_UINT8, 1);
PointAttribute.INTENSITY = new PointAttribute(PointAttributeNames.INTENSITY, PointAttributeTypes.DATA_TYPE_UINT16, 1);
PointAttribute.CLASSIFICATION = new PointAttribute(PointAttributeNames.CLASSIFICATION, PointAttributeTypes.DATA_TYPE_UINT8, 1);
PointAttribute.NORMAL_SPHEREMAPPED = new PointAttribute(PointAttributeNames.NORMAL_SPHEREMAPPED, PointAttributeTypes.DATA_TYPE_UINT8, 2);
PointAttribute.NORMAL_OCT16 = new PointAttribute(PointAttributeNames.NORMAL_OCT16, PointAttributeTypes.DATA_TYPE_UINT8, 2);
PointAttribute.NORMAL = new PointAttribute(PointAttributeNames.NORMAL, PointAttributeTypes.DATA_TYPE_FLOAT, 3);
PointAttribute.RETURN_NUMBER = new PointAttribute(PointAttributeNames.RETURN_NUMBER, PointAttributeTypes.DATA_TYPE_UINT8, 1);
PointAttribute.NUMBER_OF_RETURNS = new PointAttribute(PointAttributeNames.NUMBER_OF_RETURNS, PointAttributeTypes.DATA_TYPE_UINT8, 1);
PointAttribute.SOURCE_ID = new PointAttribute(PointAttributeNames.SOURCE_ID, PointAttributeTypes.DATA_TYPE_UINT8, 1);
PointAttribute.INDICES = new PointAttribute(PointAttributeNames.INDICES, PointAttributeTypes.DATA_TYPE_UINT32, 1);
PointAttribute.SPACING = new PointAttribute(PointAttributeNames.SPACING, PointAttributeTypes.DATA_TYPE_FLOAT, 1);

/**
 * Ordered list of PointAttributes used to identify how points are aligned in a buffer.
 */
class PointAttributes
{

	constructor(pointAttributes)
	{
		this.attributes = [];
		this.byteSize = 0;
		this.size = 0;
		this.vectors = [];

		if (pointAttributes !== null)
		{
			for (let i = 0; i < pointAttributes.length; i++) 
			{
				const pointAttributeName = pointAttributes[i];
				const pointAttribute = PointAttribute[pointAttributeName];
				this.attributes.push(pointAttribute);
				this.byteSize += pointAttribute.byteSize;
				this.size++;
			}
		}
	}


	add(pointAttribute)
	{
		this.attributes.push(pointAttribute);
		this.byteSize += pointAttribute.byteSize;
		this.size++;
	};

	addVector(vector)
	{
		this.vectors.push(vector);
	}

	hasNormals()
	{
		for (const name in this.attributes) 
		{
			const pointAttribute = this.attributes[name];
			if (
				pointAttribute === PointAttribute.NORMAL_SPHEREMAPPED ||
				pointAttribute === PointAttribute.NORMAL_FLOATS ||
				pointAttribute === PointAttribute.NORMAL ||
				pointAttribute === PointAttribute.NORMAL_OCT16) 
			{
				return true;
			}
		}

		return false;
	};
}

export {PointAttribute, PointAttributes, PointAttributeNames, PointAttributeTypes};
