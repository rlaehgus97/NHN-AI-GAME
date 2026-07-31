function pickOne(values) {
  return values[Math.floor(Math.random() * values.length)];
}

export class EventDirector {
  constructor(stage) {
    this.stage = stage;
    this.elapsed = 0;
    this.fired = new Set();
    this.selectedEvents = [];
  }

  reset() {
    this.elapsed = 0;
    this.fired.clear();
    const first = pickOne(this.stage.eventPool);
    const secondPool = this.stage.eventPool.filter(id => id !== first);
    this.selectedEvents = [first, pickOne(secondPool)];
  }

  update(dt) {
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
    return actions;
  }
}

