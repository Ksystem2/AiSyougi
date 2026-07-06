const ENABLED_KEY = 'aisyougi-bgm-enabled';
const VOLUME_KEY = 'aisyougi-bgm-volume';
const DEFAULT_VOLUME = 0.18;
/** 全曲をこの実効音量に揃える（マスター × この値が最終出力） */
const FILE_VOLUME_GAIN = 0.3;
/** 正規化の目標 RMS（曲ごとのマスター差を補正） */
const TARGET_RMS = 0.12;

const BGM_TRACKS = [
  './assets/bgm/Burning_Through_The_Floor.mp3',
  './assets/bgm/Fever_Rising.mp3',
  './assets/bgm/Rhythm_in_the_Suds.mp3',
  './assets/bgm/Set_the_World_Alight.mp3',
  './assets/bgm/Threads_of_Gold.mp3',
  './assets/bgm/TOWEL_JAM.mp3',
  './assets/bgm/Velvet_Velocity.mp3',
  './assets/bgm/Wild_in_the_Air.mp3',
];

/** @typedef {'none' | 'file' | 'synth'} BgmMode */

export class BgmPlayer {
  constructor() {
    /** @type {BgmMode} */
    this.mode = 'none';
    this.enabled = localStorage.getItem(ENABLED_KEY) === 'true';
    this.volume = clampVolume(parseFloat(localStorage.getItem(VOLUME_KEY) ?? String(DEFAULT_VOLUME)));
    this.unlocked = false;
    this.playlistActive = false;
    this.gameActive = true;
    this.synthReady = false;
    /** @type {string[]} */
    this.queue = [];
    /** @type {HTMLAudioElement | null} */
    this.audio = null;
    /** @type {string | null} */
    this.currentSrc = null;
    /** @type {AudioContext | null} */
    this.ctx = null;
    /** @type {GainNode | null} */
    this.masterGain = null;
    /** @type {GainNode | null} */
    this._trackGainNode = null;
    /** @type {MediaElementAudioSourceNode | null} */
    this._audioSource = null;
    /** @type {Map<string, number>} */
    this._trackGains = new Map();
    /** @type {{ start: () => void, stop: () => void, setVolume: (v: number) => void } | null} */
    this.synth = null;
    /** @type {(() => void) | null} */
    this.onStateChange = null;

    this._onTrackEnded = () => {
      void this._playNextInQueue();
    };
  }

  syncUi() {
    this.onStateChange?.(this.enabled);
  }

  isPlaying() {
    if (!this.enabled || !this.playlistActive) return false;
    if (this.mode === 'file') return !!this.audio && !this.audio.paused;
    if (this.mode === 'synth') return !!this.synth;
    return false;
  }

  _ensureCtx() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this._applyVolume();
  }

  _shuffledTracks() {
    const list = [...BGM_TRACKS];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  _refillQueue(excludeSrc = null) {
    const list = this._shuffledTracks();
    this.queue = excludeSrc ? list.filter((s) => s !== excludeSrc) : list;
    if (this.queue.length === 0) {
      this.queue = this._shuffledTracks();
    }
  }

  async _getTrackNormalizeGain(src) {
    const cached = this._trackGains.get(src);
    if (cached !== undefined) return cached;

    this._ensureCtx();
    if (!this.ctx) {
      this._trackGains.set(src, 1);
      return 1;
    }

    try {
      const res = await fetch(src);
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      let sumSq = 0;
      let count = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const ch = buf.getChannelData(c);
        for (let i = 0; i < ch.length; i++) {
          sumSq += ch[i] * ch[i];
          count++;
        }
      }
      const rms = Math.sqrt(sumSq / Math.max(count, 1));
      const gain = TARGET_RMS / Math.max(rms, 0.005);
      const normalized = Math.min(Math.max(gain, 0.15), 8);
      this._trackGains.set(src, normalized);
      return normalized;
    } catch {
      this._trackGains.set(src, 1);
      return 1;
    }
  }

  async _prefetchTrackGains() {
    await Promise.all(BGM_TRACKS.map((src) => this._getTrackNormalizeGain(src)));
  }

  _disconnectAudioGraph() {
    if (this._audioSource) {
      try {
        this._audioSource.disconnect();
      } catch {
        // already disconnected
      }
      this._audioSource = null;
    }
    if (this._trackGainNode) {
      try {
        this._trackGainNode.disconnect();
      } catch {
        // already disconnected
      }
      this._trackGainNode = null;
    }
  }

  _detachAudio() {
    this._disconnectAudioGraph();
    if (!this.audio) return;
    this.audio.removeEventListener('ended', this._onTrackEnded);
    this.audio.pause();
    this.audio = null;
    this.currentSrc = null;
  }

  _connectAudioElement(audio, trackGain) {
    this._ensureCtx();
    if (!this.ctx || !this.masterGain) return;

    this._disconnectAudioGraph();
    this._audioSource = this.ctx.createMediaElementSource(audio);
    this._trackGainNode = this.ctx.createGain();
    this._trackGainNode.gain.value = trackGain;
    this._audioSource.connect(this._trackGainNode);
    this._trackGainNode.connect(this.masterGain);
    audio.volume = 1;
  }

  async _loadFile(src) {
    const [trackGain, ok] = await Promise.all([
      this._getTrackNormalizeGain(src),
      (async () => {
        const audio = new Audio(src);
        audio.loop = false;
        audio.preload = 'auto';
        return new Promise((resolve) => {
          const done = (success) => {
            audio.removeEventListener('canplaythrough', onReady);
            audio.removeEventListener('error', onError);
            resolve(success ? audio : null);
          };
          const onReady = () => done(true);
          const onError = () => done(false);
          audio.addEventListener('canplaythrough', onReady, { once: true });
          audio.addEventListener('error', onError, { once: true });
          audio.load();
        });
      })(),
    ]);

    if (!ok) return false;

    this._detachAudio();
    this.audio = ok;
    this.currentSrc = src;
    this.mode = 'file';
    this._connectAudioElement(this.audio, trackGain);
    this.audio.addEventListener('ended', this._onTrackEnded);
    this._applyVolume();
    return true;
  }

  async _playNextInQueue() {
    if (!this.enabled || !this.playlistActive || !this.gameActive) return;

    this.synth?.stop();

    if (this.queue.length === 0) {
      this._refillQueue(this.currentSrc);
    }

    while (this.queue.length > 0) {
      const src = this.queue.shift();
      if (src === this.currentSrc && this.queue.length > 0) continue;
      if (await this._loadFile(src)) {
        this._ensureCtx();
        if (this.ctx?.state === 'suspended') await this.ctx.resume();
        try {
          await this.audio.play();
        } catch {
          // Autoplay blocked until user gesture.
        }
        return;
      }
    }

    this._ensureSynth();
    this._applyVolume();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
    this.synth?.start();
  }

  _ensureSynth() {
    if (this.synthReady) return;
    this._initSynth();
    this.synthReady = true;
    this.mode = 'synth';
  }

  _initSynth() {
    this._ensureCtx();
    if (!this.ctx || !this.masterGain) return;

    const notes = [293.66, 349.23, 392.0, 440.0, 523.25];
    let step = 0;
    /** @type {ReturnType<typeof setInterval> | null} */
    let timer = null;

    const playNote = (freq, duration = 2.4, level = 0.35) => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    };

    this.synth = {
      start: () => {
        if (timer || !this.ctx) return;
        const tick = () => {
          playNote(notes[step % notes.length]);
          if (step % notes.length === 2) playNote(notes[0] * 0.5, 3.2, 0.18);
          step += 1;
        };
        tick();
        timer = setInterval(tick, 3000);
      },
      stop: () => {
        if (timer) clearInterval(timer);
        timer = null;
      },
      setVolume: () => {
        // ファイル再生と同じ masterGain で音量を統一
      },
    };
  }

  _applyVolume() {
    const master = clampVolume(this.volume * FILE_VOLUME_GAIN);
    if (this.masterGain) {
      this.masterGain.gain.value = master;
    }
    if (this.audio) {
      this.audio.volume = 1;
    }
    if (this._trackGainNode && this.currentSrc) {
      this._trackGainNode.gain.value = this._trackGains.get(this.currentSrc) ?? 1;
    }
  }

  stopPlaylist() {
    this.playlistActive = false;
    this.queue = [];
    this._detachAudio();
    this.synth?.stop();
  }

  async startPlaylist() {
    if (!this.enabled || !this.gameActive) return;
    this.playlistActive = true;
    void this._prefetchTrackGains();
    this._refillQueue();
    await this._playNextInQueue();
  }

  async unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.enabled && this.gameActive) await this.startPlaylist();
  }

  /** 新しい対局の開始時（BGM ON なら連続再生を再開） */
  onGameStart() {
    this.gameActive = true;
    if (this.enabled) void this.startPlaylist();
  }

  /** 対局終了時（勝敗確定で再生停止） */
  onGameEnd() {
    this.gameActive = false;
    this.stopPlaylist();
  }

  async toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem(ENABLED_KEY, String(this.enabled));
    this.syncUi();
    if (this.enabled) {
      this.unlocked = true;
      if (this.gameActive) await this.startPlaylist();
    } else {
      this.stopPlaylist();
    }
  }

  setVolume(value) {
    this.volume = clampVolume(value);
    localStorage.setItem(VOLUME_KEY, String(this.volume));
    this._applyVolume();
  }
}

function clampVolume(v) {
  if (!Number.isFinite(v)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(1, v));
}

/** @returns {BgmPlayer} */
export function initBgm() {
  const player = new BgmPlayer();
  const btn = document.getElementById('bgm-toggle');

  player.onStateChange = (on) => {
    if (!btn) return;
    btn.textContent = on ? 'BGM ON' : 'BGM OFF';
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'BGMをオフにする' : 'BGMをオンにする');
  };
  player.syncUi();

  btn?.addEventListener('click', () => player.toggle());

  const unlock = () => player.unlock();
  document.body.addEventListener('pointerdown', unlock, { once: true });
  document.body.addEventListener('keydown', unlock, { once: true });

  return player;
}
