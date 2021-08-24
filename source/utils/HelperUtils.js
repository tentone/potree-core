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
	static nodeToPoints(node) {
		if (!node) {
			return null;
		}

		const { count } = node.geometryNode.geometry.attributes.indices;
		const points = [];

		for (let pointIndex = 0; pointIndex < count; pointIndex++) {
			const point = this.nodeToPoint(node, pointIndex);
			points.push(point);
		}

		return points;
	}

	/**
	 * Returns an object describing the point within the node at the specified index,
	 * including its world position and all available attributes
	 */
	static nodeToPoint(node, pointIndex = 0) {
		if (!node) {
			return null;
		}

		const { attributes } = node.geometryNode.geometry;
		const point = {};

		for (let attributeName in attributes) {
			let attribute = attributes[attributeName];

			if (attributeName === 'position') {
				let x = attribute.array[3 * pointIndex + 0];
				let y = attribute.array[3 * pointIndex + 1];
				let z = attribute.array[3 * pointIndex + 2];
				let position = new THREE.Vector3(x, y, z);
				position.applyMatrix4(node.sceneNode.matrixWorld);
				point[attributeName] = position;
			} else {
				let values = attribute.array.slice(attribute.itemSize * pointIndex, attribute.itemSize * (pointIndex + 1));

				if (attribute.potree) {
					const { scale, offset } = attribute.potree;
					values = values.map(v => v / scale + offset);
				}

				switch (attributeName) {
					case 'color':
						const rgb = [...values].map(v => v / 255);
						point[attributeName] = new Color(...rgb);
						break;
					default:
						point[attributeName] = values.length === 1 ? values[0] : values;
				}
			}
		}

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

		return points[index];
	}

};

export { HelperUtils };