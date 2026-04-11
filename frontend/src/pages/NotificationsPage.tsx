import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';
import { fetchNotifications } from '../api/eventService';
import type { NotificationItem } from '../types/event';

const KIND_ICONS: Record<NotificationItem['kind'], string> = {
  FRIEND_REQUEST:     '👥',
  SUGGESTION:         '💡',
  EVENT_UPDATE:       '📅',
  ALL_SUBMITTED:      '🗳',
  ATTENDANCE_REQUEST: '📩',
};

const KIND_COLORS: Record<NotificationItem['kind'], string> = {
  FRIEND_REQUEST:     'bg-purple-50 border-purple-100',
  SUGGESTION:         'bg-amber-50 border-amber-100',
  EVENT_UPDATE:       'bg-indigo-50 border-indigo-100',
  ALL_SUBMITTED:      'bg-blue-50 border-blue-200',
  ATTENDANCE_REQUEST: 'bg-violet-50 border-violet-200',
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function NotificationsPage({
  onRead,
  onActionComplete,
}: {
  onRead: () => void;
  onActionComplete: () => void;
}) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [actioned, setActioned] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchNotifications().then(n => {
      setNotifications(n);
      setLoading(false);
    });
    onRead();
  }, [onRead]);

  async function handleConfirm(notif: NotificationItem) {
    if (!notif.eventId) return;
    setActioningId(notif.id);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      const apiUrl = import.meta.env.VITE_API_URL;
      await fetch(`${apiUrl}/events/${notif.eventId}/confirm`, {
        method: 'POST',
        headers: { 'Authorization': token || '', 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error("Failed to confirm attendance:", err);
    } finally {
      setActioned(prev => new Set([...prev, notif.id]));
      setActioningId(null);
      onActionComplete();
    }
  }

  async function handleDecline(notif: NotificationItem) {
    if (!notif.eventId) return;
    setActioningId(notif.id);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      const apiUrl = import.meta.env.VITE_API_URL;
      await fetch(`${apiUrl}/events/${notif.eventId}/decline`, {
        method: 'POST',
        headers: { 'Authorization': token || '', 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error("Failed to decline attendance:", err);
    } finally {
      setActioned(prev => new Set([...prev, notif.id]));
      setActioningId(null);
      onActionComplete();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-7 h-7 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">←</button>
          <h2 className="text-xl font-bold text-stone-800">Notifications</h2>
        </div>
        <span className="text-xs text-stone-400">{notifications.length} total</span>
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <span className="text-4xl">🔔</span>
          <p className="text-stone-500 text-sm">No notifications yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notifications.map(item => {
            const isActioned = actioned.has(item.id);
            const isActioning = actioningId === item.id;
            return (
              <li key={item.id} className={`rounded-2xl border p-4 flex gap-4 transition-opacity ${KIND_COLORS[item.kind]} ${isActioned ? 'opacity-50' : ''}`}>
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shrink-0 shadow-sm">
                  {KIND_ICONS[item.kind]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-800">{item.title}</p>
                  <p className="mt-0.5 text-sm text-stone-600">{item.detail}</p>
                  <p className="mt-1.5 text-xs text-stone-400">{formatDateTime(item.createdAt)}</p>

                  {/* ALL_SUBMITTED: go to workspace */}
                  {item.kind === 'ALL_SUBMITTED' && item.eventId && !isActioned && (
                    <button
                      onClick={() => navigate(`/events/${item.eventId}/workspace`)}
                      className="mt-2.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                    >
                      Select Time & Venue →
                    </button>
                  )}

                  {/* ATTENDANCE_REQUEST: confirm or decline */}
                  {item.kind === 'ATTENDANCE_REQUEST' && item.eventId && !isActioned && (
                    <div className="flex gap-2 mt-2.5">
                      <button
                        onClick={() => handleConfirm(item)}
                        disabled={isActioning}
                        className="px-4 py-1.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {isActioning ? '…' : '✓ Attend'}
                      </button>
                      <button
                        onClick={() => handleDecline(item)}
                        disabled={isActioning}
                        className="px-4 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {isActioning ? '…' : '✗ Decline'}
                      </button>
                    </div>
                  )}

                  {isActioned && (
                    <p className="mt-2 text-xs text-stone-400 italic">Response recorded.</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
