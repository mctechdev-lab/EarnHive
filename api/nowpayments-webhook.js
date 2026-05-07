// api/nowpayments-webhook.js
const crypto = require('crypto');
const supabase = require('./_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Verify NOWPayments IPN signature
    const sig = req.headers['x-nowpayments-sig'];
    if (sig) {
      const sortedBody = JSON.stringify(
        Object.keys(req.body).sort().reduce((r, k) => { r[k] = req.body[k]; return r; }, {})
      );
      const expectedSig = crypto
        .createHmac('sha512', process.env.NOWPAYMENTS_IPN_SECRET)
        .update(sortedBody).digest('hex');
      if (sig !== expectedSig) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const { payment_id, payment_status, price_amount, pay_currency, actually_paid } = req.body;

    // Only process confirmed/finished payments
    if (!['confirmed', 'finished'].includes(payment_status)) {
      return res.status(200).json({ message: `Status: ${payment_status} — not yet confirmed` });
    }

    // Find deposit
    const { data: deposit } = await supabase
      .from('deposits').select('*').eq('nowpayments_id', payment_id.toString()).single();

    if (!deposit || deposit.status === 'success') {
      return res.status(200).json({ message: 'Already processed or not found' });
    }

    const amount = parseFloat(price_amount);

    // Get wallet
    const { data: wallet } = await supabase
      .from('wallets').select('*').eq('user_id', deposit.user_id).single();
    if (!wallet) throw new Error('Wallet not found');

    const newBalance = parseFloat(wallet.balance) + amount;
    const newDeposited = parseFloat(wallet.total_deposited) + amount;

    // Credit wallet
    await supabase.from('wallets').update({
      balance: newBalance, total_deposited: newDeposited,
    }).eq('user_id', deposit.user_id);

    // Update deposit
    await supabase.from('deposits').update({
      status: 'success', paid_at: new Date().toISOString()
    }).eq('nowpayments_id', payment_id.toString());

    // Record transaction
    await supabase.from('transactions').insert({
      user_id: deposit.user_id, type: 'deposit',
      amount, balance_before: wallet.balance, balance_after: newBalance,
      status: 'completed', reference: `NP_${payment_id}`,
      description: `Crypto deposit via NOWPayments (${pay_currency?.toUpperCase()})`,
      currency: pay_currency?.toUpperCase() || 'TON',
    });

    // Notify user
    await supabase.from('notifications').insert({
      user_id: deposit.user_id, title: 'Crypto Deposit Confirmed! 💎',
      message: `$${amount} worth of ${pay_currency?.toUpperCase()} has been added to your EarnHive wallet.`,
      type: 'payment',
    });

    console.log(`✅ Crypto deposit confirmed: $${amount} (${pay_currency}) to user ${deposit.user_id}`);
    return res.status(200).json({ message: 'Payment processed' });

  } catch (error) {
    console.error('NOWPayments webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
};
