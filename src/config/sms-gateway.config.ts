export interface SmsGatewayConfig {
  provider: 'HUTCH' | 'NOTIFY_LK';
  notifyLk: {
    userId: string;
    apiKey: string;
    senderId: string;
    apiUrl: string;
  };
  hutch: {
    apiUrl: string;
    username: string;
    apiKey: string;
  };
}

export const smsGatewayConfig = (): SmsGatewayConfig => ({
  provider: (process.env.SMS_GATEWAY_PROVIDER as any) || 'HUTCH',
  notifyLk: {
    userId: process.env.NOTIFY_USER_ID || '',
    apiKey: process.env.NOTIFY_API_KEY || '',
    senderId: process.env.NOTIFY_SENDER_ID || 'NotifyDEMO',
    apiUrl: process.env.NOTIFY_API_URL || 'https://app.notify.lk/api/v1/send',
  },
  hutch: {
    apiUrl: process.env.HUTCH_API_URL || 'https://api.hutch.lk/v1/send',
    username: process.env.HUTCH_USERNAME || 'hutch_user',
    apiKey: process.env.HUTCH_API_KEY || 'hutch_key',
  },
});
