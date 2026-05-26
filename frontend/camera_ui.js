// === Webcam ===

 
 /**
 * Initialize camera state in the main state object
 * Call this once during DOMContentLoaded
 */
function initializeCameraState() {
    if (!state.camera) {
        state.camera = {
            isActive: false,
            isStreaming: false,
            frameCount: 0,
            fps: 0,
            lastFrameTime: Date.now(),
            detectionEnabled: false,
            cameraInfo: null
        };
    }
    console.log('📷 Camera state initialized');
}
 
/**
 * Handle incoming camera frame from server via WebSocket
 * @param {Object} message - Camera frame message from server
 */
function handleCameraFrame(message) {
    if (message.class === 'camera_frame_available') {
        state.camera.frameCount++;
        state.camera.isStreaming = true;
        
        const currentTime = Date.now();
        const deltaTime = currentTime - state.camera.lastFrameTime;
        if (deltaTime > 0) state.camera.fps = Math.round(1000 / deltaTime);
        state.camera.lastFrameTime = currentTime;
        
        // Update detection status if available
        if (message.detection_enabled !== undefined) {
            state.camera.detectionEnabled = message.detection_enabled;
        }

        // Sync multi-camera grid + context menu labels
        CameraUI.onServerMessage(message);
    }
}


/**
 * Update camera statistics display (FPS, frame count, detection status)
 * @param {Object} message - Camera frame message with stats
 */
function updateCameraStats(message) {
    const statsElement = document.getElementById('camera-stats');
    if (!statsElement) return;
 
    try {
        const stats = {
            fps: state.camera.fps,
            frames: state.camera.frameCount,
            detection: state.camera.detectionEnabled ? '✓ ON' : '✗ OFF',
            detections: message.detections ? message.detections.length : 0
        };
 
        let statsText = `📹 FPS: ${stats.fps} | Frames: ${stats.frames} | Detection: ${stats.detection}`;
        if (stats.detections > 0) {
            statsText += ` | Objects: ${stats.detections}`;
        }
 
        statsElement.textContent = statsText;
        statsElement.style.color = '#0f0';
        statsElement.style.fontSize = '12px';
    } catch (error) {
        console.error('Error updating camera stats:', error);
    }
}
 
/**
 * Handle camera error messages from server
 * @param {Object} message - Error message from server
 */
function handleCameraError(message) {
    console.error('❌ Camera Error:', message.message);
    state.camera.isStreaming = false;
 
    // Display error in UI
    const webcamLayer = document.getElementById('webcam-layer');
    if (webcamLayer) {
        const errorElement = document.createElement('div');
        errorElement.id = 'camera-error';
        errorElement.innerHTML = `<p style="color: red; padding: 20px; text-align: center;">❌ ${message.message}</p>`;
 
        // Clear existing error
        const existingError = webcamLayer.querySelector('#camera-error');
        if (existingError) {
            existingError.remove();
        }
 
        webcamLayer.appendChild(errorElement);
    }
 
    updateStatusLog(`Camera Error: ${message.message}`);
}
 
/**
 * Handle camera info response from  //////-------------------------------------------------websocket server------------------------------------------------
 * @param {Object} data - Camera information from server
 */
function handleCameraInfo(data) {
    state.camera.cameraInfo = data;
    CameraUI.onServerMessage(data);          // ← ADD THIS
    console.log('📷 Camera Info:', {
        camera_ids: data.camera_ids,
        enabled: data.enabled,
        running: data.running,
        detection_enabled: data.detection_enabled
    });
}

/**
 * Handle detection state update from server
 * @param {Object} data - Detection update from server {class, detection_enabled, camera_id, message}
 */
function handleDetectionUpdate(data) {
    console.log('🎯 Detection State Update from Server:', data);
    
    // Update CameraUI detection state
    if (data.detection_enabled !== undefined) {
        CameraUI.onDetectionStateUpdate(data.detection_enabled, data.camera_id);
        console.log(`✅ Detection state updated: enabled=${data.detection_enabled}, camera_id=${data.camera_id}`);
    }
    
    // Show notification
    if (data.message) {
        updateStatusLog(`Detection: ${data.message}`);
    }
}



async function ensureWebcamActive() {
    state.camera.isActive = true;
    // Pull latest camera config from server so CameraUI
    // can build/refresh the grid with real camera IDs.
    requestCameraInfo();
    console.log('📷 Webcam layer activated');
}
 
 /**
 * Request camera information from server
 */
function requestCameraInfo() {
    if (!state.websocket || state.websocket.readyState !== WebSocket.OPEN) {
        console.warn('⚠️ WebSocket not ready for camera info request');
        return;
    }
 
    const command = {
        request_camera_info: true
    };
 
    try {
        const commandString = JSON.stringify(command);
		state.websocket.send(commandString);  document.getElementById('last-ws-sent').textContent = commandString;
    } catch (error) {
        console.error('Error requesting camera info:', error);
    }
}
 
/**
 * Set camera capture properties (resolution, FPS)
 * @param {number} width - Frame width in pixels
 * @param {number} height - Frame height in pixels
 * @param {number} fps - Frames per second
 */
function setCameraProperties(width = 640, height = 480, fps = 30) {
    if (!state.websocket || state.websocket.readyState !== WebSocket.OPEN) {
        console.warn('⚠️ WebSocket not ready for camera properties');
        return;
    }
 
    const command = {
        set_camera_properties: {
            width: width,
            height: height,
            fps: fps
        }
    };
 
    try {
        const commandString = JSON.stringify(command);
		state.websocket.send(commandString);  document.getElementById('last-ws-sent').textContent = commandString;
        console.log(`📷 Camera properties requested: ${width}x${height} @ ${fps} FPS`);
    } catch (error) {
        console.error('Error setting camera properties:', error);
    }
}
 

/**
 * Initialize video streaming
 * Creates <img> elements for each camera pointing to /video/<id> MJPEG streams
 */
function initializeVideoStream() {
    console.log('🎥 Initializing video streams...');
    
    // Initialize camera state if needed
    if (!state.camera) {
        initializeCameraState();
    }
    
    // Set default camera IDs if not yet available
    if (!state.camera.cameraIds || state.camera.cameraIds.length === 0) {
        state.camera.cameraIds = [0, 1];
        console.log('ℹ️  Using default cameras: [0, 1]');
    }
    
    try {
        // Use CameraUI.init() instead of buildCameraGrid()
        const layout = state.camera.layout || 'side_by_side';
        const ratio = state.camera.mainRatio || 0.65;
        
        CameraUI.init(state.camera.cameraIds, layout, ratio);
        console.log('✅ Camera grid initialized with cameras:', state.camera.cameraIds);
        
        // Request detailed camera info from server
        if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
            const command = { request_camera_info: true };
            state.websocket.send(JSON.stringify(command));
            console.log('📤 Requested camera info from server');
        } else {
            console.warn('⚠️  WebSocket not connected, camera grid built with defaults');
        }
        
    } catch (error) {
        console.error('❌ Video initialization error:', error);
    }
}



/**
 * Monitor video stream health and reconnect if needed
 */
function monitorVideoStreams() {
    // Check every 5 seconds if streams are loading
    setInterval(() => {
        if (!state.camera.isStreaming && state.camera.cameraIds) {
            console.warn('⚠️  No video stream detected, attempting reconnect...');
            CameraUI.buildCameraGrid();
        }
    }, 5000);
}

/**
 * Update detection button visual state
 * Call after toggling detection
 */
/**
 * Send toggle detection command to server
 * Call this when user clicks the detection button
 */


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



/**
 * camera_ui.js
 * =============================================================================
 * Client-side multi-camera layout manager.
 * Supports per-camera detection states and grid transformations.
 * =============================================================================
 */

const CameraUI = (() => {

    // =========================================================================
    // Private state
    // =========================================================================

    /** Ordered slot→camId mapping.  Index = slot position, value = camera ID. */
    let _slotIds   = [];
    let _layout    = 'single';
    let _mainRatio = 0.65;
    
    /** Per-camera detection states dictionary: { [camId]: boolean } */
    let _detectionStates = {};
    let _detectionEnabled = true; // Global fallback tracker

    /** Camera IDs currently sending frames (reported by server). */
    let _activeCameras = [];
    /** True once init() has been called. */
    let _initialized = false;

    // =========================================================================
    // Layout catalogue
    // =========================================================================

    const LAYOUT_OPTIONS = {
        1: ['single'],
        2: ['side_by_side', 'top_bottom'],
        3: ['three_left_main', 'three_right_main', 'three_top_main'],
        4: ['grid_2x2']
    };

    const LAYOUT_LABELS = {
        single:            'Single View',
        side_by_side:      'Side by Side  [L|R]',
        top_bottom:        'Top / Bottom  [T/B]',
        three_left_main:   'Main Left  [M|s]',
        three_right_main:  'Main Right [s|M]',
        three_top_main:    'Main Top  [M/ss]',
        grid_2x2:          '2 × 2 Grid'
    };

    /**
     * Return CSS grid properties for the given layout.
     */
    function _gridCSS(layout, r) {
        const s = (1 - r);
        const rF = `${(r * 100).toFixed(0)}%`;
        const sF = `${(s * 100).toFixed(0)}%`;

        const defs = {
            single:           { areas: '"c0"', columns: '1fr', rows: '1fr' },
            side_by_side:     { areas: '"c0 c1"', columns: '1fr 1fr', rows: '1fr' },
            top_bottom:       { areas: '"c0" "c1"', columns: '1fr', rows: '1fr 1fr' },
            three_left_main:  { areas: '"c0 c1" "c0 c2"', columns: `${rF} ${sF}`, rows: '1fr 1fr' },
            three_right_main: { areas: '"c1 c0" "c2 c0"', columns: `${sF} ${rF}`, rows: '1fr 1fr' },
            three_top_main:   { areas: '"c0 c0" "c1 c2"', columns: '1fr 1fr', rows: `${rF} ${sF}` },
            grid_2x2:         { areas: '"c0 c1" "c2 c3"', columns: '1fr 1fr', rows: '1fr 1fr' }
        };

        return defs[layout] || defs['single'];
    }

    function _grid() {
        return document.getElementById('camera-grid');
    }

    /** Rebuild all <img> slot elements from scratch. */
    function _buildGrid() {
        const grid = _grid();
        if (!grid) { console.warn('CameraUI: #camera-grid not found'); return; }

        grid.innerHTML = '';

        if (_slotIds.length === 0) {
            grid.innerHTML = '<div class="camera-no-signal">📷 No cameras active</div>';
            return;
        }

        _slotIds.forEach((camId, slot) => {
            const wrapper = document.createElement('div');
            wrapper.className  = 'camera-slot';
            wrapper.style.gridArea = `c${slot}`;
            wrapper.dataset.slot  = slot;
            wrapper.dataset.camId = camId;

            const img = document.createElement('img');
            img.className = 'camera-feed';
            img.id        = `camera-feed-${camId}`;
            img.alt       = `Camera ${camId}`;
            img.src = `/video/${camId}`;

            img.addEventListener('error', () => {
                img.src = '';  
                wrapper.classList.add('camera-slot--offline');
            });
            img.addEventListener('load', () => {
                wrapper.classList.remove('camera-slot--offline');
            });

            const label = document.createElement('div');
            label.className = 'camera-slot-label';
            label.textContent = _slotLabel(slot, camId);

            label.addEventListener('click', () => {
                if (slot !== 0) promoteToMain(camId);
            });

            wrapper.appendChild(img);
            wrapper.appendChild(label);
            grid.appendChild(wrapper);
        });

        _applyGridCSS();
        _applyActiveState();
    }

    function _applyGridCSS() {
        const grid = _grid();
        if (!grid) return;

        const css = _gridCSS(_layout, _mainRatio);
        grid.style.display             = 'grid';
        grid.style.width               = '100%';
        grid.style.height              = '100%';
        grid.style.gridTemplateAreas   = css.areas;
        grid.style.gridTemplateColumns = css.columns;
        grid.style.gridTemplateRows    = css.rows;
        grid.style.gap                 = '2px';

        document.querySelectorAll('.camera-slot-label').forEach(lbl => {
            const slot  = parseInt(lbl.closest('.camera-slot').dataset.slot);
            const camId = parseInt(lbl.closest('.camera-slot').dataset.camId);
            lbl.textContent = _slotLabel(slot, camId);
        });
    }

    function _applyActiveState() {
        document.querySelectorAll('.camera-slot').forEach(wrapper => {
            const camId = parseInt(wrapper.dataset.camId);
            const isActive = _activeCameras.length === 0 || _activeCameras.includes(camId);
            wrapper.style.opacity = isActive ? '1' : '0.45';
        });
    }

    function _slotLabel(slot, camId) {
        return slot === 0 ? `CAM ${camId}  ★` : `CAM ${camId}`;
    }

    function _ws(msg) {
        if (typeof state !== 'undefined' && state?.websocket?.readyState === WebSocket.OPEN) {
            state.websocket.send(JSON.stringify(msg));
        } else {
            console.warn('CameraUI: WebSocket not open, command dropped:', msg);
        }
    }

    function _popup(text, ms = 2000) {
        if (window.popupMessage?.show) popupMessage.show(text, ms);
        else console.log('[CameraUI popup]', text);
    }

    // =========================================================================
    // Core Fixes: Dynamic Context Menu Builder & Layout Switchers
    // =========================================================================

    /**
     * Update menu items based on exact target context
     * @param {number|null} clickedCameraId - Camera ID that was right-clicked
     */
    function updateMenuItems(clickedCameraId = null) {
        if (typeof sectionContents === 'undefined') return;

        const BASE_ACTIONS = new Set(['tWebcam', 'tHUD', 'tInfo', 'tHeading']);
        const base = sectionContents.main.menuItems.filter(i => BASE_ACTIONS.has(i.action));
        const cam = [];

        // Ensure state tracking entry exists for visible components
        _slotIds.forEach(id => {
            if (_detectionStates[id] === undefined) _detectionStates[id] = false;
        });

        if (clickedCameraId !== null && clickedCameraId !== undefined) {
            // Context-Aware: Explicitly display action text for target camera container
            if (_slotIds.includes(clickedCameraId)) {
                const isEnabled = _detectionStates[clickedCameraId];
                cam.push({
                    action: `cam-toggle-detection-${clickedCameraId}`,
                    text: isEnabled ? `❌ Disable Detection (Cam ${clickedCameraId})` : `✅ Enable Detection (Cam ${clickedCameraId})`
                });
            }
        } else {
            // Fallback Menu (Empty Grid Area Right-Clicks)
            if (_slotIds.length === 1) {
                const isEnabled = _detectionStates[_slotIds[0]];
                cam.push({
                    action: `cam-toggle-detection-${_slotIds[0]}`,
                    text: isEnabled ? '❌ Disable Object Detection' : '✅ Enable Object Detection'
                });
            } else {
                _slotIds.forEach((camId) => {
                    const isEnabled = _detectionStates[camId];
                    cam.push({
                        action: `cam-toggle-detection-${camId}`,
                        text: isEnabled ? `❌ Disable Cam ${camId} Detection` : `✅ Enable Cam ${camId} Detection`
                    });
                });
            }
        }

        // Add Layout control mechanics if multiple screens exist
        if (_slotIds.length > 1) {
            cam.push({
                action: 'cam-cycle-layout',
                text: `⊞ Layout: ${LAYOUT_LABELS[_layout] || _layout} →`
            });

            _slotIds.forEach((camId, slot) => {
                if (slot > 0) {
                    cam.push({
                        action: `cam-promote-${camId}`,
                        text:   `⇑ Set Cam ${camId} as Main`
                    });
                }
            });

            for (let i = 0; i < _slotIds.length - 1; i++) {
                cam.push({
                    action: `cam-swap-${i}-${i + 1}`,
                    text:   `⇄ Swap Cam ${_slotIds[i]} ↔ Cam ${_slotIds[i + 1]}`
                });
            }
        }

        sectionContents.main.menuItems = [...base, ...cam];

        if (typeof updateContextMenus === 'function') {
            updateContextMenus();
        }
    }

    /**
     * Fixed layout generator matching designated specs object properties
     */
    function getNextLayout(currentLayout, cameraCount) {
        const count = Math.min(cameraCount, 4);
        const layoutsForCount = LAYOUT_OPTIONS[count] || LAYOUT_OPTIONS[1];
        const currentIndex = layoutsForCount.indexOf(currentLayout);
        const nextIndex = (currentIndex + 1) % layoutsForCount.length;
        return layoutsForCount[nextIndex];
    }

    /**
     * Toggle YOLO object detection safely per camera context without data leakage
     */
    function toggleCameraDetection(cameraId = null) {
        if (typeof state === 'undefined' || !state?.websocket || state.websocket.readyState !== WebSocket.OPEN) {
            console.error('❌ WebSocket not connected');
            return;
        }

        let targetId = cameraId;
        if (targetId === null && _slotIds.length === 1) {
            targetId = _slotIds[0];
        }

        let nextState;
        if (targetId !== null) {
            nextState = !_detectionStates[targetId];
            _detectionStates[targetId] = nextState;
        } else {
            nextState = !_detectionEnabled;
            _detectionEnabled = nextState;
            _slotIds.forEach(id => { _detectionStates[id] = nextState; });
        }

        const command = { toggle_detection: nextState };
        if (targetId !== null) {
            command.camera_id = targetId;
        }

        try {
            const commandString = JSON.stringify(command);
            state.websocket.send(commandString);

            const wsSentElement = document.getElementById('last-ws-sent');
            if (wsSentElement) wsSentElement.textContent = commandString;

            const targetLogStr = targetId !== null ? `Camera ${targetId}` : "All Cameras";
            _popup(`🎯 ${targetLogStr}: ${nextState ? 'Detection ON' : 'Detection OFF'}`);
            
            if (typeof updateStatusLog === 'function') {
                updateStatusLog(`${targetLogStr}: ${nextState ? 'ON' : 'OFF'}`);
            }

            // Immediately re-render specific item configurations
            updateMenuItems(targetId);
        } catch (error) {
            console.error('❌ Error sending detection toggle:', error);
        }
    }

    function init(cameraIds, layout, mainRatio) {
        _slotIds    = cameraIds.length ? [...cameraIds] : [0];
        _layout     = layout    || 'single';
        _mainRatio  = mainRatio || 0.65;
        _initialized = true;

        _slotIds.forEach(id => {
            if (_detectionStates[id] === undefined) _detectionStates[id] = false;
        });

        _buildGrid();
        updateMenuItems();
        console.log(`📷 CameraUI init: cameras=[${_slotIds}] layout=${_layout}`);
    }

    function swapSlots(slotA, slotB) {
        if (slotA === slotB) return;
        const n = _slotIds.length;
        if (slotA < 0 || slotB < 0 || slotA >= n || slotB >= n) return;

        [_slotIds[slotA], _slotIds[slotB]] = [_slotIds[slotB], _slotIds[slotA]];

        _buildGrid();
        updateMenuItems();
        _ws({ set_camera_slot_order: [..._slotIds] });
        _popup(`⇄ Swapped Cam ${_slotIds[slotB]} ↔ Cam ${_slotIds[slotA]}`);
    }

    function promoteToMain(camId) {
        const slot = _slotIds.indexOf(camId);
        if (slot > 0) swapSlots(0, slot);
    }

    function cycleLayout() {
        const count   = Math.min(_slotIds.length, 4);
        const options = LAYOUT_OPTIONS[count] || LAYOUT_OPTIONS[1];
        const idx     = options.indexOf(_layout);
        setLayout(options[(idx + 1) % options.length]);
    }

    function setLayout(layout) {
        _layout = layout;
        _applyGridCSS();
        updateMenuItems();
        _ws({ set_camera_layout: layout });
        _popup(`⊞ Layout: ${LAYOUT_LABELS[layout] || layout}`);
    }

    function onServerMessage(data) {
        let changed = false;

        if (data.detection_enabled !== undefined) {
            const serverCamId = data.camera_id;
            if (serverCamId !== undefined && serverCamId !== null) {
                if (_detectionStates[serverCamId] !== data.detection_enabled) {
                    _detectionStates[serverCamId] = data.detection_enabled;
                    changed = true;
                }
            } else {
                _detectionEnabled = data.detection_enabled;
                _slotIds.forEach(id => {
                    if (_detectionStates[id] !== data.detection_enabled) {
                        _detectionStates[id] = data.detection_enabled;
                        changed = true;
                    }
                });
            }
        }

        if (data.active_cameras) {
            _activeCameras = data.active_cameras;
            _applyActiveState();
        }

        if (data.camera_ids) {
            const incoming = data.camera_ids;
            if (!_initialized || _slotIds.length === 0) {
                _slotIds = [...incoming];
                _layout  = data.layout || _layout;
                if (data.main_ratio !== undefined) _mainRatio = data.main_ratio;
                _buildGrid();
                _initialized = true;
                changed = true;
            } else {
                const added = incoming.filter(id => !_slotIds.includes(id));
                if (added.length) {
                    _slotIds = [..._slotIds, ...added];
                    _buildGrid();
                    changed = true;
                }
                if (data.layout && data.layout !== _layout) {
                    _layout = data.layout;
                    _applyGridCSS();
                    changed = true;
                }
            }
        }

        if (changed) updateMenuItems();
    }

    function onDetectionStateUpdate(enabled, camera_id) {
        if (camera_id !== null && camera_id !== undefined) {
            _detectionStates[camera_id] = enabled;
        } else {
            _slotIds.forEach(id => { _detectionStates[id] = enabled; });
        }
        _detectionEnabled = enabled;
        updateMenuItems(camera_id);
    }

    function handleAction(action) {
        if (action.startsWith('cam-toggle-detection-')) {
            const camId = parseInt(action.replace('cam-toggle-detection-', ''), 10);
            if (!isNaN(camId)) {
                toggleCameraDetection(camId);
                return true;
            }
        }
        if (action === 'cam-cycle-layout') {
            cycleLayout();
            return true;
        }
        if (action.startsWith('cam-promote-')) {
            const camId = parseInt(action.replace('cam-promote-', ''), 10);
            if (!isNaN(camId)) { promoteToMain(camId); return true; }
        }
        if (action.startsWith('cam-swap-')) {
            const [, , a, b] = action.split('-');
            const slotA = parseInt(a, 10);
            const slotB = parseInt(b, 10);
            if (!isNaN(slotA) && !isNaN(slotB)) { swapSlots(slotA, slotB); return true; }
        }
        return false;
    }

    function getState() {
        return {
            slotIds:          [..._slotIds],
            layout:           _layout,
            mainRatio:        _mainRatio,
            detectionEnabled: _detectionEnabled,
            detectionStates:  {..._detectionStates},
            activeCameras:    [..._activeCameras],
            initialized:      _initialized
        };
    }

    return {
        init,
        swapSlots,
        promoteToMain,
        cycleLayout,
        setLayout,
        toggleCameraDetection,  
        updateMenuItems,      
        onServerMessage,
        onDetectionStateUpdate,
        updateMenuItems,
        handleAction,
        getState
    };

})();






