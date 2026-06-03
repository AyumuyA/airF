import * as THREE from 'three';

export class HUD {
    constructor(containerId, camera) {
        this.container = document.getElementById(containerId);
        this.camera = camera;
        this.markers = new Map(); // ターゲットIDとDOM要素のマッピング
    }

    update(targets, playerPos) {
        const halfWidth = window.innerWidth / 2;
        const halfHeight = window.innerHeight / 2;

        targets.forEach(target => {
            // マーカーDOMがなければ作成
            if (!this.markers.has(target.id)) {
                const el = document.createElement('div');
                el.className = 'target-marker';
                this.container.appendChild(el);
                this.markers.set(target.id, el);
            }

            const markerEl = this.markers.get(target.id);

            // 3D座標から2Dスクリーン座標への変換 (Projection)
            const targetPos = target.mesh.position.clone();
            // 敵機体の上にマーカーを表示させるため、Y軸にオフセットを加える
            targetPos.y += 2; 

            // プロジェクション（3D座標をカメラ視点の-1.0〜1.0の座標系に変換）
            const proj = targetPos.clone().project(this.camera);

            // プロジェクションされたZ座標が1より大きい場合、カメラの後ろ（背後）にいるので非表示
            if (proj.z > 1) {
                markerEl.style.display = 'none';
                return;
            }

            // -1.0〜1.0 の座標を、ブラウザのピクセル座標（px）に変換
            const x = (proj.x * halfWidth) + halfWidth;
            const y = -(proj.y * halfHeight) + halfHeight;

            // 自機からの距離の計算
            const distance = Math.floor(target.mesh.position.distanceTo(playerPos));

            // DOM要素の更新
            markerEl.style.display = 'block';
            markerEl.style.left = `${x}px`;
            markerEl.style.top = `${y}px`;
            markerEl.innerText = `[ENEMY]\nDist: ${distance}m\nHP: 100%`;
        });
    }
}
