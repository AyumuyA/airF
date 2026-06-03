import * as THREE from 'three';
import { SHIP_STATS } from '../../shared/constants.js';

export class Ship {
    constructor(type = 'TYPE_A') {
        this.stats = SHIP_STATS[type];
        
        // 機体のメッシュ作成（仮のモックアップ：細長い箱 + 翼）
        this.mesh = new THREE.Group();
        
        // 胴体
        const bodyGeo = new THREE.BoxGeometry(1, 1, 4);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0088ff });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        
        // 主翼
        const wingGeo = new THREE.BoxGeometry(5, 0.2, 1.5);
        const wingMat = new THREE.MeshStandardMaterial({ color: 0x0055aa });
        const wings = new THREE.Mesh(wingGeo, wingMat);
        wings.position.z = 0.5; // 少し後ろに
        
        // 機首の目印（前方が分かりやすいように色を変える）
        const noseGeo = new THREE.BoxGeometry(0.8, 0.8, 1);
        const noseMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.z = -2.5; // Z軸マイナス方向が前方

        this.mesh.add(body);
        this.mesh.add(wings);
        this.mesh.add(nose);
        
        // 初期位置と姿勢
        this.mesh.position.set(0, 0, 0);
        this.mesh.quaternion.identity(); // 回転リセット
        
        // 現在の速度
        this.currentSpeed = 0;
    }
}
