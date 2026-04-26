import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../src/theme';
import { useAuth } from '../src/AuthContext';
import { api } from '../src/api';

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const router = useRouter();
  const { setSessionToken } = useAuth();
  const handled = useRef(false);
  const [status, setStatus] = useState('Finishing sign in…');

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    (async () => {
      try {
        let sessionId: string | null = null;
        if (typeof window !== 'undefined') {
          const fragment = window.location.hash?.replace(/^#/, '') || '';
          const params = new URLSearchParams(fragment);
          sessionId = params.get('session_id');
        }
        if (!sessionId) {
          setStatus('No session. Redirecting…');
          setTimeout(() => router.replace('/login' as any), 600);
          return;
        }
        const r: any = await api.exchangeSession(sessionId);
        await setSessionToken(r.session_token, r.user);
        setStatus('Welcome back!');
        setTimeout(() => router.replace('/' as any), 200);
      } catch (e: any) {
        setStatus(`Sign in failed: ${e?.message || 'try again'}`);
        setTimeout(() => router.replace('/login' as any), 1200);
      }
    })();
  }, [router, setSessionToken]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={Colors.primary} size="large" />
      <Text style={styles.text}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: 16 },
  text: { fontSize: 14, color: Colors.textSecondary },
});
