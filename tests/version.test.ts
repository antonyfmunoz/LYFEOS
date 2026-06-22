import { describe, it, expect } from 'vitest';

const BASE_URL = `http://localhost:5000`;

describe('Version API', () => {
  it('returns 200 with version and env fields', async () => {
    const res = await fetch(`${BASE_URL}/api/version`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('env');
  });
});
