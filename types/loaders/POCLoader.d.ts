/**
 * @class Loads mno files and returns a PointcloudOctree
 * for a description of the mno binary file format, read mnoFileFormat.txt
 *
 * @author Markus Schuetz
 */
export class POCLoader {
    /**
     * @return a point cloud octree with the root node data loaded.
     * loading of descendants happens asynchronously when they"re needed
     *
     * @param url
     * @param loadingFinishedListener executed after loading the binary has been finished
     */
    static load(url: any, callback: any): void;
    static loadPointAttributes(mno: any): PointAttributes;
    static createChildAABB(aabb: any, index: any): any;
}
import { PointAttributes } from "../PointAttributes.js";
