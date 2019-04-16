/**
 * 3d model viewer for arachne.
 * Factory function takes the following options:
 * - containerId: id attribute of the HTML element that will act as container for the viewer
 * - loaderId: id attribute for the HTML element that will act as container for the loader
 * - progressId: id attribute for the HTML element that will act as container for the loading progress
 * - backendUri: the URI of the arachne backend
 * - frontendUri: the URI of the arachne frontend
 *
 * @author: Reimar Grabowski
 * @author: Sebastian Cuy
 */
var _3dviewer = function(options) {

	options = typeof options !== 'undefined' ? options : {};
	if(!options.hasOwnProperty('containerId'))
		options.containerId = "3d-container";
	if(!options.hasOwnProperty('loaderId'))
		options.loaderId = "loader";
	if(!options.hasOwnProperty('progressId'))
		options.progressId = "progress";
	if(!options.hasOwnProperty('backendUri'))
		options.backendUri = "http://arachne.dainst.org/data";
	if(!options.hasOwnProperty('frontendUri'))
		options.frontendUri = "http://arachne.dainst.org";

	if (!Detector.webgl)
		Detector.addGetWebGLMessage();

	var container, stats;
	var camera, cameraControls, scene, renderer, camLight, settings;
	var cross, model, oldCamY, lightYOffset, cl, manager;
	var sceneCenter = new THREE.Vector3();
	var sceneRadius = 0;
	var fpsControls = false;
	var helpTextChanged = false;
	var clock = new THREE.Clock();

	var trackballHelpText = '<table cellspacing="10">' + '<tr><td>Left mouse button</td><td>=</td><td>Move camera</td></tr>' + '<tr><td>Right mouse button</td><td>=</td><td>Move camera target</td></tr>' + '</table>';

	var flyHelpText = '<table cellspacing="10">' + '<tr><td>Mouse pointer</td><td>=</td><td>Look</td></tr>' + '<tr><td>Left mouse button/W/Up</td><td>=</td><td>Move forward</td></tr>' + '<tr><td>Right mouse button/S/Down</td><td>=</td><td>Move backward</td></tr>' + '<tr><td>+</td><td>=</td><td>Increase move speed</td></tr>' + '<tr><td>-</td><td>=</td><td>Decrease move speed</td></tr>' + '<tr><td>A/Left</td><td>=</td><td>Strafe left</td></tr>' + '<tr><td>D/Right</td><td>=</td><td>Strafe right</td></tr>' + '<tr><td>R</td><td>=</td><td>Fly up</td></tr>' + '<tr><td>F</td><td>=</td><td>Fly down</td></tr>' + '<tr><td>Q</td><td>=</td><td>Freeze/Unfreeze camera</td></tr>' + '</table>';

	var loaderOnProgress = function(xhr) {
		if (xhr.lengthComputable) {
			var percentComplete = xhr.loaded / xhr.total * 100;
			var progress = document.getElementById(options.progressId);
			progress.innerHTML = Math.round(percentComplete, 2) + ' %';
		}
	};

	var loaderOnError = function(error) {
        console.log(error);
	};

	if (init()) {
		animate();
	}

	function loadModel(format, modelUrl, materialUrl) {
		if (manager) {
			var onLoad = function(event) {
				scene.add(event.detail.loaderRootNode);
				viewAll();
				cl.hide();
				var progress = document.getElementById(options.progressId);
				progress.innerHTML = '';
			}
			switch(response.format) {
			case 'obj':
				new THREE.OBJLoader2()
                    .load(modelUrl, onLoad, loaderOnProgress, loaderOnError, null, false);
				break;
			case 'objmtl':
                var loader = new THREE.OBJLoader2();
                var onLoadMtl = function(materials) {
                    loader.setMaterials(materials);
                    loader.load(modelUrl, onLoad, loaderOnProgress, loaderOnError);
                }
                loader.setResourcePath( materialUrl + '/' );
                loader.loadMtl(materialUrl, null, onLoadMtl, null, null, '');
				break;
            // code for using old OBJLoader
            // TODO: delete when decision to use OBJLoader2 is final
			case 'objmtl_old':
				new THREE.MTLLoader()
                    .setCrossOrigin('')
                    .setResourcePath( materialUrl + '/' )
                    .setMaterialOptions({ 'side': THREE.DoubleSide })
                    .load(materialUrl, function(materials) {
                        materials.preload();
                        new THREE.OBJLoader()
                            .setMaterials(materials)
                            .load(modelUrl, onLoad, loaderOnProgress, loaderOnError);
                    });
				break;
			}
		}
	}

	function computeSceneBoundingSphere() {
		scene.traverse(function(object) {
			if ( object instanceof THREE.Mesh) {
				// object radius
				object.geometry.computeBoundingSphere();
				var radius = object.geometry.boundingSphere.radius;

				// object center in world space
				var objectCenterLocal = object.geometry.boundingSphere.center.clone();
				var objectCenterWorld = object.localToWorld(objectCenterLocal);

				// if there is no scene bs yet, the objects bs is the scenes new bs
				if (sceneRadius == 0) {
					sceneRadius = radius;
					sceneCenter = objectCenterWorld;
				} else {// join scene and object bounding spheres
					// normalized direction from scene bs center to object bs center
					var centerDir = objectCenterWorld.clone().sub(sceneCenter);
					var distance = centerDir.length();
					// distance between centers
					centerDir.normalize();
					if (centerDir.lengthSq() > 0) {
						// one sphere is fully contained within the other
						if (distance + Math.min(sceneRadius, radius) < Math.max(sceneRadius, radius)) {
							if (sceneRadius < radius) {
								sceneRadius = radius;
								sceneCenter = objectCenterWorld;
							}
						} else {
							var intersection1 = sceneCenter.clone().sub(centerDir.clone().multiplyScalar(sceneRadius));
							var intersection2 = objectCenterWorld.clone().add(centerDir.clone().multiplyScalar(radius));
							// half distance between intersections
							sceneRadius = intersection1.distanceTo(intersection2) / 2.0;
							sceneCenter = intersection1.clone().add(centerDir.clone().multiplyScalar(sceneRadius));
						}
					} else {
						// bs centers are the same
						sceneRadius = Math.max(sceneRadius, radius);
					}
				}
			}
		});

	}

	function viewAll() {
		computeSceneBoundingSphere();
		var halfFovInRad = 0.5 * (45 * Math.PI / 180);
		// fovy
		if (window.innerWidth < window.innerHeight) {
			var halfFovInRad = Math.atan((window.innerWidth / window.innerHeight) * Math.tan(halfFovInRad));
			// fovx
		}
		var zDistance = sceneCenter.z + sceneRadius / Math.sin(halfFovInRad);
		camera.position.set(sceneCenter.x, sceneCenter.y, zDistance);
		camera.near = sceneRadius / 1000;
		camera.far = sceneRadius * 100;
		camera.updateProjectionMatrix();

		if (cameraControls) {
			cameraControls.target.copy(sceneCenter);
		}
	}

	function init() {
		container = document.createElement('div');
		document.getElementById(options.containerId).appendChild(container);

		camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 10);

		// scene
		scene = new THREE.Scene();

		// lights
		var ambient = new THREE.AmbientLight(0x373737);
		scene.add(ambient);

		var directional = new THREE.DirectionalLight(0x373737);
		scene.add(directional);

		camLight = new THREE.PointLight(0x9b9b9b);
		camLight.position.copy(camera.position.clone());
		scene.add(camLight);
		lightYOffset = 1;

		// retrieve meta data
		id = getIdFromUrl();
		if (id == null) {
			initScene();
			initGUI();

			window.addEventListener('resize', onWindowResize, false);
			return true;
		} else {
			if (isNumeric(id)) {
				// add load indicator
				cl = new CanvasLoader(options.loaderId);
				cl.setColor('#ffffff');
				// default is '#000000'
				cl.setShape('square');
				// default is 'oval'
				cl.setDiameter(80);
				// default is 40
				cl.setDensity(120);
				// default is 40
				cl.setRange(1.1);
				// default is 1.3
				cl.setSpeed(2);
				// default is 2
				cl.setFPS(25);
				// default is 24
				cl.show();
				// Hidden by default

				var modelUrl = options.backendUri + '/model/' + id;
				var materialUrl =  options.backendUri + '/model/material/' + id;

				// get meta data
				var request = new XMLHttpRequest();
				request.open('get', modelUrl + '?meta=true');
				request.send();

				request.onreadystatechange = function() {
					if (request.readyState == 4 && request.status === 200) {
						response = JSON.parse(request.responseText);
						// show meta info
						var modelTitle = response.title;
						var entityLink = response.connectedEntity;
						if (modelTitle) {
							var title = document.getElementById('title');
							title.innerHTML = modelTitle;
							if (entityLink) {
								title.innerHTML = modelTitle + '(<a href="' + options.frontendUri + '/entity/' + entityLink + '" target="_blank">' + entityLink + '</a>)';
							}
						}
						document.getElementById('data').innerHTML = '<b>Modeller: </b>' + response.modeller + '<br/>' + '<b>License: </b>' + response.license;

						// loading manager
						manager = new THREE.LoadingManager();
						/*manager.onProgress = function(item, loaded, total) {
						 console.log(item, loaded, total);
						 };*/

						loadModel(response.format, modelUrl, materialUrl);
					}
				}

				initScene();
				initGUI();

				window.addEventListener('resize', onWindowResize, false);
				return true;
			} else {
				return false;
			}
		}
	}

	function initScene() {
		// renderer
		renderer = new THREE.WebGLRenderer({
			antialias : true,
			alpha : true
		});
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setClearColor(0x000000, 0);
		container.appendChild(renderer.domElement);

		// controls
		cameraControls = new THREE.TrackballControls(camera, renderer.domElement);
		cameraControls.rotateSpeed = 0.8;
		cameraControls.zoomSpeed = 0.3;
		cameraControls.panSpeed = 0.25;
		cameraControls.noZoom = false;
		cameraControls.noPan = false;
		cameraControls.staticMoving = false;
		cameraControls.dynamicDampingFactor = 0.25;
	}

	function initGUI() {
		var help = document.getElementById('help');
		help.innerHTML = trackballHelpText;
		help.addEventListener('transitionend', function() {
			if (helpTextChanged) {
				setHelpText();
				slideHelpIn();
			}
		});

		settings = {
			Mode : 'Trackball',
			FPS : false,
			Info : true,
			Help : true
		}

		var gui = new dat.GUI({ autoPlace: false });
		var guiContainer = document.getElementById('gui');
		guiContainer.appendChild(gui.domElement);

		var changeController = function() {
			// Controller
			cameraControls.removeEventHandlers();
			if (settings.Mode === 'Trackball') {
				viewAll();
				camera.up.set(0, 1, 0);
				cameraControls = new THREE.TrackballControls(camera, renderer.domElement);
				cameraControls.rotateSpeed = 0.8;
				cameraControls.zoomSpeed = 0.3;
				cameraControls.panSpeed = 0.25;
				cameraControls.noZoom = false;
				cameraControls.noPan = false;
				cameraControls.staticMoving = false;
				cameraControls.dynamicDampingFactor = 0.25;
				helpTextChanged = true;
				slideHelpOut();
			} else {
				viewAll();
				camera.up.set(0, 1, 0);
				cameraControls = new THREE.FirstPersonControls(camera, renderer.domElement);
				cameraControls.movementSpeed = sceneRadius / 6;
				cameraControls.lookSpeed = 0.1;
				cameraControls.lookVertical = true;
				helpTextChanged = true;
				slideHelpOut();
			}
			render();
		}
		gui.add(settings, "Mode", ['Trackball', 'Fly']).onChange(changeController);

		var toggleInfo = function() {
			if (settings.Info) {
				slideInfoIn();
			} else {
				slideInfoOut();
			}
		}
		gui.add(settings, 'Info', settings.Info).onChange(toggleInfo);
		toggleInfo();

		var toggleHelp = function() {
			if (settings.Help) {
				setHelpText();
				slideHelpIn();
			} else {
				slideHelpOut();
			}
		}
		gui.add(settings, 'Help', settings.Help).onChange(toggleHelp);
		toggleHelp();
	}

	function onWindowResize() {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(window.innerWidth, window.innerHeight);
	}

	function animate() {
		requestAnimationFrame(animate);
		cameraControls.update(clock.getDelta());

		camLight.position.copy(camera.position);
		camLight.position.y += lightYOffset;

		render();
	}

	function render() {
		renderer.render(scene, camera);
		if ( typeof stats !== 'undefined') {
			stats.update();
		}
	}

	function slideHelpIn() {
		var elem = document.getElementById('help');
		elem.style.transition = "right 0.2s ease-in-out 0s";
		elem.style.right = "0px";
	}

	function slideHelpOut() {
		var elem = document.getElementById('help');
		elem.style.transition = "right 0.2s ease-in-out 0s";
		elem.style.right = "-450px";
	}

	function slideInfoIn() {
		var elem = document.getElementById('data');
		elem.style.transition = "left 0.2s ease-in-out 0s";
		elem.style.left = "0px";
	}

	function slideInfoOut() {
		var elem = document.getElementById('data');
		elem.style.transition = "left 0.2s ease-in-out 0s";
		elem.style.left = "-500px";
	}

	function slideFPSIn() {
		var elem = stats.domElement;
		elem.style.transition = "left 0.2s ease-in-out 0s";
		elem.style.left = "0px";
	}

	function slideFPSOut() {
		var elem = stats.domElement;
		elem.style.transition = "left 0.2s ease-in-out 0s";
		elem.style.left = "-200px";
	}

	function setHelpText() {
		if (settings.Mode === 'Trackball') {
			document.getElementById('help').innerHTML = trackballHelpText;
		} else {
			document.getElementById('help').innerHTML = flyHelpText;
		}
		helpTextChanged = false;
	}

	function getIdFromUrl() {
		var searchString = window.location.search.substring(1);
		var urlParams = searchString.split("&");
		var values;
		for (var i = 0; i < urlParams.length; i++) {
			values = urlParams[i].split("=");
			if (values[0] == "id") {
				return decodeURIComponent(values[1]);
			}
		}
		return null;
	}

	function isNumeric(value) {
		return !isNaN(value) && isFinite(value);
	}

	function endsWith(str, suffix) {
		return str.indexOf(suffix, str.length - suffix.length) !== -1;
	}

}
