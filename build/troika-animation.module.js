/*
 * Built-in easing functions for use in Troika animations. Any of the easings defined here
 * may be referred to within Tweens by their exported symbol name, or by reference.
 * 
 * The implementations here are roughly based on the logic from the jQuery Easing plugin
 * (original license blocks are maintained below for completeness), but they have been
 * significantly rewritten to use a single 0-1 time argument signature, converted to ES2015
 * syntax, and otherwise modified for succinctness or performance.
 */

const {pow, PI, sqrt} = Math;
const HALF_PI = PI / 2;
const TWO_PI = PI * 2;


// factories for common easing function patterns
function makeInOut(inFn, outFn) {
  return t => t < 0.5 ? inFn(t * 2) * 0.5 : outFn(t * 2 - 1) * 0.5 + 0.5
}
function makeExpIn(exp) {
  return t => pow(t, exp)
}
function makeExpOut(exp) {
  return t => 1 - pow(1 - t, exp)
}
function makeExpInOut(exp) {
  return t => t < 0.5 ?
    pow(t * 2, exp) * 0.5 :
    (1 - pow(1 - (t * 2 - 1), exp)) * 0.5 + 0.5
}


const linear$1 = t => t;

const easeInQuad = makeExpIn(2);
const easeOutQuad = makeExpOut(2);
const easeInOutQuad = makeExpInOut(2);

const easeInCubic = makeExpIn(3);
const easeOutCubic = makeExpOut(3);
const easeInOutCubic = makeExpInOut(3);

const easeInQuart = makeExpIn(4);
const easeOutQuart = makeExpOut(4);
const easeInOutQuart = makeExpInOut(4);

const easeInQuint = makeExpIn(5);
const easeOutQuint = makeExpOut(5);
const easeInOutQuint = makeExpInOut(5);

const easeInSine = t => 1 - Math.cos(t * (HALF_PI));
const easeOutSine = t => Math.sin(t * (HALF_PI));
const easeInOutSine = t => -0.5 * (Math.cos(PI * t) - 1);

const easeInExpo = t =>
  (t === 0) ? 0 : pow(2, 10 * (t - 1));

const easeOutExpo = t =>
  (t === 1) ? 1 : 1 - pow(2, -10 * t);

const easeInOutExpo = t =>
  (t === 0 || t === 1) ? t :
  t < 0.5 ?
    pow(2, 10 * (t * 2 - 1)) * 0.5 :
    (1 - pow(2, -10 * (t * 2 - 1))) * 0.5 + 0.5;

const easeInCirc = t =>
  1 - sqrt(1 - t * t);

const easeOutCirc = t =>
  sqrt(1 - pow(t - 1, 2));

const easeInOutCirc = makeInOut(easeInCirc, easeOutCirc);

const easeInElastic = t =>
  (t === 0 || t === 1) ? t : 1 - easeOutElastic(1 - t);

const easeOutElastic = t =>
  (t === 0 || t === 1) ? t :
    Math.pow(2, -10 * t) * Math.sin((t - 0.075) * TWO_PI / 0.3) + 1;

const easeInOutElastic = makeInOut(easeInElastic, easeOutElastic);

const easeInBack = t =>
  t * t * (2.70158 * t - 1.70158);

const easeOutBack = t =>
  (t -= 1) * t * (2.70158 * t + 1.70158) + 1;

const easeInOutBack = t => {
  const s = 1.70158 * 1.525;
  return (t *= 2) < 1 ? 
    0.5 * (t * t * ((s + 1) * t - s)) : 
    0.5 * ((t -= 2) * t * ((s + 1) * t + s) + 2)
};

const easeInBounce = t => 
  1 - easeOutBounce(1 - t);

const easeOutBounce = t => 
  t < (1 / 2.75) ? 
    (7.5625 * t * t) :
  t < (2 / 2.75) ? 
    (7.5625 * (t -= (1.5 / 2.75)) * t + .75) :
  t < (2.5 / 2.75) ? 
    (7.5625 * (t -= (2.25 / 2.75)) * t + .9375) :
    (7.5625 * (t -= (2.625 / 2.75)) * t + .984375);

const easeInOutBounce = makeInOut(easeInBounce, easeOutBounce);

// Aliases...?
// export {
//   easeInBack as swingFrom,
//   easeOutBack as swingTo,
//   easeInOutBack as swingFromTo,
//   easeOutBounce as bounce,
//   easeFrom
// }





// ===== License blocks from originating works: =====

/*
 * jQuery Easing v1.3 - http://gsgd.co.uk/sandbox/jquery/easing/
 *
 * Uses the built in easing capabilities added In jQuery 1.1
 * to offer multiple easing options
 *
 * TERMS OF USE - jQuery Easing
 *
 * Open source under the BSD License.
 *
 * Copyright Â© 2008 George McGinley Smith
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice, this list of
 * conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice, this list
 * of conditions and the following disclaimer in the documentation and/or other materials
 * provided with the distribution.
 *
 * Neither the name of the author nor the names of contributors may be used to endorse
 * or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 *  COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 *  GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED
 * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 *
*/

/*
 *
 * TERMS OF USE - EASING EQUATIONS
 *
 * Open source under the BSD License.
 *
 * Copyright Â© 2001 Robert Penner
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice, this list of
 * conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice, this list
 * of conditions and the following disclaimer in the documentation and/or other materials
 * provided with the distribution.
 *
 * Neither the name of the author nor the names of contributors may be used to endorse
 * or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 *  COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 *  GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED
 * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */

var Easings = /*#__PURE__*/Object.freeze({
	__proto__: null,
	linear: linear$1,
	easeInQuad: easeInQuad,
	easeOutQuad: easeOutQuad,
	easeInOutQuad: easeInOutQuad,
	easeInCubic: easeInCubic,
	easeOutCubic: easeOutCubic,
	easeInOutCubic: easeInOutCubic,
	easeInQuart: easeInQuart,
	easeOutQuart: easeOutQuart,
	easeInOutQuart: easeInOutQuart,
	easeInQuint: easeInQuint,
	easeOutQuint: easeOutQuint,
	easeInOutQuint: easeInOutQuint,
	easeInSine: easeInSine,
	easeOutSine: easeOutSine,
	easeInOutSine: easeInOutSine,
	easeInExpo: easeInExpo,
	easeOutExpo: easeOutExpo,
	easeInOutExpo: easeInOutExpo,
	easeInCirc: easeInCirc,
	easeOutCirc: easeOutCirc,
	easeInOutCirc: easeInOutCirc,
	easeInElastic: easeInElastic,
	easeOutElastic: easeOutElastic,
	easeInOutElastic: easeInOutElastic,
	easeInBack: easeInBack,
	easeOutBack: easeOutBack,
	easeInOutBack: easeInOutBack,
	easeInBounce: easeInBounce,
	easeOutBounce: easeOutBounce,
	easeInOutBounce: easeInOutBounce
});

/**
 * Simple numeric interpolator function
 */
function number(fromValue, toValue, progress) {
  return fromValue + (toValue - fromValue) * progress
}

/**
 * Interpolator for color values; decomposes the color into r/g/b channels and does
 * numeric interpolation on each individually. The result is a 24-bit integer value
 * holding the r/g/b channels in its 3 bytes.
 */
function color(fromValue, toValue, progress) {
  fromValue = colorValueToNumber(fromValue);
  toValue = colorValueToNumber(toValue);
  return rgbToNumber(
    number(fromValue >> 16 & 255, toValue >> 16 & 255, progress),
    number(fromValue >> 8 & 255, toValue >> 8 & 255, progress),
    number(fromValue & 255, toValue & 255, progress)
  )
}



/**
 * Utility for converting one of the supported color value types to a 24-bit numeric color
 * representation.
 * @param {*} value - The input value to translate. Supported types:
 * - 24-bit number: simply returned as is
 * - string value: evaluated using a canvas context, so supports color keywords, rgb(), hsl(), etc.
 * - a three.js `Color` object
 * @return {*}
 */
const colorValueToNumber = (function() {
  let colorCanvas, colorCanvasCtx;

  // Cache for evaluated string values
  let stringCache = Object.create(null);
  let stringCacheSize = 0;
  const stringCacheMaxSize = 2048;

  return function(value) {
    if (typeof value === 'number') {
      return value
    }
    else if (typeof value === 'string') {
      if (value in stringCache) {
        return stringCache[value]
      }

      // 2D canvas for evaluating string values
      if (!colorCanvas) {
        colorCanvas = document.createElement('canvas');
        colorCanvasCtx = colorCanvas.getContext('2d');
      }

      colorCanvas.width = colorCanvas.height = 1;
      colorCanvasCtx.fillStyle = value;
      colorCanvasCtx.fillRect(0, 0, 1, 1);
      const colorData = colorCanvasCtx.getImageData(0, 0, 1, 1).data;
      const result = rgbToNumber(colorData[0], colorData[1], colorData[2]);

      // Enforce max cache size - for now this invalidates the entire cache when reaching
      // the max size; we could use a true LRU cache but hitting the max size should be rare
      // in real world usage so this should suffice as a simple memory size protection.
      if (stringCacheSize > stringCacheMaxSize) {
        stringCache = Object.create(null);
        stringCacheSize = 0;
      }

      // Put into cache
      stringCache[value] = result;
      stringCacheSize++;

      return result
    }
    else if (value && value.isColor) {
      return value.getHex()
    }
    else {
      return 0 //fallback to black
    }
  }
})();

function rgbToNumber(r, g, b) {
  return r << 16 ^ g << 8 ^ b
}

var Interpolators = /*#__PURE__*/Object.freeze({
	__proto__: null,
	number: number,
	color: color
});

/*eslint no-unused-vars: "off"*/

/**
 * @interface AbstractTween
 * Defines the interface expected by `Runner` for tween-like things.
 */
class AbstractTween {
  /**
   * @abstract
   * For a given elapsed time relative to the start of the tween, calculates the value at that time and calls the
   * `callback` function with that value. If the given time is during the `delay` period, the callback will not be
   * invoked.
   * @param {number} time
   */
  gotoElapsedTime(time) {}

  /**
   * @abstract
   * Like `gotoElapsedTime` but goes to the very end of the tween.
   */
  gotoEnd() {}

  /**
   * @abstract
   * For a given elapsed time relative to the start of the tween, determines if the tween is in its completed end state.
   * @param {number} time
   * @return {boolean}
   */
  isDoneAtElapsedTime(time) {}
}

const linear = v => v;
const maxSafeInteger = 0x1fffffffffffff;

/**
 * @class Tween
 * Represents a transition between two values across a duration of time.
 *
 * Typically you will create a Tween between two values, with a callback function to handle the intermediate values,
 * and then start the Tween in a {@link Runner} which will start invoking the tween on each animation frame until
 * it reaches the end of its duration.
 *
 * @param callback {Function} a function that will be called with the current tween value at a given point in time.
 * @param fromValue {*} the beginning value
 * @param toValue {*} the ending value
 * @param duration {Number} the duration of the tween in milliseconds
 * @param [delay] {Number} optional time in milliseconds to wait before starting the tween
 * @param [easing] {Function|String} optional easing to be applied to the tween values. Can either be a function
 *        that takes a value from 0 to 1 and returns a corresponding "eased" value, or a string that matches the
 *        name of one of the common Penner easing functions - see http://easings.net/ Defaults to linear easing.
 * @param [iterations] {Number} optional number of times to repeat the tween animation. For endless repeating,
 *        specify `Infinity`.
 * @param [direction] {String} direction to run the tween; one of 'forward', 'reverse', or 'alternate'. For
 *        'alternate', it will toggle between forward and reverse on each iteration.
 * @param [interpolate] {String|Function} how tweened values should be calculated between the fromValue and toValue.
 *        Can be the string name for one of the built-in interpolators in Interpolators.js, or a custom function that
 *        will be passed 3 arguments: `fromValue`, `toValue`, and `progress` from 0 to 1.
 */
class Tween extends AbstractTween {
  constructor(callback, fromValue, toValue, duration=750, delay=0, easing=linear, iterations=1, direction='forward', interpolate='number') {
    super();
    this.callback = callback;
    this.fromValue = fromValue;
    this.toValue = toValue;
    this.duration = duration;
    this.delay = delay;
    this.easing = typeof easing === 'string' ? (Easings[easing] || linear) : easing;
    this.iterations = iterations;
    this.direction = direction;
    this.interpolate = typeof interpolate === 'function' ? interpolate : Interpolators[interpolate] || number;

    /**
     * @property totalElapsed
     * @type {number}
     * The total duration of this tween from 0 to its completion, taking into account its `duration`, `delay`, and
     * `iterations`. This is calculated once upon instantiation, and may be used to determine whether the tween is
     * finished or not at a given time.
     */
    this.totalElapsed = this.iterations < maxSafeInteger ? this.delay + (this.duration * this.iterations) : maxSafeInteger;
  }

  /**
   * For a given elapsed time relative to the start of the tween, calculates the value at that time and calls the
   * `callback` function with that value. If the given time is during the `delay` period, the callback will not be
   * invoked.
   * @param {number} time
   */
  gotoElapsedTime(time) {
    let duration = this.duration;
    let delay = this.delay;
    if (time >= delay) {
      time = Math.min(time, this.totalElapsed) - delay; //never go past final value
      let progress = (time % duration) / duration;
      if (progress === 0 && time !== 0) progress = 1;
      progress = this.easing(progress);
      if (this.direction === 'reverse' || (this.direction === 'alternate' && Math.ceil(time / duration) % 2 === 0)) {
        progress = 1 - progress;
      }
      this.callback(this.interpolate(this.fromValue, this.toValue, progress));
    }
  }

  /**
   * Like `gotoElapsedTime` but goes to the very end of the tween.
   */
  gotoEnd() {
    this.gotoElapsedTime(this.totalElapsed);
  }

  /**
   * For a given elapsed time relative to the start of the tween, determines if the tween is in its completed end state.
   * @param {number} time
   * @return {boolean}
   */
  isDoneAtElapsedTime(time) {
    return time > this.totalElapsed
  }
}

/**
 * A specialized Tween that controls one or more other tweens. The controlled tweens are treated as a
 * single unit and the easing/iterations/etc. are applied across the total duration of all tweens.
 */
class MultiTween extends Tween {
  constructor(tweens, duration, delay, easing, iterations, direction) {
    if (typeof duration !== 'number') {
      // Calculate duration based on the longest individual total duration
      duration = tweens.reduce((dur, tween) => Math.max(dur, tween.totalElapsed), 0);
    }
    if (duration === Infinity) {
      // Make an infinite duration finite, so easing math still works
      duration = Number.MAX_VALUE;
    }

    // Tween the total duration time
    super(null, 0, duration, duration, delay, easing, iterations, direction);
    if (tweens.length === 1) {
      this.callback = tweens[0].gotoElapsedTime.bind(tweens[0]);
    } else {
      tweens.sort(endTimeComparator); //sort by end time to ensure proper iteration in syncTweens
      this.callback = this._syncTweens;
    }
    this.tweens = tweens;
  }

  _syncTweens(time) {
    // NOTE: forward iteration is important here so the tweens are evaluated in order
    // of when they end; that way later tweens will take precedence over earlier ones.
    // TODO would be nice to ignore tweens past their totalElapsed entirely, but have to
    // figure out how to do that while ensuring they don't get stuck with a value that is
    // slightly prior to their end state.
    for (let i = 0, len = this.tweens.length; i < len; i++) {
      this.tweens[i].gotoElapsedTime(time);
    }
  }
}

function endTimeComparator(a, b) {
  return a.totalElapsed - b.totalElapsed
}

let runners = [];
let nextFrameTimer = null;
let hasStoppedRunners = false;

function noop() {}

function isRunnerRunning(runner) {return runner.runner$running}
function isTweenNotStopped(tween) {return !tween.runner$stopped}

function tick() {
  let now = Date.now();
  nextFrameTimer = null;

  // Filter out any runners that were stopped since last tick
  if (hasStoppedRunners) {
    runners = runners.filter(isRunnerRunning);
    hasStoppedRunners = false;
  }

  if (runners.length) {
    // Sync each runner, filtering out empty ones as we go
    for (let i = runners.length; i-- > 0;) {
      runners[i]._tick(now);
    }
    // Queue next tick if there are still active runners
    queueFrame();
  }
}

let _scheduler = window;

/**
 * Allow the scheduler to be modified, e.g. when switching to an immersive XRSession.
 *
 * TODO: we may want to only do this for a subset of animations, like just those subject to
 *  an XRSession, while letting others use the default. This global hook won't work for that.
 *
 * @param {{requestAnimationFrame, cancelAnimationFrame}} scheduler - an object holding
 *        the two scheduling functions.
 */
function setAnimationScheduler(scheduler) {
  scheduler = scheduler || window;
  if (scheduler !== _scheduler) {
    if (nextFrameTimer) {
      _scheduler.cancelAnimationFrame(nextFrameTimer);
      nextFrameTimer = null;
    }
    _scheduler = scheduler;
    queueFrame();
  }
}

function queueFrame() {
  if (!nextFrameTimer) {
    nextFrameTimer = _scheduler.requestAnimationFrame(tick);
  }
}


function startRunner(runner) {
  if (!runner.runner$running) {
    runner.runner$running = true;
    runners.push(runner);
    queueFrame();
  }
}

function stopRunner(runner) {
  runner.runner$running = false;
  hasStoppedRunners = true;
}


/**
 * @class Runner
 * A container for {@link Tween} instances that handles invoking them on each animation frame.
 */
class Runner {
  constructor() {
    this.tweens = [];
  }

  destructor() {
    this.tweens = null;
    stopRunner(this);
    this.start = this.stop = this.pause = this._tick = noop;
  }

  /**
   * Add a tween to the runner. It will be invoked on the next frame, not immediately.
   * @param {Tween} tween
   */
  start(tween) {
    // If previously paused, update start time to account for the duration of the pause
    if (tween.runner$paused && tween.runner$started) {
      tween.runner$started += (Date.now() - tween.runner$paused);
    } else {
      this.tweens.push(tween);
    }
    tween.runner$paused = null;
    tween.runner$stopped = false;

    // add runner to running runners
    startRunner(this);
  }

  /**
   * Remove a tween from the runner.
   * @param tween
   */
  stop(tween) {
    // queue tween for removal from list on next tick
    tween.runner$stopped = true;
    tween.runner$paused = null;
  }

  /**
   * Pause a tween; call `runner.start(tween)` to unpause it
   * @param tween
   */
  pause(tween) {
    if (!tween.runner$paused) {
      tween.runner$paused = Date.now();
    }
  }

  /**
   * Stop all running tweens.
   */
  stopAll() {
    if (this.tweens) {
      this.tweens.forEach(this.stop, this);
    }
  }

  _tick(now) {
    let tweens = this.tweens;
    let hasStoppedTweens = false;
    let hasRunningTweens = false;

    // Sync each tween, filtering out old finished ones as we go
    for (let i = 0, len = tweens.length; i < len; i++) {
      let tween = tweens[i];
      if (!tween.runner$stopped && !tween.runner$paused) {
        // Sync the tween to current time
        let elapsed = now - (tween.runner$started || (tween.runner$started = now));
        tween.gotoElapsedTime(elapsed);
        hasRunningTweens = true;

        // Queue for removal if we're past its end time
        if (tween.isDoneAtElapsedTime(elapsed)) {
          this.stop(tween);
          if (tween.onDone) {
            tween.onDone();
          }
        }
      }
      if (tween.runner$stopped) {
        hasStoppedTweens = true;
      }
    }

    if (hasRunningTweens) {
      this.onTick();
    }

    // Prune list if needed
    // TODO perhaps batch this up so it happens less often
    if (hasStoppedTweens) {
      this.tweens = tweens.filter(isTweenNotStopped);

      // remove runner from running runners if it has no tweens left
      if (!this.tweens.length) {
        stopRunner(this);
        if (this.onDone) {
          this.onDone();
        }
      }
    }
  }

  /**
   * Override to specify a function that will be called at the end of every frame, after all
   * tweens have been updated.
   */
  onTick() {
    // abstract
  }

  /**
   * Override to specify a function that will be called after all running tweens have completed.
   */
  onDone() {
    // abstract
  }
}

/**
 * Preset spring physics configurations.
 * For convenience, these match the presets defined by react-spring: https://www.react-spring.io/docs/hooks/api
 */
var PRESETS = {
  default: { mass: 1, tension: 170, friction: 26 },
  gentle: { mass: 1, tension: 120, friction: 14 },
  wobbly: { mass: 1, tension: 180, friction: 12 },
  stiff: { mass: 1, tension: 210, friction: 20 },
  slow: { mass: 1, tension: 280, friction: 60 },
  molasses: { mass: 1, tension: 280, friction: 120 }
};

// Factors to be applied to the tension and friction values; these match those used by
// react-spring internally, so that users can use the same spring configs as they would
// in react-spring.
const tensionFactor = 0.000001;
const frictionFactor = 0.001;

const DEFAULTS = PRESETS.default;

/**
 * @class SpringTween
 * Represents a transition between two values based on spring physics.
 *
 * This is very similar to `Tween`, except that it does not have a fixed duration. Instead, it advances a simple
 * spring physics simulation on each call to `gotoElapsedTime`. Since it depends on being advanced in forward-time
 * order, it cannot be repeated or run in a reverse direction. It is also not usable as a member of a `MultiTween`.
 *
 * The `toValue` property can be modified at any time while the simulation is running, and the velocity will be
 * maintained; this makes spring tweens more useful than duration-based tweens for objects whose target values are
 * changed rapidly over time, e.g. drag-drop.
 *
 * Non-numeric interpolations are not yet supported.
 *
 * @param callback {Function} a function that will be called with the current tween value at a given point in time.
 * @param {number} fromValue - the beginning value
 * @param {number} toValue - the initial ending value; this can be modified later by setting the `toValue` property
 * @param {string|object} springConfig - the physical configuration of the spring physics simulation. Either an object
 *        with `mass`, `tension`, and `friction` properties, or a string corresponding to one of the presets defined
 *        in `SpringPresets.js`. Defaults to the "default" preset.
 * @param {number} springConfig.mass - the mass of the simulated object being moved
 * @param {number} springConfig.tension - the spring's tension constant accelerating the simulated object
 * @param {number} springConfig.friction - the friction force decelerating the simulated object
 * @param {number} [initialVelocity] - velocity of the object at the start of the simulation
 * @param {number} [delay] optional time in milliseconds to wait before starting the simulation
 */
class SpringTween extends AbstractTween {
  constructor (
    callback,
    fromValue,
    toValue,
    springConfig,
    initialVelocity = 0,
    delay = 0
  ) {
    super();
    this.isSpring = true;
    this.callback = callback;
    this.currentValue = fromValue;
    this.toValue = toValue;
    this.velocity = initialVelocity;
    this.delay = delay;

    if (typeof springConfig === 'string') {
      springConfig = PRESETS[springConfig];
    }
    if (!springConfig) springConfig = DEFAULTS;
    const {mass, tension, friction} = springConfig;
    this.mass = typeof mass === 'number' ? mass : DEFAULTS.mass;
    this.tension = (typeof tension === 'number' ? tension : DEFAULTS.tension) * tensionFactor;
    this.friction = (typeof friction === 'number' ? friction : DEFAULTS.friction) * frictionFactor;
    this.minAcceleration = 1e-10; // in units/ms^2 - TODO make this configurable

    this.$lastTime = delay;
    this.$endTime = Infinity; //unknown until simulation is stepped to the end state
  }

  gotoElapsedTime (time) {
    if (time >= this.delay) {
      let { toValue, mass, tension, friction, minAcceleration } = this;
      let velocity = this.velocity || 0;
      let value = this.currentValue;

      // Step simulation by 1ms
      for (let t = this.$lastTime; t < time; t++) {
        const acceleration = (tension * (toValue - value) - friction * velocity) / mass;
        // Acceleration converges to zero near end state
        if (Math.abs(acceleration) < minAcceleration) {
          velocity = 0;
          value = toValue;
          this.$endTime = t;
          break
        } else {
          velocity += acceleration;
          value += velocity;
        }
      }
      this.velocity = velocity;
      this.$lastTime = time;
      this.callback(this.currentValue = value);
    }
  }

  gotoEnd () {
    this.velocity = 0;
    this.$lastTime = this.$endTime;
    this.callback(this.currentValue = this.toValue);
  }

  isDoneAtElapsedTime (time) {
    return time >= this.$endTime
  }
}

export { Easings, Interpolators, MultiTween, Runner, SpringTween, Tween, setAnimationScheduler };
