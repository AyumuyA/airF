import * as THREE from 'three';

export class Missile {
    constructor(startPos, quaternion, ownerId, targetObj, color = 0xff55ff) {
        this.ownerId = ownerId;
        this.target = targetObj; // 追従対象のオブジェクト(enemy or asteroid)
        this.isDead = false;
        this.lifeTime = 0;
        
        // ミサイルのモデリング（ミサイルらしい形状）
        this.mesh = new THREE.Group();
        
        // 胴体
        const bodyGeo = new THREE.CylinderGeometry(0.3, 0.3, 3, 8);
        bodyGeo.rotateX(Math.PI / 2); // Z軸を前方に
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        this.mesh.add(body);
        
        // 先端（ノーズコーン）
        const noseGeo = new THREE.ConeGeometry(0.3, 1.2, 8);
        noseGeo.rotateX(Math.PI / 2);
        const noseMat = new THREE.MeshStandardMaterial({ color: color });
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.z = -2.1;
        this.mesh.add(nose);
        
        // フィン（翼）十字型
        const finGeo = new THREE.BoxGeometry(1.2, 0.05, 0.8);
        const finMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const fin1 = new THREE.Mesh(finGeo, finMat);
        fin1.position.z = 1.1;
        this.mesh.add(fin1);
        const fin2 = new THREE.Mesh(finGeo, finMat);
        fin2.rotation.z = Math.PI / 2;
        fin2.position.z = 1.1;
        this.mesh.add(fin2);
        
        // スラスターの光
        const glowGeo = new THREE.SphereGeometry(0.25, 8, 8);
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.z = 1.5;
        this.mesh.add(glow);

        this.mesh.position.copy(startPos);
        this.mesh.quaternion.copy(quaternion);
        
        // ミサイルの速度（機体の最高速より少し速いくらい、通常弾より遅い）
        this.speed = 220;
        this.velocity = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion).multiplyScalar(this.speed);
    }

    update(delta) {
        this.lifeTime += delta;
        if (this.lifeTime > 8) {
            this.isDead = true; // 8秒で燃料切れ
            return;
        }

        if (this.target && this.target.hp > 0 && !this.target.isBarrelRolling) {
            // 対象へ向かうベクトル
            const desiredDir = this.target.mesh.position.clone().sub(this.mesh.position).normalize();
            const currentDir = this.velocity.clone().normalize();
            
            // 誘導性能を大幅に上げる（ぐるぐる回るのを防ぐため delta * 15.0）
            currentDir.lerp(desiredDir, delta * 15.0).normalize();
            this.velocity.copy(currentDir.multiplyScalar(this.speed));
            
            // ミサイルの向きを進行方向に合わせる
            this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), currentDir);
        } else if (this.target && this.target.isBarrelRolling) {
            // 対象がバレルロール（回避行動）中の場合、誘導を切って直進させる
            const currentDir = this.velocity.clone().normalize();
            this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), currentDir);
        }
        
        this.mesh.position.add(this.velocity.clone().multiplyScalar(delta));
    }
}
