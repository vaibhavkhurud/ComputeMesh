export interface HealthResponse {
  status: 'ok' | 'error';
  service: string;
}

export interface ReadinessResponse {
  status: 'ok' | 'degraded' | 'error';
  dependencies: Record<string, DependencyStatus>;
}

export type DependencyStatus = 'up' | 'down' | 'unknown';

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export interface ServiceConfig {
  name: string;
  version: string;
  env: AppEnvironment;
}

export type AppEnvironment = 'development' | 'staging' | 'production' | 'test';
