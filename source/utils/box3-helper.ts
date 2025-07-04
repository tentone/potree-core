import {
	Box3,
	BufferAttribute,
	BufferGeometry,
	Color,
	LineBasicMaterial,
	LineSegments
} from 'three';

/**
 * Helper class to visualize a Box3 bounding box in 3D space.
 * 
 * Code adapted from three.js BoxHelper.js
 */
export class Box3Helper extends LineSegments 
{
	constructor(box: Box3, color: Color = new Color(0xffff00)) 
	{
		// prettier-ignore
		const indices = new Uint16Array([0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7]);
		// prettier-ignore
		const positions = new Float32Array([
			box.min.x, box.min.y, box.min.z,
			box.max.x, box.min.y, box.min.z,
			box.max.x, box.min.y, box.max.z,
			box.min.x, box.min.y, box.max.z,
			box.min.x, box.max.y, box.min.z,
			box.max.x, box.max.y, box.min.z,
			box.max.x, box.max.y, box.max.z,
			box.min.x, box.max.y, box.max.z
		]);

		const geometry = new BufferGeometry();
		geometry.setIndex(new BufferAttribute(indices, 1));
		geometry.setAttribute('position', new BufferAttribute(positions, 3));

		const material = new LineBasicMaterial({color: color});

		super(geometry, material);
	}
}
