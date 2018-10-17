"use strict";

class HelperUtils
{
	// code taken from three.js
	// ImageUtils - generateDataTexture()
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
	 * adapted from mhluska at https://github.com/mrdoob/three.js/issues/1561
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

	static getMousePointCloudIntersection(mouse, camera, viewer, pointclouds, params = {})
	{

		var renderer = viewer.renderer;

		var nmouse = {
			x: (mouse.x / renderer.domElement.clientWidth) * 2 - 1,
			y: -(mouse.y / renderer.domElement.clientHeight) * 2 + 1
		};

		var pickParams = {};

		if(params.pickClipped)
		{
			pickParams.pickClipped = params.pickClipped;
		}

		pickParams.x = mouse.x;
		pickParams.y = renderer.domElement.clientHeight - mouse.y;

		var raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(nmouse, camera);
		var ray = raycaster.ray;

		var selectedPointcloud = null;
		var closestDistance = Infinity;
		var closestIntersection = null;
		var closestPoint = null;

		for(var pointcloud of pointclouds)
		{
			var point = pointcloud.pick(viewer, camera, ray, pickParams);

			if(!point)
			{
				continue;
			}

			var distance = camera.position.distanceTo(point.position);

			if(distance < closestDistance)
			{
				closestDistance = distance;
				selectedPointcloud = pointcloud;
				closestIntersection = point.position;
				closestPoint = point;
			}
		}

		if(selectedPointcloud)
		{
			return {
				location: closestIntersection,
				distance: closestDistance,
				pointcloud: selectedPointcloud,
				point: closestPoint
			};
		}
		else
		{
			return null;
		}
	};

	static projectedRadius(radius, camera, distance, screenWidth, screenHeight)
	{
		if(camera instanceof THREE.OrthographicCamera)
		{
			return HelperUtils.projectedRadiusOrtho(radius, camera.projectionMatrix, screenWidth, screenHeight);
		}
		else if(camera instanceof THREE.PerspectiveCamera)
		{
			return HelperUtils.projectedRadiusPerspective(radius, camera.fov * Math.PI / 180, distance, screenHeight);
		}
		else
		{
			throw new Error("invalid parameters");
		}
	}

	static projectedRadiusPerspective(radius, fov, distance, screenHeight)
	{
		var projFactor = (1 / Math.tan(fov / 2)) / distance;
		projFactor = projFactor * screenHeight / 2;

		return radius * projFactor;
	};

	static projectedRadiusOrtho(radius, proj, screenWidth, screenHeight)
	{
		var p1 = new THREE.Vector4(0);
		var p2 = new THREE.Vector4(radius);

		p1.applyMatrix4(proj);
		p2.applyMatrix4(proj);
		p1 = new THREE.Vector3(p1.x, p1.y, p1.z);
		p2 = new THREE.Vector3(p2.x, p2.y, p2.z);
		p1.x = (p1.x + 1.0) * 0.5 * screenWidth;
		p1.y = (p1.y + 1.0) * 0.5 * screenHeight;
		p2.x = (p2.x + 1.0) * 0.5 * screenWidth;
		p2.y = (p2.y + 1.0) * 0.5 * screenHeight;
		return p1.distanceTo(p2);
	}

	/**
	 *
	 * 0: no intersection
	 * 1: intersection
	 * 2: fully inside
	 */
	static frustumSphereIntersection(frustum, sphere)
	{
		var planes = frustum.planes;
		var center = sphere.center;
		var negRadius = -sphere.radius;

		var minDistance = Number.MAX_VALUE;

		for(var i = 0; i < 6; i++)
		{
			var distance = planes[i].distanceToPoint(center);

			if(distance < negRadius)
			{
				return 0;
			}

			minDistance = Math.min(minDistance, distance);
		}

		return(minDistance >= sphere.radius) ? 2 : 1;
	};
};