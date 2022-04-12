import {Vector3, Box3, BufferGeometry, Object3D, Mesh, Matrix4, BoxBufferGeometry, Ray, MeshBasicMaterial} from "three";
import {HelperUtils} from "../utils/HelperUtils.js";
import {updatePointClouds} from "../Potree.js";
import {PointCloudTree} from "../pointcloud/PointCloudTree.js";

/**
 * Potree object is a wrapper to use Potree alongside other THREE based frameworks.
 * 
 * The object can be used a normal Object3D.
 * 
 * It is based on Mesh and automatically updates the point cloud based on visibility.
 * 
 * Also takes care of geometry adjustments to allow the point clouds to be frustum culled.
 */
class BasicGroup extends Mesh 
{
	constructor() 
	{
		super(new BufferGeometry(), new MeshBasicMaterial({opacity: 0.0, wireframe: false, transparent: true}));

		this.rotation.set(-Math.PI / 2, 0, 0);

		this.frustumCulled = true;
		this.pointclouds = [];

		this.nodeSize = 30;
		this.pointBudget = 1e10; // TODO <NOT USED>
		this.nodeLoadRate = 2; // TODO <NOT USED>
	}

	/**
	 * Empty raycast method to avoid getting valid collision detection with the box geometry attached.
	 */
	raycast(raycaster, intersects) { }

	/**
	 * Changes the point budget to be used by potree.
	 */
	setPointBudget(budget) 
	{
		this.pointBudget = budget;
	}

	/**
	 * Used to update the point cloud visibility relative to a camera.
	 * 
	 * Called automatically before rendering.
	 */
	onBeforeRender(renderer, scene, camera, geometry, material, group) 
	{
		for (let i = 0; i < this.pointclouds.length; i++)
		{
			this.pointclouds[i].minimumNodePixelSize = this.nodeSize;
		}

		updatePointClouds(this.pointclouds, camera, renderer, this.pointBudget);
	}

	/**
	 * Recalculate the box geometry attached to this group.
	 * 
	 * The geometry its not visible and its only used for frustum culling.
	 */
	recalculateBoxGeometry() 
	{
		const box = this.getBoundingBox();

		const size = box.getSize(new Vector3());
		const center = box.getCenter(new Vector3());

		const matrix = new Matrix4();
		matrix.makeTranslation(center.x, -center.z, center.y);

		const geometry = new BoxBufferGeometry(size.x, size.z, size.y);
		geometry.applyMatrix4(matrix);

		this.geometry = geometry;
	}

	/**
	 * Add an object as children of this scene.
	 * 
	 * Point cloud objects are detected and used to recalculate the geometry box used for frustum culling.
	 */
	add(object) 
	{
		Object3D.prototype.add.call(this, object);

		if (object instanceof PointCloudTree) 
		{
			object.showBoundingBox = false;
			object.generateDEM = false;
			this.pointclouds.push(object);
			this.recalculateBoxGeometry();
		}
	}

	/**
	 * Remove object from group.
	 * 
	 * Point cloud objects are detected and used to recalculate the geometry box used for frustum culling
	 */
	remove(object) 
	{
		Object3D.prototype.remove.call(this, object);

		if (object instanceof PointCloudTree) 
		{
			const index = this.pointclouds.indexOf(object);
			if (index !== -1) 
			{
				this.pointclouds.splice(index, 1);
				this.recalculateBoxGeometry();
			}
		}
	}

	/** 
	 * Get the point cloud bouding box.
	 */
	getBoundingBox() 
	{
		const box = new Box3();

		this.updateMatrixWorld(true);

		for (let i = 0; i < this.pointclouds.length; i++)
		{
			const pointcloud = this.pointclouds[i];
			pointcloud.updateMatrixWorld(true);
			const pointcloudBox = pointcloud.pcoGeometry.tightBoundingBox ? pointcloud.pcoGeometry.tightBoundingBox : pointcloud.boundingBox;
			const boxWorld = HelperUtils.computeTransformedBoundingBox(pointcloudBox, pointcloud.matrixWorld);
			box.union(boxWorld);
		}

		return box;
	}

	/** 
	 * Estimate the point cloud height at a given position.
	 */
	estimateHeightAt(position) 
	{
		let height = null;
		let fromSpacing = Infinity;

		for (let pointcloud of this.pointclouds)
		{
			if (pointcloud.root.geometryNode === undefined) 
			{
				continue;
			}

			let pHeight = null;
			let pFromSpacing = Infinity;

			const lpos = position.clone().sub(pointcloud.position);
			lpos.z = 0;
			const ray = new Ray(lpos, new Vector3(0, 0, 1));

			const stack = [pointcloud.root];
			while (stack.length > 0) 
			{
				const node = stack.pop();
				const box = node.getBoundingBox();
				const inside = ray.intersectBox(box);

				if (!inside) 
				{
					continue;
				}

				const h = node.geometryNode.mean.z + pointcloud.position.z + node.geometryNode.boundingBox.min.z;

				if (node.geometryNode.spacing <= pFromSpacing) 
				{
					pHeight = h;
					pFromSpacing = node.geometryNode.spacing;
				}

				for (let index of Object.keys(node.children))
				{
					const child = node.children[index];
					if (child.geometryNode) 
					{
						stack.push(node.children[index]);
					}
				}
			}

			if (height === null || pFromSpacing < fromSpacing) 
			{
				height = pHeight;
				fromSpacing = pFromSpacing;
			}
		}

		return height;
	}
}

export {BasicGroup};
