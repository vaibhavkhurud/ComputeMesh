import { z } from 'zod';

export const jobRequirementSchema = z.object({
  cpuCoresMin: z.number().int().min(1).optional(),
  memoryMbMin: z.number().int().min(1).optional(),
  gpuRequired: z.boolean().optional(),
  gpuCount: z.number().int().min(1).optional(),
  gpuModel: z.string().max(100).optional(),
  gpuMemoryMbMin: z.number().int().min(0).optional(),
  cudaVersion: z.string().max(50).optional(),
  architecture: z.string().max(50).optional(),
  operatingSystem: z.string().max(100).optional(),
  region: z.string().max(50).optional(),
});

export const createJobSchema = z.object({
  name: z.string().min(1).max(100),
  requirements: jobRequirementSchema.optional(),
  inputKey: z.string().max(255).optional().refine(val => {
    if (!val) return true;
    return !val.includes('..') && !val.startsWith('/');
  }, "Invalid path format"),
  inputSize: z.number().int().min(0).optional(),
});

export type JobRequirementDto = z.infer<typeof jobRequirementSchema>;
export type CreateJobDto = z.infer<typeof createJobSchema>;
