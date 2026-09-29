/**
 * マップ管理モジュール (map.js)
 *
 * - 3x3 (4x4交差点) および 4x4 (5x5交差点) の道路グラフ管理
 * - 通行止めエッジの判定
 * - SVG / DOM によるマップ描画、交差点ノードのハイライト、移動アニメーション
 * - 最短経路計算 (BFS)
 */

class MapManager {
    constructor() {
        this.currentMapType = '3x3';
        this.nodes = {};
        this.edges = [];
        this.blockedEdges = new Set();
        this.container = null;
        this.onNodeClickCallback = null;

        this.initMapData('3x3');
    }

    initMapData(mapType) {
        this.currentMapType = mapType;
        this.nodes = {};
        this.edges = [];
        this.blockedEdges = new Set();

        if (mapType === '4x4') {
            this.build4x4Map();
        } else {
            this.build3x3Map();
        }
    }

    // 3x3街区 (4x4交差点 = 16ノード)
    build3x3Map() {
        const xCoords = [4.8, 33.4, 65.2, 95.2];
        const yCoords = [4.8, 33.4, 65.2, 95.2];

        // ランドマーク名称定義
        const landmarkNames = {
            '0_0': '北西・邸宅角',
            '1_0': '北通り・コンビニ北西',
            '2_0': '北通り・公園北西',
            '3_0': '北東・公園角',
            '0_1': '西通り・川の木橋前',
            '1_1': '中央北・コンビニ南',
            '2_1': '中央北・公園南西',
            '3_1': '東通り・家庭菜園北',
            '0_2': '西通り・学校北西',
            '1_2': '中央南・赤い家南',
            '2_2': '中央南・広場北東',
            '3_2': '東通り・家庭菜園南',
            '0_3': '南西・学校角',
            '1_3': '南通り・学校南東',
            '2_3': '南通り・芝生広場南',
            '3_3': '南東・黒屋根角（避難所）'
        };

        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                const id = `node_${c}_${r}`;
                this.nodes[id] = {
                    id,
                    col: c,
                    row: r,
                    x: xCoords[c],
                    y: yCoords[r],
                    name: landmarkNames[`${c}_${r}`] || `交差点 (${c},${r})`,
                    neighbors: []
                };
            }
        }

        // 通行止めエッジ（双方通行不可）
        // 1. 北側中央: (1,0) <-> (2,0)
        // 2. 中央南側: (1,2) <-> (2,2)
        this.addBlockedEdge('node_1_0', 'node_2_0');
        this.addBlockedEdge('node_1_2', 'node_2_2');

        // 隣接関係の構築
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                const id = `node_${c}_${r}`;
                // 右
                if (c < 3) this.addEdge(id, `node_${c + 1}_${r}`);
                // 下
                if (r < 3) this.addEdge(id, `node_${c}_${r + 1}`);
            }
        }
    }

    // 4x4街区 (5x5交差点 = 25ノード)
    build4x4Map() {
        const xCoords = [3.8, 26.5, 49.5, 72.8, 96.2];
        const yCoords = [3.8, 26.5, 49.5, 72.8, 96.2];

        for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 5; c++) {
                const id = `node_${c}_${r}`;
                this.nodes[id] = {
                    id,
                    col: c,
                    row: r,
                    x: xCoords[c],
                    y: yCoords[r],
                    name: `交差点 (${c},${r})`,
                    neighbors: []
                };
            }
        }

        // 4x4用通行止め
        this.addBlockedEdge('node_2_1', 'node_2_2');
        this.addBlockedEdge('node_3_2', 'node_3_3');

        for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 5; c++) {
                const id = `node_${c}_${r}`;
                if (c < 4) this.addEdge(id, `node_${c + 1}_${r}`);
                if (r < 4) this.addEdge(id, `node_${c}_${r + 1}`);
            }
        }
    }

    getEdgeKey(u, v) {
        return u < v ? `${u}--${v}` : `${v}--${u}`;
    }

    addBlockedEdge(u, v) {
        this.blockedEdges.add(this.getEdgeKey(u, v));
    }

    addEdge(u, v) {
        const key = this.getEdgeKey(u, v);
        const isBlocked = this.blockedEdges.has(key);

        this.edges.push({ u, v, isBlocked });

        if (!isBlocked) {
            this.nodes[u].neighbors.push(v);
            this.nodes[v].neighbors.push(u);
        }
    }

    // 指定ノードから移動可能な隣接ノード一覧
    getValidMoves(nodeId) {
        if (!this.nodes[nodeId]) return [];
        return this.nodes[nodeId].neighbors;
    }

    // 2点間の最短距離（ノード数 / ホップ数）をBFSで計算
    getShortestPath(startNodeId, targetNodeId) {
        if (startNodeId === targetNodeId) return [startNodeId];
        const queue = [[startNodeId]];
        const visited = new Set([startNodeId]);

        while (queue.length > 0) {
            const path = queue.shift();
            const curr = path[path.length - 1];

            if (curr === targetNodeId) {
                return path;
            }

            for (const neighbor of this.getValidMoves(curr)) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push([...path, neighbor]);
                }
            }
        }
        return null; // 到達不可
    }

    // 距離（ホップ数）
    getDistance(u, v) {
        const path = this.getShortestPath(u, v);
        return path ? path.length - 1 : Infinity;
    }

    // ==========================================
    // UI レンダリング
    // ==========================================

    render(containerElement, onNodeClick) {
        this.container = containerElement;
        this.onNodeClickCallback = onNodeClick;

        this.container.innerHTML = '';

        // 背景画像
        const img = document.createElement('img');
        img.className = 'map-background-img';
        img.src = this.currentMapType === '4x4'
            ? 'pic/map_4x4(residential area).jpg'
            : 'pic/map_3x3(residential area).jpg';
        img.alt = '街の地図';
        this.container.appendChild(img);

        // SVG オーバーレイ（道と通行止め装飾）
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'map-svg-overlay');
        svg.setAttribute('viewBox', '0 0 100 100');

        // 通行止めラインと標識アイコン
        for (const edge of this.edges) {
            if (edge.isBlocked) {
                const u = this.nodes[edge.u];
                const v = this.nodes[edge.v];
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', u.x);
                line.setAttribute('y1', u.y);
                line.setAttribute('x2', v.x);
                line.setAttribute('y2', v.y);
                line.setAttribute('class', 'road-blocked-line');
                svg.appendChild(line);
            }
        }
        this.container.appendChild(svg);

        // 通行止め標識アイコンレイヤー
        const blockedSignLayer = document.createElement('div');
        blockedSignLayer.className = 'map-blocked-signs-layer';
        for (const edge of this.edges) {
            if (edge.isBlocked) {
                const u = this.nodes[edge.u];
                const v = this.nodes[edge.v];
                const midX = (u.x + v.x) / 2;
                const midY = (u.y + v.y) / 2;

                const isKids = window.languageManager && window.languageManager.isKidsMode;
                const sign = document.createElement('div');
                sign.className = 'blocked-road-sign';
                sign.style.left = `${midX}%`;
                sign.style.top = `${midY}%`;
                sign.innerHTML = isKids ? '⛔ <span>とおれない</span>' : '⛔ <span>通行止</span>';
                sign.title = isKids ? 'こうじちゅう・はいれないよ' : '工事中・進入禁止';
                blockedSignLayer.appendChild(sign);
            }
        }
        this.container.appendChild(blockedSignLayer);

        // ノードレイヤー
        const nodesLayer = document.createElement('div');
        nodesLayer.className = 'map-nodes-layer';
        const lm = window.languageManager;

        for (const id in this.nodes) {
            const node = this.nodes[id];
            const nodeDisplayName = lm ? lm.getNodeName(node.id, node.name) : node.name;
            const el = document.createElement('div');
            el.className = 'map-node-point';
            el.id = `ui_${node.id}`;
            el.style.left = `${node.x}%`;
            el.style.top = `${node.y}%`;
            el.title = nodeDisplayName;

            // ツールチップ
            const tip = document.createElement('span');
            tip.className = 'node-tooltip';
            tip.textContent = nodeDisplayName;
            el.appendChild(tip);

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onNodeClickCallback) {
                    this.onNodeClickCallback(node.id);
                }
            });

            nodesLayer.appendChild(el);
        }
        this.container.appendChild(nodesLayer);

        // エンティティレイヤー（プレイヤー・目的地ピン・足跡）
        const entityLayer = document.createElement('div');
        entityLayer.className = 'map-entity-layer';
        entityLayer.id = 'mapEntityLayer';
        this.container.appendChild(entityLayer);
    }

    // プレイヤーやゴール、移動可能ハイライトの更新
    updateDisplay({
        myNodeId,
        myRole,
        selectedNextNodeId = null, // このターンで選択中の移動先
        opponentNodeId, // 見えるときだけ渡される（nullの場合は非表示）
        goalNodeId,
        validMoveNodeIds = [],
        myTrail = [],
        opponentTrail = [], // 振り返り時のみ
        isInitialPeek = false
    }) {
        if (!this.container) return;

        // ノードのハイライト状態更新
        for (const id in this.nodes) {
            const el = document.getElementById(`ui_${id}`);
            if (!el) continue;

            el.classList.remove('is-current', 'is-valid-move', 'is-goal', 'is-opponent', 'is-selected-next');

            if (validMoveNodeIds.includes(id)) {
                el.classList.add('is-valid-move');
            }
            if (id === goalNodeId) {
                el.classList.add('is-goal');
            }
            if (id === myNodeId) {
                el.classList.add('is-current');
            }
            if (id === selectedNextNodeId) {
                el.classList.add('is-selected-next');
            }
            if (id === opponentNodeId) {
                el.classList.add('is-opponent');
            }
        }

        const entityLayer = document.getElementById('mapEntityLayer');
        if (!entityLayer) return;
        entityLayer.innerHTML = '';

        const isKids = window.languageManager && window.languageManager.isKidsMode;

        // ゴールピン（目的地）
        if (goalNodeId && this.nodes[goalNodeId]) {
            const goalNode = this.nodes[goalNodeId];
            const goalPin = document.createElement('div');
            goalPin.className = 'entity-goal-flag';
            goalPin.style.left = `${goalNode.x}%`;
            goalPin.style.top = `${goalNode.y}%`;
            const goalLabel = isKids ? 'ゴール (あんぜん)' : '目的地 (安全地帯)';
            goalPin.innerHTML = `
                <div class="goal-pulse"></div>
                <div class="goal-icon">🏁</div>
                <div class="goal-label">${goalLabel}</div>
            `;
            entityLayer.appendChild(goalPin);
        }

        // 次の移動先ターゲットピン（選択中）
        if (selectedNextNodeId && this.nodes[selectedNextNodeId]) {
            const targetNode = this.nodes[selectedNextNodeId];
            const targetPin = document.createElement('div');
            targetPin.className = 'entity-target-pin';
            targetPin.style.left = `${targetNode.x}%`;
            targetPin.style.top = `${targetNode.y}%`;
            const targetLabel = isKids ? 'いくばしょ（よてい）' : '移動先（予定）';
            targetPin.innerHTML = `
                <div class="target-pulse"></div>
                <div class="target-icon">📍</div>
                <div class="target-label">${targetLabel}</div>
            `;
            entityLayer.appendChild(targetPin);
        }

        // 自分の足跡トレイル
        if (myTrail && myTrail.length > 0) {
            myTrail.forEach((nodeId, idx) => {
                const node = this.nodes[nodeId];
                if (!node || nodeId === myNodeId) return;
                const dot = document.createElement('div');
                dot.className = `trail-dot trail-${myRole}`;
                dot.style.left = `${node.x}%`;
                dot.style.top = `${node.y}%`;
                dot.style.opacity = Math.max(0.15, 0.6 - (myTrail.length - idx) * 0.08);
                entityLayer.appendChild(dot);
            });
        }

        // 振り返り用: 相手の足跡トレイル
        if (opponentTrail && opponentTrail.length > 0) {
            const oppRole = myRole === 'criminal' ? 'victim' : 'criminal';
            opponentTrail.forEach((nodeId, idx) => {
                const node = this.nodes[nodeId];
                if (!node || nodeId === opponentNodeId) return;
                const dot = document.createElement('div');
                dot.className = `trail-dot trail-${oppRole}`;
                dot.style.left = `${node.x}%`;
                dot.style.top = `${node.y}%`;
                dot.style.opacity = Math.max(0.2, 0.7 - (opponentTrail.length - idx) * 0.08);
                entityLayer.appendChild(dot);
            });
        }

        // 相手のマーカー（初期ピープ、または振り返り時のみ表示）
        if (opponentNodeId && this.nodes[opponentNodeId]) {
            const oppNode = this.nodes[opponentNodeId];
            const oppEl = document.createElement('div');
            const oppRole = myRole === 'criminal' ? 'victim' : 'criminal';
            oppEl.className = `entity-player marker-${oppRole} ${isInitialPeek ? 'pulse-peek' : ''}`;
            oppEl.style.left = `${oppNode.x}%`;
            oppEl.style.top = `${oppNode.y}%`;

            const icon = oppRole === 'criminal' ? '🦹' : '🏃';
            let label = '';
            if (isKids) {
                label = isInitialPeek
                    ? '⚠️ あいての スタートばしょ！'
                    : (oppRole === 'criminal' ? 'おうひと (あいて)' : 'にげるひと (あいて)');
            } else {
                label = isInitialPeek ? '⚠️ 相手の初期位置！' : (oppRole === 'criminal' ? '犯罪者（相手）' : '被害者（相手）');
            }

            oppEl.innerHTML = `
                <div class="player-avatar-ring"></div>
                <div class="player-icon">${icon}</div>
                <div class="player-tag tag-${oppRole}">${label}</div>
            `;
            entityLayer.appendChild(oppEl);
        }

        // 自分のマーカー（常に表示）
        if (myNodeId && this.nodes[myNodeId]) {
            const myNode = this.nodes[myNodeId];
            const meEl = document.createElement('div');
            meEl.className = `entity-player marker-${myRole} is-self`;
            meEl.style.left = `${myNode.x}%`;
            meEl.style.top = `${myNode.y}%`;

            const icon = myRole === 'criminal' ? '🦹' : '🏃';
            let label = '';
            if (isKids) {
                label = myRole === 'criminal' ? 'あなた (おうがわ)' : 'あなた (にげるがわ)';
            } else {
                label = myRole === 'criminal' ? 'あなた (犯罪者)' : 'あなた (被害者)';
            }

            meEl.innerHTML = `
                <div class="player-avatar-ring self-ring"></div>
                <div class="player-icon">${icon}</div>
                <div class="player-tag tag-self">${label}</div>
            `;
            entityLayer.appendChild(meEl);
        }
    }
}

// グローバルインスタンス
window.mapManager = new MapManager();
