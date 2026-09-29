/**
 * ゲーム全体進行管理 (game.js) - ターン制心理戦
 *
 * 1手ごとのフロー:
 * 1. プレイヤーが移動先ノード（隣接交差点）を選択
 * 2. 相手へのメッセージ（嘘やヒント）を入力
 * 3. 「行動を確定する」ボタンを押して提出
 * 4. 相手の行動が記録されるのを待つ
 * 5. 相手の行動が揃ったら移動が反映され、チャットが更新され、次の移動が許可される！
 */

class GameManager {
    constructor() {
        this.roomId = null;
        this.playerId = null;
        this.role = 'victim'; // 'victim' or 'criminal'
        this.mapType = '3x3';
        this.isAiMode = false;

        this.pollTimer = null;
        this.goalNodeId = 'node_3_3';
        this.isGameOver = false;

        this.currentTurn = 1;
        this.maxTurns = 12;
        this.isWaitingOpponent = false;

        this.peekBannerTimer = null;
    }

    init() {
        // 多言語・こどもモード初期化
        if (window.languageManager) {
            window.languageManager.init();
        }

        this.bindGlobalEvents();

        // チャット初期化
        const chatContainer = document.getElementById('chatMessagesList');
        window.chatManager.init(
            chatContainer,
            () => this.handleBlockCriminal(),
            (text) => this.handleInstantChatSend(text)
        );

        // ルーム初期化
        window.roomManager.init((roomId, playerId, role, mapType, isAiMode) => {
            this.startGame(roomId, playerId, role, mapType, isAiMode);
        });

        // サウンドトグル
        const btnSound = document.getElementById('btnToggleSound');
        if (btnSound) {
            btnSound.addEventListener('click', () => {
                const enabled = window.soundManager.toggle();
                const dict = window.languageManager ? window.languageManager.dictionary[window.languageManager.isKidsMode ? 'kids' : 'default'] : null;
                const onText = dict ? dict.btnSoundOn : '🔊 音: ON';
                const offText = dict ? dict.btnSoundOff : '🔇 音: OFF';
                btnSound.textContent = enabled ? onText : offText;
            });
        }

        // こどもモード切り替え時のリアルタイム反映
        window.addEventListener('kidsModeChanged', () => {
            this.refreshGameModeTexts();
        });

        // URLパラメータによる自動ソロ起動 (?autoplay=solo) または PVP起動 (?screen=pvp)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('autoplay') === 'solo') {
            setTimeout(() => {
                const btnSolo = document.getElementById('btnPlaySolo');
                if (btnSolo) btnSolo.click();
            }, 300);
        } else if (urlParams.get('screen') === 'pvp') {
            setTimeout(() => {
                const btnPvp = document.getElementById('btnPlayPvp');
                if (btnPvp) btnPvp.click();
            }, 300);
        } else if (urlParams.get('screen') === 'rules') {
            setTimeout(() => {
                const btnRules = document.getElementById('btnHowToPlay');
                if (btnRules) btnRules.click();
            }, 300);
        }
    }

    refreshGameModeTexts() {
        if (!window.languageManager) return;
        const lm = window.languageManager;

        // 役職バッジ
        const roleBadge = document.getElementById('gameHeaderRoleBadge');
        if (roleBadge && this.role) {
            roleBadge.textContent = this.role === 'victim' ? lm.t('roleBadgeVictim') : lm.t('roleBadgeCriminal');
        }

        // ターン数表示
        const turnEl = document.getElementById('gameTurnDisplay');
        if (turnEl) {
            turnEl.textContent = lm.t('turnDisplayFormat')
                .replace('{current}', this.currentTurn || 1)
                .replace('{max}', this.maxTurns || 12);
        }

        // 相手待ち / 自ターンバッジ
        const statusBadge = document.getElementById('gameTurnStatusBadge');
        if (statusBadge) {
            statusBadge.textContent = this.isWaitingOpponent ? lm.t('turnBadgeWaiting') : lm.t('turnBadgeMyTurn');
        }

        // 現在地名
        const locNameEl = document.getElementById('currentLocationName');
        if (locNameEl && window.playerManager.currentNode) {
            const n = window.mapManager.nodes[window.playerManager.currentNode];
            locNameEl.textContent = lm.getNodeName(window.playerManager.currentNode, n ? n.name : window.playerManager.currentNode);
        }

        // 選択中ノード名
        const selectedNameEl = document.getElementById('selectedNodeName');
        if (selectedNameEl) {
            if (window.playerManager.selectedNextNode) {
                const nodeData = window.mapManager.nodes[window.playerManager.selectedNextNode];
                selectedNameEl.textContent = `📍 ${lm.getNodeName(window.playerManager.selectedNextNode, nodeData ? nodeData.name : '')}`;
            } else {
                selectedNameEl.textContent = lm.t('selectedNodeEmpty');
            }
        }

        // ピープバナー
        const peekTextEl = document.getElementById('peekBannerText');
        if (peekTextEl && this.role) {
            peekTextEl.textContent = this.role === 'victim' ? lm.t('peekVictim') : lm.t('peekCriminal');
        }
    }

    bindGlobalEvents() {
        // キーボード操作 (矢印キー / WASDで隣接ノードを選択)
        window.addEventListener('keydown', (e) => {
            if (this.isGameOver || this.isWaitingOpponent) return;
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                return;
            }

            const current = window.playerManager.currentNode;
            if (!current) return;

            const validMoves = window.mapManager.getValidMoves(current);
            const currNode = window.mapManager.nodes[current];
            if (!currNode) return;

            let targetNodeId = null;
            if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
                targetNodeId = validMoves.find(n => window.mapManager.nodes[n].row === currNode.row - 1 && window.mapManager.nodes[n].col === currNode.col);
            } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
                targetNodeId = validMoves.find(n => window.mapManager.nodes[n].row === currNode.row + 1 && window.mapManager.nodes[n].col === currNode.col);
            } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                targetNodeId = validMoves.find(n => window.mapManager.nodes[n].col === currNode.col - 1 && window.mapManager.nodes[n].row === currNode.row);
            } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                targetNodeId = validMoves.find(n => window.mapManager.nodes[n].col === currNode.col + 1 && window.mapManager.nodes[n].row === currNode.row);
            }

            if (targetNodeId) {
                e.preventDefault();
                this.handleNodeClick(targetNodeId);
            }
        });

        // ターン行動確定ボタン
        const btnCommit = document.getElementById('btnCommitTurn');
        const turnChatInput = document.getElementById('turnChatInput');

        if (btnCommit) {
            btnCommit.addEventListener('click', () => this.handleCommitTurn());
        }

        if (turnChatInput) {
            turnChatInput.addEventListener('input', () => {
                this.updateCommitButtonState();
            });
            turnChatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!btnCommit.disabled) {
                        this.handleCommitTurn();
                    }
                }
            });
        }

        // 振り返りリプレイボタン
        const btnPlayReplay = document.getElementById('btnPlayReplay');
        if (btnPlayReplay) {
            btnPlayReplay.addEventListener('click', () => {
                window.resultManager.toggleReplay();
            });
        }

        // タイトルへ戻るボタン
        const btnReturnHome = document.getElementById('btnReturnHome');
        if (btnReturnHome) {
            btnReturnHome.addEventListener('click', () => {
                window.location.reload();
            });
        }

        // リザルト閉じるボタン
        const btnCloseResult = document.getElementById('btnCloseResult');
        if (btnCloseResult) {
            btnCloseResult.addEventListener('click', () => {
                document.getElementById('resultModal').classList.add('hidden');
            });
        }
    }

    // ゲーム開始
    async startGame(roomId, playerId, role, mapType, isAiMode) {
        this.roomId = roomId;
        this.playerId = playerId;
        this.role = role;
        this.mapType = mapType || '3x3';
        this.isAiMode = !!isAiMode;
        this.isGameOver = false;
        this.isWaitingOpponent = false;
        this.currentTurn = 1;

        // 画面切り替え
        const titleEl = document.getElementById('screenTitle');
        const pvpEl = document.getElementById('screenPvpSelect');
        const lobbyEl = document.getElementById('screenLobby');
        if (titleEl) titleEl.classList.add('hidden');
        if (pvpEl) pvpEl.classList.add('hidden');
        if (lobbyEl) lobbyEl.classList.add('hidden');
        document.getElementById('screenGame').classList.remove('hidden');

        // ヘッダー情報
        document.getElementById('gameHeaderRoomId').textContent = roomId;
        const roleBadge = document.getElementById('gameHeaderRoleBadge');
        const lm = window.languageManager;
        roleBadge.textContent = role === 'victim'
            ? (lm ? lm.t('roleBadgeVictim') : '🏃 逃走側 (被害者)')
            : (lm ? lm.t('roleBadgeCriminal') : '🦹 追跡側 (犯罪者)');
        roleBadge.className = `role-badge badge-${role}`;

        // Instagramプロフィールの初期設定 (情報ニキ)
        if (this.isAiMode) {
            window.chatManager.setOpponentProfile('情報ニキ', '@jouhou_niki', 'pic/joho-ranger.png');
        } else {
            window.chatManager.setOpponentProfile('対戦相手', 'user_' + roomId.toLowerCase(), 'pic/joho-ranger.png');
        }

        // 被害者専用ブロックボタン
        const blockContainer = document.getElementById('victimBlockActionContainer');
        if (blockContainer) {
            if (role === 'victim') {
                blockContainer.classList.remove('hidden');
            } else {
                blockContainer.classList.add('hidden');
            }
        }

        // マップ初期化と描画
        window.mapManager.initMapData(this.mapType);
        const mapContainer = document.getElementById('gameMapContainer');
        window.mapManager.render(mapContainer, (nodeId) => this.handleNodeClick(nodeId));

        // 初期位置確認バナー (3秒間)
        const peekBanner = document.getElementById('initialPeekBanner');
        const peekTextEl = document.getElementById('peekBannerText');
        if (peekBanner) {
            peekBanner.classList.remove('hidden');

            if (this.role === 'victim') {
                peekBanner.classList.remove('peek-criminal');
                if (peekTextEl) {
                    peekTextEl.textContent = lm ? lm.t('peekVictim') : '双方の初期位置はこの通りです。犯罪者から逃れ、目的地へ向かいましょう。';
                }
            } else {
                peekBanner.classList.add('peek-criminal');
                if (peekTextEl) {
                    peekTextEl.textContent = lm ? lm.t('peekCriminal') : '双方の初期位置はこの通りです。チャット等を駆使して相手を襲いましょう。';
                }
            }

            let peekSec = 3;
            peekBanner.querySelector('.peek-countdown').textContent = peekSec;
            if (this.peekBannerTimer) clearInterval(this.peekBannerTimer);
            this.peekBannerTimer = setInterval(() => {
                peekSec--;
                if (peekSec > 0) {
                    peekBanner.querySelector('.peek-countdown').textContent = peekSec;
                } else {
                    clearInterval(this.peekBannerTimer);
                    peekBanner.classList.add('hidden');
                }
            }, 1000);
        }

        // AIの起動
        if (this.isAiMode) {
            window.aiCriminal.start(roomId);
        }

        // 初回ステート取得 & ポーリング開始
        this.resetTurnUI();
        await this.syncGameState();
        this.startPolling();
    }

    startPolling() {
        this.stopPolling();
        this.pollTimer = setInterval(() => {
            this.syncGameState();
        }, 1200);
    }

    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    // ゲーム状態同期
    async syncGameState() {
        if (!this.roomId || !this.playerId) return;

        try {
            const state = await window.apiService.getGameState(this.roomId, this.playerId);
            if (!state || !state.room) return;

            const room = state.room;
            this.goalNodeId = room.victimGoalNode;
            this.currentTurn = room.currentTurn || 1;
            this.maxTurns = room.maxTurns || 12;

            // ターン表示更新
            const turnEl = document.getElementById('gameTurnDisplay');
            const lm = window.languageManager;
            if (turnEl) {
                if (lm) {
                    turnEl.textContent = lm.t('turnDisplayFormat')
                        .replace('{current}', this.currentTurn)
                        .replace('{max}', this.maxTurns);
                } else {
                    turnEl.textContent = `第 ${this.currentTurn} ターン / 全 ${this.maxTurns} ターン`;
                }
            }

            // プレイヤー情報取得
            const players = state.players || [];
            const me = players.find(p => p.id === this.playerId);
            const opponent = players.find(p => p.id !== this.playerId);

            // 自分の確定位置を反映
            if (me && me.currentNode) {
                if (window.playerManager.currentNode !== me.currentNode) {
                    window.playerManager.currentNode = me.currentNode;
                    if (!window.playerManager.trail.includes(me.currentNode)) {
                        window.playerManager.trail.push(me.currentNode);
                    }
                }
            }

            if (opponent) {
                window.playerManager.updateOpponent(opponent);
            }

            // チャット更新
            window.chatManager.updateMessages(state.messages, this.playerId, this.role);

            // ブロック状態のUI更新
            if (me && me.isBlocked) {
                const btnBlock = document.getElementById('btnBlockCriminal');
                if (btnBlock) {
                    btnBlock.disabled = true;
                    btnBlock.textContent = '🛡️ ブロック中 (追跡遮断済み)';
                    btnBlock.classList.add('is-blocked');
                }
            }

            // 【重要】自分のターン準備状態の同期
            const isMyTurnReady = state.myStatus?.isReady;
            if (isMyTurnReady) {
                // 自分がすでに提出済みで相手待ちの場合
                this.setWaitingOpponentState(true);
            } else if (this.isWaitingOpponent && !isMyTurnReady) {
                // 相手も提出してターンが解決された瞬間！次の移動が許可される！
                this.setWaitingOpponentState(false);
                this.resetTurnUI();
                if (window.soundManager) window.soundManager.playMoveSound();
            }

            // 移動可能ノードの算出
            const validMoves = window.mapManager.getValidMoves(window.playerManager.currentNode);

            // マップ表示更新
            window.mapManager.updateDisplay({
                myNodeId: window.playerManager.currentNode,
                myRole: this.role,
                selectedNextNodeId: window.playerManager.selectedNextNode,
                opponentNodeId: opponent ? opponent.currentNode : null,
                goalNodeId: this.goalNodeId,
                validMoveNodeIds: this.isWaitingOpponent ? [] : validMoves,
                myTrail: window.playerManager.trail,
                isInitialPeek: room.isInitialPeek
            });

            // 現在地ランドマーク表示
            const locNameEl = document.getElementById('currentLocationName');
            if (locNameEl && window.playerManager.currentNode) {
                const n = window.mapManager.nodes[window.playerManager.currentNode];
                const rawName = n ? n.name : window.playerManager.currentNode;
                locNameEl.textContent = lm ? lm.getNodeName(window.playerManager.currentNode, rawName) : rawName;
            }

            // ゲーム終了判定
            if (room.status === 'finished' && !this.isGameOver) {
                this.isGameOver = true;
                this.stopPolling();
                if (this.isAiMode) window.aiCriminal.stop();
                window.resultManager.showResult(this.roomId, room.winner, room.finishReason, this.role);
            }
        } catch (err) {
            console.error('State sync error:', err);
        }
    }

    // 交差点タップによる移動先選択
    handleNodeClick(targetNodeId) {
        if (this.isGameOver || this.isWaitingOpponent) return;

        const current = window.playerManager.currentNode;
        const validMoves = window.mapManager.getValidMoves(current);

        if (!validMoves.includes(targetNodeId)) {
            return;
        }

        // 選択されたノードを保持
        window.playerManager.selectedNextNode = targetNodeId;

        // UI表示更新
        const nodeData = window.mapManager.nodes[targetNodeId];
        const selectedNameEl = document.getElementById('selectedNodeName');
        const lm = window.languageManager;
        if (selectedNameEl && nodeData) {
            const locName = lm ? lm.getNodeName(targetNodeId, nodeData.name) : nodeData.name;
            selectedNameEl.textContent = `📍 ${locName}`;
            selectedNameEl.style.color = '#0284c7';
        }

        // マップ再描画（選択ターゲットピンを表示）
        window.mapManager.updateDisplay({
            myNodeId: current,
            myRole: this.role,
            selectedNextNodeId: targetNodeId,
            opponentNodeId: null,
            goalNodeId: this.goalNodeId,
            validMoveNodeIds: validMoves,
            myTrail: window.playerManager.trail,
            isInitialPeek: false
        });

        // 効果音
        if (window.soundManager) window.soundManager.playMoveSound();

        // 確定ボタンの活性化を判定
        this.updateCommitButtonState();

        // チャット入力欄へフォーカス
        const inputEl = document.getElementById('turnChatInput');
        if (inputEl && !inputEl.value) {
            inputEl.focus();
        }
    }

    // 確定ボタンの活性化状態
    updateCommitButtonState() {
        const btnCommit = document.getElementById('btnCommitTurn');
        const selectedNode = window.playerManager.selectedNextNode;

        if (btnCommit) {
            // 移動先が選ばれていれば確定可能！
            btnCommit.disabled = !selectedNode || this.isWaitingOpponent;
        }
    }

    // 「行動を確定する」ボタンを押した時
    async handleCommitTurn() {
        const selectedNode = window.playerManager.selectedNextNode;
        if (!selectedNode || this.isWaitingOpponent) return;

        const chatInput = document.getElementById('turnChatInput');
        let chatText = chatInput ? chatInput.value.trim() : '';

        // チャットが空の場合はデフォルトのメッセージ
        if (!chatText) {
            const lm = window.languageManager;
            const isKids = lm && lm.isKidsMode;
            if (this.role === 'victim') {
                chatText = isKids ? '……どこへ にげようかな……' : '……どこへ逃げるべきか……';
            } else {
                chatText = isKids ? '……どこに いるのかな……' : '……どこに潜んでいるんだ……';
            }
        }

        // 待機状態に切り替え
        this.setWaitingOpponentState(true);

        try {
            const res = await window.apiService.submitTurnAction(this.roomId, this.playerId, selectedNode, chatText);

            if (res.turnResolved) {
                // 両者揃って即座にターン解決された場合
                this.setWaitingOpponentState(false);
                this.resetTurnUI();

                if (res.isGameOver) {
                    this.isGameOver = true;
                    this.stopPolling();
                    if (this.isAiMode) window.aiCriminal.stop();
                    window.resultManager.showResult(this.roomId, res.winner, res.finishReason, this.role);
                }
            }

            await this.syncGameState();
        } catch (e) {
            console.error('Turn action error:', e);
            alert('行動の送信に失敗しました: ' + e.message);
            this.setWaitingOpponentState(false);
        }
    }

    // 相手待ち状態のUI切り替え
    setWaitingOpponentState(isWaiting) {
        this.isWaitingOpponent = isWaiting;

        const inputPhase = document.getElementById('turnInputPhase');
        const waitingPhase = document.getElementById('turnWaitingPhase');
        const statusBadge = document.getElementById('gameTurnStatusBadge');
        const lm = window.languageManager;

        if (isWaiting) {
            if (inputPhase) inputPhase.classList.add('hidden');
            if (waitingPhase) waitingPhase.classList.remove('hidden');
            if (statusBadge) {
                statusBadge.textContent = lm ? lm.t('turnBadgeWaiting') : '相手の行動待ち… ⏳';
                statusBadge.style.background = '#fef3c7';
                statusBadge.style.color = '#b45309';
                statusBadge.style.borderColor = '#fde68a';
            }
        } else {
            if (inputPhase) inputPhase.classList.remove('hidden');
            if (waitingPhase) waitingPhase.classList.add('hidden');
            if (statusBadge) {
                statusBadge.textContent = lm ? lm.t('turnBadgeMyTurn') : 'あなたの番';
                statusBadge.style.background = '#e0f2fe';
                statusBadge.style.color = '#0284c7';
                statusBadge.style.borderColor = '#bae6fd';
            }
        }
    }

    // 次のターンのUI初期化
    resetTurnUI() {
        window.playerManager.selectedNextNode = null;

        const selectedNameEl = document.getElementById('selectedNodeName');
        const lm = window.languageManager;
        if (selectedNameEl) {
            selectedNameEl.textContent = lm ? lm.t('selectedNodeEmpty') : '未選択（交差点をタップ）';
            selectedNameEl.style.color = '#b45309';
        }

        const chatInput = document.getElementById('turnChatInput');
        if (chatInput) {
            chatInput.value = '';
        }

        this.updateCommitButtonState();
    }

    // 被害者による不審者ブロック
    async handleBlockCriminal() {
        if (!this.roomId || !this.playerId) return;
        try {
            const res = await window.apiService.blockCriminal(this.roomId, this.playerId);
            if (window.soundManager) window.soundManager.playAlertSound();
            await this.syncGameState();

            // 1人プレイモード（AI戦）の場合のみ、即座にゲーム終了・被害者の勝利！
            if (this.isAiMode && res.isGameOver) {
                this.isGameOver = true;
                this.stopPolling();
                if (window.aiCriminal) window.aiCriminal.stop();

                // ブロック完了の通知を一瞬見せた後に勝利リザルト画面を表示
                setTimeout(() => {
                    window.resultManager.showResult(
                        this.roomId,
                        'victim',
                        res.finishReason || '【防犯ブロック成功】不審な相手をブロックして危険を回避しました！',
                        this.role,
                        true // isBlockVictory
                    );
                }, 800);
            }
        } catch (e) {
            alert('ブロック失敗: ' + e.message);
        }
    }

    // チャット即時送信ハンドラ (Instagram DM入力欄から送信された時)
    async handleInstantChatSend(text) {
        if (!this.roomId || !this.playerId || !text) return;
        try {
            await window.apiService.sendChat(this.roomId, this.playerId, text);
            // 効果音
            if (window.soundManager) window.soundManager.playChatSound();
            // 画面を即座に最新同期
            await this.syncGameState();

            // AIモード時、AI潜伏者による即時返信をトリガー
            if (this.isAiMode && window.aiCriminal && !this.isGameOver) {
                window.aiCriminal.onPlayerChat(text);
            }
        } catch (e) {
            console.error('Instant chat send error:', e);
        }
    }
}

// ゲーム起動
window.addEventListener('DOMContentLoaded', () => {
    window.gameManager = new GameManager();
    window.gameManager.init();
});
