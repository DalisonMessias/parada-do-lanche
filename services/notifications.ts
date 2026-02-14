let activeAudio: HTMLAudioElement | null = null;
let lastSoundAt = 0;

const fallbackBeep = () => {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 760;
    gain.gain.value = 0.03;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
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
  if (!enabled || !url) {
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

