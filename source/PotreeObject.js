"use strict";

class PotreeObject extends THREE.EventDispatcher
{
	constructor(domElement, args = {}){
		super();

		this.renderArea = domElement;
		this.guiLoaded = false;	
		this.guiLoadTasks = [];

		this.messages = [];

		this.pointCloudLoadedCallback = args.onPointCloudLoaded || function(){};

		this.server = null;

		this.fov = 60;
		this.isFlipYZ = false;
		this.useDEMCollisions = false;
		this.generateDEM = false;
		this.minNodeSize = 30;
		this.edlStrength = 1.0;
		this.edlRadius = 1.4;
		this.useEDL = false;
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
		this.showAnnotations = true;
		this.freeze = false;
		this.clipTask = Potree.ClipTask.HIGHLIGHT;
		this.clipMethod = Potree.ClipMethod.INSIDE_ANY;

		this.potreeRenderer = null;
		this.edlRenderer = null;
		this.renderer = null;
		this.pRenderer = null;

		this.scene = null;
		this.overlay = null;
		this.overlayCamera = null;

		this.inputHandler = null;

		this.clippingTool =  null;
		this.transformationTool = null;
		this.navigationCube = null;
		
		this.skybox = null;
		this.clock = new THREE.Clock();
		this.background = null;

		this.initThree();

		this.overlay = new THREE.Scene();
		this.overlayCamera = new THREE.OrthographicCamera(0, 1, 1, 0, -1000, 1000);
		
		this.pRenderer = new Potree.Renderer(this.renderer);
		
		let near = 2.5;
		let far = 10.0;
		let fov = 90;
		
		this.shadowTestCam = new THREE.PerspectiveCamera(90, 1, near, far);
		this.shadowTestCam.position.set(3.50, -2.80, 8.561);
		this.shadowTestCam.lookAt(new THREE.Vector3(0, 0, 4.87));
		
		let scene = new Potree.Scene(this.renderer);
		this.setScene(scene);

		this.inputHandler = new Potree.InputHandler(this);
		this.inputHandler.setScene(this.scene);

		this.clippingTool = new Potree.ClippingTool(this);
		this.transformationTool = new Potree.TransformationTool(this);
		this.navigationCube = new Potree.NavigationCube(this);
		this.navigationCube.visible = false;
		
		this.createControls();

		this.clippingTool.setScene(this.scene);
		
		let onPointcloudAdded = (e) => {
			if(this.scene.pointclouds.length === 1) {
				let speed = e.pointcloud.boundingBox.getSize().length();
				speed = speed / 5;
				this.setMoveSpeed(speed);
			}
		};

		let onVolumeRemoved = (e) => {
			this.inputHandler.deselect(e.volume);
		};

		this.addEventListener("scene_changed", (e) => {
			this.inputHandler.setScene(e.scene);
			this.clippingTool.setScene(this.scene);
			
			if(!e.scene.hasEventListener("pointcloud_added", onPointcloudAdded)){
				e.scene.addEventListener("pointcloud_added", onPointcloudAdded);
			}

			if(!e.scene.hasEventListener("volume_removed", onPointcloudAdded)){
				e.scene.addEventListener("volume_removed", onVolumeRemoved);
			}
			
		});

		this.scene.addEventListener("volume_removed", onVolumeRemoved);
		this.scene.addEventListener("pointcloud_added", onPointcloudAdded);

		//Set defaults
		this.setFOV(60);
		this.setEDLEnabled(false);
		this.setEDLRadius(1.4);
		this.setEDLStrength(0.4);
		this.setClipTask(Potree.ClipTask.HIGHLIGHT);
		this.setClipMethod(Potree.ClipMethod.INSIDE_ANY);
		this.setPointBudget(1*1000*1000);
		this.setShowBoundingBox(false);
		this.setFreeze(false);
		this.setNavigationMode(Potree.OrbitControls);
		this.setBackground("gradient");
		this.scaleFactor = 1;
	}


	// ------------------------------------------------------------------------------------
	// Viewer API
	// ------------------------------------------------------------------------------------

	setScene (scene) {
		if(scene === this.scene) {
			return;
		}

		let oldScene = this.scene;
		this.scene = scene;

		this.dispatchEvent({
			type: "scene_changed",
			oldScene: oldScene,
			scene: scene
		});

		{ // Annotations
			$(".annotation").detach();

			// for(let annotation of this.scene.annotations){
			//	this.renderArea.appendChild(annotation.domElement[0]);
			// }

			this.scene.annotations.traverse(annotation => {
				this.renderArea.appendChild(annotation.domElement[0]);
			});

			if(!this.onAnnotationAdded) {
				this.onAnnotationAdded = e => {
				// console.log("annotation added: " + e.annotation.title);

					e.annotation.traverse(node => {

						$("#potree_annotation_container").append(node.domElement);
						//this.renderArea.appendChild(node.domElement[0]);
						node.scene = this.scene;
					});
				};
			}

			if(oldScene) {
				oldScene.annotations.removeEventListener("annotation_added", this.onAnnotationAdded);
			}
			this.scene.annotations.addEventListener("annotation_added", this.onAnnotationAdded);
		}
	};

	getControls (navigationMode) {
		if(navigationMode === Potree.OrbitControls) {
			return this.orbitControls;
		} else if(navigationMode === Potree.FirstPersonControls) {
			return this.fpControls;
		} else if(navigationMode === Potree.EarthControls) {
			return this.earthControls;
		} else {
			return null;
		}
	}

	getMinNodeSize () {
		return this.minNodeSize;
	};

	setMinNodeSize (value) {
		if(this.minNodeSize !== value) {
			this.minNodeSize = value;
			this.dispatchEvent({"type": "minnodesize_changed", "viewer": this});
		}
	};

	getBackground () {
		return this.background;
	};

	setBackground(bg){
		if(this.background === bg) {
			return;
		}

		if(bg === "skybox"){
			this.skybox = Potree.utils.loadSkybox(new URL(Potree.resourcePath + "/textures/skybox2/").href);
		}

		this.background = bg;
		this.dispatchEvent({"type": "background_changed", "viewer": this});
	}

	setNavigationMode (value) {
		this.scene.view.navigationMode = value;
	};

	setShowBoundingBox (value) {
		if(this.showBoundingBox !== value) {
			this.showBoundingBox = value;
			this.dispatchEvent({"type": "show_boundingbox_changed", "viewer": this});
		}
	};

	getShowBoundingBox () {
		return this.showBoundingBox;
	};

	setMoveSpeed (value) {
		if(this.moveSpeed !== value) {
			this.moveSpeed = value;
			this.dispatchEvent({"type": "move_speed_changed", "viewer": this, "speed": value});
		}
	};

	getMoveSpeed () {
		return this.moveSpeed;
	};

	setWeightClassification (w) {
		for(let i = 0; i < this.scene.pointclouds.length; i++) {
			this.scene.pointclouds[i].material.weightClassification = w;
			this.dispatchEvent({"type": "attribute_weights_changed" + i, "viewer": this});
		}
	};

	setFreeze (value) {
		value = Boolean(value);
		if(this.freeze !== value) {
			this.freeze = value;
			this.dispatchEvent({"type": "freeze_changed", "viewer": this});
		}
	};

	getFreeze () {
		return this.freeze;
	};

	getClipTask(){
		return this.clipTask;
	}

	getClipMethod(){
		return this.clipMethod;
	}

	setClipTask(value){
		if(this.clipTask !== value){

			this.clipTask = value;

			this.dispatchEvent({
				type: "cliptask_changed", 
				viewer: this});		
		}
	}

	setClipMethod(value){
		if(this.clipMethod !== value){

			this.clipMethod = value;
			
			this.dispatchEvent({
				type: "clipmethod_changed", 
				viewer: this});		
		}
	}

	setPointBudget (value) {
		if(Potree.pointBudget !== value) {
			Potree.pointBudget = parseInt(value);
			this.dispatchEvent({"type": "point_budget_changed", "viewer": this});
		}
	};

	getPointBudget () {
		return Potree.pointBudget;
	};

	setShowAnnotations (value) {
		if(this.showAnnotations !== value) {
			this.showAnnotations = value;
			this.dispatchEvent({"type": "show_annotations_changed", "viewer": this});
		}
	}

	getShowAnnotations () {
		return this.showAnnotations;
	}
	
	setDEMCollisionsEnabled(value){
		if(this.useDEMCollisions !== value){
			this.useDEMCollisions = value;
			this.dispatchEvent({"type": "use_demcollisions_changed", "viewer": this});
		};
	};

	getDEMCollisionsEnabled () {
		return this.useDEMCollisions;
	};

	setEDLEnabled (value) {
		value = Boolean(value);
		if(this.useEDL !== value) {
			this.useEDL = value;
			this.dispatchEvent({"type": "use_edl_changed", "viewer": this});
		}
	};

	getEDLEnabled () {
		return this.useEDL;
	};

	setEDLRadius (value) {
		if(this.edlRadius !== value) {
			this.edlRadius = value;
			this.dispatchEvent({"type": "edl_radius_changed", "viewer": this});
		}
	};

	getEDLRadius () {
		return this.edlRadius;
	};

	setEDLStrength (value) {
		if(this.edlStrength !== value) {
			this.edlStrength = value;
			this.dispatchEvent({"type": "edl_strength_changed", "viewer": this});
		}
	};

	getEDLStrength () {
		return this.edlStrength;
	};

	setFOV (value) {
		if(this.fov !== value) {
			this.fov = value;
			this.dispatchEvent({"type": "fov_changed", "viewer": this});
		}
	};

	getFOV () {
		return this.fov;
	};

	disableAnnotations () {
		this.scene.annotations.traverse(annotation => {
			annotation.domElement.css("pointer-events", "none");

			// return annotation.visible;
		});
	};

	enableAnnotations () {
		this.scene.annotations.traverse(annotation => {
			annotation.domElement.css("pointer-events", "auto");

			// return annotation.visible;
		});
	};

	setClassificationVisibility (key, value) {
		if(!this.classifications[key]) {
			this.classifications[key] = {visible: value, name: "no name"};
			this.dispatchEvent({"type": "classification_visibility_changed", "viewer": this});
		} else if(this.classifications[key].visible !== value) {
			this.classifications[key].visible = value;
			this.dispatchEvent({"type": "classification_visibility_changed", "viewer": this});
		}
	};

	setLengthUnit (value) {
		switch (value) {
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

	zoomTo(node, factor, animationDuration = 0){
		let view = this.scene.view;

		let camera = this.scene.cameraP.clone();
		camera.rotation.copy(this.scene.cameraP.rotation);
		camera.rotation.order = "ZXY";
		camera.rotation.x = Math.PI / 2 + view.pitch;
		camera.rotation.z = view.yaw;
		camera.updateMatrix();
		camera.updateMatrixWorld();
		camera.zoomTo(node, factor);

		let bs;
		if(node.boundingSphere) {
			bs = node.boundingSphere;
		} else if(node.geometry && node.geometry.boundingSphere) {
			bs = node.geometry.boundingSphere;
		} else {
			bs = node.boundingBox.getBoundingSphere();
		}
		bs = bs.clone().applyMatrix4(node.matrixWorld); 

		let startPosition = view.position.clone();
		let endPosition = camera.position.clone();
		let startTarget = view.getPivot();
		let endTarget = bs.center;
		let startRadius = view.radius;
		let endRadius = endPosition.distanceTo(endTarget);

		let easing = TWEEN.Easing.Quartic.Out;

		{ // animate camera position
			let pos = startPosition.clone();
			let tween = new TWEEN.Tween(pos).to(endPosition, animationDuration);
			tween.easing(easing);

			tween.onUpdate(() => {
				view.position.copy(pos);
			});

			tween.start();
		}

		{ // animate camera target
			let target = startTarget.clone();
			let tween = new TWEEN.Tween(target).to(endTarget, animationDuration);
			tween.easing(easing);
			tween.onUpdate(() => {
				view.lookAt(target);
			});
			tween.onComplete(() => {
				view.lookAt(target);
				this.dispatchEvent({type: "focusing_finished", target: this});
			});

			this.dispatchEvent({type: "focusing_started", target: this});
			tween.start();
		}
	};

	getBoundingBox (pointclouds) {
		return this.scene.getBoundingBox(pointclouds);
	};

	fitToScreen (factor = 1, animationDuration = 0) {
		let box = this.getBoundingBox(this.scene.pointclouds);

		let node = new THREE.Object3D();
		node.boundingBox = box;

		this.zoomTo(node, factor, animationDuration);
		this.controls.stop();
	};

	toggleNavigationCube() {
		this.navigationCube.visible = !this.navigationCube.visible;
	}

	setCameraMode(mode){
		this.scene.cameraMode = mode;

		for(let pointcloud of this.scene.pointclouds)
		{
			pointcloud.material.useOrthographicCamera = mode == Potree.CameraMode.ORTHOGRAPHIC;
		}
	}

	// ------------------------------------------------------------------------------------
	// Viewer Internals
	// ------------------------------------------------------------------------------------

	createControls () {
		 // create FIRST PERSON CONTROLS
			this.fpControls = new Potree.FirstPersonControls(this);
			this.fpControls.enabled = false;
			this.fpControls.addEventListener("start", this.disableAnnotations.bind(this));
			this.fpControls.addEventListener("end", this.enableAnnotations.bind(this));
			// this.fpControls.addEventListener("double_click_move", (event) => {
			//	let distance = event.targetLocation.distanceTo(event.position);
			//	this.setMoveSpeed(Math.pow(distance, 0.4));
			// });
			// this.fpControls.addEventListener("move_speed_changed", (event) => {
			//	this.setMoveSpeed(this.fpControls.moveSpeed);
			// });
		
		 // create ORBIT CONTROLS
			this.orbitControls = new Potree.OrbitControls(this);
			this.orbitControls.enabled = false;
			this.orbitControls.addEventListener("start", this.disableAnnotations.bind(this));
			this.orbitControls.addEventListener("end", this.enableAnnotations.bind(this));
		

		 // create EARTH CONTROLS
			this.earthControls = new Potree.EarthControls(this);
			this.earthControls.enabled = false;
			this.earthControls.addEventListener("start", this.disableAnnotations.bind(this));
			this.earthControls.addEventListener("end", this.enableAnnotations.bind(this));
		
	};

	toggleMap () {
		// let map = $("#potree_map");
		// map.toggle(100);

		if(this.mapView) {
			this.mapView.toggle();
		}
	};

	setLanguage (lang) {
		i18n.setLng(lang);
		$("body").i18n();
	}

	setServer (server) {
		this.server = server;
	}

	initThree () {
		let width = this.renderArea.clientWidth;
		let height = this.renderArea.clientHeight;

		this.renderer = new THREE.WebGLRenderer({alpha: true, premultipliedAlpha: false});
		this.renderer.sortObjects = false;
		this.renderer.setSize(width, height);
		this.renderer.autoClear = false;
		this.renderArea.appendChild(this.renderer.domElement);
		this.renderer.domElement.tabIndex = "2222";
		this.renderer.domElement.style.position = "absolute";
		this.renderer.domElement.addEventListener("mousedown", () => {
			this.renderer.domElement.focus();
		});

		// enable frag_depth extension for the interpolation shader, if available
		let gl = this.renderer.context;
		gl.getExtension("EXT_frag_depth");
		gl.getExtension("WEBGL_depth_texture");
		
		let extVAO = gl.getExtension("OES_vertex_array_object");
		gl.createVertexArray = extVAO.createVertexArrayOES.bind(extVAO);
		gl.bindVertexArray = extVAO.bindVertexArrayOES.bind(extVAO);
		//gl.bindVertexArray = extVAO.asdfbindVertexArrayOES.bind(extVAO);
		
	}

	updateAnnotations () {

		if(!this.visibleAnnotations){
			this.visibleAnnotations = new Set();
		}

		this.scene.annotations.updateBounds();
		this.scene.cameraP.updateMatrixWorld();
		this.scene.cameraO.updateMatrixWorld();
		
		let distances = [];

		let renderAreaWidth = this.renderer.getSize().width;
		let renderAreaHeight = this.renderer.getSize().height;

		let viewer = this;

		let visibleNow = [];
		this.scene.annotations.traverse(annotation => {

			if(annotation === this.scene.annotations) {
				return true;
			}

			if(!annotation.visible) {
				return false;
			}

			annotation.scene = this.scene;

			let element = annotation.domElement;

			let position = annotation.position;
			if(!position) {
				position = annotation.boundingBox.getCenter();
			}

			let distance = viewer.scene.cameraP.position.distanceTo(position);
			let radius = annotation.boundingBox.getBoundingSphere().radius;

			let screenPos = new THREE.Vector3();
			let screenSize = 0;

			{
				// SCREEN POS
				screenPos.copy(position).project(this.scene.getActiveCamera());
				screenPos.x = renderAreaWidth * (screenPos.x + 1) / 2;
				screenPos.y = renderAreaHeight * (1 - (screenPos.y + 1) / 2);


				// SCREEN SIZE
				if(viewer.scene.cameraMode == Potree.CameraMode.PERSPECTIVE) {
					let fov = Math.PI * viewer.scene.cameraP.fov / 180;
					let slope = Math.tan(fov / 2.0);
					let projFactor =  0.5 * renderAreaHeight / (slope * distance);
					screenSize = radius * projFactor;
				} else {
					screenSize = Potree.utils.projectedRadiusOrtho(radius, viewer.scene.cameraO.projectionMatrix, renderAreaWidth, renderAreaHeight);
				}
			}

			element.css("left", screenPos.x + "px");
			element.css("top", screenPos.y + "px");
			//element.css("display", "block");

			let zIndex = 10000000 - distance * (10000000 / this.scene.cameraP.far);
			if(annotation.descriptionVisible){
				zIndex += 10000000;
			}
			element.css("z-index", parseInt(zIndex));

			if(annotation.children.length > 0){
				let expand = screenSize > annotation.collapseThreshold || annotation.boundingBox.containsPoint(this.scene.getActiveCamera().position);
				annotation.expand = expand;

				if(!expand) {
					//annotation.display = (screenPos.z >= -1 && screenPos.z <= 1);
					let inFrustum = (screenPos.z >= -1 && screenPos.z <= 1);
					if(inFrustum){
						visibleNow.push(annotation);
					}
				}

				return expand;
			} else {
				//annotation.display = (screenPos.z >= -1 && screenPos.z <= 1);
				let inFrustum = (screenPos.z >= -1 && screenPos.z <= 1);
				if(inFrustum){
					visibleNow.push(annotation);
				}
			}
			
		});

		let notVisibleAnymore = new Set(this.visibleAnnotations);
		for(let annotation of visibleNow){
			annotation.display = true;
			
			notVisibleAnymore.delete(annotation);
		}
		this.visibleAnnotations = visibleNow;

		for(let annotation of notVisibleAnymore){
			annotation.display = false;
		}

	}

	update(delta, timestamp){
		
		{
			let u = Math.sin(0.0005 * timestamp) * 0.5 - 0.4;
			
			let x = Math.cos(u);
			let y = Math.sin(u);
			
			this.shadowTestCam.position.set(7 * x, 7 * y, 8.561);
			this.shadowTestCam.lookAt(new THREE.Vector3(0, 0, 0));
		}
		
		
		let scene = this.scene;
		let camera = scene.getActiveCamera();
		
		Potree.pointLoadLimit = Potree.pointBudget * 2;

		this.scene.directionalLight.position.copy(camera.position);
		this.scene.directionalLight.lookAt(new THREE.Vector3().addVectors(camera.position, camera.getWorldDirection()));

		for(let pointcloud of this.scene.pointclouds) {
			if(!pointcloud.material._defaultIntensityRangeChanged) {
				let root = pointcloud.pcoGeometry.root;
				if(root != null && root.loaded) {
					let attributes = pointcloud.pcoGeometry.root.geometry.attributes;
					if(attributes.intensity) {
						let array = attributes.intensity.array;

						// chose max value from the 0.75 percentile
						let ordered = [];
						for(let j = 0; j < array.length; j++) {
							ordered.push(array[j]);
						}
						ordered.sort();
						let capIndex = parseInt((ordered.length - 1) * 0.75);
						let cap = ordered[capIndex];

						if(cap <= 1) {
							pointcloud.material.intensityRange = [0, 1];
						} else if(cap <= 256) {
							pointcloud.material.intensityRange = [0, 255];
						} else {
							pointcloud.material.intensityRange = [0, cap];
						}

					}
					// pointcloud._intensityMaxEvaluated = true;
				}
			}
			
			pointcloud.showBoundingBox = this.showBoundingBox;
			pointcloud.generateDEM = this.generateDEM;
			pointcloud.minimumNodePixelSize = this.minNodeSize;
		}

		// update classification visibility
		for(let pointcloud of this.scene.pointclouds) {
			let classification = pointcloud.material.classification;
			let somethingChanged = false;
			for(let key of Object.keys(this.classifications)) {
				let w = this.classifications[key].visible ? 1 : 0;

				if(classification[key]) {
					if(classification[key].w !== w) {
						classification[key].w = w;
						somethingChanged = true;
					}
				} else if(classification.DEFAULT) {
					classification[key] = classification.DEFAULT;
					somethingChanged = true;
				} else {
					classification[key] = new THREE.Vector4(0.3, 0.6, 0.6, 0.5);
					somethingChanged = true;
				}
			}

			if(somethingChanged) {
				pointcloud.material.recomputeClassification();
			}
		}

		{
			if(this.showBoundingBox){
				let bbRoot = this.scene.scene.getObjectByName("potree_bounding_box_root");
				if(!bbRoot){
					let node = new THREE.Object3D();
					node.name = "potree_bounding_box_root";
					this.scene.scene.add(node);
					bbRoot = node;
				}

				let visibleBoxes = [];
				for(let pointcloud of this.scene.pointclouds){
					for(let node of pointcloud.visibleNodes.filter(vn => vn.boundingBoxNode !== undefined)){
						let box = node.boundingBoxNode;
						visibleBoxes.push(box);
					}
				}

				bbRoot.children = visibleBoxes;
			}
		}

		if(!this.freeze) {
			let result = Potree.updatePointClouds(scene.pointclouds, camera, this.renderer);

			if(result.lowestSpacing !== Infinity){
				let near = result.lowestSpacing * 10.0;
				let far = -this.getBoundingBox().applyMatrix4(camera.matrixWorldInverse).min.z;

				far = Math.max(far * 1.5, 1000);
				near = Math.min(100.0, Math.max(0.01, near));
				far = Math.max(far, near + 1000);

				if(near === Infinity){
					near = 0.1;
				}
				
				camera.near = near;
				camera.far = far;
			}else{
				// don"t change near and far in this case
			}

			if(this.scene.cameraMode == Potree.CameraMode.ORTHOGRAPHIC) {
				camera.near = -camera.far;
			}
		} 
		
		this.scene.cameraP.fov = this.fov;
		
		// Navigation mode changed?
		if(this.getControls(scene.view.navigationMode) !== this.controls) {
			if(this.controls) {
				this.controls.enabled = false;
				this.inputHandler.removeInputListener(this.controls);
			}

			this.controls = this.getControls(scene.view.navigationMode);
			this.controls.enabled = true;
			this.inputHandler.addInputListener(this.controls);
		}
		
		if(this.controls !== null) {
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

		{
			if(this._previousCamera === undefined){
				this._previousCamera = this.scene.getActiveCamera().clone();
				this._previousCamera.rotation.copy(this.scene.getActiveCamera());
			}

			if(!this._previousCamera.matrixWorld.equals(camera.matrixWorld)){
				this.dispatchEvent({
					type: "camera_changed",
					previous: this._previousCamera,
					camera: camera
				});
			}else if(!this._previousCamera.projectionMatrix.equals(camera.projectionMatrix)){
				this.dispatchEvent({
					type: "camera_changed",
					previous: this._previousCamera,
					camera: camera
				});
			}

			this._previousCamera = this.scene.getActiveCamera().clone();
			this._previousCamera.rotation.copy(this.scene.getActiveCamera());

		}

		{ // update clip boxes
			let boxes = [];
			
			// volumes with clipping enabled
			boxes.push(...this.scene.volumes.filter(v => v.clip));

			// profile segments
			for(let profile of this.scene.profiles){
				boxes.push(...profile.boxes);
			}
			
			let clipBoxes = boxes.map( box => {
				box.updateMatrixWorld();
				let boxInverse = new THREE.Matrix4().getInverse(box.matrixWorld);
				let boxPosition = box.getWorldPosition();
				return {box: box, inverse: boxInverse, position: boxPosition};
			});

			let clipPolygons = this.scene.polygonClipVolumes.filter(vol => vol.initialized);
			
			// set clip volumes in material
			for(let pointcloud of this.scene.pointclouds.filter(pc => pc.visible)){
				pointcloud.material.setClipBoxes(clipBoxes);
				pointcloud.material.setClipPolygons(clipPolygons, this.clippingTool.maxPolygonVertices);
				pointcloud.material.clipTask = this.clipTask;
				pointcloud.material.clipMethod = this.clipMethod;
			}
		}

		{ // update navigation cube
			this.navigationCube.update(camera.rotation);
		}

		this.updateAnnotations();
		
		if(this.mapView){
			this.mapView.update(delta);
			if(this.mapView.sceneProjection){
				$( "#potree_map_toggle" ).css("display", "block");
				
			}
		}

		TWEEN.update(timestamp);

		this.dispatchEvent({
			type: "update",
			delta: delta,
			timestamp: timestamp});
			
	}
	
	render(){
		{ // resize
			let width = this.scaleFactor * this.renderArea.clientWidth;
			let height = this.scaleFactor * this.renderArea.clientHeight;
			let pixelRatio = this.renderer.getPixelRatio();
			let aspect = width / height;

			this.scene.cameraP.aspect = aspect;
			this.scene.cameraP.updateProjectionMatrix();

			//let frustumScale = viewer.moveSpeed * 2.0;
			let frustumScale = this.scene.view.radius;
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
			if(this.useEDL && Potree.Features.SHADER_EDL.isSupported()) {
				if(!this.edlRenderer)
				{
					this.edlRenderer = new EDLRenderer(this);
				}
				this.edlRenderer.render(this.renderer);
			} else
			{
				if(!this.potreeRenderer)
				{
					this.potreeRenderer = new PotreeRenderer(this);
				}
				this.potreeRenderer.render();
			}
		}

		this.renderer.render(this.overlay, this.overlayCamera);
	}
};
