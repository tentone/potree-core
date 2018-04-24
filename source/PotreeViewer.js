"use strict";

/*
 * Potree object is a wrapper to use Potree alongside other THREE based frameworks.
 * 
 * The object can be used a normal Object3D.
 */
class PotreeViewer
{
	constructor(renderer)
	{
		this.minNodeSize = 30;

		Potree.pointBudget = 100000;

		if(renderer === undefined)
		{
			this.createRenderer();
		}
		else
		{
			this.renderer = renderer;
		}

		this.pointRenderer = new PotreeRenderer2(this.renderer);
		
		this.scene = new PotreeScene(this.renderer);

		this.controls = new Potree.OrbitControls(this);
		
		this.inputHandler = new Potree.InputHandler(this);
		this.inputHandler.setScene(this.scene);
		this.inputHandler.addInputListener(this.controls);
	}

	dispatchEvent(){}

	setMoveSpeed(value){}

	getBoundingBox(pointclouds)
	{
		return this.scene.getBoundingBox(pointclouds);
	}

	setCameraMode(mode)
	{
		this.scene.cameraMode = mode;

		for(var pointcloud of this.scene.pointclouds)
		{
			pointcloud.material.useOrthographicCamera = mode == Potree.CameraMode.ORTHOGRAPHIC;
		}
	}

	createRenderer()
	{
		this.renderer = new THREE.WebGLRenderer({alpha: true, premultipliedAlpha: false});
		this.renderer.sortObjects = true;
		this.renderer.autoClear = false;

		//Enable frag_depth extension for the interpolation shader, if available
		var gl = this.renderer.context;
		gl.getExtension("EXT_frag_depth");
		gl.getExtension("WEBGL_depth_texture");
		
		var extVAO = gl.getExtension("OES_vertex_array_object");
		gl.createVertexArray = extVAO.createVertexArrayOES.bind(extVAO);
		gl.bindVertexArray = extVAO.bindVertexArrayOES.bind(extVAO);

		var width = window.innerWidth;
		var height = window.innerHeight;
		this.renderer.setSize(width, height);
		this.renderer.domElement.style.position = "absolute";
		this.renderer.domElement.style.top = "0px";
		this.renderer.domElement.style.bottom = "0px";
		document.body.appendChild(this.renderer.domElement);
	}

	update(delta, camera)
	{
		Potree.pointLoadLimit = Potree.pointBudget * 2;

		for(var pointcloud of this.scene.pointclouds)
		{
			pointcloud.showBoundingBox = false;
			pointcloud.generateDEM = false;
			pointcloud.minimumNodePixelSize = this.minNodeSize;
		}

		if(camera === undefined)
		{
			Potree.updatePointClouds(this.scene.pointclouds, this.scene.camera, this.renderer);

			this.controls.setScene(this.scene);
			this.controls.update(delta);

			this.scene.camera.position.copy(this.scene.view.position);
			this.scene.camera.rotation.order = "ZXY";
			this.scene.camera.rotation.x = Math.PI / 2 + this.scene.view.pitch;
			this.scene.camera.rotation.z = this.scene.view.yaw;
			this.scene.camera.updateMatrix();
			this.scene.camera.updateMatrixWorld();
			this.scene.camera.matrixWorldInverse.getInverse(this.scene.camera.matrixWorld);
		}
		else
		{
			Potree.updatePointClouds(this.scene.pointclouds, camera, this.renderer);
		}
	}
	
	render(camera)
	{
		if(camera === undefined)
		{
			camera = this.scene.camera;
		}

		this.pointRenderer.render(this.scene.scenePointCloud, camera);
	}

	resize(width, height)
	{
		this.renderer.setSize(width, height);

		this.scene.camera.aspect = width / height;
		this.scene.camera.updateProjectionMatrix();
	}
}
