// api/games.js
const supabase = require('./_supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-firebase-uid');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST - join or create game
  if (req.method === 'POST') {
    try {
      const { firebase_uid, game_type, stake_amount } = req.body;
      if (!firebase_uid || !game_type || !stake_amount) return res.status(400).json({ error: 'Missing required fields' });

      const validTypes = ['ludo_2p', 'ludo_4p', 'whot'];
      if (!validTypes.includes(game_type)) return res.status(400).json({ error: 'Invalid game type' });

      const { data: user } = await supabase.from('users').select('id, first_name, last_name').eq('firebase_uid', firebase_uid).single();
      if (!user) return res.status(404).json({ error: 'User not found' });

      const { data: wallet } = await supabase.from('wallets').select('*').eq('user_id', user.id).single();
      if (parseFloat(wallet.balance) < parseFloat(stake_amount)) {
        return res.status(400).json({ error: `Insufficient balance. Need $${stake_amount} to play.` });
      }

      const maxPlayers = game_type === 'ludo_4p' ? 4 : 2;
      const stake = parseFloat(stake_amount);
      const totalPot = stake * maxPlayers;
      const platformFee = totalPot * 0.10;

      // Prize calculations
      const firstPrize = game_type === 'ludo_4p' ? totalPot * 0.50 : totalPot * 0.90;
      const secondPrize = game_type === 'ludo_4p' ? totalPot * 0.40 : 0;

      // Find waiting game
      const { data: waiting } = await supabase.from('games')
        .select('id').eq('type', game_type).eq('stake_amount', stake).eq('status', 'waiting').single();

      let gameId;
      if (waiting) {
        gameId = waiting.id;
      } else {
        const { data: newGame } = await supabase.from('games').insert({
          type: game_type, stake_amount: stake, total_pot: totalPot,
          platform_fee: platformFee, winner_prize: firstPrize, second_prize: secondPrize,
          status: 'waiting', game_data: { max_players: maxPlayers },
        }).select().single();
        gameId = newGame.id;
      }

      // Deduct stake
      const newBalance = parseFloat(wallet.balance) - stake;
      await supabase.from('wallets').update({ balance: newBalance }).eq('user_id', user.id);

      // Add player
      await supabase.from('game_players').insert({
        game_id: gameId, user_id: user.id, status: 'active',
      });

      // Record stake transaction
      await supabase.from('transactions').insert({
        user_id: user.id, type: 'game_stake', amount: stake,
        balance_before: wallet.balance, balance_after: newBalance,
        status: 'completed', reference: `EH_STAKE_${gameId}_${user.id}`,
        description: `Game stake: ${game_type} — $${stake}`,
      });

      // Check if full
      const { count: playerCount } = await supabase.from('game_players')
        .select('id', { count: 'exact' }).eq('game_id', gameId).eq('status', 'active');

      if (playerCount >= maxPlayers) {
        await supabase.from('games').update({
          status: 'active', started_at: new Date().toISOString()
        }).eq('id', gameId);
      }

      return res.status(200).json({
        success: true, game_id: gameId,
        players_joined: playerCount, max_players: maxPlayers,
        stake_amount: stake, new_balance: newBalance,
        first_prize: firstPrize, second_prize: secondPrize,
        message: playerCount >= maxPlayers ? 'Game starting!' : 'Waiting for opponents...',
      });

    } catch (error) {
      console.error('Game join error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // PUT - end game and pay winners
  if (req.method === 'PUT') {
    try {
      const { game_id, first_place_uid, second_place_uid } = req.body;
      if (!game_id || !first_place_uid) return res.status(400).json({ error: 'Missing required fields' });

      const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
      if (!game || game.status !== 'active') return res.status(400).json({ error: 'Game not found or already ended' });

      // Pay 1st place
      const { data: first } = await supabase.from('users').select('id, first_name').eq('firebase_uid', first_place_uid).single();
      if (!first) return res.status(404).json({ error: '1st place user not found' });

      const { data: firstWallet } = await supabase.from('wallets').select('*').eq('user_id', first.id).single();
      const firstPrize = parseFloat(game.winner_prize);
      const firstNewBal = parseFloat(firstWallet.balance) + firstPrize;

      await supabase.from('wallets').update({
        balance: firstNewBal, total_earned: parseFloat(firstWallet.total_earned) + firstPrize,
      }).eq('user_id', first.id);

      await supabase.from('transactions').insert({
        user_id: first.id, type: 'game_winning', amount: firstPrize,
        balance_before: firstWallet.balance, balance_after: firstNewBal,
        status: 'completed', reference: `EH_WIN1_${game_id}`,
        description: `🏆 1st place: ${game.type} — $${firstPrize}`,
      });

      await supabase.from('notifications').insert({
        user_id: first.id, title: '🏆 You Won!',
        message: `Congratulations! You won $${firstPrize.toFixed(2)} in ${game.type.replace(/_/g,' ').toUpperCase()}!`,
        type: 'success',
      });

      // Pay 2nd place (4 player only)
      if (second_place_uid && parseFloat(game.second_prize) > 0) {
        const { data: second } = await supabase.from('users').select('id').eq('firebase_uid', second_place_uid).single();
        if (second) {
          const { data: secondWallet } = await supabase.from('wallets').select('*').eq('user_id', second.id).single();
          const secondPrize = parseFloat(game.second_prize);
          const secondNewBal = parseFloat(secondWallet.balance) + secondPrize;

          await supabase.from('wallets').update({
            balance: secondNewBal, total_earned: parseFloat(secondWallet.total_earned) + secondPrize,
          }).eq('user_id', second.id);

          await supabase.from('transactions').insert({
            user_id: second.id, type: 'game_winning', amount: secondPrize,
            balance_before: secondWallet.balance, balance_after: secondNewBal,
            status: 'completed', reference: `EH_WIN2_${game_id}`,
            description: `🥈 2nd place: ${game.type} — $${secondPrize}`,
          });

          await supabase.from('notifications').insert({
            user_id: second.id, title: '🥈 2nd Place!',
            message: `You came 2nd and won $${secondPrize.toFixed(2)}!`,
            type: 'success',
          });
        }
      }

      // End game
      await supabase.from('games').update({
        status: 'completed', winner_id: first.id,
        ended_at: new Date().toISOString(),
      }).eq('id', game_id);

      return res.status(200).json({
        success: true, message: 'Game ended. Winners paid!',
        first_prize: firstPrize, second_prize: game.second_prize,
      });

    } catch (error) {
      console.error('End game error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
