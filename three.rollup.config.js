import { terser } from 'rollup-plugin-terser';

import resolve from '@rollup/plugin-node-resolve';
import MagicString from 'magic-string';
import strip from '@rollup/plugin-strip';

import includePaths from 'rollup-plugin-includepaths';


function addons() {

	return {

		transform( code, id ) {

			if ( /\/examples\/jsm\//.test( id ) === false ) return;

			code = code.replace( 'build/three/three.module.js', 'src/Three.js' );

			return {
				code: code,
				map: null
			};

		}

	};

}


export function glsl() {

	return {

		transform( code, id ) {

			if ( /\.glsl.js$/.test( id ) === false ) return;

			code = new MagicString( code );

			code.replace( /\/\* glsl \*\/\`(.*?)\`/sg, function ( match, p1 ) {

				return JSON.stringify(
					p1
						.trim()
						.replace( /\r/g, '' )
						.replace( /[ \t]*\/\/.*\n/g, '' ) // remove //
						.replace( /[ \t]*\/\*[\s\S]*?\*\//g, '' ) // remove /* */
						.replace( /\n{2,}/g, '\n' ) // # \n+ to \n
				);

			} );

			return {
				code: code.toString(),
				map: code.generateMap().toString()
			};

		}

	};

}

function header() {

	return {

		renderChunk( code ) {

			return `/**
 * @license
 * Copyright 2010-2021 Three.js Authors
 * SPDX-License-Identifier: MIT
 */
${ code }`;

		}

	};

}

export default [
	{
		input: './threelib.js',
		plugins: [
			addons(),
			glsl(),
			resolve(),
			includePaths({
            	paths: ["./three.js/src"]
            }),
			strip(),
			header()
		],
		output: [
			{
				format: 'esm',
				file: 'build/three/three-base.module.js'
			}
		]
	},
	{
		input: './three-gpu-renderer.js',
		plugins: [
			addons(),
			glsl(),
			includePaths({
				include: {
				  'three': './build/three/three-base.module.js',
				  'linearsrgb-material': './node_modules/three-webgpu-renderer/build/linearsrgb-material.module.js'
				}
		  	}),
			resolve(),
			strip(),
			header()
		],
		output: [
			{
				format: 'esm',
				file: 'build/three/three.module.js'
			}
		]
	},
	{
		input: './three-gpu-renderer.js',
		plugins: [
			addons(),
			glsl(),
			resolve(),
			strip(),
			includePaths({
				include: {
				  'three': './build/three/three-base.module.js',
				  'linearsrgb-material': './node_modules/three-webgpu-renderer/build/linearsrgb-material.module.js'
				}
		  	}),
			header()
		],
		output: [
			{
				format: 'iife',
				name: 'THREE',
				file: 'build/three/three.js',
				indent: '\t'
			}
		]
	},
	{
		input: './three-gpu-renderer.js',
		plugins: [
			addons(),
			glsl(),
			resolve(),
			strip(),
			includePaths({
				include: {
				  'three': './build/three/three-base.module.js',
				  'linearsrgb-material': './node_modules/three-webgpu-renderer/build/linearsrgb-material.module.js'
				}
		  	}),
			terser(),
			header()
		],
		output: [
			{
				format: 'iife',
				name: 'THREE',
				file: 'build/three/three.min.js'
			}
		]
	},
];
