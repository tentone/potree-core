"use strict";

import * as THREE from 'three';
class HelperUtils {
	/**
	 * Create a new data texture with a solid color.
	 */
	static generateDataTexture(width, height, color) {
		var size = width * height;
		var data = new Uint8Array(4 * width * height);

		var r = Math.floor(color.r * 255);
		var g = Math.floor(color.g * 255);
		var b = Math.floor(color.b * 255);

		for (var i = 0; i < size; i++) {
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
	static computeTransformedBoundingBox(box, transform) {
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

	/**
	 * Returns an array of objects describing all of the points contained within
	 * the specified node, including their world position and all available attributes
	 */
	static nodeToPoints(node, params = {}) {
		if (!node) {
			return null;
		}

		performance.mark('nodeToPoints-start');

		const { count } = node.geometryNode.geometry.attributes.indices;
		const points = [];

		for (let pointIndex = 0; pointIndex < count; pointIndex++) {
			const point = this.nodeToPoint(node, pointIndex, params);
			if (point) {
				points.push(point);
			}
		}

		performance.measure('nodeToPoints', 'nodeToPoints-start');

		return points;
	}

	/**
	 * Returns an object describing the point within the node at the specified index,
	 * including its world position and all available attributes
	 */
	static nodeToPoint(node, pointIndex = 0, params = {}) {
		if (!node) {
			return null;
		}

		performance.mark('nodeToPoint-start');

		const attributes = new Map(Object.entries(node.geometryNode.geometry.attributes));
		const point = {};

		for (const [attributeName, attribute] of attributes) {
			let value;

			switch (attributeName) {
				case 'position': {
					let x = attribute.array[3 * pointIndex + 0];
					let y = attribute.array[3 * pointIndex + 1];
					let z = attribute.array[3 * pointIndex + 2];
					value = new THREE.Vector3(x, y, z);
					value.applyMatrix4(node.sceneNode.matrixWorld);
					break;
				}

				case 'indices': {
					// Ignored
					continue;
				}

				default: {
					let values = attribute.array.slice(attribute.itemSize * pointIndex, attribute.itemSize * (pointIndex + 1));

					if (attribute.potree) {
						const { scale, offset } = attribute.potree;
						values = values.map(v => v / scale + offset);
					}

					switch (attributeName) {
						case 'color':
							const rgb = [...values].map(v => v / 255);
							value = new Color(...rgb);
							break;
						default:
							value = values.length === 1 ? values[0] : values;
							break;
					}

					break;
				}

			}

			if (params.attributeFilter && !params.attributeFilter(attributeName, value)) {
				return null;
			}

			point[attributeName] = value;
		}

		performance.measure('nodeToPoint', 'nodeToPoint-start');

		return point;
	}

	/**
	 * Returns an object describing the nearers point to the selected Intersection,
	 * including it's world position and all available attributes
	 *
	 * @param {THREE.Intersection} intersection
	 * @returns
	 */
	static intersectionToPoint(intersection) {
		if (!intersection) {
			return null;
		}

		performance.mark('intersectionToPoint-start');

		const node = {
			geometryNode: {
				geometry: intersection.object.geometry
			},
			sceneNode: intersection.object,
		};

		const points = [];
		const { count } = intersection.object.geometry.attributes.indices;

		for (let pointIndex = 0; pointIndex < count; pointIndex++) {
			const point = this.nodeToPoint(node, pointIndex);
			points.push(point);
		}

		let distance = Number.MAX_VALUE;
		let index = 0;

		points.forEach((point, i) => {
			const d = intersection.point.distanceTo(point.position);
			if (d < distance) {
				distance = d;
				index = i;
			}
		});

		performance.measure('intersectionToPoint', 'intersectionToPoint-start');

		return points[index];
	}

};

export { HelperUtils };