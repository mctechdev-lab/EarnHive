// api/transactions.js
const supabase = require('./_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-firebase-uid');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const firebase_uid = req.headers['x-firebase-uid'];
    if (!firebase_uid) return res.status(401).json({ error: 'Unauthorized' });

    const { limit = 30, offset = 0, type } = req.query;

    const { data: user } = await supabase.from('users').select('id').eq('firebase_uid', firebase_uid).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    let query = supabase.from('transactions')
      .select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (type) query = query.eq('type', type);

    const { data: transactions, error } = await query;
    if (error) throw error;

    // Get wallet summary
    const { data: wallet } = await supabase.from('wallets').select('*').eq('user_id', user.id).single();

    return res.status(200).json({
      success: true,
      transactions: transactions || [],
      wallet: wallet || {},
    });

  } catch (error) {
    console.error('Transactions error:', error);
    return res.status(500).json({ error: error.message });
  }
};
