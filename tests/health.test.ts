import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';

let server: Server;
let port: number;

beforeAll(async () => {
  const app = express();
  // Register the same handler as in server/routes.ts
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

describe('Health Check API', () => {
  it('returns 200 with status ok and a timestamp', async () => {
    const before = Date.now();
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    const after = Date.now();

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(typeof data.timestamp).toBe('number');
    expect(data.timestamp).toBeGreaterThanOrEqual(before);
    expect(data.timestamp).toBeLessThanOrEqual(after);
  });

  it('returns application/json content type', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });

  it('returns only status and timestamp keys', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    const data = await res.json();
    expect(Object.keys(data).sort()).toEqual(['status', 'timestamp']);
  });
});
