import { Engine } from './core/Engine.js';
import { Ship } from './entities/Ship.js';
import { FlightController } from './controls/FlightController.js';

// エントリーポイント
window.onload = () => {
    // 1. エンジン（Three.jsシーン管理）の初期化
    const engine = new Engine('app');
    
    // 2. 自機（Type A）の生成
    const playerShip = new Ship('TYPE_A');
    engine.add(playerShip.mesh);
    
    // 3. 飛行・カメラコントローラーの初期化
    const flightController = new FlightController(playerShip, engine.camera, engine.renderer.domElement);
    
    // アップデート対象にコントローラーを追加
    engine.addUpdatable(flightController);
    
    // 4. メインループ開始
    engine.start();
};
