import * as THREE from 'three';

export class HUD {
    constructor(containerId, camera) {
        this.container = document.getElementById(containerId);
        this.camera = camera;
        this.markers = new Map(); // ターゲットIDとDOM要素のマッピング
        
        // リーダーライン（ターゲットとテキストを繋ぐ線）用のSVGコンテナ
        this.svgNS = "http://www.w3.org/2000/svg";
        this.svg = document.createElementNS(this.svgNS, "svg");
        this.svg.style.position = 'absolute';
        this.svg.style.top = '0';
        this.svg.style.left = '0';
        this.svg.style.width = '100vw';
        this.svg.style.height = '100vh';
        this.svg.style.pointerEvents = 'none'; // クリックを邪魔しない
        this.container.appendChild(this.svg);

        this.lines = new Map(); // ターゲットIDとSVG Lineのマッピング
    }

    removeTarget(id) {
        if (this.markers.has(id)) {
            this.markers.get(id).remove();
            this.markers.delete(id);
        }
        if (this.lines.has(id)) {
            this.lines.get(id).remove();
            this.lines.delete(id);
        }
    }

    update(targets, playerPos) {
        const halfWidth = window.innerWidth / 2;
        const halfHeight = window.innerHeight / 2;

        targets.forEach(target => {
            if (!this.markers.has(target.id)) {
                const el = document.createElement('div');
                el.className = 'target-marker';
                this.container.appendChild(el);
                this.markers.set(target.id, el);

                const line = document.createElementNS(this.svgNS, "line");
                line.setAttribute("stroke", "#ff3333");
                line.setAttribute("stroke-width", "1");
                line.setAttribute("opacity", "0.8");
                this.svg.appendChild(line);
                this.lines.set(target.id, line);
            }

            const markerEl = this.markers.get(target.id);
            const lineEl = this.lines.get(target.id);

            // 機体の中心位置を取得
            const targetPos = target.mesh.position.clone();
            const proj = targetPos.project(this.camera);

            if (proj.z > 1) {
                markerEl.style.display = 'none';
                lineEl.style.display = 'none';
                return;
            }

            // 機体中心のスクリーン座標
            const shipX = (proj.x * halfWidth) + halfWidth;
            const shipY = -(proj.y * halfHeight) + halfHeight;

            // 情報ボックスを右上にオフセットする（機体と被らないように）
            const boxOffsetX = 60;
            const boxOffsetY = -50;
            const boxX = shipX + boxOffsetX;
            const boxY = shipY + boxOffsetY;

            const distance = Math.floor(target.mesh.position.distanceTo(playerPos));
            const hp = target.hp !== undefined ? target.hp : 100;

            // 色の決定（HP残量によって変化）
            let color = '#00ffcc'; // デフォルト（青緑）
            if (hp <= 50) color = '#ffff00'; // 50%以下（黄）
            if (hp <= 20) color = '#ff3333'; // 20%以下（赤）
            
            const displayName = target.displayName || target.playerName || 'ENEMY';

            markerEl.style.display = 'block';
            markerEl.style.left = `${boxX}px`;
            markerEl.style.top = `${boxY}px`;
            markerEl.style.color = color;
            markerEl.style.borderColor = color;
            markerEl.innerText = `[${displayName}]\nDist: ${distance}m\nHP: ${hp}%`;

            // 線を機体中心から情報ボックスの底辺中央に繋ぐ
            lineEl.style.display = 'block';
            lineEl.setAttribute("stroke", color);
            lineEl.setAttribute("x1", shipX);
            lineEl.setAttribute("y1", shipY);
            lineEl.setAttribute("x2", boxX);
            lineEl.setAttribute("y2", boxY);
        });

        // リストから消えたターゲット（撃墜された等）のマーカーを消去
        const currentTargetIds = new Set(targets.map(t => t.id));
        for (const id of this.markers.keys()) {
            if (!currentTargetIds.has(id)) {
                this.removeTarget(id);
            }
        }
    }
}
