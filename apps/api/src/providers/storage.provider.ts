import { S3Client } from '@aws-sdk/client-s3';

export const STORAGE_CLIENT = 'STORAGE_CLIENT';

export const storageProvider = {
  provide: STORAGE_CLIENT,
  useFactory: () => {
    return new S3Client({
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:8333',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || '',
        secretAccessKey: process.env.S3_SECRET_KEY || '',
      },
      forcePathStyle: true,
      region: 'us-east-1',
    });
  },
};
