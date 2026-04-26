import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import ScreenContainer from '../components/ScreenContainer';
import { Colors, Radius } from '../src/theme';
import { api } from '../src/api';
import { useVoice } from '../src/VoiceContext';

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Health', 'Gym', 'Bills', 'Other'];
const PAYMENTS = ['UPI', 'Cash'] as const;

export default function ExpensesScreen() {
  const v = useVoice();
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [adding, setAdding] = useState(false);
  const [desc, setDesc] = useState('');
  const [amt, setAmt] = useState('');
  const [cat, setCat] = useState('Food');
  const [pay, setPay] = useState<'UPI' | 'Cash'>('UPI');

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const items = await api.listExpenses(today);
    setList(items as any[]);
    const t: any = await api.expensesTodayTotal();
    setTotal(t.total || 0);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { v.setOnDataChange(() => load()); }, [v, load]);

  const submit = async () => {
    const a = parseFloat(amt);
    if (!desc.trim() || isNaN(a) || a <= 0) return;
    await api.createExpense(desc.trim(), a, cat, pay);
    setDesc(''); setAmt(''); setCat('Food'); setPay('UPI'); setAdding(false);
    await load();
  };

  const remove = async (id: string) => { await api.deleteExpense(id); await load(); };

  const dailyBudget = 2000;
  const pct = Math.min(100, (total / dailyBudget) * 100);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.label}>SPENT TODAY</Text>
        <Text style={styles.amount} testID="expenses-total">₹ {total.toFixed(2)}</Text>
        <View style={styles.barBg}>
          <View style={[styles.barFg, { width: `${pct}%`, backgroundColor: pct > 80 ? Colors.terracotta : Colors.primary }]} />
        </View>
        <Text style={styles.budgetText}>{pct.toFixed(0)}% of ₹{dailyBudget} daily budget</Text>
      </View>

      <FlatList
        data={list}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        renderItem={({ item }) => (
          <View style={styles.row} testID={`expense-${item.id}`}>
            <View style={[styles.catDot, { backgroundColor: catColor(item.category) }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.desc}>{item.description}</Text>
              <View style={styles.metaRow}>
                <View style={styles.tag}><Text style={styles.tagText}>{item.category}</Text></View>
                <View style={[styles.tag, { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border }]}>
                  <Text style={[styles.tagText, { color: Colors.textSecondary }]}>{item.payment}</Text>
                </View>
              </View>
            </View>
            <Text style={styles.amt}>₹{item.amount.toFixed(0)}</Text>
            <TouchableOpacity onPress={() => remove(item.id)}>
              <Trash2 size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No expenses today.</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setAdding(true)} testID="add-expense-fab">
        <Plus size={24} color="#F9F9F6" strokeWidth={2.5} />
      </TouchableOpacity>

      <Modal visible={adding} animationType="slide" transparent onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setAdding(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>New expense</Text>
            <TextInput
              value={desc} onChangeText={setDesc}
              placeholder="What did you spend on?"
              placeholderTextColor={Colors.textTertiary}
              style={styles.input}
              testID="expense-desc-input"
            />
            <TextInput
              value={amt} onChangeText={setAmt}
              placeholder="Amount in ₹"
              keyboardType="numeric"
              placeholderTextColor={Colors.textTertiary}
              style={styles.input}
              testID="expense-amount-input"
            />
            <ScrollChips items={CATEGORIES} value={cat} onChange={setCat} testIdPrefix="expense-cat" />
            <ScrollChips items={PAYMENTS as any} value={pay} onChange={(v) => setPay(v as any)} testIdPrefix="expense-pay" />
            <TouchableOpacity style={styles.primaryBtn} onPress={submit} testID="expense-submit">
              <Text style={styles.primaryBtnText}>Add expense</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

function ScrollChips({ items, value, onChange, testIdPrefix }: any) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((it: string) => (
        <Pressable
          key={it}
          onPress={() => onChange(it)}
          style={[chipStyle.chip, value === it && chipStyle.chipActive]}
          testID={`${testIdPrefix}-${it.toLowerCase()}`}
        >
          <Text style={[chipStyle.text, value === it && { color: '#F9F9F6' }]}>{it}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const chipStyle = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: Colors.surface2 },
  chipActive: { backgroundColor: Colors.primary },
  text: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },
});

function catColor(c: string) {
  return ({
    Food: Colors.terracotta,
    Transport: Colors.ochre,
    Shopping: '#7E94B5',
    Health: Colors.success,
    Gym: Colors.primary,
    Bills: '#8B6F47',
    Other: Colors.sage,
  } as any)[c] || Colors.sage;
}

const styles = StyleSheet.create({
  header: { padding: 24, paddingTop: 8 },
  label: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700', letterSpacing: 1.5 },
  amount: { fontSize: 48, fontWeight: '300', color: Colors.textPrimary, letterSpacing: -2, marginTop: 6, marginBottom: 14 },
  barBg: { height: 8, backgroundColor: Colors.surface2, borderRadius: 9999, overflow: 'hidden' },
  barFg: { height: '100%', borderRadius: 9999 },
  budgetText: { fontSize: 12, color: Colors.textSecondary, marginTop: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface, borderRadius: Radius.card, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  catDot: { width: 8, height: 36, borderRadius: 9999 },
  desc: { fontSize: 15, color: Colors.textPrimary, fontWeight: '600' },
  metaRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999, backgroundColor: Colors.surface2 },
  tagText: { fontSize: 10, fontWeight: '700', color: Colors.textPrimary, letterSpacing: 0.5 },
  amt: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: Colors.textSecondary },
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
  primaryBtn: { backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: Radius.pill, alignItems: 'center', marginBottom: 16 },
  primaryBtnText: { color: '#F9F9F6', fontWeight: '600', fontSize: 15 },
});
