/**
 * Safaricom data/airtime adapter. Stub is idempotent on `reference` (the reward id).
 * Swap for the partner API without touching job code.
 */
import type { Config } from '../config';

export interface CreditResult {
  providerRef: string;
}

/** Credits a Safaricom line. `reference` is idempotent: the same reward id must never credit twice. */
export interface CreditProvider {
  readonly name: string;
  creditData(phone: string, amountMb: number, reference: string): Promise<CreditResult>;
  creditAirtime(phone: string, amountKes: number, reference: string): Promise<CreditResult>;
}

export class StubCreditProvider implements CreditProvider {
  readonly name = 'stub';
  readonly credited = new Map<string, { phone: string; kind: 'data' | 'airtime'; amount: number }>();

  constructor(private readonly failNext = 0) {}

  private failures = 0;

  private record(reference: string, entry: { phone: string; kind: 'data' | 'airtime'; amount: number }) {
    if (this.failures < this.failNext) {
      this.failures++;
      throw new Error('Stub credit provider: simulated failure');
    }
    if (!this.credited.has(reference)) this.credited.set(reference, entry);
    return { providerRef: `stub-${reference}` };
  }

  async creditData(phone: string, amountMb: number, reference: string) {
    return this.record(reference, { phone, kind: 'data', amount: amountMb });
  }

  async creditAirtime(phone: string, amountKes: number, reference: string) {
    return this.record(reference, { phone, kind: 'airtime', amount: amountKes });
  }
}

export function createCreditProvider(_config: Config): CreditProvider {
  return new StubCreditProvider();
}
