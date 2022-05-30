import {Vector3, Box3, DataTexture, NearestFilter, RGBAFormat} from 'three';

export class Utils
{
	/**
	 * Create a new data texture with a solid color.
	 */
	static generateDataTexture(width, height, color)
	{
		const size = width * height;
		const data = new Uint8Array(4 * width * height);

		const r = Math.floor(color.r * 255);
		const g = Math.floor(color.g * 255);
		const b = Math.floor(color.b * 255);

		for (let i = 0; i < size; i++)
		{
			data[i * 3] = r;
			data[i * 3 + 1] = g;
			data[i * 3 + 2] = b;
		}

		const texture = new DataTexture(data, width, height, RGBAFormat);
		texture.needsUpdate = true;
		texture.magFilter = NearestFilter;

		return texture;
	};

	/**
	 * Compute a transformed bounding box from an original box and a transform matrix.
	 */
	static computeTransformedBoundingBox(box, transform)
	{
		const vertices = [
			new Vector3(box.min.x, box.min.y, box.min.z).applyMatrix4(transform),
			new Vector3(box.min.x, box.min.y, box.min.z).applyMatrix4(transform),
			new Vector3(box.max.x, box.min.y, box.min.z).applyMatrix4(transform),
			new Vector3(box.min.x, box.max.y, box.min.z).applyMatrix4(transform),
			new Vector3(box.min.x, box.min.y, box.max.z).applyMatrix4(transform),
			new Vector3(box.min.x, box.max.y, box.max.z).applyMatrix4(transform),
			new Vector3(box.max.x, box.max.y, box.min.z).applyMatrix4(transform),
			new Vector3(box.max.x, box.min.y, box.max.z).applyMatrix4(transform),
			new Vector3(box.max.x, box.max.y, box.max.z).applyMatrix4(transform)
		];

		const boundingBox = new Box3();
		boundingBox.setFromPoints(vertices);
		
		return boundingBox;
	};
}
