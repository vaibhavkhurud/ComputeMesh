import * as dotenv from 'dotenv';
import { z } from 'zod';
import { fullConfigSchema, FullConfig } from './schemas';

export function loadPartialConfig<T extends z.ZodTypeAny>(schema: T): z.infer<T> {
  if (process.env.APP_ENV !== 'production' && process.env.NODE_ENV !== 'production') {
    dotenv.config();
  }

  const result = schema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Configuration validation error:');
    result.error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }

  return result.data;
}

export function loadConfig(): FullConfig {
  return loadPartialConfig(fullConfigSchema);
}
