function initMap() {
    const mapCanvas = document.getElementById('map_canvas');

    if (!mapCanvas || mapCanvas.offsetWidth === 0 || mapCanvas.offsetHeight === 0) {
        console.warn('Map container not ready or has invalid dimensions. Retrying...');
        setTimeout(initMap, 100);
        return;
    }

    if (!state.map) {
        // Use latest GPS coordinates or default
        let defaultCenter = ol.proj.fromLonLat([174.6632274, -36.8875983], 'EPSG:3857');
        let initialLat = -36.8875983;
        let initialLon = 174.6632274;
        let initialFixType = 0;
        if (mavData.has('GPS_RAW_INT_lat') && mavData.has('GPS_RAW_INT_lon') && mavData.has('GPS_RAW_INT_fix_type')) {
            const lat = mavData.get('GPS_RAW_INT_lat');
            const lon = mavData.get('GPS_RAW_INT_lon');
            const fixType = mavData.get('GPS_RAW_INT_fix_type');
            if (fixType >= 2 && lat !== 0 && lon !== 0) {
                defaultCenter = ol.proj.fromLonLat([lon, lat], 'EPSG:3857');
                initialLat = lat;
                initialLon = lon;
                initialFixType = fixType;
            }
        }

        const initialHeading = mavData.get('ATTITUDE_yaw_deg') || 0;
        const initialType    = mavData.get('HEARTBEAT_type')  || 'UNKNOWN';
        console.log(`Initializing map: type=${initialType}, heading=${initialHeading.toFixed(2)}°`);

        state.missionSource = new ol.source.Vector();
        state.missionLayer = new ol.layer.Vector({
            source: state.missionSource,
            style: (feature) => {
                const geometryType = feature.getGeometry().getType();
               // console.log('Applying style to feature:', geometryType, feature.getId());
                if (geometryType === 'Point') return applyPointStyle(feature);
                else if (geometryType === 'LineString') {
                    return new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: '#0000FF',
                            width: 2
                        })
                    });
                }
                return null;
            },
            zIndex: 100
        });

        state.map = new ol.Map({
            view: new ol.View({
                center: defaultCenter,
                zoom: 15,
                minZoom: 9,
                maxZoom: 18
            }),
            target: 'map_canvas',
            layers: [
                new ol.layer.Tile({
                    source: state.mapOnlineMode
                        ? new ol.source.OSM()
                        : new ol.source.XYZ({
                              tileUrlFunction: ([z, x, y]) => `./SatelliteMap/${z}/${x}/${Math.pow(2, z) - 1 - y}.jpg`,
                              tileSize: 256
                          }),
                    zIndex: 0
                }),
                new ol.layer.Vector({
                    source: new ol.source.Vector(),
                    zIndex: 50
                }),
                state.missionLayer
            ]
        });

        state.markerSource = state.map.getLayers().getArray()[1].getSource();
        state.markerFeature = new ol.Feature({
            geometry: new ol.geom.Point(defaultCenter),
            type: 'drone'
        });
        state.markerFeature.setId('drone');
        state.markerSource.addFeature(state.markerFeature);

        // Initialize home point
        if (mavData.has('GPS_RAW_INT_lat') && mavData.has('GPS_RAW_INT_lon') && mavData.has('GPS_RAW_INT_fix_type')) {
            const lat = mavData.get('GPS_RAW_INT_lat');
            const lon = mavData.get('GPS_RAW_INT_lon');
            const fixType = mavData.get('GPS_RAW_INT_fix_type');
            if (fixType >= 2 && lat !== 0 && lon !== 0) {
                current_mission.home = {
                    sequence: 0,
                    latitude: lat,
                    longitude: lon,
                    missionType: 'Flight Plan',
                    action: 'MAV_CMD_NAV_WAYPOINT',
                    altitude: 100,
                    speed: 'Medium',
                    arrivedTime: -1,
                    holdTime: 0,
                    acceptanceRadius: 10,
                    passThroughRadius: 5
                };
                const homeCoord = ol.proj.fromLonLat([lon, lat], 'EPSG:3857');
                const homeFeature = new ol.Feature({
                    geometry: new ol.geom.Point(homeCoord),
                    type: 'home'
                });
                homeFeature.setId('home');
                state.missionSource.addFeature(homeFeature);
                console.log('Initialized home point:', current_mission.home);
            }
        }

        console.log('Map initialized. Canvas dimensions:', mapCanvas.offsetWidth, mapCanvas.offsetHeight);
        console.log('Mission layer initialized:', state.missionLayer);

        const resizeObserver = new ResizeObserver(() => {
            if (state.map) {
                setTimeout(() => {
                    state.map.updateSize();
                    updateMarker(initialLat, initialLon, initialFixType);
                    state.missionLayer.changed();
                    state.map.renderSync();
                }, 100);
            }
        });
        resizeObserver.observe(mapCanvas);

        state.map.on('pointermove', (e) => {
            const lonLat = ol.proj.toLonLat(e.coordinate, 'EPSG:3857');
            updateCoordinateDisplay(lonLat[1], lonLat[0]);
        });

        document.getElementById('map_canvas').addEventListener('mouseleave', () => updateCoordinateDisplay(0, 0));

        initContextMenu();
        initWaypointInteraction();

        // Listen for zoom changes
        state.map.getView().on('change:resolution', () => {
            updateMarker(initialLat, initialLon, initialFixType);
           // console.log('Zoom changed, updated marker position:', { lat: initialLat, lon: initialLon });
        });

        // Initial marker update
        updateMarker(initialLat, initialLon, initialFixType);

        state.missionSource.changed();
        state.missionLayer.changed();
        state.map.renderSync();
    }

    state.map.updateSize();

    if (document.getElementById('tab-map')?.classList.contains('active')) {
        updateMarker(
            mavData.get('GPS_RAW_INT_lat') || -36.8875983,
            mavData.get('GPS_RAW_INT_lon') || 174.6632274,
            mavData.get('GPS_RAW_INT_fix_type') || 0
        );
        state.map.getLayers().getArray()[1].changed();
        state.missionLayer.changed();
        state.map.renderSync();
    }
}

// === Map Tabs ===

function initMapTabs(){
    const mapSection = document.getElementById('map-section');
          mapSection.addEventListener('click', (e) => {
														const button = e.target.closest('.tab-button');
														if (!button) return;
														const targetTab = button.getAttribute('data-tab');
														mapSection.querySelectorAll('.tab-button, .tab-pane').forEach(el => el.classList.remove('active'));
														button.classList.add('active');
														const targetPane = document.getElementById(targetTab);
														      targetPane.classList.add('active');
														if (targetTab === 'tab-map' && state.map) {
															setTimeout(() => {
																			state.map.updateSize();
																			document.getElementById('map_canvas').style.display = 'block';
																			}, 0);
														}
													 });

    const activeButton = mapSection.querySelector('.tab-button.active');
      if (activeButton) {
						const targetTab = activeButton.getAttribute('data-tab');
						document.getElementById(targetTab).classList.add('active');
						if (targetTab === 'tab-map' && state.map) {
																	setTimeout(() => {
																						state.map.updateSize();
																						document.getElementById('map_canvas').style.display = 'block';
																					}, 0);
																}
					}
}


function applyPointStyle(feature) {
    const type = feature.get('type');
    let iconSrc = markEncodedIcons;
    let scale = 1;

    // Check if this is the selected waypoint
    const isSelected = type === 'waypoint' && state.selectedWaypoint && feature.getId() === state.selectedWaypoint.getId();
    if (isSelected) {
       // console.log(`Applying selected style to waypoint-${feature.get('sequence')}`);
        iconSrc = selectedMarkEncodedIcons; // Red icon
        scale = 1.2;
    } else if (type === 'home') {
       // console.log(`Applying home style to ${feature.getId()}`);
        iconSrc = markEncodedIcons; // Blue icon
        scale = 1.2;
    } else {
       //console.log(`Applying default style to ${feature.getId() || type}`);
    }

    try {
        return new ol.style.Style({
            image: new ol.style.Icon({
                src: iconSrc,
                scale: scale,
                anchor: [0.5, 1],
                imgSize: [24, 24]
            })
        });
    } catch (e) {
        console.warn('Failed to apply icon style, using fallback:', e);
        return new ol.style.Style({
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({ color: type === 'home' ? '#FF0000' : '#0000FF' }),
                stroke: new ol.style.Stroke({ color: '#FFFFFF', width: 1 })
            })
        });
    }
}

function updateMapSource() {
    if (!state.map) {
        console.warn('Map not initialized. Cannot update source.');
        return;
    }

    // Get the tile layer (first layer in the map's layer array)
    const tileLayer = state.map.getLayers().getArray()[0];

    // Set new source based on map mode
    const newSource = state.mapOnlineMode
        ? new ol.source.OSM()
        : new ol.source.XYZ({
              tileUrlFunction: ([z, x, y]) => `./SatelliteMap/${z}/${x}/${Math.pow(2, z) - 1 - y}.jpg`,
              tileSize: 256
          });

    tileLayer.setSource(newSource);
    console.log(`Map source updated to ${state.mapOnlineMode ? 'online (OSM)' : 'offline (XYZ)'}`);

    // Force map to render
    state.map.updateSize();
    state.map.renderSync();
}

function updateMarker(lat, lon, fixType, type, heading, options = {}) {
    if (!state.map || !state.markerFeature || !state.markerSource) {
        console.warn('Cannot update marker: map or marker not initialized');
        return;
    }

    const { centerMap = false, zoomLevel = null } = options;

    // Validate GPS data
    const isValidPosition = (
							lat !== undefined &&
							lon !== undefined &&
							fixType !== undefined &&
							!isNaN(lat) &&
							!isNaN(lon) &&
							lat !== 0 &&
							lon !== 0 &&
							fixType >= 2 &&
							Math.abs(lat) <= 90 &&
							Math.abs(lon) <= 180
						);

    // Update position if valid
    let coords;
    if (isValidPosition) {
        coords = ol.proj.fromLonLat([lon, lat], 'EPSG:3857');
        state.markerFeature.setGeometry(new ol.geom.Point(coords));
    }

    // Ensure marker is in the source
    if (!state.markerSource.hasFeature(state.markerFeature)) {
        state.markerSource.addFeature(state.markerFeature);
        console.log('Re-added marker to source');
    }

    // Use provided type/heading or fall back to current values
    const currentType = mavData.get('HEARTBEAT_type')  || 'UNKNOWN';
    const currentHeading = heading !== undefined ? heading : (mavData.get('ATTITUDE_yaw_deg') || 0);
    const normalizedHeading = ((currentHeading % 360) + 360) % 360;

    // Check for redundant update
    if (
        state.lastAppliedStyle &&
        (!isValidPosition || (state.lastAppliedStyle.lat === lat && state.lastAppliedStyle.lon === lon)) &&
        state.lastAppliedStyle.type === currentType &&
        Math.abs(state.lastAppliedStyle.heading - normalizedHeading) < 1 &&
        state.lastAppliedStyle.scale === 2
    ) {
       // console.log('updateMarker: Skipping redundant update');
        return;
    }

    // Update style
    const baseSvg = droneSvgMarkers[currentType] || droneSvgMarkers.UNKNOWN;
    const svgWithHeading = baseSvg
        .replace('{heading}', normalizedHeading.toFixed(2))
        .replace('{center_x}', '30')
        .replace('{center_y}', '30');
    const iconSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgWithHeading.trim());

    const style = new ol.style.Style({
        image: new ol.style.Icon({
            anchor: [0.5, 0.5],
            src: iconSrc,
            scale: 2,
            imgSize: [60, 60],
            crossOrigin: null
        })
    });

    state.markerFeature.setStyle(style);

    // Update map view if requested
    if (centerMap && isValidPosition) {
        state.map.getView().setCenter(coords);
        if (zoomLevel !== null) {
            state.map.getView().setZoom(zoomLevel);
        }
    }

    // Force render
    state.markerSource.changed();
    state.map.renderSync();

    // Store last applied style and position
    state.lastAppliedStyle = {
        lat: isValidPosition ? lat : state.lastAppliedStyle?.lat,
        lon: isValidPosition ? lon : state.lastAppliedStyle?.lon,
        type: currentType,
        heading: normalizedHeading,
        scale: 2
    };

    // Update coordinate display
    if (isValidPosition) {
        updateCoordinateDisplay(lat, lon);
    }

    //console.log(`updateMarker: Updated marker: type=${currentType}, heading=${normalizedHeading}, lat=${lat}, lon=${lon}, centerMap=${centerMap}`);
}

function gotoHome(lat, lon, fixType) {
    if (!state.map || !state.markerSource || !state.markerFeature) {
        console.warn('Map or marker not initialized. Attempting to initialize...');
        initMap();
        return;
    }

    updateMarker(lat, lon, fixType, null, null, {
        centerMap: true,
        zoomLevel: 18
    });
}
////
function editMissionPoint(waypointFeature) {
    if (!waypointFeature) {
        console.warn('No waypoint feature provided for editing');
        return;
    }

    const sequence = waypointFeature.get('sequence');
    const waypoint = current_mission.waypoints.find(wp => wp.sequence === sequence);
    if (!waypoint) {
        console.warn(`Waypoint with sequence ${sequence} not found in current_mission`);
        return;
    }

    // Create overlay to block background interactions
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';
    document.body.appendChild(overlay);

    // Create popup div
    const popup = document.createElement('div');
    popup.className = 'waypoint-popup';
    document.body.appendChild(popup);

    // Position popup near right-click coordinates (if available)
    if (state.contextMenuCoord) {
        const pixel = state.map.getPixelFromCoordinate(
            ol.proj.fromLonLat([state.contextMenuCoord.lon, state.contextMenuCoord.lat], 'EPSG:3857')
        );
        const margin = 10;
        let left = pixel[0] + 10; // Offset from click
        let top = pixel[1] + 10;

        // Adjust to stay within viewport
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        popup.style.display = 'block'; // Temporarily show to measure
        const popupRect = popup.getBoundingClientRect();
        if (left + popupRect.width + margin > viewportWidth) {
            left = pixel[0] - popupRect.width - 10;
        }
        if (top + popupRect.height + margin > viewportHeight) {
            top = pixel[1] - popupRect.height - 10;
        }
        if (left < margin) left = margin;
        if (top < margin) top = margin;

        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
        popup.style.display = 'none'; // Hide until content is ready
    } else {
        // Center popup if no coordinates
        popup.style.left = '50%';
        popup.style.top = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
    }

    // Create form table
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    thead.innerHTML = `
        <tr>
            <th>Latitude</th>
            <th>Longitude</th>
            <th>Altitude</th>
            <th>Speed</th>
            <th>Arrived Time</th>
            <th>Hold Time</th>
            <th>Acceptance Radius</th>
            <th>Pass-through Radius</th>
        </tr>
    `;
    table.appendChild(thead);
    table.appendChild(tbody);

    // Create row using adapted createMissionRow logic
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="text" class="latitude" value="${waypoint.latitude.toFixed(6)}"></td>
        <td><input type="text" class="longitude" value="${waypoint.longitude.toFixed(6)}"></td>
        <td><input type="text" class="altitude" value="${waypoint.altitude}"></td>
		<td>
			<select class="action">
				<option value="MAV_CMD_NAV_WAYPOINT" ${waypoint.action === 'MAV_CMD_NAV_WAYPOINT' ? 'selected' : ''}>Waypoint</option>
				<option value="MAV_CMD_DO_SET_SERVO" ${waypoint.action === 'MAV_CMD_DO_SET_SERVO' ? 'selected' : ''}>Set Servo</option>
			</select>
		</td>
        <td>
            <select class="speed">
                <option value="Slow" ${waypoint.speed === 'Slow' ? 'selected' : ''}>Slow</option>
                <option value="Medium" ${waypoint.speed === 'Medium' ? 'selected' : ''}>Medium</option>
                <option value="Fast" ${waypoint.speed === 'Fast' ? 'selected' : ''}>Fast</option>
            </select>
        </td>
        <td><input type="text" class="arrived-time" value="${waypoint.arrivedTime}"></td>
        <td><input type="text" class="hold-time" value="${waypoint.holdTime}"></td>
        <td><input type="text" class="acceptance-radius" value="${waypoint.acceptanceRadius}"></td>
        <td><input type="text" class="pass-through-radius" value="${waypoint.passThroughRadius}"></td>
    `;
    row.dataset.sequence = sequence; // Store sequence for update
    tbody.appendChild(row);

    // Add form to popup
    popup.appendChild(table);

    // Add buttons
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'buttons';
    buttonsDiv.innerHTML = `
        <button class="save">Save</button>
        <button class="cancel">Cancel</button>
    `;
    popup.appendChild(buttonsDiv);

    // Show overlay and popup
    overlay.style.display = 'block';
    popup.style.display = 'block';

    // Handle Save
    const saveButton = buttonsDiv.querySelector('.save');
    saveButton.addEventListener('click', () => {
        // Validate and update waypoint
        const lat = parseFloat(row.querySelector('.latitude').value);
        const lon = parseFloat(row.querySelector('.longitude').value);
        const altitude = parseFloat(row.querySelector('.altitude').value);
        const arrivedTime = parseFloat(row.querySelector('.arrived-time').value);
        const holdTime = parseFloat(row.querySelector('.hold-time').value);
        const acceptanceRadius = parseFloat(row.querySelector('.acceptance-radius').value);
        const passThroughRadius = parseFloat(row.querySelector('.pass-through-radius').value);
        const speed = row.querySelector('.speed').value;
		const action = row.querySelector('.action').value;

        if (
            isNaN(lat) || isNaN(lon) || isNaN(altitude) ||
            isNaN(arrivedTime) || isNaN(holdTime) ||
            isNaN(acceptanceRadius) || isNaN(passThroughRadius) ||
            Math.abs(lat) > 90 || Math.abs(lon) > 180
        ) {
            alert('Invalid input. Please enter valid values: latitude (-90 to 90), longitude (-180 to 180), and numeric values for other fields.');
            return;
        }

        // Update waypoint data
        waypoint.latitude = lat;
        waypoint.longitude = lon;
        waypoint.altitude = altitude;
        waypoint.speed = speed;
        waypoint.arrivedTime = arrivedTime;
        waypoint.holdTime = holdTime;
        waypoint.acceptanceRadius = acceptanceRadius;
        waypoint.passThroughRadius = passThroughRadius;
		waypoint.action=action

        // Update feature geometry
        const newCoord = ol.proj.fromLonLat([lon, lat], 'EPSG:3857');
        waypointFeature.setGeometry(new ol.geom.Point(newCoord));

        // Update mission lines and table
        updateMissionLines();
        updateMissionTable();
        state.missionLayer.changed();
        state.map.renderSync();

        console.log(`Edited waypoint ${sequence}:`, {
            lat, lon, altitude, speed, arrivedTime, holdTime, acceptanceRadius, passThroughRadius
        });

        // Close popup
        overlay.remove();
        popup.remove();
    });

    // Handle Cancel
    const cancelButton = buttonsDiv.querySelector('.cancel');
    cancelButton.addEventListener('click', () => {
        overlay.remove();
        popup.remove();
    });

    // Close on overlay click
    overlay.addEventListener('click', () => {
        overlay.remove();
        popup.remove();
    });
}

function deleteMissionPoint(waypointFeature) {

    if (!waypointFeature) {
        console.warn('No waypoint feature provided for deletion');
        return;
    }

    const sequence = waypointFeature.get('sequence');
    const waypointIndex = current_mission.waypoints.findIndex(wp => wp.sequence === sequence);
    if (waypointIndex === -1) {
        console.warn(`Waypoint with sequence ${sequence} not found in current_mission`);
        return;
    }

    // Remove waypoint from current_mission
    current_mission.waypoints.splice(waypointIndex, 1);

    // Remove feature from mission source
    state.missionSource.removeFeature(waypointFeature);

    // Update mission lines and table
    updateMissionLines();
    updateMissionTable();
    state.missionLayer.changed();
    state.map.renderSync();

    console.log(`Deleted waypoint ${sequence}`);
}

// Ensure addMissionPoint is defined (assumed from prior code, included for completeness)
function addMissionPoint(lat, lon) {
    if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        console.warn('Invalid coordinates for adding waypoint:', { lat, lon });
        return;
    }

    // Create new waypoint
    const sequence = current_mission.waypoints.length > 0
        ? Math.max(...current_mission.waypoints.map(wp => wp.sequence)) + 1
        : 1;
    const newWaypoint = {
        sequence,
        latitude: lat,
        longitude: lon,
        missionType: 'Flight Plan',
        action: 'MAV_CMD_NAV_WAYPOINT',
        altitude: 100,
        speed: 'Medium',
        arrivedTime: -1,
        holdTime: 0,
        acceptanceRadius: 10,
        passThroughRadius: 5
    };

    // Add to current_mission
    current_mission.waypoints.push(newWaypoint);

    // Create and add feature
    const coord = ol.proj.fromLonLat([lon, lat], 'EPSG:3857');
    const waypointFeature = new ol.Feature({
        geometry: new ol.geom.Point(coord),
        type: 'waypoint',
        sequence
    });
    waypointFeature.setId(`waypoint-${sequence}`);
    state.missionSource.addFeature(waypointFeature);

    // Update mission lines and table
    updateMissionLines();
    updateMissionTable();
    state.missionLayer.changed();
    state.map.renderSync();

   // console.log(`Added waypoint ${sequence} at:`, { lat, lon });
}

function updateMissionTable() {
    const tbody = document.getElementById('mission-table-body');
    tbody.innerHTML = '';

    // Add home point (sequence 0)
    if (current_mission.home) {
        const row = createMissionRow({
            sequence: 0,
            latitude: current_mission.home.latitude,
            longitude: current_mission.home.longitude,
            missionType: 'Flight Plan',
            action: 'MAV_CMD_NAV_WAYPOINT',
            altitude: 100,
            speed: 'Medium',
            arrivedTime: -1,
            holdTime: 0,
            acceptanceRadius: 10,
            passThroughRadius: 5
        }, true);
        tbody.appendChild(row);
    }

    // Add waypoints
    current_mission.waypoints.forEach((wp, index) => {
        const row = createMissionRow({
            sequence: wp.sequence,
            latitude: wp.latitude,
            longitude: wp.longitude,
            missionType: wp.missionType || 'Flight Plan',
            action: wp.action || 'MAV_CMD_NAV_WAYPOINT',
            altitude: wp.altitude || 100,
            speed: wp.speed || 'Medium',
            arrivedTime: wp.arrivedTime || -1,
            holdTime: wp.holdTime || 0,
            acceptanceRadius: wp.acceptanceRadius || 10,
            passThroughRadius: wp.passThroughRadius || 5
        });
        tbody.appendChild(row);
    });

    // Highlight row based on MISSION_CURRENT_seq
    const currentSeq = mavData.get('MISSION_CURRENT_seq') || -1;
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        const seq = parseInt(row.querySelector('.sequence').textContent);
        row.classList.toggle('highlight', seq === currentSeq);
    });

    // Update select-all checkbox
    const selectAll = document.getElementById('select-all');
    const checkboxes = tbody.querySelectorAll('input[type="checkbox"]');
    selectAll.checked = Array.from(checkboxes).every(cb => cb.checked);
}

function createMissionRow(wp, isHome = false) {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="checkbox" class="select-row" ${isHome ? 'disabled' : ''}></td>
        <td class="sequence">${wp.sequence}</td>
        <td>
            <select class="mission-type" ${isHome ? 'disabled' : ''}>
                <option value="Flight Plan" ${wp.missionType === 'Flight Plan' ? 'selected' : ''}>Flight Plan</option>
                <option value="Geofence" ${wp.missionType === 'Geofence' ? 'selected' : ''}>Geofence</option>
                <option value="Rally Points" ${wp.missionType === 'Rally Points' ? 'selected' : ''}>Rally Points</option>
            </select>
        </td>
        <td>
            <select class="action" ${isHome ? 'disabled' : ''}>
                <option value="MAV_CMD_NAV_WAYPOINT" ${wp.action === 'MAV_CMD_NAV_WAYPOINT' ? 'selected' : ''}>Waypoint</option>
                <option value="MAV_CMD_DO_SET_SERVO" ${wp.action === 'MAV_CMD_DO_SET_SERVO' ? 'selected' : ''}>Set Servo</option>
            </select>
        </td>
        <td><input type="text" class="latitude" value="${wp.latitude.toFixed(6)}"></td>
        <td><input type="text" class="longitude" value="${wp.longitude.toFixed(6)}"></td>
        <td><input type="text" class="altitude" value="${wp.altitude}"></td>
        <td>
            <select class="speed" ${isHome ? 'disabled' : ''}>
                <option value="Slow" ${wp.speed === 'Slow' ? 'selected' : ''}>Slow</option>
                <option value="Medium" ${wp.speed === 'Medium' ? 'selected' : ''}>Medium</option>
                <option value="Fast" ${wp.speed === 'Fast' ? 'selected' : ''}>Fast</option>
            </select>
        </td>
        <td><input type="text" class="arrived-time" value="${wp.arrivedTime}"></td>
        <td><input type="text" class="hold-time" value="${wp.holdTime}"></td>
        <td><input type="text" class="acceptance-radius" value="${wp.acceptanceRadius}"></td>
        <td><input type="text" class="pass-through-radius" value="${wp.passThroughRadius}"></td>
    `;

    // Add event listeners for editable fields
    row.querySelectorAll('input[type="text"]').forEach(input => {
        input.addEventListener('change', () => updateWaypointFromRow(row, isHome));
    });
    if (!isHome) {
        row.querySelectorAll('select').forEach(select => {
            select.addEventListener('change', () => updateWaypointFromRow(row, isHome));
        });
    }

    return row;
}

function initMissionControls() {
    const loadBtn = document.getElementById('mission-load');
    const saveBtn = document.getElementById('mission-save');
    const addBtn = document.getElementById('mission-add');
    const deleteBtn = document.getElementById('mission-delete');
    const executeBtn = document.getElementById('mission-execute');
    const selectAll = document.getElementById('select-all');

    loadBtn.addEventListener('click', () => {
        console.log('Load mission (implement file input or API call)');
        alert('Load mission not implemented');
    });

    saveBtn.addEventListener('click', () => {
        console.log('Save mission:', current_mission);
        const missionJson = JSON.stringify(current_mission, null, 2);
        const blob = new Blob([missionJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mission.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    addBtn.addEventListener('click', () => {
        const lastWp = current_mission.waypoints[current_mission.waypoints.length - 1] || current_mission.home;
        const lat = lastWp ? lastWp.latitude : 0;
        const lon = lastWp ? lastWp.longitude : 0;
        addMissionPoint(lat, lon);
    });

    deleteBtn.addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('#mission-table-body .select-row:checked');
        const sequences = Array.from(checkboxes).map(cb => parseInt(cb.closest('tr').querySelector('.sequence').textContent));
        if (sequences.includes(0)) {
            console.warn('Cannot delete home point');
            return;
        }

        sequences.sort((a, b) => b - a).forEach(seq => {
            const index = current_mission.waypoints.findIndex(wp => wp.sequence === seq);
            if (index !== -1) {
                current_mission.waypoints.splice(index, 1);
                const feature = state.missionSource.getFeatureById(`waypoint-${seq}`);
                if (feature) state.missionSource.removeFeature(feature);
            }
        });

        current_mission.waypoints.forEach((wp, index) => {
            wp.sequence = index + 1;
            const feature = state.missionSource.getFeatureById(`waypoint-${wp.sequence}`);
            if (feature) feature.setId(`waypoint-${index + 1}`);
        });

        updateMissionLines();
        updateMissionTable();
        state.missionSource.changed();
        state.missionLayer.changed();
        state.map.renderSync();
      //  console.log('Deleted waypoints:', sequences);
    });

    executeBtn.addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('#mission-table-body .select-row:checked');
        const sequences = Array.from(checkboxes).map(cb => parseInt(cb.closest('tr').querySelector('.sequence').textContent));
        if (sequences.includes(0)) {
            console.warn('Cannot execute home point');
            return;
        }

        sequences.forEach(seq => {
            const wp = current_mission.waypoints.find(wp => wp.sequence === seq);
            if (wp) {
                const command = generateMavlinkCommand(wp);
                executeMavlinkCommand(command);
            }
        });
    });

    selectAll.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('#mission-table-body .select-row:not([disabled])');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
    });

    document.getElementById('mission-table-body').addEventListener('change', (e) => {
        if (e.target.classList.contains('select-row')) {
            const checkboxes = document.querySelectorAll('#mission-table-body .select-row:not([disabled])');
            selectAll.checked = Array.from(checkboxes).every(cb => cb.checked);
        }
    });
}


function updateWaypointFromRow(row, isHome = false) {
    const sequence = parseInt(row.dataset.sequence || row.querySelector('.sequence').textContent);
    
    if (isHome) {
        if (!current_mission.home) return;
        current_mission.home.latitude = parseFloat(row.querySelector('.latitude').value) || current_mission.home.latitude;
        current_mission.home.longitude = parseFloat(row.querySelector('.longitude').value) || current_mission.home.longitude;
        current_mission.home.altitude = parseFloat(row.querySelector('.altitude').value) || current_mission.home.altitude;
        current_mission.home.speed = row.querySelector('.speed') ? row.querySelector('.speed').value : current_mission.home.speed;
        current_mission.home.arrivedTime = parseFloat(row.querySelector('.arrived-time').value) || current_mission.home.arrivedTime;
        current_mission.home.holdTime = parseFloat(row.querySelector('.hold-time').value) || current_mission.home.holdTime;
        current_mission.home.acceptanceRadius = parseFloat(row.querySelector('.acceptance-radius').value) || current_mission.home.acceptanceRadius;
        current_mission.home.passThroughRadius = parseFloat(row.querySelector('.pass-through-radius').value) || current_mission.home.passThroughRadius;

        const feature = state.missionSource.getFeatureById('home');
        if (feature) {
            const coord = ol.proj.fromLonLat([current_mission.home.longitude, current_mission.home.latitude], 'EPSG:3857');
            feature.setGeometry(new ol.geom.Point(coord));
            updateMissionLines();
            state.missionLayer.changed();
            state.map.renderSync();
        }

        console.log('Updated home point:', current_mission.home);
    } else {
        const waypoint = current_mission.waypoints.find(wp => wp.sequence === sequence);
        if (!waypoint) return;

        waypoint.missionType = row.querySelector('.mission-type') ? row.querySelector('.mission-type').value : waypoint.missionType;
        waypoint.action = row.querySelector('.action') ? row.querySelector('.action').value : waypoint.action;
        waypoint.latitude = parseFloat(row.querySelector('.latitude').value) || waypoint.latitude;
        waypoint.longitude = parseFloat(row.querySelector('.longitude').value) || waypoint.longitude;
        waypoint.altitude = parseFloat(row.querySelector('.altitude').value) || waypoint.altitude;
        waypoint.speed = row.querySelector('.speed') ? row.querySelector('.speed').value : waypoint.speed;
        waypoint.arrivedTime = parseFloat(row.querySelector('.arrived-time').value) || waypoint.arrivedTime;
        waypoint.holdTime = parseFloat(row.querySelector('.hold-time').value) || waypoint.holdTime;
        waypoint.acceptanceRadius = parseFloat(row.querySelector('.acceptance-radius').value) || waypoint.acceptanceRadius;
        waypoint.passThroughRadius = parseFloat(row.querySelector('.pass-through-radius').value) || waypoint.passThroughRadius;

        const feature = state.missionSource.getFeatureById(`waypoint-${sequence}`);
        if (feature) {
            const coord = ol.proj.fromLonLat([waypoint.longitude, waypoint.latitude], 'EPSG:3857');
            feature.setGeometry(new ol.geom.Point(coord));
            updateMissionLines();
            state.missionLayer.changed();
            state.map.renderSync();
        }

        console.log('Updated waypoint:', waypoint);
    }
}


function updateMissionLines() {
    state.missionSource.getFeatures().forEach(feature => {
        if (feature.getGeometry().getType() === 'LineString') {
            state.missionSource.removeFeature(feature);
        }
    });

    const points = [];
    if (current_mission.home) {
        points.push({
            latitude: current_mission.home.latitude,
            longitude: current_mission.home.longitude
        });
    }
    current_mission.waypoints.forEach(wp => {
        points.push({
            latitude: wp.latitude,
            longitude: wp.longitude
        });
    });

    for (let i = 0; i < points.length - 1; i++) {
        const startCoord = ol.proj.fromLonLat([points[i].longitude, points[i].latitude], 'EPSG:3857');
        const endCoord = ol.proj.fromLonLat([points[i + 1].longitude, points[i + 1].latitude], 'EPSG:3857');
        //console.log(`Adding line from ${startCoord} to ${endCoord}`);
        const lineFeature = new ol.Feature({
            geometry: new ol.geom.LineString([startCoord, endCoord]),
            type: 'line'
        });
        state.missionSource.addFeature(lineFeature);
    }

    //console.log('Updated mission lines for points:', points);
    state.missionLayer.changed();
    state.map.renderSync();
}



function initWaypointInteraction() {
    // Remove existing popup if any
    const existingPopup = document.getElementById('waypoint-popup');
    if (existingPopup) existingPopup.remove();

    // Create popup for waypoint context menu
    const popup = document.createElement('div');
    popup.id = 'waypoint-popup';
    popup.className = 'context-menu';
    popup.style.position = 'absolute';
    popup.style.zIndex = '1000';
    popup.style.display = 'none';

    // Create menu items
    const ul = document.createElement('ul');
    ul.innerHTML = `
        <li id="delete-point" class="context-menu-item">Delete Point</li>
        <li id="set-params" class="context-menu-item">Set Parameters</li>
    `;
    popup.appendChild(ul);
    document.body.appendChild(popup);

    // Handle right-click (contextmenu) events
    state.map.on('contextmenu', (e) => {
        e.preventDefault();
        hideAllContextMenus();
        popup.style.display = 'none';
        state.selectedWaypoint = null;
        state.missionLayer.changed();
        state.map.renderSync();

        const margin = 10;

        const feature = state.map.forEachFeatureAtPixel(e.pixel, (feat) => {
            if (feat.get('type') === 'waypoint') return feat;
        });

        if (feature) {
            state.selectedWaypoint = feature;
            const sequence = feature.get('sequence');
            //console.log('Right-clicked waypoint:', { sequence });

            // Position popup
            const pixel = state.map.getEventPixel(e.originalEvent);
            const popupRect = popup.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let left = pixel[0];
            let top = pixel[1];

            if (left + popupRect.width + margin > viewportWidth) {
                left = pixel[0] - popupRect.width;
                if (left < margin) left = margin;
            }
            if (top + popupRect.height + margin > viewportHeight) {
                top = pixel[1] - popupRect.height;
                if (top < margin) top = margin;
            }

            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;
            popup.style.display = 'block';

            state.missionLayer.changed();
            state.map.renderSync();

            console.log('Waypoint popup shown at:', { left, top, sequence });
        } else {
            const mapMenu = document.getElementById('context-menu-map-section');
            if (mapMenu) {
                const pixel = state.map.getEventPixel(e.originalEvent);
                const coordinate = state.map.getCoordinateFromPixel(pixel);
                const lonLat = ol.proj.toLonLat(coordinate, 'EPSG:3857');
                state.contextMenuCoord = { lat: lonLat[1], lon: lonLat[0] };

                const menuRect = mapMenu.getBoundingClientRect();
                let left = pixel[0];
                let top = pixel[1];

                if (left + menuRect.width + margin > viewportWidth) {
                    left = pixel[0] - menuRect.width;
                    if (left < margin) left = margin;
                }
                if (top + menuRect.height + margin > viewportHeight) {
                    top = pixel[1] - menuRect.height;
                    if (top < margin) top = margin;
                }

                mapMenu.style.left = `${left}px`;
                mapMenu.style.top = `${top}px`;
                mapMenu.style.display = 'block';
            }
        }
    });

    // Handle "Delete Point" click
    const deletePoint = document.getElementById('delete-point');
    if (!deletePoint) {
        console.error('delete-point element not found in DOM');
        return;
    }
    deletePoint.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent global click handler from hiding popup
        console.log('Delete Point clicked');
        if (state.selectedWaypoint) {
            const sequence = state.selectedWaypoint.get('sequence');
            console.log('Attempting to delete waypoint with sequence:', sequence);
            if (sequence !== undefined) {
                deleteMissionPoint(sequence);
                updateMissionTable();
                console.log('Deleted waypoint:', sequence);
            } else {
                console.error('No sequence found for selected waypoint');
            }
            popup.style.display = 'none';
            state.selectedWaypoint = null;
            state.missionLayer.changed();
            state.map.renderSync();
        } else {
            console.error('No waypoint selected for deletion');
        }
    });

    // Handle "Set Parameters" click
    const setParams = document.getElementById('set-params');
    if (!setParams) {
        console.error('set-params element not found in DOM');
        return;
    }
    setParams.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent global click handler
        if (state.selectedWaypoint) {
            const sequence = state.selectedWaypoint.get('sequence');
            const waypoint = current_mission.waypoints.find(wp => wp.sequence === sequence);
            if (waypoint) {
                const newSpeed = prompt('Enter new speed (Slow/Medium/Fast):', waypoint.speed || 'Medium');
                const newAltitude = prompt('Enter new altitude (m):', waypoint.altitude || 100);

                if (newSpeed !== null && newAltitude !== null) {
                    waypoint.speed = newSpeed || waypoint.speed;
                    waypoint.altitude = newAltitude ? parseFloat(newAltitude) : waypoint.altitude;
                    updateMissionTable();
                    console.log('Updated waypoint parameters:', waypoint);
                }
            }
            popup.style.display = 'none';
            state.selectedWaypoint = null;
            state.missionLayer.changed();
            state.map.renderSync();
        }
    });

    // Hide popup on click elsewhere
    document.addEventListener('click', (e) => {
        if (!popup.contains(e.target) && e.target.id !== 'delete-point' && e.target.id !== 'set-params') {
            popup.style.display = 'none';
            state.selectedWaypoint = null;
            state.missionLayer.changed();
            state.map.renderSync();
        }
    });
}



