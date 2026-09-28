import { z } from 'zod';

export const appConfigSchema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(3001),
  WEB_PORT: z.coerce.number().default(3000),
});

export const databaseConfigSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

export const redisConfigSchema = z.object({
  REDIS_URL: z.string().default('redis://localhost:6379'),
});

export const storageConfigSchema = z.object({
  S3_ENDPOINT: z.string().url().default('http://localhost:8333'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().default('computemesh-storage'),
});

export const authConfigSchema = z.object({
  JWT_SECRET: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
});

export const corsConfigSchema = z.object({
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

export const fullConfigSchema = appConfigSchema
  .merge(databaseConfigSchema)
  .merge(redisConfigSchema)
  .merge(storageConfigSchema)
  .merge(authConfigSchema)
  .merge(corsConfigSchema);

export type AppConfig = z.infer<typeof appConfigSchema>;
export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
export type RedisConfig = z.infer<typeof redisConfigSchema>;
export type StorageConfig = z.infer<typeof storageConfigSchema>;
export type AuthConfig = z.infer<typeof authConfigSchema>;
export type CorsConfig = z.infer<typeof corsConfigSchema>;
export type FullConfig = z.infer<typeof fullConfigSchema>;
