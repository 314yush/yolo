# Sound Effects

Add the following sound files to this directory:

## Required Sound Files

### 1. `spin` - Looping Wheel Spin Sound
- **Purpose**: Plays continuously while the spinner wheels are rotating
- **Characteristics**: 
  - Should loop seamlessly (no gaps or clicks)
  - Mechanical/whirring sound (like a slot machine or roulette wheel)
  - Medium volume, not too aggressive
  - Duration: 2-4 seconds (will loop)
  - **Formats**: `.aiff` (preferred), `.mp3`, `.wav` (provide all three for maximum compatibility)
- **Usage**: Starts when wheels begin spinning, stops when all wheels finish
- **Files**: `spin.aiff`, `spin.mp3`, `spin.wav`

### 2. `tick` - Wheel Stop Tick
- **Purpose**: Plays when each wheel stops (asset and leverage wheels)
- **Characteristics**:
  - Short, sharp, percussive sound
  - Duration: 0.1-0.3 seconds
  - Clean, crisp tick/click sound
  - Similar to a camera shutter or mechanical click
  - **Formats**: `.mp3` (preferred), `.wav`, `.aiff`
- **Usage**: Plays twice per spin (when asset wheel stops, when leverage wheel stops)
- **Files**: `tick.mp3`, `tick.wav`, `tick.aiff`

### 3. `ding` - Success/Win Sound
- **Purpose**: Plays when direction wheel stops and when trade opens successfully
- **Characteristics**:
  - Positive, uplifting sound
  - Duration: 0.3-0.8 seconds
  - Could be a bell, chime, or success notification sound
  - Should feel rewarding/celebratory
  - **Formats**: `.mp3` (preferred), `.wav`, `.aiff`
- **Usage**: Plays when final wheel stops, when trade opens, and for wins
- **Files**: `ding.mp3`, `ding.wav`, `ding.aiff`

### 4. `boom` - Error/Loss Sound
- **Purpose**: Plays for errors, losses, or negative PnL
- **Characteristics**:
  - Lower pitch, more dramatic
  - Duration: 0.5-1.0 seconds
  - Could be a whoosh down, impact sound, or error notification
  - Should feel impactful but not jarring
  - **Formats**: `.mp3` (preferred), `.wav`, `.aiff`
- **Usage**: Plays for errors, losses, and negative PnL updates
- **Files**: `boom.mp3`, `boom.wav`, `boom.aiff`

### 5. `flip` - Flip Trade Sound
- **Purpose**: Plays when a trade is successfully flipped (closed and reopened in opposite direction)
- **Characteristics**:
  - Positive, satisfying sound indicating a successful flip
  - Duration: 0.3-0.8 seconds
  - Could be a quick whoosh, flip/swish sound, or success chime
  - Should feel rewarding and indicate direction change
  - **Formats**: `.mp3` (preferred), `.wav`, `.aiff`
- **Usage**: Plays when flip trade completes successfully
- **Files**: `flip.mp3`, `flip.wav`, `flip.aiff`

### 6. `background` - Background Music
- **Purpose**: Continuous ambient music that plays during gameplay
- **Characteristics**:
  - **Recommended Genre**: Synthwave/Retro Wave or Electronic/Ambient Electronic
  - **Why**: Matches the neon aesthetic (#CCFF00, #FF006E), high-energy vibe, and retro-futuristic feel
  - **Duration**: 2-4 minutes (will loop seamlessly)
  - **Volume**: Lower than sound effects (30% volume in code)
  - **Mood**: High-energy but not distracting, rebellious, playful
  - Should complement sound effects without overpowering them
  - No vocals (instrumental only)
  - Should loop seamlessly with no gaps or clicks
  - **Formats**: `.mp3` (preferred), `.wav`, `.aiff`
- **Usage**: Plays continuously when music is enabled in settings, stops when disabled
- **Files**: `background.mp3`, `background.wav`, `background.aiff`
- **Genre Recommendations**:
  - **Synthwave/Retro Wave** (BEST MATCH) - Perfect for neon colors, retro-futuristic aesthetic
    - Search: "synthwave", "retro wave", "outrun", "cyberpunk ambient"
  - **Electronic/Ambient Electronic** - Energetic but atmospheric
    - Search: "electronic ambient", "cyberpunk music", "futuristic electronic"
  - **Lo-Fi Electronic** - Chill but energetic, good for focus
    - Search: "lo-fi electronic", "chillwave", "ambient electronic"

## Recommended Sources

### Sound Effects:
- **[Freesound.org](https://freesound.org)** - Free, CC0 licensed sounds
  - Search: "slot machine spin", "mechanical tick", "success ding", "error sound"
- **[Mixkit](https://mixkit.co/free-sound-effects/)** - Free sound effects library
- **[Pixabay Sound Effects](https://pixabay.com/sound-effects/)** - Free audio library
- **[Zapsplat](https://www.zapsplat.com/)** - Free with account (requires attribution)

### Background Music:
- **[Freesound.org](https://freesound.org)** - Search: "synthwave", "retro wave", "electronic ambient"
- **[Pixabay Music](https://pixabay.com/music/)** - Free music library
  - Search: "synthwave", "cyberpunk", "electronic", "ambient electronic"
- **[Incompetech](https://incompetech.com/music/)** - Free music by Kevin MacLeod
  - Search: "electronic", "ambient", "cyberpunk"
- **[YouTube Audio Library](https://www.youtube.com/audiolibrary)** - Free music for creators
- **[Bensound](https://www.bensound.com/)** - Free music (requires attribution)

## Technical Requirements

### Format Support (Multi-Format for Browser Compatibility)

The code supports multiple formats for each sound file. Browsers will automatically use the first format they support:

**Format Priority Order:**
- **Spin sound**: `.aiff` → `.mp3` → `.wav` (AIFF preferred, MP3/WAV fallbacks)
- **All other sounds**: `.mp3` → `.wav` → `.aiff` (MP3 preferred, WAV/AIFF fallbacks)

**Why Multiple Formats?**
- Different browsers support different formats
- MP3: Universal support (Chrome, Firefox, Safari, Edge)
- WAV: Good quality, supported by most browsers
- AIFF: Preferred for spin sound, good quality, supported by Safari and modern browsers

**File Naming:**
You can provide any combination of formats. The code will try formats in order:
- `spin.aiff`, `spin.mp3`, `spin.wav` (provide all three for maximum compatibility)
- `tick.mp3`, `tick.wav`, `tick.aiff`
- `ding.mp3`, `ding.wav`, `ding.aiff`
- `boom.mp3`, `boom.wav`, `boom.aiff`
- `flip.mp3`, `flip.wav`, `flip.aiff`
- `background.mp3`, `background.wav`, `background.aiff`

**Minimum Requirement:** At least one format per sound file (preferably MP3 for best compatibility)

### Audio Specifications

- **Bitrate**: 
  - Sound effects: 128-192 kbps (good quality, reasonable file size)
  - Background music: 128-192 kbps (can be slightly higher for better quality since it's longer)
- **Sample Rate**: 44.1 kHz
- **File Size**: 
  - Sound effects: Keep under 500KB each for fast loading
  - Background music: Keep under 2MB (for 2-4 minute track at 128-192 kbps)
- **Mobile-Friendly**: Short, punchy sounds work best on mobile devices
- **Looping**: Both `spin` and `background` sounds must loop seamlessly (no gaps or clicks)

## Tips

- **Format Compatibility**: Provide multiple formats (MP3, WAV, AIFF) for each sound to ensure maximum browser compatibility
- **Testing**: Test sounds at different volumes to ensure they work well together
- **Looping**: The `spin` and `background` sounds should loop seamlessly - test them by playing on repeat
- **Audio Editing**: Consider using audio editing software (Audacity, GarageBand) to normalize volumes and convert formats
- **Volume Balance**: Make sure sounds don't overlap/clash when played simultaneously
- **Background Music Volume**: Background music should be quieter than sound effects (30% volume vs 50-70% for effects)
- **Browser Testing**: Test on multiple browsers (Chrome, Firefox, Safari, Edge) to ensure format compatibility
- **File Size**: Keep files optimized - MP3 is usually smallest, WAV/AIFF are larger but higher quality
- **Format Conversion**: You can convert between formats using:
  - **Audacity** (free): Export → Export Audio → Choose format
  - **FFmpeg** (command line): `ffmpeg -i input.wav output.mp3`
  - **Online converters**: CloudConvert, Online-Convert, etc.
- When selecting background music, ensure it:
  - Doesn't have sudden volume spikes that would clash with sound effects
  - Has a consistent energy level throughout (no dramatic builds/drops)
  - Works well at low volume (users may turn it down)
  - Fits the "high-energy, rebellious, playful" brand personality
