/**
 * API 通信マネージャー (api.js) - ターン制心理戦対応
 *
 * 各ターンで「移動先の決定」＋「チャット（ヒントや嘘）」を提出。
 * 両者の行動が揃ったら移動が確定・反映され、チャットが送受信されて次のターンへ進みます。
 */

class ApiService {
    constructor() {
        const savedUrl = localStorage.getItem('crime_server_url');
        // デフォルトでデプロイ済みCloudflare Workersを使用
        this.serverUrl = savedUrl !== null ? savedUrl : 'https://crime-avoiding-game.rowpilot-jp.workers.dev';
        this.broadcastChannel = null;
        this.localDbKey = 'crime_game_local_data';
        this.onLocalUpdateCallback = null;

        this.initLocalChannel();
    }

    setServerUrl(url) {
        this.serverUrl = (url || '').trim().replace(/\/$/, '');
        localStorage.setItem('crime_server_url', this.serverUrl);
    }

    isRemoteMode() {
        return !!this.serverUrl;
    }

    initLocalChannel() {
        if (typeof BroadcastChannel !== 'undefined') {
            this.broadcastChannel = new BroadcastChannel('crime_game_channel');
            this.broadcastChannel.onmessage = (event) => {
                if (this.onLocalUpdateCallback) {
                    this.onLocalUpdateCallback(event.data);
                }
            };
        }
    }

    getLocalData() {
        try {
            const raw = localStorage.getItem(this.localDbKey);
            return raw ? JSON.parse(raw) : { rooms: {}, players: {}, moves: [], messages: [] };
        } catch (e) {
            return { rooms: {}, players: {}, moves: [], messages: [] };
        }
    }

    saveLocalData(data) {
        localStorage.setItem(this.localDbKey, JSON.stringify(data));
        if (this.broadcastChannel) {
            this.broadcastChannel.postMessage({ type: 'DATA_SYNC', timestamp: Date.now() });
        }
    }

    // ==========================================
    // API メソッド群
    // ==========================================

    // ルーム作成
    async createRoom(hostName, preferredRole, mapType = '3x3', isAiMode = false) {
        if (this.isRemoteMode()) {
            const res = await fetch(`${this.serverUrl}/api/room/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hostName, preferredRole, mapType, isAiMode })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'ルーム作成に失敗しました');
            return await res.json();
        }

        // --- ローカル擬似サーバー ---
        const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        const playerId = 'p_' + Math.random().toString(36).substring(2, 8);
        const hostRole = preferredRole === 'criminal' ? 'criminal' : 'victim';
        const guestRole = hostRole === 'criminal' ? 'victim' : 'criminal';

        const victimStart = mapType === '4x4' ? 'node_0_4' : 'node_0_3';
        const criminalStart = mapType === '4x4' ? 'node_4_0' : 'node_3_0';
        const victimGoal = mapType === '4x4' ? 'node_4_4' : 'node_3_3';

        const now = Date.now();
        const data = this.getLocalData();

        data.rooms[roomId] = {
            id: roomId,
            status: isAiMode ? 'playing' : 'waiting',
            map_type: mapType,
            current_turn: 1,
            max_turns: 12,
            started_at: isAiMode ? now : null,
            ended_at: null,
            winner: null,
            finish_reason: null,
            victim_goal_node: victimGoal,
            created_at: now,
            isAiMode: !!isAiMode
        };

        const hostStartNode = hostRole === 'victim' ? victimStart : criminalStart;
        data.players[playerId] = {
            id: playerId,
            room_id: roomId,
            role: hostRole,
            name: hostName || 'あなた',
            current_node: hostStartNode,
            pending_move_node: null,
            pending_chat_text: null,
            is_turn_ready: 0,
            is_blocked: 0,
            joined_at: now
        };

        if (isAiMode) {
            const aiId = 'ai_criminal_bot';
            const aiRole = guestRole;
            const aiStartNode = aiRole === 'victim' ? victimStart : criminalStart;
            data.players[aiId] = {
                id: aiId,
                room_id: roomId,
                role: aiRole,
                name: 'AI潜伏者',
                current_node: aiStartNode,
                pending_move_node: null,
                pending_chat_text: null,
                is_turn_ready: 0,
                is_blocked: 0,
                joined_at: now
            };
            // 初期位置記録
            data.moves.push({
                room_id: roomId,
                player_id: playerId,
                role: hostRole,
                turn: 0,
                from_node: hostStartNode,
                to_node: hostStartNode,
                timestamp: now,
                elapsed_seconds: 0
            });
            data.moves.push({
                room_id: roomId,
                player_id: aiId,
                role: aiRole,
                turn: 0,
                from_node: aiStartNode,
                to_node: aiStartNode,
                timestamp: now,
                elapsed_seconds: 0
            });
        }

        this.saveLocalData(data);

        return {
            success: true,
            roomId,
            playerId,
            role: hostRole,
            isAiMode
        };
    }

    // ルーム参加
    async joinRoom(roomId, playerName) {
        roomId = (roomId || '').trim().toUpperCase();
        if (this.isRemoteMode()) {
            const res = await fetch(`${this.serverUrl}/api/room/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId, playerName })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'ルーム参加に失敗しました');
            return await res.json();
        }

        // --- ローカル擬似サーバー ---
        const data = this.getLocalData();
        const room = data.rooms[roomId];
        if (!room) throw new Error('ルームが見つかりません');
        if (room.status !== 'waiting') throw new Error('このルームは既に対戦中または終了しています');

        const existingPlayers = Object.values(data.players).filter(p => p.room_id === roomId);
        if (existingPlayers.length >= 2) throw new Error('ルームが満員です');

        const hostPlayer = existingPlayers[0];
        const role = hostPlayer.role === 'criminal' ? 'victim' : 'criminal';
        const startNode = role === 'victim'
            ? (room.map_type === '4x4' ? 'node_0_4' : 'node_0_3')
            : (room.map_type === '4x4' ? 'node_4_0' : 'node_3_0');

        const playerId = 'p_' + Math.random().toString(36).substring(2, 8);
        const now = Date.now();

        data.players[playerId] = {
            id: playerId,
            room_id: roomId,
            role,
            name: playerName || 'プレイヤー2',
            current_node: startNode,
            pending_move_node: null,
            pending_chat_text: null,
            is_turn_ready: 0,
            is_blocked: 0,
            joined_at: now
        };

        this.saveLocalData(data);

        return {
            success: true,
            roomId,
            playerId,
            role,
            mapType: room.map_type
        };
    }

    // ゲーム開始
    async startGame(roomId, playerId) {
        if (this.isRemoteMode()) {
            const res = await fetch(`${this.serverUrl}/api/room/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId, playerId })
            });
            if (!res.ok) throw new Error((await res.json()).error || '開始に失敗しました');
            return await res.json();
        }

        // --- ローカル処理 ---
        const data = this.getLocalData();
        const room = data.rooms[roomId];
        if (!room) throw new Error('ルームが存在しません');

        const roomPlayers = Object.values(data.players).filter(p => p.room_id === roomId);
        if (roomPlayers.length < 2) throw new Error('プレイヤーが揃っていません');

        const now = Date.now();
        room.status = 'playing';
        room.started_at = now;
        room.current_turn = 1;

        for (const p of roomPlayers) {
            p.is_turn_ready = 0;
            p.pending_move_node = null;
            p.pending_chat_text = null;
            data.moves.push({
                room_id: roomId,
                player_id: p.id,
                role: p.role,
                turn: 0,
                from_node: p.current_node,
                to_node: p.current_node,
                timestamp: now,
                elapsed_seconds: 0
            });
        }

        this.saveLocalData(data);
        return { success: true, startedAt: now };
    }

    // ゲーム状態取得（情報非対称性マスキング処理）
    async getGameState(roomId, playerId) {
        if (this.isRemoteMode()) {
            const res = await fetch(`${this.serverUrl}/api/game/state?roomId=${roomId}&playerId=${playerId}`, {
                headers: { 'X-Player-Id': playerId }
            });
            if (!res.ok) throw new Error((await res.json()).error || '状態取得失敗');
            return await res.json();
        }

        // --- ローカル擬似サーバー処理 ---
        const data = this.getLocalData();
        const room = data.rooms[roomId];
        if (!room) throw new Error('ルームが存在しません');

        const players = Object.values(data.players).filter(p => p.room_id === roomId);
        const myPlayer = players.find(p => p.id === playerId);
        const opponentPlayer = players.find(p => p.id !== playerId);

        const now = Date.now();
        let isInitialPeek = false;

        if (room.status === 'playing' && room.started_at) {
            const elapsedSec = Math.floor((now - room.started_at) / 1000);
            if (elapsedSec <= 3 && room.current_turn === 1) {
                isInitialPeek = true;
            }
        }

        // 徹底した情報非対称性: 相手の位置は隠蔽
        const sanitizedPlayers = players.map(p => {
            const isSelf = p.id === playerId;
            const canSee = isSelf || room.status === 'finished' || isInitialPeek;

            return {
                id: p.id,
                name: p.name,
                role: p.role,
                isBlocked: p.is_blocked,
                isTurnReady: p.is_turn_ready === 1,
                currentNode: canSee ? p.current_node : null,
                isSelf
            };
        });

        const messages = data.messages
            .filter(m => m.room_id === roomId)
            .map(m => ({
                id: m.id || m.timestamp,
                player_id: m.player_id,
                role: m.role,
                sender_name: m.sender_name,
                turn: m.turn,
                content: m.content,
                timestamp: m.timestamp,
                elapsed_seconds: m.elapsed_seconds
            }));

        return {
            room: {
                id: room.id,
                status: room.status,
                mapType: room.map_type,
                currentTurn: room.current_turn || 1,
                maxTurns: room.max_turns || 12,
                victimGoalNode: room.victim_goal_node,
                winner: room.winner,
                finishReason: room.finish_reason,
                isInitialPeek,
                isAiMode: room.isAiMode
            },
            myStatus: {
                isReady: myPlayer ? (myPlayer.is_turn_ready === 1) : false,
                pendingMoveNode: myPlayer ? myPlayer.pending_move_node : null
            },
            opponentStatus: {
                isReady: opponentPlayer ? (opponentPlayer.is_turn_ready === 1) : false
            },
            players: sanitizedPlayers,
            messages
        };
    }

    // 【重要】ターン行動提出（移動先決定 ＋ チャット送信）
    async submitTurnAction(roomId, playerId, toNode, chatText) {
        if (this.isRemoteMode()) {
            const res = await fetch(`${this.serverUrl}/api/game/turn-action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId, playerId, toNode, chatText })
            });
            if (!res.ok) throw new Error((await res.json()).error || '行動提出エラー');
            return await res.json();
        }

        // --- ローカル擬似サーバー処理（同時ターン解決システム） ---
        const data = this.getLocalData();
        const room = data.rooms[roomId];
        if (!room || room.status !== 'playing') throw new Error('ゲーム中ではありません');

        const mover = data.players[playerId];
        if (!mover) throw new Error('プレイヤーが見つかりません');

        // 行動を記録
        mover.pending_move_node = toNode;
        mover.pending_chat_text = (chatText || '').trim();
        mover.is_turn_ready = 1;

        // 相手プレイヤーの準備状況をチェック
        const opponent = Object.values(data.players).find(p => p.room_id === roomId && p.id !== playerId);

        // 相手がまだ未提出の場合 → 待機中
        if (!opponent || opponent.is_turn_ready !== 1) {
            this.saveLocalData(data);
            return {
                success: true,
                waitingOpponent: true,
                currentTurn: room.current_turn
            };
        }

        // ==========================================
        // 【両者の行動が揃った！】ターン解決フェーズ
        // ==========================================
        const now = Date.now();
        const elapsedSec = room.started_at ? Math.floor((now - room.started_at) / 1000) : 0;
        const currentTurn = room.current_turn;

        const playersInRoom = [mover, opponent];

        for (const p of playersInRoom) {
            const fromNode = p.current_node;
            const targetNode = p.pending_move_node || p.current_node;
            p.current_node = targetNode;

            // 移動ログ記録
            data.moves.push({
                room_id: roomId,
                player_id: p.id,
                role: p.role,
                turn: currentTurn,
                from_node: fromNode,
                to_node: targetNode,
                timestamp: now,
                elapsed_seconds: elapsedSec
            });

            // チャットログ記録（発言時の実際の位置も記録）
            if (p.pending_chat_text) {
                data.messages.push({
                    id: 'm_' + Math.random().toString(36).substring(2, 9),
                    room_id: roomId,
                    player_id: p.id,
                    role: p.role,
                    sender_name: p.name,
                    turn: currentTurn,
                    content: p.pending_chat_text,
                    sender_node_at_time: targetNode,
                    timestamp: now,
                    elapsed_seconds: elapsedSec
                });
            }

            // フラグリセット
            p.pending_move_node = null;
            p.pending_chat_text = null;
            p.is_turn_ready = 0;
        }

        // 勝敗判定
        const victimPlayer = playersInRoom.find(p => p.role === 'victim');
        const criminalPlayer = playersInRoom.find(p => p.role === 'criminal');

        let isGameOver = false;
        let winner = null;
        let finishReason = null;

        if (victimPlayer && criminalPlayer) {
            // 接触判定
            if (victimPlayer.current_node === criminalPlayer.current_node) {
                isGameOver = true;
                winner = 'criminal';
                finishReason = `第${currentTurn}ターン：犯罪者が同じ交差点で被害者を確保しました！`;
            }
            // 目的地ゴール判定
            else if (victimPlayer.current_node === room.victim_goal_node) {
                isGameOver = true;
                winner = 'victim';
                finishReason = `第${currentTurn}ターン：被害者が目的地（安全地帯）に逃げ込みました！`;
            }
            // 最大ターン数到達（タイムアップ逃走成功）
            else if (currentTurn >= room.max_turns) {
                isGameOver = true;
                winner = 'victim';
                finishReason = `全${room.max_turns}ターン逃走成功！警察が到着して安全が確保されました！`;
            }
        }

        if (isGameOver) {
            room.status = 'finished';
            room.ended_at = now;
            room.winner = winner;
            room.finish_reason = finishReason;
        } else {
            room.current_turn = currentTurn + 1;
        }

        this.saveLocalData(data);

        return {
            success: true,
            turnResolved: true,
            currentTurn: room.current_turn,
            isGameOver,
            winner,
            finishReason
        };
    }

    // チャット単独送信（通常会話）
    async sendChat(roomId, playerId, content) {
        if (!content || !content.trim()) return;

        if (this.isRemoteMode()) {
            const res = await fetch(`${this.serverUrl}/api/chat/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId, playerId, content })
            });
            if (!res.ok) throw new Error((await res.json()).error || '送信失敗');
            return await res.json();
        }

        const data = this.getLocalData();
        const room = data.rooms[roomId];
        const player = data.players[playerId];
        if (!room || !player) throw new Error('送信エラー');

        const now = Date.now();
        const elapsedSec = room.started_at ? Math.floor((now - room.started_at) / 1000) : 0;

        data.messages.push({
            id: 'm_' + Math.random().toString(36).substring(2, 9),
            room_id: roomId,
            player_id: playerId,
            role: player.role,
            sender_name: player.name,
            turn: room.current_turn || 1,
            content: content.trim(),
            sender_node_at_time: player.current_node,
            timestamp: now,
            elapsed_seconds: elapsedSec
        });

        this.saveLocalData(data);
        return { success: true };
    }

    // 被害者による「ブロック＆削除」
    async blockCriminal(roomId, playerId) {
        if (this.isRemoteMode()) {
            const res = await fetch(`${this.serverUrl}/api/game/block`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId, playerId })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'ブロック失敗');
            return await res.json();
        }

        const data = this.getLocalData();
        const player = data.players[playerId];
        if (!player || player.role !== 'victim') throw new Error('被害者のみ実行可能です');

        player.is_blocked = 1;
        const now = Date.now();
        const room = data.rooms[roomId];
        const elapsedSec = room && room.started_at ? Math.floor((now - room.started_at) / 1000) : 0;

        data.messages.push({
            id: 'm_' + Math.random().toString(36).substring(2, 9),
            room_id: roomId,
            player_id: 'system',
            role: 'system',
            sender_name: '🛡️ 防犯システム',
            turn: room ? room.current_turn : 1,
            content: '【不審者をブロック＆削除しました】相手からの追跡通信が遮断されました！',
            sender_node_at_time: '',
            timestamp: now,
            elapsed_seconds: elapsedSec
        });

        // 1人モード（AI戦）のみ、ブロック実行で即時ゲーム終了（被害者の勝利）
        let isGameOver = false;
        if (room && room.isAiMode) {
            room.status = 'finished';
            room.ended_at = now;
            room.winner = 'victim';
            room.finish_reason = '【防犯ブロック成功】不審な相手をブロックして危険を回避しました！';
            isGameOver = true;
        }

        this.saveLocalData(data);
        return {
            success: true,
            isBlocked: true,
            isGameOver,
            winner: room ? room.winner : null,
            finishReason: room ? room.finish_reason : null
        };
    }

    // 振り返りデータ取得
    async getReviewData(roomId) {
        if (this.isRemoteMode()) {
            const res = await fetch(`${this.serverUrl}/api/game/review?roomId=${roomId}`);
            if (!res.ok) throw new Error((await res.json()).error || '振り返りデータ取得失敗');
            return await res.json();
        }

        const data = this.getLocalData();
        const room = data.rooms[roomId];
        const players = Object.values(data.players).filter(p => p.room_id === roomId);
        const moves = data.moves.filter(m => m.room_id === roomId);
        const messages = data.messages.filter(m => m.room_id === roomId);

        return {
            room,
            players,
            moves,
            messages
        };
    }
}

// グローバルインスタンス
window.apiService = new ApiService();
