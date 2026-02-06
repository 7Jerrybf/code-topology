'use client';

import { useEffect, useCallback } from 'react';
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  GitCommit,
  Calendar,
  Tag,
  AlertTriangle,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTopologyStore } from '@/stores/topologyStore';
import type { SnapshotMetadata } from '@/types/topology';

/**
 * Get status color based on snapshot metrics
 */
function getStatusColor(metadata: SnapshotMetadata): string {
  if (metadata.brokenCount > 0) {
    return 'text-red-500';
  }
  if (metadata.changedCount > 0) {
    return 'text-amber-500';
  }
  return 'text-emerald-500';
}

/**
 * Get status indicator dot color
 */
function getStatusDotColor(metadata: SnapshotMetadata): string {
  if (metadata.brokenCount > 0) {
    return 'bg-red-500';
  }
  if (metadata.changedCount > 0) {
    return 'bg-amber-500';
  }
  return 'bg-emerald-500';
}

/**
 * Format timestamp as readable date
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format timestamp as relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function TimelineSlider() {
  const {
    snapshots,
    currentIndex,
    setCurrentIndex,
    goToFirst,
    goToPrevious,
    goToNext,
    goToLatest,
  } = useTopologyStore();

  const currentSnapshot = snapshots[currentIndex];
  const metadata = currentSnapshot?.metadata;
  const hasMultipleSnapshots = snapshots.length > 1;

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!hasMultipleSnapshots) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToFirst();
      } else if (e.key === 'End') {
        e.preventDefault();
        goToLatest();
      }
    },
    [hasMultipleSnapshots, goToPrevious, goToNext, goToFirst, goToLatest]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Don't render if no snapshots
  if (snapshots.length === 0 || !metadata) {
    return null;
  }

  // Single snapshot mode - simplified display
  if (!hasMultipleSnapshots) {
    return (
      <div className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 py-2">
        <div className="flex items-center justify-center gap-4 text-sm text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            {formatDate(metadata.timestamp)}
          </span>
          {metadata.commitHash && (
            <span className="flex items-center gap-1.5">
              <GitCommit className="w-4 h-4" />
              <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-xs">
                {metadata.commitHash}
              </code>
            </span>
          )}
          {metadata.label && (
            <span className="flex items-center gap-1.5">
              <Tag className="w-4 h-4" />
              {metadata.label}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Multi-snapshot mode with full timeline
  return (
    <TooltipProvider delayDuration={300}>
      <div className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Navigation buttons */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={goToFirst}
                  disabled={currentIndex === 0}
                >
                  <ChevronFirst className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>First snapshot (Home)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={goToPrevious}
                  disabled={currentIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous snapshot (Left Arrow)</TooltipContent>
            </Tooltip>
          </div>

          {/* Slider */}
          <div className="flex-1 flex items-center gap-3">
            <span className="text-xs text-slate-400 dark:text-slate-500 w-8 text-right">
              {currentIndex + 1}
            </span>

            <div className="flex-1 relative">
              <Slider
                value={[currentIndex]}
                min={0}
                max={snapshots.length - 1}
                step={1}
                onValueChange={([value]) => setCurrentIndex(value)}
                className="cursor-pointer"
              />

              {/* Snapshot markers */}
              <div className="absolute top-4 left-0 right-0 flex justify-between px-2 pointer-events-none">
                {snapshots.map((snap, idx) => (
                  <Tooltip key={idx}>
                    <TooltipTrigger asChild>
                      <div
                        className={`w-1.5 h-1.5 rounded-full pointer-events-auto cursor-pointer transition-transform ${
                          idx === currentIndex ? 'scale-150' : ''
                        } ${getStatusDotColor(snap.metadata)}`}
                        onClick={() => setCurrentIndex(idx)}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <div className="space-y-1">
                        <div className="font-medium">
                          {formatDate(snap.metadata.timestamp)}
                        </div>
                        {snap.metadata.commitHash && (
                          <div className="text-xs opacity-80">
                            {snap.metadata.commitHash}: {snap.metadata.commitMessage}
                          </div>
                        )}
                        {snap.metadata.label && (
                          <div className="text-xs opacity-80">
                            Label: {snap.metadata.label}
                          </div>
                        )}
                        <div className="text-xs opacity-60">
                          {snap.metadata.nodeCount} nodes, {snap.metadata.edgeCount} edges
                          {snap.metadata.brokenCount > 0 && (
                            <span className="text-red-300 ml-1">
                              ({snap.metadata.brokenCount} broken)
                            </span>
                          )}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>

            <span className="text-xs text-slate-400 dark:text-slate-500 w-8">
              {snapshots.length}
            </span>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={goToNext}
                  disabled={currentIndex === snapshots.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next snapshot (Right Arrow)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={goToLatest}
                  disabled={currentIndex === snapshots.length - 1}
                >
                  <ChevronLast className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Latest snapshot (End)</TooltipContent>
            </Tooltip>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-600" />

          {/* Current snapshot info */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Status indicator */}
            <div className={`flex items-center gap-1.5 ${getStatusColor(metadata)}`}>
              {metadata.brokenCount > 0 && (
                <AlertTriangle className="w-4 h-4" />
              )}
              <span
                className={`w-2 h-2 rounded-full ${getStatusDotColor(metadata)}`}
              />
            </div>

            {/* Timestamp */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1.5 cursor-default">
                  <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                  {formatRelativeTime(metadata.timestamp)}
                </span>
              </TooltipTrigger>
              <TooltipContent>{formatDate(metadata.timestamp)}</TooltipContent>
            </Tooltip>

            {/* Commit info */}
            {metadata.commitHash && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1.5 cursor-default">
                    <GitCommit className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-xs">
                      {metadata.commitHash}
                    </code>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <div>
                    <div className="font-medium">{metadata.branch}</div>
                    <div className="text-xs opacity-80 mt-1">
                      {metadata.commitMessage}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Label */}
            {metadata.label && (
              <span className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                <span className="truncate max-w-24">{metadata.label}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
