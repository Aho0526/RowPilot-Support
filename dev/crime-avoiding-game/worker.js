/**
 * Cloudflare Workers Backend for Crime Avoidance Game (犯罪回避ゲーム)
 *
 * 徹底した「情報の非対称性」管理:
 * - プレイ中は相手の現在位置をAPIレベルで完全に隠蔽（DevToolsハック防止）
 * - ゲーム開始直後の数秒間（初期情報）およびゲーム終了後の「答え合わせ（振り返り）」時のみ開示
 */

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Player-Id',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // ルーティング
            if (path === '/api/room/create' && request.method === 'POST') {
                return await handleCreateRoom(request, env, corsHeaders);
            }
            if (path === '/api/room/join' && request.method === 'POST') {
                return await handleJoinRoom(request, env, corsHeaders);
            }
            if (path === '/api/room/start' && request.method === 'POST') {
                return await handleStartGame(request, env, corsHeaders);
            }
            if (path === '/api/game/state' && request.method === 'GET') {
                return await handleGetGameState(request, env, corsHeaders, url);
            }
            if (path === '/api/game/turn-action' && request.method === 'POST') {
                return await handleTurnAction(request, env, corsHeaders);
            }
            if (path === '/api/game/move' && request.method === 'POST') {
                return await handleMove(request, env, corsHeaders);
            }
            if (path === '/api/chat/send' && request.method === 'POST') {
                return await handleSendChat(request, env, corsHeaders);
            }
            if (path === '/api/game/block' && request.method === 'POST') {
                return await handleBlock(request, env, corsHeaders);
            }
            if (path === '/api/game/abandon' && request.method === 'POST') {
                return await handleAbandonGame(request, env, corsHeaders);
            }
            if (path === '/api/game/review' && request.method === 'GET') {
                return await handleGetReview(request, env, corsHeaders, url);
            }

            return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        } catch (err) {
            console.error(err);
            return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
    }
};

// ヘルパー: JSONレスポンス
function jsonResponse(data, headers, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' },
    });
}

// ルーム作成
async function handleCreateRoom(request, env, headers) {
    const { hostName, preferredRole, mapType = '3x3', isAiMode = false } = await request.json();
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const playerId = 'p_' + Math.random().toString(36).substring(2, 10);
    const now = Date.now();

    // 初期配置の候補（3x3の場合: 16ノード）
    // 犯罪者と被害者はある程度離れた位置からスタート
    const victimStart = 'node_0_3'; // 被害者: 南西
    const criminalStart = 'node_3_0'; // 犯罪者: 北東
    const victimGoal = 'node_3_3'; // 被害者の目的地: 南東（駅・避難所など）

    const hostRole = preferredRole === 'criminal' ? 'criminal' : 'victim';
    const guestRole = hostRole === 'criminal' ? 'victim' : 'criminal';

    const db = env.DB;
    await db.prepare(`
        INSERT INTO rooms (id, status, map_type, time_limit, victim_goal_node, created_at)
        VALUES (?, 'waiting', ?, 120, ?, ?)
    `).bind(roomId, mapType, victimGoal, now).run();

    const hostStartNode = hostRole === 'victim' ? victimStart : criminalStart;
    await db.prepare(`
        INSERT INTO players (id, room_id, role, name, current_node, joined_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).bind(playerId, roomId, hostRole, hostName || 'ホスト', hostStartNode, now).run();

    if (isAiMode) {
        const aiId = 'ai_' + Math.random().toString(36).substring(2, 8);
        const aiRole = guestRole;
        const aiStartNode = aiRole === 'victim' ? victimStart : criminalStart;
        await db.prepare(`
            INSERT INTO players (id, room_id, role, name, current_node, joined_at)
            VALUES (?, ?, ?, 'AI対戦者', ?, ?)
        `).bind(aiId, roomId, aiRole, aiStartNode, now).run();
    }

    return jsonResponse({
        success: true,
        roomId,
        playerId,
        role: hostRole,
        isAiMode,
    }, headers);
}

// ルーム参加
async function handleJoinRoom(request, env, headers) {
    const { roomId, playerName } = await request.json();
    const db = env.DB;

    const room = await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(roomId.toUpperCase()).first();
    if (!room) {
        return jsonResponse({ error: 'ルームが見つかりません' }, headers, 404);
    }
    if (room.status !== 'waiting') {
        return jsonResponse({ error: 'このルームは既に対戦中または終了しています' }, headers, 400);
    }

    const existingPlayers = await db.prepare('SELECT * FROM players WHERE room_id = ?').bind(room.id).all();
    if (existingPlayers.results.length >= 2) {
        return jsonResponse({ error: 'ルームが満員です' }, headers, 400);
    }

    const hostPlayer = existingPlayers.results[0];
    const role = hostPlayer.role === 'criminal' ? 'victim' : 'criminal';
    const startNode = role === 'victim' ? 'node_0_3' : 'node_3_0';
    const playerId = 'p_' + Math.random().toString(36).substring(2, 10);
    const now = Date.now();

    await db.prepare(`
        INSERT INTO players (id, room_id, role, name, current_node, joined_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).bind(playerId, room.id, role, playerName || 'ゲスト', startNode, now).run();

    return jsonResponse({
        success: true,
        roomId: room.id,
        playerId,
        role,
        mapType: room.map_type,
    }, headers);
}

// ゲーム開始
async function handleStartGame(request, env, headers) {
    const { roomId, playerId } = await request.json();
    const db = env.DB;

    const room = await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(roomId).first();
    if (!room) return jsonResponse({ error: 'ルームが見つかりません' }, headers, 404);

    const players = await db.prepare('SELECT * FROM players WHERE room_id = ?').bind(roomId).all();
    if (players.results.length < 2) {
        return jsonResponse({ error: 'プレイヤーが2人揃っていません' }, headers, 400);
    }

    const now = Date.now();
    await db.prepare(`
        UPDATE rooms SET status = 'playing', started_at = ? WHERE id = ?
    `).bind(now, roomId).run();

    // 初期位置ログ記録
    for (const p of players.results) {
        await db.prepare(`
            INSERT INTO moves (room_id, player_id, role, from_node, to_node, timestamp, elapsed_seconds)
            VALUES (?, ?, ?, ?, ?, ?, 0)
        `).bind(roomId, p.id, p.role, p.current_node, p.current_node, now).run();
    }

    return jsonResponse({ success: true, startedAt: now }, headers);
}

// ゲーム状態取得（情報非対称性フィルタリング & 接続死活監視）
async function handleGetGameState(request, env, headers, url) {
    const roomId = url.searchParams.get('roomId');
    const playerId = request.headers.get('X-Player-Id') || url.searchParams.get('playerId');
    const db = env.DB;

    const room = await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(roomId).first();
    if (!room) return jsonResponse({ error: 'ルームが存在しません' }, headers, 404);

    const now = Date.now();

    // 自分の最終アクセス時刻 (last_seen_at) を更新（オンライン死活監視用）
    if (playerId) {
        await db.prepare('UPDATE players SET last_seen_at = ? WHERE id = ?').bind(now, playerId).run();
    }

    const players = await db.prepare('SELECT * FROM players WHERE room_id = ?').bind(roomId).all();
    const myPlayer = players.results.find(p => p.id === playerId);
    const opponentPlayer = players.results.find(p => p.id !== playerId);

    let isInitialPeek = false; // 開始直後3秒以内か
    let remainingTime = room.time_limit;

    if (room.status === 'playing' && room.started_at) {
        const elapsedSec = Math.floor((now - room.started_at) / 1000);
        remainingTime = Math.max(0, room.time_limit - elapsedSec);
        if (elapsedSec <= 3 && (room.current_turn === 1 || !room.current_turn)) {
            isInitialPeek = true; // ゲーム開始3秒間だけ相手の位置が見える
        }

        // 制限時間終了チェック
        if (remainingTime <= 0) {
            await db.prepare(`
                UPDATE rooms SET status = 'finished', ended_at = ?, winner = 'victim', finish_reason = '逃走成功（時間切れ）'
                WHERE id = ?
            `).bind(now, roomId).run();
            room.status = 'finished';
            room.winner = 'victim';
            room.finish_reason = '逃走成功（時間切れ）';
        }
    }

    // プレイヤー情報のサニタイズ（重要: 相手の位置を隠蔽）
    const sanitizedPlayers = players.results.map(p => {
        const isSelf = p.id === playerId;
        const canSee = isSelf || room.status === 'finished' || isInitialPeek;
        const lastSeenAgo = p.last_seen_at ? Math.max(0, Math.floor((now - p.last_seen_at) / 1000)) : null;

        return {
            id: p.id,
            name: p.name,
            role: p.role,
            isBlocked: p.is_blocked,
            isTurnReady: p.is_turn_ready === 1,
            lastSeenAgo,
            // サーバー側で相手の現在地を厳格にマスク
            currentNode: canSee ? p.current_node : null,
            isSelf,
        };
    });

    // 最新チャット取得
    const messages = await db.prepare(`
        SELECT id, player_id, role, sender_name, content, timestamp, elapsed_seconds
        FROM messages WHERE room_id = ? ORDER BY id ASC LIMIT 50
    `).bind(roomId).all();

    // 相手の切断判定（10秒以上通信が途絶えている場合）
    const oppLastSeenAgo = opponentPlayer && opponentPlayer.last_seen_at
        ? Math.max(0, Math.floor((now - opponentPlayer.last_seen_at) / 1000))
        : null;
    const isOpponentDisconnected = oppLastSeenAgo !== null && oppLastSeenAgo >= 10;

    return jsonResponse({
        room: {
            id: room.id,
            status: room.status,
            mapType: room.map_type,
            timeLimit: room.time_limit,
            remainingTime,
            currentTurn: room.current_turn || 1,
            maxTurns: room.max_turns || 12,
            victimGoalNode: room.victim_goal_node,
            winner: room.winner,
            finishReason: room.finish_reason,
            isInitialPeek,
        },
        myStatus: {
            isReady: myPlayer ? (myPlayer.is_turn_ready === 1) : false,
            pendingMoveNode: myPlayer ? myPlayer.pending_move_node : null,
        },
        opponentStatus: {
            isReady: opponentPlayer ? (opponentPlayer.is_turn_ready === 1) : false,
            lastSeenAgo: oppLastSeenAgo,
            isDisconnected: isOpponentDisconnected,
        },
        players: sanitizedPlayers,
        messages: messages.results,
    }, headers);
}

// 移動処理
async function handleMove(request, env, headers) {
    const { roomId, playerId, toNode } = await request.json();
    const db = env.DB;

    const room = await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(roomId).first();
    if (!room || room.status !== 'playing') {
        return jsonResponse({ error: 'ゲームがプレイ中ではありません' }, headers, 400);
    }

    const players = await db.prepare('SELECT * FROM players WHERE room_id = ?').bind(roomId).all();
    const mover = players.results.find(p => p.id === playerId);
    if (!mover) return jsonResponse({ error: 'プレイヤーが見つかりません' }, headers, 404);

    const fromNode = mover.current_node;
    if (fromNode === toNode) {
        return jsonResponse({ success: true, currentNode: toNode }, headers);
    }

    const now = Date.now();
    const elapsedSec = room.started_at ? Math.floor((now - room.started_at) / 1000) : 0;

    // 現在地更新
    await db.prepare('UPDATE players SET current_node = ? WHERE id = ?').bind(toNode, playerId).run();

    // 移動履歴記録
    await db.prepare(`
        INSERT INTO moves (room_id, player_id, role, from_node, to_node, timestamp, elapsed_seconds)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(roomId, playerId, mover.role, fromNode, toNode, now, elapsedSec).run();

    // 勝敗判定
    const otherPlayer = players.results.find(p => p.id !== playerId);
    let isGameOver = false;
    let winner = null;
    let finishReason = null;

    if (otherPlayer) {
        const criminalNode = mover.role === 'criminal' ? toNode : otherPlayer.current_node;
        const victimNode = mover.role === 'victim' ? toNode : otherPlayer.current_node;

        // 接触判定: 犯罪者と被害者が同じノード
        if (criminalNode === victimNode) {
            isGameOver = true;
            winner = 'criminal';
            finishReason = '犯罪者が被害者に接触したため確保されました！';
        }
        // 被害者のゴール到達判定
        else if (victimNode === room.victim_goal_node) {
            isGameOver = true;
            winner = 'victim';
            finishReason = '被害者が無事に目的地（安全地帯）に到達しました！';
        }
    }

    if (isGameOver) {
        await db.prepare(`
            UPDATE rooms SET status = 'finished', ended_at = ?, winner = ?, finish_reason = ?
            WHERE id = ?
        `).bind(now, winner, finishReason, roomId).run();
    }

    return jsonResponse({
        success: true,
        currentNode: toNode,
        isGameOver,
        winner,
        finishReason,
    }, headers);
}

// チャット送信
async function handleSendChat(request, env, headers) {
    const { roomId, playerId, content } = await request.json();
    const db = env.DB;

    const room = await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(roomId).first();
    if (!room) return jsonResponse({ error: 'ルームが存在しません' }, headers, 404);

    const player = await db.prepare('SELECT * FROM players WHERE id = ?').bind(playerId).first();
    if (!player) return jsonResponse({ error: 'プレイヤーが見つかりません' }, headers, 404);

    const now = Date.now();
    const elapsedSec = room.started_at ? Math.floor((now - room.started_at) / 1000) : 0;

    // チャット保存（送信時の実際の位置も記録して振り返り時に答え合わせ）
    await db.prepare(`
        INSERT INTO messages (room_id, player_id, role, sender_name, content, sender_node_at_time, timestamp, elapsed_seconds)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(roomId, playerId, player.role, player.name, content.trim(), player.current_node, now, elapsedSec).run();

    return jsonResponse({ success: true }, headers);
}

// 被害者による「ブロック＆削除」
async function handleBlock(request, env, headers) {
    const { roomId, playerId } = await request.json();
    const db = env.DB;

    const player = await db.prepare('SELECT * FROM players WHERE id = ?').bind(playerId).first();
    if (!player || player.role !== 'victim') {
        return jsonResponse({ error: '被害者のみがブロックを実行できます' }, headers, 403);
    }

    await db.prepare('UPDATE players SET is_blocked = 1 WHERE room_id = ? AND role = ?').bind(roomId, player.role).run();

    // システムメッセージを挿入
    const now = Date.now();
    const room = await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(roomId).first();
    const elapsedSec = room.started_at ? Math.floor((now - room.started_at) / 1000) : 0;

    await db.prepare(`
        INSERT INTO messages (room_id, player_id, role, sender_name, content, sender_node_at_time, timestamp, elapsed_seconds)
        VALUES (?, 'system', 'system', '🛡️ システム', '被害者が不審者をブロック＆削除しました。通信追跡が遮断されました。', '', ?, ?)
    `).bind(roomId, now, elapsedSec).run();

    // 1人プレイモード（AI戦）の場合のみ、即時ゲーム終了（被害者の勝利）
    let isGameOver = false;
    if (room.is_ai_mode) {
        await db.prepare(`
            UPDATE rooms SET status = 'finished', ended_at = ?, winner = 'victim',
            finish_reason = '【防犯ブロック成功】不審な相手をブロックして危険を回避しました！'
            WHERE id = ?
        `).bind(now, roomId).run();
        isGameOver = true;
    }

    return jsonResponse({
        success: true,
        isBlocked: true,
        isGameOver,
        winner: isGameOver ? 'victim' : null,
        finishReason: isGameOver ? '【防犯ブロック成功】不審な相手をブロックして危険を回避しました！' : null
    }, headers);
}

// 終了後の振り返りデータ取得
async function handleGetReview(request, env, headers, url) {
    const roomId = url.searchParams.get('roomId');
    const db = env.DB;

    const room = await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(roomId).first();
    if (!room) return jsonResponse({ error: 'ルームが存在しません' }, headers, 404);

    const players = await db.prepare('SELECT * FROM players WHERE room_id = ?').bind(roomId).all();
    const moves = await db.prepare('SELECT * FROM moves WHERE room_id = ? ORDER BY id ASC').bind(roomId).all();
    const messages = await db.prepare('SELECT * FROM messages WHERE room_id = ? ORDER BY id ASC').bind(roomId).all();

    return jsonResponse({
        room,
        players: players.results,
        moves: moves.results,
        messages: messages.results,
    }, headers);
}

// ターン行動提出（移動＋チャット）
async function handleTurnAction(request, env, headers) {
    const { roomId, playerId, toNode, chatText } = await request.json();
    const db = env.DB;

    const room = await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(roomId).first();
    if (!room || room.status !== 'playing') {
        return jsonResponse({ error: 'ゲームがプレイ中ではありません' }, headers, 400);
    }

    const mover = await db.prepare('SELECT * FROM players WHERE id = ?').bind(playerId).first();
    if (!mover) return jsonResponse({ error: 'プレイヤーが見つかりません' }, headers, 404);

    // 行動を未確定保存
    await db.prepare(`
        UPDATE players
        SET pending_move_node = ?, pending_chat_text = ?, is_turn_ready = 1
        WHERE id = ?
    `).bind(toNode, (chatText || '').trim(), playerId).run();

    // 相手プレイヤーの準備状況をチェック
    const otherPlayer = await db.prepare('SELECT * FROM players WHERE room_id = ? AND id != ?').bind(roomId, playerId).first();
    if (!otherPlayer || otherPlayer.is_turn_ready !== 1) {
        return jsonResponse({
            success: true,
            waitingOpponent: true,
            currentTurn: room.current_turn || 1,
        }, headers);
    }

    // 【両者揃った！】ターン解決
    const now = Date.now();
    const elapsedSec = room.started_at ? Math.floor((now - room.started_at) / 1000) : 0;
    const currentTurn = room.current_turn || 1;

    const playersInRoom = [
        { ...mover, pending_move_node: toNode, pending_chat_text: (chatText || '').trim() },
        otherPlayer
    ];

    for (const p of playersInRoom) {
        const fromNode = p.current_node;
        const targetNode = p.pending_move_node || p.current_node;

        // 位置更新
        await db.prepare('UPDATE players SET current_node = ?, pending_move_node = NULL, pending_chat_text = NULL, is_turn_ready = 0 WHERE id = ?').bind(targetNode, p.id).run();

        // 移動履歴
        await db.prepare(`
            INSERT INTO moves (room_id, player_id, role, turn, from_node, to_node, timestamp, elapsed_seconds)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(roomId, p.id, p.role, currentTurn, fromNode, targetNode, now, elapsedSec).run();

        // チャット記録
        if (p.pending_chat_text) {
            await db.prepare(`
                INSERT INTO messages (room_id, player_id, role, sender_name, turn, content, sender_node_at_time, timestamp, elapsed_seconds)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(roomId, p.id, p.role, p.name, currentTurn, p.pending_chat_text, targetNode, now, elapsedSec).run();
        }
    }

    // 勝敗判定
    const updatedPlayers = await db.prepare('SELECT * FROM players WHERE room_id = ?').bind(roomId).all();
    const victim = updatedPlayers.results.find(p => p.role === 'victim');
    const criminal = updatedPlayers.results.find(p => p.role === 'criminal');

    let isGameOver = false;
    let winner = null;
    let finishReason = null;

    if (victim && criminal) {
        if (victim.current_node === criminal.current_node) {
            isGameOver = true;
            winner = 'criminal';
            finishReason = `第${currentTurn}ターン：犯罪者が同じ交差点で被害者を確保しました！`;
        } else if (victim.current_node === room.victim_goal_node) {
            isGameOver = true;
            winner = 'victim';
            finishReason = `第${currentTurn}ターン：被害者が目的地（安全地帯）に逃げ込みました！`;
        } else if (currentTurn >= (room.max_turns || 12)) {
            isGameOver = true;
            winner = 'victim';
            finishReason = `全${room.max_turns || 12}ターン逃走成功！警察が到着して安全が確保されました！`;
        }
    }

    if (isGameOver) {
        await db.prepare(`
            UPDATE rooms SET status = 'finished', ended_at = ?, winner = ?, finish_reason = ?
            WHERE id = ?
        `).bind(now, winner, finishReason, roomId).run();
    } else {
        await db.prepare('UPDATE rooms SET current_turn = ? WHERE id = ?').bind(currentTurn + 1, roomId).run();
    }

    return jsonResponse({
        success: true,
        turnResolved: true,
        currentTurn: currentTurn + 1,
        isGameOver,
        winner,
        finishReason,
    }, headers);
}

// 接続切断・退出によるゲーム終了
async function handleAbandonGame(request, env, headers) {
    const { roomId, playerId, reason } = await request.json();
    const db = env.DB;

    const room = await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(roomId).first();
    if (!room) return jsonResponse({ error: 'ルームが存在しません' }, headers, 404);

    const players = await db.prepare('SELECT * FROM players WHERE room_id = ?').bind(roomId).all();
    const survivor = players.results.find(p => p.id === playerId);
    const leaver = players.results.find(p => p.id !== playerId);

    const now = Date.now();
    const winner = survivor ? survivor.role : (room.winner || 'victim');
    const finishReason = reason || (leaver ? `相手（${leaver.name}）の通信切断によりゲーム終了` : '通信切断によりゲーム終了');

    await db.prepare(`
        UPDATE rooms SET status = 'finished', ended_at = ?, winner = ?, finish_reason = ?
        WHERE id = ?
    `).bind(now, winner, finishReason, roomId).run();

    return jsonResponse({
        success: true,
        winner,
        finishReason,
    }, headers);
}

