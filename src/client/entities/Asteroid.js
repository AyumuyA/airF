import * as THREE from 'three';

export class Asteroid {
    constructor(data) {
        this.id = data.id;
        this.radius = data.radius;
        this.hp = data.hp;
        this.maxHp = data.maxHp;

        // ゴツゴツした形を作るため Icosahedron を使用
        const geometry = new THREE.IcosahedronGeometry(this.radius, 1);
        
        // 頂点を少しランダムにずらして自然な小惑星っぽくする
        const positionAttribute = geometry.getAttribute('position');
        const vertex = new THREE.Vector3();
        for (let i = 0; i < positionAttribute.count; i++) {
            vertex.fromBufferAttribute(positionAttribute, i);
            // 本来の半径からランダムに凹凸をつける（最大30%）
            vertex.normalize().multiplyScalar(this.radius + (Math.random() * this.radius * 0.3));
            positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0x666666, // 岩っぽいグレー
            roughness: 0.9,
            metalness: 0.1,
            flatShading: true // カクカクしたポリゴン感を出して岩らしくする
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(data.position);
        
        // 宇宙空間でゆっくり回転させるためのランダムな自転軸と速度
        this.rotationAxis = new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize();
        this.rotationSpeed = Math.random() * 0.5 + 0.1;
        this.velocity = new THREE.Vector3(data.velocity.x, data.velocity.y, data.velocity.z);

        // HPバー UI
        this.uiElement = null;
        this.hpBar = null;
        this.showUiTime = 0; // 0のときは非表示
    }

    showHpBar() {
        this.showUiTime = 3.0; // 3秒間表示する
        if (!this.uiElement) {
            this.uiElement = document.createElement('div');
            this.uiElement.style.position = 'absolute';
            this.uiElement.style.width = '60px';
            this.uiElement.style.height = '8px';
            this.uiElement.style.backgroundColor = 'rgba(50, 0, 0, 0.6)';
            this.uiElement.style.border = '1px solid #111';
            this.uiElement.style.pointerEvents = 'none';
            this.uiElement.style.transform = 'translate(-50%, -50%)';
            this.uiElement.style.zIndex = '10';

            this.hpBar = document.createElement('div');
            this.hpBar.style.width = '100%';
            this.hpBar.style.height = '100%';
            this.hpBar.style.backgroundColor = '#ffcc00';
            this.hpBar.style.transition = 'width 0.1s ease-out';
            this.uiElement.appendChild(this.hpBar);

            const uiContainer = document.getElementById('ui-container');
            if (uiContainer) uiContainer.appendChild(this.uiElement);
        }
    }

    update(delta, camera, windowWidth, windowHeight) {
        // 毎フレーム少しずつ回転させる
        this.mesh.rotateOnAxis(this.rotationAxis, this.rotationSpeed * delta);
        // 移動
        this.mesh.position.add(this.velocity.clone().multiplyScalar(delta));
        // エリアを外れたら反対側へワープ
        if (this.mesh.position.length() > 3000) {
            this.mesh.position.multiplyScalar(-0.95);
        }

        // HPバーのUI更新
        if (this.showUiTime > 0) {
            this.showUiTime -= delta;
            
            if (this.uiElement && camera) {
                const percent = Math.max(0, this.hp / this.maxHp) * 100;
                this.hpBar.style.width = `${percent}%`;
                
                // 3D座標から2Dスクリーン座標への変換
                const pos = this.mesh.position.clone();
                pos.y += this.radius + 5; // 小惑星の少し上に表示
                pos.project(camera);
                
                if (pos.z < 1) { // カメラの前方にある場合
                    this.uiElement.style.display = 'block';
                    const x = (pos.x * windowWidth / 2) + windowWidth / 2;
                    const y = -(pos.y * windowHeight / 2) + windowHeight / 2;
                    this.uiElement.style.left = `${x}px`;
                    this.uiElement.style.top = `${y}px`;
                } else {
                    this.uiElement.style.display = 'none';
                }
            }
        } else if (this.uiElement) {
            this.uiElement.style.display = 'none';
        }
    }

    destroy() {
        if (this.uiElement) {
            this.uiElement.remove();
            this.uiElement = null;
        }
    }
}
