import { Runner, Tween, MultiTween, SpringTween } from 'troika-animation';

///// Miscellaneous Utility Functions /////


/**
 * Pseudo-polyfilled shortcut for `Object.assign`. Copies own properties from
 * second-and-after arguments onto the first object, overwriting any that already
 * exist, and returns the first argument.
 * @return {object}
 */
const assign = Object.assign || _assign;

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
function forOwn(object, fn, scope) {
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
	assign: assign,
	_assign: _assign,
	assignIf: assignIf,
	assignDeep: assignDeep,
	forOwn: forOwn,
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

assign(Facade.prototype, {
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
      this.animation$runner = new Runner();
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
                      let propTween = new Tween(
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
              let tween = newAnimTweens[animId] = new MultiTween(keyframePropTweens, duration, delay, easing, iterations, direction);
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
                ? new SpringTween(
                  actuallySet.bind(this), //callback
                  this[propName], //fromValue
                  value, //toValue
                  springConfig, //springConfig (mass, friction, tension)
                  0, //initialVelocity
                  transition.delay || 0 //delay
                )
                : new Tween(
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
        (hoverValuesToUse || activeValuesToUse) ? assign(Object.create(null), hoverValuesToUse, activeValuesToUse) : null;

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
    assign(this, extraProps);

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

export { Facade, List as ListFacade, ParentFacade, PointerEventTarget, WorldBaseFacade, utils };
