import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Ship } from './entities/Ship.js';
import { Projectile } from './entities/Projectile.js';
import { Missile } from './entities/Missile.js';
import { Asteroid } from './entities/Asteroid.js';
import { FlightController } from './controls/FlightController.js';
import { Radar } from './ui/Radar.js';
import { HUD } from './ui/HUD.js';
import { NetworkClient } from './network/NetworkClient.js';

// エントリーポイント
window.onload = () => {
    const engine = new Engine('app');
    
    // UI要素の取得
    const menuOverlay = document.getElementById('game-menu');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const playerListUI = document.getElementById('player-list');
    const btnCloseMenu = document.getElementById('btn-close-menu');
    const btnSaveName = document.getElementById('btn-save-name');
    const nameInput = document.getElementById('player-name-input');
    const reticleColorPicker = document.getElementById('reticle-color-picker');
    const crosshair = document.getElementById('crosshair');

    let localPlayerName = "Pilot_" + Math.floor(Math.random() * 1000);
    nameInput.value = localPlayerName;
    
    // 他のプレイヤーやオブジェクトを管理するコレクション
    const remotePlayers = {};
    const enemyListForUI = [];
    const projectiles = []; // 画面上の全ての弾を管理する配列
    const asteroids = new Map(); // 小惑星の管理
    // 名前が被った場合に(1), (2)等を付与してdisplayNameを更新するヘルパー
    function updateDisplayNames() {
        const nameMap = new Map(); // rawName -> [ {id, ship, isLocal} ]
        
        function addName(id, ship, rawName, isLocal) {
            const name = rawName || `Pilot_${id.substring(0, 4)}`;
            if (!nameMap.has(name)) nameMap.set(name, []);
            nameMap.get(name).push({ id, ship, isLocal });
        }
        
        addName(playerShip.id, playerShip, localPlayerName, true);
        for (const rid in remotePlayers) {
            addName(rid, remotePlayers[rid], remotePlayers[rid].playerName, false);
        }
        
        for (const [rawName, playersList] of nameMap.entries()) {
            if (playersList.length === 1) {
                playersList[0].ship.displayName = rawName;
            } else {
                // ソートして(1), (2)を付ける
                playersList.sort((a, b) => a.id.localeCompare(b.id));
                playersList.forEach((p, index) => {
                    p.ship.displayName = index === 0 ? rawName : `${rawName}(${index})`;
                });
            }
        }
    }
    
    // 1. 自機（Type A）の生成
    const playerShip = new Ship('TYPE_A', 'local_player', false);
    playerShip.hp = 100; // 初期HP
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
            network.sendName(localPlayerName); // 接続時に初期の自動生成名を送信
        },
        (playerInfo) => {
            const enemy = new Ship('TYPE_C', playerInfo.id, true);
            enemy.interior.visible = false; // 他人は外観だけ見えれば良い
            enemy.hp = playerInfo.hp !== undefined ? playerInfo.hp : 100;
            enemy.playerName = playerInfo.playerName || `Pilot_${playerInfo.id.substring(0, 4)}`;
            
            enemy.mesh.position.copy(playerInfo.position);
            enemy.mesh.quaternion.copy(playerInfo.quaternion);
            engine.add(enemy.mesh);
            
            remotePlayers[playerInfo.id] = enemy;
            enemyListForUI.push(enemy);
            
            updateDisplayNames();
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
                
                hud.removeTarget(id);
                updateDisplayNames();
                updatePlayerListUI();
            }
        },
        // 他人が射撃した時
        (data) => {
            const remoteShip = remotePlayers[data.id];
            if (remoteShip) {
                // 発射位置と向き
                const pos = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
                const quat = new THREE.Quaternion(data.quaternion.x, data.quaternion.y, data.quaternion.z, data.quaternion.w);
                
                if (data.type === 'missile') {
                    // ミサイルの場合
                    const target = (data.targetId === playerShip.id) ? playerShip : (remotePlayers[data.targetId] || null);
                    const missile = new Missile(pos, quat, data.id, target, 0xff3333);
                    engine.add(missile.mesh);
                    projectiles.push(missile);
                    
                    // 自分へのミサイルかチェック
                    if (data.targetId === playerShip.id) {
                        // 警告のUI更新はループ内（動的）で行うためここではフラグ・音だけ
                    }
                } else {
                    // 通常レーザー
                    const proj = new Projectile(pos, quat, data.id, 0xff3333); // 他人の弾は赤
                    engine.add(proj.mesh);
                    projectiles.push(proj);
                }
            }
        }
    );
    
    // --- 射撃とネットワーク処理 ---
    let missileCooldown = 0;

    // 射撃アクションをコントローラーに登録
    // 通常弾の発射処理（左クリック）
    flightController.onFire = () => {
        if (playerShip.hp <= 0) return; // 撃墜時は撃てない

        const startPos = playerShip.mesh.position.clone();
        // 機体の少し前（Z方向マイナス）をスタート位置にする
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.mesh.quaternion);
        startPos.add(forward.multiplyScalar(3));
        
        // 通常レーザー発射
        const proj = new Projectile(startPos, playerShip.mesh.quaternion, playerShip.id, 0x00ff00);
        engine.add(proj.mesh);
        projectiles.push(proj);
        network.sendShoot(startPos, playerShip.mesh.quaternion, 'laser', null);
    };

    // ミサイルの発射処理
    function fireMissile(target) {
        if (playerShip.hp <= 0 || missileCooldown > 0) return;
        
        const startPos = playerShip.mesh.position.clone();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.mesh.quaternion);
        startPos.add(forward.multiplyScalar(3));

        const missile = new Missile(startPos, playerShip.mesh.quaternion, playerShip.id, target);
        engine.add(missile.mesh);
        projectiles.push(missile);
        
        // サーバーに通知
        network.sendShoot(startPos, playerShip.mesh.quaternion, 'missile', target ? target.id : null);
        
        missileCooldown = 3.0; // 3秒間のクールタイム
    }

    // メニューのUIロジック
    function updatePlayerListUI() {
        playerListUI.innerHTML = '';
        const myLi = document.createElement('li');
        myLi.innerText = `${playerShip.displayName || localPlayerName} (あなた)`;
        myLi.style.color = '#00ffff';
        playerListUI.appendChild(myLi);

        for (const id in remotePlayers) {
            const li = document.createElement('li');
            li.innerText = remotePlayers[id].displayName || remotePlayers[id].playerName || `Pilot_${id.substring(0, 4)}`;
            playerListUI.appendChild(li);
        }
    }

    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === engine.renderer.domElement) {
            menuOverlay.classList.add('hidden');
        } else {
            menuOverlay.classList.remove('hidden');
            updatePlayerListUI();
        }
    });

    btnCloseMenu.addEventListener('click', () => {
        engine.renderer.domElement.requestPointerLock();
    });

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active', 'hidden'));
            tabPanes.forEach(p => p.classList.add('hidden'));

            btn.classList.add('active');
            const target = btn.getAttribute('data-target');
            document.getElementById(target).classList.remove('hidden');
            document.getElementById(target).classList.add('active');
        });
    });

    btnSaveName.addEventListener('click', () => {
        if (nameInput.value.trim() !== '') {
            localPlayerName = nameInput.value.trim();
            network.sendName(localPlayerName);
            btnSaveName.innerText = '保存完了!';
            updateDisplayNames();
            setTimeout(() => { btnSaveName.innerText = '変更'; }, 2000);
            updatePlayerListUI();
        }
    });

    reticleColorPicker.addEventListener('input', (e) => {
        const color = e.target.value;
        crosshair.style.color = color;
    });

    // ネットワーク初期化後の更新
    network.onNameUpdate = (data) => {
        if (remotePlayers[data.id]) {
            remotePlayers[data.id].playerName = data.name;
            updateDisplayNames();
            updatePlayerListUI();
        }
    };
    flightController.onMissileTrigger = (isDown) => {
        if (isDown && flightController.viewMode === 'TPS' && playerShip.hp > 0 && missileCooldown <= 0) {
            // TPSではロックオンがないため正面に無誘導発射
            fireMissile(null);
        }
    };

    // --- ネットワークイベントの受信処理（HP・撃墜・復活） ---
    network.onHpUpdate = (data) => {
        if (data.id === playerShip.id) {
            if (data.hp < playerShip.hp) {
                // ダメージを受けた時にフラッシュ
                const damage = playerShip.hp - data.hp;
                triggerDamageFlash(Math.min(0.8, damage / 50));
            }
            playerShip.hp = data.hp;
            updateLocalHpUI(playerShip.hp);
        } else {
            const enemy = remotePlayers[data.id];
            if (enemy) enemy.hp = data.hp;
        }
    };

    const killLogUI = document.getElementById('kill-log');
    
    function addKillLog(killerName, victimName, isSelfDestruct) {
        const entry = document.createElement('div');
        entry.className = 'kill-entry';
        
        if (isSelfDestruct) {
            entry.innerHTML = `<span class="victim">${victimName}</span> <span class="action">crashed</span>`;
        } else {
            entry.innerHTML = `<span class="killer">${killerName}</span> <span class="action">destroyed</span> <span class="victim">${victimName}</span>`;
        }
        
        killLogUI.appendChild(entry);
        
        // 5秒後にフェードアウトして削除
        setTimeout(() => {
            entry.style.transition = 'opacity 1s';
            entry.style.opacity = '0';
            setTimeout(() => {
                if (entry.parentNode) entry.parentNode.removeChild(entry);
            }, 1000);
        }, 5000);
    }

    network.onPlayerDestroyed = (data) => {
        const pos = data.id === playerShip.id ? playerShip.mesh.position : (remotePlayers[data.id]?.mesh.position);
        if (pos) createExplosion(pos); // 爆発エフェクト

        // キルログの追加
        let victimName = "Unknown";
        if (data.id === playerShip.id) victimName = playerShip.displayName || localPlayerName;
        else if (remotePlayers[data.id]) victimName = remotePlayers[data.id].displayName || remotePlayers[data.id].playerName;

        let killerName = "Unknown";
        if (data.killerId === playerShip.id) killerName = playerShip.displayName || localPlayerName;
        else if (remotePlayers[data.killerId]) killerName = remotePlayers[data.killerId].displayName || remotePlayers[data.killerId].playerName;

        const isSelfDestruct = (data.killerId === data.id);
        addKillLog(killerName, victimName, isSelfDestruct);

        if (data.id === playerShip.id) {
            playerShip.mesh.visible = false; // 撃墜されたら非表示
            updateLocalHpUI(0);
        } else {
            const enemy = remotePlayers[data.id];
            if (enemy) {
                enemy.mesh.visible = false;
            }
        }
    };

    network.onPlayerRespawn = (data) => {
        if (data.id === playerShip.id) {
            playerShip.hp = 100;
            playerShip.mesh.position.copy(data.position);
            playerShip.mesh.visible = true; // 復活
            updateLocalHpUI(100);
            flightController.impactVelocity.set(0,0,0); // リスポーン時にノックバックリセット
        } else {
            const enemy = remotePlayers[data.id];
            if (enemy) {
                enemy.hp = 100;
                enemy.mesh.position.copy(data.position);
                enemy.mesh.visible = true;
            }
        }
    };

    network.onAsteroidDestroyed = (data) => {
        // 小惑星の消去
        const ast = asteroids.get(data.id);
        if (ast) {
            ast.destroy();
            engine.scene.remove(ast.mesh);
            asteroids.delete(data.id);
        }
        
        // 大爆発エフェクト
        createAsteroidExplosion(data.position, data.radius);

        // 爆風ダメージとノックバック計算
        const astPos = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
        const dist = playerShip.mesh.position.distanceTo(astPos);
        const blastRadius = data.radius * 5; // 爆風範囲は小惑星の大きさの5倍
        
        if (dist < blastRadius && playerShip.hp > 0) {
            // 中心に近いほど大ダメージ（最大80ダメージ）
            const damage = Math.floor((1 - (dist / blastRadius)) * 80);
            if (damage > 0) {
                network.sendHit(playerShip.id, damage, data.destroyerId); // 小惑星破壊者のキルにする
                // 爆風で吹き飛ばす
                const pushDir = playerShip.mesh.position.clone().sub(astPos).normalize();
                flightController.applyImpact(pushDir, damage * 5); // ダメージに比例して強烈に吹き飛ぶ
            }
        }
    };

    network.onInitAsteroids = (data) => {
        asteroids.clear();
        data.forEach(astData => {
            const asteroid = new Asteroid(astData);
            engine.add(asteroid.mesh);
            asteroids.set(astData.id, asteroid);
        });
    };

    let isBeingLockedOn = false;
    network.onLockingState = (data) => {
        if (data.state === 'locking') {
            isBeingLockedOn = true;
            missileWarning.innerText = '⚠️ LOCKING ON... ⚠️';
            missileWarning.style.color = 'orange';
            missileWarning.style.display = 'block';
        } else if (data.state === 'locked') {
            isBeingLockedOn = true;
            missileWarning.innerText = '‼️ LOCKED ON ‼️';
            missileWarning.style.color = 'red';
            missileWarning.style.display = 'block';
        } else {
            isBeingLockedOn = false;
            missileWarning.style.display = 'none';
        }
    };

    network.onAsteroidHpUpdate = (data) => {
        const ast = asteroids.get(data.id);
        if (ast) {
            ast.hp = data.hp;
            ast.maxHp = data.maxHp || ast.maxHp;
            ast.showHpBar();
        }
    };

    network.onAsteroidRespawn = (data) => {
        if (!asteroids.has(data.id)) {
            const asteroid = new Asteroid(data);
            engine.add(asteroid.mesh);
            asteroids.set(data.id, asteroid);
        }
    };

    // --- 自機のHPを画面左下に表示するUI ---
    const localHpEl = document.createElement('div');
    localHpEl.style.position = 'absolute';
    localHpEl.style.bottom = '20px';
    localHpEl.style.right = '20px';
    localHpEl.style.color = '#00ffcc';
    localHpEl.style.fontSize = '24px';
    localHpEl.style.fontFamily = 'monospace';
    localHpEl.style.fontWeight = 'bold';
    document.getElementById('ui-container').appendChild(localHpEl);

    function updateLocalHpUI(hp) {
        localHpEl.innerText = `ARMOR: ${hp}%`;
        localHpEl.style.color = hp > 20 ? '#00ffcc' : '#ff3333';
    }
    updateLocalHpUI(playerShip.hp);

    // --- ロックオン・ミサイル警告UI ---
    const lockOnUI = document.createElement('div');
    lockOnUI.style.position = 'absolute';
    lockOnUI.style.border = '2px solid rgba(0, 255, 0, 0.5)';
    lockOnUI.style.width = '80px';
    lockOnUI.style.height = '80px';
    lockOnUI.style.transform = 'translate(-50%, -50%)';
    lockOnUI.style.pointerEvents = 'none';
    lockOnUI.style.display = 'none';
    lockOnUI.style.transition = 'border-color 0.2s, background-color 0.2s';
    document.getElementById('ui-container').appendChild(lockOnUI);

    // --- 仮想ジョイスティック（Shiftキー）UI ---
    const vStickUI = document.createElement('div');
    vStickUI.style.position = 'absolute';
    vStickUI.style.left = '50%';
    vStickUI.style.top = '50%';
    vStickUI.style.width = '150px';
    vStickUI.style.height = '150px';
    vStickUI.style.border = '2px dashed rgba(0, 255, 255, 0.3)';
    vStickUI.style.borderRadius = '50%';
    vStickUI.style.transform = 'translate(-50%, -50%)';
    vStickUI.style.display = 'none';
    vStickUI.style.pointerEvents = 'none';
    
    const vStickCursor = document.createElement('div');
    vStickCursor.style.position = 'absolute';
    vStickCursor.style.left = '50%';
    vStickCursor.style.top = '50%';
    vStickCursor.style.width = '12px';
    vStickCursor.style.height = '12px';
    vStickCursor.style.backgroundColor = '#00ffff';
    vStickCursor.style.borderRadius = '50%';
    vStickCursor.style.transform = 'translate(-50%, -50%)';
    vStickUI.appendChild(vStickCursor);
    document.getElementById('ui-container').appendChild(vStickUI);

    const damageFlash = document.createElement('div');
    damageFlash.style.position = 'absolute';
    damageFlash.style.top = '0';
    damageFlash.style.left = '0';
    damageFlash.style.width = '100vw';
    damageFlash.style.height = '100vh';
    damageFlash.style.backgroundColor = 'rgba(255, 0, 0, 0)';
    damageFlash.style.pointerEvents = 'none';
    damageFlash.style.zIndex = '50';
    damageFlash.style.transition = 'background-color 0.1s ease-out';
    document.body.appendChild(damageFlash);

    function triggerDamageFlash(intensity = 0.4) {
        damageFlash.style.transition = 'none';
        damageFlash.style.backgroundColor = `rgba(255, 0, 0, ${intensity})`;
        void damageFlash.offsetWidth;
        damageFlash.style.transition = 'background-color 0.4s ease-out';
        damageFlash.style.backgroundColor = 'rgba(255, 0, 0, 0)';
    }

    const missileWarning = document.createElement('div');
    missileWarning.innerText = '⚠️ MISSILE ALERT ⚠️';
    missileWarning.style.position = 'absolute';
    missileWarning.style.top = '30%';
    missileWarning.style.left = '50%';
    missileWarning.style.transform = 'translate(-50%, -50%)';
    missileWarning.style.color = 'red';
    missileWarning.style.fontSize = '32px';
    missileWarning.style.fontWeight = 'bold';
    missileWarning.style.fontFamily = 'sans-serif';
    missileWarning.style.textShadow = '0 0 10px red';
    missileWarning.style.display = 'none';
    document.getElementById('ui-container').appendChild(missileWarning);

    // --- ミサイル接近の3D方向（アロー）警告 UI ---
    const missilePointer = document.createElement('div');
    missilePointer.style.position = 'absolute';
    missilePointer.style.width = '0';
    missilePointer.style.height = '0';
    missilePointer.style.borderLeft = '25px solid transparent';
    missilePointer.style.borderRight = '25px solid transparent';
    missilePointer.style.borderBottom = '50px solid red';
    missilePointer.style.transformOrigin = '50% 50%'; // 回転軸を中心に
    missilePointer.style.display = 'none';
    missilePointer.style.pointerEvents = 'none';
    // 発光エフェクト
    missilePointer.style.filter = 'drop-shadow(0 0 10px red)';
    document.getElementById('ui-container').appendChild(missilePointer);

    let lockOnTarget = null;
    let lockOnProgress = 0; // 0 to 1
    const LOCK_ON_TIME = 1.0;

    // --- エフェクト作成関数 ---
    function createHitEffect(pos) {
        const geo = new THREE.SphereGeometry(2, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        engine.add(mesh);
        setTimeout(() => { engine.scene.remove(mesh); }, 100); // 0.1秒で消す
    }

    function createExplosion(pos) {
        const geo = new THREE.SphereGeometry(8, 16, 16);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.8 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        engine.add(mesh);
        
        let scale = 1;
        const interval = setInterval(() => {
            scale += 0.2;
            mesh.scale.set(scale, scale, scale);
            mat.opacity -= 0.05;
            if (mat.opacity <= 0) {
                clearInterval(interval);
                engine.scene.remove(mesh);
            }
        }, 30);
    }

    function createAsteroidExplosion(pos, radius) {
        const geo = new THREE.SphereGeometry(radius, 32, 32);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        engine.add(mesh);
        
        let scale = 1;
        const interval = setInterval(() => {
            scale += 0.25; // 急激に広がる爆風
            mesh.scale.set(scale, scale, scale);
            mat.opacity -= 0.03;
            // 爆発の火炎が徐々に赤黒く冷める演出
            mat.color.lerp(new THREE.Color(0x330000), 0.05);
            if (mat.opacity <= 0) {
                clearInterval(interval);
                engine.scene.remove(mesh);
            }
        }, 30);
    }

    let lastSendTime = 0;
    let collisionCooldown = 0;
    
    // 4. ループ処理に追加
    engine.addUpdatable({
        update: (delta) => {
            const aliveEnemies = enemyListForUI.filter(e => e.hp > 0);
            
            // レーダー更新
            radar.update(aliveEnemies);
            if (playerShip.radarTex) {
                playerShip.radarTex.needsUpdate = true;
            }
            
            hud.update(aliveEnemies, playerShip.mesh.position);
            
            // 自機の位置をサーバーに送信（約30FPSで送信し通信量を抑える）
            const now = performance.now();
            if (now - lastSendTime > 1000 / 30) {
                network.sendMovement(playerShip.mesh.position, playerShip.mesh.quaternion);
                lastSendTime = now;
            }
            
            // 小惑星の更新（回転アニメーションとUI追従）
            asteroids.forEach(ast => ast.update(delta, engine.camera, window.innerWidth, window.innerHeight));

            // ロックオン処理 (FPSモード＆右クリック中のみ＆クールダウンなし)
            if (flightController.viewMode === 'FPS' && flightController.isAiming && playerShip.hp > 0 && missileCooldown <= 0) {
                let bestTarget = null;
                let minScreenDist = 0.2; // 画面の中心から20%以内の範囲
                const halfWidth = window.innerWidth / 2;
                const halfHeight = window.innerHeight / 2;

                for (const enemy of aliveEnemies) {
                    // ロックオン可能距離の制限 (500ユニット以内)
                    const worldDist = playerShip.mesh.position.distanceTo(enemy.mesh.position);
                    if (worldDist > 500) continue;

                    const pos = enemy.mesh.position.clone().project(engine.camera);
                    if (pos.z < 1) { // カメラより前方にいる
                        const dist = Math.sqrt(pos.x*pos.x + pos.y*pos.y);
                        if (dist < minScreenDist) {
                            minScreenDist = dist;
                            bestTarget = enemy;
                        }
                    }
                }

                if (bestTarget) {
                    if (lockOnTarget !== bestTarget) {
                        if (lockOnTarget) network.sendLockingState(lockOnTarget.id, 'none');
                        lockOnTarget = bestTarget;
                        lockOnProgress = 0; // ターゲットが変わったらリセット
                        network.sendLockingState(lockOnTarget.id, 'locking');
                    }
                    const oldProgress = lockOnProgress;
                    lockOnProgress += delta / LOCK_ON_TIME;
                    if (lockOnProgress >= 1 && oldProgress < 1) {
                        lockOnProgress = 1;
                        network.sendLockingState(lockOnTarget.id, 'locked');
                    }

                    // UIの更新
                    lockOnUI.style.display = 'block';
                    const pos = bestTarget.mesh.position.clone().project(engine.camera);
                    lockOnUI.style.left = `${(pos.x * halfWidth) + halfWidth}px`;
                    lockOnUI.style.top = `${-(pos.y * halfHeight) + halfHeight}px`;

                    if (lockOnProgress >= 1) {
                        lockOnUI.style.borderColor = 'red';
                        lockOnUI.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
                        
                        // ロックオン完了で自動発射
                        fireMissile(lockOnTarget);
                        lockOnProgress = 0;
                        if (lockOnTarget) {
                            network.sendLockingState(lockOnTarget.id, 'none');
                        }
                    } else {
                        lockOnUI.style.borderColor = 'rgba(0, 255, 0, 0.5)';
                        lockOnUI.style.backgroundColor = 'transparent';
                        // 枠線を狭めていくアニメーション
                        const size = 120 - (lockOnProgress * 40);
                        lockOnUI.style.width = `${size}px`;
                        lockOnUI.style.height = `${size}px`;
                    }
                } else {
                    if (lockOnTarget) network.sendLockingState(lockOnTarget.id, 'none');
                    lockOnTarget = null;
                    lockOnProgress = 0;
                    lockOnUI.style.display = 'none';
                }
            } else {
                if (lockOnTarget) network.sendLockingState(lockOnTarget.id, 'none');
                lockOnTarget = null;
                lockOnProgress = 0;
                lockOnUI.style.display = 'none';
            }

            // 仮想ジョイスティックUIの更新
            if (flightController.virtualStick.active) {
                vStickUI.style.display = 'block';
                // virtualStick.x/y は -1.5 ~ 1.5 の範囲。半径75pxの円内に収まるようにマッピング
                const xOffset = -(flightController.virtualStick.x / 1.5) * 75; 
                const yOffset = -(flightController.virtualStick.y / 1.5) * 75;
                vStickCursor.style.left = `calc(50% + ${xOffset}px)`;
                vStickCursor.style.top = `calc(50% + ${yOffset}px)`;
            } else {
                vStickUI.style.display = 'none';
            }

            // --- 敵ミサイルの3D方向警告の更新 ---
            let incomingMissile = null;
            for (const p of projectiles) {
                if (p.target && p.target.id === playerShip.id && !p.isDead) {
                    incomingMissile = p;
                    break;
                }
            }

            if (incomingMissile && playerShip.hp > 0) {
                missileWarning.style.display = 'block';
                missilePointer.style.display = 'block';
                
                const mPos = incomingMissile.mesh.position.clone().project(engine.camera);
                if (mPos.z > 1) { 
                    // カメラの後ろにいる場合は座標を反転させて正しいスクリーン方向を求める
                    mPos.x *= -1;
                    mPos.y *= -1;
                    missileWarning.innerText = '⚠️ MISSILE ALERT (BEHIND) ⚠️';
                } else {
                    missileWarning.innerText = '⚠️ MISSILE ALERT ⚠️';
                }
                
                const dx = mPos.x;
                const dy = -mPos.y; // スクリーンYは下が正
                const angleRad = Math.atan2(dy, dx);
                
                const radius = window.innerHeight * 0.35; // 画面高さの35%の円の軌道
                const centerX = window.innerWidth / 2;
                const centerY = window.innerHeight / 2;
                
                const pX = Math.cos(angleRad) * radius + centerX;
                const pY = Math.sin(angleRad) * radius + centerY;
                const angleDeg = angleRad * (180 / Math.PI) + 90; // 上向き(0度)を基準に回転
                
                // アローの中心を合わせるためのオフセット (width:50, height:50 とみなす)
                missilePointer.style.left = `${pX - 25}px`; 
                missilePointer.style.top = `${pY - 25}px`;
                missilePointer.style.transform = `rotate(${angleDeg}deg)`;
            } else {
                if (!isBeingLockedOn) {
                    missileWarning.style.display = 'none';
                }
                missilePointer.style.display = 'none';
            }

            // TPS時のレティクル位置の補正（実際の弾道に合わせる）
            const crosshair = document.getElementById('crosshair');
            if (flightController.viewMode === 'TPS' && crosshair) {
                const aimPoint = playerShip.mesh.position.clone().add(
                    new THREE.Vector3(0, 0, -300).applyQuaternion(playerShip.mesh.quaternion)
                );
                const proj = aimPoint.project(engine.camera);
                if (proj.z < 1) {
                    const x = (proj.x * window.innerWidth / 2) + window.innerWidth / 2;
                    const y = -(proj.y * window.innerHeight / 2) + window.innerHeight / 2;
                    crosshair.style.left = `${x}px`;
                    crosshair.style.top = `${y}px`;
                }
            } else if (crosshair) {
                crosshair.style.left = '50%';
                crosshair.style.top = '50%';
            }

            // ミサイルクールダウンの更新
            if (missileCooldown > 0) {
                missileCooldown -= delta;
                if (missileCooldown < 0) missileCooldown = 0;
            }
            playerShip.updateCockpitUI(playerShip.hp, missileCooldown, playerShip.currentSpeed);

            // 自機の無敵時間（連続激突防止）
            if (collisionCooldown > 0) collisionCooldown -= delta;

            // 機体 vs 小惑星・敵機の激突判定
            if (playerShip.hp > 0 && collisionCooldown <= 0) {
                // 対 小惑星
                asteroids.forEach(ast => {
                    const dist = playerShip.mesh.position.distanceTo(ast.mesh.position);
                    const hitDist = ast.radius + 2; // 機体の半径目安2
                    if (dist < hitDist && collisionCooldown <= 0) {
                        network.sendHit(playerShip.id, 10); // 岩にぶつかると10ダメージ
                        triggerDamageFlash(0.5);
                        const pushDir = playerShip.mesh.position.clone().sub(ast.mesh.position).normalize();
                        flightController.applyImpact(pushDir, 80); // 激しく弾かれる
                        collisionCooldown = 0.5; // 0.5秒間は連続ダメージを受けない
                    }
                });

                // 対 他のプレイヤー
                for (const enemy of aliveEnemies) {
                    const dist = playerShip.mesh.position.distanceTo(enemy.mesh.position);
                    if (dist < 4 && collisionCooldown <= 0) {
                        network.sendHit(playerShip.id, 15); // 衝突で15ダメージ
                        triggerDamageFlash(0.6);
                        const pushDir = playerShip.mesh.position.clone().sub(enemy.mesh.position).normalize();
                        flightController.applyImpact(pushDir, 100);
                        collisionCooldown = 0.5;
                    }
                }
            }

            // 弾の更新処理と当たり判定
            for (let i = projectiles.length - 1; i >= 0; i--) {
                const p = projectiles[i];
                p.update(delta);
                
                let hitTargetPlayer = null;
                let hitTargetAsteroid = null;

                // 当たり判定（自分が撃った弾だけ計算し、サーバーに報告する）
                if (p.ownerId === playerShip.id && !p.isDead) {
                    // 対 敵機
                    for (const enemy of aliveEnemies) {
                        if (p.mesh.position.distanceTo(enemy.mesh.position) < 8) {
                            hitTargetPlayer = enemy;
                            break;
                        }
                    }
                    // 対 小惑星（敵に当たらなかった場合のみ）
                    if (!hitTargetPlayer) {
                        for (const ast of asteroids.values()) {
                            if (p.mesh.position.distanceTo(ast.mesh.position) < ast.radius) {
                                hitTargetAsteroid = ast;
                                break;
                            }
                        }
                    }
                } else if (p.ownerId !== playerShip.id && !p.isDead) {
                    // 他人が撃った弾が自分や小惑星に当たった場合の見た目上の消滅処理（サーバー報告は撃った本人が行うためここでは行わない）
                    if (p.mesh.position.distanceTo(playerShip.mesh.position) < 8) {
                        p.isDead = true;
                        createHitEffect(p.mesh.position);
                    } else {
                        for (const ast of asteroids.values()) {
                            if (p.mesh.position.distanceTo(ast.mesh.position) < ast.radius) {
                                p.isDead = true;
                                createHitEffect(p.mesh.position);
                                break;
                            }
                        }
                    }
                }

                if (hitTargetPlayer) {
                    p.isDead = true;
                    createHitEffect(p.mesh.position);
                    // ダメージを軽減
                    const dmg = p instanceof Missile ? 35 : 10; 
                    network.sendHit(hitTargetPlayer.id, dmg);
                } else if (hitTargetAsteroid) {
                    p.isDead = true;
                    createHitEffect(p.mesh.position);
                    const dmg = p instanceof Missile ? 40 : 10;
                    network.sendAsteroidHit(hitTargetAsteroid.id, dmg);
                }

                if (p.isDead) {
                    engine.scene.remove(p.mesh); // 寿命が来たら画面から消す
                    projectiles.splice(i, 1);
                }
            }
        }
    });
    
    engine.start();
};
