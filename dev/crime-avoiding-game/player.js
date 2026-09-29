/**
 * プレイヤー管理モジュール (player.js)
 *
 * プレイヤーの情報・役割・移動クールダウン・ブロック状態を管理
 */

class PlayerManager {
    constructor() {
        this.myId = null;
        this.myName = 'あなた';
        this.myRole = 'victim'; // 'victim' or 'criminal'
        this.currentNode = null;
        this.selectedNextNode = null; // 現在のターンで選択中の移動先
        this.trail = []; // 過去の移動履歴ノードID
        this.isBlocked = false;

        // クールダウン (連続移動を防ぎ心理戦の間を作る: 0.8秒)
        this.moveCooldownMs = 800;
        this.lastMoveTime = 0;

        // 相手情報
        this.opponent = null;
    }

    reset() {
        this.currentNode = null;
        this.trail = [];
        this.isBlocked = false;
        this.lastMoveTime = 0;
        this.opponent = null;
    }

    setMe(id, name, role, startNode) {
        this.myId = id;
        this.myName = name;
        this.myRole = role;
        this.currentNode = startNode;
        this.trail = [startNode];
        this.isBlocked = false;
    }

    canMoveNow() {
        const now = Date.now();
        return now - this.lastMoveTime >= this.moveCooldownMs;
    }

    recordMove(toNode) {
        this.currentNode = toNode;
        this.trail.push(toNode);
        this.lastMoveTime = Date.now();
    }

    updateOpponent(playerData) {
        this.opponent = playerData;
    }
}

// グローバルインスタンス
window.playerManager = new PlayerManager();
