"use strict";

class HelperUtils
{
	/**
	 * Craete a new data texture with a solid color.
	 */
	static generateDataTexture(width, height, color)
	{
		var size = width * height;
		var data = new Uint8Array(4 * width * height);

		var r = Math.floor(color.r * 255);
		var g = Math.floor(color.g * 255);
		var b = Math.floor(color.b * 255);

		for(var i = 0; i < size; i++)
		{
			data[i * 3] = r;
			data[i * 3 + 1] = g;
			data[i * 3 + 2] = b;
		}

		var texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
		texture.needsUpdate = true;
		texture.magFilter = THREE.NearestFilter;

		return texture;
	};

	/**
	 * Compute a transformed bouding box from an original box and a transform matrix.
	 */
	static computeTransformedBoundingBox(box, transform)
	{
		var vertices = [
			new THREE.Vector3(box.min.x, box.min.y, box.min.z).applyMatrix4(transform),
			new THREE.Vector3(box.min.x, box.min.y, box.min.z).applyMatrix4(transform),
			new THREE.Vector3(box.max.x, box.min.y, box.min.z).applyMatrix4(transform),
			new THREE.Vector3(box.min.x, box.max.y, box.min.z).applyMatrix4(transform),
			new THREE.Vector3(box.min.x, box.min.y, box.max.z).applyMatrix4(transform),
			new THREE.Vector3(box.min.x, box.max.y, box.max.z).applyMatrix4(transform),
			new THREE.Vector3(box.max.x, box.max.y, box.min.z).applyMatrix4(transform),
			new THREE.Vector3(box.max.x, box.min.y, box.max.z).applyMatrix4(transform),
			new THREE.Vector3(box.max.x, box.max.y, box.max.z).applyMatrix4(transform)
		];

		var boundingBox = new THREE.Box3();
		boundingBox.setFromPoints(vertices);
		
		return boundingBox;
	};
};

export {HelperUtils};