import {Box3, Matrix4, Vector3} from 'three';

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
