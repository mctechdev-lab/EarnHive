// api/me.js
const supabase = require('./_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-firebase-uid');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET - fetch user profile
  if (req.method === 'GET') {
    try {
      const firebase_uid = req.headers['x-firebase-uid'];
      if (!firebase_uid) return res.status(401).json({ error: 'Unauthorized' });

      const { data: user, error } = await supabase
        .from('users')
        .select(`*, wallets(balance, total_earned, total_withdrawn, total_deposited)`)
        .eq('firebase_uid', firebase_uid)
        .single();

      if (error || !user) return res.status(404).json({ error: 'User not found' });

      // Update last active
      await supabase.from('users').update({ last_active: new Date().toISOString() }).eq('firebase_uid', firebase_uid);

      // Unread notifications count
      const { count: unread } = await supabase
        .from('notifications').select('id', { count: 'exact' })
        .eq('user_id', user.id).eq('is_read', false);

      // Active referrals count
      const { count: activeRefs } = await supabase
        .from('referrals').select('id', { count: 'exact' })
        .eq('referrer_id', user.id).eq('is_active', true)
        .gt('expires_at', new Date().toISOString());

      // Recent transactions
      const { data: transactions } = await supabase
        .from('transactions').select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(10);

      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone: user.phone,
          avatar_url: user.avatar_url,
          country: user.country,
          country_code: user.country_code,
          language: user.language,
          currency_preference: user.currency_preference,
          payment_method: user.payment_method,
          referral_code: user.referral_code,
          is_verified: user.is_verified,
          created_at: user.created_at,
          wallet: user.wallets,
          unread_notifications: unread || 0,
          active_referrals: activeRefs || 0,
          recent_transactions: transactions || [],
        }
      });
    } catch (error) {
      console.error('Get user error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // PUT - update user preferences
  if (req.method === 'PUT') {
    try {
      const firebase_uid = req.headers['x-firebase-uid'];
      if (!firebase_uid) return res.status(401).json({ error: 'Unauthorized' });

      const { country, country_code, language, currency_preference, payment_method, phone, first_name, last_name } = req.body;

      const updates = {};
      if (country) updates.country = country;
      if (country_code) updates.country_code = country_code;
      if (language) updates.language = language;
      if (currency_preference) updates.currency_preference = currency_preference;
      if (payment_method) updates.payment_method = payment_method;
      if (phone) updates.phone = phone;
      if (first_name) updates.first_name = first_name;
      if (last_name) updates.last_name = last_name;

      const { error } = await supabase.from('users').update(updates).eq('firebase_uid', firebase_uid);
      if (error) throw error;

      return res.status(200).json({ success: true, message: 'Profile updated' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
