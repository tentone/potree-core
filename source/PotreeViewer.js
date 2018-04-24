"use strict";

/*
 * Potree object is a wrapper to use Potree alongside other THREE based frameworks.
 * 
 * The object can be used a normal Object3D.
 */
class PotreeViewer
{
	constructor()
	{
		this.fov = 60;
		this.minNodeSize = 30;
		this.moveSpeed = 10;
		this.scaleFactor = 1;

		Potree.pointBudget = 1000000;
		
		this.skybox = null;
		this.clock = new THREE.Clock();
		this.background = null;

		this.createRenderer();

		this.pRenderer = new Potree.Renderer(this.renderer);
		
		this.scene = new Potree.Scene(this.renderer);

		this.controls = new Potree.OrbitControls(this);
		
		this.inputHandler = new Potree.InputHandler(this);
		this.inputHandler.setScene(this.scene);
		this.inputHandler.addInputListener(this.controls);
	}

	dispatchEvent(){}

	setMoveSpeed(value)
	{
		this.moveSpeed = value;
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

		view.position.copy(endPosition);
		view.lookAt(endTarget);
	}

	getBoundingBox(pointclouds)
	{
		return this.scene.getBoundingBox(pointclouds);
	}

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

	update(delta, timestamp)
	{
		var u = Math.sin(0.0005 * timestamp) * 0.5 - 0.4;
		var x = Math.cos(u);
		var y = Math.sin(u);

		var scene = this.scene;
		var camera = scene.getActiveCamera();
		
		Potree.pointLoadLimit = Potree.pointBudget * 2;

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
			
			pointcloud.showBoundingBox = false;
			pointcloud.generateDEM = false;
			pointcloud.minimumNodePixelSize = this.minNodeSize;
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
	}
	
	render()
	{
		var activeCam = this.scene.getActiveCamera();
		this.pRenderer.render(this.scene.scenePointCloud, activeCam);
	}

	resize()
	{
		var width = this.scaleFactor * window.innerWidth;
		var height = this.scaleFactor * window.innerHeight;
		this.renderer.setSize(width, height);

		var pixelRatio = this.renderer.getPixelRatio();
		var aspect = width / height;

		this.scene.cameraP.aspect = aspect;
		this.scene.cameraP.updateProjectionMatrix();
	}
}
