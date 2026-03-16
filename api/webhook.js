import Stripe from 'stripe';
import Replicate from 'replicate';
import * as brevo from '@getbrevo/brevo';

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

const stylePrompts = {
  'Royal Portrait': 'oil painting portrait of a Yorkshire Terrier dog wearing a royal crown and velvet cape, renaissance style, gold ornate frame, dramatic lighting, masterpiece painting, highly detailed',
  'The Throne': 'funny illustration of a Yorkshire Terrier dog sitting on a toilet reading a newspaper, cartoon style, warm bathroom setting, humorous, detailed illustration',
  'Tiny CEO': 'portrait of a Yorkshire Terrier dog wearing a business suit and tie, sitting behind a mahogany desk, professional corporate photo, confident expression, office background',
  'Watercolor Dream': 'beautiful watercolor painting of a Yorkshire Terrier dog, soft pastel colors, delicate brushstrokes, artistic, dreamy background, fine art style',
  'Renaissance Angel': 'Yorkshire Terrier dog painted as a cherub angel in a classical Renaissance painting style, dramatic clouds, golden light, Raphael style, museum quality',
  'Wanted Poster': 'old wild west wanted poster featuring a Yorkshire Terrier dog, sepia tones, vintage paper texture, bold text, sheriff star, western style illustration'
};

export default async function handler(req, res) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send('Webhook error: ' + err.message);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details.email;
    const styleName = session.metadata?.style || 'Royal Portrait';

    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
    const prompt = stylePrompts[styleName] || stylePrompts['Royal Portrait'];
    
    let imageUrl;
    try {
      // FIX 1: Using the more reliable model string and await output
      const output = await replicate.run(
        "stability-ai/stable-diffusion-3",
        { input: { prompt: prompt } }
      );
      imageUrl = Array.isArray(output) ? output[0] : output;
    } catch (err) {
      console.error('Replicate error:', err);
      imageUrl = null;
    }

    // FIX 2: Correcting the Brevo API initialization
    const apiInstance = new brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(0, process.env.BREVO_API_KEY); 

    try {
      await apiInstance.sendTransacEmail({
        sender: { name: 'OurYorkie.com', email: 'hello@ouryorkie.com' },
        to: [{ email: customerEmail }],
        subject: 'Your Yorkie Portrait is Ready! 🐾',
        htmlContent: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2C1810;">
            <div style="background:#2C1810;padding:32px;text-align:center;">
              <h1 style="font-family:Georgia,serif;color:#fff;margin:0;">Your Yorkie Portrait<br><em style="color:#E8B87A;">is Ready!</em></h1>
            </div>
            <div style="padding:32px;background:#fffaf5;">
              <p style="font-size:16px;line-height:1.7;">Thank you for your order! Your <strong>${styleName}</strong> portrait has been generated.</p>
              ${imageUrl ? `<div style="text-align:center;margin:24px 0;"><img src="${imageUrl}" style="max-width:100%;border-radius:12px;border:3px solid #C8853A;" alt="Your Yorkie Portrait"></div><p style="text-align:center;"><a href="${imageUrl}" style="background:#C8853A;color:#fff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:700;display:inline-block;">Download Your Portrait</a></p>` : '<p>Your portrait is being generated and will arrive shortly in a follow-up email.</p>'}
              <p style="font-size:13px;color:#888;margin-top:24px;">Questions? Reply to this email and we will help straight away.<br>OurYorkie.com</p>
            </div>
          </div>
        `
      });
    } catch (emailErr) {
      console.error('Brevo error:', emailErr);
    }
  }

  res.json({ received: true });
}
