const _ = require("lodash")
const moment = require("moment")
const suncalc = require("suncalc2")

function getSuncalcEventTimesForMoment(now, latitude, longitude) {
  return suncalc.getTimes(
    now.clone().hour(12).minute(0).second(0),
    latitude,
    longitude,
  )
}

function computeSunEventTimesForMoment(now, latitude, longitude) {
  return _.chain(getSuncalcEventTimesForMoment(now, latitude, longitude))
    .toPairs()
    .map(([event, time]) => [
      event,
      now.clone().hour(time.getHours()).minutes(time.getMinutes()),
    ])
    .sortBy([1])
    .value()
}

function computeSunStates(now, latitude, longitude) {
  const sunEventTimes = [
    ...computeSunEventTimesForMoment(
      now.clone().add(-1, "day"),
      latitude,
      longitude,
    ),
    ...computeSunEventTimesForMoment(now, latitude, longitude),
    ...computeSunEventTimesForMoment(
      now.clone().add(1, "day"),
      latitude,
      longitude,
    ),
  ]

  const [nextState, nextStateAt] = _.find(
    sunEventTimes,
    ([, time]) => time >= now,
  )

  const [currentState, currentStateAt] = _.findLast(
    sunEventTimes,
    ([, time]) => time < nextStateAt,
  )

  return { currentState, currentStateAt, nextState, nextStateAt }
}

// console.log(computeSunStates(moment(), 41.49084, 2.1332))

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

      const now = moment()
      const { currentState, currentStateAt, nextState, nextStateAt } =
        computeSunStates(now, latitude, longitude)

      Object.assign(msg, {
        payload: currentState,
        time: now.toDate(),
        startedAt: currentStateAt.toDate(),
        next: nextState,
        nextAt: nextStateAt.toDate(),
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
          `${currentState}, next: ${nextState} at ${nextStateAt.format(
            "HH:hh",
          )}`,
        )
      } else {
        this.status(currentState)
      }
    }
  }

  RED.nodes.registerType("sun", SunNode)

  RED.httpAdmin.get("/sun/events", function (req, res) {
    const events = computeSunEventTimesForMoment(
      moment(),
      req.query.latitude,
      req.query.longitude,
    )

    return res.json(events.map(([name, time]) => [name, time.format("HH:hh")]))
  })
}
