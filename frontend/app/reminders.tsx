import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Bell, Plus, Trash2, Repeat as RepeatIcon, Check, Clock } from 'lucide-react-native';
import ScreenContainer from '../components/ScreenContainer';
import { Colors, Radius } from '../src/theme';
import { api } from '../src/api';
import { useVoice } from '../src/VoiceContext';

type Tab = 'upcoming' | 'past';

export default function RemindersScreen() {
  const v = useVoice();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [list, setList] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date(Date.now() + 30 * 60000));
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [repeat, setRepeat] = useState<'once' | 'daily' | 'weekly'>('once');

  const load = useCallback(async () => {
    const items = await api.listReminders();
    setList(items as any[]);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { v.setOnDataChange(() => load()); }, [v, load]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return list.filter((r) => {
      const t = new Date(r.fire_at).getTime();
      const isPast = r.done || t < now;
      return tab === 'past' ? isPast : !isPast;
    });
  }, [list, tab]);

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    await api.createReminder(t, date.toISOString(), repeat);
    setTitle(''); setRepeat('once');
    setDate(new Date(Date.now() + 30 * 60000));
    setAdding(false);
    await load();
  };

  const setPreset = (preset: '30m' | '1h' | 'tonight' | 'tomorrow') => {
    const d = new Date();
    if (preset === '30m') d.setMinutes(d.getMinutes() + 30);
    else if (preset === '1h') d.setHours(d.getHours() + 1);
    else if (preset === 'tonight') {
      d.setHours(21, 0, 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    } else if (preset === 'tomorrow') {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    }
    setDate(d);
  };

  const markDone = async (id: string) => { await api.markReminderDone(id); await load(); };
  const remove = async (id: string) => { await api.deleteReminder(id); await load(); };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.h1}>Reminders</Text>
        <Text style={styles.sub}>Never miss what matters</Text>
      </View>

      <View style={styles.tabs}>
        {(['upcoming', 'past'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            testID={`reminder-tab-${t}`}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        renderItem={({ item }) => {
          const dt = new Date(item.fire_at);
          const isPast = item.done || dt.getTime() < Date.now();
          return (
            <View style={[styles.row, item.done && { opacity: 0.6 }]} testID={`reminder-${item.id}`}>
              <View style={styles.timeBox}>
                <Text style={styles.time}>{dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                <Text style={styles.timeDay}>{dt.toLocaleDateString([], { day: 'numeric', month: 'short' })}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, item.done && { textDecorationLine: 'line-through' }]}>{item.title}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                  {item.repeat !== 'once' && (
                    <View style={styles.tag}>
                      <RepeatIcon size={10} color={Colors.textSecondary} />
                      <Text style={styles.tagText}>{item.repeat}</Text>
                    </View>
                  )}
                </View>
              </View>
              {!isPast && (
                <TouchableOpacity onPress={() => markDone(item.id)} style={styles.iconBtn} testID={`reminder-done-${item.id}`}>
                  <Check size={16} color={Colors.success} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => remove(item.id)} style={styles.iconBtn}>
                <Trash2 size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Bell size={28} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>No {tab} reminders</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setAdding(true)} testID="add-reminder-fab">
        <Plus size={24} color="#F9F9F6" strokeWidth={2.5} />
      </TouchableOpacity>

      <Modal visible={adding} animationType="slide" transparent onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setAdding(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>New reminder</Text>
            <TextInput
              value={title} onChangeText={setTitle}
              placeholder="What should I remind you of?"
              placeholderTextColor={Colors.textTertiary}
              style={styles.input}
              testID="reminder-title-input"
            />
            <Text style={styles.sectionLabel}>Quick presets</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[
                { k: '30m', l: '30 min' },
                { k: '1h', l: '1 hour' },
                { k: 'tonight', l: 'Tonight 9pm' },
                { k: 'tomorrow', l: 'Tomorrow 9am' },
              ].map((p) => (
                <Pressable key={p.k} onPress={() => setPreset(p.k as any)} style={styles.preset} testID={`preset-${p.k}`}>
                  <Clock size={14} color={Colors.primary} />
                  <Text style={styles.presetText}>{p.l}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setPickerMode('date')} style={styles.dateBtn}>
                <Text style={styles.dateBtnText}>{date.toLocaleDateString()}</Text>
              </Pressable>
              <Pressable onPress={() => setPickerMode('time')} style={styles.dateBtn}>
                <Text style={styles.dateBtnText}>{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </Pressable>
            </View>

            {pickerMode && Platform.OS !== 'web' && (
              <DateTimePicker
                value={date}
                mode={pickerMode}
                onChange={(_, d) => {
                  setPickerMode(null);
                  if (d) setDate(d);
                }}
              />
            )}

            <Text style={styles.sectionLabel}>Repeat</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['once', 'daily', 'weekly'] as const).map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRepeat(r)}
                  style={[styles.repeatChip, repeat === r && styles.repeatChipActive]}
                  testID={`repeat-${r}`}
                >
                  <Text style={[styles.repeatText, repeat === r && { color: '#F9F9F6' }]}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={submit} testID="reminder-submit">
              <Text style={styles.primaryBtnText}>Set reminder</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  h1: { fontSize: 32, fontWeight: '600', color: Colors.textPrimary, letterSpacing: -1 },
  sub: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 16 },
  tabBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: Colors.surface2 },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: '#F9F9F6' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  timeBox: {
    width: 64, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, borderRightWidth: 1, borderRightColor: Colors.border,
  },
  time: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  timeDay: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  title: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999, backgroundColor: Colors.surface2 },
  tagText: { fontSize: 10, color: Colors.textSecondary, fontWeight: '700', letterSpacing: 0.5 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: 40, alignItems: 'center', gap: 8 },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  fab: {
    position: 'absolute', bottom: 110, right: 24,
    width: 56, height: 56, borderRadius: 9999,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: Colors.primary, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 8 }, shadowRadius: 16,
  },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14 },
  sheetTitle: { fontSize: 22, fontWeight: '600', color: Colors.textPrimary },
  input: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.input, padding: 14, fontSize: 15, color: Colors.textPrimary,
  },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  preset: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: Radius.pill, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  presetText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  dateBtn: {
    flex: 1, paddingVertical: 14, borderRadius: Radius.input,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  dateBtnText: { color: Colors.textPrimary, fontWeight: '600' },
  repeatChip: {
    flex: 1, paddingVertical: 12, borderRadius: Radius.pill,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  repeatChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  repeatText: { color: Colors.textPrimary, fontWeight: '600', fontSize: 13 },
  primaryBtn: { backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: Radius.pill, alignItems: 'center', marginTop: 8, marginBottom: 16 },
  primaryBtnText: { color: '#F9F9F6', fontWeight: '600', fontSize: 15 },
});
