import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// 小惑星データの初期生成（サーバー側で管理）
const asteroids = [];
for (let i = 0; i < 200; i++) {
    const radius = Math.random() * 30 + 10; // 半径10〜40
    const isMoving = radius < 20 && Math.random() > 0.5; // 小さくて半分の確率で動く
    asteroids.push({
        id: `ast_${i}`,
        position: {
            x: (Math.random() - 0.5) * 3000,
            y: (Math.random() - 0.5) * 3000,
            z: (Math.random() - 0.5) * 3000
        },
        velocity: isMoving ? {
            x: (Math.random() - 0.5) * 100,
            y: (Math.random() - 0.5) * 100,
            z: (Math.random() - 0.5) * 100
        } : { x: 0, y: 0, z: 0 },
        radius: radius,
        hp: Math.floor(radius * 10),
        maxHp: Math.floor(radius * 10)
    });
}

const app = express();
const httpServer = createServer(app);
// Socket.ioの初期化（CORS設定でフロントエンドからの接続を許可）
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 接続している全プレイヤーの情報を保持するメモリデータベース
const players = {};

io.on('connection', (socket) => {
    console.log('プレイヤーが接続しました:', socket.id);

    // 新しいプレイヤーの接続処理
    socket.on('join', () => {
        players[socket.id] = {
            id: socket.id,
            position: { x: 0, y: 0, z: 0 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
            hp: 100,
            lastDamagerId: null
        };

        // 接続してきた本人へ、すでにいる全プレイヤーの情報を送る
        socket.emit('currentPlayers', players);

        // すでにいる他の全員へ、新しいプレイヤーが来たことを知らせる
        socket.broadcast.emit('newPlayer', players[socket.id]);

        // 小惑星帯のデータを送信する
        socket.emit('initAsteroids', asteroids);
    });

    // クライアントからの移動・回転データの受信と共有
    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            players[socket.id].quaternion = data.quaternion;
            // 他の全員に最新状態をブロードキャスト
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // 射撃イベントの共有
    socket.on('playerShoot', (data) => {
        data.id = socket.id;
        socket.broadcast.emit('playerShoot', data);
    });

    // 弾が当たった時の処理（ダメージと撃墜判定）
    socket.on('playerHit', (data) => {
        const targetId = data.targetId;
        const shooterId = data.creditId ? data.creditId : socket.id; // creditIdがあればそれを使う（小惑星爆破など）
        
        if (players[targetId] && players[targetId].hp > 0) {
            players[targetId].hp -= data.damage;
            if (players[targetId].hp < 0) players[targetId].hp = 0;
            
            if (shooterId !== targetId) {
                players[targetId].lastDamagerId = shooterId;
            }
            
            // 全員に現在のHPを通知
            io.emit('hpUpdate', { id: targetId, hp: players[targetId].hp });
            
            // HPが0になったら撃墜イベントを送信
            if (players[targetId].hp === 0) {
                let killerId = shooterId;
                
                // 自滅だが、過去に他プレイヤーからダメージを受けていた場合はそのプレイヤーのキルにする
                if (shooterId === targetId && players[targetId].lastDamagerId) {
                    killerId = players[targetId].lastDamagerId;
                }
                
                io.emit('playerDestroyed', { id: targetId, killerId: killerId });
                players[targetId].lastDamagerId = null; // リセット
                
                // 3秒後にリスポーン（復活）させる
                setTimeout(() => {
                    if (players[targetId]) {
                        players[targetId].hp = 100;
                        players[targetId].position = { 
                            x: (Math.random() - 0.5) * 400, 
                            y: 0, 
                            z: (Math.random() - 0.5) * 400 
                        };
                        io.emit('playerRespawn', players[targetId]);
                    }
                }, 3000);
            }
        }
    });

    // 小惑星へのダメージ処理
    socket.on('asteroidHit', (data) => {
        const ast = asteroids.find(a => a.id === data.id);
        const shooterId = socket.id;
        if (ast && ast.hp > 0) {
            ast.hp -= data.damage;
            if (ast.hp < 0) ast.hp = 0;
            
            // HP更新を全員に通知
            io.emit('asteroidHpUpdate', { id: ast.id, hp: ast.hp });

            if (ast.hp === 0) {
                // 破壊されたら全員に通知
                io.emit('asteroidDestroyed', { 
                    id: ast.id, 
                    position: ast.position, 
                    radius: ast.radius,
                    destroyerId: shooterId
                });

                // 新しい位置でリスポーン（5秒後）
                setTimeout(() => {
                    ast.hp = ast.maxHp;
                    ast.position = {
                        x: (Math.random() - 0.5) * 3000,
                        y: (Math.random() - 0.5) * 3000,
                        z: (Math.random() - 0.5) * 3000
                    };
                    io.emit('asteroidRespawn', ast);
                }, 2000);
            } else {
                io.emit('asteroidHpUpdate', { id: ast.id, hp: ast.hp, maxHp: ast.maxHp });
            }
        }
    });

    // ロックオン状態の通知（狙われている人にだけ送る）
    socket.on('lockingState', (data) => {
        io.to(data.targetId).emit('lockingState', { state: data.state });
    });

    // プレイヤー名の更新
    socket.on('playerNameUpdate', (data) => {
        if (players[socket.id]) {
            players[socket.id].playerName = data.name;
            io.emit('playerNameUpdate', { id: socket.id, name: data.name });
        }
    });

    // 切断時の処理
    socket.on('disconnect', () => {
        console.log('プレイヤーが切断しました:', socket.id);
        delete players[socket.id];
        // 全員に切断を知らせる（画面から消すため）
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
    console.log(`WebSocketサーバーがポート ${PORT} で起動しました。`);
});
