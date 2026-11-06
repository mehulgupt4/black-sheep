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

  // --- Title Video Animation & Random Freeze Loop ---
  const titleVideo = document.getElementById('title-video');
  let titleLoopTimeout = null;

  function initTitleVideo() {
    if (!titleVideo) return;
    titleVideo.muted = false;
    titleVideo.volume = 1.0;

    titleVideo.play().catch(() => {
      titleVideo.muted = true;
      titleVideo.play().catch(() => {});
      const enableAudioOnUserGesture = () => {
        titleVideo.muted = false;
        titleVideo.volume = 1.0;
        window.removeEventListener('pointerdown', enableAudioOnUserGesture);
        window.removeEventListener('keydown', enableAudioOnUserGesture);
      };
      window.addEventListener('pointerdown', enableAudioOnUserGesture);
      window.addEventListener('keydown', enableAudioOnUserGesture);
    });

    titleVideo.addEventListener('ended', () => {
      if (titleLoopTimeout) clearTimeout(titleLoopTimeout);

      const delay = 2000 + Math.random() * 3000;
      titleLoopTimeout = setTimeout(() => {
        if (gameState === 'start_screen') {
          titleVideo.currentTime = 0;
          titleVideo.play().catch(() => {});
        }
      }, delay);
    });
  }
  initTitleVideo();

  function stopTitleVideo() {
    if (titleLoopTimeout) {
      clearTimeout(titleLoopTimeout);
      titleLoopTimeout = null;
    }
    if (titleVideo) {
      titleVideo.pause();
    }
  }

  function resumeTitleVideo() {
    if (!titleVideo) return;
    titleVideo.currentTime = 0;
    titleVideo.muted = false;
    titleVideo.volume = 1.0;
    titleVideo.play().catch(() => {});
  }

  // --- Audio Sources & Manager ---
  const SOUNDS = {
    dogBark: new Audio('assets/sounds/dog_bark.mp3'),
    dogBite: new Audio('assets/sounds/dog_bite.mp3'),
  };

  let povFrozen = false;
  let biteAudioStarted = false;
  let biteFadeInterval = null;

  SOUNDS.dogBite.addEventListener('ended', () => {
    povFrozen = true;
    damageOverlay.classList.remove('active');
  });

  function playSound(audio) {
    if (!audio) return;
    audio.currentTime = 0;
    audio.volume = 1.0;
    audio.play().catch(() => {});
  }

  function fadeInSound(audio, duration = 1.5, targetVolume = 1.0) {
    if (!audio) return;
    if (biteFadeInterval) {
      clearInterval(biteFadeInterval);
      biteFadeInterval = null;
    }

    audio.currentTime = 0;
    audio.volume = 0.0;
    audio.play().catch(() => {});

    const stepMs = 50;
    const totalSteps = (duration * 1000) / stepMs;
    const volumeStep = targetVolume / totalSteps;

    biteFadeInterval = setInterval(() => {
      if (audio.volume + volumeStep >= targetVolume) {
        audio.volume = targetVolume;
        clearInterval(biteFadeInterval);
        biteFadeInterval = null;
      } else {
        audio.volume = Math.min(targetVolume, audio.volume + volumeStep);
      }
    }, stepMs);
  }

  function stopSound(audio) {
    if (!audio) return;
    if (audio === SOUNDS.dogBite && biteFadeInterval) {
      clearInterval(biteFadeInterval);
      biteFadeInterval = null;
    }
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1.0;
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
          const curZ = this.mesh.position.z;
          const maxDistance = FIELD_BOUNDARY - BOUNDARY_MARGIN;

          if (Math.abs(curX) > maxDistance || Math.abs(curZ) > maxDistance) {
            this.targetAngle = Math.atan2(-curX, -curZ) + Math.PI;
          } else if (separation.lengthSq() > 0.01) {
            const roamDir = new THREE.Vector2(
              -Math.sin(this.targetAngle),
              -Math.cos(this.targetAngle)
            ).addScaledVector(separation, 1.2);
            this.targetAngle = Math.atan2(-roamDir.x, -roamDir.y);
          }

          let diff = (this.targetAngle - this.mesh.rotation.y) % (Math.PI * 2);
          if (diff < -Math.PI) diff += Math.PI * 2;
          if (diff > Math.PI) diff -= Math.PI * 2;
          this.mesh.rotation.y += diff * delta * 3.5;

          const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            this.mesh.rotation.y
          );
          this.mesh.position.addScaledVector(forward, this.moveSpeed * delta);

          this.hopPhase += delta * this.hopFrequency;
          this.mesh.position.y = Math.abs(Math.sin(this.hopPhase)) * this.hopHeight;
        } else {
          this.mesh.position.y = THREE.MathUtils.lerp(this.mesh.position.y, 0, delta * 8);
        }
      }

      this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -FIELD_BOUNDARY, FIELD_BOUNDARY);
      this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -FIELD_BOUNDARY, FIELD_BOUNDARY);
    }

    faceWolf() {
      const toWolf = new THREE.Vector3().subVectors(player.mesh.position, this.mesh.position);
      this.targetAngle = Math.atan2(toWolf.x, toWolf.z) + Math.PI;
      this.mesh.rotation.set(0, this.targetAngle, 0);
    }

    initFleeStraight() {
      const dx = this.mesh.position.x - player.mesh.position.x;
      const dz = this.mesh.position.z - player.mesh.position.z;
      this.fleeDirection.set(dx, 0, dz).normalize();
      this.targetAngle = Math.atan2(this.fleeDirection.x, this.fleeDirection.z) + Math.PI;
      this.mesh.rotation.set(0, this.targetAngle, 0);
    }

    continueFleeStraight(delta) {
      if (this.state === 'falling') {
        this.updateFall(delta);
        return;
      }

      this.mesh.position.addScaledVector(this.fleeDirection, this.fleeSpeed * delta);

      if (Math.abs(this.mesh.position.x) > FIELD_BOUNDARY || Math.abs(this.mesh.position.z) > FIELD_BOUNDARY) {
        this.state = 'falling';
        return;
      }

      this.mesh.position.y = 0;
    }

    rallyBehindDog(delta, dogPos, dogForwardDir) {
      if (this.state === 'falling') {
        this.updateFall(delta);
        return;
      }

      if (Math.abs(this.mesh.position.x) > FIELD_BOUNDARY || Math.abs(this.mesh.position.z) > FIELD_BOUNDARY) {
        this.state = 'falling';
        return;
      }

      const right = new THREE.Vector3(-dogForwardDir.z, 0, dogForwardDir.x);
      const back = new THREE.Vector3(-dogForwardDir.x, 0, -dogForwardDir.z);

      const targetPos = new THREE.Vector3()
        .copy(dogPos)
        .addScaledVector(right, this.slotBehindOffset.x)
        .addScaledVector(back, Math.abs(this.slotBehindOffset.y));

      const toTarget = new THREE.Vector3().subVectors(targetPos, this.mesh.position);
      toTarget.y = 0;
      const dist = toTarget.length();

      if (dist > 0.6) {
        toTarget.normalize();
        this.targetAngle = Math.atan2(toTarget.x, toTarget.z) + Math.PI;

        let diff = (this.targetAngle - this.mesh.rotation.y) % (Math.PI * 2);
        if (diff < -Math.PI) diff += Math.PI * 2;
        if (diff > Math.PI) diff -= Math.PI * 2;
        this.mesh.rotation.y += diff * delta * 12.0;

        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          this.mesh.rotation.y
        );
        this.mesh.position.addScaledVector(forward, this.rallySpeed * delta);

        this.hopPhase += delta * (this.hopFrequency * 1.5);
        this.mesh.position.y = Math.abs(Math.sin(this.hopPhase)) * (this.hopHeight * 0.9);
      } else {
        this.mesh.position.y = THREE.MathUtils.lerp(this.mesh.position.y, 0, delta * 10);
        const toWolf = new THREE.Vector3().subVectors(player.mesh.position, this.mesh.position);
        this.targetAngle = Math.atan2(toWolf.x, toWolf.z) + Math.PI;
        this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, this.targetAngle, delta * 6);
      }
    }

    setupPovWatchingPosition(wolfPos, sightDir, rightDir) {
      if (this.state === 'falling') return;

      this.state = 'pov_celebrating';

      const row = Math.floor(this.index / 10);
      const col = (this.index % 10) - 4.5;

      const depthDistance = 3.6 + row * 0.8;
      const lateralSpread = col * (0.85 + row * 0.18) + (Math.sin(this.index) * 0.3);

      this.povTargetPos
        .copy(wolfPos)
        .addScaledVector(sightDir, depthDistance)
        .addScaledVector(rightDir, lateralSpread);
      this.povTargetPos.y = 0;

      this.mesh.position.copy(this.povTargetPos);

      const toWolf = new THREE.Vector3().subVectors(wolfPos, this.mesh.position);
      this.baseAngleToWolf = Math.atan2(toWolf.x, toWolf.z) + Math.PI;
      this.mesh.rotation.set(0, this.baseAngleToWolf, 0);
    }

    updatePovCelebrating(delta, time) {
      if (this.state === 'falling' || !this.mesh.visible) return;

      const t = time * this.danceSpeed + this.dancePhase;

      const jump = Math.abs(Math.sin(t * 0.6)) * this.danceHopPeak;
      this.mesh.position.y = jump;

      this.mesh.position.x = this.povTargetPos.x + Math.sin(t * 0.4) * 0.18;
      this.mesh.position.z = this.povTargetPos.z + Math.cos(t * 0.4) * 0.18;

      if (this.danceStyle === 0) {
        this.mesh.rotation.z = Math.sin(t * 0.5) * 0.35;
        this.mesh.rotation.x = -Math.abs(Math.sin(t * 0.7)) * 0.25;
        this.mesh.rotation.y = this.baseAngleToWolf + Math.sin(t * 0.3) * 0.3;
      } else if (this.danceStyle === 1) {
        this.mesh.rotation.y = this.baseAngleToWolf + t * 2.2;
        this.mesh.rotation.z = Math.sin(t * 0.8) * 0.2;
        this.mesh.rotation.x = Math.cos(t * 0.6) * 0.15;
      } else {
        this.mesh.rotation.z = Math.cos(t * 0.7) * 0.28;
        this.mesh.rotation.x = Math.sin(t * 0.9) * 0.32;
        this.mesh.rotation.y = this.baseAngleToWolf + Math.cos(t * 0.5) * 0.45;
      }
    }
  }

  // Load models & instance sheep
  gltfLoader.load(
    'assets/sheep.glb',
    (gltf) => {
      const sheepTemplate = gltf.scene;
      sheepTemplate.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      for (let i = 0; i < SHEEP_COUNT; i++) {
        sheepList.push(new Sheep(sheepTemplate, i));
      }
      updateHudCounts();
      renderCornerLeaderboard();
    },
    undefined,
    (err) => {
      console.warn('Could not load sheep.glb, creating box placeholders.', err);
      for (let i = 0; i < SHEEP_COUNT; i++) {
        sheepList.push(new Sheep(null, i));
      }
      updateHudCounts();
      renderCornerLeaderboard();
    }
  );

  // --- UI Elements ---
  const titleScreenEl = document.getElementById('title-screen');
  const nameModalEl = document.getElementById('name-modal');
  const playerNameInput = document.getElementById('player-name-input');
  const howtoModalEl = document.getElementById('howto-modal');
  const countdownOverlay = document.getElementById('countdown-overlay');
  const inGameUiEl = document.getElementById('ui');
  const currentCountEl = document.getElementById('current-count');
  const maxFollowedCountEl = document.getElementById('max-followed-count');
  const endScoreEl = document.getElementById('end-score');
  const coverBlownBanner = document.getElementById('cover-blown-banner');
  const modalEl = document.getElementById('game-modal');
  const damageOverlay = document.getElementById('damage-overlay');

  function updateHudCounts() {
    const currentFollowers = sheepList.filter((s) => s.state === 'following').length;

    if (currentCountEl) {
      currentCountEl.innerText = currentFollowers;
    }

    if (currentFollowers > maxFollowed) {
      maxFollowed = currentFollowers;
      localStorage.setItem('black_sheep_max_followed', maxFollowed.toString());
      saveScoreToLeaderboard(currentPlayerName, maxFollowed);
    }

    if (maxFollowedCountEl) {
      maxFollowedCountEl.innerText = maxFollowed;
    }
  }
  updateHudCounts();
  renderCornerLeaderboard();

  function checkVictoryCondition() {
    const currentFollowers = sheepList.filter((s) => s.state === 'following').length;
    if (currentFollowers === SHEEP_COUNT && gameState === 'playing') {
      gameState = 'victory';
      updateHudCounts();
      saveScoreToLeaderboard(currentPlayerName, currentFollowers);

      if (endScoreEl) {
        endScoreEl.innerText = currentFollowers;
      }

      document.getElementById('game-canvas').classList.add('grayscale-bg');
      modalEl.classList.remove('hidden');
      modalEl.classList.add('visible');
    }
  }

  function startCountdown() {
    gameState = 'countdown';
    countdownSeconds = 3;
    countdownTimer = 0;

    countdownOverlay.innerText = '3';
    countdownOverlay.className = 'serif-num countdown-tick';
    countdownOverlay.classList.remove('hidden');

    inGameUiEl.classList.remove('hidden');
    updateHudCounts();
  }

  // --- Modal & Name Handlers ---
  window.openNameModal = function () {
    if (nameModalEl) {
      nameModalEl.classList.remove('hidden');
      if (playerNameInput) {
        playerNameInput.value = currentPlayerName !== 'Anonymous' ? currentPlayerName : '';
        playerNameInput.focus();
      }
    }
  };

  window.closeNameModal = function () {
    if (nameModalEl) {
      nameModalEl.classList.add('hidden');
    }
  };

  window.submitNameAndStart = function () {
    const name = playerNameInput.value.trim() || 'Anonymous';
    currentPlayerName = name;
    localStorage.setItem('black_sheep_player_name', currentPlayerName);
    closeNameModal();

    stopTitleVideo();

    titleScreenEl.classList.add('fade-out');
    howtoModalEl.classList.add('hidden');
    gameState = 'descending';
    descentProgress = 0;
  };

  if (playerNameInput) {
    playerNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        submitNameAndStart();
      }
    });
  }

  window.toggleHowTo = function (show) {
    if (show) {
      howtoModalEl.classList.remove('hidden');
    } else {
      howtoModalEl.classList.add('hidden');
    }
  };

  // 1. Zoom into the spotter sheep
  function triggerGameOverCutscene(culpritSheep) {
    if (gameState !== 'playing') return;
    gameState = 'cutscene_zoom_sheep';
    detectedSheep = culpritSheep;
    detectedSheep.faceWolf();
    cutsceneTimer = 0;
    povFrozen = false;
    biteAudioStarted = false;

    coverBlownBanner.className = 'serif-num flash-center';

    for (let i = 0; i < sheepList.length; i++) {
      sheepList[i].mesh.position.y = 0;
    }

    camLookTarget.copy(player.mesh.position);
  }

  // Shows the end screen modal synchronized with the grayscale change
  function showGameOverModal() {
    inGameUiEl.classList.add('hidden');
    coverBlownBanner.className = 'hidden serif-num';

    const currentScore = sheepList.filter((s) => s.state === 'following').length;

    if (endScoreEl) {
      endScoreEl.innerText = currentScore;
    }

    saveScoreToLeaderboard(currentPlayerName, currentScore);

    modalEl.classList.remove('hidden');
    requestAnimationFrame(() => {
      modalEl.classList.add('visible');
    });
  }

  // 2. Dog spawns off-screen and flock rallies
  function triggerDogApproachRandomOffscreen() {
    gameState = 'cutscene_dog_approach';
    cutsceneTimer = 0;
    biteAudioStarted = false;

    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnDistance = 75.0;
    dogChargeStart.set(
      player.mesh.position.x + Math.cos(spawnAngle) * spawnDistance,
      0,
      player.mesh.position.z + Math.sin(spawnAngle) * spawnDistance
    );

    dog.mesh.position.copy(dogChargeStart);
    dog.mesh.visible = true;

    for (let i = 0; i < sheepList.length; i++) {
      if (sheepList[i] !== detectedSheep) {
        sheepList[i].state = 'rallying';
      }
    }

    playSound(SOUNDS.dogBark);
  }

  // 3. First-person POV
  function triggerWolfPOV() {
    gameState = 'cutscene_wolf_pov';
    cutsceneTimer = 0;

    player.mesh.visible = false;
    povLookDirection.subVectors(dog.mesh.position, player.mesh.position).normalize();
    povLookDirection.y = 0;

    const wolfPos = player.mesh.position;
    const rightDir = new THREE.Vector3(-povLookDirection.z, 0, povLookDirection.x);

    for (let i = 0; i < sheepList.length; i++) {
      if (sheepList[i] !== detectedSheep) {
        sheepList[i].setupPovWatchingPosition(wolfPos, povLookDirection, rightDir);
      }
    }

    if (!biteAudioStarted) {
      fadeInSound(SOUNDS.dogBite, 1.2, 1.0);
      biteAudioStarted = true;
    }

    damageOverlay.classList.add('active');
  }

  function resetWorldEntities() {
    stopSound(SOUNDS.dogBark);
    stopSound(SOUNDS.dogBite);

    damageOverlay.classList.remove('active');
    coverBlownBanner.className = 'hidden serif-num';
    countdownOverlay.classList.add('hidden');
    detectedSheep = null;
    cutsceneTimer = 0;
    povFrozen = false;
    biteAudioStarted = false;

    document.getElementById('game-canvas').classList.remove('grayscale-bg');

    player.mesh.visible = true;
    player.mesh.position.set(0, 0, 0);
    player.mesh.rotation.y = 0;

    dog.mesh.visible = false;
    dog.mesh.position.set(0, -10, 0);

    for (let i = 0; i < sheepList.length; i++) {
      sheepList[i].resetPosition();
    }
    updateHudCounts();
  }

  window.restartGame = function () {
    modalEl.classList.remove('visible');
    modalEl.classList.add('hidden');
    resetWorldEntities();

    camera.position.set(0, CAM_OFFSET_Y, CAM_OFFSET_Z);
    camera.lookAt(0, CAM_LOOK_OFFSET_Y, 0);

    startCountdown();
  };

  window.goToTitleScreen = function () {
    modalEl.classList.remove('visible');
    modalEl.classList.add('hidden');
    inGameUiEl.classList.add('hidden');
    resetWorldEntities();

    camera.position.set(0, START_CAM_Y, CAM_OFFSET_Z);
    camera.lookAt(0, START_CAM_Y - (CAM_OFFSET_Y - CAM_LOOK_OFFSET_Y), 0);

    titleScreenEl.classList.remove('fade-out');
    gameState = 'start_screen';

    resumeTitleVideo();
  };

  // --- Input Handling ---
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  // --- Render Loop ---
  const clock = new THREE.Clock();
  let hasSheepTurned = false;

  function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.1);

    if (gameState === 'start_screen') {
      camera.position.set(0, START_CAM_Y, CAM_OFFSET_Z);
      camera.lookAt(0, START_CAM_Y - (CAM_OFFSET_Y - CAM_LOOK_OFFSET_Y), 0);

      for (let i = 0; i < sheepList.length; i++) {
        sheepList[i].update(delta);
      }

    } else if (gameState === 'descending') {
      descentProgress += delta / descentDuration;
      const t = Math.min(descentProgress, 1.0);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      currentCameraY = THREE.MathUtils.lerp(START_CAM_Y, TARGET_CAMERA_Y, ease);
      camera.position.set(player.mesh.position.x, currentCameraY, player.mesh.position.z + CAM_OFFSET_Z);
      camera.lookAt(player.mesh.position.x, currentCameraY - (CAM_OFFSET_Y - CAM_LOOK_OFFSET_Y), player.mesh.position.z);

      for (let i = 0; i < sheepList.length; i++) {
        sheepList[i].update(delta);
      }

      if (t >= 1.0) {
        startCountdown();
      }

    } else if (gameState === 'countdown') {
      countdownTimer += delta;

      if (countdownTimer >= 1.0) {
        countdownTimer -= 1.0;
        countdownSeconds -= 1;

        if (countdownSeconds > 0) {
          countdownOverlay.innerText = countdownSeconds.toString();
          countdownOverlay.classList.remove('countdown-tick');
          void countdownOverlay.offsetWidth;
          countdownOverlay.classList.add('countdown-tick');
        } else {
          countdownOverlay.classList.add('hidden');
          gameState = 'playing';
        }
      }

      for (let i = 0; i < sheepList.length; i++) {
        sheepList[i].update(delta);
      }

      const normalCamPos = new THREE.Vector3(
        player.mesh.position.x,
        player.mesh.position.y + CAM_OFFSET_Y,
        player.mesh.position.z + CAM_OFFSET_Z
      );
      camera.position.lerp(normalCamPos, delta * 4);
      camera.lookAt(player.mesh.position.x, player.mesh.position.y + CAM_LOOK_OFFSET_Y, player.mesh.position.z);

    } else if (gameState === 'playing') {
      hasSheepTurned = false;

      const moveDir = new THREE.Vector3();
      if (keys['w'] || keys['arrowup']) moveDir.z -= 1;
      if (keys['s'] || keys['arrowdown']) moveDir.z += 1;
      if (keys['a'] || keys['arrowleft']) moveDir.x -= 1;
      if (keys['d'] || keys['arrowright']) moveDir.x += 1;

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();

        const targetAngle = Math.atan2(moveDir.x, moveDir.z) + Math.PI;
        let diff = (targetAngle - player.mesh.rotation.y) % (Math.PI * 2);
        if (diff < -Math.PI) diff += Math.PI * 2;
        if (diff > Math.PI) diff -= Math.PI * 2;
        player.mesh.rotation.y += diff * delta * player.rotationSpeed;

        player.mesh.position.addScaledVector(moveDir, player.speed * delta);

        player.mesh.position.x = THREE.MathUtils.clamp(
          player.mesh.position.x,
          -FIELD_BOUNDARY,
          FIELD_BOUNDARY
        );
        player.mesh.position.z = THREE.MathUtils.clamp(
          player.mesh.position.z,
          -FIELD_BOUNDARY,
          FIELD_BOUNDARY
        );
      }

      for (let i = 0; i < sheepList.length; i++) {
        sheepList[i].update(delta);
      }

      const normalCamPos = new THREE.Vector3(
        player.mesh.position.x,
        player.mesh.position.y + CAM_OFFSET_Y,
        player.mesh.position.z + CAM_OFFSET_Z
      );
      camera.position.lerp(normalCamPos, delta * 4);
      camera.lookAt(player.mesh.position.x, player.mesh.position.y + CAM_LOOK_OFFSET_Y, player.mesh.position.z);

    } else if (gameState === 'cutscene_zoom_sheep') {
      cutsceneTimer += delta;

      const sPos = detectedSheep.mesh.position;

      if (cutsceneTimer < 1.4) {
        const closeCamPos = new THREE.Vector3(
          sPos.x + 1.8,
          sPos.y + 1.5,
          sPos.z + 3.0
        );
        camera.position.lerp(closeCamPos, delta * 7.0);
        camLookTarget.lerp(
          new THREE.Vector3(sPos.x, sPos.y + 0.8, sPos.z),
          delta * 8.0
        );
        camera.lookAt(camLookTarget);

      } else if (cutsceneTimer < 2.5) {
        if (!document.getElementById('game-canvas').classList.contains('grayscale-bg')) {
          document.getElementById('game-canvas').classList.add('grayscale-bg');
          showGameOverModal();
        }

        if (!hasSheepTurned) {
          detectedSheep.initFleeStraight();
          hasSheepTurned = true;
        }
        detectedSheep.continueFleeStraight(delta);

        const normalCamPos = new THREE.Vector3(
          player.mesh.position.x,
          player.mesh.position.y + CAM_OFFSET_Y,
          player.mesh.position.z + CAM_OFFSET_Z
        );
        camera.position.lerp(normalCamPos, delta * 4.5);
        camLookTarget.lerp(
          new THREE.Vector3(player.mesh.position.x, player.mesh.position.y + CAM_LOOK_OFFSET_Y, player.mesh.position.z),
          delta * 5.5
        );
        camera.lookAt(camLookTarget);

      } else {
        triggerDogApproachRandomOffscreen();
      }

    } else if (gameState === 'cutscene_dog_approach') {
      cutsceneTimer += delta;

      if (detectedSheep) {
        detectedSheep.continueFleeStraight(delta);
      }

      const normalCamPos = new THREE.Vector3(
        player.mesh.position.x,
        player.mesh.position.y + CAM_OFFSET_Y,
        player.mesh.position.z + CAM_OFFSET_Z
      );
      camera.position.lerp(normalCamPos, delta * 4);
      camera.lookAt(player.mesh.position.x, player.mesh.position.y + CAM_LOOK_OFFSET_Y, player.mesh.position.z);

      const dogPos = dog.mesh.position;
      const wolfPos = player.mesh.position;

      const toWolf = new THREE.Vector3().subVectors(wolfPos, dogPos);
      const distToWolf = toWolf.length();

      const forwardDir = toWolf.clone().normalize();

      const moveAngle = Math.atan2(forwardDir.x, forwardDir.z) + Math.PI;
      let aDiff = (moveAngle - dog.mesh.rotation.y) % (Math.PI * 2);
      if (aDiff < -Math.PI) aDiff += Math.PI * 2;
      if (aDiff > Math.PI) aDiff -= Math.PI * 2;
      dog.mesh.rotation.y += aDiff * delta * 14.0;

      if (distToWolf <= 42.0 && !biteAudioStarted) {
        fadeInSound(SOUNDS.dogBite, 1.5, 1.0);
        biteAudioStarted = true;
        damageOverlay.classList.add('active');
      }

      if (distToWolf > 2.0) {
        dog.mesh.position.addScaledVector(forwardDir, dogSpeed * delta);
        dog.mesh.position.y = 0;
      } else {
        triggerWolfPOV();
      }

      for (let i = 0; i < sheepList.length; i++) {
        if (sheepList[i] !== detectedSheep) {
          sheepList[i].rallyBehindDog(delta, dogPos, forwardDir);
        }
      }

    } else if (gameState === 'cutscene_wolf_pov') {
      if (!povFrozen) {
        cutsceneTimer += delta;

        if (detectedSheep) {
          detectedSheep.continueFleeStraight(delta);
        }

        const wolfPos = player.mesh.position;
        camera.position.set(wolfPos.x, 1.15, wolfPos.z);

        const baseDogDist = 1.7;
        const biteCycle = Math.sin(cutsceneTimer * 16.0);
        const lungeOffset = Math.max(0, biteCycle) * 0.45;
        const currentDist = baseDogDist - lungeOffset;

        dog.mesh.position.set(
          wolfPos.x + povLookDirection.x * currentDist,
          0,
          wolfPos.z + povLookDirection.z * currentDist
        );

        dog.mesh.rotation.y = Math.atan2(-povLookDirection.x, -povLookDirection.z) + Math.PI;
        dog.mesh.rotation.z = Math.sin(cutsceneTimer * 24.0) * 0.18;
        dog.mesh.rotation.x = -Math.abs(Math.sin(cutsceneTimer * 16.0)) * 0.22;

        const recoilPitch = -Math.max(0, biteCycle) * 0.08;
        const recoilYaw = Math.sin(cutsceneTimer * 18.0) * 0.05;

        const dogHeadTarget = new THREE.Vector3(
          dog.mesh.position.x,
          0.85 + recoilPitch,
          dog.mesh.position.z
        );
        camera.lookAt(dogHeadTarget);
        camera.rotation.z = recoilYaw;

        for (let i = 0; i < sheepList.length; i++) {
          if (sheepList[i] !== detectedSheep) {
            sheepList[i].updatePovCelebrating(delta, cutsceneTimer);
          }
        }
      }
    }

    renderer.render(scene, camera);
  }

  // --- Window Resize ---
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}
