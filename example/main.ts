import { AmbientLight, BoxGeometry, Clock, Euler, Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, Plane, PlaneHelper, Raycaster, Scene, SphereGeometry, Vector2, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { ClipMode, ClipVolumeMode, PointCloudOctree, PointSizeType, Potree, PotreeRenderer, createClipBox, createClipSphere } from '../source';

document.body.onload = function () {
	const potree = new Potree();
	let pointClouds: PointCloudOctree[] = [];
	let clipPlanesTarget: PointCloudOctree | null = null;
	let pumpClipBoxesTarget: PointCloudOctree | null = null;

	// Clip plane state
	const clipPlaneX = new Plane(new Vector3(1, 0, 0), 0);
	const clipPlaneY = new Plane(new Vector3(0, 1, 0), 0);
	const clipPlaneZ = new Plane(new Vector3(0, 0, 1), 0);
	const planeCenter = new Vector3();
	const planeExtent = new Vector3();

	const clipPlaneState = {
		enableX: true,
		enableY: false,
		enableZ: false,
		offsetX: 0,
		offsetY: 0,
		offsetZ: 0,
		showHelpers: true,
	};

	// Clip plane helpers
	const helperSize = 1;
	const clipHelperX = new PlaneHelper(clipPlaneX, helperSize, 0xE53935);
	const clipHelperY = new PlaneHelper(clipPlaneY, helperSize, 0x43A047);
	const clipHelperZ = new PlaneHelper(clipPlaneZ, helperSize, 0x1E88E5);
	clipHelperX.raycast = () => false;
	clipHelperY.raycast = () => false;
	clipHelperZ.raycast = () => false;

	function updateClipPlanes() {
		if (!clipPlanesTarget) return;
		const planes: Plane[] = [];
		if (clipPlaneState.enableX) planes.push(clipPlaneX);
		if (clipPlaneState.enableY) planes.push(clipPlaneY);
		if (clipPlaneState.enableZ) planes.push(clipPlaneZ);
		clipPlanesTarget.material.clippingPlanes = planes.length > 0 ? planes : null;

		clipHelperX.visible = clipPlaneState.showHelpers && clipPlaneState.enableX;
		clipHelperY.visible = clipPlaneState.showHelpers && clipPlaneState.enableY;
		clipHelperZ.visible = clipPlaneState.showHelpers && clipPlaneState.enableZ;
	}

	function updatePlaneConstant(axis: 'X' | 'Y' | 'Z') {
		const plane = axis === 'X' ? clipPlaneX : axis === 'Y' ? clipPlaneY : clipPlaneZ;
		const offset = axis === 'X' ? clipPlaneState.offsetX : axis === 'Y' ? clipPlaneState.offsetY : clipPlaneState.offsetZ;
		const center = axis === 'X' ? planeCenter.x : axis === 'Y' ? planeCenter.y : planeCenter.z;
		const extent = axis === 'X' ? planeExtent.x : axis === 'Y' ? planeExtent.y : planeExtent.z;
		plane.constant = -(center + offset * extent);
		updateClipPlanes();
	}

	function updatePumpClipBoxModes() {
		if (!pumpClipBoxesTarget) return;
		pumpClipBoxesTarget.material.setClipBoxMode(0, clipVolumeModeMap[params.pumpClipBox1Mode]);
		pumpClipBoxesTarget.material.setClipBoxMode(1, clipVolumeModeMap[params.pumpClipBox2Mode]);
	}

	// ClipMode
	const clipModeMap: Record<string, ClipMode> = {
		'Disabled': ClipMode.DISABLED,
		'Highlight Inside': ClipMode.HIGHLIGHT_INSIDE,
		'Clip Outside': ClipMode.CLIP_OUTSIDE,
		'Clip Inside': ClipMode.CLIP_INSIDE,
	};

	const clipVolumeModeMap: Record<string, ClipVolumeMode | undefined> = {
		'Inherit Global': undefined,
		'Include': 'include',
		'Exclude': 'exclude',
	};

	// State
	const params = {
		// Camera
		orthographic: false,
		// EDL
		edlEnabled: false,
		edlStrength: 0.4,
		edlRadius: 1.4,
		// Clipping
		clipMode: 'Highlight Inside',
		pumpClipBox1Mode: 'Inherit Global',
		pumpClipBox2Mode: 'Inherit Global',
		// Points
		pointSize: 1.0,
		sizeType: 'Adaptive',
		// Transform
		transformMode: 'translate',
		// Pick
		pickMethod: 'Potree',
	};

	// EDL
	const potreeRenderer = new PotreeRenderer({
		edl: {
			enabled: false,
			pointCloudLayer: 1,
			strength: params.edlStrength,
			radius: params.edlRadius,
			opacity: 1.0,
		},
	});

	// world
	const scene = new Scene();

	let useOrthographicCamera = false;
	const perspectiveCamera = new PerspectiveCamera(60, 1, 0.1, 1000);
	perspectiveCamera.position.set(-10, 10, 15);

	const orthographicFrustrumSize = 20;
	const orthographicCamera = new OrthographicCamera(
		-orthographicFrustrumSize / 2, orthographicFrustrumSize / 2,
		orthographicFrustrumSize / 2, -orthographicFrustrumSize / 2, 0.1, 1000
	);
	orthographicCamera.position.set(0, 0, 10);
	let camera = perspectiveCamera as PerspectiveCamera | OrthographicCamera;

	const canvas = document.createElement('canvas');
	canvas.style.position = 'absolute';
	canvas.style.top = '0px';
	canvas.style.left = '0px';
	canvas.style.width = '100%';
	canvas.style.height = '100%';
	document.body.appendChild(canvas);

	const renderer = new WebGLRenderer({
		canvas: canvas,
		alpha: true,
		logarithmicDepthBuffer: true,
		precision: 'highp',
		premultipliedAlpha: true,
		antialias: true,
		preserveDrawingBuffer: false,
		powerPreference: 'high-performance',
	});

	const cube = new Mesh(new BoxGeometry(25, 1, 25), new MeshBasicMaterial({ color: 0x44AA44 }));
	cube.position.y = -2;
	scene.add(cube);
	scene.add(new AmbientLight(0xffffff));

	// Add clip plane helpers to scene (initially hidden until planes are configured)
	clipHelperX.visible = false;
	clipHelperY.visible = false;
	clipHelperZ.visible = false;
	scene.add(clipHelperX);
	scene.add(clipHelperY);
	scene.add(clipHelperZ);

	// ---- ViewHelper ----
	let viewHelper = new ViewHelper(camera, canvas);
	const clock = new Clock();

	let controls = new OrbitControls(camera, canvas);

	let transformControls = new TransformControls(camera, canvas);
	transformControls.addEventListener('dragging-changed', (event) => {
		controls.enabled = !event.value;
	});
	scene.add(transformControls);

	const raycaster = new Raycaster();
	// @ts-ignore
	raycaster.params.Points.threshold = 1e-2;
	const normalized = new Vector2();

	canvas.onmousemove = function (event) {
		normalized.set(event.clientX / canvas.width * 2 - 1, -(event.clientY / canvas.height) * 2 + 1);
		raycaster.setFromCamera(normalized, camera);
	};

	let selectedPco: PointCloudOctree | null = null;

	canvas.ondblclick = function () {
		const ray = raycaster.ray;
		let pickedPco: PointCloudOctree | null = null;

		if (params.pickMethod === 'Potree') {
			const pick = Potree.pick(pointClouds, renderer, camera, ray);
			pickedPco = pick?.pointCloud ?? null;
		} else {
			const intersects = raycaster.intersectObjects(pointClouds, true);
			if (intersects.length > 0) {
				let node = intersects[0].object;
				while (node != null) {
					if (pointClouds.includes(node as PointCloudOctree)) {
						pickedPco = node as PointCloudOctree;
						break;
					}
					node = node.parent as typeof node;
				}
			}
		}

		if (pickedPco) {
			selectedPco = pickedPco;
			transformControls.attach(selectedPco);
		} else {
			selectedPco = null;
			transformControls.detach();
		}

		const intesects = raycaster.intersectObject(scene, true);
		if (intesects.length > 0) {
			const sphere = new Mesh(
				new SphereGeometry(0.2, 32, 32),
				new MeshBasicMaterial({ color: Math.random() * 0xAA4444 }),
			);
			sphere.position.copy(intesects[0].point);
			scene.add(sphere);
		}
	};

	// Load point clouds: lion and pump
	loadPointCloud('/data/lion_takanawa/', 'cloud.js', new Vector3(-10, -2, 5), new Euler(-Math.PI / 2, 0, 0), undefined, false, true, false);
	loadPointCloud('/data/lion_takanawa/', 'cloud.js', new Vector3(0, -2, 10), new Euler(-Math.PI / 2, 0, 0), undefined, true, false, false);
	loadPointCloud('/data/pump/', 'metadata.json', new Vector3(0, -1.5, 3), new Euler(-Math.PI / 2, 0, 0), new Vector3(2, 2, 2), true, false, true);

	function loadPointCloud(baseUrl: string, url: string, position?: Vector3, rotation?: Euler, scale?: Vector3, applyClipBox = false, applyClipSphere = false, applyClipPlanes = false) {
		potree.loadPointCloud(url, baseUrl).then(function (pco: PointCloudOctree) {
			const sizeTypeMap: Record<string, PointSizeType> = {
				'Fixed': PointSizeType.FIXED,
				'Attenuated': PointSizeType.ATTENUATED,
				'Adaptive': PointSizeType.ADAPTIVE,
			};
			pco.material.size = params.pointSize;
			pco.material.pointSizeType = sizeTypeMap[params.sizeType] ?? PointSizeType.ADAPTIVE;
			pco.material.shape = 2;
			pco.material.inputColorEncoding = 1;
			pco.material.outputColorEncoding = 1;

			if (position) { pco.position.copy(position); }
			if (rotation) { pco.rotation.copy(rotation); }
			if (scale) { pco.scale.copy(scale); }

			console.log('Pointcloud file loaded', pco);
			pco.showBoundingBox = false;

			const box = pco.pcoGeometry.boundingBox;
			const size = box.getSize(new Vector3());

			const bbMesh = new Mesh(
				new BoxGeometry(size.x, size.y, size.z),
				new MeshBasicMaterial({ color: 0xFF0000, wireframe: true }),
			);
			bbMesh.position.copy(pco.position);
			bbMesh.scale.copy(pco.scale);
			bbMesh.rotation.copy(pco.rotation);
			bbMesh.raycast = () => false;
			size.multiplyScalar(0.5);
			bbMesh.position.add(new Vector3(size.x, size.y, -size.z));
			scene.add(bbMesh);

			if (applyClipPlanes) {
				clipPlanesTarget = pco;
			}

			pco.updateMatrixWorld(true);
			const worldBBox = pco.pcoGeometry.boundingBox.clone().applyMatrix4(pco.matrixWorld);
			const center = worldBBox.getCenter(new Vector3());
			const worldSize = worldBBox.getSize(new Vector3());

			pco.material.clipMode = clipModeMap[params.clipMode];

			if (applyClipBox) {
				// ClipBoxes
				pumpClipBoxesTarget = pco;

				const primaryClipBoxSize = worldSize.clone().multiplyScalar(0.35);
				const secondaryClipBoxSize = worldSize.clone().multiplyScalar(0.25);
				const secondaryClipBoxCenter = center.clone().add(new Vector3(
					worldSize.x * 0.18,
					worldSize.y * 0.08,
					-worldSize.z * 0.12,
				));

				pco.material.setClipBoxes([
					createClipBox(primaryClipBoxSize, center),
					createClipBox(secondaryClipBoxSize, secondaryClipBoxCenter),
				]);
				updatePumpClipBoxModes();

				const addClipBoxHelper = (size: Vector3, position: Vector3, color: number) => {
					const clipBoxHelper = new Mesh(
						new BoxGeometry(size.x, size.y, size.z),
						new MeshBasicMaterial({ color, wireframe: true }),
					);
					clipBoxHelper.position.copy(position);
					clipBoxHelper.raycast = () => false;
					scene.add(clipBoxHelper);
				};

				addClipBoxHelper(primaryClipBoxSize, center, 0x0066FF);
				addClipBoxHelper(secondaryClipBoxSize, secondaryClipBoxCenter, 0x00B894);
			}

			if (applyClipPlanes) {
				// ClipPlane
				planeCenter.copy(center);
				planeExtent.copy(worldSize).multiplyScalar(0.5);

				clipPlaneX.constant = -planeCenter.x;
				clipPlaneY.constant = -planeCenter.y;
				clipPlaneZ.constant = -planeCenter.z;

				updateClipPlanes();
			}

			if (applyClipSphere) {
				// ClipSphere
				const radius = worldSize.length() * 0.25;
				const clipSphere = createClipSphere(center, radius);
				pco.material.clipMode = clipModeMap[params.clipMode];
				pco.material.setClipSpheres([clipSphere]);

				const clipSphereHelper = new Mesh(
					new SphereGeometry(radius, 16, 16),
					new MeshBasicMaterial({ color: 0xFF6600, wireframe: true }),
				);
				clipSphereHelper.position.copy(center);
				clipSphereHelper.raycast = () => false;
				scene.add(clipSphereHelper);
			}

			scene.add(pco);
			pointClouds.push(pco);
		});
	}

	// ---- Camera switch ----
	function switchCamera(toOrthographic: boolean) {
		if (toOrthographic === useOrthographicCamera) return;
		useOrthographicCamera = toOrthographic;

		const current = toOrthographic ? perspectiveCamera : orthographicCamera;
		const target = toOrthographic ? orthographicCamera : perspectiveCamera;
		target.position.copy(current.position);
		target.quaternion.copy(current.quaternion);
		camera = target;

		controls.dispose();
		controls = new OrbitControls(camera, canvas);

		const wasAttached = transformControls.object;
		scene.remove(transformControls);
		transformControls.dispose();
		transformControls = new TransformControls(camera, canvas);
		transformControls.addEventListener('dragging-changed', (event) => {
			controls.enabled = !event.value;
		});
		scene.add(transformControls);
		if (wasAttached) transformControls.attach(wasAttached);

		viewHelper = new ViewHelper(camera, canvas);

		updateSize();
	}

	// ---- gui ----
	const gui = new GUI({ title: 'Potree Demo' });

	// Camera folder
	const cameraFolder = gui.addFolder('Camera');
	cameraFolder.add(params, 'orthographic').name('Orthographic').onChange((v: boolean) => switchCamera(v));

	// EDL folder
	const edlFolder = gui.addFolder('EDL');
	edlFolder.add(params, 'edlEnabled').name('Enabled').onChange((v: boolean) => {
		potreeRenderer.setEDL({ enabled: v });
	});
	edlFolder.add(params, 'edlStrength', 0, 5, 0.1).name('Strength').onChange((v: number) => {
		potreeRenderer.setEDL({ enabled: params.edlEnabled, strength: v });
	});
	edlFolder.add(params, 'edlRadius', 0, 5, 0.1).name('Radius').onChange((v: number) => {
		potreeRenderer.setEDL({ enabled: params.edlEnabled, radius: v });
	});
	edlFolder.close();

	// Clipping folder
	const clipFolder = gui.addFolder('Clipping');
	clipFolder.add(params, 'clipMode', Object.keys(clipModeMap)).name('Clip Mode').onChange((v: string) => {
		const mode = clipModeMap[v];
		for (const pco of pointClouds) pco.material.clipMode = mode;
	});

	const pumpClipBoxesFolder = clipFolder.addFolder('Pump Clip Boxes');
	pumpClipBoxesFolder.add(params, 'pumpClipBox1Mode', Object.keys(clipVolumeModeMap)).name('Box 1 Mode').onChange(() => {
		updatePumpClipBoxModes();
	});
	pumpClipBoxesFolder.add(params, 'pumpClipBox2Mode', Object.keys(clipVolumeModeMap)).name('Box 2 Mode').onChange(() => {
		updatePumpClipBoxModes();
	});

	// Clip Plane sub-folder
	const planeFolder = clipFolder.addFolder('Clip Planes');
	planeFolder.add(clipPlaneState, 'enableX').name('Enable X').onChange(() => updateClipPlanes());
	planeFolder.add(clipPlaneState, 'offsetX', -1, 1, 0.01).name('X Offset').onChange(() => updatePlaneConstant('X'));
	planeFolder.add(clipPlaneState, 'enableY').name('Enable Y').onChange(() => updateClipPlanes());
	planeFolder.add(clipPlaneState, 'offsetY', -1, 1, 0.01).name('Y Offset').onChange(() => updatePlaneConstant('Y'));
	planeFolder.add(clipPlaneState, 'enableZ').name('Enable Z').onChange(() => updateClipPlanes());
	planeFolder.add(clipPlaneState, 'offsetZ', -1, 1, 0.01).name('Z Offset').onChange(() => updatePlaneConstant('Z'));
	planeFolder.add(clipPlaneState, 'showHelpers').name('Show Helpers').onChange(() => updateClipPlanes());

	// Points folder
	const pointsFolder = gui.addFolder('Points');
	pointsFolder.add(params, 'pointSize', 0.1, 5, 0.1).name('Size').onChange((v: number) => {
		for (const pco of pointClouds) pco.material.size = v;
	});
	pointsFolder.add(params, 'sizeType', ['Fixed', 'Attenuated', 'Adaptive']).name('Size Type').onChange((v: string) => {
		const map: Record<string, PointSizeType> = {
			'Fixed': PointSizeType.FIXED,
			'Attenuated': PointSizeType.ATTENUATED,
			'Adaptive': PointSizeType.ADAPTIVE,
		};
		for (const pco of pointClouds) pco.material.pointSizeType = map[v];
	});

	// Interaction folder
	const interactionFolder = gui.addFolder('Interaction');
	interactionFolder.add(params, 'transformMode', ['translate', 'rotate', 'scale']).name('Transform').onChange((v: string) => {
		transformControls.setMode(v as 'translate' | 'rotate' | 'scale');
	});
	interactionFolder.add(params, 'pickMethod', ['Potree', 'Raycaster']).name('Pick Method');
	interactionFolder.close();

	// ---- Render loop ----
	renderer.autoClear = false;

	renderer.setAnimationLoop(() => {
		cube.rotation.y += 0.01;
		potree.updatePointClouds(pointClouds, camera, renderer);
		controls.update();

		// autoClear is disabled to allow ViewHelper to overlay on top of the scene.
		// As a result, we must clear manually at the start of each frame.
		renderer.clear();

		if (!params.edlEnabled) {
			renderer.render(scene, camera);
		} else {
			potreeRenderer.render({ renderer, scene, camera, pointClouds });
		}

		// Render ViewHelper
		viewHelper.render(renderer);
		if (viewHelper.animating) viewHelper.update(clock.getDelta());
	});

	function updateSize() {
		const width = window.innerWidth;
		const height = window.innerHeight;
		renderer.setSize(width, height);

		if (useOrthographicCamera) {
			const aspect = width / height;
			orthographicCamera.left = -orthographicFrustrumSize * aspect / 2;
			orthographicCamera.right = orthographicFrustrumSize * aspect / 2;
			orthographicCamera.top = orthographicFrustrumSize / 2;
			orthographicCamera.bottom = -orthographicFrustrumSize / 2;
			orthographicCamera.updateProjectionMatrix();
		} else {
			perspectiveCamera.aspect = width / height;
			perspectiveCamera.updateProjectionMatrix();
		}
	}

	document.body.onresize = function () {
		updateSize();
	};

	// @ts-ignore
	document.body.onresize();
};
