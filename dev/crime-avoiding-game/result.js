/**
 * リザルト・振り返り画面モジュール (result.js)
 *
 * - 勝敗発表シート
 * - ゲーム画面（マップ）上での答え合わせリプレイ機能（等倍再生・コマ送り・シークバー）
 * - 犯罪者と被害者の現在地と全移動軌跡の完全可視化
 * - チャット発言時の本当の居場所ハイライト演出
 * - 教育的ポイントの解説
 */

class ResultManager {
    constructor() {
        this.reviewData = null;
        this.timelineEvents = [];
        this.currentStepIndex = 0;
        this.isPlayingReplay = false;
        this.replayTimer = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        // リプレイ開始ボタン（結果シートからマップへ切り替え）
        const btnStartMapReplay = document.getElementById('btnStartMapReplay');
        const btnStartMapReplayFooter = document.getElementById('btnStartMapReplayFooter');
        if (btnStartMapReplay) {
            btnStartMapReplay.addEventListener('click', () => this.openMapReplay());
        }
        if (btnStartMapReplayFooter) {
            btnStartMapReplayFooter.addEventListener('click', () => this.openMapReplay());
        }

        // リプレイパネル内のコントロール
        const btnPlayPause = document.getElementById('btnReplayPlayPause');
        if (btnPlayPause) {
            btnPlayPause.addEventListener('click', () => this.toggleReplay());
        }

        const btnPrev = document.getElementById('btnReplayPrev');
        if (btnPrev) {
            btnPrev.addEventListener('click', () => this.prevStep());
        }

        const btnNext = document.getElementById('btnReplayNext');
        if (btnNext) {
            btnNext.addEventListener('click', () => this.nextStep());
        }

        const slider = document.getElementById('replayMapSlider');
        if (slider) {
            slider.addEventListener('input', (e) => {
                this.pauseReplay();
                this.setTimelineStep(parseInt(e.target.value, 10));
            });
        }

        // 結果シート再表示ボタン
        const btnReopen = document.getElementById('btnReopenResultModal');
        if (btnReopen) {
            btnReopen.addEventListener('click', () => this.closeMapReplay());
        }

        // タイトルへ戻るボタン
        const btnHome = document.getElementById('btnReplayReturnHome');
        if (btnHome) {
            btnHome.addEventListener('click', () => {
                window.location.reload();
            });
        }
    }

    async showResult(roomId, winner, finishReason, myRole, isBlockVictory = false) {
        this.init();

        const modal = document.getElementById('resultModal');
        if (!modal) return;

        // 振り返りデータ取得
        try {
            this.reviewData = await window.apiService.getReviewData(roomId);
        } catch (e) {
            console.error('振り返りデータ取得失敗:', e);
        }

        const isBlockWin = isBlockVictory || (finishReason && finishReason.includes('防犯ブロック'));

        // サウンド再生
        if (window.soundManager) {
            if (winner === myRole || isBlockWin) {
                window.soundManager.playVictorySound();
            } else {
                window.soundManager.playDefeatSound();
            }
        }

        // ヘッダー・勝敗文言
        const titleEl = document.getElementById('resultTitle');
        const reasonEl = document.getElementById('resultReason');
        const badgeEl = document.getElementById('resultWinnerBadge');
        const eduBanner = document.getElementById('resultEducationBanner');

        const isWin = (winner === myRole) || isBlockWin;
        const lm = window.languageManager;
        const isKids = lm && lm.isKidsMode;

        if (isBlockWin) {
            titleEl.textContent = lm ? lm.t('resultBlockWinTitle') : '🛡️ 防犯ブロック成功！ (危険回避)';
            titleEl.className = 'result-win';
            badgeEl.textContent = lm ? lm.t('resultBlockBadge') : '防犯成功 (接触遮断)';
            badgeEl.className = 'winner-badge winner-victim';
            reasonEl.textContent = lm ? lm.t('resultBlockReason') : '不審な言動を察知し、即座に相手をブロック・削除して被害を未然に防ぎました！';
            if (eduBanner) eduBanner.classList.remove('hidden');
        } else {
            titleEl.textContent = isWin
                ? (lm ? lm.t('resultWinTitle') : '🎉 あなたの勝利！')
                : (lm ? lm.t('resultLoseTitle') : '💀 敗北…');
            titleEl.className = isWin ? 'result-win' : 'result-lose';

            if (winner === 'victim') {
                badgeEl.textContent = lm ? lm.t('resultBadgeVictimWin') : '逃走成功 (被害者の勝ち)';
            } else {
                badgeEl.textContent = lm ? lm.t('resultBadgeCriminalWin') : '捕獲完了 (犯罪者の勝ち)';
            }
            badgeEl.className = `winner-badge winner-${winner}`;

            if (finishReason) {
                if (isKids) {
                    if (finishReason.includes('目的地に到達')) {
                        reasonEl.textContent = 'ゴールに とうちゃくして にげきりました！';
                    } else if (finishReason.includes('接触') || finishReason.includes('捕獲')) {
                        reasonEl.textContent = 'つかまってしまいました…！';
                    } else if (finishReason.includes('逃げ切り')) {
                        reasonEl.textContent = 'じかんぎれまで にげきりました！';
                    } else {
                        reasonEl.textContent = finishReason;
                    }
                } else {
                    reasonEl.textContent = finishReason;
                }
            } else {
                reasonEl.textContent = isKids ? 'ゲームが おわりました' : 'ゲームが終了しました';
            }
            if (eduBanner) eduBanner.classList.add('hidden');
        }

        // タイムラインの構築
        this.buildTimeline();

        // まず結果モーダルを表示
        modal.classList.remove('hidden');

        // チャット振り返り＆教育的振り返りのレンダリング
        this.renderChatReview();
        this.renderEducationalTakeaways(winner, myRole, isBlockWin);
    }

    // タイムライン構築
    buildTimeline() {
        if (!this.reviewData) return;

        const { moves, messages } = this.reviewData;
        const allEvents = [];

        // 移動イベント
        (moves || []).forEach(m => {
            allEvents.push({
                type: 'move',
                role: m.role,
                turn: m.turn || 1,
                node: m.to_node,
                timestamp: m.timestamp,
                elapsed: m.elapsed_seconds
            });
        });

        // チャットイベント（「どこへ逃げるべきか」等の不要メッセージは除外）
        const IGNORED_PHRASES = ['どこへ逃げるべきか', 'どこへ にげようかな', 'どこに潜んでいるんだ', 'どこに いるのかな'];
        (messages || []).forEach(msg => {
            const c = msg.content || '';
            if (IGNORED_PHRASES.some(phrase => c.includes(phrase))) {
                return;
            }
            allEvents.push({
                type: 'chat',
                role: msg.role,
                turn: msg.turn || 1,
                content: msg.content,
                sender: msg.sender_name,
                senderNode: msg.sender_node_at_time,
                timestamp: msg.timestamp,
                elapsed: msg.elapsed_seconds,
                rawMessage: msg
            });
        });

        // 時系列ソート
        allEvents.sort((a, b) => a.elapsed - b.elapsed || a.timestamp - b.timestamp);
        this.timelineEvents = allEvents;

        // スライダーの範囲設定
        const slider = document.getElementById('replayMapSlider');
        if (slider) {
            slider.min = 0;
            slider.max = Math.max(0, this.timelineEvents.length - 1);
            slider.value = 0;
        }
    }

    // マップ画面での答え合わせ（リプレイ）を開始
    openMapReplay() {
        this.pauseReplay();

        // 結果モーダルを閉じる（ボヤけを完全解除）
        const modal = document.getElementById('resultModal');
        if (modal) modal.classList.add('hidden');

        // 操作パネルを隠し、リプレイコントローラーを表示
        const turnPanel = document.getElementById('turnActionPanel');
        if (turnPanel) turnPanel.classList.add('hidden');

        const replayPanel = document.getElementById('replayControllerPanel');
        if (replayPanel) replayPanel.classList.remove('hidden');

        // スマホ画面をDMチャットビューに切り替え
        const chatView = document.getElementById('instaChatView');
        const detailsView = document.getElementById('instaDetailsView');
        if (detailsView) detailsView.classList.add('hidden');
        if (chatView) chatView.classList.remove('hidden');

        // 初期ステップを0にセットして再生準備（チャットも0件から同期）
        this.setTimelineStep(0);

        // 自動再生をスタート！
        this.startReplay();
    }

    // 結果シートを再表示
    closeMapReplay() {
        this.pauseReplay();
        const modal = document.getElementById('resultModal');
        if (modal) modal.classList.remove('hidden');
    }

    // タイムラインの特定ステップを反映
    setTimelineStep(stepIndex) {
        if (!this.timelineEvents || this.timelineEvents.length === 0) return;

        this.currentStepIndex = Math.max(0, Math.min(stepIndex, this.timelineEvents.length - 1));
        const slider = document.getElementById('replayMapSlider');
        if (slider) slider.value = this.currentStepIndex;

        // ステップまでの移動履歴を復元
        const is4x4 = this.reviewData?.room?.map_type === '4x4';
        let victimNode = is4x4 ? 'node_0_4' : 'node_0_3';
        let criminalNode = is4x4 ? 'node_4_0' : 'node_3_0';
        const victimTrail = [];
        const criminalTrail = [];
        let currentTurn = 1;

        for (let i = 0; i <= this.currentStepIndex; i++) {
            const ev = this.timelineEvents[i];
            if (!ev) continue;
            if (ev.turn) currentTurn = ev.turn;

            if (ev.type === 'move') {
                if (ev.role === 'victim') {
                    victimNode = ev.node;
                    victimTrail.push(ev.node);
                } else if (ev.role === 'criminal') {
                    criminalNode = ev.node;
                    criminalTrail.push(ev.node);
                }
            } else if (ev.victim_node || ev.criminal_node) {
                if (ev.victim_node) {
                    victimNode = ev.victim_node;
                    victimTrail.push(ev.victim_node);
                }
                if (ev.criminal_node) {
                    criminalNode = ev.criminal_node;
                    criminalTrail.push(ev.criminal_node);
                }
            }
        }

        // マップ上に双方の位置・軌跡を完全公開！
        const goalNode = this.reviewData?.room?.victim_goal_node || (is4x4 ? 'node_4_4' : 'node_3_3');
        window.mapManager.updateDisplay({
            myNodeId: victimNode,
            myRole: 'victim',
            opponentNodeId: criminalNode,
            goalNodeId: goalNode,
            myTrail: victimTrail,
            opponentTrail: criminalTrail,
            isInitialPeek: false
        });

        // 距離と接近判定
        const dist = window.mapManager.getDistance(victimNode, criminalNode);
        const distEl = document.getElementById('replayDistanceDisplay');
        const stepEl = document.getElementById('replayStepDisplay');
        const timeEl = document.getElementById('replayTimestampDisplay');

        const currentEvent = this.timelineEvents[this.currentStepIndex];
        let elapsed = 0;
        if (currentEvent) {
            if (typeof currentEvent.elapsed === 'number' && !isNaN(currentEvent.elapsed)) {
                elapsed = currentEvent.elapsed;
            } else if (typeof currentEvent.elapsed_seconds === 'number' && !isNaN(currentEvent.elapsed_seconds)) {
                elapsed = currentEvent.elapsed_seconds;
            } else if (currentEvent.timestamp && this.reviewData?.room?.started_at) {
                elapsed = Math.max(0, Math.floor((currentEvent.timestamp - this.reviewData.room.started_at) / 1000));
            }
        }
        const minStr = Math.floor(elapsed / 60);
        const secStr = Math.floor(elapsed % 60).toString().padStart(2, '0');

        if (stepEl) {
            const maxTurns = this.reviewData?.room?.max_turns || 12;
            stepEl.textContent = `第 ${currentTurn} ターン / 全 ${maxTurns} ターン`;
        }

        if (timeEl) {
            timeEl.textContent = `⏱️ ${minStr}:${secStr} 時点 (${this.currentStepIndex + 1}/${this.timelineEvents.length})`;
        }

        if (distEl) {
            if (dist === 0) {
                distEl.innerHTML = `🚨 接触発生！ (同じ交差点)`;
                distEl.style.background = '#fee2e2';
                distEl.style.color = '#dc2626';
                distEl.style.borderColor = '#fca5a5';
            } else if (dist <= 1) {
                distEl.innerHTML = `⚠️ 最接近！ 隣接（距離: 1区画）`;
                distEl.style.background = '#fef3c7';
                distEl.style.color = '#b45309';
                distEl.style.borderColor = '#fde68a';
            } else {
                distEl.innerHTML = `距離: ${dist}区画 離れています`;
                distEl.style.background = '#f0fdf4';
                distEl.style.color = '#15803d';
                distEl.style.borderColor = '#86efac';
            }
        }

        // チャットイベントの場合、発言ノードをパルス発光
        if (currentEvent && currentEvent.type === 'chat') {
            const speakingNode = currentEvent.senderNode || (currentEvent.role === 'criminal' ? criminalNode : victimNode);
            const pinEl = document.querySelector(`.map-node[data-id="${speakingNode}"]`);
            if (pinEl) {
                pinEl.classList.add('is-speaking-highlight');
                setTimeout(() => pinEl.classList.remove('is-speaking-highlight'), 1200);
            }
        }

        // ★ シークバーの現在ステップまでに送受信されたチャットメッセージを抽出し、DM画面に完全同期！
        if (window.chatManager) {
            const myPlayer = (this.reviewData?.players || []).find(p => p.role === this.myRole) || (this.reviewData?.players || [])[0];
            const myId = myPlayer ? myPlayer.id : 'me';

            const visibleMessages = [];
            for (let i = 0; i <= this.currentStepIndex; i++) {
                const ev = this.timelineEvents[i];
                if (ev && ev.type === 'chat') {
                    if (ev.rawMessage) {
                        visibleMessages.push(ev.rawMessage);
                    } else {
                        visibleMessages.push({
                            id: 'replay_msg_' + i,
                            player_id: ev.role === this.myRole ? myId : 'opponent',
                            role: ev.role,
                            sender_name: ev.sender,
                            content: ev.content,
                            turn: ev.turn,
                            timestamp: ev.timestamp
                        });
                    }
                }
            }
            window.chatManager.updateMessages(visibleMessages, myId, this.myRole, true);
        }
    }

    // チャット振り返りリスト（クリックでモーダルを閉じてマップ上のその瞬間にジャンプ）
    renderChatReview() {
        const listEl = document.getElementById('reviewChatList');
        if (!listEl || !this.reviewData) return;

        listEl.innerHTML = '';
        const rawMessages = this.reviewData.messages || [];
        const IGNORED_PHRASES = ['どこへ逃げるべきか', 'どこへ にげようかな', 'どこに潜んでいるんだ', 'どこに いるのかな'];
        const messages = rawMessages.filter(msg => {
            const c = msg.content || '';
            return !IGNORED_PHRASES.some(phrase => c.includes(phrase));
        });

        if (messages.length === 0) {
            listEl.innerHTML = '<p class="text-muted" style="padding: 10px; font-size: 0.85rem;">チャットのやり取りはありませんでした。</p>';
            return;
        }

        messages.forEach(msg => {
            const item = document.createElement('div');
            item.className = `review-chat-card role-${msg.role}`;
            item.style.cursor = 'pointer';

            const actualNode = msg.sender_node_at_time
                ? (window.mapManager.nodes[msg.sender_node_at_time]?.name || msg.sender_node_at_time)
                : '不明';

            const timeStr = `${Math.floor(msg.elapsed_seconds / 60)}:${(msg.elapsed_seconds % 60).toString().padStart(2, '0')}`;

            item.innerHTML = `
                <div class="review-chat-header">
                    <span class="review-sender">${msg.sender_name} (${msg.role === 'criminal' ? '犯罪者' : '被害者'})</span>
                    <span class="review-time">${timeStr}</span>
                </div>
                <div class="review-bubble">「${msg.content}」</div>
                <div class="review-truth-tag" style="background:#eff6ff; color:#1d4ed8; padding:4px 8px; border-radius:6px; font-size:0.82rem; margin-top:4px;">
                    📍 発言時の実際の位置: <strong>${actualNode}</strong> <span style="font-size:0.75rem; color:#60a5fa; margin-left:4px;">(タップしてマップで確認 ›)</span>
                </div>
            `;

            // クリックでモーダルを閉じてマップ上のその瞬間に直行！
            item.addEventListener('click', () => {
                const stepIdx = this.timelineEvents.findIndex(ev =>
                    ev.type === 'chat' && ev.timestamp === msg.timestamp && ev.content === msg.content
                );
                this.openMapReplay();
                if (stepIdx !== -1) {
                    this.pauseReplay();
                    this.setTimelineStep(stepIdx);
                }
            });

            listEl.appendChild(item);
        });
    }

    // 教育的振り返りコンテンツの生成
    renderEducationalTakeaways(winner, myRole, isBlockWin = false) {
        const takeawayEl = document.getElementById('reviewTakeawayContent');
        if (!takeawayEl || !this.reviewData) return;

        const lm = window.languageManager;
        const isKids = lm && lm.isKidsMode;

        let tipsHtml = '';

        if (isKids) {
            // こども向け (小学生向けひらがな中心)
            if (isBlockWin) {
                tipsHtml += `
                    <div class="takeaway-box takeaway-success">
                        <h4>🎉 すばらしい はんだん：あやしいひとを ブロック！</h4>
                        <p>ネットで しりあった しらないひとから あやしいメッセージが きたら、<strong>「あいての おねがいを きかずに、すぐに ブロックして にげる」</strong>ことが いちばん あんぜんです。じぶんの みを まもる べんきょうが できましたね！</p>
                    </div>
                `;
            }

            tipsHtml += `
                <div class="takeaway-box">
                    <h4>🔍 メッセージと ほんとうの ばしょ（ウソを みやぶる）</h4>
                    <p>あいては「すぐ あえるよ」「あやしいひとじゃ ないよ」と やさしいフリをして ウソをついていませんでしたか？<br>
                    ネットでは、あいての ことばを そのまま しんじないことが たいせつです。</p>
                </div>
                <div class="takeaway-box">
                    <h4>🛡️ こわいめに あわないための 3つのおやくそく</h4>
                    <p>
                        ① <strong>いまいる ばしょや なまえ・しゃしんを ぜったいに おしえない</strong><br>
                        ② <strong>あやしいと おもったら すぐに「ブロック」する</strong><br>
                        ③ <strong>ひとりで なやまないで、おうちのひとや せんせいに そうだんする</strong>
                    </p>
                </div>
            `;
        } else {
            // 通常モード (一般向け)
            if (isBlockWin) {
                tipsHtml += `
                    <div class="takeaway-box takeaway-success">
                        <h4>🎉 完璧な防犯判断：不審な相手をブロック＆削除</h4>
                        <p>インターネット上で知り合った知らない相手から不審な言動や誘導を受けた際、<strong>「相手のペースに巻き込まれず、即座にブロックして連絡を断つ」</strong>ことが最大の自己防衛です。このゲームを通じて、ためらわずに自ら通信を遮断する判断力を体験できました。</p>
                    </div>
                `;
            }

            tipsHtml += `
                <div class="takeaway-box">
                    <h4>🔍 チャットと真実のギャップ（心理誘導の見破り）</h4>
                    <p>相手はチャットで安心させる言葉（「すぐ会えるよ」「怪しい者じゃない」など）や、嘘の居場所を伝えていませんでしたか？
                    ネット上では相手の言葉を鵜呑みにせず、「なぜ相手がその質問や発言をしたのか」を客観的に見極めるリテラシーが求められます。</p>
                </div>
                <div class="takeaway-box">
                    <h4>🛡️ 被害に遭わないための3大原則</h4>
                    <p>
                        ① <strong>居場所や個人情報を安易に教えない</strong>（駅名、公園名、写真など）<br>
                        ② <strong>違和感を覚えたら即座に「ブロック＆削除・通報」する</strong><br>
                        ③ <strong>一人で悩まずに周囲の大人や警察（#9110）へ相談する</strong>
                    </p>
                </div>
            `;
        }

        takeawayEl.innerHTML = tipsHtml;
    }

    // リプレイ自動再生
    startReplay() {
        if (this.isPlayingReplay) return;
        this.isPlayingReplay = true;

        const playBtn = document.getElementById('btnReplayPlayPause');
        if (playBtn) {
            playBtn.textContent = window.langManager ? window.langManager.t('btnReplayPause') : '⏸️ 一時停止';
        }

        if (this.currentStepIndex >= this.timelineEvents.length - 1) {
            this.currentStepIndex = 0;
        }

        this.replayTimer = setInterval(() => {
            if (this.currentStepIndex < this.timelineEvents.length - 1) {
                this.setTimelineStep(this.currentStepIndex + 1);
            } else {
                this.pauseReplay();
            }
        }, 1100);
    }

    pauseReplay() {
        this.isPlayingReplay = false;
        if (this.replayTimer) {
            clearInterval(this.replayTimer);
            this.replayTimer = null;
        }
        const playBtn = document.getElementById('btnReplayPlayPause');
        if (playBtn) {
            playBtn.textContent = window.langManager ? window.langManager.t('btnReplayPlay') : '▶️ 再生';
        }
    }

    toggleReplay() {
        if (this.isPlayingReplay) {
            this.pauseReplay();
        } else {
            this.startReplay();
        }
    }

    prevStep() {
        this.pauseReplay();
        this.setTimelineStep(this.currentStepIndex - 1);
    }

    nextStep() {
        this.pauseReplay();
        this.setTimelineStep(this.currentStepIndex + 1);
    }
}

// グローバルインスタンス
window.resultManager = new ResultManager();

