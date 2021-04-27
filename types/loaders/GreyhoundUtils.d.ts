/**
 * @class Loads greyhound metadata and returns a PointcloudOctree
 *
 * @author Maarten van Meersbergen
 * @author Oscar Martinez Rubi
 * @author Connor Manning
 */
export class GreyhoundUtils {
    static getQueryParam(name: any): string;
    static createSchema(attributes: any): {
        name: string;
        size: number;
        type: string;
    }[];
    static fetch(url: any, cb: any): void;
    static fetchBinary(url: any, cb: any): void;
    static pointSizeFrom(schema: any): any;
    static getNormalization(serverURL: any, baseDepth: any, cb: any): void;
}
