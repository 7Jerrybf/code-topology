'use client';

import { Radio, Wifi, WifiOff } from 'lucide-react';
import { useTopologyStore, type WsConnectionStatus } from '@/stores/topologyStore';
import { cn } from '@/lib/utils';

interface StatusConfig {
  icon: typeof Radio;
  color: string;
  bgColor: string;
  label: string;
  pulse?: boolean;
}

const statusConfigs: Record<WsConnectionStatus, StatusConfig> = {
  connected: {
    icon: Radio,
    color: 'text-emerald-500 dark:text-emerald-400',
    bgColor: 'bg-emerald-500',
    label: 'Live',
    pulse: true,
  },
  connecting: {
    icon: Wifi,
    color: 'text-amber-500 dark:text-amber-400',
    bgColor: 'bg-amber-500',
    label: 'Connecting...',
  },
  disconnected: {
    icon: WifiOff,
    color: 'text-slate-400 dark:text-slate-500',
    bgColor: 'bg-slate-400',
    label: 'Disconnected',
  },
};

export function LiveIndicator() {
  const {
    liveUpdatesEnabled,
    wsConnectionStatus,
    setLiveUpdatesEnabled,
  } = useTopologyStore();

  const config = statusConfigs[wsConnectionStatus];
  const Icon = config.icon;

  const handleToggle = () => {
    setLiveUpdatesEnabled(!liveUpdatesEnabled);
  };

  return (
    <button
      onClick={handleToggle}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
        'border',
        liveUpdatesEnabled
          ? 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
          : 'bg-transparent border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
      )}
      title={liveUpdatesEnabled ? 'Disable live updates' : 'Enable live updates (requires watch mode)'}
    >
      {/* Status dot */}
      <span className="relative flex h-2.5 w-2.5">
        {liveUpdatesEnabled && config.pulse && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
              config.bgColor
            )}
          />
        )}
        <span
          className={cn(
            'relative inline-flex rounded-full h-2.5 w-2.5',
            config.bgColor
          )}
        />
      </span>

      {/* Icon */}
      <Icon className={cn('w-4 h-4', config.color)} />

      {/* Label */}
      <span
        className={cn(
          'text-xs',
          liveUpdatesEnabled
            ? config.color
            : 'text-slate-500 dark:text-slate-400'
        )}
      >
        {liveUpdatesEnabled ? config.label : 'Live'}
      </span>
    </button>
  );
}
