// api/webhooks.js — Handles ALL incoming payment webhooks
// Replaces: webhook.js (Paystack) + nowpayments-webhook.js (NOWPayments)
import { supabase } from './_supabase.js';
import crypto from 'crypto';

// Disable body parsing for raw signature verification
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const source = req.query.source; // ?source=paystack | ?source=nowpayments
  const rawBody = await getRawBody(req);
  let payload;

  try { payload = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'Invalid JSON payload' }); }

  // ── PAYSTACK WEBHOOK ──
  if (source === 'paystack' || req.headers['x-paystack-signature']) {
    const sig = req.headers['x-paystack-signature'];
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

    if (hash !== sig) {
      console.error('Invalid Paystack signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = payload.event;
    const data = payload.data;

    // ── CHARGE SUCCESS (deposit confirmed) ──
    if (event === 'charge.success') {
      const ref = data.reference;
      const amountPaid = data.amount / 100; // Convert kobo → main unit
      const meta = data.metadata || {};

      // Find pending transaction by reference
      const { data: txn } = await supabase
        .from('transactions')
        .select('id, user_id, amount, status')
        .eq('reference', ref)
        .single();

      if (!txn || txn.status === 'completed') return res.status(200).json({ received: true });

      // Mark transaction completed
      await supabase.from('transactions').update({ status: 'completed' }).eq('id', txn.id);

      // Credit user wallet
      const { data: user } = await supabase.from('users').select('id, balance').eq('id', txn.user_id).single();
      if (user) {
        await supabase.from('users').update({ balance: (user.balance || 0) + amountPaid }).eq('id', user.id);
        // Notify user
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: '💰 Deposit Confirmed!',
          message: `$${amountPaid.toFixed(2)} has been added to your EarnHive wallet.`,
          type: 'deposit',
        });
      }
    }

    // ── TRANSFER SUCCESS (withdrawal confirmed) ──
    if (event === 'transfer.success') {
      const ref = data.transfer_code;
      await supabase.from('transactions').update({ status: 'completed' }).eq('reference', ref);

      // Notify user
      const { data: txn } = await supabase.from('transactions').select('user_id, amount').eq('reference', ref).single();
      if (txn) {
        await supabase.from('notifications').insert({
          user_id: txn.user_id,
          title: '✅ Withdrawal Sent!',
          message: `Your withdrawal of $${Math.abs(txn.amount).toFixed(2)} has been sent to your bank.`,
          type: 'withdrawal',
        });
      }
    }

    // ── TRANSFER FAILED (withdrawal failed) ──
    if (event === 'transfer.failed' || event === 'transfer.reversed') {
      const ref = data.transfer_code;
      const { data: txn } = await supabase
        .from('transactions').select('user_id, amount').eq('reference', ref).single();

      if (txn) {
        // Refund the balance
        const { data: user } = await supabase.from('users').select('balance').eq('id', txn.user_id).single();
        if (user) {
          await supabase.from('users').update({ balance: (user.balance || 0) + Math.abs(txn.amount) }).eq('id', txn.user_id);
        }
        await supabase.from('transactions').update({ status: 'failed' }).eq('reference', ref);
        await supabase.from('notifications').insert({
          user_id: txn.user_id,
          title: '❌ Withdrawal Failed',
          message: `Your withdrawal failed. Your balance has been refunded. Please try again.`,
          type: 'error',
        });
      }
    }

    return res.status(200).json({ received: true });
  }

  // ── NOWPAYMENTS WEBHOOK ──
  if (source === 'nowpayments' || req.headers['x-nowpayments-sig']) {
    const sig = req.headers['x-nowpayments-sig'];
    const secret = process.env.NOWPAYMENTS_IPN_SECRET;

    // Verify NOWPayments HMAC signature
    const sorted = JSON.stringify(sortObject(payload));
    const hmac = crypto.createHmac('sha512', secret).update(sorted).digest('hex');

    if (hmac !== sig) {
      console.error('Invalid NOWPayments signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { payment_id, payment_status, price_amount, order_id, outcome_amount, outcome_currency } = payload;

    // Completed statuses
    const completedStatuses = ['finished', 'confirmed', 'complete'];
    const failedStatuses = ['failed', 'refunded', 'expired'];

    if (completedStatuses.includes(payment_status)) {
      // Find transaction by reference (payment_id)
      const { data: txn } = await supabase
        .from('transactions')
        .select('id, user_id, amount, type, status')
        .eq('reference', String(payment_id))
        .single();

      if (!txn || txn.status === 'completed') return res.status(200).json({ received: true });

      await supabase.from('transactions').update({ status: 'completed' }).eq('id', txn.id);

      // Get user
      const { data: user } = await supabase.from('users').select('id, balance').eq('id', txn.user_id).single();

      if (user) {
        if (txn.type === 'deposit') {
          // Credit wallet
          await supabase.from('users').update({ balance: (user.balance || 0) + txn.amount }).eq('id', user.id);
          await supabase.from('notifications').insert({
            user_id: user.id,
            title: '💎 Crypto Deposit Confirmed!',
            message: `$${txn.amount.toFixed(2)} worth of crypto received. Funds added to your wallet.`,
            type: 'deposit',
          });
        } else if (txn.type === 'withdrawal') {
          // Withdrawal already deducted at request time — just notify
          await supabase.from('notifications').insert({
            user_id: user.id,
            title: '✅ Crypto Withdrawal Sent!',
            message: `${outcome_amount} ${outcome_currency?.toUpperCase()} sent to your wallet successfully.`,
            type: 'withdrawal',
          });
        }
      }
    }

    if (failedStatuses.includes(payment_status)) {
      const { data: txn } = await supabase
        .from('transactions')
        .select('id, user_id, amount, type')
        .eq('reference', String(payment_id))
        .single();

      if (txn) {
        await supabase.from('transactions').update({ status: 'failed' }).eq('id', txn.id);

        // Refund if it was a withdrawal
        if (txn.type === 'withdrawal') {
          const { data: user } = await supabase.from('users').select('balance').eq('id', txn.user_id).single();
          if (user) {
            await supabase.from('users').update({ balance: (user.balance || 0) + Math.abs(txn.amount) }).eq('id', txn.user_id);
          }
        }

        await supabase.from('notifications').insert({
          user_id: txn.user_id,
          title: '❌ Payment Failed',
          message: `A crypto payment (${payment_status}) could not be completed. Please try again.`,
          type: 'error',
        });
      }
    }

    return res.status(200).json({ received: true });
  }

  return res.status(400).json({ error: 'Unknown webhook source. Use ?source=paystack or ?source=nowpayments' });
}

// NOWPayments requires sorted JSON for signature verification
function sortObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortObject);
  return Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = sortObject(obj[key]);
    return acc;
  }, {});
}
