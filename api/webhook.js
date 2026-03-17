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
  // 1. THE ROYAL (Added back in!)
  'Royal Portrait': 'Transform this Yorkshire Terrier into an oil painting portrait. The dog is wearing a royal crown and red velvet cape with gold trim. Renaissance style. Deep dark burgundy background. Dramatic lighting. Masterpiece painting quality. No frame. No border.',
  
  // 2. THE CEO (Your perfected version)
  'Tiny CEO': 'Transform the background into a modern high-rise corner office at golden hour. Replace the dog’s body with a sharp navy business suit and a silk tie with a bone pattern. In the foreground, place two realistic, furry canine paws resting naturally on the mahogany desk, matching the dog’s fur color. On the desk, add a brass nameplate that reads "Y. Terrier, CEO". Ensure NO human features or human hands are visible. Keep the exact face and fur texture of the dog from the upload. High-end photorealistic 8k, cinematic lighting.',
  
  // 3. THE THRONE
  'The Throne': 'Transform this Yorkshire Terrier into a photorealistic portrait. The dog is sitting upright on a white toilet like a human, holding a large open book titled "How To Be Mischievous" with tiny paws. Clean light blue background. Professional studio lighting. Dignified serious expression. The dog looks very important and unbothered. Highly detailed fur. No frame. No border.',
  
  // 4. WATERCOLOR
  'Watercolor Dream': 'Transform this Yorkshire Terrier into a beautiful watercolor painting. Soft pastel colors. Delicate brushstrokes. Clean white background. Fine art style. Dreamy atmosphere. No frame. No border.',
  
  // 5. VOGUE
  'Vogue Cover': 'Transform this Yorkshire Terrier into a high fashion magazine portrait wearing a miniature luxury designer outfit and tiny sunglasses. Professional studio lighting. Clean beige background. Vogue magazine style. Sharp focus on silky fur. No frame. No border.',
  
  // 6. DETECTIVE
  'The Detective': 'Transform this Yorkshire Terrier into a Victorian detective portrait wearing a tiny tweed deerstalker hat and small cape, holding a magnifying glass. Foggy Victorian London cobblestone street with gas lamps. Cinematic oil painting style. No frame. No border.'
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
    const photoUrl = session.metadata?.photo_url;

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
            aspect_ratio: '3:4', // Essential for showing full outfits/desks
            output_format: 'jpg',
            output_quality: 95,
            safety_tolerance: 2
          }
        }
      );
      imageUrl = Array.isArray(output) ? output[0] : output;
    } catch (err) {
      console.error('Replicate error:', err);
      imageUrl = null;
    }

    const apiInstance = new brevo.TransactionalEmailsApi();
    apiInstance.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;

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
            <p style="font-size:16px;line-height:1.7;">Thank you for your order! Your <strong>${styleName}</strong> portrait has been generated and is ready to download.</p>
            ${imageUrl ? `
            <div style="text-align:center;margin:24px 0;">
              <img src="${imageUrl}" style="max-width:100%;border-radius:12px;" alt="Your Yorkie Portrait">
            </div>
            <p style="text-align:center;margin-bottom:8px;">
              <a href="${imageUrl}" style="background:#C8853A;color:#fff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:700;display:inline-block;">Download Your Portrait</a>
            </p>
            <p style="font-size:13px;color:#888;text-align:center;">Right click the image and save. Or click the download button above.</p>
            ` : '<p>Your portrait is being generated and will arrive in a follow-up email within a few minutes.</p>'}
            <p style="font-size:13px;color:#888;margin-top:24px;border-top:1px solid #e8d9c4;padding-top:16px;">Questions? Reply to this email and we will help straight away.<br><strong>OurYorkie.com</strong></p>
          </div>
        </div>
      `
    });
  }

  res.json({ received: true });
}
