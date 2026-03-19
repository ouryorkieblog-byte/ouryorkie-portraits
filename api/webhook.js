import Stripe from 'stripe';
import Replicate from 'replicate';

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

const stylePrompts = {
  'Royal Portrait': 'Transform this Yorkshire Terrier into an oil painting portrait. The dog is wearing a royal crown and red velvet cape with gold trim. Renaissance style. Deep dark burgundy background. Dramatic lighting. Masterpiece painting quality. Highly detailed silky fur. No frame. No border.',
  'The Executive': 'Transform this Yorkshire Terrier into a professional corporate portrait. The dog is wearing a sharp business suit and tie, sitting behind a mahogany executive desk. Confident expression. Blurred modern office background. Photorealistic style. No frame. No border.',
  'The Throne': 'Transform this Yorkshire Terrier into a photorealistic portrait sitting upright on a white toilet like a human, holding a large open book titled "How To Be Mischievous". Clean light blue background. Professional studio lighting. Dignified serious expression. No frame. No border.',
  'Watercolor Dream': 'Transform this Yorkshire Terrier into a beautiful watercolor painting. Soft pastel colors. Delicate brushstrokes. Clean white background. Fine art style. Dreamy atmosphere. No frame. No border.',
  'Vogue Cover': 'Transform this Yorkshire Terrier into a high fashion editorial portrait. The dog is wearing oversized black designer sunglasses and a small silk scarf. White studio backdrop. Dramatic lighting. Vogue magazine style. No frame. No border.',
  'The Detective': 'Transform this Yorkshire Terrier into a Victorian detective portrait wearing a tiny tweed deerstalker hat and small cape, holding a magnifying glass. Foggy Victorian London cobblestone street with gas lamps. Cinematic oil painting style. No frame. No border.',
  'The Duchess': 'Transform this Yorkshire Terrier into a classical oil painting portrait. The dog is wearing a soft rose gold crown with small pearls, draped in an ivory and champagne velvet cape. Pearl necklace. Warm candlelit background with antique gold tones. Old master painting style. No frame. No border.',
  'Boss Babe': 'Transform this Yorkshire Terrier into a photorealistic professional portrait. The dog is wearing a fitted blush pink blazer with gold button details. Clean cream studio background. Soft natural window light. Confident head tilt. Professional headshot style. No frame. No border.',
  'Spa Girlie': 'Transform this Yorkshire Terrier into a photorealistic spa day portrait. The dog is sitting upright wearing a fluffy white spa robe with a white towel turban on its head and cucumber slices in front of its eyes. Soft pastel pink marble bathroom background with candles. No frame. No border.',
  'Main Character': 'Transform this Yorkshire Terrier into a high fashion editorial portrait. The dog is wearing oversized black designer sunglasses and a small silk caramel scarf. White seamless studio backdrop. Dramatic high contrast lighting. Vogue magazine composition. No frame. No border.',
  'Little Princess': 'Transform this Yorkshire Terrier into a fantasy princess portrait. The dog is wearing a delicate miniature tiara with pink gemstones and tiny pearls, wrapped in a soft blush pink and gold satin mini cape. Dreamy bokeh background with warm golden light and floating rose petals. No frame. No border.',
  'Watercolor Feminine': 'Transform this Yorkshire Terrier into a beautiful feminine watercolor painting. Soft blush pink and lavender pastel colors. Delicate brushstrokes. Small flowers woven into the fur. Clean white background. Fine art style. No frame. No border.'
};

async function sendEmailWithBrevo(to, subject, htmlContent) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: 'OurYorkie.com', email: 'hello@ouryorkie.com' },
      to: [{ email: to }],
      subject: subject,
      htmlContent: htmlContent
    })
  });
  return response.json();
}

export default async function handler(req, res) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send('Webhook error: ' + err.message);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details?.email;
    const styleName = session.metadata?.style || 'Royal Portrait';
    const photoUrl = session.metadata?.photo_url;

    console.log('Payment received:', { customerEmail, styleName, photoUrl });

    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
    const prompt = stylePrompts[styleName] || stylePrompts['Royal Portrait'];

    let imageUrl;
    try {
      const output = await replicate.run(
        'black-forest-labs/flux-kontext-pro',
        {
          input: {
            prompt: prompt,
            input_image: photoUrl,
            aspect_ratio: '2:3',
            output_format: 'jpg',
            output_quality: 90,
            safety_tolerance: 2
          }
        }
      );
      imageUrl = Array.isArray(output) ? output[0] : output;
      console.log('Portrait generated:', imageUrl);
    } catch (err) {
      console.error('Replicate error:', err);
      imageUrl = null;
    }

    try {
      await sendEmailWithBrevo(
        customerEmail,
        'Your Yorkie Portrait is Ready! 🐾',
        `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2C1810;">
          <div style="background:#2C1810;padding:32px;text-align:center;">
            <h1 style="font-family:Georgia,serif;color:#fff;margin:0;">Your Yorkie Portrait<br><em style="color:#E8B87A;">is Ready!</em></h1>
          </div>
          <div style="padding:32px;background:#fffaf5;">
            <p style="font-size:16px;line-height:1.7;">Thank you for your order! Your <strong>${styleName}</strong> portrait has been generated.</p>
            ${imageUrl ? `
            <div style="text-align:center;margin:24px 0;">
              <img src="${imageUrl}" style="max-width:100%;border-radius:12px;" alt="Your Yorkie Portrait">
            </div>
            <p style="text-align:center;">
              <a href="${imageUrl}" style="background:#C8853A;color:#fff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:700;display:inline-block;">Download Your Portrait</a>
            </p>
            ` : '<p>Your portrait is being generated and will arrive shortly.</p>'}
            <p style="font-size:13px;color:#888;margin-top:24px;border-top:1px solid #e8d9c4;padding-top:16px;">Questions? Reply to this email.<br><strong>OurYorkie.com</strong></p>
          </div>
        </div>
        `
      );
      console.log('Email sent to:', customerEmail);
    } catch (err) {
      console.error('Brevo error:', err);
    }
  }

  res.json({ received: true });
}
