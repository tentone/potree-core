import {Box3, Matrix4, Vector3} from 'three';

export interface IClipSphere {
  center: Vector3;
  radius: number;
}

/**
 * Creates an IClipSphere from a center position and radius.
 *
 * @param center - The center position of the clip sphere in world space. Defaults to the origin.
 * @param radius - The radius of the clip sphere.
 * @returns An IClipSphere object ready to be passed to PointCloudMaterial.setClipSpheres().
 */
export function createClipSphere(center: Vector3 = new Vector3(0, 0, 0), radius: number): IClipSphere {
  return {
    center: center.clone(),
    radius,
  };
}

export enum ClipMode {
  DISABLED = 0,
  CLIP_OUTSIDE = 1,
  CLIP_INSIDE = 2,
  HIGHLIGHT_INSIDE = 3,
}

export interface IClipBox {
  box: Box3;
  inverse: Matrix4;
  matrix: Matrix4;
  position: Vector3;
}

/**
 * Creates an IClipBox from a given size and position.
 *
 * The base shape is a unit cube centered at the origin (-0.5 to 0.5 on each axis).
 * The transformation matrix is built by applying scale (size) followed by translation (position).
 * The inverse matrix is computed from the transformation matrix and is used by the shader for clipping.
 *
 * @param size - The dimensions of the clip box.
 * @param position - The center position of the clip box in world space. Defaults to the origin.
 * @returns An IClipBox object ready to be passed to PointCloudMaterial.setClipBoxes().
 */
export function createClipBox(size: Vector3, position: Vector3 = new Vector3(0, 0, 0)): IClipBox {
  const box = new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5));

  const scaleMatrix = new Matrix4().makeScale(size.x, size.y, size.z);
  const translationMatrix = new Matrix4().makeTranslation(position.x, position.y, position.z);
  const matrix = new Matrix4().multiplyMatrices(translationMatrix, scaleMatrix);
  const inverse = matrix.clone().invert();

  return {
    box,
    matrix,
    inverse,
    position: position.clone(),
  };
}
