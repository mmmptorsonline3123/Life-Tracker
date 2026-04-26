import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import {
  useAudioRecorder,
  useAudioRecorderState,
  setAudioModeAsync,
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
} from 'expo-audio';
import { useRouter } from 'expo-router';
import { api } from './api';
import { parseCommand } from './voice';

type ToastFn = (msg: string) => void;

const SETTINGS_KEY = 'aura_settings_v1';
const WAKE_WORDS = ['hey aura', 'hi aura', 'okay aura', 'ok aura', 'hey ora', 'hey aurora'];

// OpenAI TTS voices (high quality, natural)
export const TTS_VOICES = [
  { id: 'nova', name: 'Nova', desc: 'Energetic, upbeat' },
  { id: 'shimmer', name: 'Shimmer', desc: 'Bright, cheerful' },
  { id: 'coral', name: 'Coral', desc: 'Warm, friendly' },
  { id: 'sage', name: 'Sage', desc: 'Wise, measured' },
  { id: 'alloy', name: 'Alloy', desc: 'Neutral, balanced' },
  { id: 'echo', name: 'Echo', desc: 'Smooth, calm' },
  { id: 'fable', name: 'Fable', desc: 'Expressive, storytelling' },
  { id: 'onyx', name: 'Onyx', desc: 'Deep, authoritative' },
  { id: 'ash', name: 'Ash', desc: 'Clear, articulate' },
];

function stripWakeWord(text: string): string | null {
  const lower = (text || '').toLowerCase().trim();
  for (const w of WAKE_WORDS) {
    const idx = lower.indexOf(w);
    if (idx !== -1) {
      return lower.slice(idx + w.length).replace(/^[\s,.:;!?]+/, '').trim();
    }
  }
  return null;
}

type VoiceCtx = {
  isRecording: boolean;
  isProcessing: boolean;
  handsFree: boolean;
  ttsEnabled: boolean;
  transcript: string;
  lastReply: string;
  voiceId: string;
  wakeMode: boolean;
  setVoiceId: (id: string) => Promise<void>;
  setWakeMode: (on: boolean) => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleHandsFree: () => Promise<void>;
  toggleTTS: () => void;
  speak: (text: string) => void;
  previewVoice: (id: string) => void;
  setToast: (fn: ToastFn) => void;
  setOnDataChange: (fn: () => void) => void;
};

const Ctx = createContext<VoiceCtx | null>(null);
export const useVoice = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useVoice outside provider');
  return v;
};

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder);

  const [permGranted, setPermGranted] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [voiceId, setVoiceIdState] = useState<string>('nova');
  const [wakeMode, setWakeModeState] = useState(false);

  const handsFreeRef = useRef(false);
  const wakeModeRef = useRef(false);
  const isProcessingRef = useRef(false);
  const recordStartRef = useRef<number>(0);
  const toastRef = useRef<ToastFn>(() => {});
  const dataChangeRef = useRef<() => void>(() => {});
  const voiceIdRef = useRef<string>('nova');
  const playerRef = useRef<any>(null);
  const audioElRef = useRef<any>(null);
  const startRecordingRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Load settings
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s.voiceId) {
            setVoiceIdState(s.voiceId);
            voiceIdRef.current = s.voiceId;
          }
          if (typeof s.wakeMode === 'boolean') {
            setWakeModeState(s.wakeMode);
            wakeModeRef.current = s.wakeMode;
          }
          if (typeof s.ttsEnabled === 'boolean') setTtsEnabled(s.ttsEnabled);
        }
      } catch {}
    })();
  }, []);

  // Audio permission
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'web') {
          setPermGranted(true);
          return;
        }
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (status.granted) {
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
          setPermGranted(true);
        } else {
          toastRef.current('Microphone permission denied');
        }
      } catch (e) {
        console.warn('Audio permission error', e);
      }
    })();
  }, []);

  const persist = useCallback(async (patch: any) => {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      const cur = raw ? JSON.parse(raw) : {};
      const next = { ...cur, ...patch };
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const playAudioBase64 = useCallback(async (b64: string) => {
    if (!b64) return;
    try {
      if (Platform.OS === 'web') {
        // Web: use HTML Audio element with data URI
        if (audioElRef.current) {
          try { audioElRef.current.pause(); } catch {}
        }
        const audio = new (globalThis as any).Audio(`data:audio/mp3;base64,${b64}`);
        audioElRef.current = audio;
        await audio.play();
      } else {
        // Native: write to file then play with expo-audio
        const path = `${FileSystem.cacheDirectory}aura_tts_${Date.now()}.mp3`;
        await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
        if (playerRef.current) {
          try { playerRef.current.remove?.(); } catch {}
        }
        const player = createAudioPlayer({ uri: path });
        playerRef.current = player;
        player.play();
        // Reset audio session to recording mode after playback finishes
        // so the next mic tap works correctly on iOS
        player.addListener('playingChange', (evt: any) => {
          if (evt?.isPlaying === false) {
            setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => {});
          }
        });
      }
    } catch (e) {
      console.warn('Audio play error', e);
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!ttsEnabled || !text) return;
      // Stop any ongoing playback first
      try {
        Speech.stop();
        if (playerRef.current) { try { playerRef.current.pause?.(); } catch {} }
        if (audioElRef.current) { try { audioElRef.current.pause(); } catch {} }
      } catch {}
      // Try OpenAI TTS via API (high quality, human-like)
      api.tts(text, voiceIdRef.current)
        .then((r: any) => {
          if (r?.audio_b64) {
            playAudioBase64(r.audio_b64);
          } else {
            // fallback to on-device
            Speech.speak(text, { rate: 1.0, pitch: 1.0, language: 'en-US' });
          }
        })
        .catch(() => {
          // Network/auth failure → fallback to on-device TTS
          try { Speech.speak(text, { rate: 1.0, pitch: 1.0, language: 'en-US' }); } catch {}
        });
    },
    [ttsEnabled, playAudioBase64]
  );

  const previewVoice = useCallback(
    (id: string) => {
      // Temporarily override voice for preview
      const prev = voiceIdRef.current;
      voiceIdRef.current = id;
      api.tts('Hi, I am Aura. This is how I sound.', id)
        .then((r: any) => {
          if (r?.audio_b64) playAudioBase64(r.audio_b64);
        })
        .catch(() => {})
        .finally(() => {
          voiceIdRef.current = prev;
        });
    },
    [playAudioBase64]
  );

  const setVoiceId = useCallback(
    async (id: string) => {
      voiceIdRef.current = id;
      setVoiceIdState(id);
      await persist({ voiceId: id });
    },
    [persist]
  );

  const setWakeMode = useCallback(
    async (on: boolean) => {
      wakeModeRef.current = on;
      setWakeModeState(on);
      await persist({ wakeMode: on });
      if (on && !handsFreeRef.current) {
        handsFreeRef.current = true;
        setHandsFree(true);
        try { await startRecordingInternal(); } catch {}
      }
    },
    [persist]
  );

  const setToast = useCallback((fn: ToastFn) => { toastRef.current = fn; }, []);
  const setOnDataChange = useCallback((fn: () => void) => { dataChangeRef.current = fn; }, []);

  // P1: AppState listener — resume wake-word listening when app returns to foreground
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && wakeModeRef.current && !isProcessingRef.current) {
        // App back to foreground — restart listening after short stabilisation delay
        setTimeout(() => {
          if (wakeModeRef.current && !isProcessingRef.current) {
            startRecordingRef.current().catch(() => {});
          }
        }, 1200);
      } else if ((nextState === 'background' || nextState === 'inactive') && Platform.OS === 'ios') {
        // iOS stops background audio — stop cleanly to avoid zombie recording
        if (recState.isRecording) {
          recorder.stop().catch(() => {});
        }
      }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, recState.isRecording]);

  const handleParsed = useCallback(
    async (raw: string, fromWake = false) => {
      const cmd = parseCommand(raw);
      let resultMsg = '';
      try {
        switch (cmd.type) {
          case 'navigate':
            router.push(cmd.screen as any);
            resultMsg = `Opening ${cmd.screen.replace('/', '') || 'home'}`;
            break;
          case 'add_task':
            await api.createTask(cmd.title, cmd.priority);
            resultMsg = `Added ${cmd.priority} priority task: ${cmd.title}`;
            break;
          case 'mark_habit':
            await api.toggleHabit(cmd.key, true);
            resultMsg = `Marked ${cmd.key.replace('_', ' ')} done`;
            break;
          case 'log_water':
            await api.healthAction('water_inc');
            resultMsg = 'Logged a glass of water';
            break;
          case 'log_water_dec':
            await api.healthAction('water_dec');
            resultMsg = 'Removed a glass of water';
            break;
          case 'add_calories':
            await api.healthAction('calorie_add', cmd.value);
            resultMsg = `Added ${cmd.value} calories`;
            break;
          case 'sub_calories':
            await api.healthAction('calorie_sub', cmd.value);
            resultMsg = `Subtracted ${cmd.value} calories`;
            break;
          case 'workout_done':
            await api.healthAction('workout_toggle');
            resultMsg = 'Workout marked done';
            break;
          case 'add_expense':
            await api.createExpense(cmd.description, cmd.amount, cmd.category, cmd.payment);
            resultMsg = `Logged ₹${cmd.amount} ${cmd.category} via ${cmd.payment}`;
            break;
          case 'set_mood':
            await api.setMood(cmd.mood);
            resultMsg = `Mood set to ${cmd.mood}`;
            break;
          case 'add_reminder':
            await api.createReminder(cmd.title, cmd.fireAt, cmd.repeat);
            resultMsg = `Reminder set: ${cmd.title}`;
            break;
          case 'add_journal':
            await api.createJournal(cmd.text);
            resultMsg = 'Journal entry saved';
            break;
          case 'status': {
            const d: any = await api.dashboard();
            resultMsg =
              `Today: ${d.tasks.done_today} of ${d.tasks.done_today + d.tasks.pending} tasks done. ` +
              `${d.habits.done} of ${d.habits.total} habits. ` +
              `Spent ₹${d.expenses.total}. ` +
              `${d.health.water} of 8 water glasses. ` +
              `Streak ${d.streak} day${d.streak === 1 ? '' : 's'}.`;
            break;
          }
          case 'turn_off_voice':
            handsFreeRef.current = false;
            wakeModeRef.current = false;
            setHandsFree(false);
            setWakeModeState(false);
            await persist({ wakeMode: false });
            resultMsg = 'Hands-free off';
            break;
          case 'memory_query': {
            const r: any = await api.chat(cmd.question);
            resultMsg = r.reply || '...';
            break;
          }
          case 'unknown':
          default: {
            if ((handsFreeRef.current || fromWake) && raw.trim().length > 2) {
              const r: any = await api.chat(raw);
              resultMsg = r.reply || '...';
            } else {
              resultMsg = `Sorry, I didn't catch that.`;
            }
            break;
          }
        }
      } catch (e: any) {
        resultMsg = `Error: ${e.message || 'failed'}`;
      }
      setLastReply(resultMsg);
      toastRef.current(resultMsg);
      speak(resultMsg);
      try { dataChangeRef.current(); } catch {}
    },
    [router, speak, persist]
  );

  const startRecordingInternal = useCallback(async () => {
    if (!permGranted && Platform.OS !== 'web') {
      toastRef.current('Microphone permission required');
      return;
    }
    if (recState.isRecording) return;
    try {
      // Re-configure audio session for recording on every attempt.
      // This is critical on iOS: after TTS playback the session drifts to
      // playback mode, causing the next recording to capture silence.
      if (Platform.OS !== 'web') {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      }
      await recorder.prepareToRecordAsync();
      await recorder.record();
      recordStartRef.current = Date.now();
      setTranscript('');
    } catch (e: any) {
      toastRef.current(`Mic error: ${e?.message || 'cannot start'}`);
    }
  }, [permGranted, recorder, recState.isRecording]);

  const stopRecording = useCallback(async () => {
    if (isProcessingRef.current) return;
    try {
      if (!recState.isRecording) return;
      const recordedMs = Date.now() - (recordStartRef.current || Date.now());
      await recorder.stop();
      // Increase wait — iOS needs time to finalise and flush the M4A container.
      // 150ms was too short; 400ms is safe on all devices.
      await new Promise((r) => setTimeout(r, 400));
      const uri = recorder.uri;

      if (recordedMs < 500) {
        toastRef.current('Recording too short');
        if (handsFreeRef.current) {
          setTimeout(() => { startRecordingInternal().catch(() => {}); }, 400);
        }
        return;
      }
      if (!uri) {
        toastRef.current('No audio captured');
        return;
      }

      isProcessingRef.current = true;
      setIsProcessing(true);
      const r = await api.transcribe(uri);
      const text = (r.text || '').trim();
      setTranscript(text);

      if (!text) {
        if (!handsFreeRef.current) toastRef.current("I didn't hear anything");
      } else if (wakeModeRef.current) {
        const after = stripWakeWord(text);
        if (after !== null) {
          if (after) {
            await handleParsed(after, true);
          } else {
            const greeting = 'Yes? How can I help?';
            setLastReply(greeting);
            toastRef.current(greeting);
            speak(greeting);
          }
        }
      } else {
        await handleParsed(text);
      }
    } catch (e: any) {
      toastRef.current(`Voice error: ${(e?.message || 'failed').slice(0, 80)}`);
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      if (handsFreeRef.current) {
        setTimeout(() => { startRecordingInternal().catch(() => {}); }, 600);
      }
    }
  }, [recorder, recState.isRecording, handleParsed, speak, startRecordingInternal]);

  const startRecording = startRecordingInternal;
  // Keep ref in sync so AppState listener can call it without stale closure
  startRecordingRef.current = startRecordingInternal;

  const toggleMic = useCallback(async () => {
    if (recState.isRecording) await stopRecording();
    else await startRecording();
  }, [recState.isRecording, startRecording, stopRecording]);

  const toggleHandsFree = useCallback(async () => {
    const next = !handsFreeRef.current;
    handsFreeRef.current = next;
    setHandsFree(next);
    if (next) {
      await startRecording();
      speak(wakeModeRef.current ? 'Wake mode on. Say hey Aura to start.' : 'Hands-free on. I am listening.');
    } else {
      if (recState.isRecording) await stopRecording();
      speak('Hands-free off.');
    }
  }, [recState.isRecording, startRecording, stopRecording, speak]);

  const toggleTTS = useCallback(() => {
    setTtsEnabled((p) => {
      const next = !p;
      if (p) {
        try { Speech.stop(); } catch {}
        if (playerRef.current) { try { playerRef.current.pause?.(); } catch {} }
        if (audioElRef.current) { try { audioElRef.current.pause(); } catch {} }
      }
      persist({ ttsEnabled: next });
      return next;
    });
  }, [persist]);

  const value: VoiceCtx = {
    isRecording: recState.isRecording,
    isProcessing,
    handsFree,
    ttsEnabled,
    transcript,
    lastReply,
    voiceId,
    wakeMode,
    setVoiceId,
    setWakeMode,
    startRecording,
    stopRecording,
    toggleMic,
    toggleHandsFree,
    toggleTTS,
    speak,
    previewVoice,
    setToast,
    setOnDataChange,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
