"use strict";

class PotreeSceneRenderer
{
	constructor(renderer)
	{
		this.renderer = renderer;
		this.gl = this.renderer.context;

		this.buffers = new Map();
		this.shaders = new Map();
		this.textures = new Map();

		this.glTypeMapping = new Map();
		this.glTypeMapping.set(Float32Array, this.gl.FLOAT);
		this.glTypeMapping.set(Uint8Array, this.gl.UNSIGNED_BYTE);
		this.glTypeMapping.set(Uint16Array, this.gl.UNSIGNED_SHORT);

		this.toggle = 0;
	}

	createBuffer(geometry)
	{
		let gl = this.gl;
		let webglBuffer = new Potree.WebGLBuffer();
		webglBuffer.vao = gl.createVertexArray();
		webglBuffer.numElements = geometry.attributes.position.count;

		gl.bindVertexArray(webglBuffer.vao);

		for(let attributeName in geometry.attributes)
		{
			let bufferAttribute = geometry.attributes[attributeName];

			let vbo = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
			gl.bufferData(gl.ARRAY_BUFFER, bufferAttribute.array, gl.STATIC_DRAW);

			let attributeLocation = Potree.attributeLocations[attributeName];
			let normalized = bufferAttribute.normalized;
			let type = this.glTypeMapping.get(bufferAttribute.array.constructor);

			gl.vertexAttribPointer(attributeLocation, bufferAttribute.itemSize, type, normalized, 0, 0);
			gl.enableVertexAttribArray(attributeLocation);

			webglBuffer.vbos.set(attributeName, {
				handle: vbo,
				name: attributeName,
				count: bufferAttribute.count,
				itemSize: bufferAttribute.itemSize,
				type: geometry.attributes.position.array.constructor,
				version: 0
			});
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.bindVertexArray(null);

		return webglBuffer;
	}

	updateBuffer(geometry)
	{
		let gl = this.gl;

		let webglBuffer = this.buffers.get(geometry);

		gl.bindVertexArray(webglBuffer.vao);

		for(let attributeName in geometry.attributes)
		{
			let bufferAttribute = geometry.attributes[attributeName];

			let attributeLocation = Potree.attributeLocations[attributeName];
			let normalized = bufferAttribute.normalized;
			let type = this.glTypeMapping.get(bufferAttribute.array.constructor);

			let vbo = null;
			if(!webglBuffer.vbos.has(attributeName))
			{
				vbo = gl.createBuffer();

				webglBuffer.vbos.set(attributeName,
				{
					handle: vbo,
					name: attributeName,
					count: bufferAttribute.count,
					itemSize: bufferAttribute.itemSize,
					type: geometry.attributes.position.array.constructor,
					version: bufferAttribute.version
				});
			}
			else
			{
				vbo = webglBuffer.vbos.get(attributeName).handle;
				webglBuffer.vbos.get(attributeName).version = bufferAttribute.version;
			}

			gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
			gl.bufferData(gl.ARRAY_BUFFER, bufferAttribute.array, gl.STATIC_DRAW);
			gl.vertexAttribPointer(attributeLocation, bufferAttribute.itemSize, type, normalized, 0, 0);
			gl.enableVertexAttribArray(attributeLocation);
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.bindVertexArray(null);
	}

	traverse(scene)
	{
		let octrees = [];

		let stack = [scene];
		while (stack.length > 0)
		{
			let node = stack.pop();

			if(node instanceof Potree.PointCloudTree)
			{
				octrees.push(node);
				continue;
			}

			let visibleChildren = node.children.filter(c => c.visible);
			stack.push(...visibleChildren);
		}

		let result =
		{
			octrees: octrees
		};

		return result;
	}

	renderNodes(octree, nodes, visibilityTextureData, camera, target, shader, params)
	{
		let gl = this.gl;
		let material = params.material ? params.material : octree.material;
		let shadowMaps = params.shadowMaps == null ? [] : params.shadowMaps;
		let view = camera.matrixWorldInverse;
		let worldView = new THREE.Matrix4();
		let mat4holder = new Float32Array(16);

		let i = 0;
		
		for(let node of nodes)
		{
			if(Potree.debug.allowedNodes !== undefined)
			{
				if(!Potree.debug.allowedNodes.includes(node.name))
				{
					continue;
				}
			}

			let world = node.sceneNode.matrixWorld;
			worldView.multiplyMatrices(view, world);

			if(visibilityTextureData)
			{
				let vnStart = visibilityTextureData.offsets.get(node);
				shader.setUniform1f("uVNStart", vnStart);
			}

			let level = node.getLevel();
			shader.setUniform("uDebug", node.debug === true);

			let isLeaf;
			if(node instanceof Potree.PointCloudOctreeNode)
			{
				isLeaf = Object.keys(node.children).length === 0;
			}
			else if(node instanceof Potree.PointCloudArena4DNode)
			{
				isLeaf = node.geometryNode.isLeaf;
			}
			shader.setUniform("uIsLeafNode", isLeaf);

			// TODO consider passing matrices in an array to avoid uniformMatrix4fv overhead
			const lModel = shader.uniformLocations["modelMatrix"];
			if(lModel)
			{
				mat4holder.set(world.elements);
				gl.uniformMatrix4fv(lModel, false, mat4holder);
			}

			const lModelView = shader.uniformLocations["modelViewMatrix"];
			//mat4holder.set(worldView.elements);
			// faster then set in chrome 63
			for(let j = 0; j < 16; j++)
			{
				mat4holder[j] = worldView.elements[j];
			}
			gl.uniformMatrix4fv(lModelView, false, mat4holder);

			//Clip Polygons
			if(material.clipPolygons && material.clipPolygons.length > 0)
			{

				let clipPolygonVCount = [];
				let worldViewProjMatrices = [];

				for(let clipPolygon of material.clipPolygons)
				{
					let view = clipPolygon.viewMatrix;
					let proj = clipPolygon.projMatrix;

					let worldViewProj = proj.clone().multiply(view).multiply(world);

					clipPolygonVCount.push(clipPolygon.markers.length);
					worldViewProjMatrices.push(worldViewProj);
				}

				let flattenedMatrices = [].concat(...worldViewProjMatrices.map(m => m.elements));

				let flattenedVertices = new Array(8 * 3 * material.clipPolygons.length);
				for(let i = 0; i < material.clipPolygons.length; i++)
				{
					let clipPolygon = material.clipPolygons[i];
					for(let j = 0; j < clipPolygon.markers.length; j++)
					{
						flattenedVertices[i * 24 + (j * 3 + 0)] = clipPolygon.markers[j].position.x;
						flattenedVertices[i * 24 + (j * 3 + 1)] = clipPolygon.markers[j].position.y;
						flattenedVertices[i * 24 + (j * 3 + 2)] = clipPolygon.markers[j].position.z;
					}
				}

				const lClipPolygonVCount = shader.uniformLocations["uClipPolygonVCount[0]"];
				gl.uniform1iv(lClipPolygonVCount, clipPolygonVCount);

				const lClipPolygonVP = shader.uniformLocations["uClipPolygonWVP[0]"];
				gl.uniformMatrix4fv(lClipPolygonVP, false, flattenedMatrices);

				const lClipPolygons = shader.uniformLocations["uClipPolygonVertices[0]"];
				gl.uniform3fv(lClipPolygons, flattenedVertices);
			}

			shader.setUniform1f("uLevel", level);
			shader.setUniform1f("uNodeSpacing", node.geometryNode.estimatedSpacing);
			shader.setUniform1f("uPCIndex", i);

			if(shadowMaps.length > 0)
			{
				const lShadowMap = shader.uniformLocations["uShadowMap[0]"];

				shader.setUniform3f("uShadowColor", material.uniforms.uShadowColor.value);

				let bindingStart = 5;
				let bindingPoints = new Array(shadowMaps.length).fill(bindingStart).map((a, i) => (a + i));
				gl.uniform1iv(lShadowMap, bindingPoints);

				for(let i = 0; i < shadowMaps.length; i++)
				{
					let shadowMap = shadowMaps[i];
					let bindingPoint = bindingPoints[i];
					let glTexture = this.renderer.properties.get(shadowMap.target.texture).__webglTexture;

					gl.activeTexture(gl[`TEXTURE${bindingPoint}`]);
					gl.bindTexture(gl.TEXTURE_2D, glTexture);
				}

				let worldViewMatrices = shadowMaps
					.map(sm => sm.camera.matrixWorldInverse)
					.map(view => new THREE.Matrix4().multiplyMatrices(view, world))

				let flattenedMatrices = [].concat(...worldViewMatrices.map(c => c.elements));
				const lWorldView = shader.uniformLocations["uShadowWorldView[0]"];
				gl.uniformMatrix4fv(lWorldView, false, flattenedMatrices);

				flattenedMatrices = [].concat(...shadowMaps.map(sm => sm.camera.projectionMatrix.elements));
				const lProj = shader.uniformLocations["uShadowProj[0]"];
				gl.uniformMatrix4fv(lProj, false, flattenedMatrices);
			}

			let geometry = node.geometryNode.geometry;

			let webglBuffer = null;
			if(!this.buffers.has(geometry))
			{
				webglBuffer = this.createBuffer(geometry);
				this.buffers.set(geometry, webglBuffer);
			}
			else
			{
				webglBuffer = this.buffers.get(geometry);
				for(let attributeName in geometry.attributes)
				{
					let attribute = geometry.attributes[attributeName];
					if(attribute.version > webglBuffer.vbos.get(attributeName).version)
					{
						this.updateBuffer(geometry);
					}
				}
			}

			gl.bindVertexArray(webglBuffer.vao);

			let numPoints = webglBuffer.numElements;
			gl.drawArrays(gl.POINTS, 0, numPoints);

			i++;
		}

		gl.bindVertexArray(null);
	}

	renderOctree(octree, nodes, camera, target, params = {})
	{
		let gl = this.gl;

		let material = params.material ? params.material : octree.material;
		let shadowMaps = params.shadowMaps == null ? [] : params.shadowMaps;
		let view = camera.matrixWorldInverse;
		let viewInv = camera.matrixWorld;
		let proj = camera.projectionMatrix;
		let projInv = new THREE.Matrix4().getInverse(proj);
		let worldView = new THREE.Matrix4();

		let shader = null;
		let visibilityTextureData = null;

		let currentTextureBindingPoint = 0;

		if(material.pointSizeType >= 0)
		{
			if(material.pointSizeType === Potree.PointSizeType.ADAPTIVE || material.pointColorType === Potree.PointColorType.LOD)
			{
				let vnNodes = (params.vnTextureNodes != null) ? params.vnTextureNodes : nodes;
				visibilityTextureData = octree.computeVisibilityTextureData(vnNodes, camera);

				const vnt = material.visibleNodesTexture;
				const data = vnt.image.data;
				data.set(visibilityTextureData.data);
				vnt.needsUpdate = true;
			}
		}

		if(!this.shaders.has(material))
		{
			let [vs, fs] = [material.vertexShader, material.fragmentShader];
			let shader = new Potree.Shader(gl, "pointcloud", vs, fs);
			this.shaders.set(material, shader);
		}

		shader = this.shaders.get(material);

		let [vs, fs] = [material.vertexShader, material.fragmentShader];

		let numSnapshots = material.snapEnabled ? material.numSnapshots : 0;
		let numClipBoxes = (material.clipBoxes && material.clipBoxes.length) ? material.clipBoxes.length : 0;
		let numClipSpheres = (params.clipSpheres && params.clipSpheres.length) ? params.clipSpheres.length : 0;
		let numClipPolygons = (material.clipPolygons && material.clipPolygons.length) ? material.clipPolygons.length : 0;
		let defines = [
			`#define num_shadowmaps ${shadowMaps.length}`,
			`#define num_snapshots ${numSnapshots}`,
			`#define num_clipboxes ${numClipBoxes}`,
			`#define num_clipspheres ${numClipSpheres}`,
			`#define num_clippolygons ${numClipPolygons}`,
		];

		let definesString = defines.join("\n");

		vs = `${definesString}\n${vs}`;
		fs = `${definesString}\n${fs}`;

		shader.update(vs, fs);

		material.needsUpdate = false;

		for(let uniformName of Object.keys(material.uniforms))
		{
			let uniform = material.uniforms[uniformName];

			if(uniform.type == "t")
			{
				let texture = uniform.value;

				if(!texture)
				{
					continue;
				}

				if(!this.textures.has(texture))
				{
					let webglTexture = new Potree.WebGLTexture(gl, texture);
					this.textures.set(texture, webglTexture);
				}

				let webGLTexture = this.textures.get(texture);
				webGLTexture.update();
			}
		}

		gl.useProgram(shader.program);

		let transparent = false;
		if(params.transparent !== undefined)
		{
			transparent = params.transparent && material.opacity < 1;
		}
		else
		{
			transparent = material.opacity < 1;
		}

		if(transparent)
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

		if(params.blendFunc !== undefined)
		{
			gl.enable(gl.BLEND);
			gl.blendFunc(...params.blendFunc);
		}

		if(params.depthTest !== undefined)
		{
			if(params.depthTest === true)
			{
				gl.enable(gl.DEPTH_TEST);
			}
			else
			{
				gl.disable(gl.DEPTH_TEST);
			}
		}

		if(params.depthWrite !== undefined)
		{
			gl.depthMask(params.depthWrite === true);
		}

		//Update shader uniforms
		shader.setUniformMatrix4("projectionMatrix", proj);
		shader.setUniformMatrix4("viewMatrix", view);
		shader.setUniformMatrix4("uViewInv", viewInv);
		shader.setUniformMatrix4("uProjInv", projInv);

		let screenWidth = target ? target.width : material.screenWidth;
		let screenHeight = target ? target.height : material.screenHeight;

		shader.setUniform1f("uScreenWidth", screenWidth);
		shader.setUniform1f("uScreenHeight", screenHeight);
		shader.setUniform1f("fov", Math.PI * camera.fov / 180);
		shader.setUniform1f("near", camera.near);
		shader.setUniform1f("far", camera.far);
		
		if(camera instanceof THREE.OrthographicCamera)
		{
			shader.setUniform("uUseOrthographicCamera", true);
			shader.setUniform("uOrthoWidth", camera.right - camera.left); 
			shader.setUniform("uOrthoHeight", camera.top - camera.bottom);
		}
		else
		{
			shader.setUniform("uUseOrthographicCamera", false);
		}

		if(material.clipBoxes.length + material.clipPolygons.length === 0)
		{
			shader.setUniform1i("clipTask", Potree.ClipTask.NONE);
		}
		else
		{
			shader.setUniform1i("clipTask", material.clipTask);
		}

		shader.setUniform1i("clipMethod", material.clipMethod);

		//Clipboxes
		if(material.clipBoxes && material.clipBoxes.length > 0)
		{
			const lClipBoxes = shader.uniformLocations["clipBoxes[0]"];
			gl.uniformMatrix4fv(lClipBoxes, false, material.uniforms.clipBoxes.value);
		}

		//Clispheres
		if(params.clipSpheres && params.clipSpheres.length > 0){

			let clipSpheres = params.clipSpheres;

			let matrices = [];
			for(let clipSphere of clipSpheres)
			{
				let clipToWorld = clipSphere.matrixWorld;
				let viewToWorld = camera.matrixWorld
				let worldToClip = new THREE.Matrix4().getInverse(clipToWorld);

				let viewToClip = new THREE.Matrix4().multiplyMatrices(worldToClip, viewToWorld);

				matrices.push(viewToClip);
			}

			let flattenedMatrices = [].concat(...matrices.map(matrix => matrix.elements));

			const lClipSpheres = shader.uniformLocations["uClipSpheres[0]"];
			gl.uniformMatrix4fv(lClipSpheres, false, flattenedMatrices);
		}

		shader.setUniform1f("size", material.size);
		shader.setUniform1f("maxSize", material.uniforms.maxSize.value);
		shader.setUniform1f("minSize", material.uniforms.minSize.value);
		shader.setUniform1f("uOctreeSpacing", material.spacing);
		shader.setUniform("uOctreeSize", material.uniforms.octreeSize.value);
		shader.setUniform3f("uColor", material.color.toArray());
		shader.setUniform1f("uOpacity", material.opacity);
		shader.setUniform2f("elevationRange", material.elevationRange);
		shader.setUniform2f("intensityRange", material.intensityRange);
		shader.setUniform1f("intensityGamma", material.intensityGamma);
		shader.setUniform1f("intensityContrast", material.intensityContrast);
		shader.setUniform1f("intensityBrightness", material.intensityBrightness);
		shader.setUniform1f("rgbGamma", material.rgbGamma);
		shader.setUniform1f("rgbContrast", material.rgbContrast);
		shader.setUniform1f("rgbBrightness", material.rgbBrightness);
		shader.setUniform1f("uTransition", material.transition);
		shader.setUniform1f("wRGB", material.weightRGB);
		shader.setUniform1f("wIntensity", material.weightIntensity);
		shader.setUniform1f("wElevation", material.weightElevation);
		shader.setUniform1f("wClassification", material.weightClassification);
		shader.setUniform1f("wReturnNumber", material.weightReturnNumber);
		shader.setUniform1f("wSourceID", material.weightSourceID);

		let vnWebGLTexture = this.textures.get(material.visibleNodesTexture);
		shader.setUniform1i("visibleNodesTexture", currentTextureBindingPoint);
		gl.activeTexture(gl.TEXTURE0 + currentTextureBindingPoint);
		gl.bindTexture(vnWebGLTexture.target, vnWebGLTexture.id);
		currentTextureBindingPoint++;

		let gradientTexture = this.textures.get(material.gradientTexture);
		shader.setUniform1i("gradient", currentTextureBindingPoint);
		gl.activeTexture(gl.TEXTURE0 + currentTextureBindingPoint);
		gl.bindTexture(gradientTexture.target, gradientTexture.id);
		currentTextureBindingPoint++;

		let classificationTexture = this.textures.get(material.classificationTexture);
		shader.setUniform1i("classificationLUT", currentTextureBindingPoint);
		gl.activeTexture(gl.TEXTURE0 + currentTextureBindingPoint);
		gl.bindTexture(classificationTexture.target, classificationTexture.id);
		currentTextureBindingPoint++;

		if(material.snapEnabled === true)
		{
			const lSnapshot = shader.uniformLocations["uSnapshot[0]"];
			const lSnapshotDepth = shader.uniformLocations["uSnapshotDepth[0]"];

			let bindingStart = currentTextureBindingPoint;
			let lSnapshotBindingPoints = new Array(5).fill(bindingStart).map((a, i) => (a + i));
			let lSnapshotDepthBindingPoints = new Array(5)
				.fill(1 + Math.max(...lSnapshotBindingPoints))
				.map((a, i) => (a + i));
			currentTextureBindingPoint = 1 + Math.max(...lSnapshotDepthBindingPoints);

			gl.uniform1iv(lSnapshot, lSnapshotBindingPoints);
			gl.uniform1iv(lSnapshotDepth, lSnapshotDepthBindingPoints);

			for(let i = 0; i < 5; i++)
			{
				let texture = material.uniforms["uSnapshot"].value[i];
				let textureDepth = material.uniforms["uSnapshotDepth"].value[i];

				if(!texture)
				{
					break;
				}

				let snapTexture = this.renderer.properties.get(texture).__webglTexture;
				let snapTextureDepth = this.renderer.properties.get(textureDepth).__webglTexture;

				let bindingPoint = lSnapshotBindingPoints[i];
				let depthBindingPoint = lSnapshotDepthBindingPoints[i];

				gl.activeTexture(gl[`TEXTURE${bindingPoint}`]);
				gl.bindTexture(gl.TEXTURE_2D, snapTexture);

				gl.activeTexture(gl[`TEXTURE${depthBindingPoint}`]);
				gl.bindTexture(gl.TEXTURE_2D, snapTextureDepth);
			}

			let flattenedMatrices = [].concat(...material.uniforms.uSnapView.value.map(c => c.elements));
			const lSnapView = shader.uniformLocations["uSnapView[0]"];
			gl.uniformMatrix4fv(lSnapView, false, flattenedMatrices);

			flattenedMatrices = [].concat(...material.uniforms.uSnapProj.value.map(c => c.elements));
			const lSnapProj = shader.uniformLocations["uSnapProj[0]"];
			gl.uniformMatrix4fv(lSnapProj, false, flattenedMatrices);

			flattenedMatrices = [].concat(...material.uniforms.uSnapProjInv.value.map(c => c.elements));
			const lSnapProjInv = shader.uniformLocations["uSnapProjInv[0]"];
			gl.uniformMatrix4fv(lSnapProjInv, false, flattenedMatrices);

			flattenedMatrices = [].concat(...material.uniforms.uSnapViewInv.value.map(c => c.elements));
			const lSnapViewInv = shader.uniformLocations["uSnapViewInv[0]"];
			gl.uniformMatrix4fv(lSnapViewInv, false, flattenedMatrices);
		}

		this.renderNodes(octree, nodes, visibilityTextureData, camera, target, shader, params);

		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.activeTexture(gl.TEXTURE0);
	}

	render(scene, camera, target = null, params = {})
	{
		const gl = this.gl;

		if(target != null)
		{
			this.renderer.setRenderTarget(target);
		}

		camera.updateProjectionMatrix();

		const traversalResult = this.traverse(scene);

		for(const octree of traversalResult.octrees)
		{
			let nodes = octree.visibleNodes;
			this.renderOctree(octree, nodes, camera, target, params);
		}

		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, null)

		this.renderer.resetGLState();
	}
}
