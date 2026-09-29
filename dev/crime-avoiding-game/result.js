/**
 * リザルト・振り返り画面モジュール (result.js)
 *
 * - 勝敗発表
 * - 答え合わせ・振り返りリプレイ機能（シークバー、ステップ再生）
 * - 発言時点のお互いの真の現在地可視化
 * - 教育的ポイントの解説
 */

class ResultManager {
    constructor() {
        this.reviewData = null;
        this.timelineEvents = [];
        this.currentStepIndex = 0;
        this.isPlayingReplay = false;
        this.replayTimer = null;
    }

    async showResult(roomId, winner, finishReason, myRole, isBlockVictory = false) {
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

        // モーダル表示
        modal.classList.remove('hidden');

        // 初期状態でタイムライン最終状態または最初を表示
        this.setTimelineStep(this.timelineEvents.length - 1);
        this.renderChatReview();
        this.renderEducationalTakeaways(winner, myRole, isBlockWin);
    }

    buildTimeline() {
        if (!this.reviewData) return;

        const { moves, messages } = this.reviewData;
        const allEvents = [];

        // 移動イベント
        (moves || []).forEach(m => {
            allEvents.push({
                type: 'move',
                role: m.role,
                node: m.to_node,
                timestamp: m.timestamp,
                elapsed: m.elapsed_seconds
            });
        });

        // チャットイベント
        (messages || []).forEach(msg => {
            allEvents.push({
                type: 'chat',
                role: msg.role,
                content: msg.content,
                sender: msg.sender_name,
                senderNode: msg.sender_node_at_time,
                timestamp: msg.timestamp,
                elapsed: msg.elapsed_seconds
            });
        });

        // 時系列ソート
        allEvents.sort((a, b) => a.elapsed - b.elapsed || a.timestamp - b.timestamp);
        this.timelineEvents = allEvents;

        // シークバーの初期化
        const slider = document.getElementById('replaySlider');
        if (slider) {
            slider.min = 0;
            slider.max = Math.max(0, this.timelineEvents.length - 1);
            slider.value = this.timelineEvents.length - 1;
            slider.oninput = (e) => {
                this.pauseReplay();
                this.setTimelineStep(parseInt(e.target.value, 10));
            };
        }
    }

    // タイムラインの特定ステップを反映
    setTimelineStep(stepIndex) {
        this.currentStepIndex = Math.max(0, Math.min(stepIndex, this.timelineEvents.length - 1));
        const slider = document.getElementById('replaySlider');
        if (slider) slider.value = this.currentStepIndex;

        // ステップまでの移動履歴を復元
        let victimNode = 'node_0_3';
        let criminalNode = 'node_3_0';
        const victimTrail = [];
        const criminalTrail = [];

        for (let i = 0; i <= this.currentStepIndex; i++) {
            const ev = this.timelineEvents[i];
            if (!ev) continue;
            if (ev.type === 'move') {
                if (ev.role === 'victim') {
                    victimNode = ev.node;
                    victimTrail.push(ev.node);
                } else if (ev.role === 'criminal') {
                    criminalNode = ev.node;
                    criminalTrail.push(ev.node);
                }
            }
        }

        // マップ上に双方の位置・軌跡を完全公開！
        const goalNode = this.reviewData?.room?.victim_goal_node || 'node_3_3';
        window.mapManager.updateDisplay({
            myNodeId: victimNode,
            myRole: 'victim',
            opponentNodeId: criminalNode,
            goalNodeId: goalNode,
            myTrail: victimTrail,
            opponentTrail: criminalTrail,
            isInitialPeek: false
        });

        // 最接近距離の計算
        const dist = window.mapManager.getDistance(victimNode, criminalNode);
        const distanceEl = document.getElementById('replayDistanceInfo');
        if (distanceEl) {
            const currentEvent = this.timelineEvents[this.currentStepIndex];
            const timeStr = currentEvent
                ? `${Math.floor(currentEvent.elapsed / 60)}分${(currentEvent.elapsed % 60).toString().padStart(2, '0')}秒時点`
                : '';

            if (dist === 0) {
                distanceEl.innerHTML = `<span class="badge-danger">🚨 接触発生！ (同じ交差点)</span> - ${timeStr}`;
            } else if (dist <= 1) {
                distanceEl.innerHTML = `<span class="badge-warning">⚠️ 最接近！ 隣接交差点（距離: 1区画）</span> - ${timeStr}`;
            } else {
                distanceEl.innerHTML = `<span>距離: ${dist}区画離れています</span> - ${timeStr}`;
            }
        }
    }

    // チャット振り返りリスト（クリックでその発言の瞬間にタイムスリップ）
    renderChatReview() {
        const listEl = document.getElementById('reviewChatList');
        if (!listEl || !this.reviewData) return;

        listEl.innerHTML = '';
        const messages = this.reviewData.messages || [];

        if (messages.length === 0) {
            listEl.innerHTML = '<p class="text-muted">チャットのやり取りはありませんでした。</p>';
            return;
        }

        messages.forEach(msg => {
            const item = document.createElement('div');
            item.className = `review-chat-card role-${msg.role}`;

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
                <div class="review-truth-tag">
                    📍 発言時の実際の位置: <strong>${actualNode}</strong>
                </div>
            `;

            // クリックでその発言の瞬間にシーク
            item.addEventListener('click', () => {
                const stepIdx = this.timelineEvents.findIndex(ev =>
                    ev.type === 'chat' && ev.timestamp === msg.timestamp && ev.content === msg.content
                );
                if (stepIdx !== -1) {
                    this.pauseReplay();
                    this.setTimelineStep(stepIdx);
                    // ハイライト演出
                    document.querySelectorAll('.review-chat-card').forEach(c => c.classList.remove('is-active'));
                    item.classList.add('is-active');
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

        const playBtn = document.getElementById('btnPlayReplay');
        if (playBtn) playBtn.innerHTML = '⏸️ 一時停止';

        if (this.currentStepIndex >= this.timelineEvents.length - 1) {
            this.currentStepIndex = 0;
        }

        this.replayTimer = setInterval(() => {
            if (this.currentStepIndex < this.timelineEvents.length - 1) {
                this.setTimelineStep(this.currentStepIndex + 1);
            } else {
                this.pauseReplay();
            }
        }, 1200);
    }

    pauseReplay() {
        this.isPlayingReplay = false;
        if (this.replayTimer) {
            clearInterval(this.replayTimer);
            this.replayTimer = null;
        }
        const playBtn = document.getElementById('btnPlayReplay');
        if (playBtn) playBtn.innerHTML = '▶️ 再生';
    }

    toggleReplay() {
        if (this.isPlayingReplay) {
            this.pauseReplay();
        } else {
            this.startReplay();
        }
    }
}

// グローバルインスタンス
window.resultManager = new ResultManager();
