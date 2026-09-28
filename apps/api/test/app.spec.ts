import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

describe('AppModule', () => {
  it('should compile the module', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('REDIS_CLIENT')
      .useValue({})
      .overrideProvider('STORAGE_CLIENT')
      .useValue({})
      .overrideProvider('DATABASE_CLIENT')
      .useValue({})
      .compile();

    expect(module).toBeDefined();
  });
});
