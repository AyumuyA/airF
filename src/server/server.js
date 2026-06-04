import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mapRadius = 2000;
const asteroids = [];
// 小惑星の数を増やす
for (let i = 0; i < 1000; i++) {
    const radius = Math.random() * 30 + 10;
    const isMoving = radius < 20 && Math.random() > 0.5;
    
    const r = Math.pow(Math.random(), 1/3) * (mapRadius - 50);
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    
    // レーザー1発が15ダメージなので、平均60HP程度（約4発）で壊れるように調整
    const asteroidHp = Math.floor(radius * 1.5 + 20);

    asteroids.push({
        id: `ast_${i}`,
        position: { 
            x: r * Math.sin(phi) * Math.cos(theta),
            y: r * Math.sin(phi) * Math.sin(theta),
            z: r * Math.cos(phi)
        },
        velocity: isMoving ? { x: (Math.random() - 0.5) * 100, y: (Math.random() - 0.5) * 100, z: (Math.random() - 0.5) * 100 } : { x: 0, y: 0, z: 0 },
        radius: radius,
        hp: asteroidHp,
        maxHp: asteroidHp
    });
}

function generateRaceCheckpoints() {
    const checkpoints = [];
    const checkpointCount = 8;
    const trackRadius = 1800;
    for (let i = 0; i < checkpointCount; i++) {
        const baseAngle = (i / checkpointCount) * Math.PI * 2;
        let x, y, z;
        if (i === 0) {
            // CP0 is exactly straight ahead from start line
            x = 0; y = 0; z = -trackRadius;
        } else {
            // Randomize radius and height for others
            const r = trackRadius + (Math.random() * 800 - 400); 
            const yOffset = (Math.random() * 1000 - 500); 
            const angle = baseAngle - Math.PI / 2 + (Math.random() * 0.2 - 0.1); 
            x = Math.cos(angle) * r;
            y = yOffset;
            z = Math.sin(angle) * r;
        }
        checkpoints.push({ position: { x, y, z }, radius: 300 });
    }
    return checkpoints;
}

function generateRaceObstacles() {
    const obstacles = [];
    const count = 300; // High density
    for (let i = 0; i < count; i++) {
        const r = 500 + Math.random() * 3000;
        const theta = Math.random() * 2 * Math.PI;
        const yOffset = (Math.random() - 0.5) * 2000;
        
        const typeRand = Math.random();
        let type = 'mine';
        let radius = 20 + Math.random() * 50;
        
        if (typeRand > 0.9) {
            type = 'station';
            radius = 150 + Math.random() * 200;
        } else if (typeRand > 0.75) {
            type = 'ship';
            radius = 100 + Math.random() * 150;
        }

        obstacles.push({
            id: `race_obs_${i}`,
            type: type,
            position: {
                x: r * Math.cos(theta),
                y: yOffset,
                z: r * Math.sin(theta)
            },
            rotation: {
                x: Math.random() * Math.PI,
                y: Math.random() * Math.PI,
                z: Math.random() * Math.PI
            },
            radius: radius
        });
    }
    return obstacles;
}

const app = express();

// ビルドされたフロントエンドファイル（dist）を /airF パスで静的配信する
app.use('/airF', express.static(path.join(__dirname, '../../dist')));
// ルートアクセス時は /airF にリダイレクト
app.get('/', (req, res) => res.redirect('/airF/'));

const httpServer = createServer(app);
const io = new Server(httpServer, { 
    path: '/airF/socket.io',
    cors: { origin: "*", methods: ["GET", "POST"] } 
});

const players = {};
const pendingMatches = {};
const activeMatches = {};

function getPlayersInRoom(roomId) {
    const res = {};
    for (const id in players) {
        if (players[id].roomId === roomId) res[id] = players[id];
    }
    return res;
}

function getRespawnPosition(roomId, excludeId) {
    const roomPlayers = getPlayersInRoom(roomId);
    let bestPos = { x: 0, y: 0, z: 0 };
    for (let attempts = 0; attempts < 10; attempts++) {
        const r = Math.pow(Math.random(), 1/3) * (mapRadius - 100);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const pos = {
            x: r * Math.sin(phi) * Math.cos(theta),
            y: r * Math.sin(phi) * Math.sin(theta),
            z: r * Math.cos(phi)
        };
        
        let minEnemyDist = Infinity;
        for (const pid in roomPlayers) {
            if (pid === excludeId) continue;
            const p = roomPlayers[pid];
            if (p.hp > 0) {
                const dist = Math.hypot(pos.x - p.position.x, pos.y - p.position.y, pos.z - p.position.z);
                if (dist < minEnemyDist) minEnemyDist = dist;
            }
        }
        bestPos = pos;
        if (minEnemyDist > 800) break; // good spawn
    }
    return bestPos;
}



io.on('connection', (socket) => {
    console.log('プレイヤーが接続しました:', socket.id);

    socket.on('join', () => {
        players[socket.id] = {
            id: socket.id,
            position: getRespawnPosition('lobby', socket.id),
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
            hp: 100,
            lastDamagerId: null,
            roomId: 'lobby'
        };
        socket.join('lobby');
        
        socket.emit('currentPlayers', getPlayersInRoom('lobby'));
        socket.broadcast.to('lobby').emit('newPlayer', players[socket.id]);
        socket.emit('initAsteroids', asteroids);
        socket.emit('roomListUpdate', pendingMatches);
    });

    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            players[socket.id].quaternion = data.quaternion;
            socket.broadcast.to(players[socket.id].roomId).emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('playerShoot', (data) => {
        if (players[socket.id]) {
            data.id = socket.id;
            socket.broadcast.to(players[socket.id].roomId).emit('playerShoot', data);
        }
    });

    socket.on('playerHit', (data) => {
        const targetId = data.targetId;
        const shooterId = data.creditId ? data.creditId : socket.id;
        
        if (players[targetId] && players[targetId].hp > 0) {
            const roomId = players[targetId].roomId;
            const match = activeMatches[roomId];
            
            // TDMのフレンドリーファイア防止
            if (match && match.gameMode === 'tdm' && shooterId !== targetId && players[shooterId]) {
                if (match.teams[shooterId] === match.teams[targetId]) {
                    return; // ダメージ無効
                }
            }

            // レースモードの序盤（CP0）はダメージ無効（ゴースト状態）
            if (match && match.gameMode === 'race') {
                const targetProgress = match.raceProgress[targetId];
                const shooterProgress = match.raceProgress[shooterId];
                if ((targetProgress && targetProgress.lap === 1 && targetProgress.currentCheckpoint === 0) ||
                    (shooterProgress && shooterProgress.lap === 1 && shooterProgress.currentCheckpoint === 0)) {
                    return; // ダメージ無効
                }
            }
            
            players[targetId].hp -= data.damage;
            if (players[targetId].hp < 0) players[targetId].hp = 0;
            if (shooterId !== targetId) players[targetId].lastDamagerId = shooterId;
            
            io.to(roomId).emit('hpUpdate', { id: targetId, hp: players[targetId].hp, shooterId: shooterId });
            
            if (players[targetId].hp === 0) {
                let killerId = shooterId;
                if (shooterId === targetId && players[targetId].lastDamagerId) {
                    killerId = players[targetId].lastDamagerId;
                }
                
                io.to(roomId).emit('playerDestroyed', { id: targetId, killerId: killerId });
                players[targetId].lastDamagerId = null;

                if (match && killerId && killerId !== targetId) {
                    match.scores[killerId] = (match.scores[killerId] || 0) + 1;
                    
                    if (match.gameMode === 'tdm') {
                        const team = match.teams[killerId];
                        if (team) {
                            match.teamScores[team] = (match.teamScores[team] || 0) + 1;
                        }
                    }

                    io.to(roomId).emit('matchScoreUpdate', {
                        gameMode: match.gameMode,
                        scores: match.scores,
                        teamScores: match.teamScores
                    });
                    
                    let isWin = false;
                    let winner = killerId;
                    if (match.gameMode === 'tdm') {
                        const team = match.teams[killerId];
                        if (team && match.teamScores[team] >= 10) {
                            isWin = true;
                            winner = team;
                        }
                    } else {
                        if (match.scores[killerId] >= 10) {
                            isWin = true;
                        }
                    }
                    
                    if (isWin) {
                        clearTimeout(match.timer);
                        match.state = 'finished';
                        io.to(roomId).emit('matchEnded', { 
                            winnerId: winner,
                            scores: match.scores,
                            hostId: match.hostId,
                            gameMode: match.gameMode,
                            teamScores: match.teamScores
                        });
                        
                        const roomPlayers = Object.keys(getPlayersInRoom(roomId));
                        pendingMatches[roomId] = {
                            id: roomId,
                            hostId: match.hostId,
                            players: roomPlayers,
                            name: "Finished Match",
                            gameMode: match.gameMode,
                            teams: match.teams
                        };
                        io.emit('roomListUpdate', pendingMatches);
                    }
                }

                setTimeout(() => {
                    if (players[targetId]) {
                        players[targetId].hp = 100;
                        if (match && match.gameMode === 'race' && match.raceProgress && match.raceProgress[targetId]) {
                            const cpIdx = match.raceProgress[targetId].currentCheckpoint;
                            const prevCpIdx = (cpIdx - 1 + match.checkpoints.length) % match.checkpoints.length;
                            const prevCp = match.checkpoints[prevCpIdx];
                            players[targetId].position = { x: prevCp.position.x, y: prevCp.position.y + 50, z: prevCp.position.z };
                        } else {
                            players[targetId].position = getRespawnPosition(roomId, targetId);
                        }
                        io.to(roomId).emit('playerRespawn', players[targetId]);
                    }
                }, 3000);
            }
        }
    });

    socket.on('asteroidHit', (data) => {
        const ast = asteroids.find(a => a.id === data.id);
        const shooterId = socket.id;
        const roomId = players[socket.id] ? players[socket.id].roomId : 'lobby';
        if (ast && ast.hp > 0) {
            ast.hp -= data.damage;
            if (ast.hp < 0) ast.hp = 0;
            io.to(roomId).emit('asteroidHpUpdate', { id: ast.id, hp: ast.hp });

            if (ast.hp === 0) {
                io.to(roomId).emit('asteroidDestroyed', { id: ast.id, position: ast.position, radius: ast.radius, destroyerId: shooterId });
                setTimeout(() => {
                    ast.hp = ast.maxHp;
                    const r = Math.pow(Math.random(), 1/3) * (mapRadius - 50);
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);
                    ast.position = { 
                        x: r * Math.sin(phi) * Math.cos(theta),
                        y: r * Math.sin(phi) * Math.sin(theta),
                        z: r * Math.cos(phi)
                    };
                    io.to(roomId).emit('asteroidRespawn', ast);
                }, 5000);
            } else {
                io.to(roomId).emit('asteroidHpUpdate', { id: ast.id, hp: ast.hp, maxHp: ast.maxHp });
            }
        }
    });

    socket.on('lockingState', (data) => {
        io.to(data.targetId).emit('lockingState', { state: data.state });
    });

    socket.on('playerNameUpdate', (data) => {
        if (players[socket.id]) {
            players[socket.id].playerName = data.name;
            io.emit('playerNameUpdate', { id: socket.id, name: data.name });
            io.emit('roomListUpdate', pendingMatches);
        }
    });

    // Room Management
    socket.on('createRoom', (data) => {
        const roomId = 'room_' + Math.random().toString(36).substr(2, 9);
        pendingMatches[roomId] = {
            id: roomId,
            hostId: socket.id,
            players: [socket.id],
            name: data.name || `${players[socket.id].playerName || 'Pilot'}'s Match`,
            gameMode: 'ffa',
            teams: { [socket.id]: 'auto' }
        };
        io.emit('roomListUpdate', pendingMatches);
    });

    socket.on('joinRoom', (roomId) => {
        if (pendingMatches[roomId] && !pendingMatches[roomId].players.includes(socket.id)) {
            pendingMatches[roomId].players.push(socket.id);
            pendingMatches[roomId].teams[socket.id] = 'auto';
            io.emit('roomListUpdate', pendingMatches);
        }
    });

    socket.on('leaveRoom', (roomId) => {
        if (pendingMatches[roomId]) {
            pendingMatches[roomId].players = pendingMatches[roomId].players.filter(id => id !== socket.id);
            delete pendingMatches[roomId].teams[socket.id];
            if (pendingMatches[roomId].players.length === 0) {
                delete pendingMatches[roomId];
            } else if (pendingMatches[roomId].hostId === socket.id) {
                pendingMatches[roomId].hostId = pendingMatches[roomId].players[0];
            }
            io.emit('roomListUpdate', pendingMatches);
        }
    });

    socket.on('changeGameMode', (data) => {
        const { roomId, gameMode } = data;
        if (pendingMatches[roomId] && pendingMatches[roomId].hostId === socket.id) {
            pendingMatches[roomId].gameMode = gameMode;
            io.emit('roomListUpdate', pendingMatches);
        }
    });

    socket.on('changeTeam', (data) => {
        const { roomId, team } = data; // team: 'red', 'blue', 'auto'
        if (pendingMatches[roomId] && pendingMatches[roomId].players.includes(socket.id)) {
            pendingMatches[roomId].teams[socket.id] = team;
            io.emit('roomListUpdate', pendingMatches);
        }
    });

    socket.on('startMatch', (roomId) => {
        if (pendingMatches[roomId] && pendingMatches[roomId].hostId === socket.id) {
            const matchRoom = pendingMatches[roomId];
            delete pendingMatches[roomId];
            io.emit('roomListUpdate', pendingMatches);

            const finalTeams = {};
            let redCount = 0, blueCount = 0;
            const autoPlayers = [];
            
            matchRoom.players.forEach(pid => {
                if (matchRoom.teams[pid] === 'red') { finalTeams[pid] = 'red'; redCount++; }
                else if (matchRoom.teams[pid] === 'blue') { finalTeams[pid] = 'blue'; blueCount++; }
                else { autoPlayers.push(pid); }
            });
            
            autoPlayers.forEach(pid => {
                if (redCount <= blueCount) { finalTeams[pid] = 'red'; redCount++; }
                else { finalTeams[pid] = 'blue'; blueCount++; }
            });

            activeMatches[roomId] = {
                id: roomId,
                hostId: matchRoom.hostId,
                gameMode: matchRoom.gameMode,
                teams: finalTeams,
                teamScores: { red: 0, blue: 0 },
                scores: {},
                raceProgress: {}, // { pid: { lap: 1, currentCheckpoint: 0 } }
                checkpoints: matchRoom.gameMode === 'race' ? generateRaceCheckpoints() : undefined,
                raceObstacles: matchRoom.gameMode === 'race' ? generateRaceObstacles() : undefined,
                state: 'playing',
                startTime: Date.now()
            };

            matchRoom.players.forEach(pid => {
                const p = players[pid];
                const s = io.sockets.sockets.get(pid);
                if (p && s) {
                    const oldRoom = p.roomId;
                    s.leave(oldRoom);
                    io.to(oldRoom).emit('playerDisconnected', pid);
                    
                    p.roomId = roomId;
                    p.hp = 100;
                    activeMatches[roomId].scores[pid] = 0;
                    if (matchRoom.gameMode === 'race') {
                        activeMatches[roomId].raceProgress[pid] = { lap: 1, currentCheckpoint: 0 };
                    }
                    s.join(roomId);
                }
            });

            const angleStep = (Math.PI * 2) / matchRoom.players.length;
            matchRoom.players.forEach((pid, index) => {
                const p = players[pid];
                if (p) {
                    if (matchRoom.gameMode === 'race') {
                        const spacing = 150;
                        const offset = (index - (matchRoom.players.length - 1) / 2) * spacing;
                        p.position = { x: offset, y: 0, z: -1000 };
                    } else {
                        const angle = index * angleStep;
                        p.position = { x: Math.cos(angle) * 1000, y: 0, z: Math.sin(angle) * 1000 };
                    }
                }
            });

            matchRoom.players.forEach(pid => {
                const s = io.sockets.sockets.get(pid);
                if (s) {
                    s.emit('matchStarted', { 
                        matchId: roomId, 
                        players: getPlayersInRoom(roomId), 
                        timeLimitMs: 5 * 60 * 1000, 
                        countdownMs: matchRoom.gameMode === 'race' ? 5000 : 3000,
                        gameMode: matchRoom.gameMode,
                        teams: finalTeams,
                        checkpoints: activeMatches[roomId].checkpoints,
                        raceObstacles: activeMatches[roomId].raceObstacles
                    });
                }
            });

            activeMatches[roomId].timer = setTimeout(() => {
                if (activeMatches[roomId]) {
                    let maxScore = -1, winnerId = null;
                    const match = activeMatches[roomId];
                    if (match.gameMode === 'tdm') {
                        if (match.teamScores.red > match.teamScores.blue) winnerId = 'red';
                        else if (match.teamScores.blue > match.teamScores.red) winnerId = 'blue';
                        else winnerId = 'draw';
                    } else if (match.gameMode === 'race') {
                        // タイムアップ時は最も進んでいる人を勝者にする
                        let maxProgress = -1;
                        for (const pid in match.raceProgress) {
                            const pData = match.raceProgress[pid];
                            const prog = pData.lap * 100 + pData.currentCheckpoint;
                            if (prog > maxProgress) { maxProgress = prog; winnerId = pid; }
                        }
                    } else {
                        for (const pid in match.scores) {
                            if (match.scores[pid] > maxScore) {
                                maxScore = match.scores[pid];
                                winnerId = pid;
                            }
                        }
                    }
                    match.state = 'finished';
                    io.to(roomId).emit('matchEnded', { 
                        winnerId: winnerId,
                        scores: match.scores,
                        hostId: match.hostId,
                        gameMode: match.gameMode,
                        teamScores: match.teamScores,
                        raceProgress: match.raceProgress
                    });
                    
                    // ロビーに表示させて新しい人が入れるようにする
                    const roomPlayers = Object.keys(getPlayersInRoom(roomId));
                    pendingMatches[roomId] = {
                        id: roomId,
                        hostId: activeMatches[roomId].hostId,
                        players: roomPlayers,
                        name: "Finished Match"
                    };
                    io.emit('roomListUpdate', pendingMatches);
                }
            }, 5 * 60 * 1000 + 3000);
        }
    });

    socket.on('rematch', (roomId) => {
        const match = activeMatches[roomId];
        if (match && match.hostId === socket.id && match.state === 'finished') {
            match.state = 'playing';
            match.scores = {};
            match.startTime = Date.now();
            
            // Result画面中に入ってきたプレイヤー（pendingMatches経由）を物理ルームに引き込む
            if (pendingMatches[roomId]) {
                pendingMatches[roomId].players.forEach(pid => {
                    const p = players[pid];
                    const s = io.sockets.sockets.get(pid);
                    if (p && s && p.roomId !== roomId) {
                        const oldRoom = p.roomId;
                        s.leave(oldRoom);
                        io.to(oldRoom).emit('playerDisconnected', pid);
                        p.roomId = roomId;
                        s.join(roomId);
                    }
                });
                delete pendingMatches[roomId];
                io.emit('roomListUpdate', pendingMatches);
            }
            
            const roomPlayers = Object.keys(getPlayersInRoom(roomId));
            const angleStep = (Math.PI * 2) / roomPlayers.length;
            
            // チームの再割り当て（新規参加者含む）
            let redCount = 0, blueCount = 0;
            const autoPlayers = [];
            roomPlayers.forEach(pid => {
                if (match.teams[pid] === 'red') redCount++;
                else if (match.teams[pid] === 'blue') blueCount++;
                else autoPlayers.push(pid);
            });
            autoPlayers.forEach(pid => {
                if (redCount <= blueCount) { match.teams[pid] = 'red'; redCount++; }
                else { match.teams[pid] = 'blue'; blueCount++; }
            });

            match.teamScores = { red: 0, blue: 0 };
            if (match.gameMode === 'race') {
                match.raceProgress = {};
                match.checkpoints = generateRaceCheckpoints();
            }

            roomPlayers.forEach((pid, index) => {
                const p = players[pid];
                p.hp = 100;
                match.scores[pid] = 0;
                if (match.gameMode === 'race') {
                    match.raceProgress[pid] = { lap: 1, currentCheckpoint: 0 };
                    const spacing = 150;
                    const offset = (index - (roomPlayers.length - 1) / 2) * spacing;
                    p.position = { x: offset, y: 0, z: -1000 };
                } else {
                    const angle = index * angleStep;
                    p.position = { x: Math.cos(angle) * 1000, y: 0, z: Math.sin(angle) * 1000 };
                }
                io.to(roomId).emit('playerRespawn', p);
            });

            match.timer = setTimeout(() => {
                if (activeMatches[roomId]) {
                    let maxScore = -1, winnerId = null;
                    const matchObj = activeMatches[roomId];
                    if (matchObj.gameMode === 'tdm') {
                        if (matchObj.teamScores.red > matchObj.teamScores.blue) winnerId = 'red';
                        else if (matchObj.teamScores.blue > matchObj.teamScores.red) winnerId = 'blue';
                        else winnerId = 'draw';
                    } else if (matchObj.gameMode === 'race') {
                        let maxProgress = -1;
                        for (const pid in matchObj.raceProgress) {
                            const pData = matchObj.raceProgress[pid];
                            const prog = pData.lap * 100 + pData.currentCheckpoint;
                            if (prog > maxProgress) { maxProgress = prog; winnerId = pid; }
                        }
                    } else {
                        for (const pid in matchObj.scores) {
                            if (matchObj.scores[pid] > maxScore) {
                                maxScore = matchObj.scores[pid];
                                winnerId = pid;
                            }
                        }
                    }
                    matchObj.state = 'finished';
                    io.to(roomId).emit('matchEnded', { 
                        winnerId: winnerId,
                        scores: matchObj.scores,
                        hostId: matchObj.hostId,
                        gameMode: matchObj.gameMode,
                        teamScores: matchObj.teamScores,
                        raceProgress: matchObj.raceProgress
                    });
                }
            }, 5 * 60 * 1000 + 3000);
            
            io.to(roomId).emit('matchStarted', { 
                matchId: roomId, 
                players: getPlayersInRoom(roomId), 
                timeLimitMs: 5 * 60 * 1000, 
                countdownMs: match.gameMode === 'race' ? 5000 : 3000,
                gameMode: match.gameMode,
                teams: match.teams,
                checkpoints: match.checkpoints
            });
        }
    });

    socket.on('returnToRoomMenu', (roomId) => {
        const match = activeMatches[roomId];
        if (match && match.hostId === socket.id) {
            let combinedPlayers = Object.keys(getPlayersInRoom(roomId));
            if (pendingMatches[roomId]) {
                pendingMatches[roomId].players.forEach(pid => {
                    if (!combinedPlayers.includes(pid)) combinedPlayers.push(pid);
                });
            }

            pendingMatches[roomId] = {
                id: roomId,
                hostId: match.hostId,
                players: combinedPlayers,
                name: "Rematch Room"
            };
            
            // 物理ルームにいた人をロビーに戻す
            Object.keys(getPlayersInRoom(roomId)).forEach(pid => {
                const p = players[pid];
                const s = io.sockets.sockets.get(pid);
                if (s && p) {
                    s.leave(roomId);
                    p.roomId = 'lobby';
                    p.hp = 100;
                    p.position = getRespawnPosition('lobby', p.id);
                    s.join('lobby');
                    s.broadcast.to('lobby').emit('newPlayer', p);
                    s.emit('currentPlayers', getPlayersInRoom('lobby'));
                    s.emit('returnedToRoomMenu', roomId);
                }
            });
            delete activeMatches[roomId];
            io.emit('roomListUpdate', pendingMatches);
        }
    });

    socket.on('leaveMatch', (roomId) => {
        const p = players[socket.id];
        if (p && p.roomId === roomId && activeMatches[roomId]) {
            socket.leave(roomId);
            p.roomId = 'lobby';
            p.hp = 100;
            p.position = getRespawnPosition('lobby', socket.id);
            socket.join('lobby');
            socket.broadcast.to('lobby').emit('newPlayer', p);
            socket.emit('currentPlayers', getPlayersInRoom('lobby'));
            socket.emit('returnedToLobby');
            
            if (activeMatches[roomId].hostId === socket.id) {
                const remaining = Object.keys(getPlayersInRoom(roomId));
                if (remaining.length > 0) {
                    activeMatches[roomId].hostId = remaining[0];
                    io.to(roomId).emit('hostMigrated', remaining[0]);
                } else {
                    if (activeMatches[roomId].timer) clearTimeout(activeMatches[roomId].timer);
                    delete activeMatches[roomId];
                }
            }
        }
    });

    socket.on('passCheckpoint', (roomId, cpIndex) => {
        const match = activeMatches[roomId];
        if (match && match.state === 'playing' && match.gameMode === 'race') {
            const progress = match.raceProgress[socket.id];
            if (progress && progress.currentCheckpoint === cpIndex) {
                progress.currentCheckpoint++;
                if (progress.currentCheckpoint >= match.checkpoints.length) {
                    progress.currentCheckpoint = 0;
                    progress.lap++;
                }

                // クライアント全員に進行状況をブロードキャスト（UI更新用）
                io.to(roomId).emit('raceProgressUpdate', match.raceProgress);

                // 3ラップ完了で勝利
                if (progress.lap > 3) {
                    match.state = 'finished';
                    if (match.timer) clearTimeout(match.timer);
                    io.to(roomId).emit('matchEnded', { 
                        winnerId: socket.id,
                        scores: match.scores,
                        hostId: match.hostId,
                        gameMode: match.gameMode,
                        teamScores: match.teamScores,
                        raceProgress: match.raceProgress
                    });
                    
                    const roomPlayers = Object.keys(getPlayersInRoom(roomId));
                    pendingMatches[roomId] = {
                        id: roomId,
                        hostId: match.hostId,
                        players: roomPlayers,
                        name: "Finished Race"
                    };
                    io.emit('roomListUpdate', pendingMatches);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('プレイヤーが切断しました:', socket.id);
        if (players[socket.id]) {
            io.to(players[socket.id].roomId).emit('playerDisconnected', socket.id);
            
            for (const roomId in pendingMatches) {
                const room = pendingMatches[roomId];
                if (room.players.includes(socket.id)) {
                    room.players = room.players.filter(id => id !== socket.id);
                    if (room.players.length === 0) delete pendingMatches[roomId];
                    else if (room.hostId === socket.id) room.hostId = room.players[0];
                    io.emit('roomListUpdate', pendingMatches);
                }
            }
            delete players[socket.id];
        }
    });
});

const PORT = process.env.PORT || 55665;
httpServer.listen(PORT, () => { console.log(`WebSocket Server on port ${PORT}`); });
