import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Dumbbell, Briefcase, Coffee, UtensilsCrossed, Soup, BookOpen, Check, Flame } from 'lucide-react-native';
import ScreenContainer from '../components/ScreenContainer';
import { Colors, Radius } from '../src/theme';
import { api } from '../src/api';
import { useVoice } from '../src/VoiceContext';

const ICONS: Record<string, any> = {
  gym: Dumbbell, work_block: Briefcase, breakfast: Coffee,
  lunch: UtensilsCrossed, dinner: Soup, study: BookOpen,
};
const KEYS = ['gym', 'work_block', 'breakfast', 'lunch', 'dinner', 'study'];

export default function HabitsScreen() {
  const v = useVoice();
  const [data, setData] = useState<any>({ state: {}, labels: {}, streak: 0 });

  const load = useCallback(async () => {
    const d = await api.habitsToday();
    setData(d);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { v.setOnDataChange(() => load()); }, [v, load]);

  const done = KEYS.filter((k) => data.state?.[k]).length;
  const pct = Math.round((done / KEYS.length) * 100);

  const toggle = async (k: string) => {
    await api.toggleHabit(k, !data.state?.[k]);
    await load();
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Daily Habits</Text>
        <Text style={styles.sub}>Six rituals that compound</Text>

        <View style={styles.progressCard}>
          <View style={styles.ringWrap}>
            <View style={[styles.ringBg]}>
              <View style={[styles.ringFg, { height: `${pct}%` }]} />
            </View>
            <View style={styles.ringLabel}>
              <Text style={styles.pct}>{pct}%</Text>
              <Text style={styles.pctSub}>{done} of {KEYS.length}</Text>
            </View>
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={styles.cardLabel}>Today</Text>
            <Text style={styles.cardValue}>
              {pct === 100 ? 'Perfect day!' : pct >= 50 ? 'Halfway there' : 'Just getting started'}
            </Text>
            <View style={styles.streakRow}>
              <Flame size={16} color={Colors.terracotta} />
              <Text style={styles.streakText}>{data.streak} day streak</Text>
            </View>
          </View>
        </View>

        <View style={styles.grid}>
          {KEYS.map((k) => {
            const Icon = ICONS[k];
            const active = !!data.state?.[k];
            return (
              <Pressable
                key={k}
                onPress={() => toggle(k)}
                style={[styles.card, active && styles.cardActive]}
                testID={`habit-${k}`}
              >
                <View style={styles.cardTop}>
                  <Icon size={22} color={active ? '#F9F9F6' : Colors.primary} />
                  <View style={[styles.check, active && { backgroundColor: '#F9F9F6', borderColor: '#F9F9F6' }]}>
                    {active && <Check size={14} color={Colors.primary} strokeWidth={3} />}
                  </View>
                </View>
                <Text style={[styles.title, active && { color: '#F9F9F6' }]}>{data.labels?.[k] || k}</Text>
                <Text style={[styles.meta, active && { color: '#F9F9F6', opacity: 0.7 }]}>
                  {active ? 'Done' : 'Tap to mark'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 32, fontWeight: '600', color: Colors.textPrimary, letterSpacing: -1 },
  sub: { fontSize: 14, color: Colors.textSecondary, marginTop: 4, marginBottom: 22 },
  progressCard: {
    flexDirection: 'row', alignItems: 'center', gap: 18,
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    padding: 22, borderWidth: 1, borderColor: Colors.border, marginBottom: 22,
  },
  ringWrap: { width: 90, height: 90, alignItems: 'center', justifyContent: 'center' },
  ringBg: {
    width: 90, height: 90, borderRadius: 9999,
    backgroundColor: Colors.surface2, overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  ringFg: { width: '100%', backgroundColor: Colors.primary },
  ringLabel: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  pct: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  pctSub: { fontSize: 10, color: Colors.textSecondary },
  cardLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  cardValue: { fontSize: 18, color: Colors.textPrimary, fontWeight: '600' },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  streakText: { fontSize: 13, color: Colors.terracotta, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '47.5%', backgroundColor: Colors.surface,
    borderRadius: Radius.card, padding: 18,
    borderWidth: 1, borderColor: Colors.border, minHeight: 120,
  },
  cardActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  check: {
    width: 26, height: 26, borderRadius: 9999,
    borderWidth: 1.8, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  meta: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
});
