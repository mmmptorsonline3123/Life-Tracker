import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
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

type VoiceCtx = {
  isRecording: boolean;
  isProcessing: boolean;
  handsFree: boolean;
  ttsEnabled: boolean;
  transcript: string;
  lastReply: string;
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
  const handsFreeRef = useRef(false);
  const isProcessingRef = useRef(false);
  const toastRef = useRef<ToastFn>(() => {});
  const dataChangeRef = useRef<() => void>(() => {});

  // Request permission once
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'web') {
          setPermGranted(true);
          return;
        }
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (status.granted) {
          await setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
          });
          setPermGranted(true);
        }
      } catch (e) {
        console.warn('Audio permission error', e);
      }
    })();
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!ttsEnabled || !text) return;
      try {
        Speech.stop();
        Speech.speak(text, { rate: 1.0, pitch: 1.0, language: 'en-US' });
      } catch {}
    },
    [ttsEnabled]
  );

  const setToast = useCallback((fn: ToastFn) => {
    toastRef.current = fn;
  }, []);
  const setOnDataChange = useCallback((fn: () => void) => {
    dataChangeRef.current = fn;
  }, []);

  const handleParsed = useCallback(
    async (raw: string) => {
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
            setHandsFree(false);
            resultMsg = 'Hands-free off';
            break;
          case 'memory_query': {
            const r: any = await api.chat(cmd.question);
            resultMsg = r.reply || '...';
            break;
          }
          case 'unknown':
          default: {
            // Treat as memory query if hands-free is on
            if (handsFreeRef.current && raw.trim().length > 2) {
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
    [router, speak]
  );

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
      if (text) await handleParsed(text);
    } catch (e) {
      console.warn('stop/transcribe error', e);
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      // hands-free: auto-restart
      if (handsFreeRef.current) {
        setTimeout(() => {
          startRecordingInternal().catch(() => {});
        }, 600);
      }
    }
  }, [recorder, recState.isRecording, handleParsed]);

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
      speak('Hands-free on. I am listening.');
    } else {
      if (recState.isRecording) await stopRecording();
      speak('Hands-free off.');
    }
  }, [recState.isRecording, startRecording, stopRecording, speak]);

  const toggleTTS = useCallback(() => {
    setTtsEnabled((p) => {
      if (p) Speech.stop();
      return !p;
    });
  }, []);

  const value: VoiceCtx = {
    isRecording: recState.isRecording,
    isProcessing,
    handsFree,
    ttsEnabled,
    transcript,
    lastReply,
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
