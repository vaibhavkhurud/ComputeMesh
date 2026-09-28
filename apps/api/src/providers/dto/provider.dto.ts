import { z } from 'zod';

export const registerProviderSchema = z.object({
  displayName: z.string().min(1, 'Display name is required'),
});

export const updateProviderSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').optional(),
});

export const machineResourceSchema = z.object({
  cpuCores: z.number().int().positive('CPU Cores must be greater than 0'),
  memoryMb: z.number().int().positive('Memory MB must be greater than 0'),
  storageGb: z.number().int().positive('Storage GB must be greater than 0'),
  gpuCount: z.number().int().min(0, 'GPU Count cannot be negative'),
  gpuModel: z.string().optional().nullable(),
  gpuMemoryMb: z.number().int().min(0).optional().nullable(),
  cudaVersion: z.string().optional().nullable(),
}).refine(data => {
  if (data.gpuCount === 0) {
    // Basic consistency validation: if gpuCount is 0, we don't expect gpuMemoryMb to be non-zero
    if (data.gpuMemoryMb && data.gpuMemoryMb > 0) return false;
  }
  return true;
}, {
  message: 'GPU specific fields must be empty or 0 if gpuCount is 0',
});

export const createMachineSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  hostname: z.string().min(1, 'Hostname is required'),
  operatingSystem: z.string().min(1, 'OS is required'),
  architecture: z.string().min(1, 'Architecture is required'),
  region: z.string().min(1, 'Region is required'),
  resources: machineResourceSchema,
});

export const updateMachineSchema = z.object({
  name: z.string().min(1).optional(),
  hostname: z.string().min(1).optional(),
  operatingSystem: z.string().min(1).optional(),
  architecture: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  resources: machineResourceSchema.optional(),
});

export type RegisterProviderDto = z.infer<typeof registerProviderSchema>;
export type UpdateProviderDto = z.infer<typeof updateProviderSchema>;
export type CreateMachineDto = z.infer<typeof createMachineSchema>;
export type UpdateMachineDto = z.infer<typeof updateMachineSchema>;
