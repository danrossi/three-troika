import { Vector3, Object3D, Sphere, ShaderChunk, UniformsUtils, MeshDepthMaterial, RGBADepthPacking, MeshDistanceMaterial, ShaderLib, Matrix4, Raycaster, Vector2, Quaternion, PerspectiveCamera, OrthographicCamera, Frustum, Ray, Group, HemisphereLightHelper, HemisphereLight, AmbientLight, DirectionalLightHelper, DirectionalLight, SpotLightHelper, SpotLight, PointLightHelper, PointLight, RectAreaLight, InstancedBufferGeometry, InstancedBufferAttribute, Scene, FogExp2, Fog, WebGLRenderer, Color, LinearSRGBColorSpace, NoToneMapping, CanvasTexture, BufferGeometry, MeshBasicMaterial, MeshLambertMaterial, MeshMatcapMaterial, MeshNormalMaterial, MeshPhongMaterial, MeshPhysicalMaterial, MeshStandardMaterial, MeshToonMaterial, Mesh, BoxGeometry, CircleGeometry, DoubleSide, PlaneGeometry, SphereGeometry } from 'three';

///// Miscellaneous Utility Functions /////


/**
 * Pseudo-polyfilled shortcut for `Object.assign`. Copies own properties from
 * second-and-after arguments onto the first object, overwriting any that already
 * exist, and returns the first argument.
 * @return {object}
 */
const assign$5 = Object.assign || _assign;

// Non-native impl; exported for access by tests
function _assign(/*target, ...sources*/) {
  let target = arguments[0];
  for (let i = 1, len = arguments.length; i < len; i++) {
    let source = arguments[i];
    if (source) {
      for (let prop in source) {
        if (source.hasOwnProperty(prop)) {
          target[prop] = source[prop];
        }
      }
    }
  }
  return target
}


/**
 * Like {@link assign}, but will ony copy properties that do _not_ already
 * exist on the target object.
 * @return {object}
 */
function assignIf(/*target, ...sources*/) {
  let target = arguments[0];
  for (let i = 1, len = arguments.length; i < len; i++) {
    let source = arguments[i];
    if (source) {
      for (let prop in source) {
        if (source.hasOwnProperty(prop) && !target.hasOwnProperty(prop)) {
          target[prop] = source[prop];
        }
      }
    }
  }
  return target
}

/**
 * Like {@link assign}, but for any property where the source and target are both
 * sub-objects, does a deep recursive copy.
 * @param {object} target
 * @param {object} source
 */
function assignDeep(target, source) {
  if (source) {
    for (let prop in source) {
      if (source.hasOwnProperty(prop)) {
        if (target[prop] && typeof target[prop] === 'object' && typeof source[prop] === 'object') {
          assignDeep(target[prop], source[prop]);
        } else {
          target[prop] = source[prop];
        }
      }
    }
  }
}


/**
 * Iterate over an object's own (non-prototype-inherited) properties
 * @param {object} object - The object to iterate over
 * @param {function} fn - A function that will be invoked for each iterated property. It
 *        will be passed three arguments:
 *        - value (the property value)
 *        - key (the property name)
 *        - object (the object being iterated over)
 * @param {*} [scope] - An optional object to be used as `this` when calling the `fn`
 */
function forOwn$2(object, fn, scope) {
  for (let prop in object) {
    if (object.hasOwnProperty(prop)) {
      fn.call(scope, object[prop], prop, object);
    }
  }
}


/**
 * Given an object instance, return a consistent unique id for it.
 * @type function
 * @param {Object} obj - The object instance
 * @return {string} id
 */
const getIdForObject = (() => {
  let objIds = new WeakMap();
  let lastId = 0;
  return function getIdForObject(obj) {
    let id = objIds.get(obj);
    if (!id) {
      objIds.set(obj, (id = `$id${++lastId}`));
    }
    return id
  }
})();


/**
 * Create a function that memoizes the result of another function based on the most
 * recent call's arguments and `this`. The arguments are compared using strict shallow equality.
 * @param {function} fn
 * @return {function}
 */
function memoize(fn) {
  let prevArgs, prevThis, prevResult;
  return function() {
    let changed = !prevArgs || this !== prevThis || arguments.length !== prevArgs.length;
    if (!changed) {
      for (let i = 0, len = arguments.length; i < len; i++) {
        if (arguments[i] !== prevArgs[i]) {
          changed = true;
          break
        }
      }
    }
    if (changed) {
      prevArgs = Array.prototype.slice.call(arguments);
      prevThis = this;
      prevResult = fn.apply(this, arguments);
    }
    return prevResult
  }
}


/**
 * Utility for the "extend-as" pattern used in several places to decorate facade
 * classes with extra capabilities.
 * @param {string} name - unique identifier for this class extension
 * @param {function} doExtend - the function that creates the actual class extension,
 *        this is passed the base class and will only be called once per base class.
 * @return {function(class): class}
 */
function createClassExtender(name, doExtend) {
  const cache = new WeakMap();
  return function(classToExtend) {
    let extended = cache.get(classToExtend);
    if (!extended) { //bidir check due to inheritance of statics
      extended = doExtend(classToExtend);
      cache.set(classToExtend, extended);
    }
    return extended
  }
}


/**
 * Determine whether a given object is a React element descriptor object, i.e. the
 * result of a JSX transpilation to React.createElement().
 * @param obj
 * @return {boolean}
 */
function isReactElement(obj) {
  const t = obj.$$typeof;
  return (t && t.toString && t.toString() === 'Symbol(react.element)') || false
}

var utils = /*#__PURE__*/Object.freeze({
	__proto__: null,
	assign: assign$5,
	_assign: _assign,
	assignIf: assignIf,
	assignDeep: assignDeep,
	forOwn: forOwn$2,
	getIdForObject: getIdForObject,
	memoize: memoize,
	createClassExtender: createClassExtender,
	isReactElement: isReactElement
});

/**
 * The base class for all Facade classes.
 *
 * A Facade is basically just a class that receives property assignments from a scene descriptor
 * and manages forwarding the resulting state to more complex underlying implementation
 * objects, e.g. ThreeJS objects.
 *
 * The instantiated facade objects have a very simple lifecycle:
 *   - The `constructor` in which the initial state and the underyling implementation object(s)
 *     can be initialized. It will be passed a single argument: the `parent` facade object.
 *   - Updates to the object's properties, usually by direct assignment from the scene descriptor.
 *     These updates can be handled immediately by defining property setters that handle syncing
 *     new values to the underyling implementation object(s).
 *   - The `afterUpdate()` method which signals the end of all property updates; this can be
 *     implemented to handle syncing the full set of updated properties to the underlying
 *     implementation object(s). Useful if an aspect of the syncing relies on multiple properties
 *     or needs things to be synced in a specific order.
 *   - The `destructor` method which is always called when the object is removed from the scene.
 *     Implement this to remove and clean up the underlying implementation object(s) and other
 *     cleanup logic.
 *
 * Scene Descriptors:
 *
 * All facade instances are created, updated, and destroyed based on the current structure of
 * a scene descriptor object. The properties in the descriptor are generally just copied
 * directly to properties of the same names on the facade instance, which can handle them
 * either by custom setters or in `afterUpdate`. There are a few special properties in the
 * descriptor:
 *
 *   - `facade`: (required) a reference to the Facade class that will be instantiated.
 *   - `key`: (recommended) an identifier that is unique amongst the descriptor's siblings, which
 *     is used to associate the descriptor with its corresponding Facade instance. One will be
 *     assigned automatically if omitted, but it's recommended that you set one manually to ensure
 *     descriptors are predictably resolved to the same facade instances when siblings are being
 *     added or removed. Not doing so can lead to unnecessary facade destruction/creation and/or
 *     unpredictable facade states.
 *   - `children`: (optional) for `Parent` facade subclasses, defines the child object descriptors.
 *   - `ref`: (optional) a function that will be called with a reference to the instantiated Facade
 *     on creation, and with `null` on destruction, allowing external code to maintain references
 *     to individual facades.
 *   - `transition`: (optional) defines a set of properties that should be transitioned smoothly
 *     when their value changes. See `Animatable` for more details.
 *   - `animation`: (optional) defines one or more keyframe animations. See `Animatable` for more
 *     details.
 *   - `exitAnimation`: (optional) defines a keyframe animation to run when the facade is removed
 *     from its parent.
 *   - `pointerStates`: (optional) defines sets of property values that should be used in place
 *     of those defined on the main object, when the user's pointer (mouse, touch, vr controller,
 *     etc.) is in `hover` or `active` interaction state with the facade. See `PointerStates`
 *     for more details.
 *
 * It is also possible to define facade descriptors using JSX (https://reactjs.org/docs/introducing-jsx.html),
 * if it is precompiled to `React.createElement` calls. In this case, use the facade class as the JSX
 * element name instead of a `facade` property, and child descriptors are defined as nested JSX elements i
 * nstead of a `children` property. *NOTE:* While this is often a nicer looking syntax than the plain JS object
 * form, be aware that the creation of JSX elements does carry a slight performance cost from extra logic
 * and object allocations, so you should avoid it when defining large numbers of facades or when updating
 * descriptors on every frame.
 */
class Facade {
  constructor(parent) {
    this.$facadeId = `facade${ idCounter++ }`;
    this.parent = parent;
  }

  /**
   * Performs a manual update of this facade, invoking the afterUpdate lifecycle method and triggering a
   * render. This can be called in event handlers, for example, to affect changes to this facade and its
   * subtree. This process is synchronous. Never override this method as a way to react to updates, as it
   * is not the only way a component is updated; instead override `afterUpdate` or use setters.
   * @param {object} [props] - A set of properties to be copied to the facade
   */
  update(props) {
    if (props && typeof props === 'object') {
      // Always assign transition and animation first
      this.transition = props.transition;
      this.animation = props.animation;
      for (let prop in props) {
        if (props.hasOwnProperty(prop) && !Facade.isSpecialDescriptorProperty(prop)) {
          this[prop] = props[prop];
        }
      }
    }
    this.afterUpdate();
    this.requestRender();
  }

  /**
   * Called at the end of an update batch, after all individual properties have been assigned.
   */
  afterUpdate() {
    // Handle calling ref function
    let ref = this.ref;
    if (ref !== this._lastRef) {
      if (typeof this._lastRef === 'function') {
        this._lastRef.call(null, null);
      }
      if (typeof ref === 'function') {
        ref.call(null, this);
        this._lastRef = ref;
      } else {
        this._lastRef = null;
      }
    }
  }

  /**
   * Dispatch a message with optional data up the facade parent tree.
   */
  notifyWorld(message, data) {
    if (this.parent) {
      this.parent.onNotifyWorld(this, message, data);
    }
  }

  /**
   * Default onNotifyWorld handler just bubbles it up the parent chain.
   */
  onNotifyWorld(source, message, data) {
    let notifiableParent = this._notifiableParent;
    if (notifiableParent) {
      notifiableParent.onNotifyWorld.call(notifiableParent, source, message, data);
    } else {
      // Optimization: on first call, walk up the tree looking for the first ancestor with a
      // non-default onNotifyWorld implementation, and save a pointer to that ancestor
      // facade so we can just call it directly the next time without any tree walking.
      notifiableParent = this.parent;
      let defaultImpl = Facade.prototype.onNotifyWorld;
      while (notifiableParent) {
        if (notifiableParent.onNotifyWorld !== defaultImpl) {
          this._notifiableParent = notifiableParent;
          notifiableParent.onNotifyWorld(source, message, data);
          break
        }
        notifiableParent = notifiableParent.parent;
      }
    }
  }

  /**
   * Notifies the top-level world manager that this object has changed in some way that affects its
   * visible rendering, so a rendering frame will be scheduled.
   */
  requestRender() {
    this.notifyWorld('needsRender');
  }

  traverse(fn) {
    fn(this);
  }

  forEachChild(fn) {
  }

  /**
   * Add an event listener for the given event type.
   * @param {String} type
   * @param {Function} handler
   */
  addEventListener(type, handler) {
    this.notifyWorld('addEventListener', {type, handler});
  }

  /**
   * Remove an event listener for the given event type.
   * @param {String} type
   * @param {Function} handler
   */
  removeEventListener(type, handler) {
    this.notifyWorld('removeEventListener', {type, handler});
  }

  /**
   * Dispatch an Event object on this facade, with DOM events bubbling logic.
   * @param {Event} event
   */
  dispatchEvent(event) {
    this.notifyWorld('dispatchEvent', event);
  }

  /**
   * Called when the instance is being removed from the scene. Override this to implement any
   * custom cleanup logic.
   */
  destructor() {
    // Unregister all event listeners from the world
    if (this.parent) {
      this.notifyWorld('removeAllEventListeners');
    }

    // Teardown refs
    if (typeof this.ref === 'function') {
      this.ref.call(null, null);
    }
    this.parent = this._notifiableParent = null;
  }
}

assign$5(Facade.prototype, {
  ref: null,
  _lastRef: null,
  _notifiableParent: null
});


let idCounter = 0;
const DEF_SPECIAL_PROPS = {key:1, facade:1, transition:1, animation:1};

/**
 * @static
 * Determine if a certain property name is one of the special descriptor properties
 */
Facade.isSpecialDescriptorProperty = function(name) {
  return DEF_SPECIAL_PROPS.hasOwnProperty(name)
};

/**
 * @static
 * Define a property name as an event handler for a given Facade class, so that it
 * automatically updates the global event registry when set.
 * @param {class} facadeClass - the class whose prototype the property should be defined on
 * @param {String} propName - the name of the event handler property, e.g. 'onMouseOver'
 * @param {String} eventType - the type of the event that will trigger the handler, e.g. 'mouseover'
 */
Facade.defineEventProperty = function(facadeClass, propName, eventType) {
  let privateProp = `${propName}➤handler`;
  Object.defineProperty(facadeClass.prototype, propName, {
    get() {
      return this[privateProp]
    },
    set(handler) {
      const oldHandler = this[privateProp];
      if ((handler || null) !== (oldHandler || null)) {
        // Remove old listener
        if (typeof oldHandler === 'function') {
          this.removeEventListener(eventType, oldHandler);
        }
        // Add new listener
        if (typeof handler === 'function') {
          this.addEventListener(eventType, handler);
        }
        this[privateProp] = handler;
      }
    }
  });
};

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

var Tween$1 = Tween;

/**
 * A specialized Tween that controls one or more other tweens. The controlled tweens are treated as a
 * single unit and the easing/iterations/etc. are applied across the total duration of all tweens.
 */
class MultiTween extends Tween$1 {
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

var MultiTween$1 = MultiTween;

let runners = [];
let nextFrameTimer = null;
let hasStoppedRunners = false;

function noop$1() {}

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
    this.start = this.stop = this.pause = this._tick = noop$1;
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

var Runner$1 = Runner;

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

var SpringTween$1 = SpringTween;

const DEFAULT_DURATION = 750;
const DEFAULT_EASING = 'easeOutCubic';

const TEMP_ARRAY$1 = [null];

function animationIdJsonReplacer(key, value) {
  return key === 'paused' ? undefined : value === Infinity ? 'Infinity' : value
}

function compareByTime(a, b) {
  return a.time - b.time
}

const extendAsAnimatable = createClassExtender('animatable', function(BaseFacadeClass) {
  class AnimatableFacade extends BaseFacadeClass {

    constructor(...args) {
      super(...args);

      // Create root runner for all this object's animation and transition tweens
      this.animation$runner = new Runner$1();
      this.animation$runner.onTick = () => {
        this.afterUpdate();
        this.requestRender();
      };
    }

    /**
     * Handle the special "transition" property. The descriptor should be an object with
     * transitionable property names as keys and transition parameters as values. The
     * transition parameters can either be objects describing the transition parameters,
     * or `true` for a default transition.
     *
     *   transition: {
     *     x: true, // uses a default duration-based transition
     *     y: 'spring', //uses a default spring-based transition
     *     z: {
     *       // ...custom transition config
     *     }
     *   }
     *
     * The custom transition config object can take one of two forms for duration- vs.
     * spring-based animations:
     *
     * Duration-based:
     *
     *   {
     *     duration: n, //in ms, defaults to 750
     *     easing: e, //easing function, defaults to 'easeOutCubic'
     *     delay: n, //in ms, defaults to 0
     *     interpolate: 'number' //one of the builtin named interpolators ('number', 'color', etc.) or a custom Function
     *   }
     *
     * Spring-based:
     *
     *   {
     *     spring: s, //either `true`, a named preset string e.g. "wobbly", or an object with {mass, tension, friction}
     *     delay: n //in ms, defaults to 0
     *   }
     *
     * Note that spring-based transitions do not currently support custom interpolations so they should only be used
     * for numeric values.
     */
    set transition(descriptor) {
      if (descriptor) {
        // Ensure setter/getter has been created for all props in transition
        for (let propName in descriptor) {
          if (descriptor.hasOwnProperty(propName)) {
            defineTransitionPropInterceptor(propName, this);
          }
        }
      }
      this.transition$descriptor = descriptor;
    }
    get transition() {
      return this.transition$descriptor
    }


    /**
     * Handle the special "animation" property. The descriptor should be an object or array
     * of objects defining a set of keyframes and their playback parameters. Keyframes are
     * defined by numeric keys from 0 to 100, each defining an object with the target
     * property values for that keyframe.
     *
     *   animation: [{
     *     0: {rotateZ: 0, color: 0x000000}, //can also use key "from"
     *     100: {rotateZ: Math.PI * 2, color: 0xffffff}, //can also use key "to"
     *     delay: 0, //starting delay in ms
     *     duration: 2000, //total anim duration in ms, defaults to 750
     *     easing: 'linear', //easing for the whole animation, defaults to 'linear'
     *     iterations: 5, //number of times to loop the animation, defaults to 1. Set to Infinity for endless loop.
     *     direction: 'forward', //either 'forward', 'backward', or 'alternate'
     *     interpolate: {color: 'color'}, //mapping of property names to Interpolators.js names or custom functions
     *     paused: false //if true the animation will be paused at its current position until set back to false
     *   }, ...]
     *
     * Internally the animations will be built into a set of nested tweens:
     *
     * |--------------------------- Main MultiTween ------------------------------------|
     *
     * |------------- Anim 1 MultiTween w/ easing+repeat ----------------|
     * |--- prop1 tween 1 ---|--- prop1 tween 2 ---|--- prop1 tween 3 ---|
     * |--------- prop2 tween 1 --------|--------- prop2 tween 2 --------|
     *
     *                    delay -->|-------- Anim 2 MultiTween w/ easing+repeat --------|
     *                             |----- prop3 tween 1 -----|----- prop3 tween 2 ------|
     *                             |------------------- prop4 tween --------------------|
     *                                            |----------- prop5 tween -------------|
     */
    set animation(descriptor) {
      if (this.animation$descriptor === descriptor) return
      this.animation$descriptor = descriptor;
      let oldAnimTweens = this.animation$tweens || null;
      let newAnimTweens = this.animation$tweens = descriptor ? Object.create(null) : null;
      let runner = this.animation$runner;
      let hasChanged = false;

      // Handle single object not wrapped in array
      if (descriptor && !Array.isArray(descriptor)) {
        TEMP_ARRAY$1[0] = descriptor;
        descriptor = TEMP_ARRAY$1;
      }

      if (descriptor) {
        for (let i = 0, len = descriptor.length; i < len; i++) {
          let animDesc = descriptor[i];
          if (!animDesc) continue

          // Calculate an identifier for this animation based on properties whose modification requires a new tween
          let animId = JSON.stringify(animDesc, animationIdJsonReplacer);
          //console.log(`${animId} - is ${oldAnimTweens && oldAnimTweens[animId] ? '' : 'not'} in old tweens`)

          // If a matching tween already exists, update it
          if (oldAnimTweens && (animId in oldAnimTweens)) {
            let tween = oldAnimTweens[animId];
            if (animDesc.paused) {
              runner.pause(tween);
            } else {
              runner.start(tween);
            }
            newAnimTweens[animId] = tween;
          }
          // Otherwise create a new tween
          else {
            let delay = 0;
            let duration = DEFAULT_DURATION;
            let easing = 'linear';
            let iterations = 1;
            let keyframes = [];
            let direction = 'forward';

            for (let key in animDesc) {
              if (animDesc.hasOwnProperty(key)) {
                switch(key) {
                  case 'duration':
                    duration = animDesc[key]; break
                  case 'delay':
                    delay = animDesc[key]; break
                  case 'easing':
                    easing = animDesc[key]; break
                  case 'iterations':
                    iterations = animDesc[key]; break
                  case 'direction':
                    direction = animDesc[key]; break
                  default: {
                    let percent = key === 'from' ? 0 : key === 'to' ? 100 : parseFloat(key);
                    if (!isNaN(percent) && percent >= 0 && percent <= 100) {
                      keyframes.push({time: percent / 100, props: animDesc[key]});
                      for (let animProp in animDesc[key]) {
                        if (animDesc[key].hasOwnProperty(animProp)) {
                          // Ensure setter is in place
                          defineTransitionPropInterceptor(animProp, this);
                          // Stop any active transition tweens for this property
                          let tweenKey = animProp + '➤anim:tween';
                          if (this[tweenKey]) {
                            runner.stop(this[tweenKey]);
                            this[tweenKey] = null;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }

            if (keyframes.length) {
              // Sort the keyframes by time
              keyframes.sort(compareByTime);
              if (keyframes[0].time > 0) {
                keyframes.unshift(assignIf({time: 0}, keyframes[0]));
              }

              // Build a MultiTween with tweens for each keyframe+property
              let keyframePropTweens = [];
              for (let j = 1, len = keyframes.length; j < len; j++) {
                let keyframe = keyframes[j];
                let props = keyframe.props;
                for (let prop in props) {
                  if (props.hasOwnProperty(prop)) {
                    let prevKeyframe = null;
                    for (let k = j; k--;) {
                      if (prop in keyframes[k].props) {
                        prevKeyframe = keyframes[k];
                        break
                      }
                    }
                    if (prevKeyframe) {
                      let propTween = new Tween$1(
                        this[prop + '➤anim:actuallySet'].bind(this), //callback
                        prevKeyframe.props[prop], //fromValue
                        props[prop], //toValue
                        (keyframe.time - prevKeyframe.time) * duration, //duration
                        prevKeyframe.time * duration, //delay
                        'linear', //easing
                        1, //iterations
                        'forward', //direction
                        animDesc.interpolate && animDesc.interpolate[prop] || 'number'
                      );
                      propTween.$$property = prop;
                      keyframePropTweens.push(propTween);
                    }
                  }
                }
              }
              let tween = newAnimTweens[animId] = new MultiTween$1(keyframePropTweens, duration, delay, easing, iterations, direction);
              if (!animDesc.paused) {
                runner.start(tween);
              }

              // The tween runner won't do anything until next tick, so immediately sync to the first frame's
              // properties if the animation has no delay to avoid a flash of bad initial state
              if (delay === 0) {
                let firstKeyframeProps = keyframes[0].props;
                for (let prop in firstKeyframeProps) {
                  if (firstKeyframeProps.hasOwnProperty(prop)) {
                    this[prop + '➤anim:actuallySet'](firstKeyframeProps[prop]);
                  }
                }
              }
            }

            hasChanged = true;
          }
        }
      }

      // Stop any obsolete tweens
      if (oldAnimTweens) {
        for (let animId in oldAnimTweens) {
          if (!newAnimTweens || !newAnimTweens[animId]) {
            let tween = oldAnimTweens[animId];
            tween.gotoEnd(); //force to end value so it doesn't stick partway through
            runner.stop(tween);
            hasChanged = true;
          }
        }
      }

      // If the total set of animations has changed, recalc the set of animating properties
      if (hasChanged) {
        if (newAnimTweens) {
          let animatingProps = this.animation$animatingProps = Object.create(null);
          for (let animId in newAnimTweens) {
            let propTweens = newAnimTweens[animId].tweens;
            for (let i = propTweens.length; i--;) {
              animatingProps[propTweens[i].$$property] = true;
            }
          }
        } else {
          this.animation$animatingProps = null;
        }
      }
    }
    get animation() {
      return this.animation$descriptor
    }

    destructor() {
      const runner = this.animation$runner;
      if (this.exitAnimation && !this.parent.isDestroying) {
        runner.stopAll();
        this.animation = this.exitAnimation;
        this.exitAnimation = this.transition = null;
        const onTick = runner.onTick;
        runner.onTick = () => {
          if (this.parent && !this.parent.isDestroying) {
            onTick();
          } else {
            // An ancestor may have been destroyed during our exit animation, orphaning this object;
            // catch this case and short-circuit the animation to prevent errors in subsequent ticks
            runner.onDone = null;
            this.destructor();
          }
        };
        runner.onDone = () => {
          this.requestRender();
          this.destructor();
        };
      } else {
        runner.destructor();
        super.destructor();
      }
    }
  }

  // Add get/set interceptor to the wrapper's prototype if this is the first time seeing this prop. Putting it
  // on the wrapper prototype allows us to avoid per-instance overhead as well as avoid collisions with
  // other custom setters anywhere else in the prototype chain.
  function defineTransitionPropInterceptor(propName, currentInstance) {
    if (!AnimatableFacade.prototype.hasOwnProperty(propName)) {
      let actualValueKey = `${ propName }➤anim:actualValue`;
      let actuallySetKey = `${ propName }➤anim:actuallySet`;
      let hasBeenSetKey = `${ propName }➤anim:hasBeenSet`;
      let activeTweenKey = `${ propName }➤anim:tween`;

      // Find the nearest getter/setter up the prototype chain, if one exists. Assuming the prototype won't change after the fact.
      let superGetter, superSetter;
      let proto = BaseFacadeClass.prototype;
      while (proto) {
        let desc = Object.getOwnPropertyDescriptor(proto, propName);
        if (desc) {
          superSetter = desc.set;
          superGetter = desc.get;
          if (superSetter && !superGetter || superGetter && !superSetter) {
            throw new Error(`Animatable: property ${propName} has a custom ${superSetter ? 'setter' : 'getter'} but no ${superSetter ? 'getter' : 'setter'}. Animatable properties must have both.`)
          }
          break
        }
        proto = Object.getPrototypeOf(proto);
      }

      // Function to set the value, bypassing the interceptor setter.
      // Use the super setter if available, otherwise store in a private-ish key
      let actuallySet = superSetter ? function actuallySet(value) {
        superSetter.call(this, value);
        if (!this[hasBeenSetKey]) {
          this[hasBeenSetKey] = true;
        }
      } : function actuallySet(value) {
        this[actualValueKey] = value;
        if (!this[hasBeenSetKey]) {
          this[hasBeenSetKey] = true;
        }
      };
      Object.defineProperty(AnimatableFacade.prototype, actuallySetKey, { value: actuallySet });


      // Add the custom getter/setter for this property
      Object.defineProperty(AnimatableFacade.prototype, propName, {
        get() {
          // Always return the current actual value
          return superGetter ? superGetter.call(this) : this[hasBeenSetKey] ? this[actualValueKey] : BaseFacadeClass.prototype[propName]
        },

        set(value) {
          // Will this value be controlled by an animation? Ignore it since animations take precedence.
          if (this.animation$animatingProps && this.animation$animatingProps[propName]) {
            return
          }

          // Does this value have a transition defined, and are the old/new values transitionable?
          let runner = this.animation$runner;
          let transition = this.transition;
          if (transition && transition[propName] && this[hasBeenSetKey] && transition.hasOwnProperty(propName)) {
            transition = transition[propName];
            let springConfig = transition === 'spring' ? 'default' : transition.spring;
            // If there's no active transition tween, or the new value is different than the active tween's
            // target value, initiate a new transition tween. Otherwise ignore it.
            let tween = this[activeTweenKey];
            let needsNewTween = false;
            if (tween) {
              // Active tween - start new one if new value is different than the old tween's target
              // value, unless they're both springs in which case update the original
              if (value !== tween.toValue) {
                if (springConfig && tween.isSpring) {
                  // TODO allow mid-simulation modification of spring config?
                  tween.toValue = value;
                } else {
                  runner.stop(tween);
                  needsNewTween = true;
                }
              }
            } else if (value !== this[propName]) {
              // No active tween - only start one if the value is changing
              needsNewTween = true;
            }
            if (needsNewTween) {
              tween = this[activeTweenKey] = springConfig
                ? new SpringTween$1(
                  actuallySet.bind(this), //callback
                  this[propName], //fromValue
                  value, //toValue
                  springConfig, //springConfig (mass, friction, tension)
                  0, //initialVelocity
                  transition.delay || 0 //delay
                )
                : new Tween$1(
                  actuallySet.bind(this), //callback
                  this[propName], //fromValue
                  value, //toValue
                  transition.duration || DEFAULT_DURATION, //duration
                  transition.delay || 0, //delay
                  transition.easing || DEFAULT_EASING, //easing
                  1, //iterations
                  'forward', //direction
                  transition.interpolate || 'number' //interpolate
                );
              tween.onDone = () => {
                tween = this[activeTweenKey] = null;
              };
              runner.start(tween);
            }
            return
          }

          // No animation or transition will be started; set the value.
          actuallySet.call(this, value);

          // Clean up obsolete stuff
          let tween = this[activeTweenKey];
          if (tween) runner.stop(tween);
          this[activeTweenKey] = null;
        }
      });
    }


    // If the instance had this property set before the intercepting setter was added to the
    // prototype, that would continue to take precedence, so move its value to the private property.
    if (currentInstance.hasOwnProperty(propName)) {
      currentInstance[`${ propName }➤anim:actualValue`] = currentInstance[propName];
      currentInstance[`${ propName }➤anim:hasBeenSet`] = true;
      delete currentInstance[propName];
    }

  }

  return AnimatableFacade
});

/**
 * Allows a facade to be configured with an optional `pointerStates` property, which defines
 * sets of property values that should be used in place of the object's actual values when
 * the user interacts with the facade using their pointer device (mouse, touch, vr controller, etc.)
 * This is not used directly, but is automatically wrapped by `ParentFacade` and `ListFacade` when
 * setting up their children if the `pointerStates` property is present.
 *
 * The `pointerStates` property should point to an object with `hover` and/or `active` properties,
 * each of which is an object holding the individual properties to be used in those states. Any
 * properties defined in `active` will take precedence over those defined in `hover`.
 *
 * The properties will honor any `transition`s defined for them, but the `transition` must be
 * defined on the facade's main configuration object, not within the pointerStates themselves.
 */
const extendAsPointerStatesAware = createClassExtender('pointerStates', function(BaseFacadeClass) {
  const isHoveringProp = '➤pntr:isHovering';
  const isActiveProp = '➤pntr:isActive';
  const propsWithInterceptors = Object.create(null);

  class PointerStatesAware extends BaseFacadeClass {
    constructor(parent) {
      super(parent);
      this.addEventListener('mouseover', hoverOverHandler);
      this.addEventListener('mouseout', hoverOutHandler);
      this.addEventListener('mousedown', activeDownHandler);
      this.addEventListener('mouseup', activeUpHandler);
    }

    afterUpdate() {
      this._applyPointerStates();
      super.afterUpdate();
    }

    _applyPointerStates() {
      const pointerStates = this.pointerStates;
      const hoverValuesToUse = (pointerStates && this[isHoveringProp] && pointerStates.hover) || null;
      const activeValuesToUse = (pointerStates && this[isActiveProp] && pointerStates.active) || null;

      const lastAppliedValues = this['➤pntr:lastAppliedValues'] || propsWithInterceptors;
      const appliedValues = this['➤pntr:lastAppliedValues'] =
        (hoverValuesToUse || activeValuesToUse) ? assign$5(Object.create(null), hoverValuesToUse, activeValuesToUse) : null;

      if (appliedValues) {
        for (let prop in appliedValues) {
          definePropInterceptor(prop, this);
          actuallySet(this, prop, appliedValues[prop]);
        }
      }

      if (lastAppliedValues) {
        for (let prop in lastAppliedValues) {
          if (!appliedValues || !(prop in appliedValues)) {
            actuallySet(this, prop, this[`${prop}➤pntr:baseValue`]);
          }
        }
      }
    }
  }

  // Flag for identification
  Object.defineProperty(PointerStatesAware.prototype, 'isPointerStateAware', {value: true});

  // Add get/set interceptor to the wrapper's prototype if this is the first time seeing this prop. Putting it
  // on the wrapper prototype allows us to avoid per-instance overhead as well as avoid collisions with
  // other custom setters anywhere else in the prototype chain.
  function definePropInterceptor(propName, currentInstance) {
    // On first set for this instance, move the prop's previous value, if any, to the private property
    const hasBeenSetProp = `${propName}➤pntr:hasBeenSet`;
    if (!currentInstance[hasBeenSetProp]) {
      currentInstance[`${ propName }➤pntr:baseValue`] = currentInstance[propName];
      delete currentInstance[propName]; //remove own prop so it doesn't override the prototype getter/setter
      currentInstance[hasBeenSetProp] = true;
    }

    if (!PointerStatesAware.prototype.hasOwnProperty(propName)) {
      propsWithInterceptors[propName] = 1;
      const baseValueProp = `${ propName }➤pntr:baseValue`;
      const appliedValueProp = `${propName}➤pntr:appliedValue`;

      Object.defineProperty(PointerStatesAware.prototype, propName, {
        get() {
          const superGetter = getSuperGetter(propName);
          return superGetter ? superGetter.call(this) :
            (appliedValueProp in this) ? this[appliedValueProp] :
            this[baseValueProp]
        },

        set(value) {
          this[baseValueProp] = value;
        }
      });
    }
  }

  function actuallySet(instance, propName, value) {
    const superSetter = getSuperSetter(propName);
    if (superSetter) {
      superSetter.call(instance, value);
    } else {
      instance[`${propName}➤pntr:appliedValue`] = value;
    }
  }

  function getSuperGetter(propName) {
    let proto = BaseFacadeClass.prototype;
    if (propName in proto) { //prefilter across entire proto chain
      while (proto) {
        let desc = Object.getOwnPropertyDescriptor(proto, propName);
        if (desc && desc.get) {
          return desc.get
        }
        proto = Object.getPrototypeOf(proto);
      }
    }
    return null
  }

  function getSuperSetter(propName) {
    let proto = BaseFacadeClass.prototype;
    if (propName in proto) { //prefilter across entire proto chain
      while (proto) {
        let desc = Object.getOwnPropertyDescriptor(proto, propName);
        if (desc && desc.set) {
          return desc.set
        }
        proto = Object.getPrototypeOf(proto);
      }
    }
    return null
  }

  function hoverOverHandler(e) {
    e.currentTarget[isHoveringProp] = true;
    afterPointerStateChange(e);
  }
  function hoverOutHandler(e) {
    e.currentTarget[isHoveringProp] = e.currentTarget[isActiveProp] = false;
    afterPointerStateChange(e);
  }
  function activeDownHandler(e) {
    e.currentTarget[isActiveProp] = true;
    afterPointerStateChange(e);
  }
  function activeUpHandler(e) {
    e.currentTarget[isActiveProp] = false;
    afterPointerStateChange(e);
  }

  function afterPointerStateChange(e) {
    let highestFacade = e.currentTarget;
    let parent = highestFacade.parent;
    while (parent && parent.shouldUpdateChildren()) {
      if (parent.isPointerStateAware) {
        highestFacade = parent;
      }
      parent = parent.parent;
    }
    highestFacade.afterUpdate();
    highestFacade.requestRender();
  }

  return PointerStatesAware
});

/**
 * ListFacade is an optimized way to define a large number of scene objects based on an array of data.
 * Unlike mapping a data array to `children` objects in the scene descriptor, ListFacade allows you to
 * define only a single "template" descriptor object whose properties are either constant values
 * or accessor functions that get invoked for each data item. The resulting property values are
 * then applied directly to the implementation objects, without creating any intermediary objects.
 *
 * Example:
 *
 *     {
 *       key: 'balls',
 *       facade: ListFacade,
 *       data: itemsData,
 *       template: {
 *         key: (item, i, all) => `ball_${ item.id }`,
 *         facade: Ball,
 *         x: (item, i, all) => item.time,
 *         y: (item, i, all) => item.count,
 *         radius: 10,
 *         color: (item, i, all) => item.important ? 0xff0000 : 0xcccccc
 *       }
 *     }
 */
class List extends Facade {
  constructor(parent) {
    super(parent);
    this._orderedItemKeys = [];
  }

  afterUpdate() {
    let {data, template} = this;
    let hasData = data && data.length && Array.isArray(data);

    if (this.shouldUpdateChildren()) {
      let oldDict = this._itemsDict || null;
      let newDict = this._itemsDict = hasData ? Object.create(null) : null;
      let orderedItemKeys = this._orderedItemKeys;

      if (hasData) {
        orderedItemKeys.length = data.length;

        for (let i = 0, len = data.length; i < len; i++) {
          let childData = data[i];
          let key = template.key(childData, i, data);
          let facadeClass = template.facade;
          while(newDict[key]) {
            key += '|dupe';
          }

          // If a transition/animation is present, upgrade the class to a Animatable class on demand.
          // NOTE: changing between animatable/non-animatable results in a full teardown/recreation
          // of this instance *and its entire subtree*, so try to avoid that by always including the `transition`
          // definition if the object is expected to ever need transitions, even if it's temporarily empty.
          let transition = typeof template.transition === 'function' ? template.transition(childData, i, data) : template.transition;
          let animation = typeof template.animation === 'function' ? template.animation(childData, i, data) : template.animation;
          let exitAnimation = typeof template.exitAnimation === 'function' ? template.exitAnimation(childData, i, data) : template.exitAnimation;
          if (transition || animation || exitAnimation) {
            facadeClass = extendAsAnimatable(facadeClass);
          }

          // Same for pointer states
          let pointerStates = template.pointerStates;
          if (pointerStates === 'function' ? pointerStates(childData, i, data) : pointerStates) {
            facadeClass = extendAsPointerStatesAware(facadeClass);
          }

          // If we have an old instance with the same key and class, reuse it; otherwise instantiate a new one
          let oldImpl = oldDict && oldDict[key];
          let newImpl;
          if (oldImpl && oldImpl.constructor === facadeClass) {
            newImpl = oldImpl;
          } else {
            // If swapping instance need to destroy the old before creating the new, e.g. for `ref` call ordering
            if (oldImpl) oldImpl.destructor();
            newImpl = new facadeClass(this);
          }
          //always set transition/animation before any other props
          newImpl.transition = transition;
          newImpl.animation = animation;
          for (let prop in template) {
            if (template.hasOwnProperty(prop) && !Facade.isSpecialDescriptorProperty(prop)) {
              newImpl[prop] = typeof template[prop] === 'function' ? template[prop](childData, i, data) : template[prop];
            }
          }
          newImpl.afterUpdate();
          newDict[key] = newImpl;
          orderedItemKeys[i] = key;
        }
      }

      // Destroy all old child instances that were not reused or replaced
      if (oldDict) {
        for (let key in oldDict) {
          if (!newDict || !newDict[key]) {
            oldDict[key].destructor();
          }
        }
      }
    }

    super.afterUpdate();
  }

  /**
   * Override to selectively prevent updating the ListFacade's items on `afterUpdate`, for
   * potential performance gain.
   * @returns {boolean}
   */
  shouldUpdateChildren() {
    return true
  }

  /**
   * Walk this facade's descendant tree, invoking a function for it and each descendant.
   * The iteration order will match the order in which the `data` items were declared. It may
   * also include items that have been queued for removal but not yet removed, e.g. facades
   * in the process of an `exitAnimation`.
   * @param {Function} fn
   * @param {Object} [thisArg]
   */
  traverse(fn, thisArg) {
    fn.call(thisArg, this);
    let keys = this._orderedItemKeys;
    let dict = this._itemsDict;
    for (let i = 0, len = keys.length; i < len; i++) {
      dict[keys[i]].traverse(fn, thisArg);
    }
  }

  /**
   * Iterate over this facade's direct child facades, invoking a function for each.
   * The iteration order will match the order in which the `data` items were declared. It may
   * also include items that have been queued for removal but not yet removed, e.g. facades
   * in the process of an `exitAnimation`.
   * @param {Function} fn
   * @param {Object} [thisArg]
   */
  forEachChild(fn, thisArg) {
    let keys = this._orderedItemKeys;
    let dict = this._itemsDict;
    for (let i = 0, len = keys.length; i < len; i++) {
      fn.call(thisArg, dict[keys[i]], keys[i]);
    }
  }

  destructor() {
    this.isDestroying = true;
    // Destroy all child instances
    let dict = this._itemsDict;
    if (dict) {
      for (let key in dict) {
        dict[key].destructor();
      }
    }
    super.destructor();
  }
}

const TEMP_ARRAY = [null];

/**
 * @typedef {object} FacadeDescriptor
 * An object describing the type and properties of a child facade to be created and managed by
 * its parent. See the detailed description in the docs for {@link Facade.js}.
 * @property {class} facade
 * @property {string|number} [key]
 */


/**
 * Base facade class for objects that have `children`. Manages creating and destroying child
 * facade instances as needed as its `children` array changes.
 *
 * If you need to create a large number of child objects based on an array of incoming data,
 * consider using a `ListFacade` instead of a parent object with a large `children` array, since
 * that requires only a single template descriptor object instead of one for every child.
 */
class ParentFacade extends Facade {
  constructor(parent) {
    super(parent);

    /**
     * @member {FacadeDescriptor | Array<FacadeDescriptor>} children
     * Descriptors for one or more child facades.
     */
    this.children = null;

    this._orderedChildKeys = [];
  }

  afterUpdate() {
    if (this.shouldUpdateChildren()) {
      this.updateChildren(this.describeChildren());
    }
    super.afterUpdate();
  }

  /**
   * Return the descriptor(s) for the actual children to be created and managed. By default
   * this simply returns the value of the `children` property set by the parent, but you can
   * override it to customize how the child content should be structured, for instance to wrap
   * the `children` within a deeper structure, add in anonymous child siblings, or modify the
   * `children` configurations.
   * @protected
   * @return {FacadeDescriptor | Array<FacadeDescriptor>}
   */
  describeChildren() {
    return this.children
  }

  /**
   * Override to selectively prevent traversing to child nodes on `afterUpdate`, for
   * potential performance gain.
   * @returns {boolean}
   */
  shouldUpdateChildren() {
    return true
  }

  updateChildren(children) {
    const oldDict = this._childrenDict || null;
    let newDict = this._childrenDict = null;
    const orderedChildKeys = this._orderedChildKeys;
    orderedChildKeys.length = 0;

    if (children) {
      // Allow single child without wrapper array
      if (!Array.isArray(children)) {
        TEMP_ARRAY[0] = children;
        children = TEMP_ARRAY;
      }

      for (let i = 0, len = children.length; i < len; i++) {
        let childDesc = children[i];
        if (!childDesc) continue //child members can be null
        if (!newDict) {
          newDict = this._childrenDict = Object.create(null);
        }

        // Handle child descriptors defined via a JSX->React.createElement() transforms (ReactElement objects)
        const isJSX = isReactElement(childDesc);
        let propsObj = isJSX ? childDesc.props : childDesc;
        let facadeClass = isJSX ? childDesc.type : childDesc.facade;

        // Find this child's key; if not specified by the author, build one from the facade class name
        let key = childDesc.key;
        if (!key) {
          let j = 0;
          do {
            key = `auto:${facadeClass.name}:${j++}`;
          } while (newDict[key])
        }
        if (newDict[key]) {
          while(newDict[key]) {
            key += '|dupe';
          }
        }

        // If a transition/animation is present, upgrade the class to a Animatable class on demand.
        // NOTE: changing between animatable/non-animatable results in a full teardown/recreation
        // of this instance *and its entire subtree*, so try to avoid that by always including the `transition`
        // definition if the object is expected to ever need transitions, even if it's temporarily empty.
        let transition = propsObj.transition;
        let animation = propsObj.animation;
        if (transition || animation || propsObj.exitAnimation) {
          facadeClass = extendAsAnimatable(facadeClass);
        }

        // Same for pointer states
        if (propsObj.pointerStates) {
          facadeClass = extendAsPointerStatesAware(facadeClass);
        }

        // If we have an old instance with the same key and class, update it, otherwise instantiate a new one
        let oldImpl = oldDict && oldDict[key];
        let newImpl;
        if (oldImpl && oldImpl.constructor === facadeClass) {
          newImpl = oldImpl;
        } else {
          // If swapping instance need to destroy the old before creating the new, e.g. for `ref` call ordering
          if (oldImpl) oldImpl.destructor();
          newImpl = new facadeClass(this);
        }
        //always set transition/animation before any other props
        newImpl.transition = transition;
        newImpl.animation = animation;
        for (let prop in propsObj) {
          if (propsObj.hasOwnProperty(prop) && !Facade.isSpecialDescriptorProperty(prop)) {
            newImpl[prop] = propsObj[prop];
          }
        }
        newDict[key] = newImpl;
        orderedChildKeys.push(key);
        newImpl.afterUpdate();
      }
    }

    // Destroy all old child instances that were not reused or replaced
    if (oldDict) {
      for (let key in oldDict) {
        if (!newDict || !newDict[key]) {
          oldDict[key].destructor();
        }
      }
    }
  }

  getChildByKey(key) {
    let dict = this._childrenDict;
    return dict && dict[key] || null
  }

  /**
   * Walk this facade's descendant tree, invoking a function for it and each descendant.
   * The iteration order will match the order in which the `children` were declared. It may
   * also include items that have been queued for removal but not yet removed, e.g. facades
   * in the process of an `exitAnimation`.
   * @param {Function} fn
   * @param {Object} [thisArg]
   */
  traverse(fn, thisArg) {
    fn.call(thisArg, this);
    const keys = this._orderedChildKeys;
    const dict = this._childrenDict;
    for (let i = 0, len = keys.length; i < len; i++) {
      dict[keys[i]].traverse(fn, thisArg);
    }
  }

  /**
   * Iterate over this facade's direct child facades, invoking a function for each.
   * The iteration order will match the order in which the `children` were declared. It may
   * also include items that have been queued for removal but not yet removed, e.g. facades
   * in the process of an `exitAnimation`.
   * @param {Function} fn
   * @param {Object} [thisArg]
   */
  forEachChild(fn, thisArg) {
    const keys = this._orderedChildKeys;
    const dict = this._childrenDict;
    for (let i = 0, len = keys.length; i < len; i++) {
      fn.call(thisArg, dict[keys[i]], keys[i]);
    }
  }

  destructor() {
    this.isDestroying = true;
    // Destroy all child instances
    let dict = this._childrenDict;
    if (dict) {
      for (let key in dict) {
        dict[key].destructor();
      }
    }
    super.destructor();
  }
}

const pointerMotionEventProps = [
  'onMouseOver',
  'onMouseOut',
  'onMouseMove',
  'onDragStart',
  'onDrag',
  'onDragEnter',
  'onDragOver',
  'onDragLeave'
];

const pointerActionEventProps = [
  'onMouseDown',
  'onMouseUp',
  'onClick',
  'onDoubleClick',
  'onDrop',
  'onDragEnd',
  'onWheel'
];

const pointerActionEventTypes = pointerActionEventProps.map(eventPropToType);
const pointerMotionEventTypes = pointerMotionEventProps.map(eventPropToType);

const pointerEventProps = pointerMotionEventProps.concat(pointerActionEventProps);
const pointerEventTypes = pointerMotionEventTypes.concat(pointerActionEventTypes);

function eventPropToType(prop) {
  return prop === 'onDoubleClick' ? 'dblclick' : prop.replace(/^on/, '').toLowerCase()
}


class PointerEventTarget extends ParentFacade {
  /**
   * Determine if this PointerEventTarget should intercept pointer events:
   * - By default only facades with a pointer event listener assigned will be counted, to prevent being blocked by unwanted objects
   * - If an object should definitely block events from objects behind it, set `pointerEvents:true`
   * - If an object has one of the pointer event properties but should be ignored in picking, set `pointerEvents:false`
   */
  interceptsPointerEvents(eventRegistry) {
    if (this.pointerEvents === false) {
      return false
    }
    if (this.pointerEvents) {
      return true
    }
    for (let i = 0, len = pointerEventTypes.length; i < len; i++) {
      if (eventRegistry.hasFacadeListenersOfType(this, pointerEventTypes[i])) {
        return true
      }
    }
  }
}


Object.defineProperty(PointerEventTarget.prototype, 'isPointerEventTarget', {value: true});


// Add handlers for pointer event properties
pointerEventProps.forEach(propName => {
  Facade.defineEventProperty(PointerEventTarget, propName, eventPropToType(propName));
});

/**
 * @class EventRegistry
 * Utility for tracking event listeners by type and target facade
 */
function EventRegistry() {
  const byEventType = Object.create(null);

  this.addListenerForFacade = (facade, type, handler) => {
    const listenersOfType = byEventType[type] || (byEventType[type] = {
      count: 0,
      byFacadeId: Object.create(null)
    });
    const facadeId = facade.$facadeId;
    const oldHandlers = listenersOfType.byFacadeId[facadeId];
    // No listeners for this facade yet; set handler function as single value to avoid
    // unnecessary array creation in the common single-listener case.
    if (!oldHandlers) {
      listenersOfType.count++;
      listenersOfType.byFacadeId[facadeId] = handler;
    }
    // Already multiple listeners; add to array if not already present
    else if (Array.isArray(oldHandlers)) {
      if (oldHandlers.indexOf(handler) === -1) {
        listenersOfType.count++;
        oldHandlers.push(handler);
      }
    }
    // Second unique listener; promote to array
    else if (oldHandlers !== handler) {
      listenersOfType.count++;
      listenersOfType.byFacadeId[facadeId] = [oldHandlers, handler];
    }
  };

  this.removeListenerForFacade = (facade, type, handler) => {
    const listenersOfType = byEventType[type];
    const facadeId = facade.$facadeId;
    const oldHandlers = listenersOfType && listenersOfType.byFacadeId[facadeId];
    // Single listener; delete from map
    if (oldHandlers === handler) {
      listenersOfType.count--;
      delete listenersOfType.byFacadeId[facadeId];
    }
    // Multiple listeners; remove from array
    else if (Array.isArray(oldHandlers)) {
      const idx = oldHandlers.indexOf(handler);
      if (idx > -1) {
        listenersOfType.count--;
        // Delete from map if the array will be empty; we don't demote from array to single
        // item because it can result in unneeded churn in the likely case of a different
        // listener being added immediately after
        if (oldHandlers.length === 1) {
          delete listenersOfType.byFacadeId[facadeId];
        } else {
          oldHandlers.splice(idx, 1);
        }
      }
    }
  };

  this.removeAllListenersForFacade = (facade) => {
    const facadeId = facade.$facadeId;
    for (let type in byEventType) {
      let facadeListeners = byEventType[type].byFacadeId[facadeId];
      if (facadeListeners) {
        byEventType[type].count -= (Array.isArray(facadeListeners) ? facadeListeners.length : 1);
        delete byEventType[type].byFacadeId[facadeId];
      }
    }
  };

  this.hasFacadeListenersOfType = (facade, type) => {
    return byEventType[type] ? !!byEventType[type].byFacadeId[facade.$facadeId] : false
  };

  this.hasAnyListenersOfType = (type) => {
    return byEventType[type] ? byEventType[type].count > 0 : false
  };

  this.findBubblingEventTarget = (targetFacade, eventType) => {
    while (targetFacade) {
      if (this.hasFacadeListenersOfType(targetFacade, eventType)) {
        return targetFacade
      }
      targetFacade = targetFacade.parent;
    }
    return null
  };

  function tryCall(func, scope, arg1, arg2) {
    try {
      func.call(scope, arg1, arg2);
    } catch(err) {
    }
  }

  this.forEachFacadeListenerOfType = (facade, type, callback, scope) => {
    const listenersOfType = byEventType[type];
    const facadeId = facade.$facadeId;
    const handlers = listenersOfType && listenersOfType.byFacadeId[facadeId];
    if (handlers) {
      if (Array.isArray(handlers)) {
        for (let i = 0; i < handlers.length; i++) {
          tryCall(callback, scope, handlers[i], facadeId);
        }
      } else {
        tryCall(callback, scope, handlers, facadeId);
      }
    }
  };

  this.forEachListenerOfType = (type, callback, scope) => {
    const listenersOfType = byEventType[type];
    if (listenersOfType && listenersOfType.count > 0) {
      for (let facadeId in listenersOfType.byFacadeId) {
        const facadeListeners = listenersOfType.byFacadeId[facadeId];
        if (Array.isArray(facadeListeners)) {
          for (let i = 0; i < facadeListeners.length; i++) {
            tryCall(callback, scope, facadeListeners[i], facadeId);
          }
        } else {
          tryCall(callback, scope, facadeListeners, facadeId);
        }
      }
    }
  };

  this.dispatchEventOnFacade = (facade, event) => {
    let currentTarget = facade;
    function callHandler(handler) {
      handler.call(currentTarget, event);
    }
    event.target = facade;
    while (currentTarget && !event.propagationStopped) { //TODO should defaultPrevented mean anything here?
      event.currentTarget = currentTarget;
      this.forEachFacadeListenerOfType(currentTarget, event.type, callHandler, null);
      if (event.bubbles) {
        currentTarget = currentTarget.parent;
      } else {
        break
      }
    }
  };
}

const TAP_DISTANCE_THRESHOLD = 10;
const TAP_GESTURE_MAX_DUR = 300;
const TAP_DBLCLICK_MAX_DUR = 300;
const DEFAULT_EVENT_SOURCE = {};

const domPointerMotionEventTypes = [
  'mousemove',
  'mouseout',
  'touchmove'
];
const domPointerActionEventTypes = [
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'wheel',
  'touchstart',
  'touchend',
  'touchcancel'
];
const dropEventTypes = [
  'mouseup',
  'touchend',
  'touchcancel'
];
const pointerActionEventTypeMappings = {
  'touchstart': 'mousedown',
  'touchend': 'mouseup',
  'touchcancel': 'mouseup'
};

const touchDragPropsToNormalize = ['clientX', 'clientY', 'screenX', 'screenY', 'pageX', 'pageY'];

class SyntheticEvent {
  constructor(nativeEvent, type, target, relatedTarget, extraProps) {
    // Copy native event properties - TODO investigate using a Proxy
    for (let prop in nativeEvent) {
      // NOTE: we don't check hasOwnProperty in this loop because properties that will return
      // false for properties that are defined by getters on inherited prototypes
      if (typeof nativeEvent[prop] !== 'function') {
        this[prop] = nativeEvent[prop];
      }
    }

    // Adjust to custom params
    this.target = target;
    this.relatedTarget = relatedTarget;
    this.type = type;
    this.nativeEvent = nativeEvent;
    assign$5(this, extraProps);

    // normalize position properties on touch events with a single touch, to facilitate
    // downstream handlers that expect them to look like mouse events
    // NOTE: can't do this in _normalizePointerEvent() as these props are unwritable on native Event objects
    if (nativeEvent.touches) {
      let touches = isTouchEndOrCancel(nativeEvent) ? nativeEvent.changedTouches : nativeEvent.touches;
      if (touches.length === 1) {
        touchDragPropsToNormalize.forEach(prop => {
          this[prop] = touches[0][prop];
        });
      }
    }
  }

  preventDefault() {
    this.defaultPrevented = true;
    this.nativeEvent.preventDefault();
  }

  stopPropagation() {
    this.propagationStopped = true;
    this.nativeEvent.stopPropagation();
  }
}

function isTouchEndOrCancel(e) {
  return e.type === 'touchend' || e.type === 'touchcancel'
}

function killEvent(e) {
  e.stopPropagation();
  e.preventDefault();
}


class WorldBaseFacade extends ParentFacade {
  constructor(element) {
    super(null);

    this.width = this.height = 1;
    this._element = element;
    this._htmlOverlays = Object.create(null);

    // Bind events
    this.eventRegistry = new EventRegistry();
    this._onPointerMotionEvent = this._onPointerMotionEvent.bind(this);
    this._onPointerActionEvent = this._onPointerActionEvent.bind(this);
    this._onDropEvent = this._onDropEvent.bind(this);
    this._togglePointerListeners(true);
  }

  afterUpdate() {
    this._queueRender();
    super.afterUpdate();
  }

  onNotifyWorld(source, message, data) {
    let handler = this._notifyWorldHandlers[message];
    if (handler) {
      handler.call(this, source, data);
    }
  }

  _isContinuousRender() {
    return this.continuousRender
  }

  /**
   * @property {{requestAnimationFrame, cancelAnimationFrame}} renderingScheduler
   * The object holding `requestAnimationFrame` and `cancelAnimationFrame` scheduling
   * functions. Defaults to `window` but can be switched to another implementation, e.g.
   * to use an XRSession's custom scheduler.
   */
  set renderingScheduler(scheduler) {
    scheduler = scheduler || window;
    if (scheduler !== this.renderingScheduler) {
      const activeHandle = this._nextFrameTimer;
      if (activeHandle) {
        this.renderingScheduler.cancelAnimationFrame(activeHandle);
        this._nextFrameTimer = null;
      }
      this._renderingScheduler = scheduler;
    }
  }
  get renderingScheduler() {
    return this._renderingScheduler || window
  }

  // Schedule a render pass on the next frame
  _queueRender() {
    if (!this._nextFrameTimer) {
      const handler = this._nextFrameHandler || (this._nextFrameHandler = (...args) => {
        let {onStatsUpdate, onBeforeRender, onAfterRender} = this;
        let start = onStatsUpdate && Date.now();

        if (onBeforeRender) onBeforeRender(this);

        this.doRender(...args);

        if (onStatsUpdate) {
          let now = Date.now();
          onStatsUpdate({
            'Render CPU Time (ms)': now - start,
            'Time Between Frames (ms)': this._lastFrameTime ? now - this._lastFrameTime : '?',
            'FPS': this._lastFrameTime ? Math.round(1000 / (now - this._lastFrameTime)) : '?'
          });
          this._lastFrameTime = now;
        }

        this._doRenderHtmlItems();

        if (onAfterRender) onAfterRender(this);

        this._nextFrameTimer = null;

        if (this._isContinuousRender()) {
          this._queueRender();
        }
      });
      this._nextFrameTimer = this.renderingScheduler.requestAnimationFrame(handler);
    }
  }

  /**
   * @abstract
   */
  doRender(/*...frameArgs*/) {
  }

  /**
   * @abstract
   */
  getFacadeUserSpaceXYZ(/*facade*/) {
  }

  _doRenderHtmlItems() {
    if (this.renderHtmlItems) {
      let htmlItemsData = [];
      let overlayFacades = this._htmlOverlays;
      for (let key in overlayFacades) {
        let facade = overlayFacades[key];
        let data = this.getFacadeUserSpaceXYZ(facade);
        if (data.z >= 0) { //Ignore objects with negative z (behind the camera)
          data.key = facade.$facadeId;
          data.html = facade.html;
          data.exact = facade.exact;
          htmlItemsData.push(data);
        }
      }
      this.renderHtmlItems(htmlItemsData);
    }
  }

  /**
   * Hook allowing world implementations to pre-normalize native pointer events, for instance
   * computing derived worldspace properties that are simpler for downstream code to use.
   * @param {Event} e
   * @protected
   */
  _normalizePointerEvent(e) {
  }

  /**
   * Entry point for handling events related to pointer motion (e.g. mouse or touch movement).
   * This will be called by the code that wraps this World facade to bridge native DOM events
   * into the Troika world.
   * @param {Event} e
   */
  _onPointerMotionEvent(e) {
    this._normalizePointerEvent(e);
    const eventState = this._getPointerEventState(e);

    if (pointerMotionEventTypes.some(this.eventRegistry.hasAnyListenersOfType)) {
      const hoverInfo = (e.type === 'mouseout' || isTouchEndOrCancel(e)) ? null : this._findHoverTarget(e);
      let lastHovered = eventState.hoveredFacade;
      let hovered = eventState.hoveredFacade = hoverInfo && hoverInfo.facade;

      let dragInfo = eventState.dragInfo;
      if (dragInfo) {
        if (!dragInfo.dragStartFired) {
          this._firePointerEvent('dragstart', dragInfo.dragStartEvent, dragInfo.draggedFacade, null, hoverInfo);
          dragInfo.dragStartFired = true;
        }
        this._firePointerEvent('drag', e, dragInfo.draggedFacade, null, hoverInfo);
      }

      if (hovered !== lastHovered) {
        if (lastHovered) {
          this._firePointerEvent('mouseout', e, lastHovered, hovered, hoverInfo);
          if (dragInfo) {
            this._firePointerEvent('dragleave', e, lastHovered, hovered, hoverInfo);
          }
        }
        if (hovered) {
          this._firePointerEvent('mouseover', e, hovered, lastHovered, hoverInfo);
          if (dragInfo) {
            this._firePointerEvent('dragenter', e, hovered, lastHovered, hoverInfo);
          }
        }
      }
      if (hovered) {
        this._firePointerEvent('mousemove', e, hovered, null, hoverInfo);
        if (dragInfo) {
          this._firePointerEvent('dragover', e, hovered, null, hoverInfo);
        }
      }
    }

    // Cancel tap gesture if moving past threshold
    let tapInfo = eventState.tapInfo;
    if (tapInfo && e.type === 'touchmove') {
      let touch = e.changedTouches[0];
      if (touch && Math.sqrt(Math.pow(touch.clientX - tapInfo.x, 2) + Math.pow(touch.clientY - tapInfo.y, 2)) > TAP_DISTANCE_THRESHOLD) {
        eventState.tapInfo = null;
      }
    }
  }

  /**
   * Entry point for handling events related to pointer motion (e.g. mouse clicks or touch taps).
   * This will be called by the code that wraps this World facade to bridge native DOM events
   * into the Troika world.
   * @param {Event} e
   */
  _onPointerActionEvent(e) {
    this._normalizePointerEvent(e);

    // Handle drop events, in the case they weren't captured by the listeners on `document`
    // e.g. synthetic events dispatched internally
    if (dropEventTypes.indexOf(e.type) > -1) {
      this._onDropEvent(e);
    }

    // Map touch start to mouseover, and disable touch-hold context menu
    if (e.type === 'touchstart') {
      if (e.touches.length === 1) {
        this._onPointerMotionEvent(e);
      }
      this._enableContextMenu(false);
    }

    const eventRegistry = this.eventRegistry;
    if (eventRegistry.hasAnyListenersOfType('dragstart') || pointerActionEventTypes.some(eventRegistry.hasAnyListenersOfType)) {
      let hoverInfo = this._findHoverTarget(e);
      let facade = hoverInfo && hoverInfo.facade;
      if (facade) {
        const eventState = this._getPointerEventState(e);
        this._firePointerEvent(pointerActionEventTypeMappings[e.type] || e.type, e, facade, null, hoverInfo);

        // touchstart/touchend could be start/end of a tap - map to click
        if (eventRegistry.findBubblingEventTarget(facade, 'click') || eventRegistry.findBubblingEventTarget(facade, 'dblclick')) {
          let tapInfo = eventState.tapInfo;
          if (e.type === 'touchstart' && e.touches.length === 1) {
            eventState.tapInfo = {
              facade: facade,
              x: e.touches[0].clientX,
              y: e.touches[0].clientY,
              startTime: Date.now(),
              isDblClick: tapInfo && Date.now() - tapInfo.startTime < TAP_DBLCLICK_MAX_DUR
            };
          } else {
            if (
              tapInfo && tapInfo.facade === facade && e.type === 'touchend' &&
              e.touches.length === 0 && e.changedTouches.length === 1 &&
              Date.now() - tapInfo.startTime < TAP_GESTURE_MAX_DUR
            ) {
              this._firePointerEvent('click', e, facade, null, hoverInfo);
              if (tapInfo.isDblClick) {
                this._firePointerEvent('dblclick', e, facade, null, hoverInfo);
              }
            }
          }
        }

        // mousedown/touchstart could be prepping for drag gesture
        if (e.type === 'mousedown' || e.type === 'touchstart') {
          const dragger = eventRegistry.findBubblingEventTarget(facade, 'dragstart');
          if (dragger) {
            let dragStartEvent = new SyntheticEvent(e, 'dragstart', dragger, null, {intersection: hoverInfo});
            eventState.dragInfo = {
              draggedFacade: dragger,
              dragStartFired: false,
              dragStartEvent: dragStartEvent
            };
            // handle release outside canvas
            this._toggleDropListeners(true);
          }
        }
      }
      e.preventDefault(); //prevent e.g. touch scroll
    }

    // Map touch end to mouseout
    if (isTouchEndOrCancel(e)) {
      if (e.changedTouches.length === 1) {
        this._onPointerMotionEvent(e);
      }
      this._enableContextMenu(true);
    }
  }

  _onDropEvent(e) {
    const eventState = this._getPointerEventState(e);
    let dragInfo = eventState.dragInfo;
    if (dragInfo) {
      this._normalizePointerEvent(e);
      let hoverInfo = this._findHoverTarget(e);
      let targetFacade = hoverInfo && hoverInfo.facade;
      if (targetFacade) {
        this._firePointerEvent('drop', e, targetFacade, null, hoverInfo);
      }
      this._firePointerEvent('dragend', e, dragInfo.draggedFacade, null, hoverInfo);
      this._toggleDropListeners(false);
      eventState.dragInfo = null;
    }
  }

  _firePointerEvent(eventType, originalEvent, targetFacade, relatedTargetFacade, intersection) {
    let newEvent = (originalEvent instanceof SyntheticEvent) ?
      originalEvent :
      new SyntheticEvent(
        originalEvent,
        eventType,
        targetFacade,
        relatedTargetFacade,
        {
          bubbles: true,
          intersection
        }
      );
    // Dispatch with bubbling
    this.eventRegistry.dispatchEventOnFacade(targetFacade, newEvent);
  }

  _getPointerEventState(e) {
    const states = this._pointerEventStates || (this._pointerEventStates = new WeakMap());
    const eventSource = e.eventSource || DEFAULT_EVENT_SOURCE;
    let eventState = states.get(eventSource);
    if (!eventState) {
      states.set(eventSource, eventState = {});
    }
    return eventState
  }

  _toggleDropListeners(on) {
    dropEventTypes.forEach(type => {
      document[(on ? 'add' : 'remove') + 'EventListener'](type, this._onDropEvent, true);
    });
  }

  _togglePointerListeners(on) {
    let canvas = this._element;
    if (canvas && on !== this._pointerListenersAttached) {
      let method = (on ? 'add' : 'remove') + 'EventListener';
      domPointerMotionEventTypes.forEach(type => {
        canvas[method](type, this._onPointerMotionEvent, false);
      });
      domPointerActionEventTypes.forEach(type => {
        canvas[method](type, this._onPointerActionEvent, false);
      });
      this._pointerListenersAttached = on;
    }
  }

  _enableContextMenu(enable) {
    let canvas = this._element;
    if (canvas) {
      canvas[(enable ? 'remove' : 'add') + 'EventListener']('contextmenu', killEvent, true);
    }
  }

  /**
   * @abstract
   * Given a pointer-related Event, find and return all facade objects that are intersected
   * by that event. If any hits are found, this should return an array of objects that contain
   * at least `facade` and `distance` properties. Any additional properties will be exposed to
   * event listeners on the synthetic event object as an `intersection` property.
   * @param {Event} e
   * @param {Function} [filterFn]
   * @return {Array<{facade, distance, ?distanceBias, ...}>|null}
   */
  getFacadesAtEvent(e, filterFn) {
    throw new Error('getFacadesAtEvent: no impl')
  }

  _findHoverTarget(e) {
    //only handle single touches for now
    if (e.touches && e.touches.length > 1) {
      return null
    }

    let allHits = this.getFacadesAtEvent(e, facade =>
      facade.isPointerEventTarget && facade.interceptsPointerEvents(this.eventRegistry)
    );
    if (allHits) {
      // Find the closest by comparing distance, or distanceBias if distance is the same
      let closestHit = allHits[0];
      for (let i = 1; i < allHits.length; i++) {
        if (allHits[i].distance < closestHit.distance ||
          (allHits[i].distance === closestHit.distance && (allHits[i].distanceBias || 0) < (closestHit.distanceBias || 0))
        ) {
          closestHit = allHits[i];
        }
      }
      return closestHit
    }

    return null
  }

  destructor() {
    if (this._nextFrameTimer) {
      this.renderingScheduler.cancelAnimationFrame(this._nextFrameTimer);
    }
    this._togglePointerListeners(false);
    this._toggleDropListeners(false);
    super.destructor();
  }

}

Object.defineProperty(WorldBaseFacade.prototype, 'isWorld', {value: true});

WorldBaseFacade.prototype._notifyWorldHandlers = {
  needsRender() {
    this._queueRender();
  },
  addEventListener(source, data) {
    this.eventRegistry.addListenerForFacade(source, data.type, data.handler);
  },
  removeEventListener(source, data) {
    this.eventRegistry.removeListenerForFacade(source, data.type, data.handler);
  },
  removeAllEventListeners(source) {
    this.eventRegistry.removeAllListenersForFacade(source);
  },
  dispatchEvent(source, event) {
    if (!(event instanceof SyntheticEvent)) {
      event = new SyntheticEvent(event, event.type, event.target, event.relatedTarget);
    }
    this.eventRegistry.dispatchEventOnFacade(source, event);
  },
  addHtmlOverlay(source) {
    this._htmlOverlays[source.$facadeId] = source;
  },
  removeHtmlOverlay(source) {
    delete this._htmlOverlays[source.$facadeId];
  },
  statsUpdate(source, data) {
    let onStatsUpdate = this.onStatsUpdate;
    if (onStatsUpdate) onStatsUpdate(data);
  }
};

const {assign: assign$4, forOwn: forOwn$1} = utils;
const singletonVec3 = new Vector3();
const singletonVec3b = new Vector3();
const notifyWorldGetter = (function() {
  const obj = {
    callback: function(pos) {
      obj.value = pos;
    },
    value: null
  };
  return obj
})();
const removedEvent = {type: 'removed'};
const singletonIntersects = [];

function ascDistanceSort(a, b) {
  return a.distance - b.distance
}

function canObjectBeOrphaned(obj) {
  return obj.isRenderable === false && (
    !obj.children.length || obj.children.every(canObjectBeOrphaned)
  )
}

let _worldMatrixVersion = 0;
let _geometrySphereVersion = 0;

class Object3DFacade extends PointerEventTarget {
  constructor(parent, threeObject) {
    super(parent);

    if (!threeObject) {
      threeObject = this.initThreeObject();
    }

    // We'll track matrix updates manually
    threeObject.matrixAutoUpdate = false;

    // Set bidirectional refs
    this.threeObject = threeObject;
    threeObject.$facade = this;

    // Subclasses may set isRenderable=false on the threeObject, to trigger some scene graph optimizations.
    // The first is to remove it from all layer masks to short-circuit WebGLRenderer.projectObject.
    let isRenderable = threeObject.isRenderable !== false;
    if (!isRenderable) {
      threeObject.layers.mask = 0;
    }

    // Add it as a child of the nearest parent threeObject, if one exists
    while (parent) {
      if (parent.isObject3DFacade) {
        this._parentObject3DFacade = parent; //reference to nearest Object3DFacade ancestor
        if (isRenderable) {
          this._addToThreeObjectTree();
        }
        break
      }
      parent = parent.parent;
    }

    this.notifyWorld('object3DAdded');
  }

  /**
   * Lifecycle method, called at constructor time, that creates and returns a Three.js `Object3D`
   * instance which will become the `threeObject` for this facade. This is a more ergonomic
   * alternative than overriding the constructor to pass the `threeObject` as a second argument
   * to the super() call. By default it creates a plain Object3D marked as non-renderable so it
   * is not added to the Three.js tree.
   * @return {Object3D}
   * @protected
   */
  initThreeObject() {
    const obj = new Object3D();
    obj.isRenderable = false; //trigger optimizations
    return obj
  }

  afterUpdate() {
    // Update matrix and worldMatrix before processing children
    this.updateMatrices();
    this._checkBoundsChange();

    // If the world matrix was modified, and we won't be doing an update pass on child facades due
    // to `shouldUpdateChildren` optimization, we need to manually update their matrices to match.
    if (this._worldMatrixVersion > this._worldMatrixVersionAfterLastUpdate) {
      if (!this.shouldUpdateChildren()) {
        this.traverse((facade, rootFacade) => {
          if (facade !== rootFacade && facade.updateMatrices) {
            facade.updateMatrices();
            facade._checkBoundsChange();
          }
        }, this);
      }
      this._worldMatrixVersionAfterLastUpdate = this._worldMatrixVersion;
    }

    // Process children
    super.afterUpdate();

    // If any children were removed during the update, remove them from the threejs
    // object in a single batch; this avoids threejs's very expensive single-item remove.
    this._flushQueuedChildRemovals();
  }

  /**
   * Update the underlying threeObject's `matrix` and `matrixWorld` to the current state if necessary.
   * This bypasses the `updateMatrix` and `updateMatrixWorld` methods of the threejs objects with a more
   * efficient approach that doesn't require traversing the entire tree prior to every render. This is possible
   * since we control the update lifecycle; as long as this is called from the `afterUpdate` lifecycle
   * method or later, it can be safely assumed that the world matrices of all ancestors have already been
   * similarly updated so the result should always be accurate.
   */
  updateMatrices() {
    let threeObj = this.threeObject;
    let parent3DFacade = this._parentObject3DFacade;
    let needsWorldMatrixUpdate;
    if (this._matrixChanged) {
      threeObj.matrix.compose(threeObj.position, threeObj.quaternion, threeObj.scale);
      this._matrixChanged = false;
      needsWorldMatrixUpdate = true;
    } else {
      needsWorldMatrixUpdate = parent3DFacade && parent3DFacade._worldMatrixVersion > this._worldMatrixVersion;
    }
    if (needsWorldMatrixUpdate) {
      if (parent3DFacade) {
        threeObj.matrixWorld.multiplyMatrices(parent3DFacade.threeObject.matrixWorld, threeObj.matrix);
      } else {
        threeObj.matrixWorld.copy(threeObj.matrix);
      }

      // If the threeObject has children that were manually added (not managed by facades), we'll need to update them too
      // TODO can we determine this state without a full loop that will likely return nothing?
      let threeKids = threeObj.children;
      for (let i = 0, len = threeKids.length; i < len; i++) {
        if (!threeKids[i].$facade) {
          threeKids[i].updateMatrixWorld(true);
        }
      }

      this.markWorldMatrixDirty();
    }
  }

  /**
   * If the `threeObject.matrixWorld` is modified manually instead of via the individual transformation
   * properties, you can call this to tell the facade its caches need to be recalculated.
   */
  markWorldMatrixDirty() {
    this._worldMatrixVersion = ++_worldMatrixVersion;
    this._boundsChanged = true;
  }

  _checkBoundsChange() {
    let changed = this._boundsChanged;
    if (!changed) {
      const geomSphere = this._getGeometryBoundingSphere();
      if (geomSphere && geomSphere.version !== this._lastGeometrySphereVersion) {
        changed = true;
        this._lastGeometrySphereVersion = geomSphere.version;
      }
    }
    if (changed) {
      this.notifyWorld('object3DBoundsChanged');
      this._boundsChanged = false;
    }
  }

  /**
   * Get this object's current position in world space
   * @param {Vector3} [vec3] - optional Vector3 object to populate with the position;
   *                  if not passed in a new one will be created.
   * @returns {Vector3}
   */
  getWorldPosition(vec3 ) {
    this.updateMatrices();
    return (vec3 || new Vector3()).setFromMatrixPosition(this.threeObject.matrixWorld)
  }

  /**
   * Get the current position vector of the world's camera.
   * @param {Vector3} [vec3] - optional Vector3 object to populate with the position;
   *                  if not passed in a new one will be created.
   * @returns {Vector3}
   */
  getCameraPosition(vec3 ) {
    vec3 = vec3 || new Vector3();
    this.notifyWorld('getCameraPosition', vec3);
    return vec3
  }

  /**
   * Get the facade object for the world's camera. Can be used to get to low-level info
   * about the camera such as its various matrices, but be careful not to make modifications
   * to the camera as that can lead to things getting out of sync.
   * @returns {Camera3DFacade}
   */
  getCameraFacade() {
    notifyWorldGetter.value = null;
    this.notifyWorld('getCameraFacade', notifyWorldGetter);
    return notifyWorldGetter.value
  }

  /**
   * Calculate the distance in world units between this object's origin and the camera.
   * @returns {Number}
   */
  getCameraDistance() {
    let cameraPos = this.getCameraPosition(singletonVec3b);
    let objectPos = this.getWorldPosition(singletonVec3);
    return cameraPos.distanceTo(objectPos)
  }

  /**
   * Get the current projected user space position for this object, or for a specific position
   * in its object space.
   * @returns {Vector3} x and y are in screen pixels, z is worldspace distance from camera. The
   *                    z may be negative, which means it is out of view behind the camera.
   */
  getProjectedPosition(x, y, z) {
    this.updateMatrices();
    notifyWorldGetter.value = null;
    notifyWorldGetter.worldPosition = singletonVec3.set(x || 0, y || 0, z || 0).applyMatrix4(this.threeObject.matrixWorld);
    this.notifyWorld('projectWorldPosition', notifyWorldGetter);
    return notifyWorldGetter.value
  }

  /**
   * Get the facade object for the world's scene.
   * @returns {Scene3DFacade}
   */
  getSceneFacade() {
    notifyWorldGetter.value = null;
    this.notifyWorld('getSceneFacade', notifyWorldGetter);
    return notifyWorldGetter.value
  }

  /**
   * Return a {@link Sphere} encompassing the bounds of this object in worldspace, or `null` if
   * it has no physical bounds. This is used for optimized raycasting.
   *
   * The default implementation attempts to be as efficient as possible, only updating the sphere
   * when necessary, and assumes the threeObject has a geometry that accurately describes its bounds.
   * Override this method to provide custom bounds calculation logic, for example when additional meshes
   * need to be checked or a vertex shader manipulates the geometry; you'll probably also need to override
   * {@link #raycast} to match.
   *
   * TODO: this needs to be easier to override without having to reimplement large chunks of logic
   */
  getBoundingSphere() {
    // Get the geometry's current bounding sphere
    let geomSphere = this._getGeometryBoundingSphere();
    if (!geomSphere) return null

    // Ensure world matrix is up to date
    this.updateMatrices();

    // Lazily create our Sphere
    let sphere = this._boundingSphere;
    if (!sphere) {
      sphere = this._boundingSphere = new Sphere();
    }

    // If the geometry, the geometry's bounding sphere, or this object's world matrix changed,
    // update our bounding sphere to match them.
    if (sphere._geometrySphereVersion !== geomSphere.version || sphere._worldMatrixVersion !== this._worldMatrixVersion) {
      sphere.copy(geomSphere);
      sphere.applyMatrix4(this.threeObject.matrixWorld);
      sphere._worldMatrixVersion = this._worldMatrixVersion;
      sphere._geometrySphereVersion = geomSphere.version;
    }

    return sphere
  }

  /**
   * Ensure the object's geometry, if any, has an up-to-date bounding Sphere, and return that Sphere.
   * The returned Sphere will be assigned a unique `version` property when it is modified, which can
   * be used elsewhere for tracking changes.
   * @private
   */
  _getGeometryBoundingSphere() {
    const geometry = this.getGeometry();
    if (geometry) {
      let geomSphere = geometry.boundingSphere;
      let geomSphereChanged = false;
      if (geomSphere) {
        if (geometry.isBufferGeometry) {
          // For a BufferGeometry we can look at the `position` attribute's `version` (incremented
          // when the user sets `geom.needsUpdate = true`) to detect the need for bounds recalc
          const posAttr = geometry.attributes.position;
          if (posAttr && geomSphere._posAttrVersion !== posAttr.version) {
            geometry.computeBoundingSphere();
            geomSphere._posAttrVersion = posAttr.version;
            geomSphereChanged = true;
          }
        } else {
          // For a non-buffer Geometry (not recommended!) users will have to manually call
          // `geom.computeBoundingSphere()` after changing its vertices, and we'll do a brute force
          // check for changes to the sphere's properties
          if (!geometry._lastBoundingSphere || !geomSphere.equals(geometry._lastBoundingSphere)) {
            geometry._lastBoundingSphere = geomSphere.clone();
            geomSphereChanged = true;
          }
        }
      } else {
        geometry.computeBoundingSphere();
        geomSphere = geometry.boundingSphere;
        geomSphereChanged = true;
      }
      if (geomSphereChanged) {
        geomSphere.version = ++_geometrySphereVersion;
      }
      return geomSphere
    } else {
      return null
    }
  }

  /**
   * @protected Extension point for subclasses that don't use their threeObject's geometry, e.g. Instanceable
   */
  getGeometry() {
    const obj = this.threeObject;
    return obj && obj.geometry
  }

  /**
   * Determine if this facade's threeObject intersects a Raycaster. Override this method to provide
   * custom raycasting logic, for example when additional meshes need to be checked or a vertex shader
   * manipulates the geometry; you'll probably also need to override {@link #getBoundingSphere} to match.
   *
   * The return value can be:
   *   - An array of hit objects for this facade, matching the format returned by `Raycaster.intersectObject`
   *   - `null`, if this facade has no hits
   */
  raycast(raycaster) {
    return this.threeObject ? this._raycastObject(this.threeObject, raycaster) : null
  }

  /**
   * Custom optimized raycast that, unlike Raycaster.intersectObject(), avoids creating a
   * new array unless there are actually hits. It also supports the custom `raycastSide`
   * override property, hit on sides other than the material's configured `side`.
   * @protected
   */
  _raycastObject(obj, raycaster) {
    if (obj.visible) {
      singletonIntersects.length = 0;
      let origSide = null;
      const raycastSide = this.raycastSide;
      if (raycastSide != null) {
        origSide = obj.material.side;
        obj.material.side = raycastSide;
      }
      obj.raycast(raycaster, singletonIntersects);
      if (origSide !== null) {
        obj.material.side = origSide;
      }
      if (singletonIntersects.length) {
        singletonIntersects.sort(ascDistanceSort);
        return singletonIntersects.slice()
      }
    }
    return null
  }

  _addToThreeObjectTree() {
    let parent = this._parentObject3DFacade;
    if (parent) {
      if (this.threeObject.parent !== parent.threeObject) {
        parent.threeObject.add(this.threeObject);
        parent._addToThreeObjectTree();
      }
    }
  }

  _queueRemoveChildObject3D(threeObjectId) {
    let removeChildIds = this._removeChildIds || (this._removeChildIds = Object.create(null));
    removeChildIds[threeObjectId] = true;
  }

  _flushQueuedChildRemovals() {
    // If any children were queued for removal, remove them from the threejs
    // object in a single batch; this avoids threejs's very expensive single-item remove.
    if (this._removeChildIds) {
      let threeObject = this.threeObject;
      let removeChildIds = this._removeChildIds;
      threeObject.children = threeObject.children.filter(child => {
        if (child.id in removeChildIds) {
          child.parent = null;
          child.dispatchEvent(removedEvent);
          return false
        }
        return true
      });

      // If that resulted in a non-renderable object having no renderable children,
      // remove it from the threejs object tree, recursively upward.
      let parentObj3D = this._parentObject3DFacade;
      if (canObjectBeOrphaned(threeObject) && parentObj3D && parentObj3D.threeObject === threeObject.parent) {
        parentObj3D._queueRemoveChildObject3D(threeObject.id);
        parentObj3D._flushQueuedChildRemovals(); //if we don't force a parent flush, tree can get in a bad state
      }

      this._removeChildIds = null;
    }
  }

  destructor() {
    this.notifyWorld('object3DRemoved');
    let parentObj3D = this._parentObject3DFacade;
    if (parentObj3D) {
      parentObj3D._queueRemoveChildObject3D(this.threeObject.id);
    }
    delete this.threeObject;
    super.destructor();
  }
}


// Convenience setters for Object3D simple properties
['castShadow', 'receiveShadow', 'renderOrder', 'visible'].forEach(prop => {
  Object.defineProperty(Object3DFacade.prototype, prop, {
    get() {
      return this.threeObject[prop]
    },
    set(value) {
      this.threeObject[prop] = value;
    }
  });
});

/**
 * @property {null|number} raycastSide
 * Hook to force a different `side` than that of the material for mesh raycasting.
 * Should be set to `FrontSide`|`BackSide`|`DoubleSide`, or `null` to use the
 * material's side.
 */
Object3DFacade.prototype.raycastSide = null;


// Create flat property setters for individual position/scale/rotation properties
forOwn$1({
  position: {
    x: 'x',
    y: 'y',
    z: 'z'
  },
  scale: {
    x: 'scaleX',
    y: 'scaleY',
    z: 'scaleZ'
  },
  rotation: {
    x: 'rotateX',
    y: 'rotateY',
    z: 'rotateZ',
    order: 'rotateOrder'
  },
  quaternion: {
    x: 'quaternionX',
    y: 'quaternionY',
    z: 'quaternionZ',
    w: 'quaternionW'
  }
}, (attrs, aspect) => {
  forOwn$1(attrs, (propName, attr) => {
    // Compile functions to avoid runtime cost of aspect/attr evaluation
    Object.defineProperty(Object3DFacade.prototype, propName, {
      get: new Function(`return function ${propName}$get() {
  return this.threeObject.${aspect}.${attr}
}`)(),
      set: new Function(`return function ${propName}$set(value) {
  //let obj = this.threeObject.${aspect}
  if (this.threeObject.${aspect}.${attr} !== value) {
    this.threeObject.${aspect}.${attr} = value
    if (!this._matrixChanged) {
      this._matrixChanged = true
    }
  }
}`)()
    });
  });
});

// ...and a special shortcut for uniform scale
Object.defineProperty(Object3DFacade.prototype, 'scale', {
  get() {
    // can't guarantee scale was already uniform, so just use scaleX arbitrarily
    return this.threeObject.scale.x
  },
  set(value) {
    const scaleObj = this.threeObject.scale;
    if (value !== scaleObj.x || value !== scaleObj.y || value !== scaleObj.z) {
      scaleObj.x = scaleObj.y = scaleObj.z = value;
      if (!this._matrixChanged) {
        this._matrixChanged = true;
      }
    }
  }
});


Object.defineProperty(Object3DFacade.prototype, 'isObject3DFacade', {value: true});

// Predefine shape to facilitate JS engine optimization
assign$4(Object3DFacade.prototype, {
  threeObject: null,
  _parentObject3DFacade: null,
  _removeChildIds: null,
  _matrixChanged: true,
  _worldMatrixVersion: -1,
  _worldMatrixVersionAfterLastUpdate: -1,
  _boundingSphereChanged: false
});

// Define onBeforeRender/onAfterRender event handler properties
Facade.defineEventProperty(Object3DFacade, 'onBeforeRender', 'beforerender');
Facade.defineEventProperty(Object3DFacade, 'onAfterRender', 'afterrender');

/**
 * Regular expression for matching the `void main() {` opener line in GLSL.
 * @type {RegExp}
 */
const voidMainRegExp = /\bvoid\s+main\s*\(\s*\)\s*{/g;

/**
 * Recursively expands all `#include <xyz>` statements within string of shader code.
 * Copied from three's WebGLProgram#parseIncludes for external use.
 *
 * @param {string} source - The GLSL source code to evaluate
 * @return {string} The GLSL code with all includes expanded
 */
function expandShaderIncludes( source ) {
  const pattern = /^[ \t]*#include +<([\w\d./]+)>/gm;
  function replace(match, include) {
    let chunk = ShaderChunk[include];
    return chunk ? expandShaderIncludes(chunk) : match
  }
  return source.replace( pattern, replace )
}

/*
 * This is a direct copy of MathUtils.generateUUID from Three.js, to preserve compatibility with three
 * versions before 0.113.0 as it was changed from Math to MathUtils in that version.
 * https://github.com/mrdoob/three.js/blob/dd8b5aa3b270c17096b90945cd2d6d1b13aaec53/src/math/MathUtils.js#L16
 */

const _lut = [];

for (let i = 0; i < 256; i++) {
  _lut[i] = (i < 16 ? '0' : '') + (i).toString(16);
}

function generateUUID() {

  // http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136

  const d0 = Math.random() * 0xffffffff | 0;
  const d1 = Math.random() * 0xffffffff | 0;
  const d2 = Math.random() * 0xffffffff | 0;
  const d3 = Math.random() * 0xffffffff | 0;
  const uuid = _lut[d0 & 0xff] + _lut[d0 >> 8 & 0xff] + _lut[d0 >> 16 & 0xff] + _lut[d0 >> 24 & 0xff] + '-' +
    _lut[d1 & 0xff] + _lut[d1 >> 8 & 0xff] + '-' + _lut[d1 >> 16 & 0x0f | 0x40] + _lut[d1 >> 24 & 0xff] + '-' +
    _lut[d2 & 0x3f | 0x80] + _lut[d2 >> 8 & 0xff] + '-' + _lut[d2 >> 16 & 0xff] + _lut[d2 >> 24 & 0xff] +
    _lut[d3 & 0xff] + _lut[d3 >> 8 & 0xff] + _lut[d3 >> 16 & 0xff] + _lut[d3 >> 24 & 0xff];

  // .toUpperCase() here flattens concatenated strings to save heap memory space.
  return uuid.toUpperCase()

}

// Local assign polyfill to avoid importing troika-core
const assign$3 = Object.assign || function(/*target, ...sources*/) {
  let target = arguments[0];
  for (let i = 1, len = arguments.length; i < len; i++) {
    let source = arguments[i];
    if (source) {
      for (let prop in source) {
        if (source.hasOwnProperty(prop)) {
          target[prop] = source[prop];
        }
      }
    }
  }
  return target
};


const epoch = Date.now();
const CONSTRUCTOR_CACHE = new WeakMap();
const SHADER_UPGRADE_CACHE = new Map();

// Material ids must be integers, but we can't access the increment from Three's `Material` module,
// so let's choose a sufficiently large starting value that should theoretically never collide.
let materialInstanceId = 1e10;

/**
 * A utility for creating a custom shader material derived from another material's
 * shaders. This allows you to inject custom shader logic and transforms into the
 * builtin ThreeJS materials without having to recreate them from scratch.
 *
 * @param {THREE.Material} baseMaterial - the original material to derive from
 *
 * @param {Object} options - How the base material should be modified.
 * @param {Object} options.defines - Custom `defines` for the material
 * @param {Object} options.extensions - Custom `extensions` for the material, e.g. `{derivatives: true}`
 * @param {Object} options.uniforms - Custom `uniforms` for use in the modified shader. These can
 *        be accessed and manipulated via the resulting material's `uniforms` property, just like
 *        in a ShaderMaterial. You do not need to repeat the base material's own uniforms here.
 * @param {String} options.timeUniform - If specified, a uniform of this name will be injected into
 *        both shaders, and it will automatically be updated on each render frame with a number of
 *        elapsed milliseconds. The "zero" epoch time is not significant so don't rely on this as a
 *        true calendar time.
 * @param {String} options.vertexDefs - Custom GLSL code to inject into the vertex shader's top-level
 *        definitions, above the `void main()` function.
 * @param {String} options.vertexMainIntro - Custom GLSL code to inject at the top of the vertex
 *        shader's `void main` function.
 * @param {String} options.vertexMainOutro - Custom GLSL code to inject at the end of the vertex
 *        shader's `void main` function.
 * @param {String} options.vertexTransform - Custom GLSL code to manipulate the `position`, `normal`,
 *        and/or `uv` vertex attributes. This code will be wrapped within a standalone function with
 *        those attributes exposed by their normal names as read/write values.
 * @param {String} options.fragmentDefs - Custom GLSL code to inject into the fragment shader's top-level
 *        definitions, above the `void main()` function.
 * @param {String} options.fragmentMainIntro - Custom GLSL code to inject at the top of the fragment
 *        shader's `void main` function.
 * @param {String} options.fragmentMainOutro - Custom GLSL code to inject at the end of the fragment
 *        shader's `void main` function. You can manipulate `gl_FragColor` here but keep in mind it goes
 *        after any of ThreeJS's color postprocessing shader chunks (tonemapping, fog, etc.), so if you
 *        want those to apply to your changes use `fragmentColorTransform` instead.
 * @param {String} options.fragmentColorTransform - Custom GLSL code to manipulate the `gl_FragColor`
 *        output value. Will be injected near the end of the `void main` function, but before any
 *        of ThreeJS's color postprocessing shader chunks (tonemapping, fog, etc.), and before the
 *        `fragmentMainOutro`.
 * @param {function<{vertexShader,fragmentShader}>:{vertexShader,fragmentShader}} options.customRewriter - A function
 *        for performing custom rewrites of the full shader code. Useful if you need to do something
 *        special that's not covered by the other builtin options. This function will be executed before
 *        any other transforms are applied.
 * @param {boolean} options.chained - Set to `true` to prototype-chain the derived material to the base
 *        material, rather than the default behavior of copying it. This allows the derived material to
 *        automatically pick up changes made to the base material and its properties. This can be useful
 *        where the derived material is hidden from the user as an implementation detail, allowing them
 *        to work with the original material like normal. But it can result in unexpected behavior if not
 *        handled carefully.
 *
 * @return {THREE.Material}
 *
 * The returned material will also have two new methods, `getDepthMaterial()` and `getDistanceMaterial()`,
 * which can be called to get a variant of the derived material for use in shadow casting. If the
 * target mesh is expected to cast shadows, then you can assign these to the mesh's `customDepthMaterial`
 * (for directional and spot lights) and/or `customDistanceMaterial` (for point lights) properties to
 * allow the cast shadow to honor your derived shader's vertex transforms and discarded fragments. These
 * will also set a custom `#define IS_DEPTH_MATERIAL` or `#define IS_DISTANCE_MATERIAL` that you can look
 * for in your derived shaders with `#ifdef` to customize their behavior for the depth or distance
 * scenarios, e.g. skipping antialiasing or expensive shader logic.
 */
function createDerivedMaterial(baseMaterial, options) {
  // Generate a key that is unique to the content of these `options`. We'll use this
  // throughout for caching and for generating the upgraded shader code. This increases
  // the likelihood that the resulting shaders will line up across multiple calls so
  // their GL programs can be shared and cached.
  const optionsKey = getKeyForOptions(options);

  // First check to see if we've already derived from this baseMaterial using this
  // unique set of options, and if so reuse the constructor to avoid some allocations.
  let ctorsByDerivation = CONSTRUCTOR_CACHE.get(baseMaterial);
  if (!ctorsByDerivation) {
    CONSTRUCTOR_CACHE.set(baseMaterial, (ctorsByDerivation = Object.create(null)));
  }
  if (ctorsByDerivation[optionsKey]) {
    return new ctorsByDerivation[optionsKey]()
  }

  const privateBeforeCompileProp = `_onBeforeCompile${optionsKey}`;

  // Private onBeforeCompile handler that injects the modified shaders and uniforms when
  // the renderer switches to this material's program
  const onBeforeCompile = function (shaderInfo) {
    baseMaterial.onBeforeCompile.call(this, shaderInfo);

    // Upgrade the shaders, caching the result by incoming source code
    const cacheKey = this.customProgramCacheKey() + '|' + shaderInfo.vertexShader + '|' + shaderInfo.fragmentShader;
    let upgradedShaders = SHADER_UPGRADE_CACHE[cacheKey];
    if (!upgradedShaders) {
      const upgraded = upgradeShaders$1(shaderInfo, options, optionsKey);
      upgradedShaders = SHADER_UPGRADE_CACHE[cacheKey] = upgraded;
    }

    // Inject upgraded shaders and uniforms into the program
    shaderInfo.vertexShader = upgradedShaders.vertexShader;
    shaderInfo.fragmentShader = upgradedShaders.fragmentShader;
    assign$3(shaderInfo.uniforms, this.uniforms);

    // Inject auto-updating time uniform if requested
    if (options.timeUniform) {
      shaderInfo.uniforms[options.timeUniform] = {
        get value() {return Date.now() - epoch}
      };
    }

    // Users can still add their own handlers on top of ours
    if (this[privateBeforeCompileProp]) {
      this[privateBeforeCompileProp](shaderInfo);
    }
  };

  const DerivedMaterial = function DerivedMaterial() {
    return derive(options.chained ? baseMaterial : baseMaterial.clone())
  };

  const derive = function(base) {
    // Prototype chain to the base material
    const derived = Object.create(base, descriptor);

    // Store the baseMaterial for reference; this is always the original even when cloning
    Object.defineProperty(derived, 'baseMaterial', { value: baseMaterial });

    // Needs its own ids
    Object.defineProperty(derived, 'id', { value: materialInstanceId++ });
    derived.uuid = generateUUID();

    // Merge uniforms, defines, and extensions
    derived.uniforms = assign$3({}, base.uniforms, options.uniforms);
    derived.defines = assign$3({}, base.defines, options.defines);
    derived.defines[`TROIKA_DERIVED_MATERIAL_${optionsKey}`] = ''; //force a program change from the base material
    derived.extensions = assign$3({}, base.extensions, options.extensions);

    // Don't inherit EventDispatcher listeners
    derived._listeners = undefined;

    return derived
  };

  const descriptor = {
    constructor: {value: DerivedMaterial},
    isDerivedMaterial: {value: true},

    customProgramCacheKey: {
      writable: true,
      configurable: true,
      value: function () {
        return baseMaterial.customProgramCacheKey() + '|' + optionsKey
      }
    },

    onBeforeCompile: {
      get() {
        return onBeforeCompile
      },
      set(fn) {
        this[privateBeforeCompileProp] = fn;
      }
    },

    copy: {
      writable: true,
      configurable: true,
      value: function (source) {
        baseMaterial.copy.call(this, source);
        if (!baseMaterial.isShaderMaterial && !baseMaterial.isDerivedMaterial) {
          assign$3(this.extensions, source.extensions);
          assign$3(this.defines, source.defines);
          assign$3(this.uniforms, UniformsUtils.clone(source.uniforms));
        }
        return this
      }
    },

    clone: {
      writable: true,
      configurable: true,
      value: function () {
        const newBase = new baseMaterial.constructor();
        return derive(newBase).copy(this)
      }
    },

    /**
     * Utility to get a MeshDepthMaterial that will honor this derived material's vertex
     * transformations and discarded fragments.
     */
    getDepthMaterial: {
      writable: true,
      configurable: true,
      value: function() {
        let depthMaterial = this._depthMaterial;
        if (!depthMaterial) {
          depthMaterial = this._depthMaterial = createDerivedMaterial(
            baseMaterial.isDerivedMaterial
              ? baseMaterial.getDepthMaterial()
              : new MeshDepthMaterial({ depthPacking: RGBADepthPacking }),
            options
          );
          depthMaterial.defines.IS_DEPTH_MATERIAL = '';
          depthMaterial.uniforms = this.uniforms; //automatically recieve same uniform values
        }
        return depthMaterial
      }
    },

    /**
     * Utility to get a MeshDistanceMaterial that will honor this derived material's vertex
     * transformations and discarded fragments.
     */
    getDistanceMaterial: {
      writable: true,
      configurable: true,
      value: function() {
        let distanceMaterial = this._distanceMaterial;
        if (!distanceMaterial) {
          distanceMaterial = this._distanceMaterial = createDerivedMaterial(
            baseMaterial.isDerivedMaterial
              ? baseMaterial.getDistanceMaterial()
              : new MeshDistanceMaterial(),
            options
          );
          distanceMaterial.defines.IS_DISTANCE_MATERIAL = '';
          distanceMaterial.uniforms = this.uniforms; //automatically recieve same uniform values
        }
        return distanceMaterial
      }
    },

    dispose: {
      writable: true,
      configurable: true,
      value() {
        const {_depthMaterial, _distanceMaterial} = this;
        if (_depthMaterial) _depthMaterial.dispose();
        if (_distanceMaterial) _distanceMaterial.dispose();
        baseMaterial.dispose.call(this);
      }
    }
  };

  ctorsByDerivation[optionsKey] = DerivedMaterial;
  return new DerivedMaterial()
}


function upgradeShaders$1({vertexShader, fragmentShader}, options, key) {
  let {
    vertexDefs,
    vertexMainIntro,
    vertexMainOutro,
    vertexTransform,
    fragmentDefs,
    fragmentMainIntro,
    fragmentMainOutro,
    fragmentColorTransform,
    customRewriter,
    timeUniform
  } = options;

  vertexDefs = vertexDefs || '';
  vertexMainIntro = vertexMainIntro || '';
  vertexMainOutro = vertexMainOutro || '';
  fragmentDefs = fragmentDefs || '';
  fragmentMainIntro = fragmentMainIntro || '';
  fragmentMainOutro = fragmentMainOutro || '';

  // Expand includes if needed
  if (vertexTransform || customRewriter) {
    vertexShader = expandShaderIncludes(vertexShader);
  }
  if (fragmentColorTransform || customRewriter) {
    // We need to be able to find postprocessing chunks after include expansion in order to
    // put them after the fragmentColorTransform, so mark them with comments first. Even if
    // this particular derivation doesn't have a fragmentColorTransform, other derivations may,
    // so we still mark them.
    fragmentShader = fragmentShader.replace(
      /^[ \t]*#include <((?:tonemapping|encodings|fog|premultiplied_alpha|dithering)_fragment)>/gm,
      '\n//!BEGIN_POST_CHUNK $1\n$&\n//!END_POST_CHUNK\n'
    );
    fragmentShader = expandShaderIncludes(fragmentShader);
  }

  // Apply custom rewriter function
  if (customRewriter) {
    let res = customRewriter({vertexShader, fragmentShader});
    vertexShader = res.vertexShader;
    fragmentShader = res.fragmentShader;
  }

  // The fragmentColorTransform needs to go before any postprocessing chunks, so extract
  // those and re-insert them into the outro in the correct place:
  if (fragmentColorTransform) {
    let postChunks = [];
    fragmentShader = fragmentShader.replace(
      /^\/\/!BEGIN_POST_CHUNK[^]+?^\/\/!END_POST_CHUNK/gm, // [^]+? = non-greedy match of any chars including newlines
      match => {
        postChunks.push(match);
        return ''
      }
    );
    fragmentMainOutro = `${fragmentColorTransform}\n${postChunks.join('\n')}\n${fragmentMainOutro}`;
  }

  // Inject auto-updating time uniform if requested
  if (timeUniform) {
    const code = `\nuniform float ${timeUniform};\n`;
    vertexDefs = code + vertexDefs;
    fragmentDefs = code + fragmentDefs;
  }

  // Inject a function for the vertexTransform and rename all usages of position/normal/uv
  if (vertexTransform) {
    // Hoist these defs to the very top so they work in other function defs
    vertexShader = `vec3 troika_position_${key};
vec3 troika_normal_${key};
vec2 troika_uv_${key};
${vertexShader}
`;
    vertexDefs = `${vertexDefs}
void troikaVertexTransform${key}(inout vec3 position, inout vec3 normal, inout vec2 uv) {
  ${vertexTransform}
}
`;
    vertexMainIntro = `
troika_position_${key} = vec3(position);
troika_normal_${key} = vec3(normal);
troika_uv_${key} = vec2(uv);
troikaVertexTransform${key}(troika_position_${key}, troika_normal_${key}, troika_uv_${key});
${vertexMainIntro}
`;
    vertexShader = vertexShader.replace(/\b(position|normal|uv)\b/g, (match, match1, index, fullStr) => {
      return /\battribute\s+vec[23]\s+$/.test(fullStr.substr(0, index)) ? match1 : `troika_${match1}_${key}`
    });
  }

  // Inject defs and intro/outro snippets
  vertexShader = injectIntoShaderCode(vertexShader, key, vertexDefs, vertexMainIntro, vertexMainOutro);
  fragmentShader = injectIntoShaderCode(fragmentShader, key, fragmentDefs, fragmentMainIntro, fragmentMainOutro);

  return {
    vertexShader,
    fragmentShader
  }
}

function injectIntoShaderCode(shaderCode, id, defs, intro, outro) {
  if (intro || outro || defs) {
    shaderCode = shaderCode.replace(voidMainRegExp, `
${defs}
void troikaOrigMain${id}() {`
    );
    shaderCode += `
void main() {
  ${intro}
  troikaOrigMain${id}();
  ${outro}
}`;
  }
  return shaderCode
}


function optionsJsonReplacer(key, value) {
  return key === 'uniforms' ? undefined : typeof value === 'function' ? value.toString() : value
}

let _idCtr = 0;
const optionsHashesToIds = new Map();
function getKeyForOptions(options) {
  const optionsHash = JSON.stringify(options, optionsJsonReplacer);
  let id = optionsHashesToIds.get(optionsHash);
  if (id == null) {
    optionsHashesToIds.set(optionsHash, (id = ++_idCtr));
  }
  return id
}

// Copied from threejs WebGLPrograms.js so we can resolve builtin materials to their shaders
// TODO how can we keep this from getting stale?
const MATERIAL_TYPES_TO_SHADERS = {
  MeshDepthMaterial: 'depth',
  MeshDistanceMaterial: 'distanceRGBA',
  MeshNormalMaterial: 'normal',
  MeshBasicMaterial: 'basic',
  MeshLambertMaterial: 'lambert',
  MeshPhongMaterial: 'phong',
  MeshToonMaterial: 'toon',
  MeshStandardMaterial: 'physical',
  MeshPhysicalMaterial: 'physical',
  MeshMatcapMaterial: 'matcap',
  LineBasicMaterial: 'basic',
  LineDashedMaterial: 'dashed',
  PointsMaterial: 'points',
  ShadowMaterial: 'shadow',
  SpriteMaterial: 'sprite'
};

/**
 * Given a Three.js `Material` instance, find the shaders/uniforms that will be
 * used to render that material.
 *
 * @param material - the Material instance
 * @return {object} - the material's shader info: `{uniforms:{}, fragmentShader:'', vertexShader:''}`
 */
function getShadersForMaterial(material) {
  let builtinType = MATERIAL_TYPES_TO_SHADERS[material.type];
  return builtinType ? ShaderLib[builtinType] : material //TODO fallback for unknown type?
}

/**
 * Find all uniforms and their types within a shader code string.
 *
 * @param {string} shader - The shader code to parse
 * @return {object} mapping of uniform names to their glsl type
 */
function getShaderUniformTypes(shader) {
  let uniformRE = /\buniform\s+(int|float|vec[234]|mat[34])\s+([A-Za-z_][\w]*)/g;
  let uniforms = Object.create(null);
  let match;
  while ((match = uniformRE.exec(shader)) !== null) {
    uniforms[match[2]] = match[1];
  }
  return uniforms
}

/**
 * Helper for smoothing out the `m.getInverse(x)` --> `m.copy(x).invert()` conversion
 * that happened in ThreeJS r123.
 * @param {Matrix4} srcMatrix
 * @param {Matrix4} [tgtMatrix]
 */
function invertMatrix4(srcMatrix, tgtMatrix = new Matrix4()) {
  if (typeof tgtMatrix.invert === 'function') {
    tgtMatrix.copy(srcMatrix).invert();
  } else {
    tgtMatrix.getInverse(srcMatrix);
  }
  return tgtMatrix
}

const noop = function() {};
const tempRaycaster = new Raycaster();
const tempVec2 = new Vector2();
const tempVec3 = new Vector3();
const tempMat4 = new Matrix4();
const tempQuat = new Quaternion();
const lookAtUp = new Vector3(0, 1, 0);

let _projectionMatrixVersion = 0;

function createCameraFacade(threeJsCameraClass, projectionProps, otherProps) {
  class Camera3DFacade extends Object3DFacade {
    constructor(parent) {
      super(parent);
      this.lookAt = this.up = null;
      this._projectionChanged = false;
      this._frustum = new Frustum();
    }

    initThreeObject () {
      const camera = new threeJsCameraClass();
      // Forcibly prevent updateMatrixWorld from doing anything when called; the renderer
      // likes to call this even though matrixAutoUpdate=false which can sometimes clobber
      // our optimized `updateMatrices` handling and any custom adjustments it may make.
      // TODO consider doing this at the Object3DFacade level?
      camera.updateMatrixWorld = noop;
      return camera
    }

    afterUpdate() {
      // Apply lookAt+up as a final transform - applied as individual quaternion
      // properties so they can selectively trigger updates, be transitioned, etc.
      if (this.lookAt) {
        tempVec3.copy(this.lookAt);
        lookAtUp.copy(this.up || Object3D.DefaultUp);
        tempMat4.lookAt(this.threeObject.position, tempVec3, lookAtUp);
        tempQuat.setFromRotationMatrix(tempMat4);
        this.quaternionX = tempQuat.x;
        this.quaternionY = tempQuat.y;
        this.quaternionZ = tempQuat.z;
        this.quaternionW = tempQuat.w;
      }
      super.afterUpdate();
    }

    updateMatrices() {
      let camObj = this.threeObject;

      // Projection changes require a projection matrix rebuild - see setters below
      if (this._projectionChanged) {
        camObj.updateProjectionMatrix();
        this._projectionChanged = false;
        this._projectionMatrixVersion = _projectionMatrixVersion++;
      }

      // If changing the world matrix, also update its inverse
      let matrixVersionBeforeUpdate = this._worldMatrixVersion;
      super.updateMatrices();
      if (matrixVersionBeforeUpdate !== this._worldMatrixVersion) {
        invertMatrix4(camObj.matrixWorld, camObj.matrixWorldInverse);
      }
    }

    /**
     * Utility method that returns a Frustum object which is initialized to match this camera's
     * current state. This can be used for example to optimize updates to the Facade tree by
     * avoiding work for objects that fall outside the camera's view.
     *
     * You can access this by calling `this.getCameraFacade().getFrustum()` from any Object3DFacade's
     * `afterUpdate` lifecycle method or later.
     *
     * Be careful that this Frustum does not get modified after it is requested, as it is cached for
     * the lifetime of the camera's current world matrix and modifiying it would result in bad state
     * for other code requesting it within that lifetime.
     *
     * @return {Frustum}
     */
    getFrustum() {
      this.updateMatrices();
      let frustum = this._frustum;
      let {_worldMatrixVersion, _projectionMatrixVersion} = this;
      if (frustum._lastWorldMatrixVersion !== _worldMatrixVersion || frustum._lastProjMatrixVersion !== _projectionMatrixVersion) {
        let camObj = this.threeObject;
        let matrix = new Matrix4().multiplyMatrices(camObj.projectionMatrix, camObj.matrixWorldInverse);
        frustum.setFromMatrix(matrix);
        frustum._lastWorldMatrixVersion = _worldMatrixVersion;
        frustum._lastProjMatrixVersion = _projectionMatrixVersion;
      }
      return frustum
    }

    /**
     * Given a set of camera projection coordinates (u,v in the range [-1, 1]), return a `Ray`
     * representing that line of sight in worldspace.
     * @param {number} u
     * @param {number} v
     * @return Ray
     */
    getRayAtProjectedCoords(u, v) {
      // By default we use the builtin Raycaster functionality, but this can be overridden
      const ray = tempRaycaster.ray = new Ray();
      tempRaycaster.setFromCamera(tempVec2.set(u, v), this.threeObject);
      return ray
    }
  }

  // Setters for properties which require a matrix update
  function defineProp(prop, affectsProjection) {
    Object.defineProperty(Camera3DFacade.prototype, prop, {
      set(val) {
        if (val !== this.threeObject[prop]) {
          this.threeObject[prop] = val;
          if (affectsProjection) this._projectionChanged = true;
        }
      },
      get() {
        return this.threeObject[prop]
      }
    });
  }

  projectionProps.forEach(prop => {
    defineProp(prop, true);
  });

  if (otherProps) {
    otherProps.forEach(prop => {
      defineProp(prop, false);
    });
  }

  return Camera3DFacade
}


const PerspectiveCamera3DFacade = createCameraFacade(PerspectiveCamera, ['fov', 'aspect', 'near', 'far'], ['focus', 'filmGauge', 'filmOffset']);
const OrthographicCamera3DFacade = createCameraFacade(OrthographicCamera, ['left', 'right', 'top', 'bottom', 'near', 'far']);

class Group3DFacade extends Object3DFacade {
  initThreeObject() {
    let group = new Group();
    group.isRenderable = false; //trigger optimizations
    return group
  }
}

/**
 * Defines a snippet of HTML content that will be positioned to line up with the object's
 * xyz as projected by the scene's camera. This is a convenient way to display tooltips,
 * labels, and pieces of UI that follow a given object around.
 */
class HtmlOverlay3DFacade extends Object3DFacade {
  constructor(parent) {
    let obj = new Object3D();
    obj.isRenderable = false; //trigger optimizations
    super(parent, obj);

    /**
     * Defines the HTML content to be rendered. The type/format of this value is dependent
     * on the wrapping implementation; for example the Canvas3D.js React-based wrapper will
     * expect a React element descriptor, while other wrappers might expect a HTML string.
     *
     * When using the React-based wrapper, the rendered React component will not be updated
     * when the overlay is repositioned, unless (a) the `html` element descriptor changes, or
     * (b) that element descriptor has a `shouldUpdateOnMove` prop.
     */
    this.html = null;

    /**
     * If set to true, the overlay's x/y position on screen will not be rounded to whole-pixel
     * values. This can give more accurate alignment at the expense of fuzzy lines and text.
     */
    this.exact = false;

    this.notifyWorld('addHtmlOverlay', this);
  }

  destructor() {
    this.notifyWorld('removeHtmlOverlay', this);
    super.destructor();
  }
}

//import {ShadowMapViewer} from 'three/examples/jsm/utils/ShadowMapViewer.js'


// Common superclass with setters for all possible light properties
class Light3DFacade extends Object3DFacade {
  set color(c) {
    this.threeObject.color.set(c);
  }
  get color() {
    return this.threeObject.color.getHex()
  }

  // Shadow map configurable by deep object copy:
  get shadow() {
    return this.threeObject.shadow
  }
  set shadow(val) {
    utils.assignDeep(this.threeObject.shadow, val);
  }
}
// Setters for simple properties to be copied
['intensity', 'distance', 'angle', 'penumbra', 'decay', 'castShadow', 'width', 'height'].forEach(propName => {
  Object.defineProperty(Light3DFacade.prototype, propName, {
    get() {
      return this.threeObject[propName]
    },
    set(value) {
      this.threeObject[propName] = value;
    }
  });
});


function createLightFacade(ThreeJsLightClass, HelperClass, customProtoDefs) {
  const Cls = class extends Light3DFacade {
    initThreeObject() {
      return new ThreeJsLightClass()
    }
    set showHelper(showHelper) {
      let helper = this._helper;
      if (!!showHelper !== !!helper) {
        if (showHelper) {
          this.threeObject.add(this._helper = new HelperClass(this.threeObject));
        } else if (helper) {
          helper.dispose();
          this.threeObject.remove(helper);
          this._helper = null;
        }
      }
    }
    afterUpdate () {
      super.afterUpdate();
      if (this._helper) {
        this._helper.update();
      }
    }
  };
  if (customProtoDefs) {
    Object.defineProperties(Cls.prototype, customProtoDefs);
  }
  return Cls
}

const AmbientLight3DFacade = createLightFacade(AmbientLight);
const DirectionalLight3DFacade = createLightFacade(DirectionalLight, DirectionalLightHelper);
const SpotLight3DFacade = createLightFacade(SpotLight, SpotLightHelper);
const PointLight3DFacade = createLightFacade(PointLight, PointLightHelper);
const HemisphereLight3DFacade = createLightFacade(HemisphereLight, HemisphereLightHelper, {
  groundColor: {
    set(c) {
      this.threeObject.groundColor.set(c);
    },
    get() {
      return this.threeObject.groundColor.getHex()
    }
  }
});
const RectAreaLight3DFacade = createLightFacade(RectAreaLight);

const inverseFunction = `
#if __VERSION__ < 300
// matrix inversion utility for pre-ES3 - credit https://github.com/stackgl/glsl-inverse
mat3 inverse(mat3 m) {
  float a00 = m[0][0], a01 = m[0][1], a02 = m[0][2];
  float a10 = m[1][0], a11 = m[1][1], a12 = m[1][2];
  float a20 = m[2][0], a21 = m[2][1], a22 = m[2][2];

  float b01 = a22 * a11 - a12 * a21;
  float b11 = -a22 * a10 + a12 * a20;
  float b21 = a21 * a10 - a11 * a20;

  float det = a00 * b01 + a01 * b11 + a02 * b21;

  return mat3(
    b01, (-a22 * a01 + a02 * a21), (a12 * a01 - a02 * a11),
    b11, (a22 * a00 - a02 * a20), (-a12 * a00 + a02 * a10),
    b21, (-a21 * a00 + a01 * a20), (a11 * a00 - a01 * a10)
  ) / det;
}
#endif
`;

const vertexCommonDefs = `
attribute vec4 troika_modelMatrixRow0;
attribute vec4 troika_modelMatrixRow1;
attribute vec4 troika_modelMatrixRow2;
mat4 troika_modelMatrix;
mat4 troika_modelViewMatrix;
mat3 troika_normalMatrix;
`;

const modelMatrixVarAssignment = `
troika_modelMatrix = mat4(
  %0.x, %1.x, %2.x, 0.0,
  %0.y, %1.y, %2.y, 0.0,
  %0.z, %1.z, %2.z, 0.0,
  %0.w, %1.w, %2.w, 1.0
);
`.replace(/%/g, 'troika_modelMatrixRow');

const modelViewMatrixVarAssignment = `
troika_modelViewMatrix = viewMatrix * troika_modelMatrix;
`;

const normalMatrixVarAssignment = `
troika_normalMatrix = transposeMat3(inverse(mat3(troika_modelViewMatrix)));
`;


const modelMatrixRefRE = /\bmodelMatrix\b/g;
const modelViewMatrixRefRE = /\bmodelViewMatrix\b/g;
const normalMatrixRefRE = /\bnormalMatrix\b/g;
const precededByUniformRE = /\buniform\s+(int|float|vec[234])\s+$/;
const attrRefReplacer = (name, index, str) => precededByUniformRE.test(str.substr(0, index)) ? name : `troika_${name}`;
const varyingRefReplacer = (name, index, str) => precededByUniformRE.test(str.substr(0, index)) ? name : `troika_vary_${name}`;

const CACHE = new WeakMap();

/**
 * Get a derived material with instancing upgrades for the given base material.
 * The result is cached by baseMaterial+instanceUniforms so we always get the same instance
 * back rather than getting a clone each time and having to re-upgrade every frame.
 */
function getInstancingDerivedMaterial(baseMaterial, instanceUniforms) {
  let instanceUniformsKey = instanceUniforms ? instanceUniforms.sort().join('|') : '';
  let derived = CACHE.get(baseMaterial);
  if (!derived || derived._instanceUniformsKey !== instanceUniformsKey) {
    derived = createDerivedMaterial(baseMaterial, {
      defines: {
        TROIKA_INSTANCED_UNIFORMS: instanceUniformsKey
      },
      customRewriter({vertexShader, fragmentShader}) {
        return upgradeShaders(vertexShader, fragmentShader, instanceUniforms)
      }
    });
    derived._instanceUniformsKey = instanceUniformsKey;
    CACHE.set(baseMaterial, derived);
  }
  return derived
}


/**
 * Transform the given vertex and fragment shader pair so they accept instancing
 * attributes for the builtin matrix uniforms as well as any other uniforms that
 * have been declared as instanceable.
 */
function upgradeShaders(vertexShader, fragmentShader, instanceUniforms) {
  // See what gets used
  let usesModelMatrix = modelMatrixRefRE.test(vertexShader);
  let usesModelViewMatrix = modelViewMatrixRefRE.test(vertexShader);
  let usesNormalMatrix = normalMatrixRefRE.test(vertexShader);

  // Find what uniforms are declared in which shader and their types
  let vertexUniforms = getShaderUniformTypes(vertexShader);
  let fragmentUniforms = getShaderUniformTypes(fragmentShader);

  let vertexDeclarations = [vertexCommonDefs];
  let vertexAssignments = [];
  let fragmentDeclarations = [];

  // Add variable assignments for, and rewrite references to, builtin matrices
  if (usesModelMatrix || usesModelViewMatrix || usesNormalMatrix) {
    vertexShader = vertexShader.replace(modelMatrixRefRE, attrRefReplacer);
    vertexAssignments.push(modelMatrixVarAssignment);
  }
  if (usesModelViewMatrix || usesNormalMatrix) {
    vertexShader = vertexShader.replace(modelViewMatrixRefRE, attrRefReplacer);
    vertexAssignments.push(modelViewMatrixVarAssignment);
  }
  if (usesNormalMatrix) {
    vertexShader = vertexShader.replace(normalMatrixRefRE, attrRefReplacer);
    vertexAssignments.push(normalMatrixVarAssignment);
    // Add the inverse() glsl polyfill if there isn't already one defined
    if (!/\binverse\s*\(/.test(vertexShader)) {
      vertexDeclarations.push(inverseFunction);
    }
  }

  // Add attributes and varyings for, and rewrite references to, instanceUniforms
  if (instanceUniforms) {
    instanceUniforms.forEach(name => {
      let vertType = vertexUniforms[name];
      let fragType = fragmentUniforms[name];
      if (vertType || fragType) {
        let finder = new RegExp(`\\b${name}\\b`, 'g');
        vertexDeclarations.push(`attribute ${vertType || fragType} troika_${name};`);
        if (vertType) {
          vertexShader = vertexShader.replace(finder, attrRefReplacer);
        }
        if (fragType) {
          fragmentShader = fragmentShader.replace(finder, varyingRefReplacer);
          let varyingDecl = `varying ${fragType} troika_vary_${name};`;
          vertexDeclarations.push(varyingDecl);
          fragmentDeclarations.push(varyingDecl);
          vertexAssignments.push(`troika_vary_${name} = troika_${name};`);
        }
      }
    });
  }

  // Inject vertex shader declarations and assignments
  vertexShader = `
${vertexDeclarations.join('\n')}
${vertexShader.replace(voidMainRegExp, `
  $&
  ${ vertexAssignments.join('\n') }
`)}`;

  // Inject fragment shader declarations
  if (fragmentDeclarations.length) {
    fragmentShader = `
${fragmentDeclarations.join('\n')}
${fragmentShader}`;
  }

  return {vertexShader, fragmentShader}
}

const { assign: assign$2 } = utils;

const INSTANCE_BATCH_SIZE = 128; //TODO make this an option?
const DYNAMIC_DRAW = 0x88E8; //can't import DynamicDrawUsage from three without breaking older versions

/**
 * An InstancingManager handles aggregating all Instanceable3DFacade descendants into
 * instancing batches. For each batch it creates a clone of the instancedThreeObject,
 * populates a pooled InstancedBufferGeometry with buffer attributes holding the world
 * matrices of all the batch's instances, and temporarily inserts that into the
 * scene to be rendered.
 *
 * As an additional "turbo" optimization, the instancing batch objects/geometries will be
 * reused untouched between rendering frames if none of the managed Instanceable3DFacade
 * objects have changed in a way that would affect the batches or world matrix attributes.
 *
 * There is a global InstancingManager automatically added to the main scene, and it does
 * nothing if there are no Instanceable3DFacades in the scene, so in most cases you should
 * not need to touch this yourself. But it is also possible to insert additional
 * InstancingManager facades further down in the scene if you wish to control the scope
 * of instancing, e.g. to increase the likelihood of the aforementioned "turbo" optimization
 * kicking in.
 *
 * Also see InstancingShaderUpgrades, which modifies material shaders so they accept the matrix
 * and custom uniform values coming in as attributes. This allows built-in materials as well
 * as custom shaders to work with instancing without manual modification.
 */
class InstancingManager extends Group3DFacade {
  constructor(parent) {
    super(parent);
    this._instanceables = Object.create(null);
    this._batchGeometryPool = new BatchGeometryPool();
    this._needsRebatch = true;
    this.addEventListener('beforerender', this._setupBatchObjects.bind(this));
    this.addEventListener('afterrender', this._teardownBatchObjects.bind(this));
  }

  onNotifyWorld(source, message, data) {
    let handler = this._notifyWorldHandlers[message];
    if (handler) {
      handler.call(this, source, data);
    } else if (this.parent) {
      this.parent.onNotifyWorld(source, message, data);
    }
  }

  _setupBatchObjects(renderer, scene, camera) {
    let instanceables = this._instanceables;
    let batchObjectsByKey = this._batchObjectsByKey;
    let needsRebatch = this._needsRebatch;

    if (!needsRebatch) {
      // We'll already know about most types of changes (instanceable addition/removal, instancedThreeObject
      // changes, matrix changes) but if any of the instancedThreeObjects changed their geometry or material
      // internally we'll need to detect that here and deoptimize.
      for (let key in batchObjectsByKey) {
        let batchObj = batchObjectsByKey[key][0];
        if (this._getBatchKey(batchObj.$troikaBatchBaseObj) !== key) {
          needsRebatch = true;
          break
        }
      }
    }

    if (needsRebatch) {
      batchObjectsByKey = this._batchObjectsByKey = Object.create(null);
      let geometryPool = this._batchGeometryPool;
      for (let facadeId in instanceables) {
        let facade = instanceables[facadeId];
        let instanceObject = facade.threeObject;
        let protoObject = facade.instancedThreeObject;

        if (protoObject && instanceObject.visible) {
          // Find or create the batch object for this facade's instancedThreeObject
          let batchKey = this._getBatchKey(protoObject);
          let instanceUniforms = this._getInstanceUniformNames(protoObject);
          let batchObjects = batchObjectsByKey[batchKey] || (batchObjectsByKey[batchKey] = []);
          let batchObject = batchObjects[batchObjects.length - 1];
          let batchGeometry = batchObject && batchObject.geometry;
          if (!batchGeometry || getInstanceCount(batchGeometry) === INSTANCE_BATCH_SIZE) {
            batchObject = this._getBatchObject(protoObject);
            batchGeometry = batchObject.geometry;
            let attrs = batchGeometry._instanceAttrs.matrix;
            for (let row = 0; row < 3; row++) {
              attrs[row].version++;
            }
            if (instanceUniforms) {
              attrs = batchGeometry._instanceAttrs.uniforms;
              for (let i = instanceUniforms.length; i--;) {
                attrs[instanceUniforms[i]].version++;
              }
            }
            batchObjects.push(batchObject);
          }

          // Put the instance's world matrix into the batch geometry's instancing attributes
          let attrOffset = getInstanceCount(batchGeometry);
          setInstanceCount(batchGeometry, attrOffset + 1);
          let attrs = batchGeometry._instanceAttrs.matrix;
          let elements = instanceObject.matrixWorld.elements; //column order
          attrs[0].setXYZW(attrOffset, elements[0], elements[4], elements[8], elements[12]);
          attrs[1].setXYZW(attrOffset, elements[1], elements[5], elements[9], elements[13]);
          attrs[2].setXYZW(attrOffset, elements[2], elements[6], elements[10], elements[14]);

          // Put the instance's values for instanceUniforms into the corresponding attributes
          if (instanceUniforms) {
            attrs = batchGeometry._instanceAttrs.uniforms;
            for (let i = instanceUniforms.length; i--;) {
              let uniform = instanceUniforms[i];
              let attr = attrs[uniform];
              let facadeUniforms = facade._instanceUniforms;
              let value = facadeUniforms && (uniform in facadeUniforms) ?
                facadeUniforms[uniform] : getDefaultUniformValue(protoObject.material, uniform);
              setAttributeValue(attr, attrOffset, value);
            }
          }

          // Save pointers for possible reuse next frame
          facade._instancingBatchObject = batchObject;
          facade._instancingBatchAttrOffset = attrOffset;
        } else {
          facade._instancingBatchObject = facade._instancingBatchAttrOffset = null;
        }
      }

      // Dispose any old batch geometries that were unused during this render pass
      // TODO should this be delayed any to prevent thrashing?
      geometryPool.disposeUnused();
    }

    // Add the batch objects to the scene
    let batchCount = 0;
    let batchGrpCount = 0;
    let instanceCount = 0;
    for (let id in batchObjectsByKey) {
      let batchObjects = batchObjectsByKey[id];
      scene.children.push.apply(scene.children, batchObjects);

      // increment stats
      batchGrpCount++;
      for (let i = batchObjects.length; i--;) {
        batchCount++;
        instanceCount += getInstanceCount(batchObjects[i].geometry);
      }
    }

    this.notifyWorld('statsUpdate', {
      'Instancing Batch Groups': batchGrpCount,
      'Instancing Batches': batchCount,
      'Instanced Objects': instanceCount
    });

    this._needsRebatch = false;
  }

  _onInstanceAdded(facade) {
    this._instanceables[facade.$facadeId] = facade;
    this._needsRebatch = true;
  }

  _onInstanceRemoved(facade) {
    delete this._instanceables[facade.$facadeId];
    this._needsRebatch = true;
  }

  _onInstanceChanged(facade) {
    this._needsRebatch = true;
  }

  _onInstanceMatrixChanged(facade) {
    // If a single instance's matrix changed and the batches are still otherwise valid, avoid a
    // full rebatch by updating just this instance's values in the matrix attributes directly.
    if (!this._needsRebatch) {
      let protoObject = facade.instancedThreeObject;
      let batchObject = facade._instancingBatchObject;
      let attrOffset = facade._instancingBatchAttrOffset;
      if (protoObject && batchObject && this._getBatchKey(protoObject) === this._getBatchKey(batchObject)) {
        let attrs = batchObject.geometry._instanceAttrs.matrix;
        let elements = facade.threeObject.matrixWorld.elements;
        attrs[0].setXYZW(attrOffset, elements[0], elements[4], elements[8], elements[12]).version++;
        attrs[1].setXYZW(attrOffset, elements[1], elements[5], elements[9], elements[13]).version++;
        attrs[2].setXYZW(attrOffset, elements[2], elements[6], elements[10], elements[14]).version++;
      } else {
        // Fallback just in case something didn't line up above - clear pointers and trigger rebatch
        facade._instancingBatchObject = facade._instancingBatchAttrOffset = null;
        this._needsRebatch = true;
      }
    }
  }

  _onInstanceUniformChanged(facade, uniformName) {
    if (!this._needsRebatch) {
      let protoObject = facade.instancedThreeObject;
      let batchObject = facade._instancingBatchObject;
      let attr;
      if (protoObject && batchObject && this._getBatchKey(protoObject) === this._getBatchKey(batchObject)
        && (attr = batchObject.geometry._instanceAttrs.uniforms[uniformName])) {
        setAttributeValue(attr, facade._instancingBatchAttrOffset, facade._instanceUniforms[uniformName]);
        attr.version++; //skip setter
      } else {
        // Fallback just in case something didn't line up above - clear pointers and trigger rebatch
        facade._instancingBatchObject = facade._instancingBatchAttrOffset = null;
        this._needsRebatch = true;
      }
    }
  }

  _getBatchKey(object) {
    let cache = this._batchKeysCache || (this._batchKeysCache = Object.create(null)); //cache results for duration of this frame
    let key = cache && cache[object.id];
    if (!key) {
      let uniforms = this._getInstanceUniformNames(object);
      key = `${object.geometry.id}|${object.material.id}|${uniforms ? uniforms.sort().join(',') : ''}`;
      cache[object.id] = key;
    }
    return key
  }

  _getInstanceUniformNames(object) {
    let namesSet = object._instanceUniformNames;
    if (!namesSet) return null
    let cache = this._uniformNamesCache || (this._uniformNamesCache = new Map());
    let namesArray = cache.get(namesSet);
    if (!namesArray) {
      namesArray = Array.from(namesSet);
      cache.set(namesSet, namesArray);
    }
    return namesArray
  }

  _getInstanceUniformSizes(material, uniformNames) {
    // Cache results per material for duration of this frame
    let cache = this._uniformSizesCache || (this._uniformSizesCache = new Map());
    let result = cache.get(material);
    if (!result) {
      result = Object.create(null);
      if (uniformNames) {
        uniformNames.forEach(name => {
          let size = getUniformItemSize(material, name);
          if (size > 0) {
            result[name] = size;
          }
        });
      }
      cache.set(material, result);
    }
    return result
  }

  _getBatchObject(instancedObject) {
    let {geometry, material} = instancedObject;

    // Upgrade the geometry to an instanced one
    if (!geometry.isBufferGeometry) {
      throw new Error('Instanceable proto object must use a BufferGeometry')
    }
    let batchKey = this._getBatchKey(instancedObject);
    let uniformNames = this._getInstanceUniformNames(instancedObject);
    let uniformSizes = this._getInstanceUniformSizes(material, uniformNames);
    let batchGeometry = this._batchGeometryPool.borrow(batchKey, geometry, uniformSizes);
    setInstanceCount(batchGeometry, 0);

    // Upgrade the material to one with the shader modifications for instancing
    let batchMaterial = getInstancingDerivedMaterial(material, uniformNames);
    let depthMaterial, distanceMaterial;

    // Create a new mesh object to hold it all
    let batchObject = Object.create(instancedObject, {
      // Redefine properties rather than setting them so we don't inadvertently trigger setters on
      // the base object:
      geometry: { value: batchGeometry },
      material: { value: batchMaterial },
      visible: { value: true },
      frustumCulled: { value: false },

      // Lazy getters for shadow materials:
      customDepthMaterial: {
        get() {
          if (!depthMaterial) {
            depthMaterial = batchMaterial.getDepthMaterial();
            // We need to trick WebGLRenderer into setting the `viewMatrix` uniform, which it doesn't
            // normally do for MeshDepthMaterial but it's needed by the instancing shader code. It does
            // for ShaderMaterials so we pretend to be one.
            depthMaterial.isShaderMaterial = true;
            depthMaterial.uniformsGroups = depthMaterial.uniformsGroups || [];
          }
          return depthMaterial
        }
      },
      customDistanceMaterial: {
        get() {
          if (!distanceMaterial) {
            distanceMaterial = batchMaterial.getDistanceMaterial();
            // We need to trick WebGLRenderer into setting the `viewMatrix` uniform, which it doesn't
            // normally do for MeshDistanceMaterial but it's needed by the instancing shader code. It does
            // for ShaderMaterials so we pretend to be one.
            distanceMaterial.isShaderMaterial = true;
            distanceMaterial.uniformsGroups = distanceMaterial.uniformsGroups || [];

            // Additionally, WebGLShadowMap.render() rotates a single camera 6 times per object, which fails
            // to trigger the code in WebGLRenderer.setProgram() that updates the viewMatrix uniform for
            // directions 2 through 6. Since we need a correct viewMatrix in the instancing shader code,
            // we hack it by defining our own viewMatrix uniform on the distance material and manually
            // updating it before each view of the distance cube is rendered. Unfortunately intercepting the
            // view changes in a way that has access to the shadow camera's viewMatrix has proven quite
            // difficult; the least-awful way I've found is to monkeypatch the `modelViewMatrix.multiplyMatrices()`
            // function which is always called - see (*!) below.
            distanceMaterial.uniforms = assign$2({
              viewMatrix: { value: new Matrix4() }
            }, distanceMaterial.uniforms);
          }
          return distanceMaterial
        }
      },
      // (*!) Hack for updating viewMatrix uniform on the distance material - see explanation above.
      modelViewMatrix: {
        value: function() {
          const modelViewMatrix = new Matrix4();
          modelViewMatrix.multiplyMatrices = function(viewMatrix, matrixWorld) {
            if (distanceMaterial) {
              distanceMaterial.uniforms.viewMatrix.value.copy(viewMatrix);
              distanceMaterial.uniformsNeedUpdate = true; //undocumented flag for ShaderMaterial
            }
            return Matrix4.prototype.multiplyMatrices.call(this, viewMatrix, matrixWorld)
          };
          return modelViewMatrix
        }()
      }
    });
    batchObject.$troikaBatchBaseObj = instancedObject;
    batchObject.$troikaInstancingManager = this;
    // NOTE other props are inherited so don't need to copy them
    return batchObject
  }

  _teardownBatchObjects(renderer, scene, camera) {
    // Release geometries to the pool for next time
    this._batchGeometryPool.releaseAll();

    // Clear caches from this render frame
    this._batchKeysCache = null;
    this._uniformNamesCache = null;
    this._uniformSizesCache = null;

    // Remove batch objects from scene
    scene.children = scene.children.filter(obj => obj.$troikaInstancingManager !== this);
  }

  destructor() {
    let pool = this._batchGeometryPool;
    pool.releaseAll();
    pool.disposeUnused();
    super.destructor();
  }
}


/**
 * Pool for the instancing batch geometries
 */
class BatchGeometryPool {
  constructor() {
    this._poolsByKey = Object.create(null);
  }

  borrow(key, baseGeometry, instanceUniformSizes) {
    let poolsByKey = this._poolsByKey;
    let pool = poolsByKey[key] || (poolsByKey[key] = {geometries: [], firstFree: 0});
    let batchGeometry = pool.geometries[pool.firstFree++];

    if (!batchGeometry) {
      batchGeometry = new InstancedBufferGeometry();
      assign$2(batchGeometry, baseGeometry);
      batchGeometry.attributes = assign$2({}, baseGeometry.attributes);
      let instanceAttrs = batchGeometry._instanceAttrs = {matrix: [], uniforms: Object.create(null)}; //separate collections for quicker lookup

      // Create instancing attributes for the modelMatrix's rows
      for (let row = 0; row < 3; row++) {
        let attr = new InstancedBufferAttribute(new Float32Array(INSTANCE_BATCH_SIZE * 4), 4);
        if (attr.setUsage) {
          attr.setUsage(DYNAMIC_DRAW);
        } else {
          attr.dynamic = true;
        }
        batchGeometry.attributes[`troika_modelMatrixRow${row}`] = attr;
        instanceAttrs.matrix[row] = attr;
      }

      // Create instancing attributes for the instanceUniforms
      for (let name in instanceUniformSizes) {
        let itemSize = instanceUniformSizes[name];
        let attr = new InstancedBufferAttribute(new Float32Array(INSTANCE_BATCH_SIZE * itemSize), itemSize);
        if (attr.setUsage) {
          attr.setUsage(DYNAMIC_DRAW);
        } else {
          attr.dynamic = true;
        }
        batchGeometry.attributes[`troika_${name}`] = attr;
        instanceAttrs.uniforms[name] = attr;
      }

      pool.geometries.push(batchGeometry);
    }

    return batchGeometry
  }

  releaseAll() {
    let pools = this._poolsByKey;
    if (pools) {
      for (let key in pools) {
        pools[key].firstFree = 0;
      }
    }
  }

  disposeUnused() {
    let pools = this._poolsByKey;
    if (pools) {
      for (let key in pools) {
        let {firstFree, geometries} = pools[key];
        for (let i = firstFree, len = geometries.length; i < len; i++) {
          // Only allow the instancing attributes to be disposed; those copied from the
          // original geometry will be up to the author to dispose of properly
          let attrs = geometries[i].attributes;
          for (let attrName in attrs) {
            if (attrs.hasOwnProperty(attrName) && attrName.indexOf('troika_') !== 0) {
              delete attrs[attrName];
            }
          }
          try {
            // can throw if it's already been disposed or hasn't yet been rendered
            geometries[i].dispose();
          } catch(e) { /* empty */ }
          geometries[i]._instanceAttrs = null;
        }
        geometries.length = firstFree;
      }
    }
  }
}


const proto = InstancingManager.prototype;
proto._notifyWorldHandlers = {
  instanceableAdded: proto._onInstanceAdded,
  instanceableRemoved: proto._onInstanceRemoved,
  instanceableChanged: proto._onInstanceChanged,
  instanceableMatrixChanged: proto._onInstanceMatrixChanged,
  instanceableUniformChanged: proto._onInstanceUniformChanged
};


function setAttributeValue(attr, offset, value) {
  let size = attr.itemSize;
  if (size === 1) {
    attr.setX(offset, value);
  }
  else if (size === 2) {
    attr.setXY(offset, value.x, value.y);
  }
  else if (size === 3) {
    if (value.isColor) {
      attr.setXYZ(offset, value.r, value.g, value.b);
    } else {
      attr.setXYZ(offset, value.x, value.y, value.z);
    }
  } else if (size === 4) {
    attr.setXYZW(offset, value.x, value.y, value.z, value.w);
  }
}

function getDefaultUniformValue(material, name) {
  // Try uniforms on the material itself, then try the builtin material shaders
  let uniforms = material.uniforms;
  if (uniforms && uniforms[name]) {
    return uniforms[name].value
  }
  uniforms = getShadersForMaterial(material).uniforms;
  if (uniforms && uniforms[name]) {
    return uniforms[name].value
  }
  return null
}

function getUniformItemSize(material, name) {
  return getItemSizeForValue(getDefaultUniformValue(material, name))
}

function getItemSizeForValue(value) {
  return value == null ? 0
    : typeof value === 'number' ? 1
    : value.isVector2 ? 2
    : (value.isVector3 || value.isColor) ? 3
    : value.isVector4 ? 4
    : Array.isArray(value) ? value.length
    : 0
}

// Handle maxInstancedCount -> instanceCount rename that happened in three r117
function getInstanceCount(geom) {
  return geom[geom.hasOwnProperty('instanceCount') ? 'instanceCount' : 'maxInstancedCount']
}
function setInstanceCount(geom, count) {
  geom[geom.hasOwnProperty('instanceCount') ? 'instanceCount' : 'maxInstancedCount'] = count;
}

const LIGHT_TYPES = {
  ambient: AmbientLight3DFacade,
  directional: DirectionalLight3DFacade,
  spot: SpotLight3DFacade,
  point: PointLight3DFacade,
  hemisphere: HemisphereLight3DFacade
};

const RAY_INTERSECTION = [{distance: Infinity}];
const INFINITE_SPHERE = new Sphere(undefined, Infinity);
const tempArr = [null];

class Scene3DFacade extends Object3DFacade {
  initThreeObject() {
    const scene = new Scene();
    // We always manually update world matrices when needed - see Object3DFacade.updateMatrices() -
    // so the additional auto-update pass done by threejs before render is not needed.
    // The flag was renamed autoUpdate->matrixWorldAutoUpdate in r144
    if ('matrixWorldAutoUpdate' in scene) {
      scene.matrixWorldAutoUpdate = false;
    } else {
      scene.autoUpdate = false;
    }
    return scene
  }

  afterUpdate () {
    let scene = this.threeObject;
    scene.background = this.background || null;
    scene.environment = this.environment || null;
    super.afterUpdate();
  }

  describeChildren() {
    // Add root instancing manager
    let children = {
      key: 'instancingMgr',
      facade: InstancingManager,
      children: this.objects
    };

    // Map light definitions to their appropriate classes
    let {lights} = this;
    if (lights) {
      children = [children];
      if (!Array.isArray(lights)) {
        tempArr[0] = lights;
        lights = tempArr;
      }
      lights.forEach((def, i) => {
        let facade = def.facade || LIGHT_TYPES[def.type];
        if (typeof facade === 'function') {
          let realDef = utils.assign({}, def);
          delete realDef.type;
          realDef.key = def.key || `light${ i }`;
          realDef.facade = facade;
          children.push(realDef);
        }
      });
    }

    return children
  }

  set fog(def) {
    let fogObj = this._fogObj;
    if (def) {
      let isExp2 = 'density' in def;
      let fogClass = isExp2 ? FogExp2 : Fog;
      if (!fogObj || !(fogObj instanceof fogClass)) {
        fogObj = this._fogObj = new fogClass();
      }
      fogObj.color.set(def.color);
      if (isExp2) {
        fogObj.density = def.density;
      } else {
        fogObj.near = def.near;
        fogObj.far = def.far;
      }
    } else {
      fogObj = this._fogObj = null;
    }
    this.threeObject.fog = fogObj;
  }

  getBoundingSphere() {
    return INFINITE_SPHERE
  }

  raycast(raycaster) {
    // Scene3DFacade will always intersect, but as the furthest from the camera
    return RAY_INTERSECTION
  }
}

const { assign: assign$1, forOwn } = utils;
const tempSphere = new Sphere();
const SQRT3 = Math.sqrt(3);
const PRECISION = 1e-8;


class BoundingSphereOctree {
  constructor() {
    this.root = null;
    this.keysToLeaves = Object.create(null);
  }

  putSpheres(spheres) {
    forOwn(spheres, (sphere, key) => {
      this.putSphere(key, sphere);
    });
  }

  putSphere(key, sphere) {
    const {center, radius} = sphere;

    // Sanity check
    if (!sphere || isNaN(radius) || isNaN(center.x)) {
      return
    }

    // To prevent excessively deep trees when spheres are very close together, apply a rounding
    // precision below which spheres will be treated as coincident and stored in the same leaf.
    center._roundedX = Math.round(center.x / PRECISION) * PRECISION;
    center._roundedY = Math.round(center.y / PRECISION) * PRECISION;
    center._roundedZ = Math.round(center.z / PRECISION) * PRECISION;

    this._putSphere(key, sphere);
  }

  _putSphere(key, sphere) {
    const {center} = sphere;
    const {root} = this;
    let {_roundedX, _roundedY, _roundedZ} = center;

    // If we already have a sphere for this key, perform an update
    if (key in this.keysToLeaves) {
      return this._updateSphere(key, sphere)
    }

    // First sphere being added: create a leaf octant and set it as the root. This will be replaced as
    // soon as a second item is added, so we can start with an initial root bounding cube that matches
    // our actual dataset rather than an arbitrary one.
    if (!root) {
      const newRoot = new Octant();
      newRoot.isLeaf = true;
      newRoot.addSphereData(key, sphere);
      this.root = newRoot;
      this.keysToLeaves[key] = newRoot;
    }

    // Second sphere being added:
    else if (root.isLeaf) {
      const oldRoot = this.root;
      const {dataX, dataY, dataZ} = root;

      // Handle special case where the second sphere has the same center point as the first, we still
      // can't determine good starting bounds so just append to the existing leaf
      if (dataX === _roundedX && dataY === _roundedY && dataZ === _roundedZ) {
        this._insertIntoOctant(key, sphere, root);
      }
      // Non-coincident: we can now choose an appropriate size for the root node's box. Overwrite the
      // root with a new branch octant, and set its position/size to the smallest whole-integer cube
      // that contains both sphere centerpoints. (Cube rounded to whole ints to avoid floating point issues)
      else {
        const newRoot = new Octant();
        const cx = newRoot.cx = Math.round((dataX + _roundedX) / 2);
        const cy = newRoot.cy = Math.round((dataY + _roundedY) / 2);
        const cz = newRoot.cz = Math.round((dataZ + _roundedZ) / 2);
        newRoot.cr = Math.ceil(Math.max(Math.abs(cx - dataX), Math.abs(cy - dataY), Math.abs(cz - dataZ)) + 1e-5);
        this.root = newRoot;

        // Re-add the original leaf's sphere(s) and the new sphere under the new branch root, and exit
        oldRoot.forEachLeafSphere((_sphere, _key) => this._insertIntoOctant(_key, _sphere, newRoot));
        this._insertIntoOctant(key, sphere, newRoot);
      }
    }

    // Expand the root to cover the new centerpoint if necessary, and insert the sphere within it
    else {
      this._expandToCoverPoint(_roundedX, _roundedY, _roundedZ);
      this._insertIntoOctant(key, sphere, this.root);
    }
  }

  _expandToCoverPoint(x, y, z) {
    // Loop until the root cube contains the new point...
    while (!this.root.containsPoint(x, y, z)) {
      // Create a larger branch, expanded by 2x in the corner direction closest to the new point
      const oldRoot = this.root;
      const {cx, cy, cz, cr} = oldRoot;
      const newRoot = new Octant();
      newRoot.maxRadius = oldRoot.maxRadius;
      newRoot.sphereCount = oldRoot.sphereCount;
      newRoot.leafCount = oldRoot.leafCount;

      newRoot.cx = cx + cr * (x < cx ? -1 : 1);
      newRoot.cy = cy + cr * (y < cy ? -1 : 1);
      newRoot.cz = cz + cr * (z < cz ? -1 : 1);
      newRoot.cr = cr * 2;

      // Move the old root to be a child of the new outer box, and make the outer box the new root
      const octantIdx = newRoot.getSubOctantIndexForPoint(cx, cy, cz);
      oldRoot.parent = newRoot;
      oldRoot.index = octantIdx;
      newRoot[octantIdx] = oldRoot;
      this.root = newRoot;
    }
  }

  _insertIntoOctant(key, sphere, octant) {
    const {center, radius} = sphere;
    const {_roundedX, _roundedY, _roundedZ} = center;

    // If the parent octant is a leaf:
    if (octant.isLeaf) {
      const {dataX, dataY, dataZ} = octant;

      // If the new sphere's center matches that of the leaf, add it to the leaf's members
      if (_roundedX === dataX && _roundedY === dataY && _roundedZ === dataZ) {
        octant.addSphereData(key, sphere);

        // Increase maxRadius up the parent tree as needed
        for (let oct = octant.parent; oct; oct = oct.parent) {
          if (radius > oct.maxRadius) { oct.maxRadius = radius; }
        }

        // Add to index
        this.keysToLeaves[key] =  octant;
      }

      // Otherwise split the leaf into a branch, push the old leaf down, and try again
      else {
        const newBranch = _createBranchFromLeaf(octant);
        octant.parent[octant.index] = newBranch;
        newBranch.addOctantForPoint(octant, dataX, dataY, dataZ);
        this._insertIntoOctant(key, sphere, newBranch); //recurse
      }
    }

    // The parent octant is a branch:
    else {
      // Always increment branch's total count
      octant.sphereCount++;

      // Find the suboctant index in which the new center point falls
      const subOctantIndex = octant.getSubOctantIndexForPoint(_roundedX, _roundedY, _roundedZ);

      // If there is nothing at that index yet, insert a new leaf octant
      let subOctant = octant[subOctantIndex];
      if (!subOctant) {
        const newLeaf = new Octant();
        newLeaf.isLeaf = true;
        octant.addOctantForPoint(newLeaf, _roundedX, _roundedY, _roundedZ);
        newLeaf.addSphereData(key, sphere);

        // Increment leafCount and maxRadius up the parent tree
        for (let oct = newLeaf.parent; oct; oct = oct.parent) {
          if (radius > oct.maxRadius) { oct.maxRadius = radius; }
          oct.leafCount++;
        }

        // Add to index
        this.keysToLeaves[key] = newLeaf;
      }

      // If there was already a sub-octant at that index, recurse
      else {
        return this._insertIntoOctant(key, sphere, subOctant)
      }
    }
  }

  removeSphere(key) {
    // Find the existing leaf that holds the sphere
    let leafOctant = this.keysToLeaves[key];
    if (!leafOctant) { return }

    // Preemptively decrement sphereCount up the parent tree
    let oct = leafOctant.parent;
    while (oct) {
      oct.sphereCount--;
      oct = oct.parent;
    }

    // If there are other members in the leaf, remove it from the leaf's members and keep the leaf in place
    if (leafOctant.sphereCount > 1) {
      // Remove sphere from the leaf data
      leafOctant.removeSphereData(key);

      // Update maxRadius up the tree
      leafOctant.updateMaxRadii();
    }

    // It was the only member of the leaf; remove the leaf and any ancestor branches that are now empty
    else {
      // Walk up the tree and remove all empty branches
      oct = leafOctant;
      let lowestRemainingOctant;
      do {
        const parent = oct.parent;
        lowestRemainingOctant = parent;
        if (parent) {
          parent[oct.index] = null;
        }
        oct = oct.parent;
      } while (oct && oct.sphereCount === 0)

      // If we got to the top of the tree, it's totally empty so set the root to null and exit
      if (!lowestRemainingOctant) {
        this.root = null;
        return
      }

      // Continue up the tree, decrementing the leafCount and looking for the highest branch point with only
      // a single remaining leaf underneath it, if any
      let highestSingleLeafBranch = null;
      oct = lowestRemainingOctant;
      while (oct) {
        oct.leafCount--;
        if (oct.leafCount === 1) {
          highestSingleLeafBranch = oct;
        }
        oct = oct.parent;
      }

      // If we were left with a branch with only one leaf descendant, move that leaf up to the branch point
      if (highestSingleLeafBranch) {
        let leaf = this._findSingleLeaf(highestSingleLeafBranch);
        const parent = highestSingleLeafBranch.parent;
        if (parent) {
          parent.addOctantForPoint(leaf, leaf.cx, leaf.cy, leaf.cz);
          parent.updateMaxRadii();
        } else {
          this.root = leaf;
        }
      } else {
        // Update the max radii up the tree from the lowest remaining node
        lowestRemainingOctant.updateMaxRadii();
      }
    }

    // Delete it from the index
    delete this.keysToLeaves[key];
  }

  _updateSphere(key, sphere) {
    // Find the existing leaf octant that holds the sphere
    let leaf = this.keysToLeaves[key];

    const center = sphere.center;
    const {_roundedX, _roundedY, _roundedZ} = center;

    // If its center point still falls within the leaf's cube, we can fast-path the changes:
    if (leaf.containsPoint(_roundedX, _roundedY, _roundedZ)) {
      const isMulti = leaf.sphereCount > 1;

      const hasMoved = _roundedX !== leaf.dataX ||
        _roundedY !== leaf.dataY ||
        _roundedZ !== leaf.dataZ;

      // If it was not the only member and has changed position, split that leaf; we can do this
      // slightly faster than a full remove+add because we know this will be the branch point and can
      // avoid some unnecessary upward tree walking
      if (isMulti && hasMoved) {
        leaf.removeSphereData(key);
        leaf.updateMaxRadii();
        this._insertIntoOctant(key, sphere, leaf);
      }

      // Otherwise we can just update this leaf
      else {
        if (hasMoved) {
          leaf.dataX = _roundedX;
          leaf.dataY = _roundedY;
          leaf.dataZ = _roundedZ;
        }
        if (sphere.radius !== leaf.maxRadius) {
          leaf.updateMaxRadii();
        }
      }
    }

    // If its center point is no longer within the leaf, delegate to full remove+add
    // TODO possible faster path: remove only up to lowest common ancestor branch point,
    // collapse remaining up to that point, and insert sphere under that point
    else {
      this.removeSphere(key);
      this._putSphere(key, sphere);
    }
  }

  // Optimized utility for finding single descendant leaf without creating a function
  _findSingleLeaf(octant) {
    let leaf;
    function visit(oct) {
      if (oct.isLeaf) leaf = oct;
    }
    function find(oct) {
      leaf = null;
      this.walkBranch(oct, visit);
      return leaf
    }
    this._findSingleLeaf = find; //reuse closure after first call
    return find.call(this, octant)
  }


  /**
   * Perform a depth-first walk of the tree structure, invoking a `callback` function for
   * each node. The `callback` will be passed the current tree node object, and will be invoked
   * for parent branch nodes first before their child nodes.
   *
   * If the function returns `false` for a branch node, none of that branch's children will be
   * visited; this is how you can efficiently query the tree by filtering out the majority of branches.
   *
   * @param {Function} callback
   */
  walkTree(callback) {
    if (this.root) {
      this.walkBranch(this.root, callback);
    }
  }
  walkBranch(root, callback) {
    if (callback(root) !== false && !root.isLeaf) {
      for (let i = 0; i < 8; i++) {
        if (root[i] !== null) {
          this.walkBranch(root[i], callback);
        }
      }
    }
  }


  /**
   * Given a {@link Ray}, search the octree for any spheres that intersect that ray and invoke
   * the given `callback` function, passing it the sphere and its key as arguments.
   * TODO need to handle near/far
   *
   * @param {Ray} ray
   * @param {Function} callback
   * @param {Object} scope
   */
  forEachSphereOnRay(ray, callback, scope) {
    return this._forEachMatchingSphere(ray.intersectsSphere.bind(ray), callback, scope)
  }

  forEachIntersectingSphere(sphere, callback, scope) {
    return this._forEachMatchingSphere(sphere.intersectsSphere.bind(sphere), callback, scope)
  }

  _forEachMatchingSphere(testFn, callback, scope) {
    // const startTime = performance.now()
    // let branchTests = 0
    // let sphereTests = 0
    // let sphereHits = 0

    function visitSphere(sphere, key) {
      // sphereTests++
      if (testFn(sphere)) {
        // sphereHits++
        callback.call(scope, sphere, key);
      }
    }

    this.walkTree((octant) => {
      if (octant.isLeaf) { //leaf
        octant.forEachLeafSphere(visitSphere);
      } else { //branch
        // branchTests++
        // Test using a sphere large enough to cover the maximum constituent bounding sphere with
        // its center anywhere within the octant's box. This will obviously catch some false positives
        // but those will be filtered at the leaf level.
        // TODO investigate using a Box3 test, which could have fewer false positives, but only if that
        // outweighs its slower speed (see https://jsperf.com/ray-intersectsphere-vs-intersectbox)
        tempSphere.center.set(octant.cx, octant.cy, octant.cz);
        tempSphere.radius = octant.cr * SQRT3 + octant.maxRadius;
        if (!testFn(tempSphere)) {
          return false //ignore this branch
        }
      }
      return true
    });

    //console.log(`Raycast search: ${branchTests} branch tests, ${sphereTests} sphere tests, and ${sphereHits} hits, in ${performance.now() - startTime}ms`)
  }
}




class Octant {
  containsPoint(x, y, z) {
    const {cx, cy, cz, cr} = this;
    return x >= cx - cr && x < cx + cr &&
      y >= cy - cr && y < cy + cr &&
      z >= cz - cr && z < cz + cr
  }

  getSubOctantIndexForPoint(x, y, z) {
    return (z < this.cz ? 0 : 4) + (y < this.cy ? 0 : 2) + (x < this.cx ? 0 : 1)
  }

  addOctantForPoint(subOctant, x, y, z) {
    const index = this.getSubOctantIndexForPoint(x, y, z);
    const subCR = this.cr / 2;

    subOctant.parent = this;
    subOctant.index = index;
    subOctant.cx = this.cx + subCR * (x < this.cx ? -1 : 1);
    subOctant.cy = this.cy + subCR * (y < this.cy ? -1 : 1);
    subOctant.cz = this.cz + subCR * (z < this.cz ? -1 : 1);
    subOctant.cr = subCR;

    this[index] = subOctant;
    return subOctant
  }

  findMaxSphereRadius() {
    let maxRadius = 0;
    if (this.isLeaf) {
      const data = this.data;
      if (this.sphereCount > 1) {
        for (let key in data) {
          const r = data[key].radius;
          if (r > maxRadius) maxRadius = r;
        }
      } else {
        maxRadius = data.radius;
      }
    } else {
      for (let i = 0; i < 8; i++) {
        if (this[i] !== null && this[i].maxRadius > maxRadius) {
          maxRadius = this[i].maxRadius;
        }
      }
    }
    return maxRadius
  }

  updateMaxRadii() {
    // Find the max maxRadius of the leaf octant's members
    let maxRadius = this.findMaxSphereRadius();

    // If the max radius has grown, just do a simple increase of the ancestor maxRadius values
    if (maxRadius > this.maxRadius) {
      let octant = this;
      while (octant) {
        if (maxRadius > octant.maxRadius) {
          octant.maxRadius = maxRadius;
        }
        octant = octant.parent;
      }
    }
    // If the max radius has shrunk, set it and repeat the process up the parent tree
    else if (maxRadius < this.maxRadius) {
      this.maxRadius = maxRadius;
      if (this.parent) {
        this.parent.updateMaxRadii();
      }
    }
  }

  addSphereData(key, sphere) {
    const count = this.sphereCount++;
    if (count === 0) {
      this.leafCount = 1;
      this.data = sphere;
      this.dataKey = key;
      // copy center coords from the first added sphere
      const {_roundedX, _roundedY, _roundedZ} = sphere.center;
      this.dataX = _roundedX;
      this.dataY = _roundedY;
      this.dataZ = _roundedZ;
    }
    else if (count === 1) {
      const oldSphere = this.data;
      const newData = this.data = Object.create(null);
      newData[this.dataKey] = oldSphere;
      newData[key] = sphere;
      this.dataKey = null;
    }
    else if (count > 1) {
      this.data[key] = sphere;
    }

    if (sphere.radius > this.maxRadius) {
      this.maxRadius = sphere.radius;
    }
  }

  removeSphereData(key) {
    const data = this.data;
    if (data) {
      const count = this.sphereCount--;
      if (count > 2) {
        delete data[key];
      }
      else if (count === 2) {
        for (let _key in data) {
          if (_key !== key) {
            this.dataKey = _key;
            this.data = data[_key];
            break
          }
        }
      }
      else {
        this.data = null;
      }
    }
  }

  forEachLeafSphere(fn, scope) {
    const data = this.data;
    if (data) {
      if (this.sphereCount > 1) {
        for (let key in data) {
          fn.call(scope, data[key], key);
        }
      } else {
        fn.call(scope, data, this.dataKey);
      }
    }
  }
}
assign$1(Octant.prototype, {
  // Relationships
  parent: null,
  index: -1,

  // Cube bounds
  cx: 0, //center x
  cy: 0, //center y
  cz: 0, //center z
  cr: 0, //cubic radius (dist from center to edge)

  // Sub-octants
  0: null,
  1: null,
  2: null,
  3: null,
  4: null,
  5: null,
  6: null,
  7: null,

  // Leaf data
  // For a single-item leaf (probably the vast majority) `data` will be the Sphere object and `dataKey`
  // will be its key. For a multi-item leaf, `data` will be an object of key->Sphere mappings and
  // `dataKey` will be null. I'm not a huge fan of the asymmetry but this lets us avoid an extra
  // sub-object for the majority of leaves while keeping the Octant's shape predictable for the JS engine.
  isLeaf: false,
  data: null,
  dataKey: null,
  // The first sphere added to the leaf will have its center position copied for easier access and
  // to avoid issues with the Sphere objects being mutated elsewhere.
  dataX: 0,
  dataY: 0,
  dataZ: 0,

  // Stats
  sphereCount: 0,
  leafCount: 0,
  maxRadius: 0
});



const _createBranchFromLeaf = (function() {
  const copyProps = ['parent', 'index', 'cx', 'cy', 'cz', 'cr', 'sphereCount', 'leafCount', 'maxRadius'];
  return function(leaf) {
    const branch = new Octant();
    for (let i = copyProps.length; i--;) {
      branch[copyProps[i]] = leaf[copyProps[i]];
    }
    return branch
  }
})();

const { assign } = utils;
const tmpVec2 = new Vector2();
const tmpVec3 = new Vector3();
const raycaster = new Raycaster();


class World3DFacade extends WorldBaseFacade {
  constructor(canvas) {
    super(canvas);
    this._object3DFacadesById = Object.create(null);
    this._onBgClick = this._onBgClick.bind(this);
  }

  afterUpdate() {
    let {width, height, antialias, backgroundColor, contextAttributes, _element:canvas} = this;

    // Set up renderer
    let renderer = this._threeRenderer;
    const RendererClass = this.rendererClass || WebGLRenderer;
    if (!renderer || !(renderer instanceof RendererClass)) {
      if (renderer) {
        renderer.dispose();
      }
      // Init the context manually so we can prefer webgl2
      contextAttributes = assign({
        alpha: true,
        antialias
      }, contextAttributes);
      const context = canvas.getContext('webgl2', contextAttributes) || undefined;
      renderer = this._threeRenderer = new RendererClass(assign({
        canvas,
        context
      }, contextAttributes));
    }

    const shadows = this.shadows;
    renderer.shadowMap.enabled = !!shadows;
    if (shadows && typeof shadows === 'object') {
      assign(renderer.shadowMap, shadows);
    }

    if (backgroundColor !== this._bgColor) {
      renderer.setClearColor(new Color(backgroundColor || 0), backgroundColor != null ? 1 : 0);
      this._bgColor = backgroundColor;
    }

    renderer.outputColorSpace = this.outputColorSpace || LinearSRGBColorSpace;
    renderer.colorSpace = this.colorSpace || LinearSRGBColorSpace;
    renderer.toneMapping = this.toneMapping || NoToneMapping;

    // Update render canvas size
    this._updateDrawingBufferSize(width, height, this.pixelRatio || window.devicePixelRatio || 1);

    super.afterUpdate();
  }

  describeChildren() {
    return [
      this._getCameraDef(),
      this._getSceneDef()
    ]
  }

  /**
   * Build a normalized definition for the camera facade
   * @protected
   */
  _getCameraDef() {
    const {camera} = this;
    return assign({
      key: 'camera',
      facade: PerspectiveCamera3DFacade,
      aspect: this.width / this.height
    }, camera)
  }

  /**
   * Build a normalized definition for the scene facade
   * @protected
   */
  _getSceneDef() {
    return {
      key: 'scene',
      facade: Scene3DFacade,
      lights: this.lights,
      objects: this.objects,
      fog: this.fog,
      background: this.background,
      environment: this.environment,
      onClick: this.onBackgroundClick ? this._onBgClick : null
    }
  }

  /**
   * Update the renderer's drawing buffer size
   * @protected
   */
  _updateDrawingBufferSize(width, height, pixelRatio) {
    const renderer = this._threeRenderer;
    renderer.getSize(tmpVec2);
    if (tmpVec2.width !== width || tmpVec2.height !== height || renderer.getPixelRatio() !== pixelRatio) {
      renderer.setDrawingBufferSize(width, height, pixelRatio);
    }
  }

  doRender(/*...frameArgs*/) {
    let sceneFacade = this.getChildByKey('scene');
    let scene = sceneFacade.threeObject;
    let camera = this.getChildByKey('camera').threeObject;
    let renderer = this._threeRenderer;

    // Invoke any onBeforeRender listeners
    let registry = this.eventRegistry;
    function invokeHandler(handler, facadeId) {
      handler.call(this._object3DFacadesById[facadeId], renderer, scene, camera);
    }
    registry.forEachListenerOfType('beforerender', invokeHandler, this);

    // Render scene
    renderer.render(scene, camera);

    // Invoke any onAfterRender listeners
    registry.forEachListenerOfType('afterrender', invokeHandler, this);

    let onStatsUpdate = this.onStatsUpdate;
    if (onStatsUpdate) {
      const {memory, render} = renderer.info;
      const stats = {
        'WebGL Draw Calls': render.calls,
        'WebGL Geometries': memory.geometries,
        'WebGL Textures': memory.textures,
        'WebGL Triangles': render.triangles
      };
      if (render.points) {
        stats['WebGL Points'] = render.points;
      }
      if (render.lines) {
        stats['WebGL Lines'] = render.lines;
      }
      onStatsUpdate(stats);
    }
  }

  /**
   * Implementation of abstract
   */
  getFacadeUserSpaceXYZ(facade) {
    let matrixEls = facade.threeObject.matrixWorld.elements;
    return this.projectWorldPosition(matrixEls[12], matrixEls[13], matrixEls[14])
  }

  projectWorldPosition(x, y, z) {
    tmpVec3.set(x, y, z);
    let camera = this.getChildByKey('camera');
    camera.updateMatrices();
    camera = camera.threeObject;

    // Make position relative to camera
    tmpVec3.applyMatrix4(camera.matrixWorldInverse);

    // Get relative distance to the point, negative if it's behind the camera
    let signedDistance = tmpVec3.length() * (tmpVec3.z > 0 ? -1 : 1);

    // Project x/y to screen coords
    tmpVec3.applyMatrix4(camera.projectionMatrix);
    let screenX = (tmpVec3.x + 1) * this.width / 2;
    let screenY = (1 - tmpVec3.y) * this.height / 2;

    return new Vector3(screenX, screenY, signedDistance)
  }

  /**
   * @override
   * In 3D worlds, we will normalize all pointer events so they always carry a `ray` property;
   * handlers for these events should then only rely on that, which is guaranteed to be present,
   * unlike `clientX/Y` etc. which are only present for pointer events originating from a screen.
   */
  _normalizePointerEvent(e) {
    // All pointer events in a 3D world will be given a `ray` property.
    if (!e.ray) {
      // normalize touch events
      let posInfo = e;
      if (e.touches) {
        let touches = /^touch(end|cancel)$/.test(e.type) ? e.changedTouches : e.touches;
        if (touches.length === 1) {
          posInfo = touches[0];
        }
      }

      // convert mouse position to normalized device coords (-1 to 1)
      const canvasRect = e.target.getBoundingClientRect(); //e.target is the canvas
      let width = canvasRect.width || this.width; //use logical size if no visible rect, e.g. offscreen canvas
      let height = canvasRect.height || this.height;
      let u = ((posInfo.clientX || 0) - (canvasRect.left || 0)) / width * 2 - 1;
      let v = ((posInfo.clientY || 0) - (canvasRect.top || 0)) / height * -2 + 1;

      // ensure camera's matrix is up to date
      let camera = this.getChildByKey('camera');
      camera.updateMatrices();

      // calculate the ray and put it on the event
      e.ray = camera.getRayAtProjectedCoords(u, v);
    }

    super._normalizePointerEvent(e);
  }

  /**
   * @override Implementation of abstract
   * @return {Array<{facade, distance, ?distanceBias, ...}>|null}
   */
  getFacadesAtEvent(e, filterFn) {
    return e.ray ? this.getFacadesOnRay(e.ray, filterFn) : null
  }

  getFacadesOnRay(ray, filterFn) {
    // update bounding sphere octree
    const octree = this._updateOctree();

    // search bounding sphere octree to quickly filter down to a small set of likely hits,
    // then do a true raycast on those facades
    let allHits = null;
    if (octree) {
      raycaster.ray = ray;
      octree.forEachSphereOnRay(ray, (sphere, facadeId) => {
        const facadesById = this._object3DFacadesById;
        const facade = facadesById && facadesById[facadeId];
        // let the filterFn eliminate things before trying to raycast them
        const hits = facade && (!filterFn || filterFn(facade)) && facade.raycast && facade.raycast(raycaster);
        if (hits && hits[0]) {
          // Ignore all but closest
          hits[0].facade = facade
          ;(allHits || (allHits = [])).push(hits[0]);
        }
      });
    }
    return allHits
  }

  _updateOctree() {
    // update octree with any new bounding spheres
    let octree = this._boundingSphereOctree;
    const changes = this._octreeChangeset;
    if (changes) {
      if (!octree) {
        octree = this._boundingSphereOctree = new BoundingSphereOctree();
      }
      const {remove, put} = changes;
      if (remove) {
        for (let facadeId in remove) {
          octree.removeSphere(facadeId);
        }
      }
      if (put) {
        for (let facadeId in put) {
          // Check for put requests for objects that are now obsolete
          const facade = this._object3DFacadesById[facadeId];
          if (facade && !facade.isDestroying && !(remove && remove[facadeId])) {
            const sphere = facade.getBoundingSphere && facade.getBoundingSphere();
            if (sphere) {
              octree.putSphere(facadeId, sphere);
            } else {
              octree.removeSphere(facadeId);
            }
          }
        }
      }
      this._octreeChangeset = null;
    }
    return octree
  }

  _queueForOctreeChange(changeType, facade) {
    const changes = this._octreeChangeset || (this._octreeChangeset = {});
    const map = changes[changeType] || (changes[changeType] = Object.create(null));
    map[facade.$facadeId] = facade;
  }

  _onBgClick(e) {
    // Ignore clicks that bubbled up
    if (e.target === e.currentTarget) {
      this.onBackgroundClick(e);
    }
  }

  destructor() {
    super.destructor();
    this._threeRenderer.dispose();
  }

}



World3DFacade.prototype._notifyWorldHandlers = assign(
  Object.create(WorldBaseFacade.prototype._notifyWorldHandlers),
  {
    getCameraPosition(source, outputVec3) {
      // We decompose from the world matrix here to handle pose transforms on top of the configured position
      outputVec3.setFromMatrixPosition(this.getChildByKey('camera').threeObject.matrixWorld);
    },
    getCameraFacade(source, data) {
      data.callback(this.getChildByKey('camera'));
    },
    getSceneFacade(source, data) {
      data.callback(this.getChildByKey('scene'));
    },
    projectWorldPosition(source, data) {
      let pos = data.worldPosition;
      data.callback(this.projectWorldPosition(pos.x, pos.y, pos.z));
    },
    object3DAdded(source) {
      this._object3DFacadesById[source.$facadeId] = source;
      this._queueForOctreeChange('put', source);
    },
    object3DBoundsChanged(source) {
      this._queueForOctreeChange('put', source);
    },
    object3DRemoved(source) {
      delete this._object3DFacadesById[source.$facadeId];
      this._queueForOctreeChange('remove', source);
    },
    rayPointerMotion(source, ray) {
      // Dispatch a custom event carrying the Ray, which will be used by our `getFacadesAtEvent`
      // override to search for a hovered facade
      const e = new MouseEvent('mousemove');
      e.isRayEvent = true;
      e.ray = ray;
      e.eventSource = source; //for tracking gesture states per ray source
      this._onPointerMotionEvent(e);
    },
    rayPointerAction(source, eventParams) {
      // Dispatch a custom event carrying the Ray, which will be used by our `getFacadesAtEvent`
      // override to search for a hovered facade
      const e = new (eventParams.type === 'wheel' ? WheelEvent : MouseEvent)(eventParams.type, eventParams);
      e.isRayEvent = true;
      e.ray = eventParams.ray;
      e.eventSource = source; //for tracking gesture states per ray source
      this._onPointerActionEvent(e);
    }
  }
);

const refireableEvents = [
  'onMouseOver',
  'onMouseOut',
  'onMouseMove',
  'onMouseDown',
  'onMouseUp',
  'onClick',
  'onDoubleClick'
];


/**
 * Create and return a higher-order facade class for a given facade class, that can render a
 * Troika sub-world (2D or 3D) into a Three.js `Texture` and supply that texture to
 * the facade. It can then be used by the facade for its own purposes, such as rendering
 * onto a 3D mesh.
 *
 * Pointer events will also be refired within the sub-world at the appropriate coordinates,
 * making the texture's contents interactive. This allows things like presenting a 2D user
 * interface that is mapped onto a 3D mesh.
 *
 * To configure the sub-world, define a `textureWorld` object on the facade's config. It
 * will work like any other facade config, and you'll need to set its `facade` property
 * to use either `World2DFacade` or `World3DFacade` as appropriate.
 *
 * To use the generated texture, access `this.worldTexture`.
 *
 * @param {Facade} WrappedFacadeClass
 * @return {Facade}
 */
function makeWorldTextureProvider(WrappedFacadeClass) {

  return class WorldTextureProvider extends WrappedFacadeClass {
    constructor(parent) {
      super(parent);
      this.worldTexture = new CanvasTexture(); //no canvas yet, will be added in first afterUpdate()

      // Wrap pointer events to both work as normal outer world events and also refire
      // in the inner world at their point on the surface texture
      const refire = this._refireAsInnerEvent.bind(this);
      refireableEvents.forEach(prop => {
        let userFn;
        function wrapperFn(e) {
          refire(e);
          if (userFn) userFn.call(this, e);
        }

        // trigger initial registration of event handler
        this[prop] = wrapperFn;

        // overwrite setter to just update the user-set function, and the getter
        // to always return the whole wrapper
        Object.defineProperty(this, prop, {
          set(val) {
            userFn = val;
          },
          get() {
            return wrapperFn
          }
        });
      });
    }

    afterUpdate() {
      // Init the inner world if needed
      let innerWorld = this._worldFacade;
      let newWorldConfig = this.textureWorld;
      if (!innerWorld || !newWorldConfig || !(innerWorld instanceof newWorldConfig.facade)) {
        if (innerWorld) {
          innerWorld.onAfterRender = null;
          innerWorld.destructor();
        }
        if (newWorldConfig) {
          this.worldTexture.dispose();
          const canvas = document.createElement('canvas');
          canvas.width = newWorldConfig.width;
          canvas.height = newWorldConfig.height;
          this.worldTexture = new CanvasTexture(canvas);
          innerWorld = this._worldFacade = new newWorldConfig.facade(canvas);

          // Trigger texture update whenever the inner world is rerendered
          innerWorld.onAfterRender = () => {
            this.worldTexture.needsUpdate = true;
            this.requestRender();
          };
        }
      }

      // Update the inner world
      if (innerWorld) {
        innerWorld.renderingScheduler = this._getOuterWorld().renderingScheduler;
        utils.assign(innerWorld, newWorldConfig, {pixelRatio: 1});
        innerWorld.afterUpdate();
      }

      super.afterUpdate();
    }

    _refireAsInnerEvent(e) {
      const world = this._worldFacade;
      if (world) {
        const uv = e.intersection && e.intersection.uv;
        const x = uv ? Math.round(uv.x * world.width) : -1;
        const y = uv ? Math.round((1 - uv.y) * world.height) : -1;

        const nativeEvent = e.nativeEvent || e;
        const innerEvent = document.createEvent('MouseEvents');
        innerEvent.initMouseEvent(
          nativeEvent.type, true, true, window, nativeEvent.detail, x, y, x, y, nativeEvent.ctrlKey,
          nativeEvent.altKey, nativeEvent.shiftKey, nativeEvent.metaKey, nativeEvent.button, null
        );
        this.worldTexture.image.dispatchEvent(innerEvent);
      }
    }

    _getOuterWorld() {
      let outerWorld = this;
      while(outerWorld && !outerWorld.isWorld) {
        outerWorld = outerWorld.parent;
      }
      return outerWorld
    }

    destructor() {
      const world = this._worldFacade;
      if (world) {
        world.onAfterRender = null;
        world.destructor();
      }
      this.worldTexture.dispose();
      super.destructor();
    }
  }

}

/**
 * Instanceable3DFacade is a specialized Object3DFacade that renders using GPU
 * instancing. This can give a significant performance boost for objects that
 * are rendered many thousands of times in a scene.
 *
 * Usage is nearly identical to an Object3DFacade, but instead of creating a
 * `threeObject` in the constructor, you set its `instancedThreeObject` property
 * to a common shared Mesh object. Any other Instanceable3DFacades in the scene
 * that reference the same `instancedThreeObject` will be batched together and
 * rendered using a single GPU draw call. The `instancedThreeObject` can be
 * changed at any time, allowing dynamic appearance changes by swapping out the
 * referenced mesh or its geometry or material.
 *
 * == Per-instance values: ==
 *
 * By default, the instances will each be rendered using their own world matrix
 * transform, so they can be positioned/scaled/rotated independently as usual.
 *
 * It is also possible, with a little extra effort, to allow specific shader
 * uniforms such as colors to be varied per instance. This works with both custom
 * shader materials as well as the built-in materials.
 *
 * To enable per-instance uniforms, use the `setInstanceUniform(name, value)`
 * method to set an instance's values for the enabled uniforms:
 *
 *     `this.setInstanceUniform('diffuse', new Color(color))`
 *
 * If an instance does not have a uniform value set this way, it will fall back to using
 * the default value in the material's `uniforms` object.
 *
 * The uniform types that allow instancing are: `int`, `float`, `vec2`, `vec3`, and `vec4`.
 * Mapping from application value types such as `Vector2` or `Color` behaves similarly to
 * how three.js does it internally. More complex uniform types such as textures are not
 * instanceable.
 *
 * == Caveats: ==
 *
 * It is generally not recommended to use this technique on meshes that are semi-
 * transparent, as there is no guarantee that they will be drawn in back-to-front
 * order relative to the camera position.
 */
class Instanceable3DFacade extends Object3DFacade {
  constructor(parent) {
    let obj = new Object3D();

    // Trigger scene graph size optimizations
    obj.isRenderable = false;

    // Visibility change affects batching so listen for changes
    obj.$troikaVisible = obj.visible;
    Object.defineProperty(obj, 'visible', visibilityPropDef);

    super(parent, obj);

    this.notifyWorld('instanceableAdded');
  }

  /**
   * @property {Object3D} instancedThreeObject
   * Sets the Mesh instance to use for batching this instance with others that
   * reference the same Mesh.
   */

  /**
   * Sets this instance's value for a shader uniform.
   * @param {String} name
   * @param {Number|Vector2|Vector3|Vector4|Color} value
   */
  setInstanceUniform(name, value) {
    let values = this._instanceUniforms || (this._instanceUniforms = Object.create(null));
    if (values[name] !== value) {
      // If this is a new uniform value, add it to the Set of instance uniform names
      const obj = this.instancedThreeObject;
      if (obj && !(name in values)) {
        const names = obj._instanceUniformNames || (obj._instanceUniformNames = new Set());
        names.add(name);
      }
      values[name] = value;
      this.notifyWorld('instanceableUniformChanged', name);
    }
  }

  afterUpdate() {
    const newObj = this.instancedThreeObject;
    const oldObj = this._instancedObj;
    if (newObj !== oldObj) {
      if (newObj && this._instanceUniforms) { //make sure new object tracks our instance uniforms
        const names = newObj._instanceUniformNames || (newObj._instanceUniformNames = new Set());
        for (let name in this._instanceUniforms) {
          names.add(name);
        }
      }
      this._instancedObj = newObj;
      this.notifyWorld('instanceableChanged');
      this._boundsChanged = true;
    }
    super.afterUpdate();
  }

  updateMatrices() {
    const prevMatrixVersion = this._worldMatrixVersion;

    super.updateMatrices();

    // If the world matrix changed, we must notify the instancing manager
    if (this._worldMatrixVersion !== prevMatrixVersion && this.threeObject.$troikaVisible) {
      this.notifyWorld('instanceableMatrixChanged');
    }
  }

  destructor() {
    this.notifyWorld('instanceableRemoved');
    super.destructor();
  }

  // Custom bounding sphere calc
  getGeometry() {
    let instancedObj = this.instancedThreeObject;
    return instancedObj && instancedObj.geometry
  }

  // Custom raycasting based on current geometry and transform
  raycast(raycaster) {
    let {instancedThreeObject, threeObject} = this;
    if (instancedThreeObject && threeObject) {
      let origMatrix = instancedThreeObject.matrixWorld;
      instancedThreeObject.matrixWorld = threeObject.matrixWorld;
      let result = this._raycastObject(instancedThreeObject, raycaster); //use optimized method
      instancedThreeObject.matrixWorld = origMatrix;
      return result
    }
    return null
  }
}

const visibilityPropDef = {
  set(visible) {
    if (visible !== this.$troikaVisible) {
      this.$troikaVisible = visible;
      this.$facade.notifyWorld('instanceableChanged');
    }
  },
  get() {
    return this.$troikaVisible
  }
};

// Predefine shape to facilitate JS engine optimization
utils.assign(Instanceable3DFacade.prototype, {
  _lastInstancedMatrixVersion: -1,
  _instancedThreeObject: null
});

const dummyGeometry = new BufferGeometry();
const dummyMaterial = new MeshBasicMaterial();

const MESH_MATERIALS = {
  'basic': MeshBasicMaterial,
  'depth': MeshDepthMaterial,
  'distance': MeshDistanceMaterial,
  'lambert': MeshLambertMaterial,
  'matcap': MeshMatcapMaterial,
  'normal': MeshNormalMaterial,
  'phong': MeshPhongMaterial,
  'physical': MeshPhysicalMaterial,
  'standard': MeshStandardMaterial,
  'toon': MeshToonMaterial,
};



/**
 * A facade for rendering a Mesh. The following properties are supported:
 *
 * @member {Geometry|BufferGeometry} geometry - The geometry instance to be used for this
 *         mesh. It's recommended to use a shared geometry instance between meshes when possible.
 * @member {string|class|Material} material - The type of the material to be used for this mesh. Can either
 *         be a reference to a Material class, a Material instance, or one of the strings in the `MESH_MATERIALS`
 *         enum. Defaults to 'standard'.
 * @member {boolean} autoDisposeGeometry - Whether the geometry should be automatically disposed when this
 *         mesh is removed from the scene. Defaults to `false`. You can set it to `true` as a memory optimization
 *         if the geometry is not expected to return to the scene later, but this is not generally needed.
 * @member {boolean} autoDisposeMaterial - Whether the material's shader program should be automatically disposed
 *         when this mesh is removed from the scene. Defaults to `false`. You can set it to `true` as a memory
 *         optimization if the material uses a custom shader that is not expected to be used again, but this is
 *         not generally needed. Note that this will _not_ dispose any textures assigned to the material.
 *
 * Also, for convenience, properties of the material can be set via `material.*` shortcut properties. For example,
 * passing `{"material.transparent": true, "material.opacity": 0.5}` will set the material to half-opaque
 * transparency. Colors will call `set` on the Color object for that material property.
 */
class MeshFacade extends Object3DFacade {
  constructor (parent) {
    super(parent);
    this.material = 'standard';
    this.autoDisposeGeometry = false;
    this.autoDisposeMaterial = false;
    this._dirtyMtlProps = null;
  }

  initThreeObject () {
    return new Mesh(dummyGeometry, dummyMaterial)
  }

  afterUpdate() {
    let {geometry, material, threeObject} = this;

    if ((geometry || dummyGeometry) !== threeObject.geometry) {
      if (this.autoDisposeGeometry) {
        threeObject.geometry.dispose();
      }
      threeObject.geometry = geometry || dummyGeometry;
    }

    // Resolve `material` prop to a Material instance
    if (material !== this._lastMtl) {
      this._lastMtl = material;
      if (typeof material === 'string') {
        material = new (MESH_MATERIALS[material] || MeshStandardMaterial)();
      }
      else if (material && material.isMaterial) ;
      else if (typeof material === 'function') {
        material = new material();
      }
      else {
        material = new MeshStandardMaterial();
      }
      if (threeObject.material !== material) {
        if (this.autoDisposeMaterial) {
          threeObject.material.dispose();
        }
        threeObject.material = material;
      }
    }

    // If any of the material setters were called, sync the dirty values to the material
    const dirties = this._dirtyMtlProps;
    if (dirties) {
      threeObject.material.setValues(dirties);
      this._dirtyMtlProps = null;
    }

    super.afterUpdate();
  }

  destructor () {
    if (this.autoDisposeGeometry) {
      this.threeObject.geometry.dispose();
    }
    if (this.autoDisposeMaterial) {
      this.threeObject.material.dispose();
    }
    super.destructor();
  }
}

// For all of the known mesh materials, add `material.*` setters for all of their
// supported properties. The setters will update a "dirty" object which will then be
// applied to the material during afterUpdate; this lets us only deal with the specific
// material props that have been set rather than having to iterate over all props.
const ignoreMaterialProps = {type:1, id:1, uuid:1, version:1};
Object.keys(MESH_MATERIALS).forEach(key => {
  let material = new MESH_MATERIALS[key]();
  for (let mtlProp in material) {
    if (material.hasOwnProperty(mtlProp) && !ignoreMaterialProps.hasOwnProperty(mtlProp)) {
      Object.defineProperty(MeshFacade.prototype, `material.${mtlProp}`, {
        enumerable: true,
        configurable: true,
        get() {
          const dirties = this._dirtyMtlProps;
          return (dirties && mtlProp in dirties) ? dirties[mtlProp] : this.threeObject.material[mtlProp]
        },
        set(value) {
          const dirties = this._dirtyMtlProps || (this._dirtyMtlProps = Object.create(null));
          dirties[mtlProp] = value;
        }
      });
    }
  }
});

/**
 * Return a singleton instance of a 1x1x1 BoxGeometry
 * @type {function(): BoxGeometry}
 */
const getBoxGeometry = utils.memoize(() => {
  return new BoxGeometry(1, 1, 1, 1, 1)
});


/**
 * A simple box, centered on the origin.
 * The `width` property controls x scale, the `height` property controls y scale, and the `depth`
 * property controls z scale.
 * To control the material, see {@link MeshFacade}.
 */
class BoxFacade extends MeshFacade {
  get geometry() {
    return getBoxGeometry()
  }

  set width(width) {
    this.scaleX = width;
  }
  get width() {
    return this.scaleX
  }

  set height(height) {
    this.scaleY = height;
  }
  get height() {
    return this.scaleY
  }

  set depth(width) {
    this.scaleZ = width;
  }
  get depth() {
    return this.scaleZ
  }
}

const geometries$1 = Object.create(null, [
  ['low', 32],
  ['medium', 64],
  ['high', 128]
].reduce((descr, [name, segments]) => {
  descr[name] = {
    get: utils.memoize(() =>
      new CircleGeometry(1, segments).rotateX(-Math.PI / 2)
    )
  };
  return descr
}, {}));

function getCircleGeometry(detail) {
  return geometries$1[detail] || geometries$1.medium
}

/**
 * A simple planar circle, laying along the x-z plane, facing the positive y axis, centered on the origin.
 * The `radius` property is an alias to uniform `scaleX` and `scaleZ`. Set `scaleX/Y/Z` individually if
 * you need non-uniform scaling.
 * The `detail` property allows selecting a LOD; its values can be 'low', 'medium', or 'high'.
 * To control the material, see {@link MeshFacade}.
 */
class CircleFacade extends MeshFacade {
  constructor (parent) {
    super(parent);
    this['material.side'] = this['material.shadowSide'] = DoubleSide;
  }

  get geometry() {
    return getCircleGeometry(this.detail)
  }

  set radius(r) {
    this.scaleX = this.scaleZ = r;
  }
  get radius() {
    return this.scaleX
  }
}

/**
 * A simple cube, centered on the origin.
 * The `size` property sets the uniform edge length. For non-uniform boxes, use {@link BoxFacade.js#Box}
 * To control the material, see {@link MeshFacade}.
 */
class CubeFacade extends MeshFacade {
  get geometry() {
    return getBoxGeometry()
  }

  set size(size) {
    this.scale = size;
  }
  get size() {
    return this.scale
  }
}

const getGeometry = utils.memoize(() => {
  return new PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2)
});

/**
 * A simple rectangular plane, laying along the x-z plane, facing the positive y axis, centered on the origin.
 * The `width` property controls x scale and the `depth` property controls z scale.
 * To control the material, see {@link MeshFacade}.
 */
class PlaneFacade extends MeshFacade {
  constructor (parent) {
    super(parent);
    this['material.side'] = this['material.shadowSide'] = DoubleSide;
  }

  get geometry() {
    return getGeometry()
  }

  set width(width) {
    this.scaleX = width;
  }
  get width() {
    return this.scaleX
  }

  set depth(width) {
    this.scaleZ = width;
  }
  get depth() {
    return this.scaleZ
  }
}

const geometries = Object.create(null, [
  ['low', 16, 12],
  ['medium', 32, 24],
  ['high', 64, 48]
].reduce((descr, [name, wSegs, hSegs]) => {
  descr[name] = {
    get: utils.memoize(() => new SphereGeometry(1, wSegs, hSegs))
  };
  return descr
}, {}));

function getSphereGeometry(detail) {
  return geometries[detail] || geometries.medium
}

/**
 * A simple sphere, centered on the origin.
 * The `radius` property is an alias to the uniform `scale`. Set `scaleX/Y/Z` individually if
 * you need non-uniform scaling.
 * The `detail` property allows selecting a LOD; its values can be 'low', 'medium', or 'high'.
 * To control the material, see {@link MeshFacade}.
 */
class SphereFacade extends MeshFacade {
  get geometry() {
    return getSphereGeometry(this.detail)
  }

  set radius(r) {
    this.scale = r;
  }
  get radius() {
    return this.scale
  }
}

export { AmbientLight3DFacade, BoxFacade, CircleFacade, CubeFacade, DirectionalLight3DFacade, Facade, Group3DFacade, HemisphereLight3DFacade, HtmlOverlay3DFacade, Instanceable3DFacade, InstancingManager, List as ListFacade, MeshFacade, Object3DFacade, OrthographicCamera3DFacade, ParentFacade, PerspectiveCamera3DFacade, PlaneFacade, PointLight3DFacade, RectAreaLight3DFacade, Scene3DFacade, SphereFacade, SpotLight3DFacade, World3DFacade, createDerivedMaterial, makeWorldTextureProvider };
