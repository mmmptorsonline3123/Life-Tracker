import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, CheckSquare, Repeat, IndianRupee, Droplet, BookOpen, Bell, Flame, Dumbbell } from 'lucide-react-native';
import ScreenContainer from '../components/ScreenContainer';
import { Colors, Radius } from '../src/theme';
import { api } from '../src/api';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function ym(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
function ymd(d: Date) { return `${ym(d)}-${pad(d.getDate())}`; }

export default function CalendarScreen() {
  const today = useMemo(() => new Date(), []);
  const [cursorMonth, setCursorMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(ymd(today));
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadActive = useCallback(async (d: Date) => {
    try {
      const r: any = await api.historyActiveDates(ym(d));
      setActiveDates(new Set(r.dates || []));
    } catch {
      setActiveDates(new Set());
    }
  }, []);

  const loadDay = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const r = await api.history(date);
      setData(r);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadActive(cursorMonth);
    loadDay(selected);
  }, [cursorMonth, selected, loadActive, loadDay]));

  const days: (number | null)[] = useMemo(() => {
    const first = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth(), 1);
    // Make Monday=0
    const startCol = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() + 1, 0).getDate();
    const grid: (number | null)[] = Array(startCol).fill(null);
    for (let i = 1; i <= daysInMonth; i++) grid.push(i);
    while (grid.length % 7 !== 0) grid.push(null);
    return grid;
  }, [cursorMonth]);

  const moveMonth = (delta: number) => {
    const next = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() + delta, 1);
    // don't allow future months past current
    const nowMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (next.getTime() > nowMonth.getTime()) return;
    setCursorMonth(next);
  };

  const isToday = (n: number) =>
    n === today.getDate() && cursorMonth.getMonth() === today.getMonth() && cursorMonth.getFullYear() === today.getFullYear();

  const dateStrFor = (n: number) => `${ym(cursorMonth)}-${pad(n)}`;

  const selectedDate = new Date(`${selected}T00:00:00`);
  const selectedLabel = selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Calendar</Text>
        <Text style={styles.sub}>Your past, at a glance</Text>

        <View style={styles.calCard}>
          <View style={styles.monthRow}>
            <Pressable onPress={() => moveMonth(-1)} style={styles.iconBtn} testID="cal-prev">
              <ChevronLeft size={20} color={Colors.primary} />
            </Pressable>
            <Text style={styles.monthLabel}>
              {MONTH_NAMES[cursorMonth.getMonth()]} {cursorMonth.getFullYear()}
            </Text>
            <Pressable onPress={() => moveMonth(1)} style={styles.iconBtn} testID="cal-next">
              <ChevronRight size={20} color={Colors.primary} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={styles.weekLabel}>{w}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {days.map((n, idx) => {
              if (n === null) return <View key={idx} style={styles.cell} />;
              const ds = dateStrFor(n);
              const isSelected = ds === selected;
              const isFuture = new Date(`${ds}T23:59:59`).getTime() > Date.now();
              const hasData = activeDates.has(ds);
              return (
                <Pressable
                  key={idx}
                  onPress={() => !isFuture && setSelected(ds)}
                  style={[styles.cell, isSelected && styles.cellSelected, isFuture && { opacity: 0.3 }]}
                  testID={`cal-day-${ds}`}
                  disabled={isFuture}
                >
                  <Text style={[styles.cellText, isSelected && { color: '#F9F9F6' }, isToday(n) && !isSelected && { color: Colors.terracotta, fontWeight: '700' }]}>
                    {n}
                  </Text>
                  {hasData && (
                    <View style={[styles.dot, isSelected && { backgroundColor: '#F9F9F6' }]} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={styles.dayHeading}>{selectedLabel}</Text>

        {loading ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : !data ? (
          <Text style={styles.muted}>No data for this day.</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {/* Summary chips */}
            <View style={styles.summaryRow}>
              <SummaryChip icon={<CheckSquare size={14} color={Colors.primary} />} label={`${data.tasks_done}/${data.tasks?.length || 0} tasks`} />
              <SummaryChip icon={<Repeat size={14} color={Colors.sage} />} label={`${data.habits?.done}/${data.habits?.total} habits`} />
              <SummaryChip icon={<IndianRupee size={14} color={Colors.terracotta} />} label={`₹${(data.expense_total || 0).toFixed(0)}`} />
              <SummaryChip icon={<Droplet size={14} color="#5B8FB9" />} label={`${data.health?.water || 0}/8`} />
              {data.health?.workout && (
                <SummaryChip icon={<Dumbbell size={14} color={Colors.success} />} label={'Workout ✓'} />
              )}
              {data.mood && (
                <SummaryChip icon={<Flame size={14} color={Colors.ochre} />} label={`Mood: ${data.mood}`} />
              )}
            </View>

            {/* Tasks */}
            {data.tasks?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Tasks</Text>
                {data.tasks.map((t: any) => (
                  <View key={t.id} style={styles.itemRow}>
                    <View style={[styles.dotBig, { backgroundColor: t.done ? Colors.success : Colors.textTertiary }]} />
                    <Text style={[styles.itemText, t.done && { textDecorationLine: 'line-through', color: Colors.textTertiary }]} numberOfLines={2}>
                      {t.title}
                    </Text>
                    <Text style={styles.itemMeta}>{t.priority}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Expenses */}
            {data.expenses?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Expenses</Text>
                {data.expenses.map((e: any) => (
                  <View key={e.id} style={styles.itemRow}>
                    <Text style={styles.itemText} numberOfLines={1}>{e.description}</Text>
                    <View style={styles.tag}><Text style={styles.tagText}>{e.category}</Text></View>
                    <Text style={styles.amt}>₹{e.amount.toFixed(0)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Habits */}
            {data.habits?.done > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Habits done</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {Object.keys(data.habits.state || {})
                    .filter((k) => data.habits.state[k])
                    .map((k) => (
                      <View key={k} style={styles.habitChip}>
                        <Text style={styles.habitChipText}>{data.habits.labels?.[k] || k}</Text>
                      </View>
                    ))}
                </View>
              </View>
            )}

            {/* Journal */}
            {data.journal?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Journal</Text>
                {data.journal.map((j: any) => (
                  <View key={j.id} style={[styles.itemRow, { alignItems: 'flex-start' }]}>
                    <BookOpen size={14} color={Colors.textSecondary} style={{ marginTop: 4 }} />
                    <Text style={[styles.itemText, { lineHeight: 20 }]} numberOfLines={5}>{j.text}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Reminders */}
            {data.reminders?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Reminders</Text>
                {data.reminders.map((r: any) => {
                  const t = new Date(r.fire_at);
                  return (
                    <View key={r.id} style={styles.itemRow}>
                      <Bell size={14} color={Colors.textSecondary} />
                      <Text style={styles.itemText} numberOfLines={1}>{r.title}</Text>
                      <Text style={styles.itemMeta}>
                        {t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Empty hint */}
            {data.tasks?.length === 0 &&
              data.expenses?.length === 0 &&
              data.habits?.done === 0 &&
              data.journal?.length === 0 &&
              data.reminders?.length === 0 && (
                <Text style={styles.muted}>No activity logged on this day.</Text>
              )}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function SummaryChip({ icon, label }: any) {
  return (
    <View style={styles.summaryChip}>
      {icon}
      <Text style={styles.summaryText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 32, fontWeight: '600', color: Colors.textPrimary, letterSpacing: -1 },
  sub: { fontSize: 14, color: Colors.textSecondary, marginTop: 4, marginBottom: 18 },
  calCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 18,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 16,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  monthLabel: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  iconBtn: { width: 36, height: 36, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface2 },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: Colors.textTertiary, letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 4,
  },
  cellSelected: {
    backgroundColor: Colors.primary, borderRadius: 14,
  },
  cellText: { fontSize: 14, color: Colors.textPrimary, fontWeight: '500' },
  dot: { width: 4, height: 4, borderRadius: 9999, backgroundColor: Colors.terracotta, marginTop: 3 },
  dayHeading: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary, marginTop: 8, marginBottom: 12 },
  muted: { color: Colors.textSecondary, fontSize: 13, paddingVertical: 6 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  summaryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 9999, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  summaryText: { fontSize: 12, color: Colors.textPrimary, fontWeight: '600' },
  section: {
    backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  itemText: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  itemMeta: { fontSize: 11, color: Colors.textTertiary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9999, backgroundColor: Colors.surface2 },
  tagText: { fontSize: 10, color: Colors.textPrimary, fontWeight: '700' },
  amt: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  dotBig: { width: 8, height: 8, borderRadius: 9999 },
  habitChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999, backgroundColor: Colors.surface2 },
  habitChipText: { fontSize: 12, color: Colors.textPrimary, fontWeight: '600' },
});
