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

        // --- 6. 内装（スマートグラス風 AR HUD） ---
        const dashboardGroup = new THREE.Group();
        dashboardGroup.position.set(0, 0.5, 0); // カメラと同じ位置（FPS視点の中心）

        // スマートグラス風のキャノピー（視界を覆う薄いガラスの完全な球体）
        const glassGeo = new THREE.SphereGeometry(2, 32, 16); // 上半分だけでなく全方位を覆う
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0x00ccff, transparent: true, opacity: 0.1,
            side: THREE.BackSide, roughness: 0.1, metalness: 0.1,
            depthWrite: false
        });
        const glass = new THREE.Mesh(glassGeo, glassMat);
        dashboardGroup.add(glass);

        // UI用マテリアル設定（加算合成でホログラム感を出す）
        const hologramMat = {
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        };

        const screenZ = -1.5; // カメラの1.5前方に浮かべる
        const screenY = -0.6; // さらに下に配置して視界をクリアに

        // 中央：レーダーモニター（丸型でSFっぽく）
        const radarGeo = new THREE.CircleGeometry(0.3, 32);
        this.radarMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, ...hologramMat });
        const radarMesh = new THREE.Mesh(radarGeo, this.radarMat);
        radarMesh.position.set(0, screenY, screenZ);
        dashboardGroup.add(radarMesh);
        
        // レーダーのホログラム枠
        const radarBorderGeo = new THREE.RingGeometry(0.3, 0.32, 32);
        const borderMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, ...hologramMat });
        const radarBorder = new THREE.Mesh(radarBorderGeo, borderMat);
        radarBorder.position.set(0, screenY, screenZ);
        dashboardGroup.add(radarBorder);

        // 左：HPモニター（空間に浮かべる）
        const hpCanvas = document.createElement('canvas');
        hpCanvas.width = 128; hpCanvas.height = 64;
        this.hpCtx = hpCanvas.getContext('2d');
        this.hpTex = new THREE.CanvasTexture(hpCanvas);
        const hpMat = new THREE.MeshBasicMaterial({ map: this.hpTex, ...hologramMat });
        const hpMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), hpMat);
        hpMesh.position.set(-0.6, screenY + 0.1, screenZ + 0.15); // 手前にカーブしているように
        hpMesh.rotation.y = Math.PI / 8; // 中央に向ける
        dashboardGroup.add(hpMesh);

        // 右：クールダウンモニター
        const cdCanvas = document.createElement('canvas');
        cdCanvas.width = 128; cdCanvas.height = 64;
        this.cdCtx = cdCanvas.getContext('2d');
        this.cdTex = new THREE.CanvasTexture(cdCanvas);
        const cdMat = new THREE.MeshBasicMaterial({ map: this.cdTex, ...hologramMat });
        const cdMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), cdMat);
        cdMesh.position.set(0.6, screenY + 0.1, screenZ + 0.15); 
        cdMesh.rotation.y = -Math.PI / 8; // 中央に向ける
        dashboardGroup.add(cdMesh);

        // 下：スピードメーター
        const spdCanvas = document.createElement('canvas');
        spdCanvas.width = 128; spdCanvas.height = 64;
        this.spdCtx = spdCanvas.getContext('2d');
        this.spdTex = new THREE.CanvasTexture(spdCanvas);
        const spdMat = new THREE.MeshBasicMaterial({ map: this.spdTex, ...hologramMat });
        const spdMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), spdMat);
        spdMesh.position.set(0, screenY - 0.4, screenZ); 
        dashboardGroup.add(spdMesh);

        this.dashboardGroup = dashboardGroup;
        this.interior.add(dashboardGroup);

        // メッシュ本体に追加
        this.mesh.add(this.exterior);
        this.mesh.add(this.interior);
        
        // 機体を少し大きくする（被弾面積が増える代わりにダメージを減らすため）
        this.mesh.scale.set(1.5, 1.5, 1.5);
        
        // 初期位置と姿勢
        this.mesh.position.set(0, 0, 0);
        this.mesh.quaternion.identity(); // 回転リセット
        
        // 現在の速度
        this.currentSpeed = 0;
    }

    // レーダーのキャンバステクスチャをコックピットのモニターに適用する
    setRadarTexture(texture) {
        if (this.radarMat) {
            this.radarTex = texture;
            this.radarMat.map = texture;
            this.radarMat.color.setHex(0xffffff); // テクスチャの本来の色を出すために白色にする
            this.radarMat.needsUpdate = true;
        }
    }

    updateCockpitUI(hp, missileCooldown, speed) {
        // HPの更新
        if (this.hpCtx && this.lastHp !== hp) {
            this.hpCtx.clearRect(0, 0, 128, 64);
            // ホログラム感を出すため背景は塗りつぶさない（完全透明）
            
            this.hpCtx.fillStyle = hp > 20 ? '#00ffcc' : '#ff3333';
            this.hpCtx.font = 'bold 22px sans-serif';
            this.hpCtx.textAlign = 'center';
            this.hpCtx.fillText('ARMOR', 64, 28);
            this.hpCtx.fillText(`${hp}%`, 64, 52);
            this.hpTex.needsUpdate = true;
            this.lastHp = hp;
        }

        // ミサイルクールタイムの更新
        const cdState = missileCooldown > 0 ? missileCooldown.toFixed(1) : 'READY';
        if (this.cdCtx && this.lastCd !== cdState) {
            this.cdCtx.clearRect(0, 0, 128, 64);
            // 完全透明背景
            
            this.cdCtx.fillStyle = missileCooldown > 0 ? '#ff3333' : '#00ffcc';
            this.cdCtx.font = 'bold 20px sans-serif';
            this.cdCtx.textAlign = 'center';
            
            if (missileCooldown > 0) {
                this.cdCtx.fillText('RELOADING', 64, 28);
                this.cdCtx.fillText(missileCooldown.toFixed(1) + 's', 64, 52);
            } else {
                this.cdCtx.fillText('MISSILE', 64, 28);
                this.cdCtx.fillText('READY', 64, 52);
            }
            this.cdTex.needsUpdate = true;
            this.lastCd = cdState;
        }

        // スピードメーターの更新
        const speedValue = Math.floor(speed);
        if (this.spdCtx && this.lastSpeed !== speedValue) {
            this.spdCtx.clearRect(0, 0, 128, 64);
            
            this.spdCtx.fillStyle = '#00ffcc';
            this.spdCtx.font = 'bold 20px sans-serif';
            this.spdCtx.textAlign = 'center';
            this.spdCtx.fillText('SPEED', 64, 28);
            this.spdCtx.fillText(speedValue + ' km/s', 64, 52);
            
            this.spdTex.needsUpdate = true;
            this.lastSpeed = speedValue;
        }
    }
}
