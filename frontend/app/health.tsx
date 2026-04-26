import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Droplet, Flame, Dumbbell, Plus, Minus } from 'lucide-react-native';
import ScreenContainer from '../components/ScreenContainer';
import { Colors, Radius } from '../src/theme';
import { api } from '../src/api';
import { useVoice } from '../src/VoiceContext';

export default function HealthScreen() {
  const v = useVoice();
  const [data, setData] = useState<any>({ water: 0, calories: 0, workout: false });
  const calorieGoal = 2200;

  const load = useCallback(async () => {
    const d = await api.healthToday();
    setData(d);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { v.setOnDataChange(() => load()); }, [v, load]);

  const act = async (a: string, value?: number) => {
    const d = await api.healthAction(a, value);
    setData(d);
  };

  const water = data.water || 0;
  const calPct = Math.min(100, (data.calories / calorieGoal) * 100);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Health</Text>
        <Text style={styles.sub}>Small choices, big difference</Text>

        {/* Water */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Droplet size={22} color="#5B8FB9" />
              <Text style={styles.cardTitle}>Water</Text>
            </View>
            <Text style={styles.cardCount}>{water} <Text style={styles.cardCountSub}>/ 8</Text></Text>
          </View>
          <View style={styles.glasses}>
            {Array.from({ length: 8 }).map((_, i) => {
              const filled = i < water;
              return (
                <View key={i} style={[styles.glass, filled && styles.glassFilled]} testID={`water-glass-${i}`} />
              );
            })}
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity onPress={() => act('water_dec')} style={styles.actionBtn} testID="water-dec">
              <Minus size={18} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => act('water_inc')} style={[styles.actionBtn, styles.primaryAction]} testID="water-inc">
              <Plus size={18} color="#F9F9F6" />
              <Text style={styles.primaryActionText}>Log glass</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Calories */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Flame size={22} color={Colors.terracotta} />
              <Text style={styles.cardTitle}>Calories</Text>
            </View>
            <Text style={styles.cardCount}>
              {data.calories} <Text style={styles.cardCountSub}>/ {calorieGoal} kcal</Text>
            </Text>
          </View>
          <View style={styles.barBg}>
            <View style={[styles.barFg, { width: `${calPct}%`, backgroundColor: Colors.terracotta }]} />
          </View>
          <View style={[styles.actionRow, { marginTop: 16 }]}>
            <TouchableOpacity onPress={() => act('calorie_sub', 100)} style={styles.actionBtn} testID="cal-minus-100">
              <Text style={styles.smallAction}>−100</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => act('calorie_add', 100)} style={[styles.actionBtn, styles.primaryAction]} testID="cal-plus-100">
              <Text style={styles.primaryActionText}>+100 kcal</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => act('calorie_add', 300)} style={[styles.actionBtn, styles.primaryAction]} testID="cal-plus-300">
              <Text style={styles.primaryActionText}>+300 kcal</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Workout */}
        <Pressable
          onPress={() => act('workout_toggle')}
          style={[styles.workoutCard, data.workout && styles.workoutCardActive]}
          testID="workout-toggle"
        >
          <Dumbbell size={28} color={data.workout ? '#F9F9F6' : Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, data.workout && { color: '#F9F9F6' }]}>Workout</Text>
            <Text style={[styles.workoutSub, data.workout && { color: '#F9F9F6', opacity: 0.8 }]}>
              {data.workout ? 'Completed today ✓' : 'Tap when done'}
            </Text>
          </View>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 32, fontWeight: '600', color: Colors.textPrimary, letterSpacing: -1 },
  sub: { fontSize: 14, color: Colors.textSecondary, marginTop: 4, marginBottom: 22 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 22, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 17, fontWeight: '600', color: Colors.textPrimary },
  cardCount: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  cardCountSub: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  glasses: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  glass: { flex: 1, height: 48, borderRadius: 12, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  glassFilled: { backgroundColor: '#5B8FB9', borderColor: '#5B8FB9' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 18,
    backgroundColor: Colors.surface2, borderRadius: Radius.pill, minHeight: 44,
  },
  primaryAction: { backgroundColor: Colors.primary, flex: 1 },
  primaryActionText: { color: '#F9F9F6', fontWeight: '600', fontSize: 14 },
  smallAction: { color: Colors.primary, fontWeight: '600', fontSize: 14 },
  barBg: { height: 8, backgroundColor: Colors.surface2, borderRadius: 9999, overflow: 'hidden' },
  barFg: { height: '100%', borderRadius: 9999 },
  workoutCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 22,
    borderWidth: 1, borderColor: Colors.border,
  },
  workoutCardActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  workoutSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
});
