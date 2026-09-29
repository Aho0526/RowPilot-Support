/**
 * AI犯罪者ロジック (ai.js) - ターン制対応
 *
 * プレイヤーの行動（移動＋チャット）提出を受けて、
 * AIも思考の上で「移動先」と「心理戦チャット（嘘・誘導・焦り）」を決定し提出します。
 */

class AiCriminal {
    constructor() {
        this.roomId = null;
        this.aiId = 'ai_criminal_bot';
        this.active = false;
        this.checkTimer = null;
        this.isThinking = false;

        // チャット心理戦メッセージ集 (通常モード)
        this.deceptiveChats = [
            'いま北の公園のあたりにいるよ。そっちは安全？',
            '全然別の方向に来ちゃったみたい。どこにいるの？',
            '怪しい者じゃないから安心して！助けに行くよ。',
            '駅の近くで待ってるね。合流しよう！',
            '川の橋を渡ったところだよ。君はどこ？',
            '大丈夫？近くに危ない人がいるらしいから気をつけて。',
            'コンビニで買い物してるよ。お腹空いてない？'
        ];

        this.chasingChats = [
            '足音が聞こえる気がするな…',
            'そっちに向かってるよ、すぐ着くからね。',
            'もう逃げられないよ。',
            'すぐそばまで来てるはずなんだけどな。'
        ];

        this.lostChats = [
            'あれ…？メッセージが届かない…？',
            'ブロックされた…！？どこに行ったんだ！？',
            '電波が切れた？見失ったぞ…！',
            'チッ、連絡が取れなくなった…どこだ！？'
        ];

        // チャット心理戦メッセージ集 (こどもモード・ひらがな中心)
        this.kidsDeceptiveChats = [
            'いま きたの こうえんの ちかくに いるよ。そっちは だいじょうぶ？',
            'ぜんぜん ちがう ほうこうに きちゃった。どこに いるの？',
            'あやしいひとじゃ ないから あんしんして！たすけに いくよ。',
            'えきの ちかくで まってるね。いっしょに いこう！',
            'かわの はしを わたったよ。きみは どこ？',
            'だいじょうぶ？ちかくに こわいひとが いるらしいから きをつけてね。',
            'コンビニで おかいもの してるよ。おなかすいてない？'
        ];

        this.kidsChasingChats = [
            'あしおとが きこえる きがするな…',
            'そっちに むかってるよ。すぐ つくからね。',
            'もう にげられないよ。',
            'すぐ ちかくに きてるはずなんだけどな。'
        ];

        this.kidsLostChats = [
            'あれ…？メッセージが とどかない…？',
            'ブロックされた…！？どこに いったんだ！？',
            'つうしんが きれた？みうしなっちゃった…！',
            'ちっ、れんらくが とれなくなった…どこだ！？'
        ];
    }

    start(roomId) {
        this.roomId = roomId;
        this.active = true;
        this.isThinking = false;

        // 定期的にプレイヤーの準備状況をチェック（提出されたら即座にターン解決へ）
        this.checkTimer = setInterval(() => {
            this.checkTurnReady();
        }, 800);
    }

    stop() {
        this.active = false;
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    }

    // プレイヤーが行動提出済みかチェックしてAIが応答
    async checkTurnReady() {
        if (!this.active || !this.roomId || this.isThinking) return;

        const data = window.apiService.getLocalData();
        const room = data.rooms[this.roomId];
        if (!room || room.status !== 'playing') {
            this.stop();
            return;
        }

        const victimPlayer = Object.values(data.players).find(p => p.room_id === this.roomId && p.role === 'victim');
        const aiPlayer = data.players[this.aiId];
        if (!victimPlayer || !aiPlayer) return;

        // プレイヤーが行動を提出しており、AIがまだ未提出の場合
        if (victimPlayer.is_turn_ready === 1 && aiPlayer.is_turn_ready !== 1) {
            this.isThinking = true;
            // リアルな人間味のある思考ウェイト (1.0秒)
            setTimeout(async () => {
                try {
                    await this.executeAiTurn(room, victimPlayer, aiPlayer);
                } finally {
                    this.isThinking = false;
                }
            }, 1000);
        }
    }

    async executeAiTurn(room, victimPlayer, aiPlayer) {
        const isVictimBlocked = victimPlayer.is_blocked === 1;

        // 1. 移動先ノードの決定
        const validMoves = window.mapManager.getValidMoves(aiPlayer.current_node);
        if (!validMoves || validMoves.length === 0) return;

        let nextNode = null;
        if (!isVictimBlocked) {
            // 【ブロック前】AIは被害者の位置を把握！最短経路で詰める
            const shortestPath = window.mapManager.getShortestPath(aiPlayer.current_node, victimPlayer.current_node);
            if (shortestPath && shortestPath.length > 1) {
                nextNode = shortestPath[1];
            } else {
                nextNode = validMoves[Math.floor(Math.random() * validMoves.length)];
            }
        } else {
            // 【ブロック後】GPS遮断！被害者の位置を見失いランダム巡回
            nextNode = validMoves[Math.floor(Math.random() * validMoves.length)];
        }

        // 2. 心理戦チャットの決定
        const isKids = window.languageManager && window.languageManager.isKidsMode;
        let chatText = '';
        if (isVictimBlocked) {
            const pool = isKids ? this.kidsLostChats : this.lostChats;
            chatText = pool[Math.floor(Math.random() * pool.length)];
        } else {
            const dist = window.mapManager.getDistance(aiPlayer.current_node, victimPlayer.current_node);
            if (dist <= 2) {
                const pool = isKids ? this.kidsChasingChats : this.chasingChats;
                chatText = pool[Math.floor(Math.random() * pool.length)];
            } else {
                const pool = isKids ? this.kidsDeceptiveChats : this.deceptiveChats;
                chatText = pool[Math.floor(Math.random() * pool.length)];
            }
        }

        // 3. ターン行動提出（これにより両者の行動が揃ってターン解決！）
        await window.apiService.submitTurnAction(this.roomId, this.aiId, nextNode, chatText);
    }

    // プレイヤーがDMで即時送信した際のリアルタイム返信
    async onPlayerChat(playerText) {
        if (!this.active || !this.roomId) return;

        const data = window.apiService.getLocalData();
        const victimPlayer = Object.values(data.players).find(p => p.room_id === this.roomId && p.role === 'victim');
        if (!victimPlayer) return;

        // ブロックされている場合は返信しない（ブロックの防犯効果）
        if (victimPlayer.is_blocked === 1) return;

        // 1.0秒〜1.8秒の人間味のあるタイピングディレイの後に返信
        setTimeout(async () => {
            if (!this.active) return;
            const currentData = window.apiService.getLocalData();
            const currentVictim = Object.values(currentData.players).find(p => p.room_id === this.roomId && p.role === 'victim');
            if (!currentVictim || currentVictim.is_blocked === 1) return;

            const isKids = window.languageManager && window.languageManager.isKidsMode;
            const defaultReplies = [
                'どこにいるの？写真送ってよ',
                'そっちに向かってるよ！',
                '近くにいる気がするんだけどな',
                '急にどうしたの？',
                '大丈夫？すぐ助けに行くからね',
                '待ってて、すぐ合流できるよ'
            ];
            const kidsReplies = [
                'どこに いるの？しゃしん おくってよ',
                'そっちに むかってるよ！',
                'ちかくに いる きがするんだけどな',
                'きゅうに どうしたの？',
                'だいじょうぶ？すぐ たすけに いくからね',
                'まってて、すぐ あえるよ'
            ];

            const pool = isKids ? kidsReplies : defaultReplies;
            const reply = pool[Math.floor(Math.random() * pool.length)];
            await window.apiService.sendChat(this.roomId, this.aiId, reply);

            if (window.gameManager) {
                window.gameManager.syncGameState();
            }
        }, 1200);
    }
}

// グローバルインスタンス
window.aiCriminal = new AiCriminal();
