import { requestFlexLayout } from 'troika-flex-layout';
import { utils } from 'troika-core';
import { Vector2, Vector4, PlaneGeometry, MeshBasicMaterial, Color, Mesh, CylinderGeometry, Matrix4, Plane, Sphere, Vector3, TextureLoader } from 'three';
import { createDerivedMaterial, Instanceable3DFacade, ParentFacade, Object3DFacade, Group3DFacade } from 'troika-3d';
import { Text3DFacade } from 'troika-3d-text';
import { invertMatrix4 } from 'troika-three-utils';

const { assign, createClassExtender } = utils;

/**
 * Extends a given Facade class to become a `FlexNode`, giving it the ability to participate
 * in flexbox layout. The resulting class behaves just like the original facade class, except:
 *
 * - It now accepts a full set of flexbox-related input properties, defined below
 * - Those input properties get evaluated by a flexbox layout algorithm in the background
 * - The resulting layout metrics get written to the object as properties that the extended
 *   facade class can use in its `afterUpdate` method to affect its position/size/styling.
 *
 * The flexbox layout algorithm is performed asynchronously within a web worker, so the result
 * metrics will probably not be available the first time `afterUpdate` is called. This can
 * sometimes cause issues with rendering due to NaNs, so it's good to check first that the
 * object has a nonzero `offsetWidth` and `offsetHeight` before displaying the node's object(s).
 *
 * Currently the flexbox algorithm implementation is Facebook's Yoga. (https://yogalayout.com/)
 *
 * *Supported input flexbox style properties:*
 * - width (number, string percentage, or 'auto')
 * - height (number, string percentage, or 'auto')
 * - minWidth (number, string percentage, or 'auto')
 * - minHeight (number, string percentage, or 'auto')
 * - maxWidth (number, string percentage, or 'auto')
 * - maxHeight (number, string percentage, or 'auto')
 * - aspectRatio (number, as width divided by height, or 'auto')
 * - flexDirection ('column', 'column-reverse', 'row', or 'row-reverse')
 * - flexWrap ('wrap' or 'nowrap')
 * - flex (number, where positive becomes flexGrow and negative becomes flexShrink)
 * - flexGrow (number)
 * - flexShrink (number)
 * - flexBasis (number, string percentage, or 'auto')
 * - alignContent ('auto', 'baseline', 'center', 'flex-end', 'flex-start', or 'stretch')
 * - alignItems ('auto', 'baseline', 'center', 'flex-end', 'flex-start', or 'stretch')
 * - alignSelf ('auto', 'baseline', 'center', 'flex-end', 'flex-start', or 'stretch')
 * - justifyContent ('center', 'flex-end', 'flex-start', 'space-around', or 'space-between')
 * - position ('relative' or 'absolute')
 * - top (number, string percentage, or 'auto')
 * - right (number, string percentage, or 'auto')
 * - bottom (number, string percentage, or 'auto')
 * - left (number, string percentage, or 'auto')
 * - margin (number, or array of up to four numbers in t-r-b-l order)
 * - padding (number, or array of up to four numbers in t-r-b-l order)
 * - borderWidth (number, or array of up to four numbers in t-r-b-l order)
 * - overflow ('visible', 'hidden', or 'scroll')
 *
 * *Computed layout result properties:*
 * - offsetLeft
 * - offsetTop
 * - offsetWidth
 * - offsetHeight
 * - clientLeft
 * - clientTop
 * - clientWidth
 * - clientHeight
 * - scrollLeft
 * - scrollTop
 * - scrollWidth
 * - scrollHeight
 * - clipLeft
 * - clipTop
 * - clipRight
 * - clipBottom
 * (All of these are `null` initially and then numbers after the layout completes, except
 * scrollLeft and scrollTop which are `0` initially.)
 *
 * *Additional FlexNode-specific properties:*
 * - isFlexNode (`true`, can be used to find FlexNodes in the facade tree)
 * - flexNodeDepth (number, where topmost FlexNode's depth is `0` and children increase by 1)
 * - parentFlexNode (the nearest parent FlexNode instance, or `null` if this is the root FlexNode)
 * - needsFlexLayout (boolean, can be set to force a recalculation of the full flexbox layout)
 *
 * If the base class implements an `onAfterFlexLayoutApplied`, that will be invoked after the
 * results of a flex layout pass have been written to the object. This is a good place to put
 * custom logic that depends on a completed layout, rather than in `afterUpdate` which may have
 * layout properties queued but not yet evaluated.
 *
 * @param {class} BaseFacadeClass
 * @return {FlexNode} a new class that extends the BaseFacadeClass
 */
const extendAsFlexNode = createClassExtender('flexNode', BaseFacadeClass => {

  class FlexNode extends BaseFacadeClass {
    constructor(parent) {
      super(parent);
      this.isFlexNode = true;
      this.needsFlexLayout = true;

      // Object holding all input styles for this node in the flex tree; see the style object
      // format in troika-flex-layout
      this._flexStyles = {
        id: this.$facadeId
      };

      // Look for the nearest flex layout ancestor; if there is one, add to its layout children,
      // otherwise we're a flex layout root.
      let parentFlexFacade = parent;
      while (parentFlexFacade && !parentFlexFacade.isFlexNode) {parentFlexFacade = parentFlexFacade.parent;}
      if (parentFlexFacade) {
        this.parentFlexNode = parentFlexFacade;
        this.flexNodeDepth = parentFlexFacade.flexNodeDepth + 1;
      } else {
        this.flexNodeDepth = 0;
      }
    }

    afterUpdate() {
      // Keep max scroll and clip rects in sync
      if (this.offsetWidth != null) {
        this._checkOverscroll();
        this._updateClipRect();
      }

      super.afterUpdate();

      // Did something change that requires a layout recalc?
      if (this.needsFlexLayout) {
        // If we're managed by an ancestor layout root, let it know
        if (this.parentFlexNode) {
          this.notifyWorld('needsFlexLayout');
          this.needsFlexLayout = false;
        }
        // If we're the layout root, perform the layout
        else {
          this._performRootLayout();
        }
      }
    }

    destructor() {
      if (this.parentFlexNode) {
        this.notifyWorld('needsFlexLayout');
      }
      super.destructor();
    }

    onNotifyWorld(source, message, data) {
      if (message === 'needsFlexLayout' && !this.parentFlexNode) {
        this.needsFlexLayout = true;
        if (!this._rootLayoutReq) {
          this._rootLayoutReq = setTimeout(this._performRootLayout.bind(this), 0);
        }
        return
      }
      super.onNotifyWorld(source, message, data);
    }

    _performRootLayout() {
      // If there's a request in progress, don't queue another one yet; that will happen
      // automatically after the current one finishes and it calls afterUpdate again
      if (this._hasActiveFlexRequest) return

      this._hasActiveFlexRequest = true;
      this.needsFlexLayout = false;
      clearTimeout(this._rootLayoutReq);
      delete this._rootLayoutReq;

      // Traverse the flex node tree in document order and add the ordered child
      // relationships to the style nodes at each level
      this.traverse(facade => {
        if (facade.isFlexNode) {
          const parent = facade.parentFlexNode;
          if (parent) {
            const siblings = parent._flexStyles.children || (parent._flexStyles.children = []);
            siblings.push(facade._flexStyles);
          }
          facade._flexStyles.children = null; //clear own leftover children from last time
        }
      });

      requestFlexLayout(this._flexStyles, results => {
        if (!this.isDestroying) {
          this._applyRootLayoutResults(results);

          // Final afterUpdate on the whole subtree
          this._hasActiveFlexRequest = false;
          this.afterUpdate();
          this.requestRender();
        }
      });
    }

    _applyRootLayoutResults(results) {
      // Results will be a flat map of facade id to computed layout; traverse the tree
      // and math them up, applying them as `computedXYZ` properties
      this.traverse(facade => {
        if (facade.isFlexNode) {
          const computedLayout = results[facade.$facadeId];
          if (computedLayout) {
            const {left, top, width, height} = computedLayout;
            const {borderWidth, padding} = facade;

            // Outer metrics
            facade.offsetLeft = left;
            facade.offsetTop = top;
            facade.offsetWidth = width;
            facade.offsetHeight = height;

            // Inner metrics
            facade.clientLeft = borderWidth[3] + padding[3];
            facade.clientTop = borderWidth[0] + padding[0];
            facade.clientWidth = width - borderWidth[1] - borderWidth[3] - padding[1] - padding[3];
            facade.clientHeight = height - borderWidth[0] - borderWidth[2] - padding[0] - padding[2];

            // Scrolling metrics
            facade.scrollHeight = facade.scrollWidth = 0;
            const parent = facade.parentFlexNode;
            if (parent) {
              let w = left + width - parent.clientLeft;
              let h = top + height - parent.clientTop;
              // Note: allowing a small tolerance here between scrollWidth/Height and clientWidth/Height,
              // to account for very slight overflows due to floating point math errors
              if (w > parent.scrollWidth) {
                if (Math.abs(w - parent.clientWidth) < w / 10000) {
                  w = parent.clientWidth;
                }
                parent.scrollWidth = w;
              }
              if (h > parent.scrollHeight) {
                if (Math.abs(h - parent.clientHeight) < h / 10000) {
                  h = parent.clientHeight;
                }
                parent.scrollHeight = h;
              }
            }

            if (facade.onAfterFlexLayoutApplied) {
              facade.onAfterFlexLayoutApplied();
            }
          }
        }
      });
    }

    _checkOverscroll() {
      const {scrollLeft, scrollTop} = this;
      if (scrollLeft || scrollTop) {
        const maxScrollLeft = Math.max(0, this.scrollWidth - this.clientWidth);
        const maxScrollTop = Math.max(0, this.scrollHeight - this.clientHeight);
        if (maxScrollLeft < scrollLeft) {
          this.scrollLeft = maxScrollLeft;
        }
        if (maxScrollTop < scrollTop) {
          this.scrollTop = maxScrollTop;
        }
      }
    }

    _updateClipRect() {
      const {offsetWidth, offsetHeight, parentFlexNode:parent} = this;
      const INF = Infinity;
      let clipLeft, clipTop, clipRight, clipBottom;

      if (parent && this.position !== 'absolute') {
        const scrolledLeft = this.offsetLeft - parent.scrollLeft;
        const scrolledTop = this.offsetTop - parent.scrollTop;
        const doesParentClip = parent.overflow !== 'visible';
        clipLeft = Math.max(doesParentClip ? parent.clientLeft : -INF, parent.clipLeft) - scrolledLeft;
        clipTop = Math.max(doesParentClip ? parent.clientTop : -INF, parent.clipTop) - scrolledTop;
        clipRight = Math.min(doesParentClip ? parent.clientLeft + parent.clientWidth : INF, parent.clipRight) - scrolledLeft;
        clipBottom = Math.min(doesParentClip ? parent.clientTop + parent.clientHeight : INF, parent.clipBottom) - scrolledTop;
      } else {
        clipLeft = clipTop = -INF;
        clipRight = clipBottom = INF;
      }

      this.clipLeft = clipLeft;
      this.clipTop = clipTop;
      this.clipRight = clipRight;
      this.clipBottom = clipBottom;
      this.isFullyClipped = clipLeft >= offsetWidth || clipTop >= offsetHeight ||
        clipRight <= 0 || clipBottom <= 0 ||
        clipLeft === clipRight || clipTop === clipBottom;
    }
  }

  // Define computed layout properties. Those that depend on a layout computation will be null
  // initially, and set to numbers after layout calculation is completed. Derived facades should
  // use these to update their rendering.
  assign(FlexNode.prototype, {
    offsetLeft: null,
    offsetTop: null,
    offsetWidth: null,
    offsetHeight: null,
    clientLeft: null,
    clientTop: null,
    clientWidth: null,
    clientHeight: null,
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: null,
    scrollHeight: null,
    clipLeft: null,
    clipTop: null,
    clipRight: null,
    clipBottom: null,
    isFullyClipped: false,
    overflow: 'visible'
  })

  // Setters for simple flex layout properties that can be copied directly into the
  // flex node's style input object
  ;[
    'width',
    'height',
    'minWidth',
    'minHeight',
    'maxWidth',
    'maxHeight',
    'aspectRatio',
    'flexDirection',
    'flex',
    'flexWrap',
    'flexBasis',
    'flexGrow',
    'flexShrink',
    'alignContent',
    'alignItems',
    'alignSelf',
    'justifyContent',
    'position',
    'left',
    'right',
    'top',
    'bottom'
  ].forEach(prop => {
    Object.defineProperty(FlexNode.prototype, prop, {
      get() {
        return this._flexStyles[prop]
      },
      set(value) {
        if (value !== this._flexStyles[prop]) {
          this._flexStyles[prop] = value;
          this.needsFlexLayout = true;
        }
      },
      configurable: true
    });
  })

  // Add setters to normalize top/right/bottom/left properties which can be a single
  // number or an array of up to 4 numbers, like their corresponding CSS shorthands
  ;[
    'margin',
    'padding',
    'borderWidth'
  ].forEach(prop => {
    const privateProp = `_priv_${prop}`;
    const styleBase = prop === 'borderWidth' ? 'border' : prop;
    const topStyle = styleBase + 'Top';
    const rightStyle = styleBase + 'Right';
    const bottomStyle = styleBase + 'Bottom';
    const leftStyle = styleBase + 'Left';
    Object.defineProperty(FlexNode.prototype, prop, {
      get() {
        return this[privateProp] || (this[privateProp] = Object.freeze([0, 0, 0, 0]))
      },
      set(value) {
        let t, r, b, l;
        if (Array.isArray(value)) {
          const len = value.length;
          t = value[0] || 0;
          r = (len > 1 ? value[1] : value[0]) || 0;
          b = (len > 2 ? value[2] : value[0]) || 0;
          l = (len > 3 ? value[3] : len > 1 ? value[1] : value[0]) || 0;
        } else {
          t = r = b = l = value;
        }
        const arr = this[prop];
        if (t !== arr[0] || r !== arr[1] || b !== arr[2] || l !== arr[3]) {
          this[privateProp] = Object.freeze([t, r, b, l]);
          const styles = this._flexStyles;
          styles[topStyle] = t;
          styles[rightStyle] = r;
          styles[bottomStyle] = b;
          styles[leftStyle] = l;
          this.needsFlexLayout = true;
        }
      }
    });
  });

  return FlexNode
});

const UNDEF = undefined;

// List of UI flex node properties that should be inherited by default:
const INHERITABLES = [
  'font',
  'fontSize',
  'textAlign',
  'textIndent',
  'lineHeight',
  'letterSpacing',
  'whiteSpace',
  'overflowWrap',
  'color'
];

function getInheritable(owner, prop, defaultValue) {
  let val;
  while (owner && (val = owner[prop]) === 'inherit') {
    owner = owner.parentFlexNode;
    val = UNDEF;
  }
  if (val === UNDEF) {
    val = defaultValue;
  }
  return val
}

function getComputedFontSize(owner, defaultFontSize) {
  let val;
  while (owner && typeof (val = owner.fontSize) === 'string') {
    if (val === 'inherit') {
      owner = owner.parentFlexNode;
      val = UNDEF;
    } else if (/%$/.test(val)) {
      const multiplier = parseFloat(val) / 100;
      val = getComputedFontSize(owner.parentFlexNode, defaultFontSize);
      if (val !== UNDEF) {
        val *= multiplier;
      }
      break
    } else {
      val = UNDEF;
      break
    }
  }
  if (val === UNDEF) {
    val = defaultFontSize;
  }
  return val
}

const flexLayoutTextProps = ['text', 'textIndent', 'font', 'fontSize', 'lineHeight', 'letterSpacing', 'whiteSpace', 'overflowWrap'];
const noop = () => {};

/**
 * Wrapper for Text3DFacade that lets it act as a flex layout node. This shouldn't be used
 * directly, but will be created as an implicit child by {@link UIBlock3DFacade} when
 * configured with a `text` property.
 */
class UITextNode3DFacadeBase extends Text3DFacade {
  constructor (props) {
    super(props);

    // Override the sync method so we can have control over when it's called
    let mesh = this.threeObject;
    mesh._actuallySync = mesh.sync;
    mesh.sync = noop;
  }

  afterUpdate() {
    // Read computed layout
    const {
      offsetLeft,
      offsetTop,
      offsetWidth
    } = this;

    // Update position and size if flex layout has been completed
    const hasLayout = offsetWidth !== null;
    if (hasLayout) {
      let parent = this.parentFlexNode;
      this.x = offsetLeft - parent.scrollLeft;
      this.y = -(offsetTop - parent.scrollTop);

      // Update clip rect based on parent
      const clipRect = this.clipRect || (this.clipRect = [0, 0, 0, 0]);
      clipRect[0] = this.clipLeft;
      clipRect[1] = -this.clipBottom;
      clipRect[2] = this.clipRight;
      clipRect[3] = -this.clipTop;

      // If fully hidden by parent clipping rect, cull this object out of the scene
      this.threeObject.visible = !this.isFullyClipped;
    }

    // Check text props that could affect flex layout
    // TODO seems odd that this happens here rather than FlexLayoutNode
    const flexStyles = this._flexStyles;
    for (let i = 0, len = flexLayoutTextProps.length; i < len; i++) {
      const prop = flexLayoutTextProps[i];
      const val = prop === 'text' ? this.text : getInheritable(this, prop);
      if (val !== flexStyles[prop]) {
        flexStyles[prop] = this[prop];
        this.needsFlexLayout = true;
      }
    }

    super.afterUpdate();
  }

  onAfterFlexLayoutApplied() {
    this.threeObject.maxWidth = this.offsetWidth;
    this.threeObject._actuallySync(this._afterSync);
  }

  getBoundingSphere() {
    return null //parent UIBlock3DFacade will handle bounding sphere and raycasting
  }
}

// Extend as FlexNode
const UITextNode3DFacade = extendAsFlexNode(UITextNode3DFacadeBase);

INHERITABLES.forEach(prop => {
  UITextNode3DFacade.prototype[prop] = 'inherit';
});

// Redefine the maxWidth property so it's not treated as a setter that affects flexbox layout
Object.defineProperty(UITextNode3DFacade.prototype, 'maxWidth', {
  value: Infinity,
  enumerable: true,
  writable: true
});

// language=GLSL
const VERTEX_DEFS = `
uniform vec2 uTroikaBlockSize;
uniform vec4 uTroikaClipRect;
varying vec2 vTroikaPosInBlock;
`;

// language=GLSL prefix="void main() {" suffix="}"
const VERTEX_TRANSFORM = `
vec2 xy = position.xy * uTroikaBlockSize;
xy.y *= -1.0;
xy = clamp(xy, uTroikaClipRect.xy, uTroikaClipRect.zw);
vTroikaPosInBlock = xy;
xy.y *= -1.0;
position.xy = xy;
`;

// language=GLSL
const FRAGMENT_DEFS = `
uniform vec2 uTroikaBlockSize;
uniform vec4 uTroikaCornerRadii;
uniform vec4 uTroikaBorderWidth;
varying vec2 vTroikaPosInBlock;
const vec4 NO_BORDER = vec4(0.,0.,0.,0.);

float troikaEllipseRadiusAtAngle(in float angle, in float rx, in float ry) {
  if (rx == ry) {return rx;}
  float _cos = cos(angle);
  float _sin = sin(angle);
  return 1.0 / sqrt((_cos*_cos)/(rx*rx) + (_sin*_sin)/(ry*ry));
}

void troikaGetCurveDists(
  in vec2 pos, in vec2 radCenter, in float outerR, in float xBorder, in float yBorder, 
  out float dOuter, out float dInner
) {
  vec2 adjPos = pos - radCenter;
  float angle = atan(adjPos.y, adjPos.x);
  dOuter = troikaEllipseRadiusAtAngle(angle, outerR, outerR) - length(adjPos);
  dInner = uTroikaBorderWidth == NO_BORDER ? dInner : 
    troikaEllipseRadiusAtAngle(angle, max(0.0, outerR - xBorder), max(0.0, outerR - yBorder)) - length(adjPos);
}

float troikaGetAlphaMultiplier() {
  // Short aliases
  vec2 dim = uTroikaBlockSize;
  vec4 rad = uTroikaCornerRadii;
  vec4 bdr = uTroikaBorderWidth;
  vec2 pos = vTroikaPosInBlock;

  float dOuter;
  float dInner;
  bool isOnCurve = true;
  bool isBorder = uTroikaBorderWidth != NO_BORDER;

  // Top left
  if (pos.x < rad[0] && pos.y < rad[0]) {
    troikaGetCurveDists(pos, vec2(rad[0], rad[0]), rad[0], bdr[3], bdr[0], dOuter, dInner);
  }
  // Top Right
  else if (pos.x > dim.x - rad[1] && pos.y < rad[1]) {
    troikaGetCurveDists(pos, vec2(dim.x - rad[1], rad[1]), rad[1], bdr[1], bdr[0], dOuter, dInner);
  }
  // Bottom Right
  else if (pos.x > dim.x - rad[2] && pos.y > dim.y - rad[2]) {
    troikaGetCurveDists(pos, vec2(dim.x - rad[2], dim.y - rad[2]), rad[2], bdr[1], bdr[2], dOuter, dInner);
  }
  // Bottom Left
  else if (pos.x < rad[3] && pos.y > dim.y - rad[3]) {
    troikaGetCurveDists(pos, vec2(rad[3], dim.y - rad[3]), rad[3], bdr[3], bdr[2], dOuter, dInner);
  }
  // Not on a curve, use closest side
  else {
    isOnCurve = false;
    dOuter = min(min(pos.x, pos.y), min(dim.x - pos.x, dim.y - pos.y));
    dInner = isBorder ? min(min(pos.x - bdr[3], pos.y - bdr[0]), min(dim.x - pos.x - bdr[1], dim.y - pos.y - bdr[2])) : dInner;
  }

  float alpha;
  #if defined(GL_OES_standard_derivatives) || __VERSION__ >= 300
    float aa = length(fwidth(pos)) * 0.5;
    alpha = isOnCurve ? smoothstep(-aa, aa, dOuter) : 1.0;
    alpha = isBorder ? min(alpha, (dOuter == dInner) ? 0.0 : smoothstep(aa, -aa, dInner)) : alpha;
    return alpha;
  #else
    alpha = step(0.0, dOuter);
    alpha = isBorder ? min(alpha, step(0.0, -dInner)) : alpha;
  #endif
  return alpha;
}
`;

// language=GLSL prefix="void main() {" suffix="}"
const FRAGMENT_COLOR_TRANSFORM = `
float troikaAlphaMult = troikaGetAlphaMultiplier();
if (troikaAlphaMult == 0.0) {
  discard;
} else {
  gl_FragColor.a *= troikaAlphaMult;
}
`;


function createUIBlockLayerDerivedMaterial(baseMaterial) {
  const material = createDerivedMaterial(baseMaterial, {
    defines: {
      TROIKA_UI_BLOCK: ''
    },
    extensions: {
      derivatives: true
    },
    uniforms: {
      uTroikaBlockSize: {value: new Vector2()},
      uTroikaClipRect: {value: new Vector4(0,0,0,0)},
      uTroikaCornerRadii: {value: new Vector4(0,0,0,0)},
      uTroikaBorderWidth: {value: new Vector4(0,0,0,0)}
    },
    vertexDefs: VERTEX_DEFS,
    vertexTransform: VERTEX_TRANSFORM,
    fragmentDefs: FRAGMENT_DEFS,
    fragmentColorTransform: FRAGMENT_COLOR_TRANSFORM
  });

  // WebGLShadowMap reverses the side of the shadow material by default, which fails
  // for planes, so here we force the `shadowSide` to always match the main side.
  Object.defineProperty(material, 'shadowSide', {
    get() {
      return this.side
    },
    set() {
      //no-op
    }
  });

  //force transparency - TODO is this reasonable?
  material.transparent = true;

  return material
}

const geometry$1 = new PlaneGeometry(1, 1).translate(0.5, -0.5, 0);
const defaultMaterial$1 = new MeshBasicMaterial({color: 0});
const emptyVec2 = Object.freeze(new Vector2());
const emptyVec4$1 = Object.freeze(new Vector4(0,0,0,0));

const shadowMaterialPropDefs = {
  // Create and update materials for shadows upon request:
  customDepthMaterial: {
    get() {
      return this.material.getDepthMaterial()
    }
  },
  customDistanceMaterial: {
    get() {
      return this.material.getDistanceMaterial()
    }
  }
};

const instanceMeshesByKey = new Map();

/**
 * A single layer in a UI Block's rendering, e.g. background or border. All layers honor
 * border radius, which is calculated shader-side for perfectly smooth curves at any scale,
 * with antialiasing.
 *
 * Layer meshes are rendered via GPU instancing when possible -- specifically when they share
 * the same Material instance, layering depth, and shadow behavior.
 *
 * You shouldn't have to use this directly; UIBlock3DFacade will create these as needed
 * based on background/border styles.
 */
class UIBlockLayer3DFacade extends Instanceable3DFacade {
  constructor(parent) {
    super(parent);

    this._colorObj = new Color();

    // Properties
    this.size = emptyVec2;
    this.borderRadius = emptyVec4$1;
    this.borderWidth = emptyVec4$1;
    this.color = 0;
    this.isBorder = false;
    this.material = defaultMaterial$1;
  }

  afterUpdate() {
    let {material, depthOffset, castShadow, receiveShadow, color, renderOrder} = this;
    if (!material) { material = defaultMaterial$1; }

    // Find or create the instanced mesh
    let meshKey = `${material.id}|${renderOrder}|${depthOffset}|${castShadow}|${receiveShadow}`;
    if (meshKey !== this._prevMeshKey) {
      let mesh = instanceMeshesByKey.get(meshKey);
      if (!mesh) {
        let derivedMaterial = createUIBlockLayerDerivedMaterial(material);
        derivedMaterial.polygonOffset = !!this.depthOffset;
        derivedMaterial.polygonOffsetFactor = derivedMaterial.polygonOffsetUnits = this.depthOffset || 0;
        // dispose the derived material when its base material is disposed:
        material.addEventListener('dispose', function onDispose() {
          material.removeEventListener('dispose', onDispose);
          derivedMaterial.dispose();
        });

        mesh = new Mesh(geometry$1, derivedMaterial);
        mesh._instanceKey = meshKey;
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
        mesh.renderOrder = renderOrder;
        Object.defineProperties(mesh, shadowMaterialPropDefs);
        instanceMeshesByKey.set(meshKey, mesh);
      }
      this.instancedThreeObject = mesh;
      this._prevMeshKey = meshKey;
    }

    // Set material uniform values
    this.setInstanceUniform('uTroikaBlockSize', this.size);
    this.setInstanceUniform('uTroikaCornerRadii', this.borderRadius);
    this.setInstanceUniform('uTroikaClipRect', this.clipRect);
    this.setInstanceUniform('uTroikaBorderWidth', this.isBorder ? this.borderWidth : emptyVec4$1);
    if (color !== this._lastColor) {
      this._lastColor = color;
      this.setInstanceUniform('diffuse', new Color(color));
    }

    super.afterUpdate();
  }

  getBoundingSphere() {
    return null //parent will handle bounding sphere and raycasting
  }
}

let barGeometry;


class ScrollbarBarFacade extends Object3DFacade {
  constructor(parent) {
    const mesh = new Mesh(
      barGeometry || (barGeometry =
        new CylinderGeometry(0.5, 0.5, 1, 8).translate(0, -0.5, 0)
      ),
      // TODO allow overriding material
      new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0
      })
    );
    super(parent, mesh);
    this.girth = 0;
    this.length = 0;
  }

  afterUpdate () {
    this.scaleX = this.scaleZ = this.girth;
    this.scaleY = this.length;
    this.rotateZ = this.horizontal ? Math.PI / 2 : 0;
    this.threeObject.material.opacity = this.opacity;
    super.afterUpdate();
  }
}

const targets = new WeakMap();

const opacityTransition = {
  opacity: {duration: 300}
};

class ScrollbarsFacade extends ParentFacade {
  constructor(parent) {
    super(parent);
    this._onOver = e => {
      this.hovering = true;
      this.afterUpdate();
    };
    this._onOut = e => {
      this.hovering = false;
      this.afterUpdate();
    };
  }

  set target(target) {
    const oldTarget = targets.get(this);
    if (target !== oldTarget) {
      if (oldTarget) {
        oldTarget.removeEventListener('mouseover', this._onOver);
        oldTarget.removeEventListener('mouseout', this._onOut);
      }
      if (target) {
        target.addEventListener('mouseover', this._onOver);
        target.addEventListener('mouseout', this._onOut);
      }
      targets.set(this, target);
    }
  }
  get target() {
    return targets.get(this)
  }

  describeChildren() {
    const {target} = this;
    const children = this._childArr || (this._childArr = []);
    children.length = 0;
    if (target) {
      const {
        offsetWidth,
        offsetHeight,
        scrollHeight,
        scrollWidth,
        clientWidth,
        clientHeight
      } = target;
      const fontSize = target.getComputedFontSize();

      if (scrollWidth > clientWidth) {
        const hScrollbar = this._hDef || (this._hDef = {
          key: 'h',
          facade: ScrollbarBarFacade,
          horizontal: true,
          transition: opacityTransition
        });
        hScrollbar.girth = Math.min( fontSize / 4, offsetHeight / 10);
        hScrollbar.length = Math.max(clientWidth * clientWidth / scrollWidth, fontSize);
        hScrollbar.x = target.clientLeft + (clientWidth - hScrollbar.length) * (target.scrollLeft / (scrollWidth - clientWidth));
        hScrollbar.y = -offsetHeight;
        hScrollbar.opacity = this.hovering ? 0.5 : 0;
        hScrollbar.renderOrder = this.renderOrder;
        children.push(hScrollbar);
      }
      if (scrollHeight > clientHeight) {
        const vScrollbar = this._vDef || (this._vDef = {
          key: 'v',
          facade: ScrollbarBarFacade,
          transition: opacityTransition
        });
        vScrollbar.girth = Math.min( fontSize / 4, offsetWidth / 10);
        vScrollbar.length = Math.max(clientHeight * clientHeight / scrollHeight, fontSize);
        vScrollbar.x = offsetWidth;
        vScrollbar.y = -(target.clientTop + (clientHeight - vScrollbar.length) * (target.scrollTop / (scrollHeight - clientHeight)));
        vScrollbar.opacity = this.hovering ? 0.5 : 0;
        vScrollbar.renderOrder = this.renderOrder;
        children.push(vScrollbar);
      }
    }
    return children
  }

  destructor () {
    this.target = null;
    super.destructor();
  }
}

const raycastMesh = new Mesh(new PlaneGeometry(1, 1).translate(0.5, -0.5, 0));
const tempMat4 = new Matrix4();
const tempVec4 = new Vector4(0,0,0,0);
const emptyVec4 = Object.freeze(new Vector4(0,0,0,0));
const tempPlane = new Plane();
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_LINE_HEIGHT = 'normal';

const groupVisiblePropDef = {
  get() {
    return !this._priv_hidden && !this.$facade.isFullyClipped
  },
  set(value) {
    this._priv_hidden = !value;
  }
};

/**
 * Represents a single block UI element, essentially just a 2D rectangular block that
 * can contain text, be styled with background/border, and participate in flexbox layout.
 * Its behavior and styling is very much like an HTML element using flexbox.
 */
class UIBlock3DFacadeBase extends Group3DFacade {
  constructor(parent) {
    super(parent);

    // If fully hidden by parent clipping rect, cull the whole Group out of the scene
    Object.defineProperty(this.threeObject, 'visible', groupVisiblePropDef);

    // Anonymous container for bg/border/scrollbar child objects; these live separate
    // from the main `children` tree
    this.layers = new Group3DFacade(this);
    this.layers.children = [null, null, null];

    // Shared objects for passing down to layers - treated as immutable
    this._sizeVec2 = Object.freeze(new Vector2());
    this._clipRectVec4 = emptyVec4;
    this._borderWidthVec4 = emptyVec4;
    this._borderRadiiVec4 = emptyVec4

    ;(this._geomBoundingSphere = new Sphere()).version = 0;
    this._wasFullyClipped = true;
  }

  /**
   * @override When fully clipped out of view, skip updating children entirely. We do this by
   * overriding `updateChildren` instead of using the `shouldUpdateChildren` hook, because the
   * latter would still traverse the child tree to sync matrices, which we don't need here.
   * TODO this doesn't work so well when descendants are absolutely positioned or overflow outside our bounds
   */
  updateChildren(children) {
    if (!this.isFullyClipped || !this._wasFullyClipped) {
      super.updateChildren(children);
    }
  }

  updateMatrices() {
    super.updateMatrices();
    this.layers.traverse(updateMatrices);
  }

  afterUpdate() {
    let {
      layers,
      backgroundColor,
      backgroundMaterial,
      borderWidth,
      borderColor,
      borderMaterial,
      text,
      offsetLeft,
      offsetTop,
      offsetWidth,
      offsetHeight,
      parentFlexNode,
      flexNodeDepth,
      isFullyClipped,
      _wasFullyClipped,
      _borderWidthVec4,
      _clipRectVec4,
      _sizeVec2
    } = this;
    const hasLayout = offsetWidth !== null;
    const hasNonZeroSize = !!(offsetWidth && offsetHeight);
    const hasBg = hasNonZeroSize && !isFullyClipped && (backgroundColor != null || backgroundMaterial != null);
    const hasBorder = hasNonZeroSize && !isFullyClipped && (borderColor != null || borderMaterial != null) && Math.max(...borderWidth) > 0;
    const canScroll = hasNonZeroSize && (this.overflow === 'scroll' || this.overflow === 'auto') && (
      this.scrollHeight > this.clientHeight || this.scrollWidth > this.clientWidth
    );

    // Update the block's element and size from flexbox computed values
    if (hasLayout) {
      if (parentFlexNode) {
        const isAbsPos = this.position === 'absolute';
        this.x = offsetLeft - (isAbsPos ? 0 : parentFlexNode.scrollLeft);
        this.y = -(offsetTop - (isAbsPos ? 0 : parentFlexNode.scrollTop));
      }
      if (offsetWidth !== _sizeVec2.x || offsetHeight !== _sizeVec2.y) {
        _sizeVec2 = this._sizeVec2 = Object.freeze(new Vector2(offsetWidth, offsetHeight));

        // Update pre-worldmatrix bounding sphere
        const sphere = this._geomBoundingSphere;
        sphere.radius = Math.sqrt(offsetWidth * offsetWidth / 4 + offsetHeight * offsetHeight / 4);
        sphere.center.set(offsetWidth / 2, -offsetHeight / 2, 0);
        sphere.version++;
      }
    }

    if (!isFullyClipped || !_wasFullyClipped) {
      // Update shared vector objects for the sublayers
      const radii = (hasBg || hasBorder) ? this._normalizeBorderRadius() : null;

      tempVec4.fromArray(borderWidth);
      if (!tempVec4.equals(_borderWidthVec4)) {
        _borderWidthVec4 = this._borderWidthVec4 = Object.freeze(tempVec4.clone());
      }
      tempVec4.set(
        Math.max(this.clipLeft, 0),
        Math.max(this.clipTop, 0),
        Math.min(this.clipRight, offsetWidth),
        Math.min(this.clipBottom, offsetHeight)
      );
      if (!tempVec4.equals(_clipRectVec4)) {
        _clipRectVec4 = this._clipRectVec4 = Object.freeze(tempVec4.clone());
      }

      // Update rendering layers...
      let bgLayer = null;
      if (hasBg) {
        bgLayer = this._bgLayerDef || (this._bgLayerDef = {
          key: 'bg',
          facade: UIBlockLayer3DFacade
        });
        bgLayer.size = _sizeVec2;
        bgLayer.color = backgroundColor;
        bgLayer.borderRadius = radii;
        bgLayer.material = backgroundMaterial;
        bgLayer.clipRect = _clipRectVec4;
        bgLayer.depthOffset = -flexNodeDepth;
        bgLayer.renderOrder = flexNodeDepth; //TODO how can we make this play with the rest of the scene?
        bgLayer.castShadow = this.castShadow;
        bgLayer.receiveShadow = this.receiveShadow;
      }
      layers.children[0] = bgLayer;

      let borderLayer = null;
      if (hasBorder) {
        borderLayer = this._borderLayerDef || (this._borderLayerDef = {
          key: 'border',
          facade: UIBlockLayer3DFacade,
          isBorder: true
        });
        borderLayer.size = _sizeVec2;
        borderLayer.color = borderColor;
        borderLayer.borderWidth = _borderWidthVec4;
        borderLayer.borderRadius = radii;
        borderLayer.material = borderMaterial;
        borderLayer.clipRect = _clipRectVec4;
        borderLayer.depthOffset = -flexNodeDepth - 1;
        borderLayer.renderOrder = flexNodeDepth + 1; //TODO how can we make this play with the rest of the scene?
        borderLayer.castShadow = this.castShadow;
        borderLayer.receiveShadow = this.receiveShadow;
      }
      layers.children[1] = borderLayer;

      // Scrollbars if scrollable:
      let scrollbarsLayer = null;
      if (canScroll) {
        scrollbarsLayer = this._scrollbarsDef || (this._scrollbarsDef = {
          key: 'sb',
          facade: ScrollbarsFacade,
          target: this
        });
        scrollbarsLayer.renderOrder = flexNodeDepth + 2; //TODO how can we make this play with the rest of the scene?
      }
      layers.children[2] = scrollbarsLayer;

      // Allow text to be specified as a single string child
      if (!text && isTextNodeChild(this.children)) {
        text = '' + this.children;
      }
      // Update text child...
      if (text) {
        const textChild = this._textChildDef || (this._textChildDef = {
          key: 'text',
          facade: UITextNode3DFacade
        });
        textChild.text = text;
        textChild.font = getInheritable(this, 'font');
        textChild.fontSize = this.getComputedFontSize();
        textChild.textAlign = getInheritable(this, 'textAlign');
        textChild.textIndent = getInheritable(this, 'textIndent');
        textChild.lineHeight = getInheritable(this, 'lineHeight', DEFAULT_LINE_HEIGHT);
        textChild.letterSpacing = getInheritable(this, 'letterSpacing', 0);
        textChild.whiteSpace = getInheritable(this, 'whiteSpace');
        textChild.overflowWrap = getInheritable(this, 'overflowWrap');
        textChild.color = getInheritable(this, 'color');
        textChild.colorRanges = this.colorRanges;
        textChild.outlineWidth = this.textOutlineWidth || 0;
        textChild.outlineColor = this.textOutlineColor;
        textChild.outlineOpacity = this.textOutlineOpacity;
        textChild.outlineBlur = this.textOutlineBlur || 0;
        textChild.outlineOffsetX = this.textOutlineOffsetX || 0;
        textChild.outlineOffsetY = this.textOutlineOffsetY || 0;
        textChild.strokeWidth = this.textStrokeWidth || 0;
        textChild.strokeColor = this.textStrokeColor;
        textChild.strokeOpacity = this.textStrokeOpacity;
        textChild.fillOpacity = this.textFillOpacity;
        textChild.material = this.textMaterial;
        textChild.depthOffset = -flexNodeDepth - 1;
        textChild.renderOrder = flexNodeDepth + 1;
        textChild.castShadow = this.castShadow;
        textChild.receiveShadow = this.receiveShadow;
        this._actualChildren = textChild; //NOTE: text content will clobber any other defined children
      } else {
        // Convert any children specified as plain strings to nested text blocks; handy for JSX style
        let children = this.children;
        if (Array.isArray(children)) {
          for (let i = 0, len = children.length; i < len; i++) {
            if (isTextNodeChild(children[i])) {
              children = children.slice();
              for (; i < len; i++) { //continue from here
                if (isTextNodeChild(children[i])) {
                  children[i] = {
                    facade: UIBlock3DFacade,
                    text: '' + children[i],
                    textMaterial: this.textMaterial
                  };
                }
              }
              break
            }
          }
        }
        this._actualChildren = children;
      }
    }

    // Add mousewheel and drag listeners if scrollable
    if (canScroll !== this._couldScroll) {
      this._couldScroll = canScroll;
      this[`${canScroll ? 'add' : 'remove'}EventListener`]('wheel', wheelHandler);
      this[`${canScroll ? 'add' : 'remove'}EventListener`]('dragstart', dragHandler);
      this[`${canScroll ? 'add' : 'remove'}EventListener`]('drag', dragHandler);
    }

    super.afterUpdate();
    if (!isFullyClipped || !_wasFullyClipped) {
      layers.afterUpdate();
    }
    this._wasFullyClipped = isFullyClipped;
  }

  describeChildren () {
    return this._actualChildren
  }

  getComputedFontSize() {
    return getComputedFontSize(this, DEFAULT_FONT_SIZE)
  }

  _normalizeBorderRadius() {
    let {
      borderRadius:input,
      offsetWidth=0,
      offsetHeight=0,
      _borderRadiiVec4:prevVec4
    } = this;

    // Normalize to four corner values
    let tl, tr, br, bl;
    if (Array.isArray(input)) {
      const len = input.length;
      tl = input[0] || 0;
      tr = (len > 1 ? input[1] : input[0]) || 0;
      br = (len > 2 ? input[2] : input[0]) || 0;
      bl = (len > 3 ? input[3] : len > 1 ? input[1] : input[0]) || 0;
    } else {
      tl = tr = br = bl = input || 0;
    }

    if (tl !== 0 || tr !== 0 || br !== 0 || bl !== 0) { //avoid work for common no-radius case
      // Resolve percentages
      const minDimension = Math.min(offsetWidth, offsetHeight);
      if (typeof tl === 'string' && /%$/.test(tl)) {
        tl = parseInt(tl, 10) / 100 * minDimension;
      }
      if (typeof tr === 'string' && /%$/.test(tr)) {
        tr = parseInt(tr, 10) / 100 * minDimension;
      }
      if (typeof bl === 'string' && /%$/.test(bl)) {
        bl = parseInt(bl, 10) / 100 * minDimension;
      }
      if (typeof br === 'string' && /%$/.test(br)) {
        br = parseInt(br, 10) / 100 * minDimension;
      }

      // If any radii overlap based on the block's current size, reduce them all by the same ratio, ala CSS3.
      let radiiAdjRatio = Math.min(
        offsetWidth / (tl + tr),
        offsetHeight / (tr + br),
        offsetWidth / (br + bl),
        offsetHeight / (bl + tl)
      );
      if (radiiAdjRatio < 1) {
        tl *= radiiAdjRatio;
        tr *= radiiAdjRatio;
        bl *= radiiAdjRatio;
        br *= radiiAdjRatio;
      }
    }

    // Update the Vector4 if anything changed
    tempVec4.set(tl, tr, br, bl);
    if (!tempVec4.equals(prevVec4)) {
      prevVec4 = this._borderRadiiVec4 = Object.freeze(tempVec4.clone());
    }
    return prevVec4
  }

  /**
   * @override Use our private boundingSphere which we keep updated as we get new
   * layout metrics.
   */
  _getGeometryBoundingSphere() {
    return this._geomBoundingSphere.radius && !this.isFullyClipped ? this._geomBoundingSphere : null
  }

  /**
   * @override Custom raycaster to test against the layout block
   */
  raycast(raycaster) {
    const {offsetWidth, offsetHeight, clipTop, clipRight, clipBottom, clipLeft} = this;
    let hits = null;
    if (offsetWidth && offsetHeight) {
      raycastMesh.matrixWorld.multiplyMatrices(
        this.threeObject.matrixWorld,
        tempMat4.makeScale(offsetWidth, offsetHeight, 1)
      );
      hits = this._raycastObject(raycastMesh, raycaster);
      if (hits) {
        // Filter out hits that occurred on clipped areas
        hits = hits.filter(hit => {
          const x = hit.uv.x * offsetWidth;
          const y = (1 - hit.uv.y) * offsetHeight;
          return x > clipLeft && x < clipRight && y > clipTop && y < clipBottom
        });

        // Add a distance bias (used as secondary sort for equidistant intersections) to prevent
        // container blocks from intercepting pointer events for their children. Also apply a
        // slight rounding prevent floating point precision irregularities from reporting different
        // distances for coplanar blocks.
        hits.forEach(hit => {
          hit.distance = parseFloat(hit.distance.toFixed(12));
          hit.distanceBias = -this.flexNodeDepth;
        });
      }
    }
    return hits && hits.length ? hits : null
  }


  destructor() {
    this.layers.destructor();
    super.destructor();
  }
}

// Extend as FlexNode
const UIBlock3DFacade = extendAsFlexNode(UIBlock3DFacadeBase);

INHERITABLES.forEach(prop => {
  UIBlock3DFacade.prototype[prop] = 'inherit';
});



function wheelHandler(e) {
  if (!e._didScroll) {
    const facade = e.currentTarget;
    let {deltaX, deltaY, deltaMode} = e.nativeEvent;
    let deltaMultiplier;
    if (deltaMode === 0x01) { //line mode
      deltaMultiplier = getComputedFontSize(facade, DEFAULT_FONT_SIZE) *
        getInheritable(facade, 'lineHeight', 1.2); //Note: fixed default since we can't resolve 'normal' here
    } else { //pixel mode
      //TODO can we more accurately scale to visual expectation?
      deltaMultiplier = getComputedFontSize(facade, DEFAULT_FONT_SIZE) / 12;
    }
    deltaX *= deltaMultiplier;
    deltaY *= deltaMultiplier;

    const scrollLeft = Math.max(0, Math.min(
      facade.scrollWidth - facade.clientWidth,
      facade.scrollLeft + deltaX
    ));
    const scrollTop = Math.max(0, Math.min(
      facade.scrollHeight - facade.clientHeight,
      facade.scrollTop + deltaY
    ));

    // Only scroll if the major scroll direction would actually result in a scroll change
    const abs = Math.abs;
    if (
      (scrollLeft !== facade.scrollLeft && abs(deltaX) > abs(deltaY)) ||
      (scrollTop !== facade.scrollTop && abs(deltaY) > abs(deltaX))
    ) {
      facade.scrollLeft = scrollLeft;
      facade.scrollTop = scrollTop;
      facade.afterUpdate();
      facade.requestRender();
      e._didScroll = true;
    }
    e.preventDefault();
  }
}

function dragHandler(e) {
  if (!e._didScroll && !e.defaultPrevented) {
    const facade = e.currentTarget;
    const ray = e.ray.clone().applyMatrix4(invertMatrix4(facade.threeObject.matrixWorld, tempMat4));
    const localPos = ray.intersectPlane(tempPlane.setComponents(0, 0, 1, 0), new Vector3());
    const prevPos = facade._prevDragPos;
    if (localPos && prevPos && e.type === 'drag') {
      const deltaX = localPos.x - prevPos.x;
      const deltaY = localPos.y - prevPos.y;
      if (deltaX || deltaY) {
        const scrollLeft = Math.max(0, Math.min(
          facade.scrollWidth - facade.clientWidth,
          facade.scrollLeft + deltaX
        ));
        const scrollTop = Math.max(0, Math.min(
          facade.scrollHeight - facade.clientHeight,
          facade.scrollTop + deltaY
        ));
        if (scrollLeft !== facade.scrollLeft || scrollTop !== facade.scrollTop) {
          facade.scrollLeft = scrollLeft;
          facade.scrollTop = scrollTop;
          facade.afterUpdate();
          facade.requestRender();
          e._didScroll = true;
        }
      }
    }
    facade._prevDragPos = localPos;
  }
}


function isTextNodeChild(child) {
  return typeof child === 'string' || typeof child === 'number'
}

function updateMatrices(obj) {
  if (obj.updateMatrices) {
    obj.updateMatrices();
  }
}

const geometry = new PlaneGeometry(1, 1).translate(0.5, -0.5, 0);
const defaultMaterial = new MeshBasicMaterial();
const loader = new TextureLoader();

class UIImage3DFacade extends Object3DFacade {
  constructor(parent, texture) {
    const mesh = new Mesh(geometry, defaultMaterial.clone());
    mesh.visible = false; //hidden until image is ready
    super(parent, mesh);
  }

  afterUpdate() {
    const {offsetLeft, offsetTop, offsetWidth, offsetHeight, src, threeObject:mesh, transparent} = this;
    const material = mesh.material;
    const hasLayout = !!(offsetWidth && offsetHeight);
    if (hasLayout) {
      this.x = offsetLeft;
      this.y = -offsetTop;
      this.scaleX = offsetWidth;
      this.scaleY = offsetHeight;

      const depth = this.flexNodeDepth;
      material.polygonOffset = !!depth;
      material.polygonOffsetFactor = material.polygonOffsetUnits = -depth || 0;
      mesh.renderOrder = depth;
    }

    if (src !== this._lastSrc) {
      loader.load(src, texture => {
        if (material.map) {
          material.map.dispose();
        }
        material.map = texture;
        if (transparent) material.transparent = true;
        this.aspectRatio = texture.image.width / texture.image.height;
        this.afterUpdate();
        this.requestRender();
      });
      this._lastSrc = src;
    }

    mesh.visible = !!(hasLayout && material.map && material.map.image.complete);

    super.afterUpdate();
  }

  destructor() {
    const texture = this.threeObject.material.map;
    if (texture) {
      texture.dispose();
    }
    super.destructor();
  }
}

var UIImage3DFacade$1 = extendAsFlexNode(UIImage3DFacade);

export { INHERITABLES, ScrollbarsFacade, UIBlock3DFacade, UIBlockLayer3DFacade, UIImage3DFacade$1 as UIImage3DFacade, extendAsFlexNode, getComputedFontSize, getInheritable };
