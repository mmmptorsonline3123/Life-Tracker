import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { VoiceProvider, useVoice } from '../src/VoiceContext';
import { ToastProvider, useToast } from '../src/Toast';
import { AuthProvider, useAuth } from '../src/AuthContext';
import { api } from '../src/api';
import AmbientBar from '../components/AmbientBar';
import { Colors } from '../src/theme';

const PUBLIC_PATHS = ['/login', '/auth-callback'];

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const isPublic = PUBLIC_PATHS.includes(path);

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic) router.replace('/login' as any);
  }, [user, loading, isPublic, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }
  if (!user && !isPublic) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }} />
    );
  }
  return <>{children}</>;
}

function ReminderWatcher() {
  const toast = useToast();
  const v = useVoice();
  const { user } = useAuth();
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
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
  }, [toast, v, user]);

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

function ConditionalAmbientBar() {
  const path = usePathname();
  const { user } = useAuth();
  const HIDDEN = ['/settings', '/login', '/auth-callback'];
  if (HIDDEN.includes(path) || !user) return null;
  return <AmbientBar />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
        <ToastProvider>
          <AuthProvider>
            <VoiceProvider>
              <VoiceToastBridge />
              <ReminderWatcher />
              <View style={{ flex: 1, backgroundColor: Colors.background }}>
                <AuthGate>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: Colors.background },
                      animation: 'slide_from_right',
                    }}
                  />
                </AuthGate>
                <ConditionalAmbientBar />
              </View>
              <StatusBar style="dark" />
            </VoiceProvider>
          </AuthProvider>
        </ToastProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
