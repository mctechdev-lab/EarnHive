// api/submit.js
const supabase = require('./_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-firebase-uid');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST - worker submits proof
  if (req.method === 'POST') {
    try {
      const { firebase_uid, task_id, proof_url, proof_text } = req.body;
      if (!firebase_uid || !task_id) return res.status(400).json({ error: 'Missing required fields' });
      if (!proof_url && !proof_text) return res.status(400).json({ error: 'Please provide proof of completion' });

      const { data: worker } = await supabase.from('users').select('id').eq('firebase_uid', firebase_uid).single();
      if (!worker) return res.status(404).json({ error: 'User not found' });

      const { data: task } = await supabase.from('tasks').select('*').eq('id', task_id).single();
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (task.status !== 'active') return res.status(400).json({ error: 'Task is no longer active' });
      if (task.remaining_slots <= 0) return res.status(400).json({ error: 'Task is full — no more slots available' });
      if (task.poster_id === worker.id) return res.status(400).json({ error: 'You cannot complete your own task' });

      // Check already submitted
      const { data: existing } = await supabase.from('task_submissions')
        .select('id, status').eq('task_id', task_id).eq('worker_id', worker.id).single();
      if (existing) return res.status(400).json({ error: `You already submitted this task (Status: ${existing.status})` });

      // Create submission
      const { data: submission, error } = await supabase.from('task_submissions').insert({
        task_id, worker_id: worker.id,
        proof_url: proof_url || null, proof_text: proof_text || null, status: 'pending',
      }).select().single();
      if (error) throw error;

      // Reduce slots
      await supabase.from('tasks').update({ remaining_slots: task.remaining_slots - 1 }).eq('id', task_id);

      // Notify poster
      await supabase.from('notifications').insert({
        user_id: task.poster_id, title: 'New Submission! 📋',
        message: `Someone submitted proof for your task "${task.title}". Review it in Post section.`,
        type: 'task',
      });

      return res.status(201).json({
        success: true, message: 'Submitted! Waiting for poster to verify.',
        submission_id: submission.id,
      });
    } catch (error) {
      console.error('Submit error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // PUT - poster approves or rejects
  if (req.method === 'PUT') {
    try {
      const { firebase_uid, submission_id, action, rejection_reason } = req.body;
      if (!firebase_uid || !submission_id || !action) return res.status(400).json({ error: 'Missing required fields' });
      if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Action must be approve or reject' });

      const { data: poster } = await supabase.from('users').select('id').eq('firebase_uid', firebase_uid).single();
      if (!poster) return res.status(404).json({ error: 'User not found' });

      const { data: submission } = await supabase.from('task_submissions')
        .select(`*, tasks(*)`)
        .eq('id', submission_id).single();
      if (!submission) return res.status(404).json({ error: 'Submission not found' });
      if (submission.tasks.poster_id !== poster.id) return res.status(403).json({ error: 'Not authorized' });
      if (submission.status !== 'pending') return res.status(400).json({ error: 'Already reviewed' });

      if (action === 'approve') {
        const { data: workerWallet } = await supabase.from('wallets').select('*').eq('user_id', submission.worker_id).single();
        const pay = parseFloat(submission.tasks.pay_per_task);
        const newBal = parseFloat(workerWallet.balance) + pay;

        // Credit worker
        await supabase.from('wallets').update({
          balance: newBal, total_earned: parseFloat(workerWallet.total_earned) + pay,
        }).eq('user_id', submission.worker_id);

        // Transaction
        await supabase.from('transactions').insert({
          user_id: submission.worker_id, type: 'task_earning', amount: pay,
          balance_before: workerWallet.balance, balance_after: newBal,
          status: 'completed', reference: `EH_EARN_${submission_id}`,
          description: `Task completed: ${submission.tasks.title}`,
        });

        // Referral bonus
        const { data: referral } = await supabase.from('referrals').select('*')
          .eq('referred_id', submission.worker_id).eq('is_active', true)
          .gt('expires_at', new Date().toISOString()).single();

        if (referral) {
          const bonus = pay * 0.10;
          const { data: refWallet } = await supabase.from('wallets').select('*').eq('user_id', referral.referrer_id).single();
          const refNewBal = parseFloat(refWallet.balance) + bonus;
          await supabase.from('wallets').update({ balance: refNewBal }).eq('user_id', referral.referrer_id);
          await supabase.from('referrals').update({
            total_earned_by_referred: parseFloat(referral.total_earned_by_referred) + pay,
            bonus_earned_by_referrer: parseFloat(referral.bonus_earned_by_referrer) + bonus,
          }).eq('id', referral.id);
          await supabase.from('transactions').insert({
            user_id: referral.referrer_id, type: 'referral_bonus', amount: bonus,
            balance_before: refWallet.balance, balance_after: refNewBal,
            status: 'completed', reference: `EH_REF_${submission_id}`,
            description: `Referral bonus — 10% of friend's task earnings`,
          });
          await supabase.from('notifications').insert({
            user_id: referral.referrer_id, title: 'Referral Bonus! 🎉',
            message: `You earned $${bonus.toFixed(4)} from your friend completing a task.`,
            type: 'success',
          });
        }

        // Update submission
        await supabase.from('task_submissions').update({
          status: 'approved', reviewed_at: new Date().toISOString()
        }).eq('id', submission_id);

        // Notify worker
        await supabase.from('notifications').insert({
          user_id: submission.worker_id, title: 'Task Approved! 💰',
          message: `"${submission.tasks.title}" was approved. $${pay.toFixed(4)} added to your wallet!`,
          type: 'success',
        });

        return res.status(200).json({ success: true, message: `Approved. $${pay} paid to worker.` });

      } else {
        // Reject
        await supabase.from('task_submissions').update({
          status: 'rejected',
          rejection_reason: rejection_reason || 'Did not meet requirements',
          reviewed_at: new Date().toISOString(),
        }).eq('id', submission_id);

        // Restore slot
        await supabase.from('tasks').update({
          remaining_slots: submission.tasks.remaining_slots + 1
        }).eq('id', submission.task_id);

        // Notify worker
        await supabase.from('notifications').insert({
          user_id: submission.worker_id, title: 'Submission Rejected ❌',
          message: `"${submission.tasks.title}" was rejected. Reason: ${rejection_reason || 'Did not meet requirements'}`,
          type: 'warning',
        });

        return res.status(200).json({ success: true, message: 'Submission rejected.' });
      }
    } catch (error) {
      console.error('Review error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
