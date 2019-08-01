// this is the rollup plugin that adds babel as a compilation stage.
import babel from 'rollup-plugin-babel';

// Locate modules using the Node resolution algorithm,
// for using third party modules in node_modules
import nodeResolve from 'rollup-plugin-node-resolve'

// Rollup plugin to minify generated bundle.
import uglify from 'rollup-plugin-uglify'

// Replace strings in files while bundling them.
import replace from 'rollup-plugin-replace'

// this will refresh the browser when detect changes in bundle.
import livereload from 'rollup-plugin-livereload'