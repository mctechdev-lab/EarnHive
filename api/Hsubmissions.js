// api/submissions.js — Handles task/job submission & listing
// Replaces: submit.js + submissions.js
import { supabase } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-firebase-uid');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const uid = req.headers['x-firebase-uid'];
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, balance')
    .eq('firebase_uid', uid)
    .single();

  if (userErr || !user) return res.status(404).json({ error: 'User not found' });

  const action = req.query.action; // ?action=submit | ?action=list | ?action=review

  // ── LIST SUBMISSIONS ──
  // GET /api/submissions?action=list
  // GET /api/submissions?action=list&type=mine       → user's own submissions
  // GET /api/submissions?action=list&type=review     → poster reviewing submissions on their tasks/jobs
  if (req.method === 'GET' && action === 'list') {
    const type = req.query.type || 'mine';

    if (type === 'mine') {
      const { data, error } = await supabase
        .from('submissions')
        .select(`
          id, status, proof_url, proof_text, submitted_at, reviewed_at, earnings,
          tasks(id, title, reward, type),
          jobs(id, title, budget)
        `)
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false });

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ submissions: data });
    }

    if (type === 'review') {
      // Submissions on tasks posted by this user
      const { data: myTasks } = await supabase
        .from('tasks').select('id').eq('posted_by', user.id);
      const { data: myJobs } = await supabase
        .from('jobs').select('id').eq('posted_by', user.id);

      const taskIds = (myTasks || []).map(t => t.id);
      const jobIds = (myJobs || []).map(j => j.id);

      let query = supabase
        .from('submissions')
        .select(`
          id, status, proof_url, proof_text, submitted_at, earnings,
          task_id, job_id,
          users(id, first_name, last_name, email),
          tasks(id, title, reward),
          jobs(id, title, budget)
        `)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true });

      if (taskIds.length && jobIds.length) {
        query = query.or(`task_id.in.(${taskIds.join(',')}),job_id.in.(${jobIds.join(',')})`);
      } else if (taskIds.length) {
        query = query.in('task_id', taskIds);
      } else if (jobIds.length) {
        query = query.in('job_id', jobIds);
      } else {
        return res.status(200).json({ submissions: [] });
      }

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ submissions: data });
    }

    return res.status(400).json({ error: 'Invalid type parameter' });
  }

  // ── SUBMIT TASK / JOB ──
  // POST /api/submissions?action=submit
  if (req.method === 'POST' && action === 'submit') {
    const { task_id, job_id, proof_url, proof_text, screenshot_url } = req.body;

    if (!task_id && !job_id) return res.status(400).json({ error: 'task_id or job_id required' });
    if (!proof_text && !proof_url) return res.status(400).json({ error: 'Proof is required (text or URL)' });

    // Check not already submitted
    const dupCheck = await supabase
      .from('submissions')
      .select('id')
      .eq('user_id', user.id)
      .eq(task_id ? 'task_id' : 'job_id', task_id || job_id)
      .single();

    if (dupCheck.data) return res.status(409).json({ error: 'You have already submitted this task' });

    // Get reward amount
    let reward = 0;
    if (task_id) {
      const { data: task } = await supabase.from('tasks').select('reward, auto_approve').eq('id', task_id).single();
      if (!task) return res.status(404).json({ error: 'Task not found' });
      reward = task.reward;

      // Auto-approve tasks if enabled
      if (task.auto_approve) {
        const { data: sub } = await supabase.from('submissions').insert({
          user_id: user.id, task_id, proof_url, proof_text, screenshot_url,
          status: 'approved', earnings: reward, submitted_at: new Date().toISOString(), reviewed_at: new Date().toISOString(),
        }).select().single();

        // Credit user immediately
        await supabase.from('users').update({ balance: user.balance + reward }).eq('id', user.id);
        await supabase.from('transactions').insert({
          user_id: user.id, amount: reward, type: 'task_earning', status: 'completed',
          currency: 'USD', description: `Task reward auto-approved`, reference: `sub_${sub.id}`,
        });

        return res.status(200).json({ success: true, status: 'approved', earnings: reward, submission: sub });
      }
    }

    if (job_id) {
      const { data: job } = await supabase.from('jobs').select('budget').eq('id', job_id).single();
      if (!job) return res.status(404).json({ error: 'Job not found' });
      reward = job.budget * 0.9; // 10% platform commission
    }

    // Insert pending submission
    const { data: sub, error: subErr } = await supabase.from('submissions').insert({
      user_id: user.id,
      task_id: task_id || null,
      job_id: job_id || null,
      proof_url: proof_url || null,
      proof_text: proof_text || null,
      screenshot_url: screenshot_url || null,
      status: 'pending',
      earnings: reward,
      submitted_at: new Date().toISOString(),
    }).select().single();

    if (subErr) return res.status(500).json({ error: subErr.message });

    // Notify poster
    if (task_id || job_id) {
      const posterQuery = task_id
        ? supabase.from('tasks').select('posted_by').eq('id', task_id).single()
        : supabase.from('jobs').select('posted_by').eq('id', job_id).single();
      const { data: poster } = await posterQuery;
      if (poster?.posted_by) {
        await supabase.from('notifications').insert({
          user_id: poster.posted_by,
          title: 'New Submission',
          message: `Someone submitted your ${task_id ? 'task' : 'job'}. Review it now.`,
          type: 'submission',
          link: '/app.html?tab=review',
        });
      }
    }

    return res.status(200).json({ success: true, status: 'pending', submission: sub });
  }

  // ── REVIEW SUBMISSION (approve / reject) ──
  // PATCH /api/submissions?action=review
  if (req.method === 'PATCH' && action === 'review') {
    const { submission_id, verdict } = req.body; // verdict: 'approved' | 'rejected'

    if (!submission_id || !['approved', 'rejected'].includes(verdict)) {
      return res.status(400).json({ error: 'submission_id and verdict (approved|rejected) required' });
    }

    // Get submission + verify poster owns it
    const { data: sub } = await supabase
      .from('submissions')
      .select('id, user_id, task_id, job_id, earnings, status')
      .eq('id', submission_id)
      .single();

    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    if (sub.status !== 'pending') return res.status(400).json({ error: 'Submission already reviewed' });

    // Verify poster
    let isPoster = false;
    if (sub.task_id) {
      const { data: t } = await supabase.from('tasks').select('posted_by').eq('id', sub.task_id).single();
      isPoster = t?.posted_by === user.id;
    } else if (sub.job_id) {
      const { data: j } = await supabase.from('jobs').select('posted_by').eq('id', sub.job_id).single();
      isPoster = j?.posted_by === user.id;
    }
    if (!isPoster) return res.status(403).json({ error: 'Not authorized to review this submission' });

    // Update submission
    await supabase.from('submissions').update({
      status: verdict,
      reviewed_at: new Date().toISOString(),
    }).eq('id', submission_id);

    // If approved → credit worker
    if (verdict === 'approved') {
      const { data: worker } = await supabase.from('users').select('id, balance').eq('id', sub.user_id).single();
      if (worker) {
        await supabase.from('users').update({ balance: worker.balance + sub.earnings }).eq('id', worker.id);
        await supabase.from('transactions').insert({
          user_id: worker.id,
          amount: sub.earnings,
          type: 'task_earning',
          status: 'completed',
          currency: 'USD',
          description: `Submission approved`,
          reference: `sub_${sub.id}`,
        });
        // Notify worker
        await supabase.from('notifications').insert({
          user_id: worker.id,
          title: '💰 Submission Approved!',
          message: `You earned $${sub.earnings.toFixed(2)}! Funds added to your wallet.`,
          type: 'earning',
        });
      }
    } else {
      // Notify worker of rejection
      await supabase.from('notifications').insert({
        user_id: sub.user_id,
        title: 'Submission Rejected',
        message: `Your submission was not approved. Check the task requirements and try again.`,
        type: 'rejection',
      });
    }

    return res.status(200).json({ success: true, verdict });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
