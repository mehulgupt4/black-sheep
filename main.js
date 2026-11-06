// --- Desktop Detection Check ---
function isMobileOrTablet() {
  const userAgentCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const touchTabletCheck = (navigator.maxTouchPoints > 1) && (/Macintosh|iPad/i.test(navigator.userAgent) || window.innerWidth < 1024);
  const smallScreenCheck = window.innerWidth < 768;

  return userAgentCheck || touchTabletCheck || smallScreenCheck;
}

const desktopOnlyScreen = document.getElementById('desktop-only-screen');

if (isMobileOrTablet()) {
  if (desktopOnlyScreen) {
    desktopOnlyScreen.classList.remove('hidden');
  }
} else {
  // --- Persistent Leaderboard State ---
  let currentPlayerName = localStorage.getItem('black_sheep_player_name') || 'Anonymous';

  function getLeaderboard() {
    try {
      return JSON.parse(localStorage.getItem('black_sheep_leaderboard')) || [];
    } catch {
      return [];
    }
  }

  function saveScoreToLeaderboard(name, score) {
    if (!name || score <= 0) return;
    const board = getLeaderboard();
    const existing = board.find((entry) => entry.name.toLowerCase() === name.toLowerCase());

    if (existing) {
      if (score > existing.score) {
        existing.score = score;
      }
    } else {
      board.push({ name, score });
    }

    board.sort((a, b) => b.score - a.score);
    localStorage.setItem('black_sheep_leaderboard', JSON.stringify(board.slice(0, 10)));
    renderCornerLeaderboard();
  }

  function renderCornerLeaderboard() {
    const container = document.getElementById('corner-leaderboard-list');
    if (!container) return;
    const board = getLeaderboard().slice(0, 5);

    if (board.length === 0) {
      container.innerHTML = '<div class="corner-leaderboard-row" style="opacity:0.35;">No runs yet</div>';
      return;
    }

    container.innerHTML = board.map((entry, idx) => {
      const isCurrent = entry.name.toLowerCase() === currentPlayerName.toLowerCase();
      return `
        <div class="corner-leaderboard-row ${isCurrent ? 'current-player' : ''}">
          <span class="corner-leaderboard-rank serif-num">${idx + 1}</span>
          <span class="corner-leaderboard-name serif-num">${entry.name}</span>
          <span class="corner-leaderboard-val serif-num">${entry.score}</span>
        </div>
      `;
    }).join('');
  }

  // --- Audio Sources & Manager ---
  const SOUNDS = {
    dogBark: new Audio('assets/sounds/dog_bark.mp3'),
    dogBite: new Audio('assets/sounds/dog_bite.mp3'),
  };

  let povFrozen = false;
  let biteAudioStarted = false;

  // Freeze the background animation once dog bite audio completes
  SOUNDS.dogBite.addEventListener('ended', () => {
    povFrozen = true;
    damageOverlay.classList.remove('active');
  });

  function playSound(audio) {
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  function stopSound(audio) {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  // --- Scene, Camera, Renderer ---
  const canvas = document.getElementById('game-canvas');
  const scene = new THREE.Scene();

  scene.background = new THREE.Color(0x020308);
  scene.fog = new THREE.FogExp2(0x020308, 0.008);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  const CAM_OFFSET_Y = 12;
  const CAM_OFFSET_Z = 16;
  const CAM_LOOK_OFFSET_Y = 1;

  const START_CAM_Y = 70;
  camera.position.set(0, START_CAM_Y, CAM_OFFSET_Z);
  camera.lookAt(0, START_CAM_Y - (CAM_OFFSET_Y - CAM_LOOK_OFFSET_Y), 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // --- Stars ---
  const starGeometry = new THREE.BufferGeometry();
  const starCount = 1400;
  const starPositions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount * 3; i += 3) {
    starPositions[i] = (Math.random() - 0.5) * 500;
    starPositions[i + 1] = 45 + Math.random() * 150;
    starPositions[i + 2] = (Math.random() - 0.5) * 500;
  }

  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.05,
    transparent: true,
    opacity: 0.9,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  // --- Ground ---
  const FIELD_SIZE = 160;
  const FIELD_BOUNDARY = FIELD_SIZE / 2 - 3;
  const BOUNDARY_MARGIN = 8;

  const textureLoader = new THREE.TextureLoader();
  const grassTexture = textureLoader.load('assets/grass.jpg');
  grassTexture.wrapS = THREE.RepeatWrapping;
  grassTexture.wrapT = THREE.RepeatWrapping;
  grassTexture.repeat.set(32, 32);

  const groundGeo = new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE);
  const groundMat = new THREE.MeshStandardMaterial({
    map: grassTexture,
    roughness: 0.85,
    metalness: 0.1,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Lighting ---
  const nightAmbient = new THREE.AmbientLight(0x0a101d, 0.08);
  scene.add(nightAmbient);

  const centerTarget = new THREE.Object3D();
  centerTarget.position.set(0, 0, 0);
  scene.add(centerTarget);

  const overheadSpotlight = new THREE.SpotLight(
    0xfff5e6,
    3.4,
    130,
    Math.PI / 5.2,
    0.35,
    1.2
  );
  overheadSpotlight.position.set(0, 76, 0);
  overheadSpotlight.target = centerTarget;
  overheadSpotlight.castShadow = true;
  overheadSpotlight.shadow.mapSize.width = 2048;
  overheadSpotlight.shadow.mapSize.height = 2048;
  overheadSpotlight.shadow.camera.near = 10;
  overheadSpotlight.shadow.camera.far = 130;
  overheadSpotlight.shadow.bias = -0.0005;
  scene.add(overheadSpotlight);

  // --- Game Rules & Radii ---
  const FOLLOW_RADIUS = 13.0;
  const BLOWN_RADIUS = 1.5;
  const SHEEP_COUNT = 100;
  const SHEEP_SEPARATION_RADIUS = 2.4;

  let gameState = 'start_screen';

  let currentCameraY = START_CAM_Y;
  const TARGET_CAMERA_Y = CAM_OFFSET_Y;
  let descentProgress = 0;
  const descentDuration = 1.8;

  let countdownSeconds = 3;
  let countdownTimer = 0;

  let cutsceneTimer = 0;
  let detectedSheep = null;
  let camLookTarget = new THREE.Vector3();
  let dogChargeStart = new THREE.Vector3();
  const dogSpeed = 20.0;
  let povLookDirection = new THREE.Vector3();

  let maxFollowed = parseInt(localStorage.getItem('black_sheep_max_followed') || '0', 10);

  function createRadiusRing(radius, color = 0xffffff, opacity = 0.25) {
    const points = [];
    const segments = 64;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(theta) * radius, 0.04, Math.sin(theta) * radius));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(points);
    const ringMat = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity,
    });
    return new THREE.Line(ringGeo, ringMat);
  }

  function createFallbackMesh(color) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1.5),
      new THREE.MeshStandardMaterial({ color })
    );
    mesh.castShadow = true;
    return mesh;
  }

  // --- Player Setup ---
  const player = {
    mesh: new THREE.Group(),
    speed: 11.0,
    rotationSpeed: 12,
  };
  scene.add(player.mesh);

  let playerVisual = createFallbackMesh(0x222222);
  player.mesh.add(playerVisual);

  const followRing = createRadiusRing(FOLLOW_RADIUS, 0xffffff, 0.25);
  const dangerRing = createRadiusRing(BLOWN_RADIUS, 0xffffff, 0.25);
  player.mesh.add(followRing);
  player.mesh.add(dangerRing);

  const gltfLoader = new THREE.GLTFLoader();

  gltfLoader.load(
    'assets/wolf.glb',
    (gltf) => {
      player.mesh.remove(playerVisual);
      playerVisual = gltf.scene;
      playerVisual.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      player.mesh.add(playerVisual);
    },
    undefined,
    (err) => console.warn('Could not load wolf.glb, using fallback box.', err)
  );

  // --- Guard Dog Setup ---
  const dog = {
    mesh: new THREE.Group(),
    visual: null,
  };
  dog.visual = createFallbackMesh(0x8B4513);
  dog.mesh.add(dog.visual);
  dog.mesh.visible = false;
  scene.add(dog.mesh);

  gltfLoader.load(
    'assets/dog.glb',
    (gltf) => {
      dog.mesh.remove(dog.visual);
      dog.visual = gltf.scene;
      dog.visual.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      dog.mesh.add(dog.visual);
    },
    undefined,
    (err) => console.warn('Could not load dog.glb, using fallback box.', err)
  );

  // --- Sheep Setup ---
  const sheepList = [];

  class Sheep {
    constructor(baseModel, index) {
      this.index = index;
      this.mesh = new THREE.Group();
      if (baseModel) {
        this.mesh.add(baseModel.clone());
      } else {
        this.mesh.add(createFallbackMesh(0xffffff));
      }

      this.targetAngle = Math.random() * Math.PI * 2;
      this.state = 'idle';
      this.timer = Math.random() * 3;
      this.moveSpeed = 2.0 + Math.random() * 0.9;
      this.followSpeed = 3.8 + Math.random() * 1.0;
      this.fleeSpeed = 19.0;
      this.fleeDirection = new THREE.Vector3();
      this.rallySpeed = 16.0 + Math.random() * 3.0;

      this.fallVelocity = 0;

      this.hopPhase = Math.random() * Math.PI * 2;
      this.hopFrequency = 9;
      this.hopHeight = 0.45;

      const row = Math.floor(index / 10) + 1;
      const col = (index % 10) - 4.5;
      this.slotBehindOffset = new THREE.Vector2(
        col * 1.8 + (Math.random() - 0.5) * 0.8,
        -row * 2.2 - Math.random() * 1.2
      );

      this.povTargetPos = new THREE.Vector3();
      this.baseAngleToWolf = 0;

      this.dancePhase = Math.random() * Math.PI * 2;
      this.danceSpeed = 12.0 + (this.index % 5) * 2.0;
      this.danceHopPeak = 0.55 + (this.index % 4) * 0.25;
      this.danceStyle = this.index % 3;

      this.resetPosition();
      scene.add(this.mesh);
    }

    resetPosition() {
      this.fallVelocity = 0;
      this.mesh.visible = true;

      if (typeof this.targetAngle !== 'number' || isNaN(this.targetAngle)) {
        this.targetAngle = Math.random() * Math.PI * 2;
      }

      let x = (Math.random() - 0.5) * (FIELD_BOUNDARY * 1.7);
      let z = (Math.random() - 0.5) * (FIELD_BOUNDARY * 1.7);

      const distToCenter = Math.hypot(x, z);
      const minSafeDistance = FOLLOW_RADIUS + 12;
      if (distToCenter < minSafeDistance) {
        const pushAngle = Math.atan2(z, x) || Math.random() * Math.PI * 2;
        x = Math.cos(pushAngle) * (minSafeDistance + Math.random() * 15);
        z = Math.sin(pushAngle) * (minSafeDistance + Math.random() * 15);
      }

      this.mesh.position.set(x, 0, z);
      this.state = 'idle';
      this.mesh.position.y = 0;
      this.mesh.rotation.set(0, this.targetAngle, 0);
    }

    getSeparationVector() {
      const separation = new THREE.Vector2(0, 0);
      for (let i = 0; i < sheepList.length; i++) {
        const other = sheepList[i];
        if (other === this || !other.mesh.visible) continue;

        const diffX = this.mesh.position.x - other.mesh.position.x;
        const diffZ = this.mesh.position.z - other.mesh.position.z;
        const dist = Math.hypot(diffX, diffZ);

        if (dist > 0 && dist < SHEEP_SEPARATION_RADIUS) {
          const force = (SHEEP_SEPARATION_RADIUS - dist) / dist;
          separation.x += diffX * force;
          separation.y += diffZ * force;
        }
      }
      return separation;
    }

    updateFall(delta) {
      this.fallVelocity += 28.0 * delta;
      this.mesh.position.y -= this.fallVelocity * delta;
      this.mesh.rotation.x += 4.0 * delta;
      this.mesh.rotation.z += 5.0 * delta;

      if (this.mesh.position.y < -15.0) {
        this.mesh.visible = false;
      }
    }

    getDynamicFollowSpeed(distToWolf, currentFollowedCount) {
      if (distToWolf <= BLOWN_RADIUS) {
        if (currentFollowedCount <= 10) {
          return 1.8 + Math.random() * 0.6;
        } else if (currentFollowedCount <= 20) {
          return 3.2 + Math.random() * 0.6;
        } else {
          return 4.6 + Math.random() * 0.6;
        }
      }
      return this.followSpeed;
    }

    update(delta) {
      if (this.state === 'falling') {
        this.updateFall(delta);
        return;
      }

      if (gameState !== 'playing' && gameState !== 'start_screen' && gameState !== 'descending' && gameState !== 'countdown') return;

      const dx = player.mesh.position.x - this.mesh.position.x;
      const dz = player.mesh.position.z - this.mesh.position.z;
      const distToWolf = Math.hypot(dx, dz);
      const currentFollowers = sheepList.filter((s) => s.state === 'following').length;

      if (gameState === 'playing') {
        if (distToWolf <= BLOWN_RADIUS) {
          triggerGameOverCutscene(this);
          return;
        }

        if (this.state !== 'following') {
          if (distToWolf <= FOLLOW_RADIUS) {
            this.state = 'following';
            updateHudCounts();
            checkVictoryCondition();
          }
        } else {
          if (distToWolf > FOLLOW_RADIUS) {
            this.state = 'moving';
            this.timer = 3.5 + Math.random() * 3.0;
            const scatterAngle = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 1.2;
            this.targetAngle = scatterAngle;
            updateHudCounts();
          }
        }
      }

      const separation = this.getSeparationVector();

      if (this.state === 'following' && gameState === 'playing') {
        const moveVec = new THREE.Vector2(dx, dz).normalize().addScaledVector(separation, 1.6);
        this.targetAngle = Math.atan2(moveVec.x, moveVec.y) + Math.PI;

        let diff = (this.targetAngle - this.mesh.rotation.y) % (Math.PI * 2);
        if (diff < -Math.PI) diff += Math.PI * 2;
        if (diff > Math.PI) diff -= Math.PI * 2;
        this.mesh.rotation.y += diff * delta * 5.0;

        const dynamicSpeed = this.getDynamicFollowSpeed(distToWolf, currentFollowers);

        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          this.mesh.rotation.y
        );
        this.mesh.position.addScaledVector(forward, dynamicSpeed * delta);

        this.hopPhase += delta * (this.hopFrequency * 1.3);
        this.mesh.position.y = Math.abs(Math.sin(this.hopPhase)) * (this.hopHeight * 1.2);
      } else {
        this.timer -= delta;
        if (this.timer <= 0) {
          if (this.state === 'idle') {
            this.state = 'moving';
            this.timer = 2 + Math.random() * 4;
            this.targetAngle = Math.random() * Math.PI * 2;
          } else {
            this.state = 'idle';
            this.timer = 1.5 + Math.random() * 3.5;
            this.mesh.position.y = 0;
          }
        }

        if (this.state === 'moving') {
          const curX = this.mesh.position.x;
