// =============================================================================
// ai.js — Audio / TTS module
//
// NEW (fixed) — strict responsibility split:
//
//   CLIENT owns all simple status alerts (battery, STATUSTEXT, mode changes):
//     → _localSpeech()  uses speechSynthesis with any available voice
//     → Edge neural voice if in Edge browser  (best quality)
//     → falls back to basic Web Speech API    (robotic but reliable, client-only)
//     → NEVER sends tts_request to server for simple alerts
//
//   SERVER AI owns complex analysis only (drift, anomaly, pattern recognition):
//     → sends {class: "ai_advice", advice: "...", priority: N}  WS message
//     → client handleAIAdvice() → speechSynthesisPlayer()
//     → if Edge voice available: plays locally
//     → if no Edge voice: ONLY THEN requests server TTS via tts_request
//     → server audio_node.py handles ONLY tts_request — no proactive monitoring
//
//   Battery looping loop is now a clean interval-based state machine,
//   not a chain of async callbacks that can overlap.
//
// =============================================================================

'use strict';

// ── UNIFIED GLOBAL AUDIO QUEUE ─────────────────────────────────────────────────
// All audio (battery alerts, status messages, AI advice) flows through ONE queue
// Only ONE speaker plays at a time: either Web Speech API OR AudioContext, never both
// ───────────────────────────────────────────────────────────────────────────────
const audioIcon=document.getElementById('audio-toggle').querySelector('#audio-icon');

const UnifiedAudioQueue = {
    // Global state
    _queue: [],
    _isPlaying: false,
    _currentUtterance: null,      // Current Web Speech API utterance (if playing)
    _currentAudioSource: null,     // Current AudioContext source (if playing)
    _edgeVoice: null,             // Detected Edge voice for Web Speech API
    _batteryLoopTimer: null,
     

    /**
     * Queue a message to be spoken.
     * Priority: higher = speaks first. All messages go through ONE queue.
     */
    enqueue(text, options = {}) {
        const {
            priority = 5,
            loop = false,
            source = 'other'  // 'battery', 'status', 'command', 'ai', 'other'
        } = options;

        if (!text || !state.isAudioEnabled) return;

        // Prevent duplicates: if same text from same source is already queued, skip
        const isDuplicate = this._queue.some(m => m.text === text && m.source === source);
        if (isDuplicate) return;

        this._queue.push({ text, priority, loop, source, timestamp: Date.now() });
        this._queue.sort((a, b) => b.priority - a.priority);

        console.log(`📝 Queued (${source}): "${text}" pri=${priority} [queue=${this._queue.length}]`);

        // If nothing is playing, start processing
        if (!this._isPlaying) {
            this._processQueue();
        }
    },

    /**
     * Process next item in queue. Only ONE audio will play at a time.
     */
    _processQueue() {
        if (this._isPlaying || this._queue.length === 0) return;

        const msg = this._queue.shift();
        this._isPlaying = true;

        console.log(`🔊 Now playing (${msg.source}): "${msg.text}"`);

        // Stop any existing audio first
        this._stopAllAudio();

        // Try to play with Edge voice first (Web Speech API)
        if (this._edgeVoice && 'speechSynthesis' in window) {
            this._playWithWebSpeech(msg);
        } else {
            // No Edge voice available; use server TTS (AudioContext)
            this._requestServerTTS(msg);
        }
    },

    /**
     * Play using Web Speech API (Edge voice locally).
     */
    _playWithWebSpeech(msg) {
        try {
            const utt = new SpeechSynthesisUtterance(msg.text);
            utt.voice = this._edgeVoice;
            utt.lang = this._edgeVoice.lang;
            utt.volume = 1;
            utt.rate = 0.9;
            utt.pitch = 1;

            utt.onend = () => {
                this._currentUtterance = null;
                this._isPlaying = false;
                setTimeout(() => this._processQueue(), 200);
            };

            utt.onerror = (e) => {
                console.warn(`🔊 Web Speech error: ${e.error}`);
                this._currentUtterance = null;
                this._isPlaying = false;
                // Fall back to server TTS
                this._requestServerTTS(msg);
            };

            this._currentUtterance = utt;
            window.speechSynthesis.speak(utt);
        } catch (err) {
            console.error(`Web Speech failed: ${err.message}`);
            this._isPlaying = false;
            this._requestServerTTS(msg);
        }
    },

    /**
     * Request server TTS audio. Server will send it back as tts_audio message.
     */
    _requestServerTTS(msg) {
        if (!state.websocket || state.websocket.readyState !== WebSocket.OPEN) {
            console.warn('⚠️ WebSocket not open, skipping server TTS');
            this._isPlaying = false;
            this._processQueue();
            return;
        }

        state.websocket.send(JSON.stringify({
            tts_request: { text: msg.text, loop: !!msg.loop }
        }));
        console.log(`📡 Server TTS requested: "${msg.text}"`);
    },

    /**
     * Called when server sends tts_audio.
     * Play it using AudioContext. Only ONE source plays at a time.
     */
    handleTTSAudio(data) {
        if (!this._ensureAudioContext()) {
            this._isPlaying = false;
            this._processQueue();
            return;
        }

        try {
            const bytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
            state.audioContext.decodeAudioData(
                bytes.buffer.slice(0),
                decoded => {
                    if (!state.isAudioEnabled) {
                        this._isPlaying = false;
                        this._processQueue();
                        return;
                    }

                    // Stop any previous source
                    if (this._currentAudioSource) {
                        try { this._currentAudioSource.stop(); } catch (_) {}
                        this._currentAudioSource = null;
                    }

                    const src = state.audioContext.createBufferSource();
                    src.buffer = decoded;
                    src.connect(state.audioContext.destination);
                    this._currentAudioSource = src;

                    src.onended = () => {
                        this._currentAudioSource = null;
                        this._isPlaying = false;
                        setTimeout(() => this._processQueue(), 200);
                    };

                    src.start();
                    console.log(`🔊 AudioContext playing: "${data.text}"`);
                },
                err => {
                    console.error(`decodeAudioData failed: ${err}`);
                    this._currentAudioSource = null;
                    this._isPlaying = false;
                    this._processQueue();
                }
            );
        } catch (err) {
            console.error(`handleTTSAudio error: ${err.message}`);
            this._isPlaying = false;
            this._processQueue();
        }
    },

    /**
     * Stop all audio immediately.
     */
    _stopAllAudio() {
        // Stop Web Speech API
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        this._currentUtterance = null;

        // Stop AudioContext
        if (this._currentAudioSource) {
            try { this._currentAudioSource.stop(); } catch (_) {}
            this._currentAudioSource = null;
        }
    },

    /**
     * Ensure AudioContext exists.
     */
    _ensureAudioContext() {
        if (state.isAudioInitialized) {
            if (state.audioContext?.state === 'suspended') {
                state.audioContext.resume();
            }
            return true;
        }
        try {
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            state.speaker = state.audioContext.createOscillator();
            state.gainNode = state.audioContext.createGain();
            state.speaker.connect(state.gainNode);
            state.gainNode.connect(state.audioContext.destination);
            state.speaker.type = 'sine';
            state.speaker.frequency.value = 440;
            state.gainNode.gain.value = state.isAudioEnabled ? 0.1 : 0;
            state.speaker.start();
            state.isAudioInitialized = true;
            console.log('🔊 AudioContext created');
            return true;
        } catch (err) {
            console.error(`AudioContext failed: ${err.message}`);
            return false;
        }
    },

    /**
     * Detect and load Edge voice on startup.
     */
    initEdgeVoice() {
        const load = () => {
            const voices = window.speechSynthesis.getVoices();
            const preferred = [
                'Microsoft Aria Online (Natural)',
                'Microsoft Jenny Online (Natural)',
                'Microsoft Guy Online (Natural)',
                'Microsoft Aria',
                'Microsoft Jenny',
                'Microsoft Guy',
            ];
            for (const name of preferred) {
                const match = voices.find(v => v.name.startsWith(name));
                if (match) {
                    this._edgeVoice = match;
                    console.log(`🎤 Edge voice loaded: ${match.name}`);
                    return;
                }
            }
            console.warn('⚠️ No Edge voice found, will use server TTS');
        };

        if (window.speechSynthesis.getVoices().length > 0) {
            load();
        } else {
            window.speechSynthesis.addEventListener('voiceschanged', load, { once: true });
        }
    },

    /**
     * Clear entire queue.
     */
    clearQueue() {
        this._queue = [];
    },

    /**
     * Start battery warning loop.
     */
    startBatteryLoop() {
        if (this._batteryLoopTimer !== null) return;
        this.enqueue('Battery low, warning', { priority: 10, source: 'battery' });
        this._batteryLoopTimer = setInterval(() => {
            if (!state.isAudioEnabled || !state.isLowBattery) {
                this.stopBatteryLoop();
                return;
            }
            this.enqueue('Battery low, warning', { priority: 10, source: 'battery' });
        }, 8000);
        console.log('🔋 Battery warning loop started');
    },

    /**
     * Stop battery warning loop.
     */
    stopBatteryLoop() {
        if (this._batteryLoopTimer === null) return;
        clearInterval(this._batteryLoopTimer);
        this._batteryLoopTimer = null;
        console.log('🔋 Battery warning loop stopped');
    },

    /**
     * Disable/enable audio.
     */
    setAudioEnabled(enabled) {
        state.isAudioEnabled = enabled;
        if (!enabled) {
            this._stopAllAudio();
            this._queue = [];
            this._isPlaying = false;
            this.stopBatteryLoop();
            if (state.isAudioInitialized && state.gainNode) {
                state.gainNode.gain.setValueAtTime(0, state.audioContext.currentTime);
				audioIcon.setAttribute('d', 'M16 9L22 15M22 9L16 15M13 3L7 8H5C3.89543 8 3 8.89543 3 10V14C3 15.1046 3.89543 16 5 16H7L13 21V3Z');
                audioIcon.setAttribute('stroke', '#ff0000');
            }
            console.log('🔊 Audio disabled');
        } else {
            this._ensureAudioContext();
            if (state.isAudioInitialized && state.gainNode) {
                state.gainNode.gain.setValueAtTime(0.1, state.audioContext.currentTime);
				
				audioIcon.setAttribute('d', 'M16 9C16.5 9.5 17 10.5 17 12C17 13.5 16.5 14.5 16 15M19 6C20.5 7.5 21 10 21 12C21 14 20.5 16.5 19 18M13 3L7 8H5C3.89543 8 3 8.89543 3 10V14C3 15.1046 3.89543 16 5 16H7L13 21V3Z');
                audioIcon.setAttribute('stroke', '#00ff00');
            }
            console.log('🔊 Audio enabled');
        }
    }
};

// ── Module state ─────────────────────────────────────────────────────────────
let _edgeVoice           = null;   // set by initEdgeVoice()
let _batteryLoopTimer    = null;   // setInterval handle for battery warning loop
let _serverTTSInFlight   = false;  // true while a tts_audio response is being decoded/played
let _serverTTSSource     = null;   // current AudioBufferSourceNode (server TTS)

// ── Voice Preferences ──────────────────────────────────────────────────────────
const voicePreferences = {
    edge:    { names: ['Microsoft Aria Online (Natural)', 'Microsoft Jenny Online (Natural)', 'Microsoft Guy Online (Natural)', 'Microsoft Aria', 'Microsoft Jenny', 'Microsoft Guy'], priority: 1 },
    native:  { names: ['Google US English', 'Google UK English Male', 'Native System Voice'], priority: 2 },
    robotic: { names: [], priority: 3 }  // Use default system voice (robotic fallback)
};


function initAudio() {
    if (state.audioFullyInitialized) {
        console.log('🔊 Audio system already fully initialized');
        return;
    }

    console.log('🎵 initAudio() called');

    // Ensure AudioContext is ready first
    UnifiedAudioQueue._ensureAudioContext();

    // Initialize Edge voice detection
    UnifiedAudioQueue.initEdgeVoice();

    // Final safety net - voices often load late
    const synth = window.speechSynthesis;
    if (synth) {
        const voices = synth.getVoices();
        if (voices.length > 0) {
            UnifiedAudioQueue.initEdgeVoice();
            state.audioFullyInitialized = true;
            console.log('✅ Audio fully initialized with', voices.length, 'voices available');
        } else {
            // Wait for voiceschanged event
            const onVoicesLoaded = () => {
                UnifiedAudioQueue.initEdgeVoice();
                state.audioFullyInitialized = true;
                console.log('✅ Voices loaded via event - Audio system ready');
            };
            synth.addEventListener('voiceschanged', onVoicesLoaded, { once: true });
            
            // Extra fallback
            setTimeout(() => {
                if (!state.audioFullyInitialized) {
                    UnifiedAudioQueue.initEdgeVoice();
                    state.audioFullyInitialized = true;
                }
            }, 1200);
        }
    }

    // Set initial UI state
    const audioIcon = document.getElementById('audio-icon');
    if (audioIcon) {
        audioIcon.setAttribute('stroke', state.isAudioEnabled ? '#00ff00' : '#ff0000');
    }
}
// Public wrapper for battery warning toggle
function toggleBatteryWarning() {
    if (!state.isAudioInitialized) initAudio();
    UnifiedAudioQueue.setAudioEnabled(!state.isAudioEnabled);
    
    if (state.isAudioEnabled && state.isLowBattery) {
        UnifiedAudioQueue.startBatteryLoop();
    }
}


	
// Public wrapper for audio toggle (used by UI button)
function toggleSpeaker(disable) {
    UnifiedAudioQueue.setAudioEnabled(!disable);
    
    // Update UI icon
    const audioIcon = document.getElementById('audio-toggle')?.querySelector('#audio-icon');
    if (audioIcon) {
        if (state.isAudioEnabled) {
            audioIcon.setAttribute('d', 'M16 9C16.5 9.5 17 10.5 17 12C17 13.5 16.5 14.5 16 15M19 6C20.5 7.5 21 10 21 12C21 14 20.5 16.5 19 18M13 3L7 8H5C3.89543 8 3 8.89543 3 10V14C3 15.1046 3.89543 16 5 16H7L13 21V3Z');
            audioIcon.setAttribute('stroke', '#00ff00');
        } else {
            audioIcon.setAttribute('d', 'M16 9L22 15M22 9L16 15M13 3L7 8H5C3.89543 8 3 8.89543 3 10V14C3 15.1046 3.89543 16 5 16H7L13 21V3Z');
            audioIcon.setAttribute('stroke', '#ff0000');
        }
    }
}

// Called by SYS_STATUS decoder when battery level changes
function batteryLevel(level = 0) {
    level = Math.max(0, Math.min(100, level));

    const batteryIndicator = document.getElementById('battery-indicator');
    const batteryPercent = document.getElementById('battery-percent');
    const batteryLevelRect = document.getElementById('battery-level');
    if (!batteryPercent || !batteryLevelRect) return;

    batteryPercent.textContent = `${level}%`;
    batteryLevelRect.setAttribute('width', (level / 100) * 16);

    const previousLowBattery = state.isLowBattery;
    if (level <= 15) state.isLowBattery = true;
    else if (level > 17) state.isLowBattery = false;

    if (state.isLowBattery) {
        batteryLevelRect.setAttribute('fill', 'red');
        batteryIndicator.style.color = 'red';
        batteryPercent.style.color = 'red';
        batteryLevelRect.style.animation = 'flicker 1s infinite alternate';
        batteryIndicator.style.animation = 'flicker 1s infinite alternate';

        // Start loop on transition from normal → low
        if (state.isAudioEnabled && !previousLowBattery) {
            UnifiedAudioQueue.startBatteryLoop();
        }
    } else {
        batteryLevelRect.style.animation = 'none';
        batteryIndicator.style.animation = 'none';

        if (level <= 25) {
            batteryLevelRect.setAttribute('fill', 'yellow');
            batteryIndicator.style.color = 'yellow';
            batteryPercent.style.color = 'yellow';
        } else {
            batteryLevelRect.setAttribute('fill', 'green');
            batteryIndicator.style.color = 'currentColor';
            batteryPercent.style.color = 'currentColor';
        }

        // Stop loop on transition from low → normal
        if (previousLowBattery) {
            UnifiedAudioQueue.stopBatteryLoop();
        }
    }

    if (previousLowBattery !== state.isLowBattery) {
        console.log(`🔋 Battery state changed: ${state.isLowBattery ? 'LOW' : 'OK'} (${level}%)`);
    }
}

// =============================================================================
// PUBLIC API — Use these functions from ws.js and other modules
// =============================================================================

/**
 * Queue any message to be spoken (battery, status, command, AI advice).
 * All go through the SAME queue with ONE speaker.
 */
function speechSynthesisPlayer(text, loop = false, priority = 5) {
    UnifiedAudioQueue.enqueue(text, { priority, loop, source: 'other' });
}

/**
 * Queue a status message (from STATUSTEXT or other hardware alerts).
 */
function queueStatusMessage(text, severity = 'INFO') {
    const priority = severity === 'CRITICAL' ? 9 :
                    severity === 'ERROR' ? 7 :
                    severity === 'WARNING' ? 5 : 3;
    UnifiedAudioQueue.enqueue(text, { priority, source: 'status' });
}

/**
 * Queue a command acknowledgment.
 */
function queueCommandMessage(text, success = true) {
    const priority = success ? 6 : 8;
    UnifiedAudioQueue.enqueue(text, { priority, source: 'command' });
}

/**
 * Queue AI advice message.
 */
function queueAIAdvice(text, priority = 5) {
    UnifiedAudioQueue.enqueue(text, { priority, source: 'ai' });
}

// =============================================================================
// Speech queue controls (for debugging)
// =============================================================================

const speechQueueControls = {
    viewQueue() {
        const q = UnifiedAudioQueue._queue;
        const status = `
🎵 Audio Queue Status:
- Playing: ${UnifiedAudioQueue._isPlaying ? 'YES' : 'NO'}
- Queue: ${q.length} items
- Edge voice: ${UnifiedAudioQueue._edgeVoice ? UnifiedAudioQueue._edgeVoice.name : 'NOT LOADED'}
${q.length > 0 ? q.map((m, i) => `  ${i + 1}. "${m.text.substring(0, 40)}..." (pri=${m.priority}, src=${m.source})`).join('\n') : '  (empty)'}
        `;
        console.log(status);
    },
    clearQueue() {
        UnifiedAudioQueue.clearQueue();
    }
};

// =============================================================================
// OLD COMPATIBILITY WRAPPERS — These are kept for backward compatibility
// =============================================================================

// Old functions that other code might still call
function _localSpeech(text, isLooping = false) {
    UnifiedAudioQueue.enqueue(text, { priority: 5, loop: isLooping, source: 'other' });
}

function _requestServerTTS(text, isLooping) {
    UnifiedAudioQueue._requestServerTTS({ text, loop: isLooping });
}

function _stopServerTTSSource() {
    if (UnifiedAudioQueue._currentAudioSource) {
        try { UnifiedAudioQueue._currentAudioSource.stop(); } catch (_) {}
        UnifiedAudioQueue._currentAudioSource = null;
    }
}

function _stopBatteryLoop() {
    UnifiedAudioQueue.stopBatteryLoop();
}

function _startBatteryLoop() {
    UnifiedAudioQueue.startBatteryLoop();
}

/**
 * handleTTSAudio — Receives server TTS audio and plays it.
 * This is called from the WebSocket handler.
 */
function handleTTSAudio(data) {
    UnifiedAudioQueue.handleTTSAudio(data);
}

// =============================================================================
// AI Advisor message handler
// Receives: { class:"ai_advice", priority:N, advice:"...", detail:"..." }
// =============================================================================

function handleAIAdvice(data) {
    const priority = data.priority || 1;
    const text = data.advice || '';
    if (!text) return;

    // Show in popup overlay
    if (typeof popupMessage !== 'undefined' && popupMessage.show) {
        popupMessage.show(`🤖 ${text}`, priority >= 8 ? 6000 : 3000);
    }

    // Queue through unified system (will use Edge voice or server TTS)
    const speechPriority = Math.round(priority * 0.8);
    queueAIAdvice(text, speechPriority);

    if (data.detail) console.log(`AI detail: ${data.detail}`);
}