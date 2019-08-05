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
 * @author: Sven Linßen
 */
var _3dviewer = function(options) {

    options = typeof options !== 'undefined' ? options : {};
    if (!options.hasOwnProperty('containerId'))
        options.containerId = "3d-container";
    if (!options.hasOwnProperty('loaderId'))
        options.loaderId = "loader";
    if (!options.hasOwnProperty('progressId'))
        options.progressId = "progress";
    if (!options.hasOwnProperty('backendUri'))
        options.backendUri = "http://arachne.dainst.org/data";
    if (!options.hasOwnProperty('frontendUri'))
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
    var modelType = null;

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
            var onLoad = function(objmtl) {
                var objmtl = objmtl;
                return function (event){
                        event.detail.loaderRootNode.traverse(function(child) {
                            if (child instanceof THREE.Mesh) {
                                var tempGeo = new THREE.Geometry().fromBufferGeometry(child.geometry);
                                tempGeo.mergeVertices();
                                tempGeo.computeVertexNormals();
                                tempGeo.computeFaceNormals();
                                child.geometry = new THREE.BufferGeometry().fromGeometry(tempGeo);
                                if(objmtl == false) defaultMaterial(child);
                            }
                        });
                        scene.add(event.detail.loaderRootNode);
                        prepareView();
                    }
            };

            switch (response.format) {
                case 'obj':
                    objLoader(modelUrl, onLoad, loaderOnProgress, loaderOnError);
                    break;
                case 'objmtl':
                    objmtlLoader(modelUrl, onLoad, loaderOnProgress, loaderOnError, materialUrl);
                    break;
                case 'dae':
                    daeLoader(modelUrl, loaderOnProgress, loaderOnError);
                    break;
                case 'glb':
                case 'gltf':
                    gltfLoader(modelUrl, loaderOnProgress, loaderOnError);
                    break;
            }
        }
    }

    function defaultMaterial(child){
        var phongMaterial = new THREE.MeshPhongMaterial({
            ambient: 0x555555,
            color: 0xb0b0b0,
            specular: 0xffffff,
            shininess: 0,
            reflectivity: 0.2,
            flatShading: true
        });
        child.material = phongMaterial;
    }

    function prepareView() {
        viewAll();
        cl.hide();
        var progress = document.getElementById(options.progressId);
        progress.innerHTML = '';
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

    function objLoader(modelUrl, onLoad, loaderOnProgress, loaderOnError) {
        var loader = new THREE.OBJLoader2();
        loader.load(modelUrl, onLoad(false), loaderOnProgress, loaderOnError, null, false);
    }

    function objmtlLoader(modelUrl, onLoad, loaderOnProgress, loaderOnError, materialUrl) {
        var loader = new THREE.OBJLoader2();
        var onLoadMtl = function(materials) {
            loader.setMaterials(materials);
            loader.load(modelUrl, onLoad(true), loaderOnProgress, loaderOnError);
        }
        loader.setResourcePath(materialUrl + '/');
        loader.loadMtl(materialUrl, null, onLoadMtl, null, null, '');

        viewAll();
    }

    function daeLoader(modelUrl, loaderOnProgress, loaderOnError) {
        var dae, loader = new THREE.ColladaLoader();
        loader.load(modelUrl, function(collada) {
            dae = collada.scene;

            dae.traverse(function(child) {
                if (child instanceof THREE.Mesh) {
                    var tempGeo = new THREE.Geometry().fromBufferGeometry(child.geometry);
                    tempGeo.mergeVertices();
                    tempGeo.computeVertexNormals();
                    tempGeo.computeFaceNormals();
                    child.geometry = new THREE.BufferGeometry().fromGeometry(tempGeo);
                }
            });
            scene.add(dae);
            prepareView();
        }, loaderOnProgress, loaderOnError);
    }

    function gltfLoader(modelUrl, loaderOnProgress, loaderOnError) {
        var loader = new THREE.GLTFLoader();

        THREE.DRACOLoader.setDecoderPath('/js/libs/draco/');
        loader.setDRACOLoader(new THREE.DRACOLoader());

        THREE.DRACOLoader.getDecoderModule();

        loader.load(modelUrl, function(gltf) {

            scene.add(gltf.scene);

            gltf.animations; // Array<THREE.AnimationClip>
            gltf.scene; // THREE.Scene
            gltf.scenes; // Array<THREE.Scene>
            gltf.cameras; // Array<THREE.Camera>
            gltf.asset; // Object

            prepareView();
        }, loaderOnProgress, loaderOnError);
    }

    function computeSceneBoundingSphere() {
        scene.traverse(function(object) {
            if (object instanceof THREE.Mesh) {
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
                } else { // join scene and object bounding spheres
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

    function init() {
        container = document.createElement('div');
        document.getElementById(options.containerId).appendChild(container);

        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 10);
        scene = new THREE.Scene();

        // retrieve meta data
        id = getIdFromUrl();
        if (id != null && isNumeric(id)) {
            canvasLoadingBar();

            var materialUrl = options.backendUri + '/model/material/' + id;
            var metaUrl = options.backendUri + '/model/meta/' + id;
            // get meta data

            var request = new XMLHttpRequest();
            request.open('get', metaUrl);
            request.send();

            request.onreadystatechange = function() {
                if (request.readyState == 4 && request.status === 200) {
                    response = JSON.parse(request.responseText);
                    // show meta info
                    var modelTitle = response.title;
                    var modelUrl = options.backendUri + '/model/file' + response.path + '/' + response.fileName;
                    var entityLink = response.connectedEntity;
                    if (modelTitle) {
                        var title = document.getElementById('title');
                        title.innerHTML = modelTitle;
                        if (entityLink) {
                            title.innerHTML = modelTitle + '(<a href="' + options.frontendUri + '/entity/' + entityLink + '" target="_blank">' + entityLink + '</a>)';
                        }
                    }
                    document.getElementById('data').innerHTML = '<b>Modeller: </b>' + response.modeller + '<br/>' + '<b>License: </b>' + response.license;

                    if (modelType == null) lightTypeHandler();

                    manager = new THREE.LoadingManager();

                    loadModel(response.format, modelUrl, materialUrl);
                }
            }
        } else return false;

        initScene();
        initGUI();

        window.addEventListener('resize', onWindowResize, false);
        return true;
    }

    function lightTypeHandler() {
        if (response.modelType == 'object' || response.modelType == 'objectfrontal' || response.modelType == 'building') {
            modelType = response.modelType;
            switch (modelType) {
                case 'object':
                    objectLight();
                    break;
                case 'objectfrontal':
                    objectFrontalLight();
                    break;
                case 'building':
                    buildingLight();
                    break;
            }
        } else fallbackLight();
    }

    function objectLight() {
        var ambient = new THREE.AmbientLight(0xffffff, 0.6);
        ambient.position.set( 0, 50, 0 );
        scene.add(ambient);

        var directional = new THREE.DirectionalLight(0xffffff, 0.2);
        directional.position.set( 25, -25, 50 );
        scene.add(directional);

        camLight = new THREE.PointLight(0x9b9b9b, 0.8, 0, 2);
        camLight.position.copy(camera.position.clone());
        scene.add(camLight);
        lightYOffset = 1;
    }

    function objectFrontalLight() {
        var ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
        scene.add(ambientLight);

        var directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(1, 1, 0).normalize();
        scene.add(directionalLight);
    }

    function buildingLight() {
        var ambient = new THREE.AmbientLight(0xffffff, 0.2);
        scene.add(ambient);

        var directional = new THREE.DirectionalLight(0xffffff, 0.8);
        scene.add(directional);

        camLight = new THREE.PointLight(0x9b9b9b);
        camLight.position.copy(camera.position.clone());
        scene.add(camLight);
        lightYOffset = 1;
    }

    function fallbackLight() {
        console.log("The lightning is not adapted to this model due to missing modeltype. Fallbacklight is enabled.")
        hemiLight = new THREE.AmbientLight(0xffffff, 0.6);
        hemiLight.position.set(0, 50, 0);
        scene.add(hemiLight);

        directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(1, 1, 0).normalize();
        scene.add(directionalLight);

        camLight = new THREE.PointLight(0x9b9b9b, 0.5, 0, 2);
        camLight.position.copy(camera.position.clone());
        scene.add(camLight);
        lightYOffset = 1;
    }

    function canvasLoadingBar() {
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
    }

    function initScene() {
        // renderer
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
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
            Mode: 'Trackball',
            FPS: false,
            Info: false,
            Help: false
        }

        var gui = new dat.GUI({
            autoPlace: false
        });
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

        if (camLight != null) {
            camLight.position.copy(camera.position);
            camLight.position.y += lightYOffset;
        }

        render();
    }

    function render() {
        renderer.render(scene, camera);
        if (typeof stats !== 'undefined') {
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
