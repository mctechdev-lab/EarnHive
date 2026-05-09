// api/wallet.js — Handles ALL deposit & withdrawal logic
// Replaces: deposit.js + withdraw.js
import { supabase } from './_supabase.js';

const NOWPAYMENTS_API = 'https://api.nowpayments.io/v1';
const NOW_KEY = process.env.NOWPAYMENTS_API_KEY;

// Paystack supported countries
const PAYSTACK_COUNTRIES = ['NG', 'GH', 'KE', 'ZA'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-firebase-uid');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const uid = req.headers['x-firebase-uid'];
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  // Get user from Supabase
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, country_iso, balance, phone')
    .eq('firebase_uid', uid)
    .single();

  if (userErr || !user) return res.status(404).json({ error: 'User not found' });

  const action = req.query.action; // ?action=deposit | ?action=withdraw | ?action=balance

  // ── GET WALLET BALANCE ──
  if (req.method === 'GET' && action === 'balance') {
    const { data: txns } = await supabase
      .from('transactions')
      .select('amount, type, status, created_at, currency, description')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    return res.status(200).json({ balance: user.balance || 0, transactions: txns || [] });
  }

  // ── DEPOSIT ──
  if (req.method === 'POST' && action === 'deposit') {
    const { amount, currency, payment_method } = req.body;

    if (!amount || amount < 1) return res.status(400).json({ error: 'Minimum deposit is $1' });

    const usePaystack = PAYSTACK_COUNTRIES.includes(user.country_iso);

    // Paystack deposit (Nigeria, Ghana, Kenya, South Africa)
    if (usePaystack || payment_method === 'paystack') {
      const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          amount: Math.round(amount * 100), // Paystack uses kobo/pesewas/cents
          currency: currency || getLocalCurrency(user.country_iso),
          metadata: {
            user_id: user.id,
            firebase_uid: uid,
            type: 'deposit',
          },
          callback_url: `${process.env.SITE_URL}/app.html?deposit=success`,
        }),
      });
      const paystackData = await paystackRes.json();
      if (!paystackData.status) return res.status(400).json({ error: paystackData.message });

      // Log pending transaction
      await supabase.from('transactions').insert({
        user_id: user.id,
        amount,
        type: 'deposit',
        status: 'pending',
        currency: currency || getLocalCurrency(user.country_iso),
        reference: paystackData.data.reference,
        gateway: 'paystack',
        description: `Deposit via Paystack`,
      });

      return res.status(200).json({
        gateway: 'paystack',
        payment_url: paystackData.data.authorization_url,
        reference: paystackData.data.reference,
      });
    }

    // NOWPayments crypto deposit (rest of world)
    const nowRes = await fetch(`${NOWPAYMENTS_API}/payment`, {
      method: 'POST',
      headers: {
        'x-api-key': NOW_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: 'usd',
        pay_currency: currency || 'ton',
        order_id: `${user.id}_${Date.now()}`,
        order_description: `EarnHive deposit for user ${user.id}`,
        ipn_callback_url: `${process.env.SITE_URL}/api/webhooks?source=nowpayments`,
      }),
    });
    const nowData = await nowRes.json();
    if (nowData.statusCode >= 400) return res.status(400).json({ error: nowData.message });

    await supabase.from('transactions').insert({
      user_id: user.id,
      amount,
      type: 'deposit',
      status: 'pending',
      currency: currency || 'TON',
      reference: nowData.payment_id,
      gateway: 'nowpayments',
      description: `Crypto deposit via NOWPayments`,
    });

    return res.status(200).json({
      gateway: 'nowpayments',
      payment_id: nowData.payment_id,
      pay_address: nowData.pay_address,
      pay_amount: nowData.pay_amount,
      pay_currency: nowData.pay_currency,
    });
  }

  // ── WITHDRAW ──
  if (req.method === 'POST' && action === 'withdraw') {
    const { amount, method, account_number, bank_code, account_name, wallet_address, currency } = req.body;

    if (!amount || amount < 1) return res.status(400).json({ error: 'Minimum withdrawal is $1' });
    if ((user.balance || 0) < amount) return res.status(400).json({ error: 'Insufficient balance' });

    const usePaystack = PAYSTACK_COUNTRIES.includes(user.country_iso);

    // Paystack withdrawal (bank transfer)
    if ((usePaystack || method === 'bank') && account_number && bank_code) {
      // Create transfer recipient
      const recipRes = await fetch('https://api.paystack.co/transferrecipient', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'nuban',
          name: account_name || 'EarnHive User',
          account_number,
          bank_code,
          currency: getLocalCurrency(user.country_iso),
        }),
      });
      const recipData = await recipRes.json();
      if (!recipData.status) return res.status(400).json({ error: recipData.message });

      // Initiate transfer
      const txRes = await fetch('https://api.paystack.co/transfer', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'balance',
          amount: Math.round(amount * 100),
          recipient: recipData.data.recipient_code,
          reason: 'EarnHive withdrawal',
        }),
      });
      const txData = await txRes.json();
      if (!txData.status) return res.status(400).json({ error: txData.message });

      // Deduct balance + log
      await supabase.from('users').update({ balance: user.balance - amount }).eq('id', user.id);
      await supabase.from('transactions').insert({
        user_id: user.id,
        amount: -amount,
        type: 'withdrawal',
        status: txData.data.status === 'success' ? 'completed' : 'pending',
        currency: getLocalCurrency(user.country_iso),
        reference: txData.data.transfer_code,
        gateway: 'paystack',
        description: `Bank withdrawal to ${account_number}`,
      });

      return res.status(200).json({ success: true, reference: txData.data.transfer_code, status: txData.data.status });
    }

    // NOWPayments crypto withdrawal (rest of world)
    const nowRes = await fetch(`${NOWPAYMENTS_API}/payout`, {
      method: 'POST',
      headers: {
        'x-api-key': NOW_KEY,
        'x-payments-key': process.env.NOWPAYMENTS_PAYOUT_KEY || NOW_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ipn_callback_url: `${process.env.SITE_URL}/api/webhooks?source=nowpayments`,
        withdrawals: [{
          address: wallet_address,
          currency: currency || 'ton',
          amount,
          ipn_callback_url: `${process.env.SITE_URL}/api/webhooks?source=nowpayments`,
        }],
      }),
    });
    const nowData = await nowRes.json();
    if (nowData.statusCode >= 400) return res.status(400).json({ error: nowData.message || 'Payout failed' });

    await supabase.from('users').update({ balance: user.balance - amount }).eq('id', user.id);
    await supabase.from('transactions').insert({
      user_id: user.id,
      amount: -amount,
      type: 'withdrawal',
      status: 'pending',
      currency: currency || 'TON',
      reference: String(nowData.id || Date.now()),
      gateway: 'nowpayments',
      description: `Crypto withdrawal to ${wallet_address}`,
    });

    return res.status(200).json({ success: true, status: 'pending', message: 'Withdrawal submitted. Processing within 24h.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

function getLocalCurrency(iso) {
  const map = { NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR' };
  return map[iso] || 'USD';
}
