import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Volume2, Sparkles, LogOut, User } from 'lucide-react-native';
import { Colors, Radius } from '../src/theme';
import { useVoice } from '../src/VoiceContext';
import { useAuth } from '../src/AuthContext';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const v = useVoice();
  const { user, signOut } = useAuth();
  const [previewing, setPreviewing] = useState<string | null>(null);

  const englishVoices = (v.voices || []).filter((vc) =>
    (vc.language || '').toLowerCase().startsWith('en')
  );

  const previewVoice = async (id: string) => {
    setPreviewing(id);
    await v.setVoiceId(id);
    v.speak('Hi, I am Aura. This is how I sound.');
    setTimeout(() => setPreviewing(null), 2500);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="settings-back">
          <ArrowLeft size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {/* Account */}
        {user && (
          <>
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={styles.card} testID="account-card">
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <User size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{user.name || 'Signed in'}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{user.email}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={async () => {
                  await signOut();
                  router.replace('/login' as any);
                }}
                style={styles.logoutBtn}
                testID="logout-btn"
              >
                <LogOut size={16} color={Colors.terracotta} />
                <Text style={styles.logoutText}>Sign out</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Wake word */}
        <Text style={styles.sectionLabel}>Wake word</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Sparkles size={20} color={Colors.terracotta} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.rowTitle}>"Hey Aura" activation</Text>
              <Text style={styles.rowSub}>
                Listen continuously and only respond when you say "Hey Aura". Say "turn off voice" to stop.
              </Text>
            </View>
            <Switch
              value={v.wakeMode}
              onValueChange={(on) => v.setWakeMode(on)}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#fff"
              testID="wake-mode-switch"
            />
          </View>
          {v.wakeMode && (
            <View style={styles.tipBox}>
              <Text style={styles.tipText}>
                💡 Try: "Hey Aura, add task call doctor" · "Hey Aura, what did I spend today?"
              </Text>
            </View>
          )}
        </View>

        {/* TTS toggle */}
        <Text style={styles.sectionLabel}>Speech</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Volume2 size={20} color={Colors.primary} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.rowTitle}>Spoken responses</Text>
              <Text style={styles.rowSub}>Aura speaks back every confirmation.</Text>
            </View>
            <Switch
              value={v.ttsEnabled}
              onValueChange={() => v.toggleTTS()}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#fff"
              testID="tts-switch"
            />
          </View>
        </View>

        {/* Voice picker */}
        <Text style={styles.sectionLabel}>Assistant voice</Text>
        <Text style={styles.helper}>Tap a voice to preview. Available voices come from your device.</Text>

        <Pressable
          onPress={() => previewVoice('')}
          style={[styles.voiceRow, !v.voiceId && styles.voiceRowActive]}
          testID="voice-default"
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.voiceName, !v.voiceId && { color: '#F9F9F6' }]}>System default</Text>
            <Text style={[styles.voiceMeta, !v.voiceId && { color: '#F9F9F6', opacity: 0.7 }]}>
              Use your phone's default voice
            </Text>
          </View>
          {!v.voiceId && <Check size={18} color="#F9F9F6" strokeWidth={2.5} />}
        </Pressable>

        {englishVoices.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No installed voices found on this device.</Text>
          </View>
        ) : (
          englishVoices.map((vc) => {
            const active = v.voiceId === vc.identifier;
            const previewingNow = previewing === vc.identifier;
            return (
              <Pressable
                key={vc.identifier}
                onPress={() => previewVoice(vc.identifier)}
                style={[styles.voiceRow, active && styles.voiceRowActive]}
                testID={`voice-${vc.identifier}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.voiceName, active && { color: '#F9F9F6' }]}>
                    {vc.name || vc.identifier}
                  </Text>
                  <Text style={[styles.voiceMeta, active && { color: '#F9F9F6', opacity: 0.7 }]}>
                    {(vc.language || '').toUpperCase()}
                    {vc.quality ? ` · ${vc.quality}` : ''}
                    {previewingNow ? ' · playing…' : ''}
                  </Text>
                </View>
                {active && <Check size={18} color="#F9F9F6" strokeWidth={2.5} />}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: Colors.background,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 9999,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  title: { fontSize: 24, fontWeight: '600', color: Colors.textPrimary, letterSpacing: -0.5 },
  sectionLabel: {
    fontSize: 11, color: Colors.textSecondary, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 12, marginBottom: 10,
  },
  helper: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12, marginTop: -4 },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 18,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  rowSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 4, lineHeight: 18 },
  tipBox: {
    marginTop: 14, padding: 12, borderRadius: Radius.input,
    backgroundColor: Colors.surface2,
  },
  tipText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 20 },
  voiceRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 8,
  },
  voiceRowActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  voiceName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  voiceMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  empty: { padding: 20, alignItems: 'center' },
  emptyText: { color: Colors.textSecondary, fontSize: 13 },
  avatar: {
    width: 44, height: 44, borderRadius: 9999,
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center',
  },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 14, paddingVertical: 12, borderRadius: Radius.pill,
    backgroundColor: Colors.surface2,
  },
  logoutText: { color: Colors.terracotta, fontWeight: '600', fontSize: 14 },
});
