import {Matrix4, OrthographicCamera} from 'three';
import {PointCloudTree} from '../pointcloud/PointCloudTree';
import {PointSizeType, PointColorType} from '../Enums';
import {Shader} from '../Shader';
import {BasicGroup} from './BasicGroup';

export class Group extends BasicGroup 
{
	constructor() 
	{
		super();

		this.buffers = new Map();
		this.shaders = new Map();
		this.textures = new Map();
		this.types = new Map();
	}

	/**
	 * Get WebGL extensions required for the more advanced features.
	 */
	 getExtensions(gl)
	 {
		 this.types.set(Float32Array, gl.FLOAT);
		 this.types.set(Uint8Array, gl.UNSIGNED_BYTE);
		 this.types.set(Uint16Array, gl.UNSIGNED_SHORT);
		 
		 var extVAO = gl.getExtension('OES_vertex_array_object');
		 gl.createVertexArray = extVAO.createVertexArrayOES.bind(extVAO);
		 gl.bindVertexArray = extVAO.bindVertexArrayOES.bind(extVAO);
	 }

	/**
	 * Update the potree group before rendering.
	 */
	onBeforeRender(renderer, scene, camera, geometry, material, group) 
	{
		super.onBeforeRender(renderer, scene, camera, geometry, material, group);

		var gl = renderer.getContext();
		if (gl.bindVertexArray === undefined)
		{
			this.getExtensions(gl);
		}

		var result = this.fetchOctrees();

		for (var octree of result.octrees)
		{
			var nodes = octree.visibleNodes;
			this.renderOctree(renderer, octree, nodes, camera);
		}

		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, null);

		renderer.state.reset();
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

	renderOctree(renderer, octree, nodes, camera) 
	{
		var gl = renderer.getContext();
		var material = octree.material;
		var shadowMaps = [];
		var view = camera.matrixWorldInverse;
		var viewInv = camera.matrixWorld;
		var proj = camera.projectionMatrix;
		var projInv = proj.invert();
		var worldView = new Matrix4();

		var visibilityTextureData = null;
		var currentTextureBindingPoint = 0;

		if (material.pointSizeType === PointSizeType.ADAPTIVE || material.pointColorType === PointColorType.LOD)
		{
			visibilityTextureData = octree.computeVisibilityTextureData(nodes, camera);

			var vnt = material.visibleNodesTexture;
			vnt.image.data.set(visibilityTextureData.data);
			vnt.needsUpdate = true;
		}

		var shader = null;

		if (!this.shaders.has(material))
		{
			shader = new Shader(gl, 'pointcloud', material.vertexShader, material.fragmentShader);
			this.shaders.set(material, shader);
		}
		else
		{
			shader = this.shaders.get(material);
		}

		var numSnapshots = material.snapEnabled ? material.numSnapshots : 0;
		var numClipBoxes = material.clipBoxes && material.clipBoxes.length ? material.clipBoxes.length : 0;
		var numClipPolygons = material.clipPolygons && material.clipPolygons.length ? material.clipPolygons.length : 0;
		var numClipSpheres = 0;

		var defines = [
			'#define num_shadowmaps' + shadowMaps.length,
			'#define num_snapshots' + numSnapshots,
			'#define num_clipboxes' + numClipBoxes,
			'#define num_clipspheres' + numClipSpheres,
			'#define num_clippolygons' + numClipPolygons
		];

		var definesString = defines.join('\n');
		var vs = definesString + '\n' + material.vertexShader;
		var fs = definesString + '\n' + material.fragmentShader;

		shader.update(vs, fs);

		material.needsUpdate = false;

		for (var uniformName of Object.keys(material.uniforms))
		{
			var uniform = material.uniforms[uniformName];

			if (uniform.type === 't')
			{
				var texture = uniform.value;

				if (!texture)
				{
					continue;
				}

				if (!this.textures.has(texture))
				{
					var webglTexture = new WebGLTexture(gl, texture);
					this.textures.set(texture, webglTexture);
				}

				var webGLTexture = this.textures.get(texture);
				webGLTexture.update();
			}
		}

		gl.useProgram(shader.program);

		if (material.opacity < 1.0)
		{
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
			gl.depthMask(false);
			gl.disable(gl.DEPTH_TEST);
		}
		else
		{
			gl.disable(gl.BLEND);
			gl.depthMask(true);
			gl.enable(gl.DEPTH_TEST);
		}

		// Update shader uniforms
		shader.setUniformMatrix4('projectionMatrix', proj);
		shader.setUniformMatrix4('viewMatrix', view);
		shader.setUniformMatrix4('uViewInv', viewInv);
		shader.setUniformMatrix4('uProjInv', projInv);

		var screenWidth = material.screenWidth;
		var screenHeight = material.screenHeight;

		shader.setUniform1f('uScreenWidth', screenWidth);
		shader.setUniform1f('uScreenHeight', screenHeight);
		shader.setUniform1f('fov', Math.PI * camera.fov / 180);
		shader.setUniform1f('near', camera.near);
		shader.setUniform1f('far', camera.far);
		
		// Set log
		if (renderer.capabilities.logarithmicDepthBuffer)
		{
			shader.setUniform('logDepthBufFC', 2.0 / (Math.log(camera.far + 1.0) / Math.LN2));
		}

		// Camera configuration
		if (camera instanceof OrthographicCamera)
		{
			shader.setUniform('uUseOrthographicCamera', true);
			shader.setUniform('uOrthoWidth', camera.right - camera.left); 
			shader.setUniform('uOrthoHeight', camera.top - camera.bottom);
		}
		else
		{
			shader.setUniform('uUseOrthographicCamera', false);
		}


		shader.setUniform1f('size', material.size);
		shader.setUniform1f('maxSize', material.uniforms.maxSize.value);
		shader.setUniform1f('minSize', material.uniforms.minSize.value);
		shader.setUniform1f('uOctreeSpacing', material.spacing);
		shader.setUniform('uOctreeSize', material.uniforms.octreeSize.value);
		shader.setUniform3f('uColor', material.color.toArray());
		shader.setUniform1f('uOpacity', material.opacity);
		shader.setUniform2f('elevationRange', material.elevationRange);
		shader.setUniform2f('intensityRange', material.intensityRange);
		shader.setUniform1f('intensityGamma', material.intensityGamma);
		shader.setUniform1f('intensityContrast', material.intensityContrast);
		shader.setUniform1f('intensityBrightness', material.intensityBrightness);
		shader.setUniform1f('rgbGamma', material.rgbGamma);
		shader.setUniform1f('rgbContrast', material.rgbContrast);
		shader.setUniform1f('rgbBrightness', material.rgbBrightness);
		shader.setUniform1f('uTransition', material.transition);
		shader.setUniform1f('wRGB', material.weightRGB);
		shader.setUniform1f('wIntensity', material.weightIntensity);
		shader.setUniform1f('wElevation', material.weightElevation);
		shader.setUniform1f('wClassification', material.weightClassification);
		shader.setUniform1f('wReturnNumber', material.weightReturnNumber);
		shader.setUniform1f('wSourceID', material.weightSourceID);

		var vnWebGLTexture = this.textures.get(material.visibleNodesTexture);
		shader.setUniform1i('visibleNodesTexture', currentTextureBindingPoint);
		gl.activeTexture(gl.TEXTURE0 + currentTextureBindingPoint);
		gl.bindTexture(vnWebGLTexture.target, vnWebGLTexture.id);
		currentTextureBindingPoint++;

		var gradientTexture = this.textures.get(material.gradientTexture);
		shader.setUniform1i('gradient', currentTextureBindingPoint);
		gl.activeTexture(gl.TEXTURE0 + currentTextureBindingPoint);
		gl.bindTexture(gradientTexture.target, gradientTexture.id);
		currentTextureBindingPoint++;

		var classificationTexture = this.textures.get(material.classificationTexture);
		shader.setUniform1i('classificationLUT', currentTextureBindingPoint);
		gl.activeTexture(gl.TEXTURE0 + currentTextureBindingPoint);
		gl.bindTexture(classificationTexture.target, classificationTexture.id);
		currentTextureBindingPoint++;

		if (material.snapEnabled === true)
		{
			var lSnapshot = shader.uniformLocations['uSnapshot[0]'];
			var lSnapshotDepth = shader.uniformLocations['uSnapshotDepth[0]'];

			var bindingStart = currentTextureBindingPoint;
			var lSnapshotBindingPoints = new Array(5).fill(bindingStart).map((a, i) => {return a + i;});
			var lSnapshotDepthBindingPoints = new Array(5).fill(1 + Math.max(...lSnapshotBindingPoints)).map((a, i) => {return a + i;});
			currentTextureBindingPoint = 1 + Math.max(...lSnapshotDepthBindingPoints);

			gl.uniform1iv(lSnapshot, lSnapshotBindingPoints);
			gl.uniform1iv(lSnapshotDepth, lSnapshotDepthBindingPoints);

			for (var i = 0; i < 5; i++)
			{
				var texture = material.uniforms['uSnapshot'].value[i];
				var textureDepth = material.uniforms['uSnapshotDepth'].value[i];

				if (!texture)
				{
					break;
				}

				var snapTexture = renderer.properties.get(texture).__webglTexture;
				var snapTextureDepth = renderer.properties.get(textureDepth).__webglTexture;

				var bindingPoint = lSnapshotBindingPoints[i];
				var depthBindingPoint = lSnapshotDepthBindingPoints[i];

				gl.activeTexture(gl[`TEXTURE${bindingPoint}`]);
				gl.bindTexture(gl.TEXTURE_2D, snapTexture);

				gl.activeTexture(gl[`TEXTURE${depthBindingPoint}`]);
				gl.bindTexture(gl.TEXTURE_2D, snapTextureDepth);
			}

			var flattenedMatrices = [].concat(...material.uniforms.uSnapView.value.map((c) => {return c.elements;}));
			var lSnapView = shader.uniformLocations['uSnapView[0]'];
			gl.uniformMatrix4fv(lSnapView, false, flattenedMatrices);

			flattenedMatrices = [].concat(...material.uniforms.uSnapProj.value.map((c) => {return c.elements;}));
			var lSnapProj = shader.uniformLocations['uSnapProj[0]'];
			gl.uniformMatrix4fv(lSnapProj, false, flattenedMatrices);

			flattenedMatrices = [].concat(...material.uniforms.uSnapProjInv.value.map((c) => {return c.elements;}));
			var lSnapProjInv = shader.uniformLocations['uSnapProjInv[0]'];
			gl.uniformMatrix4fv(lSnapProjInv, false, flattenedMatrices);

			flattenedMatrices = [].concat(...material.uniforms.uSnapViewInv.value.map((c) => {return c.elements;}));
			var lSnapViewInv = shader.uniformLocations['uSnapViewInv[0]'];
			gl.uniformMatrix4fv(lSnapViewInv, false, flattenedMatrices);
		}

		this.renderNodes(renderer, octree, nodes, visibilityTextureData, camera, shader);

		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.activeTexture(gl.TEXTURE0);
	}
}
