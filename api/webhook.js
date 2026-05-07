// api/webhook.js - Paystack payment webhook
const crypto = require('crypto');
const supabase = require('./_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Verify Paystack signature
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;

    if (event.event === 'charge.success') {
      const { reference, amount } = event.data;
      const amountInUnit = amount / 100; // kobo to naira

      // Check if already processed
      const { data: deposit } = await supabase
        .from('deposits').select('*').eq('paystack_reference', reference).single();

      if (!deposit || deposit.status === 'success') {
        return res.status(200).json({ message: 'Already processed' });
      }

      // Get wallet
      const { data: wallet } = await supabase
        .from('wallets').select('*').eq('user_id', deposit.user_id).single();
      if (!wallet) throw new Error('Wallet not found');

      const newBalance = parseFloat(wallet.balance) + amountInUnit;
      const newDeposited = parseFloat(wallet.total_deposited) + amountInUnit;

      // Credit wallet
      await supabase.from('wallets').update({
        balance: newBalance, total_deposited: newDeposited,
      }).eq('user_id', deposit.user_id);

      // Update deposit status
      await supabase.from('deposits').update({
        status: 'success', paid_at: new Date().toISOString()
      }).eq('paystack_reference', reference);

      // Record transaction
      await supabase.from('transactions').insert({
        user_id: deposit.user_id, type: 'deposit',
        amount: amountInUnit, balance_before: wallet.balance,
        balance_after: newBalance, status: 'completed',
        reference, description: 'Deposit via Paystack', currency: 'NGN',
      });

      // Notify user
      await supabase.from('notifications').insert({
        user_id: deposit.user_id, title: 'Deposit Successful! 💰',
        message: `₦${amountInUnit.toLocaleString()} has been added to your EarnHive wallet.`,
        type: 'payment',
      });

      console.log(`✅ Deposit credited: ₦${amountInUnit} to user ${deposit.user_id}`);
    }

    return res.status(200).json({ message: 'Webhook processed' });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
};
