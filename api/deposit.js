// api/deposit.js
const https = require('https');
const supabase = require('./_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-firebase-uid');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { firebase_uid, amount, currency, email, method } = req.body;
    if (!firebase_uid || !amount || !email) return res.status(400).json({ error: 'Missing required fields' });
    if (amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    // Get user
    const { data: user } = await supabase.from('users').select('id').eq('firebase_uid', firebase_uid).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const depositMethod = method || 'paystack';

    // ── PAYSTACK ──
    if (depositMethod === 'paystack') {
      if (amount < 100) return res.status(400).json({ error: 'Minimum deposit is ₦100' });

      const reference = `EH_DEP_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      const paystackData = JSON.stringify({
        email,
        amount: Math.round(amount * 100), // kobo
        reference,
        callback_url: `${process.env.APP_URL || 'https://earn-hive-six.vercel.app'}/app.html`,
        metadata: { user_id: user.id, firebase_uid, type: 'deposit' },
      });

      const paystackRes = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.paystack.co',
          port: 443,
          path: '/transaction/initialize',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(paystackData),
          },
        };
        const r = https.request(options, (resp) => {
          let data = '';
          resp.on('data', chunk => data += chunk);
          resp.on('end', () => resolve(JSON.parse(data)));
        });
        r.on('error', reject);
        r.write(paystackData);
        r.end();
      });

      if (!paystackRes.status) throw new Error('Paystack initialization failed');

      await supabase.from('deposits').insert({
        user_id: user.id, amount, currency: 'NGN', method: 'paystack',
        paystack_reference: reference,
        paystack_access_code: paystackRes.data.access_code,
        status: 'pending',
      });

      return res.status(200).json({
        success: true,
        method: 'paystack',
        authorization_url: paystackRes.data.authorization_url,
        access_code: paystackRes.data.access_code,
        reference,
      });
    }

    // ── NOWPAYMENTS (TON, USDT, BTC etc) ──
    if (['ton', 'usdt', 'btc', 'eth', 'usdc', 'nowpayments'].includes(depositMethod)) {
      const payCurrency = depositMethod === 'nowpayments' ? 'ton' : depositMethod;

      const nowData = JSON.stringify({
        price_amount: amount,
        price_currency: currency || 'usd',
        pay_currency: payCurrency,
        order_id: `EH_${Date.now()}`,
        order_description: `EarnHive wallet deposit for ${email}`,
        ipn_callback_url: `${process.env.APP_URL || 'https://earn-hive-six.vercel.app'}/api/nowpayments-webhook`,
      });

      const nowRes = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.nowpayments.io',
          port: 443,
          path: '/v1/payment',
          method: 'POST',
          headers: {
            'x-api-key': process.env.NOWPAYMENTS_API_KEY,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(nowData),
          },
        };
        const r = https.request(options, (resp) => {
          let data = '';
          resp.on('data', chunk => data += chunk);
          resp.on('end', () => resolve(JSON.parse(data)));
        });
        r.on('error', reject);
        r.write(nowData);
        r.end();
      });

      if (nowRes.payment_status === 'waiting' || nowRes.pay_address) {
        await supabase.from('deposits').insert({
          user_id: user.id, amount, currency: currency || 'usd',
          method: payCurrency, nowpayments_id: nowRes.payment_id,
          pay_address: nowRes.pay_address, status: 'pending',
        });

        return res.status(200).json({
          success: true,
          method: payCurrency,
          pay_address: nowRes.pay_address,
          pay_amount: nowRes.pay_amount,
          pay_currency: nowRes.pay_currency,
          payment_id: nowRes.payment_id,
          payment_url: `https://nowpayments.io/payment/?iid=${nowRes.payment_id}`,
        });
      } else {
        throw new Error(nowRes.message || 'NOWPayments initialization failed');
      }
    }

    return res.status(400).json({ error: 'Invalid payment method' });

  } catch (error) {
    console.error('Deposit error:', error);
    return res.status(500).json({ error: error.message });
  }
};
