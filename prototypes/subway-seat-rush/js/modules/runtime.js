import { MovementSystem } from "./movement-system.js?v=demo-graphics-1";
import { SeatCompetition } from "./seat-competition.js?v=demo-graphics-1";
import { StationSystem } from "./station-system.js?v=demo-graphics-1";
import { STAGE_ONE } from "./stage-config.js?v=demo-graphics-1";
import { EventDirector } from "./event-director.js?v=demo-graphics-1";
import { CharacterAssets } from "./character-assets.js?v=demo-graphics-1";
import { loadGLTF } from "./gltf-asset-loader.js?v=demo-graphics-1";

const director = new EventDirector(STAGE_ONE);

window.GameModules = Object.freeze({
  MovementSystem,
  SeatCompetition,
  StationSystem,
  stage: STAGE_ONE,
  director,
  CharacterAssets,
  loadGLTF // 범용 GLTF 로더 — 환경 모델(지하철 차량 등)에도 그대로 재사용
});
