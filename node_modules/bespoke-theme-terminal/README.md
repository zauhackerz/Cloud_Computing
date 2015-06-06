# bespoke-theme-terminal

a terminal-like scrolling theme &mdash; [View demo](http://tebbi.github.io/bespoke-theme-terminal)

## Download

Download the [production version][min] or the [development version][max], or use a [package manager](#package-managers).

[min]: https://raw.github.com/tebbi/bespoke-theme-terminal/master/dist/bespoke-theme-terminal.min.js
[max]: https://raw.github.com/tebbi/bespoke-theme-terminal/master/dist/bespoke-theme-terminal.js

## Usage

This theme is shipped in a [UMD format](https://github.com/umdjs/umd), meaning that it is available as a CommonJS/AMD module or browser global.

For example, when using CommonJS modules:

```js
var bespoke = require('bespoke'),
  terminal = require('bespoke-theme-terminal');

bespoke.from('#presentation', [
  terminal()
]);
```

When using browser globals:

```js
bespoke.from('#presentation', [
  bespoke.themes.terminal()
]);
```

## Package manager

### npm

```bash
$ npm install bespoke-theme-terminal
```

## Credits

This theme was built with [generator-bespoketheme](https://github.com/markdalgleish/generator-bespoketheme).

## License

[MIT License](http://en.wikipedia.org/wiki/MIT_License)
