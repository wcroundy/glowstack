import React from 'react';

const PLATFORM_STYLES = {
  instagram:     { bg: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400', label: 'IG' },
  tiktok:        { bg: 'bg-black', label: 'TT' },
  youtube:       { bg: 'bg-red-600', label: 'YT' },
  pinterest:     { bg: 'bg-red-500', label: 'Pi' },
  facebook:      { bg: 'bg-blue-600', label: 'FB' },
  shopmy:        { bg: 'bg-emerald-500', label: 'SM' },
  ltk:           { bg: 'bg-pink-500', label: 'LK' },
  walmart:       { bg: 'bg-blue-500', label: 'WM' },
  amazon:        { bg: 'bg-orange-500', label: 'AZ' },
  google_photos: { bg: 'bg-blue-400', label: 'GP' },
};

export default function PlatformIcon({ platform, size = 'md' }) {
  const style = PLATFORM_STYLES[platform] || { bg: 'bg-surface-400', label: '?' };
  const sizes = { sm: 'w-6 h-6 text-[9px]', md: 'w-8 h-8 text-[10px]', lg: 'w-10 h-10 text-xs' };

  return (
    <div className={`${sizes[size]} ${style.bg} rounded-lg flex items-center justify-center text-white font-bold shrink-0`}>
      {style.label}
    </div>
  );
}

export function PlatformBadge({ platform }) {
  const colors = {
    instagram: 'bg-pink-100 text-pink-700',
    tiktok: 'bg-gray-100 text-gray-800',
    youtube: 'bg-red-100 text-red-700',
    pinterest: 'bg-red-50 text-red-600',
    facebook: 'bg-blue-100 text-blue-700',
    shopmy: 'bg-emerald-100 text-emerald-700',
    ltk: 'bg-pink-100 text-pink-600',
  };
  return (
    <span className={`badge ${colors[platform] || 'bg-surface-100 text-surface-600'}`}>
      {platform}
    </span>
  );
}
