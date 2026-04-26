import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useAudioRecorder,
  useAudioRecorderState,
  setAudioModeAsync,
  AudioModule,
  RecordingPresets,
} from 'expo-audio';
import { useRouter } from 'expo-router';
import { api } from './api';
import { parseCommand } from './voice';

type ToastFn = (msg: string) => void;
type Voice = Speech.Voice;

const SETTINGS_KEY = 'aura_settings_v1';
const WAKE_WORDS = ['hey aura', 'hi aura', 'okay aura', 'ok aura', 'hey ora', 'hey aurora'];

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
  // settings
  voices: Voice[];
  voiceId: string | null;
  wakeMode: boolean;
  setVoiceId: (id: string | null) => Promise<void>;
  setWakeMode: (on: boolean) => Promise<void>;
  // actions
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleHandsFree: () => Promise<void>;
  toggleTTS: () => void;
  speak: (text: string) => void;
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

  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceIdState] = useState<string | null>(null);
  const [wakeMode, setWakeModeState] = useState(false);

  const handsFreeRef = useRef(false);
  const wakeModeRef = useRef(false);
  const isProcessingRef = useRef(false);
  const toastRef = useRef<ToastFn>(() => {});
  const dataChangeRef = useRef<() => void>(() => {});
  const voiceIdRef = useRef<string | null>(null);

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

  // Load available TTS voices
  useEffect(() => {
    (async () => {
      try {
        const list = await Speech.getAvailableVoicesAsync();
        setVoices(list || []);
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

  const speak = useCallback(
    (text: string) => {
      if (!ttsEnabled || !text) return;
      try {
        Speech.stop();
        Speech.speak(text, {
          rate: 1.0,
          pitch: 1.0,
          language: 'en-US',
          voice: voiceIdRef.current || undefined,
        });
      } catch {}
    },
    [ttsEnabled]
  );

  const setVoiceId = useCallback(
    async (id: string | null) => {
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
      // turning wake mode on should auto-start hands-free listening
      if (on && !handsFreeRef.current) {
        handsFreeRef.current = true;
        setHandsFree(true);
        await startRecordingInternal();
      }
    },
    [persist]
  );

  const setToast = useCallback((fn: ToastFn) => { toastRef.current = fn; }, []);
  const setOnDataChange = useCallback((fn: () => void) => { dataChangeRef.current = fn; }, []);

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
    if (!permGranted) {
      toastRef.current('Microphone permission required');
      return;
    }
    if (recState.isRecording) return;
    try {
      await recorder.prepareToRecordAsync();
      await recorder.record();
      setTranscript('');
    } catch (e) {
      console.warn('start recording error', e);
    }
  }, [permGranted, recorder, recState.isRecording]);

  const stopRecording = useCallback(async () => {
    if (isProcessingRef.current) return;
    try {
      if (!recState.isRecording) return;
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return;
      isProcessingRef.current = true;
      setIsProcessing(true);
      const r = await api.transcribe(uri);
      const text = (r.text || '').trim();
      setTranscript(text);

      if (!text) {
        // empty transcript — keep silent
      } else if (wakeModeRef.current) {
        const after = stripWakeWord(text);
        if (after !== null) {
          // Wake word detected — process the rest
          if (after) {
            await handleParsed(after, true);
          } else {
            // just "hey aura" with nothing after — acknowledge
            const greeting = 'Yes? How can I help?';
            setLastReply(greeting);
            toastRef.current(greeting);
            speak(greeting);
          }
        }
        // else: ignore (no wake word, stay listening silently)
      } else {
        await handleParsed(text);
      }
    } catch (e) {
      console.warn('stop/transcribe error', e);
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      if (handsFreeRef.current) {
        setTimeout(() => { startRecordingInternal().catch(() => {}); }, 600);
      }
    }
  }, [recorder, recState.isRecording, handleParsed, speak]);

  const startRecording = startRecordingInternal;

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
      if (p) Speech.stop();
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
    voices,
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
    setToast,
    setOnDataChange,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
