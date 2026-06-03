import * as THREE from 'three';

export class Projectile {
    constructor(position, quaternion, ownerId, color = 0x00ff00) {
        this.ownerId = ownerId;
        this.speed = 800; // 弾の速度（見えるように少し遅く調整）
        this.lifeTime = 3.0; // 寿命（秒）
        this.age = 0;
        this.isDead = false;

        // レーザービームのような形状（太く長くして視認性を上げる）
        const geometry = new THREE.CylinderGeometry(0.3, 0.3, 15, 8);
        geometry.rotateX(Math.PI / 2); // 進行方向(Z軸マイナス)を向くように調整
        
        // 暗闇でも光って見えるようにMeshBasicMaterialを使用
        const material = new THREE.MeshBasicMaterial({ color: color });
        this.mesh = new THREE.Mesh(geometry, material);

        this.mesh.position.copy(position);
        this.mesh.quaternion.copy(quaternion);
        
        // 進行方向ベクトル（Z軸マイナス方向）
        this.velocity = new THREE.Vector3(0, 0, -1);
        this.velocity.applyQuaternion(this.mesh.quaternion);
        this.velocity.multiplyScalar(this.speed);
    }

    update(delta) {
        this.age += delta;
        if (this.age > this.lifeTime) {
            this.isDead = true;
            return;
        }

        // 弾を前方に進める
        const moveVec = this.velocity.clone().multiplyScalar(delta);
        this.mesh.position.add(moveVec);
    }
}
