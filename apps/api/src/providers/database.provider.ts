import { getDatabaseClient } from '@computemesh/database';
import { Provider } from '@nestjs/common';

export const DATABASE_CLIENT = 'DATABASE_CLIENT';

export const databaseProvider: Provider = {
  provide: DATABASE_CLIENT,
  useFactory: () => {
    return getDatabaseClient();
  },
};
