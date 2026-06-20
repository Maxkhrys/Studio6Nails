/// <reference path="../.astro/types.d.ts" />

import type { SupabaseClient, User } from '@supabase/supabase-js';

export type AppRole = 'client' | 'staff' | 'owner';

export interface AppProfile {
  id: string;
  role: AppRole;
  full_name: string | null;
  phone: string | null;
}

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient | null;
      user: User | null;
      profile: AppProfile | null;
    }
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly STRIPE_SECRET_KEY: string;
  readonly STRIPE_WEBHOOK_SECRET: string;
  readonly RESEND_API_KEY: string;
  readonly BOOKING_FROM_EMAIL: string;
  readonly BOOKING_NOTIFY_EMAIL: string;
  readonly PAYMENTS_PROVIDER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
