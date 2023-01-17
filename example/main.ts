import { AmbientLight, BoxGeometry,  Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, SphereGeometry, Vector2, Vector3, WebGLRenderer } from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls';
import { PointCloudOctree, Potree } from '../source';
// import { Viewer } from './viewer';
// import "./main.css"

// const targetEl = document.createElement('div');
// targetEl.className = 'container';
// document.body.appendChild(targetEl);

// const viewer = new Viewer();
// viewer.initialize(targetEl);
// const camera = viewer.camera;
// camera.far = 1000;
// camera.updateProjectionMatrix();
// camera.position.set(0, 0, 10);
// camera.lookAt(new Vector3());

// let pointCloud: PointCloudOctree | undefined;
// let loaded: boolean = false;

// const unloadBtn = document.createElement('button');
// unloadBtn.textContent = 'Unload';
// unloadBtn.addEventListener('click', () => {
// 	if (!loaded) {
// 		return;
// 	}

// 	viewer.unload();
// 	loaded = false;
// 	pointCloud = undefined;
// });

// viewer.load('metadata.json', 'https://static.thelostmetropolis.org/BigShotCleanV2/').then(pco => {
// 	pointCloud = pco;
// 	pointCloud.material.size = 1.0;
// 	pointCloud.material.shape = 2;
// 	pointCloud.material.inputColorEncoding = 1;
// 	pointCloud.material.outputColorEncoding = 1;
// 	pointCloud.position.set(0, -2, 1)
// 	pointCloud.scale.set(.1, .1, .1);
// 	viewer.add(pco);
// });



document.body.onload = function()
{
	const potree = new Potree();


	// three.js
	const scene = new Scene();
	const camera = new PerspectiveCamera(60, 1, 0.1, 1000);

	const canvas = document.createElement('canvas');
	canvas.style.position = 'absolute';
	canvas.style.top = '0px';
	canvas.style.left = '0px';
	canvas.style.width = '100%';
	canvas.style.height = '100%';
	document.body.appendChild(canvas);

	const renderer = new WebGLRenderer(
		{
			canvas: canvas,
			alpha: true,
			logarithmicDepthBuffer: true,
			precision: 'highp',
			premultipliedAlpha: true,
			antialias: true,
			preserveDrawingBuffer: false,
			powerPreference: 'high-performance'
		});

	const geometry = new BoxGeometry(25, 1, 25);
	const material = new MeshBasicMaterial({color: 0x44AA44});
	const cube = new Mesh(geometry, material);
	cube.position.y = -2;
	scene.add(cube);

	scene.add(new AmbientLight(0xffffff));

	const controls = new OrbitControls(camera, canvas);
	camera.position.z = 10;

	const raycaster = new Raycaster();
	// @ts-ignore
	raycaster.params.Points.threshold = 1e-2;
	const normalized = new Vector2();

	canvas.onmousemove = function(event)
	{
		normalized.set(event.clientX / canvas.width * 2 - 1, -(event.clientY / canvas.height) * 2 + 1);
		raycaster.setFromCamera(normalized, camera);
	};

	canvas.ondblclick = function(event)
	{
		const intesects = raycaster.intersectObject(scene, true);


		if (intesects.length > 0)
		{
			const geometry = new SphereGeometry(0.1, 32, 32);
			const material = new MeshBasicMaterial({color: 0xAA4444});
			const sphere = new Mesh(geometry, material);
			sphere.position.copy(intesects[0].point);
			scene.add(sphere);
		}
	};


	loadPointCloud('data/lion_takanawa_ept_bin/', 'ept.json', new Vector3(-11, -4, 3.0));
	loadPointCloud('data/lion_takanawa_ept_laz/', 'ept.json', new Vector3(-4, -4, 3.0));
	loadPointCloud('data/lion_takanawa/', 'cloud.js', new Vector3(-2, -3, 0.0));
	loadPointCloud('data/lion_takanawa_las/', 'cloud.js', new Vector3(3, -3, 0.0));
	loadPointCloud('data/lion_takanawa_laz/', 'cloud.js', new Vector3(8, -3, 0.0));


	function loadPointCloud(baseUrl: string, url: string, position: Vector3)
	{
		potree.loadPointCloud(url, url => `${baseUrl}${url}`,).then(function(pointcloud: PointCloudOctree)
		{
			pointcloud.material.size = 1.0;
			pointcloud.material.shape = Potree.;
			pointcloud.material.inputColorEncoding = 1;
			pointcloud.material.outputColorEncoding = 1;
			pointcloud.position.set(0, -2, 1)
			pointcloud.scale.set(.1, .1, .1);

			if (position)
			{
				pointcloud.position.copy(position);
			}

			scene.add(pointcloud);
		});
}

	
	function loop()
	{
		cube.rotation.y += 0.01;

		controls.update();
		renderer.render(scene, camera);

		requestAnimationFrame(loop);
	}

	loop();

	document.body.onresize = function()
	{
		const width = window.innerWidth;
		const height = window.innerHeight;

		renderer.setSize(width, height);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
	};
	
	// @ts-ignore
	document.body.onresize();
};
