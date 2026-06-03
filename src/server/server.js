import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

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

    // 新規プレイヤーの初期情報を登録
    players[socket.id] = {
        id: socket.id,
        type: 'TYPE_A', // とりあえず今は固定
        position: { x: 0, y: 0, z: 0 },
        quaternion: { x: 0, y: 0, z: 0, w: 1 }
    };

    // 接続してきた本人へ、すでにいる全プレイヤーの情報を送る
    socket.emit('currentPlayers', players);

    // すでにいる他の全員へ、新しいプレイヤーが来たことを知らせる
    socket.broadcast.emit('newPlayer', players[socket.id]);

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
        // 発射した人のIDを付与して、他の全プレイヤーに中継する
        data.id = socket.id;
        socket.broadcast.emit('playerShoot', data);
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
