// Howler.js will be loaded via script tag in HTML files

class ProceduralSoundManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.musicInterval = null;
    this.musicOscillators = [];
    this.isInitialized = false;
    this.useKenneyAudio = true; // Flag to enable/disable Kenney audio
    this.kenneySounds = {}; // Store Howl instances
    this.kenneyMusic = {}; // Store music Howl instances

    // Load saved settings
    this.masterVolume = parseFloat(
      localStorage.getItem('qb_masterVol')
    );
    if (isNaN(this.masterVolume)) this.masterVolume = 0.5;

    this.sfxVolume = parseFloat(
      localStorage.getItem('qb_sfxVol')
    );
    if (isNaN(this.sfxVolume)) this.sfxVolume = 1.0;

    this.musicVolume = parseFloat(
      localStorage.getItem('qb_musicVol')
    );
    if (isNaN(this.musicVolume)) this.musicVolume = 0.7;

    this.isMuted = localStorage.getItem('qb_muted') === 'true';
    this.selectedMusic = localStorage.getItem('qb_music') || 'procedural';
    this.customMusicUrl = null;
    this.customMusicAudio = null;

    // Initialize Kenney audio files
    this.initKenneyAudio();
  }

  // Initialize Kenney audio files
  initKenneyAudio() {
    // Sound effects mapping
    const soundFiles = {
      correct: 'sounds/jingles_HIT13.ogg',
      wrong: 'sounds/explosionCrunch_000.ogg',
      tick: 'sounds/click1.ogg',
      urgentTick: 'sounds/laserSmall_000.ogg',
      join: 'sounds/doorOpen_000.ogg',
      start: 'sounds/jingles_NES05.ogg',
      streak: 'sounds/jingles_PIZZI07.ogg',
      results: 'sounds/jingles_STEEL03.ogg',
      winner: 'sounds/jingles_SAX07.ogg',
      answerLock: 'sounds/switch1.ogg',
      doublePoints: 'sounds/laserLarge_000.ogg'
    };

    // Music files mapping
    const musicFiles = {
      lobby: 'sounds/spaceEngineLow_000.ogg',
      question: 'sounds/computerNoise_000.ogg'
    };

    // Load sound effects
    Object.keys(soundFiles).forEach(key => {
      this.kenneySounds[key] = new Howl({
        src: [soundFiles[key]],
        preload: true,
        onload: () => console.log(`✅ Loaded ${key}: ${soundFiles[key]}`),
        onloaderror: (id, err) => {
          console.warn(`❌ Failed to load ${key}: ${soundFiles[key]}`, err);
          this.useKenneyAudio = false;
        }
      });
    });

    // Load music files
    Object.keys(musicFiles).forEach(key => {
      this.kenneyMusic[key] = new Howl({
        src: [musicFiles[key]],
        loop: true,
        preload: true,
        onload: () => console.log(`✅ Loaded music ${key}: ${musicFiles[key]}`),
        onloaderror: (id, err) => {
          console.warn(`❌ Failed to load music ${key}: ${musicFiles[key]}`, err);
        }
      });
    });

    // Set global Howler volume
    Howler.volume(1.0);
  }

  // Initialize AudioContext (must be called after user interaction)
  init() {
    if (this.isInitialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.updateVolumes();
      this.isInitialized = true;
    } catch(e) {
      console.log('Audio not supported');
    }
  }

  unlock() {
    if (!this.isInitialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  updateVolumes() {
    if (!this.masterGain) return;
    this.masterGain.gain.value = this.isMuted ? 0 : this.masterVolume;
    this.sfxGain.gain.value = this.sfxVolume;
    this.musicGain.gain.value = this.musicVolume;

    // Update Howler.js volumes
    const masterVol = this.isMuted ? 0 : this.masterVolume;
    Howler.volume(masterVol);
    
    // Update individual Howl instances if needed
    Object.values(this.kenneySounds).forEach(howl => {
      if (howl && howl.state() === 'loaded') {
        howl.volume(this.sfxVolume);
      }
    });
    
    Object.values(this.kenneyMusic).forEach(howl => {
      if (howl && howl.state() === 'loaded') {
        howl.volume(this.musicVolume);
      }
    });
  }

  setMasterVolume(val) {
    this.masterVolume = parseFloat(val);
    this.updateVolumes();
    this.saveSettings();
  }

  setMusicVolume(val) {
    this.musicVolume = parseFloat(val);
    this.updateVolumes();
    this.saveSettings();
  }

  setSFXVolume(val) {
    this.sfxVolume = parseFloat(val);
    this.updateVolumes();
    this.saveSettings();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.updateVolumes();
    this.saveSettings();
    return this.isMuted;
  }

  saveSettings() {
    localStorage.setItem('qb_masterVol', this.masterVolume);
    localStorage.setItem('qb_sfxVol', this.sfxVolume);
    localStorage.setItem('qb_musicVol', this.musicVolume);
    localStorage.setItem('qb_muted', this.isMuted);
    localStorage.setItem('qb_music', this.selectedMusic);
  }

  _playTone(freq, type, duration, vol, 
             startOffset = 0, dest = null) {
    if (!this.ctx || this.ctx.state !== 'running') return null;
    dest = dest || this.sfxGain;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime + startOffset;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + duration + 0.1);
    return osc;
  }

  // ===== SOUND EFFECTS =====

  playCorrect() {
    if (this.useKenneyAudio && this.kenneySounds.correct && this.kenneySounds.correct.state() === 'loaded') {
      this.kenneySounds.correct.play();
    } else {
      // Fallback to procedural
      this._playTone(523.25, 'sine', 0.15, 0.5);
      this._playTone(659.25, 'sine', 0.3, 0.5, 0.1);
      this._playTone(783.99, 'sine', 0.4, 0.4, 0.2);
    }
  }

  playWrong() {
    if (this.useKenneyAudio && this.kenneySounds.wrong && this.kenneySounds.wrong.state() === 'loaded') {
      this.kenneySounds.wrong.play();
    } else {
      // Fallback to procedural
      this._playTone(200, 'sawtooth', 0.2, 0.3);
      this._playTone(150, 'sawtooth', 0.3, 0.3, 0.15);
      this._playTone(100, 'sawtooth', 0.4, 0.3, 0.3);
    }
  }

  playTick() {
    if (this.useKenneyAudio && this.kenneySounds.tick && this.kenneySounds.tick.state() === 'loaded') {
      this.kenneySounds.tick.play();
    } else {
      // Fallback to procedural
      this._playTone(800, 'square', 0.05, 0.08);
    }
  }

  playUrgentTick() {
    if (this.useKenneyAudio && this.kenneySounds.urgentTick && this.kenneySounds.urgentTick.state() === 'loaded') {
      this.kenneySounds.urgentTick.play();
    } else {
      // Fallback to procedural
      this._playTone(1200, 'square', 0.05, 0.15);
    }
  }

  playJoin() {
    if (this.useKenneyAudio && this.kenneySounds.join && this.kenneySounds.join.state() === 'loaded') {
      this.kenneySounds.join.play();
    } else {
      // Fallback to procedural
      this._playTone(440, 'sine', 0.15, 0.25);
      this._playTone(880, 'sine', 0.3, 0.25, 0.12);
    }
  }

  playStart() {
    if (this.useKenneyAudio && this.kenneySounds.start && this.kenneySounds.start.state() === 'loaded') {
      this.kenneySounds.start.play();
    } else {
      // Fallback to procedural
      this._playTone(440, 'square', 0.1, 0.3);
      this._playTone(554.37, 'square', 0.1, 0.3, 0.12);
      this._playTone(659.25, 'square', 0.1, 0.3, 0.24);
      this._playTone(880, 'square', 0.5, 0.3, 0.36);
    }
  }

  playStreak() {
    if (this.useKenneyAudio && this.kenneySounds.streak && this.kenneySounds.streak.state() === 'loaded') {
      this.kenneySounds.streak.play();
    } else {
      // Fallback to procedural
      this._playTone(523.25, 'triangle', 0.1, 0.4);
      this._playTone(659.25, 'triangle', 0.1, 0.4, 0.1);
      this._playTone(783.99, 'triangle', 0.1, 0.4, 0.2);
      this._playTone(1046.50, 'triangle', 0.5, 0.4, 0.3);
    }
  }

  playResults() {
    if (this.useKenneyAudio && this.kenneySounds.results && this.kenneySounds.results.state() === 'loaded') {
      this.kenneySounds.results.play();
    } else {
      // Fallback to procedural
      this._playTone(392.00, 'square', 0.1, 0.3);
      this._playTone(523.25, 'square', 0.1, 0.3, 0.12);
      this._playTone(659.25, 'square', 0.3, 0.3, 0.24);
    }
  }

  playWinner() {
    if (this.useKenneyAudio && this.kenneySounds.winner && this.kenneySounds.winner.state() === 'loaded') {
      this.kenneySounds.winner.play();
    } else {
      // Fallback to procedural
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((f, i) => {
        this._playTone(f, 'square', 0.2, 0.35, i * 0.15);
      });
      this._playTone(1046.50, 'square', 1.0, 0.35, 
        notes.length * 0.15 + 0.1);
    }
  }

  playAnswerLock() {
    if (this.useKenneyAudio && this.kenneySounds.answerLock && this.kenneySounds.answerLock.state() === 'loaded') {
      this.kenneySounds.answerLock.play();
    } else {
      // Fallback to procedural
      this._playTone(1000, 'triangle', 0.08, 0.15);
    }
  }

  playDoublePoints() {
    if (this.useKenneyAudio && this.kenneySounds.doublePoints && this.kenneySounds.doublePoints.state() === 'loaded') {
      this.kenneySounds.doublePoints.play();
    } else {
      // Fallback to procedural
      this._playTone(440, 'square', 0.1, 0.4);
      this._playTone(880, 'square', 0.1, 0.4, 0.1);
      this._playTone(1320, 'square', 0.5, 0.4, 0.2);
    }
  }

  // ===== MUSIC =====

  stopMusic() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
    this.musicOscillators.forEach(osc => {
      try { osc.stop(this.ctx.currentTime + 0.1); } catch(e){}
    });
    this.musicOscillators = [];

    // Stop Kenney music
    Object.values(this.kenneyMusic).forEach(howl => {
      if (howl && howl.state() === 'loaded') {
        howl.stop();
      }
    });

    // Stop custom music if playing
    if (this.customMusicAudio) {
      this.customMusicAudio.pause();
      this.customMusicAudio.currentTime = 0;
    }
  }

  startLobbyMusic() {
    this.stopMusic();
    if (this.selectedMusic === 'none') return;

    // Use custom music if uploaded
    if (this.selectedMusic === 'custom' && this.customMusicUrl) {
      this._playCustomMusic();
      return;
    }

    // Use Kenney lobby music if available
    if (this.useKenneyAudio && this.kenneyMusic.lobby && this.kenneyMusic.lobby.state() === 'loaded') {
      this.kenneyMusic.lobby.play();
      return;
    }

    // Fallback to procedural upbeat arpeggio
    if (!this.ctx) return;
    const notes = [261.63, 329.63, 392.00, 523.25, 
                   659.25, 523.25, 392.00, 329.63];
    let step = 0;
    this.musicInterval = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const f = notes[step % notes.length];
      const osc = this._playTone(f, 'sine', 0.25, 0.15, 0, 
        this.musicGain);
      if (osc) {
        this.musicOscillators.push(osc);
        if (this.musicOscillators.length > 30) {
          this.musicOscillators.shift();
        }
      }
      step++;
    }, 280);
  }

  startQuestionMusic() {
    this.stopMusic();
    if (this.selectedMusic === 'none') return;

    // Use Kenney question music if available
    if (this.useKenneyAudio && this.kenneyMusic.question && this.kenneyMusic.question.state() === 'loaded') {
      this.kenneyMusic.question.play();
      return;
    }

    // Fallback to procedural tense pulsing bass
    if (!this.ctx) return;
    let step = 0;
    this.musicInterval = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const freqs = [110, 120, 110, 130];
      const f = freqs[step % freqs.length];
      const osc = this._playTone(f, 'sawtooth', 0.2, 0.12, 0, 
        this.musicGain);
      if (osc) {
        this.musicOscillators.push(osc);
        if (this.musicOscillators.length > 20) {
          this.musicOscillators.shift();
        }
      }
      step++;
    }, 230);
  }

  _playCustomMusic() {
    if (!this.customMusicUrl) return;
    this.customMusicAudio = new Audio(this.customMusicUrl);
    this.customMusicAudio.loop = true;
    this.customMusicAudio.volume = this.isMuted ? 0 : 
      this.musicVolume * this.masterVolume;
    this.customMusicAudio.play().catch(e => {
      console.log('Custom music play failed:', e);
    });
  }

  setCustomMusic(url) {
    this.customMusicUrl = url;
    this.selectedMusic = 'custom';
    this.saveSettings();
  }

  previewLobbyMusic(duration = 4000) {
    this.startLobbyMusic();
    setTimeout(() => this.stopMusic(), duration);
  }
}

// Create global instance
const soundManager = new ProceduralSoundManager();

// Auto-unlock on any interaction
document.addEventListener('click', () => soundManager.unlock(), 
  { once: true });
document.addEventListener('touchstart', () => soundManager.unlock(), 
  { once: true });
