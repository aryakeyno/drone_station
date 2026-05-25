

// Call this during your initialization
// Function to update the sensor table based on SYS_STATUS data
function updateSensorTable(data) {
    const healthBitmask = parseInt(data.SYS_STATUS_onboard_control_sensors_health, 10) || 0;
    const enabledBitmask = parseInt(data.SYS_STATUS_onboard_control_sensors_enabled, 10) || 0;
    const presentBitmask = parseInt(data.SYS_STATUS_onboard_control_sensors_present, 10) || 0;
//	console.log(presentBitmask,'-',healthBitmask,'-',enabledBitmask)

    sensorNames.forEach((name, index) => {
        // Check enabled, present, and health status
        const isEnabled = isBitSet(enabledBitmask, index);
        const isPresent = isBitSet(presentBitmask, index);
        const isHealthy = isBitSet(healthBitmask, index);

        // Update sensor name (highlight if enabled)
        const nameCell = document.getElementById(`sensor-name-${index}`);
        if (nameCell) {
            nameCell.className = isEnabled ? 'enabled' : '';
            nameCell.textContent = name;
        }

        // Update present status
        const presentCell = document.getElementById(`sensor-present-${index}`);
        if (presentCell) {
            presentCell.textContent = isPresent ? 'Yes' : 'No';
        }

        // Update health status
        const healthCell = document.getElementById(`sensor-health-${index}`);
        if (healthCell) {
            healthCell.textContent = isPresent ? (isHealthy ? 'Healthy' : 'Unhealthy') : '---';
            healthCell.className = isPresent ? (isHealthy ? 'healthy' : 'unhealthy') : '';
        }
    });
}


function logIncomingMavlink(data) {
    const cb = document.getElementById('log-incoming-mavlink');
    if (!cb || !cb.checked) return;
    const logArea = document.getElementById('incoming-mavlink-log');
    if (!logArea) return;
    const time = new Date().toLocaleTimeString();
    let entry = `[${time}] ${data.class}`;
    if (data.message) entry += ` : ${JSON.stringify(data.message)}`;
    else entry += ` : ${JSON.stringify(data)}`;
    // Keep last 500 lines
    let lines = logArea.value.split('\n');
    lines.push(entry);
    if (lines.length > 500) lines = lines.slice(-500);
    logArea.value = lines.join('\n');
    logArea.scrollTop = logArea.scrollHeight;
}



//Received from client: {'class': 'COMMAND_LONG', 'message': {'target_system': 1, 'target_component': 1, 'command': 400, 'confirmation': 0, 'param1': 0, 'param2': 0, 'param3': 0, 'param4': 0, 'param5': 0, 'param6': 0, 'param7': 0}}
/*
Pre-arm check failures (e.g., no GPS lock, uncalibrated sensors, low battery).

Vehicle in an incompatible state (e.g., in flight, safety switch engaged).

System configuration issues (e.g., incorrect flight mode or parameters).

No GPS lock (required for most flight modes).

Uncalibrated sensors (gyro, accelerometer, magnetometer).

Low battery voltage or charge.

Safety switch not disengaged (if hardware switch is used).

Incorrect flight mode or parameter settings.



*/


function sendArmingCommand0(arm = true, force = false) {
    if (!state.websocket || state.wsStatus !== 'connected') {
        console.error('WebSocket not connected, cannot send arming command');
        state.statusTextLog.push('Error: WebSocket not connected');
        if (state.isAudioEnabled) {
            speechSynthesisPlayer('WebSocket not connected, arming failed');
        }
        return;
    }

    const command = {
        class: 'COMMAND_LONG',
        message: {
            target_system: 1, // System ID, adjust as needed
            target_component: 1, // Component ID, adjust as needed
            command: 400, // MAV_CMD_COMPONENT_ARM_DISARM
            confirmation: 0,
            param1: arm ? 1 : 0, // 1 = arm, 0 = disarm
            param2: force ? 1 : 0, // 0 = arm-disarm unless prevented by safety checks, 1 = forc
            param3: 0,
            param4: 0,
            param5: 0,
            param6: 0,
            param7: 0
        }
    };

    try {
        const commandString = JSON.stringify(command);
		state.websocket.send(commandString);  document.getElementById('last-ws-sent').textContent = commandString;
        console.log(`Sent arming command: ${arm ? 'ARM' : 'DISARM'}`);
        state.statusTextLog.push(`Sent ${arm ? 'ARM' : 'DISARM'} command`);
        // Update status log display
        const logElement = document.getElementById('status-text-log');
        if (logElement) {
            logElement.textContent = state.statusTextLog.join('\n');
            logElement.scrollTop = logElement.scrollHeight;
        }
    } catch (error) {
        console.error('Failed to send arming command:', error);
        state.statusTextLog.push('Error: Failed to send arming command');
        if (state.isAudioEnabled) {
            speechSynthesisPlayer('Failed to send arming command');
        }
    }
}
function sendArmingCommand1(arm = true) {
    if (!state.websocket || state.wsStatus !== 'connected') {
																console.error('WebSocket not connected, cannot send arming command');
																updateStatusLog('Error: WebSocket not connected');
																if (state.isAudioEnabled) speechSynthesisPlayer('WebSocket not connected, arming failed');
																return;    }

    const systemStatus = mavData.get('HEARTBEAT_system_status') || 'UNKNOWN';
      if (systemStatus === 'UNINIT') {
										console.error('Cannot send arming command: System uninitialized');
										updateStatusLog('Error: Cannot arm in UNINIT state');
										if (state.isAudioEnabled)  speechSynthesisPlayer('Cannot arm: System uninitialized'); 
										return;    }

    const command = {
        class: 'COMMAND_LONG',
        message: {
            target_system: 1,
            target_component: 1,
            command: 400,
            confirmation: state.confirmationCounter || 0,
            param1: arm ? 1 : 0,
            param2: 0,
            param3: 0,
            param4: 0,
            param5: 0,
            param6: 0,
            param7: 0
        }
    };

    try {
         
        console.log('Sending arming command:', command, 'arm:', arm);
        const commandString = JSON.stringify(command);
		state.websocket.send(commandString);  document.getElementById('last-ws-sent').textContent = commandString;
        state.confirmationCounter = (state.confirmationCounter || 0) + 1;
        updateStatusLog(`Sent ${arm ? 'ARM' : 'DISARM'} command`);
		} 
	catch (error) {
					console.error('Failed to send arming command:', error);
					updateStatusLog('Error: Failed to send arming command');
					if (state.isAudioEnabled) 	speechSynthesisPlayer('Failed to send arming command');
				  }
}

// Handle arming/disarming
function sendArmingCommand(arm = true) { sendMavlinkCommand( 400, { param1: arm ? 1 : 0 }, arm ? 'Arm' : 'Disarm' );}// MAV_CMD_COMPONENT_ARM_DISARM


// General function to send MAVLink commands (COMMAND_LONG or COMMAND_INT)
function sendMavlinkCommand(commandId, params = {}, commandName = 'Unknown') {
    if (!state.websocket || state.wsStatus !== 'connected') {
        console.error('WebSocket not connected, cannot send command');
        updateStatusLog('Error: WebSocket not connected');
        if (state.isAudioEnabled) speechSynthesisPlayer('WebSocket not connected, command failed');
        return false;
    }

    if (!isValidMavCommand(commandId)) {
        console.error(`Invalid or deprecated MAVLink command ID: ${commandId}`);
        updateStatusLog(`Error: Invalid command ${commandName}`);
        if (state.isAudioEnabled) speechSynthesisPlayer(`Invalid command ${commandName}`);
        return false;
    }

    const commandDef = MAV_COMMANDS.find(cmd => cmd.id === commandId);
    const commandType = commandDef.type || 'COMMAND_LONG';
    const systemStatus = mavData.get('HEARTBEAT_system_status') || 'UNKNOWN';

    // Prevent commands in UNINIT state
    if (systemStatus === 'UNINIT') {
        console.error(`Cannot send command ${commandName}: System uninitialized`);
        updateStatusLog(`Error: Cannot send command ${commandName} in UNINIT state`);
        if (state.isAudioEnabled) speechSynthesisPlayer(`Cannot send command  ${commandName} when System uninitialized`);
        return false;
    }

    let command;
    if (commandType === 'COMMAND_LONG') {
        command = {
            class: 'COMMAND_LONG',
            message: {
                target_system: 1,
                target_component: 1,
                command: commandId,
                confirmation: state.confirmationCounter || 0,
                param1: params.param1 || 0,
                param2: params.param2 || 0,
                param3: params.param3 || 0,
                param4: params.param4 || 0,
                param5: params.param5 || 0,
                param6: params.param6 || 0,
                param7: params.param7 || 0
            }
        };
    } else {
        command = {
            class: 'COMMAND_INT',
            message: {
                target_system: 1,
                target_component: 1,
                frame: params.frame || 3, // MAV_FRAME_GLOBAL_RELATIVE_ALT
                command: commandId,
                current: 0,
                autocontinue: 0,
                param1: params.param1 || 0,
                param2: params.param2 || 0,
                param3: params.param3 || 0,
                param4: params.param4 || 0,
                x: params.x || 0,
                y: params.y || 0,
                z: params.z || 0
            }
        };
    }

    try {
        const commandString = JSON.stringify(command);
        console.log(`Sending ${commandType} command: ${commandName} (ID: ${commandId})`, command);
        state.websocket.send(commandString); document.getElementById('last-ws-sent').textContent = commandString;
        state.confirmationCounter = (state.confirmationCounter || 0) + 1;
        
        updateStatusLog(`Sent ${commandName} command`);
        popupMessage.show(`Executing ${commandName}`, 2000, 'info');
        if (state.isAudioEnabled) {
            speechSynthesisPlayer(`Executing ${commandName}`);
        }
        return true;
    } catch (error) {
        console.error(`Failed to send ${commandName} command:`, error);
        updateStatusLog(`Error: Failed to send ${commandName}`);
        if (state.isAudioEnabled) {
            speechSynthesisPlayer(`Failed to send ${commandName}`);
        }
        return false;
    }
}

// Function to send MAVLink SET_MODE command
function sendFlightModeCommand(modeName) {
    if (!state.websocket || state.wsStatus !== 'connected') {
        console.error('WebSocket not connected, cannot send flight mode command');
        updateStatusLog('Error: WebSocket not connected');
        if (state.isAudioEnabled) speechSynthesisPlayer('WebSocket not connected, mode change failed');
        return;
    }

    const modeNumber = FLIGHT_MODES[modeName.toUpperCase()];
    if (modeNumber === undefined) {
        console.error(`Unknown flight mode: ${modeName}`);
        updateStatusLog(`Error: Unknown flight mode ${modeName}`);
        return;
    }

    const command = {
        class: 'COMMAND_LONG',
        message: {
            target_system: 1,
            target_component: 1,
            command: 176, // MAV_CMD_DO_SET_MODE
            confirmation: state.confirmationCounter || 0,
            param1: 1, // Set mode (1 = custom mode)
            param2: modeNumber, // Custom mode number
            param3: 0,
            param4: 0,
            param5: 0,
            param6: 0,
            param7: 0
        }
    };

    try {
        const commandString = JSON.stringify(command);
        console.log(`Sending flight mode command: ${modeName} (mode ${modeNumber})`);
        state.websocket.send(commandString); document.getElementById('last-ws-sent').textContent =  commandString ;
        state.confirmationCounter = (state.confirmationCounter || 0) + 1;
        
        // Update state and show feedback
        state.flightMode = modeName.toUpperCase();
        updateStatusLog(`Sent ${modeName} mode command`);
        popupMessage.show(`Switching to ${modeName} mode`, 2000, 'info');
        
        if (state.isAudioEnabled) {
            speechSynthesisPlayer(`Switching to ${modeName} mode`);
        }
    } catch (error) {
        console.error('Failed to send flight mode command:', error);
        updateStatusLog('Error: Failed to send mode command');
        if (state.isAudioEnabled) {
            speechSynthesisPlayer('Failed to send mode command');
        }
    }
}

function parseMavlinkData(mavMessage) {
	//console.log(mavMessage["class"]);
    updateMavDataIfChanged(mavMessage); 
	 
    updateIndicators();   
    updateInfoLayer();

    const voltages = mavMessage.BATTERY_STATUS_voltages;
    if (voltages && Array.isArray(voltages)) {
        voltages.forEach((val, i) => {
            mavData.set(`BATTERY_STATUS_voltages_${i}`, val ?? '---');
        });
    }
 
    
    updateDomForFields(mavMessage);
     
}

 



// requestAllParameters (unchanged)
function requestAllParameters() {
    if (!state.websocket || state.wsStatus !== 'connected') {
        console.error('WebSocket not connected, cannot request parameters');
        updateStatusLog('Error: WebSocket not connected');
        if (state.isAudioEnabled) speechSynthesisPlayer('WebSocket not connected, parameter request failed');
        return false;
    }

    const systemStatus = mavData.get('HEARTBEAT_system_status') || 'UNKNOWN';
    if (systemStatus === 'UNINIT') {
        console.error('Cannot request parameters: System uninitialized');
        updateStatusLog('Error: Cannot request parameters in UNINIT state');
        if (state.isAudioEnabled) speechSynthesisPlayer('Cannot request parameters: System uninitialized');
        return false;
    }

    // Clear existing parameters and reset counters
    state.parameters.clear();
    state.parameterCountExpected = 0;
    state.parameterCountReceived = 0;

    // Send PARAM_REQUEST_LIST message
    const message = {
        class: 'PARAM_REQUEST_LIST',
        message: {
            target_system: 1,
            target_component: 1
        }
    };

    try {
        const messageString = JSON.stringify(message); 
        console.log('Sending PARAM_REQUEST_LIST');
        state.websocket.send(messageString); document.getElementById('last-ws-sent').textContent =messageString;
        
        updateStatusLog('Requesting all parameters');
        popupMessage.show('Requesting parameters', 2000, 'info');
        if (state.isAudioEnabled) {
            speechSynthesisPlayer('Requesting all parameters');
        }

        // Set timeout to detect failure (10 seconds)
        state.parameterRequestTimeout = setTimeout(() => {
            if (state.parameterCountReceived < state.parameterCountExpected) {
                console.error('Parameter request timed out');
                updateStatusLog('Error: Parameter request timed out');
                popupMessage.show('Parameter request timed out', 2000, 'error');
                if (state.isAudioEnabled) {
                    speechSynthesisPlayer('Parameter request timed out');
                }
            }
            state.parameterRequestTimeout = null;
        }, 10000);

        return true;
    } catch (error) {
        console.error('Failed to send PARAM_REQUEST_LIST:', error);
        updateStatusLog('Error: Failed to request parameters');
        if (state.isAudioEnabled) {
            speechSynthesisPlayer('Failed to request parameters');
        }
        return false;
    }
}

 
function setupArmButton() {
    const armButton = document.getElementById('arm-status');
    
    armButton.addEventListener('click', () => {
        if (!state.websocket || state.wsStatus !== 'connected') {
            updateStatusLog('WebSocket not connected - cannot arm');
            if (state.isAudioEnabled) {
                speechSynthesisPlayer('Cannot arm: WebSocket not connected');
            }
            setArmSVG('error');
            setTimeout(() => setArmSVG(0), 1000);
           // checkPreArm();
            return;
        }
        
        const baseMode = mavData.get('HEARTBEAT_base_mode') || 0;
        const systemStatus = mavData.get('HEARTBEAT_system_status') || 'UNKNOWN';
        const isCurrentlyArmed = (baseMode & 1) && ['STANDBY', 'ACTIVE'].includes(systemStatus);
        console.log('Arm button clicked: base_mode:', baseMode, 'system_status:', systemStatus, 'isCurrentlyArmed:', isCurrentlyArmed);

        if (systemStatus === 'UNINIT') {
            updateStatusLog('Cannot arm: System is uninitialized. Check PX4 boot process or hardware.');
            if (state.isAudioEnabled) {
                speechSynthesisPlayer('Cannot arm: System is uninitialized');
            }
            setArmSVG('error');
            setTimeout(() => setArmSVG(0), 1000);
            checkPreArm();
            return;
        }

        setArmSVG('pending');
        const pendingTimeout = setTimeout(() => {
            const currentBaseMode = mavData.get('HEARTBEAT_base_mode') || 0;
            const currentSystemStatus = mavData.get('HEARTBEAT_system_status') || 'UNKNOWN';
            const currentArmedStatus = (currentBaseMode & 1) && ['STANDBY', 'ACTIVE'].includes(currentSystemStatus);
            setArmSVG(currentArmedStatus ? 1 : 0);
            updateStatusLog('Arming command timed out - no response');
            checkPreArm();
        }, 3000);

        console.log('Sending arming command with arm:', !isCurrentlyArmed);
        sendArmingCommand(!isCurrentlyArmed);
        state.armPendingTimeout = pendingTimeout;
    });
}


function checkPreArmConditions() {
    const conditions = [];
    const status = mavData.get('HEARTBEAT_system_status') || 'UNKNOWN';
    const baseMode = mavData.get('HEARTBEAT_base_mode') || 0;

         if (status === 'UNINIT') 									conditions.push('System is uninitialized. Check PX4 boot process or hardware.'); 
	else if (status !== 'STANDBY' && status !== 'ACTIVE')        	conditions.push(`System must be in STANDBY or ACTIVE (currently ${status})`); 

    if (baseMode & 1 && ['STANDBY', 'ACTIVE'].includes(status))   	conditions.push('Vehicle is already armed'); 
    if (baseMode & 4)         										conditions.push('HIL mode enabled. Disable for normal operation.');
   

    const gpsFix = parseInt(mavData.get('GPS_RAW_INT_fix_type') || 0);
    if (gpsFix < 3)         										conditions.push(`Need 3D GPS lock (current fix: ${gpsFix})`);
     

    const batteryVoltage = parseFloat(mavData.get('SYS_STATUS_voltage_battery') || '---');
    if (batteryVoltage !== '---' && batteryVoltage < 11.0)          conditions.push(`Low battery voltage: ${batteryVoltage}V (minimum 11.0V)`);
     

    const sensorsHealth  = parseInt(mavData.get('SYS_STATUS_onboard_control_sensors_health') || 0);
    const sensorsPresent = parseInt(mavData.get('SYS_STATUS_onboard_control_sensors_present') || 0);
    if (sensorsHealth !== sensorsPresent)  							conditions.push('Sensor health check failed (calibration or hardware issue)'); 

    return conditions.length > 0 ? conditions : ['All pre-arm checks passed'];
}

function checkPreArm() {
    const conditions = checkPreArmConditions();
    state.statusTextLog.push('Pre-arm check:');
    conditions.forEach(cond => {        state.statusTextLog.push(`- ${cond}`);    });
    updateStatusLog();

    if (state.isAudioEnabled) {
        if (conditions.length === 1 && conditions[0] === 'All pre-arm checks passed') 		speechSynthesisPlayer('All pre-arm checks passed'); 
		else   																				speechSynthesisPlayer(`Pre-arm checks failed: ${conditions.length} issues`); 
    }

    const errorText = conditions.length === 1 && conditions[0] === 'All pre-arm checks passed'
        ? 'Pre-arm checks passed'
        : `Pre-arm checks failed: ${conditions.join('\n ')}`;
   showPopup( errorText);
}

// Update your handleCommandAck function to properly handle arm states
// New function to handle COMMAND_ACK
// Value	Name									Description
// 0	MAV_RESULT_ACCEPTED							Command is valid  and was executed.
// 1	MAV_RESULT_TEMPORARILY_REJECTED				Command is valid, but cannot be executed at this time. 
// 2	MAV_RESULT_DENIED							Command is invalid (is supported but has invalid parameters). Retrying same command and parameters will not work.
// 3	MAV_RESULT_UNSUPPORTED						Command is not supported (unknown).
// 4	MAV_RESULT_FAILED							Command is valid, but execution has failed. This is used to indicate any non-temporary or unexpected problem,
// 5	MAV_RESULT_IN_PROGRESS						Command is valid and is being executed. This will be followed by further progress updates,
// 6	MAV_RESULT_CANCELLED						Command has been cancelled (as a result of receiving a COMMAND_CANCEL message).
// 7	MAV_RESULT_COMMAND_LONG_ONLY				Command is only accepted when sent as a COMMAND_LONG.
// 8	MAV_RESULT_COMMAND_INT_ONLY					Command is only accepted when sent as a COMMAND_INT.
// 9	MAV_RESULT_COMMAND_UNSUPPORTED_MAV_FRAME	Command is invalid because a frame is required and the specified frame is not supported.

 

//Response data: {'class': 'COMMAND_ACK', 'command': 400, 'result': 0, 'result_description': 'MAV_RESULT_ACCEPTED'}

// Modified handleCommandAck
function handleCommandAck(message) {
    const commandId = parseInt(message.command);
    const result = parseInt(message.result);

    const resultDesc = {
        0: 'Accepted',
        1: 'Temporarily Rejected',
        2: 'Denied',
        3: 'Unsupported',
        4: 'Failed',
        5: 'In Progress',
        6: 'Cancelled',
        7: 'Use COMMAND_LONG',
        8: 'Use COMMAND_INT',
        9: 'Invalid'
    }[result] || `Unknown error code: ${result}`;

    if (!isValidMavCommand(commandId)) {
        console.warn(`Received ACK for deprecated or invalid command ${commandId}`);
        updateStatusLog(`Warning: ACK for invalid command ${commandId}`);
    }

    const commandDef = MAV_COMMANDS.find(cmd => cmd.id === commandId);
    const commandName = commandDef ? commandDef.name : `Command ${commandId}`;

    if (commandId === 400) { // MAV_CMD_COMPONENT_ARM_DISARM
        if (state.armPendingTimeout) {
            clearTimeout(state.armPendingTimeout);
            state.armPendingTimeout = null;
        }
        const baseMode = mavData.get('HEARTBEAT_base_mode') || 0;
        const systemStatus = mavData.get('HEARTBEAT_system_status') || 'UNKNOWN';
        const isActuallyArmed = (baseMode & 128) && ['STANDBY', 'ACTIVE'].includes(systemStatus);

        if (result === 0) {
            if (isActuallyArmed) {
                updateStatusLog('Arming enabled successfully');
                if (state.isAudioEnabled) {
                    speechSynthesisPlayer('Armed successfully');
                }
                popupMessage.show('Armed successfully', 2000, 'success');
            } else {
                updateStatusLog('Arming command accepted but vehicle not armed. Check pre-arm conditions.');
                checkPreArm();
                popupMessage.show('Arming accepted but not armed', 2000, 'warning');
            }
            setArmSVG(isActuallyArmed ? 1 : 0);
        } else {
            updateStatusLog(`Arming command failed: ${resultDesc}`);
            if (state.isAudioEnabled) {
                speechSynthesisPlayer(`Arming failed: ${resultDesc}`);
            }
            popupMessage.show(`Arming failed: ${resultDesc}`, 2000, 'error');
            checkPreArm();
            setArmSVG('error');
            setTimeout(() => {
                setArmSVG(isActuallyArmed ? 1 : 0);
            }, 1000);
        }
    } else if (commandId === 176) { // MAV_CMD_DO_SET_MODE
        if (result === 0) {
            updateStatusLog(`Flight mode change successful: ${state.flightMode}`);
            if (state.isAudioEnabled) {
                speechSynthesisPlayer(`Flight mode set to ${state.flightMode}`);
            }
            popupMessage.show(`Flight mode: ${state.flightMode}`, 2000, 'success');
        } else {
            updateStatusLog(`Flight mode change failed: ${resultDesc}`);
            if (state.isAudioEnabled) {
                speechSynthesisPlayer(`Flight mode change failed: ${resultDesc}`);
            }
            popupMessage.show(`Mode change failed: ${resultDesc}`, 2000, 'error');
            state.flightMode = mavData.get('HEARTBEAT_custom_mode') || 'UNKNOWN';
        }
    } else {
        // Generic handling for other commands
        if (result === 0) {
            updateStatusLog(`${commandName} executed successfully`);
            if (state.isAudioEnabled) {
                speechSynthesisPlayer(`${commandName} successful`);
            }
            popupMessage.show(`${commandName} successful`, 2000, 'success');
        } else {
            updateStatusLog(`${commandName} failed: ${resultDesc}`);
            if (state.isAudioEnabled) {
                speechSynthesisPlayer(`${commandName} failed: ${resultDesc}`);
            }
            popupMessage.show(`${commandName} failed: ${resultDesc}`, 2000, 'error');
        }
    }
}
// Handle flight mode button clicks
function handleFlightModeClick(modeName) {
    const modeNameUpper = modeName.toUpperCase();
    const modeNumber = FLIGHT_MODES[modeNameUpper];
    if (modeNumber === undefined) {
        console.error(`Unknown flight mode: ${modeName}`);
        updateStatusLog(`Error: Unknown flight mode ${modeName}`);
        return;
    }

    const success = sendMavlinkCommand(
        176, // MAV_CMD_DO_SET_MODE
        { param1: 1, param2: modeNumber }, // Custom mode
        `${modeName} Mode`
    );

    if (success) {
        state.flightMode = modeNameUpper;
    }
}






// Function to generate HTML tables for parameter groups
function generateParameterTables() {
    const container = document.getElementById('parameter-tables');
    if (!container) {
        console.error('Parameter tables container not found');
        updateStatusLog('Error: Parameter tables container not found');
        return;
    }

    // Clear existing tables
    container.innerHTML = '';

    // Group parameters by prefix
    const groupedParameters = new Map();
    state.parameters.forEach((param, paramId) => {
        const group = getParameterGroup(paramId);
        if (!groupedParameters.has(group)) {
            groupedParameters.set(group, []);
        }
        groupedParameters.get(group).push({ paramId, ...param });
    });

    // Sort groups alphabetically (except DEFAULT, which goes last)
    const sortedGroups = Array.from(groupedParameters.keys()).sort((a, b) => {
        if (a === 'DEFAULT') return 1;
        if (b === 'DEFAULT') return -1;
        return a.localeCompare(b);
    });

    // Generate a table for each group
    sortedGroups.forEach(group => {
        const params = groupedParameters.get(group);
        // Sort parameters by paramId
        params.sort((a, b) => a.paramId.localeCompare(b.paramId));

        // Create table
        const table = document.createElement('table');
        table.className = 'parameter-table';
        
        // Add caption
        const caption = document.createElement('caption');
        caption.textContent = group === 'DEFAULT' ? 'Miscellaneous Parameters' : group.replace('_', '') + ' Parameters';
        table.appendChild(caption);

        // Add header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Parameter Name', 'Value', 'Description'].forEach(headerText => {
            const th = document.createElement('th');
            th.textContent = headerText;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Add body
        const tbody = document.createElement('tbody');
        params.forEach(param => {
            const row = document.createElement('tr');
            
            // Parameter Name
            const nameCell = document.createElement('td');
            nameCell.textContent = param.paramId;
            row.appendChild(nameCell);

            // Parameter Value
            const valueCell = document.createElement('td');
            valueCell.textContent = formatParameterValue(param.value, param.type);
            row.appendChild(valueCell);

            // Description
            const descCell = document.createElement('td');
            descCell.textContent = getParameterDescription(param.paramId);
            row.appendChild(descCell);

            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        // Append table to container
        container.appendChild(table);
    });

    updateStatusLog('Parameter tables generated');
    popupMessage.show('Parameter tables updated', 2000, 'success');
    if (state.isAudioEnabled) {
        speechSynthesisPlayer('Parameter tables updated');
    }
}

// Modified handleParamValue function
function handleParamValue(message) {
    const paramId = message.param_id;
    const paramValue = message.param_value;
    const paramType = message.param_type;
    const paramCount = message.param_count; // Total number of parameters
    const paramIndex = message.param_index; // Index of this parameter

    // Update expected count
    if (state.parameterCountExpected === 0 || state.parameterCountExpected !== paramCount) {
        state.parameterCountExpected = paramCount;
    }

    // Store parameter
    state.parameters.set(paramId, { value: paramValue, type: paramType, index: paramIndex });
    state.parameterCountReceived++;

    console.log(`Received parameter ${paramId}: ${paramValue} (type: ${paramType}, index: ${paramIndex}/${paramCount})`);
    updateStatusLog(`Received parameter ${paramId}: ${formatParameterValue(paramValue, paramType)}`);

    // Check if all parameters received
    if (state.parameterCountReceived >= state.parameterCountExpected && state.parameterCountExpected > 0) {
        clearTimeout(state.parameterRequestTimeout);
        state.parameterRequestTimeout = null;

        console.log(`All parameters received (${state.parameterCountReceived}/${state.parameterCountExpected})`);
        updateStatusLog(`All ${state.parameterCountReceived} parameters received`);
        popupMessage.show(`Received ${state.parameterCountReceived} parameters`, 2000, 'success');
        if (state.isAudioEnabled) {
            speechSynthesisPlayer(`Received ${state.parameterCountReceived} parameters`);
        }

        // Generate tables after all parameters are received
        generateParameterTables();
    }
}

/////////////////////////////////////////////////////////////////////////
function saveMavDataIfChanged(key, value) {
    let hasChanges = false;
    
    // Get the actual previous value, not just existence check
    const prevValue = state.previousMavData.get(key);
    
    // Compare the actual values (using deep comparison for objects/arrays)
    if (!isEqual(prevValue, value)) {
        mavData.set(key, value);
        state.previousMavData.set(key, value);
        hasChanges = true;
        console.log(`Updated mavData: ${key} = ${value}`);
    }
    
    return hasChanges;
}


function updateMavDataIfChanged(mavMessage) {
    let hasChanges = false;

    for (const [key, value] of Object.entries(mavMessage)) {
														if (!mavData.has(key)) { 
														//console.warn(`Unknown mavData key: ${key}`); 
														continue; }
														// Use state.previousMavData if available, otherwise compare with current mavData
														const prevValue = state.previousMavData.has(key) ? state.previousMavData.get(key) : mavData.get(key);
														if (!isEqual(prevValue, value)) {
																						mavData.set(key, value);
																						state.previousMavData.set(key, value);
																						hasChanges = true;
																						//console.log(`Updated mavData: ${key} = ${value}`);
																					}
													}

    return hasChanges;
}

function initWebSocket() {
    const updateWsStatus = (status) => {
        state.wsStatus = status;
        const path = document.querySelector('#websocket-status svg path');
        if (path) {
            path.setAttribute('fill', {
                connecting: '#FFFF00',
                connected: '#00FF00',
                disconnected: '#FF0000'
            }[status]);
        }
    };

    const connectWebSocket = () => {
        if (state.websocket && state.wsStatus !== 'disconnected') return;

        updateWsStatus('connecting');
        state.websocket = new WebSocket(WS_CONFIG.URL);

        state.websocket.onopen = () => {
            updateWsStatus('connected');
            console.log('WebSocket connected');
        };

        state.websocket.onmessage = (event) => {
													try {
														
														const data = JSON.parse(event.data);
														        // --- NEW: Log incoming MAVLink messages if checkbox is ON ---
														// Only log real MAVLink messages (not errors, camera frames, etc.)
														const mavlinkClasses = ['HEARTBEAT', 'SYS_STATUS', 'GPS_RAW_INT', 'PARAM_VALUE',
																				 'ATTITUDE', 'VFR_HUD', 'GLOBAL_POSITION_INT', 'LOCAL_POSITION_NED',
																				 'SCALED_PRESSURE', 'BATTERY_STATUS', 'RC_CHANNELS_SCALED',
																				 'SERVO_OUTPUT_RAW', 'MISSION_CURRENT', 'COMMAND_ACK',
																				 'ESTIMATOR_STATUS', 'STATUSTEXT', 'ALTITUDE', 'HOME_POSITION'];


                                                        if (mavlinkClasses.includes(data.class)) logIncomingMavlink(data);     
                                                        websocket_message_parsing(data);
                                
                                                        }
                                                    catch (err) { console.error('Failed to parse WebSocket message:', err); }
												};

        state.websocket.onclose = () => {
            updateWsStatus('disconnected');
            console.log('WebSocket disconnected');
            clearInterval(state.heartbeatId);
            setTimeout(connectWebSocket, WS_CONFIG.RECONNECT_INTERVAL);
        };

        state.websocket.onerror = (err) => {
            updateWsStatus('disconnected');
            console.error('WebSocket error:', err);
            state.websocket.close();
        };
    };

    connectWebSocket();
}

function websocket_message_parsing(data) {
    switch(data.class) 
    {
        case 'COMMAND_ACK':
            handleCommandAck(data.message);
            break;
        case 'HEARTBEAT':
            heartbeatDecoding(data);
            break;
        case 'SYS_STATUS':
            sysStatusDecoding(data);
            break;
        case 'STATUSTEXT':
            STATUSTEXTdecoding(data);
            break;
        case 'GPS_RAW_INT':
            gpsDataUpdate(data);
            break;
        case 'PARAM_VALUE':
            handleParamValue(data.message);
            break;
        case 'error':
        case 'joystick':
        case 'notify':
            console.log('Received WebSocket message:', data["class"], data["message"]);
            updateStatusLog(`Server: ${data["message"]}`);
            break;
            
        case 'camera_frame_available':
            handleCameraFrame(data);
            break;																			 
        case 'camera_error':
            handleCameraError(data);
            break;																				  
        case 'camera_info':
            handleCameraInfo(data.data);
            break;

        case 'camera_detection_update':
            handleDetectionUpdate(data);
            break;

        case 'tts_audio':
                handleTTSAudio(data);
                break;
        case 'ai_advice':
            if (state.autoPilot) handleAIAdvice(data);   // only spoken in Tier 2
            else console.log('AI advice suppressed (autopilot off):', data.advice);
            break;

        case 'voice_listening':
            // Show listening indicator in UI
            document.getElementById('voice-indicator')?.classList.add('listening');
            break;

        case 'voice_transcript':
            console.log(`🎙️ Heard: "${data.text}"`);
            updateStatusLog(`Voice: ${data.text}`);
            break;

        case 'voice_command_executed':
            UnifiedAudioQueue.enqueue( `Executing: ${data.intent}`, { priority: 9, source: 'command' }
            );
            break;
                


        default:
            parseMavlinkData(data);
    }

}