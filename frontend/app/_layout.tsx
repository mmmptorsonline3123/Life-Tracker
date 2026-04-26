import React, { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { VoiceProvider, useVoice } from '../src/VoiceContext';
import { ToastProvider, useToast } from '../src/Toast';
import { api } from '../src/api';
import AmbientBar from '../components/AmbientBar';
import { Colors } from '../src/theme';

function ReminderWatcher() {
  const toast = useToast();
  const v = useVoice();
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const list: any[] = await api.listReminders();
        const now = Date.now();
        for (const r of list) {
          if (r.done) continue;
          const t = new Date(r.fire_at).getTime();
          if (!isNaN(t) && t <= now && t > now - 5 * 60 * 1000 && !fired.current.has(r.id)) {
            fired.current.add(r.id);
            toast.show(`⏰ ${r.title}`);
            v.speak(`Reminder: ${r.title}`);
          }
        }
      } catch {}
      if (alive) setTimeout(tick, 20000);
    };
    tick();
    return () => { alive = false; };
  }, [toast, v]);

  return null;
}

function VoiceToastBridge() {
  const t = useToast();
  const v = useVoice();
  useEffect(() => {
    v.setToast((m) => t.show(m));
  }, [t, v]);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
        <ToastProvider>
          <VoiceProvider>
            <VoiceToastBridge />
            <ReminderWatcher />
            <View style={{ flex: 1, backgroundColor: Colors.background }}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: Colors.background },
                  animation: 'slide_from_right',
                }}
              />
              <AmbientBar />
            </View>
            <StatusBar style="dark" />
          </VoiceProvider>
        </ToastProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
