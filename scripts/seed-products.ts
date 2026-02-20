import { getUncachableStripeClient } from '../server/stripeClient';

async function seedProducts() {
  const stripe = await getUncachableStripeClient();

  const existing = await stripe.products.search({ query: "name:'LYFEOS Pro'" });
  if (existing.data.length > 0) {
    console.log('Products already exist, skipping seed.');
    for (const product of existing.data) {
      const prices = await stripe.prices.list({ product: product.id, active: true });
      console.log(`  ${product.name} (${product.id})`);
      for (const price of prices.data) {
        console.log(`    Price: ${price.id} - $${(price.unit_amount || 0) / 100}/${price.recurring?.interval || 'one-time'}`);
      }
    }
    return;
  }

  console.log('Creating LYFEOS Pro subscription product...');
  const proProduct = await stripe.products.create({
    name: 'LYFEOS Pro',
    description: 'Unlock the full power of your Life Operating System. Unlimited AI conversations, advanced analytics, priority support, and exclusive features.',
    metadata: {
      tier: 'pro',
      features: 'unlimited_ai,advanced_analytics,priority_support,custom_themes,data_export',
    },
  });

  const monthlyPrice = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 999,
    currency: 'usd',
    recurring: { interval: 'month' },
  });

  const yearlyPrice = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 7999,
    currency: 'usd',
    recurring: { interval: 'year' },
  });

  console.log('Created LYFEOS Pro product:', proProduct.id);
  console.log('  Monthly price:', monthlyPrice.id, '- $9.99/month');
  console.log('  Yearly price:', yearlyPrice.id, '- $79.99/year');
}

seedProducts().catch(console.error);
