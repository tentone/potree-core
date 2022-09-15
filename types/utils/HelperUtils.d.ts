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
     * Converts an array of pixels into an image
     */
    static pixelsArrayToImage(pixels: Uint8Array, width: number, height: number): HTMLImageElement;
}