import { MovementSystem } from "./movement-system.js";
import { SeatCompetition } from "./seat-competition.js";
import { StationSystem } from "./station-system.js";
import { STAGE_ONE } from "./stage-config.js";
import { EventDirector } from "./event-director.js";

const director = new EventDirector(STAGE_ONE);

window.GameModules = Object.freeze({
  MovementSystem,
  SeatCompetition,
  StationSystem,
  stage: STAGE_ONE,
  director
});

