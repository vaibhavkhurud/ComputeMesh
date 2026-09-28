import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AuthModule (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const testEmail = `test_${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  it('1. Register user', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: testEmail, password: testPassword })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('accessToken');
        expect(res.body).toHaveProperty('refreshToken');
        expect(res.body.user).toHaveProperty('email', testEmail.toLowerCase());
        expect(res.body).not.toHaveProperty('passwordHash');
      });
  });

  it('2. Duplicate registration', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: testEmail, password: testPassword })
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toBe('Registration failed or email already in use');
      });
  });

  it('3. Login', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('accessToken');
        expect(res.body).toHaveProperty('refreshToken');
        accessToken = res.body.accessToken;
        refreshToken = res.body.refreshToken;
      });
  });

  it('4. Invalid password', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: 'WrongPassword!' })
      .expect(401);
  });

  it('5. /auth/me without authentication', () => {
    return request(app.getHttpServer())
      .get('/auth/me')
      .expect(401);
  });

  it('6. /auth/me with valid access token', () => {
    return request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('email', testEmail.toLowerCase());
      });
  });

  it('7. Refresh token', () => {
    return request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('accessToken');
        expect(res.body).toHaveProperty('refreshToken');
        accessToken = res.body.accessToken; // Save new
        refreshToken = res.body.refreshToken; // Save new
      });
  });

  it('8. Logout', () => {
    return request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('9. Revoked refresh token', () => {
    return request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('15. Sensitive fields are absent from API responses', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200)
      .expect((res) => {
        expect(res.body.user).not.toHaveProperty('passwordHash');
        expect(res.body.user).not.toHaveProperty('tokenHash');
      });
  });

  it('12. Suspended account login', async () => {
    const { getDatabaseClient } = require('@computemesh/database');
    const db = getDatabaseClient();
    await db.user.update({ where: { email: testEmail.toLowerCase() }, data: { status: 'SUSPENDED' } });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(401);
  });

  it('13. Disabled account refresh', async () => {
    const { getDatabaseClient } = require('@computemesh/database');
    const db = getDatabaseClient();
    
    // First reactivate and login to get tokens
    await db.user.update({ where: { email: testEmail.toLowerCase() }, data: { status: 'ACTIVE' } });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword });
    const localRefreshToken = loginRes.body.refreshToken;

    // Then disable
    await db.user.update({ where: { email: testEmail.toLowerCase() }, data: { status: 'DISABLED' } });

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: localRefreshToken })
      .expect(401);
  });

  it('14. Email Normalization', async () => {
    const { getDatabaseClient } = require('@computemesh/database');
    const db = getDatabaseClient();
    await db.user.update({ where: { email: testEmail.toLowerCase() }, data: { status: 'ACTIVE' } });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail.toUpperCase(), password: testPassword })
      .expect(200); 
  });

  it('16. logout then /auth/me', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('17. suspended user then /auth/me', async () => {
    const { getDatabaseClient } = require('@computemesh/database');
    const db = getDatabaseClient();
    
    await db.user.update({ where: { email: testEmail.toLowerCase() }, data: { status: 'ACTIVE' } });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword });
    const localToken = loginRes.body.accessToken;

    await db.user.update({ where: { email: testEmail.toLowerCase() }, data: { status: 'SUSPENDED' } });

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${localToken}`)
      .expect(401);
  });

  it('18. disabled user then /auth/me', async () => {
    const { getDatabaseClient } = require('@computemesh/database');
    const db = getDatabaseClient();
    
    await db.user.update({ where: { email: testEmail.toLowerCase() }, data: { status: 'ACTIVE' } });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword });
    const localToken = loginRes.body.accessToken;

    await db.user.update({ where: { email: testEmail.toLowerCase() }, data: { status: 'DISABLED' } });

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${localToken}`)
      .expect(401);
  });

  it('19. Concurrent refresh (Race condition prevention)', async () => {
    const { getDatabaseClient } = require('@computemesh/database');
    const db = getDatabaseClient();
    
    await db.user.update({ where: { email: testEmail.toLowerCase() }, data: { status: 'ACTIVE' } });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword });
    const validRefreshToken = loginRes.body.refreshToken;

    const [req1, req2] = await Promise.all([
      request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: validRefreshToken }),
      request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: validRefreshToken }),
    ]);

    const statuses = [req1.status, req2.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(401);

    const successRes = req1.status === 200 ? req1 : req2;
    const newRefreshToken = successRes.body.refreshToken;

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: newRefreshToken })
      .expect(401);
  });

  it('20. Rate-limit 429', async () => {
    let got429 = false;
    for (let i = 0; i < 60; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'fake@example.com', password: 'fake' });
      
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
  });
});
