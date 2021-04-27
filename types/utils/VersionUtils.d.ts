export function VersionUtils(version: any): void;
export class VersionUtils {
    constructor(version: any);
    version: any;
    versionMajor: number;
    versionMinor: number;
    newerThan(version: any): boolean;
    equalOrHigher(version: any): boolean;
    upTo(version: any): boolean;
}
