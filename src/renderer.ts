import type { KeyedToken, KeyedTokensInfo, MagicMoveRenderOptions } from './types'

const CLASS_PREFIX = 'shiki-magic-move'
const CLASS_LEAVE_FROM = `${CLASS_PREFIX}-leave-from`
const CLASS_LEAVE_TO = `${CLASS_PREFIX}-leave-to`
const CLASS_LEAVE_ACTIVE = `${CLASS_PREFIX}-leave-active`
const CLASS_ENTER_FROM = `${CLASS_PREFIX}-enter-from`
const CLASS_ENTER_TO = `${CLASS_PREFIX}-enter-to`
const CLASS_ENTER_ACTIVE = `${CLASS_PREFIX}-enter-active`
const CLASS_MOVE = `${CLASS_PREFIX}-move`
const CLASS_CONTAINER = `${CLASS_PREFIX}-container-resize`

interface PromiseWithResolve<T = void> extends Promise<T> {
  resolve: (value: T) => void
}

export const defaultOptions: Required<MagicMoveRenderOptions> = {
  globalScale: 1,
  duration: 500,
  delayMove: 0.3,
  delayLeave: 0.1,
  delayEnter: 0.7,
  delayContainer: 0.4,
  easing: 'ease',
  animateContainer: true,
}

export class MagicMoveRenderer {
  private mapDom = new Map<string, HTMLElement>()
  private container: HTMLElement
  private anchor: HTMLElement
  private previousPromises: PromiseWithResolve[] = []

  public options: Required<MagicMoveRenderOptions>

  private isFirstRender = true

  constructor(
    target: HTMLElement | string,
    options: MagicMoveRenderOptions = {},
  ) {
    this.options = {
      ...defaultOptions,
      ...options,
    }

    if (typeof target === 'string')
      this.container = document.querySelector(target) as HTMLElement
    else
      this.container = target

    // Create anchor
    this.anchor = document.createElement('span')
    this.anchor.style.position = 'absolute'
    this.anchor.style.top = '0'
    this.anchor.style.left = '0'
    this.anchor.style.height = '1px'
    this.anchor.style.width = '1px'

    this.container.prepend(this.anchor)
  }

  private updateTokenToEl(el: HTMLElement, token: KeyedToken) {
    if (token.content !== '\n') {
      el.textContent = token.content
      el.classList.add(`${CLASS_PREFIX}-item`)
    }
    if (token.htmlStyle)
      el.setAttribute('style', token.htmlStyle)
    if (token.color)
      el.style.color = token.color
    if (token.bgColor)
      el.style.backgroundColor = token.bgColor
  }

  private registerTransitionEnd(el: HTMLElement, cb: () => void) {
    let resolved = false
    let resolve = () => { }
    const promise = new Promise<void>((_resolve) => {
      const finish = (e: TransitionEvent) => {
        if (!e || e.target !== el)
          return
        resolve()
      }
      resolve = () => {
        if (resolved)
          return
        resolved = true
        el.removeEventListener('transitionend', finish)
        cb()
        _resolve()
      }
      el.addEventListener('transitionend', finish)
    }) as PromiseWithResolve<void>
    promise.resolve = resolve
    return promise
  }

  setCssVariables() {
    // Update CSS variables
    this.container.style.setProperty('--smm-duration', `${this.options.duration}ms`)
    this.container.style.setProperty('--smm-delay-move', `${this.options.delayMove}`)
    this.container.style.setProperty('--smm-delay-leave', `${this.options.delayLeave}`)
    this.container.style.setProperty('--smm-delay-enter', `${this.options.delayEnter}`)
    this.container.style.setProperty('--smm-delay-container', `${this.options.delayContainer}`)
    this.container.style.setProperty('--smm-easing', this.options.easing)
  }

  /**
   * Replace tokens without animation
   */
  replace(step: KeyedTokensInfo): void {
    const newDomMap = new Map<string, HTMLElement>()

    const newChildren = step.tokens.map((token) => {
      if (this.mapDom.has(token.key)) {
        const el = this.mapDom.get(token.key)!
        this.updateTokenToEl(el, token)
        newDomMap.set(token.key, el)
        this.mapDom.delete(token.key)
        return el
      }
      else {
        const el = document.createElement(token.content === '\n' ? 'br' : 'span')
        this.updateTokenToEl(el, token)
        newDomMap.set(token.key, el)
        return el
      }
    })

    this.container.replaceChildren(
      this.anchor,
      ...newChildren,
    )
    this.mapDom = newDomMap
  }

  /**
   * Render tokens with animation
   */
  render(step: KeyedTokensInfo): Promise<void> {
    // Note: This function is intentionally not async to keep the operations sync
    this.setCssVariables()

    const newDomMap = new Map<string, HTMLElement>()
    const move = new Set<HTMLElement>()
    const enter = new Set<HTMLElement>()
    const leave = new Set<HTMLElement>()
    const promises: PromiseWithResolve[] = []

    this.previousPromises.forEach(p => p.resolve())
    this.previousPromises = []

    const {
      globalScale: scale,
    } = this.options

    // Record the current position of the elements (before rerendering)
    const position = new Map<HTMLElement, { x: number, y: number }>()
    let anchorRect = this.anchor.getBoundingClientRect()
    const containerRect = this.container.getBoundingClientRect()
    for (const el of this.mapDom.values()) {
      const rect = el.getBoundingClientRect()
      position.set(el, { x: rect.x - anchorRect.x, y: rect.y - anchorRect.y })
    }

    const newChildren = step.tokens.map((token) => {
      if (this.mapDom.has(token.key)) {
        const el = this.mapDom.get(token.key)!
        this.updateTokenToEl(el, token)
        move.add(el)
        newDomMap.set(token.key, el)
        this.mapDom.delete(token.key)
        return el
      }
      else {
        const el = document.createElement(token.content === '\n' ? 'br' : 'span')
        this.updateTokenToEl(el, token)
        enter.add(el)
        newDomMap.set(token.key, el)
        return el
      }
    })

    for (const [_, el] of this.mapDom) {
      if (el.tagName === 'BR')
        continue
      leave.add(el)
    }

    for (const el of leave)
      el.style.position = 'absolute'

    // Update DOM
    this.container.replaceChildren(
      this.anchor,
      ...newChildren,
      ...leave,
    )

    this.mapDom = newDomMap

    // Callbacks to run after forced reflow
    const postReflow: (() => void)[] = []

    // Lock leave elements to their position with absolute positioning
    for (const el of leave) {
      el.style.position = 'absolute'
      const pos = position.get(el)!
      el.style.top = `${pos.y / scale}px`
      el.style.left = `${pos.x / scale}px`

      el.classList.add(CLASS_LEAVE_FROM)
      el.classList.add(CLASS_LEAVE_ACTIVE)

      postReflow.push(() => {
        el.classList.remove(CLASS_LEAVE_FROM)
        el.classList.add(CLASS_LEAVE_TO)
      })

      promises.push(
        this.registerTransitionEnd(el, () => {
          el.classList.remove(CLASS_LEAVE_FROM)
          el.classList.remove(CLASS_LEAVE_ACTIVE)
          el.classList.remove(CLASS_ENTER_TO)
          el.remove()
        }),
      )
    }

    // Apply enter animation
    if (!this.isFirstRender) {
      for (const el of enter) {
        el.classList.add(CLASS_ENTER_FROM)
        el.classList.add(CLASS_ENTER_ACTIVE)

        postReflow.push(() => {
          el.classList.remove(CLASS_ENTER_FROM)
          el.classList.add(CLASS_ENTER_TO)
        })

        promises.push(
          this.registerTransitionEnd(el, () => {
            el.classList.remove(CLASS_ENTER_FROM)
            el.classList.remove(CLASS_ENTER_ACTIVE)
            el.classList.remove(CLASS_ENTER_TO)
          }),
        )
      }
    }

    // We recalculate the anchor position because the container might be moved
    anchorRect = this.anchor.getBoundingClientRect()
    // Set the position of the move elements to the old position
    // Set the transition duration to 0ms to make it immediate
    for (const el of move) {
      const newRect = el.getBoundingClientRect()
      const newPos = { x: newRect.x - anchorRect.x, y: newRect.y - anchorRect.y }
      const oldPos = position.get(el)!
      el.style.transitionDuration = el.style.transitionDelay = '0ms'
      const dx = (oldPos.x - newPos.x) / scale
      const dy = (oldPos.y - newPos.y) / scale
      el.style.transform = `translate(${dx}px, ${dy}px)`

      postReflow.push(() => {
        // Remove transform overrides, so it will start animating back to the new position
        el.classList.add(CLASS_MOVE)
        el.style.transform = el.style.transitionDuration = el.style.transitionDelay = ''
      })

      promises.push(
        this.registerTransitionEnd(el, () => {
          el.classList.remove(CLASS_MOVE)
        }),
      )
    }

    // Animate the container size
    if (this.options.animateContainer && !this.isFirstRender) {
      const newRect = this.container.getBoundingClientRect()
      if (newRect.width !== containerRect.width || newRect.height !== containerRect.height) {
        this.container.style.transitionDuration = this.container.style.transitionDelay = '0ms'
        this.container.style.height = `${containerRect.height / scale}px`
        this.container.style.width = `${containerRect.width / scale}px`

        postReflow.push(() => {
          this.container.classList.add(CLASS_CONTAINER)
          this.container.style.transitionDuration = this.container.style.transitionDelay = ''
          this.container.style.height = `${newRect.height / scale}px`
          this.container.style.width = `${newRect.width / scale}px`
        })

        promises.push(
          this.registerTransitionEnd(this.container, () => {
            this.container.classList.remove(CLASS_CONTAINER)
            this.container.style.height = this.container.style.width = ''
          }),
        )
      }
    }

    // Trigger reflow to apply the transform
    forceReflow()

    postReflow.forEach(cb => cb())

    this.isFirstRender = false
    this.previousPromises = promises
    return Promise.all(promises).then()
  }
}

// synchronously force layout to put elements into a certain state
function forceReflow() {
  return document.body.offsetHeight
}
