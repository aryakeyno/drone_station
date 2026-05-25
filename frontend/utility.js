// === Configuration Constants ===


// === Utility Functions ===

function isEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object' && a !== null && b !== null) {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
}


const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};

const memoize = (fn) => {
    const cache = new Map();
    return (...args) => {
        const key = JSON.stringify(args);
        if (cache.has(key)) return cache.get(key);
        const result = fn(...args);
        cache.set(key, result);
        return result;
    };
};

// Function to check if a bit is set in a bitmask
function isBitSet(bitmask, bitPosition) {
    return (bitmask & (1 << bitPosition)) !== 0;
}


const markSvg = `
 <svg width="24" height="24" viewBox="0 0 24 24" >
	<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#0000FF"/>
</svg>
`;

const markEncodedIcons = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markSvg.trim());


// Define the selected waypoint icon (red)
const selectedMarkSvg = `
 <svg width="24" height="24" viewBox="0 0 24 24" >
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#FF0000"/>
</svg>
`;
const selectedMarkEncodedIcons = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(selectedMarkSvg.trim());

const droneSvgMarkers = {
    QUADROTOR: `
        <svg width="30" height="30" viewBox="0 0 60 60" fill="none" stroke="#ffffff" xmlns="http://www.w3.org/2000/svg">
            <g transform="rotate({heading} 30 30)"> <!-- Changed pivot to [30, 30] -->
                <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
                <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
                <g id="SVGRepo_iconCarrier">
                    <!-- Drone body (centered in new viewBox) -->
                    <path d="M17 17L25 25M43 43L35 35" stroke="#231971" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
                    <path d="M43 17L35 25M17 43L25 35" stroke="#231971" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
                    <rect x="25" y="25" width="10" height="10" fill="#ff2e6d" stroke="#231971" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></rect>
                    <path d="M43 24C44.3845 24 45.7379 23.5895 46.889 22.8203C48.0401 22.0511 48.9373 20.9579 49.4672 19.6788C49.997 18.3997 50.1356 16.9922 49.8655 15.6344C49.5954 14.2765 48.9287 13.0292 47.9498 12.0503C46.9708 11.0713 45.7235 10.4046 44.3656 10.1345C43.0078 9.86441 41.6003 10.003 40.3212 10.5328C39.0421 11.0627 37.9489 11.9599 37.1797 13.111C36.4105 14.2621 36 15.6155 36 17M43 36C44.3845 36 45.7379 36.4105 46.889 37.1797C48.0401 37.9489 48.9373 39.0421 49.4672 40.3212C49.997 41.6003 50.1356 43.0078 49.8655 44.3656C49.5954 45.7235 48.9287 46.9708 47.9498 47.9497C46.9708 48.9287 45.7235 49.5954 44.3656 49.8655C43.0078 50.1356 41.6003 49.997 40.3212 49.4672C39.0421 48.9373 37.9489 48.0401 37.1797 46.889C36.4105 45.7379 36 44.3845 36 43M17 24C15.6155 24 14.2621 23.5895 13.111 22.8203C11.9599 22.0511 11.0627 20.9579 10.5328 19.6788C10.003 18.3997 9.86441 16.9922 10.1345 15.6344C10.4046 14.2765 11.0713 13.0292 12.0503 12.0503C13.0292 11.0713 14.2765 10.4046 15.6344 10.1345C16.9922 9.86441 18.3997 10.003 19.6788 10.5328C20.9579 11.0627 22.0511 11.9599 22.8203 13.111C23.5895 14.2621 24 15.6155 24 17M17 36C15.6155 36 14.2621 36.4105 13.111 37.1797C11.9599 37.9489 11.0627 39.0421 10.5328 40.3212C10.003 41.6003 9.86441 43.0078 10.1345 44.3656C10.4046 45.7235 11.0713 46.9708 12.0503 47.9497C13.0292 48.9287 14.2765 49.5954 15.6344 49.8655C16.9922 50.1356 18.3997 49.997 19.6788 49.4672C20.9579 48.9373 22.0511 48.0401 22.8203 46.889C23.5895 45.7379 24 44.3845 24 43" stroke="#42c828" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
                    <!-- Arrow with very long tail -->
                    <g id="drone-arrow" transform="translate(30, 30) rotate(0) translate(-12, -30)"> <!-- Adjusted to center -->
                        <path d="M12 0V50M12 0L6 6M12 0L18 6" stroke="#ec3609" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                    </g>
                </g>
            </g>
        </svg>
    `,
	HELICOPTER : `
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 8V24M8 16H24" fill="none" stroke="#FFA500" stroke-width="4"/>
        <circle cx="16" cy="16" r="10" fill="none" stroke="#FFA500" stroke-width="2"/>
    </svg>
`,
VTOL : `
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="8" width="16" height="16" fill="#800080" stroke="#FFFFFF" stroke-width="2"/>
    </svg>
`,
FIXED_WING: `
    <svg width="32" height="32" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate({heading} 256 256)">
            <g>
                <polygon points="512,255.709 512,176.558 308.253,176.558 308.253,47.192 256,1.172 203.747,47.193 203.747,176.559 0,176.559 0,255.711 203.747,279.93 203.747,349.021 163.878,349.021 163.878,382.413 208.79,382.413 232.074,445.747 194.134,445.747 194.134,479.138 244.35,479.138 256,510.828 267.65,479.137 317.866,479.137 317.866,445.746 279.926,445.746 303.21,382.412 348.122,382.412 348.122,349.02 308.253,349.02 308.253,279.93" fill="#ff2e6d" stroke="#231971" stroke-width="4"/>
                <!-- Arrow indicating front direction -->
                <g id="drone-arrow" transform="translate(256, 100)">
                    <polygon points="0,0 10,20 -10,20" fill="#ec3609"/>
                </g>
            </g>
        </g>
    </svg>
`,
    UNKNOWN: `
        <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="12" fill="#FF0000" stroke="#FFFFFF" stroke-width="2"/>
        </svg>
    `
    // Add more types as needed, e.g., HELICOPTER, VTOL, etc.
};



const CONFIG = {
    SIDEBAR_WIDTH: "150px",
    MAX_LOG_LINES: 100,
    ROLL_MAX: 30,
    PITCH_MAX: 30,
    YAW_MAX: 360,
    ALT_MAX: 2000,
    SPEED_MAX: 500,
    DEBOUNCE_DELAY: 200,
    TELEMETRY_INTERVAL: 100,
    SIMULATION_INTERVAL: 2000
};

// === WebSocket Configuration ===
const WS_CONFIG = {
    URL: 'ws://localhost:8765/ws', // Replace with your WebSocket server URL
    RECONNECT_INTERVAL: 5000, // Reconnect every 5 seconds if disconnected
    HEARTBEAT_INTERVAL: 30000 // Send heartbeat every 30 seconds
};

// === Global State ===
// Sensor names array (matches MAVLink SYS_STATUS bit positions)
const sensorNames = [
    "3D Gyroscope", "3D Accelerometer", "3D Magnetometer", "Absolute Pressure",
    "Differential Pressure", "GPS", "Optical Flow", "Vision Position",
    "Laser Position", "External Ground Truth", "Angular Rate Control",
    "Attitude Stabilization", "Yaw Position", "Z Altitude Control",
    "X/Y Position Control", "Motor Outputs", "RC Receiver",
    "Second 3D Gyroscope", "Second 3D Accelerometer", "Second 3D Magnetometer",
    "Geofence", "AHRS", "Terrain", "Reverse Motor", "Logging",
    "Battery", "Proximity", "Satellite Communication", "Pre-arm Check",
    "Obstacle Avoidance", "Propulsion"
];

const current_mission = {
	informarion:{
		name:"",
		date:22-2-25
	},
    home: {
        sequence: 0,
        latitude: -36.8875983,
        longitude: 174.6632274
    },
	waypoints: [
        
		         ]
	}

const state = {
    map: null,
	isSpeaking: false, // Tracks if speech is playing
    lastSpeechCall: 0, // Timestamp for debouncing
    speechDebounceDelay: 500, // Minimum delay between speech calls (ms)
	maxSpeechQueueSize: 10, // Maximum queue size	
    animationFrameId: null,
	audioContext: null,
    speaker: null,
    gainNode: null, // Add this
    isAudioEnabled: true,
    speechQueue: [], // Queue for non-looping messages
    currentLoopingMessage: null, // Stores text of active looping message
    currentLoopingSource: null, // AudioBufferSource currently playing (so we can stop it)
    isProcessingLooping: false, // Lock to prevent concurrent looping audio
    voicePreference: 'edge',     // Voice preference: 'edge' | 'native' | 'robotic'
    intervalId: null,
    indicatorsInitialized: false,
	isAudioInitialized: false, // Add this if not already present
	audioFullyInitialized: false,
    isLowBattery: false,
	autoPilot: false,
	scene: null,
    camera: null,
    renderer: null,
    avatar: null,
    statusTextLog: [],
    layerStates: { webcam: true, hud: true, info: true, heading: true },
    telemetry: { roll: 0, pitch: 0, yaw: 0, alt: 0, speed: 0 },
    indicators: {},
	websocket : null,
	markerFeature: null,
	mapOnlineMode: true,
	mavlinkParser: null,
	armPendingTimeout : null ,
	missionLayer: null,
	missionSource: null,
	lastAppliedStyle: null, 
	lastDroneType: 'UNKNOWN', 
	flightMode:'UNKNOWN', 
    clickedCameraId: null, // Stores which camera was right-clicked for context menu
	system_status:'',
	lastTelemetry: null, 
    edgeVoice :  null,
	hasCenteredMap: false,
	previousMavData: new Map(), // Cache for previous mavData values
	wsStatus : 'disconnected',
	parameters : new Map(), // Store parameters as key-value pairs (param_id: param_value)
	parameterRequestTimeout :null, // Track timeout for parameter requests
	parameterCountExpected : 0, // Number of parameters expected
	parameterCountReceived : 0, // Number of parameters received
	camera: {
        isActive: false,
        isStreaming: false,
        frameCount: 0,
        fps: 0,
        lastFrameTime: Date.now(),
        detectionEnabled: false,
        cameraInfo: null
    }
};

// Function to validate MAVLink command
// Validate MAVLink command
function isValidMavCommand(commandId) {    return MAV_COMMANDS.some(cmd => cmd.id === commandId);}
// MAVLink commands array (non-deprecated)
// Comprehensive array of non-deprecated MAVLink commands
const MAV_COMMANDS = [
    // Navigation commands
    { id: 16, name: 'MAV_CMD_NAV_WAYPOINT', 						description: 'Navigate to waypoint', 					type: 'COMMAND_INT' },
    { id: 17, name: 'MAV_CMD_NAV_LOITER_UNLIM', 					description: 'Loiter unlimited', 						type: 'COMMAND_INT' },
    { id: 18, name: 'MAV_CMD_NAV_LOITER_TURNS', 					description: 'Loiter N turns', 							type: 'COMMAND_INT' },
    { id: 19, name: 'MAV_CMD_NAV_LOITER_TIME', 						description: 'Loiter for time', 						type: 'COMMAND_INT' },
    { id: 20, name: 'MAV_CMD_NAV_RETURN_TO_LAUNCH', 				description: 'Return to launch', 						type: 'COMMAND_LONG' },
    { id: 21, name: 'MAV_CMD_NAV_LAND', 							description: 'Land at location', 						type: 'COMMAND_INT' },
    { id: 22, name: 'MAV_CMD_NAV_TAKEOFF', 							description: 'Takeoff from ground / hand', 				type: 'COMMAND_INT' },
    { id: 23, name: 'MAV_CMD_NAV_LAND_LOCAL', 						description: 'Land at local position', 					type: 'COMMAND_INT' },
    { id: 24, name: 'MAV_CMD_NAV_TAKEOFF_LOCAL', 					description: 'Takeoff from local position', 			type: 'COMMAND_INT' },
    { id: 25, name: 'MAV_CMD_NAV_FOLLOW', 							description: 'Follow a target', 						type: 'COMMAND_LONG' },
    { id: 30, name: 'MAV_CMD_NAV_CONTINUE_AND_CHANGE_ALT', 			description: 'Continue and change altitude', 			type: 'COMMAND_LONG' },
    { id: 31, name: 'MAV_CMD_NAV_LOITER_TO_ALT', 					description: 'Loiter to altitude', 						type: 'COMMAND_INT' },
    { id: 80, name: 'MAV_CMD_NAV_GUIDED_ENABLE', 					description: 'Enable guided mode', 						type: 'COMMAND_LONG' },
    { id: 81, name: 'MAV_CMD_NAV_SET_YAW_SPEED', 					description: 'Set yaw and speed', 						type: 'COMMAND_LONG' },
    { id: 82, name: 'MAV_CMD_NAV_FENCE_RETURN_POINT', 				description: 'Set fence return point', 					type: 'COMMAND_INT' },
    { id: 83, name: 'MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION', 	description: 'Add fence inclusion polygon vertex', 		type: 'COMMAND_INT' },
    { id: 84, name: 'MAV_CMD_NAV_FENCE_POLYGON_VERTEX_EXCLUSION', 	description: 'Add fence exclusion polygon vertex', 		type: 'COMMAND_INT' },
    { id: 85, name: 'MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION', 			description: ' Ascertain Add fence inclusion circle', 	type: 'COMMAND_INT' },
    { id: 86, name: 'MAV_CMD_NAV_FENCE_CIRCLE_EXCLUSION', 			description: 'Add fence exclusion circle', 				type: 'COMMAND_INT' },
    { id: 87, name: 'MAV_CMD_NAV_RALLY_POINT', 						description: 'Set rally point', 						type: 'COMMAND_INT' },
    { id: 88, name: 'MAV_CMD_NAV_SPLINE_WAYPOINT', 					description: 'Navigate to spline waypoint', 			type: 'COMMAND_INT' },
    { id: 89, name: 'MAV_CMD_NAV_VTOL_TAKEOFF', 					description: 'VTOL takeoff', 							type: 'COMMAND_INT' },
    { id: 90, name: 'MAV_CMD_NAV_VTOL_LAND', 						description: 'VTOL land', 								type: 'COMMAND_INT' },
    { id: 91, name: 'MAV_CMD_NAV_PAYLOAD_PLACE', 					description: 'Place payload', 							type: 'COMMAND_INT' },
    { id: 92, name: 'MAV_CMD_NAV_DELAY', 							description: 'Delay mission state machine', 			type: 'COMMAND_LONG' },
    { id: 93, name: 'MAV_CMD_NAV_PATHPLANNING', 					description: 'Path planning', 							type: 'COMMAND_INT' },
    { id: 94, name: 'MAV_CMD_NAV_SPLINE_PATH', 						description: 'Navigate along spline path', 				type: 'COMMAND_INT' },    
    // Control commands
    { id: 110, name: 'MAV_CMD_CONDITION_DELAY', 					description: 'Delay until condition', 					type: 'COMMAND_LONG' },
    { id: 111, name: 'MAV_CMD_CONDITION_CHANGE_ALT', 				description: 'Change altitude condition', 				type: 'COMMAND_LONG' },
    { id: 112, name: 'MAV_CMD_CONDITION_DISTANCE', 					description: 'Distance condition', 						type: 'COMMAND_LONG' },
    { id: 113, name: 'MAV_CMD_CONDITION_YAW', 						description: 'Yaw condition', 							type: 'COMMAND_LONG' },
    { id: 115, name: 'MAV_CMD_CONDITION_LAST', 						description: 'Last condition', 							type: 'COMMAND_LONG' },
    { id: 159, name: 'MAV_CMD_DO_SET_RESUME', 						description: 'Resume mission', 							type: 'COMMAND_LONG' },
    { id: 176, name: 'MAV_CMD_DO_SET_MODE', 						description: 'Set system mode', 						type: 'COMMAND_LONG' },
    { id: 177, name: 'MAV_CMD_DO_JUMP', 							description:' Add jump to specified mission item', 		type: 'COMMAND_LONG' },
    { id: 178, name: 'MAV_CMD_DO_CHANGE_SPEED', 					description: 'Change speed', 							type: 'COMMAND_LONG' },
    { id: 179, name: 'MAV_CMD_DO_SET_HOME', 						description: 'Set home position', 						type: 'COMMAND_INT' },
    { id: 180, name: 'MAV_CMD_DO_SET_PARAMETER', 					description: 'Set parameter', 							type: 'COMMAND_LONG' },
    { id: 181, name: 'MAV_CMD_DO_SET_RELAY', 						description: 'Set relay', 								type: 'COMMAND_LONG' },
    { id: 182, name: 'MAV_CMD_DO_REPEAT_RELAY', 					description: 'Repeat relay', 							type: 'COMMAND_LONG' },
    { id: 183, name: 'MAV_CMD_DO_SET_SERVO', 						description: 'Set servo', 								type: 'COMMAND_LONG' },
    { id: 184, name: 'MAV_CMD_DO_REPEAT_SERVO', 					description: 'Repeat servo', 							type: 'COMMAND_LONG' },
    { id: 185, name: 'MAV_CMD_DO_FLIGHTTERMINATION', 				description: 'Flight termination', 						type: 'COMMAND_LONG' },
    { id: 186, name: 'MAV_CMD_DO_CHANGE_ALTITUDE', 					description: 'Change altitude', 						type: 'COMMAND_LONG' },
    { id: 187, name: 'MAV_CMD_DO_SET_ACTUATOR', 					description: 'Set actuator', 							type: 'COMMAND_LONG' },
    { id: 188, name: 'MAV_CMD_DO_SPATIAL_FENCE', 					description: 'Set spatial fence', 						type: 'COMMAND_INT' },
    { id: 189, name: 'MAV_CMD_DO_LAND_START', 						description: 'Start landing sequence', 					type: 'COMMAND_LONG' },
    { id: 191, name: 'MAV_CMD_DO_AUTOTUNE', 						description: 'Trigger autotune', 						type: 'COMMAND_LONG' },
    { id: 192, name: 'MAV_CMD_DO_GO_AROUND', 						description: 'Go around (abort landing)', 				type: 'COMMAND_LONG' },
    { id: 193, name: 'MAV_CMD_DO_CONTROL_VIDEO', 					description: 'Control video stream', 					type: 'COMMAND_LONG' },
    { id: 194, name: 'MAV_CMD_DO_MOUNT_CONTROL', 					description: 'Control mount', 							type: 'COMMAND_LONG' },
    { id: 195, name: 'MAV_CMD_DO_MOUNT_CONFIGURE', 					description: 'Configure mount', 						type: 'COMMAND_LONG' },
    { id: 196, name: 'MAV_CMD_DO_MOUNT_CONTROL_QUAT', 				description: 'Control mount with quaternion', 			type: 'COMMAND_LONG' },
    { id: 197, name: 'MAV_CMD_DO_GRIPPER', 							description: 'Control gripper', 						type: 'COMMAND_LONG' },
    { id: 200, name: 'MAV_CMD_DO_REPOSITION', 						description: 'Reposition vehicle', 						type: 'COMMAND_INT' },
    { id: 201, name: 'MAV_CMD_DO_PAUSE_CONTINUE', 					description: 'Pause or continue mission', 				type: 'COMMAND_LONG' },
    { id: 202, name: 'MAV_CMD_DO_SET_REVERSE', 						description: 'Set reverse mode', 						type: 'COMMAND_LONG' },
    { id: 203, name: 'MAV_CMD_DO_FENCE_ENABLE', 					description: 'Enable/disable fence', 					type: 'COMMAND_LONG' },
    { id: 204, name: 'MAV_CMD_DO_FENCE_SET', 						description: 'Set fence parameters', 					type: 'COMMAND_INT' },
    { id: 205, name: 'MAV_CMD_DO_WINCH', 							description: 'Control winch', 							type: 'COMMAND_LONG' },
    { id: 206, name: 'MAV_CMD_DO_EXTERNAL_CONTROL', 				description: 'External control', 						type: 'COMMAND_LONG' },    
    // Mission commands
    { id: 300, name: 'MAV_CMD_MISSION_START', 						description: 'Start mission', 							type: 'COMMAND_LONG' },
    { id: 301, name: 'MAV_CMD_DO_MISSION_CLEAR', 					description: 'Clear mission', 							type: 'COMMAND_LONG' },    
    // Component commands
    { id: 400, name: 'MAV_CMD_COMPONENT_ARM_DISARM', 				description: 'Arm or disarm components', 				type: 'COMMAND_LONG' },
    { id: 401, name: 'MAV_CMD_DO_START_MAG_CAL', 					description: 'Start magnetometer calibration', 			type: 'COMMAND_LONG' },
    { id: 402, name: 'MAV_CMD_DO_ACCEPT_MAG_CAL', 					description: 'Accept magnetometer calibration', 		type: 'COMMAND_LONG' },
    { id: 403, name: 'MAV_CMD_DO_CANCEL_MAG_CAL', 					description: 'Cancel magnetometer calibration', 		type: 'COMMAND_LONG' },
    { id: 410, name: 'MAV_CMD_GET_HOME_POSITION', 					description: 'Get home position', 						type: 'COMMAND_LONG' },
    { id: 411, name: 'MAV_CMD_DO_GET_PARAMETER', 					description: 'Get parameter', 							type: 'COMMAND_LONG' },
    { id: 420, name: 'MAV_CMD_DO_FTM', 								description: 'Fault-tolerant mode', 					type: 'COMMAND_LONG' },    
    // Preflight commands
    { id: 2000, name: 'MAV_CMD_PREFLIGHT_CALIBRATION', 				description: 'Trigger calibration', 					type: 'COMMAND_LONG' },
    { id: 2001, name: 'MAV_CMD_PREFLIGHT_SET_SENSOR_OFFSETS', 		description: 'Set sensor offsets', 						type: 'COMMAND_LONG' },
    { id: 2002, name: 'MAV_CMD_PREFLIGHT_UAVCAN', 					description: 'UAVCAN configuration', 					type: 'COMMAND_LONG' },
    { id: 2003, name: 'MAV_CMD_PREFLIGHT_STORAGE', 					description: 'Storage management', 						type: 'COMMAND_LONG' },
    { id: 2004, name: 'MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN', 			description: 'Reboot or shutdown', 						type: 'COMMAND_LONG' },
    { id: 2005, name: 'MAV_CMD_PREFLIGHT_CHECK', 					description: 'Perform preflight checks', 				type: 'COMMAND_LONG' },    
    // Logging commands
    { id: 2500, name: 'MAV_CMD_LOGGING_START', 						description: 'Start logging', 							type: 'COMMAND_LONG' },
    { id: 2501, name: 'MAV_CMD_LOGGING_STOP', 						description: 'Stop logging', 							type: 'COMMAND_LONG' },    
    // Battery commands
    { id: 2600, name: 'MAV_CMD_BATTERY_RESET', 						description: 'Reset battery', 							type: 'COMMAND_LONG' },    
    // Lighting commands
    { id: 2700, name: 'MAV_CMD_DO_SET_LIGHT', 						description: 'Set light', 								type: 'COMMAND_LONG' },    
    // Camera commands
    { id: 2800, name: 'MAV_CMD_REQUEST_MESSAGE', 					description: 'Request message', 						type: 'COMMAND_LONG' },
    { id: 2801, name: 'MAV_CMD_DO_REQUEST_MESSAGE', 				description: 'Request message (alternate)', 			type: 'COMMAND_LONG' },    
    // Other commands
    { id: 3000, name: 'MAV_CMD_DO_VTOL_TRANSITION', 				description: 'VTOL transition', 						type: 'COMMAND_LONG' },
    { id: 3001, name: 'MAV_CMD_DO_ADSB_OUT_SET', 					description: 'Set ADS-B out configuration', 			type: 'COMMAND_LONG' },
    { id: 3002, name: 'MAV_CMD_DO_SET_GPS_GLOBAL_ORIGIN', 			description: 'Set GPS global origin', 					type: 'COMMAND_INT' },
    { id: 3003, name: 'MAV_CMD_DO_SET_ATTITUDE_TARGET', 			description: 'Set attitude target', 					type: 'COMMAND_LONG' },
    { id: 3004, name: 'MAV_CMD_DO_SET_POSITION_TARGET_LOCAL_NED', 	description: 'Set position target local NED', 			type: 'COMMAND_INT' },
    { id: 3005, name: 'MAV_CMD_DO_SET_POSITION_TARGET_GLOBAL_INT', 	description: 'Set position target global INT', 			type: 'COMMAND_INT' },
    { id: 3006, name: 'MAV_CMD_DO_SET_VELOCITY_TARGET_LOCAL_NED', 	description: 'Set velocity target local NED', 			type: 'COMMAND_INT' },
    { id: 3007, name: 'MAV_CMD_DO_SET_ACCELERATION_TARGET_LOCAL_NED', description: 'Set acceleration target local NED', 	type: 'COMMAND_INT' },
    { id: 3008, name: 'MAV_CMD_DO_SET_YAW_TARGET', 					description: 'Set yaw target', 							type: 'COMMAND_LONG' },
    { id: 3009, name: 'MAV_CMD_DO_SET_ROLL_PITCH_YAW_THRUST', 		description: 'Set roll, pitch, yaw, thrust', 			type: 'COMMAND_LONG' }
];
// Comprehensive mapping of PX4 parameter group prefixes to descriptions
const PARAMETER_GROUPS = {
    'ACRO_': 'Acro Mode - Parameters for acrobatic flight mode settings.',
    'ADP_': 'Adaptive Control - Parameters for adaptive flight control algorithms.',
    'ASP_': 'Airspeed - Airspeed sensor and scaling parameters.',
    'ATT_': 'Attitude Control - Parameters for attitude stabilization and control.',
    'BAT_': 'Battery - Battery configuration, monitoring, and low-battery behavior.',
    'CAL_': 'Calibration - Sensor calibration parameters (e.g., gyro, accel, mag).',
    'CAM_': 'Camera - Camera trigger and capture settings.',
    'CBRK_': 'Circuit Breaker - Parameters to disable/enable specific safety checks.',
    'COM_': 'Communication - MAVLink and other communication protocol settings.',
    'CP_': 'Control Partition - Parameters for control allocation and partitioning.',
    'DATALINK_': 'Datalink - Parameters for datalink loss behavior.',
    'DShot_': 'DShot - DShot ESC protocol configuration.',
    'EKF2_': 'EKF2 - Extended Kalman Filter parameters for state estimation.',
    'FD_': 'Failure Detection - Parameters for failure detection and handling.',
    'FW_': 'Fixed Wing - Parameters for fixed-wing aircraft flight dynamics.',
    'GF_': 'Geofence - Geofencing parameters for spatial boundaries.',
    'GPS_': 'GPS - GPS module configuration and navigation settings.',
    'IMU_': 'IMU - Inertial Measurement Unit configuration.',
    'INAIR_': 'In-Air Restart - Parameters for in-air restart behavior.',
    'LAND_': 'Landing - Parameters for landing behavior and detection.',
    'LNDMC_': 'Landing Multicopter - Multicopter-specific landing parameters.',
    'LPE_': 'Local Position Estimator - Parameters for local position estimation.',
    'MAN_': 'Manual Control - Manual control input settings.',
    'MAV_': 'MAVLink - MAVLink communication and streaming settings.',
    'MC_': 'Multicopter - General multicopter flight parameters.',
    'MIS_': 'Mission - Mission planning and execution parameters.',
    'MNT_': 'Mount - Gimbal and mount control parameters.',
    'MPC_': 'Multicopter Position Control - Parameters for multicopter position and velocity control.',
    'NAV_': 'Navigation - Parameters for navigation and waypoint handling.',
    'OM_': 'Optical Flow - Optical flow sensor parameters.',
    'POSCTL_': 'Position Control - Parameters for position control mode.',
    'PWM_': 'PWM Outputs - Pulse Width Modulation output settings.',
    'RC_': 'Remote Control - RC input mapping and calibration.',
    'RTL_': 'Return to Launch - Parameters for return-to-launch behavior.',
    'SDLOG_': 'SD Logging - Parameters for onboard data logging to SD card.',
    'SENS_': 'Sensors - General sensor configuration (e.g., barometer, rangefinder).',
    'SIM_': 'Simulation - Parameters for simulation environments.',
    'SYS_': 'System - Core system configuration and identification parameters.',
    'TC_': 'Thermal Compensation - Parameters for thermal sensor compensation.',
    'TEL_': 'Telemetry - Telemetry radio configuration.',
    'TEST_': 'Test - Parameters for testing and debugging.',
    'TRIG_': 'Trigger - Parameters for camera trigger and intervalometer.',
    'UAVCAN_': 'UAVCAN - UAVCAN bus and peripheral configuration.',
    'VT_': 'VTOL - Vertical Takeoff and Landing parameters.',
    'WV_': 'Wind Vane - Parameters for wind estimation and compensation.',
    'DEFAULT': 'Miscellaneous - Parameters not categorized under a specific group.'
};
// =========================================================================================================== MAVLink Telemetry Data ===
const mavData = new Map(Object.entries({
										HEARTBEAT_type: '---', 		//Vehicle   type
										HEARTBEAT_autopilot: '---', // autopilot firmware
										HEARTBEAT_base_mode: '---', // flag status
										HEARTBEAT_base_mode_interpreted : '---',
										HEARTBEAT_custom_mode: '---', 
										HEARTBEAT_system_status: '---', // drone status

										
										SYS_STATUS_load: '---', 
										SYS_STATUS_voltage_battery: '---',
										SYS_STATUS_current_battery: '---',
										SYS_STATUS_battery_remaining: '---', 
										SYS_STATUS_errors_comm:'---', 
										SYS_STATUS_onboard_control_sensors_health: '---',
										SYS_STATUS_onboard_control_sensors_enabled: '---',
										SYS_STATUS_onboard_control_sensors_present: '---',

										SYSTEM_TIME_time_unix_usec: 0,//////////////////
										SYSTEM_TIME_time_boot_ms: 0, ///////////////
										
										GPS_RAW_INT_lat: 0.0, 
										GPS_RAW_INT_lon: 0.0, 
										GPS_RAW_INT_alt: 0.0,
										GPS_RAW_INT_fix_type: 0, 
										GPS_RAW_INT_fix_type_str: 'NO FIX', 
										GPS_RAW_INT_satellites_visible: 0,
										GPS_RAW_INT_vel: 0.0,
										GPS_RAW_INT_eph	:0,
										GPS_RAW_INT_epv:0,
										GPS_RAW_INT_cog: 0.0, 
										
									 
										////vvvvv
										GLOBAL_POSITION_INT_lat: 0.0, 
										GLOBAL_POSITION_INT_lon: 0.0,
										GLOBAL_POSITION_INT_alt: 0.0, 
										GLOBAL_POSITION_INT_relative_alt: 0.0, 
										GLOBAL_POSITION_INT_vx: 0.0,
										GLOBAL_POSITION_INT_vy: 0.0, 
										GLOBAL_POSITION_INT_vz: 0.0, 
										GLOBAL_POSITION_INT_hdg: 0.0,
										//////////^^^^^^
										
										LOCAL_POSITION_NED_x: 0.0, 
										LOCAL_POSITION_NED_y: 0.0, 
										LOCAL_POSITION_NED_z: 0.0,
										LOCAL_POSITION_NED_vx: 0.0, 
										LOCAL_POSITION_NED_vy: 0.0, 
										LOCAL_POSITION_NED_vz: 0.0,
										
										HOME_POSITION_latitude: 0.0, 
										HOME_POSITION_longitude: 0.0, 
										HOME_POSITION_altitude: 0.0, 

										ALTITUDE_altitude_monotonic: 0.0, 
										ALTITUDE_altitude_amsl: 0.0, 
										ALTITUDE_altitude_local: 0.0,
										ALTITUDE_altitude_relative: 0.0, 
										ALTITUDE_altitude_terrain: 0.0, 
										ALTITUDE_bottom_clearance: 0.0,
										
										VFR_HUD_airspeed: 0.0, 
										VFR_HUD_groundspeed: 0.0, 
										VFR_HUD_heading: 0, 
										VFR_HUD_throttle: 0,
										VFR_HUD_alt: 0.0, 
										VFR_HUD_climb: 0.0, 
									 
										ATTITUDE_TARGET_body_roll_rate: 0.0,
										ATTITUDE_TARGET_body_pitch_rate: 0.0,
										ATTITUDE_TARGET_body_yaw_rate: 0.0,
										ATTITUDE_TARGET_thrust: 0.0,

										ATTITUDE_roll: 0.0, 
										ATTITUDE_pitch: 0.0, 
										ATTITUDE_yaw: 0.0,
										ATTITUDE_roll_deg: 0.0, 
										ATTITUDE_pitch_deg: 0.0, 
										ATTITUDE_yaw_deg: 0.0, 
										ATTITUDE_rollspeed: 0.0,
										ATTITUDE_pitchspeed: 0.0, 
										ATTITUDE_yawspeed: 0.0, 
										ATTITUDE_rollspeed_deg: 0.0,
										ATTITUDE_pitchspeed_deg: 0.0, 
										ATTITUDE_yawspeed_deg: 0.0, 
										
										SCALED_PRESSURE_press_abs: 0.0,
										SCALED_PRESSURE_press_diff: 0.0, 
										SCALED_PRESSURE_temperature: 0.0, 
										
										STATUSTEXT_severity: 0.0,
										STATUSTEXT_text: '--',
									 
									//	TIME_ESTIMATE_TO_TARGET_time_to_target: 0.0,
									//	TIME_ESTIMATE_TO_TARGET_eta: 0.0,

										HIGHRES_IMU_xacc: 0.0, 
										HIGHRES_IMU_yacc: 0.0, 
										HIGHRES_IMU_zacc: 0.0, 
										HIGHRES_IMU_xgyro: 0.0,
										HIGHRES_IMU_ygyro: 0.0, 
										HIGHRES_IMU_zgyro: 0.0, 
										HIGHRES_IMU_xmag: 0.0, 
										HIGHRES_IMU_ymag: 0.0,
										HIGHRES_IMU_zmag: 0.0, 
										HIGHRES_IMU_temperature: 0.0, 

										VIBRATION_vibration_x: 0.0,
										VIBRATION_vibration_y: 0.0, 
										VIBRATION_vibration_z: 0.0, 
										VIBRATION_clipping: 0,
										
										BATTERY_STATUS_current_consumed: 0, 
										BATTERY_STATUS_energy_consumed: 0, 
										BATTERY_STATUS_temperature: -32768,
										BATTERY_STATUS_voltages: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 
										BATTERY_STATUS_voltages_0: 0, 
										BATTERY_STATUS_voltages_1: 0,
										BATTERY_STATUS_voltages_2: 0, 
										BATTERY_STATUS_voltages_3: 0, 
										BATTERY_STATUS_voltages_4: 0,
										BATTERY_STATUS_voltages_5: 0, 
										
										RC_CHANNELS_RAW_chan1_raw: 0, ///RC_CHANNELS_RAW (35) 
										RC_CHANNELS_RAW_chan2_raw: 0,
										RC_CHANNELS_RAW_chan3_raw: 0, 
										RC_CHANNELS_RAW_chan4_raw: 0, 
										RC_CHANNELS_RAW_chan5_raw: 0,
										RC_CHANNELS_RAW_chan6_raw: 0,
										RC_CHANNELS_RAW_chan7_raw: 0,
										RC_CHANNELS_RAW_chan8_raw: 0, 
										RC_CHANNELS_RAW_rssi: 0, 
										RC_CHANNELS_RAW_port: 0, 
										
										RC_CHANNELS_SCALED_chan1_scaled: 0, 
										RC_CHANNELS_SCALED_chan2_scaled: 0, 
										RC_CHANNELS_SCALED_chan3_scaled: 0, 
										RC_CHANNELS_SCALED_chan4_scaled: 0, 
										RC_CHANNELS_SCALED_chan5_scaled: 0, 
										RC_CHANNELS_SCALED_chan6_scaled: 0, 
										RC_CHANNELS_SCALED_chan7_scaled: 0, 
										RC_CHANNELS_SCALED_chan8_scaled: 0, 
										RC_CHANNELS_SCALED_rssi: 0, 
										RC_CHANNELS_SCALED_port: 0, 
										 
										SERVO_OUTPUT_RAW_servo1_raw: 0,
										SERVO_OUTPUT_RAW_servo2_raw: 0, 
										SERVO_OUTPUT_RAW_servo3_raw: 0, 
										SERVO_OUTPUT_RAW_servo4_raw: 0,
										SERVO_OUTPUT_RAW_servo5_raw: 0,
										SERVO_OUTPUT_RAW_servo6_raw: 0, 
										SERVO_OUTPUT_RAW_servo7_raw: 0, 
										SERVO_OUTPUT_RAW_servo8_raw: 0,
										SERVO_OUTPUT_RAW_port: 0,
										 

										
										MISSION_CURRENT_seq: 0, 
										COMMAND_ACK_command: 0, 
										COMMAND_ACK_result: 0, 
										COMMAND_ACK_result_str: '---',
										
										ESTIMATOR_STATUS_flags: 0, 
										ESTIMATOR_STATUS_vel_ratio: 0.0, 
										ESTIMATOR_STATUS_pos_horiz_ratio: 0.0,
										ESTIMATOR_STATUS_pos_vert_ratio: 0.0, 
										ESTIMATOR_STATUS_mag_ratio: 0.0, 
										ESTIMATOR_STATUS_hagl_ratio: 0.0,
										ESTIMATOR_STATUS_tas_ratio: 0.0, 
										ESTIMATOR_STATUS_pos_horiz_accuracy: 0.0,
										ESTIMATOR_STATUS_pos_vert_accuracy: 0.0, 
										STATUSTEXT_text: ''
}));

const heartbeatMappings = {
        HEARTBEAT_type: {
			0 : 'GENERIC',
			1 : 'FIXED_WING',
			2 : 'QUADROTOR',
			3 : 'COAXIAL',
			4 : 'HELICOPTER',
			5 : 'ANTENNA_TRACKER',
			6 : 'GCS',
			7 : 'AIRSHIP',
			8 : 'FREE_BALLOON',
			9 : 'ROCKET',
			10 : 'GROUND_ROVER',
			11 : 'SURFACE_BOAT',
			12 : 'SUBMARINE',
			13 : 'HEXAROTOR',
			14 : 'OCTOROTOR',
			15 : 'TRICOPTER',
			16 : 'FLAPPING_WING',
			17 : 'KITE',
			18 : 'ONBOARD_CONTROLLER',
			19 : 'VTOL_TAILSITTER_DUOROTOR',
			20 : 'VTOL_TAILSITTER_QUADROTOR',
			21 : 'VTOL_TILTROTOR',
			22 : 'VTOL_FIXEDROTOR',
			23 : 'VTOL_TAILSITTER',
			24 : 'VTOL_TILTWING',
			25 : 'VTOL_RESERVED5',
			26 : 'GIMBAL',
			27 : 'ADSB',
			28 : 'PARAFOIL',
			29 : 'DODECAROTOR',
			30 : 'CAMERA',
			31 : 'CHARGING_STATION',
			32 : 'FLARM',
			33 : 'SERVO',
			34 : 'ODID',
			35 : 'DECAROTOR',
			36 : 'BATTERY',
			37 : 'PARACHUTE',
			38 : 'LOG',
			39 : 'OSD',
			40 : 'IMU',
			41 : 'GPS',
			42 : 'WINCH',
			43 : 'GENERIC_MULTIROTOR',
			44 : 'ILLUMINATOR',
			45 : 'SPACECRAFT_ORBITER'

        },
        HEARTBEAT_autopilot: {
            0: 'GENERIC',
            1: 'RESERVED',
            2: 'SLUGS',
            3: 'ARDUPILOTMEGA',
            4: 'OPENPILOT',
            5: 'GENERIC_WAYPOINTS_ONLY',
            6: 'GENERIC_WAYPOINTS_AND_SIMPLE_NAVIGATION_ONLY',
            7: 'GENERIC_MISSION_FULL',
            8: 'INVALID',
            9: 'PPZ',
            10: 'UDB',
            11: 'FP',
            12: 'PIXHAWK',
            13: 'PX4',
            14: 'SMACCMPILOT',
            15: 'AUTOQUAD',
            16: 'ARMAZILA',
            17: 'AEROB',
            18: 'ASLUAV'
        },
        HEARTBEAT_base_mode: {
            // Bitmask flags (can be combined)
            128: 'CUSTOM_MODE_ENABLED',	// Custom flight mode (e.g., STABILIZE)
            64: 'TEST_ENABLED',
            32: 'AUTO_ENABLED',
            16: 'GUIDED_ENABLED',
            8: 'STABILIZE_ENABLED',
            4: 'HIL_ENABLED',
            2: 'MANUAL_INPUT_ENABLED',
            1: 'SAFETY_ARMED'				//indicating the vehicle is not armed
        },
        HEARTBEAT_system_status: {
            0: 'UNINIT', //'Uninitialized system, state is unknown',
            1: 'BOOT', //'System is booting up',
            2: 'CALIBRATING', //'System is calibrating and not flight-ready',
            3: 'STANDBY', //'System is grounded and on standby. It can be launched any time',
            4: 'ACTIVE', //'System is active and might be already airborne. Motors are engaged',
            5: 'CRITICAL', //'System is in a non-normal flight mode (failsafe)',
            6: 'EMERGENCY', //'It lost control over parts or over the whole airframe. It is in mayday and going down',
            7: 'POWEROFF', // 'System just initialized its power-down sequence, will shut down now',
            8: 'TERMINATION' //'System is terminating itself (failsafe or commanded)'
        },
		HEARTBEAT_system_status_des: {
            'UNINIT'		:'Uninitialized system, state is unknown',
            'BOOT'			:'System is booting up',
            'CALIBRATING'	:'System is calibrating and not flight-ready',
            'STANDBY'		:'System is grounded and on standby. It can be launched any time',
            'ACTIVE'		:'System is active and might be already airborne. Motors are engaged',
            'CRITICAL'		:'System is in a non-normal flight mode (failsafe)',
            'EMERGENCY'		:'It lost control over parts or over the whole airframe. It is in mayday and going down',
            'POWEROFF'		: 'System just initialized its power-down sequence, will shut down now',
            'TERMINATION'	:'System is terminating itself (failsafe or commanded)'
        }
    };
	//const statusDescription = heartbeatMappings.HEARTBEAT_system_status_des[statusName];
// MAVLink flight mode mapping (custom modes for ArduPilot/PX4)
const FLIGHT_MODES = {
    'MANUAL': 0,
    'STABILIZED': 2,
    'ACRO': 1,
    'RATTIUDE': 8, // Note: Corrected spelling from 'Rattiude'
    'ALTITUDE': 16,
    'OFFBOARD': 15,
    'POSITION': 3,
    'HOLD': 5,
    'MISSION': 4,
    'RETURN': 6,
    'FOLLOW': 10,
    'PRECISIONLAND': 23
};



// Create data URIs for each SVG
const droneSvgIcons = {};
Object.keys(droneSvgMarkers).forEach(type => {
    // Temporarily replace {heading} with 0 to create a valid base SVG
    const svgWithDefaultHeading = droneSvgMarkers[type].replace('{heading}', '0');
    droneSvgIcons[type] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgWithDefaultHeading.trim());
});

function getParameterGroup(paramId) {
    const prefix = paramId.includes('_') ? paramId.split('_')[0] + '_' : 'DEFAULT';
    return PARAMETER_GROUPS.hasOwnProperty(prefix) ? prefix : 'DEFAULT';
} 
 
 // Function to get parameter description
function getParameterDescription(paramId) {
    const group = getParameterGroup(paramId);
    return PARAMETER_GROUPS[group] || 'No description available.';
}

 // Function to format parameter value based on type
function formatParameterValue(value, paramType) {
    switch (paramType) {
        case 1: // UINT8
        case 2: // INT8
        case 3: // UINT16
        case 4: // INT16
        case 5: // UINT32
        case 6: // INT32
            return Math.round(value).toString(); // Integer types
        case 9: // FLOAT
            return value.toFixed(2); // Float to 2 decimal places
        case 10: // DOUBLE
            return value.toFixed(4); // Double to 4 decimal places
        default:
            return value.toString(); // Fallback
    }
}
 
 
function flattenObject(obj, parentKey = '', sep = '.') {
	const items = [];
	for (const [key, value] of Object.entries(obj)) {
		const newKey = parentKey ? `${parentKey}${sep}${key}` : key;
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			items.push(...flattenObject(value, newKey, sep));
		} else {
			items.push([newKey, value]);
		}
	}
	return items;
}

const dataList = document.getElementById('data-list');

function updateDataList(data) {
	console.log('Updating data list with:', data);
	const flatData = flattenObject(data);
	console.log('Updating flatData list with:', flatData);
	//console.log('Flattened data:', flatData);
	for (const [key, value] of flatData) {
		// Display numbers with 6 decimal places to catch minor changes
		const displayValue = Number.isFinite(value) ? value.toFixed(6) : value;
		const existingLi = document.getElementById(`data-${key.replace(/\./g, '-')}`);
		
		if (!dataStore.has(key)) {
			// New key: create a new list item
			const li = document.createElement('li');
			li.id = `data-${key.replace(/\./g, '-')}`;
			li.innerHTML = `<span class="key">${key}</span>: <span class="value">${displayValue}</span>`;
			dataList.appendChild(li);
			dataStore.set(key, displayValue);
			console.log(`Added new key: ${key} = ${displayValue}`);
		} else {
			// Always update the value to ensure the UI reflects the latest data
			if (existingLi) {
				existingLi.querySelector('.value').textContent = displayValue;
				dataStore.set(key, displayValue);
				console.log(`Updated key: ${key} = ${displayValue}`);
			}
		}
	}
}

// Function to initialize the sensor table
function footnote(text){	document.getElementById('system_status').textContent=text;	}

// Popup message controller
const popupMessage = {
    element: document.getElementById('popup-message'),
    timeout: null,
    isEnabled: true,
    isHovering: false,

    // Initialize popup functionality
    init() {
        // Add click handler for mavlink-status toggle
        const mavlinkStatus = document.getElementById('mavlink-status');
        mavlinkStatus.addEventListener('click', () => {
            this.toggleEnabled();
        });

        // Add mouse enter handler to keep popup visible
        this.element.addEventListener('mouseenter', () => {
            this.isHovering = true;
            if (this.timeout) {
                clearTimeout(this.timeout);
                this.timeout = null;
            }
        });

        // Add mouse leave handler to start hide timer
        this.element.addEventListener('mouseleave', () => {
            this.isHovering = false;
            if (this.element.classList.contains('show')) {
                this.timeout = setTimeout(() => {
                    this.hide();
                }, 2000); // Duration after mouse leaves
            }
        });
    },

    // Show popup message
show(message, duration = 2000, type = 'info') {
    if (!this.isEnabled) return;
    
    if (this.timeout) {
        clearTimeout(this.timeout);
    }
    
    this.element.textContent = message;
    this.element.className = `popup-message ${type}`; // Add type class
    this.element.classList.remove('hide');
    this.element.classList.add('show');
    
    this.timeout = setTimeout(() => {
        this.hide();
    }, duration);
},

    // Hide popup message
    hide() {
        this.element.classList.remove('show');
        this.element.classList.add('hide');
        this.timeout = null;
    },

    // Toggle popup enabled state
    toggleEnabled() {
        this.isEnabled = !this.isEnabled;
        const status = this.isEnabled ? 'enabled' : 'disabled';
        this.show(`Pop-up messages ${status}`);
        // Visual feedback on mavlink-status
        const mavlinkStatus = document.getElementById('mavlink-status');
        mavlinkStatus.style.opacity = this.isEnabled ? '1' : '0.5';
    }
};

// Initialize flight mode button listeners
function initFlightModeButtons() {
    const buttons = document.querySelectorAll('#left-sidebar .normal-btn');
    buttons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const modeName = button.textContent;
            handleFlightModeClick(modeName);
        });
    });
}

// Replacement for console.log
function showPopup(message, duration = 2000) {
    popupMessage.show(message, duration);
}



function initializeSensorTable() {
    const tbody = document.getElementById('sensor-status-body');
    if (!tbody) return; // Exit if table is not found
    tbody.innerHTML = ''; // Clear existing rows
    sensorNames.forEach((name, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td id="sensor-name-${index}">${name}</td>
            <td id="sensor-present-${index}">---</td>
            <td id="sensor-health-${index}">---</td>
        `;
        tbody.appendChild(row);
    });
}



function updateStatusLog(newMessage) {
    // Get current boot time or use Date.now() as fallback
    const timestamp = mavData.has('SYSTEM_TIME_time_boot_ms') ? `[${(mavData.get('SYSTEM_TIME_time_boot_ms') / 1000).toFixed(2)}s]` : `[${new Date().toLocaleTimeString()}]`;
    
    // Format the new message with timestamp
    const formattedMessage = `${timestamp} ${newMessage}`;
    
    // Get the last message in the log
    const lastMessage = state.statusTextLog.length > 0 ? state.statusTextLog[state.statusTextLog.length - 1] : null;
    
    // Only add if different from last message (ignoring timestamp)
    if (!lastMessage || !lastMessage.endsWith(newMessage))    state.statusTextLog.push(formattedMessage); 
    
    // Keep only the last 10 messages
    if (state.statusTextLog.length > 50)  state.statusTextLog = state.statusTextLog.slice(-50); 
    
    // Update the UI
    const logElement = document.getElementById('status-text-log');
    if (logElement) {
        logElement.textContent = state.statusTextLog.join('\n');
        logElement.scrollTop = logElement.scrollHeight;
    }
}
 






function updateDomForFields(mavMessage) {
    for (const [key, value] of Object.entries(mavMessage)) {
													// Skip if value hasn't changed
													//if (state.previousMavData.has(key) && state.previousMavData.get(key) === value) 	continue;        
													const element = document.getElementById(key);
													if (!element) {// console.warn(`DOM ${key} not find`); 				
													continue; } //DOM class,timestamp not find
													
													let displayValue = value;

													// Format numbers based on key (same logic as original putInElements)
													if (typeof value === 'number' && !Number.isInteger(value) &&
														!['_raw', '_mode', '_status', '_type', 'time_', '_seq', '_rssi', '_clipping', '_flags', 'count', 'satellites_', 'consumed', 'voltages_'].some(s => key.includes(s))) {
														displayValue = Math.abs(value) > 10 ? value.toFixed(1) :
																	  Math.abs(value) > 1 ? value.toFixed(2) :
																	  value !== 0 ? value.toFixed(3) : value.toFixed(1);
													} else if (typeof value === 'number' && key.includes('voltages_')) {
														displayValue = value;
													} else if (typeof value === 'number' && key.includes('_raw')) {
														displayValue = Math.round(value);
													}

													//console.log(`Updating DOM: ${key} = ${displayValue}`);
													element.textContent = displayValue ?? '---';
													//state.previousMavData.set(key, value); // Update cache
												}
}


 
// Update your arming function to handle more states
function setArmSVG(armStatus) {
    const armButton = document.querySelector('#arm-status');
    const path = armButton.querySelector('svg path');
    const text = armButton.querySelector('svg text');

    armButton.classList.remove('armed', 'disarmed', 'pending', 'error');

         if (armStatus === 1) {
        path.setAttribute('fill', '#00ff00');
        text.textContent = 'ARMED';
        armButton.classList.add('armed');
    } 
	else if (armStatus === 0) {
        path.setAttribute('fill', '#ff0000');
        text.textContent = 'ARM';
        armButton.classList.add('disarmed');
    } 
	else if (armStatus === 'pending') {
        path.setAttribute('fill', '#ffff00');
        text.textContent = '...';
        armButton.classList.add('pending');
    } 
	else if (armStatus === 'error') {
        path.setAttribute('fill', '#ff00ff');
        text.textContent = 'ERR';
        armButton.classList.add('error');
    }
}
// Add click handler for the arm button




 ////////////////////////////////////
function toggleAutopilot() {
    state.autoPilot = !state.autoPilot;

    const icon = document.getElementById('autopilot-icon');
    const layer = document.getElementById('autopilot-layer');
    if (!icon || !layer) return;

    icon.style.fill = state.autoPilot ? '#00ff00' : '#000000';
    layer.style.display = state.autoPilot ? 'block' : 'none';

    // Tell server to activate/pause AI tier
    if (state.websocket?.readyState === WebSocket.OPEN) {
        state.websocket.send(JSON.stringify({
            set_autopilot_mode: state.autoPilot
        }));
    }

    if (state.autoPilot) {
        // Tier 2 ON: request current AI analysis immediately
        UnifiedAudioQueue.enqueue('AI autopilot mode enabled', { priority: 7, source: 'ai' });
        if (state.websocket?.readyState === WebSocket.OPEN) {
            state.websocket.send(JSON.stringify({ request_camera_info: true }));
        }
    } else {
        // Tier 2 OFF: clear AI advice items from queue
        UnifiedAudioQueue._queue = UnifiedAudioQueue._queue.filter(m => m.source !== 'ai');
        UnifiedAudioQueue.enqueue('AI autopilot mode disabled', { priority: 6, source: 'command' });
    }

    console.log(`Autopilot mode: ${state.autoPilot ? 'ENABLED' : 'DISABLED'}`);
}