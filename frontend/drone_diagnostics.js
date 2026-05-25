// drone_diagnostics.js
// Pure data — no audio, no DOM.
// Each entry: { message, action, priority, tier }
//   tier 1 = always spoken, tier 2 = only in autopilot mode

const DRONE_DIAGNOSTICS = {

    // ── System status ─────────────────────────────────────────────────────
    'system_status:UNINIT': {
        priority: 9,
        tier: 1,
        message: 'System initializing',
        action:  'Wait for sensors to boot. Do not send commands.',
    },
    'system_status:BOOT': {
        priority: 8,
        tier: 1,
        message: 'System booting',
        action:  'Wait for boot sequence to complete.',
    },
    'system_status:CALIBRATING': {
        priority: 7,
        tier: 1,
        message: 'Calibrating sensors',
        action:  'Keep drone still on a level surface.',
    },
    'system_status:STANDBY': {
        priority: 3,
        tier: 1,
        message: 'System ready for arming',
        action:  'Check pre-arm conditions before arming.',
    },
    'system_status:ACTIVE': {
        priority: 4,
        tier: 1,
        message: 'System armed and active',
        action:  'Drone is live. Maintain situational awareness.',
    },
    'system_status:CRITICAL': {
        priority: 10,
        tier: 1,
        message: 'System critical failure',
        action:  'Land immediately. Check STATUSTEXT for details.',
    },
    'system_status:EMERGENCY': {
        priority: 10,
        tier: 1,
        message: 'Emergency state',
        action:  'Initiate emergency landing immediately.',
    },
    'system_status:POWEROFF': {
        priority: 9,
        tier: 1,
        message: 'System powering off',
        action:  'Normal shutdown in progress.',
    },

    // ── Armed state ───────────────────────────────────────────────────────
    'armed:true': {
        priority: 8,
        tier: 1,
        message: 'Drone armed',
        action:  'Motors live. Clear the area.',
    },
    'armed:false': {
        priority: 6,
        tier: 1,
        message: 'Drone disarmed',
        action:  'Safe to approach.',
    },

    // ── GPS fix ───────────────────────────────────────────────────────────
    'gps_fix:0': {
        priority: 9,
        tier: 1,
        message: 'No GPS signal',
        action:  'Move to open sky. Cannot arm in position or mission modes without fix.',
    },
    'gps_fix:1': {
        priority: 8,
        tier: 1,
        message: 'GPS no fix',
        action:  'Signal acquired but no position lock. Wait or reposition.',
    },
    'gps_fix:2': {
        priority: 6,
        tier: 1,
        message: 'GPS 2D fix only',
        action:  'Altitude unreliable. Do not fly in GPS-dependent modes.',
    },
    'gps_fix:3': {
        priority: 3,
        tier: 1,
        message: 'GPS 3D fix',
        action:  'Position locked. Ready for GPS-dependent flight.',
    },
    'gps_fix:4': {
        priority: 2,
        tier: 1,
        message: 'GPS DGPS fix',
        action:  'Enhanced GPS accuracy active.',
    },
    'gps_fix:5': {
        priority: 2,
        tier: 1,
        message: 'GPS RTK float',
        action:  'High-accuracy positioning active.',
    },
    'gps_fix:6': {
        priority: 1,
        tier: 1,
        message: 'GPS RTK fixed',
        action:  'Maximum GPS accuracy.',
    },

    // ── Battery thresholds (checked as ranges, not exact values) ─────────
    'battery:<10': {
        priority: 10,
        tier: 1,
        message: 'Battery critical, under 10 percent',
        action:  'Land immediately. Power failure imminent.',
    },
    'battery:<20': {
        priority: 9,
        tier: 1,
        message: 'Battery very low, under 20 percent',
        action:  'Return to launch now.',
    },
    'battery:<30': {
        priority: 7,
        tier: 1,
        message: 'Battery low, under 30 percent',
        action:  'Consider returning to launch.',
    },

    // ── Flight mode changes ───────────────────────────────────────────────
    'flight_mode:0': {
        priority: 5, tier: 1,
        message: 'Manual mode',
        action:  'Full manual control. No stabilization.',
    },
    'flight_mode:1': {
        priority: 5, tier: 1,
        message: 'Altitude control mode',
        action:  'Altitude stabilized. Manual heading.',
    },
    'flight_mode:2': {
        priority: 5, tier: 1,
        message: 'Position hold mode',
        action:  'GPS position and altitude hold active.',
    },
    'flight_mode:3': {
        priority: 5, tier: 1,
        message: 'Mission mode',
        action:  'Autonomous mission in progress.',
    },
    'flight_mode:4': {
        priority: 7, tier: 1,
        message: 'Hold mode',
        action:  'Loitering at current position.',
    },
    'flight_mode:5': {
        priority: 7, tier: 1,
        message: 'Return to launch',
        action:  'Returning home automatically.',
    },
    'flight_mode:6': {
        priority: 8, tier: 1,
        message: 'Land mode',
        action:  'Automated landing in progress.',
    },
    'flight_mode:7': {
        priority: 6, tier: 1,
        message: 'Follow me mode',
        action:  'Tracking operator position.',
    },

    // ── Pre-arm STATUSTEXT patterns (substring match) ─────────────────────
    'statustext:PreArm: Gyros not calibrated': {
        priority: 8, tier: 1,
        message: 'Gyroscope not calibrated',
        action:  'Run gyro calibration in ground station before arming.',
    },
    'statustext:PreArm: Accels not calibrated': {
        priority: 8, tier: 1,
        message: 'Accelerometer not calibrated',
        action:  'Run accelerometer calibration. Place drone on level surface.',
    },
    'statustext:PreArm: Compass not calibrated': {
        priority: 8, tier: 1,
        message: 'Compass not calibrated',
        action:  'Run compass calibration. Move away from metal objects.',
    },
    'statustext:PreArm: GPS': {
        priority: 9, tier: 1,
        message: 'GPS pre-arm check failed',
        action:  'Wait for GPS 3D fix or switch to non-GPS flight mode.',
    },
    'statustext:PreArm: Battery': {
        priority: 9, tier: 1,
        message: 'Battery pre-arm check failed',
        action:  'Charge battery above minimum arming threshold.',
    },
    'statustext:PreArm: RC not calibrated': {
        priority: 7, tier: 1,
        message: 'Radio control not calibrated',
        action:  'Run RC calibration in ground station.',
    },
    'statustext:PreArm: Barometer': {
        priority: 8, tier: 1,
        message: 'Barometer pre-arm check failed',
        action:  'Check barometer sensor. Shelter from wind.',
    },
    'statustext:PreArm: Motors': {
        priority: 8, tier: 1,
        message: 'Motors pre-arm check failed',
        action:  'Verify frame class and motor configuration in parameters.',
    },
    'statustext:PreArm: Logging': {
        priority: 6, tier: 1,
        message: 'SD card logging not ready',
        action:  'Check SD card is inserted and not full.',
    },
    'statustext:EKF': {
        priority: 9, tier: 1,
        message: 'Navigation filter error',
        action:  'EKF variance too high. Do not fly. Check IMU and GPS.',
    },
    'statustext:Crash': {
        priority: 10, tier: 1,
        message: 'Crash detected',
        action:  'Disarm immediately. Inspect airframe before next flight.',
    },

    // ── Tier 2 only — AI advisor supplements ─────────────────────────────
    // These only speak in autopilot mode; Tier 1 shows UI only
    'imu_drift': {
        priority: 8, tier: 2,
        message: 'IMU drift detected',
        action:  'AI detected attitude inconsistency. Consider landing for recalibration.',
    },
    'gps_accuracy_drop': {
        priority: 7, tier: 2,
        message: 'GPS accuracy degrading',
        action:  'Satellite count dropped significantly. Monitor position hold quality.',
    },
};

// ── Lookup helpers ────────────────────────────────────────────────────────────

/**
 * Exact key lookup (system_status, armed, flight_mode, gps_fix).
 */
function diagLookup(field, value) {
    return DRONE_DIAGNOSTICS[`${field}:${value}`] || null;
}

/**
 * Range lookup for battery level (checks thresholds in priority order).
 */
function diagBatteryLookup(pct) {
    if (pct < 10)  return DRONE_DIAGNOSTICS['battery:<10'];
    if (pct < 20)  return DRONE_DIAGNOSTICS['battery:<20'];
    if (pct < 30)  return DRONE_DIAGNOSTICS['battery:<30'];
    return null;
}

/**
 * Substring match for STATUSTEXT strings.
 * Returns the first matching entry or null.
 */
function diagStatustextLookup(text) {
    for (const key of Object.keys(DRONE_DIAGNOSTICS)) {
        if (!key.startsWith('statustext:')) continue;
        const pattern = key.replace('statustext:', '');
        if (text.includes(pattern)) return DRONE_DIAGNOSTICS[key];
    }
    return null;
}

const DroneStateManager = {
    _prev: {},   // previous values — only announce actual changes

    /**
     * Called by each decoder with the new decoded value.
     * If the value changed, looks up the diagnostic table and routes to SpeechManager.
     */
    update(field, value) {
                            if (this._prev[field] === value) return;   // no change, skip
                            const prev = this._prev[field];
                            this._prev[field] = value;

                            console.log(`[DroneState] ${field}: ${prev ?? '?'} → ${value}`);

                            // Route to the right lookup
                            switch (field) {
                                            case 'system_status':
                                                SpeechManager.speakDiag(diagLookup('system_status', value), `sys:${value}`);
                                                break;
                                            case 'armed':
                                                SpeechManager.speakDiag(diagLookup('armed', String(value)), `armed:${value}`);
                                                break;
                                            case 'flight_mode':
                                                SpeechManager.speakDiag(diagLookup('flight_mode', value), `mode:${value}`);
                                                break;
                                            case 'gps_fix':
                                                SpeechManager.speakDiag(diagLookup('gps_fix', value), `gps:${value}`);
                                                break;
                                            case 'battery_pct':
                                                SpeechManager.speakDiag(diagBatteryLookup(value), `bat:${Math.floor(value/10)*10}`);
                                                break;
                                            case 'statustext':
                                                const diag = diagStatustextLookup(value);
                                                if (diag)                     SpeechManager.speakDiag(diag, `st:${value}`);
                                                else {
                                                        // No table match → speak raw but deduped
                                                        SpeechManager.speak(`Status: ${value}`, {
                                                            source: 'statustext', priority: 5, tier: 1,
                                                            dedupeKey: `raw:${value}`,
                                                        });
                                                    }
                                                break;
                                        }
                        }
};


// Add to ai.js or a new speech_manager.js
const SpeechManager = {

    // Tracks last-spoken per field to prevent repeats
    _lastSpoken: new Map(),
    _REPEAT_SUPPRESS_MS: 30_000,

    /**
     * The ONE function every decoder calls.
     *
     * @param {string}  text       - What to say
     * @param {object}  options
     *   source    'heartbeat'|'sys_status'|'gps'|'statustext'|'ai'|'command'
     *   priority  1-10
     *   tier      1 = always, 2 = only in autopilot mode
     *   dedupeKey optional string to suppress same message within 30s
     *   action    optional operator action string (logged, shown in popup, not spoken in Tier 1)
     */
    speak(text, options = {}) {
        const { source = 'other', priority = 5, tier = 1,
                dedupeKey = text, action = null } = options;

        // Tier gate — Tier 2 items only spoken when autopilot is on
        if (tier === 2 && !state.autoPilot) {
            // Still log and show in UI, just don't speak
            if (action) console.log(`[Tier2 suppressed] ${text} → ${action}`);
            return;
        }

        // Dedup suppression
        const lastTime = this._lastSpoken.get(dedupeKey) || 0;
        if (Date.now() - lastTime < this._REPEAT_SUPPRESS_MS) return;
        this._lastSpoken.set(dedupeKey, Date.now());

        // Show action hint as popup tooltip (not spoken)
        if (action && state.autoPilot) {
            popupMessage.show(`💡 ${action}`, 4000);
        }

        // Route to unified audio queue
        UnifiedAudioQueue.enqueue(text, { priority, source });
    },

    /**
     * Speak a diagnostic table result.
     * Handles the tier check and action display automatically.
     */
    speakDiag(diag, dedupeKey) {
        if (!diag) return;
        this.speak(diag.message, {
            source:    'status',
            priority:  diag.priority,
            tier:      diag.tier ?? 1,
            dedupeKey: dedupeKey,
            action:    diag.action,
        });
    },

    /** AI advice from server — always Tier 2 */
    speakAI(text, priority = 5, action = null) {
        this.speak(text, { source: 'ai', priority, tier: 2, action });
    },

    /** Command confirmations — always Tier 1 */
    speakCommand(text, success = true) {
        this.speak(text, {
            source:   'command',
            priority: success ? 6 : 8,
            tier:     1,
            dedupeKey: text + Date.now(), // commands are always unique
        });
    },

    /** Clear all dedup history (call on reconnect) */
    reset() {
        this._lastSpoken.clear();
    }

};

function heartbeatDecoding(mavMessage) {
    // DOM updates (unchanged)
    const typeDesc     = heartbeatMappings.HEARTBEAT_type[parseInt(mavMessage.HEARTBEAT_type)] || 'UNKNOWN';
    const autopilotDesc= heartbeatMappings.HEARTBEAT_autopilot[parseInt(mavMessage.HEARTBEAT_autopilot)] || 'UNKNOWN';
    const statusValue  = parseInt(mavMessage.HEARTBEAT_system_status);
    const systemStatus = heartbeatMappings.HEARTBEAT_system_status[statusValue] || 'UNKNOWN';
    const baseMode     = parseInt(mavMessage.HEARTBEAT_base_mode);
    const customMode   = parseInt(mavMessage.HEARTBEAT_custom_mode);
    const isArmed      = (baseMode & 128) !== 0;
      // Decode PX4 flight mode
	// const mainMode = (customMode >> 16) & 0xFF;
    // const subMode  = (customMode >> 24) & 0xFF;
    // const px4Mode = decodePX4Mode(mainMode, subMode);
	 
    //Correct arming logic
    // const isArmed = !!(baseMode & MAV_MODE_FLAG_SAFETY_ARMED);
    // const isHIL = !!(baseMode & MAV_MODE_FLAG_HIL_ENABLED);

    setArmSVG(isArmed ? 1 : 0);
	 
	 
	 
	 
	 
    if (saveMavDataIfChanged('HEARTBEAT_type', typeDesc))        document.getElementById('HEARTBEAT_type').textContent = typeDesc;
    if (saveMavDataIfChanged('HEARTBEAT_system_status', systemStatus)) {
																		document.getElementById('HEARTBEAT_system_status').textContent = systemStatus;
																		footnote(heartbeatMappings.HEARTBEAT_system_status_des[systemStatus]);
																	}
    if (saveMavDataIfChanged('HEARTBEAT_custom_mode', customMode))        document.getElementById('HEARTBEAT_custom_mode').textContent = customMode;

    // State changes → DroneStateManager (it decides what to say)
    DroneStateManager.update('system_status', systemStatus);
    DroneStateManager.update('armed', isArmed);
    DroneStateManager.update('flight_mode', customMode);

    updateStatusLog(`Status: ${systemStatus}  Mode: ${customMode}  Armed: ${isArmed}`);
}

function sysStatusDecoding(mavMessage) {
    updateMavDataIfChanged(mavMessage);
    updateSensorTable(mavMessage);
    updateDomForFields(mavMessage);

    const pct = parseInt(mavMessage.SYS_STATUS_battery_remaining);
    batteryLevel(pct);                          // visual update
	
	document.getElementById('SYS_STATUS_voltage_battery').textContent =mavMessage.SYS_STATUS_voltage_battery;
	 document.getElementById('SYS_STATUS_current_battery').textContent =mavMessage.SYS_STATUS_current_battery;
	 document.getElementById('SYS_STATUS_battery_remaining').textContent =mavMessage.SYS_STATUS_battery_remaining;
	
	
    DroneStateManager.update('battery_pct', pct); // speech decision
	
}



function gpsDataUpdate(mavMessage) { ///===========>>updateMarker()
    updateMavDataIfChanged(mavMessage);
	updateDomForFields(mavMessage);	
	const fixType = parseInt(mavMessage.GPS_RAW_INT_fix_type);
    DroneStateManager.update('gps_fix', fixType);
    if (mavData.has('GPS_RAW_INT_fix_type_str') && mavData.has('GPS_RAW_INT_satellites_visible')) {
        updateGPSicon(mavData.get('GPS_RAW_INT_fix_type_str'), mavData.get('GPS_RAW_INT_satellites_visible'));
    }

    if (mavData.has('GPS_RAW_INT_lat') && mavData.has('GPS_RAW_INT_lon') && mavData.has('GPS_RAW_INT_fix_type')) {
        const lat = mavData.get('GPS_RAW_INT_lat');
        const lon = mavData.get('GPS_RAW_INT_lon');
      //  const fixType = mavData.get('GPS_RAW_INT_fix_type');
        const heading = mavData.get('ATTITUDE_yaw_deg') || 0;
      //  console.log(`Processing GPS and heading: lat=${lat}, lon=${lon}, fixType=${fixType}, heading=${heading.toFixed(2)}°`);

        // Update home position if GPS is valid
        if (fixType >= 2 && lat !== 0 && lon !== 0) {
            current_mission.home.latitude = lat;
            current_mission.home.longitude = lon;
            const homeCoord = ol.proj.fromLonLat([lon, lat], 'EPSG:3857');
            let homeFeature = state.missionSource.getFeatureById('home');
            if (!homeFeature) {
                homeFeature = new ol.Feature({
                    geometry: new ol.geom.Point(homeCoord),
                    type: 'home'
                });
                homeFeature.setId('home');
                state.missionSource.addFeature(homeFeature);
            } else {
                homeFeature.getGeometry().setCoordinates(homeCoord);
            }
            updateMissionLines();
        }

        // Update marker, center map if not yet centered
        updateMarker(lat, lon, fixType, null, heading, {
            centerMap: !state.hasCenteredMap,
            zoomLevel: !state.hasCenteredMap ? 18 : null
        });

        if (!state.hasCenteredMap) {
            state.hasCenteredMap = true;
        }
    }
	
	 
}




function STATUSTEXTdecoding(data) {
    // Extract text cleanly from whichever field the server sends
    const text     = (data.message?.text || data.STATUSTEXT_text || '').trim();
    const severity = data.message?.severity_str || data.STATUSTEXT_severity || 'INFO';
    if (!text) return;

    updateStatusLog(`${severity}: ${text}`);
    DroneStateManager.update('statustext', text);   // dedup + lookup inside manager
}

function STATUSTEXTdecoding_(data) {

    const text = data.STATUSTEXT_text || data.message?.text || '';
    const severity = data.STATUSTEXT_severity_str || data.message?.severity_str || 'INFO';

    if (!text.trim()) {
        console.log('Ignoring empty STATUSTEXT');
        return;
    }

    // Cache suppression
    const cacheKey = `${severity}:${text}`;
    const lastSeen = state.statusTextCache?.get(cacheKey) || 0;
    if (Date.now() - lastSeen < 30000) return;

    state.statusTextCache = state.statusTextCache || new Map();
    state.statusTextCache.set(cacheKey, Date.now());

    // Severity filter
    const validSeverities = ['WARNING', 'ERROR', 'CRITICAL'];
    if (!validSeverities.includes(severity)) return;

    updateStatusLog(`${severity}: ${text}`);
    DroneStateManager.update('statustext', text);   // dedup + lookup inside manager
}
