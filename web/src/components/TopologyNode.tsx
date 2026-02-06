'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { FileCode, Component, Wrench } from 'lucide-react';
import type { NodeType, DiffStatus } from '@/types/topology';

export interface TopologyNodeData extends Record<string, unknown> {
  label: string;
  type: NodeType;
  status: DiffStatus;
  fullPath: string;
}

export type TopologyNodeType = Node<TopologyNodeData, 'topology'>;

const nodeStyles: Record<NodeType, { bg: string; border: string; icon: typeof FileCode }> = {
  FILE: {
    bg: 'bg-slate-50',
    border: 'border-slate-300',
    icon: FileCode,
  },
  COMPONENT: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-400',
    icon: Component,
  },
  UTILITY: {
    bg: 'bg-amber-50',
    border: 'border-amber-400',
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

  return (
    <div
      className={`
        px-3 py-2 rounded-lg border-2 shadow-sm min-w-[120px]
        ${style.bg} ${style.border} ${statusStyle}
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        transition-all duration-150 hover:shadow-md
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-400 !w-2 !h-2"
      />

      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-slate-800 truncate">
            {data.label}
          </span>
          <span className="text-xs text-slate-500 truncate">
            {data.fullPath}
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-slate-400 !w-2 !h-2"
      />
    </div>
  );
}

export const TopologyNode = memo(TopologyNodeComponent);
