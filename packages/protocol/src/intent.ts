/**
 * Intent & Conflict types (Phase 3 preparation)
 * These are placeholders for future Agent Interaction features
 */

import { z } from 'zod';

export const IntentSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  description: z.string(),
  affectedNodes: z.array(z.string()),
  vector: z.array(z.number()).optional(),
});
export type Intent = z.infer<typeof IntentSchema>;

export const ArbitrationRequestSchema = z.object({
  conflictId: z.string(),
  contenders: z.array(IntentSchema),
  contextGraph: z.unknown(),
});
export type ArbitrationRequest = z.infer<typeof ArbitrationRequestSchema>;
