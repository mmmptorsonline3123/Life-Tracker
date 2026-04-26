import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View, RefreshControl, TouchableOpacity, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { Flame, Sparkles, CheckSquare, Repeat, IndianRupee, Droplet, Bell, BarChart2 } from 'lucide-react-native';
import ScreenContainer from '../components/ScreenContainer';
import { Colors, Radius } from '../src/theme';
import { api } from '../src/api';
import { useVoice } from '../src/VoiceContext';

const MOODS = ['Great', 'Good', 'Okay', 'Low', 'Stressed'] as const;
const MOOD_EMOJI: Record<string, string> = { Great: '☀', Good: '🙂', Okay: '😐', Low: '🌧', Stressed: '⚡' };

export default function HomeScreen() {
  const v = useVoice();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [now, setNow] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.dashboard();
      setData(d);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    v.setOnDataChange(() => load());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [v, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const setMood = async (mood: string) => {
    await api.setMood(mood);
    await load();
  };

  const hour = now.getHours();
  const greet = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greet} testID="home-greeting">{greet}</Text>
          <Text style={styles.clock} testID="home-clock">{timeStr}</Text>
          <Text style={styles.date}>{dateStr}</Text>
        </View>

        {/* Wake word indicator — only visible when Hey Aura mode is on */}
        {v.wakeMode && (
          <WakeWordIndicator isProcessing={v.isProcessing} isRecording={v.isRecording} />
        )}

        {/* Morning brief card — 7 AM to 12 PM only */}
        <MorningBriefCard speak={v.speak} />

        {/* Streak */}
        <View style={styles.streakRow}>
          <View style={styles.streakCard}>
            <Flame size={20} color={Colors.terracotta} />
            <Text style={styles.streakText} testID="home-streak">
              {data?.streak ?? 0} day{(data?.streak ?? 0) === 1 ? '' : 's'} streak
            </Text>
          </View>
          <TouchableOpacity onPress={() => v.toggleMic()} style={styles.statusBtn} testID="home-status-btn">
            <Sparkles size={16} color="#F9F9F6" />
            <Text style={styles.statusBtnText}>Ask</Text>
          </TouchableOpacity>
        </View>

        {/* Stats grid */}
        <View style={styles.grid}>
          <StatCard
            icon={<CheckSquare size={18} color={Colors.primary} />}
            label="Tasks today"
            value={`${data?.tasks?.done_today ?? 0}/${(data?.tasks?.done_today ?? 0) + (data?.tasks?.pending ?? 0)}`}
            testID="stat-tasks"
          />
          <StatCard
            icon={<Repeat size={18} color={Colors.sage} />}
            label="Habits"
            value={`${data?.habits?.done ?? 0}/${data?.habits?.total ?? 6}`}
            testID="stat-habits"
          />
          <StatCard
            icon={<IndianRupee size={18} color={Colors.terracotta} />}
            label="Spent today"
            value={`₹${(data?.expenses?.total ?? 0).toFixed(0)}`}
            testID="stat-expenses"
          />
          <StatCard
            icon={<Droplet size={18} color="#5B8FB9" />}
            label="Water"
            value={`${data?.health?.water ?? 0}/8`}
            testID="stat-water"
          />
        </View>

        {/* Mood */}
        <Text style={styles.sectionLabel}>How are you feeling?</Text>
        <View style={styles.moodRow}>
          {MOODS.map((m) => {
            const active = data?.mood === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMood(m)}
                style={[styles.moodChip, active && styles.moodChipActive]}
                testID={`mood-${m.toLowerCase()}`}
              >
                <Text style={styles.moodEmoji}>{MOOD_EMOJI[m]}</Text>
                <Text style={[styles.moodLabel, active && styles.moodLabelActive]}>{m}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Next reminder */}
        {data?.next_reminder ? (
          <View style={styles.reminderCard} testID="next-reminder-card">
            <Bell size={18} color="#F9F9F6" />
            <View style={{ flex: 1 }}>
              <Text style={styles.reminderLabel}>Next reminder</Text>
              <Text style={styles.reminderTitle}>{data.next_reminder.title}</Text>
              <Text style={styles.reminderTime}>
                {new Date(data.next_reminder.fire_at).toLocaleString([], {
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.reminderCard, { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }]}>
            <Bell size={18} color={Colors.textSecondary} />
            <Text style={[styles.reminderLabel, { color: Colors.textSecondary }]}>No upcoming reminders</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
        {/* Insights card */}
        <TouchableOpacity
          onPress={() => router.push('/insights' as any)}
          style={styles.insightsCard}
          testID="insights-card"
        >
          <View style={styles.insightsLeft}>
            <BarChart2 size={22} color={Colors.primary} />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.insightsTitle}>View Insights</Text>
              <Text style={styles.insightsSub}>Habits · Expenses · Health trends</Text>
            </View>
          </View>
          <Text style={styles.insightsArrow}>→</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

function StatCard({ icon, label, value, testID }: any) {
  return (
    <View style={styles.statCard} testID={testID}>
      <View style={styles.statIcon}>{icon}</View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

// ── Morning Brief Card ────────────────────────────────────────────────────────
const BRIEF_KEY  = (d: string) => `aura_brief_${d}`;
const DIMISS_KEY = (d: string) => `aura_brief_dismissed_${d}`;

function MorningBriefCard({ speak }: { speak: (t: string) => void }) {
  const today = new Date();
  const hour  = today.getHours();
  const dateStr = today.toISOString().slice(0, 10);

  const [brief, setBrief]         = useState<string | null>(null);
  const [meta, setMeta]           = useState<any>(null);
  const [loading, setLoading]     = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [playing, setPlaying]     = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Only show between 7 AM and 12 PM — but for easy testing also allow override
  const isMorning = hour >= 7 && hour < 12;

  const load = useCallback(async () => {
    // Check dismissed
    const dis = await AsyncStorage.getItem(DIMISS_KEY(dateStr));
    if (dis) { setDismissed(true); return; }

    // Check cached brief
    const cached = await AsyncStorage.getItem(BRIEF_KEY(dateStr));
    if (cached) {
      const d = JSON.parse(cached);
      setBrief(d.brief);
      setMeta(d);
      return;
    }

    // Fetch from backend
    setLoading(true);
    try {
      const d = await api.morningBrief();
      await AsyncStorage.setItem(BRIEF_KEY(dateStr), JSON.stringify(d));
      setBrief(d.brief);
      setMeta(d);
    } catch (e) {
      console.warn('Morning brief error', e);
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => {
    if (isMorning) load();
  }, [isMorning, load]);

  useEffect(() => {
    if (brief && !dismissed) {
      Animated.spring(fadeAnim, { toValue: 1, useNativeDriver: true, damping: 14 }).start();
    }
  }, [brief, dismissed]);

  const dismiss = async () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setDismissed(true));
    await AsyncStorage.setItem(DIMISS_KEY(dateStr), '1');
  };

  const playBrief = () => {
    if (!brief) return;
    setPlaying(true);
    speak(brief);
    setTimeout(() => setPlaying(false), (brief.length / 15) * 1000 + 2000);
  };

  if (!isMorning || dismissed || (!brief && !loading)) return null;

  return (
    <Animated.View style={[styles.briefCard, { opacity: fadeAnim, transform: [{ scaleY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]} testID="morning-brief-card">
      {/* Top row: icon + title + dismiss */}
      <View style={styles.briefHeader}>
        <View style={styles.briefTitleRow}>
          <Text style={styles.briefSunIcon}>☀️</Text>
          <Text style={styles.briefTitle}>Good Morning</Text>
        </View>
        <TouchableOpacity onPress={dismiss} style={styles.briefDismiss} testID="brief-dismiss">
          <Text style={styles.briefDismissText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Brief text */}
      {loading ? (
        <View style={styles.briefLoadingRow}>
          <View style={styles.briefSkeleton} />
          <View style={[styles.briefSkeleton, { width: '70%', marginTop: 6 }]} />
          <View style={[styles.briefSkeleton, { width: '85%', marginTop: 6 }]} />
        </View>
      ) : (
        <Text style={styles.briefText} testID="brief-text">{brief}</Text>
      )}

      {/* Stats chips */}
      {meta && !loading && (
        <View style={styles.briefChips}>
          <BriefChip emoji="🔥" label={`${meta.streak}d streak`} />
          <BriefChip emoji="✅" label={`${meta.tasks_pending} tasks`} />
          <BriefChip emoji="💰" label={`₹${meta.spend_yesterday?.toFixed(0)} spent`} />
          <BriefChip emoji="💪" label={`${meta.habits_done_yesterday}/${meta.habits_total} habits`} />
        </View>
      )}

      {/* Play button */}
      {brief && !loading && (
        <TouchableOpacity onPress={playBrief} style={styles.briefPlay} testID="brief-play">
          <Text style={styles.briefPlayText}>{playing ? '⏸ Playing…' : '▶ Play'}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

function BriefChip({ emoji, label }: { emoji: string; label: string }) {
  return (
    <View style={styles.briefChip}>
      <Text style={styles.briefChipEmoji}>{emoji}</Text>
      <Text style={styles.briefChipLabel}>{label}</Text>
    </View>
  );
}

// ── Wake Word Indicator ────────────────────────────────────────────────────────
function WakeWordIndicator({ isProcessing, isRecording }: { isProcessing: boolean; isRecording: boolean }) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(-12)).current;
  const fade   = useRef(new Animated.Value(0)).current;
  const loop1  = useRef<Animated.CompositeAnimation | null>(null);
  const loop2  = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Slide + fade in on mount
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 14, stiffness: 120 }),
      Animated.timing(fade,   { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();

    // Ring-1: pulse immediately
    loop1.current = Animated.loop(
      Animated.sequence([
        Animated.timing(ring1, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(ring1, { toValue: 0, duration: 0,    useNativeDriver: true }),
      ])
    );
    loop1.current.start();

    // Ring-2: pulse with 750ms offset for stagger
    const t = setTimeout(() => {
      loop2.current = Animated.loop(
        Animated.sequence([
          Animated.timing(ring2, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(ring2, { toValue: 0, duration: 0,    useNativeDriver: true }),
        ])
      );
      loop2.current.start();
    }, 750);

    return () => {
      clearTimeout(t);
      loop1.current?.stop();
      loop2.current?.stop();
    };
  }, []);

  const ring1Style = {
    transform: [{ scale: ring1.interpolate({ inputRange: [0, 1], outputRange: [1, 3] }) }],
    opacity:             ring1.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.45, 0.25, 0] }),
  };
  const ring2Style = {
    transform: [{ scale: ring2.interpolate({ inputRange: [0, 1], outputRange: [1, 3] }) }],
    opacity:             ring2.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.45, 0.25, 0] }),
  };

  const label = isProcessing ? 'Processing…' : isRecording ? 'Recording…' : 'Listening for wake word…';

  return (
    <Animated.View
      style={[styles.wakeWrap, { opacity: fade, transform: [{ translateY: slideY }] }]}
      testID="wake-indicator"
    >
      {/* Pulsing dot */}
      <View style={styles.wakeDotWrap}>
        <Animated.View style={[styles.wakeRing, ring1Style]} />
        <Animated.View style={[styles.wakeRing, ring2Style]} />
        <View style={[styles.wakeDot, isRecording || isProcessing ? styles.wakeDotActive : null]} />
      </View>

      {/* Text */}
      <View style={{ flex: 1 }}>
        <Text style={styles.wakeTitle}>Hey Aura</Text>
        <Text style={styles.wakeSub}>{label}</Text>
      </View>

      {/* Mic wave bars — visible while recording */}
      {isRecording && (
        <View style={styles.waveBars}>
          {[0.5, 1, 0.7, 0.9, 0.4].map((h, i) => (
            <View key={i} style={[styles.waveBar, { height: 14 * h, opacity: 0.6 + i * 0.08 }]} />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20 },
  header: { marginBottom: 24 },
  greet: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  clock: { fontSize: 56, fontWeight: '300', color: Colors.textPrimary, letterSpacing: -2, marginTop: 4 },
  date: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  streakRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  streakCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  streakText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  statusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  statusBtnText: { color: '#F9F9F6', fontWeight: '600', fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    width: '47.5%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statIcon: { marginBottom: 14 },
  statLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  statValue: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginTop: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginTop: 28, marginBottom: 12 },
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.pill,
  },
  moodChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  moodEmoji: { fontSize: 16 },
  moodLabel: { fontSize: 13, color: Colors.textPrimary, fontWeight: '500' },
  moodLabelActive: { color: '#F9F9F6' },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.primary,
    borderRadius: Radius.card,
    padding: 20,
    marginTop: 24,
  },
  reminderLabel: { color: '#F9F9F6', opacity: 0.7, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  reminderTitle: { color: '#F9F9F6', fontSize: 18, fontWeight: '600', marginTop: 2 },
  reminderTime: { color: '#F9F9F6', opacity: 0.8, fontSize: 13, marginTop: 4 },
  insightsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    padding: 18,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  insightsLeft: { flexDirection: 'row', alignItems: 'center' },
  insightsTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  insightsSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  insightsArrow: { fontSize: 18, color: Colors.primary, fontWeight: '600' },
  // ── Morning Brief Card styles ─────────────────────────────────────────────────
  briefCard: {
    backgroundColor: '#FFFBF0',
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: '#F0D89A',
    padding: 18,
    marginBottom: 16,
    overflow: 'hidden',
  },
  briefHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  briefTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  briefSunIcon: { fontSize: 20 },
  briefTitle: { fontSize: 16, fontWeight: '700', color: '#7A5200' },
  briefDismiss: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  briefDismissText: { fontSize: 14, color: Colors.textSecondary },
  briefText: { fontSize: 14, lineHeight: 22, color: Colors.textPrimary, marginBottom: 14 },
  briefLoadingRow: { marginBottom: 14 },
  briefSkeleton: {
    height: 12, borderRadius: 6, backgroundColor: '#F0D89A',
    width: '100%', opacity: 0.5,
  },
  briefChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  briefChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFF3CC', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#F0D89A',
  },
  briefChipEmoji: { fontSize: 12 },
  briefChipLabel: { fontSize: 11, fontWeight: '600', color: '#7A5200' },
  briefPlay: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary, borderRadius: Radius.pill,
    paddingHorizontal: 18, paddingVertical: 8,
  },
  briefPlayText: { fontSize: 13, fontWeight: '700', color: '#F9F9F6' },
  // ── Wake Word Indicator styles ─────────────────────────────────────────────
  wakeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#E9F2EC',
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: '#BCD5C5',
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 16,
    overflow: 'hidden',
  },
  wakeDotWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wakeRing: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
  },
  wakeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
  },
  wakeDotActive: {
    backgroundColor: Colors.terracotta,
  },
  wakeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  wakeSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  waveBars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: Colors.success,
  },
});
