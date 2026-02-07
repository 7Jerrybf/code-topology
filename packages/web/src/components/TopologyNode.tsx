'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { FileCode, Component, Wrench } from 'lucide-react';
import type { NodeType, DiffStatus, Language } from '@/types/topology';

export interface TopologyNodeData extends Record<string, unknown> {
  label: string;
  type: NodeType;
  status: DiffStatus;
  fullPath: string;
  language?: Language;
  isHighlighted?: boolean;
  isFaded?: boolean;
}

/** Language display info */
const languageInfo: Record<Language, { label: string; color: string }> = {
  typescript: { label: 'TS', color: 'bg-blue-500' },
  javascript: { label: 'JS', color: 'bg-yellow-500' },
  python: { label: 'PY', color: 'bg-green-600' },
};

export type TopologyNodeType = Node<TopologyNodeData, 'topology'>;

const nodeStyles: Record<NodeType, { bg: string; border: string; icon: typeof FileCode }> = {
  FILE: {
    bg: 'bg-slate-50 dark:bg-slate-800',
    border: 'border-slate-300 dark:border-slate-600',
    icon: FileCode,
  },
  COMPONENT: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/40',
    border: 'border-emerald-400 dark:border-emerald-600',
    icon: Component,
  },
  UTILITY: {
    bg: 'bg-amber-50 dark:bg-amber-900/40',
    border: 'border-amber-400 dark:border-amber-600',
    icon: Wrench,
  },
};

const statusStyles: Record<DiffStatus, string> = {
  UNCHANGED: '',
  ADDED: 'ring-2 ring-green-500',
  MODIFIED: 'ring-2 ring-yellow-500',
  DELETED: 'ring-2 ring-red-500 opacity-60',
};

function TopologyNodeComponent({ data, selected }: NodeProps<TopologyNodeType>) {
  const style = nodeStyles[data.type];
  const statusStyle = statusStyles[data.status];
  const Icon = style.icon;

  // Highlight/fade styles for dependency chain visualization
  const highlightStyle = data.isHighlighted
    ? 'ring-2 ring-blue-400 shadow-lg scale-105'
    : '';
  const fadeStyle = data.isFaded
    ? 'opacity-30 saturate-50'
    : '';

  return (
    <div
      className={`
        px-3 py-2 rounded-lg border-2 shadow-sm min-w-[120px]
        ${style.bg} ${style.border} ${statusStyle}
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        ${highlightStyle} ${fadeStyle}
        transition-all duration-200 hover:shadow-md
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-400 dark:!bg-slate-500 !w-2 !h-2"
      />

      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" />
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
              {data.label}
            </span>
            {data.language && (
              <span
                className={`text-[10px] font-semibold px-1 py-0.5 rounded text-white ${languageInfo[data.language].color}`}
              >
                {languageInfo[data.language].label}
              </span>
            )}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {data.fullPath}
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-slate-400 dark:!bg-slate-500 !w-2 !h-2"
      />
    </div>
  );
}

export const TopologyNode = memo(TopologyNodeComponent);
