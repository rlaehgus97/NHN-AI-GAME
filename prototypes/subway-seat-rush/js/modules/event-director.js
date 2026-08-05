function pickOne(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function createBehaviorState() {
  return {
    continuousSeatedTime: 0,
    seatingLockedUntil: 0,
    longSeatCooldownUntil: 0,
    rapidToggleCooldownUntil: 0,
    constraintCooldownUntil: 0,
    recentSeatActions: []
  };
}

function isAlternatingSeatPattern(actions) {
  if (actions.length < AI_DIRECTOR.rapidToggleTransitions) return false;
  const recent = actions.slice(-AI_DIRECTOR.rapidToggleTransitions);
  return recent.every((action, index) =>
    index === 0 || action.type !== recent[index - 1].type);
}

function evaluateSeatingConstraints(state, snapshot) {
  const now = snapshot.elapsed;
  const actions = [];

  if (snapshot.state !== GameState.TRAVELING) {
    state.continuousSeatedTime = 0;
    return actions;
  }

  if (snapshot.posture === Posture.SEATED) state.continuousSeatedTime += snapshot.dt;
  else state.continuousSeatedTime = 0;

  if (now < state.constraintCooldownUntil) return actions;

  if (snapshot.posture === Posture.SEATED &&
      state.continuousSeatedTime >= AI_DIRECTOR.longSeatDuration &&
      now >= state.longSeatCooldownUntil) {
    state.continuousSeatedTime = 0;
    state.longSeatCooldownUntil = now + AI_DIRECTOR.longSeatCooldown;
    state.constraintCooldownUntil = now + AI_DIRECTOR.constraintMinGap;
    actions.push({
      type: "FORCE_STAND",
      reason: "continuous-seated",
      seatedFor: AI_DIRECTOR.longSeatDuration,
      cooldownUntil: state.longSeatCooldownUntil
    });
    return actions;
  }

  state.recentSeatActions = state.recentSeatActions.filter(action =>
    now - action.time <= AI_DIRECTOR.rapidToggleWindow);
  if (state.recentSeatActions.length >= AI_DIRECTOR.rapidToggleTransitions &&
      isAlternatingSeatPattern(state.recentSeatActions) &&
      now >= state.rapidToggleCooldownUntil) {
    state.seatingLockedUntil = now + AI_DIRECTOR.seatLockDuration;
    state.rapidToggleCooldownUntil = now + AI_DIRECTOR.rapidToggleCooldown;
    state.constraintCooldownUntil = now + AI_DIRECTOR.constraintMinGap;
    state.recentSeatActions = [];
    actions.push({
      type: "LOCK_SEATING",
      reason: "rapid-seat-toggle",
      lockUntil: state.seatingLockedUntil,
      cooldownUntil: state.rapidToggleCooldownUntil
    });
  }

  return actions;
}

export class EventDirector {
  constructor(stage) {
    this.stage = stage;
    this.elapsed = 0;
    this.fired = new Set();
    this.selectedEvents = [];
    this.behavior = createBehaviorState();
  }

  reset() {
    this.elapsed = 0;
    this.fired.clear();
    this.behavior = createBehaviorState();
    const first = pickOne(this.stage.eventPool);
    const secondPool = this.stage.eventPool.filter(id => id !== first);
    this.selectedEvents = [first, pickOne(secondPool)];
  }

  recordPlayerAction(action) {
    const source = action.source || "manual";
    const time = typeof action.time === "number" ? action.time : this.elapsed;
    console.info("[AI Director][player]", action.type, { time, source });
    if (source !== "manual") return;
    this.behavior.recentSeatActions.push({ type: action.type, time });
  }

  isSeatingLocked(time = this.elapsed) {
    return time < this.behavior.seatingLockedUntil;
  }

  update(dt, snapshot = {}) {
    this.elapsed += dt;
    const actions = [];
    const timeline = this.stage.timeline;

    const emitAt = (key, type, payload = {}) => {
      if (!this.fired.has(key) && this.elapsed >= timeline[key]) {
        this.fired.add(key);
        actions.push({ type, ...payload });
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
    actions.push(...evaluateSeatingConstraints(this.behavior, {
      state: snapshot.state,
      posture: snapshot.posture,
      elapsed: typeof snapshot.elapsed === "number" ? snapshot.elapsed : this.elapsed,
      dt
    }));
    return actions;
  }
}

