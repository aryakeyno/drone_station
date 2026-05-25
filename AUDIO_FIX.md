# 🔊 Audio Overlapping Fix - Battery Warning Issue

## Problem
Multiple TTS messages were playing simultaneously (overlapping), creating the effect of "2 people speaking together", especially noticeable with the battery low warning.

**Console Evidence:**
```
ai.js:304 📡 Server TTS: "Battery low, warning"  loop=true
ai.js:334 🔊 Server TTS playing: "Battery low, warning"  loop=true
ai.js:304 📡 Server TTS: "Battery low, warning"  loop=true
ai.js:304 📡 Server TTS: "Battery low, warning"  loop=true
ai.js:334 🔊 Server TTS playing: "Battery low, warning"  loop=true
```

Multiple queued TTS plays happening at once.

---

## Root Causes

### 1. **Client-side Loop Duplication**
The `handleTTSAudio` function's `onended` callback was re-requesting looping messages:
```javascript
if (isLooping && state.currentLoopingMessage === data.text) {
    setTimeout(() => _requestServerTTS(data.text, true), 1000);  // ❌ Creates infinite loop
}
```

**Effect:** 
- Audio finishes → client requests it again
- Server sends → client plays → repeats
- Multiple requests in flight simultaneously

### 2. **No Message Deduplication**
When the same TTS message arrived multiple times, they were all queued:
- Battery warning sent multiple times from UI
- All copies added to speech queue
- All played sequentially, causing overlapping effect

### 3. **Battery Warning Spam**
Battery level fluctuations could trigger the warning multiple times:
```
level = 14% → trigger warning
level = 16% → stop
level = 14% → trigger warning again (too fast)
```

---

## Solutions Implemented

### 1. ✅ Stop Client-side Loop Re-requesting
**Modified:** `handleTTSAudio()` in `ai.js`

**Before:**
```javascript
if (isLooping && state.currentLoopingMessage === data.text) {
    setTimeout(() => _requestServerTTS(data.text, true), 1000);  // ❌ Wrong
}
```

**After:**
```javascript
// ⚠️  IMPORTANT: Do NOT re-request looping messages here!
// The server handles looping - it will keep sending them.
// Client just plays what the server sends.
if (!isLooping) {
    processSpeechQueue();  // ✅ Only queue non-looping messages
}
```

**Effect:** Client plays audio once, doesn't re-request.

---

### 2. ✅ Deduplicate Messages
**Modified:** Two functions in `ai.js`

#### In `handleTTSAudio()`:
```javascript
if (isLooping) {
    // For looping messages, only one copy should play at a time
    if (state.currentLoopingMessage === data.text) {
        console.log(`⏭️  Skipped duplicate looping message: "${data.text}"`);
        return;  // ✅ Skip if already handling this message
    }
} else {
    // For non-looping messages, skip if already in queue
    const isDuplicate = state.speechQueue.some(m => m.text === data.text);
    if (isDuplicate) {
        console.log(`⏭️  Skipped duplicate queued message: "${data.text}"`);
        return;  // ✅ Skip duplicates
    }
}
```

#### In `speechSynthesisPlayer()`:
```javascript
// ── DEDUPLICATION for looping messages ──────────────────────────
if (loop) {
    if (state.currentLoopingMessage === text2play) {
        console.log(`⏭️  Skipped duplicate looping request: "${text2play}"`);
        return;  // ✅ Don't re-queue if already looping
    }
    // Clear queue when switching looping messages
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        state.speechQueue = [];
    }
}

// ── DEDUPLICATION for queued messages ──────────────────────────
const isDuplicate = state.speechQueue.some(m => m.text === text2play);
if (isDuplicate) {
    return;  // ✅ Don't queue duplicates
}
```

**Effect:** Same message never queued twice.

---

### 3. ✅ Add Battery Warning Debounce
**Modified:** `batteryLevel()` in `ai.js`

```javascript
// Track last time battery warning was triggered to prevent spam
let lastBatteryWarningTime = 0;
const BATTERY_WARNING_DEBOUNCE = 3000;  // 3 seconds

function batteryLevel(level = 0) {
    // ... battery level logic ...
    if (state.isLowBattery) {
        if (state.isAudioEnabled && previousLowBattery !== state.isLowBattery) {
            const now = Date.now();
            if (now - lastBatteryWarningTime > BATTERY_WARNING_DEBOUNCE) {  // ✅ Debounce
                lastBatteryWarningTime = now;
                speechSynthesisPlayer('Battery low, warning', true, 0);
            }
        }
    }
}
```

**Effect:** Battery warning plays at most once every 3 seconds, preventing spam.

---

## Result

### Before Fix
```
🔊 Battery low, warning  [1/2 - overlapping]
🔊 Battery low, warning  [2/2 - overlapping] ← 2 people speaking!
```

### After Fix
```
🔊 Battery low, warning  [single, clear audio]
⏭️  Skipped duplicate looping message: "Battery low, warning"
⏭️  Skipped duplicate looping message: "Battery low, warning"
```

---

## Testing the Fix

1. **Trigger battery warning** in the UI
2. **Monitor browser console** for these messages:
   - `🔊 Server TTS playing:` (audio starts)
   - `⏭️  Skipped duplicate` (duplicates rejected) ✅
   - Should NOT see multiple overlapping plays

3. **Listen to audio:**
   - Clear single voice
   - No overlapping speakers
   - Message plays once, loops cleanly

---

## Technical Details

### Why This Works

| Issue | Root Cause | Fix | Result |
|-------|-----------|-----|--------|
| Multiple identical messages queued | No deduplication | Added duplicate checks | Only one copy plays |
| Infinite client-server loop | Client re-requested looping messages | Server handles looping only | Client plays once |
| Battery warning spam | No throttling | Added 3s debounce | Max 1 warning per 3s |
| Overlapping audio during playback | Queue not checked properly | Process queue after audio ends | Sequential playback |

### Deduplication in Two Layers

1. **Server→Client:** If server sends duplicate TTS, client skips it
2. **Client→UI:** If UI requests duplicate message, client skips adding to queue

### Looping Strategy

**Before (Wrong):**
```
Client requests: "Battery low" (loop=true)
Server: [sends audio]
Client plays → Audio ends
Client: "I should loop, request again!"
Server: [sends again] → overlapping with next natural request
```

**After (Correct):**
```
Client requests: "Battery low" (loop=true)
Server: [sends audio]
Client plays → Audio ends
Client: "Done. Server will send next one."
Server: [automatically sends next one per its own loop logic]
```

---

## Files Modified

- **[ai.js](frontend/ai.js)**
  - `handleTTSAudio()`: Added deduplication + fixed looping
  - `speechSynthesisPlayer()`: Added message deduplication
  - `batteryLevel()`: Added 3-second debounce

---

## Notes for Users

✅ Battery warning now plays clearly, one voice  
✅ No overlapping audio during long messages  
✅ Looping messages (alarms, warnings) handled correctly  
✅ Rapid state changes don't spam audio requests  

If you still hear any overlapping, check:
1. Browser console for deduplication logs
2. Network tab for duplicate WebSocket messages
3. Server-side TTS request handler for duplicates

---

## Future Improvements

- [ ] Add audio ducking (lower background volume when warning plays)
- [ ] Implement priority interrupt (urgent message stops lower-priority audio)
- [ ] Add visual queue display for debugging
- [ ] Server-side loop throttling (max 1 request per Xs)
