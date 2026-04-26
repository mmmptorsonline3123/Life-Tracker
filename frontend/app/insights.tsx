import React, { useState, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { ArrowLeft, TrendingUp, IndianRupee, Repeat, Droplet } from 'lucide-react-native';
import ScreenContainer from '../components/ScreenContainer';
import { Colors, Radius } from '../src/theme';
import { api } from '../src/api';

const W = Dimensions.get('window').width;
const CHART_W = W - 40;

const BASE_CFG = {
  backgroundColor: '#fff',
  backgroundGradientFrom: '#fff',
  backgroundGradientTo: '#fff',
  decimalPlaces: 0,
  labelColor: () => Colors.textSecondary,
  propsForBackgroundLines: {
    strokeDasharray: '',
    stroke: Colors.border,
    strokeWidth: 1,
  },
  barPercentage: 0.65,
};

type Period = 'week' | 'month';

export default function InsightsScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('week');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const load = useCallback(
    async (p: Period) => {
      setLoading(true);
      try {
        const r = await api.insights(p);
        setData(r);
      } catch (e) {
        console.warn('Insights load error', e);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      load(period);
    }, [period, load])
  );

  const switchPeriod = (p: Period) => {
    if (p !== period) setPeriod(p);
  };

  const days: any[] = data?.days ?? [];
  const summary = data?.summary ?? {};

  // Sparse labels for month view — only every 7th
  const sparse = (labels: string[]) =>
    period === 'week' ? labels : labels.map((l, i) => (i % 7 === 0 ? l : ''));

  const habitLabels = sparse(days.map((d) => d.label));
  const habitData = days.length ? days.map((d) => Math.max(d.habits_pct, 0)) : [0];

  const expenseLabels = sparse(days.map((d) => d.label));
  const expenseData = days.length ? days.map((d) => Math.max(d.expense_total, 0)) : [0];

  const waterLabels = sparse(days.map((d) => d.label));
  const waterData = days.length ? days.map((d) => Math.max(d.water, 0)) : [0];

  const calLabels = sparse(days.map((d) => d.label));
  const calData = days.length ? days.map((d) => Math.max(d.calories, 0)) : [0];

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="insights-back">
            <ArrowLeft size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>Insights</Text>
            <Text style={styles.sub}>Trends & patterns</Text>
          </View>
        </View>

        {/* Period toggle */}
        <View style={styles.toggleWrap}>
          {(['week', 'month'] as Period[]).map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => switchPeriod(p)}
              style={[styles.toggleBtn, period === p && styles.toggleActive]}
              testID={`period-${p}`}
            >
              <Text style={[styles.toggleText, period === p && styles.toggleTextActive]}>
                {p === 'week' ? '7 Days' : '30 Days'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading insights…</Text>
          </View>
        ) : (
          <>
            {/* Summary cards */}
            <View style={styles.summaryRow}>
              <SummaryCard
                icon={<IndianRupee size={16} color={Colors.terracotta} />}
                label="Total Spend"
                value={`₹${(summary.total_expense ?? 0).toFixed(0)}`}
                testID="summary-total"
              />
              <SummaryCard
                icon={<IndianRupee size={16} color={Colors.ochre} />}
                label="Daily Avg"
                value={`₹${(summary.avg_expense ?? 0).toFixed(0)}`}
                testID="summary-avg"
              />
              <SummaryCard
                icon={<Repeat size={16} color={Colors.primary} />}
                label="Habit Score"
                value={`${summary.avg_habits_pct ?? 0}%`}
                testID="summary-habits"
              />
            </View>

            {/* Habits chart */}
            <ChartSection
              title="Habit Completion"
              subtitle="% of habits done per day"
              icon={<Repeat size={16} color={Colors.primary} />}
            >
              <BarChart
                data={{ labels: habitLabels, datasets: [{ data: habitData }] }}
                width={CHART_W}
                height={180}
                yAxisSuffix="%"
                yAxisLabel=""
                chartConfig={{ ...BASE_CFG, color: (o = 1) => `rgba(26,54,45,${o})` }}
                style={styles.chart}
                fromZero
                showValuesOnTopOfBars={period === 'week'}
                withInnerLines
              />
            </ChartSection>

            {/* Expenses chart */}
            <ChartSection
              title="Daily Expenses"
              subtitle="Spending in ₹ per day"
              icon={<IndianRupee size={16} color={Colors.terracotta} />}
            >
              {period === 'week' ? (
                <BarChart
                  data={{ labels: expenseLabels, datasets: [{ data: expenseData }] }}
                  width={CHART_W}
                  height={180}
                  yAxisSuffix=""
                  yAxisLabel="₹"
                  chartConfig={{ ...BASE_CFG, color: (o = 1) => `rgba(200,85,61,${o})` }}
                  style={styles.chart}
                  fromZero
                  showValuesOnTopOfBars
                  withInnerLines
                />
              ) : (
                <LineChart
                  data={{
                    labels: expenseLabels,
                    datasets: [{ data: expenseData, strokeWidth: 2 }],
                  }}
                  width={CHART_W}
                  height={180}
                  yAxisLabel="₹"
                  yAxisSuffix=""
                  chartConfig={{ ...BASE_CFG, color: (o = 1) => `rgba(200,85,61,${o})` }}
                  style={styles.chart}
                  fromZero
                  bezier
                  withDots={false}
                  withInnerLines
                />
              )}
            </ChartSection>

            {/* Water chart */}
            <ChartSection
              title="Water Intake"
              subtitle="Glasses per day (goal: 8)"
              icon={<Droplet size={16} color="#5B8FB9" />}
            >
              <BarChart
                data={{ labels: waterLabels, datasets: [{ data: waterData }] }}
                width={CHART_W}
                height={180}
                yAxisSuffix=" gl"
                yAxisLabel=""
                chartConfig={{ ...BASE_CFG, color: (o = 1) => `rgba(91,143,185,${o})` }}
                style={styles.chart}
                fromZero
                showValuesOnTopOfBars={period === 'week'}
                withInnerLines
              />
            </ChartSection>

            {/* Calories chart */}
            <ChartSection
              title="Calories Logged"
              subtitle="kcal per day"
              icon={<TrendingUp size={16} color={Colors.ochre} />}
            >
              {period === 'week' ? (
                <BarChart
                  data={{ labels: calLabels, datasets: [{ data: calData }] }}
                  width={CHART_W}
                  height={180}
                  yAxisSuffix=""
                  yAxisLabel=""
                  chartConfig={{ ...BASE_CFG, color: (o = 1) => `rgba(242,166,90,${o})` }}
                  style={styles.chart}
                  fromZero
                  showValuesOnTopOfBars={period === 'week'}
                  withInnerLines
                />
              ) : (
                <LineChart
                  data={{
                    labels: calLabels,
                    datasets: [{ data: calData, strokeWidth: 2 }],
                  }}
                  width={CHART_W}
                  height={180}
                  yAxisLabel=""
                  yAxisSuffix=" kcal"
                  chartConfig={{ ...BASE_CFG, color: (o = 1) => `rgba(242,166,90,${o})` }}
                  style={styles.chart}
                  fromZero
                  bezier
                  withDots={false}
                  withInnerLines
                />
              )}
            </ChartSection>
          </>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

function SummaryCard({ icon, label, value, testID }: any) {
  return (
    <View style={styles.summaryCard} testID={testID}>
      <View style={styles.summaryIcon}>{icon}</View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function ChartSection({ title, subtitle, icon, children }: any) {
  return (
    <View style={styles.chartSection}>
      <View style={styles.chartHeader}>
        {icon}
        <View style={{ marginLeft: 8, flex: 1 }}>
          <Text style={styles.chartTitle}>{title}</Text>
          <Text style={styles.chartSub}>{subtitle}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  sub: { fontSize: 13, color: Colors.textSecondary, marginTop: 1 },
  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: Colors.surface2,
    borderRadius: Radius.pill,
    padding: 4,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  toggleBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: Radius.pill },
  toggleActive: { backgroundColor: Colors.primary },
  toggleText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  toggleTextActive: { color: '#F9F9F6' },
  loader: { alignItems: 'center', paddingTop: 60, gap: 12 },
  loadingText: { color: Colors.textSecondary, fontSize: 14 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  summaryIcon: { marginBottom: 6 },
  summaryValue: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  summaryLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500', marginTop: 2, textAlign: 'center' },
  chartSection: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  chartHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  chartTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  chartSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  chart: { borderRadius: 12, marginLeft: -10 },
});
