import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { style, photoUrl, email } = req.body;

  if (!style || !photoUrl) {
    return res.status(400).json({ error: 'Missing style or photo URL' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Yorkie Portrait — ${style}`,
            description: 'Custom AI portrait delivered to your email within minutes.',
            images: ['https://ouryorkie.com/wp-content/uploads/2026/03/Royal-Portrait.jpg'],
          },
          unit_amount: 1900, // $19.00
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: email || undefined,
      metadata: {
        style: style,
        photo_url: photoUrl,
      },
      success_url: 'https://ouryorkie.com/portrait-success/',
      cancel_url: 'https://ouryorkie.com/yorkie-portraits/',
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe session error:', err);
    res.status(500).json({ error: err.message });
  }
}
