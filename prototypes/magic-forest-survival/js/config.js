// ============================================================
// CONFIG: 게임 전체 밸런스 값을 여기서 한 번에 조정할 수 있습니다.
// ============================================================
const CONFIG = {
  // --- 월드 설정 ---
  WORLD_WIDTH: 4000,
  WORLD_HEIGHT: 4000,

  // --- 플레이어 설정 ---
  PLAYER: {
    SPEED: 200,          // 이동 속도 (px/s)
    MAX_HP: 100,         // 최대 체력
    DEFENSE: 0,          // 기본 방어력 (받는 피해 감소)
    ATTACK: 12,          // 기본 공격력
    ATTACK_RATE: 3.5,    // 초당 공격 횟수
    INVINCIBLE_TIME: 1.2,// 피격 후 무적 시간 (초)
    SIZE: 22,            // 캐릭터 반지름
    ACCEL: 1200,         // 가속도
    FRICTION: 0.85,      // 감속 계수 (1에 가까울수록 천천히 멈춤)
  },

  // --- 마법 투사체 설정 ---
  PROJECTILE: {
    SPEED: 480,          // 투사체 이동 속도 (px/s)
    SIZE: 7,             // 투사체 반지름
    MAX_RANGE: 700,      // 최대 사거리 (px)
    TRAIL_COUNT: 8,      // 꼬리 파티클 수
  },

  // --- 적 설정 ---
  ENEMY: {
    BASE_HP: 30,         // 기본 체력
    BASE_SPEED: 70,      // 기본 이동 속도
    BASE_DAMAGE: 15,     // 기본 공격력 (접촉 시 피해)
    MIN_SIZE: 18,        // 최소 크기 반지름
    MAX_SIZE: 30,        // 최대 크기 반지름
    SPAWN_DISTANCE: 200, // 플레이어로부터 스폰 거리 (화면 바깥)
    REPEL_FORCE: 80,     // 적끼리 밀어내기 힘
    PUSH_FORCE: 120,     // 플레이어 밀어내기 힘
  },

  // --- 적 스폰 설정 ---
  SPAWN: {
    INITIAL_INTERVAL: 1.8, // 초기 스폰 간격 (초)
    MIN_INTERVAL: 0.35,    // 최소 스폰 간격 (초)
    INTERVAL_DECREASE: 0.04,// 레벨당 스폰 간격 감소량
    MAX_ENEMIES: 120,      // 최대 적 수
  },

  // --- 레벨업 설정 ---
  LEVELUP: {
    // 각 레벨업에 필요한 처치 수 (누적)
    // 레벨 1→2: 10마리, 2→3: 추가 15마리, 3→4: 추가 20마리...
    BASE_KILLS: 10,
    KILLS_INCREMENT: 5,
    // 레벨업 시 능력치 증가량
    ATTACK_INCREASE: 4,
    DEFENSE_INCREASE: 3,
    HP_INCREASE: 25,
  },

  // --- 카메라 설정 ---
  CAMERA: {
    LERP: 0.08,          // 카메라 추적 부드러움 (0~1, 클수록 빠름)
    SHAKE_DECAY: 0.85,   // 화면 흔들림 감쇠율
  },

  // --- 파티클 설정 ---
  PARTICLE: {
    MAX_COUNT: 800,      // 최대 파티클 수 (성능 제한)
  },

  // --- 오디오 설정 ---
  AUDIO: {
    ENABLED: true,
    SHOOT_VOLUME: 0.15,
    HIT_VOLUME: 0.25,
    PLAYER_HIT_VOLUME: 0.3,
    DEATH_VOLUME: 0.2,
    LEVELUP_VOLUME: 0.4,
  },
};
