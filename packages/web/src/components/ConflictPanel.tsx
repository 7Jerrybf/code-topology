'use client';

import type { ConflictWarning } from '@/types/topology';
import { AlertTriangle, GitBranch, X } from 'lucide-react';

interface ConflictPanelProps {
  warnings: ConflictWarning[];
  onClear: () => void;
  onFileClick?: (fileId: string) => void;
}

const severityConfig = {
  high: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    badge: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
    icon: 'text-red-500',
    label: 'Direct',
  },
  medium: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-800',
    badge: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400',
    icon: 'text-orange-500',
    label: 'Dependency',
  },
  low: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    badge: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400',
    icon: 'text-amber-500',
    label: 'Semantic',
  },
};

export function ConflictPanel({ warnings, onClear, onFileClick }: ConflictPanelProps) {
  if (warnings.length === 0) return null;

  const highCount = warnings.filter((w) => w.severity === 'high').length;
  const mediumCount = warnings.filter((w) => w.severity === 'medium').length;
  const lowCount = warnings.filter((w) => w.severity === 'low').length;

  return (
    <div className="border-t border-slate-200 dark:border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-red-50 dark:bg-red-900/20">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span className="text-sm font-medium text-red-700 dark:text-red-400">
            Conflict Warnings ({warnings.length})
          </span>
        </div>
        <button
          onClick={onClear}
          className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500"
          title="Dismiss warnings"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Summary badges */}
      <div className="flex gap-2 px-4 py-2">
        {highCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400">
            {highCount} direct
          </span>
        )}
        {mediumCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400">
            {mediumCount} dependency
          </span>
        )}
        {lowCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400">
            {lowCount} semantic
          </span>
        )}
      </div>

      {/* Warning list */}
      <div className="max-h-64 overflow-y-auto">
        {warnings.map((w) => {
          const config = severityConfig[w.severity];
          return (
            <div
              key={w.id}
              className={`px-4 py-2 border-b ${config.border} ${config.bg} last:border-b-0`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${config.badge}`}>
                  {config.label}
                </span>
                <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <GitBranch className="w-3 h-3" />
                  <span>{w.otherBranch}</span>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => onFileClick?.(w.currentFile)}
                  className="text-xs text-left text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                  title={w.currentFile}
                >
                  {w.currentFile}
                </button>
                {w.currentFile !== w.otherFile && (
                  <button
                    onClick={() => onFileClick?.(w.otherFile)}
                    className="text-xs text-left text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                    title={w.otherFile}
                  >
                    {w.otherFile}
                  </button>
                )}
                {w.similarity != null && (
                  <span className="text-xs text-violet-500 dark:text-violet-400 font-mono">
                    {(w.similarity * 100).toFixed(0)}% similar
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
