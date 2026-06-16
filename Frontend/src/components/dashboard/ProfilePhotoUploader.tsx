import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Loader2, Trash2, Upload } from 'lucide-react';
import api from '../../lib/api';
import { emitAvatarUpdated, fetchProfileAvatar, getInitials, type AvatarResponse } from '../../lib/avatar';

type ProfilePhotoUploaderProps = {
  userName: string;
  variant?: 'profile' | 'settings';
};

type AvatarCircleProps = {
  userName: string;
  avatarUrl: string | null;
  size?: 'sm' | 'lg';
  className?: string;
  onImageError?: () => void;
};

const maxFileSize = 5 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function AvatarCircle({ userName, avatarUrl, size = 'sm', className = '', onImageError }: AvatarCircleProps) {
  const dimensions = size === 'lg' ? 'w-28 h-28 text-3xl' : 'w-11 h-11 text-sm';

  return (
    <div className={`${dimensions} rounded-full bg-[#F5F5F5] border border-black/10 flex items-center justify-center overflow-hidden shrink-0 font-bold text-black/60 ${className}`}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={`${userName} profile`} className="w-full h-full object-cover" onError={onImageError} />
      ) : (
        <span>{getInitials(userName)}</span>
      )}
    </div>
  );
}

export function ProfilePhotoUploader({ userName, variant = 'profile' }: ProfilePhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = useMemo(
    () => selectedFile ? URL.createObjectURL(selectedFile) : null,
    [selectedFile]
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    let mounted = true;

    fetchProfileAvatar()
      .then(url => {
        if (mounted) {
          setAvatarUrl(url);
          setError(null);
        }
      })
      .catch(() => {
        if (mounted) setError('Unable to load profile photo.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleChooseFile = () => {
    setError(null);
    inputRef.current?.click();
  };

  const validateFile = (file: File) => {
    if (import.meta.env.DEV) {
      console.debug('[AvatarUpload] selected file', {
        name: file.name,
        type: file.type,
        size: file.size,
      });
    }

    setError(null);

    if (!allowedTypes.has(file.type)) {
      setError('Use a JPG, PNG, or WEBP image.');
      return false;
    }

    if (file.size > maxFileSize) {
      setError('Image must be 5 MB or smaller.');
      return false;
    }

    return true;
  };

  const handleFileSelected = (file: File) => {
    if (!validateFile(file)) {
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      handleChooseFile();
      return;
    }

    const formData = new FormData();
    formData.append('avatar', selectedFile);

    if (import.meta.env.DEV) {
      console.debug('[AvatarUpload] submitting FormData avatar', formData.get('avatar'));
    }

    setLoading(true);
    try {
      const res = await api.post<AvatarResponse>('/user/avatar', formData);
      const nextUrl = res.data.avatar?.url || null;
      setAvatarUrl(nextUrl);
      setSelectedFile(null);
      setError(null);
      emitAvatarUpdated(nextUrl);
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      setError(message || 'Unable to upload profile photo.');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.delete('/user/avatar');
      setAvatarUrl(null);
      setSelectedFile(null);
      emitAvatarUpdated(null);
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      setError(message || 'Unable to remove profile photo.');
    } finally {
      setLoading(false);
    }
  };

  const isSettings = variant === 'settings';

  return (
    <div className={isSettings ? 'flex flex-col sm:flex-row sm:items-center gap-4' : 'flex flex-col items-center md:items-start gap-3'}>
      <div className={isSettings ? 'flex items-center gap-4' : 'relative'}>
        <AvatarCircle
          userName={userName}
          avatarUrl={previewUrl || avatarUrl}
          size={isSettings ? 'sm' : 'lg'}
          className={isSettings ? '' : 'border-4 border-white shadow-md'}
          onImageError={() => {
            setAvatarUrl(null);
            setError('Unable to display profile photo.');
            emitAvatarUpdated(null);
          }}
        />
        {!isSettings && (
          <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-black text-white border-4 border-white flex items-center justify-center shadow-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) handleFileSelected(file);
        }}
      />

      <div className={isSettings ? 'flex flex-wrap items-center gap-3' : 'flex flex-wrap items-center justify-center md:justify-start gap-2'}>
        <button
          type="button"
          onClick={selectedFile ? handleUpload : handleChooseFile}
          disabled={loading}
          className="flex items-center gap-2 bg-black text-white text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {selectedFile ? 'Upload' : avatarUrl ? 'Replace' : 'Upload'}
        </button>
        {avatarUrl && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="flex items-center gap-2 bg-white border border-rose-100 text-rose-600 text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-rose-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            Remove
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs font-semibold text-rose-500">{error}</p>
      )}
    </div>
  );
}
