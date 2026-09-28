import { z } from 'zod';

export const agentResultSchema = z.object({
  status: z.enum(['COMPLETED', 'FAILED']),
  outputSize: z.number().optional(),
  failureReason: z.string().optional()
});

export type AgentResultDto = z.infer<typeof agentResultSchema>;
