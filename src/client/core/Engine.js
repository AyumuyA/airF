import * as THREE from 'three';

export class Engine {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        
        // シーン初期化
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050510); // 宇宙っぽい暗い背景
        
        // カメラ初期化
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
        
        // レンダラー初期化
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);
        
        // 照明
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(100, 200, 50);
        this.scene.add(dirLight);

        // ガイド用のグリッド（宇宙空間の目安として）
        const gridHelper = new THREE.GridHelper(2000, 100, 0x444444, 0x222222);
        gridHelper.position.y = -50;
        this.scene.add(gridHelper);
        
        // 星屑のパーティクル
        this.createStars();

        // リサイズハンドラ
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
        
        this.clock = new THREE.Clock();
        this.updatables = [];
    }

    createStars() {
        const starsGeometry = new THREE.BufferGeometry();
        const starsMaterial = new THREE.PointsMaterial({color: 0xffffff, size: 1.5});
        const starsVertices = [];
        for(let i = 0; i < 2000; i++) {
            const x = THREE.MathUtils.randFloatSpread(4000);
            const y = THREE.MathUtils.randFloatSpread(4000);
            const z = THREE.MathUtils.randFloatSpread(4000);
            starsVertices.push(x, y, z);
        }
        starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
        const starField = new THREE.Points(starsGeometry, starsMaterial);
        this.scene.add(starField);
    }

    add(object) {
        this.scene.add(object);
    }

    addUpdatable(obj) {
        this.updatables.push(obj);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    start() {
        this.renderer.setAnimationLoop(() => {
            const delta = this.clock.getDelta();
            
            // 各オブジェクトの更新
            for (const obj of this.updatables) {
                if (obj.update) obj.update(delta);
            }
            
            this.renderer.render(this.scene, this.camera);
        });
    }
}
