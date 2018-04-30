"use strict";

/**
 * Potree object is a wrapper to use Potree alongside other THREE based frameworks.
 * 
 * The object can be used a normal Object3D.
 * 
 * It is based on THREE.Mesh and automatically updates the point cloud based on visibility.
 * 
 * Also takes care of geometry ajustments to allow the point clouds to be frustum culled.
 */
Potree.BasicGroup = class extends THREE.Mesh
{
	constructor()
	{
		super(new THREE.Geometry(), new THREE.MeshBasicMaterial());

		this.rotation.set(-Math.PI / 2, 0, 0);

		this.frustumCulled = false;
		this.pointclouds = [];
		this.minNodeSize = 30;
	}

	/**
	 * Change the global point budget to be used by potree.
	 * 
	 * It affects all potree scenes.
	 */
	setPointBudget(budget)
	{
		Potree.pointBudget = budget;
	}

	/**
	 * Used to update the point cloud visibility relative to a camera.
	 * 
	 * Called automatically before rendering.
	 */
	onBeforeRender(renderer, scene, camera, geometry, material, group)
	{
		Potree.pointLoadLimit = Potree.pointBudget * 2;

		/*for(var pointcloud of this.pointclouds)
		{
			pointcloud.showBoundingBox = false;
			pointcloud.generateDEM = false;
			pointcloud.minimumNodePixelSize = this.minNodeSize;
		}*/

		Potree.updatePointClouds(this.pointclouds, camera, renderer);
	}

	/**
	 * Add an object as children of this scene.
	 * 
	 * Potree PointCloud objects are detected and used to recalculate the geometry box used for frustum culling.
	 */
	add(object)
	{
		if(object instanceof Potree.PointCloudTree)
		{
			this.pointclouds.push(object);
		}

		THREE.Object3D.prototype.add.call(this, object);
	}

	/** 
	 * Get the point cloud bouding box.
	 */
	getBoundingBox()
	{
		var box = new THREE.Box3();

		this.updateMatrixWorld(true);

		for(var pointcloud of this.pointclouds)
		{
			pointcloud.updateMatrixWorld(true);

			var pointcloudBox = pointcloud.pcoGeometry.tightBoundingBox ? pointcloud.pcoGeometry.tightBoundingBox : pointcloud.boundingBox;
			var boxWorld = Potree.utils.computeTransformedBoundingBox(pointcloudBox, pointcloud.matrixWorld);
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
