// api/withdraw.js
const supabase = require('./_supabase');

const WITHDRAWAL_FEE_NGN = 15;
const MIN_WITHDRAWAL_USD = 1;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-firebase-uid');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { firebase_uid, amount, method, bank_name, account_number, account_name, crypto_address, crypto_currency } = req.body;

    if (!firebase_uid || !amount || !method) return res.status(400).json({ error: 'Missing required fields' });
    if (amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    // Get user
    const { data: user } = await supabase.from('users').select('id, first_name, last_name').eq('firebase_uid', firebase_uid).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get wallet
    const { data: wallet } = await supabase.from('wallets').select('*').eq('user_id', user.id).single();
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

    // Calculate fee
    const fee = method === 'bank' ? WITHDRAWAL_FEE_NGN : 0;
    const totalDeduction = parseFloat(amount) + fee;

    // Check balance
    if (parseFloat(wallet.balance) < totalDeduction) {
      return res.status(400).json({
        error: `Insufficient balance. Need ${totalDeduction.toFixed(2)} but have ${parseFloat(wallet.balance).toFixed(2)}`,
        required: totalDeduction, available: wallet.balance,
      });
    }

    // Validate method-specific fields
    if (method === 'bank' && (!bank_name || !account_number || !account_name)) {
      return res.status(400).json({ error: 'Bank name, account number and account name are required' });
    }
    if (['ton', 'usdt', 'btc', 'crypto'].includes(method) && !crypto_address) {
      return res.status(400).json({ error: 'Crypto wallet address is required' });
    }

    // Check no existing pending withdrawal
    const { data: pending } = await supabase.from('withdrawals').select('id').eq('user_id', user.id).eq('status', 'pending').single();
    if (pending) return res.status(400).json({ error: 'You already have a pending withdrawal. Wait for it to be processed.' });

    const netAmount = parseFloat(amount) - fee;
    const newBalance = parseFloat(wallet.balance) - totalDeduction;

    // Deduct from wallet
    await supabase.from('wallets').update({
      balance: newBalance,
      total_withdrawn: parseFloat(wallet.total_withdrawn) + parseFloat(amount),
    }).eq('user_id', user.id);

    // Create withdrawal record
    const { data: withdrawal } = await supabase.from('withdrawals').insert({
      user_id: user.id, amount, fee, net_amount: netAmount, method,
      bank_name: bank_name || null, account_number: account_number || null,
      account_name: account_name || null, crypto_address: crypto_address || null,
      crypto_currency: crypto_currency || null, status: 'pending',
    }).select().single();

    // Record transaction
    await supabase.from('transactions').insert({
      user_id: user.id, type: 'withdrawal', amount, fee,
      balance_before: wallet.balance, balance_after: newBalance,
      status: 'pending', reference: `EH_WD_${withdrawal.id}`,
      description: method === 'bank'
        ? `Bank withdrawal to ${bank_name} — ${account_number}`
        : `Crypto withdrawal (${crypto_currency?.toUpperCase()}) to ${crypto_address?.substring(0, 10)}...`,
    });

    // Notify user
    await supabase.from('notifications').insert({
      user_id: user.id, title: 'Withdrawal Request Received 📤',
      message: `Your withdrawal of $${parseFloat(amount).toFixed(2)} has been received and is being processed. Expected: 1-24 hours.`,
      type: 'payment',
    });

    return res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted! Processing within 1-24 hours.',
      withdrawal_id: withdrawal.id,
      amount, fee, net_amount: netAmount, new_balance: newBalance,
    });

  } catch (error) {
    console.error('Withdrawal error:', error);
    return res.status(500).json({ error: error.message });
  }
};
