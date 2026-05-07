// api/tasks.js
const supabase = require('./_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-firebase-uid');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET - fetch tasks
  if (req.method === 'GET') {
    try {
      const { category, limit = 20, offset = 0 } = req.query;
      const firebase_uid = req.headers['x-firebase-uid'];

      let query = supabase.from('tasks')
        .select(`id, title, description, category, proof_type, estimated_time,
          resource_url, pay_per_task, total_slots, remaining_slots, created_at,
          users(first_name, last_name)`)
        .eq('status', 'active').gt('remaining_slots', 0)
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (category && category !== 'all') query = query.eq('category', category);

      const { data: tasks, error } = await query;
      if (error) throw error;

      // Filter out user's own tasks if logged in
      let filteredTasks = tasks || [];
      if (firebase_uid) {
        const { data: user } = await supabase.from('users').select('id').eq('firebase_uid', firebase_uid).single();
        if (user) filteredTasks = filteredTasks.filter(t => t.poster_id !== user.id);
      }

      return res.status(200).json({ success: true, tasks: filteredTasks });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // POST - create new task
  if (req.method === 'POST') {
    try {
      const { firebase_uid, title, description, category, proof_type,
        estimated_time, resource_url, extra_instructions, pay_per_task, total_slots } = req.body;

      if (!firebase_uid || !title || !description || !category || !proof_type || !pay_per_task || !total_slots) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (pay_per_task < 0.10) return res.status(400).json({ error: 'Minimum pay per task is $0.10' });
      if (total_slots < 1) return res.status(400).json({ error: 'Minimum 1 slot required' });

      // Get user and wallet
      const { data: user } = await supabase.from('users').select('id').eq('firebase_uid', firebase_uid).single();
      if (!user) return res.status(404).json({ error: 'User not found' });

      const { data: wallet } = await supabase.from('wallets').select('*').eq('user_id', user.id).single();

      // Calculate cost
      const subtotal = parseFloat(pay_per_task) * parseInt(total_slots);
      const platformFee = subtotal * 0.10;
      const totalCost = subtotal + platformFee;

      if (parseFloat(wallet.balance) < totalCost) {
        return res.status(400).json({
          error: `Insufficient balance. Task costs $${totalCost.toFixed(2)} but you have $${parseFloat(wallet.balance).toFixed(2)}`,
          required: totalCost, available: wallet.balance,
        });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const newBalance = parseFloat(wallet.balance) - totalCost;

      // Deduct from wallet
      await supabase.from('wallets').update({ balance: newBalance }).eq('user_id', user.id);

      // Create task
      const { data: task, error: taskErr } = await supabase.from('tasks').insert({
        poster_id: user.id, title, description, category, proof_type,
        estimated_time: estimated_time || '5-10 minutes',
        resource_url: resource_url || null,
        extra_instructions: extra_instructions || null,
        pay_per_task, total_slots, remaining_slots: total_slots,
        platform_fee: platformFee, total_cost: totalCost,
        status: 'active', expires_at: expiresAt.toISOString(),
      }).select().single();
      if (taskErr) throw taskErr;

      // Record transaction
      await supabase.from('transactions').insert({
        user_id: user.id, type: 'task_payment', amount: totalCost,
        fee: platformFee, balance_before: wallet.balance, balance_after: newBalance,
        status: 'completed', reference: `EH_TASK_${task.id}`,
        description: `Posted task: ${title}`,
      });

      return res.status(201).json({
        success: true, message: 'Task posted successfully!',
        task_id: task.id, total_cost: totalCost, new_balance: newBalance,
      });
    } catch (error) {
      console.error('Create task error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
