// api/auth.js — Handles user registration AND profile fetching
// Replaces: register.js + me.js
import { supabase } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-firebase-uid');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const uid = req.headers['x-firebase-uid'];
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  const action = req.query.action;
  // ?action=register → POST  (was register.js)
  // ?action=me       → GET   (was me.js)
  // ?action=update   → PATCH (profile update)

  // ── GET MY PROFILE ──
  // GET /api/auth?action=me
  if (req.method === 'GET' && (!action || action === 'me')) {
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        id, first_name, last_name, email, phone,
        country_iso, country_name, currency, currency_symbol, language,
        balance, photo_url, username, referral_code,
        onboarding_complete, phone_verified, email_verified,
        created_at, last_active
      `)
      .eq('firebase_uid', uid)
      .single();

    if (error || !user) return res.status(404).json({ error: 'User not found' });

    // Update last_active timestamp
    await supabase.from('users').update({ last_active: new Date().toISOString() }).eq('id', user.id);

    // Get wallet summary
    const { data: wallet } = await supabase
      .from('transactions')
      .select('amount, type, status')
      .eq('user_id', user.id)
      .eq('status', 'completed');

    const totalEarned = (wallet || [])
      .filter(t => t.amount > 0)
      .reduce((s, t) => s + t.amount, 0);

    const totalWithdrawn = (wallet || [])
      .filter(t => t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);

    // Get referral count
    const { count: referralCount } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by', user.referral_code);

    return res.status(200).json({
      user: {
        ...user,
        wallet: {
          balance: user.balance || 0,
          total_earned: totalEarned,
          total_withdrawn: totalWithdrawn,
        },
        referral_count: referralCount || 0,
      }
    });
  }

  // ── REGISTER / UPSERT USER ──
  // POST /api/auth?action=register
  if (req.method === 'POST' && (!action || action === 'register')) {
    const {
      first_name, last_name, email, phone,
      photo_url, phone_verified, email_verified,
      country_iso, country_name, currency, currency_symbol, language,
      referral_code_used,
    } = req.body;

    if (!first_name || !email) {
      return res.status(400).json({ error: 'first_name and email are required' });
    }

    // Generate unique referral code for this user
    const referral_code = `EH${uid.slice(0, 6).toUpperCase()}`;

    // Check if referral code exists and get referrer
    let referredBy = null;
    if (referral_code_used) {
      const { data: referrer } = await supabase
        .from('users')
        .select('id, balance, first_name')
        .eq('referral_code', referral_code_used.toUpperCase())
        .single();

      if (referrer) {
        referredBy = referral_code_used.toUpperCase();
        // Give referrer a bonus notification (actual bonus paid after 7 days via cron)
        await supabase.from('notifications').insert({
          user_id: referrer.id,
          title: '🎉 New Referral!',
          message: `${first_name} just joined EarnHive using your referral link! You'll earn 10% of their earnings for 7 days.`,
          type: 'referral',
        });
      }
    }

    // UPSERT — never crashes on duplicate firebase_uid
    const { data: user, error } = await supabase
      .from('users')
      .upsert({
        firebase_uid: uid,
        first_name,
        last_name: last_name || '',
        email,
        phone: phone || null,
        photo_url: photo_url || null,
        phone_verified: phone_verified || false,
        email_verified: email_verified || false,
        country_iso: country_iso || 'US',
        country_name: country_name || 'United States',
        currency: currency || 'USD',
        currency_symbol: currency_symbol || '$',
        language: language || 'English',
        referral_code,
        referred_by: referredBy,
        balance: 0,
        onboarding_complete: false,
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString(),
      }, {
        onConflict: 'firebase_uid',       // if user exists → update
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      // Still a duplicate? Return the existing user — never crash
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from('users').select('*').eq('firebase_uid', uid).single();
        return res.status(200).json({ user: existing, existing: true });
      }
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({ user, existing: false });
  }

  // ── UPDATE PROFILE ──
  // PATCH /api/auth?action=update
  if (req.method === 'PATCH' && action === 'update') {
    const allowed = [
      'first_name', 'last_name', 'phone', 'photo_url',
      'country_iso', 'country_name', 'currency', 'currency_symbol',
      'language', 'onboarding_complete', 'payment_method',
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.last_active = new Date().toISOString();

    const { data: user, error } = await supabase
      .from('users')
      .update(updates)
      .eq('firebase_uid', uid)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ user });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
