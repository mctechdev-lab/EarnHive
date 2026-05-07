// api/register.js
const supabase = require('./_supabase');

function generateReferralCode(firstName) {
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${firstName.substring(0, 3).toUpperCase()}${rand}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-firebase-uid');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { firebase_uid, first_name, last_name, email, phone, referral_code } = req.body;
    if (!firebase_uid || !first_name || !last_name || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from('users').select('id').eq('firebase_uid', firebase_uid).single();
    if (existing) return res.status(200).json({ success: true, message: 'Already exists', user: existing });

    // Generate unique referral code
    let newCode = generateReferralCode(first_name);
    let exists = true;
    while (exists) {
      const { data } = await supabase.from('users').select('id').eq('referral_code', newCode).single();
      if (!data) exists = false;
      else newCode = generateReferralCode(first_name);
    }

    // Find referrer
    let referrerId = null;
    if (referral_code) {
      const { data: ref } = await supabase.from('users').select('id').eq('referral_code', referral_code.toUpperCase()).single();
      if (ref) referrerId = ref.id;
    }

    // Create user
    const { data: newUser, error } = await supabase.from('users').insert({
      firebase_uid, first_name, last_name, email,
      phone: phone || null,
      referral_code: newCode,
      referred_by: referrerId,
    }).select().single();
    if (error) throw error;

    // Create referral record
    if (referrerId) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      await supabase.from('referrals').insert({
        referrer_id: referrerId, referred_id: newUser.id, expires_at: expiresAt.toISOString()
      });
      await supabase.from('notifications').insert({
        user_id: referrerId, title: 'New Referral! 🎉',
        message: `${first_name} ${last_name} joined using your referral link! Earn 10% of their earnings for 7 days.`,
        type: 'success'
      });
    }

    return res.status(201).json({
      success: true,
      user: { id: newUser.id, first_name, last_name, email, referral_code: newCode }
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};
