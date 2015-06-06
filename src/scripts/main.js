// Require Node modules in the browser thanks to Browserify: http://browserify.org
var bespoke = require('bespoke'),
  //cube = require('bespoke-theme-cube'),
  //voltaire = require('bespoke-theme-voltaire'),
  //terminal = require('bespoke-theme-terminal'),
  //fancy = require('bespoke-theme-fancy');
  //simpleSlide = require('bespoke-theme-simple-slide');
  //mozillaSandstone = require('bespoke-theme-mozilla-sandstone');
  tweakable = require('bespoke-theme-tweakable');
  keys = require('bespoke-keys'),
  touch = require('bespoke-touch'),
  bullets = require('bespoke-bullets'),
  backdrop = require('bespoke-backdrop'),
  scale = require('bespoke-scale'),
  hash = require('bespoke-hash'),
  progress = require('bespoke-progress'),
  forms = require('bespoke-forms');

// Bespoke.js
bespoke.from('article', [
  //cube(),
  //voltaire(),
  //terminal(),
  //fancy(),
  //simpleSlide(),
  //mozillaSandstone(),
  tweakable(),
  keys(),
  touch(),
  bullets('li, .bullet'),
  backdrop(),
  scale(),
  hash(),
  progress(),
  forms()
]);

// Prism syntax highlighting
// This is actually loaded from "bower_components" thanks to
// debowerify: https://github.com/eugeneware/debowerify
require('prism');

