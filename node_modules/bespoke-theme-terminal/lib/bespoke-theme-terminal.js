var fs = require('fs');
var classes = require('bespoke-classes');
var insertCss = require('insert-css');

module.exports = function() {
    var css = fs.readFileSync(__dirname + '/tmp/theme.css', 'utf8');
    insertCss(css, { prepend: true });
    
    return function(deck) {
	classes()(deck);

	//wrap the slides in additional div that scrolls up
	var parent = deck.parent;
	var content = document.createElement('div');
        content.className = 'bespoke-theme-terminal-content';
	while(parent.hasChildNodes()) content.appendChild(parent.firstChild);
	parent.appendChild(content);
    };
};
