import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { style, photoUrl } = req.body;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: `Yorkie Portrait. ${style}` },
        unit_amount: 1900,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: 'https://ouryorkie.com/portrait-success',
    cancel_url: 'https://ouryorkie.com/yorkie-portraits',
    metadata: { style, photo_url: photoUrl },
  });

  res.json({ url: session.url });
}
