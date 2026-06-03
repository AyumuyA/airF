import * as THREE from 'three';
import { SHIP_STATS } from '../../shared/constants.js';

export class Ship {
    constructor(type = 'TYPE_A', id = 'player', isEnemy = false) {
        this.id = id;
        this.isEnemy = isEnemy;
        this.stats = SHIP_STATS[type];
        
        // 機体のメッシュ作成（丸みを持たせたジェット機風のデザイン）
        this.mesh = new THREE.Group();
        this.exterior = new THREE.Group(); // 外装（TPS用）
        this.interior = new THREE.Group(); // 内装ダッシュボード（FPS用）
        this.interior.visible = false; // デフォルトはTPSなので非表示
        
        // メインカラー
        const mainColor = this.isEnemy ? 0xff3333 : 0x0088ff;
        const subColor = this.isEnemy ? 0xcc0000 : 0x0055cc;

        // 1. 胴体（カプセル型）
        const bodyGeo = new THREE.CapsuleGeometry(0.8, 3, 16, 16);
        bodyGeo.rotateX(Math.PI / 2); // 縦向きをZ軸方向に倒す
        const bodyMat = new THREE.MeshStandardMaterial({ 
            color: mainColor, roughness: 0.4, metalness: 0.5 
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        
        // 2. 機首（コーン型）
        const noseGeo = new THREE.ConeGeometry(0.8, 2, 16);
        noseGeo.rotateX(-Math.PI / 2); // Z軸マイナス方向（前）に向ける
        const noseMat = new THREE.MeshStandardMaterial({ 
            color: subColor, roughness: 0.3, metalness: 0.7 
        });
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.z = -2.3; // 胴体の前に結合

        // 3. コックピット窓（半透明のカプセル）
        const cockpitGeo = new THREE.CapsuleGeometry(0.4, 1.2, 8, 16);
        cockpitGeo.rotateX(Math.PI / 2);
        const cockpitMat = new THREE.MeshPhysicalMaterial({
            color: 0x111111, transmission: 0.5, opacity: 1, transparent: true, roughness: 0.1
        });
        const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
        cockpit.position.set(0, 0.6, -0.5);

        // 4. 主翼（左右対称になるように2つのパーツに分割）
        const wingGeo = new THREE.CylinderGeometry(0.1, 1.5, 3.5, 3);
        wingGeo.scale(1, 0.1, 1); // 平べったくする
        const wingMat = new THREE.MeshStandardMaterial({ color: mainColor });
        
        // 左翼
        const leftWing = new THREE.Mesh(wingGeo, wingMat);
        leftWing.rotation.z = Math.PI / 2; // 細い方（Top）を左に向ける
        leftWing.position.set(-1.75, 0, 0.5); // 左側に配置
        
        // 右翼
        const rightWing = new THREE.Mesh(wingGeo, wingMat);
        rightWing.rotation.z = -Math.PI / 2; // 細い方（Top）を右に向ける
        rightWing.position.set(1.75, 0, 0.5); // 右側に配置

        // 5. エンジン部（光るシリンダー）
        const engineGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.5, 16);
        engineGeo.rotateX(Math.PI / 2);
        const engineMat = new THREE.MeshBasicMaterial({ color: 0x00ffff }); // 発光色
        const engine = new THREE.Mesh(engineGeo, engineMat);
        engine.position.z = 2.4; // 胴体の後ろ

        // 外装グループに追加
        this.exterior.add(body);
        this.exterior.add(nose);
        this.exterior.add(cockpit);
        this.exterior.add(leftWing);
        this.exterior.add(rightWing);
        this.exterior.add(engine);

        // --- 6. 内装ダッシュボード（FPS視点用） ---
        const dashboardGroup = new THREE.Group();
        // ダッシュボード全体を下に下げ、Z軸（奥）に離すことで、無駄な余白を減らしつつ見切れないようにする
        dashboardGroup.position.set(0, -0.15, -1.0);

        // ダッシュボード土台
        const dashGeo = new THREE.SphereGeometry(1, 32, 16);
        const dashMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3, metalness: 0.8 });
        const dashBase = new THREE.Mesh(dashGeo, dashMat);
        dashBase.scale.set(1.4, 0.5, 0.7); // 左右に広く、上下に潰す
        dashboardGroup.add(dashBase);

        // メインモニター（四角形から円形に変更）
        const screenGeo = new THREE.CircleGeometry(0.18, 32);
        this.screenMat = new THREE.MeshBasicMaterial({ color: 0x003366, side: THREE.DoubleSide });
        const screen = new THREE.Mesh(screenGeo, this.screenMat);
        screen.position.set(0, 0.42, 0.45); // ダッシュボードの山なりの頂点付近
        screen.rotation.x = -Math.PI / 4; // カメラに向ける
        dashboardGroup.add(screen);

        // サブメーター（左右の丸い計器）
        const meterGeo = new THREE.CircleGeometry(0.08, 16);
        const meterMatL = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
        const meterMatR = new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide });
        
        // 左メーター
        const meterL = new THREE.Mesh(meterGeo, meterMatL);
        meterL.position.set(-0.45, 0.38, 0.45);
        meterL.rotation.set(-Math.PI / 3, Math.PI / 8, 0);
        dashboardGroup.add(meterL);

        // 右メーター
        const meterR = new THREE.Mesh(meterGeo, meterMatR);
        meterR.position.set(0.45, 0.38, 0.45);
        meterR.rotation.set(-Math.PI / 3, -Math.PI / 8, 0);
        dashboardGroup.add(meterR);

        // 操縦桿
        const stickGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.3);
        const stickMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const stick = new THREE.Mesh(stickGeo, stickMat);
        stick.position.set(0, 0.1, 0.7);
        stick.rotation.x = Math.PI / 6;
        dashboardGroup.add(stick);

        this.interior.add(dashboardGroup);

        // メッシュ本体に追加
        this.mesh.add(this.exterior);
        this.mesh.add(this.interior);
        
        // 初期位置と姿勢
        this.mesh.position.set(0, 0, 0);
        this.mesh.quaternion.identity(); // 回転リセット
        
        // 現在の速度
        this.currentSpeed = 0;
    }

    // レーダーのキャンバステクスチャをコックピットのモニターに適用する
    setRadarTexture(texture) {
        if (this.screenMat) {
            this.screenMat.map = texture;
            this.screenMat.color.setHex(0xffffff); // テクスチャの本来の色を出すために白色にする
            this.screenMat.needsUpdate = true;
        }
    }
}
