"use client";

// Synthesized chimes — avoids shipping/hosting audio assets for a handful of
// short sounds. Lazily creates one AudioContext and reuses it (Safari caps
// how many can exist per page).
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

interface Note {
  freq: number;
  start: number;
  duration: number;
}

interface SoundDef {
  id: string;
  label: string;
  waveform: OscillatorType;
  peakGain: number;
  notes: Note[];
}

export const NOTIFICATION_SOUNDS: SoundDef[] = [
  {
    id: "chime",
    label: "Chime",
    waveform: "sine",
    peakGain: 0.18,
    notes: [
      { freq: 880, start: 0, duration: 0.12 },
      { freq: 1318.5, start: 0.1, duration: 0.2 },
    ],
  },
  {
    id: "ping",
    label: "Ping",
    waveform: "sine",
    peakGain: 0.2,
    notes: [{ freq: 1760, start: 0, duration: 0.14 }],
  },
  {
    id: "bell",
    label: "Bell",
    waveform: "triangle",
    peakGain: 0.16,
    notes: [
      { freq: 587.33, start: 0, duration: 0.28 },
      { freq: 880, start: 0.03, duration: 0.32 },
    ],
  },
  {
    id: "soft",
    label: "Soft",
    waveform: "sine",
    peakGain: 0.14,
    notes: [
      { freq: 440, start: 0, duration: 0.2 },
      { freq: 554.37, start: 0.14, duration: 0.22 },
    ],
  },
  {
    id: "alert",
    label: "Alert",
    waveform: "square",
    peakGain: 0.1,
    notes: [
      { freq: 1046.5, start: 0, duration: 0.08 },
      { freq: 784, start: 0.1, duration: 0.08 },
    ],
  },
];

const DEFAULT_SOUND_ID = NOTIFICATION_SOUNDS[0].id;

const MUTE_KEY = "notification_sound_muted";
const SOUND_KEY = "notification_sound_id";

export function isNotificationSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MUTE_KEY) === "1";
}

export function setNotificationSoundMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

export function getNotificationSoundId(): string {
  if (typeof window === "undefined") return DEFAULT_SOUND_ID;
  const stored = window.localStorage.getItem(SOUND_KEY);
  return stored && NOTIFICATION_SOUNDS.some((s) => s.id === stored) ? stored : DEFAULT_SOUND_ID;
}

export function setNotificationSoundId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SOUND_KEY, id);
}

function playSound(sound: SoundDef): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  for (const note of sound.notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = sound.waveform;
    osc.frequency.value = note.freq;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const startAt = now + note.start;
    const endAt = startAt + note.duration;
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(sound.peakGain, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    osc.start(startAt);
    osc.stop(endAt + 0.02);
  }
}

/** Plays the user's selected notification sound, unless muted. */
export function playNotificationSound(): void {
  if (isNotificationSoundMuted()) return;
  const sound = NOTIFICATION_SOUNDS.find((s) => s.id === getNotificationSoundId()) ?? NOTIFICATION_SOUNDS[0];
  playSound(sound);
}

/** Plays a specific sound regardless of the mute setting — used by the picker's preview. */
export function previewNotificationSound(id: string): void {
  const sound = NOTIFICATION_SOUNDS.find((s) => s.id === id) ?? NOTIFICATION_SOUNDS[0];
  playSound(sound);
}
