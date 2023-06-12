import { terser } from 'rollup-plugin-terser';

import { nodeResolve } from '@rollup/plugin-node-resolve';

//import includePaths from 'rollup-plugin-includepaths';
import replace from '@rollup/plugin-replace';
import strip from '@rollup/plugin-strip';

import includePaths from 'rollup-plugin-includepaths';



export default [
    {
        input: 'troika-core.js',
        plugins: [
            /*replace({
                "process.env.NODE_ENV": JSON.stringify("production")
            }),*/
            replace({
                'process.env.NODE_ENV': '"production"'
            }),
            includePaths({
				paths: ["troika/packages/troika-core/src"],
                include: {
                    'three': './build/three/three.module.js'
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
                //"THREE",
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
                file: 'build/troika-core.module.js',
                indent: '\t'
            }
        ]
    },
    {
        input: 'troika-3d.js',
        plugins: [
            /*replace({
                "process.env.NODE_ENV": JSON.stringify("production")
            }),*/
            replace({
                'process.env.NODE_ENV': '"production"'
            }),
            includePaths({
				paths: ["troika/packages/troika-3d/src"],
                include: {
                    'three': './build/three/three.module.js',
                    'troika-core': './build/troika-core.module.js'
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
                //"THREE",
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
                file: 'build/troika-3d.module.js',
                indent: '\t'
            }
        ]
    },
    {
        input: 'troika-3d-ui.js',
        plugins: [
            /*replace({
                "process.env.NODE_ENV": JSON.stringify("production")
            }),*/
            replace({
                'process.env.NODE_ENV': '"production"'
            }),
            includePaths({
				paths: ["troika/packages/troika-3d/src"],
                include: {
                    'three': './build/three/three.module.js',
                    'troika-core': './build/troika-core.module.js',
                    'troika-3d': './build/troika-3d.module.js'
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
                //"THREE",
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
                file: 'build/troika-3d-ui.module.js',
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
                  'troika-3d-ui': './build/troika-3d-ui.module.js'
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
                //"three",
                //"THREE",
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
                  'troika-3d-ui': './build/troika-3d-ui.module.js'
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
                  'troika-3d-ui': './build/troika-3d-ui.module.js'
				}
		  	}),
            nodeResolve({
                // Favor local sources via our custom "module:src" field, and "browser" over "main" in resolution
                mainFields: ['module:src', 'module', 'jsnext:main', 'browser', 'main']
            }),
            strip(),
           // nodeResolve({ browser:true, preferBuiltins: true }),
            terser()
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