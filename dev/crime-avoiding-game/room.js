/**
 * ルーム管理モジュール (room.js)
 *
 * - タイトル画面、2人対戦選択、ルーム作成・参加、ロビー待機
 * - 一人でプレイ (AI即時開始)
 */

class RoomManager {
    constructor() {
        this.roomId = null;
        this.isHost = false;
        this.pollTimer = null;
        this.onGameStartCallback = null;
    }

    init(onGameStart) {
        this.onGameStartCallback = onGameStart;
        this.bindEvents();
    }

    bindEvents() {
        // 1. タイトル画面: 「一人でプレイ」ボタン
        const btnPlaySolo = document.getElementById('btnPlaySolo');
        if (btnPlaySolo) {
            btnPlaySolo.addEventListener('click', () => {
                // AIとのセッションを即時開始！
                this.handleStartSoloAi();
            });
        }

        // 2. タイトル画面: 「2人でプレイ (オンライン)」ボタン
        const btnPlayPvp = document.getElementById('btnPlayPvp');
        if (btnPlayPvp) {
            btnPlayPvp.addEventListener('click', () => {
                document.getElementById('screenTitle').classList.add('hidden');
                document.getElementById('screenPvpSelect').classList.remove('hidden');
            });
        }

        // 3. 2人対戦画面: 「← タイトルに戻る」ボタン
        const btnBackToTitle = document.getElementById('btnBackToTitleFromPvp');
        if (btnBackToTitle) {
            btnBackToTitle.addEventListener('click', () => {
                document.getElementById('screenPvpSelect').classList.add('hidden');
                document.getElementById('screenTitle').classList.remove('hidden');
            });
        }

        // 4. ロビー画面: 「← 退出する」ボタン
        const btnLeaveLobby = document.getElementById('btnLeaveLobby');
        if (btnLeaveLobby) {
            btnLeaveLobby.addEventListener('click', () => {
                this.stopLobbyPolling();
                document.getElementById('screenLobby').classList.add('hidden');
                document.getElementById('screenPvpSelect').classList.remove('hidden');
            });
        }

        // 5. ルール説明モーダル
        const btnHowToPlay = document.getElementById('btnHowToPlay');
        const rulesModal = document.getElementById('rulesModal');
        const btnCloseRules = document.getElementById('btnCloseRules');

        if (btnHowToPlay && rulesModal) {
            btnHowToPlay.addEventListener('click', () => {
                rulesModal.classList.remove('hidden');
            });
        }
        if (btnCloseRules && rulesModal) {
            btnCloseRules.addEventListener('click', () => {
                rulesModal.classList.add('hidden');
            });
        }

        // 6. ルーム作成ボタン
        const btnCreateRoom = document.getElementById('btnCreateRoom');
        if (btnCreateRoom) {
            btnCreateRoom.addEventListener('click', () => this.handleCreateRoom());
        }

        // 7. ルーム参加ボタン
        const btnJoinRoom = document.getElementById('btnJoinRoom');
        if (btnJoinRoom) {
            btnJoinRoom.addEventListener('click', () => this.handleJoinRoom());
        }

        // 8. ルームコードコピーボタン
        const btnCopyCode = document.getElementById('btnCopyCode');
        if (btnCopyCode) {
            btnCopyCode.addEventListener('click', () => {
                const codeEl = document.getElementById('lobbyRoomCode');
                if (codeEl) {
                    navigator.clipboard.writeText(codeEl.textContent.trim());
                    btnCopyCode.textContent = 'コピー完了！';
                    setTimeout(() => { btnCopyCode.textContent = 'コードをコピー'; }, 2000);
                }
            });
        }

        // 9. ホストによる「ゲーム開始」ボタン
        const btnHostStart = document.getElementById('btnHostStart');
        if (btnHostStart) {
            btnHostStart.addEventListener('click', () => this.handleHostStart());
        }

        // 10. サーバー接続設定
        const btnToggleSettings = document.getElementById('btnToggleSettings');
        const settingsBox = document.getElementById('serverSettingsBox');
        const inputServerUrl = document.getElementById('inputServerUrl');
        const btnSaveServerUrl = document.getElementById('btnSaveServerUrl');
        const btnResetServerUrl = document.getElementById('btnResetServerUrl');
        const headerOnlineBadge = document.getElementById('headerOnlineBadge');
        const serverStatusTag = document.getElementById('serverStatusTag');

        const updateConnectionBadge = () => {
            const isOnline = window.apiService.isRemoteMode();
            const lm = window.langManager;
            const onlineText = lm ? lm.t('badgeOnline') : '● オンライン';
            const localText = lm ? lm.t('badgeLocal') : '● ローカル';

            if (headerOnlineBadge) {
                headerOnlineBadge.textContent = isOnline ? onlineText : localText;
                headerOnlineBadge.style.color = isOnline ? '#16a34a' : '#d97706';
                headerOnlineBadge.style.background = isOnline ? '#dcfce7' : '#fef3c7';
            }
            if (serverStatusTag) {
                serverStatusTag.textContent = isOnline ? (onlineText + ' (Cloudflare D1)') : localText;
                serverStatusTag.style.color = isOnline ? '#16a34a' : '#d97706';
                serverStatusTag.style.background = isOnline ? '#dcfce7' : '#fef3c7';
            }
        };
        window.updateConnectionBadgeUI = updateConnectionBadge;

        if (inputServerUrl) {
            inputServerUrl.value = window.apiService.serverUrl;
        }
        updateConnectionBadge();

        if (btnToggleSettings && settingsBox) {
            btnToggleSettings.addEventListener('click', () => {
                settingsBox.classList.toggle('hidden');
            });
        }

        if (btnSaveServerUrl && inputServerUrl) {
            btnSaveServerUrl.addEventListener('click', () => {
                window.apiService.setServerUrl(inputServerUrl.value);
                updateConnectionBadge();
                alert('サーバー設定を保存しました: ' + (inputServerUrl.value ? inputServerUrl.value : 'ローカル同期モード'));
                if (settingsBox) settingsBox.classList.add('hidden');
            });
        }

        if (btnResetServerUrl && inputServerUrl) {
            btnResetServerUrl.addEventListener('click', () => {
                const defaultUrl = 'https://crime-avoiding-game.rowpilot-jp.workers.dev';
                inputServerUrl.value = defaultUrl;
                window.apiService.setServerUrl(defaultUrl);
                updateConnectionBadge();
                alert('専用サーバー（Cloudflare Workers + D1）にリセットしました');
                if (settingsBox) settingsBox.classList.add('hidden');
            });
        }
    }

    // 「一人でプレイ (AI対戦)」を即時開始
    async handleStartSoloAi() {
        const playerName = 'あなた';
        const role = 'victim'; // AI戦はプレイヤーが逃げる側
        const mapType = '3x3';

        try {
            const res = await window.apiService.createRoom(playerName, role, mapType, true);
            this.roomId = res.roomId;
            this.isHost = true;

            const startNode = 'node_0_3';
            window.playerManager.setMe(res.playerId, playerName, role, startNode);
            window.mapManager.initMapData(mapType);

            // コールバック呼び出しでゲーム画面へ直行！
            if (this.onGameStartCallback) {
                this.onGameStartCallback(this.roomId, res.playerId, role, mapType, true);
            }
        } catch (err) {
            alert('AI対戦の開始に失敗しました: ' + err.message);
        }
    }

    // ルーム作成処理 (2人対戦)
    async handleCreateRoom() {
        const nameInput = document.getElementById('hostPlayerName');
        const playerName = nameInput ? nameInput.value.trim() : 'プレイヤー1';

        const roleEl = document.querySelector('input[name="hostRole"]:checked');
        const role = roleEl ? roleEl.value : 'victim';

        const mapTypeEl = document.querySelector('input[name="hostMapType"]:checked');
        const mapType = mapTypeEl ? mapTypeEl.value : '3x3';

        try {
            const res = await window.apiService.createRoom(playerName, role, mapType, false);
            this.roomId = res.roomId;
            this.isHost = true;

            const startNode = mapType === '4x4'
                ? (role === 'victim' ? 'node_0_4' : 'node_4_0')
                : (role === 'victim' ? 'node_0_3' : 'node_3_0');

            window.playerManager.setMe(res.playerId, playerName, role, startNode);
            window.mapManager.initMapData(mapType);

            // ロビー画面へ遷移
            this.showLobby(res.roomId, role);
            this.startLobbyPolling();
        } catch (err) {
            alert('ルーム作成エラー: ' + err.message);
        }
    }

    // ルーム参加処理
    async handleJoinRoom() {
        const roomInput = document.getElementById('joinRoomCode');
        const nameInput = document.getElementById('joinPlayerName');
        const roomId = roomInput ? roomInput.value.trim() : '';
        const playerName = nameInput ? nameInput.value.trim() : 'プレイヤー2';

        if (!roomId) {
            alert('ルームコードを入力してください');
            return;
        }

        try {
            const res = await window.apiService.joinRoom(roomId, playerName);
            this.roomId = res.roomId;
            this.isHost = false;

            const startNode = res.role === 'victim' ? 'node_0_3' : 'node_3_0';
            window.playerManager.setMe(res.playerId, playerName, res.role, startNode);

            this.showLobby(res.roomId, res.role);
            this.startLobbyPolling();
        } catch (err) {
            alert('ルーム参加エラー: ' + err.message);
        }
    }

    // ロビー画面表示
    showLobby(roomId, role) {
        document.getElementById('screenTitle').classList.add('hidden');
        document.getElementById('screenPvpSelect').classList.add('hidden');
        document.getElementById('screenLobby').classList.remove('hidden');

        document.getElementById('lobbyRoomCode').textContent = roomId;
        const myRoleBadge = document.getElementById('lobbyMyRole');
        const lm = window.languageManager;
        myRoleBadge.textContent = role === 'victim'
            ? (lm ? lm.t('roleBadgeVictim') : '🏃 逃走側 (被害者)')
            : (lm ? lm.t('roleBadgeCriminal') : '🦹 追跡側 (犯罪者)');
        myRoleBadge.className = `role-badge badge-${role}`;

        const hostControls = document.getElementById('lobbyHostControls');
        const guestWaiting = document.getElementById('lobbyGuestWaiting');

        if (this.isHost) {
            if (hostControls) hostControls.classList.remove('hidden');
            if (guestWaiting) guestWaiting.classList.add('hidden');
        } else {
            if (hostControls) hostControls.classList.add('hidden');
            if (guestWaiting) guestWaiting.classList.remove('hidden');
        }
    }

    // ロビー待機ポーリング
    startLobbyPolling() {
        this.stopLobbyPolling();
        this.pollTimer = setInterval(async () => {
            try {
                const state = await window.apiService.getGameState(this.roomId, window.playerManager.myId);
                const players = state.players || [];
                const lm = window.languageManager;
                const isKids = lm && lm.isKidsMode;

                // 参加人数の表示更新
                const countEl = document.getElementById('lobbyPlayerCount');
                if (countEl) {
                    const unit = isKids ? 'にん' : '人';
                    countEl.textContent = `${players.length} / 2 ${unit}`;
                }

                const playerListEl = document.getElementById('lobbyPlayerList');
                if (playerListEl) {
                    playerListEl.innerHTML = players.map(p => {
                        const selfTag = isKids ? '(あなた)' : '(あなた)';
                        const roleText = p.role === 'criminal'
                            ? (isKids ? 'おうがわ' : '追跡側')
                            : (isKids ? 'にげるがわ' : '逃走側');
                        return `
                            <div class="lobby-player-item ${p.isSelf ? 'is-me' : ''}">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span style="font-size:1.4rem;">${p.role === 'criminal' ? '🦹' : '🏃'}</span>
                                    <span>${p.name} ${p.isSelf ? `<small style="color:var(--text-muted);">${selfTag}</small>` : ''}</span>
                                </div>
                                <span class="role-badge badge-${p.role}">${roleText}</span>
                            </div>
                        `;
                    }).join('');
                }

                // ホスト側: 2人揃ったら開始ボタン活性化
                if (this.isHost) {
                    const btnStart = document.getElementById('btnHostStart');
                    if (btnStart) {
                        btnStart.disabled = players.length < 2;
                        if (players.length >= 2) {
                            btnStart.textContent = isKids ? '🚀 ゲームを はじめる！' : '🚀 ゲームを開始する！';
                            btnStart.classList.add('btn-primary');
                        } else {
                            btnStart.textContent = isKids ? 'ともだちが くるのを まっています…' : '友達の参加を待っています…';
                            btnStart.classList.remove('btn-primary');
                        }
                    }
                }

                // ゲーム開始検出
                if (state.room && state.room.status === 'playing') {
                    this.stopLobbyPolling();
                    if (this.onGameStartCallback) {
                        const me = players.find(p => p.id === window.playerManager.myId);
                        this.onGameStartCallback(
                            this.roomId,
                            window.playerManager.myId,
                            me ? me.role : 'victim',
                            state.room.mapType,
                            false
                        );
                    }
                }
            } catch (e) {
                console.error('Lobby poll error:', e);
            }
        }, 1200);
    }

    stopLobbyPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    // ホストがゲーム開始ボタンを押した時
    async handleHostStart() {
        try {
            await window.apiService.startGame(this.roomId, window.playerManager.myId);
        } catch (e) {
            alert('ゲーム開始失敗: ' + e.message);
        }
    }
}

// グローバルインスタンス
window.roomManager = new RoomManager();
