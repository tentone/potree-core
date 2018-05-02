"use strict";

Potree.Group = class extends Potree.BasicGroup
{
	constructor()
	{
		super();

		this.buffers = new Map();
		this.shaders = new Map();
		this.textures = new Map();

		this.types = new Map();
		this.types.set(Float32Array, 5126);//gl.FLOAT
		this.types.set(Uint8Array, 5121);//gl.UNSIGNED_BYTE
		this.types.set(Uint16Array, 5123);//gl.UNSIGNED_SHORT
	}

	getExtensions(gl)
	{
		gl.getExtension("EXT_frag_depth");
		gl.getExtension("WEBGL_depth_texture");

		var extVAO = gl.getExtension("OES_vertex_array_object");
		gl.createVertexArray = extVAO.createVertexArrayOES.bind(extVAO);
		gl.bindVertexArray = extVAO.bindVertexArrayOES.bind(extVAO);
	}

	onBeforeRender(renderer, scene, camera, geometry, material, group)
	{
		super.onBeforeRender(renderer, scene, camera, geometry, material, group);

		var gl = renderer.context;
		if(gl.bindVertexArray === undefined)
		{
			this.getExtensions(gl)
		}

		var result = this.fetchOctrees();
		for(var octree of result.octrees)
		{
			var nodes = octree.visibleNodes;
			this.renderOctree(renderer, octree, nodes, camera);
		}
	}

	createBuffer(gl, geometry)
	{
		var webglBuffer = new Potree.WebGLBuffer();
		webglBuffer.vao = gl.createVertexArray();
		webglBuffer.numElements = geometry.attributes.position.count;

		gl.bindVertexArray(webglBuffer.vao);

		for(var attributeName in geometry.attributes)
		{
			var bufferAttribute = geometry.attributes[attributeName];

			var vbo = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
			gl.bufferData(gl.ARRAY_BUFFER, bufferAttribute.array, gl.STATIC_DRAW);

			var attributeLocation = Potree.attributeLocations[attributeName];
			var normalized = bufferAttribute.normalized;
			var type = this.types.get(bufferAttribute.array.constructor);

			gl.vertexAttribPointer(attributeLocation, bufferAttribute.itemSize, type, normalized, 0, 0);
			gl.enableVertexAttribArray(attributeLocation);

			webglBuffer.vbos.set(attributeName,
			{
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

	updateBuffer(gl, geometry)
	{
		var webglBuffer = this.buffers.get(geometry);

		gl.bindVertexArray(webglBuffer.vao);

		for(var attributeName in geometry.attributes)
		{
			var bufferAttribute = geometry.attributes[attributeName];

			var attributeLocation = Potree.attributeLocations[attributeName];
			var normalized = bufferAttribute.normalized;
			var type = this.types.get(bufferAttribute.array.constructor);

			var vbo = null;
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

	fetchOctrees()
	{
		var octrees = [];
		var stack = [this];

		while (stack.length > 0)
		{
			var node = stack.pop();

			if(node instanceof Potree.PointCloudTree)
			{
				octrees.push(node);
				continue;
			}

			var visibleChildren = node.children.filter(c => c.visible);
			stack.push(...visibleChildren);
		}

		var result =
		{
			octrees: octrees
		};

		return result;
	}

	renderNodes(renderer, octree, nodes, visibilityTextureData, camera, shader)
	{
		var gl = renderer.context;
		var material = octree.material;
		var shadowMaps = [];
		var view = camera.matrixWorldInverse;
		var worldView = new THREE.Matrix4();
		var mat4holder = new Float32Array(16);

		for(var node of nodes)
		{
			if(Potree.debug.allowedNodes !== undefined)
			{
				if(!Potree.debug.allowedNodes.includes(node.name))
				{
					continue;
				}
			}

			var world = node.sceneNode.matrixWorld;
			worldView.multiplyMatrices(view, world);

			if(visibilityTextureData)
			{
				var vnStart = visibilityTextureData.offsets.get(node);
				shader.setUniform1f("uVNStart", vnStart);
			}

			var level = node.getLevel();
			shader.setUniform("uDebug", node.debug === true);

			var isLeaf;
			if(node instanceof Potree.PointCloudOctreeNode)
			{
				isLeaf = Object.keys(node.children).length === 0;
			}
			else if(node instanceof Potree.PointCloudArena4DNode)
			{
				isLeaf = node.geometryNode.isLeaf;
			}
			shader.setUniform("uIsLeafNode", isLeaf);

			//TODO <consider passing matrices in an array to avoid uniformMatrix4fv overhead>
			const lModel = shader.uniformLocations["modelMatrix"];
			if(lModel)
			{
				mat4holder.set(world.elements);
				gl.uniformMatrix4fv(lModel, false, mat4holder);
			}

			const lModelView = shader.uniformLocations["modelViewMatrix"];
			mat4holder.set(worldView.elements);
			gl.uniformMatrix4fv(lModelView, false, mat4holder);

			//Clip Polygons
			if(material.clipPolygons && material.clipPolygons.length > 0)
			{

				var clipPolygonVCount = [];
				var worldViewProjMatrices = [];

				for(var clipPolygon of material.clipPolygons)
				{
					var view = clipPolygon.viewMatrix;
					var proj = clipPolygon.projMatrix;

					var worldViewProj = proj.clone().multiply(view).multiply(world);

					clipPolygonVCount.push(clipPolygon.markers.length);
					worldViewProjMatrices.push(worldViewProj);
				}

				var flattenedMatrices = [].concat(...worldViewProjMatrices.map(m => m.elements));

				var flattenedVertices = new Array(8 * 3 * material.clipPolygons.length);
				for(var i = 0; i < material.clipPolygons.length; i++)
				{
					var clipPolygon = material.clipPolygons[i];
					for(var j = 0; j < clipPolygon.markers.length; j++)
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

				var bindingStart = 5;
				var bindingPoints = new Array(shadowMaps.length).fill(bindingStart).map((a, i) => (a + i));
				gl.uniform1iv(lShadowMap, bindingPoints);

				for(var i = 0; i < shadowMaps.length; i++)
				{
					var shadowMap = shadowMaps[i];
					var bindingPoint = bindingPoints[i];
					var glTexture = renderer.properties.get(shadowMap.target.texture).__webglTexture;

					gl.activeTexture(gl[`TEXTURE${bindingPoint}`]);
					gl.bindTexture(gl.TEXTURE_2D, glTexture);
				}

				var worldViewMatrices = shadowMaps.map(sm => sm.camera.matrixWorldInverse).map(view => new THREE.Matrix4().multiplyMatrices(view, world))

				var flattenedMatrices = [].concat(...worldViewMatrices.map(c => c.elements));
				const lWorldView = shader.uniformLocations["uShadowWorldView[0]"];
				gl.uniformMatrix4fv(lWorldView, false, flattenedMatrices);

				flattenedMatrices = [].concat(...shadowMaps.map(sm => sm.camera.projectionMatrix.elements));
				const lProj = shader.uniformLocations["uShadowProj[0]"];
				gl.uniformMatrix4fv(lProj, false, flattenedMatrices);
			}

			var geometry = node.geometryNode.geometry;

			var webglBuffer = null;
			if(!this.buffers.has(geometry))
			{
				webglBuffer = this.createBuffer(gl, geometry);
				this.buffers.set(geometry, webglBuffer);
			}
			else
			{
				webglBuffer = this.buffers.get(geometry);
				for(var attributeName in geometry.attributes)
				{
					var attribute = geometry.attributes[attributeName];
					if(attribute.version > webglBuffer.vbos.get(attributeName).version)
					{
						this.updateBuffer(gl, geometry);
					}
				}
			}

			gl.bindVertexArray(webglBuffer.vao);

			var numPoints = webglBuffer.numElements;
			gl.drawArrays(gl.POINTS, 0, numPoints);
		}

		gl.bindVertexArray(null);
	}

	renderOctree(renderer, octree, nodes, camera)
	{
		var gl = renderer.context;
		var material = octree.material;
		var shadowMaps = [];
		var view = camera.matrixWorldInverse;
		var viewInv = camera.matrixWorld;
		var proj = camera.projectionMatrix;
		var projInv = new THREE.Matrix4().getInverse(proj);
		var worldView = new THREE.Matrix4();

		var shader = null;
		var visibilityTextureData = null;

		var currentTextureBindingPoint = 0;

		if(material.pointSizeType >= 0)
		{
			if(material.pointSizeType === Potree.PointSizeType.ADAPTIVE || material.pointColorType === Potree.PointColorType.LOD)
			{
				var vnNodes = nodes;
				visibilityTextureData = octree.computeVisibilityTextureData(vnNodes, camera);

				const vnt = material.visibleNodesTexture;
				const data = vnt.image.data;
				data.set(visibilityTextureData.data);
				vnt.needsUpdate = true;
			}
		}

		if(!this.shaders.has(material))
		{
			var [vs, fs] = [material.vertexShader, material.fragmentShader];
			var shader = new Potree.Shader(gl, "pointcloud", vs, fs);
			this.shaders.set(material, shader);
		}

		shader = this.shaders.get(material);

		var vs = material.vertexShader;
		var fs = material.fragmentShader;

		var numSnapshots = material.snapEnabled ? material.numSnapshots : 0;
		var numClipBoxes = (material.clipBoxes && material.clipBoxes.length) ? material.clipBoxes.length : 0;
		var numClipPolygons = (material.clipPolygons && material.clipPolygons.length) ? material.clipPolygons.length : 0;
		var numClipSpheres = 0;

		var defines = [
			"#define num_shadowmaps" + shadowMaps.length,
			"#define num_snapshots" + numSnapshots,
			"#define num_clipboxes" + numClipBoxes,
			"#define num_clipspheres" + numClipSpheres,
			"#define num_clippolygons" + numClipPolygons,
		];

		var definesString = defines.join("\n");

		vs = `${definesString}\n${vs}`;
		fs = `${definesString}\n${fs}`;

		shader.update(vs, fs);

		material.needsUpdate = false;

		for(var uniformName of Object.keys(material.uniforms))
		{
			var uniform = material.uniforms[uniformName];

			if(uniform.type == "t")
			{
				var texture = uniform.value;

				if(!texture)
				{
					continue;
				}

				if(!this.textures.has(texture))
				{
					var webglTexture = new Potree.WebGLTexture(gl, texture);
					this.textures.set(texture, webglTexture);
				}

				var webGLTexture = this.textures.get(texture);
				webGLTexture.update();
			}
		}

		gl.useProgram(shader.program);

		var transparent = material.opacity < 1;

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

		//Update shader uniforms
		shader.setUniformMatrix4("projectionMatrix", proj);
		shader.setUniformMatrix4("viewMatrix", view);
		shader.setUniformMatrix4("uViewInv", viewInv);
		shader.setUniformMatrix4("uProjInv", projInv);

		var screenWidth = material.screenWidth;
		var screenHeight = material.screenHeight;

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
		/*if(params.clipSpheres && params.clipSpheres.length > 0)
		{
			var clipSpheres = params.clipSpheres;
			var matrices = [];
			for(var clipSphere of clipSpheres)
			{
				var clipToWorld = clipSphere.matrixWorld;
				var viewToWorld = camera.matrixWorld
				var worldToClip = new THREE.Matrix4().getInverse(clipToWorld);

				var viewToClip = new THREE.Matrix4().multiplyMatrices(worldToClip, viewToWorld);

				matrices.push(viewToClip);
			}

			var flattenedMatrices = [].concat(...matrices.map(matrix => matrix.elements));

			const lClipSpheres = shader.uniformLocations["uClipSpheres[0]"];
			gl.uniformMatrix4fv(lClipSpheres, false, flattenedMatrices);
		}*/

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

		var vnWebGLTexture = this.textures.get(material.visibleNodesTexture);
		shader.setUniform1i("visibleNodesTexture", currentTextureBindingPoint);
		gl.activeTexture(gl.TEXTURE0 + currentTextureBindingPoint);
		gl.bindTexture(vnWebGLTexture.target, vnWebGLTexture.id);
		currentTextureBindingPoint++;

		var gradientTexture = this.textures.get(material.gradientTexture);
		shader.setUniform1i("gradient", currentTextureBindingPoint);
		gl.activeTexture(gl.TEXTURE0 + currentTextureBindingPoint);
		gl.bindTexture(gradientTexture.target, gradientTexture.id);
		currentTextureBindingPoint++;

		var classificationTexture = this.textures.get(material.classificationTexture);
		shader.setUniform1i("classificationLUT", currentTextureBindingPoint);
		gl.activeTexture(gl.TEXTURE0 + currentTextureBindingPoint);
		gl.bindTexture(classificationTexture.target, classificationTexture.id);
		currentTextureBindingPoint++;

		if(material.snapEnabled === true)
		{
			const lSnapshot = shader.uniformLocations["uSnapshot[0]"];
			const lSnapshotDepth = shader.uniformLocations["uSnapshotDepth[0]"];

			var bindingStart = currentTextureBindingPoint;
			var lSnapshotBindingPoints = new Array(5).fill(bindingStart).map((a, i) => (a + i));
			var lSnapshotDepthBindingPoints = new Array(5).fill(1 + Math.max(...lSnapshotBindingPoints)).map((a, i) => (a + i));
			currentTextureBindingPoint = 1 + Math.max(...lSnapshotDepthBindingPoints);

			gl.uniform1iv(lSnapshot, lSnapshotBindingPoints);
			gl.uniform1iv(lSnapshotDepth, lSnapshotDepthBindingPoints);

			for(var i = 0; i < 5; i++)
			{
				var texture = material.uniforms["uSnapshot"].value[i];
				var textureDepth = material.uniforms["uSnapshotDepth"].value[i];

				if(!texture)
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

			var flattenedMatrices = [].concat(...material.uniforms.uSnapView.value.map(c => c.elements));
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

		this.renderNodes(renderer, octree, nodes, visibilityTextureData, camera, shader);

		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.activeTexture(gl.TEXTURE0);
	}
};
