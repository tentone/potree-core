"use strict";

import {HelperUtils} from "../utils/HelperUtils.js";
import {updatePointClouds} from "../Potree.js";
import {PointCloudTree} from "../pointcloud/PointCloudTree.js";

/**
 * Potree object is a wrapper to use Potree alongside other THREE based frameworks.
 * 
 * The object can be used a normal Object3D.
 * 
 * It is based on THREE.Mesh and automatically updates the point cloud based on visibility.
 * 
 * Also takes care of geometry ajustments to allow the point clouds to be frustum culled.
 */
class BasicGroup extends THREE.Mesh
{
	constructor()
	{
		super(new THREE.Geometry(), new THREE.MeshBasicMaterial({opacity:0.0, wireframe:false, transparent:true}));

		this.rotation.set(-Math.PI / 2, 0, 0);

		this.frustumCulled = true;
		this.pointclouds = [];

		this.nodeSize = 30;
		this.pointBudget = 1e10; //TODO <NOT USED>
		this.nodeLoadRate = 2; //TODO <NOT USED>
	}

	/**
	 * Empty raycast method to avoid getting valid collision detection with the box geometry attached.
	 */
	raycast(raycaster, intersects){}

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
		for(var i = 0; i < this.pointclouds.length; i++)
		{
			this.pointclouds[i].minimumNodePixelSize = this.nodeSize;
		}

		updatePointClouds(this.pointclouds, camera, renderer);
	}

	/**
	 * Recalculate the box geometry attached to this group.
	 * 
	 * The geometry its not visible and its only used for frustum culling.
	 */
	recalculateBoxGeometry()
	{
		var box = this.getBoundingBox();
		
		var size = box.getSize(new THREE.Vector3());
		var center = box.getCenter(new THREE.Vector3());

		var matrix = new THREE.Matrix4();
		matrix.makeTranslation(center.x, -center.z, center.y);

		var geometry = new THREE.BoxBufferGeometry(size.x, size.z, size.y);
		geometry.applyMatrix(matrix);

		this.geometry = geometry;
	}

	/**
	 * Add an object as children of this scene.
	 * 
	 * Point cloud objects are detected and used to recalculate the geometry box used for frustum culling.
	 */
	add(object)
	{
		THREE.Object3D.prototype.add.call(this, object);

		if(object instanceof PointCloudTree)
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
		THREE.Object3D.prototype.remove.call(this, object);

		if(object instanceof PointCloudTree)
		{
			var index = this.pointclouds.indexOf(object);
			if(index !== -1)
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
		var box = new THREE.Box3();

		this.updateMatrixWorld(true);

		for(var i = 0; i < this.pointclouds.length; i++)
		{
			var pointcloud = this.pointclouds[i];
			pointcloud.updateMatrixWorld(true);
			var pointcloudBox = pointcloud.pcoGeometry.tightBoundingBox ? pointcloud.pcoGeometry.tightBoundingBox : pointcloud.boundingBox;
			var boxWorld = HelperUtils.computeTransformedBoundingBox(pointcloudBox, pointcloud.matrixWorld);
			box.union(boxWorld);
		}

		return box;
	}

	/** 
	 * Estimate the point cloud height at a given position.
	 */
	estimateHeightAt(position)
	{
		var height = null;
		var fromSpacing = Infinity;

		for(var pointcloud of this.pointclouds)
		{
			if(pointcloud.root.geometryNode === undefined)
			{
				continue;
			}

			var pHeight = null;
			var pFromSpacing = Infinity;

			var lpos = position.clone().sub(pointcloud.position);
			lpos.z = 0;
			var ray = new THREE.Ray(lpos, new THREE.Vector3(0, 0, 1));

			var stack = [pointcloud.root];
			while(stack.length > 0)
			{
				var node = stack.pop();
				var box = node.getBoundingBox();
				var inside = ray.intersectBox(box);

				if(!inside)
				{
					continue;
				}

				var h = node.geometryNode.mean.z + pointcloud.position.z + node.geometryNode.boundingBox.min.z;

				if(node.geometryNode.spacing <= pFromSpacing)
				{
					pHeight = h;
					pFromSpacing = node.geometryNode.spacing;
				}

				for(var index of Object.keys(node.children))
				{
					var child = node.children[index];
					if(child.geometryNode)
					{
						stack.push(node.children[index]);
					}
				}
			}

			if(height === null || pFromSpacing < fromSpacing)
			{
				height = pHeight;
				fromSpacing = pFromSpacing;
			}
		}

		return height;
	}
};

export {BasicGroup};
