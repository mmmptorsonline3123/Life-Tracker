import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Send, Mic, Sparkles } from 'lucide-react-native';
import ScreenContainer from '../components/ScreenContainer';
import { Colors, Radius } from '../src/theme';
import { api } from '../src/api';
import { useVoice } from '../src/VoiceContext';

const QUICK = [
  'What did I spend on food this week?',
  'Have I worked out this month?',
  'How is my water intake?',
  'What tasks did I finish today?',
  'Show me my mood this week',
  'How much did I spend last month?',
];

export default function AIScreen() {
  const v = useVoice();
  const [history, setHistory] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    const h = await api.chatHistory();
    setHistory(h as any[]);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [history.length]);

  const send = async (msg?: string) => {
    const text = (msg ?? input).trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);
    // optimistic message
    const tempId = `tmp_${Date.now()}`;
    setHistory((h) => [...h, { id: tempId, user_message: text, ai_reply: '', created_at: new Date().toISOString() }]);
    try {
      const r: any = await api.chat(text);
      setHistory((h) =>
        h.map((m) => (m.id === tempId ? { ...m, id: r.id, ai_reply: r.reply } : m))
      );
      v.speak(r.reply);
    } catch (e: any) {
      setHistory((h) =>
        h.map((m) => (m.id === tempId ? { ...m, ai_reply: `Error: ${e.message}` } : m))
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={120}
      >
        <View style={styles.header}>
          <Sparkles size={20} color={Colors.terracotta} />
          <Text style={styles.h1}>Aura</Text>
          <Text style={styles.subtitle}>Your memory, on demand</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {history.length === 0 && (
            <View style={styles.welcome}>
              <Text style={styles.welcomeTitle}>Ask me anything about your life.</Text>
              <Text style={styles.welcomeText}>
                I remember every task you've completed, every rupee you've spent, every workout, glass of water, and journal entry.
              </Text>
            </View>
          )}

          {history.map((m) => (
            <View key={m.id} style={{ marginBottom: 24 }}>
              <View style={styles.userBubble} testID={`chat-user-${m.id}`}>
                <Text style={styles.userText}>{m.user_message}</Text>
              </View>
              <View style={styles.aiBubble} testID={`chat-ai-${m.id}`}>
                {m.ai_reply ? (
                  <Text style={styles.aiText}>{m.ai_reply}</Text>
                ) : (
                  <ActivityIndicator color={Colors.primary} />
                )}
              </View>
            </View>
          ))}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 8 }}
        >
          {QUICK.map((q) => (
            <Pressable key={q} onPress={() => send(q)} style={styles.quickChip} testID={`quick-${q.slice(0, 10)}`}>
              <Text style={styles.quickText}>{q}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Aura anything…"
            placeholderTextColor={Colors.textTertiary}
            style={styles.input}
            onSubmitEditing={() => send()}
            testID="chat-input"
          />
          <TouchableOpacity onPress={() => v.toggleMic()} style={styles.micBtn} testID="chat-mic">
            <Mic size={20} color={v.isRecording ? '#F9F9F6' : Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => send()}
            style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]}
            disabled={!input.trim() || loading}
            testID="chat-send"
          >
            <Send size={18} color="#F9F9F6" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  h1: { fontSize: 24, fontWeight: '600', color: Colors.textPrimary },
  subtitle: { marginLeft: 'auto', fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  welcome: { padding: 20 },
  welcomeTitle: { fontSize: 22, fontWeight: '600', color: Colors.textPrimary, marginBottom: 8 },
  welcomeText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },
  userBubble: {
    alignSelf: 'flex-end', maxWidth: '85%',
    backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 20, borderBottomRightRadius: 6, marginBottom: 10,
  },
  userText: { color: '#F9F9F6', fontSize: 15, lineHeight: 22 },
  aiBubble: {
    alignSelf: 'flex-start', maxWidth: '95%',
    paddingHorizontal: 4, paddingVertical: 6,
  },
  aiText: { color: Colors.textPrimary, fontSize: 15, lineHeight: 24 },
  quickChip: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  quickText: { fontSize: 12, color: Colors.textPrimary, fontWeight: '500' },
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  input: {
    flex: 1, height: 44, paddingHorizontal: 16,
    borderRadius: Radius.pill, backgroundColor: Colors.surface2,
    fontSize: 15, color: Colors.textPrimary,
  },
  micBtn: {
    width: 44, height: 44, borderRadius: 9999,
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 9999,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
});
