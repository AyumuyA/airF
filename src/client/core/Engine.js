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

        // マップ境界（球形グリッド）
        const sphereGeometry = new THREE.SphereGeometry(2000, 32, 32);
        const sphereMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x0044ff, 
            wireframe: true, 
            transparent: true, 
            opacity: 0.15 
        });
        const boundarySphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        this.scene.add(boundarySphere);
        
        // 星屑のパーティクル
        this.createStars();

        // 背景の惑星や銀河
        this.createBackground();

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

    createBackground() {
        // 1. 巨大なガス惑星（土星風）
        const gasGeo = new THREE.SphereGeometry(800, 64, 64);
        const gasMat = new THREE.MeshStandardMaterial({ color: 0x113388, roughness: 0.7, metalness: 0.2 });
        const gasPlanet = new THREE.Mesh(gasGeo, gasMat);
        gasPlanet.position.set(-3000, -1000, -4000);
        this.scene.add(gasPlanet);

        const ringGeo = new THREE.RingGeometry(1000, 1600, 64);
        const ringMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide, transparent: true, opacity: 0.3 });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.copy(gasPlanet.position);
        ringMesh.rotation.x = Math.PI / 2 - 0.2;
        ringMesh.rotation.y = 0.1;
        this.scene.add(ringMesh);

        // 2. 灼熱の巨大恒星
        const starGeo = new THREE.SphereGeometry(1500, 64, 64);
        const starMat = new THREE.MeshBasicMaterial({ color: 0xff5500 });
        const sunMesh = new THREE.Mesh(starGeo, starMat);
        sunMesh.position.set(6000, 2000, -8000);
        this.scene.add(sunMesh);
        
        const sunLight = new THREE.PointLight(0xffaa55, 2.0, 20000);
        sunLight.position.copy(sunMesh.position);
        this.scene.add(sunLight);

        // 3. 小さな氷の惑星
        const iceGeo = new THREE.SphereGeometry(300, 32, 32);
        const iceMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.8 });
        const icePlanet = new THREE.Mesh(iceGeo, iceMat);
        icePlanet.position.set(2500, -2500, 4000);
        this.scene.add(icePlanet);

        // 4. 赤い岩石惑星
        const rockGeo = new THREE.SphereGeometry(500, 32, 32);
        const rockMat = new THREE.MeshStandardMaterial({ color: 0xaa3311, roughness: 0.9, metalness: 0.1 });
        const rockPlanet = new THREE.Mesh(rockGeo, rockMat);
        rockPlanet.position.set(-5000, 3000, 2000);
        this.scene.add(rockPlanet);

        // 5. 背景の巨大な銀河の渦巻き（パーティクル）
        const galaxyGeo = new THREE.BufferGeometry();
        const galaxyCount = 80000;
        const galaxyPositions = new Float32Array(galaxyCount * 3);
        const galaxyColors = new Float32Array(galaxyCount * 3);
        
        const colorCore = new THREE.Color(0xffffee);
        const colorInside = new THREE.Color(0xff77aa);
        const colorOutside = new THREE.Color(0x1155ff);

        for (let i = 0; i < galaxyCount; i++) {
            const i3 = i * 3;
            // 中心に近いほど密度を高くする（指数関数的な減衰）
            const radius = Math.pow(Math.random(), 2.5) * 15000;
            
            // 腕の部分(70%)と、全体に散らばる星(30%)
            const isArm = Math.random() > 0.3;
            let angle = Math.random() * Math.PI * 2;
            
            if (isArm) {
                const spinAngle = radius * 0.0005; 
                const branchAngle = (i % 4) * ((Math.PI * 2) / 4); // 4本の腕
                // 腕から少しばらけさせる
                const angleOffset = (Math.random() - 0.5) * (Math.random() - 0.5) * 2.0;
                angle = branchAngle + spinAngle + angleOffset;
            }

            // 厚みと広がり（中心は厚く、外縁は薄いが広く）
            const scatterX = (Math.random() - 0.5) * (Math.random() - 0.5) * radius * 0.3;
            const scatterY = (Math.random() - 0.5) * (Math.random() - 0.5) * 2000 * Math.exp(-radius / 3000);
            const scatterZ = (Math.random() - 0.5) * (Math.random() - 0.5) * radius * 0.3;

            galaxyPositions[i3]     = Math.cos(angle) * radius + scatterX;
            galaxyPositions[i3 + 1] = scatterY;
            galaxyPositions[i3 + 2] = Math.sin(angle) * radius + scatterZ;

            // 色のブレンド（コア -> 中間 -> 外縁）
            const mixedColor = new THREE.Color();
            const ratio = radius / 15000;
            if (ratio < 0.15) {
                mixedColor.copy(colorCore).lerp(colorInside, ratio / 0.15);
            } else {
                mixedColor.copy(colorInside).lerp(colorOutside, (ratio - 0.15) / 0.85);
            }
            
            // 少しランダムに明るさを変える
            const brightness = 0.5 + Math.random() * 0.5;
            galaxyColors[i3] = mixedColor.r * brightness;
            galaxyColors[i3 + 1] = mixedColor.g * brightness;
            galaxyColors[i3 + 2] = mixedColor.b * brightness;
        }

        galaxyGeo.setAttribute('position', new THREE.BufferAttribute(galaxyPositions, 3));
        galaxyGeo.setAttribute('color', new THREE.BufferAttribute(galaxyColors, 3));

        // 光る星のテクスチャをCanvasで生成
        const starCanvas = document.createElement('canvas');
        starCanvas.width = 32;
        starCanvas.height = 32;
        const ctx = starCanvas.getContext('2d');
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.1, 'rgba(255,255,255,0.8)');
        gradient.addColorStop(0.4, 'rgba(255,255,255,0.2)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
        const starTexture = new THREE.CanvasTexture(starCanvas);

        const galaxyMat = new THREE.PointsMaterial({
            size: 150,
            map: starTexture,
            sizeAttenuation: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true,
            transparent: true,
            opacity: 0.9
        });

        const galaxy = new THREE.Points(galaxyGeo, galaxyMat);
        galaxy.position.set(0, -6000, -3000); 
        galaxy.rotation.x = Math.PI * 0.25;
        galaxy.rotation.z = Math.PI * 0.15;
        this.scene.add(galaxy);
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
