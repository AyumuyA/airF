import { io } from 'socket.io-client';
import { config } from '../config.js';

export class NetworkClient {
    constructor(onConnect, onNewPlayer, onPlayerMoved, onPlayerDisconnected, onPlayerShoot) {
        // サーバーへの接続を開始
        this.socket = io(config.SERVER_URL);

        this.socket.on('connect', () => {
            console.log('サーバーに接続しました。ID:', this.socket.id);
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
    sendShoot(position, quaternion) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('playerShoot', {
                position: { x: position.x, y: position.y, z: position.z },
                quaternion: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }
            });
        }
    }
}
