import { io } from 'socket.io-client';
import { config } from '../config.js';

export class NetworkClient {
    constructor(onConnect, onNewPlayer, onPlayerMoved, onPlayerDisconnected, onPlayerShoot) {
        // サーバーへの接続を開始
        this.socket = io(config.SERVER_URL, {
            path: '/airF/socket.io'
        });

        this.socket.on('connect', () => {
            console.log('サーバーに接続しました。ID:', this.socket.id);
            this.socket.emit('join'); // サーバーに正式に参加を通知する
            if (onConnect) onConnect(this.socket.id);
        });

        // 自分が接続した時に、すでにいるプレイヤーのリストを受け取る
        this.socket.on('currentPlayers', (players) => {
            Object.keys(players).forEach(id => {
                if (id !== this.socket.id) {
                    onNewPlayer(players[id]);
                }
            });
        });

        // 自分より後に新しいプレイヤーが参加した時
        this.socket.on('newPlayer', (playerInfo) => {
            onNewPlayer(playerInfo);
        });

        // 他のプレイヤーが動いた時
        this.socket.on('playerMoved', (playerInfo) => {
            onPlayerMoved(playerInfo);
        });

        // 他のプレイヤーが切断した時
        this.socket.on('playerDisconnected', (id) => {
            onPlayerDisconnected(id);
        });

        // 他のプレイヤーが弾を撃った時
        this.socket.on('playerShoot', (data) => {
            if (onPlayerShoot) onPlayerShoot(data);
        });

        // HP更新、撃墜、復活のイベント受信（コールバックは外部から登録可能にする）
        this.socket.on('hpUpdate', (data) => {
            if (this.onHpUpdate) this.onHpUpdate(data);
        });
        this.socket.on('playerDestroyed', (data) => {
            if (this.onPlayerDestroyed) this.onPlayerDestroyed(data);
        });
        this.socket.on('playerRespawn', (data) => {
            if (this.onPlayerRespawn) this.onPlayerRespawn(data);
        });
        this.socket.on('initAsteroids', (data) => {
            if (this.onInitAsteroids) this.onInitAsteroids(data);
        });
        this.socket.on('asteroidDestroyed', (data) => {
            if (this.onAsteroidDestroyed) this.onAsteroidDestroyed(data);
        });
        this.socket.on('asteroidRespawn', (data) => {
            if (this.onAsteroidRespawn) this.onAsteroidRespawn(data);
        });
        this.socket.on('asteroidHpUpdate', (data) => {
            if (this.onAsteroidHpUpdate) this.onAsteroidHpUpdate(data);
        });
        this.socket.on('lockingState', (data) => {
            if (this.onLockingState) this.onLockingState(data);
        });
        this.socket.on('playerNameUpdate', (data) => {
            if (this.onNameUpdate) this.onNameUpdate(data);
        });
        
        // Matchmaking
        this.socket.on('roomListUpdate', (data) => {
            if (this.onRoomListUpdate) this.onRoomListUpdate(data);
        });
        this.socket.on('matchStarted', (data) => {
            if (this.onMatchStarted) this.onMatchStarted(data);
        });
        this.socket.on('matchScoreUpdate', (data) => {
            if (this.onMatchScoreUpdate) this.onMatchScoreUpdate(data);
        });
        this.socket.on('matchEnded', (data) => {
            if (this.onMatchEnded) this.onMatchEnded(data);
        });

        this.socket.on('raceProgressUpdate', (data) => {
            if (this.onRaceProgressUpdate) this.onRaceProgressUpdate(data);
        });

        this.socket.on('returnedToLobby', () => {
            if (this.onReturnedToLobby) this.onReturnedToLobby();
        });
        this.socket.on('returnedToRoomMenu', (roomId) => {
            if (this.onReturnedToRoomMenu) this.onReturnedToRoomMenu(roomId);
        });
        this.socket.on('hostMigrated', (newHostId) => {
            if (this.onHostMigrated) this.onHostMigrated(newHostId);
        });
    }

    // 自機の状態（座標と回転）をサーバーに送信する
    sendMovement(position, quaternion) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('playerMovement', {
                position: { x: position.x, y: position.y, z: position.z },
                quaternion: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }
            });
        }
    }

    // 自分が弾を撃ったことをサーバーに送信する
    sendShoot(position, quaternion, type = 'shoot', targetId = null) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('playerShoot', {
                type: type,
                targetId: targetId,
                position: { x: position.x, y: position.y, z: position.z },
                quaternion: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }
            });
        }
    }

    // 自分の弾が敵に当たったことをサーバーに送信する
    sendHit(targetId, damage, creditId = null) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('playerHit', { targetId, damage, creditId });
        }
    }

    // 小惑星に当たったことをサーバーに送信する
    sendAsteroidHit(asteroidId, damage) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('asteroidHit', { id: asteroidId, damage });
        }
    }

    sendLockingState(targetId, state) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('lockingState', { targetId, state });
        }
    }

    sendName(name) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('playerNameUpdate', { name: name });
        }
    }

    createRoom(name) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('createRoom', { name });
        }
    }

    joinRoom(roomId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('joinRoom', roomId);
        }
    }

    leaveRoom(roomId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('leaveRoom', roomId);
        }
    }

    startMatch(roomId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('startMatch', roomId);
        }
    }

    rematch(roomId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('rematch', roomId);
        }
    }

    returnToRoomMenu(roomId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('returnToRoomMenu', roomId);
        }
    }

    leaveMatch(roomId) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('leaveMatch', roomId);
        }
    }

    changeGameMode(roomId, gameMode) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('changeGameMode', { roomId, gameMode });
        }
    }

    changeTeam(roomId, team) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('changeTeam', { roomId, team });
        }
    }

    passCheckpoint(roomId, cpIndex) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('passCheckpoint', roomId, cpIndex);
        }
    }
}
