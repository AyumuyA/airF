import * as THREE from 'three';

export class Radar {
    constructor(canvasId, player, maxRadius = 1000) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.player = player;
        this.maxRadius = maxRadius; // レーダーに映る最大距離
        this.center = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
        
        // 3D空間のモニターに貼るためのテクスチャ
        this.texture = new THREE.CanvasTexture(this.canvas);
    }

    update(targets) {
        // レーダーのクリア
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 中心（自機）の描画
        this.ctx.fillStyle = '#00ff00';
        this.ctx.beginPath();
        this.ctx.arc(this.center.x, this.center.y, 4, 0, Math.PI * 2);
        this.ctx.fill();

        // ターゲットの描画
        targets.forEach(target => {
            if (target.id === this.player.id) return; // 自分自身は描画しない

            // 1. 自機からターゲットへの相対ベクトルを計算
            const relativePos = target.mesh.position.clone().sub(this.player.mesh.position);
            const distance = relativePos.length();

            if (distance > this.maxRadius) return; // 範囲外は描画しない

            // 2. 自機の回転（クォータニオン）の逆をかけて、自機基準の相対座標に変換する
            // 常に自機の向いている方向がレーダーの上（-Y）になるようにする
            const inversePlayerQ = this.player.mesh.quaternion.clone().invert();
            relativePos.applyQuaternion(inversePlayerQ);

            // 3. 2Dレーダーへのマッピング
            // 3D空間の -Z方向 をレーダーの上(-Y), X方向 をレーダーの右(+X) とする
            const scale = (this.canvas.width / 2) / this.maxRadius;
            const radarX = this.center.x + (relativePos.x * scale);
            const radarY = this.center.y + (relativePos.z * scale); // 3D空間のZ座標をそのままYとして使う

            // 描画
            this.ctx.fillStyle = target.isEnemy ? '#ff0000' : '#ffff00';
            this.ctx.beginPath();
            this.ctx.arc(radarX, radarY, 4, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // 3D用テクスチャの更新をThree.jsに通知
        if (this.texture) {
            this.texture.needsUpdate = true;
        }
    }
}
