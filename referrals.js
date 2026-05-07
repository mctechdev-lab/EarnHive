// api/referrals.js
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

    const { data: user } = await supabase.from('users').select('id').eq('firebase_uid', firebase_uid).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { data: referrals, error } = await supabase.from('referrals')
      .select(`id, total_earned_by_referred, bonus_earned_by_referrer,
        is_active, expires_at, created_at,
        users!referrals_referred_id_fkey(first_name, last_name)`)
      .eq('referrer_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const now = new Date();
    const enriched = (referrals || []).map(r => ({
      ...r,
      referred_name: `${r.users?.first_name || ''} ${r.users?.last_name || ''}`.trim(),
      is_still_active: new Date(r.expires_at) > now,
      days_left: Math.max(0, Math.ceil((new Date(r.expires_at) - now) / (1000 * 60 * 60 * 24))),
    }));

    const totalEarned = enriched.reduce((s, r) => s + parseFloat(r.bonus_earned_by_referrer || 0), 0);
    const activeCount = enriched.filter(r => r.is_still_active).length;

    return res.status(200).json({
      success: true,
      referrals: enriched,
      stats: { total: enriched.length, active: activeCount, total_earned: totalEarned },
    });

  } catch (error) {
    console.error('Referrals error:', error);
    return res.status(500).json({ error: error.message });
  }
};
