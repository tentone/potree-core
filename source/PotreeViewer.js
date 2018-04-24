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
		this.minNodeSize = 30;
		this.scaleFactor = 1;

		Potree.pointBudget = 1000000;

		this.createRenderer();

		this.pRenderer = new Potree.Renderer(this.renderer);
		
		this.scene = new Potree.Scene(this.renderer);

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

	update(delta)
	{
		Potree.pointLoadLimit = Potree.pointBudget * 2;

		for(var pointcloud of this.scene.pointclouds)
		{
			pointcloud.showBoundingBox = false;
			pointcloud.generateDEM = false;
			pointcloud.minimumNodePixelSize = this.minNodeSize;
		}

		Potree.updatePointClouds(this.scene.pointclouds, this.scene.cameraP, this.renderer);

		this.controls.setScene(this.scene);
		this.controls.update(delta);

		this.scene.cameraP.fov = 60;
		this.scene.cameraP.position.copy(this.scene.view.position);
		this.scene.cameraP.rotation.order = "ZXY";
		this.scene.cameraP.rotation.x = Math.PI / 2 + this.scene.view.pitch;
		this.scene.cameraP.rotation.z = this.scene.view.yaw;
		this.scene.cameraP.updateMatrix();
		this.scene.cameraP.updateMatrixWorld();
		this.scene.cameraP.matrixWorldInverse.getInverse(this.scene.cameraP.matrixWorld);
	}
	
	render(camera)
	{
		if(camera === undefined)
		{
			camera = this.scene.cameraP;
		}

		this.pRenderer.render(this.scene.scenePointCloud, camera);
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
