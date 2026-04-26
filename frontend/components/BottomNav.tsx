import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Home,
  CheckSquare,
  Repeat,
  IndianRupee,
  HeartPulse,
  Bell,
  BookOpen,
  Sparkles,
  Calendar,
} from 'lucide-react-native';
import { Colors } from '../src/theme';

const ITEMS = [
  { path: '/', label: 'Home', icon: Home, testID: 'nav-home' },
  { path: '/tasks', label: 'Tasks', icon: CheckSquare, testID: 'nav-tasks' },
  { path: '/habits', label: 'Habits', icon: Repeat, testID: 'nav-habits' },
  { path: '/expenses', label: 'Money', icon: IndianRupee, testID: 'nav-expenses' },
  { path: '/health', label: 'Health', icon: HeartPulse, testID: 'nav-health' },
  { path: '/reminders', label: 'Alerts', icon: Bell, testID: 'nav-reminders' },
  { path: '/journal', label: 'Journal', icon: BookOpen, testID: 'nav-journal' },
  { path: '/calendar', label: 'Calendar', icon: Calendar, testID: 'nav-calendar' },
  { path: '/ai', label: 'Aura', icon: Sparkles, testID: 'nav-ai' },
];

export default function BottomNav() {
  const router = useRouter();
  const path = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {ITEMS.map((it) => {
          const active = path === it.path;
          const Icon = it.icon;
          return (
            <Pressable
              key={it.path}
              onPress={() => router.replace(it.path as any)}
              style={({ pressed }) => [
                styles.tab,
                active && styles.tabActive,
                pressed && { opacity: 0.7 },
              ]}
              testID={it.testID}
            >
              <Icon size={20} color={active ? '#F9F9F6' : Colors.primary} strokeWidth={active ? 2.2 : 1.8} />
              <Text style={[styles.label, active && styles.labelActive]}>{it.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  scroll: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 8,
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9999,
    gap: 6,
    backgroundColor: Colors.surface2,
    minHeight: 44,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  labelActive: {
    color: '#F9F9F6',
  },
});
