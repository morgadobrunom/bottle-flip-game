/** SMS adapter. ConsoleSms is the local/dev implementation (OTP lands in stdout). */
import type { Config } from '../config';

export interface SmsProvider {
  readonly name: string;
  send(to: string, message: string): Promise<void>;
}

export class ConsoleSms implements SmsProvider {
  readonly name = 'console';
  readonly sent: { to: string; message: string }[] = [];

  async send(to: string, message: string) {
    this.sent.push({ to, message });
    console.log(`[sms] to=${to} ${message}`);
  }
}

export class AfricasTalkingSms implements SmsProvider {
  readonly name = 'africastalking';

  constructor(
    private readonly username: string,
    private readonly apiKey: string,
    private readonly senderId?: string,
  ) {}

  private get endpoint() {
    return this.username === 'sandbox'
      ? 'https://api.sandbox.africastalking.com/version1/messaging'
      : 'https://api.africastalking.com/version1/messaging';
  }

  async send(to: string, message: string) {
    const body = new URLSearchParams({ username: this.username, to, message });
    if (this.senderId) body.set('from', this.senderId);
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { apiKey: this.apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Africa's Talking SMS failed: HTTP ${res.status}`);
    const json = (await res.json()) as { SMSMessageData?: { Recipients?: { status: string; statusCode: number }[] } };
    const recipient = json.SMSMessageData?.Recipients?.[0];
    if (!recipient || ![100, 101, 102].includes(recipient.statusCode)) {
      throw new Error(`Africa's Talking SMS rejected: ${recipient?.status ?? 'no recipient'}`);
    }
  }
}

export function createSmsProvider(config: Config): SmsProvider {
  if (config.SMS_PROVIDER === 'africastalking') {
    return new AfricasTalkingSms(config.AT_USERNAME!, config.AT_API_KEY!, config.AT_SENDER_ID);
  }
  return new ConsoleSms();
}
