import { afterAll, describe, it, expect } from 'vitest';

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
// These tests create and delete an account. Make the isolated test target an
// explicit opt-in so a generic production URL cannot be exercised by mistake.
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === 'isolated' ? describe : describe.skip;

async function apiRequest(method: string, path: string, body?: any, cookie?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  
  const setCookie = res.headers.get('set-cookie');
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, cookie: setCookie };
}

describeApi('Auth API', () => {
  const testUser = {
    displayName: `testuser_${Date.now()}`,
    password: 'TestPass123!',
    firstName: 'Test',
    lastName: 'User',
    email: `test_${Date.now()}@example.com`,
  };

  let sessionCookie = '';

  afterAll(async () => {
    const login = await apiRequest('POST', '/api/auth/login', {
      identifier: testUser.displayName,
      password: testUser.password,
    });
    const cleanupCookie = login.cookie || sessionCookie;
    if (login.status !== 200 || !cleanupCookie) return;
    const { status } = await apiRequest('DELETE', '/api/account', {
      confirmation: 'DELETE MY ACCOUNT',
    }, cleanupCookie);
    expect(status).toBe(200);
  });

  it('rejects completed registration without displayName', async () => {
    const { status, data } = await apiRequest('POST', '/api/auth/complete-registration', {
      email: testUser.email,
      password: 'TestPass123!',
      termsAccepted: true,
    });
    expect(status).toBe(400);
    expect(data.error).toBeTruthy();
  });

  it('rejects completed registration without password', async () => {
    const { status, data } = await apiRequest('POST', '/api/auth/complete-registration', {
      email: testUser.email,
      displayName: 'test',
      termsAccepted: true,
    });
    expect(status).toBe(400);
    expect(data.error).toBeTruthy();
  });

  it('registers a new user and chosen display name successfully', async () => {
    const { status, data, cookie } = await apiRequest('POST', '/api/auth/complete-registration', {
      ...testUser,
      termsAccepted: true,
    });
    expect(status).toBe(201);
    expect(data.user).toBeTruthy();
    expect(data.user.displayName).toBe(testUser.displayName);
    if (cookie) sessionCookie = cookie;
  });

  it('rejects duplicate displayName registration', async () => {
    const { status } = await apiRequest('POST', '/api/auth/login', {
      identifier: testUser.displayName + '_nonexistent',
      password: 'wrong',
    });
    expect(status).toBe(401);
  });

  it('rejects login with wrong password', async () => {
    const { status } = await apiRequest('POST', '/api/auth/login', {
      identifier: testUser.displayName,
      password: 'WrongPassword!',
    });
    expect(status).toBe(401);
  });

  it('logs in with correct credentials', async () => {
    const { status, data, cookie } = await apiRequest('POST', '/api/auth/login', {
      identifier: testUser.displayName,
      password: testUser.password,
    });
    expect(status).toBe(200);
    expect(data.user.displayName).toBe(testUser.displayName);
    if (cookie) sessionCookie = cookie;
  });

  it('accesses auth check with session', async () => {
    const { status, data } = await apiRequest('GET', '/api/auth/me', undefined, sessionCookie);
    expect(status).toBe(200);
    expect(data.user).toBeTruthy();
    expect(data.user.displayName).toBe(testUser.displayName);
  });

  it('rejects auth check without session', async () => {
    const { status } = await apiRequest('GET', '/api/auth/me', undefined);
    expect(status).toBe(401);
  });

  it('logs out successfully', async () => {
    const { status } = await apiRequest('POST', '/api/auth/logout', undefined, sessionCookie);
    expect(status).toBe(200);
  });
});

describeApi('Retired password API boundary', () => {
  it('does not treat the retired server reset route as a successful SPA request', async () => {
    const { status, data } = await apiRequest('POST', '/api/auth/reset-password', {
      token: 'invalid-token',
      newPassword: 'NewPass123!',
    });
    expect(status).toBe(404);
    expect(data.error).toBeTruthy();
  });
});

describeApi('Health Check', () => {
  it('returns ok status', async () => {
    const { status, data } = await apiRequest('GET', '/api/health');
    expect(status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeTruthy();
  });
});
