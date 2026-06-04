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

        // 背景の巨大惑星
        this.createPlanet();

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

    createPlanet() {
        // 巨大なガス惑星
        const geo = new THREE.SphereGeometry(800, 64, 64);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x113388, // 深い青色
            roughness: 0.7,
            metalness: 0.2
        });
        const mesh = new THREE.Mesh(geo, mat);
        // 背景として遠く（斜め下）に配置
        mesh.position.set(-2000, -1000, -3000);
        this.scene.add(mesh);

        // 惑星のリング（輪っか）
        const ringGeo = new THREE.RingGeometry(1000, 1600, 64);
        const ringMat = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.3
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.copy(mesh.position);
        ringMesh.rotation.x = Math.PI / 2 - 0.2; // 少し傾ける
        ringMesh.rotation.y = 0.1;
        this.scene.add(ringMesh);
        
        // 惑星専用のライト（美しく照らす）
        const planetLight = new THREE.PointLight(0xffffff, 1.5, 5000);
        planetLight.position.set(-1000, 0, -2000);
        this.scene.add(planetLight);
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
