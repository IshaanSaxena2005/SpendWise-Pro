import api from './api';

export const AVATAR_UPDATED_EVENT = 'spendwise-avatar-updated';

export type AvatarResponse = {
  success: boolean;
  avatar: {
    url: string;
    file_path: string;
    uploaded_at?: string;
  } | null;
};

export function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');

  return initials || 'U';
}

export async function fetchProfileAvatar() {
  const res = await api.get<AvatarResponse>('/user/avatar');
  return res.data.avatar?.url || null;
}

export function emitAvatarUpdated(url: string | null) {
  window.dispatchEvent(new CustomEvent(AVATAR_UPDATED_EVENT, { detail: { url } }));
}
