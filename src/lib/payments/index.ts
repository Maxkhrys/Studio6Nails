import type { PaymentProvider } from './types';
import { stripeProvider } from './stripe';

/* ---------------------------------------------------------------------------
   Active payment provider selector.

   The whole app imports `paymentProvider` from here. To add Dojo later:
     1. create ./dojo.ts implementing PaymentProvider
     2. switch on an env flag (e.g. PAYMENTS_PROVIDER) below
   No booking/route code needs to change.
   --------------------------------------------------------------------------- */

const PROVIDER = import.meta.env.PAYMENTS_PROVIDER ?? 'stripe';

function select(): PaymentProvider {
  switch (PROVIDER) {
    case 'stripe':
      return stripeProvider;
    // case 'dojo':
    //   return dojoProvider; // future: in-person Pay-at-Counter
    default:
      return stripeProvider;
  }
}

export const paymentProvider: PaymentProvider = select();
export type { PaymentProvider } from './types';
