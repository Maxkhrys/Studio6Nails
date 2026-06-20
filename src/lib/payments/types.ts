/* ---------------------------------------------------------------------------
   Payment provider abstraction.

   The booking flow only ever talks to this interface — never to Stripe (or,
   later, Dojo) directly. Swapping or adding a provider means writing a new
   adapter that satisfies `PaymentProvider`; the booking code does not change.

   Today: Stripe Checkout for online deposits.
   Future: a Dojo adapter for in-person balance via their Pay-at-Counter /
   Terminals API (needs the client's live merchant credentials).
   --------------------------------------------------------------------------- */

export interface DepositCheckoutInput {
  /** Our booking row id — round-tripped so the webhook can mark it paid. */
  bookingId: string;
  /** Amount to charge now, in euro cents. */
  amountCents: number;
  /** Human label shown on the hosted checkout, e.g. "Deposit — Gel Manicure". */
  description: string;
  customerEmail?: string;
  /** Absolute URLs to return to after success / cancel. */
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  /** Redirect the browser here to take payment. */
  url: string;
  /** Provider's own session/reference id. */
  reference: string;
}

export interface PaymentConfirmation {
  bookingId: string;
  reference: string;
  amountCents: number;
  paid: boolean;
}

export interface PaymentProvider {
  readonly id: 'stripe' | 'dojo';
  /** Create a hosted checkout for a deposit and return the redirect URL. */
  createDepositCheckout(input: DepositCheckoutInput): Promise<CheckoutResult>;
  /**
   * Verify an incoming webhook (signature etc.) and, if it represents a
   * successful payment, return the confirmation. Returns null for events we
   * don't act on.
   */
  parseWebhook(rawBody: string, signature: string | null): Promise<PaymentConfirmation | null>;
}
