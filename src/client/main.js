import { Engine } from './core/Engine.js';
import { Ship } from './entities/Ship.js';
import { FlightController } from './controls/FlightController.js';
import { Radar } from './ui/Radar.js';
import { HUD } from './ui/HUD.js';

// エントリーポイント
window.onload = () => {
    // 1. エンジン（Three.jsシーン管理）の初期化
    const engine = new Engine('app');
    
    // 2. 自機（Type A）の生成
    const playerShip = new Ship('TYPE_A', 'player', false);
    engine.add(playerShip.mesh);
    
    // 3. 飛行・カメラコントローラーの初期化
    const flightController = new FlightController(playerShip, engine.camera, engine.renderer.domElement);
    engine.addUpdatable(flightController);
    
    // 4. ダミーの敵機を作成
    const enemies = [];
    for (let i = 0; i < 5; i++) {
        const enemy = new Ship('TYPE_C', `enemy_${i}`, true);
        // ランダムな位置（自機の前方周辺）に配置
        enemy.mesh.position.set(
            (Math.random() - 0.5) * 800,
            (Math.random() - 0.5) * 800,
            (Math.random() - 0.5) * 800 - 200
        );
        engine.add(enemy.mesh);
        enemies.push(enemy);
    }
    
    // 5. UI（レーダーとHUD）の初期化
    const radar = new Radar('radar-canvas', playerShip);
    const hud = new HUD('target-markers', engine.camera);
    
    // FPS視点のモニター用に、レーダーのテクスチャを機体に渡す
    playerShip.setRadarTexture(radar.texture);
    
    // UI更新処理をループに追加
    engine.addUpdatable({
        update: () => {
            radar.update(enemies);
            hud.update(enemies, playerShip.mesh.position);
        }
    });
    
    // 6. メインループ開始
    engine.start();
};
