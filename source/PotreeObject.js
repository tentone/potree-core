"use strict";

/*
 * Potree object is a wrapper to use Potree alongside other THREE based frameworks.
 * 
 * The object can be used a normal Object3D.
 */
class PotreeObject extends THREE.EventDispatcher
{
	constructor()
	{
		super();

		this.useEDL = false;
		this.useRep = false;
		this.useHQ = false;

		this.fov = 60;
		this.generateDEM = false;
		this.minNodeSize = 30;
		this.edlStrength = 1.0;
		this.edlRadius = 1.4;
		this.classifications = [];

		this.moveSpeed = 10;

		this.LENGTH_UNITS =
		{
			METER: {code: "m"},
			FEET: {code: "ft"},
			INCH: {code: "\u2033"}
		};
		this.lengthUnit = this.LENGTH_UNITS.METER;

		this.showBoundingBox = false;
		this.clipTask = Potree.ClipTask.HIGHLIGHT;
		this.clipMethod = Potree.ClipMethod.INSIDE_ANY;

		this.potreeRenderer = null;
		this.edlRenderer = null;
		this.renderer = null;
		this.pRenderer = null;

		this.scene = null;

		this.inputHandler = null;

		this.clippingTool =  null;
		this.transformationTool = null;
		this.navigationCube = null;
		
		this.skybox = null;
		this.clock = new THREE.Clock();
		this.background = null;

		this.createRenderer();

		this.pRenderer = new Potree.Renderer(this.renderer);
		
		var near = 2.5;
		var far = 10.0;
		var fov = 90;
		
		this.shadowTestCam = new THREE.PerspectiveCamera(90, 1, near, far);
		this.shadowTestCam.position.set(3.50, -2.80, 8.561);
		this.shadowTestCam.lookAt(new THREE.Vector3(0, 0, 4.87));
		
		var scene = new Potree.Scene(this.renderer);
		this.setScene(scene);

		this.inputHandler = new Potree.InputHandler(this);
		this.inputHandler.setScene(this.scene);

		this.clippingTool = new Potree.ClippingTool(this);
		this.transformationTool = new Potree.TransformationTool(this);
		this.navigationCube = new Potree.NavigationCube(this);
		this.navigationCube.visible = false;
		
		this.createControls();

		this.clippingTool.setScene(this.scene);
		
		//Default values
		this.setFOV(60);
		this.setEDLEnabled(false);
		this.setEDLRadius(1.4);
		this.setEDLStrength(0.4);
		this.setClipTask(Potree.ClipTask.HIGHLIGHT);
		this.setClipMethod(Potree.ClipMethod.INSIDE_ANY);
		this.setPointBudget(1*1000*1000);
		this.setShowBoundingBox(false);
		this.setNavigationMode(Potree.OrbitControls);
		this.setBackground("gradient");
		this.scaleFactor = 1;
	}

	setScene(scene)
	{
		if(scene === this.scene)
		{
			return;
		}

		var oldScene = this.scene;
		this.scene = scene;

		this.dispatchEvent({
			type: "scene_changed",
			oldScene: oldScene,
			scene: scene
		});

		if(!this.onAnnotationAdded)
		{
			this.onAnnotationAdded = e =>
			{
				e.annotation.traverse(node =>
				{
					node.scene = this.scene;
				});
			};
		}

		if(oldScene)
		{
			oldScene.annotations.removeEventListener("annotation_added", this.onAnnotationAdded);
		}
		this.scene.annotations.addEventListener("annotation_added", this.onAnnotationAdded);
	}

	getControls(navigationMode)
	{
		if(navigationMode === Potree.OrbitControls)
		{
			return this.orbitControls;
		}
		else if(navigationMode === Potree.FirstPersonControls)
		{
			return this.fpControls;
		}
		else if(navigationMode === Potree.EarthControls)
		{
			return this.earthControls;
		}
		else
		{
			return null;
		}
	}

	getMinNodeSize()
	{
		return this.minNodeSize;
	}

	setMinNodeSize(value)
	{
		if(this.minNodeSize !== value)
		{
			this.minNodeSize = value;
			this.dispatchEvent({"type": "minnodesize_changed", "viewer": this});
		}
	}

	getBackground()
	{
		return this.background;
	}

	setBackground(bg)
	{
		if(this.background === bg)
		{
			return;
		}

		if(bg === "skybox")
		{
			this.skybox = Potree.utils.loadSkybox(new URL(Potree.resourcePath + "/textures/skybox2/").href);
		}

		this.background = bg;
		this.dispatchEvent({"type": "background_changed", "viewer": this});
	}

	setNavigationMode(value)
	{
		this.scene.view.navigationMode = value;
	}

	setShowBoundingBox(value)
	{
		if(this.showBoundingBox !== value)
		{
			this.showBoundingBox = value;
			this.dispatchEvent({"type": "show_boundingbox_changed", "viewer": this});
		}
	}

	getShowBoundingBox()
	{
		return this.showBoundingBox;
	}

	setMoveSpeed(value)
	{
		if(this.moveSpeed !== value)
		{
			this.moveSpeed = value;
			this.dispatchEvent({"type": "move_speed_changed", "viewer": this, "speed": value});
		}
	}

	getMoveSpeed()
	{
		return this.moveSpeed;
	}

	setWeightClassification(w)
	{
		for(var i = 0; i < this.scene.pointclouds.length; i++)
		{
			this.scene.pointclouds[i].material.weightClassification = w;
			this.dispatchEvent({"type": "attribute_weights_changed" + i, "viewer": this});
		}
	}

	getClipTask()
	{
		return this.clipTask;
	}

	getClipMethod()
	{
		return this.clipMethod;
	}

	setClipTask(value)
	{
		if(this.clipTask !== value)
		{
			this.clipTask = value;

			this.dispatchEvent({type: "cliptask_changed", viewer: this});		
		}
	}

	setClipMethod(value)
	{
		if(this.clipMethod !== value)
		{
			this.clipMethod = value;
			
			this.dispatchEvent({type: "clipmethod_changed", viewer: this});		
		}
	}

	setPointBudget(value)
	{
		if(Potree.pointBudget !== value)
		{
			Potree.pointBudget = parseInt(value);
			this.dispatchEvent({"type": "point_budget_changed", "viewer": this});
		}
	};

	getPointBudget()
	{
		return Potree.pointBudget;
	};

	setEDLEnabled(value)
	{
		value = Boolean(value);
		if(this.useEDL !== value)
		{
			this.useEDL = value;
			this.dispatchEvent({"type": "use_edl_changed", "viewer": this});
		}
	}

	getEDLEnabled()
	{
		return this.useEDL;
	}

	setEDLRadius(value)
	{
		if(this.edlRadius !== value)
		{
			this.edlRadius = value;
			this.dispatchEvent({"type": "edl_radius_changed", "viewer": this});
		}
	}

	getEDLRadius()
	{
		return this.edlRadius;
	}

	setEDLStrength(value)
	{
		if(this.edlStrength !== value)
		{
			this.edlStrength = value;
			this.dispatchEvent({"type": "edl_strength_changed", "viewer": this});
		}
	}

	getEDLStrength()
	{
		return this.edlStrength;
	}

	setFOV(value)
	{
		if(this.fov !== value)
		{
			this.fov = value;
			this.dispatchEvent({"type": "fov_changed", "viewer": this});
		}
	}

	getFOV()
	{
		return this.fov;
	}

	setClassificationVisibility(key, value)
	{
		if(!this.classifications[key])
		{
			this.classifications[key] = {visible: value, name: "no name"};
			this.dispatchEvent({"type": "classification_visibility_changed", "viewer": this});
		}
		else if(this.classifications[key].visible !== value)
		{
			this.classifications[key].visible = value;
			this.dispatchEvent({"type": "classification_visibility_changed", "viewer": this});
		}
	}

	setLengthUnit(value)
	{
		switch(value)
		{
			case "m":
				this.lengthUnit = this.LENGTH_UNITS.METER;
				break;
			case "ft":
				this.lengthUnit = this.LENGTH_UNITS.FEET;
				break;
			case "in":
				this.lengthUnit = this.LENGTH_UNITS.INCH;
				break;
		}

		this.dispatchEvent({"type": "length_unit_changed", "viewer": this, value: value});
	}

	zoomTo(node, factor, animationDuration = 0)
	{
		var view = this.scene.view;

		var camera = this.scene.cameraP.clone();
		camera.rotation.copy(this.scene.cameraP.rotation);
		camera.rotation.order = "ZXY";
		camera.rotation.x = Math.PI / 2 + view.pitch;
		camera.rotation.z = view.yaw;
		camera.updateMatrix();
		camera.updateMatrixWorld();
		camera.zoomTo(node, factor);

		var bs;
		if(node.boundingSphere)
		{
			bs = node.boundingSphere;
		}
		else if(node.geometry && node.geometry.boundingSphere)
		{
			bs = node.geometry.boundingSphere;
		}
		else
		{
			bs = node.boundingBox.getBoundingSphere();
		}
		bs = bs.clone().applyMatrix4(node.matrixWorld); 

		var startPosition = view.position.clone();
		var endPosition = camera.position.clone();
		var startTarget = view.getPivot();
		var endTarget = bs.center;
		var startRadius = view.radius;
		var endRadius = endPosition.distanceTo(endTarget);

		var easing = TWEEN.Easing.Quartic.Out;

		//Animate camera position
		var pos = startPosition.clone();
		var tween = new TWEEN.Tween(pos).to(endPosition, animationDuration);
		tween.easing(easing);
		tween.onUpdate(() =>
		{
			view.position.copy(pos);
		});

		tween.start();

		//Animate camera target
		var target = startTarget.clone();
		var tween = new TWEEN.Tween(target).to(endTarget, animationDuration);
		tween.easing(easing);
		tween.onUpdate(() =>
		{
			view.lookAt(target);
		});
		tween.onComplete(() =>
		{
			view.lookAt(target);
			this.dispatchEvent({type: "focusing_finished", target: this});
		});

		this.dispatchEvent({type: "focusing_started", target: this});
		tween.start();
	}

	getBoundingBox(pointclouds)
	{
		return this.scene.getBoundingBox(pointclouds);
	}

	fitToScreen(factor = 1, animationDuration = 0)
	{
		var box = this.getBoundingBox(this.scene.pointclouds);

		var node = new THREE.Object3D();
		node.boundingBox = box;

		this.zoomTo(node, factor, animationDuration);
		this.controls.stop();
	};

	toggleNavigationCube()
	{
		this.navigationCube.visible = !this.navigationCube.visible;
	}

	setCameraMode(mode)
	{
		this.scene.cameraMode = mode;

		for(var pointcloud of this.scene.pointclouds)
		{
			pointcloud.material.useOrthographicCamera = mode == Potree.CameraMode.ORTHOGRAPHIC;
		}
	}

	createControls()
	{
		//Create FIRST PERSON CONTROLS
		this.fpControls = new Potree.FirstPersonControls(this);
		this.fpControls.enabled = false;

		//Create ORBIT CONTROLS
		this.orbitControls = new Potree.OrbitControls(this);
		this.orbitControls.enabled = false;

		//Create EARTH CONTROLS
		this.earthControls = new Potree.EarthControls(this);
		this.earthControls.enabled = false;
	};

	toggleMap()
	{
		if(this.mapView)
		{
			this.mapView.toggle();
		}
	};

	createRenderer()
	{
		var width = window.innerWidth;
		var height = window.innerHeight;

		this.renderer = new THREE.WebGLRenderer({alpha: true, premultipliedAlpha: false});
		this.renderer.sortObjects = true;
		this.renderer.setSize(width, height);
		this.renderer.autoClear = false;
		this.renderer.domElement.style.position = "absolute";
		this.renderer.domElement.style.top = "0px";
		this.renderer.domElement.style.bottom = "0px";
		document.body.appendChild(this.renderer.domElement);

		//Enable frag_depth extension for the interpolation shader, if available
		var gl = this.renderer.context;
		gl.getExtension("EXT_frag_depth");
		gl.getExtension("WEBGL_depth_texture");
		
		var extVAO = gl.getExtension("OES_vertex_array_object");
		gl.createVertexArray = extVAO.createVertexArrayOES.bind(extVAO);
		gl.bindVertexArray = extVAO.bindVertexArrayOES.bind(extVAO);		
	}

	updateAnnotations()
	{
		if(!this.visibleAnnotations)
		{
			this.visibleAnnotations = new Set();
		}

		this.scene.annotations.updateBounds();
		this.scene.cameraP.updateMatrixWorld();
		this.scene.cameraO.updateMatrixWorld();
		
		var distances = [];

		var renderAreaWidth = this.renderer.getSize().width;
		var renderAreaHeight = this.renderer.getSize().height;

		var viewer = this;

		var visibleNow = [];
		this.scene.annotations.traverse(annotation => {

			if(annotation === this.scene.annotations)
			{
				return true;
			}

			if(!annotation.visible)
			{
				return false;
			}

			annotation.scene = this.scene;

			var element = annotation.domElement;

			var position = annotation.position;
			if(!position)
			{
				position = annotation.boundingBox.getCenter();
			}

			var distance = viewer.scene.cameraP.position.distanceTo(position);
			var radius = annotation.boundingBox.getBoundingSphere().radius;

			var screenPos = new THREE.Vector3();
			var screenSize = 0;

			//Screen position
			screenPos.copy(position).project(this.scene.getActiveCamera());
			screenPos.x = renderAreaWidth * (screenPos.x + 1) / 2;
			screenPos.y = renderAreaHeight * (1 - (screenPos.y + 1) / 2);

			//Screen size
			if(viewer.scene.cameraMode == Potree.CameraMode.PERSPECTIVE)
			{
				var fov = Math.PI * viewer.scene.cameraP.fov / 180;
				var slope = Math.tan(fov / 2.0);
				var projFactor =  0.5 * renderAreaHeight / (slope * distance);
				screenSize = radius * projFactor;
			}
			else
			{
				screenSize = Potree.utils.projectedRadiusOrtho(radius, viewer.scene.cameraO.projectionMatrix, renderAreaWidth, renderAreaHeight);
			}

			element.css("left", screenPos.x + "px");
			element.css("top", screenPos.y + "px");

			var zIndex = 10000000 - distance * (10000000 / this.scene.cameraP.far);
			if(annotation.descriptionVisible)
			{
				zIndex += 10000000;
			}
			element.css("z-index", parseInt(zIndex));

			if(annotation.children.length > 0)
			{
				var expand = screenSize > annotation.collapseThreshold || annotation.boundingBox.containsPoint(this.scene.getActiveCamera().position);
				annotation.expand = expand;

				if(!expand)
				{
					var inFrustum = (screenPos.z >= -1 && screenPos.z <= 1);
					if(inFrustum)
					{
						visibleNow.push(annotation);
					}
				}

				return expand;
			}
			else
			{
				var inFrustum = (screenPos.z >= -1 && screenPos.z <= 1);
				if(inFrustum)
				{
					visibleNow.push(annotation);
				}
			}
		});

		var notVisibleAnymore = new Set(this.visibleAnnotations);
		for(var annotation of visibleNow)
		{
			annotation.display = true;
			notVisibleAnymore.delete(annotation);
		}

		this.visibleAnnotations = visibleNow;

		for(var annotation of notVisibleAnymore)
		{
			annotation.display = false;
		}
	}

	update(delta, timestamp)
	{
		var u = Math.sin(0.0005 * timestamp) * 0.5 - 0.4;
		var x = Math.cos(u);
		var y = Math.sin(u);
		
		this.shadowTestCam.position.set(7 * x, 7 * y, 8.561);
		this.shadowTestCam.lookAt(new THREE.Vector3(0, 0, 0));

		var scene = this.scene;
		var camera = scene.getActiveCamera();
		
		Potree.pointLoadLimit = Potree.pointBudget * 2;

		this.scene.directionalLight.position.copy(camera.position);
		this.scene.directionalLight.lookAt(new THREE.Vector3().addVectors(camera.position, camera.getWorldDirection()));

		for(var pointcloud of this.scene.pointclouds)
		{
			if(!pointcloud.material._defaultIntensityRangeChanged)
			{
				var root = pointcloud.pcoGeometry.root;
				if(root != null && root.loaded)
				{
					var attributes = pointcloud.pcoGeometry.root.geometry.attributes;
					if(attributes.intensity)
					{
						var array = attributes.intensity.array;

						//Chose max value from the 0.75 percentile
						var ordered = [];
						for(var j = 0; j < array.length; j++)
						{
							ordered.push(array[j]);
						}
						ordered.sort();
						var capIndex = parseInt((ordered.length - 1) * 0.75);
						var cap = ordered[capIndex];

						if(cap <= 1)
						{
							pointcloud.material.intensityRange = [0, 1];
						}
						else if(cap <= 256)
						{
							pointcloud.material.intensityRange = [0, 255];
						}
						else
						{
							pointcloud.material.intensityRange = [0, cap];
						}
					}
				}
			}
			
			pointcloud.showBoundingBox = this.showBoundingBox;
			pointcloud.generateDEM = this.generateDEM;
			pointcloud.minimumNodePixelSize = this.minNodeSize;
		}

		//Update classification visibility
		for(var pointcloud of this.scene.pointclouds)
		{
			var classification = pointcloud.material.classification;
			var somethingChanged = false;
			for(var key of Object.keys(this.classifications))
			{
				var w = this.classifications[key].visible ? 1 : 0;

				if(classification[key])
				{
					if(classification[key].w !== w)
					{
						classification[key].w = w;
						somethingChanged = true;
					}
				}
				else if(classification.DEFAULT)
				{
					classification[key] = classification.DEFAULT;
					somethingChanged = true;
				}
				else
				{
					classification[key] = new THREE.Vector4(0.3, 0.6, 0.6, 0.5);
					somethingChanged = true;
				}
			}

			if(somethingChanged)
			{
				pointcloud.material.recomputeClassification();
			}
		}

		if(this.showBoundingBox)
		{
			var bbRoot = this.scene.scene.getObjectByName("potree_bounding_box_root");
			if(!bbRoot)
			{
				var node = new THREE.Object3D();
				node.name = "potree_bounding_box_root";
				this.scene.scene.add(node);
				bbRoot = node;
			}

			var visibleBoxes = [];
			for(var pointcloud of this.scene.pointclouds)
			{
				for(var node of pointcloud.visibleNodes.filter(vn => vn.boundingBoxNode !== undefined))
				{
					var box = node.boundingBoxNode;
					visibleBoxes.push(box);
				}
			}

			bbRoot.children = visibleBoxes;
		}

		var result = Potree.updatePointClouds(scene.pointclouds, camera, this.renderer);

		if(result.lowestSpacing !== Infinity)
		{
			var near = result.lowestSpacing * 10.0;
			var far = -this.getBoundingBox().applyMatrix4(camera.matrixWorldInverse).min.z;

			far = Math.max(far * 1.5, 1000);
			near = Math.min(100.0, Math.max(0.01, near));
			far = Math.max(far, near + 1000);

			if(near === Infinity)
			{
				near = 0.1;
			}
			
			camera.near = near;
			camera.far = far;
		}

		if(this.scene.cameraMode == Potree.CameraMode.ORTHOGRAPHIC)
		{
			camera.near = -camera.far;
		}
		
		this.scene.cameraP.fov = this.fov;
		
		//Navigation mode changed
		if(this.getControls(scene.view.navigationMode) !== this.controls)
		{
			if(this.controls)
			{
				this.controls.enabled = false;
				this.inputHandler.removeInputListener(this.controls);
			}

			this.controls = this.getControls(scene.view.navigationMode);
			this.controls.enabled = true;
			this.inputHandler.addInputListener(this.controls);
		}
		
		if(this.controls !== null)
		{
			this.controls.setScene(scene);
			this.controls.update(delta);

			this.scene.cameraP.position.copy(scene.view.position);
			this.scene.cameraP.rotation.order = "ZXY";
			this.scene.cameraP.rotation.x = Math.PI / 2 + this.scene.view.pitch;
			this.scene.cameraP.rotation.z = this.scene.view.yaw;

			this.scene.cameraO.position.copy(scene.view.position);
			this.scene.cameraO.rotation.order = "ZXY";
			this.scene.cameraO.rotation.x = Math.PI / 2 + this.scene.view.pitch;
			this.scene.cameraO.rotation.z = this.scene.view.yaw;
		}
		
		camera.updateMatrix();
		camera.updateMatrixWorld();
		camera.matrixWorldInverse.getInverse(camera.matrixWorld);

		if(this._previousCamera === undefined)
		{
			this._previousCamera = this.scene.getActiveCamera().clone();
			this._previousCamera.rotation.copy(this.scene.getActiveCamera());
		}

		if(!this._previousCamera.matrixWorld.equals(camera.matrixWorld) || !this._previousCamera.projectionMatrix.equals(camera.projectionMatrix))
		{
			this.dispatchEvent({type: "camera_changed", previous: this._previousCamera, camera: camera});
		}

		this._previousCamera = this.scene.getActiveCamera().clone();
		this._previousCamera.rotation.copy(this.scene.getActiveCamera());

		//Update clip boxes
		var boxes = [];
		
		//Volumes with clipping enabled
		boxes.push(...this.scene.volumes.filter(v => v.clip));

		//Profile segments
		for(var profile of this.scene.profiles)
		{
			boxes.push(...profile.boxes);
		}
		
		var clipBoxes = boxes.map(box => {
			box.updateMatrixWorld();
			var boxInverse = new THREE.Matrix4().getInverse(box.matrixWorld);
			var boxPosition = box.getWorldPosition();
			return {box: box, inverse: boxInverse, position: boxPosition};
		});

		var clipPolygons = this.scene.polygonClipVolumes.filter(vol => vol.initialized);
		
		//Set clip volumes in material
		for(var pointcloud of this.scene.pointclouds.filter(pc => pc.visible))
		{
			pointcloud.material.setClipBoxes(clipBoxes);
			pointcloud.material.setClipPolygons(clipPolygons, this.clippingTool.maxPolygonVertices);
			pointcloud.material.clipTask = this.clipTask;
			pointcloud.material.clipMethod = this.clipMethod;
		}

		//Update navigation cube
		this.navigationCube.update(camera.rotation);

		this.updateAnnotations();
		
		if(this.mapView)
		{
			this.mapView.update(delta);
		}

		TWEEN.update(timestamp);

		this.dispatchEvent({type: "update", delta: delta, timestamp: timestamp});
	}
	
	render()
	{
		if(this.useRep)
		{
			if(!this.repRenderer)
			{
				this.repRenderer = new RepRenderer(this);
			}
			this.repRenderer.render(this.renderer);
		}
		else if(this.useHQ)
		{
			if(!this.hqRenderer)
			{
				this.hqRenderer = new HQSplatRenderer(this);
			}
			this.hqRenderer.useEDL = this.useEDL;
			this.hqRenderer.render(this.renderer);
		}
		else
		{
			if(this.useEDL && Potree.Features.SHADER_EDL.isSupported())
			{
				if(!this.edlRenderer)
				{
					this.edlRenderer = new EDLRenderer(this);
				}
				this.edlRenderer.render(this.renderer);
			}
			else
			{
				if(!this.potreeRenderer)
				{
					this.potreeRenderer = new PotreeRenderer(this);
				}
				this.potreeRenderer.render();
			}
		}
	}

	resize()
	{
		var width = this.scaleFactor * window.innerWidth;
		var height = this.scaleFactor * window.innerHeight;

		var pixelRatio = this.renderer.getPixelRatio();
		var aspect = width / height;

		this.scene.cameraP.aspect = aspect;
		this.scene.cameraP.updateProjectionMatrix();

		var frustumScale = this.scene.view.radius;
		this.scene.cameraO.left = -frustumScale;
		this.scene.cameraO.right = frustumScale;		
		this.scene.cameraO.top = frustumScale * 1 / aspect;
		this.scene.cameraO.bottom = -frustumScale * 1 / aspect;		
		this.scene.cameraO.updateProjectionMatrix();

		this.scene.cameraScreenSpace.top = 1/aspect;
		this.scene.cameraScreenSpace.bottom = -1/aspect;
		this.scene.cameraScreenSpace.updateProjectionMatrix();
		
		this.renderer.setSize(width, height);
	}
}
