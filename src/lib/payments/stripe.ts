import Stripe from 'stripe';
import type {
  PaymentProvider,
  DepositCheckoutInput,
  CheckoutResult,
  PaymentConfirmation,
} from './types';

/* ---------------------------------------------------------------------------
   Stripe adapter — implements PaymentProvider with Stripe Checkout.
   Keep ALL Stripe specifics inside this file.
   --------------------------------------------------------------------------- */

function client(): Stripe {
  const key = import.meta.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key);
}

export const stripeProvider: PaymentProvider = {
  id: 'stripe',

  async createDepositCheckout(input: DepositCheckoutInput): Promise<CheckoutResult> {
    const stripe = client();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Cards, Apple Pay and Google Pay are offered automatically based on
      // the Stripe account's settings.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: input.amountCents,
            product_data: {
              name: input.description,
              description: 'Studio 6 Nails — booking deposit',
            },
          },
        },
      ],
      customer_email: input.customerEmail,
      // The booking id is the source of truth for the webhook.
      client_reference_id: input.bookingId,
      metadata: { booking_id: input.bookingId },
      payment_intent_data: { metadata: { booking_id: input.bookingId } },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });

    if (!session.url) throw new Error('Stripe did not return a checkout URL');
    return { url: session.url, reference: session.id };
  },

  async parseWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<PaymentConfirmation | null> {
    const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    if (!signature) throw new Error('Missing stripe-signature header');

    const stripe = client();
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    if (event.type !== 'checkout.session.completed') return null;

    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = session.client_reference_id ?? session.metadata?.booking_id;
    if (!bookingId) return null;

    return {
      bookingId,
      reference:
        typeof session.payment_intent === 'string' ? session.payment_intent : session.id,
      amountCents: session.amount_total ?? 0,
      paid: session.payment_status === 'paid',
    };
  },
};
