import {Box3, Matrix4, Vector3} from 'three';

/**
 * Computes the transformed bounding box of a given Box3 using a transformation matrix.
 * 
 * @param box - The original bounding box to transform.
 * @param transform - The transformation matrix to apply.
 * @returns A new Box3 that represents the transformed bounding box.
 */
export function computeTransformedBoundingBox(box: Box3, transform: Matrix4): Box3 
{
	return new Box3().setFromPoints([
		new Vector3(box.min.x, box.min.y, box.min.z).applyMatrix4(transform),
		new Vector3(box.min.x, box.min.y, box.min.z).applyMatrix4(transform),
		new Vector3(box.max.x, box.min.y, box.min.z).applyMatrix4(transform),
		new Vector3(box.min.x, box.max.y, box.min.z).applyMatrix4(transform),
		new Vector3(box.min.x, box.min.y, box.max.z).applyMatrix4(transform),
		new Vector3(box.min.x, box.max.y, box.max.z).applyMatrix4(transform),
		new Vector3(box.max.x, box.max.y, box.min.z).applyMatrix4(transform),
		new Vector3(box.max.x, box.min.y, box.max.z).applyMatrix4(transform),
		new Vector3(box.max.x, box.max.y, box.max.z).applyMatrix4(transform)
	]);
}

/**
 * Creates a child AABB (Axis-Aligned Bounding Box) from a parent AABB based on the specified index.
 * 
 * @param aabb - The parent AABB from which to create the child AABB.
 * @param index - The index that determines how to split the parent AABB into a child AABB.
 * @returns New Box3 representing the child AABB.
 */
export function createChildAABB(aabb: Box3, index: number): Box3 
{
	const min = aabb.min.clone();
	const max = aabb.max.clone();
	const size = new Vector3().subVectors(max, min);

	// tslint:disable-next-line:no-bitwise
	if ((index & 0b0001) > 0) 
	{
		min.z += size.z / 2;
	}
	else 
	{
		max.z -= size.z / 2;
	}

	// tslint:disable-next-line:no-bitwise
	if ((index & 0b0010) > 0) 
	{
		min.y += size.y / 2;
	}
	else 
	{
		max.y -= size.y / 2;
	}

	// tslint:disable-next-line:no-bitwise
	if ((index & 0b0100) > 0) 
	{
		min.x += size.x / 2;
	}
	else 
	{
		max.x -= size.x / 2;
	}

	return new Box3(min, max);
}
