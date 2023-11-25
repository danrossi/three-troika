import { terser } from 'rollup-plugin-terser';

import { nodeResolve } from '@rollup/plugin-node-resolve';

//import includePaths from 'rollup-plugin-includepaths';
import replace from '@rollup/plugin-replace';
import strip from '@rollup/plugin-strip';

import includePaths from 'rollup-plugin-includepaths';

import tla from 'rollup-plugin-tla';

export default [
    {
        input: 'troika/packages/troika-animation/src/index.js',
        plugins: [
            strip()
        ],
        output: [
            {
                format: 'esm',
                name: 'troika',
                file: 'build/troika-animation.module.js',
                indent: '\t'
            }
        ]
    },
    {
        input: 'troika/packages/troika-three-utils/src/index.js',
        plugins: [
            includePaths({
                include: {
                    'three': './build/three/three.module.js'
                }
		  	}),
            strip()
        ],
        external: [
                "three",
                "three-webgpu-renderer"
        ],
        output: [
            {
                format: 'esm',
                name: 'troika',
                file: 'build/troika-three-utils.module.js',
                indent: '\t'
            }
        ]
    },
    {
        input: 'troika/packages/troika-worker-utils/src/index.js',
        plugins: [
            replace({
                'process.env.NODE_ENV': '"production"'
            }),
            strip()
           // nodeResolve({ browser:true, preferBuiltins: true })
        ],
        output: [
            {
                format: 'esm',
                name: 'troika',
                file: 'build/troika-worker-utils.module.js',
                indent: '\t'
            }
        ]
    },
    {
        input: 'troika/packages/troika-three-text/src/index.js',
        plugins: [
            includePaths({
                include: {
                    'three': './build/three/three.module.js',
                    'troika-worker-utils': './build/troika-worker-utils.module.js',
                    'troika-three-utils': './build/troika-three-utils.module.js'
                }
		  	}),
            nodeResolve({
                // Favor local sources via our custom "module:src" field, and "browser" over "main" in resolution
                mainFields: ['module:src', 'module', 'jsnext:main', 'browser', 'main']
            }),
            strip()
        ],
        external: [
                "three",
                "troika-worker-utils",
                "troika-three-utils"
        ],
        output: [
            {
                format: 'esm',
                name: 'troika',
                file: 'build/troika-three-text.module.js',
                indent: '\t'
            }
        ]
    },
    {
        input: 'troika/packages/troika-flex-layout/src/index.js',
        plugins: [
            includePaths({
                include: {
                    'three': './build/three/three.module.js',
                    'troika-worker-utils': './build/troika-worker-utils.module.js',
                    'troika-three-text': './build/troika-three-text.module.js',
                }
		  	}),
            nodeResolve({
                // Favor local sources via our custom "module:src" field, and "browser" over "main" in resolution
                mainFields: ['module:src', 'module', 'jsnext:main', 'browser', 'main']
            }),
            strip()
           // nodeResolve({ browser:true, preferBuiltins: true })
        ],
        external: [
                "three",
                'troika-worker-utils',
                'troika-three-text'
        ],
        output: [
            {
                format: 'esm',
                name: 'troika',
                file: 'build/troika-flex-layout.module.js',
                indent: '\t'
            }
        ]
    },
    {
        input: 'troika-core.js',
        plugins: [
            replace({
                'process.env.NODE_ENV': '"production"'
            }),
            includePaths({
				paths: ["troika/packages/troika-core/src"],
                include: {
                    'three': './build/three/three.module.js',
                    'troika-animation': './build/troika-animation.module.js'
                }
		  	}),
            nodeResolve({
                // Favor local sources via our custom "module:src" field, and "browser" over "main" in resolution
                mainFields: ['module:src', 'module', 'jsnext:main', 'browser', 'main']
            }),
            strip()
        ],
        external: [
                "three",
                'troika-animation'
        ],
        output: [
            {
                format: 'esm',
                name: 'troika',
                file: 'build/troika-core.module.js',
                indent: '\t'
            }
        ]
    },
    {
        input: 'troika-3d.js',
        plugins: [
            includePaths({
				paths: ["troika/packages/troika-3d/src"],
                include: {
                    'three': './build/three/three.module.js',
                    'troika-core': './build/troika-core.module.js',
                    'troika-animation': './build/troika-animation.module.js',
                    'troika-three-utils': './build/troika-three-utils.module.js'
                }
		  	}),
            nodeResolve({
                // Favor local sources via our custom "module:src" field, and "browser" over "main" in resolution
                mainFields: ['module:src', 'module', 'jsnext:main', 'browser', 'main']
            }),
            strip()
        ],
        external: [
                "three",
                'troika-three-utils',
                'troika-animation',
                'troika-core'
        ],
        output: [
            {
                format: 'esm',
                name: 'troika',
                file: 'build/troika-3d.module.js',
                indent: '\t'
            }
        ]
    },
    {
        input: 'troika/packages/troika-3d-text/src/index.js',
        plugins: [
            includePaths({
                include: {
                    'three': './build/three/three.module.js',
                    'troika-three-text': './build/troika-three-text.module.js',
                    'troika-3d': './build/troika-3d.module.js',
                    'troika-three-utils': './build/troika-three-utils.module.js'
                }
		  	}),
            nodeResolve({
                // Favor local sources via our custom "module:src" field, and "browser" over "main" in resolution
                mainFields: ['module:src', 'module', 'jsnext:main', 'browser', 'main']
            }),
            strip()
           // nodeResolve({ browser:true, preferBuiltins: true })
        ],
        external: [
                "three",
                'troika-three-text',
                'troika-3d',
                'troika-three-utils'
        ],
        output: [
            {
                format: 'esm',
                name: 'troika',
                file: 'build/troika-3d-text.module.js',
                indent: '\t'
            }
        ]
    },
    {
        input: 'troika-3d-ui.js',
        plugins: [
            includePaths({
				paths: ["troika/packages/troika-3d/src"],
                include: {
                    'three': './build/three/three.module.js',
                    'troika-core': './build/troika-core.module.js',
                    'troika-3d': './build/troika-3d.module.js',
                    'troika-animation': './build/troika-animation.module.js',
                    'troika-three-utils': './build/troika-three-utils.module.js',
                    'troika-flex-layout': './build/troika-flex-layout.module.js',
                    'troika-3d-text': './build/troika-3d-text.module.js'
                }
		  	}),
            nodeResolve({
                // Favor local sources via our custom "module:src" field, and "browser" over "main" in resolution
                mainFields: ['module:src', 'module', 'jsnext:main', 'browser', 'main']
            }),
            strip()
        ],
        external: [
                "three",
                'troika-core',
                'troika-3d',
                'troika-animation',
                'troika-three-utils',
                'troika-flex-layout',
                'troika-3d-text'
        ],
        output: [
            {
                format: 'esm',
                name: 'troika',
                file: 'build/troika-3d-ui.module.js',
                indent: '\t'
            }
        ]
    },
    {
        input: 'troika-lib.js',
        plugins: [
            replace({
                'process.env.NODE_ENV': '"production"'
            }),
            includePaths({
				include: {
				  'three': './build/three/three.module.js',
                  'troika-core': './build/troika-core.module.js',
                  'troika-3d': './build/troika-3d.module.js',
                  'troika-3d-ui': './build/troika-3d-ui.module.js',
                  'troika-animation': './build/troika-animation.module.js',
                  'troika-three-utils': './build/troika-three-utils.module.js',
                  'troika-flex-layout': './build/troika-flex-layout.module.js',
                  'troika-3d-text': './build/troika-3d-text.module.js',
                  'troika-worker-utils': './build/troika-worker-utils.module.js',
                  'troika-three-text': './build/troika-three-text.module.js'
				}
		  	}),
            nodeResolve({
                // Favor local sources via our custom "module:src" field, and "browser" over "main" in resolution
                mainFields: ['module:src', 'module', 'jsnext:main', 'browser', 'main']
            }),
            strip()
        ],
        external: [
                "react",
                "prop-types",
                "object-path"
        ],
        output: [
            {
                 globals: {
                    //"three": "THREE",
                    "react": "react",
                },
                format: 'esm',
                name: 'troika',
                file: 'build/troika-lib.module.js',
                indent: '\t'
            }
        ]
    },
    {
        input: 'troika-lib.js',
        plugins: [
            /*replace({
                "process.env.NODE_ENV": JSON.stringify("production")
            }),*/
            replace({
                'process.env.NODE_ENV': '"production"'
            }),
            includePaths({
				include: {
                    'three': './build/three/three.module.js',
                    'troika-core': './build/troika-core.module.js',
                    'troika-3d': './build/troika-3d.module.js',
                    'troika-3d-ui': './build/troika-3d-ui.module.js',
                    'troika-animation': './build/troika-animation.module.js',
                    'troika-three-utils': './build/troika-three-utils.module.js',
                    'troika-flex-layout': './build/troika-flex-layout.module.js',
                    'troika-3d-text': './build/troika-3d-text.module.js',
                    'troika-worker-utils': './build/troika-worker-utils.module.js',
                    'troika-three-text': './build/troika-three-text.module.js'
                  }
		  	}),
            nodeResolve({
                // Favor local sources via our custom "module:src" field, and "browser" over "main" in resolution
                mainFields: ['module:src', 'module', 'jsnext:main', 'browser', 'main']
            }),
            tla(),
              strip()
        ],
        external: [
                //"three",
                //"THREE",
                "react",
                "prop-types",
                "object-path"
        ],
        output: [
            {
                 globals: {
                   // "three": "THREE",
                    "react": "react",
                },
                format: 'iife',
                name: 'troika',
                file: 'build/troika-lib.js',
                indent: '\t'
            }
        ]
    },
    {
        input: 'troika-lib.js',
        plugins: [
            replace({
                'process.env.NODE_ENV': '"production"'
            }),
            includePaths({
				include: {
                    'three': './build/three/three.module.js',
                    'troika-core': './build/troika-core.module.js',
                    'troika-3d': './build/troika-3d.module.js',
                    'troika-3d-ui': './build/troika-3d-ui.module.js',
                    'troika-animation': './build/troika-animation.module.js',
                    'troika-three-utils': './build/troika-three-utils.module.js',
                    'troika-flex-layout': './build/troika-flex-layout.module.js',
                    'troika-3d-text': './build/troika-3d-text.module.js',
                    'troika-worker-utils': './build/troika-worker-utils.module.js',
                    'troika-three-text': './build/troika-three-text.module.js'
                  }
		  	}),
            nodeResolve({
                // Favor local sources via our custom "module:src" field, and "browser" over "main" in resolution
                mainFields: ['module:src', 'module', 'jsnext:main', 'browser', 'main']
            }),
            strip(),
            tla(),
           // nodeResolve({ browser:true, preferBuiltins: true }),
           terser({
            keep_classnames: /ArrayUniformNode|StorageBufferNode|UserDataNode|IESSpotLight|Material|PointLightHelper|FunctionNode|DirectionalLightHelper|SpotLightHelper|RectAreaLight|LightsNode|ToneMappingNode|HemisphereLightHelper/
            })
        ],
        external: [
           // "three",
           // "THREE",
            "react",
            "prop-types",
            "object-path"
        ],
        output: [
            {
                globals: {
                   // "three": "THREE",
                    "react": "react",
                },
                format: 'iife',
                name: 'troika',
                file: 'build/troika-lib.min.js',
                indent: '\t'
            }
        ]
    }
];