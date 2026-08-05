import { MovementSystem } from "./movement-system.js?v=stage-systems-4";
import { SeatCompetition } from "./seat-competition.js?v=stage-systems-4";
import { StationSystem } from "./station-system.js?v=stage-systems-4";
import { STAGE_ONE } from "./stage-config.js?v=stage-systems-4";
import { EventDirector } from "./event-director.js?v=stage-systems-4";
import { CharacterAssets } from "./character-assets.js?v=stage-systems-1";
import { loadGLTF } from "./gltf-asset-loader.js?v=stage-systems-1";

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
