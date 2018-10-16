"use strict";

class HelperUtils
{
	static loadShapefileFeatures(file, callback)
	{
		let features = [];

		let handleFinish = () =>
		{
			callback(features);
		};

		shapefile.open(file)
			.then(source =>
			{
				source.read()
					.then(function log(result)
					{
						if(result.done)
						{
							handleFinish();
							return;
						}

						// console.log(result.value);

						if(result.value && result.value.type === "Feature" && result.value.geometry !== undefined)
						{
							features.push(result.value);
						}

						return source.read().then(log);
					});
			});
	}

	static toString(value)
	{
		if(value instanceof THREE.Vector3)
		{
			return value.x.toFixed(2) + ", " + value.y.toFixed(2) + ", " + value.z.toFixed(2);
		}
		else
		{
			return "" + value;
		}
	}

	static normalizeURL(url)
	{
		let u = new URL(url);

		return u.protocol + "//" + u.hostname + u.pathname.replace(/\/+/g, "/");
	};

	static pathExists(url)
	{
		let req = XHRFactory.createXMLHttpRequest();
		req.open("GET", url, false);
		req.send(null);
		if(req.status !== 200)
		{
			return false;
		}
		return true;
	};

	static debugSphere(parent, position, scale, color)
	{
		let geometry = new THREE.SphereGeometry(1, 8, 8);
		let material;

		if(color !== undefined)
		{
			material = new THREE.MeshBasicMaterial(
			{
				color: color
			});
		}
		else
		{
			material = new THREE.MeshNormalMaterial();
		}
		let sphere = new THREE.Mesh(geometry, material);
		sphere.position.copy(position);
		sphere.scale.set(scale, scale, scale);
		parent.add(sphere);
	}

	static debugLine(parent, start, end, color)
	{
		let material = new THREE.LineBasicMaterial(
		{
			color: color
		});
		let geometry = new THREE.Geometry();
		geometry.vertices.push(start, end);
		let tl = new THREE.Line(geometry, material);
		parent.add(tl);
	}

	/**
	 * adapted from mhluska at https://github.com/mrdoob/three.js/issues/1561
	 */
	static computeTransformedBoundingBox(box, transform)
	{
		let vertices = [
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

		let boundingBox = new THREE.Box3();
		boundingBox.setFromPoints(vertices);

		return boundingBox;
	};

	/**
	 * add separators to large numbers
	 *
	 * @param nStr
	 * @returns
	 */
	static addCommas(nStr)
	{
		nStr += "";
		let x = nStr.split(".");
		let x1 = x[0];
		let x2 = x.length > 1 ? "." + x[1] : "";
		let rgx = /(\d+)(\d{3})/;
		while(rgx.test(x1))
		{
			x1 = x1.replace(rgx, "$1" + "," + "$2");
		}
		return x1 + x2;
	};

	static removeCommas(str)
	{
		return str.replace(/,/g, "");
	}

	/**
	 * create worker from a string
	 *
	 * code from http://stackoverflow.com/questions/10343913/how-to-create-a-web-worker-from-a-string
	 */
	static createWorker(code)
	{
		let blob = new Blob([code],
		{
			type: "application/javascript"
		});
		let worker = new Worker(URL.createObjectURL(blob));

		return worker;
	};

	static getMousePointCloudIntersection(mouse, camera, viewer, pointclouds, params = {})
	{

		let renderer = viewer.renderer;

		let nmouse = {
			x: (mouse.x / renderer.domElement.clientWidth) * 2 - 1,
			y: -(mouse.y / renderer.domElement.clientHeight) * 2 + 1
		};

		let pickParams = {};

		if(params.pickClipped)
		{
			pickParams.pickClipped = params.pickClipped;
		}

		pickParams.x = mouse.x;
		pickParams.y = renderer.domElement.clientHeight - mouse.y;

		let raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(nmouse, camera);
		let ray = raycaster.ray;

		let selectedPointcloud = null;
		let closestDistance = Infinity;
		let closestIntersection = null;
		let closestPoint = null;

		for(let pointcloud of pointclouds)
		{
			let point = pointcloud.pick(viewer, camera, ray, pickParams);

			if(!point)
			{
				continue;
			}

			let distance = camera.position.distanceTo(point.position);

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

	static pixelsArrayToImage(pixels, width, height)
	{
		let canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;

		let context = canvas.getContext("2d");

		pixels = new pixels.constructor(pixels);

		for(let i = 0; i < pixels.length; i++)
		{
			pixels[i * 4 + 3] = 255;
		}

		let imageData = context.createImageData(width, height);
		imageData.data.set(pixels);
		context.putImageData(imageData, 0, 0);

		let img = new Image();
		img.src = canvas.toDataURL();
		// img.style.transform = "scaleY(-1)";

		return img;
	};

	static pixelsArrayToDataUrl(pixels, width, height)
	{
		let canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;

		let context = canvas.getContext("2d");

		pixels = new pixels.constructor(pixels);

		for(let i = 0; i < pixels.length; i++)
		{
			pixels[i * 4 + 3] = 255;
		}

		let imageData = context.createImageData(width, height);
		imageData.data.set(pixels);
		context.putImageData(imageData, 0, 0);

		let dataURL = canvas.toDataURL();

		return dataURL;
	};

	static pixelsArrayToCanvas(pixels, width, height)
	{
		let canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;

		let context = canvas.getContext("2d");

		pixels = new pixels.constructor(pixels);

		//for (let i = 0; i < pixels.length; i++) {
		//	pixels[i * 4 + 3] = 255;
		//}

		// flip vertically
		let bytesPerLine = width * 4;
		for(let i = 0; i < parseInt(height / 2); i++)
		{
			let j = height - i - 1;

			let lineI = pixels.slice(i * bytesPerLine, i * bytesPerLine + bytesPerLine);
			let lineJ = pixels.slice(j * bytesPerLine, j * bytesPerLine + bytesPerLine);
			pixels.set(lineJ, i * bytesPerLine);
			pixels.set(lineI, j * bytesPerLine);
		}

		let imageData = context.createImageData(width, height);
		imageData.data.set(pixels);
		context.putImageData(imageData, 0, 0);

		return canvas;
	};

	static mouseToRay(mouse, camera, width, height)
	{

		let normalizedMouse = {
			x: (mouse.x / width) * 2 - 1,
			y: -(mouse.y / height) * 2 + 1
		};

		let vector = new THREE.Vector3(normalizedMouse.x, normalizedMouse.y, 0.5);
		let origin = new THREE.Vector3(normalizedMouse.x, normalizedMouse.y, 0);
		vector.unproject(camera);
		origin.unproject(camera);
		let direction = new THREE.Vector3().subVectors(vector, origin).normalize();

		let ray = new THREE.Ray(origin, direction);

		return ray;
	}

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
		let projFactor = (1 / Math.tan(fov / 2)) / distance;
		projFactor = projFactor * screenHeight / 2;

		return radius * projFactor;
	};

	static projectedRadiusOrtho(radius, proj, screenWidth, screenHeight)
	{
		let p1 = new THREE.Vector4(0);
		let p2 = new THREE.Vector4(radius);

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

	static topView(camera, node)
	{
		camera.position.set(0, 1, 0);
		camera.rotation.set(-Math.PI / 2, 0, 0);
		camera.zoomTo(node, 1);
	};

	static frontView(camera, node)
	{
		camera.position.set(0, 0, 1);
		camera.rotation.set(0, 0, 0);
		camera.zoomTo(node, 1);
	};

	static leftView(camera, node)
	{
		camera.position.set(-1, 0, 0);
		camera.rotation.set(0, -Math.PI / 2, 0);
		camera.zoomTo(node, 1);
	};

	static rightView(camera, node)
	{
		camera.position.set(1, 0, 0);
		camera.rotation.set(0, Math.PI / 2, 0);
		camera.zoomTo(node, 1);
	};

	/**
	 *
	 * 0: no intersection
	 * 1: intersection
	 * 2: fully inside
	 */
	static frustumSphereIntersection(frustum, sphere)
	{
		let planes = frustum.planes;
		let center = sphere.center;
		let negRadius = -sphere.radius;

		let minDistance = Number.MAX_VALUE;

		for(let i = 0; i < 6; i++)
		{
			let distance = planes[i].distanceToPoint(center);

			if(distance < negRadius)
			{
				return 0;
			}

			minDistance = Math.min(minDistance, distance);
		}

		return(minDistance >= sphere.radius) ? 2 : 1;
	};

	// code taken from three.js
	// ImageUtils - generateDataTexture()
	static generateDataTexture(width, height, color)
	{
		let size = width * height;
		let data = new Uint8Array(4 * width * height);

		let r = Math.floor(color.r * 255);
		let g = Math.floor(color.g * 255);
		let b = Math.floor(color.b * 255);

		for(let i = 0; i < size; i++)
		{
			data[i * 3] = r;
			data[i * 3 + 1] = g;
			data[i * 3 + 2] = b;
		}

		let texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
		texture.needsUpdate = true;
		texture.magFilter = THREE.NearestFilter;

		return texture;
	};
};