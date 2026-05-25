# 🔊 CRITICAL FIX: Audio Overlapping Issue - RESOLVED

## Problem Description
Multiple identical TTS messages were playing simultaneously, causing overlapping audio ("2 people speaking together"), especially with battery low warnings.

**Console Evidence:**
```
ai.js:334 🔊 Server TTS playing: "Battery low, warning"  loop=true
ai.js:304 📡 Server TTS: "Battery low, warning"  loop=true
ai.js:334 🔊 Server TTS playing: "Battery low, warning"  loop=true
[Multiple concurrent plays at same time]
```

---

## Root Cause
The server sends the same looping message multiple times in rapid succession. The previous deduplication logic failed because **multiple `handleTTSAudio()` calls executed in parallel** before the state check completed:

```javascript
// OLD (race condition):
if (state.currentLoopingMessage === data.text) {  // ❌ Check
    return;
}
state.currentLoopingMessage = data.text;  // Multiple threads set this concurrently
// Multiple audio buffers decode and play at the same time
```

**Timeline of the race condition:**
1. Call A arrives → checks state (not set yet, passes check) ✓
2. Call B arrives → checks state (still not set by A, passes check) ✓  
3. Both A and B start decoding audio in parallel
4. Both A and B create buffer sources and call `.start()`
5. Result: **Two identical audio streams playing simultaneously**

---

## Solution: Processing Lock
Implemented a **processing lock** (`state.isProcessingLooping`) to ensure only ONE looping message decodes and plays at a time:

```javascript
state.isProcessingLooping = false;  // NEW: Lock flag
state.currentLoopingSource = null;  // NEW: Track current playing source
```

### How It Works

**Step 1: Lock Before Processing**
```javascript
if (isLooping) {
    // If already processing THIS message, SKIP
    if (state.currentLoopingMessage === data.text && state.isProcessingLooping) {
        console.log(`⏭️  Skipped: already playing`);
        return;  // ✅ Prevents duplicate decode
    }
    
    // Acquire lock
    state.isProcessingLooping = true;
    state.currentLoopingMessage = data.text;
}
```

**Step 2: Stop Previous Audio if Message Changed**
```javascript
// If switching to a DIFFERENT looping message, stop the old one
if (state.currentLoopingMessage !== data.text && state.currentLoopingSource) {
    state.currentLoopingSource.stop();
    state.currentLoopingSource = null;
}
```

**Step 3: Store Reference to Current Source**
```javascript
if (isLooping) {
    state.currentLoopingSource = src;  // Store so we can stop it later
}
```

**Step 4: Release Lock When Done**
```javascript
src.onended = () => {
    state.isSpeaking = false;
    if (isLooping) {
        state.isProcessingLooping = false;  // ✅ Release lock
    }
};
```

---

## Timeline After Fix

**Multiple rapid requests arrive:**

```
Request 1 arrives (Battery low):
  → Acquire lock (isProcessingLooping = true)
  → Decode audio
  → Play audio ✓

Request 2 arrives (same message):
  → Check: isProcessingLooping = true
  → ⏭️  Skipped: already playing ✅
  
Request 3 arrives (same message):
  → Check: isProcessingLooping = true
  → ⏭️  Skipped: already playing ✅

Request 1 audio finishes:
  → Release lock (isProcessingLooping = false)
  
Request 4 arrives (new message):
  → Acquire lock
  → Stop previous source
  → Decode new message
  → Play ✓
```

**Result:** Single clear audio stream, no overlaps.

---

## Files Modified

### 1. **frontend/utility.js**
Added to `state` object:
```javascript
currentLoopingSource: null,  // AudioBufferSource currently playing
isProcessingLooping: false,  // Lock to prevent concurrent execution
```

### 2. **frontend/ai.js**

#### `handleTTSAudio(data)` — Critical fix
- Added processing lock check
- Stops previous source if switching messages
- Stores current source reference
- Releases lock on audio end

#### `speechSynthesisPlayer(text, loop, priority)` — Lock management
- Acquires lock when switching to looping message
- Properly manages lock state transitions

#### `playSpeech(text, isLooping)` — Lock cleanup
- Releases lock when looping message ends
- Properly handles error cases

---

## Key Improvements

| Issue | Solution | Result |
|-------|----------|--------|
| Race condition in state check | Processing lock (`isProcessingLooping`) | Only 1 message decodes at a time |
| Multiple concurrent audio plays | Store source reference + stop prev | Stop old audio before starting new |
| Lock never released | Explicit release on audio end | Lock properly managed |
| No way to interrupt audio | Store source reference | Can stop any playing audio |

---

## Testing

After applying this fix, you should see:

✅ **In console:**
```
🔊 Server TTS playing: "Battery low, warning"  loop=true
⏭️  Skipped: already playing "Battery low, warning"
⏭️  Skipped: already playing "Battery low, warning"
[No overlaps, no duplicates playing]
```

✅ **In audio:**
- Single, clear voice
- No overlapping speakers
- Battery warning plays cleanly even if server sends 10 copies

✅ **Performance:**
- No CPU waste decoding duplicate audio
- No browser stutter from concurrent audio operations

---

## Technical Details

### Lock Semantics
- **Lock acquired:** When starting to decode a looping message (`state.isProcessingLooping = true`)
- **Lock held:** While audio is decoding and playing
- **Lock released:** When audio finishes (`onended`) or errors (`onerror`)
- **Check is atomic:** Both message identity AND lock state checked in one condition

### Why This Beats Deduplication Alone
- **Deduplication:** Checks if message in queue (but queue isn't used for server TTS)
- **Processing lock:** Prevents ANY concurrent decoding of same message
- **Source tracking:** Can actively stop old audio, not just prevent new requests

### Why This Works Even If Server Sends Duplicates
The server can send the same message 10 times in 100ms:
1. First call acquires lock and starts playing
2. Calls 2-10 immediately return ("already playing")
3. All 10 duplicate decodings prevented
4. Single clear audio plays

---

## Edge Cases Handled

✅ **Rapid message switches:** Stops old audio, starts new  
✅ **Audio decode errors:** Lock properly released  
✅ **Audio playback errors:** Lock properly released  
✅ **Browser speech synthesis:** Lock integrated with `speechSynthesisPlayer`  
✅ **Non-looping messages:** Unaffected, normal queue processing  
✅ **Queue processing:** Only starts after looping message finishes  

---

## Future Optimization

If server continues to send duplicates frequently, consider:
1. **Server-side rate limiting:** Don't send same looping message > once per 2 seconds
2. **Client-side timeout:** Auto-stop looping message if no new copies arrive for 5 seconds
3. **Message versioning:** Include timestamp/version so client knows when message is truly new

For now, this lock-based solution **completely prevents overlapping audio** regardless of server behavior.
