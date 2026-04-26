// Lightweight API client
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

async function request<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API ${res.status}: ${t}`);
  }
  return res.json();
}

export const api = {
  // dashboard
  dashboard: () => request('/dashboard'),

  // tasks
  listTasks: (filter: 'all' | 'pending' | 'done' = 'all') =>
    request(`/tasks?filter=${filter}`),
  createTask: (title: string, priority: 'high' | 'medium' | 'low' = 'medium') =>
    request('/tasks', { method: 'POST', body: JSON.stringify({ title, priority }) }),
  toggleTask: (id: string) => request(`/tasks/${id}/toggle`, { method: 'PATCH' }),
  deleteTask: (id: string) => request(`/tasks/${id}`, { method: 'DELETE' }),

  // habits
  habitsToday: () => request('/habits/today'),
  toggleHabit: (key: string, done: boolean) =>
    request('/habits/toggle', { method: 'POST', body: JSON.stringify({ key, done }) }),

  // expenses
  listExpenses: (date?: string) =>
    request(`/expenses${date ? `?date=${date}` : ''}`),
  createExpense: (description: string, amount: number, category: string, payment: 'UPI' | 'Cash') =>
    request('/expenses', {
      method: 'POST',
      body: JSON.stringify({ description, amount, category, payment }),
    }),
  deleteExpense: (id: string) => request(`/expenses/${id}`, { method: 'DELETE' }),
  expensesTodayTotal: () => request('/expenses/today/total'),

  // health
  healthToday: () => request('/health/today'),
  healthAction: (action: string, value?: number) =>
    request('/health/action', { method: 'POST', body: JSON.stringify({ action, value }) }),

  // reminders
  listReminders: () => request('/reminders'),
  createReminder: (title: string, fireAt: string, repeat: 'once' | 'daily' | 'weekly' = 'once') =>
    request('/reminders', {
      method: 'POST',
      body: JSON.stringify({ title, fire_at: fireAt, repeat }),
    }),
  markReminderDone: (id: string) => request(`/reminders/${id}/done`, { method: 'PATCH' }),
  deleteReminder: (id: string) => request(`/reminders/${id}`, { method: 'DELETE' }),

  // journal
  listJournal: () => request('/journal'),
  createJournal: (text: string, mood?: string) =>
    request('/journal', { method: 'POST', body: JSON.stringify({ text, mood }) }),
  deleteJournal: (id: string) => request(`/journal/${id}`, { method: 'DELETE' }),

  // mood
  setMood: (mood: string) =>
    request('/mood', { method: 'POST', body: JSON.stringify({ mood }) }),
  moodToday: () => request('/mood/today'),

  // chat
  chat: (message: string, sessionId = 'main') =>
    request('/chat', { method: 'POST', body: JSON.stringify({ message, session_id: sessionId }) }),
  chatHistory: (sessionId = 'main') =>
    request(`/chat/history?session_id=${sessionId}`),

  // transcribe
  transcribe: async (uri: string): Promise<{ text: string }> => {
    const form = new FormData();
    // @ts-ignore — RN FormData accepts this shape
    form.append('file', { uri, name: 'audio.m4a', type: 'audio/m4a' });
    const res = await fetch(`${BASE}/api/transcribe`, { method: 'POST', body: form as any });
    if (!res.ok) throw new Error(`Transcribe failed: ${res.status}`);
    return res.json();
  },
};
