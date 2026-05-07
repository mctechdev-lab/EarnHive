// api/notifications.js
const supabase = require('./_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-firebase-uid');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const firebase_uid = req.headers['x-firebase-uid'];
  if (!firebase_uid) return res.status(401).json({ error: 'Unauthorized' });

  const { data: user } = await supabase.from('users').select('id').eq('firebase_uid', firebase_uid).single();
  if (!user) return res.status(404).json({ error: 'User not found' });

  // GET - fetch notifications
  if (req.method === 'GET') {
    try {
      const { limit = 30 } = req.query;
      const { data: notifications, error } = await supabase.from('notifications')
        .select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));
      if (error) throw error;

      const { count: unread } = await supabase.from('notifications')
        .select('id', { count: 'exact' }).eq('user_id', user.id).eq('is_read', false);

      return res.status(200).json({ success: true, notifications: notifications || [], unread_count: unread || 0 });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // PUT - mark all as read
  if (req.method === 'PUT') {
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
      return res.status(200).json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
