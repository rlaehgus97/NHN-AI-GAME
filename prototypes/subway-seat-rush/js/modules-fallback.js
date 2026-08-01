"use strict";
/* modules-fallback.js — js/modules/*.js (ES 모듈)와 동일한 로직의 일반 스크립트 판본
   ------------------------------------------------------------------------------
   왜 필요한가:
     index.html은 `<script type="module" src="js/modules/runtime.js">`로 스테이지 디렉터를
     불러온다. 그런데 ES 모듈은 file:// 로 열면 브라우저 CORS 정책에 막혀 로드되지 않는다.
     이 경우 window.GameModules 가 undefined 가 되고, updateStageDirector()가 즉시 return 하면서
       - 빌런이 한 번도 등장하지 않음
       - 이벤트(급정거/중간역/하차 안내)가 발생하지 않음
       - 목적지 도착(DESTINATION_ARRIVAL)이 트리거되지 않아 게임이 끝나지 않음
     이라는 증상이 한꺼번에 나타난다.

   동작 방식:
     이 파일은 일반 스크립트라 항상 실행되어 window.GameModules 를 먼저 채워 둔다.
     ES 모듈이 정상적으로 로드되는 환경(로컬 서버 / http)에서는 runtime.js 가 나중에 실행되어
     같은 내용의 모듈 판본으로 교체한다. 두 판본의 로직은 동일하므로 결과는 같다.
   ------------------------------------------------------------------------------ */
(function(){
  /* ===== stage-config.js ===== */
  const STAGE_ONE = {
    id: "stage-1",
    duration: 75,
    timeline: {
      event1: 12,
      intermediateWarning: 40,
      intermediateArrival: 43,
      event2: 50,
      destinationWarning: 60,
      exitQueue: 65,
      destinationArrival: 70,
      doorsClose: 75
    },
    eventPool: ["sudden-stop", "backpack", "drunk", "broth", "climate", "umbrella"]
  };

  /* ===== event-director.js ===== */
  function pickOne(values){ return values[Math.floor(Math.random()*values.length)]; }

  class EventDirector {
    constructor(stage){
      this.stage = stage;
      this.elapsed = 0;
      this.fired = new Set();
      this.selectedEvents = [];
    }
    reset(){
      this.elapsed = 0;
      this.fired.clear();
      const first = pickOne(this.stage.eventPool);
      const secondPool = this.stage.eventPool.filter(id => id !== first);
      this.selectedEvents = [first, pickOne(secondPool)];
    }
    update(dt){
      this.elapsed += dt;
      const actions = [];
      const timeline = this.stage.timeline;
      const emitAt = (key, type, payload = {}) => {
        if (!this.fired.has(key) && this.elapsed >= timeline[key]){
          this.fired.add(key);
          actions.push(Object.assign({ type }, payload));
        }
      };
      emitAt("event1", "EVENT_SLOT", { slot: 1, eventId: this.selectedEvents[0] });
      emitAt("intermediateWarning", "STATION_WARNING", { stationIndex: 1 });
      emitAt("intermediateArrival", "INTERMEDIATE_ARRIVAL", { stationIndex: 1 });
      emitAt("event2", "EVENT_SLOT", { slot: 2, eventId: this.selectedEvents[1] });
      emitAt("destinationWarning", "DESTINATION_WARNING");
      emitAt("exitQueue", "EXIT_QUEUE");
      emitAt("destinationArrival", "DESTINATION_ARRIVAL");
      emitAt("doorsClose", "DOORS_CLOSE");
      return actions;
    }
  }

  /* ===== movement-system.js ===== */
  const MovementSystem = {
    moveTowards(entity, target, dt, options = {}){
      const speed = options.speed != null ? options.speed : (entity.moveSpeed != null ? entity.moveSpeed : 2.6);
      const stopDistance = options.stopDistance != null ? options.stopDistance : 0.15;
      const dx = target.x - entity.x;
      const dz = target.z - entity.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= stopDistance) return true;
      const step = Math.min(distance - stopDistance, speed * dt);
      entity.x += dx / distance * step;
      entity.z += dz / distance * step;
      if (options.bounds){
        entity.x = Math.max(options.bounds.xMin, Math.min(options.bounds.xMax, entity.x));
        entity.z = Math.max(options.bounds.zMin, Math.min(options.bounds.zMax, entity.z));
      }
      if (entity.mesh){
        entity.mesh.position.x = entity.x;
        entity.mesh.position.z = entity.z;
        entity.mesh.rotation.y = Math.atan2(dx, dz);
      }
      return false;
    },
    approachPlayer(villain, playerPosition, dt, options = {}){
      let target = {
        x: playerPosition.x + (villain.approachOffsetX || 0),
        z: playerPosition.z + (villain.approachOffsetZ || 0)
      };
      // 좌석은 통로 이동 범위 바깥에 있으므로, 도달 불가능한 목표를 계속 추적하지 않게 한다.
      if (options.bounds){
        target = {
          x: Math.max(options.bounds.xMin, Math.min(options.bounds.xMax, target.x)),
          z: Math.max(options.bounds.zMin, Math.min(options.bounds.zMax, target.z))
        };
      }
      const arrived = this.moveTowards(villain, target, dt, {
        speed: options.speed != null ? options.speed : 1.35,
        stopDistance: options.stopDistance != null ? options.stopDistance : 1.75,
        bounds: options.bounds
      });
      villain.hasApproachedPlayer = arrived;
      return arrived;
    }
  };

  /* ===== seat-competition.js ===== */
  const defaultStrategy = {
    // 실제 자리 경쟁이 진행 중일 때만 호출된다. amount만큼 게이지를 올리고,
    // 100에 도달하면 true(플레이어 승리)를 반환한다.
    playerPress(seat, amount){
      if (!seat || seat.occupied) return false;
      const gain = typeof amount === "number" ? amount : 100;
      seat.captureProgress = Math.min(100, (seat.captureProgress || 0) + gain);
      return seat.captureProgress >= 100;
    },
    npcArrived(seat, npc){
      if (seat.occupied || seat.reservedFor === "player") return false;
      seat.npcClaimantRef = npc;
      return true;
    }
  };
  let strategy = defaultStrategy;
  const SeatCompetition = {
    setStrategy(next){ strategy = Object.assign({}, defaultStrategy, next); },
    resetStrategy(){ strategy = defaultStrategy; },
    playerPress(seat, amount){ return strategy.playerPress(seat, amount); },
    npcArrived(seat, npc){ return strategy.npcArrived(seat, npc); },
    resetSeat(seat){ seat.captureProgress = 0; seat.npcProgress = 0; seat.npcClaimantRef = null; }
  };

  /* ===== station-system.js ===== */
  const StationSystem = {
    resetStationScope(context, stationIndex){
      context.G.stationIndex = stationIndex;
      context.G.villainIgnoreTimer = 0;
      context.G.knockback = { timer: 0, dirX: 0, dirZ: 0, distance: 0 };
      context.G.stun = 0;
      context.G.pendingSuddenStop = 0;
      context.G.villainRewardBuff = 0;

      context.seats.forEach(seat => {
        seat.captureProgress = 0;
        seat.npcProgress = 0;
        seat.npcClaimantRef = null;
        if (!seat.occupied && seat.reservedFor !== 'player-safety'){
          seat.reservedFor = null;
          seat.reservedTimer = 0;
        }
      });

      context.villains.forEach(villain => {
        if (!villain.defeated && villain.mesh) context.scene.remove(villain.mesh);
        if (villain.zoneMesh) context.scene.remove(villain.zoneMesh);
      });
      context.villains.length = 0;

      (context.npcs || []).forEach(npc => {
        npc.avoidVillainTarget = null;
        npc.avoidVillainTimer = 0;
        npc.fleeingVillain = false;
        npc.avoidSeatTimer = 0;
        npc.seatApproachPhase = null;
      });
    }
  };

  window.GameModules = Object.freeze({
    MovementSystem,
    SeatCompetition,
    StationSystem,
    stage: STAGE_ONE,
    director: new EventDirector(STAGE_ONE)
  });
})();
