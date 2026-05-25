



function updateInfoLayer() {
    const elements = {
        roll: document.getElementById('roll-value'),
        pitch: document.getElementById('pitch-value'),
        yaw: document.getElementById('yaw-value'),
        speed: document.getElementById('speed-value'),
        alt: document.getElementById('alt-value')
    };
    if (!Object.values(elements).every(el => el)) return;
 
    state.telemetry.roll =  parseFloat(mavData.get('ATTITUDE_roll_deg')) || 0;
    state.telemetry.pitch = parseFloat(mavData.get('ATTITUDE_pitch_deg')) || 0;
    state.telemetry.yaw =   parseFloat(mavData.get('ATTITUDE_yaw_deg')) || 0;
    state.telemetry.alt =   parseFloat(mavData.get('GPS_RAW_INT_alt')) || 0; // Use GPS altitude
    state.telemetry.speed = parseFloat(mavData.get('GPS_RAW_INT_vel')) || 0;

    Object.entries(elements).forEach(([key, el]) => {
        el.textContent = key === 'speed' || key === 'alt' ?
            state.telemetry[key].toFixed(0) :
            state.telemetry[key].toFixed(1);
    });
}

 
function updateGPSicon(gps_fix_type, hdg) {
  const gpsIcon = document.querySelector('#gps-status .gps_f');
  const gpsPercent = document.getElementById('gps-percent');

  // Check if mavData exists and has the required fields
  if (gps_fix_type &&  hdg) {
			// Example logic for GPS signal strength (adjust based on your MAVLink data)
			let gpsColor;
			      if (!gps_fix_type || gps_fix_type === 0)   gpsColor = '#ff0000'; // Red for no GPS {
			 else if (gps_fix_type <= 3)                             gpsColor = '#ffff00'; // Yellow for medium signal 
			 else                                                            gpsColor = '#00ff00'; // Green for strong signal 

			// Update SVG fill color
			gpsIcon.style.fill = gpsColor;
			// Update heading display (hdg in degrees)
			gpsPercent.textContent = hdg !== undefined ? `${Math.round(hdg)}°` : '--';
		  } 
  else {
			// Default state if no data
			gpsIcon.style.fill = '#ff0000'; // Red for no data
			gpsPercent.textContent = '--';
		  }
}

// === Flight dial Indicators Gauges===
function initializeIndicators() {
    const tabGauges = document.querySelector('#tab-gauges');
    const sideColumn = document.querySelector('.side-column');
    const isMainColumn = tabGauges.closest('.main-column') !== null;
    const isWide = sideColumn?.classList.contains('wide');
    const container = tabGauges.querySelector('.indicator-container');

    container.style.display = isMainColumn || isWide ? 'grid' : 'flex';
    container.style.flexDirection = isWide ? '' : 'column';
    Object.assign(container.style, { width: '100%', height: '100%', boxSizing: 'border-box' });

    const size = isMainColumn ?
        Math.floor(Math.max(150, Math.min(Math.min(container.offsetWidth / 3, container.offsetHeight / 2), 300))) :
        Math.floor(Math.max(100, Math.min((isWide ? Math.min(container.offsetWidth / 3, 150) : container.offsetWidth), 200)));
    const headingMainSize = size * 1.5;

    document.querySelectorAll('.indicator, #indicator-heading-main').forEach(el => {
        while (el.firstChild) el.removeChild(el.firstChild);
        el.style.display = 'block';
        Object.assign(el.style, {
            width: `${el.id === 'indicator-heading-main' ? headingMainSize : size}px`,
            height: `${el.id === 'indicator-heading-main' ? headingMainSize : size}px`,
            margin: isWide || isMainColumn ? '0' : '0 auto'
        });
    });

    if (!state.indicatorsInitialized) {
        state.indicators = {
            airspeed: new FlightIndicators(document.querySelector("#indicator-airspeed"), FlightIndicators.TYPE_AIRSPEED, { size, airspeed: 0, hideBox: true }),
            altimeter: new FlightIndicators(document.querySelector("#indicator-altimeter"), FlightIndicators.TYPE_ALTIMETER, { size, altitude: 0, pressure: 1013.25, hideBox: true }),
            attitude: new FlightIndicators(document.querySelector("#indicator-attitude"), FlightIndicators.TYPE_ATTITUDE, { size, roll: 0, pitch: 0, hideBox: true }),
            heading: new FlightIndicators(document.querySelector("#indicator-heading"), FlightIndicators.TYPE_HEADING, { size, heading: 0, hideBox: true }),
            turn: new FlightIndicators(document.querySelector("#indicator-turn"), FlightIndicators.TYPE_TURN_COORDINATOR, { size, turn: 0, hideBox: true }),
            vertical: new FlightIndicators(document.querySelector("#indicator-vertical"), FlightIndicators.TYPE_VERTICAL_SPEED, { size, verticalSpeed: 0, hideBox: true }),
            headingMain: new FlightIndicators(document.querySelector("#indicator-heading-main"), FlightIndicators.TYPE_HEADING, { includeMechanics: false, size: headingMainSize, heading: 0, hideBox: true, headingSvg: 'heading_yawT.svg' })
        };
        state.indicatorsInitialized = true;
    }

    const mainHeadingWrapper = document.querySelector('#indicator-heading-main-wrapper');
    const mainHeadingEl = document.querySelector('#indicator-heading-main');
    if (mainHeadingWrapper && mainHeadingEl) {
        Object.assign(mainHeadingWrapper.style, { width: `${headingMainSize}px`, height: `${headingMainSize / 2}px` });
        Object.assign(mainHeadingEl.style, { width: `${headingMainSize}px`, height: `${headingMainSize * 2}px`, top: '0' });
        mainHeadingEl.style.display = 'none';
        mainHeadingEl.offsetHeight;
        mainHeadingEl.style.display = 'block';
    }

    container.style.display = 'none';
    container.offsetHeight;
    container.style.display = isMainColumn || isWide ? 'grid' : 'flex';
}

function updateIndicators() {
    const airspeed = mavData.get('VFR_HUD_airspeed') * 1.94384 || 0;
    const altitude = mavData.get('GLOBAL_POSITION_INT_alt') * 0.00328084 || 0;
    const roll = mavData.get('ATTITUDE_roll_deg')   || 0;
    const pitch = mavData.get('ATTITUDE_pitch_deg')   || 0;
    const heading = mavData.get('ATTITUDE_yaw_deg') || 0;
    const turn = mavData.get('VVFR_HUD_heading')   || 0;
    const verticalSpeed = mavData.get('VFR_HUD_climb') * 196.85 || 0;

    state.indicators.airspeed?.updateAirSpeed(airspeed);
    state.indicators.altimeter?.updateAltitude(altitude);
    state.indicators.attitude?.updateRoll(roll);
    state.indicators.attitude?.updatePitch(pitch);
    state.indicators.heading?.updateHeading(heading);
    state.indicators.headingMain?.updateHeading(heading);
    state.indicators.turn?.updateCoordinator(turn);
    state.indicators.vertical?.updateVerticalSpeed(verticalSpeed);
}


// === Sidebar Navigation ===
function setupSidebarNavigation() {
    const elements = {
        leftMenuBtn: document.getElementById('left-menu-btn'),
        rightMenuBtn: document.getElementById('right-menu-btn'),
        leftSidebar: document.getElementById('left-sidebar'),
        rightSidebar: document.getElementById('right-sidebar'),
        overlay: document.getElementById('overlay')
    };

    const openSidebar = (side) => {
        const otherSide = side === 'left' ? 'right' : 'left';
        elements[`${otherSide}Sidebar`].style.width = "0";
        elements[`${side}Sidebar`].style.width = CONFIG.SIDEBAR_WIDTH;
        elements.overlay.style.display = "block";
    };

    const closeNav = () => {
        elements.leftSidebar.style.width = "0";
        elements.rightSidebar.style.width = "0";
        elements.overlay.style.display = "none";
    };

    elements.leftMenuBtn.addEventListener('click', () => openSidebar('left'));
    elements.rightMenuBtn.addEventListener('click', () => openSidebar('right'));
    elements.overlay.addEventListener('click', closeNav);

    document.addEventListener('click', (e) => {
        if (e.target.closest('#left-sidebar, #right-sidebar') && e.target.tagName === 'A') {
            closeNav();
            if (e.target.getAttribute('href') === '#') e.preventDefault();
        }
    });
}


// === Visual Indicators ===

//=================================================================================

function changeColorPeriodically(period) {
    if (state.intervalId) clearInterval(state.intervalId);
    if (period === 0) return;

    const colors = ['#000343', '#FF0000', '#00FF00', '#0000FF', '#FFFF00'];
    let colorIndex = 0;
    const elements = document.querySelectorAll('.periodic-fill');

    state.intervalId = setInterval(() => {
        elements.forEach(el => el.setAttribute('fill', colors[colorIndex]));
        colorIndex = (colorIndex + 1) % colors.length;
    }, period);
}

// === Telemetry Handling ===========================================



function generateMavlinkCommand(wp) {
    // Example MAVLink command structure (simplified)
    const command = {
        command: wp.action === 'MAV_CMD_NAV_WAYPOINT' ? 16 : 183, // 16 for WAYPOINT, 183 for DO_SET_SERVO
        param1: wp.holdTime || 0, // Hold time
        param2: wp.acceptanceRadius || 10, // Acceptance radius
        param3: wp.passThroughRadius || 5, // Pass-through radius
        param4: 0, // Yaw angle (not used here)
        x: wp.latitude,
        y: wp.longitude,
        z: wp.altitude || 100
    };
    console.log('Generated MAVLink command:', command);
    return command;
}

function executeMavlinkCommand(command) {
    // Display command in textarea
    const textarea = document.getElementById('mavlink-commands');
    textarea.value += `Executing: ${JSON.stringify(command, null, 2)}\n`;
    textarea.scrollTop = textarea.scrollHeight;

    // TODO: Implement actual MAVLink command sending via WebSocket or API
    console.log('Executing MAVLink command (implement WebSocket/API):', command);
}




function initContextMenu() {
    // Define sections and their menu IDs
    const sections = [
        { id: 'main-section', menuId: 'context-menu-main-section' },
        { id: 'status-section', menuId: 'context-menu-status-section' },
        { id: 'map-section', menuId: 'context-menu-map-section' }
    ];

    sections.forEach(section => {
        // Remove existing menu if any
        const existingMenu = document.getElementById(section.menuId);
        if (existingMenu) existingMenu.remove();

        // Create context menu
        const menu = document.createElement('div');
        menu.id = section.menuId;
        menu.className = 'context-menu';
        menu.setAttribute('data-for', section.id.replace('-section', '')); // e.g., 'main', 'status', 'map'
        menu.style.position = 'absolute';
        menu.style.zIndex = '1000';
        menu.style.display = 'none';

        const ul = document.createElement('ul');
        menu.appendChild(ul);
        document.body.appendChild(menu);
    });

    // Populate all menus
    updateContextMenus();
}


const updateCoordinateDisplay = memoize((lat, lon) => {
    const latValue = document.getElementById('lat-value');
    const lngValue = document.getElementById('lng-value');
    if (latValue && lngValue) {
        latValue.textContent = lat.toFixed(6);
        lngValue.textContent = lon.toFixed(6);
    }
});


// Make the layer box draggable
function makeDraggable(element) {
    const header = element.querySelector('.layer-header');
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    header.addEventListener('mousedown', startDragging);

    function startDragging(e) {
        initialX = e.clientX - currentX;
        initialY = e.clientY - currentY;
        isDragging = true;
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDragging);
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            // Use left/top for dragging instead of bottom
            element.style.left = `${currentX}px`;
            element.style.top = `${currentY}px`;
            element.style.bottom = 'auto'; // Override bottom to allow free dragging
        }
    }

    function stopDragging() {
        isDragging = false;
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDragging);
    }

    // Initialize position (will be overridden by CSS bottom/left)
    currentX = parseInt(element.style.left) || 20;
    currentY = parseInt(element.style.top) || (window.innerHeight - 220); // Approx bottom: 20px
}

 
////////////////////////////////////

// Initialize Three.js scene for the avatar
function initAvatarScene() {
    const autopilotLayer = document.getElementById('autopilot-layer');
    const canvas = document.getElementById('avatar-canvas');
    if (!autopilotLayer || !canvas) {
        console.error("Could not find autopilot-layer or avatar-canvas elements");
        return;
    }

    // Initialize scene
    state.scene = new THREE.Scene();

    // Initialize camera
    state.camera = new THREE.PerspectiveCamera(
        100, // Field of view
        200 / 160, // Aspect ratio (width: 200px, height: 200px - 40px header)
        0.1, // Near plane
        1000 // Far plane
    );
	
    state.camera.position.set(0, 0, 3.5); // Closer for head model

    // Initialize renderer
    state.renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true });
    state.renderer.setSize(200, 160); // Canvas size (200px wide, 200px - 40px header)

    // Add lighting
              const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    state.scene.add(ambientLight);
              const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
                    directionalLight.position.set(0, 1, 1);
    state.scene.add(directionalLight);

    // Load GLB avatar head
    const loader = new THREE.GLTFLoader();
	const glbPath = '/models/avatar2.glb';
    loader.load(
        glbPath, // Replace with your .glb file path or URL
        (gltf) => {
                            state.avatar = gltf.scene;
            state.scene.add(state.avatar);

            // Center and scale the model
            const box = new THREE.Box3().setFromObject(state.avatar);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            // Move model to origin
           // state.avatar.position.sub(center);

            // Scale to fit canvas (aim for head to fill ~80% of height)
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 2 / maxDim; // Adjust to fit 160px height
           // state.avatar.scale.set(scale, scale, scale);
			
			state.avatar.position.set(0, -12, -2);
			state.avatar.scale.set(30, 25, 25);
			state.avatar.rotation.set(0, 0, 0);

            // Slight upward adjustment for head focus
             state.avatar.position.y += -2;

            console.log("Avatar loaded successfully from:", glbPath);
            console.log("Model bounding box:", box);
            animateAvatar();
        },
        (progress) => {
            console.log(`Loading avatar: ${(progress.loaded / progress.total * 100).toFixed(2)}%`);
        },
        (error) => {
            console.error("Error loading avatar:", error);
        }
    );

    // Animation loop
    function animateAvatar() {
        if (state.renderer && state.scene && state.camera) {
            requestAnimationFrame(animateAvatar);
            // Optional: Rotate avatar for effect
           // if (state.avatar) state.avatar.rotation.y += 0.01;
             
            state.renderer.render(state.scene, state.camera);
        }
    }
}


////////////////////////////////////////////
// === Context Menus ===
const sectionContents = {
    main: {
        menuItems: [
            { action: 'tWebcam', text: 'Toggle Webcam' },
            { action: 'tHUD', text: 'Toggle HUD' },
            { action: 'tInfo', text: 'Toggle Info' },
			{ action: 'tDetection', text: 'Toggle Detection' },
            { action: 'tHeading', text: 'Toggle Heading' }
        ]
    },
    map: { 
        menuItems: [
            { action: 'set-main', text: 'Set as Main', section: 'map' },
			{ action: 'onlineMap', text: state.mapOnlineMode ? 'Set Offline Map' : 'Set Online Map' }, // Dynamic initial text
			{ action: 'go-home', text: 'Go Home' },
            { action: 'zoom-in', text: 'Zoom In' },
            { action: 'zoom-out', text: 'Zoom Out' },
			{ action: 'Load-Mission', text: 'Load Mission' },
			{ action: 'Hide-Mission', text: 'Hide-Mission' },
			{ action: 'Fly-here', text: 'Fly here' },
			{ action: 'Land-here', text: 'Land here' },
			{ action: 'Hower-Hear', text: 'Hower Hear' },
			{ action: 'Add-Point', text: 'Add Point' },
			{ action: 'Edit-Point', text: 'Edit Param' },
			{ action: 'Delete-Point', text: 'Delete Point' },
			{ action: 'Clear-Point', text: 'Clear Points' }	
        ]
    },
    'map-tabs': {
        menuItems: [
            { action: 'set-main', text: 'Set as Main', section: 'map' },
			{ action: 'refresh', text: 'Refresh' },
            { action: 'reset', text: 'Reset Settings' }
            
        ]
    },
    status: {
        menuItems: [
            { action: 'set-main', text: 'Set as Main', section: 'status' },
			{ action: 'refresh', text: 'Refresh' },
            { action: 'update', text: 'Update Status' }
            
        ]
    }
};



/**
 * Handle right-click context menu with proper DOM inspection
 */
function handleContextMenu(e) {
    e.preventDefault();
    const sectionId = e.currentTarget.id;
    const menu = document.getElementById(`context-menu-${sectionId}`);
    
    if (!menu) {
        console.warn(`❌ No context menu found for ${sectionId}`);
        return;
    }

    // Hide all other menus
    document.querySelectorAll('.context-menu').forEach(m => {
        if (m !== menu) m.style.display = 'none';
    });

    // ════════════════════════════════════════════════════════════════════
    // PROPER DOM INSPECTION to detect clicked camera
    // ════════════════════════════════════════════════════════════════════
    
    let clickedCameraId = null;
    let clickedElement = e.target;
    
    // Try multiple selectors in order of specificity
    const selectors = [
        '.camera-slot',
        '[data-cam-id]',
        '[data-camera-id]',
        '.camera-feed'
    ];
    
    for (const selector of selectors) {
        const element = clickedElement.closest(selector);
        if (element) {
            // Extract camera ID from multiple possible sources
            const candidates = [
                element.dataset.camId,
                element.dataset.cameraId,
                element.id?.replace('camera-slot-', ''),
                element.id?.replace('camera-feed-', ''),
                element.id?.replace('slot-', '')
            ];
            
            for (const candidate of candidates) {
                if (candidate) {
                    const parsed = parseInt(candidate, 10);
                    if (!isNaN(parsed)) {
                        clickedCameraId = parsed;
                        break;
                    }
                }
            }
            
            if (clickedCameraId !== null) break;
        }
    }
    
    // Store for other handlers
    state.clickedCameraId = clickedCameraId;
    
    if (clickedCameraId !== null) {
        console.log(`🎯 RIGHT-CLICK ON CAMERA ${clickedCameraId}`);
        console.log(`   Element: ${clickedElement.className}`);
    } else {
        console.log(`ℹ️  RIGHT-CLICK ON EMPTY AREA`);
    }

    // ════════════════════════════════════════════════════════════════════
    // MAP HANDLING (unchanged)
    // ════════════════════════════════════════════════════════════════════
    
    if (sectionId === 'map-section' && state.map) {
        const pixel = state.map.getEventPixel(e);
        const coordinate = state.map.getCoordinateFromPixel(pixel);
        const lonLat = ol.proj.toLonLat(coordinate, 'EPSG:3857');
        state.contextMenuCoord = { lat: lonLat[1], lon: lonLat[0] };

        state.selectedWaypoint = null;
        state.map.forEachFeatureAtPixel(pixel, (feature, layer) => {
            if (feature.get('type') === 'waypoint' && layer === state.missionLayer) {
                state.selectedWaypoint = feature;
                return true;
            }
        }, {
            hitTolerance: 30,
            layerFilter: (layer) => layer === state.missionLayer
        });
    } else {
        state.contextMenuCoord = null;
        state.selectedWaypoint = null;
    }

    // ════════════════════════════════════════════════════════════════════
    // UPDATE MENU with clicked camera
    // ════════════════════════════════════════════════════════════════════
    
    if (typeof CameraUI?.updateMenuItems === 'function') {
        CameraUI.updateMenuItems(clickedCameraId);
    } else {
        console.warn('⚠️  CameraUI.updateMenuItems unavailable, updating generically');
        updateContextMenus();
    }

    // Position menu
    menu.style.display = 'block';
    const menuRect = menu.getBoundingClientRect();
    
    let top = e.clientY;
    let left = e.clientX;
    
    if (menuRect.bottom > window.innerHeight) {
        top = e.clientY - menuRect.height;
    }
    if (menuRect.right > window.innerWidth) {
        left = e.clientX - menuRect.width;
    }

    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    
    console.log(`📍 Menu at (${left}, ${top})`);
}



// Wire the event listener to your main layout wrapper grid container
document.getElementById('camera-grid')?.addEventListener('contextmenu', handleContextMenu);


function hideAllContextMenus() {
    const menus = document.querySelectorAll('.context-menu, #map-context-menu');
    menus.forEach(menu => {
        menu.style.display = 'none';
    });
}

//updateContextMenus --> handleMenuItemClick --> addMissionPoint

function updateContextMenus() {
    const mainSectionType = document.querySelector('[data-location="main"]').getAttribute('data-section');
    document.querySelectorAll('.context-menu').forEach(menu => {
        const menuFor = menu.getAttribute('data-for');
        const menuUl = menu.querySelector('ul');
        menuUl.innerHTML = '';
        if (sectionContents[menuFor]) {
            const menuItems = sectionContents[menuFor].menuItems.filter(item => {
                if (menuFor === 'map' && (item.action === 'Edit-Point' || item.action === 'Delete-Point')) {
                    return !!state.selectedWaypoint;
                }
                return item.action !== 'set-main' || menuFor !== mainSectionType;
            });

            //console.log(`Context menu for ${menuFor}:`, menuItems.map(item => item.text));

            menuItems.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item.action === 'onlineMap' ? (state.mapOnlineMode ? 'Set Offline Map' : 'Set Online Map') : item.text;
                li.setAttribute('data-action', item.action);
                if (item.section) li.setAttribute('data-section', item.section);
                li.addEventListener('click', handleMenuItemClick);
                menuUl.appendChild(li);
            });

            if (menuFor !== mainSectionType && !menuItems.some(item => item.action === 'set-main')) {
                const li = document.createElement('li');
                li.textContent = 'Set as Main';
                li.setAttribute('data-action', 'set-main');
                li.setAttribute('data-section', menuFor);
                li.addEventListener('click', handleMenuItemClick);
                menuUl.appendChild(li);
            }
        }
    });
}


function handleMenuItemClick(e) { //else if (action === 'Add-Point')
    const action = e.target.getAttribute('data-action');
    const section = e.target.getAttribute('data-section');
    const layers = { tWebcam: 'webcam-layer', tHUD: 'hud-layer', tInfo: 'info-layer', tHeading: 'heading-layer' };

    if (!action) return;

    //console.log(`Menu item clicked: ${action}`);

         if (action === 'set-main') {        swapSections(section);    } 
	else if (action in layers) {	
        const layerKey = action.slice(1).toLowerCase();
        state.layerStates[layerKey] = !state.layerStates[layerKey];
        const layer = document.getElementById(layers[action]);
        layer.style.display = state.layerStates[layerKey] ? 'block' : 'none';
        if (action === 'tHUD') {
            if (state.layerStates.hud) {
                resizeCanvases();
                drawHUD();
            } else {
                stopHUDAnimation();
            }
        }
    } 
	else if (action === 'go-home') {	//gotoHome(lat, lon, fixType);
        if (mavData.has('GPS_RAW_INT_lat') && mavData.has('GPS_RAW_INT_lon') && mavData.has('GPS_RAW_INT_fix_type')) {
            const lat = mavData.get('GPS_RAW_INT_lat');
            const lon = mavData.get('GPS_RAW_INT_lon');
            const fixType = mavData.get('GPS_RAW_INT_fix_type');
            gotoHome(lat, lon, fixType);
        } else {
            console.warn('GPS data not available for Go Home');
        }
    } 
	else if (action === 'onlineMap') {        state.mapOnlineMode = !state.mapOnlineMode;        updateMapSource();        updateContextMenus();    } 
	else if (action === 'zoom-in') {        state.map.getView().setZoom(state.map.getView().getZoom() + 1);    } 
	else if (action === 'zoom-out') {        state.map.getView().setZoom(state.map.getView().getZoom() - 1);    } 
	else if (action === 'Add-Point') {	//   addMissionPoint(
        if (state.contextMenuCoord) {
          //  console.log('handleMenuItemClick Add-Point:', state.contextMenuCoord);
            addMissionPoint(state.contextMenuCoord.lat, state.contextMenuCoord.lon);
        } 
		else console.warn('No coordinates available for Add Point');
    } 
	else if (action === 'Edit-Point') { //  editMissionPoint(
        if (state.selectedWaypoint) {
            console.log('Editing waypoint:', state.selectedWaypoint.getId());
            editMissionPoint(state.selectedWaypoint);
        } 
		else  console.warn('No waypoint selected for Edit Param');
    } 
	else if (action === 'Delete-Point') {
        if (state.selectedWaypoint) {
            console.log('Deleting waypoint:', state.selectedWaypoint.getId());
            deleteMissionPoint(state.selectedWaypoint);
        } else {
            console.warn('No waypoint selected for Delete Point');
        }
    } 
	else if (action === 'Clear-Point') {
        current_mission.waypoints = [];
        state.missionSource.getFeatures().forEach(feature => {
            if (feature.get('type') === 'waypoint' || feature.getGeometry().getType() === 'LineString') {
                state.missionSource.removeFeature(feature);
            }
        });
        updateMissionTable();
        console.log('Cleared all waypoints');
        state.missionLayer.changed();
        state.map.renderSync();
    } 
	else if (action === 'Load-Mission') {
        console.log('Load Mission triggered');
    } 
	else if (action === 'Hide-Mission') {
        console.log('Hide Mission triggered');
        state.missionLayer.setVisible(!state.missionLayer.getVisible());
        state.map.renderSync();
    } 
	else if (action === 'Fly-here') {
        if (state.contextMenuCoord) {
            console.log('Fly here triggered at:', state.contextMenuCoord);
        } else {
            console.warn('No coordinates available for Fly here');
        }
    } 
	else if (action === 'Land-here') {
        if (state.contextMenuCoord) {
            console.log('Land here triggered at:', state.contextMenuCoord);
        } else {
            console.warn('No coordinates available for Land here');
        }
    } 
	else if (action === 'Hover-Here') {
        if (state.contextMenuCoord) {
            console.log('Hover here triggered at:', state.contextMenuCoord);
        } else {
            console.warn('No coordinates available for Hover here');
        }
    }
	else if (CameraUI.handleAction(action)) {
			// ← CameraUI handled: toggle-detection, cycle-layout,
			//   cam-promote-N, cam-swap-A-B
		}
    hideAllContextMenus();
}

function swapSections(sectionToSetAsMain) {
    const mainColumn = document.querySelector('.main-column');
    const sideColumn = document.querySelector('.side-column');
    const mainSection = mainColumn.querySelector('.section');
    const currentMainType = mainSection.getAttribute('data-section');
    if (sectionToSetAsMain === currentMainType) return;

    const sectionToSwap = document.getElementById(`${sectionToSetAsMain}-section`);
    const sideSections = sideColumn.querySelectorAll('.section');
    const otherSideSection = Array.from(sideSections).find(sideSec => sideSec.id !== sectionToSwap.id);

    const mainContent = document.createElement('div');
    while (mainSection.firstChild) mainContent.appendChild(mainSection.firstChild);
    const swapContent = document.createElement('div');
    while (sectionToSwap.firstChild) swapContent.appendChild(sectionToSwap.firstChild);

    mainSection.append(...swapContent.childNodes);
    sectionToSwap.append(...mainContent.childNodes);

    mainSection.id = `${sectionToSetAsMain}-section`;
    mainSection.setAttribute('data-section', sectionToSetAsMain);
    mainSection.setAttribute('data-location', 'main');
    mainSection.className = 'section';
    sectionToSwap.id = `${currentMainType}-section`;
    sectionToSwap.setAttribute('data-section', currentMainType);
    sectionToSwap.setAttribute('data-location', 'side');
    sectionToSwap.className = `section ${sectionToSetAsMain === 'map' ? 'status-section' : 'map-section'}`;

    sideColumn.innerHTML = '';
    const rowResizer = document.createElement('div');
    rowResizer.id = 'row-resizer';
    rowResizer.className = 'row-resizer';
    sideColumn.append(...(sectionToSetAsMain === 'map' ? [sectionToSwap, rowResizer, otherSideSection] : [otherSideSection, rowResizer, sectionToSwap].filter(Boolean)));

    sideColumn.querySelectorAll('.section').forEach(section => {
        Object.assign(section.style, { flex: '0 0 50%', minHeight: '100px', overflow: 'hidden' });
    });

    Object.assign(sideColumn.style, { display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' });

    const statusSection = sideColumn.querySelector('.status-section');
    if (statusSection) {
        Object.assign(statusSection.style, { display: 'flex', flexDirection: 'column', flex: '0 0 50%', overflow: 'hidden', minHeight: '100px' });
        const statusContent = statusSection.querySelector('#status-content');
        if (statusContent) {
            Object.assign(statusContent.style, { flex: '1', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' });
        }
        const tabContent = statusSection.querySelector('.tab-content');
        if (tabContent) {
            Object.assign(tabContent.style, { height: '100%', width: '100%', overflowY: 'auto', padding: '15px', boxSizing: 'border-box', display: 'block' });
        }
    }

    reinitializeTabs();
    initMapTabs();
    initRowResizer();
    updateRowResizerPosition();
    forceLayoutRecalculation();
    updateContextMenus();

    document.querySelectorAll('.section').forEach(section => {
        section.removeEventListener('contextmenu', handleContextMenu);
        section.addEventListener('contextmenu', handleContextMenu);
    });

    updateColumnResizerPosition();
    if (sectionToSetAsMain === 'main') ensureWebcamActive();

      setTimeout(() => {
        if (document.getElementById('main-section')) {
            resizeCanvases();
            requestAnimationFrame(drawHUD);
        }
        if (sectionToSetAsMain === 'map' || currentMainType === 'map') {
            if (state.map) {
                state.map.updateSize();
                state.map.renderSync();
                const mapCanvas = document.getElementById('map_canvas');
                if (mapCanvas && document.getElementById('tab-map').classList.contains('active')) {
                    mapCanvas.style.display = 'block';
                }
                if (state.markerSource && state.markerFeature && !state.markerSource.hasFeature(state.markerFeature)) {
                    state.markerSource.addFeature(state.markerFeature);
                    console.log('Re-added marker after section swap');
                }
                if (mavData.has('GPS_RAW_INT_lat') && mavData.has('GPS_RAW_INT_lon') && mavData.has('GPS_RAW_INT_fix_type')) {
                    const lat = mavData.get('GPS_RAW_INT_lat');
                    const lon = mavData.get('GPS_RAW_INT_lon');
                    const fixType = mavData.get('GPS_RAW_INT_fix_type');
                   // console.log('Section swap. GPS data:', { lat, lon, fixType });
                    if (fixType >= 2 && lat !== 0 && lon !== 0 && !isNaN(lat) && !isNaN(lon)) {
                        console.log('Valid GPS data found after section swap. Updating map.');
                        updateMarker(lat, lon, fixType, null, null, { centerMap: true, zoomLevel: 18 });
                    }
                }
            }
        }
        if (sectionToSetAsMain === 'status' || currentMainType === 'status') {
            if (document.getElementById('tab-gauges').classList.contains('active')) {
                state.indicatorsInitialized = false;
                initializeIndicators();
                updateIndicators();
                const indicatorContainer = document.getElementById('tab-gauges').querySelector('.indicator-container');
                if (indicatorContainer) {
                    indicatorContainer.style.display = document.getElementById('tab-gauges').closest('.main-column') ? 'grid' : 'flex';
                    Object.assign(indicatorContainer.style, { width: '100%', height: '100%' });
                }
            }
        }
    }, 100);
	
	
	
	
}


// === Layout and Resizing ===
function forceLayoutRecalculation() {
    const sideColumn = document.querySelector('.side-column');
    const statusSection = sideColumn?.querySelector('.status-section');
    const tabContent = statusSection?.querySelector('.tab-content');
    if (tabContent) {
        tabContent.style.display = 'none';
        tabContent.offsetHeight;
        tabContent.style.display = 'block';
    }
    if (sideColumn) {
        sideColumn.style.display = 'none';
        sideColumn.offsetHeight;
        sideColumn.style.display = 'flex';
    }
    if (state.map) state.map.updateSize();
}

function reinitializeTabs() {
    const statusSection = document.getElementById('status-section');
    if (!statusSection) return;

    statusSection.addEventListener('click', (e) => {
        const button = e.target.closest('.tab-button');
        if (!button) return;
        const targetTab = button.getAttribute('data-tab');
        statusSection.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        statusSection.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
            pane.style.display = 'none';
        });
        button.classList.add('active');
        const targetPane = document.getElementById(targetTab);
        if (targetPane) {
            targetPane.classList.add('active');
            targetPane.style.display = 'block';
            if (targetTab === 'tab-gauges') {
                setTimeout(() => {
                    state.indicatorsInitialized = false;
                    initializeIndicators();
                    updateIndicators();
                    const indicatorContainer = targetPane.querySelector('.indicator-container');
                    if (indicatorContainer) {
                        indicatorContainer.style.display = targetPane.closest('.main-column') ? 'grid' : 'flex';
                        Object.assign(indicatorContainer.style, { width: '100%', height: '100%' });
                    }
                }, 0);
            }
        }
    });

    let activeButton = statusSection.querySelector('.tab-button.active') || statusSection.querySelector('.tab-button');
    if (activeButton) {
        activeButton.classList.add('active');
        const targetTab = activeButton.getAttribute('data-tab');
        statusSection.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
            pane.style.display = 'none';
        });
        const targetPane = document.getElementById(targetTab);
        if (targetPane) {
            targetPane.classList.add('active');
            targetPane.style.display = 'block';
            if (targetTab === 'tab-gauges') {
                setTimeout(() => {
                    state.indicatorsInitialized = false;
                    initializeIndicators();
                    updateIndicators();
                    const indicatorContainer = targetPane.querySelector('.indicator-container');
                    if (indicatorContainer) {
                        indicatorContainer.style.display = targetPane.closest('.main-column') ? 'grid' : 'flex';
                        Object.assign(indicatorContainer.style, { width: '100%', height: '100%' });
                    }
                }, 0);
            }
        }
    }

    const tabContent = statusSection.querySelector('.tab-content');
    if (tabContent) {
        Object.assign(tabContent.style, { height: '100%', width: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' });
        tabContent.offsetHeight;
    }
}

function initColumnResizer() {
    const resizer = document.getElementById('column-resizer');
    const contentArea = document.querySelector('.content-area');
    const mainColumn = document.querySelector('.main-column');
    const sideColumn = document.querySelector('.side-column');
    updateColumnResizerPosition();

    resizer.addEventListener('mousedown', e => {
        e.preventDefault();
        resizer.classList.add('active');
        const startX = e.pageX;
        const startMainWidth = mainColumn.offsetWidth;
        const startSideWidth = sideColumn.offsetWidth;
        const totalWidth = contentArea.offsetWidth;

        const onMouseMove = (e) => {
            const diffX = e.pageX - startX;
            let newMainWidth = startMainWidth + diffX;
            let newSideWidth = startSideWidth - diffX;
            if (newMainWidth < 200) newMainWidth = 200;
            if (newSideWidth < 100) newSideWidth = 100;
            if (newMainWidth + newSideWidth > totalWidth) {
                newSideWidth = diffX > 0 ? totalWidth - newMainWidth : newMainWidth = totalWidth - newSideWidth;
            }
            mainColumn.style.flex = `0 0 ${(newMainWidth / totalWidth) * 100}%`;
            sideColumn.style.flex = `0 0 ${(newSideWidth / totalWidth) * 100}%`;
            sideColumn.classList.toggle('wide', newSideWidth >= 400);
            resizeCanvases();
            if (document.getElementById('tab-gauges').classList.contains('active')) {
                state.indicatorsInitialized = false;
                initializeIndicators();
                updateIndicators();
            }
            updateColumnResizerPosition();
            if (state.map) state.map.updateSize();
        };

        const onMouseUp = () => {
            resizer.classList.remove('active');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (state.map) state.map.updateSize();
            if (document.getElementById('tab-gauges').classList.contains('active')) {
                state.indicatorsInitialized = false;
                initializeIndicators();
                updateIndicators();
            }
            resizeCanvases();
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

function initRowResizer() {
    const sideColumn = document.querySelector('.side-column');
    let resizer = document.getElementById('row-resizer');
    const sections = sideColumn.querySelectorAll('.section');
    if (!resizer && sections.length === 2) {
        resizer = document.createElement('div');
        resizer.id = 'row-resizer';
        resizer.className = 'row-resizer';
        sideColumn.insertBefore(resizer, sections[1]);
    }
    if (!resizer || sections.length < 2) return;

    const [topSection, bottomSection] = sections;
    sections.forEach(section => Object.assign(section.style, { flex: '0 0 50%', minHeight: '100px', overflow: 'hidden' }));

    const newResizer = resizer.cloneNode(true);
    resizer.parentNode.replaceChild(newResizer, resizer);
    newResizer.addEventListener('mousedown', e => {
        e.preventDefault();
        newResizer.classList.add('active');
        const startY = e.pageY;
        const startTopHeight = topSection.offsetHeight;
        const startBottomHeight = bottomSection.offsetHeight;
        const totalHeight = sideColumn.offsetHeight;

        const onMouseMove = (e) => {
            const diffY = e.pageY - startY;
            let newTopHeight = startTopHeight + diffY;
            let newBottomHeight = startBottomHeight - diffY;
            if (newTopHeight < 100) newTopHeight = 100;
            if (newBottomHeight < 100) newBottomHeight = 100;
            topSection.style.flex = `0 0 ${(newTopHeight / totalHeight) * 100}%`;
            bottomSection.style.flex = `0 0 ${(newBottomHeight / totalHeight) * 100}%`;
            updateRowResizerPosition();
            if (state.map) state.map.updateSize();
        };

        const onMouseUp = () => {
            newResizer.classList.remove('active');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (state.map) state.map.updateSize();
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
    updateRowResizerPosition();
}

function updateColumnResizerPosition() {
    const resizer = document.getElementById('column-resizer');
    const mainRect = document.querySelector('.main-column').getBoundingClientRect();
    resizer.style.left = `${mainRect.right - 4}px`;
}

function updateRowResizerPosition() {
    const resizer = document.getElementById('row-resizer');
    if (!resizer) return;
    const sideColumn = document.querySelector('.side-column');
    const [topSection] = sideColumn.querySelectorAll('.section');
    if (!topSection) return;
    const topRect = topSection.getBoundingClientRect();
    const sideRect = sideColumn.getBoundingClientRect();
    Object.assign(resizer.style, { top: `${topRect.bottom - sideRect.top - 4}px`, left: '0', width: `${sideRect.width}px` });
}

// === HUD and Canvas Drawing ===
let lastCanvasSizes = {};
function resizeCanvases() {
    const hudLayer = document.getElementById('hud-layer');
    if (!hudLayer) return;

    const canvases = {
        hud: document.getElementById('hudCanvas'),
        alt: document.getElementById('altCanvas'),
        speed: document.getElementById('speedCanvas')
    };

    const visibility = Object.fromEntries(Object.entries(canvases).map(([k, v]) => [k, v.style.display !== 'none']));
    Object.values(canvases).forEach(canvas => canvas.style.display = 'block');
    const isMainColumn = hudLayer.closest('.main-column') !== null;

    const sizes = isMainColumn ? {
        hud: { width: hudLayer.offsetWidth * 0.6, height: hudLayer.offsetHeight * 0.8 },
        alt: { width: hudLayer.offsetWidth * 0.15, height: hudLayer.offsetHeight * 0.6 },
        speed: { width: hudLayer.offsetWidth * 0.15, height: hudLayer.offsetHeight * 0.6 }
    } : {
        hud: { width: hudLayer.offsetWidth * 0.8, height: hudLayer.offsetHeight * 0.6 },
        alt: { width: hudLayer.offsetWidth * 0.2, height: hudLayer.offsetHeight * 0.6 },
        speed: { width: hudLayer.offsetWidth * 0.2, height: hudLayer.offsetHeight * 0.6 }
    };

    if (JSON.stringify(sizes) === JSON.stringify(lastCanvasSizes)) {
        Object.entries(visibility).forEach(([k, v]) => canvases[k].style.display = v ? 'block' : 'none');
        return;
    }

    lastCanvasSizes = sizes;
    Object.entries(sizes).forEach(([key, { width, height }]) => {
        canvases[key].width = width;
        canvases[key].height = height;
        canvases[key].style.display = visibility[key] ? 'block' : 'none';
    });

    requestAnimationFrame(drawHUD);
}

function drawRollPitchIndicator(ctx, { width, height }) {
    ctx.clearRect(0, 0, width, height);
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.4;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(-state.telemetry.roll * Math.PI / 180);
    ctx.strokeStyle = 'green';
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';

    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-radius, state.telemetry.pitch * 5);
    ctx.lineTo(radius, state.telemetry.pitch * 5);
    ctx.stroke();

    for (let i = -90; i <= 90; i += 5) {
        const yPos = (i - state.telemetry.pitch) * 5;
        if (yPos > -radius && yPos < radius) {
            if (i % 10 === 0) {
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-60, yPos);
                ctx.lineTo(60, yPos);
                ctx.stroke();
                ctx.textAlign = 'right';
                ctx.fillText(i < 0 ? `-${Math.abs(i)}` : i, -70, yPos + 5);
                ctx.textAlign = 'left';
                ctx.fillText(i < 0 ? `-${Math.abs(i)}` : i, 70, yPos + 5);
            } else {
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(-30, yPos);
                ctx.lineTo(30, yPos);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(-15, yPos);
                ctx.lineTo(-5, yPos);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(5, yPos);
                ctx.lineTo(15, yPos);
                ctx.stroke();
            }
        }
    }

    ctx.restore();
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 50, centerY);
    ctx.lineTo(centerX + 50, centerY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 20);
    ctx.lineTo(centerX - 15, centerY);
    ctx.lineTo(centerX + 15, centerY);
    ctx.closePath();
    ctx.stroke();
}

function drawAltitudeIndicator(ctx, { width, height }) {
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 2;
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';

    const centerY = height / 2;
    const tapeHeight = height * 0.8;
    const W = width;

    ctx.strokeStyle = '#00f';
    ctx.strokeRect(W / 4, centerY - tapeHeight / 2, W / 4, tapeHeight);

    const currentAlt = state.telemetry.alt  || 0;
    const pixelsPerUnit = tapeHeight / 50;
    const minVisibleAlt = Math.floor(currentAlt / 50) * 50 - 50;
    const maxVisibleAlt = Math.ceil(currentAlt / 50) * 50 + 50;

    ctx.strokeStyle = '#0f0';
    for (let alt = minVisibleAlt; alt <= maxVisibleAlt; alt += 10) {
        if (alt < 0) continue;
        const yPos = centerY - (alt - currentAlt) * pixelsPerUnit;
        if (yPos > centerY - tapeHeight / 2 && yPos < centerY + tapeHeight / 2) {
            if (alt % 50 === 0) {
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(W / 2 - 10, yPos);
                ctx.lineTo(W / 2 + 10, yPos);
                ctx.stroke();
                ctx.fillStyle = '#0f0';
                ctx.fillText(alt, W / 2 + 25, yPos + 5);
            } else if (alt % 10 === 0) {
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(W / 2 - 10, yPos);
                ctx.lineTo(W / 2 + 10, yPos);
                ctx.stroke();
            } else if (alt % 5 === 0) {
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(W / 2 - 10, yPos);
                ctx.lineTo(W / 2 + 10, yPos);
                ctx.stroke();
            }
        }
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, centerY - 15, W / 2, 30);
    ctx.fillStyle = '#0f0';
    ctx.font = '16px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${currentAlt.toFixed(0)} >`, W / 4, centerY + 5);
    ctx.font = '14px monospace';
    ctx.fillText('Altitude', W / 4, 2 * centerY - 20);
}

function drawSpeedIndicator(ctx, { width, height }) {
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 2;
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';

    const centerY = height / 2;
    const tapeHeight = height * 0.8;
    const W = width;

    ctx.strokeStyle = '#00f';
    ctx.strokeRect(W / 2, centerY - tapeHeight / 2, W / 4, tapeHeight);

    const currentSpeed = state.telemetry.speed || 0;
    const pixelsPerUnit = tapeHeight / 50;
    const minVisibleSpeed = Math.floor(currentSpeed / 50) * 50 - 50;
    const maxVisibleSpeed = Math.ceil(currentSpeed / 50) * 50 + 50;

    ctx.strokeStyle = '#0f0';
    for (let speed = minVisibleSpeed; speed <= maxVisibleSpeed; speed += 10) {
        if (speed < 0) continue;
        const yPos = centerY - (speed - currentSpeed) * pixelsPerUnit;
        if (yPos > centerY - tapeHeight / 2 && yPos < centerY + tapeHeight / 2) {
            if (speed % 50 === 0) {
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(W / 2 - 10, yPos);
                ctx.lineTo(W / 2 + 10, yPos);
                ctx.stroke();
                ctx.fillStyle = '#0f0';
                ctx.fillText(speed, W / 2 - 30, yPos + 5);
            } else if (speed % 10 === 0) {
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(W / 2 - 10, yPos);
                ctx.lineTo(W / 2 + 10, yPos);
                ctx.stroke();
            } else if (speed % 5 === 0) {
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(W / 2 - 10, yPos);
                ctx.lineTo(W / 2 + 10, yPos);
                ctx.stroke();
            }
        }
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(W / 2, centerY - 15, W / 2, 30);
    ctx.fillStyle = '#0f0';
    ctx.font = '16px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`< ${currentSpeed.toFixed(0)}`, W / 2, centerY + 5);
    ctx.font = '14px monospace';
    ctx.fillText('Speed', W / 2, 2 * centerY - 20);
}



function drawHUD() {
    const hudLayer = document.getElementById('hud-layer');
    if (!hudLayer || !state.layerStates.hud) {
        state.animationFrameId = requestAnimationFrame(drawHUD);
        return;
    }

    const currentTelemetry = JSON.stringify(state.telemetry);
    if (currentTelemetry === state.lastTelemetry) {
        state.animationFrameId = requestAnimationFrame(drawHUD);
        return;
    }
    state.lastTelemetry = currentTelemetry;

    const canvases = {
        hud: { canvas: document.getElementById('hudCanvas'), draw: drawRollPitchIndicator },
        alt: { canvas: document.getElementById('altCanvas'), draw: drawAltitudeIndicator },
        speed: { canvas: document.getElementById('speedCanvas'), draw: drawSpeedIndicator }
    };

    Object.values(canvases).forEach(({ canvas, draw }) => {
        if (canvas.style.display !== 'none') {
            draw(canvas.getContext('2d'), { width: canvas.width, height: canvas.height });
        }
    });

    state.animationFrameId = requestAnimationFrame(drawHUD);
}

function stopHUDAnimation() {
    if (state.animationFrameId) {
        cancelAnimationFrame(state.animationFrameId);
        state.animationFrameId = null;
    }
}



// === Initialization ===
document.addEventListener('DOMContentLoaded', async () => {
    setupSidebarNavigation();
    reinitializeTabs();
    setupArmButton();
    initColumnResizer();
    initRowResizer();
    initMap();		// Initialize map with marker layer
	initMapTabs();	
	initializeSensorTable();
	initContextMenu();
    ['main-section', 'map-section', 'status-section'].forEach(id => { document.getElementById(id).addEventListener('contextmenu', handleContextMenu); });
    updateContextMenus();
	
	// Initialize mission table and controls
    updateMissionTable();
    initMissionControls();
	

   
 

    // === Webcam and Visual Elements ===
     

    resizeCanvases();
    // CameraHandler.init();
    // CameraHandler.onCameraConnected();
	
    if (document.getElementById('tab-gauges').classList.contains('active')) {
        state.indicatorsInitialized = false;
        initializeIndicators();
        updateIndicators();
    }

    // const voiceSelector = document.getElementById('voice-selector');
    // if (voiceSelector) {
     //   Set initial value from state
        // voiceSelector.value = state.voicePreference || 'edge';
        
    //    Listen for changes
        // voiceSelector.addEventListener('change', (e) => {
            // state.voicePreference = e.target.value;
            // console.log(`📢 Voice preference changed to: ${e.target.value}`);
        // });
    // }
	
// Initialize camera state
      initializeCameraState();
      initializeVideoStream();  // Initialize HTTP video streaming
     
       // Setup detection button if it exists
       // setupDetectionButton();  // TODO: Implement detection button setup
// Start WebSocket connection
    initWebSocket();
    popupMessage.init();
    initFlightModeButtons();
   // setInterval(updateTelemetry, CONFIG.TELEMETRY_INTERVAL);
    drawHUD();
	////////////////////////

      // === Map Initialization ===Ensure map is visible and updated when map tab is active
    const mapTab = document.getElementById('tab-map');
    if   (mapTab?.classList.contains('active') && state.map) {
        state.map.updateSize();
        const mapCanvas = document.getElementById('map_canvas');
        if (mapCanvas)   mapCanvas.style.display = 'block'; 
    }
//////////////////////////////
    window.addEventListener('resize', debounce(() => {
        resizeCanvases();
        if (document.getElementById('tab-gauges').classList.contains('active')) {
            state.indicatorsInitialized = false;
            initializeIndicators();
            updateIndicators();
        }
        if (state.map && document.getElementById('tab-map').classList.contains('active')) {
            state.map.updateSize();
            document.getElementById('map_canvas').style.display = 'block';
        }
    }, CONFIG.DEBOUNCE_DELAY));

 // Update table when MISSION_CURRENT_seq changes
	// mavData.on('change:MISSION_CURRENT_seq', debounce(() => {
		// const seq = mavData.get('MISSION_CURRENT_seq') || 0;
		// speechSynthesisPlayer(`Waypoint ${seq} reached`, false, 3);
		// updateMissionTable();
	// }, 1000));

 
		
	document.getElementById('autopilot-icon').addEventListener('click', function(e) { toggleAutopilot(); });
	
	initAvatarScene();
 
	const autopilotLayer = document.getElementById('autopilot-layer');
    if (autopilotLayer) {
					// Make draggable
					makeDraggable(autopilotLayer);

					// Add close button functionality
					const closeBtn = document.getElementById('close-layer-btn');
					if (closeBtn) {
						closeBtn.addEventListener('click', () => {
							autopilotLayer.style.display = 'none';
							state.autoPilot = false; // Turn off autopilot
							const icon = document.getElementById('autopilot-icon');
							if (icon) {
								icon.style.fill = '#000000'; // Reset icon color
							}
							//console.log("Autopilot disabled via close button, new state:", state.autoPilot);
						});
					}
				} 
			//	else   console.error("Autopilot layer not found in DOM"); 

 

// REPLACE with:
const audioToggle = document.getElementById('audio-toggle');
if (audioToggle) {
    // Wire click FIRST (creates AudioContext inside the user gesture)
    audioToggle.addEventListener('click', toggleBatteryWarning);
    // Set initial icon state without creating AudioContext
    const icon = audioToggle.querySelector('path');
    if (icon) {
        icon.setAttribute('d', 'M16 9C16.5 9.5 17 10.5 17 12C17 13.5 16.5 14.5 16 15M19 6C20.5 7.5 21 10 21 12C21 14 20.5 16.5 19 18M13 3L7 8H5C3.89543 8 3 8.89543 3 10V14C3 15.1046 3.89543 16 5 16H7L13 21V3Z');
        icon.setAttribute('stroke', '#00ff00');
    }
}
// Voices load async — start detection now (no AudioContext needed)
if (window.speechSynthesis) {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
        if (typeof UnifiedAudioQueue !== 'undefined') UnifiedAudioQueue.initEdgeVoice();
    }, { once: true });
}

});

