// One continuous position turns the whole hand around a shared bottom pivot.
// CSS owns the card face; this controller alone owns every card transform.
const ease = (u) => 1 - (1 - u) ** 4
const along = (values, distance) => {
  const i = Math.min(values.length - 2, Math.floor(distance))
  return values[i] + (values[i + 1] - values[i]) * Math.min(1, distance - i)
}

export function createFan({ items, reduced, phone, onFront, onSettle }) {
  const n = items.length
  const shades = items.map((item) => item.querySelector('.card-shade'))
  let position = 0
  let target = 0
  let direction = 1
  let front = -1
  let move = null
  let liftMove = null
  let lift = 0
  let inspection = false
  let queuedInspect = false
  let tilt = [0, 0]
  let raf = 0
  let settling = false
  let deliberate = false
  let repeated = false
  const wrap = (i) => ((i % n) + n) % n
  const near = (i) => {
    let d = (i - position) % n
    if (d > n / 2) d -= n
    if (d <= -n / 2) d += n
    return d
  }
  function render() {
    const lead = wrap(Math.round(position))
    const angles = phone.matches ? [0, 9, 16, 22] : [0, 12, 22, 30]
    items.forEach((item, i) => {
      const d = near(i)
      const a = Math.abs(d)
      const visible = a < 3
      item.classList.toggle('is-out', !visible)
      item.classList.toggle('is-pending', !item.querySelector('img').dataset.ready)
      item.classList.toggle('is-inspected', i === lead && inspection)
      if (!visible) return
      const own = i === lead ? lift : 0
      const scale = along([1, 1, 0.97, 0.94], a) * (1 + own * (phone.matches ? 0.04 : 0.06))
      const turn = own && !phone.matches ? ` rotateX(${tilt[0] * own}deg) rotateY(${tilt[1] * own}deg)` : ''
      item.style.transform = `rotate(${Math.sign(d) * along(angles, a)}deg) scale(${scale})${turn}`
      item.style.opacity = a <= 2 ? '1' : String(3 - a)
      item.style.zIndex = String(1000 - Math.round(a * 200) + (Math.sign(d) === direction ? 1 : 0))
      shades[i].style.opacity = String(Math.min(1, along([0, 0.42, 0.68, 0.85], a) + (i === lead ? 0 : 0.2 * lift)))
    })
    if (lead !== front) {
      front = lead
      onFront(front)
    }
  }
  function semantics() {
    items.forEach((item, i) => {
      const active = i === wrap(Math.round(position)) && !!item.querySelector('img').dataset.ready
      item.setAttribute('aria-hidden', String(!active))
      item.firstElementChild.tabIndex = active ? 0 : -1
      item.firstElementChild.setAttribute('aria-pressed', String(active && inspection))
    })
  }
  function sample(tween, now) {
    const u = Math.min(1, Math.max(0, (now - tween.start) / tween.duration))
    return [tween.from + (tween.to - tween.from) * ease(u), u === 1]
  }
  function advance(now) {
    if (move) {
      const [value, done] = sample(move, now)
      position = value
      if (done) move = null
    }
    if (liftMove) {
      const [value, done] = sample(liftMove, now)
      lift = value
      if (done) liftMove = null
    }
  }
  function schedule() {
    if (!raf && (move || liftMove) && !reduced.matches) raf = requestAnimationFrame(frame)
  }
  function settle() {
    if (!settling) return
    settling = false
    semantics()
    onSettle(front, { deliberate, repeated })
    deliberate = repeated = false
    if (queuedInspect) {
      queuedInspect = false
      inspect(true)
    }
  }
  function frame(now) {
    raf = 0
    advance(now)
    render()
    if (!move) settle()
    schedule()
  }
  function inspect(active) {
    if (move && active) {
      queuedInspect = true
      return
    }
    queuedInspect = false
    inspection = active
    tilt = [0, 0]
    if (reduced.matches) {
      lift = active ? 1 : 0
      liftMove = null
    } else liftMove = { from: lift, to: active ? 1 : 0, start: performance.now(), duration: active ? 300 : 220 }
    render()
    semantics()
    schedule()
  }
  function to(next, duration = 420, manual = false) {
    advance(performance.now())
    repeated = !!move || repeated
    deliberate ||= manual
    inspect(false)
    target = next
    direction = Math.sign(target - position) || direction
    settling = true
    if (reduced.matches || Math.abs(target - position) < 0.001) {
      position = target
      move = null
      render()
      settle()
    } else {
      move = { from: position, to: target, start: performance.now(), duration }
      schedule()
    }
  }
  return {
    get position() {
      return position
    },
    get target() {
      return target
    },
    get moving() {
      return !!move
    },
    get inspected() {
      return inspection || queuedInspect
    },
    to,
    inspect,
    refresh() {
      render()
      if (!move) semantics()
    },
    freeze() {
      advance(performance.now())
      move = null
      settling = false
      render()
      return { position, target }
    },
    drag(next) {
      if (reduced.matches) return
      direction = Math.sign(next - position) || direction
      position = next
      render()
    },
    tilt(x, y) {
      tilt = reduced.matches ? [0, 0] : [x, y]
      if (lift) render()
    },
    finish() {
      cancelAnimationFrame(raf)
      raf = 0
      position = target
      move = liftMove = null
      lift = inspection ? 1 : 0
      render()
      semantics()
      settle()
    },
  }
}
