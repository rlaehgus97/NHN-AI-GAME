import { MovementSystem } from "./movement-system.js?v=mouse-seat-2";
import { SeatCompetition } from "./seat-competition.js?v=mouse-seat-2";
import { StationSystem } from "./station-system.js?v=mouse-seat-2";
import { STAGE_ONE } from "./stage-config.js?v=mouse-seat-2";
import { EventDirector } from "./event-director.js?v=mouse-seat-2";

const director = new EventDirector(STAGE_ONE);

window.GameModules = Object.freeze({
  MovementSystem,
  SeatCompetition,
  StationSystem,
  stage: STAGE_ONE,
  director
});
