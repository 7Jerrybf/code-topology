/**
 * WebSocket message types for live topology updates
 */

import { z } from 'zod';
import { TopologySnapshotSchema } from './topology.js';

export const WsMessageTypeSchema = z.enum(['snapshot', 'error', 'connected']);
export type WsMessageType = z.infer<typeof WsMessageTypeSchema>;

export const WsMessageSchema = z.object({
  type: WsMessageTypeSchema,
  payload: TopologySnapshotSchema.optional(),
  error: z.string().optional(),
  timestamp: z.number(),
});
export type WsMessage = z.infer<typeof WsMessageSchema>;
