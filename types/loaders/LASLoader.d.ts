export function LASLoader(arraybuffer: any): void;
export class LASLoader {
    constructor(arraybuffer: any);
    arraybuffer: any;
    open(): Promise<any>;
    readOffset: number;
    getHeader(): Promise<any>;
    readData(count: any, offset: any, skip: any): Promise<any>;
    close(): Promise<any>;
}
export function LAZLoader(arraybuffer: any): void;
export class LAZLoader {
    constructor(arraybuffer: any);
    arraybuffer: any;
    nextCB: any;
    dorr: (req: any, cb: any) => void;
    open(): Promise<any>;
    getHeader(): Promise<any>;
    readData(count: any, offset: any, skip: any): Promise<any>;
    close(): Promise<any>;
}
export function LASFile(arraybuffer: any): void;
export class LASFile {
    constructor(arraybuffer: any);
    arraybuffer: any;
    loader: LASLoader | LAZLoader;
    determineFormat(): void;
    formatId: number;
    isCompressed: boolean;
    determineVersion(): void;
    version: number;
    versionAsString: string;
    open(): Promise<any>;
    getHeader(): Promise<any>;
    readData(count: any, start: any, skip: any): Promise<any>;
    close(): Promise<any>;
}
export function LASDecoder(buffer: any, pointFormatID: any, pointSize: any, pointsCount: any, scale: any, offset: any, mins: any, maxs: any): void;
export class LASDecoder {
    constructor(buffer: any, pointFormatID: any, pointSize: any, pointsCount: any, scale: any, offset: any, mins: any, maxs: any);
    arrayb: any;
    decoder: (dv: any) => {
        position: any[];
        intensity: any;
        classification: any;
    };
    pointsCount: any;
    pointSize: any;
    scale: any;
    offset: any;
    mins: any;
    maxs: any;
    getPoint(index: any): {
        position: any[];
        intensity: any;
        classification: any;
    };
}
