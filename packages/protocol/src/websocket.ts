/**
 * WebSocket message types for live topology updates
 */

import { z } from 'zod';
import { TopologySnapshotSchema } from './topology.js';
import { ConflictWarningSchema } from './conflict.js';

export const WsMessageTypeSchema = z.enum(['snapshot', 'error', 'connected', 'git_event', 'conflict_warning']);
export type WsMessageType = z.infer<typeof WsMessageTypeSchema>;

export const GitEventTypeSchema = z.enum([
  'commit',
  'branch_switch',
  'merge',
  'checkout',
  'reset',
  'rebase',
  'unknown',
]);
export type GitEventType = z.infer<typeof GitEventTypeSchema>;

export const GitEventSchema = z.object({
  eventType: GitEventTypeSchema,
  branch: z.string(),
  commitHash: z.string().optional(),
  previousBranch: z.string().optional(),
  timestamp: z.number(),
});
export type GitEvent = z.infer<typeof GitEventSchema>;

export const WsMessageSchema = z.object({
  type: WsMessageTypeSchema,
  payload: TopologySnapshotSchema.optional(),
  error: z.string().optional(),
  gitEvent: GitEventSchema.optional(),
  conflictWarnings: z.array(ConflictWarningSchema).optional(),
  timestamp: z.number(),
});
export type WsMessage = z.infer<typeof WsMessageSchema>;
