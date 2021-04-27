/**
 * A single point attribute such as color/normal/.. and its data format/number of elements/...
 */
export function PointAttribute(name: any, type: any, numElements: any): void;
export class PointAttribute {
    /**
     * A single point attribute such as color/normal/.. and its data format/number of elements/...
     */
    constructor(name: any, type: any, numElements: any);
    name: any;
    type: any;
    numElements: any;
    byteSize: number;
}
export namespace PointAttribute {
    export const POSITION_CARTESIAN: PointAttribute;
    export const RGBA_PACKED: PointAttribute;
    import COLOR_PACKED = RGBA_PACKED;
    export { COLOR_PACKED };
    export const RGB_PACKED: PointAttribute;
    export const NORMAL_FLOATS: PointAttribute;
    export const FILLER_1B: PointAttribute;
    export const INTENSITY: PointAttribute;
    export const CLASSIFICATION: PointAttribute;
    export const NORMAL_SPHEREMAPPED: PointAttribute;
    export const NORMAL_OCT16: PointAttribute;
    export const NORMAL: PointAttribute;
    export const RETURN_NUMBER: PointAttribute;
    export const NUMBER_OF_RETURNS: PointAttribute;
    export const SOURCE_ID: PointAttribute;
    export const INDICES: PointAttribute;
    export const SPACING: PointAttribute;
}
/**
 * Ordered list of PointAttributes used to identify how points are aligned in a buffer.
 */
export function PointAttributes(pointAttributes: any): void;
export class PointAttributes {
    /**
     * Ordered list of PointAttributes used to identify how points are aligned in a buffer.
     */
    constructor(pointAttributes: any);
    attributes: any[];
    byteSize: number;
    size: number;
    add(pointAttribute: any): void;
    hasColors(): boolean;
    hasNormals(): boolean;
}
export namespace PointAttributeNames {
    const POSITION_CARTESIAN_1: number;
    export { POSITION_CARTESIAN_1 as POSITION_CARTESIAN };
    const COLOR_PACKED_1: number;
    export { COLOR_PACKED_1 as COLOR_PACKED };
    export const COLOR_FLOATS_1: number;
    export const COLOR_FLOATS_255: number;
    const NORMAL_FLOATS_1: number;
    export { NORMAL_FLOATS_1 as NORMAL_FLOATS };
    export const FILLER: number;
    const INTENSITY_1: number;
    export { INTENSITY_1 as INTENSITY };
    const CLASSIFICATION_1: number;
    export { CLASSIFICATION_1 as CLASSIFICATION };
    const NORMAL_SPHEREMAPPED_1: number;
    export { NORMAL_SPHEREMAPPED_1 as NORMAL_SPHEREMAPPED };
    const NORMAL_OCT16_1: number;
    export { NORMAL_OCT16_1 as NORMAL_OCT16 };
    const NORMAL_1: number;
    export { NORMAL_1 as NORMAL };
    const RETURN_NUMBER_1: number;
    export { RETURN_NUMBER_1 as RETURN_NUMBER };
    const NUMBER_OF_RETURNS_1: number;
    export { NUMBER_OF_RETURNS_1 as NUMBER_OF_RETURNS };
    const SOURCE_ID_1: number;
    export { SOURCE_ID_1 as SOURCE_ID };
    const INDICES_1: number;
    export { INDICES_1 as INDICES };
    const SPACING_1: number;
    export { SPACING_1 as SPACING };
}
export namespace PointAttributeTypes {
    namespace DATA_TYPE_DOUBLE {
        const ordinal: number;
        const size: number;
    }
    namespace DATA_TYPE_FLOAT {
        const ordinal_1: number;
        export { ordinal_1 as ordinal };
        const size_1: number;
        export { size_1 as size };
    }
    namespace DATA_TYPE_INT8 {
        const ordinal_2: number;
        export { ordinal_2 as ordinal };
        const size_2: number;
        export { size_2 as size };
    }
    namespace DATA_TYPE_UINT8 {
        const ordinal_3: number;
        export { ordinal_3 as ordinal };
        const size_3: number;
        export { size_3 as size };
    }
    namespace DATA_TYPE_INT16 {
        const ordinal_4: number;
        export { ordinal_4 as ordinal };
        const size_4: number;
        export { size_4 as size };
    }
    namespace DATA_TYPE_UINT16 {
        const ordinal_5: number;
        export { ordinal_5 as ordinal };
        const size_5: number;
        export { size_5 as size };
    }
    namespace DATA_TYPE_INT32 {
        const ordinal_6: number;
        export { ordinal_6 as ordinal };
        const size_6: number;
        export { size_6 as size };
    }
    namespace DATA_TYPE_UINT32 {
        const ordinal_7: number;
        export { ordinal_7 as ordinal };
        const size_7: number;
        export { size_7 as size };
    }
    namespace DATA_TYPE_INT64 {
        const ordinal_8: number;
        export { ordinal_8 as ordinal };
        const size_8: number;
        export { size_8 as size };
    }
    namespace DATA_TYPE_UINT64 {
        const ordinal_9: number;
        export { ordinal_9 as ordinal };
        const size_9: number;
        export { size_9 as size };
    }
}
