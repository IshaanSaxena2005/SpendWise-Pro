import api from './api';

export interface DashboardNotification {
  id: number;
  title: string;
  message: string;
  type: 'warning' | 'info' | 'success';
  unread: boolean;
}

function mapNotificationType(type: string): DashboardNotification['type'] {
  if (type === 'anomaly' || type === 'warning' || type === 'budget') return 'warning';
  if (type === 'success') return 'success';
  return 'info';
}

interface ApiNotification {
  id: number;
  title: string;
  description: string;
  type: string;
  read_status: boolean | 0 | 1;
}

export async function fetchNotifications(): Promise<DashboardNotification[]> {
  const response = await api.get('/notifications');
  const rows: ApiNotification[] = response.data?.notifications ?? response.data ?? [];
  return rows.map(n => ({
    id: n.id,
    title: n.title,
    message: n.description,
    type: mapNotificationType(n.type),
    unread: !n.read_status,
  }));
}

export async function markNotificationRead(id: number): Promise<void> {
  await api.put(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.put('/notifications/read-all');
}
