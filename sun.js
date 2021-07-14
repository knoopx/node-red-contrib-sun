const moment = require("moment")
const suncalc = require("suncalc2")
const lodash = require("lodash")

function getSuncalEventsByDate(now, latitude, longitude) {
  return suncalc.getTimes(
    now.clone().hour(12).minute(0).second(0).toDate(),
    latitude,
    longitude,
  )
}

function makeSunEvent(now, event, time) {
  return [event, now.clone().hour(time.getHours()).minutes(time.getMinutes())]
}

function computeSunEvents(now, latitude, longitude) {
  const events = getSuncalEventsByDate(now, latitude, longitude)

  return Object.keys(events).reduce(
    (result, name) => [...result, makeSunEvent(now, name, events[name])],
    [],
  )
}

function computeState(now, latitude, longitude) {
  const events = computeSunEvents(now, latitude, longitude)

  const nextStates = lodash
    .chain(events)
    .filter((x) => x[1] >= now)
    .sortBy([1])
    .value()

  const [currentState] = nextStates.shift()
  const [nextState, nextStateAt] = nextStates[0] || []

  return { currentState, nextState, nextStateAt }
}

module.exports = (RED) => {
  class SunNode {
    constructor(config) {
      RED.nodes.createNode(this, config)

      const { latitude, longitude, outputOnlyOnChange } = config
      Object.assign(this, { latitude, longitude, outputOnlyOnChange })

      this.previousState = null
      this.status({})

      this.on("input", this.onInput)
    }

    onInput = (msg) => {
      const { payload = {} } = msg
      const { latitude = this.latitude, longitude = this.longitude } = payload

      const { currentState, nextState, nextStateAt } = computeState(
        moment(),
        latitude,
        longitude,
      )

      Object.assign(msg, {
        payload: currentState,
        next: nextState,
        nextAt: nextStateAt,
      })

      if (!this.previousState) {
        this.previousState = currentState
      }

      if (!this.outputOnlyOnChange || this.previousState !== currentState) {
        this.send(msg)
        this.previousState = currentState
      }

      if (nextState) {
        this.status(
          `${currentState}, next: ${nextState} at ${nextStateAt.format("H:h")}`,
        )
      } else {
        this.status(currentState)
      }
    }
  }

  RED.nodes.registerType("sun", SunNode)
}
