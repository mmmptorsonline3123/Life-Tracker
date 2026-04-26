import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View, RefreshControl, TouchableOpacity, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Flame, Sparkles, CheckSquare, Repeat, IndianRupee, Droplet, Bell } from 'lucide-react-native';
import ScreenContainer from '../components/ScreenContainer';
import { Colors, Radius } from '../src/theme';
import { api } from '../src/api';
import { useVoice } from '../src/VoiceContext';

const MOODS = ['Great', 'Good', 'Okay', 'Low', 'Stressed'] as const;
const MOOD_EMOJI: Record<string, string> = { Great: '☀', Good: '🙂', Okay: '😐', Low: '🌧', Stressed: '⚡' };

export default function HomeScreen() {
  const v = useVoice();
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
});
