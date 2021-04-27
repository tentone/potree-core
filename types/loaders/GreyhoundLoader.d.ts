export function GreyhoundLoader(): void;
export namespace GreyhoundLoader {
    function loadInfoJSON(url: any, callback: any): void;
    function load(url: any, callback: any): void;
    function loadPointAttributes(mno: any): PointAttributes;
    function createChildAABB(aabb: any, childIndex: any): any;
}
import { PointAttributes } from "../PointAttributes.js";
