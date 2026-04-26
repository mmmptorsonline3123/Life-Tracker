import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { Colors, Radius } from '../src/theme';
import { useAuth } from '../src/AuthContext';
import { api } from '../src/api';

const AUTH_HOST = 'https://auth.emergentagent.com';

export default function LoginScreen() {
  const router = useRouter();
  const { user, loading, setSessionToken } = useAuth();
  const [authing, setAuthing] = useState(false);

  // If already logged in, kick to home
  useEffect(() => {
    if (!loading && user) router.replace('/' as any);
  }, [user, loading, router]);

  const continueWithGoogle = async () => {
    if (Platform.OS === 'web') {
      // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
      const redirectUrl = window.location.origin + '/auth-callback';
      window.location.href = `${AUTH_HOST}/?redirect=${encodeURIComponent(redirectUrl)}`;
      return;
    }
    // Native: use expo-web-browser auth session
    setAuthing(true);
    try {
      const base = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const redirectUrl = `${base}/auth-callback`;
      const authUrl = `${AUTH_HOST}/?redirect=${encodeURIComponent(redirectUrl)}`;
      const result: any = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result?.type === 'success' && typeof result.url === 'string') {
        const hashIdx = result.url.indexOf('#');
        const fragment = hashIdx >= 0 ? result.url.slice(hashIdx + 1) : '';
        const params = new URLSearchParams(fragment);
        const sid = params.get('session_id');
        if (sid) {
          const r: any = await api.exchangeSession(sid);
          await setSessionToken(r.session_token, r.user);
          router.replace('/' as any);
        }
      }
    } finally {
      setAuthing(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.badge}>
          <Sparkles size={20} color={Colors.terracotta} />
        </View>
        <Text style={styles.brand}>Aura</Text>
        <Text style={styles.tagline}>Your second brain — synced everywhere.</Text>
      </View>

      <View style={styles.featureCol}>
        <FeatureLine label="Track tasks, habits, expenses, mood" />
        <FeatureLine label="Ask anything — Aura remembers" />
        <FeatureLine label="Pick up where you left off on any device" />
      </View>

      <Pressable
        onPress={continueWithGoogle}
        style={({ pressed }) => [styles.gBtn, pressed && { opacity: 0.85 }]}
        testID="google-signin-btn"
        disabled={authing}
      >
        <View style={styles.gIcon}>
          <Text style={{ fontWeight: '800', color: '#1A362D' }}>G</Text>
        </View>
        <Text style={styles.gBtnText}>
          {authing ? 'Connecting…' : 'Continue with Google'}
        </Text>
      </Pressable>

      <Text style={styles.fine}>
        By continuing, you agree to sync your data securely under your Google account.
      </Text>
    </View>
  );
}

function FeatureLine({ label }: { label: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureDot} />
      <Text style={styles.featureText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 28, justifyContent: 'space-between' },
  hero: { marginTop: 80, gap: 14 },
  badge: {
    width: 48, height: 48, borderRadius: 9999,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface2,
  },
  brand: { fontSize: 56, fontWeight: '300', color: Colors.textPrimary, letterSpacing: -2 },
  tagline: { fontSize: 18, color: Colors.textSecondary, lineHeight: 26, maxWidth: 320 },
  featureCol: { gap: 14, marginVertical: 20 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureDot: { width: 6, height: 6, borderRadius: 9999, backgroundColor: Colors.terracotta },
  featureText: { fontSize: 14, color: Colors.textPrimary },
  gBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: Colors.primary, paddingVertical: 18, borderRadius: Radius.pill,
  },
  gIcon: { width: 26, height: 26, borderRadius: 9999, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  gBtnText: { color: '#F9F9F6', fontWeight: '600', fontSize: 16 },
  fine: { fontSize: 11, color: Colors.textTertiary, textAlign: 'center', marginTop: 14, marginBottom: 8 },
});
