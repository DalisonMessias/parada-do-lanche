let activeAudio: HTMLAudioElement | null = null;
let lastSoundAt = 0;
let beepContext: AudioContext | null = null;

const hasActiveUserGesture = () => {
  try {
    const activation = (navigator as any)?.userActivation;
    if (!activation) return false;
    return Boolean(activation.isActive);
  } catch {
    return false;
  }
};

const fallbackBeep = () => {
  try {
    if (!hasActiveUserGesture()) return;
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!beepContext) {
      beepContext = new AudioContextCtor();
    }
    const ctx = beepContext;
    const isRunning = () => ctx.state === 'running';
    if (!isRunning()) {
      void ctx.resume().catch(() => null);
      if (!isRunning()) return;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 760;
    gain.gain.value = 0.03;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // noop
  }
};

export const playOrderAlertSound = async ({
  enabled,
  mp3Url,
  throttleMs = 2000,
  force = false,
}: {
  enabled?: boolean;
  mp3Url?: string | null;
  throttleMs?: number;
  force?: boolean;
}) => {
  const now = Date.now();
  if (!force && now - lastSoundAt < throttleMs) return;
  lastSoundAt = now;

  const url = (mp3Url || '').trim();
  if (!enabled) return;
  if (!url) {
    fallbackBeep();
    return;
  }

  try {
    if (!activeAudio) {
      activeAudio = new Audio(url);
      activeAudio.preload = 'auto';
    } else if (activeAudio.src !== url) {
      activeAudio.pause();
      activeAudio = new Audio(url);
      activeAudio.preload = 'auto';
    }
    activeAudio.currentTime = 0;
    await activeAudio.play();
  } catch {
    fallbackBeep();
  }
};
