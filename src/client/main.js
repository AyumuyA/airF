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

    // マッチメイクUI
    const roomListContainer = document.getElementById('room-list-container');
    const roomLobbyContainer = document.getElementById('room-lobby-container');
    const roomListUI = document.getElementById('room-list');
    const roomNameInput = document.getElementById('room-name-input');
    const btnCreateRoom = document.getElementById('btn-create-room');
    const btnLeaveRoom = document.getElementById('btn-leave-room');
    const btnStartMatch = document.getElementById('btn-start-match');
    const roomParticipants = document.getElementById('room-participants');
    const currentRoomName = document.getElementById('current-room-name');
    
    // マッチ中HUD
    const matchHud = document.getElementById('match-hud');
    const matchTimer = document.getElementById('match-timer');
    const matchScoreList = document.getElementById('match-score-list');
    const matchResultScreen = document.getElementById('match-result-screen');
    const matchWinnerName = document.getElementById('match-winner-name');
    const resultScoreList = document.getElementById('result-score-list');
    const hostControls = document.getElementById('host-controls');
    const guestControls = document.getElementById('guest-controls');
    const btnRematch = document.getElementById('btn-rematch');
    const btnChangeRules = document.getElementById('btn-change-rules');
    const btnLeaveMatch = document.getElementById('btn-leave-match');
    const matchCountdownScreen = document.getElementById('match-countdown-screen');
    const matchCountdownText = document.getElementById('match-countdown-text');

    let localPlayerName = "Pilot_" + Math.floor(Math.random() * 1000);
    nameInput.value = localPlayerName;
    
    // マッチメイク状態
    let currentRoomId = null;
    let isHost = false;
    let isMatchActive = false;
    let isCountdown = false;
    let matchEndTime = 0;
    
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

    // --- マッチメイク関連UIイベント ---
    btnCreateRoom.addEventListener('click', () => {
        const name = roomNameInput.value.trim();
        network.createRoom(name);
    });

    btnLeaveRoom.addEventListener('click', () => {
        if (currentRoomId) network.leaveRoom(currentRoomId);
        currentRoomId = null;
        isHost = false;
        roomListContainer.classList.remove('hidden');
        roomLobbyContainer.classList.add('hidden');
    });

    btnStartMatch.addEventListener('click', () => {
        if (currentRoomId && isHost) {
            network.startMatch(currentRoomId);
        }
    });

    btnRematch.addEventListener('click', () => {
        if (currentRoomId && isHost) network.rematch(currentRoomId);
    });

    btnChangeRules.addEventListener('click', () => {
        if (currentRoomId && isHost) network.returnToRoomMenu(currentRoomId);
    });

    btnLeaveMatch.addEventListener('click', () => {
        if (currentRoomId) {
            network.leaveMatch(currentRoomId);
        }
    });

    const gameModeSelect = document.getElementById('game-mode-select');

    gameModeSelect.addEventListener('change', (e) => {
        if (currentRoomId && isHost) {
            network.changeGameMode(currentRoomId, e.target.value);
        }
    });

    // ネットワーク初期化後の更新
    network.onNameUpdate = (data) => {
        if (remotePlayers[data.id]) {
            remotePlayers[data.id].playerName = data.name;
            updateDisplayNames();
            updatePlayerListUI();
        }
    };
    
    // --- ネットワーク受信処理 (Matchmaking) ---
    network.onRoomListUpdate = (pendingMatches) => {
        roomListUI.innerHTML = '';
        
        let myRoom = null;
        for (const roomId in pendingMatches) {
            if (pendingMatches[roomId].players.includes(playerShip.id)) {
                myRoom = pendingMatches[roomId];
                currentRoomId = roomId;
                break;
            }
        }

        if (myRoom) {
            // ルーム待機中
            roomListContainer.classList.add('hidden');
            roomLobbyContainer.classList.remove('hidden');
            currentRoomName.innerText = myRoom.name;
            
            isHost = (myRoom.hostId === playerShip.id);
            if (isHost) {
                btnStartMatch.classList.remove('hidden');
                gameModeSelect.disabled = false;
            } else {
                btnStartMatch.classList.add('hidden');
                gameModeSelect.disabled = true;
            }
            
            gameModeSelect.value = myRoom.gameMode || 'ffa';
            
            roomParticipants.innerHTML = '';
            myRoom.players.forEach(pid => {
                const li = document.createElement('li');
                let pName = "Unknown";
                if (pid === playerShip.id) pName = playerShip.displayName || localPlayerName;
                else if (remotePlayers[pid]) pName = remotePlayers[pid].displayName || remotePlayers[pid].playerName || `Pilot_${pid.substring(0,4)}`;
                
                const nameSpan = document.createElement('span');
                nameSpan.innerText = pid === myRoom.hostId ? `👑 ${pName}` : pName;
                li.appendChild(nameSpan);
                
                if (myRoom.gameMode === 'tdm') {
                    const teamSpan = document.createElement('span');
                    teamSpan.style.marginLeft = '15px';
                    
                    if (pid === playerShip.id) {
                        const select = document.createElement('select');
                        select.innerHTML = `
                            <option value="auto">Auto</option>
                            <option value="red">Red Team</option>
                            <option value="blue">Blue Team</option>
                        `;
                        select.value = myRoom.teams[pid] || 'auto';
                        select.onchange = (e) => network.changeTeam(myRoom.id, e.target.value);
                        teamSpan.appendChild(select);
                    } else {
                        const teamStr = myRoom.teams[pid] || 'auto';
                        teamSpan.innerText = `[${teamStr.toUpperCase()}]`;
                        if (teamStr === 'red') teamSpan.style.color = '#ff4444';
                        else if (teamStr === 'blue') teamSpan.style.color = '#33b5e5';
                    }
                    li.appendChild(teamSpan);
                }
                
                roomParticipants.appendChild(li);
            });
        } else {
            // ロビー
            currentRoomId = null;
            isHost = false;
            roomListContainer.classList.remove('hidden');
            roomLobbyContainer.classList.add('hidden');
            
            for (const roomId in pendingMatches) {
                const room = pendingMatches[roomId];
                const li = document.createElement('li');
                
                const info = document.createElement('span');
                info.innerText = `${room.name} (${room.players.length}人)`;
                li.appendChild(info);
                
                const btn = document.createElement('button');
                btn.className = 'btn-join-room';
                btn.innerText = '参加';
                btn.onclick = () => { network.joinRoom(roomId); };
                li.appendChild(btn);
                
                roomListUI.appendChild(li);
            }
        }
    };
    let currentGameMode = 'ffa';
    let currentTeams = {};
    
    // Racing Mode Globals
    let raceCheckpoints = [];
    let raceCheckpointsMeshes = [];
    let currentRaceProgress = {};
    const raceHud = document.getElementById('race-hud');
    const raceLapText = document.getElementById('race-lap');
    const raceRankText = document.getElementById('race-rank');
    const scoreBoard = document.getElementById('match-scoreboard');
    
    network.onMatchStarted = (data) => {
        isMatchActive = true;
        matchEndTime = Date.now() + data.timeLimitMs + data.countdownMs;
        currentRoomId = data.matchId;
        isCountdown = true;
        
        currentGameMode = data.gameMode || 'ffa';
        currentTeams = data.teams || {};
        
        if (currentGameMode === 'race' && data.checkpoints) {
            playerShip.isRaceMode = true;
            playerShip.stats.maxSpeed = playerShip.originalStats.maxSpeed * 3.0;
            playerShip.stats.acceleration = playerShip.originalStats.acceleration * 2.5;

            raceCheckpoints = data.checkpoints;
            createRaceCheckpoints();
            createRaceObstacles(data.raceObstacles);
            raceHud.classList.remove('hidden');
            scoreBoard.classList.add('hidden');
            
            for (const pid in data.players) {
                currentRaceProgress[pid] = { lap: 1, currentCheckpoint: 0 };
            }
            updateRaceHUD();
        } else {
            playerShip.isRaceMode = false;
            playerShip.stats.maxSpeed = playerShip.originalStats.maxSpeed;
            playerShip.stats.acceleration = playerShip.originalStats.acceleration;

            removeRaceCheckpoints();
            raceHud.classList.add('hidden');
            scoreBoard.classList.remove('hidden');
        }
        
        // UIの切り替え
        menuOverlay.classList.add('hidden');
        matchHud.classList.remove('hidden');
        matchResultScreen.classList.add('hidden');
        matchCountdownScreen.classList.remove('hidden');
        engine.renderer.domElement.requestPointerLock();
        
        flightController.enabled = false;

        // カウントダウン処理
        let count = Math.floor(data.countdownMs / 1000);
        let raceWPressTime = null;
        let raceStartTime = Date.now() + data.countdownMs;
        
        const crosshair = document.getElementById('crosshair');
        const radarCanvas = document.getElementById('radar-canvas');
        const targetMarkers = document.getElementById('target-markers');

        if (currentGameMode === 'race' && count >= 5) {
            matchCountdownText.innerText = "READY";
            matchHud.style.opacity = '0'; // Hide HUD for clear view
            if(crosshair) crosshair.style.opacity = '0';
            if(radarCanvas) radarCanvas.style.opacity = '0';
            if(targetMarkers) targetMarkers.style.opacity = '0';
        } else {
            matchCountdownText.innerText = count;
        }
        matchCountdownText.style.color = "white";

        const raceKeydownHandler = (e) => {
            if ((e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp')) {
                if (isCountdown && !raceWPressTime) {
                    raceWPressTime = Date.now();
                }
            }
        };
        if (currentGameMode === 'race') {
            document.addEventListener('keydown', raceKeydownHandler);
        }

        const countInterval = setInterval(() => {
            count--;
            if (count > 3 && currentGameMode === 'race') {
                matchCountdownText.innerText = "READY";
            } else if (count > 0) {
                if (currentGameMode === 'race' && count === 3) {
                    // Show HUD again
                    matchHud.style.opacity = '1';
                    if(crosshair) crosshair.style.opacity = '1';
                    if(radarCanvas) radarCanvas.style.opacity = '1';
                    if(targetMarkers) targetMarkers.style.opacity = '1';
                }
                matchCountdownText.innerText = count;
            } else if (count === 0) {
                matchCountdownText.innerText = "START!";
                flightController.enabled = true;
                
                if (currentGameMode === 'race') {
                    // Ensure HUD is visible if somehow it was missed
                    matchHud.style.opacity = '1';
                    if(crosshair) crosshair.style.opacity = '1';
                    if(radarCanvas) radarCanvas.style.opacity = '1';
                    if(targetMarkers) targetMarkers.style.opacity = '1';

                    if (raceWPressTime) {
                        const earlyMs = raceStartTime - raceWPressTime;
                        if (earlyMs > 2000) {
                            // 早すぎ＝クラッシュ
                            flightController.enabled = false;
                            playerShip.currentSpeed = 0;
                            matchCountdownText.innerText = "CRASH!";
                            matchCountdownText.style.color = "red";
                            setTimeout(() => { flightController.enabled = true; }, 1500);
                        } else if (earlyMs <= 2000 && earlyMs >= 1500) {
                            // 完璧＝スタートダッシュ
                            playerShip.currentSpeed = 2000;
                            matchCountdownText.innerText = "PERFECT DASH!!";
                            matchCountdownText.style.color = "gold";
                        } else if (earlyMs < 1500 && earlyMs >= 1000) {
                            // 普通のダッシュ
                            playerShip.currentSpeed = 1200;
                            matchCountdownText.innerText = "DASH!";
                            matchCountdownText.style.color = "orange";
                        } else if (earlyMs < 1000 && earlyMs >= 0) {
                            // ミニダッシュ
                            playerShip.currentSpeed = 700;
                            matchCountdownText.innerText = "MINI DASH!";
                            matchCountdownText.style.color = "yellow";
                        }
                    }
                }
            } else {
                clearInterval(countInterval);
                if (currentGameMode === 'race') document.removeEventListener('keydown', raceKeydownHandler);
                matchCountdownScreen.classList.add('hidden');
                isCountdown = false;
            }
        }, 1000);
        
        // ロビーにいた他のプレイヤーを消去
        for (const pid in remotePlayers) {
            engine.scene.remove(remotePlayers[pid].mesh);
        }
        for (let key in remotePlayers) delete remotePlayers[key];
        enemyListForUI.length = 0;
        
        // マッチの初期状態を反映
        for (const pid in data.players) {
            let targetMesh = null;
            if (pid === playerShip.id) {
                playerShip.mesh.position.copy(data.players[pid].position);
                playerShip.hp = 100;
                playerShip.mesh.visible = true;
                targetMesh = playerShip.mesh;
            } else {
                const pInfo = data.players[pid];
                const enemy = new Ship('TYPE_C', pInfo.id, true);
                enemy.interior.visible = false;
                enemy.hp = pInfo.hp;
                enemy.playerName = pInfo.playerName || `Pilot_${pInfo.id.substring(0, 4)}`;
                enemy.mesh.position.copy(pInfo.position);
                enemy.mesh.quaternion.copy(pInfo.quaternion);
                engine.add(enemy.mesh);
                
                remotePlayers[pInfo.id] = enemy;
                enemyListForUI.push(enemy);
                targetMesh = enemy.mesh;
            }
            
            if (currentGameMode === 'race' && raceCheckpointsMeshes.length > 0 && targetMesh) {
                targetMesh.lookAt(new THREE.Vector3(targetMesh.position.x, targetMesh.position.y, targetMesh.position.z - 1000));
            }
            
            if (currentGameMode === 'tdm') {
                const team = currentTeams[pid];
                if (pid !== playerShip.id && remotePlayers[pid]) {
                    remotePlayers[pid].isEnemy = (currentTeams[playerShip.id] !== team);
                    remotePlayers[pid].teamColor = (team === 'red') ? '#ff4444' : '#33b5e5';
                }
                
                if (targetMesh && team) {
                    targetMesh.traverse((child) => {
                        if (child.isMesh && child.material) {
                            child.material = child.material.clone();
                            if (team === 'red') child.material.color.setHex(0xffaaaa);
                            else if (team === 'blue') child.material.color.setHex(0x33b5e5);
                        }
                    });
                }
            } else {
                if (pid !== playerShip.id && remotePlayers[pid]) {
                    remotePlayers[pid].isEnemy = true;
                    remotePlayers[pid].teamColor = null;
                }
            }
        }
        updateDisplayNames();
        updateMatchScoreUI({ scores: {}, gameMode: currentGameMode, teamScores: {red: 0, blue: 0} }); // reset
    };
    
    network.onMatchScoreUpdate = (data) => {
        updateMatchScoreUI(data);
    };
    
    network.onMatchEnded = (data) => {
        isMatchActive = false;
        document.exitPointerLock(); // マウスを使えるようにする
        
        flightController.enabled = false;
        playerShip.currentSpeed = 0;
        
        if (data.gameMode === 'race') {
            removeRaceCheckpoints();
        }

        matchResultScreen.classList.remove('hidden');
        matchHud.classList.add('hidden');
        
        let winnerName = "DRAW";
        if (data.gameMode === 'tdm') {
            if (data.winnerId === 'red') winnerName = "RED TEAM WINS!";
            else if (data.winnerId === 'blue') winnerName = "BLUE TEAM WINS!";
        } else {
            if (data.winnerId === playerShip.id) winnerName = playerShip.displayName || localPlayerName;
            else if (remotePlayers[data.winnerId]) winnerName = remotePlayers[data.winnerId].displayName || remotePlayers[data.winnerId].playerName || `Pilot_${data.winnerId.substring(0,4)}`;
        }
        matchWinnerName.innerText = winnerName;

        // リザルトのスコアリストを作成
        resultScoreList.innerHTML = '';
        if (data.gameMode === 'race' && data.raceProgress) {
            const sorted = Object.keys(data.raceProgress).map(id => {
                const p = data.raceProgress[id];
                return { id, score: p.lap * 100 + p.currentCheckpoint, lap: p.lap, cp: p.currentCheckpoint };
            }).sort((a,b) => b.score - a.score);
            
            sorted.forEach((entry, idx) => {
                const li = document.createElement('li');
                let pName = "Unknown";
                if (entry.id === playerShip.id) pName = playerShip.displayName || localPlayerName;
                else if (remotePlayers[entry.id]) pName = remotePlayers[entry.id].displayName || remotePlayers[entry.id].playerName || `Pilot_${entry.id.substring(0,4)}`;
                
                const totalRings = raceCheckpoints.length * 3;
                const passedRings = Math.min((entry.lap - 1) * raceCheckpoints.length + entry.cp, totalRings);
                li.innerHTML = `<span>${idx + 1}位: ${pName}</span><span>Rings: ${passedRings} / ${totalRings}</span>`;
                if (entry.id === playerShip.id) li.style.color = '#00ffcc';
                resultScoreList.appendChild(li);
            });
        } else if (data.scores) {
            if (data.gameMode === 'tdm' && data.teamScores) {
                const liRed = document.createElement('li');
                liRed.innerHTML = `<span style="color:#ff4444;">RED TEAM</span><span>${data.teamScores.red || 0} Kills</span>`;
                resultScoreList.appendChild(liRed);
                const liBlue = document.createElement('li');
                liBlue.innerHTML = `<span style="color:#33b5e5;">BLUE TEAM</span><span>${data.teamScores.blue || 0} Kills</span>`;
                resultScoreList.appendChild(liBlue);
            }

            const sorted = Object.keys(data.scores).map(id => ({ id, score: data.scores[id] })).sort((a,b) => b.score - a.score);
            sorted.forEach(entry => {
                const li = document.createElement('li');
                let pName = "Unknown";
                if (entry.id === playerShip.id) pName = playerShip.displayName || localPlayerName;
                else if (remotePlayers[entry.id]) pName = remotePlayers[entry.id].displayName || remotePlayers[entry.id].playerName || `Pilot_${entry.id.substring(0,4)}`;
                
                let teamStr = "";
                if (data.gameMode === 'tdm' && currentTeams[entry.id]) {
                    teamStr = ` [${currentTeams[entry.id].toUpperCase()}]`;
                }

                li.innerHTML = `<span>${pName}${teamStr}</span><span>${entry.score} Kills</span>`;
                if (entry.id === playerShip.id) li.style.color = '#00ffcc';
                else if (data.gameMode === 'tdm' && currentTeams[entry.id] === 'red') li.style.color = '#ffaaaa';
                else if (data.gameMode === 'tdm' && currentTeams[entry.id] === 'blue') li.style.color = '#33b5e5';
                
                resultScoreList.appendChild(li);
            });
        }

        // ホスト/ゲストのボタン表示切替
        isHost = (data.hostId === network.socket.id);
        if (isHost) {
            hostControls.classList.remove('hidden');
            guestControls.classList.add('hidden');
        } else {
            hostControls.classList.add('hidden');
            guestControls.classList.remove('hidden');
        }
    };
    
    network.onReturnedToLobby = () => {
        matchResultScreen.classList.add('hidden');
        menuOverlay.classList.remove('hidden');
        isMatchActive = false;
        currentRoomId = null;
        isHost = false;
        
        // delete all players before receiving currentPlayers
        for (const pid in remotePlayers) {
            engine.scene.remove(remotePlayers[pid].mesh);
        }
        for (let key in remotePlayers) delete remotePlayers[key];
        enemyListForUI.length = 0;
    };

    network.onReturnedToRoomMenu = (roomId) => {
        matchResultScreen.classList.add('hidden');
        menuOverlay.classList.remove('hidden');
        isMatchActive = false;
        
        for (const pid in remotePlayers) {
            engine.scene.remove(remotePlayers[pid].mesh);
        }
        for (let key in remotePlayers) delete remotePlayers[key];
        enemyListForUI.length = 0;
        
        // 部屋のメニューに戻る
        roomLobbyContainer.classList.remove('hidden');
        roomListContainer.classList.add('hidden');
        currentRoomName.innerText = "Rematch Room";
    };

    network.onHostMigrated = (newHostId) => {
        if (newHostId === network.socket.id) {
            isHost = true;
            if (!matchResultScreen.classList.contains('hidden')) {
                hostControls.classList.remove('hidden');
                guestControls.classList.add('hidden');
            }
        }
    };
    network.onRaceProgressUpdate = (progressMap) => {
        currentRaceProgress = progressMap;
        updateRaceHUD();
    };

    let raceStartLineMesh = null;
    let raceObstaclesMeshes = [];
    let raceObstaclesData = [];

    function createRaceCheckpoints() {
        removeRaceCheckpoints();
        raceCheckpoints.forEach((cp, index) => {
            const geo = new THREE.TorusGeometry(cp.radius, 15, 16, 64);
            const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.2 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(cp.position);
            
            const nextCp = raceCheckpoints[(index + 1) % raceCheckpoints.length];
            mesh.lookAt(new THREE.Vector3(nextCp.position.x, nextCp.position.y, nextCp.position.z));
            
            engine.add(mesh);
            raceCheckpointsMeshes.push(mesh);
        });
        updateRaceCheckpointColors(0);

        if (!raceStartLineMesh) {
            const lineGeo = new THREE.PlaneGeometry(1200, 50);
            const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
            raceStartLineMesh = new THREE.Mesh(lineGeo, lineMat);
            raceStartLineMesh.position.set(0, -20, -1000);
            raceStartLineMesh.rotation.x = -Math.PI / 2;
            engine.add(raceStartLineMesh);
        }
    }

    function createRaceObstacles(obstacles) {
        if (!obstacles) return;
        raceObstaclesData = obstacles;
        obstacles.forEach(obs => {
            let geo, mat, mesh;
            if (obs.type === 'station') {
                geo = new THREE.TorusGeometry(obs.radius, obs.radius * 0.2, 16, 64);
                // 宇宙ステーションは白やシルバーを基調にし、少し発光させる
                mat = new THREE.MeshStandardMaterial({ 
                    color: 0xffffff, 
                    metalness: 0.9, 
                    roughness: 0.1,
                    emissive: 0x222244,
                    emissiveIntensity: 0.8
                });
                mesh = new THREE.Mesh(geo, mat);
                const hubGeo = new THREE.CylinderGeometry(obs.radius * 0.4, obs.radius * 0.4, obs.radius * 0.6, 16);
                
                // ハブ部分は少し色を変えてカラフルに（青系など）
                const hubMat = new THREE.MeshStandardMaterial({
                    color: 0xaaaaaa,
                    emissive: 0x0088ff,
                    emissiveIntensity: 0.5,
                    metalness: 0.8,
                    roughness: 0.2
                });
                const hubMesh = new THREE.Mesh(hubGeo, hubMat);
                mesh.add(hubMesh);
            } else if (obs.type === 'ship') {
                geo = new THREE.ConeGeometry(obs.radius * 0.4, obs.radius * 2, 32);
                // 宇宙船はビビッドな色（赤、オレンジ、緑など）をランダムに
                const colors = [0xff4444, 0xff8800, 0x44ff44, 0x9933ff, 0xffffff];
                const shipColor = colors[Math.floor(Math.random() * colors.length)];
                mat = new THREE.MeshStandardMaterial({ 
                    color: shipColor, 
                    metalness: 0.9, 
                    roughness: 0.3,
                    emissive: shipColor,
                    emissiveIntensity: 0.3
                });
                mesh = new THREE.Mesh(geo, mat);
                mesh.rotation.x = Math.PI / 2; // Point forward
            } else {
                geo = new THREE.IcosahedronGeometry(obs.radius, 1);
                // 小惑星ではなく「エネルギー機雷」のような見た目にして差別化する
                const mineColors = [0xff00ff, 0x00ffff, 0xffff00, 0x00ff00, 0xff0000];
                const mColor = mineColors[Math.floor(Math.random() * mineColors.length)];
                mat = new THREE.MeshStandardMaterial({ 
                    color: mColor, 
                    roughness: 0.2, 
                    metalness: 0.8,
                    emissive: mColor,
                    emissiveIntensity: 0.6
                });
                mesh = new THREE.Mesh(geo, mat);
            }
            
            mesh.position.copy(obs.position);
            mesh.rotation.set(obs.rotation.x, obs.rotation.y, obs.rotation.z);
            engine.add(mesh);
            raceObstaclesMeshes.push(mesh);
        });
    }

    function removeRaceCheckpoints() {
        raceCheckpointsMeshes.forEach(mesh => engine.scene.remove(mesh));
        raceCheckpointsMeshes = [];
        if (raceStartLineMesh) {
            engine.scene.remove(raceStartLineMesh);
            raceStartLineMesh = null;
        }
        raceObstaclesMeshes.forEach(mesh => engine.scene.remove(mesh));
        raceObstaclesMeshes = [];
        raceObstaclesData = [];
    }

    function updateRaceCheckpointColors(currentIdx) {
        raceCheckpointsMeshes.forEach((mesh, index) => {
            if (index === currentIdx) {
                mesh.material.color.setHex(0x00ff00);
                mesh.material.opacity = 0.8;
                mesh.visible = true;
            } else if (index > currentIdx || (currentIdx === raceCheckpoints.length - 1 && index === 0)) {
                mesh.material.color.setHex(0x0000ff);
                mesh.material.opacity = 0.2;
                mesh.visible = true;
            } else {
                mesh.visible = false;
            }
        });
    }

    function updateRaceHUD() {
        const myProg = currentRaceProgress[playerShip.id];
        if (!myProg) return;

        const totalRings = raceCheckpoints.length * 3;
        const passedRings = (myProg.lap - 1) * raceCheckpoints.length + myProg.currentCheckpoint;
        const displayRing = Math.min(passedRings + 1, totalRings);
        
        raceLapText.innerText = `RING ${displayRing} / ${totalRings}`;

        // 次のCPへの距離を計算してスコアのタイブレークにする
        const myNextCp = raceCheckpoints[myProg.currentCheckpoint % raceCheckpoints.length];
        const myDist = myNextCp ? playerShip.mesh.position.distanceTo(myNextCp.position) : 0;
        let myScore = myProg.lap * 100000 + myProg.currentCheckpoint * 10000 - myDist;

        let rank = 1;
        for (const pid in currentRaceProgress) {
            if (pid !== playerShip.id) {
                const p = currentRaceProgress[pid];
                const pNextCp = raceCheckpoints[p.currentCheckpoint % raceCheckpoints.length];
                let pDist = 0;
                if (remotePlayers[pid] && pNextCp) {
                    pDist = remotePlayers[pid].mesh.position.distanceTo(pNextCp.position);
                }
                const pScore = p.lap * 100000 + p.currentCheckpoint * 10000 - pDist;
                
                if (pScore > myScore) rank++;
            }
        }
        
        let rankStr = rank + "th Place";
        if (rank === 1) rankStr = "1st Place";
        if (rank === 2) rankStr = "2nd Place";
        if (rank === 3) rankStr = "3rd Place";
        
        raceRankText.innerText = rankStr;
        raceRankText.style.color = rank === 1 ? '#ffdd00' : (rank === 2 ? '#cccccc' : '#cc7722');
    }

    function checkRaceProgress() {
        const myProg = currentRaceProgress[playerShip.id];
        if (!myProg) return;
        
        const currentIdx = myProg.currentCheckpoint;
        const cp = raceCheckpoints[currentIdx];
        if (!cp) return;

        const cpPos = new THREE.Vector3(cp.position.x, cp.position.y, cp.position.z);
        const dist = playerShip.mesh.position.distanceTo(cpPos);
        if (dist <= cp.radius) {
            // Passed!
            myProg.currentCheckpoint++;
            if (myProg.currentCheckpoint >= raceCheckpoints.length) {
                myProg.currentCheckpoint = 0;
                myProg.lap++;
            }
            network.passCheckpoint(currentRoomId, currentIdx);
            updateRaceCheckpointColors(myProg.currentCheckpoint);
            updateRaceHUD();
        }
    }
    function updateMatchScoreUI(data) {
        matchScoreList.innerHTML = '';
        const scores = data.scores || {};
        
        if (data.gameMode === 'tdm' && data.teamScores) {
            const liRed = document.createElement('li');
            liRed.innerHTML = `<span style="color:#ff4444;">RED</span><span>${data.teamScores.red || 0} K</span>`;
            matchScoreList.appendChild(liRed);
            const liBlue = document.createElement('li');
            liBlue.innerHTML = `<span style="color:#33b5e5;">BLUE</span><span>${data.teamScores.blue || 0} K</span>`;
            matchScoreList.appendChild(liBlue);
            
            // 区切り線
            const hr = document.createElement('hr');
            hr.style.borderColor = '#555';
            hr.style.margin = '5px 0';
            matchScoreList.appendChild(hr);
        }

        const sorted = Object.keys(scores).map(id => ({ id, score: scores[id] })).sort((a,b) => b.score - a.score);
        sorted.forEach(entry => {
            const li = document.createElement('li');
            let pName = "Unknown";
            if (entry.id === playerShip.id) pName = playerShip.displayName || localPlayerName;
            else if (remotePlayers[entry.id]) pName = remotePlayers[entry.id].displayName || remotePlayers[entry.id].playerName || `Pilot_${entry.id.substring(0,4)}`;
            
            li.innerHTML = `<span>${pName}</span><span>${entry.score} K</span>`;
            if (entry.id === playerShip.id) li.style.color = '#00ffff';
            else if (data.gameMode === 'tdm' && currentTeams[entry.id] === 'red') li.style.color = '#ffaaaa';
            else if (data.gameMode === 'tdm' && currentTeams[entry.id] === 'blue') li.style.color = '#33b5e5';
            
            matchScoreList.appendChild(li);
        });
    }

    flightController.onMissileTrigger = (isDown) => {
        if (isDown && flightController.viewMode === 'TPS' && playerShip.hp > 0 && missileCooldown <= 0) {
            // TPSではロックオンがないため正面に無誘導発射
            fireMissile(null);
        }
    };

    // --- 被弾方向エフェクト ---
    function createDamageIndicator(sourcePos) {
        const dmgPointer = document.createElement('div');
        dmgPointer.style.position = 'absolute';
        dmgPointer.style.width = '0';
        dmgPointer.style.height = '0';
        dmgPointer.style.borderLeft = '30px solid transparent';
        dmgPointer.style.borderRight = '30px solid transparent';
        dmgPointer.style.borderBottom = '60px solid rgba(255, 100, 0, 0.8)';
        dmgPointer.style.transformOrigin = '50% 50%';
        dmgPointer.style.pointerEvents = 'none';
        dmgPointer.style.filter = 'drop-shadow(0 0 15px orange)';
        document.getElementById('ui-container').appendChild(dmgPointer);

        const updateInterval = setInterval(() => {
            const mPos = sourcePos.clone().project(engine.camera);
            if (mPos.z > 1) { 
                mPos.x *= -1;
                mPos.y *= -1;
            }
            const dx = mPos.x;
            const dy = -mPos.y;
            const angleRad = Math.atan2(dy, dx);
            const radius = window.innerHeight * 0.25; 
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            const pX = Math.cos(angleRad) * radius + centerX;
            const pY = Math.sin(angleRad) * radius + centerY;
            const angleDeg = angleRad * (180 / Math.PI) + 90; 
            
            dmgPointer.style.left = `${pX - 30}px`; 
            dmgPointer.style.top = `${pY - 30}px`;
            dmgPointer.style.transform = `rotate(${angleDeg}deg)`;
        }, 16);

        // 1秒かけてフェードアウト
        let opacity = 0.8;
        const fadeInterval = setInterval(() => {
            opacity -= 0.05;
            dmgPointer.style.borderBottomColor = `rgba(255, 100, 0, ${opacity})`;
            if (opacity <= 0) {
                clearInterval(updateInterval);
                clearInterval(fadeInterval);
                dmgPointer.remove();
            }
        }, 50);
    }

    // --- ネットワークイベントの受信処理（HP・撃墜・復活） ---
    network.onHpUpdate = (data) => {
        if (data.id === playerShip.id) {
            if (data.hp < playerShip.hp) {
                // ダメージを受けた時にフラッシュ
                const damage = playerShip.hp - data.hp;
                triggerDamageFlash(Math.min(0.8, damage / 50));
                
                // ダメージ方向インジケータ
                if (data.shooterId && data.shooterId !== playerShip.id && remotePlayers[data.shooterId]) {
                    createDamageIndicator(remotePlayers[data.shooterId].mesh.position);
                }
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
            flightController.enabled = false;
            playerShip.currentSpeed = 0;
        } else {
            const enemy = remotePlayers[data.id];
            if (enemy) {
                enemy.mesh.visible = false;
            }
        }
    };

    network.onPlayerRespawn = (data) => {
        let targetMesh = null;
        if (data.id === playerShip.id) {
            playerShip.hp = 100;
            playerShip.mesh.position.copy(data.position);
            playerShip.mesh.visible = true; // 復活
            updateLocalHpUI(100);
            flightController.impactVelocity.set(0,0,0); // リスポーン時にノックバックリセット
            
            // レース開始前などカウントダウン中でなければ有効化
            if (isMatchActive && !isCountdown) {
                flightController.enabled = true;
            }
            
            targetMesh = playerShip.mesh;
        } else {
            const enemy = remotePlayers[data.id];
            if (enemy) {
                enemy.hp = 100;
                enemy.mesh.position.copy(data.position);
                enemy.mesh.visible = true;
                targetMesh = enemy.mesh;
            }
        }

        if (currentGameMode === 'race' && targetMesh) {
            const currentIdx = currentRaceProgress[data.id] ? currentRaceProgress[data.id].currentCheckpoint : 0;
            if (raceCheckpointsMeshes[currentIdx]) {
                targetMesh.lookAt(raceCheckpointsMeshes[currentIdx].position);
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
            if (isMatchActive) {
                const remaining = Math.max(0, matchEndTime - Date.now());
                const m = Math.floor(remaining / 60000);
                const s = Math.floor((remaining % 60000) / 1000);
                matchTimer.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }

            const aliveEnemies = enemyListForUI.filter(e => e.hp > 0);
            
            // レーダー更新
            const radarTargets = [...aliveEnemies];
            if (currentGameMode === 'race' && currentRaceProgress[playerShip.id]) {
                const currentIdx = currentRaceProgress[playerShip.id].currentCheckpoint;
                if (raceCheckpointsMeshes[currentIdx]) {
                    radarTargets.push({
                        mesh: raceCheckpointsMeshes[currentIdx],
                        isEnemy: false,
                        teamColor: '#00ff00' // green checkpoint
                    });
                }
            }
            radar.update(radarTargets);
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

            // マップの境界制限 (半径2000の球) - レースモード時は解除
            if (currentGameMode !== 'race') {
                const dist = playerShip.mesh.position.length();
                if (dist > 2000) {
                    playerShip.mesh.position.normalize().multiplyScalar(2000);
                    // ぶつかったら速度を0にする
                    playerShip.currentSpeed = 0;
                }
            }

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

            if (currentGameMode === 'race' && isMatchActive && !isCountdown && playerShip.hp > 0) {
                checkRaceProgress();
            }

            // レースモードでの序盤の無敵状態判定
            const isPlayerGhost = (pid) => {
                if (currentGameMode !== 'race' || !currentRaceProgress[pid]) return false;
                const prog = currentRaceProgress[pid];
                return prog.lap === 1 && prog.currentCheckpoint === 0;
            };
            const isLocalGhost = isPlayerGhost(playerShip.id);

            // 機体 vs 小惑星・敵機の激突判定
            if (playerShip.hp > 0 && collisionCooldown <= 0 && !isLocalGhost) {
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
                    if (isPlayerGhost(enemy.id)) continue;
                    const dist = playerShip.mesh.position.distanceTo(enemy.mesh.position);
                    if (dist < 4 && collisionCooldown <= 0) {
                        network.sendHit(playerShip.id, 15); // 衝突で15ダメージ
                        triggerDamageFlash(0.6);
                        const pushDir = playerShip.mesh.position.clone().sub(enemy.mesh.position).normalize();
                        flightController.applyImpact(pushDir, 100);
                        collisionCooldown = 0.5;
                    }
                }

                // 対 レース専用障害物
                if (currentGameMode === 'race' && raceObstaclesData && raceObstaclesData.length > 0) {
                    for (const obs of raceObstaclesData) {
                        let hitDist = obs.radius + 2;
                        // 当たり判定を種類によって緩和する
                        if (obs.type === 'station') hitDist = obs.radius * 0.4; // 巨大リングはすり抜け可能にし、中心ハブのみ当たるように
                        else if (obs.type === 'ship') hitDist = obs.radius * 0.5; // 細長いので判定を半減
                        else hitDist = obs.radius * 0.8; // 小惑星も少しだけ判定を甘くして疾走感を損なわないように
                        const dx = playerShip.mesh.position.x - obs.position.x;
                        const dy = playerShip.mesh.position.y - obs.position.y;
                        const dz = playerShip.mesh.position.z - obs.position.z;
                        const distSq = dx*dx + dy*dy + dz*dz;
                        if (distSq < hitDist * hitDist && collisionCooldown <= 0) {
                            network.sendHit(playerShip.id, 20); // レース障害物は20ダメージ
                            triggerDamageFlash(0.8);
                            const obsPos = new THREE.Vector3(obs.position.x, obs.position.y, obs.position.z);
                            const pushDir = playerShip.mesh.position.clone().sub(obsPos).normalize();
                            flightController.applyImpact(pushDir, 150); // 激しく弾かれる
                            collisionCooldown = 0.5;
                            break;
                        }
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
                        if (isPlayerGhost(enemy.id)) continue;
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
                    if (!isLocalGhost && p.mesh.position.distanceTo(playerShip.mesh.position) < 8) {
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
