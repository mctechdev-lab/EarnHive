// api/submissions.js
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

    const { status = 'pending', limit = 50, offset = 0 } = req.query;

    const { data: user } = await supabase.from('users').select('id').eq('firebase_uid', firebase_uid).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get poster's tasks
    const { data: tasks } = await supabase.from('tasks').select('id, title, pay_per_task').eq('poster_id', user.id);
    if (!tasks || tasks.length === 0) return res.status(200).json({ success: true, submissions: [], pending_count: 0 });

    const taskIds = tasks.map(t => t.id);
    const taskMap = {};
    tasks.forEach(t => { taskMap[t.id] = t; });

    let query = supabase.from('task_submissions')
      .select(`id, task_id, worker_id, proof_url, proof_text, status, rejection_reason, submitted_at,
        users!task_submissions_worker_id_fkey(first_name, last_name)`)
      .in('task_id', taskIds)
      .order('submitted_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status !== 'all') query = query.eq('status', status);

    const { data: subs, error } = await query;
    if (error) throw error;

    const enriched = (subs || []).map(s => ({
      ...s,
      task_title: taskMap[s.task_id]?.title || '',
      pay_per_task: taskMap[s.task_id]?.pay_per_task || 0,
      worker_name: `${s.users?.first_name || ''} ${s.users?.last_name || ''}`.trim(),
    }));

    const { count: pendingCount } = await supabase.from('task_submissions')
      .select('id', { count: 'exact' }).in('task_id', taskIds).eq('status', 'pending');

    return res.status(200).json({ success: true, submissions: enriched, pending_count: pendingCount || 0 });

  } catch (error) {
    console.error('Submissions error:', error);
    return res.status(500).json({ error: error.message });
  }
};
