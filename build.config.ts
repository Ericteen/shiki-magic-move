import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/vue',
    'src/core',
    'src/types',
    'src/renderer',
    {
      builder: 'mkdist',
      outDir: 'dist',
      input: './src',
      pattern: ['**/*.css'],
    },
  ],
  declaration: true,
  clean: true,
  rollup: {
    inlineDependencies: true,
  },
})
