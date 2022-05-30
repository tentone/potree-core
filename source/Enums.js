import {Vector4} from 'three';

export const AttributeLocations =
	{
		position: 0,
		color: 1,
		intensity: 2,
		classification: 3,
		returnNumber: 4,
		numberOfReturns: 5,
		pointSourceID: 6,
		indices: 7,
		normal: 8,
		spacing: 9
	};

export const Classification =
	{
		DEFAULT:
			{
				0: new Vector4(0.5, 0.5, 0.5, 1.0),
				1: new Vector4(0.5, 0.5, 0.5, 1.0),
				2: new Vector4(0.63, 0.32, 0.18, 1.0),
				3: new Vector4(0.0, 1.0, 0.0, 1.0),
				4: new Vector4(0.0, 0.8, 0.0, 1.0),
				5: new Vector4(0.0, 0.6, 0.0, 1.0),
				6: new Vector4(1.0, 0.66, 0.0, 1.0),
				7: new Vector4(1.0, 0, 1.0, 1.0),
				8: new Vector4(1.0, 0, 0.0, 1.0),
				9: new Vector4(0.0, 0.0, 1.0, 1.0),
				12: new Vector4(1.0, 1.0, 0.0, 1.0),
				DEFAULT: new Vector4(0.3, 0.6, 0.6, 0.5)
			}
	};

export const PointSizeType =
	{
		FIXED: 0,
		ATTENUATED: 1,
		ADAPTIVE: 2
	};

export const PointShape =
	{
		SQUARE: 0,
		CIRCLE: 1,
		PARABOLOID: 2
	};

export const PointColorType =
	{
		RGB: 0,
		COLOR: 1,
		DEPTH: 2,
		HEIGHT: 3,
		ELEVATION: 3,
		INTENSITY: 4,
		INTENSITY_GRADIENT: 5,
		LOD: 6,
		LEVEL_OF_DETAIL: 6,
		POINT_INDEX: 7,
		CLASSIFICATION: 8,
		RETURN_NUMBER: 9,
		SOURCE: 10,
		NORMAL: 11,
		PHONG: 12,
		RGB_HEIGHT: 13,
		COMPOSITE: 50
	};

export const TreeType =
	{
		OCTREE: 0,
		KDTREE: 1
	};


