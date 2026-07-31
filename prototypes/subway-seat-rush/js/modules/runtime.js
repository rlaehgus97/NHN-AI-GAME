import { MovementSystem } from "./movement-system.js?v=stage-systems-4";
import { SeatCompetition } from "./seat-competition.js?v=stage-systems-4";
import { StationSystem } from "./station-system.js?v=stage-systems-4";
import { STAGE_ONE } from "./stage-config.js?v=stage-systems-4";
import { EventDirector } from "./event-director.js?v=stage-systems-4";

const director = new EventDirector(STAGE_ONE);

window.GameModules = Object.freeze({
  MovementSystem,
  SeatCompetition,
  StationSystem,
  stage: STAGE_ONE,
  director
});
