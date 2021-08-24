import * as THREE from 'three';

export class HelperUtils {
    /**
     * Craete a new data texture with a solid color.
     */
    static generateDataTexture(width: any, height: any, color: any): any;
    /**
     * Compute a transformed bouding box from an original box and a transform matrix.
     */
    static computeTransformedBoundingBox(box: any, transform: any): any;
    /**
     * Returns an array of objects describing all of the points contained within
     * the specified node, including their world position and all available attributes
     */
    static nodeToPoints(node: any): any[];
    /**
     * Returns an object describing the point within the node at the specified index,
     * including its world position and all available attributes
     */
    static nodeToPoint(node: any, pointIndex: number = 0): any;
    /**
     * Returns an object describing the nearers point to the selected Intersection,
     * including it's world position and all available attributes
     */
    static intersectionToPoint(intersection: THREE.Intersection): any;
}
