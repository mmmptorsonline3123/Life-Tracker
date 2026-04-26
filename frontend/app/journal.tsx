import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Trash2, BookOpen } from 'lucide-react-native';
import ScreenContainer from '../components/ScreenContainer';
import { Colors, Radius } from '../src/theme';
import { api } from '../src/api';
import { useVoice } from '../src/VoiceContext';

const MOODS = ['Great', 'Good', 'Okay', 'Low', 'Stressed'] as const;
const MOOD_COLORS: Record<string, string> = {
  Great: Colors.success, Good: Colors.sage, Okay: Colors.ochre, Low: '#7E94B5', Stressed: Colors.terracotta,
};

export default function JournalScreen() {
  const v = useVoice();
  const [text, setText] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [list, setList] = useState<any[]>([]);

  const load = useCallback(async () => {
    const items = await api.listJournal();
    setList(items as any[]);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { v.setOnDataChange(() => load()); }, [v, load]);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    await api.createJournal(t, mood || undefined);
    setText(''); setMood(null);
    await load();
  };

  const remove = async (id: string) => { await api.deleteJournal(id); await load(); };

  const today = new Date();
  const dateLabel = today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={120}
      >
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.dateLabel}>{dateLabel}</Text>
          <Text style={styles.h1}>Today's note</Text>

          <View style={styles.moodRow}>
            {MOODS.map((m) => {
              const active = mood === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMood(active ? null : m)}
                  style={[styles.moodChip, active && { backgroundColor: MOOD_COLORS[m], borderColor: MOOD_COLORS[m] }]}
                  testID={`journal-mood-${m.toLowerCase()}`}
                >
                  <Text style={[styles.moodText, active && { color: '#F9F9F6' }]}>{m}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="What's on your mind?"
            placeholderTextColor={Colors.textTertiary}
            style={styles.editor}
            multiline
            textAlignVertical="top"
            testID="journal-input"
          />
          <TouchableOpacity style={styles.saveBtn} onPress={submit} testID="journal-save">
            <Text style={styles.saveBtnText}>Save entry</Text>
          </TouchableOpacity>

          <Text style={styles.section}>Past entries</Text>
          {list.length === 0 ? (
            <View style={styles.empty}>
              <BookOpen size={28} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>Your journal is empty</Text>
            </View>
          ) : (
            list.map((j) => (
              <View key={j.id} style={styles.entryCard} testID={`journal-${j.id}`}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryDate}>
                    {new Date(j.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })} ·{' '}
                    {new Date(j.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {j.mood && (
                      <View style={[styles.entryMood, { backgroundColor: MOOD_COLORS[j.mood] }]}>
                        <Text style={styles.entryMoodText}>{j.mood}</Text>
                      </View>
                    )}
                    <TouchableOpacity onPress={() => remove(j.id)}>
                      <Trash2 size={14} color={Colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.entryText} numberOfLines={6}>{j.text}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  dateLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  h1: { fontSize: 30, fontWeight: '600', color: Colors.textPrimary, letterSpacing: -1, marginBottom: 18 },
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  moodChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.pill,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  moodText: { color: Colors.textPrimary, fontWeight: '600', fontSize: 13 },
  editor: {
    minHeight: 160, borderRadius: Radius.input, padding: 18,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    fontSize: 16, color: Colors.textPrimary, lineHeight: 24,
  },
  saveBtn: { backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: Radius.pill, alignItems: 'center', marginTop: 14 },
  saveBtnText: { color: '#F9F9F6', fontWeight: '600', fontSize: 15 },
  section: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 32, marginBottom: 12 },
  empty: { padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { color: Colors.textSecondary },
  entryCard: { backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 18, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  entryDate: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  entryMood: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999 },
  entryMoodText: { color: '#F9F9F6', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  entryText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 22 },
});
