import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Plus, Trash2, Check } from 'lucide-react-native';
import ScreenContainer from '../components/ScreenContainer';
import { Colors, Radius } from '../src/theme';
import { api } from '../src/api';
import { useVoice } from '../src/VoiceContext';

const FILTERS = ['all', 'pending', 'done'] as const;
type Filter = typeof FILTERS[number];
const PRIORITIES = [
  { key: 'high', label: 'High', color: Colors.terracotta },
  { key: 'medium', label: 'Medium', color: Colors.ochre },
  { key: 'low', label: 'Low', color: Colors.sage },
] as const;

export default function TasksScreen() {
  const v = useVoice();
  const [filter, setFilter] = useState<Filter>('all');
  const [tasks, setTasks] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low'>('medium');

  const load = useCallback(async () => {
    const t = await api.listTasks(filter);
    setTasks(t as any[]);
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { v.setOnDataChange(() => load()); }, [v, load]);

  const submit = async () => {
    const title = newTitle.trim();
    if (!title) return;
    await api.createTask(title, newPriority);
    setNewTitle('');
    setNewPriority('medium');
    setAdding(false);
    await load();
  };

  const toggle = async (id: string) => {
    await api.toggleTask(id);
    await load();
  };

  const remove = async (id: string) => {
    await api.deleteTask(id);
    await load();
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.h1}>Tasks</Text>
        <Text style={styles.h1Sub}>Stay on track with what matters today</Text>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.chip, filter === f && styles.chipActive]}
            testID={`filter-${f}`}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 100 }}
        renderItem={({ item }) => {
          const pcolor = PRIORITIES.find((p) => p.key === item.priority)?.color || Colors.sage;
          return (
            <View style={[styles.taskRow, { borderLeftColor: pcolor }]} testID={`task-${item.id}`}>
              <TouchableOpacity
                onPress={() => toggle(item.id)}
                style={[styles.checkBox, item.done && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                testID={`task-toggle-${item.id}`}
              >
                {item.done && <Check size={14} color="#F9F9F6" strokeWidth={3} />}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[styles.taskTitle, item.done && styles.taskDone]}>{item.title}</Text>
                <Text style={styles.taskMeta}>{item.priority.toUpperCase()}</Text>
              </View>
              <TouchableOpacity onPress={() => remove(item.id)} testID={`task-delete-${item.id}`}>
                <Trash2 size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No tasks here yet. Tap + to add one.</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setAdding(true)} testID="add-task-fab">
        <Plus size={24} color="#F9F9F6" strokeWidth={2.5} />
      </TouchableOpacity>

      <Modal visible={adding} animationType="slide" transparent onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalWrap}
        >
          <Pressable style={styles.backdrop} onPress={() => setAdding(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>New task</Text>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="What do you need to do?"
              placeholderTextColor={Colors.textTertiary}
              style={styles.input}
              autoFocus
              testID="new-task-input"
            />
            <View style={styles.prioRow}>
              {PRIORITIES.map((p) => (
                <Pressable
                  key={p.key}
                  onPress={() => setNewPriority(p.key as any)}
                  style={[
                    styles.prioChip,
                    newPriority === p.key && { backgroundColor: p.color, borderColor: p.color },
                  ]}
                  testID={`new-task-prio-${p.key}`}
                >
                  <Text style={[styles.prioText, newPriority === p.key && { color: '#fff' }]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={submit} testID="new-task-submit">
              <Text style={styles.primaryBtnText}>Add task</Text>
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
  h1Sub: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 16 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: Colors.surface2 },
  chipActive: { backgroundColor: Colors.primary },
  chipText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#F9F9F6' },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  checkBox: {
    width: 26, height: 26, borderRadius: 9999,
    borderWidth: 1.8, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  taskTitle: { fontSize: 15, color: Colors.textPrimary, fontWeight: '500' },
  taskDone: { textDecorationLine: 'line-through', color: Colors.textTertiary },
  taskMeta: { fontSize: 10, color: Colors.textTertiary, marginTop: 4, fontWeight: '700', letterSpacing: 1 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  fab: {
    position: 'absolute', bottom: 110, right: 24,
    width: 56, height: 56, borderRadius: 9999,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 8,
    shadowColor: Colors.primary, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 8 }, shadowRadius: 16,
  },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14 },
  sheetTitle: { fontSize: 22, fontWeight: '600', color: Colors.textPrimary },
  input: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.input, padding: 14, fontSize: 15, color: Colors.textPrimary,
  },
  prioRow: { flexDirection: 'row', gap: 8 },
  prioChip: {
    flex: 1, paddingVertical: 12, borderRadius: Radius.pill,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center',
  },
  prioText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  primaryBtn: {
    backgroundColor: Colors.primary, paddingVertical: 16,
    borderRadius: Radius.pill, alignItems: 'center', marginTop: 4, marginBottom: 16,
  },
  primaryBtnText: { color: '#F9F9F6', fontWeight: '600', fontSize: 15 },
});
