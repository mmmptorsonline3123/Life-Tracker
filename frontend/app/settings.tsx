import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Volume2, Sparkles, LogOut, User } from 'lucide-react-native';
import { Colors, Radius } from '../src/theme';
import { useVoice, TTS_VOICES } from '../src/VoiceContext';
import { useAuth } from '../src/AuthContext';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const v = useVoice();
  const { user, signOut } = useAuth();
  const [previewing, setPreviewing] = useState<string | null>(null);

  const previewVoice = (id: string) => {
    setPreviewing(id);
    v.previewVoice(id);
    setTimeout(() => setPreviewing(null), 3000);
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
              <Text style={styles.rowSub}>Aura speaks back every confirmation in a natural voice.</Text>
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

        {/* Voice picker — OpenAI voices */}
        <Text style={styles.sectionLabel}>Assistant voice</Text>
        <Text style={styles.helper}>Tap to preview. Powered by OpenAI's natural-sounding voices.</Text>

        {TTS_VOICES.map((vc) => {
          const active = v.voiceId === vc.id;
          const previewingNow = previewing === vc.id;
          return (
            <Pressable
              key={vc.id}
              onPress={async () => {
                await v.setVoiceId(vc.id);
                previewVoice(vc.id);
              }}
              style={[styles.voiceRow, active && styles.voiceRowActive]}
              testID={`voice-${vc.id}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.voiceName, active && { color: '#F9F9F6' }]}>
                  {vc.name}
                </Text>
                <Text style={[styles.voiceMeta, active && { color: '#F9F9F6', opacity: 0.7 }]}>
                  {vc.desc}{previewingNow ? ' · playing…' : ''}
                </Text>
              </View>
              {active && <Check size={18} color="#F9F9F6" strokeWidth={2.5} />}
            </Pressable>
          );
        })}
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
