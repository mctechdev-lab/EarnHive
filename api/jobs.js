// api/jobs.js - Mini Jobs marketplace
const supabase = require('./_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-firebase-uid');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET - fetch jobs
  if (req.method === 'GET') {
    try {
      const { category, limit = 20, offset = 0 } = req.query;

      let query = supabase.from('mini_jobs')
        .select(`id, title, description, category, budget, currency,
          deadline, requirements, status, created_at,
          users!mini_jobs_poster_id_fkey(first_name, last_name)`)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (category && category !== 'all') query = query.eq('category', category);

      const { data: jobs, error } = await query;
      if (error) throw error;

      return res.status(200).json({ success: true, jobs: jobs || [] });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // POST - create new job
  if (req.method === 'POST') {
    try {
      const { firebase_uid, title, description, category, budget, currency, deadline, requirements } = req.body;

      if (!firebase_uid || !title || !description || !category || !budget) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (parseFloat(budget) < 2) return res.status(400).json({ error: 'Minimum job budget is $2' });

      const { data: user } = await supabase.from('users').select('id').eq('firebase_uid', firebase_uid).single();
      if (!user) return res.status(404).json({ error: 'User not found' });

      const { data: wallet } = await supabase.from('wallets').select('*').eq('user_id', user.id).single();
      const platformFee = parseFloat(budget) * 0.10;
      const totalCost = parseFloat(budget) + platformFee;

      if (parseFloat(wallet.balance) < totalCost) {
        return res.status(400).json({
          error: `Insufficient balance. Job costs $${totalCost.toFixed(2)} (budget + 10% fee) but you have $${parseFloat(wallet.balance).toFixed(2)}`,
        });
      }

      const newBalance = parseFloat(wallet.balance) - totalCost;
      await supabase.from('wallets').update({ balance: newBalance }).eq('user_id', user.id);

      const { data: job, error: jobErr } = await supabase.from('mini_jobs').insert({
        poster_id: user.id, title, description, category,
        budget, currency: currency || 'USD',
        deadline: deadline || null,
        requirements: requirements || null,
        platform_fee: platformFee, status: 'open',
      }).select().single();
      if (jobErr) throw jobErr;

      await supabase.from('transactions').insert({
        user_id: user.id, type: 'task_payment', amount: totalCost,
        fee: platformFee, balance_before: wallet.balance, balance_after: newBalance,
        status: 'completed', reference: `EH_JOB_${job.id}`,
        description: `Posted mini job: ${title}`,
      });

      return res.status(201).json({
        success: true, message: 'Mini job posted successfully!',
        job_id: job.id, total_cost: totalCost, new_balance: newBalance,
      });
    } catch (error) {
      console.error('Create job error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
