import {Vector4} from "three";
import {PointCloudTree} from "../pointcloud/PointCloudTree.js";
import {PointSizeType, PointColorType} from "../Potree.js";
import {BasicGroup} from "./BasicGroup.js";

class Group extends BasicGroup 
{
	constructor() 
	{
		super();

		this.textures = new Map();
	}

	/**
	 * Update the potree group before rendering.
	 */
	onBeforeRender(renderer, scene, camera, geometry, material, group) 
	{
		super.onBeforeRender(renderer, scene, camera, geometry, material, group);

		const result = this.fetchOctrees();
		const gl = renderer.getContext();
		if (gl.bindVertexArray === undefined)
		{
			this.getExtensions(gl);
		}

		for (let octree of result.octrees) 
		{
			const nodes = octree.visibleNodes;
			this.prepareOcttree(renderer, octree, nodes, camera);
		}
	}

	fetchOctrees() 
	{
		const octrees = [];
		const stack = [this];

		while (stack.length > 0) 
		{
			const node = stack.pop();

			if (node instanceof PointCloudTree) 
			{
				octrees.push(node);
				continue;
			}

			const visibleChildren = node.children.filter((c) => {return c.visible;});
			stack.push(...visibleChildren);
		}

		const result =
        {octrees: octrees};

		return result;
	}

	prepareOcttree(renderer, octree, nodes, camera) 
	{
		const material = octree.material;
		const viewInv = camera.matrixWorld;
		const proj = camera.projectionMatrix;

		let visibilityTextureData = null;

		if (material.pointSizeType === PointSizeType.ADAPTIVE || material.pointColorType === PointColorType.LOD) 
		{
			visibilityTextureData = octree.computeVisibilityTextureData(nodes, camera);

			const vnt = material.visibleNodesTexture;
			vnt.image.data.set(visibilityTextureData.data);
			vnt.needsUpdate = true;
		}

		// Clip planes
		const numClippingPlanes = material.clipping && material.clippingPlanes && material.clippingPlanes.length ? material.clippingPlanes.length : 0;
		const clipPlanesChanged = material.defines['num_clipplanes'] !== numClippingPlanes;
		let clippingPlanes = [];
		if (clipPlanesChanged) 
		{
			material.defines = {
				...material.defines,
				num_clipplanes: numClippingPlanes
			};
			material.needsUpdate = true;
		}
		if (numClippingPlanes > 0) 
		{
			const planes = material.clippingPlanes;
			const flattenedPlanes = new Array(4 * material.clippingPlanes.length);
			for (let i = 0; i < planes.length; i++) 
			{
				flattenedPlanes[4 * i] = planes[i].normal.x;
				flattenedPlanes[4*i + 1] = planes[i].normal.y;
				flattenedPlanes[4*i + 2] = planes[i].normal.z;
				flattenedPlanes[4*i + 3] = planes[i].constant;
			}
			clippingPlanes = flattenedPlanes;
		}

		const clippingPlanesAsVec4Array = material.clippingPlanes ? material.clippingPlanes.map((x) => {return new Vector4(x.normal.x, x.normal.y, x.normal.z, x.constant);}) : [];
		material.uniforms.projectionMatrix.value.copy(proj);
		material.uniforms.uViewInv.value.copy(viewInv);
		material.uniforms.clipPlanes.value = clippingPlanesAsVec4Array;
		material.uniforms.fov.value = Math.PI * camera.fov / 180;
		material.uniforms.near.value = camera.near;
		material.uniforms.far.value = camera.far;
		material.uniforms.size.value = material.size;
		material.uniforms.uOctreeSpacing.value = material.spacing;
		material.uniforms.uColor.value = material.color;
		material.uniforms.uOpacity.value = material.opacity;
		material.uniforms.elevationRange.value = material.elevationRange;
		material.uniforms.intensityRange.value = material.intensityRange;
		material.uniforms.intensityGamma.value = material.intensityGamma;
		material.uniforms.intensityContrast.value = material.intensityContrast;
		material.uniforms.intensityBrightness.value = material.intensityBrightness;
		material.uniforms.rgbGamma.value = material.rgbGamma;
		material.uniforms.rgbBrightness.value = material.rgbBrightness;
		material.uniforms.uTransition.value = material.transition;
		material.uniforms.wRGB.value = material.weightRGB;
		material.uniforms.wIntensity.value = material.weightIntensity;
		material.uniforms.wElevation.value = material.weightElevation;
		material.uniforms.wClassification.value = material.weightClassification;
		material.uniforms.wReturnNumber.value = material.weightReturnNumber;
		material.uniforms.wSourceID.value = material.weightSourceID;
		material.uniforms.logDepthBufFC.value = renderer.capabilities.logarithmicDepthBuffer ? 2.0 / (Math.log(camera.far + 1.0) / Math.LN2) : undefined;
		material.uniformsNeedUpdate = true;
	}
}

export {Group};
