(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

/* **********************************************
     Begin prism-core.js
********************************************** */

self = (typeof window !== 'undefined')
	? window   // if in browser
	: (
		(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope)
		? self // if in worker
		: {}   // if in node js
	);

/**
 * Prism: Lightweight, robust, elegant syntax highlighting
 * MIT license http://www.opensource.org/licenses/mit-license.php/
 * @author Lea Verou http://lea.verou.me
 */

var Prism = (function(){

// Private helper vars
var lang = /\blang(?:uage)?-(?!\*)(\w+)\b/i;

var _ = self.Prism = {
	util: {
		encode: function (tokens) {
			if (tokens instanceof Token) {
				return new Token(tokens.type, _.util.encode(tokens.content), tokens.alias);
			} else if (_.util.type(tokens) === 'Array') {
				return tokens.map(_.util.encode);
			} else {
				return tokens.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\u00a0/g, ' ');
			}
		},

		type: function (o) {
			return Object.prototype.toString.call(o).match(/\[object (\w+)\]/)[1];
		},

		// Deep clone a language definition (e.g. to extend it)
		clone: function (o) {
			var type = _.util.type(o);

			switch (type) {
				case 'Object':
					var clone = {};

					for (var key in o) {
						if (o.hasOwnProperty(key)) {
							clone[key] = _.util.clone(o[key]);
						}
					}

					return clone;

				case 'Array':
					return o.map(function(v) { return _.util.clone(v); });
			}

			return o;
		}
	},

	languages: {
		extend: function (id, redef) {
			var lang = _.util.clone(_.languages[id]);

			for (var key in redef) {
				lang[key] = redef[key];
			}

			return lang;
		},

		/**
		 * Insert a token before another token in a language literal
		 * As this needs to recreate the object (we cannot actually insert before keys in object literals),
		 * we cannot just provide an object, we need anobject and a key.
		 * @param inside The key (or language id) of the parent
		 * @param before The key to insert before. If not provided, the function appends instead.
		 * @param insert Object with the key/value pairs to insert
		 * @param root The object that contains `inside`. If equal to Prism.languages, it can be omitted.
		 */
		insertBefore: function (inside, before, insert, root) {
			root = root || _.languages;
			var grammar = root[inside];
			
			if (arguments.length == 2) {
				insert = arguments[1];
				
				for (var newToken in insert) {
					if (insert.hasOwnProperty(newToken)) {
						grammar[newToken] = insert[newToken];
					}
				}
				
				return grammar;
			}
			
			var ret = {};

			for (var token in grammar) {

				if (grammar.hasOwnProperty(token)) {

					if (token == before) {

						for (var newToken in insert) {

							if (insert.hasOwnProperty(newToken)) {
								ret[newToken] = insert[newToken];
							}
						}
					}

					ret[token] = grammar[token];
				}
			}
			
			// Update references in other language definitions
			_.languages.DFS(_.languages, function(key, value) {
				if (value === root[inside] && key != inside) {
					this[key] = ret;
				}
			});

			return root[inside] = ret;
		},

		// Traverse a language definition with Depth First Search
		DFS: function(o, callback, type) {
			for (var i in o) {
				if (o.hasOwnProperty(i)) {
					callback.call(o, i, o[i], type || i);

					if (_.util.type(o[i]) === 'Object') {
						_.languages.DFS(o[i], callback);
					}
					else if (_.util.type(o[i]) === 'Array') {
						_.languages.DFS(o[i], callback, i);
					}
				}
			}
		}
	},

	highlightAll: function(async, callback) {
		var elements = document.querySelectorAll('code[class*="language-"], [class*="language-"] code, code[class*="lang-"], [class*="lang-"] code');

		for (var i=0, element; element = elements[i++];) {
			_.highlightElement(element, async === true, callback);
		}
	},

	highlightElement: function(element, async, callback) {
		// Find language
		var language, grammar, parent = element;

		while (parent && !lang.test(parent.className)) {
			parent = parent.parentNode;
		}

		if (parent) {
			language = (parent.className.match(lang) || [,''])[1];
			grammar = _.languages[language];
		}

		if (!grammar) {
			return;
		}

		// Set language on the element, if not present
		element.className = element.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;

		// Set language on the parent, for styling
		parent = element.parentNode;

		if (/pre/i.test(parent.nodeName)) {
			parent.className = parent.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;
		}

		var code = element.textContent;

		if(!code) {
			return;
		}

		code = code.replace(/^(?:\r?\n|\r)/,'');

		var env = {
			element: element,
			language: language,
			grammar: grammar,
			code: code
		};

		_.hooks.run('before-highlight', env);

		if (async && self.Worker) {
			var worker = new Worker(_.filename);

			worker.onmessage = function(evt) {
				env.highlightedCode = Token.stringify(JSON.parse(evt.data), language);

				_.hooks.run('before-insert', env);

				env.element.innerHTML = env.highlightedCode;

				callback && callback.call(env.element);
				_.hooks.run('after-highlight', env);
			};

			worker.postMessage(JSON.stringify({
				language: env.language,
				code: env.code
			}));
		}
		else {
			env.highlightedCode = _.highlight(env.code, env.grammar, env.language);

			_.hooks.run('before-insert', env);

			env.element.innerHTML = env.highlightedCode;

			callback && callback.call(element);

			_.hooks.run('after-highlight', env);
		}
	},

	highlight: function (text, grammar, language) {
		var tokens = _.tokenize(text, grammar);
		return Token.stringify(_.util.encode(tokens), language);
	},

	tokenize: function(text, grammar, language) {
		var Token = _.Token;

		var strarr = [text];

		var rest = grammar.rest;

		if (rest) {
			for (var token in rest) {
				grammar[token] = rest[token];
			}

			delete grammar.rest;
		}

		tokenloop: for (var token in grammar) {
			if(!grammar.hasOwnProperty(token) || !grammar[token]) {
				continue;
			}

			var patterns = grammar[token];
			patterns = (_.util.type(patterns) === "Array") ? patterns : [patterns];

			for (var j = 0; j < patterns.length; ++j) {
				var pattern = patterns[j],
					inside = pattern.inside,
					lookbehind = !!pattern.lookbehind,
					lookbehindLength = 0,
					alias = pattern.alias;

				pattern = pattern.pattern || pattern;

				for (var i=0; i<strarr.length; i++) { // Don’t cache length as it changes during the loop

					var str = strarr[i];

					if (strarr.length > text.length) {
						// Something went terribly wrong, ABORT, ABORT!
						break tokenloop;
					}

					if (str instanceof Token) {
						continue;
					}

					pattern.lastIndex = 0;

					var match = pattern.exec(str);

					if (match) {
						if(lookbehind) {
							lookbehindLength = match[1].length;
						}

						var from = match.index - 1 + lookbehindLength,
							match = match[0].slice(lookbehindLength),
							len = match.length,
							to = from + len,
							before = str.slice(0, from + 1),
							after = str.slice(to + 1);

						var args = [i, 1];

						if (before) {
							args.push(before);
						}

						var wrapped = new Token(token, inside? _.tokenize(match, inside) : match, alias);

						args.push(wrapped);

						if (after) {
							args.push(after);
						}

						Array.prototype.splice.apply(strarr, args);
					}
				}
			}
		}

		return strarr;
	},

	hooks: {
		all: {},

		add: function (name, callback) {
			var hooks = _.hooks.all;

			hooks[name] = hooks[name] || [];

			hooks[name].push(callback);
		},

		run: function (name, env) {
			var callbacks = _.hooks.all[name];

			if (!callbacks || !callbacks.length) {
				return;
			}

			for (var i=0, callback; callback = callbacks[i++];) {
				callback(env);
			}
		}
	}
};

var Token = _.Token = function(type, content, alias) {
	this.type = type;
	this.content = content;
	this.alias = alias;
};

Token.stringify = function(o, language, parent) {
	if (typeof o == 'string') {
		return o;
	}

	if (_.util.type(o) === 'Array') {
		return o.map(function(element) {
			return Token.stringify(element, language, o);
		}).join('');
	}

	var env = {
		type: o.type,
		content: Token.stringify(o.content, language, parent),
		tag: 'span',
		classes: ['token', o.type],
		attributes: {},
		language: language,
		parent: parent
	};

	if (env.type == 'comment') {
		env.attributes['spellcheck'] = 'true';
	}

	if (o.alias) {
		var aliases = _.util.type(o.alias) === 'Array' ? o.alias : [o.alias];
		Array.prototype.push.apply(env.classes, aliases);
	}

	_.hooks.run('wrap', env);

	var attributes = '';

	for (var name in env.attributes) {
		attributes += name + '="' + (env.attributes[name] || '') + '"';
	}

	return '<' + env.tag + ' class="' + env.classes.join(' ') + '" ' + attributes + '>' + env.content + '</' + env.tag + '>';

};

if (!self.document) {
	if (!self.addEventListener) {
		// in Node.js
		return self.Prism;
	}
 	// In worker
	self.addEventListener('message', function(evt) {
		var message = JSON.parse(evt.data),
		    lang = message.language,
		    code = message.code;

		self.postMessage(JSON.stringify(_.util.encode(_.tokenize(code, _.languages[lang]))));
		self.close();
	}, false);

	return self.Prism;
}

// Get current script and highlight
var script = document.getElementsByTagName('script');

script = script[script.length - 1];

if (script) {
	_.filename = script.src;

	if (document.addEventListener && !script.hasAttribute('data-manual')) {
		document.addEventListener('DOMContentLoaded', _.highlightAll);
	}
}

return self.Prism;

})();

if (typeof module !== 'undefined' && module.exports) {
	module.exports = Prism;
}


/* **********************************************
     Begin prism-markup.js
********************************************** */

Prism.languages.markup = {
	'comment': /<!--[\w\W]*?-->/,
	'prolog': /<\?.+?\?>/,
	'doctype': /<!DOCTYPE.+?>/,
	'cdata': /<!\[CDATA\[[\w\W]*?]]>/i,
	'tag': {
		pattern: /<\/?[\w:-]+\s*(?:\s+[\w:-]+(?:=(?:("|')(\\?[\w\W])*?\1|[^\s'">=]+))?\s*)*\/?>/i,
		inside: {
			'tag': {
				pattern: /^<\/?[\w:-]+/i,
				inside: {
					'punctuation': /^<\/?/,
					'namespace': /^[\w-]+?:/
				}
			},
			'attr-value': {
				pattern: /=(?:('|")[\w\W]*?(\1)|[^\s>]+)/i,
				inside: {
					'punctuation': /=|>|"/
				}
			},
			'punctuation': /\/?>/,
			'attr-name': {
				pattern: /[\w:-]+/,
				inside: {
					'namespace': /^[\w-]+?:/
				}
			}

		}
	},
	'entity': /&#?[\da-z]{1,8};/i
};

// Plugin to make entity title show the real entity, idea by Roman Komarov
Prism.hooks.add('wrap', function(env) {

	if (env.type === 'entity') {
		env.attributes['title'] = env.content.replace(/&amp;/, '&');
	}
});


/* **********************************************
     Begin prism-css.js
********************************************** */

Prism.languages.css = {
	'comment': /\/\*[\w\W]*?\*\//,
	'atrule': {
		pattern: /@[\w-]+?.*?(;|(?=\s*\{))/i,
		inside: {
			'punctuation': /[;:]/
		}
	},
	'url': /url\((?:(["'])(\\\n|\\?.)*?\1|.*?)\)/i,
	'selector': /[^\{\}\s][^\{\};]*(?=\s*\{)/,
	'string': /("|')(\\\n|\\?.)*?\1/,
	'property': /(\b|\B)[\w-]+(?=\s*:)/i,
	'important': /\B!important\b/i,
	'punctuation': /[\{\};:]/,
	'function': /[-a-z0-9]+(?=\()/i
};

if (Prism.languages.markup) {
	Prism.languages.insertBefore('markup', 'tag', {
		'style': {
			pattern: /<style[\w\W]*?>[\w\W]*?<\/style>/i,
			inside: {
				'tag': {
					pattern: /<style[\w\W]*?>|<\/style>/i,
					inside: Prism.languages.markup.tag.inside
				},
				rest: Prism.languages.css
			},
			alias: 'language-css'
		}
	});
	
	Prism.languages.insertBefore('inside', 'attr-value', {
		'style-attr': {
			pattern: /\s*style=("|').*?\1/i,
			inside: {
				'attr-name': {
					pattern: /^\s*style/i,
					inside: Prism.languages.markup.tag.inside
				},
				'punctuation': /^\s*=\s*['"]|['"]\s*$/,
				'attr-value': {
					pattern: /.+/i,
					inside: Prism.languages.css
				}
			},
			alias: 'language-css'
		}
	}, Prism.languages.markup.tag);
}

/* **********************************************
     Begin prism-clike.js
********************************************** */

Prism.languages.clike = {
	'comment': [
		{
			pattern: /(^|[^\\])\/\*[\w\W]*?\*\//,
			lookbehind: true
		},
		{
			pattern: /(^|[^\\:])\/\/.+/,
			lookbehind: true
		}
	],
	'string': /("|')(\\\n|\\?.)*?\1/,
	'class-name': {
		pattern: /((?:(?:class|interface|extends|implements|trait|instanceof|new)\s+)|(?:catch\s+\())[a-z0-9_\.\\]+/i,
		lookbehind: true,
		inside: {
			punctuation: /(\.|\\)/
		}
	},
	'keyword': /\b(if|else|while|do|for|return|in|instanceof|function|new|try|throw|catch|finally|null|break|continue)\b/,
	'boolean': /\b(true|false)\b/,
	'function': {
		pattern: /[a-z0-9_]+\(/i,
		inside: {
			punctuation: /\(/
		}
	},
	'number': /\b-?(0x[\dA-Fa-f]+|\d*\.?\d+([Ee]-?\d+)?)\b/,
	'operator': /[-+]{1,2}|!|<=?|>=?|={1,3}|&{1,2}|\|?\||\?|\*|\/|~|\^|%/,
	'ignore': /&(lt|gt|amp);/i,
	'punctuation': /[{}[\];(),.:]/
};


/* **********************************************
     Begin prism-javascript.js
********************************************** */

Prism.languages.javascript = Prism.languages.extend('clike', {
	'keyword': /\b(break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|function|get|if|implements|import|in|instanceof|interface|let|new|null|package|private|protected|public|return|set|static|super|switch|this|throw|true|try|typeof|var|void|while|with|yield)\b/,
	'number': /\b-?(0x[\dA-Fa-f]+|\d*\.?\d+([Ee][+-]?\d+)?|NaN|-?Infinity)\b/,
	'function': /(?!\d)[a-z0-9_$]+(?=\()/i
});

Prism.languages.insertBefore('javascript', 'keyword', {
	'regex': {
		pattern: /(^|[^/])\/(?!\/)(\[.+?]|\\.|[^/\r\n])+\/[gim]{0,3}(?=\s*($|[\r\n,.;})]))/,
		lookbehind: true
	}
});

if (Prism.languages.markup) {
	Prism.languages.insertBefore('markup', 'tag', {
		'script': {
			pattern: /<script[\w\W]*?>[\w\W]*?<\/script>/i,
			inside: {
				'tag': {
					pattern: /<script[\w\W]*?>|<\/script>/i,
					inside: Prism.languages.markup.tag.inside
				},
				rest: Prism.languages.javascript
			},
			alias: 'language-javascript'
		}
	});
}


/* **********************************************
     Begin prism-file-highlight.js
********************************************** */

(function () {
	if (!self.Prism || !self.document || !document.querySelector) {
		return;
	}

	self.Prism.fileHighlight = function() {

		var Extensions = {
			'js': 'javascript',
			'html': 'markup',
			'svg': 'markup',
			'xml': 'markup',
			'py': 'python',
			'rb': 'ruby',
			'ps1': 'powershell',
			'psm1': 'powershell'
		};

		Array.prototype.slice.call(document.querySelectorAll('pre[data-src]')).forEach(function(pre) {
			var src = pre.getAttribute('data-src');
			var extension = (src.match(/\.(\w+)$/) || [,''])[1];
			var language = Extensions[extension] || extension;

			var code = document.createElement('code');
			code.className = 'language-' + language;

			pre.textContent = '';

			code.textContent = 'Loading…';

			pre.appendChild(code);

			var xhr = new XMLHttpRequest();

			xhr.open('GET', src, true);

			xhr.onreadystatechange = function() {
				if (xhr.readyState == 4) {

					if (xhr.status < 400 && xhr.responseText) {
						code.textContent = xhr.responseText;

						Prism.highlightElement(code);
					}
					else if (xhr.status >= 400) {
						code.textContent = '✖ Error ' + xhr.status + ' while fetching file: ' + xhr.statusText;
					}
					else {
						code.textContent = '✖ Error: File does not exist or is empty';
					}
				}
			};

			xhr.send(null);
		});

	};

	self.Prism.fileHighlight();

})();

},{}],2:[function(require,module,exports){
module.exports = function() {
  return function(deck) {
    var backdrops;

    function createBackdropForSlide(slide) {
      var backdropAttribute = slide.getAttribute('data-bespoke-backdrop');

      if (backdropAttribute) {
        var backdrop = document.createElement('div');
        backdrop.className = backdropAttribute;
        backdrop.classList.add('bespoke-backdrop');
        deck.parent.appendChild(backdrop);
        return backdrop;
      }
    }

    function updateClasses(el) {
      if (el) {
        var index = backdrops.indexOf(el),
          currentIndex = deck.slide();

        removeClass(el, 'active');
        removeClass(el, 'inactive');
        removeClass(el, 'before');
        removeClass(el, 'after');

        if (index !== currentIndex) {
          addClass(el, 'inactive');
          addClass(el, index < currentIndex ? 'before' : 'after');
        } else {
          addClass(el, 'active');
        }
      }
    }

    function removeClass(el, className) {
      el.classList.remove('bespoke-backdrop-' + className);
    }

    function addClass(el, className) {
      el.classList.add('bespoke-backdrop-' + className);
    }

    backdrops = deck.slides
      .map(createBackdropForSlide);

    deck.on('activate', function() {
      backdrops.forEach(updateClasses);
    });
  };
};

},{}],3:[function(require,module,exports){
module.exports = function(options) {
  return function(deck) {
    var activeSlideIndex,
      activeBulletIndex,

      bullets = deck.slides.map(function(slide) {
        return [].slice.call(slide.querySelectorAll((typeof options === 'string' ? options : '[data-bespoke-bullet]')), 0);
      }),

      next = function() {
        var nextSlideIndex = activeSlideIndex + 1;

        if (activeSlideHasBulletByOffset(1)) {
          activateBullet(activeSlideIndex, activeBulletIndex + 1);
          return false;
        } else if (bullets[nextSlideIndex]) {
          activateBullet(nextSlideIndex, 0);
        }
      },

      prev = function() {
        var prevSlideIndex = activeSlideIndex - 1;

        if (activeSlideHasBulletByOffset(-1)) {
          activateBullet(activeSlideIndex, activeBulletIndex - 1);
          return false;
        } else if (bullets[prevSlideIndex]) {
          activateBullet(prevSlideIndex, bullets[prevSlideIndex].length - 1);
        }
      },

      activateBullet = function(slideIndex, bulletIndex) {
        activeSlideIndex = slideIndex;
        activeBulletIndex = bulletIndex;

        bullets.forEach(function(slide, s) {
          slide.forEach(function(bullet, b) {
            bullet.classList.add('bespoke-bullet');

            if (s < slideIndex || s === slideIndex && b <= bulletIndex) {
              bullet.classList.add('bespoke-bullet-active');
              bullet.classList.remove('bespoke-bullet-inactive');
            } else {
              bullet.classList.add('bespoke-bullet-inactive');
              bullet.classList.remove('bespoke-bullet-active');
            }

            if (s === slideIndex && b === bulletIndex) {
              bullet.classList.add('bespoke-bullet-current');
            } else {
              bullet.classList.remove('bespoke-bullet-current');
            }
          });
        });
      },

      activeSlideHasBulletByOffset = function(offset) {
        return bullets[activeSlideIndex][activeBulletIndex + offset] !== undefined;
      };

    deck.on('next', next);
    deck.on('prev', prev);

    deck.on('slide', function(e) {
      activateBullet(e.index, 0);
    });

    activateBullet(0, 0);
  };
};

},{}],4:[function(require,module,exports){
module.exports = function() {
  return function(deck) {
    deck.slides.forEach(function(slide) {
      slide.addEventListener('keydown', function(e) {
        if (/INPUT|TEXTAREA|SELECT/.test(e.target.nodeName) || e.target.contentEditable === 'true') {
          e.stopPropagation();
        }
      });
    });
  };
};

},{}],5:[function(require,module,exports){
module.exports = function() {
  return function(deck) {
    var parseHash = function() {
      var hash = window.location.hash.slice(1),
        slideNumberOrName = parseInt(hash, 10);

      if (hash) {
        if (slideNumberOrName) {
          activateSlide(slideNumberOrName - 1);
        } else {
          deck.slides.forEach(function(slide, i) {
            if (slide.getAttribute('data-bespoke-hash') === hash) {
              activateSlide(i);
            }
          });
        }
      }
    };

    var activateSlide = function(index) {
      var indexToActivate = -1 < index && index < deck.slides.length ? index : 0;
      if (indexToActivate !== deck.slide()) {
        deck.slide(indexToActivate);
      }
    };

    setTimeout(function() {
      parseHash();

      deck.on('activate', function(e) {
        var slideName = e.slide.getAttribute('data-bespoke-hash');
        window.location.hash = slideName || e.index + 1;
      });

      window.addEventListener('hashchange', parseHash);
    }, 0);
  };
};

},{}],6:[function(require,module,exports){
module.exports = function(options) {
  return function(deck) {
    var isHorizontal = options !== 'vertical';

    document.addEventListener('keydown', function(e) {
      if (e.which == 34 || // PAGE DOWN
        e.which == 32 || // SPACE
        (isHorizontal && e.which == 39) || // RIGHT
        (!isHorizontal && e.which == 40) // DOWN
      ) { deck.next(); }

      if (e.which == 33 || // PAGE UP
        (isHorizontal && e.which == 37) || // LEFT
        (!isHorizontal && e.which == 38) // UP
      ) { deck.prev(); }
    });
  };
};

},{}],7:[function(require,module,exports){
module.exports = function(options) {
  return function (deck) {
    var progressParent = document.createElement('div'),
      progressBar = document.createElement('div'),
      prop = options === 'vertical' ? 'height' : 'width';

    progressParent.className = 'bespoke-progress-parent';
    progressBar.className = 'bespoke-progress-bar';
    progressParent.appendChild(progressBar);
    deck.parent.appendChild(progressParent);

    deck.on('activate', function(e) {
      progressBar.style[prop] = (e.index * 100 / (deck.slides.length - 1)) + '%';
    });
  };
};

},{}],8:[function(require,module,exports){
module.exports = function(options) {
  return function(deck) {
    var parent = deck.parent,
      firstSlide = deck.slides[0],
      slideHeight = firstSlide.offsetHeight,
      slideWidth = firstSlide.offsetWidth,
      useZoom = options === 'zoom' || ('zoom' in parent.style && options !== 'transform'),

      wrap = function(element) {
        var wrapper = document.createElement('div');
        wrapper.className = 'bespoke-scale-parent';
        element.parentNode.insertBefore(wrapper, element);
        wrapper.appendChild(element);
        return wrapper;
      },

      elements = useZoom ? deck.slides : deck.slides.map(wrap),

      transformProperty = (function(property) {
        var prefixes = 'Moz Webkit O ms'.split(' ');
        return prefixes.reduce(function(currentProperty, prefix) {
            return prefix + property in parent.style ? prefix + property : currentProperty;
          }, property.toLowerCase());
      }('Transform')),

      scale = useZoom ?
        function(ratio, element) {
          element.style.zoom = ratio;
        } :
        function(ratio, element) {
          element.style[transformProperty] = 'scale(' + ratio + ')';
        },

      scaleAll = function() {
        var xScale = parent.offsetWidth / slideWidth,
          yScale = parent.offsetHeight / slideHeight;

        elements.forEach(scale.bind(null, Math.min(xScale, yScale)));
      };

    window.addEventListener('resize', scaleAll);
    scaleAll();
  };

};

},{}],9:[function(require,module,exports){
(function (__dirname){
var fs = require('fs');
var insertCss = require('insert-css');
var transform = require('feature/css')('transform');
var dot = require('dot');
var theme = dot.template(fs.readFileSync(__dirname + '/theme.css', 'utf8'));

/**
	# bespoke-theme-tweakable

	A simple [bespoke.js](https://github.com/markdalgleish/bespoke.js) theme
	that can be configured on the fly using client-side templating.

	## Example Usage

	To be completed.

**/
module.exports = function(opts) {
  insertCss(theme(opts || {}), { prepend: true });

  return function(deck) {
    var parent = deck.parent;

    require('bespoke-classes')()(deck);

    deck.on('activate', function(evt) {
      var valX = (evt.index * 100);

      if (transform) {
        transform(parent, 'translateX(-' + valX + '%) translateZ(0)');
      }
      else {
        parent.position = 'absolute';
        parent.left = '-' + valX + '%';
      }
    });
  };
};

}).call(this,"/..\\..\\node_modules\\bespoke-theme-tweakable")
},{"bespoke-classes":10,"dot":12,"feature/css":13,"fs":17,"insert-css":14}],10:[function(require,module,exports){
module.exports = function() {
  return function(deck) {
    var addClass = function(el, cls) {
        el.classList.add('bespoke-' + cls);
      },

      removeClass = function(el, cls) {
        el.className = el.className
          .replace(new RegExp('bespoke-' + cls +'(\\s|$)', 'g'), ' ')
          .trim();
      },

      deactivate = function(el, index) {
        var activeSlide = deck.slides[deck.slide()],
          offset = index - deck.slide(),
          offsetClass = offset > 0 ? 'after' : 'before';

        ['before(-\\d+)?', 'after(-\\d+)?', 'active', 'inactive'].map(removeClass.bind(null, el));

        if (el !== activeSlide) {
          ['inactive', offsetClass, offsetClass + '-' + Math.abs(offset)].map(addClass.bind(null, el));
        }
      };

    addClass(deck.parent, 'parent');
    deck.slides.map(function(el) { addClass(el, 'slide'); });

    deck.on('activate', function(e) {
      deck.slides.map(deactivate);
      addClass(e.slide, 'active');
      removeClass(e.slide, 'inactive');
    });
  };
};

},{}],11:[function(require,module,exports){
// doT.js
// 2011-2014, Laura Doktorova, https://github.com/olado/doT
// Licensed under the MIT license.

(function() {
	"use strict";

	var doT = {
		version: "1.0.3",
		templateSettings: {
			evaluate:    /\{\{([\s\S]+?(\}?)+)\}\}/g,
			interpolate: /\{\{=([\s\S]+?)\}\}/g,
			encode:      /\{\{!([\s\S]+?)\}\}/g,
			use:         /\{\{#([\s\S]+?)\}\}/g,
			useParams:   /(^|[^\w$])def(?:\.|\[[\'\"])([\w$\.]+)(?:[\'\"]\])?\s*\:\s*([\w$\.]+|\"[^\"]+\"|\'[^\']+\'|\{[^\}]+\})/g,
			define:      /\{\{##\s*([\w\.$]+)\s*(\:|=)([\s\S]+?)#\}\}/g,
			defineParams:/^\s*([\w$]+):([\s\S]+)/,
			conditional: /\{\{\?(\?)?\s*([\s\S]*?)\s*\}\}/g,
			iterate:     /\{\{~\s*(?:\}\}|([\s\S]+?)\s*\:\s*([\w$]+)\s*(?:\:\s*([\w$]+))?\s*\}\})/g,
			varname:	"it",
			strip:		true,
			append:		true,
			selfcontained: false,
			doNotSkipEncoded: false
		},
		template: undefined, //fn, compile template
		compile:  undefined  //fn, for express
	}, _globals;

	doT.encodeHTMLSource = function(doNotSkipEncoded) {
		var encodeHTMLRules = { "&": "&#38;", "<": "&#60;", ">": "&#62;", '"': "&#34;", "'": "&#39;", "/": "&#47;" },
			matchHTML = doNotSkipEncoded ? /[&<>"'\/]/g : /&(?!#?\w+;)|<|>|"|'|\//g;
		return function(code) {
			return code ? code.toString().replace(matchHTML, function(m) {return encodeHTMLRules[m] || m;}) : "";
		};
	};

	_globals = (function(){ return this || (0,eval)("this"); }());

	if (typeof module !== "undefined" && module.exports) {
		module.exports = doT;
	} else if (typeof define === "function" && define.amd) {
		define(function(){return doT;});
	} else {
		_globals.doT = doT;
	}

	var startend = {
		append: { start: "'+(",      end: ")+'",      startencode: "'+encodeHTML(" },
		split:  { start: "';out+=(", end: ");out+='", startencode: "';out+=encodeHTML(" }
	}, skip = /$^/;

	function resolveDefs(c, block, def) {
		return ((typeof block === "string") ? block : block.toString())
		.replace(c.define || skip, function(m, code, assign, value) {
			if (code.indexOf("def.") === 0) {
				code = code.substring(4);
			}
			if (!(code in def)) {
				if (assign === ":") {
					if (c.defineParams) value.replace(c.defineParams, function(m, param, v) {
						def[code] = {arg: param, text: v};
					});
					if (!(code in def)) def[code]= value;
				} else {
					new Function("def", "def['"+code+"']=" + value)(def);
				}
			}
			return "";
		})
		.replace(c.use || skip, function(m, code) {
			if (c.useParams) code = code.replace(c.useParams, function(m, s, d, param) {
				if (def[d] && def[d].arg && param) {
					var rw = (d+":"+param).replace(/'|\\/g, "_");
					def.__exp = def.__exp || {};
					def.__exp[rw] = def[d].text.replace(new RegExp("(^|[^\\w$])" + def[d].arg + "([^\\w$])", "g"), "$1" + param + "$2");
					return s + "def.__exp['"+rw+"']";
				}
			});
			var v = new Function("def", "return " + code)(def);
			return v ? resolveDefs(c, v, def) : v;
		});
	}

	function unescape(code) {
		return code.replace(/\\('|\\)/g, "$1").replace(/[\r\t\n]/g, " ");
	}

	doT.template = function(tmpl, c, def) {
		c = c || doT.templateSettings;
		var cse = c.append ? startend.append : startend.split, needhtmlencode, sid = 0, indv,
			str  = (c.use || c.define) ? resolveDefs(c, tmpl, def || {}) : tmpl;

		str = ("var out='" + (c.strip ? str.replace(/(^|\r|\n)\t* +| +\t*(\r|\n|$)/g," ")
					.replace(/\r|\n|\t|\/\*[\s\S]*?\*\//g,""): str)
			.replace(/'|\\/g, "\\$&")
			.replace(c.interpolate || skip, function(m, code) {
				return cse.start + unescape(code) + cse.end;
			})
			.replace(c.encode || skip, function(m, code) {
				needhtmlencode = true;
				return cse.startencode + unescape(code) + cse.end;
			})
			.replace(c.conditional || skip, function(m, elsecase, code) {
				return elsecase ?
					(code ? "';}else if(" + unescape(code) + "){out+='" : "';}else{out+='") :
					(code ? "';if(" + unescape(code) + "){out+='" : "';}out+='");
			})
			.replace(c.iterate || skip, function(m, iterate, vname, iname) {
				if (!iterate) return "';} } out+='";
				sid+=1; indv=iname || "i"+sid; iterate=unescape(iterate);
				return "';var arr"+sid+"="+iterate+";if(arr"+sid+"){var "+vname+","+indv+"=-1,l"+sid+"=arr"+sid+".length-1;while("+indv+"<l"+sid+"){"
					+vname+"=arr"+sid+"["+indv+"+=1];out+='";
			})
			.replace(c.evaluate || skip, function(m, code) {
				return "';" + unescape(code) + "out+='";
			})
			+ "';return out;")
			.replace(/\n/g, "\\n").replace(/\t/g, '\\t').replace(/\r/g, "\\r")
			.replace(/(\s|;|\}|^|\{)out\+='';/g, '$1').replace(/\+''/g, "");
			//.replace(/(\s|;|\}|^|\{)out\+=''\+/g,'$1out+=');

		if (needhtmlencode) {
			if (!c.selfcontained && _globals && !_globals._encodeHTML) _globals._encodeHTML = doT.encodeHTMLSource(c.doNotSkipEncoded);
			str = "var encodeHTML = typeof _encodeHTML !== 'undefined' ? _encodeHTML : ("
				+ doT.encodeHTMLSource.toString() + "(" + (c.doNotSkipEncoded || '') + "));"
				+ str;
		}
		try {
			return new Function(c.varname, str);
		} catch (e) {
			if (typeof console !== "undefined") console.log("Could not create a template function: " + str);
			throw e;
		}
	};

	doT.compile = function(tmpl, def) {
		return doT.template(tmpl, null, def);
	};
}());

},{}],12:[function(require,module,exports){
/* doT + auto-compilation of doT templates
 *
 * 2012, Laura Doktorova, https://github.com/olado/doT
 * Licensed under the MIT license
 *
 * Compiles .def, .dot, .jst files found under the specified path.
 * It ignores sub-directories.
 * Template files can have multiple extensions at the same time.
 * Files with .def extension can be included in other files via {{#def.name}}
 * Files with .dot extension are compiled into functions with the same name and
 * can be accessed as renderer.filename
 * Files with .jst extension are compiled into .js files. Produced .js file can be
 * loaded as a commonJS, AMD module, or just installed into a global variable
 * (default is set to window.render).
 * All inline defines defined in the .jst file are
 * compiled into separate functions and are available via _render.filename.definename
 *
 * Basic usage:
 * var dots = require("dot").process({path: "./views"});
 * dots.mytemplate({foo:"hello world"});
 *
 * The above snippet will:
 * 1. Compile all templates in views folder (.dot, .def, .jst)
 * 2. Place .js files compiled from .jst templates into the same folder.
 *    These files can be used with require, i.e. require("./views/mytemplate").
 * 3. Return an object with functions compiled from .dot templates as its properties.
 * 4. Render mytemplate template.
 */

var fs = require("fs"),
	doT = module.exports = require("./doT");

doT.process = function(options) {
	//path, destination, global, rendermodule, templateSettings
	return new InstallDots(options).compileAll();
};

function InstallDots(o) {
	this.__path 		= o.path || "./";
	if (this.__path[this.__path.length-1] !== '/') this.__path += '/';
	this.__destination	= o.destination || this.__path;
	if (this.__destination[this.__destination.length-1] !== '/') this.__destination += '/';
	this.__global		= o.global || "window.render";
	this.__rendermodule	= o.rendermodule || {};
	this.__settings 	= o.templateSettings ? copy(o.templateSettings, copy(doT.templateSettings)) : undefined;
	this.__includes		= {};
}

InstallDots.prototype.compileToFile = function(path, template, def) {
	def = def || {};
	var modulename = path.substring(path.lastIndexOf("/")+1, path.lastIndexOf("."))
		, defs = copy(this.__includes, copy(def))
		, settings = this.__settings || doT.templateSettings
		, compileoptions = copy(settings)
		, defaultcompiled = doT.template(template, settings, defs)
		, exports = []
		, compiled = ""
		, fn;

	for (var property in defs) {
		if (defs[property] !== def[property] && defs[property] !== this.__includes[property]) {
			fn = undefined;
			if (typeof defs[property] === 'string') {
				fn = doT.template(defs[property], settings, defs);
			} else if (typeof defs[property] === 'function') {
				fn = defs[property];
			} else if (defs[property].arg) {
				compileoptions.varname = defs[property].arg;
				fn = doT.template(defs[property].text, compileoptions, defs);
			}
			if (fn) {
				compiled += fn.toString().replace('anonymous', property);
				exports.push(property);
			}
		}
	}
	compiled += defaultcompiled.toString().replace('anonymous', modulename);
	fs.writeFileSync(path, "(function(){" + compiled
		+ "var itself=" + modulename + ", _encodeHTML=(" + doT.encodeHTMLSource.toString() + "(" + (settings.doNotSkipEncoded || '') + "));"
		+ addexports(exports)
		+ "if(typeof module!=='undefined' && module.exports) module.exports=itself;else if(typeof define==='function')define(function(){return itself;});else {"
		+ this.__global + "=" + this.__global + "||{};" + this.__global + "['" + modulename + "']=itself;}}());");
};

function addexports(exports) {
	for (var ret ='', i=0; i< exports.length; i++) {
		ret += "itself." + exports[i]+ "=" + exports[i]+";";
	}
	return ret;
}

function copy(o, to) {
	to = to || {};
	for (var property in o) {
		to[property] = o[property];
	}
	return to;
}

function readdata(path) {
	var data = fs.readFileSync(path);
	if (data) return data.toString();
	console.log("problems with " + path);
}

InstallDots.prototype.compilePath = function(path) {
	var data = readdata(path);
	if (data) {
		return doT.template(data,
					this.__settings || doT.templateSettings,
					copy(this.__includes));
	}
};

InstallDots.prototype.compileAll = function() {
	console.log("Compiling all doT templates...");

	var defFolder = this.__path,
		sources = fs.readdirSync(defFolder),
		k, l, name;

	for( k = 0, l = sources.length; k < l; k++) {
		name = sources[k];
		if (/\.def(\.dot|\.jst)?$/.test(name)) {
			console.log("Loaded def " + name);
			this.__includes[name.substring(0, name.indexOf('.'))] = readdata(defFolder + name);
		}
	}

	for( k = 0, l = sources.length; k < l; k++) {
		name = sources[k];
		if (/\.dot(\.def|\.jst)?$/.test(name)) {
			console.log("Compiling " + name + " to function");
			this.__rendermodule[name.substring(0, name.indexOf('.'))] = this.compilePath(defFolder + name);
		}
		if (/\.jst(\.dot|\.def)?$/.test(name)) {
			console.log("Compiling " + name + " to file");
			this.compileToFile(this.__destination + name.substring(0, name.indexOf('.')) + '.js',
					readdata(defFolder + name));
		}
	}
	return this.__rendermodule;
};

},{"./doT":11,"fs":17}],13:[function(require,module,exports){
/* jshint node: true */
/* global window: false */
/* global document: false */
'use strict';

// list prefixes and case transforms
// (reverse order as a decrementing for loop is used)
var prefixes = [
  'ms',
  'ms', // intentional: 2nd entry for ms as we will also try Pascal case for MS
  'O',
  'Moz',
  'Webkit',
  ''
];

var caseTransforms = [
  toCamelCase,
  null,
  null,
  toCamelCase,
  null,
  toCamelCase
];

var props = {};
var style;

/**
  ### css(prop)

  Test for the prescence of the specified CSS property (in all it's
  possible browser prefixed variants).  The returned function (if we
  are able to access the required style property) is both a getter and
  setter function for when given an element.

  Consider the following example, with regards to CSS transforms:

  <<< examples/transform.js

**/
module.exports = function(prop) {
  var ii;
  var propName;
  var pascalCaseName;

  style = style || document.body.style;

  // if we already have a value for the target property, return
  if (props[prop] || style[prop]) {
    return props[prop];
  }

  // convert a dash delimited propertyname (e.g. box-shadow) into
  // pascal cased name (e.g. BoxShadow)
  pascalCaseName = prop.split('-').reduce(function(memo, val) {
    return memo + val.charAt(0).toUpperCase() + val.slice(1);
  }, '');

  // check for the property
  for (ii = prefixes.length; ii--; ) {
    propName = prefixes[ii] + (caseTransforms[ii] ?
                  caseTransforms[ii](pascalCaseName) :
                  pascalCaseName);

    if (typeof style[propName] != 'undefined') {
      props[prop] = createGetterSetter(propName);
      break;
    }
  }

  return props[prop];
};

/* internal helper functions */

function createGetterSetter(propName) {
  function gs(element, value) {
    // if we have a value update
    if (typeof value != 'undefined') {
      element.style[propName] = value;
    }

    return window.getComputedStyle(element)[propName];
  }

  // attach the property name to the getter and setter
  gs.property = propName;
  return gs;
}

function toCamelCase(input) {
  return input.charAt(0).toLowerCase() + input.slice(1);
}
},{}],14:[function(require,module,exports){
var inserted = {};

module.exports = function (css, options) {
    if (inserted[css]) return;
    inserted[css] = true;
    
    var elem = document.createElement('style');
    elem.setAttribute('type', 'text/css');

    if ('textContent' in elem) {
      elem.textContent = css;
    } else {
      elem.styleSheet.cssText = css;
    }
    
    var head = document.getElementsByTagName('head')[0];
    if (options && options.prepend) {
        head.insertBefore(elem, head.childNodes[0]);
    } else {
        head.appendChild(elem);
    }
};

},{}],15:[function(require,module,exports){
module.exports = function(options) {
  return function(deck) {
    var axis = options == 'vertical' ? 'Y' : 'X',
      startPosition,
      delta;

    deck.parent.addEventListener('touchstart', function(e) {
      if (e.touches.length == 1) {
        startPosition = e.touches[0]['page' + axis];
        delta = 0;
      }
    });

    deck.parent.addEventListener('touchmove', function(e) {
      if (e.touches.length == 1) {
        e.preventDefault();
        delta = e.touches[0]['page' + axis] - startPosition;
      }
    });

    deck.parent.addEventListener('touchend', function() {
      if (Math.abs(delta) > 50) {
        deck[delta > 0 ? 'prev' : 'next']();
      }
    });
  };
};

},{}],16:[function(require,module,exports){
var from = function(selectorOrElement, plugins) {
  var parent = selectorOrElement.nodeType === 1 ? selectorOrElement : document.querySelector(selectorOrElement),
    slides = [].filter.call(parent.children, function(el) { return el.nodeName !== 'SCRIPT'; }),
    activeSlide = slides[0],
    listeners = {},

    activate = function(index, customData) {
      if (!slides[index]) {
        return;
      }

      fire('deactivate', createEventData(activeSlide, customData));
      activeSlide = slides[index];
      fire('activate', createEventData(activeSlide, customData));
    },

    slide = function(index, customData) {
      if (arguments.length) {
        fire('slide', createEventData(slides[index], customData)) && activate(index, customData);
      } else {
        return slides.indexOf(activeSlide);
      }
    },

    step = function(offset, customData) {
      var slideIndex = slides.indexOf(activeSlide) + offset;

      fire(offset > 0 ? 'next' : 'prev', createEventData(activeSlide, customData)) && activate(slideIndex, customData);
    },

    on = function(eventName, callback) {
      (listeners[eventName] || (listeners[eventName] = [])).push(callback);

      return function() {
        listeners[eventName] = listeners[eventName].filter(function(listener) {
          return listener !== callback;
        });
      };
    },

    fire = function(eventName, eventData) {
      return (listeners[eventName] || [])
        .reduce(function(notCancelled, callback) {
          return notCancelled && callback(eventData) !== false;
        }, true);
    },

    createEventData = function(el, eventData) {
      eventData = eventData || {};
      eventData.index = slides.indexOf(el);
      eventData.slide = el;
      return eventData;
    },

    deck = {
      on: on,
      fire: fire,
      slide: slide,
      next: step.bind(null, 1),
      prev: step.bind(null, -1),
      parent: parent,
      slides: slides
    };

  (plugins || []).forEach(function(plugin) {
    plugin(deck);
  });

  activate(0);

  return deck;
};

module.exports = {
  from: from
};

},{}],17:[function(require,module,exports){

},{}],18:[function(require,module,exports){
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
require("./..\\..\\bower_components\\prism\\prism.js");


},{"./..\\..\\bower_components\\prism\\prism.js":1,"bespoke":16,"bespoke-backdrop":2,"bespoke-bullets":3,"bespoke-forms":4,"bespoke-hash":5,"bespoke-keys":6,"bespoke-progress":7,"bespoke-scale":8,"bespoke-theme-tweakable":9,"bespoke-touch":15}]},{},[18])
<<<<<<< HEAD
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFx0YW50b3dpXFxDbG91ZF9Db21wdXRpbmdcXG5vZGVfbW9kdWxlc1xcZ3VscC1icm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcYnJvd3Nlci1wYWNrXFxfcHJlbHVkZS5qcyIsIkM6L3RhbnRvd2kvQ2xvdWRfQ29tcHV0aW5nL2Jvd2VyX2NvbXBvbmVudHMvcHJpc20vcHJpc20uanMiLCJDOi90YW50b3dpL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS1iYWNrZHJvcC9saWIvYmVzcG9rZS1iYWNrZHJvcC5qcyIsIkM6L3RhbnRvd2kvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlLWJ1bGxldHMvbGliL2Jlc3Bva2UtYnVsbGV0cy5qcyIsIkM6L3RhbnRvd2kvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlLWZvcm1zL2xpYi9iZXNwb2tlLWZvcm1zLmpzIiwiQzovdGFudG93aS9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtaGFzaC9saWIvYmVzcG9rZS1oYXNoLmpzIiwiQzovdGFudG93aS9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2Uta2V5cy9saWIvYmVzcG9rZS1rZXlzLmpzIiwiQzovdGFudG93aS9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtcHJvZ3Jlc3MvbGliL2Jlc3Bva2UtcHJvZ3Jlc3MuanMiLCJDOi90YW50b3dpL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS1zY2FsZS9saWIvYmVzcG9rZS1zY2FsZS5qcyIsIkM6L3RhbnRvd2kvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlLXRoZW1lLXR3ZWFrYWJsZS9pbmRleC5qcyIsIkM6L3RhbnRvd2kvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlLXRoZW1lLXR3ZWFrYWJsZS9ub2RlX21vZHVsZXMvYmVzcG9rZS1jbGFzc2VzL2xpYi9iZXNwb2tlLWNsYXNzZXMuanMiLCJDOi90YW50b3dpL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS10aGVtZS10d2Vha2FibGUvbm9kZV9tb2R1bGVzL2RvdC9kb1QuanMiLCJDOi90YW50b3dpL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS10aGVtZS10d2Vha2FibGUvbm9kZV9tb2R1bGVzL2RvdC9pbmRleC5qcyIsIkM6L3RhbnRvd2kvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlLXRoZW1lLXR3ZWFrYWJsZS9ub2RlX21vZHVsZXMvZmVhdHVyZS9jc3MuanMiLCJDOi90YW50b3dpL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS10aGVtZS10d2Vha2FibGUvbm9kZV9tb2R1bGVzL2luc2VydC1jc3MvaW5kZXguanMiLCJDOi90YW50b3dpL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS10b3VjaC9saWIvYmVzcG9rZS10b3VjaC5qcyIsIkM6L3RhbnRvd2kvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlL2xpYi9iZXNwb2tlLmpzIiwiQzovdGFudG93aS9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwiQzovdGFudG93aS9DbG91ZF9Db21wdXRpbmcvc3JjL3NjcmlwdHMvZmFrZV9jZDEwMzQ3Ny5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcclxuLyogKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG4gICAgIEJlZ2luIHByaXNtLWNvcmUuanNcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG5cclxuc2VsZiA9ICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJylcclxuXHQ/IHdpbmRvdyAgIC8vIGlmIGluIGJyb3dzZXJcclxuXHQ6IChcclxuXHRcdCh0eXBlb2YgV29ya2VyR2xvYmFsU2NvcGUgIT09ICd1bmRlZmluZWQnICYmIHNlbGYgaW5zdGFuY2VvZiBXb3JrZXJHbG9iYWxTY29wZSlcclxuXHRcdD8gc2VsZiAvLyBpZiBpbiB3b3JrZXJcclxuXHRcdDoge30gICAvLyBpZiBpbiBub2RlIGpzXHJcblx0KTtcclxuXHJcbi8qKlxyXG4gKiBQcmlzbTogTGlnaHR3ZWlnaHQsIHJvYnVzdCwgZWxlZ2FudCBzeW50YXggaGlnaGxpZ2h0aW5nXHJcbiAqIE1JVCBsaWNlbnNlIGh0dHA6Ly93d3cub3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvbWl0LWxpY2Vuc2UucGhwL1xyXG4gKiBAYXV0aG9yIExlYSBWZXJvdSBodHRwOi8vbGVhLnZlcm91Lm1lXHJcbiAqL1xyXG5cclxudmFyIFByaXNtID0gKGZ1bmN0aW9uKCl7XHJcblxyXG4vLyBQcml2YXRlIGhlbHBlciB2YXJzXHJcbnZhciBsYW5nID0gL1xcYmxhbmcoPzp1YWdlKT8tKD8hXFwqKShcXHcrKVxcYi9pO1xyXG5cclxudmFyIF8gPSBzZWxmLlByaXNtID0ge1xyXG5cdHV0aWw6IHtcclxuXHRcdGVuY29kZTogZnVuY3Rpb24gKHRva2Vucykge1xyXG5cdFx0XHRpZiAodG9rZW5zIGluc3RhbmNlb2YgVG9rZW4pIHtcclxuXHRcdFx0XHRyZXR1cm4gbmV3IFRva2VuKHRva2Vucy50eXBlLCBfLnV0aWwuZW5jb2RlKHRva2Vucy5jb250ZW50KSwgdG9rZW5zLmFsaWFzKTtcclxuXHRcdFx0fSBlbHNlIGlmIChfLnV0aWwudHlwZSh0b2tlbnMpID09PSAnQXJyYXknKSB7XHJcblx0XHRcdFx0cmV0dXJuIHRva2Vucy5tYXAoXy51dGlsLmVuY29kZSk7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0cmV0dXJuIHRva2Vucy5yZXBsYWNlKC8mL2csICcmYW1wOycpLnJlcGxhY2UoLzwvZywgJyZsdDsnKS5yZXBsYWNlKC9cXHUwMGEwL2csICcgJyk7XHJcblx0XHRcdH1cclxuXHRcdH0sXHJcblxyXG5cdFx0dHlwZTogZnVuY3Rpb24gKG8pIHtcclxuXHRcdFx0cmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKS5tYXRjaCgvXFxbb2JqZWN0IChcXHcrKVxcXS8pWzFdO1xyXG5cdFx0fSxcclxuXHJcblx0XHQvLyBEZWVwIGNsb25lIGEgbGFuZ3VhZ2UgZGVmaW5pdGlvbiAoZS5nLiB0byBleHRlbmQgaXQpXHJcblx0XHRjbG9uZTogZnVuY3Rpb24gKG8pIHtcclxuXHRcdFx0dmFyIHR5cGUgPSBfLnV0aWwudHlwZShvKTtcclxuXHJcblx0XHRcdHN3aXRjaCAodHlwZSkge1xyXG5cdFx0XHRcdGNhc2UgJ09iamVjdCc6XHJcblx0XHRcdFx0XHR2YXIgY2xvbmUgPSB7fTtcclxuXHJcblx0XHRcdFx0XHRmb3IgKHZhciBrZXkgaW4gbykge1xyXG5cdFx0XHRcdFx0XHRpZiAoby5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XHJcblx0XHRcdFx0XHRcdFx0Y2xvbmVba2V5XSA9IF8udXRpbC5jbG9uZShvW2tleV0pO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdFx0cmV0dXJuIGNsb25lO1xyXG5cclxuXHRcdFx0XHRjYXNlICdBcnJheSc6XHJcblx0XHRcdFx0XHRyZXR1cm4gby5tYXAoZnVuY3Rpb24odikgeyByZXR1cm4gXy51dGlsLmNsb25lKHYpOyB9KTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0cmV0dXJuIG87XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0bGFuZ3VhZ2VzOiB7XHJcblx0XHRleHRlbmQ6IGZ1bmN0aW9uIChpZCwgcmVkZWYpIHtcclxuXHRcdFx0dmFyIGxhbmcgPSBfLnV0aWwuY2xvbmUoXy5sYW5ndWFnZXNbaWRdKTtcclxuXHJcblx0XHRcdGZvciAodmFyIGtleSBpbiByZWRlZikge1xyXG5cdFx0XHRcdGxhbmdba2V5XSA9IHJlZGVmW2tleV07XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdHJldHVybiBsYW5nO1xyXG5cdFx0fSxcclxuXHJcblx0XHQvKipcclxuXHRcdCAqIEluc2VydCBhIHRva2VuIGJlZm9yZSBhbm90aGVyIHRva2VuIGluIGEgbGFuZ3VhZ2UgbGl0ZXJhbFxyXG5cdFx0ICogQXMgdGhpcyBuZWVkcyB0byByZWNyZWF0ZSB0aGUgb2JqZWN0ICh3ZSBjYW5ub3QgYWN0dWFsbHkgaW5zZXJ0IGJlZm9yZSBrZXlzIGluIG9iamVjdCBsaXRlcmFscyksXHJcblx0XHQgKiB3ZSBjYW5ub3QganVzdCBwcm92aWRlIGFuIG9iamVjdCwgd2UgbmVlZCBhbm9iamVjdCBhbmQgYSBrZXkuXHJcblx0XHQgKiBAcGFyYW0gaW5zaWRlIFRoZSBrZXkgKG9yIGxhbmd1YWdlIGlkKSBvZiB0aGUgcGFyZW50XHJcblx0XHQgKiBAcGFyYW0gYmVmb3JlIFRoZSBrZXkgdG8gaW5zZXJ0IGJlZm9yZS4gSWYgbm90IHByb3ZpZGVkLCB0aGUgZnVuY3Rpb24gYXBwZW5kcyBpbnN0ZWFkLlxyXG5cdFx0ICogQHBhcmFtIGluc2VydCBPYmplY3Qgd2l0aCB0aGUga2V5L3ZhbHVlIHBhaXJzIHRvIGluc2VydFxyXG5cdFx0ICogQHBhcmFtIHJvb3QgVGhlIG9iamVjdCB0aGF0IGNvbnRhaW5zIGBpbnNpZGVgLiBJZiBlcXVhbCB0byBQcmlzbS5sYW5ndWFnZXMsIGl0IGNhbiBiZSBvbWl0dGVkLlxyXG5cdFx0ICovXHJcblx0XHRpbnNlcnRCZWZvcmU6IGZ1bmN0aW9uIChpbnNpZGUsIGJlZm9yZSwgaW5zZXJ0LCByb290KSB7XHJcblx0XHRcdHJvb3QgPSByb290IHx8IF8ubGFuZ3VhZ2VzO1xyXG5cdFx0XHR2YXIgZ3JhbW1hciA9IHJvb3RbaW5zaWRlXTtcclxuXHRcdFx0XHJcblx0XHRcdGlmIChhcmd1bWVudHMubGVuZ3RoID09IDIpIHtcclxuXHRcdFx0XHRpbnNlcnQgPSBhcmd1bWVudHNbMV07XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0Zm9yICh2YXIgbmV3VG9rZW4gaW4gaW5zZXJ0KSB7XHJcblx0XHRcdFx0XHRpZiAoaW5zZXJ0Lmhhc093blByb3BlcnR5KG5ld1Rva2VuKSkge1xyXG5cdFx0XHRcdFx0XHRncmFtbWFyW25ld1Rva2VuXSA9IGluc2VydFtuZXdUb2tlbl07XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdHJldHVybiBncmFtbWFyO1xyXG5cdFx0XHR9XHJcblx0XHRcdFxyXG5cdFx0XHR2YXIgcmV0ID0ge307XHJcblxyXG5cdFx0XHRmb3IgKHZhciB0b2tlbiBpbiBncmFtbWFyKSB7XHJcblxyXG5cdFx0XHRcdGlmIChncmFtbWFyLmhhc093blByb3BlcnR5KHRva2VuKSkge1xyXG5cclxuXHRcdFx0XHRcdGlmICh0b2tlbiA9PSBiZWZvcmUpIHtcclxuXHJcblx0XHRcdFx0XHRcdGZvciAodmFyIG5ld1Rva2VuIGluIGluc2VydCkge1xyXG5cclxuXHRcdFx0XHRcdFx0XHRpZiAoaW5zZXJ0Lmhhc093blByb3BlcnR5KG5ld1Rva2VuKSkge1xyXG5cdFx0XHRcdFx0XHRcdFx0cmV0W25ld1Rva2VuXSA9IGluc2VydFtuZXdUb2tlbl07XHJcblx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdFx0cmV0W3Rva2VuXSA9IGdyYW1tYXJbdG9rZW5dO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0XHRcclxuXHRcdFx0Ly8gVXBkYXRlIHJlZmVyZW5jZXMgaW4gb3RoZXIgbGFuZ3VhZ2UgZGVmaW5pdGlvbnNcclxuXHRcdFx0Xy5sYW5ndWFnZXMuREZTKF8ubGFuZ3VhZ2VzLCBmdW5jdGlvbihrZXksIHZhbHVlKSB7XHJcblx0XHRcdFx0aWYgKHZhbHVlID09PSByb290W2luc2lkZV0gJiYga2V5ICE9IGluc2lkZSkge1xyXG5cdFx0XHRcdFx0dGhpc1trZXldID0gcmV0O1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSk7XHJcblxyXG5cdFx0XHRyZXR1cm4gcm9vdFtpbnNpZGVdID0gcmV0O1xyXG5cdFx0fSxcclxuXHJcblx0XHQvLyBUcmF2ZXJzZSBhIGxhbmd1YWdlIGRlZmluaXRpb24gd2l0aCBEZXB0aCBGaXJzdCBTZWFyY2hcclxuXHRcdERGUzogZnVuY3Rpb24obywgY2FsbGJhY2ssIHR5cGUpIHtcclxuXHRcdFx0Zm9yICh2YXIgaSBpbiBvKSB7XHJcblx0XHRcdFx0aWYgKG8uaGFzT3duUHJvcGVydHkoaSkpIHtcclxuXHRcdFx0XHRcdGNhbGxiYWNrLmNhbGwobywgaSwgb1tpXSwgdHlwZSB8fCBpKTtcclxuXHJcblx0XHRcdFx0XHRpZiAoXy51dGlsLnR5cGUob1tpXSkgPT09ICdPYmplY3QnKSB7XHJcblx0XHRcdFx0XHRcdF8ubGFuZ3VhZ2VzLkRGUyhvW2ldLCBjYWxsYmFjayk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRlbHNlIGlmIChfLnV0aWwudHlwZShvW2ldKSA9PT0gJ0FycmF5Jykge1xyXG5cdFx0XHRcdFx0XHRfLmxhbmd1YWdlcy5ERlMob1tpXSwgY2FsbGJhY2ssIGkpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGhpZ2hsaWdodEFsbDogZnVuY3Rpb24oYXN5bmMsIGNhbGxiYWNrKSB7XHJcblx0XHR2YXIgZWxlbWVudHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdjb2RlW2NsYXNzKj1cImxhbmd1YWdlLVwiXSwgW2NsYXNzKj1cImxhbmd1YWdlLVwiXSBjb2RlLCBjb2RlW2NsYXNzKj1cImxhbmctXCJdLCBbY2xhc3MqPVwibGFuZy1cIl0gY29kZScpO1xyXG5cclxuXHRcdGZvciAodmFyIGk9MCwgZWxlbWVudDsgZWxlbWVudCA9IGVsZW1lbnRzW2krK107KSB7XHJcblx0XHRcdF8uaGlnaGxpZ2h0RWxlbWVudChlbGVtZW50LCBhc3luYyA9PT0gdHJ1ZSwgY2FsbGJhY2spO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGhpZ2hsaWdodEVsZW1lbnQ6IGZ1bmN0aW9uKGVsZW1lbnQsIGFzeW5jLCBjYWxsYmFjaykge1xyXG5cdFx0Ly8gRmluZCBsYW5ndWFnZVxyXG5cdFx0dmFyIGxhbmd1YWdlLCBncmFtbWFyLCBwYXJlbnQgPSBlbGVtZW50O1xyXG5cclxuXHRcdHdoaWxlIChwYXJlbnQgJiYgIWxhbmcudGVzdChwYXJlbnQuY2xhc3NOYW1lKSkge1xyXG5cdFx0XHRwYXJlbnQgPSBwYXJlbnQucGFyZW50Tm9kZTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAocGFyZW50KSB7XHJcblx0XHRcdGxhbmd1YWdlID0gKHBhcmVudC5jbGFzc05hbWUubWF0Y2gobGFuZykgfHwgWywnJ10pWzFdO1xyXG5cdFx0XHRncmFtbWFyID0gXy5sYW5ndWFnZXNbbGFuZ3VhZ2VdO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmICghZ3JhbW1hcikge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gU2V0IGxhbmd1YWdlIG9uIHRoZSBlbGVtZW50LCBpZiBub3QgcHJlc2VudFxyXG5cdFx0ZWxlbWVudC5jbGFzc05hbWUgPSBlbGVtZW50LmNsYXNzTmFtZS5yZXBsYWNlKGxhbmcsICcnKS5yZXBsYWNlKC9cXHMrL2csICcgJykgKyAnIGxhbmd1YWdlLScgKyBsYW5ndWFnZTtcclxuXHJcblx0XHQvLyBTZXQgbGFuZ3VhZ2Ugb24gdGhlIHBhcmVudCwgZm9yIHN0eWxpbmdcclxuXHRcdHBhcmVudCA9IGVsZW1lbnQucGFyZW50Tm9kZTtcclxuXHJcblx0XHRpZiAoL3ByZS9pLnRlc3QocGFyZW50Lm5vZGVOYW1lKSkge1xyXG5cdFx0XHRwYXJlbnQuY2xhc3NOYW1lID0gcGFyZW50LmNsYXNzTmFtZS5yZXBsYWNlKGxhbmcsICcnKS5yZXBsYWNlKC9cXHMrL2csICcgJykgKyAnIGxhbmd1YWdlLScgKyBsYW5ndWFnZTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgY29kZSA9IGVsZW1lbnQudGV4dENvbnRlbnQ7XHJcblxyXG5cdFx0aWYoIWNvZGUpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdGNvZGUgPSBjb2RlLnJlcGxhY2UoL14oPzpcXHI/XFxufFxccikvLCcnKTtcclxuXHJcblx0XHR2YXIgZW52ID0ge1xyXG5cdFx0XHRlbGVtZW50OiBlbGVtZW50LFxyXG5cdFx0XHRsYW5ndWFnZTogbGFuZ3VhZ2UsXHJcblx0XHRcdGdyYW1tYXI6IGdyYW1tYXIsXHJcblx0XHRcdGNvZGU6IGNvZGVcclxuXHRcdH07XHJcblxyXG5cdFx0Xy5ob29rcy5ydW4oJ2JlZm9yZS1oaWdobGlnaHQnLCBlbnYpO1xyXG5cclxuXHRcdGlmIChhc3luYyAmJiBzZWxmLldvcmtlcikge1xyXG5cdFx0XHR2YXIgd29ya2VyID0gbmV3IFdvcmtlcihfLmZpbGVuYW1lKTtcclxuXHJcblx0XHRcdHdvcmtlci5vbm1lc3NhZ2UgPSBmdW5jdGlvbihldnQpIHtcclxuXHRcdFx0XHRlbnYuaGlnaGxpZ2h0ZWRDb2RlID0gVG9rZW4uc3RyaW5naWZ5KEpTT04ucGFyc2UoZXZ0LmRhdGEpLCBsYW5ndWFnZSk7XHJcblxyXG5cdFx0XHRcdF8uaG9va3MucnVuKCdiZWZvcmUtaW5zZXJ0JywgZW52KTtcclxuXHJcblx0XHRcdFx0ZW52LmVsZW1lbnQuaW5uZXJIVE1MID0gZW52LmhpZ2hsaWdodGVkQ29kZTtcclxuXHJcblx0XHRcdFx0Y2FsbGJhY2sgJiYgY2FsbGJhY2suY2FsbChlbnYuZWxlbWVudCk7XHJcblx0XHRcdFx0Xy5ob29rcy5ydW4oJ2FmdGVyLWhpZ2hsaWdodCcsIGVudik7XHJcblx0XHRcdH07XHJcblxyXG5cdFx0XHR3b3JrZXIucG9zdE1lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoe1xyXG5cdFx0XHRcdGxhbmd1YWdlOiBlbnYubGFuZ3VhZ2UsXHJcblx0XHRcdFx0Y29kZTogZW52LmNvZGVcclxuXHRcdFx0fSkpO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdGVudi5oaWdobGlnaHRlZENvZGUgPSBfLmhpZ2hsaWdodChlbnYuY29kZSwgZW52LmdyYW1tYXIsIGVudi5sYW5ndWFnZSk7XHJcblxyXG5cdFx0XHRfLmhvb2tzLnJ1bignYmVmb3JlLWluc2VydCcsIGVudik7XHJcblxyXG5cdFx0XHRlbnYuZWxlbWVudC5pbm5lckhUTUwgPSBlbnYuaGlnaGxpZ2h0ZWRDb2RlO1xyXG5cclxuXHRcdFx0Y2FsbGJhY2sgJiYgY2FsbGJhY2suY2FsbChlbGVtZW50KTtcclxuXHJcblx0XHRcdF8uaG9va3MucnVuKCdhZnRlci1oaWdobGlnaHQnLCBlbnYpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGhpZ2hsaWdodDogZnVuY3Rpb24gKHRleHQsIGdyYW1tYXIsIGxhbmd1YWdlKSB7XHJcblx0XHR2YXIgdG9rZW5zID0gXy50b2tlbml6ZSh0ZXh0LCBncmFtbWFyKTtcclxuXHRcdHJldHVybiBUb2tlbi5zdHJpbmdpZnkoXy51dGlsLmVuY29kZSh0b2tlbnMpLCBsYW5ndWFnZSk7XHJcblx0fSxcclxuXHJcblx0dG9rZW5pemU6IGZ1bmN0aW9uKHRleHQsIGdyYW1tYXIsIGxhbmd1YWdlKSB7XHJcblx0XHR2YXIgVG9rZW4gPSBfLlRva2VuO1xyXG5cclxuXHRcdHZhciBzdHJhcnIgPSBbdGV4dF07XHJcblxyXG5cdFx0dmFyIHJlc3QgPSBncmFtbWFyLnJlc3Q7XHJcblxyXG5cdFx0aWYgKHJlc3QpIHtcclxuXHRcdFx0Zm9yICh2YXIgdG9rZW4gaW4gcmVzdCkge1xyXG5cdFx0XHRcdGdyYW1tYXJbdG9rZW5dID0gcmVzdFt0b2tlbl07XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGRlbGV0ZSBncmFtbWFyLnJlc3Q7XHJcblx0XHR9XHJcblxyXG5cdFx0dG9rZW5sb29wOiBmb3IgKHZhciB0b2tlbiBpbiBncmFtbWFyKSB7XHJcblx0XHRcdGlmKCFncmFtbWFyLmhhc093blByb3BlcnR5KHRva2VuKSB8fCAhZ3JhbW1hclt0b2tlbl0pIHtcclxuXHRcdFx0XHRjb250aW51ZTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0dmFyIHBhdHRlcm5zID0gZ3JhbW1hclt0b2tlbl07XHJcblx0XHRcdHBhdHRlcm5zID0gKF8udXRpbC50eXBlKHBhdHRlcm5zKSA9PT0gXCJBcnJheVwiKSA/IHBhdHRlcm5zIDogW3BhdHRlcm5zXTtcclxuXHJcblx0XHRcdGZvciAodmFyIGogPSAwOyBqIDwgcGF0dGVybnMubGVuZ3RoOyArK2opIHtcclxuXHRcdFx0XHR2YXIgcGF0dGVybiA9IHBhdHRlcm5zW2pdLFxyXG5cdFx0XHRcdFx0aW5zaWRlID0gcGF0dGVybi5pbnNpZGUsXHJcblx0XHRcdFx0XHRsb29rYmVoaW5kID0gISFwYXR0ZXJuLmxvb2tiZWhpbmQsXHJcblx0XHRcdFx0XHRsb29rYmVoaW5kTGVuZ3RoID0gMCxcclxuXHRcdFx0XHRcdGFsaWFzID0gcGF0dGVybi5hbGlhcztcclxuXHJcblx0XHRcdFx0cGF0dGVybiA9IHBhdHRlcm4ucGF0dGVybiB8fCBwYXR0ZXJuO1xyXG5cclxuXHRcdFx0XHRmb3IgKHZhciBpPTA7IGk8c3RyYXJyLmxlbmd0aDsgaSsrKSB7IC8vIERvbuKAmXQgY2FjaGUgbGVuZ3RoIGFzIGl0IGNoYW5nZXMgZHVyaW5nIHRoZSBsb29wXHJcblxyXG5cdFx0XHRcdFx0dmFyIHN0ciA9IHN0cmFycltpXTtcclxuXHJcblx0XHRcdFx0XHRpZiAoc3RyYXJyLmxlbmd0aCA+IHRleHQubGVuZ3RoKSB7XHJcblx0XHRcdFx0XHRcdC8vIFNvbWV0aGluZyB3ZW50IHRlcnJpYmx5IHdyb25nLCBBQk9SVCwgQUJPUlQhXHJcblx0XHRcdFx0XHRcdGJyZWFrIHRva2VubG9vcDtcclxuXHRcdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0XHRpZiAoc3RyIGluc3RhbmNlb2YgVG9rZW4pIHtcclxuXHRcdFx0XHRcdFx0Y29udGludWU7XHJcblx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdFx0cGF0dGVybi5sYXN0SW5kZXggPSAwO1xyXG5cclxuXHRcdFx0XHRcdHZhciBtYXRjaCA9IHBhdHRlcm4uZXhlYyhzdHIpO1xyXG5cclxuXHRcdFx0XHRcdGlmIChtYXRjaCkge1xyXG5cdFx0XHRcdFx0XHRpZihsb29rYmVoaW5kKSB7XHJcblx0XHRcdFx0XHRcdFx0bG9va2JlaGluZExlbmd0aCA9IG1hdGNoWzFdLmxlbmd0aDtcclxuXHRcdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRcdFx0dmFyIGZyb20gPSBtYXRjaC5pbmRleCAtIDEgKyBsb29rYmVoaW5kTGVuZ3RoLFxyXG5cdFx0XHRcdFx0XHRcdG1hdGNoID0gbWF0Y2hbMF0uc2xpY2UobG9va2JlaGluZExlbmd0aCksXHJcblx0XHRcdFx0XHRcdFx0bGVuID0gbWF0Y2gubGVuZ3RoLFxyXG5cdFx0XHRcdFx0XHRcdHRvID0gZnJvbSArIGxlbixcclxuXHRcdFx0XHRcdFx0XHRiZWZvcmUgPSBzdHIuc2xpY2UoMCwgZnJvbSArIDEpLFxyXG5cdFx0XHRcdFx0XHRcdGFmdGVyID0gc3RyLnNsaWNlKHRvICsgMSk7XHJcblxyXG5cdFx0XHRcdFx0XHR2YXIgYXJncyA9IFtpLCAxXTtcclxuXHJcblx0XHRcdFx0XHRcdGlmIChiZWZvcmUpIHtcclxuXHRcdFx0XHRcdFx0XHRhcmdzLnB1c2goYmVmb3JlKTtcclxuXHRcdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRcdFx0dmFyIHdyYXBwZWQgPSBuZXcgVG9rZW4odG9rZW4sIGluc2lkZT8gXy50b2tlbml6ZShtYXRjaCwgaW5zaWRlKSA6IG1hdGNoLCBhbGlhcyk7XHJcblxyXG5cdFx0XHRcdFx0XHRhcmdzLnB1c2god3JhcHBlZCk7XHJcblxyXG5cdFx0XHRcdFx0XHRpZiAoYWZ0ZXIpIHtcclxuXHRcdFx0XHRcdFx0XHRhcmdzLnB1c2goYWZ0ZXIpO1xyXG5cdFx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdFx0XHRBcnJheS5wcm90b3R5cGUuc3BsaWNlLmFwcGx5KHN0cmFyciwgYXJncyk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHN0cmFycjtcclxuXHR9LFxyXG5cclxuXHRob29rczoge1xyXG5cdFx0YWxsOiB7fSxcclxuXHJcblx0XHRhZGQ6IGZ1bmN0aW9uIChuYW1lLCBjYWxsYmFjaykge1xyXG5cdFx0XHR2YXIgaG9va3MgPSBfLmhvb2tzLmFsbDtcclxuXHJcblx0XHRcdGhvb2tzW25hbWVdID0gaG9va3NbbmFtZV0gfHwgW107XHJcblxyXG5cdFx0XHRob29rc1tuYW1lXS5wdXNoKGNhbGxiYWNrKTtcclxuXHRcdH0sXHJcblxyXG5cdFx0cnVuOiBmdW5jdGlvbiAobmFtZSwgZW52KSB7XHJcblx0XHRcdHZhciBjYWxsYmFja3MgPSBfLmhvb2tzLmFsbFtuYW1lXTtcclxuXHJcblx0XHRcdGlmICghY2FsbGJhY2tzIHx8ICFjYWxsYmFja3MubGVuZ3RoKSB7XHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRmb3IgKHZhciBpPTAsIGNhbGxiYWNrOyBjYWxsYmFjayA9IGNhbGxiYWNrc1tpKytdOykge1xyXG5cdFx0XHRcdGNhbGxiYWNrKGVudik7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9XHJcbn07XHJcblxyXG52YXIgVG9rZW4gPSBfLlRva2VuID0gZnVuY3Rpb24odHlwZSwgY29udGVudCwgYWxpYXMpIHtcclxuXHR0aGlzLnR5cGUgPSB0eXBlO1xyXG5cdHRoaXMuY29udGVudCA9IGNvbnRlbnQ7XHJcblx0dGhpcy5hbGlhcyA9IGFsaWFzO1xyXG59O1xyXG5cclxuVG9rZW4uc3RyaW5naWZ5ID0gZnVuY3Rpb24obywgbGFuZ3VhZ2UsIHBhcmVudCkge1xyXG5cdGlmICh0eXBlb2YgbyA9PSAnc3RyaW5nJykge1xyXG5cdFx0cmV0dXJuIG87XHJcblx0fVxyXG5cclxuXHRpZiAoXy51dGlsLnR5cGUobykgPT09ICdBcnJheScpIHtcclxuXHRcdHJldHVybiBvLm1hcChmdW5jdGlvbihlbGVtZW50KSB7XHJcblx0XHRcdHJldHVybiBUb2tlbi5zdHJpbmdpZnkoZWxlbWVudCwgbGFuZ3VhZ2UsIG8pO1xyXG5cdFx0fSkuam9pbignJyk7XHJcblx0fVxyXG5cclxuXHR2YXIgZW52ID0ge1xyXG5cdFx0dHlwZTogby50eXBlLFxyXG5cdFx0Y29udGVudDogVG9rZW4uc3RyaW5naWZ5KG8uY29udGVudCwgbGFuZ3VhZ2UsIHBhcmVudCksXHJcblx0XHR0YWc6ICdzcGFuJyxcclxuXHRcdGNsYXNzZXM6IFsndG9rZW4nLCBvLnR5cGVdLFxyXG5cdFx0YXR0cmlidXRlczoge30sXHJcblx0XHRsYW5ndWFnZTogbGFuZ3VhZ2UsXHJcblx0XHRwYXJlbnQ6IHBhcmVudFxyXG5cdH07XHJcblxyXG5cdGlmIChlbnYudHlwZSA9PSAnY29tbWVudCcpIHtcclxuXHRcdGVudi5hdHRyaWJ1dGVzWydzcGVsbGNoZWNrJ10gPSAndHJ1ZSc7XHJcblx0fVxyXG5cclxuXHRpZiAoby5hbGlhcykge1xyXG5cdFx0dmFyIGFsaWFzZXMgPSBfLnV0aWwudHlwZShvLmFsaWFzKSA9PT0gJ0FycmF5JyA/IG8uYWxpYXMgOiBbby5hbGlhc107XHJcblx0XHRBcnJheS5wcm90b3R5cGUucHVzaC5hcHBseShlbnYuY2xhc3NlcywgYWxpYXNlcyk7XHJcblx0fVxyXG5cclxuXHRfLmhvb2tzLnJ1bignd3JhcCcsIGVudik7XHJcblxyXG5cdHZhciBhdHRyaWJ1dGVzID0gJyc7XHJcblxyXG5cdGZvciAodmFyIG5hbWUgaW4gZW52LmF0dHJpYnV0ZXMpIHtcclxuXHRcdGF0dHJpYnV0ZXMgKz0gbmFtZSArICc9XCInICsgKGVudi5hdHRyaWJ1dGVzW25hbWVdIHx8ICcnKSArICdcIic7XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gJzwnICsgZW52LnRhZyArICcgY2xhc3M9XCInICsgZW52LmNsYXNzZXMuam9pbignICcpICsgJ1wiICcgKyBhdHRyaWJ1dGVzICsgJz4nICsgZW52LmNvbnRlbnQgKyAnPC8nICsgZW52LnRhZyArICc+JztcclxuXHJcbn07XHJcblxyXG5pZiAoIXNlbGYuZG9jdW1lbnQpIHtcclxuXHRpZiAoIXNlbGYuYWRkRXZlbnRMaXN0ZW5lcikge1xyXG5cdFx0Ly8gaW4gTm9kZS5qc1xyXG5cdFx0cmV0dXJuIHNlbGYuUHJpc207XHJcblx0fVxyXG4gXHQvLyBJbiB3b3JrZXJcclxuXHRzZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbihldnQpIHtcclxuXHRcdHZhciBtZXNzYWdlID0gSlNPTi5wYXJzZShldnQuZGF0YSksXHJcblx0XHQgICAgbGFuZyA9IG1lc3NhZ2UubGFuZ3VhZ2UsXHJcblx0XHQgICAgY29kZSA9IG1lc3NhZ2UuY29kZTtcclxuXHJcblx0XHRzZWxmLnBvc3RNZXNzYWdlKEpTT04uc3RyaW5naWZ5KF8udXRpbC5lbmNvZGUoXy50b2tlbml6ZShjb2RlLCBfLmxhbmd1YWdlc1tsYW5nXSkpKSk7XHJcblx0XHRzZWxmLmNsb3NlKCk7XHJcblx0fSwgZmFsc2UpO1xyXG5cclxuXHRyZXR1cm4gc2VsZi5QcmlzbTtcclxufVxyXG5cclxuLy8gR2V0IGN1cnJlbnQgc2NyaXB0IGFuZCBoaWdobGlnaHRcclxudmFyIHNjcmlwdCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKTtcclxuXHJcbnNjcmlwdCA9IHNjcmlwdFtzY3JpcHQubGVuZ3RoIC0gMV07XHJcblxyXG5pZiAoc2NyaXB0KSB7XHJcblx0Xy5maWxlbmFtZSA9IHNjcmlwdC5zcmM7XHJcblxyXG5cdGlmIChkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyICYmICFzY3JpcHQuaGFzQXR0cmlidXRlKCdkYXRhLW1hbnVhbCcpKSB7XHJcblx0XHRkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgXy5oaWdobGlnaHRBbGwpO1xyXG5cdH1cclxufVxyXG5cclxucmV0dXJuIHNlbGYuUHJpc207XHJcblxyXG59KSgpO1xyXG5cclxuaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKSB7XHJcblx0bW9kdWxlLmV4cG9ydHMgPSBQcmlzbTtcclxufVxyXG5cclxuXHJcbi8qICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICAgICBCZWdpbiBwcmlzbS1tYXJrdXAuanNcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG5cclxuUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cCA9IHtcclxuXHQnY29tbWVudCc6IC88IS0tW1xcd1xcV10qPy0tPi8sXHJcblx0J3Byb2xvZyc6IC88XFw/Lis/XFw/Pi8sXHJcblx0J2RvY3R5cGUnOiAvPCFET0NUWVBFLis/Pi8sXHJcblx0J2NkYXRhJzogLzwhXFxbQ0RBVEFcXFtbXFx3XFxXXSo/XV0+L2ksXHJcblx0J3RhZyc6IHtcclxuXHRcdHBhdHRlcm46IC88XFwvP1tcXHc6LV0rXFxzKig/OlxccytbXFx3Oi1dKyg/Oj0oPzooXCJ8JykoXFxcXD9bXFx3XFxXXSkqP1xcMXxbXlxccydcIj49XSspKT9cXHMqKSpcXC8/Pi9pLFxyXG5cdFx0aW5zaWRlOiB7XHJcblx0XHRcdCd0YWcnOiB7XHJcblx0XHRcdFx0cGF0dGVybjogL148XFwvP1tcXHc6LV0rL2ksXHJcblx0XHRcdFx0aW5zaWRlOiB7XHJcblx0XHRcdFx0XHQncHVuY3R1YXRpb24nOiAvXjxcXC8/LyxcclxuXHRcdFx0XHRcdCduYW1lc3BhY2UnOiAvXltcXHctXSs/Oi9cclxuXHRcdFx0XHR9XHJcblx0XHRcdH0sXHJcblx0XHRcdCdhdHRyLXZhbHVlJzoge1xyXG5cdFx0XHRcdHBhdHRlcm46IC89KD86KCd8XCIpW1xcd1xcV10qPyhcXDEpfFteXFxzPl0rKS9pLFxyXG5cdFx0XHRcdGluc2lkZToge1xyXG5cdFx0XHRcdFx0J3B1bmN0dWF0aW9uJzogLz18PnxcIi9cclxuXHRcdFx0XHR9XHJcblx0XHRcdH0sXHJcblx0XHRcdCdwdW5jdHVhdGlvbic6IC9cXC8/Pi8sXHJcblx0XHRcdCdhdHRyLW5hbWUnOiB7XHJcblx0XHRcdFx0cGF0dGVybjogL1tcXHc6LV0rLyxcclxuXHRcdFx0XHRpbnNpZGU6IHtcclxuXHRcdFx0XHRcdCduYW1lc3BhY2UnOiAvXltcXHctXSs/Oi9cclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHJcblx0XHR9XHJcblx0fSxcclxuXHQnZW50aXR5JzogLyYjP1tcXGRhLXpdezEsOH07L2lcclxufTtcclxuXHJcbi8vIFBsdWdpbiB0byBtYWtlIGVudGl0eSB0aXRsZSBzaG93IHRoZSByZWFsIGVudGl0eSwgaWRlYSBieSBSb21hbiBLb21hcm92XHJcblByaXNtLmhvb2tzLmFkZCgnd3JhcCcsIGZ1bmN0aW9uKGVudikge1xyXG5cclxuXHRpZiAoZW52LnR5cGUgPT09ICdlbnRpdHknKSB7XHJcblx0XHRlbnYuYXR0cmlidXRlc1sndGl0bGUnXSA9IGVudi5jb250ZW50LnJlcGxhY2UoLyZhbXA7LywgJyYnKTtcclxuXHR9XHJcbn0pO1xyXG5cclxuXHJcbi8qICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICAgICBCZWdpbiBwcmlzbS1jc3MuanNcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG5cclxuUHJpc20ubGFuZ3VhZ2VzLmNzcyA9IHtcclxuXHQnY29tbWVudCc6IC9cXC9cXCpbXFx3XFxXXSo/XFwqXFwvLyxcclxuXHQnYXRydWxlJzoge1xyXG5cdFx0cGF0dGVybjogL0BbXFx3LV0rPy4qPyg7fCg/PVxccypcXHspKS9pLFxyXG5cdFx0aW5zaWRlOiB7XHJcblx0XHRcdCdwdW5jdHVhdGlvbic6IC9bOzpdL1xyXG5cdFx0fVxyXG5cdH0sXHJcblx0J3VybCc6IC91cmxcXCgoPzooW1wiJ10pKFxcXFxcXG58XFxcXD8uKSo/XFwxfC4qPylcXCkvaSxcclxuXHQnc2VsZWN0b3InOiAvW15cXHtcXH1cXHNdW15cXHtcXH07XSooPz1cXHMqXFx7KS8sXHJcblx0J3N0cmluZyc6IC8oXCJ8JykoXFxcXFxcbnxcXFxcPy4pKj9cXDEvLFxyXG5cdCdwcm9wZXJ0eSc6IC8oXFxifFxcQilbXFx3LV0rKD89XFxzKjopL2ksXHJcblx0J2ltcG9ydGFudCc6IC9cXEIhaW1wb3J0YW50XFxiL2ksXHJcblx0J3B1bmN0dWF0aW9uJzogL1tcXHtcXH07Ol0vLFxyXG5cdCdmdW5jdGlvbic6IC9bLWEtejAtOV0rKD89XFwoKS9pXHJcbn07XHJcblxyXG5pZiAoUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cCkge1xyXG5cdFByaXNtLmxhbmd1YWdlcy5pbnNlcnRCZWZvcmUoJ21hcmt1cCcsICd0YWcnLCB7XHJcblx0XHQnc3R5bGUnOiB7XHJcblx0XHRcdHBhdHRlcm46IC88c3R5bGVbXFx3XFxXXSo/PltcXHdcXFddKj88XFwvc3R5bGU+L2ksXHJcblx0XHRcdGluc2lkZToge1xyXG5cdFx0XHRcdCd0YWcnOiB7XHJcblx0XHRcdFx0XHRwYXR0ZXJuOiAvPHN0eWxlW1xcd1xcV10qPz58PFxcL3N0eWxlPi9pLFxyXG5cdFx0XHRcdFx0aW5zaWRlOiBQcmlzbS5sYW5ndWFnZXMubWFya3VwLnRhZy5pbnNpZGVcclxuXHRcdFx0XHR9LFxyXG5cdFx0XHRcdHJlc3Q6IFByaXNtLmxhbmd1YWdlcy5jc3NcclxuXHRcdFx0fSxcclxuXHRcdFx0YWxpYXM6ICdsYW5ndWFnZS1jc3MnXHJcblx0XHR9XHJcblx0fSk7XHJcblx0XHJcblx0UHJpc20ubGFuZ3VhZ2VzLmluc2VydEJlZm9yZSgnaW5zaWRlJywgJ2F0dHItdmFsdWUnLCB7XHJcblx0XHQnc3R5bGUtYXR0cic6IHtcclxuXHRcdFx0cGF0dGVybjogL1xccypzdHlsZT0oXCJ8JykuKj9cXDEvaSxcclxuXHRcdFx0aW5zaWRlOiB7XHJcblx0XHRcdFx0J2F0dHItbmFtZSc6IHtcclxuXHRcdFx0XHRcdHBhdHRlcm46IC9eXFxzKnN0eWxlL2ksXHJcblx0XHRcdFx0XHRpbnNpZGU6IFByaXNtLmxhbmd1YWdlcy5tYXJrdXAudGFnLmluc2lkZVxyXG5cdFx0XHRcdH0sXHJcblx0XHRcdFx0J3B1bmN0dWF0aW9uJzogL15cXHMqPVxccypbJ1wiXXxbJ1wiXVxccyokLyxcclxuXHRcdFx0XHQnYXR0ci12YWx1ZSc6IHtcclxuXHRcdFx0XHRcdHBhdHRlcm46IC8uKy9pLFxyXG5cdFx0XHRcdFx0aW5zaWRlOiBQcmlzbS5sYW5ndWFnZXMuY3NzXHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9LFxyXG5cdFx0XHRhbGlhczogJ2xhbmd1YWdlLWNzcydcclxuXHRcdH1cclxuXHR9LCBQcmlzbS5sYW5ndWFnZXMubWFya3VwLnRhZyk7XHJcbn1cclxuXHJcbi8qICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICAgICBCZWdpbiBwcmlzbS1jbGlrZS5qc1xyXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqICovXHJcblxyXG5QcmlzbS5sYW5ndWFnZXMuY2xpa2UgPSB7XHJcblx0J2NvbW1lbnQnOiBbXHJcblx0XHR7XHJcblx0XHRcdHBhdHRlcm46IC8oXnxbXlxcXFxdKVxcL1xcKltcXHdcXFddKj9cXCpcXC8vLFxyXG5cdFx0XHRsb29rYmVoaW5kOiB0cnVlXHJcblx0XHR9LFxyXG5cdFx0e1xyXG5cdFx0XHRwYXR0ZXJuOiAvKF58W15cXFxcOl0pXFwvXFwvLisvLFxyXG5cdFx0XHRsb29rYmVoaW5kOiB0cnVlXHJcblx0XHR9XHJcblx0XSxcclxuXHQnc3RyaW5nJzogLyhcInwnKShcXFxcXFxufFxcXFw/LikqP1xcMS8sXHJcblx0J2NsYXNzLW5hbWUnOiB7XHJcblx0XHRwYXR0ZXJuOiAvKCg/Oig/OmNsYXNzfGludGVyZmFjZXxleHRlbmRzfGltcGxlbWVudHN8dHJhaXR8aW5zdGFuY2VvZnxuZXcpXFxzKyl8KD86Y2F0Y2hcXHMrXFwoKSlbYS16MC05X1xcLlxcXFxdKy9pLFxyXG5cdFx0bG9va2JlaGluZDogdHJ1ZSxcclxuXHRcdGluc2lkZToge1xyXG5cdFx0XHRwdW5jdHVhdGlvbjogLyhcXC58XFxcXCkvXHJcblx0XHR9XHJcblx0fSxcclxuXHQna2V5d29yZCc6IC9cXGIoaWZ8ZWxzZXx3aGlsZXxkb3xmb3J8cmV0dXJufGlufGluc3RhbmNlb2Z8ZnVuY3Rpb258bmV3fHRyeXx0aHJvd3xjYXRjaHxmaW5hbGx5fG51bGx8YnJlYWt8Y29udGludWUpXFxiLyxcclxuXHQnYm9vbGVhbic6IC9cXGIodHJ1ZXxmYWxzZSlcXGIvLFxyXG5cdCdmdW5jdGlvbic6IHtcclxuXHRcdHBhdHRlcm46IC9bYS16MC05X10rXFwoL2ksXHJcblx0XHRpbnNpZGU6IHtcclxuXHRcdFx0cHVuY3R1YXRpb246IC9cXCgvXHJcblx0XHR9XHJcblx0fSxcclxuXHQnbnVtYmVyJzogL1xcYi0/KDB4W1xcZEEtRmEtZl0rfFxcZCpcXC4/XFxkKyhbRWVdLT9cXGQrKT8pXFxiLyxcclxuXHQnb3BlcmF0b3InOiAvWy0rXXsxLDJ9fCF8PD0/fD49P3w9ezEsM318JnsxLDJ9fFxcfD9cXHx8XFw/fFxcKnxcXC98fnxcXF58JS8sXHJcblx0J2lnbm9yZSc6IC8mKGx0fGd0fGFtcCk7L2ksXHJcblx0J3B1bmN0dWF0aW9uJzogL1t7fVtcXF07KCksLjpdL1xyXG59O1xyXG5cclxuXHJcbi8qICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICAgICBCZWdpbiBwcmlzbS1qYXZhc2NyaXB0LmpzXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiogKi9cclxuXHJcblByaXNtLmxhbmd1YWdlcy5qYXZhc2NyaXB0ID0gUHJpc20ubGFuZ3VhZ2VzLmV4dGVuZCgnY2xpa2UnLCB7XHJcblx0J2tleXdvcmQnOiAvXFxiKGJyZWFrfGNhc2V8Y2F0Y2h8Y2xhc3N8Y29uc3R8Y29udGludWV8ZGVidWdnZXJ8ZGVmYXVsdHxkZWxldGV8ZG98ZWxzZXxlbnVtfGV4cG9ydHxleHRlbmRzfGZhbHNlfGZpbmFsbHl8Zm9yfGZ1bmN0aW9ufGdldHxpZnxpbXBsZW1lbnRzfGltcG9ydHxpbnxpbnN0YW5jZW9mfGludGVyZmFjZXxsZXR8bmV3fG51bGx8cGFja2FnZXxwcml2YXRlfHByb3RlY3RlZHxwdWJsaWN8cmV0dXJufHNldHxzdGF0aWN8c3VwZXJ8c3dpdGNofHRoaXN8dGhyb3d8dHJ1ZXx0cnl8dHlwZW9mfHZhcnx2b2lkfHdoaWxlfHdpdGh8eWllbGQpXFxiLyxcclxuXHQnbnVtYmVyJzogL1xcYi0/KDB4W1xcZEEtRmEtZl0rfFxcZCpcXC4/XFxkKyhbRWVdWystXT9cXGQrKT98TmFOfC0/SW5maW5pdHkpXFxiLyxcclxuXHQnZnVuY3Rpb24nOiAvKD8hXFxkKVthLXowLTlfJF0rKD89XFwoKS9pXHJcbn0pO1xyXG5cclxuUHJpc20ubGFuZ3VhZ2VzLmluc2VydEJlZm9yZSgnamF2YXNjcmlwdCcsICdrZXl3b3JkJywge1xyXG5cdCdyZWdleCc6IHtcclxuXHRcdHBhdHRlcm46IC8oXnxbXi9dKVxcLyg/IVxcLykoXFxbLis/XXxcXFxcLnxbXi9cXHJcXG5dKStcXC9bZ2ltXXswLDN9KD89XFxzKigkfFtcXHJcXG4sLjt9KV0pKS8sXHJcblx0XHRsb29rYmVoaW5kOiB0cnVlXHJcblx0fVxyXG59KTtcclxuXHJcbmlmIChQcmlzbS5sYW5ndWFnZXMubWFya3VwKSB7XHJcblx0UHJpc20ubGFuZ3VhZ2VzLmluc2VydEJlZm9yZSgnbWFya3VwJywgJ3RhZycsIHtcclxuXHRcdCdzY3JpcHQnOiB7XHJcblx0XHRcdHBhdHRlcm46IC88c2NyaXB0W1xcd1xcV10qPz5bXFx3XFxXXSo/PFxcL3NjcmlwdD4vaSxcclxuXHRcdFx0aW5zaWRlOiB7XHJcblx0XHRcdFx0J3RhZyc6IHtcclxuXHRcdFx0XHRcdHBhdHRlcm46IC88c2NyaXB0W1xcd1xcV10qPz58PFxcL3NjcmlwdD4vaSxcclxuXHRcdFx0XHRcdGluc2lkZTogUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cC50YWcuaW5zaWRlXHJcblx0XHRcdFx0fSxcclxuXHRcdFx0XHRyZXN0OiBQcmlzbS5sYW5ndWFnZXMuamF2YXNjcmlwdFxyXG5cdFx0XHR9LFxyXG5cdFx0XHRhbGlhczogJ2xhbmd1YWdlLWphdmFzY3JpcHQnXHJcblx0XHR9XHJcblx0fSk7XHJcbn1cclxuXHJcblxyXG4vKiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbiAgICAgQmVnaW4gcHJpc20tZmlsZS1oaWdobGlnaHQuanNcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG5cclxuKGZ1bmN0aW9uICgpIHtcclxuXHRpZiAoIXNlbGYuUHJpc20gfHwgIXNlbGYuZG9jdW1lbnQgfHwgIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IpIHtcclxuXHRcdHJldHVybjtcclxuXHR9XHJcblxyXG5cdHNlbGYuUHJpc20uZmlsZUhpZ2hsaWdodCA9IGZ1bmN0aW9uKCkge1xyXG5cclxuXHRcdHZhciBFeHRlbnNpb25zID0ge1xyXG5cdFx0XHQnanMnOiAnamF2YXNjcmlwdCcsXHJcblx0XHRcdCdodG1sJzogJ21hcmt1cCcsXHJcblx0XHRcdCdzdmcnOiAnbWFya3VwJyxcclxuXHRcdFx0J3htbCc6ICdtYXJrdXAnLFxyXG5cdFx0XHQncHknOiAncHl0aG9uJyxcclxuXHRcdFx0J3JiJzogJ3J1YnknLFxyXG5cdFx0XHQncHMxJzogJ3Bvd2Vyc2hlbGwnLFxyXG5cdFx0XHQncHNtMSc6ICdwb3dlcnNoZWxsJ1xyXG5cdFx0fTtcclxuXHJcblx0XHRBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdwcmVbZGF0YS1zcmNdJykpLmZvckVhY2goZnVuY3Rpb24ocHJlKSB7XHJcblx0XHRcdHZhciBzcmMgPSBwcmUuZ2V0QXR0cmlidXRlKCdkYXRhLXNyYycpO1xyXG5cdFx0XHR2YXIgZXh0ZW5zaW9uID0gKHNyYy5tYXRjaCgvXFwuKFxcdyspJC8pIHx8IFssJyddKVsxXTtcclxuXHRcdFx0dmFyIGxhbmd1YWdlID0gRXh0ZW5zaW9uc1tleHRlbnNpb25dIHx8IGV4dGVuc2lvbjtcclxuXHJcblx0XHRcdHZhciBjb2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY29kZScpO1xyXG5cdFx0XHRjb2RlLmNsYXNzTmFtZSA9ICdsYW5ndWFnZS0nICsgbGFuZ3VhZ2U7XHJcblxyXG5cdFx0XHRwcmUudGV4dENvbnRlbnQgPSAnJztcclxuXHJcblx0XHRcdGNvZGUudGV4dENvbnRlbnQgPSAnTG9hZGluZ+KApic7XHJcblxyXG5cdFx0XHRwcmUuYXBwZW5kQ2hpbGQoY29kZSk7XHJcblxyXG5cdFx0XHR2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XHJcblxyXG5cdFx0XHR4aHIub3BlbignR0VUJywgc3JjLCB0cnVlKTtcclxuXHJcblx0XHRcdHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHRpZiAoeGhyLnJlYWR5U3RhdGUgPT0gNCkge1xyXG5cclxuXHRcdFx0XHRcdGlmICh4aHIuc3RhdHVzIDwgNDAwICYmIHhoci5yZXNwb25zZVRleHQpIHtcclxuXHRcdFx0XHRcdFx0Y29kZS50ZXh0Q29udGVudCA9IHhoci5yZXNwb25zZVRleHQ7XHJcblxyXG5cdFx0XHRcdFx0XHRQcmlzbS5oaWdobGlnaHRFbGVtZW50KGNvZGUpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0ZWxzZSBpZiAoeGhyLnN0YXR1cyA+PSA0MDApIHtcclxuXHRcdFx0XHRcdFx0Y29kZS50ZXh0Q29udGVudCA9ICfinJYgRXJyb3IgJyArIHhoci5zdGF0dXMgKyAnIHdoaWxlIGZldGNoaW5nIGZpbGU6ICcgKyB4aHIuc3RhdHVzVGV4dDtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdFx0XHRjb2RlLnRleHRDb250ZW50ID0gJ+KcliBFcnJvcjogRmlsZSBkb2VzIG5vdCBleGlzdCBvciBpcyBlbXB0eSc7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9O1xyXG5cclxuXHRcdFx0eGhyLnNlbmQobnVsbCk7XHJcblx0XHR9KTtcclxuXHJcblx0fTtcclxuXHJcblx0c2VsZi5QcmlzbS5maWxlSGlnaGxpZ2h0KCk7XHJcblxyXG59KSgpO1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xyXG4gIHJldHVybiBmdW5jdGlvbihkZWNrKSB7XHJcbiAgICB2YXIgYmFja2Ryb3BzO1xyXG5cclxuICAgIGZ1bmN0aW9uIGNyZWF0ZUJhY2tkcm9wRm9yU2xpZGUoc2xpZGUpIHtcclxuICAgICAgdmFyIGJhY2tkcm9wQXR0cmlidXRlID0gc2xpZGUuZ2V0QXR0cmlidXRlKCdkYXRhLWJlc3Bva2UtYmFja2Ryb3AnKTtcclxuXHJcbiAgICAgIGlmIChiYWNrZHJvcEF0dHJpYnV0ZSkge1xyXG4gICAgICAgIHZhciBiYWNrZHJvcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIGJhY2tkcm9wLmNsYXNzTmFtZSA9IGJhY2tkcm9wQXR0cmlidXRlO1xyXG4gICAgICAgIGJhY2tkcm9wLmNsYXNzTGlzdC5hZGQoJ2Jlc3Bva2UtYmFja2Ryb3AnKTtcclxuICAgICAgICBkZWNrLnBhcmVudC5hcHBlbmRDaGlsZChiYWNrZHJvcCk7XHJcbiAgICAgICAgcmV0dXJuIGJhY2tkcm9wO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gdXBkYXRlQ2xhc3NlcyhlbCkge1xyXG4gICAgICBpZiAoZWwpIHtcclxuICAgICAgICB2YXIgaW5kZXggPSBiYWNrZHJvcHMuaW5kZXhPZihlbCksXHJcbiAgICAgICAgICBjdXJyZW50SW5kZXggPSBkZWNrLnNsaWRlKCk7XHJcblxyXG4gICAgICAgIHJlbW92ZUNsYXNzKGVsLCAnYWN0aXZlJyk7XHJcbiAgICAgICAgcmVtb3ZlQ2xhc3MoZWwsICdpbmFjdGl2ZScpO1xyXG4gICAgICAgIHJlbW92ZUNsYXNzKGVsLCAnYmVmb3JlJyk7XHJcbiAgICAgICAgcmVtb3ZlQ2xhc3MoZWwsICdhZnRlcicpO1xyXG5cclxuICAgICAgICBpZiAoaW5kZXggIT09IGN1cnJlbnRJbmRleCkge1xyXG4gICAgICAgICAgYWRkQ2xhc3MoZWwsICdpbmFjdGl2ZScpO1xyXG4gICAgICAgICAgYWRkQ2xhc3MoZWwsIGluZGV4IDwgY3VycmVudEluZGV4ID8gJ2JlZm9yZScgOiAnYWZ0ZXInKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgYWRkQ2xhc3MoZWwsICdhY3RpdmUnKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZW1vdmVDbGFzcyhlbCwgY2xhc3NOYW1lKSB7XHJcbiAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ2Jlc3Bva2UtYmFja2Ryb3AtJyArIGNsYXNzTmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gYWRkQ2xhc3MoZWwsIGNsYXNzTmFtZSkge1xyXG4gICAgICBlbC5jbGFzc0xpc3QuYWRkKCdiZXNwb2tlLWJhY2tkcm9wLScgKyBjbGFzc05hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGJhY2tkcm9wcyA9IGRlY2suc2xpZGVzXHJcbiAgICAgIC5tYXAoY3JlYXRlQmFja2Ryb3BGb3JTbGlkZSk7XHJcblxyXG4gICAgZGVjay5vbignYWN0aXZhdGUnLCBmdW5jdGlvbigpIHtcclxuICAgICAgYmFja2Ryb3BzLmZvckVhY2godXBkYXRlQ2xhc3Nlcyk7XHJcbiAgICB9KTtcclxuICB9O1xyXG59O1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xyXG4gICAgdmFyIGFjdGl2ZVNsaWRlSW5kZXgsXHJcbiAgICAgIGFjdGl2ZUJ1bGxldEluZGV4LFxyXG5cclxuICAgICAgYnVsbGV0cyA9IGRlY2suc2xpZGVzLm1hcChmdW5jdGlvbihzbGlkZSkge1xyXG4gICAgICAgIHJldHVybiBbXS5zbGljZS5jYWxsKHNsaWRlLnF1ZXJ5U2VsZWN0b3JBbGwoKHR5cGVvZiBvcHRpb25zID09PSAnc3RyaW5nJyA/IG9wdGlvbnMgOiAnW2RhdGEtYmVzcG9rZS1idWxsZXRdJykpLCAwKTtcclxuICAgICAgfSksXHJcblxyXG4gICAgICBuZXh0ID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFyIG5leHRTbGlkZUluZGV4ID0gYWN0aXZlU2xpZGVJbmRleCArIDE7XHJcblxyXG4gICAgICAgIGlmIChhY3RpdmVTbGlkZUhhc0J1bGxldEJ5T2Zmc2V0KDEpKSB7XHJcbiAgICAgICAgICBhY3RpdmF0ZUJ1bGxldChhY3RpdmVTbGlkZUluZGV4LCBhY3RpdmVCdWxsZXRJbmRleCArIDEpO1xyXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoYnVsbGV0c1tuZXh0U2xpZGVJbmRleF0pIHtcclxuICAgICAgICAgIGFjdGl2YXRlQnVsbGV0KG5leHRTbGlkZUluZGV4LCAwKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcblxyXG4gICAgICBwcmV2ID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFyIHByZXZTbGlkZUluZGV4ID0gYWN0aXZlU2xpZGVJbmRleCAtIDE7XHJcblxyXG4gICAgICAgIGlmIChhY3RpdmVTbGlkZUhhc0J1bGxldEJ5T2Zmc2V0KC0xKSkge1xyXG4gICAgICAgICAgYWN0aXZhdGVCdWxsZXQoYWN0aXZlU2xpZGVJbmRleCwgYWN0aXZlQnVsbGV0SW5kZXggLSAxKTtcclxuICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9IGVsc2UgaWYgKGJ1bGxldHNbcHJldlNsaWRlSW5kZXhdKSB7XHJcbiAgICAgICAgICBhY3RpdmF0ZUJ1bGxldChwcmV2U2xpZGVJbmRleCwgYnVsbGV0c1twcmV2U2xpZGVJbmRleF0ubGVuZ3RoIC0gMSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG5cclxuICAgICAgYWN0aXZhdGVCdWxsZXQgPSBmdW5jdGlvbihzbGlkZUluZGV4LCBidWxsZXRJbmRleCkge1xyXG4gICAgICAgIGFjdGl2ZVNsaWRlSW5kZXggPSBzbGlkZUluZGV4O1xyXG4gICAgICAgIGFjdGl2ZUJ1bGxldEluZGV4ID0gYnVsbGV0SW5kZXg7XHJcblxyXG4gICAgICAgIGJ1bGxldHMuZm9yRWFjaChmdW5jdGlvbihzbGlkZSwgcykge1xyXG4gICAgICAgICAgc2xpZGUuZm9yRWFjaChmdW5jdGlvbihidWxsZXQsIGIpIHtcclxuICAgICAgICAgICAgYnVsbGV0LmNsYXNzTGlzdC5hZGQoJ2Jlc3Bva2UtYnVsbGV0Jyk7XHJcblxyXG4gICAgICAgICAgICBpZiAocyA8IHNsaWRlSW5kZXggfHwgcyA9PT0gc2xpZGVJbmRleCAmJiBiIDw9IGJ1bGxldEluZGV4KSB7XHJcbiAgICAgICAgICAgICAgYnVsbGV0LmNsYXNzTGlzdC5hZGQoJ2Jlc3Bva2UtYnVsbGV0LWFjdGl2ZScpO1xyXG4gICAgICAgICAgICAgIGJ1bGxldC5jbGFzc0xpc3QucmVtb3ZlKCdiZXNwb2tlLWJ1bGxldC1pbmFjdGl2ZScpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIGJ1bGxldC5jbGFzc0xpc3QuYWRkKCdiZXNwb2tlLWJ1bGxldC1pbmFjdGl2ZScpO1xyXG4gICAgICAgICAgICAgIGJ1bGxldC5jbGFzc0xpc3QucmVtb3ZlKCdiZXNwb2tlLWJ1bGxldC1hY3RpdmUnKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKHMgPT09IHNsaWRlSW5kZXggJiYgYiA9PT0gYnVsbGV0SW5kZXgpIHtcclxuICAgICAgICAgICAgICBidWxsZXQuY2xhc3NMaXN0LmFkZCgnYmVzcG9rZS1idWxsZXQtY3VycmVudCcpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIGJ1bGxldC5jbGFzc0xpc3QucmVtb3ZlKCdiZXNwb2tlLWJ1bGxldC1jdXJyZW50Jyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9LFxyXG5cclxuICAgICAgYWN0aXZlU2xpZGVIYXNCdWxsZXRCeU9mZnNldCA9IGZ1bmN0aW9uKG9mZnNldCkge1xyXG4gICAgICAgIHJldHVybiBidWxsZXRzW2FjdGl2ZVNsaWRlSW5kZXhdW2FjdGl2ZUJ1bGxldEluZGV4ICsgb2Zmc2V0XSAhPT0gdW5kZWZpbmVkO1xyXG4gICAgICB9O1xyXG5cclxuICAgIGRlY2sub24oJ25leHQnLCBuZXh0KTtcclxuICAgIGRlY2sub24oJ3ByZXYnLCBwcmV2KTtcclxuXHJcbiAgICBkZWNrLm9uKCdzbGlkZScsIGZ1bmN0aW9uKGUpIHtcclxuICAgICAgYWN0aXZhdGVCdWxsZXQoZS5pbmRleCwgMCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBhY3RpdmF0ZUJ1bGxldCgwLCAwKTtcclxuICB9O1xyXG59O1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xyXG4gIHJldHVybiBmdW5jdGlvbihkZWNrKSB7XHJcbiAgICBkZWNrLnNsaWRlcy5mb3JFYWNoKGZ1bmN0aW9uKHNsaWRlKSB7XHJcbiAgICAgIHNsaWRlLmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgaWYgKC9JTlBVVHxURVhUQVJFQXxTRUxFQ1QvLnRlc3QoZS50YXJnZXQubm9kZU5hbWUpIHx8IGUudGFyZ2V0LmNvbnRlbnRFZGl0YWJsZSA9PT0gJ3RydWUnKSB7XHJcbiAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9O1xyXG59O1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xyXG4gIHJldHVybiBmdW5jdGlvbihkZWNrKSB7XHJcbiAgICB2YXIgcGFyc2VIYXNoID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgIHZhciBoYXNoID0gd2luZG93LmxvY2F0aW9uLmhhc2guc2xpY2UoMSksXHJcbiAgICAgICAgc2xpZGVOdW1iZXJPck5hbWUgPSBwYXJzZUludChoYXNoLCAxMCk7XHJcblxyXG4gICAgICBpZiAoaGFzaCkge1xyXG4gICAgICAgIGlmIChzbGlkZU51bWJlck9yTmFtZSkge1xyXG4gICAgICAgICAgYWN0aXZhdGVTbGlkZShzbGlkZU51bWJlck9yTmFtZSAtIDEpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBkZWNrLnNsaWRlcy5mb3JFYWNoKGZ1bmN0aW9uKHNsaWRlLCBpKSB7XHJcbiAgICAgICAgICAgIGlmIChzbGlkZS5nZXRBdHRyaWJ1dGUoJ2RhdGEtYmVzcG9rZS1oYXNoJykgPT09IGhhc2gpIHtcclxuICAgICAgICAgICAgICBhY3RpdmF0ZVNsaWRlKGkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgdmFyIGFjdGl2YXRlU2xpZGUgPSBmdW5jdGlvbihpbmRleCkge1xyXG4gICAgICB2YXIgaW5kZXhUb0FjdGl2YXRlID0gLTEgPCBpbmRleCAmJiBpbmRleCA8IGRlY2suc2xpZGVzLmxlbmd0aCA/IGluZGV4IDogMDtcclxuICAgICAgaWYgKGluZGV4VG9BY3RpdmF0ZSAhPT0gZGVjay5zbGlkZSgpKSB7XHJcbiAgICAgICAgZGVjay5zbGlkZShpbmRleFRvQWN0aXZhdGUpO1xyXG4gICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XHJcbiAgICAgIHBhcnNlSGFzaCgpO1xyXG5cclxuICAgICAgZGVjay5vbignYWN0aXZhdGUnLCBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgdmFyIHNsaWRlTmFtZSA9IGUuc2xpZGUuZ2V0QXR0cmlidXRlKCdkYXRhLWJlc3Bva2UtaGFzaCcpO1xyXG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5oYXNoID0gc2xpZGVOYW1lIHx8IGUuaW5kZXggKyAxO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdoYXNoY2hhbmdlJywgcGFyc2VIYXNoKTtcclxuICAgIH0sIDApO1xyXG4gIH07XHJcbn07XHJcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xyXG4gIHJldHVybiBmdW5jdGlvbihkZWNrKSB7XHJcbiAgICB2YXIgaXNIb3Jpem9udGFsID0gb3B0aW9ucyAhPT0gJ3ZlcnRpY2FsJztcclxuXHJcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZnVuY3Rpb24oZSkge1xyXG4gICAgICBpZiAoZS53aGljaCA9PSAzNCB8fCAvLyBQQUdFIERPV05cclxuICAgICAgICBlLndoaWNoID09IDMyIHx8IC8vIFNQQUNFXHJcbiAgICAgICAgKGlzSG9yaXpvbnRhbCAmJiBlLndoaWNoID09IDM5KSB8fCAvLyBSSUdIVFxyXG4gICAgICAgICghaXNIb3Jpem9udGFsICYmIGUud2hpY2ggPT0gNDApIC8vIERPV05cclxuICAgICAgKSB7IGRlY2submV4dCgpOyB9XHJcblxyXG4gICAgICBpZiAoZS53aGljaCA9PSAzMyB8fCAvLyBQQUdFIFVQXHJcbiAgICAgICAgKGlzSG9yaXpvbnRhbCAmJiBlLndoaWNoID09IDM3KSB8fCAvLyBMRUZUXHJcbiAgICAgICAgKCFpc0hvcml6b250YWwgJiYgZS53aGljaCA9PSAzOCkgLy8gVVBcclxuICAgICAgKSB7IGRlY2sucHJldigpOyB9XHJcbiAgICB9KTtcclxuICB9O1xyXG59O1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuICByZXR1cm4gZnVuY3Rpb24gKGRlY2spIHtcclxuICAgIHZhciBwcm9ncmVzc1BhcmVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxyXG4gICAgICBwcm9ncmVzc0JhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxyXG4gICAgICBwcm9wID0gb3B0aW9ucyA9PT0gJ3ZlcnRpY2FsJyA/ICdoZWlnaHQnIDogJ3dpZHRoJztcclxuXHJcbiAgICBwcm9ncmVzc1BhcmVudC5jbGFzc05hbWUgPSAnYmVzcG9rZS1wcm9ncmVzcy1wYXJlbnQnO1xyXG4gICAgcHJvZ3Jlc3NCYXIuY2xhc3NOYW1lID0gJ2Jlc3Bva2UtcHJvZ3Jlc3MtYmFyJztcclxuICAgIHByb2dyZXNzUGFyZW50LmFwcGVuZENoaWxkKHByb2dyZXNzQmFyKTtcclxuICAgIGRlY2sucGFyZW50LmFwcGVuZENoaWxkKHByb2dyZXNzUGFyZW50KTtcclxuXHJcbiAgICBkZWNrLm9uKCdhY3RpdmF0ZScsIGZ1bmN0aW9uKGUpIHtcclxuICAgICAgcHJvZ3Jlc3NCYXIuc3R5bGVbcHJvcF0gPSAoZS5pbmRleCAqIDEwMCAvIChkZWNrLnNsaWRlcy5sZW5ndGggLSAxKSkgKyAnJSc7XHJcbiAgICB9KTtcclxuICB9O1xyXG59O1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xyXG4gICAgdmFyIHBhcmVudCA9IGRlY2sucGFyZW50LFxyXG4gICAgICBmaXJzdFNsaWRlID0gZGVjay5zbGlkZXNbMF0sXHJcbiAgICAgIHNsaWRlSGVpZ2h0ID0gZmlyc3RTbGlkZS5vZmZzZXRIZWlnaHQsXHJcbiAgICAgIHNsaWRlV2lkdGggPSBmaXJzdFNsaWRlLm9mZnNldFdpZHRoLFxyXG4gICAgICB1c2Vab29tID0gb3B0aW9ucyA9PT0gJ3pvb20nIHx8ICgnem9vbScgaW4gcGFyZW50LnN0eWxlICYmIG9wdGlvbnMgIT09ICd0cmFuc2Zvcm0nKSxcclxuXHJcbiAgICAgIHdyYXAgPSBmdW5jdGlvbihlbGVtZW50KSB7XHJcbiAgICAgICAgdmFyIHdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB3cmFwcGVyLmNsYXNzTmFtZSA9ICdiZXNwb2tlLXNjYWxlLXBhcmVudCc7XHJcbiAgICAgICAgZWxlbWVudC5wYXJlbnROb2RlLmluc2VydEJlZm9yZSh3cmFwcGVyLCBlbGVtZW50KTtcclxuICAgICAgICB3cmFwcGVyLmFwcGVuZENoaWxkKGVsZW1lbnQpO1xyXG4gICAgICAgIHJldHVybiB3cmFwcGVyO1xyXG4gICAgICB9LFxyXG5cclxuICAgICAgZWxlbWVudHMgPSB1c2Vab29tID8gZGVjay5zbGlkZXMgOiBkZWNrLnNsaWRlcy5tYXAod3JhcCksXHJcblxyXG4gICAgICB0cmFuc2Zvcm1Qcm9wZXJ0eSA9IChmdW5jdGlvbihwcm9wZXJ0eSkge1xyXG4gICAgICAgIHZhciBwcmVmaXhlcyA9ICdNb3ogV2Via2l0IE8gbXMnLnNwbGl0KCcgJyk7XHJcbiAgICAgICAgcmV0dXJuIHByZWZpeGVzLnJlZHVjZShmdW5jdGlvbihjdXJyZW50UHJvcGVydHksIHByZWZpeCkge1xyXG4gICAgICAgICAgICByZXR1cm4gcHJlZml4ICsgcHJvcGVydHkgaW4gcGFyZW50LnN0eWxlID8gcHJlZml4ICsgcHJvcGVydHkgOiBjdXJyZW50UHJvcGVydHk7XHJcbiAgICAgICAgICB9LCBwcm9wZXJ0eS50b0xvd2VyQ2FzZSgpKTtcclxuICAgICAgfSgnVHJhbnNmb3JtJykpLFxyXG5cclxuICAgICAgc2NhbGUgPSB1c2Vab29tID9cclxuICAgICAgICBmdW5jdGlvbihyYXRpbywgZWxlbWVudCkge1xyXG4gICAgICAgICAgZWxlbWVudC5zdHlsZS56b29tID0gcmF0aW87XHJcbiAgICAgICAgfSA6XHJcbiAgICAgICAgZnVuY3Rpb24ocmF0aW8sIGVsZW1lbnQpIHtcclxuICAgICAgICAgIGVsZW1lbnQuc3R5bGVbdHJhbnNmb3JtUHJvcGVydHldID0gJ3NjYWxlKCcgKyByYXRpbyArICcpJztcclxuICAgICAgICB9LFxyXG5cclxuICAgICAgc2NhbGVBbGwgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgeFNjYWxlID0gcGFyZW50Lm9mZnNldFdpZHRoIC8gc2xpZGVXaWR0aCxcclxuICAgICAgICAgIHlTY2FsZSA9IHBhcmVudC5vZmZzZXRIZWlnaHQgLyBzbGlkZUhlaWdodDtcclxuXHJcbiAgICAgICAgZWxlbWVudHMuZm9yRWFjaChzY2FsZS5iaW5kKG51bGwsIE1hdGgubWluKHhTY2FsZSwgeVNjYWxlKSkpO1xyXG4gICAgICB9O1xyXG5cclxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCBzY2FsZUFsbCk7XHJcbiAgICBzY2FsZUFsbCgpO1xyXG4gIH07XHJcblxyXG59O1xyXG4iLCJcclxudmFyIGluc2VydENzcyA9IHJlcXVpcmUoJ2luc2VydC1jc3MnKTtcclxudmFyIHRyYW5zZm9ybSA9IHJlcXVpcmUoJ2ZlYXR1cmUvY3NzJykoJ3RyYW5zZm9ybScpO1xyXG52YXIgZG90ID0gcmVxdWlyZSgnZG90Jyk7XHJcbnZhciB0aGVtZSA9IGRvdC50ZW1wbGF0ZShcIkBpbXBvcnQgdXJsKGh0dHA6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3M/ZmFtaWx5PXt7PSBpdC5mb250IHx8ICdNb250c2VycmF0J319KTtcXHJcXG5AaW1wb3J0IHVybChodHRwOi8vZm9udHMuZ29vZ2xlYXBpcy5jb20vY3NzP2ZhbWlseT17ez0gaXQuZm9udCB8fCAnU291cmNlK0NvZGUrUHJvJ319KTtcXHJcXG5cXHJcXG5odG1sLCBib2R5IHtcXHJcXG4gIG1hcmdpbjogMDtcXHJcXG4gIHdpZHRoOiAxMDAlO1xcclxcbiAgaGVpZ2h0OiAxMDAlO1xcclxcbiAgb3ZlcmZsb3c6IGhpZGRlbjtcXHJcXG4gIGNvbG9yOiB7ez0gaXQuY29sb3IgfHwgJ3doaXRlJyB9fTtcXHJcXG4gIGJhY2tncm91bmQ6IHt7PSBpdC5iYWNrZ3JvdW5kIHx8ICdibGFjaycgfX07XFxyXFxufVxcclxcblxcclxcbi5iZXNwb2tlLXBhcmVudCB7XFxyXFxuICB0ZXh0LWFsaWduOiBjZW50ZXI7XFxyXFxuICBmb250LXNpemU6IDEuNWVtO1xcclxcbiAgZGlzcGxheTogZmxleDtcXHJcXG4gIHdpZHRoOiBhdXRvO1xcclxcbiAgaGVpZ2h0OiAxMDAlO1xcclxcbiAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuNXMgZWFzZS1pbi1vdXQ7XFxyXFxuICBmb250LWZhbWlseTogJ01vbnRzZXJyYXQnLCBzYW5zLXNlcmlmO1xcclxcbn1cXHJcXG5cXHJcXG4uYmVzcG9rZS1zbGlkZSB7XFxyXFxuICBwYWRkaW5nOiA1JTtcXHJcXG4gIHdpZHRoOiA5MCU7XFxyXFxuICBoZWlnaHQ6IDkwJTtcXHJcXG5cXHJcXG4gIGJhY2tncm91bmQtcG9zaXRpb246IDUwJSA1MCU7XFxyXFxuICBiYWNrZ3JvdW5kLXJlcGVhdDogbm8tcmVwZWF0O1xcclxcblxcclxcbiAgZGlzcGxheTogZmxleDtcXHJcXG4gIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XFxyXFxuICBmbGV4LXNocmluazogMDtcXHJcXG4gIGp1c3RpZnktY29udGVudDogY2VudGVyO1xcclxcbn1cXHJcXG5cXHJcXG4uYmVzcG9rZS1zbGlkZSB1bCwgLmJlc3Bva2Utc2xpZGUgb2wge1xcclxcbiAgdGV4dC1hbGlnbjogbGVmdDtcXHJcXG59XFxyXFxuXFxyXFxuLmJlc3Bva2Utc2xpZGUgaDEsIC5iZXNwb2tlLXNsaWRlIGgyLCAuYmVzcG9rZS1zbGlkZSBoMyB7XFxyXFxuICBtYXJnaW46IDBweDtcXHJcXG59XFxyXFxuXFxyXFxuLmJlc3Bva2Utc2xpZGUgaDEgKyBoMiB7XFxyXFxuICBtYXJnaW4tdG9wOiAxMHB4O1xcclxcbn1cXHJcXG5cXHJcXG4uYmVzcG9rZS1zbGlkZSBoMSB7XFxyXFxuICBmb250LXNpemU6IDRlbTtcXHJcXG4gIHRleHQtc2hhZG93OiAxLjVweCAxLjVweCAxcHgge3s9IGl0LmJhY2tncm91bmQgfHwgJ2JsYWNrJyB9fTtcXHJcXG59XFxyXFxuXFxyXFxuLmJlc3Bva2Utc2xpZGUgcHJlLCAuYmVzcG9rZS1zbGlkZSBjb2RlIHtcXHJcXG4gIGZvbnQtZmFtaWx5OiAnU291cmNlIENvZGUgUHJvJywgbW9ub3NwYWNlO1xcclxcbn1cXHJcXG5cXHJcXG4uYmVzcG9rZS1zbGlkZSBsaSB7XFxyXFxuICBsaW5lLWhlaWdodDogMmVtO1xcclxcbn1cXHJcXG5cXHJcXG4uYmVzcG9rZS1zbGlkZSBibG9ja3F1b3RlIHtcXHJcXG4gIHRleHQtYWxpZ246IGp1c3RpZnk7XFxyXFxuICBmb250LXN0eWxlOiBpdGFsaWM7XFxyXFxufVxcclxcblxcclxcbi5iZXNwb2tlLXNsaWRlIGEsIC5iZXNwb2tlLXNsaWRlIGE6dmlzaXRlZCB7XFxyXFxuICB0ZXh0LWRlY29yYXRpb246IG5vbmU7XFxyXFxuICBjb2xvcjoge3s9IGl0Lmxpbmtjb2xvciB8fCAneWVsbG93JyB9fTtcXHJcXG59XFxyXFxuXFxyXFxuLmJlc3Bva2UtYnVsbGV0IHtcXHJcXG4gIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjVzIGVhc2UtaW4tb3V0O1xcclxcbn1cXHJcXG5cXHJcXG4uYmVzcG9rZS1idWxsZXQuYmVzcG9rZS1idWxsZXQtaW5hY3RpdmUge1xcclxcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDEwMHZoKSB0cmFuc2xhdGVaKDApO1xcclxcbn1cXHJcXG5cIik7XHJcblxyXG4vKipcclxuXHQjIGJlc3Bva2UtdGhlbWUtdHdlYWthYmxlXHJcblxyXG5cdEEgc2ltcGxlIFtiZXNwb2tlLmpzXShodHRwczovL2dpdGh1Yi5jb20vbWFya2RhbGdsZWlzaC9iZXNwb2tlLmpzKSB0aGVtZVxyXG5cdHRoYXQgY2FuIGJlIGNvbmZpZ3VyZWQgb24gdGhlIGZseSB1c2luZyBjbGllbnQtc2lkZSB0ZW1wbGF0aW5nLlxyXG5cclxuXHQjIyBFeGFtcGxlIFVzYWdlXHJcblxyXG5cdFRvIGJlIGNvbXBsZXRlZC5cclxuXHJcbioqL1xyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdHMpIHtcclxuICBpbnNlcnRDc3ModGhlbWUob3B0cyB8fCB7fSksIHsgcHJlcGVuZDogdHJ1ZSB9KTtcclxuXHJcbiAgcmV0dXJuIGZ1bmN0aW9uKGRlY2spIHtcclxuICAgIHZhciBwYXJlbnQgPSBkZWNrLnBhcmVudDtcclxuXHJcbiAgICByZXF1aXJlKCdiZXNwb2tlLWNsYXNzZXMnKSgpKGRlY2spO1xyXG5cclxuICAgIGRlY2sub24oJ2FjdGl2YXRlJywgZnVuY3Rpb24oZXZ0KSB7XHJcbiAgICAgIHZhciB2YWxYID0gKGV2dC5pbmRleCAqIDEwMCk7XHJcblxyXG4gICAgICBpZiAodHJhbnNmb3JtKSB7XHJcbiAgICAgICAgdHJhbnNmb3JtKHBhcmVudCwgJ3RyYW5zbGF0ZVgoLScgKyB2YWxYICsgJyUpIHRyYW5zbGF0ZVooMCknKTtcclxuICAgICAgfVxyXG4gICAgICBlbHNlIHtcclxuICAgICAgICBwYXJlbnQucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xyXG4gICAgICAgIHBhcmVudC5sZWZ0ID0gJy0nICsgdmFsWCArICclJztcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfTtcclxufTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcclxuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xyXG4gICAgdmFyIGFkZENsYXNzID0gZnVuY3Rpb24oZWwsIGNscykge1xyXG4gICAgICAgIGVsLmNsYXNzTGlzdC5hZGQoJ2Jlc3Bva2UtJyArIGNscyk7XHJcbiAgICAgIH0sXHJcblxyXG4gICAgICByZW1vdmVDbGFzcyA9IGZ1bmN0aW9uKGVsLCBjbHMpIHtcclxuICAgICAgICBlbC5jbGFzc05hbWUgPSBlbC5jbGFzc05hbWVcclxuICAgICAgICAgIC5yZXBsYWNlKG5ldyBSZWdFeHAoJ2Jlc3Bva2UtJyArIGNscyArJyhcXFxcc3wkKScsICdnJyksICcgJylcclxuICAgICAgICAgIC50cmltKCk7XHJcbiAgICAgIH0sXHJcblxyXG4gICAgICBkZWFjdGl2YXRlID0gZnVuY3Rpb24oZWwsIGluZGV4KSB7XHJcbiAgICAgICAgdmFyIGFjdGl2ZVNsaWRlID0gZGVjay5zbGlkZXNbZGVjay5zbGlkZSgpXSxcclxuICAgICAgICAgIG9mZnNldCA9IGluZGV4IC0gZGVjay5zbGlkZSgpLFxyXG4gICAgICAgICAgb2Zmc2V0Q2xhc3MgPSBvZmZzZXQgPiAwID8gJ2FmdGVyJyA6ICdiZWZvcmUnO1xyXG5cclxuICAgICAgICBbJ2JlZm9yZSgtXFxcXGQrKT8nLCAnYWZ0ZXIoLVxcXFxkKyk/JywgJ2FjdGl2ZScsICdpbmFjdGl2ZSddLm1hcChyZW1vdmVDbGFzcy5iaW5kKG51bGwsIGVsKSk7XHJcblxyXG4gICAgICAgIGlmIChlbCAhPT0gYWN0aXZlU2xpZGUpIHtcclxuICAgICAgICAgIFsnaW5hY3RpdmUnLCBvZmZzZXRDbGFzcywgb2Zmc2V0Q2xhc3MgKyAnLScgKyBNYXRoLmFicyhvZmZzZXQpXS5tYXAoYWRkQ2xhc3MuYmluZChudWxsLCBlbCkpO1xyXG4gICAgICAgIH1cclxuICAgICAgfTtcclxuXHJcbiAgICBhZGRDbGFzcyhkZWNrLnBhcmVudCwgJ3BhcmVudCcpO1xyXG4gICAgZGVjay5zbGlkZXMubWFwKGZ1bmN0aW9uKGVsKSB7IGFkZENsYXNzKGVsLCAnc2xpZGUnKTsgfSk7XHJcblxyXG4gICAgZGVjay5vbignYWN0aXZhdGUnLCBmdW5jdGlvbihlKSB7XHJcbiAgICAgIGRlY2suc2xpZGVzLm1hcChkZWFjdGl2YXRlKTtcclxuICAgICAgYWRkQ2xhc3MoZS5zbGlkZSwgJ2FjdGl2ZScpO1xyXG4gICAgICByZW1vdmVDbGFzcyhlLnNsaWRlLCAnaW5hY3RpdmUnKTtcclxuICAgIH0pO1xyXG4gIH07XHJcbn07XHJcbiIsIi8vIGRvVC5qc1xyXG4vLyAyMDExLTIwMTQsIExhdXJhIERva3Rvcm92YSwgaHR0cHM6Ly9naXRodWIuY29tL29sYWRvL2RvVFxyXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXHJcblxyXG4oZnVuY3Rpb24oKSB7XHJcblx0XCJ1c2Ugc3RyaWN0XCI7XHJcblxyXG5cdHZhciBkb1QgPSB7XHJcblx0XHR2ZXJzaW9uOiBcIjEuMC4zXCIsXHJcblx0XHR0ZW1wbGF0ZVNldHRpbmdzOiB7XHJcblx0XHRcdGV2YWx1YXRlOiAgICAvXFx7XFx7KFtcXHNcXFNdKz8oXFx9PykrKVxcfVxcfS9nLFxyXG5cdFx0XHRpbnRlcnBvbGF0ZTogL1xce1xcez0oW1xcc1xcU10rPylcXH1cXH0vZyxcclxuXHRcdFx0ZW5jb2RlOiAgICAgIC9cXHtcXHshKFtcXHNcXFNdKz8pXFx9XFx9L2csXHJcblx0XHRcdHVzZTogICAgICAgICAvXFx7XFx7IyhbXFxzXFxTXSs/KVxcfVxcfS9nLFxyXG5cdFx0XHR1c2VQYXJhbXM6ICAgLyhefFteXFx3JF0pZGVmKD86XFwufFxcW1tcXCdcXFwiXSkoW1xcdyRcXC5dKykoPzpbXFwnXFxcIl1cXF0pP1xccypcXDpcXHMqKFtcXHckXFwuXSt8XFxcIlteXFxcIl0rXFxcInxcXCdbXlxcJ10rXFwnfFxce1teXFx9XStcXH0pL2csXHJcblx0XHRcdGRlZmluZTogICAgICAvXFx7XFx7IyNcXHMqKFtcXHdcXC4kXSspXFxzKihcXDp8PSkoW1xcc1xcU10rPykjXFx9XFx9L2csXHJcblx0XHRcdGRlZmluZVBhcmFtczovXlxccyooW1xcdyRdKyk6KFtcXHNcXFNdKykvLFxyXG5cdFx0XHRjb25kaXRpb25hbDogL1xce1xce1xcPyhcXD8pP1xccyooW1xcc1xcU10qPylcXHMqXFx9XFx9L2csXHJcblx0XHRcdGl0ZXJhdGU6ICAgICAvXFx7XFx7flxccyooPzpcXH1cXH18KFtcXHNcXFNdKz8pXFxzKlxcOlxccyooW1xcdyRdKylcXHMqKD86XFw6XFxzKihbXFx3JF0rKSk/XFxzKlxcfVxcfSkvZyxcclxuXHRcdFx0dmFybmFtZTpcdFwiaXRcIixcclxuXHRcdFx0c3RyaXA6XHRcdHRydWUsXHJcblx0XHRcdGFwcGVuZDpcdFx0dHJ1ZSxcclxuXHRcdFx0c2VsZmNvbnRhaW5lZDogZmFsc2UsXHJcblx0XHRcdGRvTm90U2tpcEVuY29kZWQ6IGZhbHNlXHJcblx0XHR9LFxyXG5cdFx0dGVtcGxhdGU6IHVuZGVmaW5lZCwgLy9mbiwgY29tcGlsZSB0ZW1wbGF0ZVxyXG5cdFx0Y29tcGlsZTogIHVuZGVmaW5lZCAgLy9mbiwgZm9yIGV4cHJlc3NcclxuXHR9LCBfZ2xvYmFscztcclxuXHJcblx0ZG9ULmVuY29kZUhUTUxTb3VyY2UgPSBmdW5jdGlvbihkb05vdFNraXBFbmNvZGVkKSB7XHJcblx0XHR2YXIgZW5jb2RlSFRNTFJ1bGVzID0geyBcIiZcIjogXCImIzM4O1wiLCBcIjxcIjogXCImIzYwO1wiLCBcIj5cIjogXCImIzYyO1wiLCAnXCInOiBcIiYjMzQ7XCIsIFwiJ1wiOiBcIiYjMzk7XCIsIFwiL1wiOiBcIiYjNDc7XCIgfSxcclxuXHRcdFx0bWF0Y2hIVE1MID0gZG9Ob3RTa2lwRW5jb2RlZCA/IC9bJjw+XCInXFwvXS9nIDogLyYoPyEjP1xcdys7KXw8fD58XCJ8J3xcXC8vZztcclxuXHRcdHJldHVybiBmdW5jdGlvbihjb2RlKSB7XHJcblx0XHRcdHJldHVybiBjb2RlID8gY29kZS50b1N0cmluZygpLnJlcGxhY2UobWF0Y2hIVE1MLCBmdW5jdGlvbihtKSB7cmV0dXJuIGVuY29kZUhUTUxSdWxlc1ttXSB8fCBtO30pIDogXCJcIjtcclxuXHRcdH07XHJcblx0fTtcclxuXHJcblx0X2dsb2JhbHMgPSAoZnVuY3Rpb24oKXsgcmV0dXJuIHRoaXMgfHwgKDAsZXZhbCkoXCJ0aGlzXCIpOyB9KCkpO1xyXG5cclxuXHRpZiAodHlwZW9mIG1vZHVsZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiBtb2R1bGUuZXhwb3J0cykge1xyXG5cdFx0bW9kdWxlLmV4cG9ydHMgPSBkb1Q7XHJcblx0fSBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkge1xyXG5cdFx0ZGVmaW5lKGZ1bmN0aW9uKCl7cmV0dXJuIGRvVDt9KTtcclxuXHR9IGVsc2Uge1xyXG5cdFx0X2dsb2JhbHMuZG9UID0gZG9UO1xyXG5cdH1cclxuXHJcblx0dmFyIHN0YXJ0ZW5kID0ge1xyXG5cdFx0YXBwZW5kOiB7IHN0YXJ0OiBcIicrKFwiLCAgICAgIGVuZDogXCIpKydcIiwgICAgICBzdGFydGVuY29kZTogXCInK2VuY29kZUhUTUwoXCIgfSxcclxuXHRcdHNwbGl0OiAgeyBzdGFydDogXCInO291dCs9KFwiLCBlbmQ6IFwiKTtvdXQrPSdcIiwgc3RhcnRlbmNvZGU6IFwiJztvdXQrPWVuY29kZUhUTUwoXCIgfVxyXG5cdH0sIHNraXAgPSAvJF4vO1xyXG5cclxuXHRmdW5jdGlvbiByZXNvbHZlRGVmcyhjLCBibG9jaywgZGVmKSB7XHJcblx0XHRyZXR1cm4gKCh0eXBlb2YgYmxvY2sgPT09IFwic3RyaW5nXCIpID8gYmxvY2sgOiBibG9jay50b1N0cmluZygpKVxyXG5cdFx0LnJlcGxhY2UoYy5kZWZpbmUgfHwgc2tpcCwgZnVuY3Rpb24obSwgY29kZSwgYXNzaWduLCB2YWx1ZSkge1xyXG5cdFx0XHRpZiAoY29kZS5pbmRleE9mKFwiZGVmLlwiKSA9PT0gMCkge1xyXG5cdFx0XHRcdGNvZGUgPSBjb2RlLnN1YnN0cmluZyg0KTtcclxuXHRcdFx0fVxyXG5cdFx0XHRpZiAoIShjb2RlIGluIGRlZikpIHtcclxuXHRcdFx0XHRpZiAoYXNzaWduID09PSBcIjpcIikge1xyXG5cdFx0XHRcdFx0aWYgKGMuZGVmaW5lUGFyYW1zKSB2YWx1ZS5yZXBsYWNlKGMuZGVmaW5lUGFyYW1zLCBmdW5jdGlvbihtLCBwYXJhbSwgdikge1xyXG5cdFx0XHRcdFx0XHRkZWZbY29kZV0gPSB7YXJnOiBwYXJhbSwgdGV4dDogdn07XHJcblx0XHRcdFx0XHR9KTtcclxuXHRcdFx0XHRcdGlmICghKGNvZGUgaW4gZGVmKSkgZGVmW2NvZGVdPSB2YWx1ZTtcclxuXHRcdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdFx0bmV3IEZ1bmN0aW9uKFwiZGVmXCIsIFwiZGVmWydcIitjb2RlK1wiJ109XCIgKyB2YWx1ZSkoZGVmKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuIFwiXCI7XHJcblx0XHR9KVxyXG5cdFx0LnJlcGxhY2UoYy51c2UgfHwgc2tpcCwgZnVuY3Rpb24obSwgY29kZSkge1xyXG5cdFx0XHRpZiAoYy51c2VQYXJhbXMpIGNvZGUgPSBjb2RlLnJlcGxhY2UoYy51c2VQYXJhbXMsIGZ1bmN0aW9uKG0sIHMsIGQsIHBhcmFtKSB7XHJcblx0XHRcdFx0aWYgKGRlZltkXSAmJiBkZWZbZF0uYXJnICYmIHBhcmFtKSB7XHJcblx0XHRcdFx0XHR2YXIgcncgPSAoZCtcIjpcIitwYXJhbSkucmVwbGFjZSgvJ3xcXFxcL2csIFwiX1wiKTtcclxuXHRcdFx0XHRcdGRlZi5fX2V4cCA9IGRlZi5fX2V4cCB8fCB7fTtcclxuXHRcdFx0XHRcdGRlZi5fX2V4cFtyd10gPSBkZWZbZF0udGV4dC5yZXBsYWNlKG5ldyBSZWdFeHAoXCIoXnxbXlxcXFx3JF0pXCIgKyBkZWZbZF0uYXJnICsgXCIoW15cXFxcdyRdKVwiLCBcImdcIiksIFwiJDFcIiArIHBhcmFtICsgXCIkMlwiKTtcclxuXHRcdFx0XHRcdHJldHVybiBzICsgXCJkZWYuX19leHBbJ1wiK3J3K1wiJ11cIjtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH0pO1xyXG5cdFx0XHR2YXIgdiA9IG5ldyBGdW5jdGlvbihcImRlZlwiLCBcInJldHVybiBcIiArIGNvZGUpKGRlZik7XHJcblx0XHRcdHJldHVybiB2ID8gcmVzb2x2ZURlZnMoYywgdiwgZGVmKSA6IHY7XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cdGZ1bmN0aW9uIHVuZXNjYXBlKGNvZGUpIHtcclxuXHRcdHJldHVybiBjb2RlLnJlcGxhY2UoL1xcXFwoJ3xcXFxcKS9nLCBcIiQxXCIpLnJlcGxhY2UoL1tcXHJcXHRcXG5dL2csIFwiIFwiKTtcclxuXHR9XHJcblxyXG5cdGRvVC50ZW1wbGF0ZSA9IGZ1bmN0aW9uKHRtcGwsIGMsIGRlZikge1xyXG5cdFx0YyA9IGMgfHwgZG9ULnRlbXBsYXRlU2V0dGluZ3M7XHJcblx0XHR2YXIgY3NlID0gYy5hcHBlbmQgPyBzdGFydGVuZC5hcHBlbmQgOiBzdGFydGVuZC5zcGxpdCwgbmVlZGh0bWxlbmNvZGUsIHNpZCA9IDAsIGluZHYsXHJcblx0XHRcdHN0ciAgPSAoYy51c2UgfHwgYy5kZWZpbmUpID8gcmVzb2x2ZURlZnMoYywgdG1wbCwgZGVmIHx8IHt9KSA6IHRtcGw7XHJcblxyXG5cdFx0c3RyID0gKFwidmFyIG91dD0nXCIgKyAoYy5zdHJpcCA/IHN0ci5yZXBsYWNlKC8oXnxcXHJ8XFxuKVxcdCogK3wgK1xcdCooXFxyfFxcbnwkKS9nLFwiIFwiKVxyXG5cdFx0XHRcdFx0LnJlcGxhY2UoL1xccnxcXG58XFx0fFxcL1xcKltcXHNcXFNdKj9cXCpcXC8vZyxcIlwiKTogc3RyKVxyXG5cdFx0XHQucmVwbGFjZSgvJ3xcXFxcL2csIFwiXFxcXCQmXCIpXHJcblx0XHRcdC5yZXBsYWNlKGMuaW50ZXJwb2xhdGUgfHwgc2tpcCwgZnVuY3Rpb24obSwgY29kZSkge1xyXG5cdFx0XHRcdHJldHVybiBjc2Uuc3RhcnQgKyB1bmVzY2FwZShjb2RlKSArIGNzZS5lbmQ7XHJcblx0XHRcdH0pXHJcblx0XHRcdC5yZXBsYWNlKGMuZW5jb2RlIHx8IHNraXAsIGZ1bmN0aW9uKG0sIGNvZGUpIHtcclxuXHRcdFx0XHRuZWVkaHRtbGVuY29kZSA9IHRydWU7XHJcblx0XHRcdFx0cmV0dXJuIGNzZS5zdGFydGVuY29kZSArIHVuZXNjYXBlKGNvZGUpICsgY3NlLmVuZDtcclxuXHRcdFx0fSlcclxuXHRcdFx0LnJlcGxhY2UoYy5jb25kaXRpb25hbCB8fCBza2lwLCBmdW5jdGlvbihtLCBlbHNlY2FzZSwgY29kZSkge1xyXG5cdFx0XHRcdHJldHVybiBlbHNlY2FzZSA/XHJcblx0XHRcdFx0XHQoY29kZSA/IFwiJzt9ZWxzZSBpZihcIiArIHVuZXNjYXBlKGNvZGUpICsgXCIpe291dCs9J1wiIDogXCInO31lbHNle291dCs9J1wiKSA6XHJcblx0XHRcdFx0XHQoY29kZSA/IFwiJztpZihcIiArIHVuZXNjYXBlKGNvZGUpICsgXCIpe291dCs9J1wiIDogXCInO31vdXQrPSdcIik7XHJcblx0XHRcdH0pXHJcblx0XHRcdC5yZXBsYWNlKGMuaXRlcmF0ZSB8fCBza2lwLCBmdW5jdGlvbihtLCBpdGVyYXRlLCB2bmFtZSwgaW5hbWUpIHtcclxuXHRcdFx0XHRpZiAoIWl0ZXJhdGUpIHJldHVybiBcIic7fSB9IG91dCs9J1wiO1xyXG5cdFx0XHRcdHNpZCs9MTsgaW5kdj1pbmFtZSB8fCBcImlcIitzaWQ7IGl0ZXJhdGU9dW5lc2NhcGUoaXRlcmF0ZSk7XHJcblx0XHRcdFx0cmV0dXJuIFwiJzt2YXIgYXJyXCIrc2lkK1wiPVwiK2l0ZXJhdGUrXCI7aWYoYXJyXCIrc2lkK1wiKXt2YXIgXCIrdm5hbWUrXCIsXCIraW5kditcIj0tMSxsXCIrc2lkK1wiPWFyclwiK3NpZCtcIi5sZW5ndGgtMTt3aGlsZShcIitpbmR2K1wiPGxcIitzaWQrXCIpe1wiXHJcblx0XHRcdFx0XHQrdm5hbWUrXCI9YXJyXCIrc2lkK1wiW1wiK2luZHYrXCIrPTFdO291dCs9J1wiO1xyXG5cdFx0XHR9KVxyXG5cdFx0XHQucmVwbGFjZShjLmV2YWx1YXRlIHx8IHNraXAsIGZ1bmN0aW9uKG0sIGNvZGUpIHtcclxuXHRcdFx0XHRyZXR1cm4gXCInO1wiICsgdW5lc2NhcGUoY29kZSkgKyBcIm91dCs9J1wiO1xyXG5cdFx0XHR9KVxyXG5cdFx0XHQrIFwiJztyZXR1cm4gb3V0O1wiKVxyXG5cdFx0XHQucmVwbGFjZSgvXFxuL2csIFwiXFxcXG5cIikucmVwbGFjZSgvXFx0L2csICdcXFxcdCcpLnJlcGxhY2UoL1xcci9nLCBcIlxcXFxyXCIpXHJcblx0XHRcdC5yZXBsYWNlKC8oXFxzfDt8XFx9fF58XFx7KW91dFxcKz0nJzsvZywgJyQxJykucmVwbGFjZSgvXFwrJycvZywgXCJcIik7XHJcblx0XHRcdC8vLnJlcGxhY2UoLyhcXHN8O3xcXH18XnxcXHspb3V0XFwrPScnXFwrL2csJyQxb3V0Kz0nKTtcclxuXHJcblx0XHRpZiAobmVlZGh0bWxlbmNvZGUpIHtcclxuXHRcdFx0aWYgKCFjLnNlbGZjb250YWluZWQgJiYgX2dsb2JhbHMgJiYgIV9nbG9iYWxzLl9lbmNvZGVIVE1MKSBfZ2xvYmFscy5fZW5jb2RlSFRNTCA9IGRvVC5lbmNvZGVIVE1MU291cmNlKGMuZG9Ob3RTa2lwRW5jb2RlZCk7XHJcblx0XHRcdHN0ciA9IFwidmFyIGVuY29kZUhUTUwgPSB0eXBlb2YgX2VuY29kZUhUTUwgIT09ICd1bmRlZmluZWQnID8gX2VuY29kZUhUTUwgOiAoXCJcclxuXHRcdFx0XHQrIGRvVC5lbmNvZGVIVE1MU291cmNlLnRvU3RyaW5nKCkgKyBcIihcIiArIChjLmRvTm90U2tpcEVuY29kZWQgfHwgJycpICsgXCIpKTtcIlxyXG5cdFx0XHRcdCsgc3RyO1xyXG5cdFx0fVxyXG5cdFx0dHJ5IHtcclxuXHRcdFx0cmV0dXJuIG5ldyBGdW5jdGlvbihjLnZhcm5hbWUsIHN0cik7XHJcblx0XHR9IGNhdGNoIChlKSB7XHJcblx0XHRcdGlmICh0eXBlb2YgY29uc29sZSAhPT0gXCJ1bmRlZmluZWRcIikgY29uc29sZS5sb2coXCJDb3VsZCBub3QgY3JlYXRlIGEgdGVtcGxhdGUgZnVuY3Rpb246IFwiICsgc3RyKTtcclxuXHRcdFx0dGhyb3cgZTtcclxuXHRcdH1cclxuXHR9O1xyXG5cclxuXHRkb1QuY29tcGlsZSA9IGZ1bmN0aW9uKHRtcGwsIGRlZikge1xyXG5cdFx0cmV0dXJuIGRvVC50ZW1wbGF0ZSh0bXBsLCBudWxsLCBkZWYpO1xyXG5cdH07XHJcbn0oKSk7XHJcbiIsIi8qIGRvVCArIGF1dG8tY29tcGlsYXRpb24gb2YgZG9UIHRlbXBsYXRlc1xyXG4gKlxyXG4gKiAyMDEyLCBMYXVyYSBEb2t0b3JvdmEsIGh0dHBzOi8vZ2l0aHViLmNvbS9vbGFkby9kb1RcclxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlXHJcbiAqXHJcbiAqIENvbXBpbGVzIC5kZWYsIC5kb3QsIC5qc3QgZmlsZXMgZm91bmQgdW5kZXIgdGhlIHNwZWNpZmllZCBwYXRoLlxyXG4gKiBJdCBpZ25vcmVzIHN1Yi1kaXJlY3Rvcmllcy5cclxuICogVGVtcGxhdGUgZmlsZXMgY2FuIGhhdmUgbXVsdGlwbGUgZXh0ZW5zaW9ucyBhdCB0aGUgc2FtZSB0aW1lLlxyXG4gKiBGaWxlcyB3aXRoIC5kZWYgZXh0ZW5zaW9uIGNhbiBiZSBpbmNsdWRlZCBpbiBvdGhlciBmaWxlcyB2aWEge3sjZGVmLm5hbWV9fVxyXG4gKiBGaWxlcyB3aXRoIC5kb3QgZXh0ZW5zaW9uIGFyZSBjb21waWxlZCBpbnRvIGZ1bmN0aW9ucyB3aXRoIHRoZSBzYW1lIG5hbWUgYW5kXHJcbiAqIGNhbiBiZSBhY2Nlc3NlZCBhcyByZW5kZXJlci5maWxlbmFtZVxyXG4gKiBGaWxlcyB3aXRoIC5qc3QgZXh0ZW5zaW9uIGFyZSBjb21waWxlZCBpbnRvIC5qcyBmaWxlcy4gUHJvZHVjZWQgLmpzIGZpbGUgY2FuIGJlXHJcbiAqIGxvYWRlZCBhcyBhIGNvbW1vbkpTLCBBTUQgbW9kdWxlLCBvciBqdXN0IGluc3RhbGxlZCBpbnRvIGEgZ2xvYmFsIHZhcmlhYmxlXHJcbiAqIChkZWZhdWx0IGlzIHNldCB0byB3aW5kb3cucmVuZGVyKS5cclxuICogQWxsIGlubGluZSBkZWZpbmVzIGRlZmluZWQgaW4gdGhlIC5qc3QgZmlsZSBhcmVcclxuICogY29tcGlsZWQgaW50byBzZXBhcmF0ZSBmdW5jdGlvbnMgYW5kIGFyZSBhdmFpbGFibGUgdmlhIF9yZW5kZXIuZmlsZW5hbWUuZGVmaW5lbmFtZVxyXG4gKlxyXG4gKiBCYXNpYyB1c2FnZTpcclxuICogdmFyIGRvdHMgPSByZXF1aXJlKFwiZG90XCIpLnByb2Nlc3Moe3BhdGg6IFwiLi92aWV3c1wifSk7XHJcbiAqIGRvdHMubXl0ZW1wbGF0ZSh7Zm9vOlwiaGVsbG8gd29ybGRcIn0pO1xyXG4gKlxyXG4gKiBUaGUgYWJvdmUgc25pcHBldCB3aWxsOlxyXG4gKiAxLiBDb21waWxlIGFsbCB0ZW1wbGF0ZXMgaW4gdmlld3MgZm9sZGVyICguZG90LCAuZGVmLCAuanN0KVxyXG4gKiAyLiBQbGFjZSAuanMgZmlsZXMgY29tcGlsZWQgZnJvbSAuanN0IHRlbXBsYXRlcyBpbnRvIHRoZSBzYW1lIGZvbGRlci5cclxuICogICAgVGhlc2UgZmlsZXMgY2FuIGJlIHVzZWQgd2l0aCByZXF1aXJlLCBpLmUuIHJlcXVpcmUoXCIuL3ZpZXdzL215dGVtcGxhdGVcIikuXHJcbiAqIDMuIFJldHVybiBhbiBvYmplY3Qgd2l0aCBmdW5jdGlvbnMgY29tcGlsZWQgZnJvbSAuZG90IHRlbXBsYXRlcyBhcyBpdHMgcHJvcGVydGllcy5cclxuICogNC4gUmVuZGVyIG15dGVtcGxhdGUgdGVtcGxhdGUuXHJcbiAqL1xyXG5cclxudmFyIGZzID0gcmVxdWlyZShcImZzXCIpLFxyXG5cdGRvVCA9IG1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcIi4vZG9UXCIpO1xyXG5cclxuZG9ULnByb2Nlc3MgPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcblx0Ly9wYXRoLCBkZXN0aW5hdGlvbiwgZ2xvYmFsLCByZW5kZXJtb2R1bGUsIHRlbXBsYXRlU2V0dGluZ3NcclxuXHRyZXR1cm4gbmV3IEluc3RhbGxEb3RzKG9wdGlvbnMpLmNvbXBpbGVBbGwoKTtcclxufTtcclxuXHJcbmZ1bmN0aW9uIEluc3RhbGxEb3RzKG8pIHtcclxuXHR0aGlzLl9fcGF0aCBcdFx0PSBvLnBhdGggfHwgXCIuL1wiO1xyXG5cdGlmICh0aGlzLl9fcGF0aFt0aGlzLl9fcGF0aC5sZW5ndGgtMV0gIT09ICcvJykgdGhpcy5fX3BhdGggKz0gJy8nO1xyXG5cdHRoaXMuX19kZXN0aW5hdGlvblx0PSBvLmRlc3RpbmF0aW9uIHx8IHRoaXMuX19wYXRoO1xyXG5cdGlmICh0aGlzLl9fZGVzdGluYXRpb25bdGhpcy5fX2Rlc3RpbmF0aW9uLmxlbmd0aC0xXSAhPT0gJy8nKSB0aGlzLl9fZGVzdGluYXRpb24gKz0gJy8nO1xyXG5cdHRoaXMuX19nbG9iYWxcdFx0PSBvLmdsb2JhbCB8fCBcIndpbmRvdy5yZW5kZXJcIjtcclxuXHR0aGlzLl9fcmVuZGVybW9kdWxlXHQ9IG8ucmVuZGVybW9kdWxlIHx8IHt9O1xyXG5cdHRoaXMuX19zZXR0aW5ncyBcdD0gby50ZW1wbGF0ZVNldHRpbmdzID8gY29weShvLnRlbXBsYXRlU2V0dGluZ3MsIGNvcHkoZG9ULnRlbXBsYXRlU2V0dGluZ3MpKSA6IHVuZGVmaW5lZDtcclxuXHR0aGlzLl9faW5jbHVkZXNcdFx0PSB7fTtcclxufVxyXG5cclxuSW5zdGFsbERvdHMucHJvdG90eXBlLmNvbXBpbGVUb0ZpbGUgPSBmdW5jdGlvbihwYXRoLCB0ZW1wbGF0ZSwgZGVmKSB7XHJcblx0ZGVmID0gZGVmIHx8IHt9O1xyXG5cdHZhciBtb2R1bGVuYW1lID0gcGF0aC5zdWJzdHJpbmcocGF0aC5sYXN0SW5kZXhPZihcIi9cIikrMSwgcGF0aC5sYXN0SW5kZXhPZihcIi5cIikpXHJcblx0XHQsIGRlZnMgPSBjb3B5KHRoaXMuX19pbmNsdWRlcywgY29weShkZWYpKVxyXG5cdFx0LCBzZXR0aW5ncyA9IHRoaXMuX19zZXR0aW5ncyB8fCBkb1QudGVtcGxhdGVTZXR0aW5nc1xyXG5cdFx0LCBjb21waWxlb3B0aW9ucyA9IGNvcHkoc2V0dGluZ3MpXHJcblx0XHQsIGRlZmF1bHRjb21waWxlZCA9IGRvVC50ZW1wbGF0ZSh0ZW1wbGF0ZSwgc2V0dGluZ3MsIGRlZnMpXHJcblx0XHQsIGV4cG9ydHMgPSBbXVxyXG5cdFx0LCBjb21waWxlZCA9IFwiXCJcclxuXHRcdCwgZm47XHJcblxyXG5cdGZvciAodmFyIHByb3BlcnR5IGluIGRlZnMpIHtcclxuXHRcdGlmIChkZWZzW3Byb3BlcnR5XSAhPT0gZGVmW3Byb3BlcnR5XSAmJiBkZWZzW3Byb3BlcnR5XSAhPT0gdGhpcy5fX2luY2x1ZGVzW3Byb3BlcnR5XSkge1xyXG5cdFx0XHRmbiA9IHVuZGVmaW5lZDtcclxuXHRcdFx0aWYgKHR5cGVvZiBkZWZzW3Byb3BlcnR5XSA9PT0gJ3N0cmluZycpIHtcclxuXHRcdFx0XHRmbiA9IGRvVC50ZW1wbGF0ZShkZWZzW3Byb3BlcnR5XSwgc2V0dGluZ3MsIGRlZnMpO1xyXG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBkZWZzW3Byb3BlcnR5XSA9PT0gJ2Z1bmN0aW9uJykge1xyXG5cdFx0XHRcdGZuID0gZGVmc1twcm9wZXJ0eV07XHJcblx0XHRcdH0gZWxzZSBpZiAoZGVmc1twcm9wZXJ0eV0uYXJnKSB7XHJcblx0XHRcdFx0Y29tcGlsZW9wdGlvbnMudmFybmFtZSA9IGRlZnNbcHJvcGVydHldLmFyZztcclxuXHRcdFx0XHRmbiA9IGRvVC50ZW1wbGF0ZShkZWZzW3Byb3BlcnR5XS50ZXh0LCBjb21waWxlb3B0aW9ucywgZGVmcyk7XHJcblx0XHRcdH1cclxuXHRcdFx0aWYgKGZuKSB7XHJcblx0XHRcdFx0Y29tcGlsZWQgKz0gZm4udG9TdHJpbmcoKS5yZXBsYWNlKCdhbm9ueW1vdXMnLCBwcm9wZXJ0eSk7XHJcblx0XHRcdFx0ZXhwb3J0cy5wdXNoKHByb3BlcnR5KTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH1cclxuXHRjb21waWxlZCArPSBkZWZhdWx0Y29tcGlsZWQudG9TdHJpbmcoKS5yZXBsYWNlKCdhbm9ueW1vdXMnLCBtb2R1bGVuYW1lKTtcclxuXHRmcy53cml0ZUZpbGVTeW5jKHBhdGgsIFwiKGZ1bmN0aW9uKCl7XCIgKyBjb21waWxlZFxyXG5cdFx0KyBcInZhciBpdHNlbGY9XCIgKyBtb2R1bGVuYW1lICsgXCIsIF9lbmNvZGVIVE1MPShcIiArIGRvVC5lbmNvZGVIVE1MU291cmNlLnRvU3RyaW5nKCkgKyBcIihcIiArIChzZXR0aW5ncy5kb05vdFNraXBFbmNvZGVkIHx8ICcnKSArIFwiKSk7XCJcclxuXHRcdCsgYWRkZXhwb3J0cyhleHBvcnRzKVxyXG5cdFx0KyBcImlmKHR5cGVvZiBtb2R1bGUhPT0ndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykgbW9kdWxlLmV4cG9ydHM9aXRzZWxmO2Vsc2UgaWYodHlwZW9mIGRlZmluZT09PSdmdW5jdGlvbicpZGVmaW5lKGZ1bmN0aW9uKCl7cmV0dXJuIGl0c2VsZjt9KTtlbHNlIHtcIlxyXG5cdFx0KyB0aGlzLl9fZ2xvYmFsICsgXCI9XCIgKyB0aGlzLl9fZ2xvYmFsICsgXCJ8fHt9O1wiICsgdGhpcy5fX2dsb2JhbCArIFwiWydcIiArIG1vZHVsZW5hbWUgKyBcIiddPWl0c2VsZjt9fSgpKTtcIik7XHJcbn07XHJcblxyXG5mdW5jdGlvbiBhZGRleHBvcnRzKGV4cG9ydHMpIHtcclxuXHRmb3IgKHZhciByZXQgPScnLCBpPTA7IGk8IGV4cG9ydHMubGVuZ3RoOyBpKyspIHtcclxuXHRcdHJldCArPSBcIml0c2VsZi5cIiArIGV4cG9ydHNbaV0rIFwiPVwiICsgZXhwb3J0c1tpXStcIjtcIjtcclxuXHR9XHJcblx0cmV0dXJuIHJldDtcclxufVxyXG5cclxuZnVuY3Rpb24gY29weShvLCB0bykge1xyXG5cdHRvID0gdG8gfHwge307XHJcblx0Zm9yICh2YXIgcHJvcGVydHkgaW4gbykge1xyXG5cdFx0dG9bcHJvcGVydHldID0gb1twcm9wZXJ0eV07XHJcblx0fVxyXG5cdHJldHVybiB0bztcclxufVxyXG5cclxuZnVuY3Rpb24gcmVhZGRhdGEocGF0aCkge1xyXG5cdHZhciBkYXRhID0gZnMucmVhZEZpbGVTeW5jKHBhdGgpO1xyXG5cdGlmIChkYXRhKSByZXR1cm4gZGF0YS50b1N0cmluZygpO1xyXG5cdGNvbnNvbGUubG9nKFwicHJvYmxlbXMgd2l0aCBcIiArIHBhdGgpO1xyXG59XHJcblxyXG5JbnN0YWxsRG90cy5wcm90b3R5cGUuY29tcGlsZVBhdGggPSBmdW5jdGlvbihwYXRoKSB7XHJcblx0dmFyIGRhdGEgPSByZWFkZGF0YShwYXRoKTtcclxuXHRpZiAoZGF0YSkge1xyXG5cdFx0cmV0dXJuIGRvVC50ZW1wbGF0ZShkYXRhLFxyXG5cdFx0XHRcdFx0dGhpcy5fX3NldHRpbmdzIHx8IGRvVC50ZW1wbGF0ZVNldHRpbmdzLFxyXG5cdFx0XHRcdFx0Y29weSh0aGlzLl9faW5jbHVkZXMpKTtcclxuXHR9XHJcbn07XHJcblxyXG5JbnN0YWxsRG90cy5wcm90b3R5cGUuY29tcGlsZUFsbCA9IGZ1bmN0aW9uKCkge1xyXG5cdGNvbnNvbGUubG9nKFwiQ29tcGlsaW5nIGFsbCBkb1QgdGVtcGxhdGVzLi4uXCIpO1xyXG5cclxuXHR2YXIgZGVmRm9sZGVyID0gdGhpcy5fX3BhdGgsXHJcblx0XHRzb3VyY2VzID0gZnMucmVhZGRpclN5bmMoZGVmRm9sZGVyKSxcclxuXHRcdGssIGwsIG5hbWU7XHJcblxyXG5cdGZvciggayA9IDAsIGwgPSBzb3VyY2VzLmxlbmd0aDsgayA8IGw7IGsrKykge1xyXG5cdFx0bmFtZSA9IHNvdXJjZXNba107XHJcblx0XHRpZiAoL1xcLmRlZihcXC5kb3R8XFwuanN0KT8kLy50ZXN0KG5hbWUpKSB7XHJcblx0XHRcdGNvbnNvbGUubG9nKFwiTG9hZGVkIGRlZiBcIiArIG5hbWUpO1xyXG5cdFx0XHR0aGlzLl9faW5jbHVkZXNbbmFtZS5zdWJzdHJpbmcoMCwgbmFtZS5pbmRleE9mKCcuJykpXSA9IHJlYWRkYXRhKGRlZkZvbGRlciArIG5hbWUpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0Zm9yKCBrID0gMCwgbCA9IHNvdXJjZXMubGVuZ3RoOyBrIDwgbDsgaysrKSB7XHJcblx0XHRuYW1lID0gc291cmNlc1trXTtcclxuXHRcdGlmICgvXFwuZG90KFxcLmRlZnxcXC5qc3QpPyQvLnRlc3QobmFtZSkpIHtcclxuXHRcdFx0Y29uc29sZS5sb2coXCJDb21waWxpbmcgXCIgKyBuYW1lICsgXCIgdG8gZnVuY3Rpb25cIik7XHJcblx0XHRcdHRoaXMuX19yZW5kZXJtb2R1bGVbbmFtZS5zdWJzdHJpbmcoMCwgbmFtZS5pbmRleE9mKCcuJykpXSA9IHRoaXMuY29tcGlsZVBhdGgoZGVmRm9sZGVyICsgbmFtZSk7XHJcblx0XHR9XHJcblx0XHRpZiAoL1xcLmpzdChcXC5kb3R8XFwuZGVmKT8kLy50ZXN0KG5hbWUpKSB7XHJcblx0XHRcdGNvbnNvbGUubG9nKFwiQ29tcGlsaW5nIFwiICsgbmFtZSArIFwiIHRvIGZpbGVcIik7XHJcblx0XHRcdHRoaXMuY29tcGlsZVRvRmlsZSh0aGlzLl9fZGVzdGluYXRpb24gKyBuYW1lLnN1YnN0cmluZygwLCBuYW1lLmluZGV4T2YoJy4nKSkgKyAnLmpzJyxcclxuXHRcdFx0XHRcdHJlYWRkYXRhKGRlZkZvbGRlciArIG5hbWUpKTtcclxuXHRcdH1cclxuXHR9XHJcblx0cmV0dXJuIHRoaXMuX19yZW5kZXJtb2R1bGU7XHJcbn07XHJcbiIsIi8qIGpzaGludCBub2RlOiB0cnVlICovXHJcbi8qIGdsb2JhbCB3aW5kb3c6IGZhbHNlICovXHJcbi8qIGdsb2JhbCBkb2N1bWVudDogZmFsc2UgKi9cclxuJ3VzZSBzdHJpY3QnO1xyXG5cclxuLy8gbGlzdCBwcmVmaXhlcyBhbmQgY2FzZSB0cmFuc2Zvcm1zXHJcbi8vIChyZXZlcnNlIG9yZGVyIGFzIGEgZGVjcmVtZW50aW5nIGZvciBsb29wIGlzIHVzZWQpXHJcbnZhciBwcmVmaXhlcyA9IFtcclxuICAnbXMnLFxyXG4gICdtcycsIC8vIGludGVudGlvbmFsOiAybmQgZW50cnkgZm9yIG1zIGFzIHdlIHdpbGwgYWxzbyB0cnkgUGFzY2FsIGNhc2UgZm9yIE1TXHJcbiAgJ08nLFxyXG4gICdNb3onLFxyXG4gICdXZWJraXQnLFxyXG4gICcnXHJcbl07XHJcblxyXG52YXIgY2FzZVRyYW5zZm9ybXMgPSBbXHJcbiAgdG9DYW1lbENhc2UsXHJcbiAgbnVsbCxcclxuICBudWxsLFxyXG4gIHRvQ2FtZWxDYXNlLFxyXG4gIG51bGwsXHJcbiAgdG9DYW1lbENhc2VcclxuXTtcclxuXHJcbnZhciBwcm9wcyA9IHt9O1xyXG52YXIgc3R5bGU7XHJcblxyXG4vKipcclxuICAjIyMgY3NzKHByb3ApXHJcblxyXG4gIFRlc3QgZm9yIHRoZSBwcmVzY2VuY2Ugb2YgdGhlIHNwZWNpZmllZCBDU1MgcHJvcGVydHkgKGluIGFsbCBpdCdzXHJcbiAgcG9zc2libGUgYnJvd3NlciBwcmVmaXhlZCB2YXJpYW50cykuICBUaGUgcmV0dXJuZWQgZnVuY3Rpb24gKGlmIHdlXHJcbiAgYXJlIGFibGUgdG8gYWNjZXNzIHRoZSByZXF1aXJlZCBzdHlsZSBwcm9wZXJ0eSkgaXMgYm90aCBhIGdldHRlciBhbmRcclxuICBzZXR0ZXIgZnVuY3Rpb24gZm9yIHdoZW4gZ2l2ZW4gYW4gZWxlbWVudC5cclxuXHJcbiAgQ29uc2lkZXIgdGhlIGZvbGxvd2luZyBleGFtcGxlLCB3aXRoIHJlZ2FyZHMgdG8gQ1NTIHRyYW5zZm9ybXM6XHJcblxyXG4gIDw8PCBleGFtcGxlcy90cmFuc2Zvcm0uanNcclxuXHJcbioqL1xyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHByb3ApIHtcclxuICB2YXIgaWk7XHJcbiAgdmFyIHByb3BOYW1lO1xyXG4gIHZhciBwYXNjYWxDYXNlTmFtZTtcclxuXHJcbiAgc3R5bGUgPSBzdHlsZSB8fCBkb2N1bWVudC5ib2R5LnN0eWxlO1xyXG5cclxuICAvLyBpZiB3ZSBhbHJlYWR5IGhhdmUgYSB2YWx1ZSBmb3IgdGhlIHRhcmdldCBwcm9wZXJ0eSwgcmV0dXJuXHJcbiAgaWYgKHByb3BzW3Byb3BdIHx8IHN0eWxlW3Byb3BdKSB7XHJcbiAgICByZXR1cm4gcHJvcHNbcHJvcF07XHJcbiAgfVxyXG5cclxuICAvLyBjb252ZXJ0IGEgZGFzaCBkZWxpbWl0ZWQgcHJvcGVydHluYW1lIChlLmcuIGJveC1zaGFkb3cpIGludG9cclxuICAvLyBwYXNjYWwgY2FzZWQgbmFtZSAoZS5nLiBCb3hTaGFkb3cpXHJcbiAgcGFzY2FsQ2FzZU5hbWUgPSBwcm9wLnNwbGl0KCctJykucmVkdWNlKGZ1bmN0aW9uKG1lbW8sIHZhbCkge1xyXG4gICAgcmV0dXJuIG1lbW8gKyB2YWwuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB2YWwuc2xpY2UoMSk7XHJcbiAgfSwgJycpO1xyXG5cclxuICAvLyBjaGVjayBmb3IgdGhlIHByb3BlcnR5XHJcbiAgZm9yIChpaSA9IHByZWZpeGVzLmxlbmd0aDsgaWktLTsgKSB7XHJcbiAgICBwcm9wTmFtZSA9IHByZWZpeGVzW2lpXSArIChjYXNlVHJhbnNmb3Jtc1tpaV0gP1xyXG4gICAgICAgICAgICAgICAgICBjYXNlVHJhbnNmb3Jtc1tpaV0ocGFzY2FsQ2FzZU5hbWUpIDpcclxuICAgICAgICAgICAgICAgICAgcGFzY2FsQ2FzZU5hbWUpO1xyXG5cclxuICAgIGlmICh0eXBlb2Ygc3R5bGVbcHJvcE5hbWVdICE9ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgIHByb3BzW3Byb3BdID0gY3JlYXRlR2V0dGVyU2V0dGVyKHByb3BOYW1lKTtcclxuICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gcHJvcHNbcHJvcF07XHJcbn07XHJcblxyXG4vKiBpbnRlcm5hbCBoZWxwZXIgZnVuY3Rpb25zICovXHJcblxyXG5mdW5jdGlvbiBjcmVhdGVHZXR0ZXJTZXR0ZXIocHJvcE5hbWUpIHtcclxuICBmdW5jdGlvbiBncyhlbGVtZW50LCB2YWx1ZSkge1xyXG4gICAgLy8gaWYgd2UgaGF2ZSBhIHZhbHVlIHVwZGF0ZVxyXG4gICAgaWYgKHR5cGVvZiB2YWx1ZSAhPSAndW5kZWZpbmVkJykge1xyXG4gICAgICBlbGVtZW50LnN0eWxlW3Byb3BOYW1lXSA9IHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KVtwcm9wTmFtZV07XHJcbiAgfVxyXG5cclxuICAvLyBhdHRhY2ggdGhlIHByb3BlcnR5IG5hbWUgdG8gdGhlIGdldHRlciBhbmQgc2V0dGVyXHJcbiAgZ3MucHJvcGVydHkgPSBwcm9wTmFtZTtcclxuICByZXR1cm4gZ3M7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRvQ2FtZWxDYXNlKGlucHV0KSB7XHJcbiAgcmV0dXJuIGlucHV0LmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgaW5wdXQuc2xpY2UoMSk7XHJcbn0iLCJ2YXIgaW5zZXJ0ZWQgPSB7fTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGNzcywgb3B0aW9ucykge1xyXG4gICAgaWYgKGluc2VydGVkW2Nzc10pIHJldHVybjtcclxuICAgIGluc2VydGVkW2Nzc10gPSB0cnVlO1xyXG4gICAgXHJcbiAgICB2YXIgZWxlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XHJcbiAgICBlbGVtLnNldEF0dHJpYnV0ZSgndHlwZScsICd0ZXh0L2NzcycpO1xyXG5cclxuICAgIGlmICgndGV4dENvbnRlbnQnIGluIGVsZW0pIHtcclxuICAgICAgZWxlbS50ZXh0Q29udGVudCA9IGNzcztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGVsZW0uc3R5bGVTaGVldC5jc3NUZXh0ID0gY3NzO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB2YXIgaGVhZCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdoZWFkJylbMF07XHJcbiAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLnByZXBlbmQpIHtcclxuICAgICAgICBoZWFkLmluc2VydEJlZm9yZShlbGVtLCBoZWFkLmNoaWxkTm9kZXNbMF0pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBoZWFkLmFwcGVuZENoaWxkKGVsZW0pO1xyXG4gICAgfVxyXG59O1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xyXG4gICAgdmFyIGF4aXMgPSBvcHRpb25zID09ICd2ZXJ0aWNhbCcgPyAnWScgOiAnWCcsXHJcbiAgICAgIHN0YXJ0UG9zaXRpb24sXHJcbiAgICAgIGRlbHRhO1xyXG5cclxuICAgIGRlY2sucGFyZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCBmdW5jdGlvbihlKSB7XHJcbiAgICAgIGlmIChlLnRvdWNoZXMubGVuZ3RoID09IDEpIHtcclxuICAgICAgICBzdGFydFBvc2l0aW9uID0gZS50b3VjaGVzWzBdWydwYWdlJyArIGF4aXNdO1xyXG4gICAgICAgIGRlbHRhID0gMDtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgZGVjay5wYXJlbnQuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2htb3ZlJywgZnVuY3Rpb24oZSkge1xyXG4gICAgICBpZiAoZS50b3VjaGVzLmxlbmd0aCA9PSAxKSB7XHJcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIGRlbHRhID0gZS50b3VjaGVzWzBdWydwYWdlJyArIGF4aXNdIC0gc3RhcnRQb3NpdGlvbjtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgZGVjay5wYXJlbnQuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hlbmQnLCBmdW5jdGlvbigpIHtcclxuICAgICAgaWYgKE1hdGguYWJzKGRlbHRhKSA+IDUwKSB7XHJcbiAgICAgICAgZGVja1tkZWx0YSA+IDAgPyAncHJldicgOiAnbmV4dCddKCk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH07XHJcbn07XHJcbiIsInZhciBmcm9tID0gZnVuY3Rpb24oc2VsZWN0b3JPckVsZW1lbnQsIHBsdWdpbnMpIHtcclxuICB2YXIgcGFyZW50ID0gc2VsZWN0b3JPckVsZW1lbnQubm9kZVR5cGUgPT09IDEgPyBzZWxlY3Rvck9yRWxlbWVudCA6IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3JPckVsZW1lbnQpLFxyXG4gICAgc2xpZGVzID0gW10uZmlsdGVyLmNhbGwocGFyZW50LmNoaWxkcmVuLCBmdW5jdGlvbihlbCkgeyByZXR1cm4gZWwubm9kZU5hbWUgIT09ICdTQ1JJUFQnOyB9KSxcclxuICAgIGFjdGl2ZVNsaWRlID0gc2xpZGVzWzBdLFxyXG4gICAgbGlzdGVuZXJzID0ge30sXHJcblxyXG4gICAgYWN0aXZhdGUgPSBmdW5jdGlvbihpbmRleCwgY3VzdG9tRGF0YSkge1xyXG4gICAgICBpZiAoIXNsaWRlc1tpbmRleF0pIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZpcmUoJ2RlYWN0aXZhdGUnLCBjcmVhdGVFdmVudERhdGEoYWN0aXZlU2xpZGUsIGN1c3RvbURhdGEpKTtcclxuICAgICAgYWN0aXZlU2xpZGUgPSBzbGlkZXNbaW5kZXhdO1xyXG4gICAgICBmaXJlKCdhY3RpdmF0ZScsIGNyZWF0ZUV2ZW50RGF0YShhY3RpdmVTbGlkZSwgY3VzdG9tRGF0YSkpO1xyXG4gICAgfSxcclxuXHJcbiAgICBzbGlkZSA9IGZ1bmN0aW9uKGluZGV4LCBjdXN0b21EYXRhKSB7XHJcbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoKSB7XHJcbiAgICAgICAgZmlyZSgnc2xpZGUnLCBjcmVhdGVFdmVudERhdGEoc2xpZGVzW2luZGV4XSwgY3VzdG9tRGF0YSkpICYmIGFjdGl2YXRlKGluZGV4LCBjdXN0b21EYXRhKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gc2xpZGVzLmluZGV4T2YoYWN0aXZlU2xpZGUpO1xyXG4gICAgICB9XHJcbiAgICB9LFxyXG5cclxuICAgIHN0ZXAgPSBmdW5jdGlvbihvZmZzZXQsIGN1c3RvbURhdGEpIHtcclxuICAgICAgdmFyIHNsaWRlSW5kZXggPSBzbGlkZXMuaW5kZXhPZihhY3RpdmVTbGlkZSkgKyBvZmZzZXQ7XHJcblxyXG4gICAgICBmaXJlKG9mZnNldCA+IDAgPyAnbmV4dCcgOiAncHJldicsIGNyZWF0ZUV2ZW50RGF0YShhY3RpdmVTbGlkZSwgY3VzdG9tRGF0YSkpICYmIGFjdGl2YXRlKHNsaWRlSW5kZXgsIGN1c3RvbURhdGEpO1xyXG4gICAgfSxcclxuXHJcbiAgICBvbiA9IGZ1bmN0aW9uKGV2ZW50TmFtZSwgY2FsbGJhY2spIHtcclxuICAgICAgKGxpc3RlbmVyc1tldmVudE5hbWVdIHx8IChsaXN0ZW5lcnNbZXZlbnROYW1lXSA9IFtdKSkucHVzaChjYWxsYmFjayk7XHJcblxyXG4gICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgbGlzdGVuZXJzW2V2ZW50TmFtZV0gPSBsaXN0ZW5lcnNbZXZlbnROYW1lXS5maWx0ZXIoZnVuY3Rpb24obGlzdGVuZXIpIHtcclxuICAgICAgICAgIHJldHVybiBsaXN0ZW5lciAhPT0gY2FsbGJhY2s7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH07XHJcbiAgICB9LFxyXG5cclxuICAgIGZpcmUgPSBmdW5jdGlvbihldmVudE5hbWUsIGV2ZW50RGF0YSkge1xyXG4gICAgICByZXR1cm4gKGxpc3RlbmVyc1tldmVudE5hbWVdIHx8IFtdKVxyXG4gICAgICAgIC5yZWR1Y2UoZnVuY3Rpb24obm90Q2FuY2VsbGVkLCBjYWxsYmFjaykge1xyXG4gICAgICAgICAgcmV0dXJuIG5vdENhbmNlbGxlZCAmJiBjYWxsYmFjayhldmVudERhdGEpICE9PSBmYWxzZTtcclxuICAgICAgICB9LCB0cnVlKTtcclxuICAgIH0sXHJcblxyXG4gICAgY3JlYXRlRXZlbnREYXRhID0gZnVuY3Rpb24oZWwsIGV2ZW50RGF0YSkge1xyXG4gICAgICBldmVudERhdGEgPSBldmVudERhdGEgfHwge307XHJcbiAgICAgIGV2ZW50RGF0YS5pbmRleCA9IHNsaWRlcy5pbmRleE9mKGVsKTtcclxuICAgICAgZXZlbnREYXRhLnNsaWRlID0gZWw7XHJcbiAgICAgIHJldHVybiBldmVudERhdGE7XHJcbiAgICB9LFxyXG5cclxuICAgIGRlY2sgPSB7XHJcbiAgICAgIG9uOiBvbixcclxuICAgICAgZmlyZTogZmlyZSxcclxuICAgICAgc2xpZGU6IHNsaWRlLFxyXG4gICAgICBuZXh0OiBzdGVwLmJpbmQobnVsbCwgMSksXHJcbiAgICAgIHByZXY6IHN0ZXAuYmluZChudWxsLCAtMSksXHJcbiAgICAgIHBhcmVudDogcGFyZW50LFxyXG4gICAgICBzbGlkZXM6IHNsaWRlc1xyXG4gICAgfTtcclxuXHJcbiAgKHBsdWdpbnMgfHwgW10pLmZvckVhY2goZnVuY3Rpb24ocGx1Z2luKSB7XHJcbiAgICBwbHVnaW4oZGVjayk7XHJcbiAgfSk7XHJcblxyXG4gIGFjdGl2YXRlKDApO1xyXG5cclxuICByZXR1cm4gZGVjaztcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gIGZyb206IGZyb21cclxufTtcclxuIixudWxsLCIvLyBSZXF1aXJlIE5vZGUgbW9kdWxlcyBpbiB0aGUgYnJvd3NlciB0aGFua3MgdG8gQnJvd3NlcmlmeTogaHR0cDovL2Jyb3dzZXJpZnkub3JnXHJcbnZhciBiZXNwb2tlID0gcmVxdWlyZSgnYmVzcG9rZScpLFxyXG4gIC8vY3ViZSA9IHJlcXVpcmUoJ2Jlc3Bva2UtdGhlbWUtY3ViZScpLFxyXG4gIC8vdm9sdGFpcmUgPSByZXF1aXJlKCdiZXNwb2tlLXRoZW1lLXZvbHRhaXJlJyksXHJcbiAgLy90ZXJtaW5hbCA9IHJlcXVpcmUoJ2Jlc3Bva2UtdGhlbWUtdGVybWluYWwnKSxcclxuICAvL2ZhbmN5ID0gcmVxdWlyZSgnYmVzcG9rZS10aGVtZS1mYW5jeScpO1xyXG4gIC8vc2ltcGxlU2xpZGUgPSByZXF1aXJlKCdiZXNwb2tlLXRoZW1lLXNpbXBsZS1zbGlkZScpO1xyXG4gIC8vbW96aWxsYVNhbmRzdG9uZSA9IHJlcXVpcmUoJ2Jlc3Bva2UtdGhlbWUtbW96aWxsYS1zYW5kc3RvbmUnKTtcclxuICB0d2Vha2FibGUgPSByZXF1aXJlKCdiZXNwb2tlLXRoZW1lLXR3ZWFrYWJsZScpO1xyXG4gIGtleXMgPSByZXF1aXJlKCdiZXNwb2tlLWtleXMnKSxcclxuICB0b3VjaCA9IHJlcXVpcmUoJ2Jlc3Bva2UtdG91Y2gnKSxcclxuICBidWxsZXRzID0gcmVxdWlyZSgnYmVzcG9rZS1idWxsZXRzJyksXHJcbiAgYmFja2Ryb3AgPSByZXF1aXJlKCdiZXNwb2tlLWJhY2tkcm9wJyksXHJcbiAgc2NhbGUgPSByZXF1aXJlKCdiZXNwb2tlLXNjYWxlJyksXHJcbiAgaGFzaCA9IHJlcXVpcmUoJ2Jlc3Bva2UtaGFzaCcpLFxyXG4gIHByb2dyZXNzID0gcmVxdWlyZSgnYmVzcG9rZS1wcm9ncmVzcycpLFxyXG4gIGZvcm1zID0gcmVxdWlyZSgnYmVzcG9rZS1mb3JtcycpO1xyXG5cclxuLy8gQmVzcG9rZS5qc1xyXG5iZXNwb2tlLmZyb20oJ2FydGljbGUnLCBbXHJcbiAgLy9jdWJlKCksXHJcbiAgLy92b2x0YWlyZSgpLFxyXG4gIC8vdGVybWluYWwoKSxcclxuICAvL2ZhbmN5KCksXHJcbiAgLy9zaW1wbGVTbGlkZSgpLFxyXG4gIC8vbW96aWxsYVNhbmRzdG9uZSgpLFxyXG4gIHR3ZWFrYWJsZSgpLFxyXG4gIGtleXMoKSxcclxuICB0b3VjaCgpLFxyXG4gIGJ1bGxldHMoJ2xpLCAuYnVsbGV0JyksXHJcbiAgYmFja2Ryb3AoKSxcclxuICBzY2FsZSgpLFxyXG4gIGhhc2goKSxcclxuICBwcm9ncmVzcygpLFxyXG4gIGZvcm1zKClcclxuXSk7XHJcblxyXG4vLyBQcmlzbSBzeW50YXggaGlnaGxpZ2h0aW5nXHJcbi8vIFRoaXMgaXMgYWN0dWFsbHkgbG9hZGVkIGZyb20gXCJib3dlcl9jb21wb25lbnRzXCIgdGhhbmtzIHRvXHJcbi8vIGRlYm93ZXJpZnk6IGh0dHBzOi8vZ2l0aHViLmNvbS9ldWdlbmV3YXJlL2RlYm93ZXJpZnlcclxucmVxdWlyZShcIi4vLi5cXFxcLi5cXFxcYm93ZXJfY29tcG9uZW50c1xcXFxwcmlzbVxcXFxwcmlzbS5qc1wiKTtcclxuXHJcbiJdfQ==
=======
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkQ6XFxLb2xhYm9yYXNpX0ZcXENsb3VkX0NvbXB1dGluZ1xcbm9kZV9tb2R1bGVzXFxndWxwLWJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxicm93c2VyLXBhY2tcXF9wcmVsdWRlLmpzIiwiRDovS29sYWJvcmFzaV9GL0Nsb3VkX0NvbXB1dGluZy9ib3dlcl9jb21wb25lbnRzL3ByaXNtL3ByaXNtLmpzIiwiRDovS29sYWJvcmFzaV9GL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS1iYWNrZHJvcC9saWIvYmVzcG9rZS1iYWNrZHJvcC5qcyIsIkQ6L0tvbGFib3Jhc2lfRi9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtYnVsbGV0cy9saWIvYmVzcG9rZS1idWxsZXRzLmpzIiwiRDovS29sYWJvcmFzaV9GL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS1mb3Jtcy9saWIvYmVzcG9rZS1mb3Jtcy5qcyIsIkQ6L0tvbGFib3Jhc2lfRi9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtaGFzaC9saWIvYmVzcG9rZS1oYXNoLmpzIiwiRDovS29sYWJvcmFzaV9GL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS1rZXlzL2xpYi9iZXNwb2tlLWtleXMuanMiLCJEOi9Lb2xhYm9yYXNpX0YvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlLXByb2dyZXNzL2xpYi9iZXNwb2tlLXByb2dyZXNzLmpzIiwiRDovS29sYWJvcmFzaV9GL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS1zY2FsZS9saWIvYmVzcG9rZS1zY2FsZS5qcyIsIkQ6L0tvbGFib3Jhc2lfRi9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtdGhlbWUtdHdlYWthYmxlL2luZGV4LmpzIiwiRDovS29sYWJvcmFzaV9GL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS10aGVtZS10d2Vha2FibGUvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtY2xhc3Nlcy9saWIvYmVzcG9rZS1jbGFzc2VzLmpzIiwiRDovS29sYWJvcmFzaV9GL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS10aGVtZS10d2Vha2FibGUvbm9kZV9tb2R1bGVzL2RvdC9kb1QuanMiLCJEOi9Lb2xhYm9yYXNpX0YvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlLXRoZW1lLXR3ZWFrYWJsZS9ub2RlX21vZHVsZXMvZG90L2luZGV4LmpzIiwiRDovS29sYWJvcmFzaV9GL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS10aGVtZS10d2Vha2FibGUvbm9kZV9tb2R1bGVzL2ZlYXR1cmUvY3NzLmpzIiwiRDovS29sYWJvcmFzaV9GL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS10aGVtZS10d2Vha2FibGUvbm9kZV9tb2R1bGVzL2luc2VydC1jc3MvaW5kZXguanMiLCJEOi9Lb2xhYm9yYXNpX0YvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlLXRvdWNoL2xpYi9iZXNwb2tlLXRvdWNoLmpzIiwiRDovS29sYWJvcmFzaV9GL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS9saWIvYmVzcG9rZS5qcyIsIkQ6L0tvbGFib3Jhc2lfRi9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwiRDovS29sYWJvcmFzaV9GL0Nsb3VkX0NvbXB1dGluZy9zcmMvc2NyaXB0cy9mYWtlXzk2MGRlMmVmLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaHFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcclxuLyogKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG4gICAgIEJlZ2luIHByaXNtLWNvcmUuanNcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG5cclxuc2VsZiA9ICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJylcclxuXHQ/IHdpbmRvdyAgIC8vIGlmIGluIGJyb3dzZXJcclxuXHQ6IChcclxuXHRcdCh0eXBlb2YgV29ya2VyR2xvYmFsU2NvcGUgIT09ICd1bmRlZmluZWQnICYmIHNlbGYgaW5zdGFuY2VvZiBXb3JrZXJHbG9iYWxTY29wZSlcclxuXHRcdD8gc2VsZiAvLyBpZiBpbiB3b3JrZXJcclxuXHRcdDoge30gICAvLyBpZiBpbiBub2RlIGpzXHJcblx0KTtcclxuXHJcbi8qKlxyXG4gKiBQcmlzbTogTGlnaHR3ZWlnaHQsIHJvYnVzdCwgZWxlZ2FudCBzeW50YXggaGlnaGxpZ2h0aW5nXHJcbiAqIE1JVCBsaWNlbnNlIGh0dHA6Ly93d3cub3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvbWl0LWxpY2Vuc2UucGhwL1xyXG4gKiBAYXV0aG9yIExlYSBWZXJvdSBodHRwOi8vbGVhLnZlcm91Lm1lXHJcbiAqL1xyXG5cclxudmFyIFByaXNtID0gKGZ1bmN0aW9uKCl7XHJcblxyXG4vLyBQcml2YXRlIGhlbHBlciB2YXJzXHJcbnZhciBsYW5nID0gL1xcYmxhbmcoPzp1YWdlKT8tKD8hXFwqKShcXHcrKVxcYi9pO1xyXG5cclxudmFyIF8gPSBzZWxmLlByaXNtID0ge1xyXG5cdHV0aWw6IHtcclxuXHRcdGVuY29kZTogZnVuY3Rpb24gKHRva2Vucykge1xyXG5cdFx0XHRpZiAodG9rZW5zIGluc3RhbmNlb2YgVG9rZW4pIHtcclxuXHRcdFx0XHRyZXR1cm4gbmV3IFRva2VuKHRva2Vucy50eXBlLCBfLnV0aWwuZW5jb2RlKHRva2Vucy5jb250ZW50KSwgdG9rZW5zLmFsaWFzKTtcclxuXHRcdFx0fSBlbHNlIGlmIChfLnV0aWwudHlwZSh0b2tlbnMpID09PSAnQXJyYXknKSB7XHJcblx0XHRcdFx0cmV0dXJuIHRva2Vucy5tYXAoXy51dGlsLmVuY29kZSk7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0cmV0dXJuIHRva2Vucy5yZXBsYWNlKC8mL2csICcmYW1wOycpLnJlcGxhY2UoLzwvZywgJyZsdDsnKS5yZXBsYWNlKC9cXHUwMGEwL2csICcgJyk7XHJcblx0XHRcdH1cclxuXHRcdH0sXHJcblxyXG5cdFx0dHlwZTogZnVuY3Rpb24gKG8pIHtcclxuXHRcdFx0cmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKS5tYXRjaCgvXFxbb2JqZWN0IChcXHcrKVxcXS8pWzFdO1xyXG5cdFx0fSxcclxuXHJcblx0XHQvLyBEZWVwIGNsb25lIGEgbGFuZ3VhZ2UgZGVmaW5pdGlvbiAoZS5nLiB0byBleHRlbmQgaXQpXHJcblx0XHRjbG9uZTogZnVuY3Rpb24gKG8pIHtcclxuXHRcdFx0dmFyIHR5cGUgPSBfLnV0aWwudHlwZShvKTtcclxuXHJcblx0XHRcdHN3aXRjaCAodHlwZSkge1xyXG5cdFx0XHRcdGNhc2UgJ09iamVjdCc6XHJcblx0XHRcdFx0XHR2YXIgY2xvbmUgPSB7fTtcclxuXHJcblx0XHRcdFx0XHRmb3IgKHZhciBrZXkgaW4gbykge1xyXG5cdFx0XHRcdFx0XHRpZiAoby5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XHJcblx0XHRcdFx0XHRcdFx0Y2xvbmVba2V5XSA9IF8udXRpbC5jbG9uZShvW2tleV0pO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdFx0cmV0dXJuIGNsb25lO1xyXG5cclxuXHRcdFx0XHRjYXNlICdBcnJheSc6XHJcblx0XHRcdFx0XHRyZXR1cm4gby5tYXAoZnVuY3Rpb24odikgeyByZXR1cm4gXy51dGlsLmNsb25lKHYpOyB9KTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0cmV0dXJuIG87XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0bGFuZ3VhZ2VzOiB7XHJcblx0XHRleHRlbmQ6IGZ1bmN0aW9uIChpZCwgcmVkZWYpIHtcclxuXHRcdFx0dmFyIGxhbmcgPSBfLnV0aWwuY2xvbmUoXy5sYW5ndWFnZXNbaWRdKTtcclxuXHJcblx0XHRcdGZvciAodmFyIGtleSBpbiByZWRlZikge1xyXG5cdFx0XHRcdGxhbmdba2V5XSA9IHJlZGVmW2tleV07XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdHJldHVybiBsYW5nO1xyXG5cdFx0fSxcclxuXHJcblx0XHQvKipcclxuXHRcdCAqIEluc2VydCBhIHRva2VuIGJlZm9yZSBhbm90aGVyIHRva2VuIGluIGEgbGFuZ3VhZ2UgbGl0ZXJhbFxyXG5cdFx0ICogQXMgdGhpcyBuZWVkcyB0byByZWNyZWF0ZSB0aGUgb2JqZWN0ICh3ZSBjYW5ub3QgYWN0dWFsbHkgaW5zZXJ0IGJlZm9yZSBrZXlzIGluIG9iamVjdCBsaXRlcmFscyksXHJcblx0XHQgKiB3ZSBjYW5ub3QganVzdCBwcm92aWRlIGFuIG9iamVjdCwgd2UgbmVlZCBhbm9iamVjdCBhbmQgYSBrZXkuXHJcblx0XHQgKiBAcGFyYW0gaW5zaWRlIFRoZSBrZXkgKG9yIGxhbmd1YWdlIGlkKSBvZiB0aGUgcGFyZW50XHJcblx0XHQgKiBAcGFyYW0gYmVmb3JlIFRoZSBrZXkgdG8gaW5zZXJ0IGJlZm9yZS4gSWYgbm90IHByb3ZpZGVkLCB0aGUgZnVuY3Rpb24gYXBwZW5kcyBpbnN0ZWFkLlxyXG5cdFx0ICogQHBhcmFtIGluc2VydCBPYmplY3Qgd2l0aCB0aGUga2V5L3ZhbHVlIHBhaXJzIHRvIGluc2VydFxyXG5cdFx0ICogQHBhcmFtIHJvb3QgVGhlIG9iamVjdCB0aGF0IGNvbnRhaW5zIGBpbnNpZGVgLiBJZiBlcXVhbCB0byBQcmlzbS5sYW5ndWFnZXMsIGl0IGNhbiBiZSBvbWl0dGVkLlxyXG5cdFx0ICovXHJcblx0XHRpbnNlcnRCZWZvcmU6IGZ1bmN0aW9uIChpbnNpZGUsIGJlZm9yZSwgaW5zZXJ0LCByb290KSB7XHJcblx0XHRcdHJvb3QgPSByb290IHx8IF8ubGFuZ3VhZ2VzO1xyXG5cdFx0XHR2YXIgZ3JhbW1hciA9IHJvb3RbaW5zaWRlXTtcclxuXHRcdFx0XHJcblx0XHRcdGlmIChhcmd1bWVudHMubGVuZ3RoID09IDIpIHtcclxuXHRcdFx0XHRpbnNlcnQgPSBhcmd1bWVudHNbMV07XHJcblx0XHRcdFx0XHJcblx0XHRcdFx0Zm9yICh2YXIgbmV3VG9rZW4gaW4gaW5zZXJ0KSB7XHJcblx0XHRcdFx0XHRpZiAoaW5zZXJ0Lmhhc093blByb3BlcnR5KG5ld1Rva2VuKSkge1xyXG5cdFx0XHRcdFx0XHRncmFtbWFyW25ld1Rva2VuXSA9IGluc2VydFtuZXdUb2tlbl07XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdHJldHVybiBncmFtbWFyO1xyXG5cdFx0XHR9XHJcblx0XHRcdFxyXG5cdFx0XHR2YXIgcmV0ID0ge307XHJcblxyXG5cdFx0XHRmb3IgKHZhciB0b2tlbiBpbiBncmFtbWFyKSB7XHJcblxyXG5cdFx0XHRcdGlmIChncmFtbWFyLmhhc093blByb3BlcnR5KHRva2VuKSkge1xyXG5cclxuXHRcdFx0XHRcdGlmICh0b2tlbiA9PSBiZWZvcmUpIHtcclxuXHJcblx0XHRcdFx0XHRcdGZvciAodmFyIG5ld1Rva2VuIGluIGluc2VydCkge1xyXG5cclxuXHRcdFx0XHRcdFx0XHRpZiAoaW5zZXJ0Lmhhc093blByb3BlcnR5KG5ld1Rva2VuKSkge1xyXG5cdFx0XHRcdFx0XHRcdFx0cmV0W25ld1Rva2VuXSA9IGluc2VydFtuZXdUb2tlbl07XHJcblx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdFx0cmV0W3Rva2VuXSA9IGdyYW1tYXJbdG9rZW5dO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0XHRcclxuXHRcdFx0Ly8gVXBkYXRlIHJlZmVyZW5jZXMgaW4gb3RoZXIgbGFuZ3VhZ2UgZGVmaW5pdGlvbnNcclxuXHRcdFx0Xy5sYW5ndWFnZXMuREZTKF8ubGFuZ3VhZ2VzLCBmdW5jdGlvbihrZXksIHZhbHVlKSB7XHJcblx0XHRcdFx0aWYgKHZhbHVlID09PSByb290W2luc2lkZV0gJiYga2V5ICE9IGluc2lkZSkge1xyXG5cdFx0XHRcdFx0dGhpc1trZXldID0gcmV0O1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSk7XHJcblxyXG5cdFx0XHRyZXR1cm4gcm9vdFtpbnNpZGVdID0gcmV0O1xyXG5cdFx0fSxcclxuXHJcblx0XHQvLyBUcmF2ZXJzZSBhIGxhbmd1YWdlIGRlZmluaXRpb24gd2l0aCBEZXB0aCBGaXJzdCBTZWFyY2hcclxuXHRcdERGUzogZnVuY3Rpb24obywgY2FsbGJhY2ssIHR5cGUpIHtcclxuXHRcdFx0Zm9yICh2YXIgaSBpbiBvKSB7XHJcblx0XHRcdFx0aWYgKG8uaGFzT3duUHJvcGVydHkoaSkpIHtcclxuXHRcdFx0XHRcdGNhbGxiYWNrLmNhbGwobywgaSwgb1tpXSwgdHlwZSB8fCBpKTtcclxuXHJcblx0XHRcdFx0XHRpZiAoXy51dGlsLnR5cGUob1tpXSkgPT09ICdPYmplY3QnKSB7XHJcblx0XHRcdFx0XHRcdF8ubGFuZ3VhZ2VzLkRGUyhvW2ldLCBjYWxsYmFjayk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRlbHNlIGlmIChfLnV0aWwudHlwZShvW2ldKSA9PT0gJ0FycmF5Jykge1xyXG5cdFx0XHRcdFx0XHRfLmxhbmd1YWdlcy5ERlMob1tpXSwgY2FsbGJhY2ssIGkpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGhpZ2hsaWdodEFsbDogZnVuY3Rpb24oYXN5bmMsIGNhbGxiYWNrKSB7XHJcblx0XHR2YXIgZWxlbWVudHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdjb2RlW2NsYXNzKj1cImxhbmd1YWdlLVwiXSwgW2NsYXNzKj1cImxhbmd1YWdlLVwiXSBjb2RlLCBjb2RlW2NsYXNzKj1cImxhbmctXCJdLCBbY2xhc3MqPVwibGFuZy1cIl0gY29kZScpO1xyXG5cclxuXHRcdGZvciAodmFyIGk9MCwgZWxlbWVudDsgZWxlbWVudCA9IGVsZW1lbnRzW2krK107KSB7XHJcblx0XHRcdF8uaGlnaGxpZ2h0RWxlbWVudChlbGVtZW50LCBhc3luYyA9PT0gdHJ1ZSwgY2FsbGJhY2spO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGhpZ2hsaWdodEVsZW1lbnQ6IGZ1bmN0aW9uKGVsZW1lbnQsIGFzeW5jLCBjYWxsYmFjaykge1xyXG5cdFx0Ly8gRmluZCBsYW5ndWFnZVxyXG5cdFx0dmFyIGxhbmd1YWdlLCBncmFtbWFyLCBwYXJlbnQgPSBlbGVtZW50O1xyXG5cclxuXHRcdHdoaWxlIChwYXJlbnQgJiYgIWxhbmcudGVzdChwYXJlbnQuY2xhc3NOYW1lKSkge1xyXG5cdFx0XHRwYXJlbnQgPSBwYXJlbnQucGFyZW50Tm9kZTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAocGFyZW50KSB7XHJcblx0XHRcdGxhbmd1YWdlID0gKHBhcmVudC5jbGFzc05hbWUubWF0Y2gobGFuZykgfHwgWywnJ10pWzFdO1xyXG5cdFx0XHRncmFtbWFyID0gXy5sYW5ndWFnZXNbbGFuZ3VhZ2VdO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmICghZ3JhbW1hcikge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gU2V0IGxhbmd1YWdlIG9uIHRoZSBlbGVtZW50LCBpZiBub3QgcHJlc2VudFxyXG5cdFx0ZWxlbWVudC5jbGFzc05hbWUgPSBlbGVtZW50LmNsYXNzTmFtZS5yZXBsYWNlKGxhbmcsICcnKS5yZXBsYWNlKC9cXHMrL2csICcgJykgKyAnIGxhbmd1YWdlLScgKyBsYW5ndWFnZTtcclxuXHJcblx0XHQvLyBTZXQgbGFuZ3VhZ2Ugb24gdGhlIHBhcmVudCwgZm9yIHN0eWxpbmdcclxuXHRcdHBhcmVudCA9IGVsZW1lbnQucGFyZW50Tm9kZTtcclxuXHJcblx0XHRpZiAoL3ByZS9pLnRlc3QocGFyZW50Lm5vZGVOYW1lKSkge1xyXG5cdFx0XHRwYXJlbnQuY2xhc3NOYW1lID0gcGFyZW50LmNsYXNzTmFtZS5yZXBsYWNlKGxhbmcsICcnKS5yZXBsYWNlKC9cXHMrL2csICcgJykgKyAnIGxhbmd1YWdlLScgKyBsYW5ndWFnZTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgY29kZSA9IGVsZW1lbnQudGV4dENvbnRlbnQ7XHJcblxyXG5cdFx0aWYoIWNvZGUpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdGNvZGUgPSBjb2RlLnJlcGxhY2UoL14oPzpcXHI/XFxufFxccikvLCcnKTtcclxuXHJcblx0XHR2YXIgZW52ID0ge1xyXG5cdFx0XHRlbGVtZW50OiBlbGVtZW50LFxyXG5cdFx0XHRsYW5ndWFnZTogbGFuZ3VhZ2UsXHJcblx0XHRcdGdyYW1tYXI6IGdyYW1tYXIsXHJcblx0XHRcdGNvZGU6IGNvZGVcclxuXHRcdH07XHJcblxyXG5cdFx0Xy5ob29rcy5ydW4oJ2JlZm9yZS1oaWdobGlnaHQnLCBlbnYpO1xyXG5cclxuXHRcdGlmIChhc3luYyAmJiBzZWxmLldvcmtlcikge1xyXG5cdFx0XHR2YXIgd29ya2VyID0gbmV3IFdvcmtlcihfLmZpbGVuYW1lKTtcclxuXHJcblx0XHRcdHdvcmtlci5vbm1lc3NhZ2UgPSBmdW5jdGlvbihldnQpIHtcclxuXHRcdFx0XHRlbnYuaGlnaGxpZ2h0ZWRDb2RlID0gVG9rZW4uc3RyaW5naWZ5KEpTT04ucGFyc2UoZXZ0LmRhdGEpLCBsYW5ndWFnZSk7XHJcblxyXG5cdFx0XHRcdF8uaG9va3MucnVuKCdiZWZvcmUtaW5zZXJ0JywgZW52KTtcclxuXHJcblx0XHRcdFx0ZW52LmVsZW1lbnQuaW5uZXJIVE1MID0gZW52LmhpZ2hsaWdodGVkQ29kZTtcclxuXHJcblx0XHRcdFx0Y2FsbGJhY2sgJiYgY2FsbGJhY2suY2FsbChlbnYuZWxlbWVudCk7XHJcblx0XHRcdFx0Xy5ob29rcy5ydW4oJ2FmdGVyLWhpZ2hsaWdodCcsIGVudik7XHJcblx0XHRcdH07XHJcblxyXG5cdFx0XHR3b3JrZXIucG9zdE1lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoe1xyXG5cdFx0XHRcdGxhbmd1YWdlOiBlbnYubGFuZ3VhZ2UsXHJcblx0XHRcdFx0Y29kZTogZW52LmNvZGVcclxuXHRcdFx0fSkpO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdGVudi5oaWdobGlnaHRlZENvZGUgPSBfLmhpZ2hsaWdodChlbnYuY29kZSwgZW52LmdyYW1tYXIsIGVudi5sYW5ndWFnZSk7XHJcblxyXG5cdFx0XHRfLmhvb2tzLnJ1bignYmVmb3JlLWluc2VydCcsIGVudik7XHJcblxyXG5cdFx0XHRlbnYuZWxlbWVudC5pbm5lckhUTUwgPSBlbnYuaGlnaGxpZ2h0ZWRDb2RlO1xyXG5cclxuXHRcdFx0Y2FsbGJhY2sgJiYgY2FsbGJhY2suY2FsbChlbGVtZW50KTtcclxuXHJcblx0XHRcdF8uaG9va3MucnVuKCdhZnRlci1oaWdobGlnaHQnLCBlbnYpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGhpZ2hsaWdodDogZnVuY3Rpb24gKHRleHQsIGdyYW1tYXIsIGxhbmd1YWdlKSB7XHJcblx0XHR2YXIgdG9rZW5zID0gXy50b2tlbml6ZSh0ZXh0LCBncmFtbWFyKTtcclxuXHRcdHJldHVybiBUb2tlbi5zdHJpbmdpZnkoXy51dGlsLmVuY29kZSh0b2tlbnMpLCBsYW5ndWFnZSk7XHJcblx0fSxcclxuXHJcblx0dG9rZW5pemU6IGZ1bmN0aW9uKHRleHQsIGdyYW1tYXIsIGxhbmd1YWdlKSB7XHJcblx0XHR2YXIgVG9rZW4gPSBfLlRva2VuO1xyXG5cclxuXHRcdHZhciBzdHJhcnIgPSBbdGV4dF07XHJcblxyXG5cdFx0dmFyIHJlc3QgPSBncmFtbWFyLnJlc3Q7XHJcblxyXG5cdFx0aWYgKHJlc3QpIHtcclxuXHRcdFx0Zm9yICh2YXIgdG9rZW4gaW4gcmVzdCkge1xyXG5cdFx0XHRcdGdyYW1tYXJbdG9rZW5dID0gcmVzdFt0b2tlbl07XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGRlbGV0ZSBncmFtbWFyLnJlc3Q7XHJcblx0XHR9XHJcblxyXG5cdFx0dG9rZW5sb29wOiBmb3IgKHZhciB0b2tlbiBpbiBncmFtbWFyKSB7XHJcblx0XHRcdGlmKCFncmFtbWFyLmhhc093blByb3BlcnR5KHRva2VuKSB8fCAhZ3JhbW1hclt0b2tlbl0pIHtcclxuXHRcdFx0XHRjb250aW51ZTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0dmFyIHBhdHRlcm5zID0gZ3JhbW1hclt0b2tlbl07XHJcblx0XHRcdHBhdHRlcm5zID0gKF8udXRpbC50eXBlKHBhdHRlcm5zKSA9PT0gXCJBcnJheVwiKSA/IHBhdHRlcm5zIDogW3BhdHRlcm5zXTtcclxuXHJcblx0XHRcdGZvciAodmFyIGogPSAwOyBqIDwgcGF0dGVybnMubGVuZ3RoOyArK2opIHtcclxuXHRcdFx0XHR2YXIgcGF0dGVybiA9IHBhdHRlcm5zW2pdLFxyXG5cdFx0XHRcdFx0aW5zaWRlID0gcGF0dGVybi5pbnNpZGUsXHJcblx0XHRcdFx0XHRsb29rYmVoaW5kID0gISFwYXR0ZXJuLmxvb2tiZWhpbmQsXHJcblx0XHRcdFx0XHRsb29rYmVoaW5kTGVuZ3RoID0gMCxcclxuXHRcdFx0XHRcdGFsaWFzID0gcGF0dGVybi5hbGlhcztcclxuXHJcblx0XHRcdFx0cGF0dGVybiA9IHBhdHRlcm4ucGF0dGVybiB8fCBwYXR0ZXJuO1xyXG5cclxuXHRcdFx0XHRmb3IgKHZhciBpPTA7IGk8c3RyYXJyLmxlbmd0aDsgaSsrKSB7IC8vIERvbuKAmXQgY2FjaGUgbGVuZ3RoIGFzIGl0IGNoYW5nZXMgZHVyaW5nIHRoZSBsb29wXHJcblxyXG5cdFx0XHRcdFx0dmFyIHN0ciA9IHN0cmFycltpXTtcclxuXHJcblx0XHRcdFx0XHRpZiAoc3RyYXJyLmxlbmd0aCA+IHRleHQubGVuZ3RoKSB7XHJcblx0XHRcdFx0XHRcdC8vIFNvbWV0aGluZyB3ZW50IHRlcnJpYmx5IHdyb25nLCBBQk9SVCwgQUJPUlQhXHJcblx0XHRcdFx0XHRcdGJyZWFrIHRva2VubG9vcDtcclxuXHRcdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0XHRpZiAoc3RyIGluc3RhbmNlb2YgVG9rZW4pIHtcclxuXHRcdFx0XHRcdFx0Y29udGludWU7XHJcblx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdFx0cGF0dGVybi5sYXN0SW5kZXggPSAwO1xyXG5cclxuXHRcdFx0XHRcdHZhciBtYXRjaCA9IHBhdHRlcm4uZXhlYyhzdHIpO1xyXG5cclxuXHRcdFx0XHRcdGlmIChtYXRjaCkge1xyXG5cdFx0XHRcdFx0XHRpZihsb29rYmVoaW5kKSB7XHJcblx0XHRcdFx0XHRcdFx0bG9va2JlaGluZExlbmd0aCA9IG1hdGNoWzFdLmxlbmd0aDtcclxuXHRcdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRcdFx0dmFyIGZyb20gPSBtYXRjaC5pbmRleCAtIDEgKyBsb29rYmVoaW5kTGVuZ3RoLFxyXG5cdFx0XHRcdFx0XHRcdG1hdGNoID0gbWF0Y2hbMF0uc2xpY2UobG9va2JlaGluZExlbmd0aCksXHJcblx0XHRcdFx0XHRcdFx0bGVuID0gbWF0Y2gubGVuZ3RoLFxyXG5cdFx0XHRcdFx0XHRcdHRvID0gZnJvbSArIGxlbixcclxuXHRcdFx0XHRcdFx0XHRiZWZvcmUgPSBzdHIuc2xpY2UoMCwgZnJvbSArIDEpLFxyXG5cdFx0XHRcdFx0XHRcdGFmdGVyID0gc3RyLnNsaWNlKHRvICsgMSk7XHJcblxyXG5cdFx0XHRcdFx0XHR2YXIgYXJncyA9IFtpLCAxXTtcclxuXHJcblx0XHRcdFx0XHRcdGlmIChiZWZvcmUpIHtcclxuXHRcdFx0XHRcdFx0XHRhcmdzLnB1c2goYmVmb3JlKTtcclxuXHRcdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRcdFx0dmFyIHdyYXBwZWQgPSBuZXcgVG9rZW4odG9rZW4sIGluc2lkZT8gXy50b2tlbml6ZShtYXRjaCwgaW5zaWRlKSA6IG1hdGNoLCBhbGlhcyk7XHJcblxyXG5cdFx0XHRcdFx0XHRhcmdzLnB1c2god3JhcHBlZCk7XHJcblxyXG5cdFx0XHRcdFx0XHRpZiAoYWZ0ZXIpIHtcclxuXHRcdFx0XHRcdFx0XHRhcmdzLnB1c2goYWZ0ZXIpO1xyXG5cdFx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdFx0XHRBcnJheS5wcm90b3R5cGUuc3BsaWNlLmFwcGx5KHN0cmFyciwgYXJncyk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHN0cmFycjtcclxuXHR9LFxyXG5cclxuXHRob29rczoge1xyXG5cdFx0YWxsOiB7fSxcclxuXHJcblx0XHRhZGQ6IGZ1bmN0aW9uIChuYW1lLCBjYWxsYmFjaykge1xyXG5cdFx0XHR2YXIgaG9va3MgPSBfLmhvb2tzLmFsbDtcclxuXHJcblx0XHRcdGhvb2tzW25hbWVdID0gaG9va3NbbmFtZV0gfHwgW107XHJcblxyXG5cdFx0XHRob29rc1tuYW1lXS5wdXNoKGNhbGxiYWNrKTtcclxuXHRcdH0sXHJcblxyXG5cdFx0cnVuOiBmdW5jdGlvbiAobmFtZSwgZW52KSB7XHJcblx0XHRcdHZhciBjYWxsYmFja3MgPSBfLmhvb2tzLmFsbFtuYW1lXTtcclxuXHJcblx0XHRcdGlmICghY2FsbGJhY2tzIHx8ICFjYWxsYmFja3MubGVuZ3RoKSB7XHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRmb3IgKHZhciBpPTAsIGNhbGxiYWNrOyBjYWxsYmFjayA9IGNhbGxiYWNrc1tpKytdOykge1xyXG5cdFx0XHRcdGNhbGxiYWNrKGVudik7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9XHJcbn07XHJcblxyXG52YXIgVG9rZW4gPSBfLlRva2VuID0gZnVuY3Rpb24odHlwZSwgY29udGVudCwgYWxpYXMpIHtcclxuXHR0aGlzLnR5cGUgPSB0eXBlO1xyXG5cdHRoaXMuY29udGVudCA9IGNvbnRlbnQ7XHJcblx0dGhpcy5hbGlhcyA9IGFsaWFzO1xyXG59O1xyXG5cclxuVG9rZW4uc3RyaW5naWZ5ID0gZnVuY3Rpb24obywgbGFuZ3VhZ2UsIHBhcmVudCkge1xyXG5cdGlmICh0eXBlb2YgbyA9PSAnc3RyaW5nJykge1xyXG5cdFx0cmV0dXJuIG87XHJcblx0fVxyXG5cclxuXHRpZiAoXy51dGlsLnR5cGUobykgPT09ICdBcnJheScpIHtcclxuXHRcdHJldHVybiBvLm1hcChmdW5jdGlvbihlbGVtZW50KSB7XHJcblx0XHRcdHJldHVybiBUb2tlbi5zdHJpbmdpZnkoZWxlbWVudCwgbGFuZ3VhZ2UsIG8pO1xyXG5cdFx0fSkuam9pbignJyk7XHJcblx0fVxyXG5cclxuXHR2YXIgZW52ID0ge1xyXG5cdFx0dHlwZTogby50eXBlLFxyXG5cdFx0Y29udGVudDogVG9rZW4uc3RyaW5naWZ5KG8uY29udGVudCwgbGFuZ3VhZ2UsIHBhcmVudCksXHJcblx0XHR0YWc6ICdzcGFuJyxcclxuXHRcdGNsYXNzZXM6IFsndG9rZW4nLCBvLnR5cGVdLFxyXG5cdFx0YXR0cmlidXRlczoge30sXHJcblx0XHRsYW5ndWFnZTogbGFuZ3VhZ2UsXHJcblx0XHRwYXJlbnQ6IHBhcmVudFxyXG5cdH07XHJcblxyXG5cdGlmIChlbnYudHlwZSA9PSAnY29tbWVudCcpIHtcclxuXHRcdGVudi5hdHRyaWJ1dGVzWydzcGVsbGNoZWNrJ10gPSAndHJ1ZSc7XHJcblx0fVxyXG5cclxuXHRpZiAoby5hbGlhcykge1xyXG5cdFx0dmFyIGFsaWFzZXMgPSBfLnV0aWwudHlwZShvLmFsaWFzKSA9PT0gJ0FycmF5JyA/IG8uYWxpYXMgOiBbby5hbGlhc107XHJcblx0XHRBcnJheS5wcm90b3R5cGUucHVzaC5hcHBseShlbnYuY2xhc3NlcywgYWxpYXNlcyk7XHJcblx0fVxyXG5cclxuXHRfLmhvb2tzLnJ1bignd3JhcCcsIGVudik7XHJcblxyXG5cdHZhciBhdHRyaWJ1dGVzID0gJyc7XHJcblxyXG5cdGZvciAodmFyIG5hbWUgaW4gZW52LmF0dHJpYnV0ZXMpIHtcclxuXHRcdGF0dHJpYnV0ZXMgKz0gbmFtZSArICc9XCInICsgKGVudi5hdHRyaWJ1dGVzW25hbWVdIHx8ICcnKSArICdcIic7XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gJzwnICsgZW52LnRhZyArICcgY2xhc3M9XCInICsgZW52LmNsYXNzZXMuam9pbignICcpICsgJ1wiICcgKyBhdHRyaWJ1dGVzICsgJz4nICsgZW52LmNvbnRlbnQgKyAnPC8nICsgZW52LnRhZyArICc+JztcclxuXHJcbn07XHJcblxyXG5pZiAoIXNlbGYuZG9jdW1lbnQpIHtcclxuXHRpZiAoIXNlbGYuYWRkRXZlbnRMaXN0ZW5lcikge1xyXG5cdFx0Ly8gaW4gTm9kZS5qc1xyXG5cdFx0cmV0dXJuIHNlbGYuUHJpc207XHJcblx0fVxyXG4gXHQvLyBJbiB3b3JrZXJcclxuXHRzZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbihldnQpIHtcclxuXHRcdHZhciBtZXNzYWdlID0gSlNPTi5wYXJzZShldnQuZGF0YSksXHJcblx0XHQgICAgbGFuZyA9IG1lc3NhZ2UubGFuZ3VhZ2UsXHJcblx0XHQgICAgY29kZSA9IG1lc3NhZ2UuY29kZTtcclxuXHJcblx0XHRzZWxmLnBvc3RNZXNzYWdlKEpTT04uc3RyaW5naWZ5KF8udXRpbC5lbmNvZGUoXy50b2tlbml6ZShjb2RlLCBfLmxhbmd1YWdlc1tsYW5nXSkpKSk7XHJcblx0XHRzZWxmLmNsb3NlKCk7XHJcblx0fSwgZmFsc2UpO1xyXG5cclxuXHRyZXR1cm4gc2VsZi5QcmlzbTtcclxufVxyXG5cclxuLy8gR2V0IGN1cnJlbnQgc2NyaXB0IGFuZCBoaWdobGlnaHRcclxudmFyIHNjcmlwdCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKTtcclxuXHJcbnNjcmlwdCA9IHNjcmlwdFtzY3JpcHQubGVuZ3RoIC0gMV07XHJcblxyXG5pZiAoc2NyaXB0KSB7XHJcblx0Xy5maWxlbmFtZSA9IHNjcmlwdC5zcmM7XHJcblxyXG5cdGlmIChkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyICYmICFzY3JpcHQuaGFzQXR0cmlidXRlKCdkYXRhLW1hbnVhbCcpKSB7XHJcblx0XHRkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgXy5oaWdobGlnaHRBbGwpO1xyXG5cdH1cclxufVxyXG5cclxucmV0dXJuIHNlbGYuUHJpc207XHJcblxyXG59KSgpO1xyXG5cclxuaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKSB7XHJcblx0bW9kdWxlLmV4cG9ydHMgPSBQcmlzbTtcclxufVxyXG5cclxuXHJcbi8qICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICAgICBCZWdpbiBwcmlzbS1tYXJrdXAuanNcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG5cclxuUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cCA9IHtcclxuXHQnY29tbWVudCc6IC88IS0tW1xcd1xcV10qPy0tPi8sXHJcblx0J3Byb2xvZyc6IC88XFw/Lis/XFw/Pi8sXHJcblx0J2RvY3R5cGUnOiAvPCFET0NUWVBFLis/Pi8sXHJcblx0J2NkYXRhJzogLzwhXFxbQ0RBVEFcXFtbXFx3XFxXXSo/XV0+L2ksXHJcblx0J3RhZyc6IHtcclxuXHRcdHBhdHRlcm46IC88XFwvP1tcXHc6LV0rXFxzKig/OlxccytbXFx3Oi1dKyg/Oj0oPzooXCJ8JykoXFxcXD9bXFx3XFxXXSkqP1xcMXxbXlxccydcIj49XSspKT9cXHMqKSpcXC8/Pi9pLFxyXG5cdFx0aW5zaWRlOiB7XHJcblx0XHRcdCd0YWcnOiB7XHJcblx0XHRcdFx0cGF0dGVybjogL148XFwvP1tcXHc6LV0rL2ksXHJcblx0XHRcdFx0aW5zaWRlOiB7XHJcblx0XHRcdFx0XHQncHVuY3R1YXRpb24nOiAvXjxcXC8/LyxcclxuXHRcdFx0XHRcdCduYW1lc3BhY2UnOiAvXltcXHctXSs/Oi9cclxuXHRcdFx0XHR9XHJcblx0XHRcdH0sXHJcblx0XHRcdCdhdHRyLXZhbHVlJzoge1xyXG5cdFx0XHRcdHBhdHRlcm46IC89KD86KCd8XCIpW1xcd1xcV10qPyhcXDEpfFteXFxzPl0rKS9pLFxyXG5cdFx0XHRcdGluc2lkZToge1xyXG5cdFx0XHRcdFx0J3B1bmN0dWF0aW9uJzogLz18PnxcIi9cclxuXHRcdFx0XHR9XHJcblx0XHRcdH0sXHJcblx0XHRcdCdwdW5jdHVhdGlvbic6IC9cXC8/Pi8sXHJcblx0XHRcdCdhdHRyLW5hbWUnOiB7XHJcblx0XHRcdFx0cGF0dGVybjogL1tcXHc6LV0rLyxcclxuXHRcdFx0XHRpbnNpZGU6IHtcclxuXHRcdFx0XHRcdCduYW1lc3BhY2UnOiAvXltcXHctXSs/Oi9cclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHJcblx0XHR9XHJcblx0fSxcclxuXHQnZW50aXR5JzogLyYjP1tcXGRhLXpdezEsOH07L2lcclxufTtcclxuXHJcbi8vIFBsdWdpbiB0byBtYWtlIGVudGl0eSB0aXRsZSBzaG93IHRoZSByZWFsIGVudGl0eSwgaWRlYSBieSBSb21hbiBLb21hcm92XHJcblByaXNtLmhvb2tzLmFkZCgnd3JhcCcsIGZ1bmN0aW9uKGVudikge1xyXG5cclxuXHRpZiAoZW52LnR5cGUgPT09ICdlbnRpdHknKSB7XHJcblx0XHRlbnYuYXR0cmlidXRlc1sndGl0bGUnXSA9IGVudi5jb250ZW50LnJlcGxhY2UoLyZhbXA7LywgJyYnKTtcclxuXHR9XHJcbn0pO1xyXG5cclxuXHJcbi8qICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICAgICBCZWdpbiBwcmlzbS1jc3MuanNcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG5cclxuUHJpc20ubGFuZ3VhZ2VzLmNzcyA9IHtcclxuXHQnY29tbWVudCc6IC9cXC9cXCpbXFx3XFxXXSo/XFwqXFwvLyxcclxuXHQnYXRydWxlJzoge1xyXG5cdFx0cGF0dGVybjogL0BbXFx3LV0rPy4qPyg7fCg/PVxccypcXHspKS9pLFxyXG5cdFx0aW5zaWRlOiB7XHJcblx0XHRcdCdwdW5jdHVhdGlvbic6IC9bOzpdL1xyXG5cdFx0fVxyXG5cdH0sXHJcblx0J3VybCc6IC91cmxcXCgoPzooW1wiJ10pKFxcXFxcXG58XFxcXD8uKSo/XFwxfC4qPylcXCkvaSxcclxuXHQnc2VsZWN0b3InOiAvW15cXHtcXH1cXHNdW15cXHtcXH07XSooPz1cXHMqXFx7KS8sXHJcblx0J3N0cmluZyc6IC8oXCJ8JykoXFxcXFxcbnxcXFxcPy4pKj9cXDEvLFxyXG5cdCdwcm9wZXJ0eSc6IC8oXFxifFxcQilbXFx3LV0rKD89XFxzKjopL2ksXHJcblx0J2ltcG9ydGFudCc6IC9cXEIhaW1wb3J0YW50XFxiL2ksXHJcblx0J3B1bmN0dWF0aW9uJzogL1tcXHtcXH07Ol0vLFxyXG5cdCdmdW5jdGlvbic6IC9bLWEtejAtOV0rKD89XFwoKS9pXHJcbn07XHJcblxyXG5pZiAoUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cCkge1xyXG5cdFByaXNtLmxhbmd1YWdlcy5pbnNlcnRCZWZvcmUoJ21hcmt1cCcsICd0YWcnLCB7XHJcblx0XHQnc3R5bGUnOiB7XHJcblx0XHRcdHBhdHRlcm46IC88c3R5bGVbXFx3XFxXXSo/PltcXHdcXFddKj88XFwvc3R5bGU+L2ksXHJcblx0XHRcdGluc2lkZToge1xyXG5cdFx0XHRcdCd0YWcnOiB7XHJcblx0XHRcdFx0XHRwYXR0ZXJuOiAvPHN0eWxlW1xcd1xcV10qPz58PFxcL3N0eWxlPi9pLFxyXG5cdFx0XHRcdFx0aW5zaWRlOiBQcmlzbS5sYW5ndWFnZXMubWFya3VwLnRhZy5pbnNpZGVcclxuXHRcdFx0XHR9LFxyXG5cdFx0XHRcdHJlc3Q6IFByaXNtLmxhbmd1YWdlcy5jc3NcclxuXHRcdFx0fSxcclxuXHRcdFx0YWxpYXM6ICdsYW5ndWFnZS1jc3MnXHJcblx0XHR9XHJcblx0fSk7XHJcblx0XHJcblx0UHJpc20ubGFuZ3VhZ2VzLmluc2VydEJlZm9yZSgnaW5zaWRlJywgJ2F0dHItdmFsdWUnLCB7XHJcblx0XHQnc3R5bGUtYXR0cic6IHtcclxuXHRcdFx0cGF0dGVybjogL1xccypzdHlsZT0oXCJ8JykuKj9cXDEvaSxcclxuXHRcdFx0aW5zaWRlOiB7XHJcblx0XHRcdFx0J2F0dHItbmFtZSc6IHtcclxuXHRcdFx0XHRcdHBhdHRlcm46IC9eXFxzKnN0eWxlL2ksXHJcblx0XHRcdFx0XHRpbnNpZGU6IFByaXNtLmxhbmd1YWdlcy5tYXJrdXAudGFnLmluc2lkZVxyXG5cdFx0XHRcdH0sXHJcblx0XHRcdFx0J3B1bmN0dWF0aW9uJzogL15cXHMqPVxccypbJ1wiXXxbJ1wiXVxccyokLyxcclxuXHRcdFx0XHQnYXR0ci12YWx1ZSc6IHtcclxuXHRcdFx0XHRcdHBhdHRlcm46IC8uKy9pLFxyXG5cdFx0XHRcdFx0aW5zaWRlOiBQcmlzbS5sYW5ndWFnZXMuY3NzXHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9LFxyXG5cdFx0XHRhbGlhczogJ2xhbmd1YWdlLWNzcydcclxuXHRcdH1cclxuXHR9LCBQcmlzbS5sYW5ndWFnZXMubWFya3VwLnRhZyk7XHJcbn1cclxuXHJcbi8qICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICAgICBCZWdpbiBwcmlzbS1jbGlrZS5qc1xyXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqICovXHJcblxyXG5QcmlzbS5sYW5ndWFnZXMuY2xpa2UgPSB7XHJcblx0J2NvbW1lbnQnOiBbXHJcblx0XHR7XHJcblx0XHRcdHBhdHRlcm46IC8oXnxbXlxcXFxdKVxcL1xcKltcXHdcXFddKj9cXCpcXC8vLFxyXG5cdFx0XHRsb29rYmVoaW5kOiB0cnVlXHJcblx0XHR9LFxyXG5cdFx0e1xyXG5cdFx0XHRwYXR0ZXJuOiAvKF58W15cXFxcOl0pXFwvXFwvLisvLFxyXG5cdFx0XHRsb29rYmVoaW5kOiB0cnVlXHJcblx0XHR9XHJcblx0XSxcclxuXHQnc3RyaW5nJzogLyhcInwnKShcXFxcXFxufFxcXFw/LikqP1xcMS8sXHJcblx0J2NsYXNzLW5hbWUnOiB7XHJcblx0XHRwYXR0ZXJuOiAvKCg/Oig/OmNsYXNzfGludGVyZmFjZXxleHRlbmRzfGltcGxlbWVudHN8dHJhaXR8aW5zdGFuY2VvZnxuZXcpXFxzKyl8KD86Y2F0Y2hcXHMrXFwoKSlbYS16MC05X1xcLlxcXFxdKy9pLFxyXG5cdFx0bG9va2JlaGluZDogdHJ1ZSxcclxuXHRcdGluc2lkZToge1xyXG5cdFx0XHRwdW5jdHVhdGlvbjogLyhcXC58XFxcXCkvXHJcblx0XHR9XHJcblx0fSxcclxuXHQna2V5d29yZCc6IC9cXGIoaWZ8ZWxzZXx3aGlsZXxkb3xmb3J8cmV0dXJufGlufGluc3RhbmNlb2Z8ZnVuY3Rpb258bmV3fHRyeXx0aHJvd3xjYXRjaHxmaW5hbGx5fG51bGx8YnJlYWt8Y29udGludWUpXFxiLyxcclxuXHQnYm9vbGVhbic6IC9cXGIodHJ1ZXxmYWxzZSlcXGIvLFxyXG5cdCdmdW5jdGlvbic6IHtcclxuXHRcdHBhdHRlcm46IC9bYS16MC05X10rXFwoL2ksXHJcblx0XHRpbnNpZGU6IHtcclxuXHRcdFx0cHVuY3R1YXRpb246IC9cXCgvXHJcblx0XHR9XHJcblx0fSxcclxuXHQnbnVtYmVyJzogL1xcYi0/KDB4W1xcZEEtRmEtZl0rfFxcZCpcXC4/XFxkKyhbRWVdLT9cXGQrKT8pXFxiLyxcclxuXHQnb3BlcmF0b3InOiAvWy0rXXsxLDJ9fCF8PD0/fD49P3w9ezEsM318JnsxLDJ9fFxcfD9cXHx8XFw/fFxcKnxcXC98fnxcXF58JS8sXHJcblx0J2lnbm9yZSc6IC8mKGx0fGd0fGFtcCk7L2ksXHJcblx0J3B1bmN0dWF0aW9uJzogL1t7fVtcXF07KCksLjpdL1xyXG59O1xyXG5cclxuXHJcbi8qICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICAgICBCZWdpbiBwcmlzbS1qYXZhc2NyaXB0LmpzXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiogKi9cclxuXHJcblByaXNtLmxhbmd1YWdlcy5qYXZhc2NyaXB0ID0gUHJpc20ubGFuZ3VhZ2VzLmV4dGVuZCgnY2xpa2UnLCB7XHJcblx0J2tleXdvcmQnOiAvXFxiKGJyZWFrfGNhc2V8Y2F0Y2h8Y2xhc3N8Y29uc3R8Y29udGludWV8ZGVidWdnZXJ8ZGVmYXVsdHxkZWxldGV8ZG98ZWxzZXxlbnVtfGV4cG9ydHxleHRlbmRzfGZhbHNlfGZpbmFsbHl8Zm9yfGZ1bmN0aW9ufGdldHxpZnxpbXBsZW1lbnRzfGltcG9ydHxpbnxpbnN0YW5jZW9mfGludGVyZmFjZXxsZXR8bmV3fG51bGx8cGFja2FnZXxwcml2YXRlfHByb3RlY3RlZHxwdWJsaWN8cmV0dXJufHNldHxzdGF0aWN8c3VwZXJ8c3dpdGNofHRoaXN8dGhyb3d8dHJ1ZXx0cnl8dHlwZW9mfHZhcnx2b2lkfHdoaWxlfHdpdGh8eWllbGQpXFxiLyxcclxuXHQnbnVtYmVyJzogL1xcYi0/KDB4W1xcZEEtRmEtZl0rfFxcZCpcXC4/XFxkKyhbRWVdWystXT9cXGQrKT98TmFOfC0/SW5maW5pdHkpXFxiLyxcclxuXHQnZnVuY3Rpb24nOiAvKD8hXFxkKVthLXowLTlfJF0rKD89XFwoKS9pXHJcbn0pO1xyXG5cclxuUHJpc20ubGFuZ3VhZ2VzLmluc2VydEJlZm9yZSgnamF2YXNjcmlwdCcsICdrZXl3b3JkJywge1xyXG5cdCdyZWdleCc6IHtcclxuXHRcdHBhdHRlcm46IC8oXnxbXi9dKVxcLyg/IVxcLykoXFxbLis/XXxcXFxcLnxbXi9cXHJcXG5dKStcXC9bZ2ltXXswLDN9KD89XFxzKigkfFtcXHJcXG4sLjt9KV0pKS8sXHJcblx0XHRsb29rYmVoaW5kOiB0cnVlXHJcblx0fVxyXG59KTtcclxuXHJcbmlmIChQcmlzbS5sYW5ndWFnZXMubWFya3VwKSB7XHJcblx0UHJpc20ubGFuZ3VhZ2VzLmluc2VydEJlZm9yZSgnbWFya3VwJywgJ3RhZycsIHtcclxuXHRcdCdzY3JpcHQnOiB7XHJcblx0XHRcdHBhdHRlcm46IC88c2NyaXB0W1xcd1xcV10qPz5bXFx3XFxXXSo/PFxcL3NjcmlwdD4vaSxcclxuXHRcdFx0aW5zaWRlOiB7XHJcblx0XHRcdFx0J3RhZyc6IHtcclxuXHRcdFx0XHRcdHBhdHRlcm46IC88c2NyaXB0W1xcd1xcV10qPz58PFxcL3NjcmlwdD4vaSxcclxuXHRcdFx0XHRcdGluc2lkZTogUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cC50YWcuaW5zaWRlXHJcblx0XHRcdFx0fSxcclxuXHRcdFx0XHRyZXN0OiBQcmlzbS5sYW5ndWFnZXMuamF2YXNjcmlwdFxyXG5cdFx0XHR9LFxyXG5cdFx0XHRhbGlhczogJ2xhbmd1YWdlLWphdmFzY3JpcHQnXHJcblx0XHR9XHJcblx0fSk7XHJcbn1cclxuXHJcblxyXG4vKiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbiAgICAgQmVnaW4gcHJpc20tZmlsZS1oaWdobGlnaHQuanNcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG5cclxuKGZ1bmN0aW9uICgpIHtcclxuXHRpZiAoIXNlbGYuUHJpc20gfHwgIXNlbGYuZG9jdW1lbnQgfHwgIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IpIHtcclxuXHRcdHJldHVybjtcclxuXHR9XHJcblxyXG5cdHNlbGYuUHJpc20uZmlsZUhpZ2hsaWdodCA9IGZ1bmN0aW9uKCkge1xyXG5cclxuXHRcdHZhciBFeHRlbnNpb25zID0ge1xyXG5cdFx0XHQnanMnOiAnamF2YXNjcmlwdCcsXHJcblx0XHRcdCdodG1sJzogJ21hcmt1cCcsXHJcblx0XHRcdCdzdmcnOiAnbWFya3VwJyxcclxuXHRcdFx0J3htbCc6ICdtYXJrdXAnLFxyXG5cdFx0XHQncHknOiAncHl0aG9uJyxcclxuXHRcdFx0J3JiJzogJ3J1YnknLFxyXG5cdFx0XHQncHMxJzogJ3Bvd2Vyc2hlbGwnLFxyXG5cdFx0XHQncHNtMSc6ICdwb3dlcnNoZWxsJ1xyXG5cdFx0fTtcclxuXHJcblx0XHRBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdwcmVbZGF0YS1zcmNdJykpLmZvckVhY2goZnVuY3Rpb24ocHJlKSB7XHJcblx0XHRcdHZhciBzcmMgPSBwcmUuZ2V0QXR0cmlidXRlKCdkYXRhLXNyYycpO1xyXG5cdFx0XHR2YXIgZXh0ZW5zaW9uID0gKHNyYy5tYXRjaCgvXFwuKFxcdyspJC8pIHx8IFssJyddKVsxXTtcclxuXHRcdFx0dmFyIGxhbmd1YWdlID0gRXh0ZW5zaW9uc1tleHRlbnNpb25dIHx8IGV4dGVuc2lvbjtcclxuXHJcblx0XHRcdHZhciBjb2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY29kZScpO1xyXG5cdFx0XHRjb2RlLmNsYXNzTmFtZSA9ICdsYW5ndWFnZS0nICsgbGFuZ3VhZ2U7XHJcblxyXG5cdFx0XHRwcmUudGV4dENvbnRlbnQgPSAnJztcclxuXHJcblx0XHRcdGNvZGUudGV4dENvbnRlbnQgPSAnTG9hZGluZ+KApic7XHJcblxyXG5cdFx0XHRwcmUuYXBwZW5kQ2hpbGQoY29kZSk7XHJcblxyXG5cdFx0XHR2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XHJcblxyXG5cdFx0XHR4aHIub3BlbignR0VUJywgc3JjLCB0cnVlKTtcclxuXHJcblx0XHRcdHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbigpIHtcclxuXHRcdFx0XHRpZiAoeGhyLnJlYWR5U3RhdGUgPT0gNCkge1xyXG5cclxuXHRcdFx0XHRcdGlmICh4aHIuc3RhdHVzIDwgNDAwICYmIHhoci5yZXNwb25zZVRleHQpIHtcclxuXHRcdFx0XHRcdFx0Y29kZS50ZXh0Q29udGVudCA9IHhoci5yZXNwb25zZVRleHQ7XHJcblxyXG5cdFx0XHRcdFx0XHRQcmlzbS5oaWdobGlnaHRFbGVtZW50KGNvZGUpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0ZWxzZSBpZiAoeGhyLnN0YXR1cyA+PSA0MDApIHtcclxuXHRcdFx0XHRcdFx0Y29kZS50ZXh0Q29udGVudCA9ICfinJYgRXJyb3IgJyArIHhoci5zdGF0dXMgKyAnIHdoaWxlIGZldGNoaW5nIGZpbGU6ICcgKyB4aHIuc3RhdHVzVGV4dDtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdFx0XHRjb2RlLnRleHRDb250ZW50ID0gJ+KcliBFcnJvcjogRmlsZSBkb2VzIG5vdCBleGlzdCBvciBpcyBlbXB0eSc7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9O1xyXG5cclxuXHRcdFx0eGhyLnNlbmQobnVsbCk7XHJcblx0XHR9KTtcclxuXHJcblx0fTtcclxuXHJcblx0c2VsZi5QcmlzbS5maWxlSGlnaGxpZ2h0KCk7XHJcblxyXG59KSgpO1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xyXG4gIHJldHVybiBmdW5jdGlvbihkZWNrKSB7XHJcbiAgICB2YXIgYmFja2Ryb3BzO1xyXG5cclxuICAgIGZ1bmN0aW9uIGNyZWF0ZUJhY2tkcm9wRm9yU2xpZGUoc2xpZGUpIHtcclxuICAgICAgdmFyIGJhY2tkcm9wQXR0cmlidXRlID0gc2xpZGUuZ2V0QXR0cmlidXRlKCdkYXRhLWJlc3Bva2UtYmFja2Ryb3AnKTtcclxuXHJcbiAgICAgIGlmIChiYWNrZHJvcEF0dHJpYnV0ZSkge1xyXG4gICAgICAgIHZhciBiYWNrZHJvcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIGJhY2tkcm9wLmNsYXNzTmFtZSA9IGJhY2tkcm9wQXR0cmlidXRlO1xyXG4gICAgICAgIGJhY2tkcm9wLmNsYXNzTGlzdC5hZGQoJ2Jlc3Bva2UtYmFja2Ryb3AnKTtcclxuICAgICAgICBkZWNrLnBhcmVudC5hcHBlbmRDaGlsZChiYWNrZHJvcCk7XHJcbiAgICAgICAgcmV0dXJuIGJhY2tkcm9wO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gdXBkYXRlQ2xhc3NlcyhlbCkge1xyXG4gICAgICBpZiAoZWwpIHtcclxuICAgICAgICB2YXIgaW5kZXggPSBiYWNrZHJvcHMuaW5kZXhPZihlbCksXHJcbiAgICAgICAgICBjdXJyZW50SW5kZXggPSBkZWNrLnNsaWRlKCk7XHJcblxyXG4gICAgICAgIHJlbW92ZUNsYXNzKGVsLCAnYWN0aXZlJyk7XHJcbiAgICAgICAgcmVtb3ZlQ2xhc3MoZWwsICdpbmFjdGl2ZScpO1xyXG4gICAgICAgIHJlbW92ZUNsYXNzKGVsLCAnYmVmb3JlJyk7XHJcbiAgICAgICAgcmVtb3ZlQ2xhc3MoZWwsICdhZnRlcicpO1xyXG5cclxuICAgICAgICBpZiAoaW5kZXggIT09IGN1cnJlbnRJbmRleCkge1xyXG4gICAgICAgICAgYWRkQ2xhc3MoZWwsICdpbmFjdGl2ZScpO1xyXG4gICAgICAgICAgYWRkQ2xhc3MoZWwsIGluZGV4IDwgY3VycmVudEluZGV4ID8gJ2JlZm9yZScgOiAnYWZ0ZXInKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgYWRkQ2xhc3MoZWwsICdhY3RpdmUnKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZW1vdmVDbGFzcyhlbCwgY2xhc3NOYW1lKSB7XHJcbiAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ2Jlc3Bva2UtYmFja2Ryb3AtJyArIGNsYXNzTmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gYWRkQ2xhc3MoZWwsIGNsYXNzTmFtZSkge1xyXG4gICAgICBlbC5jbGFzc0xpc3QuYWRkKCdiZXNwb2tlLWJhY2tkcm9wLScgKyBjbGFzc05hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGJhY2tkcm9wcyA9IGRlY2suc2xpZGVzXHJcbiAgICAgIC5tYXAoY3JlYXRlQmFja2Ryb3BGb3JTbGlkZSk7XHJcblxyXG4gICAgZGVjay5vbignYWN0aXZhdGUnLCBmdW5jdGlvbigpIHtcclxuICAgICAgYmFja2Ryb3BzLmZvckVhY2godXBkYXRlQ2xhc3Nlcyk7XHJcbiAgICB9KTtcclxuICB9O1xyXG59O1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xyXG4gICAgdmFyIGFjdGl2ZVNsaWRlSW5kZXgsXHJcbiAgICAgIGFjdGl2ZUJ1bGxldEluZGV4LFxyXG5cclxuICAgICAgYnVsbGV0cyA9IGRlY2suc2xpZGVzLm1hcChmdW5jdGlvbihzbGlkZSkge1xyXG4gICAgICAgIHJldHVybiBbXS5zbGljZS5jYWxsKHNsaWRlLnF1ZXJ5U2VsZWN0b3JBbGwoKHR5cGVvZiBvcHRpb25zID09PSAnc3RyaW5nJyA/IG9wdGlvbnMgOiAnW2RhdGEtYmVzcG9rZS1idWxsZXRdJykpLCAwKTtcclxuICAgICAgfSksXHJcblxyXG4gICAgICBuZXh0ID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFyIG5leHRTbGlkZUluZGV4ID0gYWN0aXZlU2xpZGVJbmRleCArIDE7XHJcblxyXG4gICAgICAgIGlmIChhY3RpdmVTbGlkZUhhc0J1bGxldEJ5T2Zmc2V0KDEpKSB7XHJcbiAgICAgICAgICBhY3RpdmF0ZUJ1bGxldChhY3RpdmVTbGlkZUluZGV4LCBhY3RpdmVCdWxsZXRJbmRleCArIDEpO1xyXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoYnVsbGV0c1tuZXh0U2xpZGVJbmRleF0pIHtcclxuICAgICAgICAgIGFjdGl2YXRlQnVsbGV0KG5leHRTbGlkZUluZGV4LCAwKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcblxyXG4gICAgICBwcmV2ID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFyIHByZXZTbGlkZUluZGV4ID0gYWN0aXZlU2xpZGVJbmRleCAtIDE7XHJcblxyXG4gICAgICAgIGlmIChhY3RpdmVTbGlkZUhhc0J1bGxldEJ5T2Zmc2V0KC0xKSkge1xyXG4gICAgICAgICAgYWN0aXZhdGVCdWxsZXQoYWN0aXZlU2xpZGVJbmRleCwgYWN0aXZlQnVsbGV0SW5kZXggLSAxKTtcclxuICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9IGVsc2UgaWYgKGJ1bGxldHNbcHJldlNsaWRlSW5kZXhdKSB7XHJcbiAgICAgICAgICBhY3RpdmF0ZUJ1bGxldChwcmV2U2xpZGVJbmRleCwgYnVsbGV0c1twcmV2U2xpZGVJbmRleF0ubGVuZ3RoIC0gMSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG5cclxuICAgICAgYWN0aXZhdGVCdWxsZXQgPSBmdW5jdGlvbihzbGlkZUluZGV4LCBidWxsZXRJbmRleCkge1xyXG4gICAgICAgIGFjdGl2ZVNsaWRlSW5kZXggPSBzbGlkZUluZGV4O1xyXG4gICAgICAgIGFjdGl2ZUJ1bGxldEluZGV4ID0gYnVsbGV0SW5kZXg7XHJcblxyXG4gICAgICAgIGJ1bGxldHMuZm9yRWFjaChmdW5jdGlvbihzbGlkZSwgcykge1xyXG4gICAgICAgICAgc2xpZGUuZm9yRWFjaChmdW5jdGlvbihidWxsZXQsIGIpIHtcclxuICAgICAgICAgICAgYnVsbGV0LmNsYXNzTGlzdC5hZGQoJ2Jlc3Bva2UtYnVsbGV0Jyk7XHJcblxyXG4gICAgICAgICAgICBpZiAocyA8IHNsaWRlSW5kZXggfHwgcyA9PT0gc2xpZGVJbmRleCAmJiBiIDw9IGJ1bGxldEluZGV4KSB7XHJcbiAgICAgICAgICAgICAgYnVsbGV0LmNsYXNzTGlzdC5hZGQoJ2Jlc3Bva2UtYnVsbGV0LWFjdGl2ZScpO1xyXG4gICAgICAgICAgICAgIGJ1bGxldC5jbGFzc0xpc3QucmVtb3ZlKCdiZXNwb2tlLWJ1bGxldC1pbmFjdGl2ZScpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIGJ1bGxldC5jbGFzc0xpc3QuYWRkKCdiZXNwb2tlLWJ1bGxldC1pbmFjdGl2ZScpO1xyXG4gICAgICAgICAgICAgIGJ1bGxldC5jbGFzc0xpc3QucmVtb3ZlKCdiZXNwb2tlLWJ1bGxldC1hY3RpdmUnKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKHMgPT09IHNsaWRlSW5kZXggJiYgYiA9PT0gYnVsbGV0SW5kZXgpIHtcclxuICAgICAgICAgICAgICBidWxsZXQuY2xhc3NMaXN0LmFkZCgnYmVzcG9rZS1idWxsZXQtY3VycmVudCcpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgIGJ1bGxldC5jbGFzc0xpc3QucmVtb3ZlKCdiZXNwb2tlLWJ1bGxldC1jdXJyZW50Jyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9LFxyXG5cclxuICAgICAgYWN0aXZlU2xpZGVIYXNCdWxsZXRCeU9mZnNldCA9IGZ1bmN0aW9uKG9mZnNldCkge1xyXG4gICAgICAgIHJldHVybiBidWxsZXRzW2FjdGl2ZVNsaWRlSW5kZXhdW2FjdGl2ZUJ1bGxldEluZGV4ICsgb2Zmc2V0XSAhPT0gdW5kZWZpbmVkO1xyXG4gICAgICB9O1xyXG5cclxuICAgIGRlY2sub24oJ25leHQnLCBuZXh0KTtcclxuICAgIGRlY2sub24oJ3ByZXYnLCBwcmV2KTtcclxuXHJcbiAgICBkZWNrLm9uKCdzbGlkZScsIGZ1bmN0aW9uKGUpIHtcclxuICAgICAgYWN0aXZhdGVCdWxsZXQoZS5pbmRleCwgMCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBhY3RpdmF0ZUJ1bGxldCgwLCAwKTtcclxuICB9O1xyXG59O1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xyXG4gIHJldHVybiBmdW5jdGlvbihkZWNrKSB7XHJcbiAgICBkZWNrLnNsaWRlcy5mb3JFYWNoKGZ1bmN0aW9uKHNsaWRlKSB7XHJcbiAgICAgIHNsaWRlLmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgaWYgKC9JTlBVVHxURVhUQVJFQXxTRUxFQ1QvLnRlc3QoZS50YXJnZXQubm9kZU5hbWUpIHx8IGUudGFyZ2V0LmNvbnRlbnRFZGl0YWJsZSA9PT0gJ3RydWUnKSB7XHJcbiAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9O1xyXG59O1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xyXG4gIHJldHVybiBmdW5jdGlvbihkZWNrKSB7XHJcbiAgICB2YXIgcGFyc2VIYXNoID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgIHZhciBoYXNoID0gd2luZG93LmxvY2F0aW9uLmhhc2guc2xpY2UoMSksXHJcbiAgICAgICAgc2xpZGVOdW1iZXJPck5hbWUgPSBwYXJzZUludChoYXNoLCAxMCk7XHJcblxyXG4gICAgICBpZiAoaGFzaCkge1xyXG4gICAgICAgIGlmIChzbGlkZU51bWJlck9yTmFtZSkge1xyXG4gICAgICAgICAgYWN0aXZhdGVTbGlkZShzbGlkZU51bWJlck9yTmFtZSAtIDEpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBkZWNrLnNsaWRlcy5mb3JFYWNoKGZ1bmN0aW9uKHNsaWRlLCBpKSB7XHJcbiAgICAgICAgICAgIGlmIChzbGlkZS5nZXRBdHRyaWJ1dGUoJ2RhdGEtYmVzcG9rZS1oYXNoJykgPT09IGhhc2gpIHtcclxuICAgICAgICAgICAgICBhY3RpdmF0ZVNsaWRlKGkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgdmFyIGFjdGl2YXRlU2xpZGUgPSBmdW5jdGlvbihpbmRleCkge1xyXG4gICAgICB2YXIgaW5kZXhUb0FjdGl2YXRlID0gLTEgPCBpbmRleCAmJiBpbmRleCA8IGRlY2suc2xpZGVzLmxlbmd0aCA/IGluZGV4IDogMDtcclxuICAgICAgaWYgKGluZGV4VG9BY3RpdmF0ZSAhPT0gZGVjay5zbGlkZSgpKSB7XHJcbiAgICAgICAgZGVjay5zbGlkZShpbmRleFRvQWN0aXZhdGUpO1xyXG4gICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XHJcbiAgICAgIHBhcnNlSGFzaCgpO1xyXG5cclxuICAgICAgZGVjay5vbignYWN0aXZhdGUnLCBmdW5jdGlvbihlKSB7XHJcbiAgICAgICAgdmFyIHNsaWRlTmFtZSA9IGUuc2xpZGUuZ2V0QXR0cmlidXRlKCdkYXRhLWJlc3Bva2UtaGFzaCcpO1xyXG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5oYXNoID0gc2xpZGVOYW1lIHx8IGUuaW5kZXggKyAxO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdoYXNoY2hhbmdlJywgcGFyc2VIYXNoKTtcclxuICAgIH0sIDApO1xyXG4gIH07XHJcbn07XHJcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xyXG4gIHJldHVybiBmdW5jdGlvbihkZWNrKSB7XHJcbiAgICB2YXIgaXNIb3Jpem9udGFsID0gb3B0aW9ucyAhPT0gJ3ZlcnRpY2FsJztcclxuXHJcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZnVuY3Rpb24oZSkge1xyXG4gICAgICBpZiAoZS53aGljaCA9PSAzNCB8fCAvLyBQQUdFIERPV05cclxuICAgICAgICBlLndoaWNoID09IDMyIHx8IC8vIFNQQUNFXHJcbiAgICAgICAgKGlzSG9yaXpvbnRhbCAmJiBlLndoaWNoID09IDM5KSB8fCAvLyBSSUdIVFxyXG4gICAgICAgICghaXNIb3Jpem9udGFsICYmIGUud2hpY2ggPT0gNDApIC8vIERPV05cclxuICAgICAgKSB7IGRlY2submV4dCgpOyB9XHJcblxyXG4gICAgICBpZiAoZS53aGljaCA9PSAzMyB8fCAvLyBQQUdFIFVQXHJcbiAgICAgICAgKGlzSG9yaXpvbnRhbCAmJiBlLndoaWNoID09IDM3KSB8fCAvLyBMRUZUXHJcbiAgICAgICAgKCFpc0hvcml6b250YWwgJiYgZS53aGljaCA9PSAzOCkgLy8gVVBcclxuICAgICAgKSB7IGRlY2sucHJldigpOyB9XHJcbiAgICB9KTtcclxuICB9O1xyXG59O1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuICByZXR1cm4gZnVuY3Rpb24gKGRlY2spIHtcclxuICAgIHZhciBwcm9ncmVzc1BhcmVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxyXG4gICAgICBwcm9ncmVzc0JhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxyXG4gICAgICBwcm9wID0gb3B0aW9ucyA9PT0gJ3ZlcnRpY2FsJyA/ICdoZWlnaHQnIDogJ3dpZHRoJztcclxuXHJcbiAgICBwcm9ncmVzc1BhcmVudC5jbGFzc05hbWUgPSAnYmVzcG9rZS1wcm9ncmVzcy1wYXJlbnQnO1xyXG4gICAgcHJvZ3Jlc3NCYXIuY2xhc3NOYW1lID0gJ2Jlc3Bva2UtcHJvZ3Jlc3MtYmFyJztcclxuICAgIHByb2dyZXNzUGFyZW50LmFwcGVuZENoaWxkKHByb2dyZXNzQmFyKTtcclxuICAgIGRlY2sucGFyZW50LmFwcGVuZENoaWxkKHByb2dyZXNzUGFyZW50KTtcclxuXHJcbiAgICBkZWNrLm9uKCdhY3RpdmF0ZScsIGZ1bmN0aW9uKGUpIHtcclxuICAgICAgcHJvZ3Jlc3NCYXIuc3R5bGVbcHJvcF0gPSAoZS5pbmRleCAqIDEwMCAvIChkZWNrLnNsaWRlcy5sZW5ndGggLSAxKSkgKyAnJSc7XHJcbiAgICB9KTtcclxuICB9O1xyXG59O1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xyXG4gICAgdmFyIHBhcmVudCA9IGRlY2sucGFyZW50LFxyXG4gICAgICBmaXJzdFNsaWRlID0gZGVjay5zbGlkZXNbMF0sXHJcbiAgICAgIHNsaWRlSGVpZ2h0ID0gZmlyc3RTbGlkZS5vZmZzZXRIZWlnaHQsXHJcbiAgICAgIHNsaWRlV2lkdGggPSBmaXJzdFNsaWRlLm9mZnNldFdpZHRoLFxyXG4gICAgICB1c2Vab29tID0gb3B0aW9ucyA9PT0gJ3pvb20nIHx8ICgnem9vbScgaW4gcGFyZW50LnN0eWxlICYmIG9wdGlvbnMgIT09ICd0cmFuc2Zvcm0nKSxcclxuXHJcbiAgICAgIHdyYXAgPSBmdW5jdGlvbihlbGVtZW50KSB7XHJcbiAgICAgICAgdmFyIHdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB3cmFwcGVyLmNsYXNzTmFtZSA9ICdiZXNwb2tlLXNjYWxlLXBhcmVudCc7XHJcbiAgICAgICAgZWxlbWVudC5wYXJlbnROb2RlLmluc2VydEJlZm9yZSh3cmFwcGVyLCBlbGVtZW50KTtcclxuICAgICAgICB3cmFwcGVyLmFwcGVuZENoaWxkKGVsZW1lbnQpO1xyXG4gICAgICAgIHJldHVybiB3cmFwcGVyO1xyXG4gICAgICB9LFxyXG5cclxuICAgICAgZWxlbWVudHMgPSB1c2Vab29tID8gZGVjay5zbGlkZXMgOiBkZWNrLnNsaWRlcy5tYXAod3JhcCksXHJcblxyXG4gICAgICB0cmFuc2Zvcm1Qcm9wZXJ0eSA9IChmdW5jdGlvbihwcm9wZXJ0eSkge1xyXG4gICAgICAgIHZhciBwcmVmaXhlcyA9ICdNb3ogV2Via2l0IE8gbXMnLnNwbGl0KCcgJyk7XHJcbiAgICAgICAgcmV0dXJuIHByZWZpeGVzLnJlZHVjZShmdW5jdGlvbihjdXJyZW50UHJvcGVydHksIHByZWZpeCkge1xyXG4gICAgICAgICAgICByZXR1cm4gcHJlZml4ICsgcHJvcGVydHkgaW4gcGFyZW50LnN0eWxlID8gcHJlZml4ICsgcHJvcGVydHkgOiBjdXJyZW50UHJvcGVydHk7XHJcbiAgICAgICAgICB9LCBwcm9wZXJ0eS50b0xvd2VyQ2FzZSgpKTtcclxuICAgICAgfSgnVHJhbnNmb3JtJykpLFxyXG5cclxuICAgICAgc2NhbGUgPSB1c2Vab29tID9cclxuICAgICAgICBmdW5jdGlvbihyYXRpbywgZWxlbWVudCkge1xyXG4gICAgICAgICAgZWxlbWVudC5zdHlsZS56b29tID0gcmF0aW87XHJcbiAgICAgICAgfSA6XHJcbiAgICAgICAgZnVuY3Rpb24ocmF0aW8sIGVsZW1lbnQpIHtcclxuICAgICAgICAgIGVsZW1lbnQuc3R5bGVbdHJhbnNmb3JtUHJvcGVydHldID0gJ3NjYWxlKCcgKyByYXRpbyArICcpJztcclxuICAgICAgICB9LFxyXG5cclxuICAgICAgc2NhbGVBbGwgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgeFNjYWxlID0gcGFyZW50Lm9mZnNldFdpZHRoIC8gc2xpZGVXaWR0aCxcclxuICAgICAgICAgIHlTY2FsZSA9IHBhcmVudC5vZmZzZXRIZWlnaHQgLyBzbGlkZUhlaWdodDtcclxuXHJcbiAgICAgICAgZWxlbWVudHMuZm9yRWFjaChzY2FsZS5iaW5kKG51bGwsIE1hdGgubWluKHhTY2FsZSwgeVNjYWxlKSkpO1xyXG4gICAgICB9O1xyXG5cclxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCBzY2FsZUFsbCk7XHJcbiAgICBzY2FsZUFsbCgpO1xyXG4gIH07XHJcblxyXG59O1xyXG4iLCIoZnVuY3Rpb24gKF9fZGlybmFtZSl7XG52YXIgZnMgPSByZXF1aXJlKCdmcycpO1xyXG52YXIgaW5zZXJ0Q3NzID0gcmVxdWlyZSgnaW5zZXJ0LWNzcycpO1xyXG52YXIgdHJhbnNmb3JtID0gcmVxdWlyZSgnZmVhdHVyZS9jc3MnKSgndHJhbnNmb3JtJyk7XHJcbnZhciBkb3QgPSByZXF1aXJlKCdkb3QnKTtcclxudmFyIHRoZW1lID0gZG90LnRlbXBsYXRlKGZzLnJlYWRGaWxlU3luYyhfX2Rpcm5hbWUgKyAnL3RoZW1lLmNzcycsICd1dGY4JykpO1xyXG5cclxuLyoqXHJcblx0IyBiZXNwb2tlLXRoZW1lLXR3ZWFrYWJsZVxyXG5cclxuXHRBIHNpbXBsZSBbYmVzcG9rZS5qc10oaHR0cHM6Ly9naXRodWIuY29tL21hcmtkYWxnbGVpc2gvYmVzcG9rZS5qcykgdGhlbWVcclxuXHR0aGF0IGNhbiBiZSBjb25maWd1cmVkIG9uIHRoZSBmbHkgdXNpbmcgY2xpZW50LXNpZGUgdGVtcGxhdGluZy5cclxuXHJcblx0IyMgRXhhbXBsZSBVc2FnZVxyXG5cclxuXHRUbyBiZSBjb21wbGV0ZWQuXHJcblxyXG4qKi9cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRzKSB7XHJcbiAgaW5zZXJ0Q3NzKHRoZW1lKG9wdHMgfHwge30pLCB7IHByZXBlbmQ6IHRydWUgfSk7XHJcblxyXG4gIHJldHVybiBmdW5jdGlvbihkZWNrKSB7XHJcbiAgICB2YXIgcGFyZW50ID0gZGVjay5wYXJlbnQ7XHJcblxyXG4gICAgcmVxdWlyZSgnYmVzcG9rZS1jbGFzc2VzJykoKShkZWNrKTtcclxuXHJcbiAgICBkZWNrLm9uKCdhY3RpdmF0ZScsIGZ1bmN0aW9uKGV2dCkge1xyXG4gICAgICB2YXIgdmFsWCA9IChldnQuaW5kZXggKiAxMDApO1xyXG5cclxuICAgICAgaWYgKHRyYW5zZm9ybSkge1xyXG4gICAgICAgIHRyYW5zZm9ybShwYXJlbnQsICd0cmFuc2xhdGVYKC0nICsgdmFsWCArICclKSB0cmFuc2xhdGVaKDApJyk7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgcGFyZW50LnBvc2l0aW9uID0gJ2Fic29sdXRlJztcclxuICAgICAgICBwYXJlbnQubGVmdCA9ICctJyArIHZhbFggKyAnJSc7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH07XHJcbn07XHJcblxufSkuY2FsbCh0aGlzLFwiLy4uXFxcXC4uXFxcXG5vZGVfbW9kdWxlc1xcXFxiZXNwb2tlLXRoZW1lLXR3ZWFrYWJsZVwiKSIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uKGRlY2spIHtcclxuICAgIHZhciBhZGRDbGFzcyA9IGZ1bmN0aW9uKGVsLCBjbHMpIHtcclxuICAgICAgICBlbC5jbGFzc0xpc3QuYWRkKCdiZXNwb2tlLScgKyBjbHMpO1xyXG4gICAgICB9LFxyXG5cclxuICAgICAgcmVtb3ZlQ2xhc3MgPSBmdW5jdGlvbihlbCwgY2xzKSB7XHJcbiAgICAgICAgZWwuY2xhc3NOYW1lID0gZWwuY2xhc3NOYW1lXHJcbiAgICAgICAgICAucmVwbGFjZShuZXcgUmVnRXhwKCdiZXNwb2tlLScgKyBjbHMgKycoXFxcXHN8JCknLCAnZycpLCAnICcpXHJcbiAgICAgICAgICAudHJpbSgpO1xyXG4gICAgICB9LFxyXG5cclxuICAgICAgZGVhY3RpdmF0ZSA9IGZ1bmN0aW9uKGVsLCBpbmRleCkge1xyXG4gICAgICAgIHZhciBhY3RpdmVTbGlkZSA9IGRlY2suc2xpZGVzW2RlY2suc2xpZGUoKV0sXHJcbiAgICAgICAgICBvZmZzZXQgPSBpbmRleCAtIGRlY2suc2xpZGUoKSxcclxuICAgICAgICAgIG9mZnNldENsYXNzID0gb2Zmc2V0ID4gMCA/ICdhZnRlcicgOiAnYmVmb3JlJztcclxuXHJcbiAgICAgICAgWydiZWZvcmUoLVxcXFxkKyk/JywgJ2FmdGVyKC1cXFxcZCspPycsICdhY3RpdmUnLCAnaW5hY3RpdmUnXS5tYXAocmVtb3ZlQ2xhc3MuYmluZChudWxsLCBlbCkpO1xyXG5cclxuICAgICAgICBpZiAoZWwgIT09IGFjdGl2ZVNsaWRlKSB7XHJcbiAgICAgICAgICBbJ2luYWN0aXZlJywgb2Zmc2V0Q2xhc3MsIG9mZnNldENsYXNzICsgJy0nICsgTWF0aC5hYnMob2Zmc2V0KV0ubWFwKGFkZENsYXNzLmJpbmQobnVsbCwgZWwpKTtcclxuICAgICAgICB9XHJcbiAgICAgIH07XHJcblxyXG4gICAgYWRkQ2xhc3MoZGVjay5wYXJlbnQsICdwYXJlbnQnKTtcclxuICAgIGRlY2suc2xpZGVzLm1hcChmdW5jdGlvbihlbCkgeyBhZGRDbGFzcyhlbCwgJ3NsaWRlJyk7IH0pO1xyXG5cclxuICAgIGRlY2sub24oJ2FjdGl2YXRlJywgZnVuY3Rpb24oZSkge1xyXG4gICAgICBkZWNrLnNsaWRlcy5tYXAoZGVhY3RpdmF0ZSk7XHJcbiAgICAgIGFkZENsYXNzKGUuc2xpZGUsICdhY3RpdmUnKTtcclxuICAgICAgcmVtb3ZlQ2xhc3MoZS5zbGlkZSwgJ2luYWN0aXZlJyk7XHJcbiAgICB9KTtcclxuICB9O1xyXG59O1xyXG4iLCIvLyBkb1QuanNcclxuLy8gMjAxMS0yMDE0LCBMYXVyYSBEb2t0b3JvdmEsIGh0dHBzOi8vZ2l0aHViLmNvbS9vbGFkby9kb1RcclxuLy8gTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxyXG5cclxuKGZ1bmN0aW9uKCkge1xyXG5cdFwidXNlIHN0cmljdFwiO1xyXG5cclxuXHR2YXIgZG9UID0ge1xyXG5cdFx0dmVyc2lvbjogXCIxLjAuM1wiLFxyXG5cdFx0dGVtcGxhdGVTZXR0aW5nczoge1xyXG5cdFx0XHRldmFsdWF0ZTogICAgL1xce1xceyhbXFxzXFxTXSs/KFxcfT8pKylcXH1cXH0vZyxcclxuXHRcdFx0aW50ZXJwb2xhdGU6IC9cXHtcXHs9KFtcXHNcXFNdKz8pXFx9XFx9L2csXHJcblx0XHRcdGVuY29kZTogICAgICAvXFx7XFx7IShbXFxzXFxTXSs/KVxcfVxcfS9nLFxyXG5cdFx0XHR1c2U6ICAgICAgICAgL1xce1xceyMoW1xcc1xcU10rPylcXH1cXH0vZyxcclxuXHRcdFx0dXNlUGFyYW1zOiAgIC8oXnxbXlxcdyRdKWRlZig/OlxcLnxcXFtbXFwnXFxcIl0pKFtcXHckXFwuXSspKD86W1xcJ1xcXCJdXFxdKT9cXHMqXFw6XFxzKihbXFx3JFxcLl0rfFxcXCJbXlxcXCJdK1xcXCJ8XFwnW15cXCddK1xcJ3xcXHtbXlxcfV0rXFx9KS9nLFxyXG5cdFx0XHRkZWZpbmU6ICAgICAgL1xce1xceyMjXFxzKihbXFx3XFwuJF0rKVxccyooXFw6fD0pKFtcXHNcXFNdKz8pI1xcfVxcfS9nLFxyXG5cdFx0XHRkZWZpbmVQYXJhbXM6L15cXHMqKFtcXHckXSspOihbXFxzXFxTXSspLyxcclxuXHRcdFx0Y29uZGl0aW9uYWw6IC9cXHtcXHtcXD8oXFw/KT9cXHMqKFtcXHNcXFNdKj8pXFxzKlxcfVxcfS9nLFxyXG5cdFx0XHRpdGVyYXRlOiAgICAgL1xce1xce35cXHMqKD86XFx9XFx9fChbXFxzXFxTXSs/KVxccypcXDpcXHMqKFtcXHckXSspXFxzKig/OlxcOlxccyooW1xcdyRdKykpP1xccypcXH1cXH0pL2csXHJcblx0XHRcdHZhcm5hbWU6XHRcIml0XCIsXHJcblx0XHRcdHN0cmlwOlx0XHR0cnVlLFxyXG5cdFx0XHRhcHBlbmQ6XHRcdHRydWUsXHJcblx0XHRcdHNlbGZjb250YWluZWQ6IGZhbHNlLFxyXG5cdFx0XHRkb05vdFNraXBFbmNvZGVkOiBmYWxzZVxyXG5cdFx0fSxcclxuXHRcdHRlbXBsYXRlOiB1bmRlZmluZWQsIC8vZm4sIGNvbXBpbGUgdGVtcGxhdGVcclxuXHRcdGNvbXBpbGU6ICB1bmRlZmluZWQgIC8vZm4sIGZvciBleHByZXNzXHJcblx0fSwgX2dsb2JhbHM7XHJcblxyXG5cdGRvVC5lbmNvZGVIVE1MU291cmNlID0gZnVuY3Rpb24oZG9Ob3RTa2lwRW5jb2RlZCkge1xyXG5cdFx0dmFyIGVuY29kZUhUTUxSdWxlcyA9IHsgXCImXCI6IFwiJiMzODtcIiwgXCI8XCI6IFwiJiM2MDtcIiwgXCI+XCI6IFwiJiM2MjtcIiwgJ1wiJzogXCImIzM0O1wiLCBcIidcIjogXCImIzM5O1wiLCBcIi9cIjogXCImIzQ3O1wiIH0sXHJcblx0XHRcdG1hdGNoSFRNTCA9IGRvTm90U2tpcEVuY29kZWQgPyAvWyY8PlwiJ1xcL10vZyA6IC8mKD8hIz9cXHcrOyl8PHw+fFwifCd8XFwvL2c7XHJcblx0XHRyZXR1cm4gZnVuY3Rpb24oY29kZSkge1xyXG5cdFx0XHRyZXR1cm4gY29kZSA/IGNvZGUudG9TdHJpbmcoKS5yZXBsYWNlKG1hdGNoSFRNTCwgZnVuY3Rpb24obSkge3JldHVybiBlbmNvZGVIVE1MUnVsZXNbbV0gfHwgbTt9KSA6IFwiXCI7XHJcblx0XHR9O1xyXG5cdH07XHJcblxyXG5cdF9nbG9iYWxzID0gKGZ1bmN0aW9uKCl7IHJldHVybiB0aGlzIHx8ICgwLGV2YWwpKFwidGhpc1wiKTsgfSgpKTtcclxuXHJcblx0aWYgKHR5cGVvZiBtb2R1bGUgIT09IFwidW5kZWZpbmVkXCIgJiYgbW9kdWxlLmV4cG9ydHMpIHtcclxuXHRcdG1vZHVsZS5leHBvcnRzID0gZG9UO1xyXG5cdH0gZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gXCJmdW5jdGlvblwiICYmIGRlZmluZS5hbWQpIHtcclxuXHRcdGRlZmluZShmdW5jdGlvbigpe3JldHVybiBkb1Q7fSk7XHJcblx0fSBlbHNlIHtcclxuXHRcdF9nbG9iYWxzLmRvVCA9IGRvVDtcclxuXHR9XHJcblxyXG5cdHZhciBzdGFydGVuZCA9IHtcclxuXHRcdGFwcGVuZDogeyBzdGFydDogXCInKyhcIiwgICAgICBlbmQ6IFwiKSsnXCIsICAgICAgc3RhcnRlbmNvZGU6IFwiJytlbmNvZGVIVE1MKFwiIH0sXHJcblx0XHRzcGxpdDogIHsgc3RhcnQ6IFwiJztvdXQrPShcIiwgZW5kOiBcIik7b3V0Kz0nXCIsIHN0YXJ0ZW5jb2RlOiBcIic7b3V0Kz1lbmNvZGVIVE1MKFwiIH1cclxuXHR9LCBza2lwID0gLyReLztcclxuXHJcblx0ZnVuY3Rpb24gcmVzb2x2ZURlZnMoYywgYmxvY2ssIGRlZikge1xyXG5cdFx0cmV0dXJuICgodHlwZW9mIGJsb2NrID09PSBcInN0cmluZ1wiKSA/IGJsb2NrIDogYmxvY2sudG9TdHJpbmcoKSlcclxuXHRcdC5yZXBsYWNlKGMuZGVmaW5lIHx8IHNraXAsIGZ1bmN0aW9uKG0sIGNvZGUsIGFzc2lnbiwgdmFsdWUpIHtcclxuXHRcdFx0aWYgKGNvZGUuaW5kZXhPZihcImRlZi5cIikgPT09IDApIHtcclxuXHRcdFx0XHRjb2RlID0gY29kZS5zdWJzdHJpbmcoNCk7XHJcblx0XHRcdH1cclxuXHRcdFx0aWYgKCEoY29kZSBpbiBkZWYpKSB7XHJcblx0XHRcdFx0aWYgKGFzc2lnbiA9PT0gXCI6XCIpIHtcclxuXHRcdFx0XHRcdGlmIChjLmRlZmluZVBhcmFtcykgdmFsdWUucmVwbGFjZShjLmRlZmluZVBhcmFtcywgZnVuY3Rpb24obSwgcGFyYW0sIHYpIHtcclxuXHRcdFx0XHRcdFx0ZGVmW2NvZGVdID0ge2FyZzogcGFyYW0sIHRleHQ6IHZ9O1xyXG5cdFx0XHRcdFx0fSk7XHJcblx0XHRcdFx0XHRpZiAoIShjb2RlIGluIGRlZikpIGRlZltjb2RlXT0gdmFsdWU7XHJcblx0XHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRcdG5ldyBGdW5jdGlvbihcImRlZlwiLCBcImRlZlsnXCIrY29kZStcIiddPVwiICsgdmFsdWUpKGRlZik7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHRcdHJldHVybiBcIlwiO1xyXG5cdFx0fSlcclxuXHRcdC5yZXBsYWNlKGMudXNlIHx8IHNraXAsIGZ1bmN0aW9uKG0sIGNvZGUpIHtcclxuXHRcdFx0aWYgKGMudXNlUGFyYW1zKSBjb2RlID0gY29kZS5yZXBsYWNlKGMudXNlUGFyYW1zLCBmdW5jdGlvbihtLCBzLCBkLCBwYXJhbSkge1xyXG5cdFx0XHRcdGlmIChkZWZbZF0gJiYgZGVmW2RdLmFyZyAmJiBwYXJhbSkge1xyXG5cdFx0XHRcdFx0dmFyIHJ3ID0gKGQrXCI6XCIrcGFyYW0pLnJlcGxhY2UoLyd8XFxcXC9nLCBcIl9cIik7XHJcblx0XHRcdFx0XHRkZWYuX19leHAgPSBkZWYuX19leHAgfHwge307XHJcblx0XHRcdFx0XHRkZWYuX19leHBbcnddID0gZGVmW2RdLnRleHQucmVwbGFjZShuZXcgUmVnRXhwKFwiKF58W15cXFxcdyRdKVwiICsgZGVmW2RdLmFyZyArIFwiKFteXFxcXHckXSlcIiwgXCJnXCIpLCBcIiQxXCIgKyBwYXJhbSArIFwiJDJcIik7XHJcblx0XHRcdFx0XHRyZXR1cm4gcyArIFwiZGVmLl9fZXhwWydcIitydytcIiddXCI7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9KTtcclxuXHRcdFx0dmFyIHYgPSBuZXcgRnVuY3Rpb24oXCJkZWZcIiwgXCJyZXR1cm4gXCIgKyBjb2RlKShkZWYpO1xyXG5cdFx0XHRyZXR1cm4gdiA/IHJlc29sdmVEZWZzKGMsIHYsIGRlZikgOiB2O1xyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiB1bmVzY2FwZShjb2RlKSB7XHJcblx0XHRyZXR1cm4gY29kZS5yZXBsYWNlKC9cXFxcKCd8XFxcXCkvZywgXCIkMVwiKS5yZXBsYWNlKC9bXFxyXFx0XFxuXS9nLCBcIiBcIik7XHJcblx0fVxyXG5cclxuXHRkb1QudGVtcGxhdGUgPSBmdW5jdGlvbih0bXBsLCBjLCBkZWYpIHtcclxuXHRcdGMgPSBjIHx8IGRvVC50ZW1wbGF0ZVNldHRpbmdzO1xyXG5cdFx0dmFyIGNzZSA9IGMuYXBwZW5kID8gc3RhcnRlbmQuYXBwZW5kIDogc3RhcnRlbmQuc3BsaXQsIG5lZWRodG1sZW5jb2RlLCBzaWQgPSAwLCBpbmR2LFxyXG5cdFx0XHRzdHIgID0gKGMudXNlIHx8IGMuZGVmaW5lKSA/IHJlc29sdmVEZWZzKGMsIHRtcGwsIGRlZiB8fCB7fSkgOiB0bXBsO1xyXG5cclxuXHRcdHN0ciA9IChcInZhciBvdXQ9J1wiICsgKGMuc3RyaXAgPyBzdHIucmVwbGFjZSgvKF58XFxyfFxcbilcXHQqICt8ICtcXHQqKFxccnxcXG58JCkvZyxcIiBcIilcclxuXHRcdFx0XHRcdC5yZXBsYWNlKC9cXHJ8XFxufFxcdHxcXC9cXCpbXFxzXFxTXSo/XFwqXFwvL2csXCJcIik6IHN0cilcclxuXHRcdFx0LnJlcGxhY2UoLyd8XFxcXC9nLCBcIlxcXFwkJlwiKVxyXG5cdFx0XHQucmVwbGFjZShjLmludGVycG9sYXRlIHx8IHNraXAsIGZ1bmN0aW9uKG0sIGNvZGUpIHtcclxuXHRcdFx0XHRyZXR1cm4gY3NlLnN0YXJ0ICsgdW5lc2NhcGUoY29kZSkgKyBjc2UuZW5kO1xyXG5cdFx0XHR9KVxyXG5cdFx0XHQucmVwbGFjZShjLmVuY29kZSB8fCBza2lwLCBmdW5jdGlvbihtLCBjb2RlKSB7XHJcblx0XHRcdFx0bmVlZGh0bWxlbmNvZGUgPSB0cnVlO1xyXG5cdFx0XHRcdHJldHVybiBjc2Uuc3RhcnRlbmNvZGUgKyB1bmVzY2FwZShjb2RlKSArIGNzZS5lbmQ7XHJcblx0XHRcdH0pXHJcblx0XHRcdC5yZXBsYWNlKGMuY29uZGl0aW9uYWwgfHwgc2tpcCwgZnVuY3Rpb24obSwgZWxzZWNhc2UsIGNvZGUpIHtcclxuXHRcdFx0XHRyZXR1cm4gZWxzZWNhc2UgP1xyXG5cdFx0XHRcdFx0KGNvZGUgPyBcIic7fWVsc2UgaWYoXCIgKyB1bmVzY2FwZShjb2RlKSArIFwiKXtvdXQrPSdcIiA6IFwiJzt9ZWxzZXtvdXQrPSdcIikgOlxyXG5cdFx0XHRcdFx0KGNvZGUgPyBcIic7aWYoXCIgKyB1bmVzY2FwZShjb2RlKSArIFwiKXtvdXQrPSdcIiA6IFwiJzt9b3V0Kz0nXCIpO1xyXG5cdFx0XHR9KVxyXG5cdFx0XHQucmVwbGFjZShjLml0ZXJhdGUgfHwgc2tpcCwgZnVuY3Rpb24obSwgaXRlcmF0ZSwgdm5hbWUsIGluYW1lKSB7XHJcblx0XHRcdFx0aWYgKCFpdGVyYXRlKSByZXR1cm4gXCInO30gfSBvdXQrPSdcIjtcclxuXHRcdFx0XHRzaWQrPTE7IGluZHY9aW5hbWUgfHwgXCJpXCIrc2lkOyBpdGVyYXRlPXVuZXNjYXBlKGl0ZXJhdGUpO1xyXG5cdFx0XHRcdHJldHVybiBcIic7dmFyIGFyclwiK3NpZCtcIj1cIitpdGVyYXRlK1wiO2lmKGFyclwiK3NpZCtcIil7dmFyIFwiK3ZuYW1lK1wiLFwiK2luZHYrXCI9LTEsbFwiK3NpZCtcIj1hcnJcIitzaWQrXCIubGVuZ3RoLTE7d2hpbGUoXCIraW5kditcIjxsXCIrc2lkK1wiKXtcIlxyXG5cdFx0XHRcdFx0K3ZuYW1lK1wiPWFyclwiK3NpZCtcIltcIitpbmR2K1wiKz0xXTtvdXQrPSdcIjtcclxuXHRcdFx0fSlcclxuXHRcdFx0LnJlcGxhY2UoYy5ldmFsdWF0ZSB8fCBza2lwLCBmdW5jdGlvbihtLCBjb2RlKSB7XHJcblx0XHRcdFx0cmV0dXJuIFwiJztcIiArIHVuZXNjYXBlKGNvZGUpICsgXCJvdXQrPSdcIjtcclxuXHRcdFx0fSlcclxuXHRcdFx0KyBcIic7cmV0dXJuIG91dDtcIilcclxuXHRcdFx0LnJlcGxhY2UoL1xcbi9nLCBcIlxcXFxuXCIpLnJlcGxhY2UoL1xcdC9nLCAnXFxcXHQnKS5yZXBsYWNlKC9cXHIvZywgXCJcXFxcclwiKVxyXG5cdFx0XHQucmVwbGFjZSgvKFxcc3w7fFxcfXxefFxceylvdXRcXCs9Jyc7L2csICckMScpLnJlcGxhY2UoL1xcKycnL2csIFwiXCIpO1xyXG5cdFx0XHQvLy5yZXBsYWNlKC8oXFxzfDt8XFx9fF58XFx7KW91dFxcKz0nJ1xcKy9nLCckMW91dCs9Jyk7XHJcblxyXG5cdFx0aWYgKG5lZWRodG1sZW5jb2RlKSB7XHJcblx0XHRcdGlmICghYy5zZWxmY29udGFpbmVkICYmIF9nbG9iYWxzICYmICFfZ2xvYmFscy5fZW5jb2RlSFRNTCkgX2dsb2JhbHMuX2VuY29kZUhUTUwgPSBkb1QuZW5jb2RlSFRNTFNvdXJjZShjLmRvTm90U2tpcEVuY29kZWQpO1xyXG5cdFx0XHRzdHIgPSBcInZhciBlbmNvZGVIVE1MID0gdHlwZW9mIF9lbmNvZGVIVE1MICE9PSAndW5kZWZpbmVkJyA/IF9lbmNvZGVIVE1MIDogKFwiXHJcblx0XHRcdFx0KyBkb1QuZW5jb2RlSFRNTFNvdXJjZS50b1N0cmluZygpICsgXCIoXCIgKyAoYy5kb05vdFNraXBFbmNvZGVkIHx8ICcnKSArIFwiKSk7XCJcclxuXHRcdFx0XHQrIHN0cjtcclxuXHRcdH1cclxuXHRcdHRyeSB7XHJcblx0XHRcdHJldHVybiBuZXcgRnVuY3Rpb24oYy52YXJuYW1lLCBzdHIpO1xyXG5cdFx0fSBjYXRjaCAoZSkge1xyXG5cdFx0XHRpZiAodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIpIGNvbnNvbGUubG9nKFwiQ291bGQgbm90IGNyZWF0ZSBhIHRlbXBsYXRlIGZ1bmN0aW9uOiBcIiArIHN0cik7XHJcblx0XHRcdHRocm93IGU7XHJcblx0XHR9XHJcblx0fTtcclxuXHJcblx0ZG9ULmNvbXBpbGUgPSBmdW5jdGlvbih0bXBsLCBkZWYpIHtcclxuXHRcdHJldHVybiBkb1QudGVtcGxhdGUodG1wbCwgbnVsbCwgZGVmKTtcclxuXHR9O1xyXG59KCkpO1xyXG4iLCIvKiBkb1QgKyBhdXRvLWNvbXBpbGF0aW9uIG9mIGRvVCB0ZW1wbGF0ZXNcclxuICpcclxuICogMjAxMiwgTGF1cmEgRG9rdG9yb3ZhLCBodHRwczovL2dpdGh1Yi5jb20vb2xhZG8vZG9UXHJcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZVxyXG4gKlxyXG4gKiBDb21waWxlcyAuZGVmLCAuZG90LCAuanN0IGZpbGVzIGZvdW5kIHVuZGVyIHRoZSBzcGVjaWZpZWQgcGF0aC5cclxuICogSXQgaWdub3JlcyBzdWItZGlyZWN0b3JpZXMuXHJcbiAqIFRlbXBsYXRlIGZpbGVzIGNhbiBoYXZlIG11bHRpcGxlIGV4dGVuc2lvbnMgYXQgdGhlIHNhbWUgdGltZS5cclxuICogRmlsZXMgd2l0aCAuZGVmIGV4dGVuc2lvbiBjYW4gYmUgaW5jbHVkZWQgaW4gb3RoZXIgZmlsZXMgdmlhIHt7I2RlZi5uYW1lfX1cclxuICogRmlsZXMgd2l0aCAuZG90IGV4dGVuc2lvbiBhcmUgY29tcGlsZWQgaW50byBmdW5jdGlvbnMgd2l0aCB0aGUgc2FtZSBuYW1lIGFuZFxyXG4gKiBjYW4gYmUgYWNjZXNzZWQgYXMgcmVuZGVyZXIuZmlsZW5hbWVcclxuICogRmlsZXMgd2l0aCAuanN0IGV4dGVuc2lvbiBhcmUgY29tcGlsZWQgaW50byAuanMgZmlsZXMuIFByb2R1Y2VkIC5qcyBmaWxlIGNhbiBiZVxyXG4gKiBsb2FkZWQgYXMgYSBjb21tb25KUywgQU1EIG1vZHVsZSwgb3IganVzdCBpbnN0YWxsZWQgaW50byBhIGdsb2JhbCB2YXJpYWJsZVxyXG4gKiAoZGVmYXVsdCBpcyBzZXQgdG8gd2luZG93LnJlbmRlcikuXHJcbiAqIEFsbCBpbmxpbmUgZGVmaW5lcyBkZWZpbmVkIGluIHRoZSAuanN0IGZpbGUgYXJlXHJcbiAqIGNvbXBpbGVkIGludG8gc2VwYXJhdGUgZnVuY3Rpb25zIGFuZCBhcmUgYXZhaWxhYmxlIHZpYSBfcmVuZGVyLmZpbGVuYW1lLmRlZmluZW5hbWVcclxuICpcclxuICogQmFzaWMgdXNhZ2U6XHJcbiAqIHZhciBkb3RzID0gcmVxdWlyZShcImRvdFwiKS5wcm9jZXNzKHtwYXRoOiBcIi4vdmlld3NcIn0pO1xyXG4gKiBkb3RzLm15dGVtcGxhdGUoe2ZvbzpcImhlbGxvIHdvcmxkXCJ9KTtcclxuICpcclxuICogVGhlIGFib3ZlIHNuaXBwZXQgd2lsbDpcclxuICogMS4gQ29tcGlsZSBhbGwgdGVtcGxhdGVzIGluIHZpZXdzIGZvbGRlciAoLmRvdCwgLmRlZiwgLmpzdClcclxuICogMi4gUGxhY2UgLmpzIGZpbGVzIGNvbXBpbGVkIGZyb20gLmpzdCB0ZW1wbGF0ZXMgaW50byB0aGUgc2FtZSBmb2xkZXIuXHJcbiAqICAgIFRoZXNlIGZpbGVzIGNhbiBiZSB1c2VkIHdpdGggcmVxdWlyZSwgaS5lLiByZXF1aXJlKFwiLi92aWV3cy9teXRlbXBsYXRlXCIpLlxyXG4gKiAzLiBSZXR1cm4gYW4gb2JqZWN0IHdpdGggZnVuY3Rpb25zIGNvbXBpbGVkIGZyb20gLmRvdCB0ZW1wbGF0ZXMgYXMgaXRzIHByb3BlcnRpZXMuXHJcbiAqIDQuIFJlbmRlciBteXRlbXBsYXRlIHRlbXBsYXRlLlxyXG4gKi9cclxuXHJcbnZhciBmcyA9IHJlcXVpcmUoXCJmc1wiKSxcclxuXHRkb1QgPSBtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCIuL2RvVFwiKTtcclxuXHJcbmRvVC5wcm9jZXNzID0gZnVuY3Rpb24ob3B0aW9ucykge1xyXG5cdC8vcGF0aCwgZGVzdGluYXRpb24sIGdsb2JhbCwgcmVuZGVybW9kdWxlLCB0ZW1wbGF0ZVNldHRpbmdzXHJcblx0cmV0dXJuIG5ldyBJbnN0YWxsRG90cyhvcHRpb25zKS5jb21waWxlQWxsKCk7XHJcbn07XHJcblxyXG5mdW5jdGlvbiBJbnN0YWxsRG90cyhvKSB7XHJcblx0dGhpcy5fX3BhdGggXHRcdD0gby5wYXRoIHx8IFwiLi9cIjtcclxuXHRpZiAodGhpcy5fX3BhdGhbdGhpcy5fX3BhdGgubGVuZ3RoLTFdICE9PSAnLycpIHRoaXMuX19wYXRoICs9ICcvJztcclxuXHR0aGlzLl9fZGVzdGluYXRpb25cdD0gby5kZXN0aW5hdGlvbiB8fCB0aGlzLl9fcGF0aDtcclxuXHRpZiAodGhpcy5fX2Rlc3RpbmF0aW9uW3RoaXMuX19kZXN0aW5hdGlvbi5sZW5ndGgtMV0gIT09ICcvJykgdGhpcy5fX2Rlc3RpbmF0aW9uICs9ICcvJztcclxuXHR0aGlzLl9fZ2xvYmFsXHRcdD0gby5nbG9iYWwgfHwgXCJ3aW5kb3cucmVuZGVyXCI7XHJcblx0dGhpcy5fX3JlbmRlcm1vZHVsZVx0PSBvLnJlbmRlcm1vZHVsZSB8fCB7fTtcclxuXHR0aGlzLl9fc2V0dGluZ3MgXHQ9IG8udGVtcGxhdGVTZXR0aW5ncyA/IGNvcHkoby50ZW1wbGF0ZVNldHRpbmdzLCBjb3B5KGRvVC50ZW1wbGF0ZVNldHRpbmdzKSkgOiB1bmRlZmluZWQ7XHJcblx0dGhpcy5fX2luY2x1ZGVzXHRcdD0ge307XHJcbn1cclxuXHJcbkluc3RhbGxEb3RzLnByb3RvdHlwZS5jb21waWxlVG9GaWxlID0gZnVuY3Rpb24ocGF0aCwgdGVtcGxhdGUsIGRlZikge1xyXG5cdGRlZiA9IGRlZiB8fCB7fTtcclxuXHR2YXIgbW9kdWxlbmFtZSA9IHBhdGguc3Vic3RyaW5nKHBhdGgubGFzdEluZGV4T2YoXCIvXCIpKzEsIHBhdGgubGFzdEluZGV4T2YoXCIuXCIpKVxyXG5cdFx0LCBkZWZzID0gY29weSh0aGlzLl9faW5jbHVkZXMsIGNvcHkoZGVmKSlcclxuXHRcdCwgc2V0dGluZ3MgPSB0aGlzLl9fc2V0dGluZ3MgfHwgZG9ULnRlbXBsYXRlU2V0dGluZ3NcclxuXHRcdCwgY29tcGlsZW9wdGlvbnMgPSBjb3B5KHNldHRpbmdzKVxyXG5cdFx0LCBkZWZhdWx0Y29tcGlsZWQgPSBkb1QudGVtcGxhdGUodGVtcGxhdGUsIHNldHRpbmdzLCBkZWZzKVxyXG5cdFx0LCBleHBvcnRzID0gW11cclxuXHRcdCwgY29tcGlsZWQgPSBcIlwiXHJcblx0XHQsIGZuO1xyXG5cclxuXHRmb3IgKHZhciBwcm9wZXJ0eSBpbiBkZWZzKSB7XHJcblx0XHRpZiAoZGVmc1twcm9wZXJ0eV0gIT09IGRlZltwcm9wZXJ0eV0gJiYgZGVmc1twcm9wZXJ0eV0gIT09IHRoaXMuX19pbmNsdWRlc1twcm9wZXJ0eV0pIHtcclxuXHRcdFx0Zm4gPSB1bmRlZmluZWQ7XHJcblx0XHRcdGlmICh0eXBlb2YgZGVmc1twcm9wZXJ0eV0gPT09ICdzdHJpbmcnKSB7XHJcblx0XHRcdFx0Zm4gPSBkb1QudGVtcGxhdGUoZGVmc1twcm9wZXJ0eV0sIHNldHRpbmdzLCBkZWZzKTtcclxuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgZGVmc1twcm9wZXJ0eV0gPT09ICdmdW5jdGlvbicpIHtcclxuXHRcdFx0XHRmbiA9IGRlZnNbcHJvcGVydHldO1xyXG5cdFx0XHR9IGVsc2UgaWYgKGRlZnNbcHJvcGVydHldLmFyZykge1xyXG5cdFx0XHRcdGNvbXBpbGVvcHRpb25zLnZhcm5hbWUgPSBkZWZzW3Byb3BlcnR5XS5hcmc7XHJcblx0XHRcdFx0Zm4gPSBkb1QudGVtcGxhdGUoZGVmc1twcm9wZXJ0eV0udGV4dCwgY29tcGlsZW9wdGlvbnMsIGRlZnMpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGlmIChmbikge1xyXG5cdFx0XHRcdGNvbXBpbGVkICs9IGZuLnRvU3RyaW5nKCkucmVwbGFjZSgnYW5vbnltb3VzJywgcHJvcGVydHkpO1xyXG5cdFx0XHRcdGV4cG9ydHMucHVzaChwcm9wZXJ0eSk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9XHJcblx0Y29tcGlsZWQgKz0gZGVmYXVsdGNvbXBpbGVkLnRvU3RyaW5nKCkucmVwbGFjZSgnYW5vbnltb3VzJywgbW9kdWxlbmFtZSk7XHJcblx0ZnMud3JpdGVGaWxlU3luYyhwYXRoLCBcIihmdW5jdGlvbigpe1wiICsgY29tcGlsZWRcclxuXHRcdCsgXCJ2YXIgaXRzZWxmPVwiICsgbW9kdWxlbmFtZSArIFwiLCBfZW5jb2RlSFRNTD0oXCIgKyBkb1QuZW5jb2RlSFRNTFNvdXJjZS50b1N0cmluZygpICsgXCIoXCIgKyAoc2V0dGluZ3MuZG9Ob3RTa2lwRW5jb2RlZCB8fCAnJykgKyBcIikpO1wiXHJcblx0XHQrIGFkZGV4cG9ydHMoZXhwb3J0cylcclxuXHRcdCsgXCJpZih0eXBlb2YgbW9kdWxlIT09J3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIG1vZHVsZS5leHBvcnRzPWl0c2VsZjtlbHNlIGlmKHR5cGVvZiBkZWZpbmU9PT0nZnVuY3Rpb24nKWRlZmluZShmdW5jdGlvbigpe3JldHVybiBpdHNlbGY7fSk7ZWxzZSB7XCJcclxuXHRcdCsgdGhpcy5fX2dsb2JhbCArIFwiPVwiICsgdGhpcy5fX2dsb2JhbCArIFwifHx7fTtcIiArIHRoaXMuX19nbG9iYWwgKyBcIlsnXCIgKyBtb2R1bGVuYW1lICsgXCInXT1pdHNlbGY7fX0oKSk7XCIpO1xyXG59O1xyXG5cclxuZnVuY3Rpb24gYWRkZXhwb3J0cyhleHBvcnRzKSB7XHJcblx0Zm9yICh2YXIgcmV0ID0nJywgaT0wOyBpPCBleHBvcnRzLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRyZXQgKz0gXCJpdHNlbGYuXCIgKyBleHBvcnRzW2ldKyBcIj1cIiArIGV4cG9ydHNbaV0rXCI7XCI7XHJcblx0fVxyXG5cdHJldHVybiByZXQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvcHkobywgdG8pIHtcclxuXHR0byA9IHRvIHx8IHt9O1xyXG5cdGZvciAodmFyIHByb3BlcnR5IGluIG8pIHtcclxuXHRcdHRvW3Byb3BlcnR5XSA9IG9bcHJvcGVydHldO1xyXG5cdH1cclxuXHRyZXR1cm4gdG87XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlYWRkYXRhKHBhdGgpIHtcclxuXHR2YXIgZGF0YSA9IGZzLnJlYWRGaWxlU3luYyhwYXRoKTtcclxuXHRpZiAoZGF0YSkgcmV0dXJuIGRhdGEudG9TdHJpbmcoKTtcclxuXHRjb25zb2xlLmxvZyhcInByb2JsZW1zIHdpdGggXCIgKyBwYXRoKTtcclxufVxyXG5cclxuSW5zdGFsbERvdHMucHJvdG90eXBlLmNvbXBpbGVQYXRoID0gZnVuY3Rpb24ocGF0aCkge1xyXG5cdHZhciBkYXRhID0gcmVhZGRhdGEocGF0aCk7XHJcblx0aWYgKGRhdGEpIHtcclxuXHRcdHJldHVybiBkb1QudGVtcGxhdGUoZGF0YSxcclxuXHRcdFx0XHRcdHRoaXMuX19zZXR0aW5ncyB8fCBkb1QudGVtcGxhdGVTZXR0aW5ncyxcclxuXHRcdFx0XHRcdGNvcHkodGhpcy5fX2luY2x1ZGVzKSk7XHJcblx0fVxyXG59O1xyXG5cclxuSW5zdGFsbERvdHMucHJvdG90eXBlLmNvbXBpbGVBbGwgPSBmdW5jdGlvbigpIHtcclxuXHRjb25zb2xlLmxvZyhcIkNvbXBpbGluZyBhbGwgZG9UIHRlbXBsYXRlcy4uLlwiKTtcclxuXHJcblx0dmFyIGRlZkZvbGRlciA9IHRoaXMuX19wYXRoLFxyXG5cdFx0c291cmNlcyA9IGZzLnJlYWRkaXJTeW5jKGRlZkZvbGRlciksXHJcblx0XHRrLCBsLCBuYW1lO1xyXG5cclxuXHRmb3IoIGsgPSAwLCBsID0gc291cmNlcy5sZW5ndGg7IGsgPCBsOyBrKyspIHtcclxuXHRcdG5hbWUgPSBzb3VyY2VzW2tdO1xyXG5cdFx0aWYgKC9cXC5kZWYoXFwuZG90fFxcLmpzdCk/JC8udGVzdChuYW1lKSkge1xyXG5cdFx0XHRjb25zb2xlLmxvZyhcIkxvYWRlZCBkZWYgXCIgKyBuYW1lKTtcclxuXHRcdFx0dGhpcy5fX2luY2x1ZGVzW25hbWUuc3Vic3RyaW5nKDAsIG5hbWUuaW5kZXhPZignLicpKV0gPSByZWFkZGF0YShkZWZGb2xkZXIgKyBuYW1lKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdGZvciggayA9IDAsIGwgPSBzb3VyY2VzLmxlbmd0aDsgayA8IGw7IGsrKykge1xyXG5cdFx0bmFtZSA9IHNvdXJjZXNba107XHJcblx0XHRpZiAoL1xcLmRvdChcXC5kZWZ8XFwuanN0KT8kLy50ZXN0KG5hbWUpKSB7XHJcblx0XHRcdGNvbnNvbGUubG9nKFwiQ29tcGlsaW5nIFwiICsgbmFtZSArIFwiIHRvIGZ1bmN0aW9uXCIpO1xyXG5cdFx0XHR0aGlzLl9fcmVuZGVybW9kdWxlW25hbWUuc3Vic3RyaW5nKDAsIG5hbWUuaW5kZXhPZignLicpKV0gPSB0aGlzLmNvbXBpbGVQYXRoKGRlZkZvbGRlciArIG5hbWUpO1xyXG5cdFx0fVxyXG5cdFx0aWYgKC9cXC5qc3QoXFwuZG90fFxcLmRlZik/JC8udGVzdChuYW1lKSkge1xyXG5cdFx0XHRjb25zb2xlLmxvZyhcIkNvbXBpbGluZyBcIiArIG5hbWUgKyBcIiB0byBmaWxlXCIpO1xyXG5cdFx0XHR0aGlzLmNvbXBpbGVUb0ZpbGUodGhpcy5fX2Rlc3RpbmF0aW9uICsgbmFtZS5zdWJzdHJpbmcoMCwgbmFtZS5pbmRleE9mKCcuJykpICsgJy5qcycsXHJcblx0XHRcdFx0XHRyZWFkZGF0YShkZWZGb2xkZXIgKyBuYW1lKSk7XHJcblx0XHR9XHJcblx0fVxyXG5cdHJldHVybiB0aGlzLl9fcmVuZGVybW9kdWxlO1xyXG59O1xyXG4iLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xyXG4vKiBnbG9iYWwgd2luZG93OiBmYWxzZSAqL1xyXG4vKiBnbG9iYWwgZG9jdW1lbnQ6IGZhbHNlICovXHJcbid1c2Ugc3RyaWN0JztcclxuXHJcbi8vIGxpc3QgcHJlZml4ZXMgYW5kIGNhc2UgdHJhbnNmb3Jtc1xyXG4vLyAocmV2ZXJzZSBvcmRlciBhcyBhIGRlY3JlbWVudGluZyBmb3IgbG9vcCBpcyB1c2VkKVxyXG52YXIgcHJlZml4ZXMgPSBbXHJcbiAgJ21zJyxcclxuICAnbXMnLCAvLyBpbnRlbnRpb25hbDogMm5kIGVudHJ5IGZvciBtcyBhcyB3ZSB3aWxsIGFsc28gdHJ5IFBhc2NhbCBjYXNlIGZvciBNU1xyXG4gICdPJyxcclxuICAnTW96JyxcclxuICAnV2Via2l0JyxcclxuICAnJ1xyXG5dO1xyXG5cclxudmFyIGNhc2VUcmFuc2Zvcm1zID0gW1xyXG4gIHRvQ2FtZWxDYXNlLFxyXG4gIG51bGwsXHJcbiAgbnVsbCxcclxuICB0b0NhbWVsQ2FzZSxcclxuICBudWxsLFxyXG4gIHRvQ2FtZWxDYXNlXHJcbl07XHJcblxyXG52YXIgcHJvcHMgPSB7fTtcclxudmFyIHN0eWxlO1xyXG5cclxuLyoqXHJcbiAgIyMjIGNzcyhwcm9wKVxyXG5cclxuICBUZXN0IGZvciB0aGUgcHJlc2NlbmNlIG9mIHRoZSBzcGVjaWZpZWQgQ1NTIHByb3BlcnR5IChpbiBhbGwgaXQnc1xyXG4gIHBvc3NpYmxlIGJyb3dzZXIgcHJlZml4ZWQgdmFyaWFudHMpLiAgVGhlIHJldHVybmVkIGZ1bmN0aW9uIChpZiB3ZVxyXG4gIGFyZSBhYmxlIHRvIGFjY2VzcyB0aGUgcmVxdWlyZWQgc3R5bGUgcHJvcGVydHkpIGlzIGJvdGggYSBnZXR0ZXIgYW5kXHJcbiAgc2V0dGVyIGZ1bmN0aW9uIGZvciB3aGVuIGdpdmVuIGFuIGVsZW1lbnQuXHJcblxyXG4gIENvbnNpZGVyIHRoZSBmb2xsb3dpbmcgZXhhbXBsZSwgd2l0aCByZWdhcmRzIHRvIENTUyB0cmFuc2Zvcm1zOlxyXG5cclxuICA8PDwgZXhhbXBsZXMvdHJhbnNmb3JtLmpzXHJcblxyXG4qKi9cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihwcm9wKSB7XHJcbiAgdmFyIGlpO1xyXG4gIHZhciBwcm9wTmFtZTtcclxuICB2YXIgcGFzY2FsQ2FzZU5hbWU7XHJcblxyXG4gIHN0eWxlID0gc3R5bGUgfHwgZG9jdW1lbnQuYm9keS5zdHlsZTtcclxuXHJcbiAgLy8gaWYgd2UgYWxyZWFkeSBoYXZlIGEgdmFsdWUgZm9yIHRoZSB0YXJnZXQgcHJvcGVydHksIHJldHVyblxyXG4gIGlmIChwcm9wc1twcm9wXSB8fCBzdHlsZVtwcm9wXSkge1xyXG4gICAgcmV0dXJuIHByb3BzW3Byb3BdO1xyXG4gIH1cclxuXHJcbiAgLy8gY29udmVydCBhIGRhc2ggZGVsaW1pdGVkIHByb3BlcnR5bmFtZSAoZS5nLiBib3gtc2hhZG93KSBpbnRvXHJcbiAgLy8gcGFzY2FsIGNhc2VkIG5hbWUgKGUuZy4gQm94U2hhZG93KVxyXG4gIHBhc2NhbENhc2VOYW1lID0gcHJvcC5zcGxpdCgnLScpLnJlZHVjZShmdW5jdGlvbihtZW1vLCB2YWwpIHtcclxuICAgIHJldHVybiBtZW1vICsgdmFsLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgdmFsLnNsaWNlKDEpO1xyXG4gIH0sICcnKTtcclxuXHJcbiAgLy8gY2hlY2sgZm9yIHRoZSBwcm9wZXJ0eVxyXG4gIGZvciAoaWkgPSBwcmVmaXhlcy5sZW5ndGg7IGlpLS07ICkge1xyXG4gICAgcHJvcE5hbWUgPSBwcmVmaXhlc1tpaV0gKyAoY2FzZVRyYW5zZm9ybXNbaWldID9cclxuICAgICAgICAgICAgICAgICAgY2FzZVRyYW5zZm9ybXNbaWldKHBhc2NhbENhc2VOYW1lKSA6XHJcbiAgICAgICAgICAgICAgICAgIHBhc2NhbENhc2VOYW1lKTtcclxuXHJcbiAgICBpZiAodHlwZW9mIHN0eWxlW3Byb3BOYW1lXSAhPSAndW5kZWZpbmVkJykge1xyXG4gICAgICBwcm9wc1twcm9wXSA9IGNyZWF0ZUdldHRlclNldHRlcihwcm9wTmFtZSk7XHJcbiAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHByb3BzW3Byb3BdO1xyXG59O1xyXG5cclxuLyogaW50ZXJuYWwgaGVscGVyIGZ1bmN0aW9ucyAqL1xyXG5cclxuZnVuY3Rpb24gY3JlYXRlR2V0dGVyU2V0dGVyKHByb3BOYW1lKSB7XHJcbiAgZnVuY3Rpb24gZ3MoZWxlbWVudCwgdmFsdWUpIHtcclxuICAgIC8vIGlmIHdlIGhhdmUgYSB2YWx1ZSB1cGRhdGVcclxuICAgIGlmICh0eXBlb2YgdmFsdWUgIT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgZWxlbWVudC5zdHlsZVtwcm9wTmFtZV0gPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWxlbWVudClbcHJvcE5hbWVdO1xyXG4gIH1cclxuXHJcbiAgLy8gYXR0YWNoIHRoZSBwcm9wZXJ0eSBuYW1lIHRvIHRoZSBnZXR0ZXIgYW5kIHNldHRlclxyXG4gIGdzLnByb3BlcnR5ID0gcHJvcE5hbWU7XHJcbiAgcmV0dXJuIGdzO1xyXG59XHJcblxyXG5mdW5jdGlvbiB0b0NhbWVsQ2FzZShpbnB1dCkge1xyXG4gIHJldHVybiBpbnB1dC5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGlucHV0LnNsaWNlKDEpO1xyXG59IiwidmFyIGluc2VydGVkID0ge307XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjc3MsIG9wdGlvbnMpIHtcclxuICAgIGlmIChpbnNlcnRlZFtjc3NdKSByZXR1cm47XHJcbiAgICBpbnNlcnRlZFtjc3NdID0gdHJ1ZTtcclxuICAgIFxyXG4gICAgdmFyIGVsZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xyXG4gICAgZWxlbS5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAndGV4dC9jc3MnKTtcclxuXHJcbiAgICBpZiAoJ3RleHRDb250ZW50JyBpbiBlbGVtKSB7XHJcbiAgICAgIGVsZW0udGV4dENvbnRlbnQgPSBjc3M7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBlbGVtLnN0eWxlU2hlZXQuY3NzVGV4dCA9IGNzcztcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIGhlYWQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaGVhZCcpWzBdO1xyXG4gICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5wcmVwZW5kKSB7XHJcbiAgICAgICAgaGVhZC5pbnNlcnRCZWZvcmUoZWxlbSwgaGVhZC5jaGlsZE5vZGVzWzBdKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaGVhZC5hcHBlbmRDaGlsZChlbGVtKTtcclxuICAgIH1cclxufTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uKGRlY2spIHtcclxuICAgIHZhciBheGlzID0gb3B0aW9ucyA9PSAndmVydGljYWwnID8gJ1knIDogJ1gnLFxyXG4gICAgICBzdGFydFBvc2l0aW9uLFxyXG4gICAgICBkZWx0YTtcclxuXHJcbiAgICBkZWNrLnBhcmVudC5hZGRFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0JywgZnVuY3Rpb24oZSkge1xyXG4gICAgICBpZiAoZS50b3VjaGVzLmxlbmd0aCA9PSAxKSB7XHJcbiAgICAgICAgc3RhcnRQb3NpdGlvbiA9IGUudG91Y2hlc1swXVsncGFnZScgKyBheGlzXTtcclxuICAgICAgICBkZWx0YSA9IDA7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGRlY2sucGFyZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNobW92ZScsIGZ1bmN0aW9uKGUpIHtcclxuICAgICAgaWYgKGUudG91Y2hlcy5sZW5ndGggPT0gMSkge1xyXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICBkZWx0YSA9IGUudG91Y2hlc1swXVsncGFnZScgKyBheGlzXSAtIHN0YXJ0UG9zaXRpb247XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGRlY2sucGFyZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoZW5kJywgZnVuY3Rpb24oKSB7XHJcbiAgICAgIGlmIChNYXRoLmFicyhkZWx0YSkgPiA1MCkge1xyXG4gICAgICAgIGRlY2tbZGVsdGEgPiAwID8gJ3ByZXYnIDogJ25leHQnXSgpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9O1xyXG59O1xyXG4iLCJ2YXIgZnJvbSA9IGZ1bmN0aW9uKHNlbGVjdG9yT3JFbGVtZW50LCBwbHVnaW5zKSB7XHJcbiAgdmFyIHBhcmVudCA9IHNlbGVjdG9yT3JFbGVtZW50Lm5vZGVUeXBlID09PSAxID8gc2VsZWN0b3JPckVsZW1lbnQgOiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yT3JFbGVtZW50KSxcclxuICAgIHNsaWRlcyA9IFtdLmZpbHRlci5jYWxsKHBhcmVudC5jaGlsZHJlbiwgZnVuY3Rpb24oZWwpIHsgcmV0dXJuIGVsLm5vZGVOYW1lICE9PSAnU0NSSVBUJzsgfSksXHJcbiAgICBhY3RpdmVTbGlkZSA9IHNsaWRlc1swXSxcclxuICAgIGxpc3RlbmVycyA9IHt9LFxyXG5cclxuICAgIGFjdGl2YXRlID0gZnVuY3Rpb24oaW5kZXgsIGN1c3RvbURhdGEpIHtcclxuICAgICAgaWYgKCFzbGlkZXNbaW5kZXhdKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmaXJlKCdkZWFjdGl2YXRlJywgY3JlYXRlRXZlbnREYXRhKGFjdGl2ZVNsaWRlLCBjdXN0b21EYXRhKSk7XHJcbiAgICAgIGFjdGl2ZVNsaWRlID0gc2xpZGVzW2luZGV4XTtcclxuICAgICAgZmlyZSgnYWN0aXZhdGUnLCBjcmVhdGVFdmVudERhdGEoYWN0aXZlU2xpZGUsIGN1c3RvbURhdGEpKTtcclxuICAgIH0sXHJcblxyXG4gICAgc2xpZGUgPSBmdW5jdGlvbihpbmRleCwgY3VzdG9tRGF0YSkge1xyXG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCkge1xyXG4gICAgICAgIGZpcmUoJ3NsaWRlJywgY3JlYXRlRXZlbnREYXRhKHNsaWRlc1tpbmRleF0sIGN1c3RvbURhdGEpKSAmJiBhY3RpdmF0ZShpbmRleCwgY3VzdG9tRGF0YSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIHNsaWRlcy5pbmRleE9mKGFjdGl2ZVNsaWRlKTtcclxuICAgICAgfVxyXG4gICAgfSxcclxuXHJcbiAgICBzdGVwID0gZnVuY3Rpb24ob2Zmc2V0LCBjdXN0b21EYXRhKSB7XHJcbiAgICAgIHZhciBzbGlkZUluZGV4ID0gc2xpZGVzLmluZGV4T2YoYWN0aXZlU2xpZGUpICsgb2Zmc2V0O1xyXG5cclxuICAgICAgZmlyZShvZmZzZXQgPiAwID8gJ25leHQnIDogJ3ByZXYnLCBjcmVhdGVFdmVudERhdGEoYWN0aXZlU2xpZGUsIGN1c3RvbURhdGEpKSAmJiBhY3RpdmF0ZShzbGlkZUluZGV4LCBjdXN0b21EYXRhKTtcclxuICAgIH0sXHJcblxyXG4gICAgb24gPSBmdW5jdGlvbihldmVudE5hbWUsIGNhbGxiYWNrKSB7XHJcbiAgICAgIChsaXN0ZW5lcnNbZXZlbnROYW1lXSB8fCAobGlzdGVuZXJzW2V2ZW50TmFtZV0gPSBbXSkpLnB1c2goY2FsbGJhY2spO1xyXG5cclxuICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGxpc3RlbmVyc1tldmVudE5hbWVdID0gbGlzdGVuZXJzW2V2ZW50TmFtZV0uZmlsdGVyKGZ1bmN0aW9uKGxpc3RlbmVyKSB7XHJcbiAgICAgICAgICByZXR1cm4gbGlzdGVuZXIgIT09IGNhbGxiYWNrO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9O1xyXG4gICAgfSxcclxuXHJcbiAgICBmaXJlID0gZnVuY3Rpb24oZXZlbnROYW1lLCBldmVudERhdGEpIHtcclxuICAgICAgcmV0dXJuIChsaXN0ZW5lcnNbZXZlbnROYW1lXSB8fCBbXSlcclxuICAgICAgICAucmVkdWNlKGZ1bmN0aW9uKG5vdENhbmNlbGxlZCwgY2FsbGJhY2spIHtcclxuICAgICAgICAgIHJldHVybiBub3RDYW5jZWxsZWQgJiYgY2FsbGJhY2soZXZlbnREYXRhKSAhPT0gZmFsc2U7XHJcbiAgICAgICAgfSwgdHJ1ZSk7XHJcbiAgICB9LFxyXG5cclxuICAgIGNyZWF0ZUV2ZW50RGF0YSA9IGZ1bmN0aW9uKGVsLCBldmVudERhdGEpIHtcclxuICAgICAgZXZlbnREYXRhID0gZXZlbnREYXRhIHx8IHt9O1xyXG4gICAgICBldmVudERhdGEuaW5kZXggPSBzbGlkZXMuaW5kZXhPZihlbCk7XHJcbiAgICAgIGV2ZW50RGF0YS5zbGlkZSA9IGVsO1xyXG4gICAgICByZXR1cm4gZXZlbnREYXRhO1xyXG4gICAgfSxcclxuXHJcbiAgICBkZWNrID0ge1xyXG4gICAgICBvbjogb24sXHJcbiAgICAgIGZpcmU6IGZpcmUsXHJcbiAgICAgIHNsaWRlOiBzbGlkZSxcclxuICAgICAgbmV4dDogc3RlcC5iaW5kKG51bGwsIDEpLFxyXG4gICAgICBwcmV2OiBzdGVwLmJpbmQobnVsbCwgLTEpLFxyXG4gICAgICBwYXJlbnQ6IHBhcmVudCxcclxuICAgICAgc2xpZGVzOiBzbGlkZXNcclxuICAgIH07XHJcblxyXG4gIChwbHVnaW5zIHx8IFtdKS5mb3JFYWNoKGZ1bmN0aW9uKHBsdWdpbikge1xyXG4gICAgcGx1Z2luKGRlY2spO1xyXG4gIH0pO1xyXG5cclxuICBhY3RpdmF0ZSgwKTtcclxuXHJcbiAgcmV0dXJuIGRlY2s7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICBmcm9tOiBmcm9tXHJcbn07XHJcbiIsbnVsbCwiLy8gUmVxdWlyZSBOb2RlIG1vZHVsZXMgaW4gdGhlIGJyb3dzZXIgdGhhbmtzIHRvIEJyb3dzZXJpZnk6IGh0dHA6Ly9icm93c2VyaWZ5Lm9yZ1xyXG52YXIgYmVzcG9rZSA9IHJlcXVpcmUoJ2Jlc3Bva2UnKSxcclxuICAvL2N1YmUgPSByZXF1aXJlKCdiZXNwb2tlLXRoZW1lLWN1YmUnKSxcclxuICAvL3ZvbHRhaXJlID0gcmVxdWlyZSgnYmVzcG9rZS10aGVtZS12b2x0YWlyZScpLFxyXG4gIC8vdGVybWluYWwgPSByZXF1aXJlKCdiZXNwb2tlLXRoZW1lLXRlcm1pbmFsJyksXHJcbiAgLy9mYW5jeSA9IHJlcXVpcmUoJ2Jlc3Bva2UtdGhlbWUtZmFuY3knKTtcclxuICAvL3NpbXBsZVNsaWRlID0gcmVxdWlyZSgnYmVzcG9rZS10aGVtZS1zaW1wbGUtc2xpZGUnKTtcclxuICAvL21vemlsbGFTYW5kc3RvbmUgPSByZXF1aXJlKCdiZXNwb2tlLXRoZW1lLW1vemlsbGEtc2FuZHN0b25lJyk7XHJcbiAgdHdlYWthYmxlID0gcmVxdWlyZSgnYmVzcG9rZS10aGVtZS10d2Vha2FibGUnKTtcclxuICBrZXlzID0gcmVxdWlyZSgnYmVzcG9rZS1rZXlzJyksXHJcbiAgdG91Y2ggPSByZXF1aXJlKCdiZXNwb2tlLXRvdWNoJyksXHJcbiAgYnVsbGV0cyA9IHJlcXVpcmUoJ2Jlc3Bva2UtYnVsbGV0cycpLFxyXG4gIGJhY2tkcm9wID0gcmVxdWlyZSgnYmVzcG9rZS1iYWNrZHJvcCcpLFxyXG4gIHNjYWxlID0gcmVxdWlyZSgnYmVzcG9rZS1zY2FsZScpLFxyXG4gIGhhc2ggPSByZXF1aXJlKCdiZXNwb2tlLWhhc2gnKSxcclxuICBwcm9ncmVzcyA9IHJlcXVpcmUoJ2Jlc3Bva2UtcHJvZ3Jlc3MnKSxcclxuICBmb3JtcyA9IHJlcXVpcmUoJ2Jlc3Bva2UtZm9ybXMnKTtcclxuXHJcbi8vIEJlc3Bva2UuanNcclxuYmVzcG9rZS5mcm9tKCdhcnRpY2xlJywgW1xyXG4gIC8vY3ViZSgpLFxyXG4gIC8vdm9sdGFpcmUoKSxcclxuICAvL3Rlcm1pbmFsKCksXHJcbiAgLy9mYW5jeSgpLFxyXG4gIC8vc2ltcGxlU2xpZGUoKSxcclxuICAvL21vemlsbGFTYW5kc3RvbmUoKSxcclxuICB0d2Vha2FibGUoKSxcclxuICBrZXlzKCksXHJcbiAgdG91Y2goKSxcclxuICBidWxsZXRzKCdsaSwgLmJ1bGxldCcpLFxyXG4gIGJhY2tkcm9wKCksXHJcbiAgc2NhbGUoKSxcclxuICBoYXNoKCksXHJcbiAgcHJvZ3Jlc3MoKSxcclxuICBmb3JtcygpXHJcbl0pO1xyXG5cclxuLy8gUHJpc20gc3ludGF4IGhpZ2hsaWdodGluZ1xyXG4vLyBUaGlzIGlzIGFjdHVhbGx5IGxvYWRlZCBmcm9tIFwiYm93ZXJfY29tcG9uZW50c1wiIHRoYW5rcyB0b1xyXG4vLyBkZWJvd2VyaWZ5OiBodHRwczovL2dpdGh1Yi5jb20vZXVnZW5ld2FyZS9kZWJvd2VyaWZ5XHJcbnJlcXVpcmUoXCIuLy4uXFxcXC4uXFxcXGJvd2VyX2NvbXBvbmVudHNcXFxccHJpc21cXFxccHJpc20uanNcIik7XHJcblxyXG4iXX0=
>>>>>>> d1d15e148c814987980dc5a801710102de84975b
