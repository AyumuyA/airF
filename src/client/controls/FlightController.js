import * as THREE from 'three';

export class FlightController {
    constructor(ship, camera, domElement) {
        this.ship = ship;
        this.camera = camera;
        this.domElement = domElement;
        
        // 入力状態
        this.input = {
            pitchBuffer: 0,
            yawBuffer: 0,
            roll: 0,
            throttle: 0
        };
        
        // 仮想ジョイスティック（Shiftキー長押しモード）
        this.virtualStick = {
            active: false,
            x: 0, // 左右の倒れ具合 (-1.0 〜 1.0)
            y: 0  // 上下の倒れ具合 (-1.0 〜 1.0)
        };
        
        // 射撃関連の状態
        this.isFiring = false;
        this.isAiming = false; // ロックオン状態
        
        // マウスの感度設定（左右・下方向の感度を少し良くする）
        this.mouseSensitivityX = 0.003; 
        this.mouseSensitivityY = 0.003; 
        
        // 回転速度の上限など
        this.timeSinceLastFire = 0;
        this.fireCooldown = 0.15; // 0.15秒に1発
        this.onFire = null; // 通常弾の発射コールバック
        this.onMissileTrigger = null; // ミサイルのトリガーコールバック
        
        // バレルロール（回避）関連
        this.lastTapTime = { a: 0, d: 0 };
        this.barrelRoll = { active: false, progress: 0, duration: 0.4, direction: 1 };
        
        // 後方視点
        this.input.rearView = false;
        
        this.viewMode = 'TPS'; // 'TPS' or 'FPS'
        this.isPointerLocked = false;
        
        // マウスの感度
        this.mouseSensitivity = 0.002;
        
        // ターゲットクォータニオン（滑らかな回転のため）
        this.targetQuaternion = new THREE.Quaternion().copy(this.ship.mesh.quaternion);

        // 吹き飛ばし（ノックバック）用ベクトル
        this.impactVelocity = new THREE.Vector3();

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
                if (this.virtualStick.active) {
                    // シフト押下中：マウス移動をレバーの傾きとして蓄積する
                    this.virtualStick.x += -e.movementX * this.mouseSensitivityX;
                    this.virtualStick.y += -e.movementY * this.mouseSensitivityY;
                    
                    // レバーが倒れすぎないように最大値を設ける（-1.0 ~ 1.0を限界とする）
                    this.virtualStick.x = THREE.MathUtils.clamp(this.virtualStick.x, -1.5, 1.5);
                    this.virtualStick.y = THREE.MathUtils.clamp(this.virtualStick.y, -1.5, 1.5);
                } else {
                    // 通常時：マウス入力を直接バッファに蓄積する
                    // 下方向（e.movementY > 0）の感度をさらに少し良くする
                    const ySens = e.movementY > 0 ? this.mouseSensitivityY * 1.2 : this.mouseSensitivityY;
                    this.input.yawBuffer += -e.movementX * this.mouseSensitivityX;
                    this.input.pitchBuffer += -e.movementY * ySens;
                }
            }
        });

        // マウスの左クリックで通常弾、右クリックでミサイル構え・発射
        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.isFiring = true;
            if (e.button === 2) {
                this.isAiming = true;
                if (this.onMissileTrigger) this.onMissileTrigger(true);
            }
        });
        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.isFiring = false;
            if (e.button === 2) {
                this.isAiming = false;
                if (this.onMissileTrigger) this.onMissileTrigger(false);
            }
        });
        
        // 右クリックメニュー禁止
        window.addEventListener('contextmenu', e => e.preventDefault());
    }

    onKeyDown(e) {
        if (e.repeat) return;
        switch(e.code) {
            case 'ShiftLeft':
            case 'ShiftRight':
                if (!this.virtualStick.active) {
                    this.virtualStick.active = true;
                    this.virtualStick.x = 0; // ニュートラル状態からスタート
                    this.virtualStick.y = 0;
                }
                break;
            case 'KeyW': this.input.throttle = 1; break;
            case 'KeyS': this.input.throttle = -0.5; break; // 減速・後退
            case 'KeyA': 
                const nowA = performance.now();
                if (nowA - this.lastTapTime.a < 300 && !this.barrelRoll.active) {
                    this.barrelRoll = { active: true, progress: 0, duration: 0.4, direction: 1 };
                }
                this.lastTapTime.a = nowA;
                this.input.roll = 1; 
                break;
            case 'KeyD':
                const nowD = performance.now();
                if (nowD - this.lastTapTime.d < 300 && !this.barrelRoll.active) {
                    this.barrelRoll = { active: true, progress: 0, duration: 0.4, direction: -1 };
                }
                this.lastTapTime.d = nowD;
                this.input.roll = -1; 
                break;
            case 'KeyV': this.toggleCamera(); break;
            case 'Space': this.input.rearView = true; break;
        }
    }

    onKeyUp(e) {
        switch(e.code) {
            case 'ShiftLeft':
            case 'ShiftRight':
                this.virtualStick.active = false;
                this.virtualStick.x = 0;
                this.virtualStick.y = 0;
                break;
            case 'KeyW':
            case 'KeyS': this.input.throttle = 0; break;
            case 'KeyA':
            case 'KeyD': this.input.roll = 0; break;
            case 'Space': this.input.rearView = false; break;
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

    applyImpact(direction, force) {
        this.impactVelocity.add(direction.clone().normalize().multiplyScalar(force));
    }

    update(delta) {
        const stats = this.ship.stats;
        
        // 加減速の処理 (慣性とブレーキ)
        if (this.input.throttle > 0) {
            // Wキー：最高速度まで加速
            this.ship.currentSpeed = THREE.MathUtils.lerp(this.ship.currentSpeed, stats.maxSpeed, delta * (stats.acceleration / stats.maxSpeed));
        } else if (this.input.throttle < 0) {
            // Sキー：急激に減速（ブレーキ）
            this.ship.currentSpeed = THREE.MathUtils.lerp(this.ship.currentSpeed, 0, delta * 3.0);
        } else {
            // 入力なし：緩やかに減速（宇宙の慣性）
            this.ship.currentSpeed = THREE.MathUtils.lerp(this.ship.currentSpeed, 0, delta * 0.3);
        }
        
        // 慣性の影響：スピードが速いほど旋回しにくくなる（最大で旋回速度が半減）
        const speedRatio = this.ship.currentSpeed / stats.maxSpeed;
        const inertiaFactor = 1.0 - (speedRatio * 0.5); 
        
        // 射撃処理
        this.timeSinceLastFire += delta;
        if (this.isFiring && this.timeSinceLastFire >= this.fireCooldown) {
            this.timeSinceLastFire = 0;
            if (this.onFire) this.onFire();
        }

        // 仮想ジョイスティックからの継続入力
        if (this.virtualStick.active) {
            // レバーの倒れ具合に応じて、毎フレーム旋回バッファに継続的に追加する
            this.input.yawBuffer += this.virtualStick.x * delta * 5.0;
            this.input.pitchBuffer += this.virtualStick.y * delta * 5.0;
        }
        
        // --- リアルな旋回力学（ロールとピッチの相乗効果） ---
        // 1. ロール（傾き）とヨー（左右旋回）の関係
        // 機体のローカル右方向ベクトルを取得
        const localRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.ship.mesh.quaternion);
        // localRight.y が正なら「左ロール（左傾き）」、負なら「右ロール（右傾き）」
        // 旋回しようとしている方向と傾きが一致しているか計算
        const rollDirectionMatch = localRight.y * Math.sign(this.input.yawBuffer);
        
        // 傾いている方向への旋回は素早く、傾いていない・逆方向への旋回は極端に遅くなる（0.15倍 〜 1.2倍）
        const rollBonus = 0.15 + (Math.max(0, rollDirectionMatch) * 1.05);

        // 2. ピッチ（上下）の力学
        // 航空機は「機首上げ（プルアップ）」の方が「機首下げ（ダイブ）」よりも圧倒的に速く旋回できる
        const isPitchingUp = this.input.pitchBuffer > 0;
        const pitchBonus = isPitchingUp ? 1.0 : 0.3; // 機首下げは30%の力しか出ない

        // 1フレームあたりに適用可能な最大回転量
        const maxPitchTurn = stats.pitchSpeed * inertiaFactor * pitchBonus * delta;
        const maxYawTurn = stats.yawSpeed * inertiaFactor * rollBonus * delta;

        // バッファから取り出して適用する量（制限付き）
        const applyPitch = THREE.MathUtils.clamp(this.input.pitchBuffer, -maxPitchTurn, maxPitchTurn);
        const applyYaw = THREE.MathUtils.clamp(this.input.yawBuffer, -maxYawTurn, maxYawTurn);

        // バレルロール処理
        let forcedRoll = 0;
        let dodgeVelocity = new THREE.Vector3();
        if (this.barrelRoll.active) {
            this.barrelRoll.progress += delta / this.barrelRoll.duration;
            this.ship.isBarrelRolling = true; // 回避状態（ミサイルの誘導を切る等）
            if (this.barrelRoll.progress >= 1) {
                this.barrelRoll.active = false;
                this.ship.isBarrelRolling = false;
                // クォータニオンは360度回って元に戻るので補正不要
            } else {
                // 1フレームあたりの回転量
                forcedRoll = (Math.PI * 2 / this.barrelRoll.duration) * this.barrelRoll.direction * delta;
                
                // 横方向へのステップ移動（高速移動）
                const localRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.ship.mesh.quaternion);
                const dodgeSpeed = 40 / this.barrelRoll.duration; // 0.4秒間で40移動
                dodgeVelocity.copy(localRight).multiplyScalar(dodgeSpeed * -this.barrelRoll.direction);
            }
        } else {
            this.ship.isBarrelRolling = false;
        }

        // クォータニオンによる回転計算 (ローカル軸)
        const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), applyPitch);
        const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), applyYaw);
        
        // バレルロール中は入力によるロールを無視し、強制ロールを適用
        const r = this.barrelRoll.active ? forcedRoll : this.input.roll * stats.rollSpeed * delta;
        const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), r);
        
        // 回転の合成 (ヨー -> ピッチ -> ロールの順)
        const totalRotation = new THREE.Quaternion();
        totalRotation.multiply(yawQ).multiply(pitchQ).multiply(rollQ);
        
        // ターゲットクォータニオンに適用
        this.targetQuaternion.multiply(totalRotation);
        this.targetQuaternion.normalize();
        
        // 実際の機体姿勢を滑らかに補間 (slerp)
        // バレルロール中は補間なしでダイレクトに回転させる
        if (this.barrelRoll.active) {
            this.ship.mesh.quaternion.copy(this.targetQuaternion);
        } else {
            this.ship.mesh.quaternion.slerp(this.targetQuaternion, 0.2);
        }

        // 適用した分をバッファから減算
        this.input.pitchBuffer -= applyPitch;
        this.input.yawBuffer -= applyYaw;

        // マウスを止めた時にピタッと止まるように、残ったバッファを急速に減衰させる
        if (this.isPointerLocked) {
            this.input.pitchBuffer *= 0.6;
            this.input.yawBuffer *= 0.6;
        } else {
            this.input.pitchBuffer = 0;
            this.input.yawBuffer = 0;
        }
        
        // 機体の移動 (ローカルZ軸のマイナス方向へ進む)
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.ship.mesh.quaternion);
        this.ship.mesh.position.add(forward.multiplyScalar(this.ship.currentSpeed * delta));

        // バレルロールによるステップ移動の適用
        if (this.barrelRoll.active) {
            this.ship.mesh.position.add(dodgeVelocity.multiplyScalar(delta));
        }

        // 吹き飛ばし（ノックバック）の適用と減衰
        this.ship.mesh.position.add(this.impactVelocity.clone().multiplyScalar(delta));
        this.impactVelocity.lerp(new THREE.Vector3(0, 0, 0), 0.05);

        // カメラ追従処理
        this.updateCamera();
    }

    updateCamera() {
        if (this.viewMode === 'TPS') {
            // 機体後方からの視点
            const lookBack = this.input.rearView ? -1 : 1;
            const offset = new THREE.Vector3(0, 3, 12 * lookBack);
            offset.applyQuaternion(this.ship.mesh.quaternion);
            
            // カメラ位置を滑らかに追従
            const targetCamPos = this.ship.mesh.position.clone().add(offset);
            this.camera.position.lerp(targetCamPos, 0.3);
            
            // カメラのUPベクトルを機体に合わせる（ロールに追従）
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.ship.mesh.quaternion);
            this.camera.up.copy(up);
            
            // 注視点
            const lookTarget = this.ship.mesh.position.clone().add(
                new THREE.Vector3(0, 0, -20 * lookBack).applyQuaternion(this.ship.mesh.quaternion)
            );
            this.camera.lookAt(lookTarget);
            
        } else {
            // FPS視点 (コックピット)
            const offset = new THREE.Vector3(0, 0.5, 0); // 機体の少し上
            offset.applyQuaternion(this.ship.mesh.quaternion);
            
            this.camera.position.copy(this.ship.mesh.position).add(offset);
            
            if (this.input.rearView) {
                // 背後を見る
                const rearQuat = this.ship.mesh.quaternion.clone();
                rearQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
                this.camera.quaternion.copy(rearQuat);
            } else {
                this.camera.quaternion.copy(this.ship.mesh.quaternion);
            }
        }

        // 速度に応じたFOV（視野角）の変更によるスピード感の演出（FPS視点では控えめにする）
        const speedRatio = this.ship.currentSpeed / this.ship.stats.maxSpeed;
        const maxFovIncrease = this.viewMode === 'TPS' ? 35 : 5; // コックピット内のUIサイズ変動を抑えるためFPSではほぼ固定
        const targetFov = 75 + (speedRatio * maxFovIncrease);
        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 0.1);
        this.camera.updateProjectionMatrix();
    }
}
