# Sound Effects

Add the following sound files to this directory:

## Required Sound Files

### 1. `spin.mp3` - Looping Wheel Spin Sound
- **Purpose**: Plays continuously while the spinner wheels are rotating
- **Characteristics**: 
  - Should loop seamlessly (no gaps or clicks)
  - Mechanical/whirring sound (like a slot machine or roulette wheel)
  - Medium volume, not too aggressive
  - Duration: 2-4 seconds (will loop)
- **Usage**: Starts when wheels begin spinning, stops when all wheels finish

### 2. `tick.mp3` - Wheel Stop Tick
- **Purpose**: Plays when each wheel stops (asset and leverage wheels)
- **Characteristics**:
  - Short, sharp, percussive sound
  - Duration: 0.1-0.3 seconds
  - Clean, crisp tick/click sound
  - Similar to a camera shutter or mechanical click
- **Usage**: Plays twice per spin (when asset wheel stops, when leverage wheel stops)

### 3. `ding.mp3` - Success/Win Sound
- **Purpose**: Plays when direction wheel stops and when trade opens successfully
- **Characteristics**:
  - Positive, uplifting sound
  - Duration: 0.3-0.8 seconds
  - Could be a bell, chime, or success notification sound
  - Should feel rewarding/celebratory
- **Usage**: Plays when final wheel stops, when trade opens, and for wins

### 4. `boom.mp3` - Error/Loss Sound
- **Purpose**: Plays for errors, losses, or negative PnL
- **Characteristics**:
  - Lower pitch, more dramatic
  - Duration: 0.5-1.0 seconds
  - Could be a whoosh down, impact sound, or error notification
  - Should feel impactful but not jarring
- **Usage**: Plays for errors, losses, and negative PnL updates

## Recommended Sources

- **[Freesound.org](https://freesound.org)** - Free, CC0 licensed sounds
  - Search: "slot machine spin", "mechanical tick", "success ding", "error sound"
- **[Mixkit](https://mixkit.co/free-sound-effects/)** - Free sound effects library
- **[Pixabay Sound Effects](https://pixabay.com/sound-effects/)** - Free audio library
- **[Zapsplat](https://www.zapsplat.com/)** - Free with account (requires attribution)

## Technical Requirements

- **Format**: MP3 (most compatible)
- **Bitrate**: 128-192 kbps (good quality, reasonable file size)
- **Sample Rate**: 44.1 kHz
- **File Size**: Keep under 500KB each for fast loading
- **Mobile-Friendly**: Short, punchy sounds work best on mobile devices

## Tips

- Test sounds at different volumes to ensure they work well together
- The `spin.mp3` should loop seamlessly - test it by playing it on repeat
- Consider using audio editing software (Audacity, GarageBand) to normalize volumes
- Make sure sounds don't overlap/clash when played simultaneously
