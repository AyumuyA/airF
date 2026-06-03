import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Ship } from './entities/Ship.js';
import { Projectile } from './entities/Projectile.js';
import { FlightController } from './controls/FlightController.js';
import { Radar } from './ui/Radar.js';
import { HUD } from './ui/HUD.js';
import { NetworkClient } from './network/NetworkClient.js';

// エントリーポイント
window.onload = () => {
    const engine = new Engine('app');
    
    // 他のプレイヤーを管理するオブジェクトと配列
    const remotePlayers = {};
    const enemyListForUI = [];
    const projectiles = []; // 画面上の全ての弾を管理する配列
    
    // 1. 自機（Type A）の生成
    const playerShip = new Ship('TYPE_A', 'local_player', false);
    engine.add(playerShip.mesh);
    
    const flightController = new FlightController(playerShip, engine.camera, engine.renderer.domElement);
    engine.addUpdatable(flightController);
    
    // 2. UIの初期化
    const radar = new Radar('radar-canvas', playerShip);
    const hud = new HUD('target-markers', engine.camera);
    playerShip.setRadarTexture(radar.texture);
    
    // 3. ネットワーク（マルチプレイ）の初期化
    const network = new NetworkClient(
        // 接続成功時（自分のID確定）
        (id) => {
            playerShip.id = id;
        },
        // 他人が参加した時
        (playerInfo) => {
            const enemy = new Ship('TYPE_C', playerInfo.id, true);
            enemy.interior.visible = false; // 他人は外観だけ見えれば良い
            
            enemy.mesh.position.copy(playerInfo.position);
            enemy.mesh.quaternion.copy(playerInfo.quaternion);
            engine.add(enemy.mesh);
            
            remotePlayers[playerInfo.id] = enemy;
            enemyListForUI.push(enemy);
        },
        // 他人が動いた時
        (playerInfo) => {
            const enemy = remotePlayers[playerInfo.id];
            if (enemy) {
                // 今回はシンプルに直接座標を上書き（今後はlerp補間推奨）
                enemy.mesh.position.copy(playerInfo.position);
                enemy.mesh.quaternion.copy(playerInfo.quaternion);
            }
        },
        // 他人が切断した時
        (id) => {
            const enemy = remotePlayers[id];
            if (enemy) {
                engine.scene.remove(enemy.mesh); // 3D空間から消す
                delete remotePlayers[id];
                
                const index = enemyListForUI.findIndex(e => e.id === id);
                if (index > -1) enemyListForUI.splice(index, 1);
                
                if (hud.markers.has(id)) {
                    hud.markers.get(id).remove();
                    hud.markers.delete(id);
                }
            }
        },
        // 他人が射撃した時
        (shootData) => {
            // 他人が撃った弾を生成してシーンに追加（敵の弾は赤色）
            const proj = new Projectile(shootData.position, shootData.quaternion, shootData.id, 0xff3333);
            engine.add(proj.mesh);
            projectiles.push(proj);
        }
    );

    // 射撃アクションをコントローラーに登録
    flightController.onFire = () => {
        // 自機の機首から弾を発射する位置を計算
        const offset = new THREE.Vector3(0, 0, -3);
        offset.applyQuaternion(playerShip.mesh.quaternion);
        const startPos = playerShip.mesh.position.clone().add(offset);
        
        // 弾を生成（自分の弾は緑色）
        const proj = new Projectile(startPos, playerShip.mesh.quaternion.clone(), playerShip.id, 0x00ff00);
        engine.add(proj.mesh);
        projectiles.push(proj);
        
        // サーバーに射撃したことを通知
        network.sendShoot(startPos, playerShip.mesh.quaternion);
    };

    let lastSendTime = 0;
    
    // 4. ループ処理に追加
    engine.addUpdatable({
        update: (delta) => {
            radar.update(enemyListForUI);
            hud.update(enemyListForUI, playerShip.mesh.position);
            
            // 自機の位置をサーバーに送信（約30FPSで送信し通信量を抑える）
            const now = performance.now();
            if (now - lastSendTime > 1000 / 30) {
                network.sendMovement(playerShip.mesh.position, playerShip.mesh.quaternion);
                lastSendTime = now;
            }
            
            // 弾の更新処理
            for (let i = projectiles.length - 1; i >= 0; i--) {
                const p = projectiles[i];
                p.update(delta);
                if (p.isDead) {
                    engine.scene.remove(p.mesh); // 寿命が来たら画面から消す
                    projectiles.splice(i, 1);
                }
            }
        }
    });
    
    engine.start();
};
