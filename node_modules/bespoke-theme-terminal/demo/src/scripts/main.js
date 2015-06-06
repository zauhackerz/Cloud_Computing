var bespoke = require('bespoke'),
  terminal = require('../../../lib/bespoke-theme-terminal.js'),
  keys = require('bespoke-keys'),
  touch = require('bespoke-touch'),
  bullets = require('bespoke-bullets'),
  progress = require('bespoke-progress');

bespoke.from('article', [
  terminal(),
  keys(),
  touch(),
  bullets('li, .bullet'),
  progress()
]);
