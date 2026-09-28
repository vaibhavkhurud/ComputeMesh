import { z } from 'zod';

export const agentEnrollSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const agentHeartbeatSchema = z.object({
  agentVersion: z.string().optional(),
});

export const agentCapabilitiesSchema = z.object({
  cpuLogicalCores: z.number().int().min(1).optional().nullable(),
  cpuArchitecture: z.string().optional().nullable(),
  memoryMb: z.number().int().min(1).optional().nullable(),
  operatingSystem: z.string().optional().nullable(),
  gpuCount: z.number().int().min(0).optional().nullable(),
  gpuModel: z.string().optional().nullable(),
  gpuMemoryMb: z.number().int().min(0).optional().nullable(),
  cudaVersion: z.string().optional().nullable(),
  discoveryStatus: z.enum(['SUCCESS', 'PARTIAL', 'FAILED', 'UNAVAILABLE']),
  discoveryError: z.string().optional().nullable(),
  gpuDiscoveryStatus: z.enum(['SUCCESS', 'PARTIAL', 'FAILED', 'UNAVAILABLE']),
});

export type AgentEnrollDto = z.infer<typeof agentEnrollSchema>;
export type AgentHeartbeatDto = z.infer<typeof agentHeartbeatSchema>;
export type AgentCapabilitiesDto = z.infer<typeof agentCapabilitiesSchema>;
