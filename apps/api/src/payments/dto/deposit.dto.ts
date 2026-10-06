import { z } from 'zod';

export const createDepositSchema = z.object({
  amount: z.string().regex(/^[1-9][0-9]*$/, 'Amount must be a strictly positive integer string representing cents')
});

export type CreateDepositDto = z.infer<typeof createDepositSchema>;
