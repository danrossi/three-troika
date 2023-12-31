import { Vector3, Object3D, Sphere, Raycaster, Vector2, Matrix4, Quaternion, PerspectiveCamera, OrthographicCamera, Frustum, Ray, Group, HemisphereLightHelper, HemisphereLight, AmbientLight, DirectionalLightHelper, DirectionalLight, SpotLightHelper, SpotLight, PointLightHelper, PointLight, RectAreaLight, InstancedBufferGeometry, InstancedBufferAttribute, Scene, FogExp2, Fog, WebGLRenderer, Color, NoToneMapping, CanvasTexture, BufferGeometry, MeshBasicMaterial, MeshDepthMaterial, MeshDistanceMaterial, MeshLambertMaterial, MeshMatcapMaterial, MeshNormalMaterial, MeshPhongMaterial, MeshPhysicalMaterial, MeshStandardMaterial, MeshToonMaterial, Mesh, BoxGeometry, CircleGeometry, DoubleSide, PlaneGeometry, SphereGeometry } from 'three';
import { Facade, utils, PointerEventTarget, WorldBaseFacade } from 'troika-core';
export { Facade, ListFacade, ParentFacade } from 'troika-core';
import { invertMatrix4, createDerivedMaterial, getShaderUniformTypes, voidMainRegExp, getShadersForMaterial } from 'troika-three-utils';
export { createDerivedMaterial } from 'troika-three-utils';

const {assign: assign$3, forOwn: forOwn$1} = utils;
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
assign$3(Object3DFacade.prototype, {
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


    //backwards compatibility support for output encoding and color space
    //set colorspace to SRGBColorSpace or LinearSRGBColorSpace
    if ('outputColorSpace' in renderer && this.outputColorSpace) {
      renderer.outputColorSpace = this.outputColorSpace;
    } else {
      renderer.outputEncoding = this.outputEncoding || 3000;
    }

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

export { AmbientLight3DFacade, BoxFacade, CircleFacade, CubeFacade, DirectionalLight3DFacade, Group3DFacade, HemisphereLight3DFacade, HtmlOverlay3DFacade, Instanceable3DFacade, InstancingManager, MeshFacade, Object3DFacade, OrthographicCamera3DFacade, PerspectiveCamera3DFacade, PlaneFacade, PointLight3DFacade, RectAreaLight3DFacade, Scene3DFacade, SphereFacade, SpotLight3DFacade, World3DFacade, makeWorldTextureProvider };
