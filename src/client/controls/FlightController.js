import * as THREE from 'three';

export class FlightController {
    constructor(ship, camera, domElement) {
        this.ship = ship;
        this.camera = camera;
        this.domElement = domElement;
        
        // 入力状態
        this.input = {
            pitch: 0,
            yaw: 0,
            roll: 0,
            throttle: 0
        };
        
        // 射撃関連の状態
        this.isFiring = false;
        this.fireCooldown = 0.15; // 0.15秒に1発
        this.timeSinceLastFire = 0;
        this.onFire = null; // メインループ等で登録するコールバック
        
        this.viewMode = 'TPS'; // 'TPS' or 'FPS'
        this.isPointerLocked = false;
        
        // マウスの感度
        this.mouseSensitivity = 0.002;
        
        // ターゲットクォータニオン（滑らかな回転のため）
        this.targetQuaternion = new THREE.Quaternion().copy(this.ship.mesh.quaternion);

        this.initEvents();
    }

    initEvents() {
        // キーボード入力
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
        
        // Pointer Lock
        this.domElement.addEventListener('click', () => {
            if (!this.isPointerLocked) {
                this.domElement.requestPointerLock();
            }
        });
        
        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = (document.pointerLockElement === this.domElement);
        });
        
        // マウス移動
        document.addEventListener('mousemove', (e) => {
            if (this.isPointerLocked) {
                // movementX: 左右 (ヨー), movementY: 上下 (ピッチ)
                // 機体の上下ピッチはマウスを下に動かす(movementY > 0)と機首が下を向く想定（お好みで反転）
                this.input.yaw = -e.movementX * this.mouseSensitivity;
                this.input.pitch = -e.movementY * this.mouseSensitivity;
            } else {
                this.input.yaw = 0;
                this.input.pitch = 0;
            }
        });

        // マウスの左クリックで射撃
        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.isFiring = true;
        });
        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.isFiring = false;
        });
    }

    onKeyDown(e) {
        switch(e.code) {
            case 'KeyW': this.input.throttle = 1; break;
            case 'KeyS': this.input.throttle = -0.5; break; // 減速・後退
            case 'KeyA': this.input.roll = 1; break;   // 左ロール
            case 'KeyD': this.input.roll = -1; break;  // 右ロール
            case 'KeyV': this.toggleCamera(); break;
            case 'Space': this.isFiring = true; break;
        }
    }

    onKeyUp(e) {
        switch(e.code) {
            case 'KeyW':
            case 'KeyS': this.input.throttle = 0; break;
            case 'KeyA':
            case 'KeyD': this.input.roll = 0; break;
            case 'Space': this.isFiring = false; break;
        }
    }

    toggleCamera() {
        this.viewMode = this.viewMode === 'TPS' ? 'FPS' : 'TPS';
        
        const radarUI = document.getElementById('radar-canvas');

        // 視点切り替え時、外装(exterior)と内装(interior)の表示を切り替える
        if (this.viewMode === 'FPS') {
            this.ship.exterior.visible = false;
            this.ship.interior.visible = true;
            // 3D内装モニターにレーダーを映すため、2DのHTMLレーダーは非表示にする
            if (radarUI) radarUI.style.display = 'none';
        } else {
            this.ship.exterior.visible = true;
            this.ship.interior.visible = false;
            // TPSでは2DのHTMLレーダーを表示する
            if (radarUI) radarUI.style.display = 'block';
        }
    }

    update(delta) {
        const stats = this.ship.stats;
        
        // 加減速の処理 (簡易的な物理)
        const targetSpeed = this.input.throttle * stats.maxSpeed;
        this.ship.currentSpeed = THREE.MathUtils.lerp(this.ship.currentSpeed, targetSpeed, delta * (stats.acceleration / stats.maxSpeed));
        
        // 射撃処理
        this.timeSinceLastFire += delta;
        if (this.isFiring && this.timeSinceLastFire >= this.fireCooldown) {
            this.timeSinceLastFire = 0;
            if (this.onFire) this.onFire();
        }
        
        // クォータニオンによる回転計算 (ローカル軸)
        const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.input.pitch * stats.pitchSpeed);
        const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.input.yaw * stats.yawSpeed);
        const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.input.roll * stats.rollSpeed * delta);
        
        // 回転の合成 (ヨー -> ピッチ -> ロールの順)
        const totalRotation = new THREE.Quaternion();
        totalRotation.multiply(yawQ).multiply(pitchQ).multiply(rollQ);
        
        // ターゲットクォータニオンに適用
        this.targetQuaternion.multiply(totalRotation);
        this.targetQuaternion.normalize();
        
        // 実際の機体姿勢を滑らかに補間 (slerp)
        this.ship.mesh.quaternion.slerp(this.targetQuaternion, 0.2);

        // マウスの入力は毎フレーム減衰させる（マウスを動かさないと回転が止まる）
        if (this.isPointerLocked) {
            this.input.pitch = THREE.MathUtils.lerp(this.input.pitch, 0, 0.1);
            this.input.yaw = THREE.MathUtils.lerp(this.input.yaw, 0, 0.1);
        }
        
        // 機体の移動 (ローカルZ軸のマイナス方向へ進む)
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.ship.mesh.quaternion);
        this.ship.mesh.position.add(forward.multiplyScalar(this.ship.currentSpeed * delta));

        // カメラ追従処理
        this.updateCamera();
    }

    updateCamera() {
        if (this.viewMode === 'TPS') {
            // 機体後方からの視点
            const offset = new THREE.Vector3(0, 3, 12);
            offset.applyQuaternion(this.ship.mesh.quaternion);
            
            // カメラ位置を滑らかに追従
            const targetCamPos = this.ship.mesh.position.clone().add(offset);
            this.camera.position.lerp(targetCamPos, 0.3);
            
            // カメラのUPベクトルを機体に合わせる（ロールに追従）
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.ship.mesh.quaternion);
            this.camera.up.copy(up);
            
            // 機体より少し先を注視
            const lookTarget = this.ship.mesh.position.clone().add(
                new THREE.Vector3(0, 0, -20).applyQuaternion(this.ship.mesh.quaternion)
            );
            this.camera.lookAt(lookTarget);
            
        } else {
            // FPS視点 (コックピット)
            const offset = new THREE.Vector3(0, 0.5, 0); // 機体の少し上
            offset.applyQuaternion(this.ship.mesh.quaternion);
            
            this.camera.position.copy(this.ship.mesh.position).add(offset);
            this.camera.quaternion.copy(this.ship.mesh.quaternion);
        }
    }
}
