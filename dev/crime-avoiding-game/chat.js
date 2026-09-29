/**
 * チャット管理モジュール (chat.js) - Instagram DM風スマートフォンUI対応
 *
 * 添付画像4枚のUXフローを完全再現:
 * 1. 【画像1: DM画面】相手とのメッセージ送受信。送信ボタンで即時反映。
 *    ヘッダーの相手名（ゆうま >）をタップすると詳細画面へ遷移。
 * 2. 【画像2: 詳細画面】相手の大型プロフィールと操作ボタン群。
 *    「••• オプション」をタップするとポップアップメニュー表示。
 * 3. 【画像3: オプションメニュー】「制限する」「ブロック」「報告する」。
 *    「ブロック」をタップするとボトムシート表示。
 * 4. 【画像4: ブロック確認ボトムシート】「y.yu0115をブロックしますか？」。
 *    青い「ブロック」ボタンを押して初めて追跡通信を遮断！
 */

class ChatManager {
    constructor() {
        this.messages = [];
        this.container = null;
        this.onBlockCriminal = null;
        this.onSendChat = null;
        this.lastSeenMessageCount = 0;

        // 相手情報キャッシュ
        this.opponentName = '情報ニキ';
        this.opponentHandle = '@jouhou_niki';
        this.toastTimer = null;
    }

    init(containerEl, onBlockCriminal, onSendChat) {
        this.container = containerEl || document.getElementById('chatMessagesList');
        this.onBlockCriminal = onBlockCriminal;
        this.onSendChat = onSendChat;

        this.bindInstagramNavigation();
        this.bindChatInputEvents();
        this.bindQuickChips();
        this.bindDummyActions();
    }

    // =========================================================================
    // 1. Instagram 画面遷移＆ブロックモーダル制御 (画像1〜4のフロー)
    // =========================================================================
    bindInstagramNavigation() {
        const chatView = document.getElementById('instaChatView');
        const detailsView = document.getElementById('instaDetailsView');
        const btnOpenDetails = document.getElementById('btnOpenInstaDetails');
        const btnBackToChat = document.getElementById('btnBackToChatFromDetails');

        const btnOpenOptions = document.getElementById('btnOpenOptionsMenu');
        const optionsMenu = document.getElementById('instaOptionsMenu');

        const btnTriggerBlock = document.getElementById('btnTriggerBlockModal');
        const sheetBackdrop = document.getElementById('instaBlockSheetBackdrop');
        const btnCancelBlock = document.getElementById('btnCancelInstaBlock');
        const btnConfirmBlock = document.getElementById('btnConfirmInstaBlock');
        const btnConfirmBlockReport = document.getElementById('btnConfirmInstaBlockReport');

        // [画像1 → 画像2] DMヘッダーの相手名をタップして「詳細画面」へ
        if (btnOpenDetails && chatView && detailsView) {
            btnOpenDetails.addEventListener('click', () => {
                chatView.classList.add('hidden');
                detailsView.classList.remove('hidden');
                if (optionsMenu) optionsMenu.classList.add('hidden');
            });
        }

        // [画像2 → 画像1] 詳細画面の戻るボタン（‹）でDM画面へ戻る
        if (btnBackToChat && chatView && detailsView) {
            btnBackToChat.addEventListener('click', () => {
                detailsView.classList.add('hidden');
                chatView.classList.remove('hidden');
                if (optionsMenu) optionsMenu.classList.add('hidden');
            });
        }

        // [画像2 → 画像3] 「••• オプション」タップでポップアップトグル
        if (btnOpenOptions && optionsMenu) {
            btnOpenOptions.addEventListener('click', (e) => {
                e.stopPropagation();
                optionsMenu.classList.toggle('hidden');
            });

            // 外側タップでオプションメニューを閉じる
            document.addEventListener('click', (e) => {
                if (!btnOpenOptions.contains(e.target) && !optionsMenu.contains(e.target)) {
                    optionsMenu.classList.add('hidden');
                }
            });
        }

        // [画像3 → 画像4] オプションメニューの「ブロック」タップでボトムシート表示
        if (btnTriggerBlock && sheetBackdrop) {
            btnTriggerBlock.addEventListener('click', (e) => {
                e.stopPropagation();
                if (optionsMenu) optionsMenu.classList.add('hidden');
                sheetBackdrop.classList.remove('hidden');
            });
        }

        // ボトムシートのキャンセル、または背景タップで閉じる
        if (btnCancelBlock && sheetBackdrop) {
            btnCancelBlock.addEventListener('click', () => {
                sheetBackdrop.classList.add('hidden');
            });
        }

        if (sheetBackdrop) {
            sheetBackdrop.addEventListener('click', (e) => {
                if (e.target === sheetBackdrop) {
                    sheetBackdrop.classList.add('hidden');
                }
            });
        }

        // [画像4 決定] ボトムシートの「ブロック」ボタン押下
        const handleExecuteBlock = () => {
            if (sheetBackdrop) sheetBackdrop.classList.add('hidden');
            if (detailsView) detailsView.classList.add('hidden');
            if (chatView) chatView.classList.remove('hidden');

            if (this.onBlockCriminal) {
                this.onBlockCriminal();
            }
        };

        if (btnConfirmBlock) {
            btnConfirmBlock.addEventListener('click', handleExecuteBlock);
        }
        if (btnConfirmBlockReport) {
            btnConfirmBlockReport.addEventListener('click', handleExecuteBlock);
        }
    }

    // =========================================================================
    // 2. チャット即時入力＆送信制御
    // =========================================================================
    bindChatInputEvents() {
        const inputField = document.getElementById('instaInputText');
        const btnSend = document.getElementById('btnSendInstaChat');
        const extraIcons = document.getElementById('instaInputIcons');

        if (!inputField) return;

        let isComposing = false;
        let isSending = false;

        // IME変換状態の正確なトラッキング
        inputField.addEventListener('compositionstart', () => {
            isComposing = true;
        });
        inputField.addEventListener('compositionend', () => {
            isComposing = false;
        });

        // 文字入力時の「送信」ボタン表示/非表示（Instagram仕様）
        const updateInputState = () => {
            const hasText = inputField.value.trim().length > 0;
            if (btnSend) {
                if (hasText) {
                    btnSend.classList.remove('hidden');
                } else {
                    btnSend.classList.add('hidden');
                }
            }
            if (extraIcons) {
                if (hasText) {
                    extraIcons.classList.add('hidden');
                } else {
                    extraIcons.classList.remove('hidden');
                }
            }
        };

        inputField.addEventListener('input', updateInputState);

        // 送信実行ハンドラ
        const submitChat = () => {
            if (isSending) return;

            const text = inputField.value.trim();
            if (!text) return;

            isSending = true;

            // 即座に入力欄を完全クリア（PCブラウザでのテキスト保持・再代入を徹底防止）
            inputField.value = '';
            updateInputState();

            // 送信処理実行
            try {
                if (this.onSendChat) {
                    this.onSendChat(text);
                }
            } catch (err) {
                console.error('Chat send error:', err);
            } finally {
                setTimeout(() => {
                    isSending = false;
                    // 送信後に入力欄が勝手に復元されていないか再点検
                    if (inputField.value) {
                        inputField.value = '';
                        updateInputState();
                    }
                }, 50);
            }

            inputField.focus();
        };

        // Enterキーで即時送信 (日本語IME変換中は確定のみ行い送信しない)
        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.isComposing || isComposing || e.keyCode === 229) {
                    return;
                }
                e.preventDefault();
                submitChat();
            }
        });

        // 送信ボタンクリックで即時送信
        if (btnSend) {
            btnSend.addEventListener('click', (e) => {
                e.preventDefault();
                submitChat();
            });
        }
    }

    // =========================================================================
    // 3. クイック定型文チップ
    // =========================================================================
    bindQuickChips() {
        const chipBtns = document.querySelectorAll('.insta-chip-btn');
        const inputField = document.getElementById('instaInputText');
        const btnSend = document.getElementById('btnSendInstaChat');
        const extraIcons = document.getElementById('instaInputIcons');

        chipBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const text = btn.getAttribute('data-text');
                if (inputField && text) {
                    inputField.value = text;
                    inputField.focus();

                    if (btnSend) btnSend.classList.remove('hidden');
                    if (extraIcons) extraIcons.classList.add('hidden');

                    // ターン行動確定欄にもセット
                    const turnInput = document.getElementById('turnChatInput');
                    if (turnInput) {
                        turnInput.value = text;
                        if (window.gameManager) {
                            window.gameManager.updateCommitButtonState();
                        }
                    }
                }
            });
        });
    }

    // =========================================================================
    // 3.5. チャット・ブロック以外のダミータップ時の「この機能は現在利用できません」トースト
    // =========================================================================
    bindDummyActions() {
        const dummyElements = document.querySelectorAll('.insta-dummy-action');
        dummyElements.forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                // オプションメニューが開いていれば閉じる
                const optionsMenu = document.getElementById('instaOptionsMenu');
                if (optionsMenu) optionsMenu.classList.add('hidden');

                const lm = window.languageManager;
                const toastMsg = lm ? lm.t('blockToast') : 'この機能は現在利用できません';
                this.showToast(toastMsg);
            });
        });
    }

    showToast(message) {
        const toast = document.getElementById('instaToast');
        if (!toast) return;

        const lm = window.languageManager;
        const msg = message || (lm ? lm.t('blockToast') : 'この機能は現在利用できません');
        toast.textContent = msg;
        toast.classList.remove('hidden');

        // アニメーション用リフロー
        void toast.offsetWidth;
        toast.classList.add('is-visible');

        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }

        this.toastTimer = setTimeout(() => {
            toast.classList.remove('is-visible');
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 200);
        }, 1500);
    }

    // =========================================================================
    // 4. 相手プロフィールの表示更新（AI / 対戦相手）
    // =========================================================================
    setOpponentProfile(name, handle, avatarUrl) {
        this.opponentName = name || '情報ニキ';
        this.opponentHandle = handle || '@jouhou_niki';

        const opponentNameEl = document.getElementById('chatOpponentName');
        const opponentHandleEl = document.getElementById('chatOpponentHandle');
        const detailsNameEl = document.getElementById('detailsOpponentName');
        const detailsHandleEl = document.getElementById('detailsOpponentHandle');
        const sheetHandleEl = document.getElementById('sheetBlockHandle');

        if (opponentNameEl) opponentNameEl.textContent = this.opponentName;
        if (opponentHandleEl) opponentHandleEl.textContent = this.opponentHandle;
        if (detailsNameEl) detailsNameEl.textContent = this.opponentName;
        if (detailsHandleEl) detailsHandleEl.textContent = this.opponentHandle;
        if (sheetHandleEl) sheetHandleEl.textContent = this.opponentHandle;

        if (avatarUrl) {
            document.querySelectorAll('.insta-avatar-img, .insta-avatar-large-img, .sheet-avatar-img').forEach(img => {
                img.src = avatarUrl;
            });
        }
    }

    // =========================================================================
    // 5. メッセージ表示更新 (添付画像1に完全準拠)
    // =========================================================================
    updateMessages(messageList, myId, myRole, isReplay = false) {
        if (!this.container) return;

        // 「どこへ逃げるべきか」等の自動・不要メッセージは徹底除外
        const IGNORED_PHRASES = ['どこへ逃げるべきか', 'どこへ にげようかな', 'どこに潜んでいるんだ', 'どこに いるのかな'];
        const validMessages = (messageList || []).filter(msg => {
            const c = msg.content || '';
            return !IGNORED_PHRASES.some(phrase => c.includes(phrase));
        });

        this.messages = validMessages;

        // 新着メッセージの効果音（リプレイ時のシークバー操作にも心地よく追従）
        if (this.messages.length > this.lastSeenMessageCount) {
            if (this.lastSeenMessageCount > 0 && window.soundManager) {
                window.soundManager.playChatSound();
            }
            this.lastSeenMessageCount = this.messages.length;
        } else if (this.messages.length < this.lastSeenMessageCount) {
            // シークバーを巻き戻した場合はカウントを同期（逆再生時の誤爆防止）
            this.lastSeenMessageCount = this.messages.length;
        }

        // ★ 変更がない場合はDOM再構築をスキップ（毎秒のガクガク・アニメーション再発・チラつきを根絶）
        const currentHash = JSON.stringify(this.messages.map(m => (m.id || m.timestamp) + '_' + m.content));
        if (this._renderedHash === currentHash) {
            return;
        }
        this._renderedHash = currentHash;

        this.container.innerHTML = '';

        // 日付セパレーター
        const dateSep = document.createElement('div');
        dateSep.className = 'insta-date-separator';
        dateSep.textContent = '9月17日 17:31';
        this.container.appendChild(dateSep);

        if (this.messages.length === 0) {
            const isKids = window.languageManager && window.languageManager.isKidsMode;
            const emptyTip = document.createElement('div');
            emptyTip.style.textAlign = 'center';
            emptyTip.style.padding = '30px 10px';
            emptyTip.style.color = '#71717a';
            emptyTip.style.fontSize = '0.82rem';
            if (isReplay) {
                emptyTip.innerHTML = `💬 リプレイ開始時点：メッセージの送受信はまだありません。<br><span style="font-size:0.75rem; color:#a1a1aa;">シークバーを進めると、その時点でのメッセージがリアルタイムに表示されます。</span>`;
            } else {
                emptyTip.innerHTML = isKids
                    ? `💬 メッセージを いれるか、すすむ ばしょを えらんで あいてと たたかおう！`
                    : `💬 メッセージを入力して送信するか、交差点を進めて相手と心理戦を繰り広げましょう。`;
            }
            this.container.appendChild(emptyTip);
            return;
        }

        let lastTurn = 0;

        this.messages.forEach(msg => {
            const isMe = msg.player_id === myId;
            const isSystem = msg.role === 'system' || msg.player_id === 'system';

            // ターンが変わった場合にセパレータを挟む
            if (msg.turn && msg.turn !== lastTurn) {
                lastTurn = msg.turn;
                const turnSep = document.createElement('div');
                turnSep.className = 'insta-date-separator';
                turnSep.textContent = `第 ${msg.turn} ターン`;
                this.container.appendChild(turnSep);
            }

            const item = document.createElement('div');

            if (isSystem) {
                item.className = 'chat-message system-message';
                item.innerHTML = `
                    <div class="system-bubble">
                        <span class="system-icon">🛡️</span>
                        <span>${this.escapeHtml(msg.content)}</span>
                    </div>
                `;
            } else {
                item.className = `chat-message ${isMe ? 'msg-outgoing' : 'msg-incoming'}`;

                if (isMe) {
                    // 自分側の吹き出し（画像1の鮮やかなパープルグラデーション、アバターなし）
                    item.innerHTML = `
                        <div class="msg-content-wrapper">
                            <div class="msg-bubble">${this.escapeHtml(msg.content)}</div>
                        </div>
                    `;
                } else {
                    // 相手側の吹き出し（画像1のダークグレー背景、相手アバター付き）
                    item.innerHTML = `
                        <div class="msg-avatar">
                            <img src="pic/joho-ranger.png" alt="アバター" class="insta-avatar-img">
                        </div>
                        <div class="msg-content-wrapper">
                            <div class="msg-bubble">${this.escapeHtml(msg.content)}</div>
                        </div>
                    `;
                }
            }

            this.container.appendChild(item);
        });

        // 自動最下部スクロール
        this.container.scrollTop = this.container.scrollHeight;
    }

    escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// グローバルインスタンス
window.chatManager = new ChatManager();
