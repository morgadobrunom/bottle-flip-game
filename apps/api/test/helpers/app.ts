import type { SessionResponse } from '@bottle-flip/shared';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { StubCreditProvider } from '../../src/providers/credit';
import { ConsoleSms } from '../../src/providers/sms';
import { MemoryQueue } from '../../src/queue';
import { createTestDb } from './db';

export async function createTestApp() {
  const t = await createTestDb();
  const sms = new ConsoleSms();
  const queue = new MemoryQueue();
  const credit = new StubCreditProvider();
  const clock = { now: new Date('2026-10-07T09:00:00+03:00') };
  const config = loadConfig({ NODE_ENV: 'test', APP_ENV: 'test' });
  const app = await buildApp({ db: t.db, config, sms, credit, queue, now: () => clock.now });
  return { app, sms, queue, credit, clock, config, ...t, close: async () => (await app.close(), await t.close()) };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

export class Client {
  token = '';
  refreshCookie = '';

  constructor(private readonly app: FastifyInstance) {}

  async call<T = unknown>(method: InjectOptions['method'], url: string, payload?: object) {
    const res = await this.app.inject({
      method,
      url,
      payload,
      headers: {
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        ...(this.refreshCookie ? { cookie: `bf_refresh=${this.refreshCookie}` } : {}),
      },
    });
    const setCookie = res.cookies.find((c) => c.name === 'bf_refresh');
    if (setCookie) this.refreshCookie = setCookie.value;
    return { status: res.statusCode, body: res.json() as T };
  }

  async anonymous() {
    const res = await this.call<SessionResponse>('POST', '/sessions/device');
    this.token = res.body.accessToken;
    return res.body;
  }
}

export function lastCode(sms: ConsoleSms): string {
  const msg = sms.sent.at(-1)?.message ?? '';
  return /(\d{6})/.exec(msg)?.[1] ?? '';
}
