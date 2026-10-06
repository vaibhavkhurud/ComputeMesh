import { Injectable, OnModuleInit } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeService implements OnModuleInit {
  private stripeClient!: Stripe;

  onModuleInit() {
    const secretKey = process.env.STRIPE_TEST_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_TEST_SECRET_KEY is missing from environment configuration');
    }

    // Initialize Stripe client
    this.stripeClient = new Stripe(secretKey, {
      apiVersion: '2026-09-30.endive',
      typescript: true,
    });
  }

  /**
   * Exposes the internal Stripe client for use in future M13-B phases.
   */
  public getClient(): Stripe {
    return this.stripeClient;
  }
}
