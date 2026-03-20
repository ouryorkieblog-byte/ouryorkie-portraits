import Stripe from 'stripe';

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { style, photoUrl } = req.body;
    console.log('Creating checkout for:', style, photoUrl);

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Yorkie Portrait. ' + style },
          unit_amount: 1900,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: 'https://ouryorkie.com/portrait-success',
      cancel_url: 'https://ouryorkie.com/yorkie-portraits',
      metadata: { style: style, photo_url: photoUrl },
    });

    console.log('Session created:', session.id);
    res.json({ url: session.url });
  } catch(err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
