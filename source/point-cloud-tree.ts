import {Object3D} from 'three';
import {IPointCloudTreeNode} from './types';

/**
 * Represents a point cloud tree structure.
 */
export class PointCloudTree extends Object3D 
{
	/**
	 * The root node of the point cloud tree.
	 */
	public root: IPointCloudTreeNode | null = null;

	/**
	 * Checks if the point cloud tree has been initialized.
	 * 
	 * @returns Returns true if the tree has been initialized (i.e., root is not null), false otherwise.
	 */
	public initialized() 
	{
		return this.root !== null;
	}
}
