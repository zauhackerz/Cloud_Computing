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

var insertCss = require('insert-css');
var transform = require('feature/css')('transform');
var dot = require('dot');
var theme = dot.template("@import url(http://fonts.googleapis.com/css?family={{= it.font || 'Montserrat'}});\n@import url(http://fonts.googleapis.com/css?family={{= it.font || 'Source+Code+Pro'}});\n\nhtml, body {\n  margin: 0;\n  width: 100%;\n  height: 100%;\n  overflow: hidden;\n  color: {{= it.color || 'white' }};\n  background: {{= it.background || 'black' }};\n}\n\n.bespoke-parent {\n  text-align: center;\n  font-size: 1.5em;\n  display: flex;\n  width: auto;\n  height: 100%;\n  transition: transform 0.5s ease-in-out;\n  font-family: 'Montserrat', sans-serif;\n}\n\n.bespoke-slide {\n  padding: 5%;\n  width: 90%;\n  height: 90%;\n\n  background-position: 50% 50%;\n  background-repeat: no-repeat;\n\n  display: flex;\n  flex-direction: column;\n  flex-shrink: 0;\n  justify-content: center;\n}\n\n.bespoke-slide ul, .bespoke-slide ol {\n  text-align: left;\n}\n\n.bespoke-slide h1, .bespoke-slide h2, .bespoke-slide h3 {\n  margin: 0px;\n}\n\n.bespoke-slide h1 + h2 {\n  margin-top: 10px;\n}\n\n.bespoke-slide h1 {\n  font-size: 4em;\n  text-shadow: 1.5px 1.5px 1px {{= it.background || 'black' }};\n}\n\n.bespoke-slide pre, .bespoke-slide code {\n  font-family: 'Source Code Pro', monospace;\n}\n\n.bespoke-slide li {\n  line-height: 2em;\n}\n\n.bespoke-slide blockquote {\n  text-align: justify;\n  font-style: italic;\n}\n\n.bespoke-slide a, .bespoke-slide a:visited {\n  text-decoration: none;\n  color: {{= it.linkcolor || 'yellow' }};\n}\n\n.bespoke-bullet {\n  transition: transform 0.5s ease-in-out;\n}\n\n.bespoke-bullet.bespoke-bullet-inactive {\n  transform: translateY(100vh) translateZ(0);\n}\n");

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

},{"bespoke-classes":10,"dot":12,"feature/css":13,"insert-css":14}],10:[function(require,module,exports){
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
require("./../../bower_components/prism/prism.js");


<<<<<<< HEAD
},{"./../../bower_components/prism/prism.js":1,"bespoke":16,"bespoke-backdrop":2,"bespoke-bullets":3,"bespoke-forms":4,"bespoke-hash":5,"bespoke-keys":6,"bespoke-progress":7,"bespoke-scale":8,"bespoke-theme-tweakable":9,"bespoke-touch":15}]},{},[18])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL3RhbnRvd2kvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9ob21lL3RhbnRvd2kvQ2xvdWRfQ29tcHV0aW5nL2Jvd2VyX2NvbXBvbmVudHMvcHJpc20vcHJpc20uanMiLCIvaG9tZS90YW50b3dpL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS1iYWNrZHJvcC9saWIvYmVzcG9rZS1iYWNrZHJvcC5qcyIsIi9ob21lL3RhbnRvd2kvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlLWJ1bGxldHMvbGliL2Jlc3Bva2UtYnVsbGV0cy5qcyIsIi9ob21lL3RhbnRvd2kvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlLWZvcm1zL2xpYi9iZXNwb2tlLWZvcm1zLmpzIiwiL2hvbWUvdGFudG93aS9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtaGFzaC9saWIvYmVzcG9rZS1oYXNoLmpzIiwiL2hvbWUvdGFudG93aS9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2Uta2V5cy9saWIvYmVzcG9rZS1rZXlzLmpzIiwiL2hvbWUvdGFudG93aS9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtcHJvZ3Jlc3MvbGliL2Jlc3Bva2UtcHJvZ3Jlc3MuanMiLCIvaG9tZS90YW50b3dpL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS1zY2FsZS9saWIvYmVzcG9rZS1zY2FsZS5qcyIsIi9ob21lL3RhbnRvd2kvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlLXRoZW1lLXR3ZWFrYWJsZS9pbmRleC5qcyIsIi9ob21lL3RhbnRvd2kvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlLXRoZW1lLXR3ZWFrYWJsZS9ub2RlX21vZHVsZXMvYmVzcG9rZS1jbGFzc2VzL2xpYi9iZXNwb2tlLWNsYXNzZXMuanMiLCIvaG9tZS90YW50b3dpL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS10aGVtZS10d2Vha2FibGUvbm9kZV9tb2R1bGVzL2RvdC9kb1QuanMiLCIvaG9tZS90YW50b3dpL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS10aGVtZS10d2Vha2FibGUvbm9kZV9tb2R1bGVzL2RvdC9pbmRleC5qcyIsIi9ob21lL3RhbnRvd2kvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlLXRoZW1lLXR3ZWFrYWJsZS9ub2RlX21vZHVsZXMvZmVhdHVyZS9jc3MuanMiLCIvaG9tZS90YW50b3dpL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS10aGVtZS10d2Vha2FibGUvbm9kZV9tb2R1bGVzL2luc2VydC1jc3MvaW5kZXguanMiLCIvaG9tZS90YW50b3dpL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS10b3VjaC9saWIvYmVzcG9rZS10b3VjaC5qcyIsIi9ob21lL3RhbnRvd2kvQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlL2xpYi9iZXNwb2tlLmpzIiwiL2hvbWUvdGFudG93aS9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwiL2hvbWUvdGFudG93aS9DbG91ZF9Db21wdXRpbmcvc3JjL3NjcmlwdHMvZmFrZV9hM2ZiMjlhYy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcbi8qICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgQmVnaW4gcHJpc20tY29yZS5qc1xuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xuXG5zZWxmID0gKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKVxuXHQ/IHdpbmRvdyAgIC8vIGlmIGluIGJyb3dzZXJcblx0OiAoXG5cdFx0KHR5cGVvZiBXb3JrZXJHbG9iYWxTY29wZSAhPT0gJ3VuZGVmaW5lZCcgJiYgc2VsZiBpbnN0YW5jZW9mIFdvcmtlckdsb2JhbFNjb3BlKVxuXHRcdD8gc2VsZiAvLyBpZiBpbiB3b3JrZXJcblx0XHQ6IHt9ICAgLy8gaWYgaW4gbm9kZSBqc1xuXHQpO1xuXG4vKipcbiAqIFByaXNtOiBMaWdodHdlaWdodCwgcm9idXN0LCBlbGVnYW50IHN5bnRheCBoaWdobGlnaHRpbmdcbiAqIE1JVCBsaWNlbnNlIGh0dHA6Ly93d3cub3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvbWl0LWxpY2Vuc2UucGhwL1xuICogQGF1dGhvciBMZWEgVmVyb3UgaHR0cDovL2xlYS52ZXJvdS5tZVxuICovXG5cbnZhciBQcmlzbSA9IChmdW5jdGlvbigpe1xuXG4vLyBQcml2YXRlIGhlbHBlciB2YXJzXG52YXIgbGFuZyA9IC9cXGJsYW5nKD86dWFnZSk/LSg/IVxcKikoXFx3KylcXGIvaTtcblxudmFyIF8gPSBzZWxmLlByaXNtID0ge1xuXHR1dGlsOiB7XG5cdFx0ZW5jb2RlOiBmdW5jdGlvbiAodG9rZW5zKSB7XG5cdFx0XHRpZiAodG9rZW5zIGluc3RhbmNlb2YgVG9rZW4pIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBUb2tlbih0b2tlbnMudHlwZSwgXy51dGlsLmVuY29kZSh0b2tlbnMuY29udGVudCksIHRva2Vucy5hbGlhcyk7XG5cdFx0XHR9IGVsc2UgaWYgKF8udXRpbC50eXBlKHRva2VucykgPT09ICdBcnJheScpIHtcblx0XHRcdFx0cmV0dXJuIHRva2Vucy5tYXAoXy51dGlsLmVuY29kZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdG9rZW5zLnJlcGxhY2UoLyYvZywgJyZhbXA7JykucmVwbGFjZSgvPC9nLCAnJmx0OycpLnJlcGxhY2UoL1xcdTAwYTAvZywgJyAnKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0dHlwZTogZnVuY3Rpb24gKG8pIHtcblx0XHRcdHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobykubWF0Y2goL1xcW29iamVjdCAoXFx3KylcXF0vKVsxXTtcblx0XHR9LFxuXG5cdFx0Ly8gRGVlcCBjbG9uZSBhIGxhbmd1YWdlIGRlZmluaXRpb24gKGUuZy4gdG8gZXh0ZW5kIGl0KVxuXHRcdGNsb25lOiBmdW5jdGlvbiAobykge1xuXHRcdFx0dmFyIHR5cGUgPSBfLnV0aWwudHlwZShvKTtcblxuXHRcdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRcdGNhc2UgJ09iamVjdCc6XG5cdFx0XHRcdFx0dmFyIGNsb25lID0ge307XG5cblx0XHRcdFx0XHRmb3IgKHZhciBrZXkgaW4gbykge1xuXHRcdFx0XHRcdFx0aWYgKG8uaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHRcdFx0XHRcdFx0XHRjbG9uZVtrZXldID0gXy51dGlsLmNsb25lKG9ba2V5XSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGNsb25lO1xuXG5cdFx0XHRcdGNhc2UgJ0FycmF5Jzpcblx0XHRcdFx0XHRyZXR1cm4gby5tYXAoZnVuY3Rpb24odikgeyByZXR1cm4gXy51dGlsLmNsb25lKHYpOyB9KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG87XG5cdFx0fVxuXHR9LFxuXG5cdGxhbmd1YWdlczoge1xuXHRcdGV4dGVuZDogZnVuY3Rpb24gKGlkLCByZWRlZikge1xuXHRcdFx0dmFyIGxhbmcgPSBfLnV0aWwuY2xvbmUoXy5sYW5ndWFnZXNbaWRdKTtcblxuXHRcdFx0Zm9yICh2YXIga2V5IGluIHJlZGVmKSB7XG5cdFx0XHRcdGxhbmdba2V5XSA9IHJlZGVmW2tleV07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBsYW5nO1xuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBJbnNlcnQgYSB0b2tlbiBiZWZvcmUgYW5vdGhlciB0b2tlbiBpbiBhIGxhbmd1YWdlIGxpdGVyYWxcblx0XHQgKiBBcyB0aGlzIG5lZWRzIHRvIHJlY3JlYXRlIHRoZSBvYmplY3QgKHdlIGNhbm5vdCBhY3R1YWxseSBpbnNlcnQgYmVmb3JlIGtleXMgaW4gb2JqZWN0IGxpdGVyYWxzKSxcblx0XHQgKiB3ZSBjYW5ub3QganVzdCBwcm92aWRlIGFuIG9iamVjdCwgd2UgbmVlZCBhbm9iamVjdCBhbmQgYSBrZXkuXG5cdFx0ICogQHBhcmFtIGluc2lkZSBUaGUga2V5IChvciBsYW5ndWFnZSBpZCkgb2YgdGhlIHBhcmVudFxuXHRcdCAqIEBwYXJhbSBiZWZvcmUgVGhlIGtleSB0byBpbnNlcnQgYmVmb3JlLiBJZiBub3QgcHJvdmlkZWQsIHRoZSBmdW5jdGlvbiBhcHBlbmRzIGluc3RlYWQuXG5cdFx0ICogQHBhcmFtIGluc2VydCBPYmplY3Qgd2l0aCB0aGUga2V5L3ZhbHVlIHBhaXJzIHRvIGluc2VydFxuXHRcdCAqIEBwYXJhbSByb290IFRoZSBvYmplY3QgdGhhdCBjb250YWlucyBgaW5zaWRlYC4gSWYgZXF1YWwgdG8gUHJpc20ubGFuZ3VhZ2VzLCBpdCBjYW4gYmUgb21pdHRlZC5cblx0XHQgKi9cblx0XHRpbnNlcnRCZWZvcmU6IGZ1bmN0aW9uIChpbnNpZGUsIGJlZm9yZSwgaW5zZXJ0LCByb290KSB7XG5cdFx0XHRyb290ID0gcm9vdCB8fCBfLmxhbmd1YWdlcztcblx0XHRcdHZhciBncmFtbWFyID0gcm9vdFtpbnNpZGVdO1xuXHRcdFx0XG5cdFx0XHRpZiAoYXJndW1lbnRzLmxlbmd0aCA9PSAyKSB7XG5cdFx0XHRcdGluc2VydCA9IGFyZ3VtZW50c1sxXTtcblx0XHRcdFx0XG5cdFx0XHRcdGZvciAodmFyIG5ld1Rva2VuIGluIGluc2VydCkge1xuXHRcdFx0XHRcdGlmIChpbnNlcnQuaGFzT3duUHJvcGVydHkobmV3VG9rZW4pKSB7XG5cdFx0XHRcdFx0XHRncmFtbWFyW25ld1Rva2VuXSA9IGluc2VydFtuZXdUb2tlbl07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdFxuXHRcdFx0XHRyZXR1cm4gZ3JhbW1hcjtcblx0XHRcdH1cblx0XHRcdFxuXHRcdFx0dmFyIHJldCA9IHt9O1xuXG5cdFx0XHRmb3IgKHZhciB0b2tlbiBpbiBncmFtbWFyKSB7XG5cblx0XHRcdFx0aWYgKGdyYW1tYXIuaGFzT3duUHJvcGVydHkodG9rZW4pKSB7XG5cblx0XHRcdFx0XHRpZiAodG9rZW4gPT0gYmVmb3JlKSB7XG5cblx0XHRcdFx0XHRcdGZvciAodmFyIG5ld1Rva2VuIGluIGluc2VydCkge1xuXG5cdFx0XHRcdFx0XHRcdGlmIChpbnNlcnQuaGFzT3duUHJvcGVydHkobmV3VG9rZW4pKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0W25ld1Rva2VuXSA9IGluc2VydFtuZXdUb2tlbl07XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXRbdG9rZW5dID0gZ3JhbW1hclt0b2tlbl07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdFxuXHRcdFx0Ly8gVXBkYXRlIHJlZmVyZW5jZXMgaW4gb3RoZXIgbGFuZ3VhZ2UgZGVmaW5pdGlvbnNcblx0XHRcdF8ubGFuZ3VhZ2VzLkRGUyhfLmxhbmd1YWdlcywgZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xuXHRcdFx0XHRpZiAodmFsdWUgPT09IHJvb3RbaW5zaWRlXSAmJiBrZXkgIT0gaW5zaWRlKSB7XG5cdFx0XHRcdFx0dGhpc1trZXldID0gcmV0O1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIHJvb3RbaW5zaWRlXSA9IHJldDtcblx0XHR9LFxuXG5cdFx0Ly8gVHJhdmVyc2UgYSBsYW5ndWFnZSBkZWZpbml0aW9uIHdpdGggRGVwdGggRmlyc3QgU2VhcmNoXG5cdFx0REZTOiBmdW5jdGlvbihvLCBjYWxsYmFjaywgdHlwZSkge1xuXHRcdFx0Zm9yICh2YXIgaSBpbiBvKSB7XG5cdFx0XHRcdGlmIChvLmhhc093blByb3BlcnR5KGkpKSB7XG5cdFx0XHRcdFx0Y2FsbGJhY2suY2FsbChvLCBpLCBvW2ldLCB0eXBlIHx8IGkpO1xuXG5cdFx0XHRcdFx0aWYgKF8udXRpbC50eXBlKG9baV0pID09PSAnT2JqZWN0Jykge1xuXHRcdFx0XHRcdFx0Xy5sYW5ndWFnZXMuREZTKG9baV0sIGNhbGxiYWNrKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSBpZiAoXy51dGlsLnR5cGUob1tpXSkgPT09ICdBcnJheScpIHtcblx0XHRcdFx0XHRcdF8ubGFuZ3VhZ2VzLkRGUyhvW2ldLCBjYWxsYmFjaywgaSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9LFxuXG5cdGhpZ2hsaWdodEFsbDogZnVuY3Rpb24oYXN5bmMsIGNhbGxiYWNrKSB7XG5cdFx0dmFyIGVsZW1lbnRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnY29kZVtjbGFzcyo9XCJsYW5ndWFnZS1cIl0sIFtjbGFzcyo9XCJsYW5ndWFnZS1cIl0gY29kZSwgY29kZVtjbGFzcyo9XCJsYW5nLVwiXSwgW2NsYXNzKj1cImxhbmctXCJdIGNvZGUnKTtcblxuXHRcdGZvciAodmFyIGk9MCwgZWxlbWVudDsgZWxlbWVudCA9IGVsZW1lbnRzW2krK107KSB7XG5cdFx0XHRfLmhpZ2hsaWdodEVsZW1lbnQoZWxlbWVudCwgYXN5bmMgPT09IHRydWUsIGNhbGxiYWNrKTtcblx0XHR9XG5cdH0sXG5cblx0aGlnaGxpZ2h0RWxlbWVudDogZnVuY3Rpb24oZWxlbWVudCwgYXN5bmMsIGNhbGxiYWNrKSB7XG5cdFx0Ly8gRmluZCBsYW5ndWFnZVxuXHRcdHZhciBsYW5ndWFnZSwgZ3JhbW1hciwgcGFyZW50ID0gZWxlbWVudDtcblxuXHRcdHdoaWxlIChwYXJlbnQgJiYgIWxhbmcudGVzdChwYXJlbnQuY2xhc3NOYW1lKSkge1xuXHRcdFx0cGFyZW50ID0gcGFyZW50LnBhcmVudE5vZGU7XG5cdFx0fVxuXG5cdFx0aWYgKHBhcmVudCkge1xuXHRcdFx0bGFuZ3VhZ2UgPSAocGFyZW50LmNsYXNzTmFtZS5tYXRjaChsYW5nKSB8fCBbLCcnXSlbMV07XG5cdFx0XHRncmFtbWFyID0gXy5sYW5ndWFnZXNbbGFuZ3VhZ2VdO1xuXHRcdH1cblxuXHRcdGlmICghZ3JhbW1hcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNldCBsYW5ndWFnZSBvbiB0aGUgZWxlbWVudCwgaWYgbm90IHByZXNlbnRcblx0XHRlbGVtZW50LmNsYXNzTmFtZSA9IGVsZW1lbnQuY2xhc3NOYW1lLnJlcGxhY2UobGFuZywgJycpLnJlcGxhY2UoL1xccysvZywgJyAnKSArICcgbGFuZ3VhZ2UtJyArIGxhbmd1YWdlO1xuXG5cdFx0Ly8gU2V0IGxhbmd1YWdlIG9uIHRoZSBwYXJlbnQsIGZvciBzdHlsaW5nXG5cdFx0cGFyZW50ID0gZWxlbWVudC5wYXJlbnROb2RlO1xuXG5cdFx0aWYgKC9wcmUvaS50ZXN0KHBhcmVudC5ub2RlTmFtZSkpIHtcblx0XHRcdHBhcmVudC5jbGFzc05hbWUgPSBwYXJlbnQuY2xhc3NOYW1lLnJlcGxhY2UobGFuZywgJycpLnJlcGxhY2UoL1xccysvZywgJyAnKSArICcgbGFuZ3VhZ2UtJyArIGxhbmd1YWdlO1xuXHRcdH1cblxuXHRcdHZhciBjb2RlID0gZWxlbWVudC50ZXh0Q29udGVudDtcblxuXHRcdGlmKCFjb2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29kZSA9IGNvZGUucmVwbGFjZSgvXig/Olxccj9cXG58XFxyKS8sJycpO1xuXG5cdFx0dmFyIGVudiA9IHtcblx0XHRcdGVsZW1lbnQ6IGVsZW1lbnQsXG5cdFx0XHRsYW5ndWFnZTogbGFuZ3VhZ2UsXG5cdFx0XHRncmFtbWFyOiBncmFtbWFyLFxuXHRcdFx0Y29kZTogY29kZVxuXHRcdH07XG5cblx0XHRfLmhvb2tzLnJ1bignYmVmb3JlLWhpZ2hsaWdodCcsIGVudik7XG5cblx0XHRpZiAoYXN5bmMgJiYgc2VsZi5Xb3JrZXIpIHtcblx0XHRcdHZhciB3b3JrZXIgPSBuZXcgV29ya2VyKF8uZmlsZW5hbWUpO1xuXG5cdFx0XHR3b3JrZXIub25tZXNzYWdlID0gZnVuY3Rpb24oZXZ0KSB7XG5cdFx0XHRcdGVudi5oaWdobGlnaHRlZENvZGUgPSBUb2tlbi5zdHJpbmdpZnkoSlNPTi5wYXJzZShldnQuZGF0YSksIGxhbmd1YWdlKTtcblxuXHRcdFx0XHRfLmhvb2tzLnJ1bignYmVmb3JlLWluc2VydCcsIGVudik7XG5cblx0XHRcdFx0ZW52LmVsZW1lbnQuaW5uZXJIVE1MID0gZW52LmhpZ2hsaWdodGVkQ29kZTtcblxuXHRcdFx0XHRjYWxsYmFjayAmJiBjYWxsYmFjay5jYWxsKGVudi5lbGVtZW50KTtcblx0XHRcdFx0Xy5ob29rcy5ydW4oJ2FmdGVyLWhpZ2hsaWdodCcsIGVudik7XG5cdFx0XHR9O1xuXG5cdFx0XHR3b3JrZXIucG9zdE1lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRsYW5ndWFnZTogZW52Lmxhbmd1YWdlLFxuXHRcdFx0XHRjb2RlOiBlbnYuY29kZVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGVudi5oaWdobGlnaHRlZENvZGUgPSBfLmhpZ2hsaWdodChlbnYuY29kZSwgZW52LmdyYW1tYXIsIGVudi5sYW5ndWFnZSk7XG5cblx0XHRcdF8uaG9va3MucnVuKCdiZWZvcmUtaW5zZXJ0JywgZW52KTtcblxuXHRcdFx0ZW52LmVsZW1lbnQuaW5uZXJIVE1MID0gZW52LmhpZ2hsaWdodGVkQ29kZTtcblxuXHRcdFx0Y2FsbGJhY2sgJiYgY2FsbGJhY2suY2FsbChlbGVtZW50KTtcblxuXHRcdFx0Xy5ob29rcy5ydW4oJ2FmdGVyLWhpZ2hsaWdodCcsIGVudik7XG5cdFx0fVxuXHR9LFxuXG5cdGhpZ2hsaWdodDogZnVuY3Rpb24gKHRleHQsIGdyYW1tYXIsIGxhbmd1YWdlKSB7XG5cdFx0dmFyIHRva2VucyA9IF8udG9rZW5pemUodGV4dCwgZ3JhbW1hcik7XG5cdFx0cmV0dXJuIFRva2VuLnN0cmluZ2lmeShfLnV0aWwuZW5jb2RlKHRva2VucyksIGxhbmd1YWdlKTtcblx0fSxcblxuXHR0b2tlbml6ZTogZnVuY3Rpb24odGV4dCwgZ3JhbW1hciwgbGFuZ3VhZ2UpIHtcblx0XHR2YXIgVG9rZW4gPSBfLlRva2VuO1xuXG5cdFx0dmFyIHN0cmFyciA9IFt0ZXh0XTtcblxuXHRcdHZhciByZXN0ID0gZ3JhbW1hci5yZXN0O1xuXG5cdFx0aWYgKHJlc3QpIHtcblx0XHRcdGZvciAodmFyIHRva2VuIGluIHJlc3QpIHtcblx0XHRcdFx0Z3JhbW1hclt0b2tlbl0gPSByZXN0W3Rva2VuXTtcblx0XHRcdH1cblxuXHRcdFx0ZGVsZXRlIGdyYW1tYXIucmVzdDtcblx0XHR9XG5cblx0XHR0b2tlbmxvb3A6IGZvciAodmFyIHRva2VuIGluIGdyYW1tYXIpIHtcblx0XHRcdGlmKCFncmFtbWFyLmhhc093blByb3BlcnR5KHRva2VuKSB8fCAhZ3JhbW1hclt0b2tlbl0pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHZhciBwYXR0ZXJucyA9IGdyYW1tYXJbdG9rZW5dO1xuXHRcdFx0cGF0dGVybnMgPSAoXy51dGlsLnR5cGUocGF0dGVybnMpID09PSBcIkFycmF5XCIpID8gcGF0dGVybnMgOiBbcGF0dGVybnNdO1xuXG5cdFx0XHRmb3IgKHZhciBqID0gMDsgaiA8IHBhdHRlcm5zLmxlbmd0aDsgKytqKSB7XG5cdFx0XHRcdHZhciBwYXR0ZXJuID0gcGF0dGVybnNbal0sXG5cdFx0XHRcdFx0aW5zaWRlID0gcGF0dGVybi5pbnNpZGUsXG5cdFx0XHRcdFx0bG9va2JlaGluZCA9ICEhcGF0dGVybi5sb29rYmVoaW5kLFxuXHRcdFx0XHRcdGxvb2tiZWhpbmRMZW5ndGggPSAwLFxuXHRcdFx0XHRcdGFsaWFzID0gcGF0dGVybi5hbGlhcztcblxuXHRcdFx0XHRwYXR0ZXJuID0gcGF0dGVybi5wYXR0ZXJuIHx8IHBhdHRlcm47XG5cblx0XHRcdFx0Zm9yICh2YXIgaT0wOyBpPHN0cmFyci5sZW5ndGg7IGkrKykgeyAvLyBEb27igJl0IGNhY2hlIGxlbmd0aCBhcyBpdCBjaGFuZ2VzIGR1cmluZyB0aGUgbG9vcFxuXG5cdFx0XHRcdFx0dmFyIHN0ciA9IHN0cmFycltpXTtcblxuXHRcdFx0XHRcdGlmIChzdHJhcnIubGVuZ3RoID4gdGV4dC5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdC8vIFNvbWV0aGluZyB3ZW50IHRlcnJpYmx5IHdyb25nLCBBQk9SVCwgQUJPUlQhXG5cdFx0XHRcdFx0XHRicmVhayB0b2tlbmxvb3A7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHN0ciBpbnN0YW5jZW9mIFRva2VuKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRwYXR0ZXJuLmxhc3RJbmRleCA9IDA7XG5cblx0XHRcdFx0XHR2YXIgbWF0Y2ggPSBwYXR0ZXJuLmV4ZWMoc3RyKTtcblxuXHRcdFx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRcdFx0aWYobG9va2JlaGluZCkge1xuXHRcdFx0XHRcdFx0XHRsb29rYmVoaW5kTGVuZ3RoID0gbWF0Y2hbMV0ubGVuZ3RoO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR2YXIgZnJvbSA9IG1hdGNoLmluZGV4IC0gMSArIGxvb2tiZWhpbmRMZW5ndGgsXG5cdFx0XHRcdFx0XHRcdG1hdGNoID0gbWF0Y2hbMF0uc2xpY2UobG9va2JlaGluZExlbmd0aCksXG5cdFx0XHRcdFx0XHRcdGxlbiA9IG1hdGNoLmxlbmd0aCxcblx0XHRcdFx0XHRcdFx0dG8gPSBmcm9tICsgbGVuLFxuXHRcdFx0XHRcdFx0XHRiZWZvcmUgPSBzdHIuc2xpY2UoMCwgZnJvbSArIDEpLFxuXHRcdFx0XHRcdFx0XHRhZnRlciA9IHN0ci5zbGljZSh0byArIDEpO1xuXG5cdFx0XHRcdFx0XHR2YXIgYXJncyA9IFtpLCAxXTtcblxuXHRcdFx0XHRcdFx0aWYgKGJlZm9yZSkge1xuXHRcdFx0XHRcdFx0XHRhcmdzLnB1c2goYmVmb3JlKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dmFyIHdyYXBwZWQgPSBuZXcgVG9rZW4odG9rZW4sIGluc2lkZT8gXy50b2tlbml6ZShtYXRjaCwgaW5zaWRlKSA6IG1hdGNoLCBhbGlhcyk7XG5cblx0XHRcdFx0XHRcdGFyZ3MucHVzaCh3cmFwcGVkKTtcblxuXHRcdFx0XHRcdFx0aWYgKGFmdGVyKSB7XG5cdFx0XHRcdFx0XHRcdGFyZ3MucHVzaChhZnRlcik7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdEFycmF5LnByb3RvdHlwZS5zcGxpY2UuYXBwbHkoc3RyYXJyLCBhcmdzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gc3RyYXJyO1xuXHR9LFxuXG5cdGhvb2tzOiB7XG5cdFx0YWxsOiB7fSxcblxuXHRcdGFkZDogZnVuY3Rpb24gKG5hbWUsIGNhbGxiYWNrKSB7XG5cdFx0XHR2YXIgaG9va3MgPSBfLmhvb2tzLmFsbDtcblxuXHRcdFx0aG9va3NbbmFtZV0gPSBob29rc1tuYW1lXSB8fCBbXTtcblxuXHRcdFx0aG9va3NbbmFtZV0ucHVzaChjYWxsYmFjayk7XG5cdFx0fSxcblxuXHRcdHJ1bjogZnVuY3Rpb24gKG5hbWUsIGVudikge1xuXHRcdFx0dmFyIGNhbGxiYWNrcyA9IF8uaG9va3MuYWxsW25hbWVdO1xuXG5cdFx0XHRpZiAoIWNhbGxiYWNrcyB8fCAhY2FsbGJhY2tzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGZvciAodmFyIGk9MCwgY2FsbGJhY2s7IGNhbGxiYWNrID0gY2FsbGJhY2tzW2krK107KSB7XG5cdFx0XHRcdGNhbGxiYWNrKGVudik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59O1xuXG52YXIgVG9rZW4gPSBfLlRva2VuID0gZnVuY3Rpb24odHlwZSwgY29udGVudCwgYWxpYXMpIHtcblx0dGhpcy50eXBlID0gdHlwZTtcblx0dGhpcy5jb250ZW50ID0gY29udGVudDtcblx0dGhpcy5hbGlhcyA9IGFsaWFzO1xufTtcblxuVG9rZW4uc3RyaW5naWZ5ID0gZnVuY3Rpb24obywgbGFuZ3VhZ2UsIHBhcmVudCkge1xuXHRpZiAodHlwZW9mIG8gPT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gbztcblx0fVxuXG5cdGlmIChfLnV0aWwudHlwZShvKSA9PT0gJ0FycmF5Jykge1xuXHRcdHJldHVybiBvLm1hcChmdW5jdGlvbihlbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gVG9rZW4uc3RyaW5naWZ5KGVsZW1lbnQsIGxhbmd1YWdlLCBvKTtcblx0XHR9KS5qb2luKCcnKTtcblx0fVxuXG5cdHZhciBlbnYgPSB7XG5cdFx0dHlwZTogby50eXBlLFxuXHRcdGNvbnRlbnQ6IFRva2VuLnN0cmluZ2lmeShvLmNvbnRlbnQsIGxhbmd1YWdlLCBwYXJlbnQpLFxuXHRcdHRhZzogJ3NwYW4nLFxuXHRcdGNsYXNzZXM6IFsndG9rZW4nLCBvLnR5cGVdLFxuXHRcdGF0dHJpYnV0ZXM6IHt9LFxuXHRcdGxhbmd1YWdlOiBsYW5ndWFnZSxcblx0XHRwYXJlbnQ6IHBhcmVudFxuXHR9O1xuXG5cdGlmIChlbnYudHlwZSA9PSAnY29tbWVudCcpIHtcblx0XHRlbnYuYXR0cmlidXRlc1snc3BlbGxjaGVjayddID0gJ3RydWUnO1xuXHR9XG5cblx0aWYgKG8uYWxpYXMpIHtcblx0XHR2YXIgYWxpYXNlcyA9IF8udXRpbC50eXBlKG8uYWxpYXMpID09PSAnQXJyYXknID8gby5hbGlhcyA6IFtvLmFsaWFzXTtcblx0XHRBcnJheS5wcm90b3R5cGUucHVzaC5hcHBseShlbnYuY2xhc3NlcywgYWxpYXNlcyk7XG5cdH1cblxuXHRfLmhvb2tzLnJ1bignd3JhcCcsIGVudik7XG5cblx0dmFyIGF0dHJpYnV0ZXMgPSAnJztcblxuXHRmb3IgKHZhciBuYW1lIGluIGVudi5hdHRyaWJ1dGVzKSB7XG5cdFx0YXR0cmlidXRlcyArPSBuYW1lICsgJz1cIicgKyAoZW52LmF0dHJpYnV0ZXNbbmFtZV0gfHwgJycpICsgJ1wiJztcblx0fVxuXG5cdHJldHVybiAnPCcgKyBlbnYudGFnICsgJyBjbGFzcz1cIicgKyBlbnYuY2xhc3Nlcy5qb2luKCcgJykgKyAnXCIgJyArIGF0dHJpYnV0ZXMgKyAnPicgKyBlbnYuY29udGVudCArICc8LycgKyBlbnYudGFnICsgJz4nO1xuXG59O1xuXG5pZiAoIXNlbGYuZG9jdW1lbnQpIHtcblx0aWYgKCFzZWxmLmFkZEV2ZW50TGlzdGVuZXIpIHtcblx0XHQvLyBpbiBOb2RlLmpzXG5cdFx0cmV0dXJuIHNlbGYuUHJpc207XG5cdH1cbiBcdC8vIEluIHdvcmtlclxuXHRzZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbihldnQpIHtcblx0XHR2YXIgbWVzc2FnZSA9IEpTT04ucGFyc2UoZXZ0LmRhdGEpLFxuXHRcdCAgICBsYW5nID0gbWVzc2FnZS5sYW5ndWFnZSxcblx0XHQgICAgY29kZSA9IG1lc3NhZ2UuY29kZTtcblxuXHRcdHNlbGYucG9zdE1lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoXy51dGlsLmVuY29kZShfLnRva2VuaXplKGNvZGUsIF8ubGFuZ3VhZ2VzW2xhbmddKSkpKTtcblx0XHRzZWxmLmNsb3NlKCk7XG5cdH0sIGZhbHNlKTtcblxuXHRyZXR1cm4gc2VsZi5QcmlzbTtcbn1cblxuLy8gR2V0IGN1cnJlbnQgc2NyaXB0IGFuZCBoaWdobGlnaHRcbnZhciBzY3JpcHQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnc2NyaXB0Jyk7XG5cbnNjcmlwdCA9IHNjcmlwdFtzY3JpcHQubGVuZ3RoIC0gMV07XG5cbmlmIChzY3JpcHQpIHtcblx0Xy5maWxlbmFtZSA9IHNjcmlwdC5zcmM7XG5cblx0aWYgKGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIgJiYgIXNjcmlwdC5oYXNBdHRyaWJ1dGUoJ2RhdGEtbWFudWFsJykpIHtcblx0XHRkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgXy5oaWdobGlnaHRBbGwpO1xuXHR9XG59XG5cbnJldHVybiBzZWxmLlByaXNtO1xuXG59KSgpO1xuXG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcblx0bW9kdWxlLmV4cG9ydHMgPSBQcmlzbTtcbn1cblxuXG4vKiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgIEJlZ2luIHByaXNtLW1hcmt1cC5qc1xuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xuXG5QcmlzbS5sYW5ndWFnZXMubWFya3VwID0ge1xuXHQnY29tbWVudCc6IC88IS0tW1xcd1xcV10qPy0tPi8sXG5cdCdwcm9sb2cnOiAvPFxcPy4rP1xcPz4vLFxuXHQnZG9jdHlwZSc6IC88IURPQ1RZUEUuKz8+Lyxcblx0J2NkYXRhJzogLzwhXFxbQ0RBVEFcXFtbXFx3XFxXXSo/XV0+L2ksXG5cdCd0YWcnOiB7XG5cdFx0cGF0dGVybjogLzxcXC8/W1xcdzotXStcXHMqKD86XFxzK1tcXHc6LV0rKD86PSg/OihcInwnKShcXFxcP1tcXHdcXFddKSo/XFwxfFteXFxzJ1wiPj1dKykpP1xccyopKlxcLz8+L2ksXG5cdFx0aW5zaWRlOiB7XG5cdFx0XHQndGFnJzoge1xuXHRcdFx0XHRwYXR0ZXJuOiAvXjxcXC8/W1xcdzotXSsvaSxcblx0XHRcdFx0aW5zaWRlOiB7XG5cdFx0XHRcdFx0J3B1bmN0dWF0aW9uJzogL148XFwvPy8sXG5cdFx0XHRcdFx0J25hbWVzcGFjZSc6IC9eW1xcdy1dKz86L1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J2F0dHItdmFsdWUnOiB7XG5cdFx0XHRcdHBhdHRlcm46IC89KD86KCd8XCIpW1xcd1xcV10qPyhcXDEpfFteXFxzPl0rKS9pLFxuXHRcdFx0XHRpbnNpZGU6IHtcblx0XHRcdFx0XHQncHVuY3R1YXRpb24nOiAvPXw+fFwiL1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3B1bmN0dWF0aW9uJzogL1xcLz8+Lyxcblx0XHRcdCdhdHRyLW5hbWUnOiB7XG5cdFx0XHRcdHBhdHRlcm46IC9bXFx3Oi1dKy8sXG5cdFx0XHRcdGluc2lkZToge1xuXHRcdFx0XHRcdCduYW1lc3BhY2UnOiAvXltcXHctXSs/Oi9cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0fVxuXHR9LFxuXHQnZW50aXR5JzogLyYjP1tcXGRhLXpdezEsOH07L2lcbn07XG5cbi8vIFBsdWdpbiB0byBtYWtlIGVudGl0eSB0aXRsZSBzaG93IHRoZSByZWFsIGVudGl0eSwgaWRlYSBieSBSb21hbiBLb21hcm92XG5QcmlzbS5ob29rcy5hZGQoJ3dyYXAnLCBmdW5jdGlvbihlbnYpIHtcblxuXHRpZiAoZW52LnR5cGUgPT09ICdlbnRpdHknKSB7XG5cdFx0ZW52LmF0dHJpYnV0ZXNbJ3RpdGxlJ10gPSBlbnYuY29udGVudC5yZXBsYWNlKC8mYW1wOy8sICcmJyk7XG5cdH1cbn0pO1xuXG5cbi8qICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgQmVnaW4gcHJpc20tY3NzLmpzXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqICovXG5cblByaXNtLmxhbmd1YWdlcy5jc3MgPSB7XG5cdCdjb21tZW50JzogL1xcL1xcKltcXHdcXFddKj9cXCpcXC8vLFxuXHQnYXRydWxlJzoge1xuXHRcdHBhdHRlcm46IC9AW1xcdy1dKz8uKj8oO3woPz1cXHMqXFx7KSkvaSxcblx0XHRpbnNpZGU6IHtcblx0XHRcdCdwdW5jdHVhdGlvbic6IC9bOzpdL1xuXHRcdH1cblx0fSxcblx0J3VybCc6IC91cmxcXCgoPzooW1wiJ10pKFxcXFxcXG58XFxcXD8uKSo/XFwxfC4qPylcXCkvaSxcblx0J3NlbGVjdG9yJzogL1teXFx7XFx9XFxzXVteXFx7XFx9O10qKD89XFxzKlxceykvLFxuXHQnc3RyaW5nJzogLyhcInwnKShcXFxcXFxufFxcXFw/LikqP1xcMS8sXG5cdCdwcm9wZXJ0eSc6IC8oXFxifFxcQilbXFx3LV0rKD89XFxzKjopL2ksXG5cdCdpbXBvcnRhbnQnOiAvXFxCIWltcG9ydGFudFxcYi9pLFxuXHQncHVuY3R1YXRpb24nOiAvW1xce1xcfTs6XS8sXG5cdCdmdW5jdGlvbic6IC9bLWEtejAtOV0rKD89XFwoKS9pXG59O1xuXG5pZiAoUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cCkge1xuXHRQcmlzbS5sYW5ndWFnZXMuaW5zZXJ0QmVmb3JlKCdtYXJrdXAnLCAndGFnJywge1xuXHRcdCdzdHlsZSc6IHtcblx0XHRcdHBhdHRlcm46IC88c3R5bGVbXFx3XFxXXSo/PltcXHdcXFddKj88XFwvc3R5bGU+L2ksXG5cdFx0XHRpbnNpZGU6IHtcblx0XHRcdFx0J3RhZyc6IHtcblx0XHRcdFx0XHRwYXR0ZXJuOiAvPHN0eWxlW1xcd1xcV10qPz58PFxcL3N0eWxlPi9pLFxuXHRcdFx0XHRcdGluc2lkZTogUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cC50YWcuaW5zaWRlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlc3Q6IFByaXNtLmxhbmd1YWdlcy5jc3Ncblx0XHRcdH0sXG5cdFx0XHRhbGlhczogJ2xhbmd1YWdlLWNzcydcblx0XHR9XG5cdH0pO1xuXHRcblx0UHJpc20ubGFuZ3VhZ2VzLmluc2VydEJlZm9yZSgnaW5zaWRlJywgJ2F0dHItdmFsdWUnLCB7XG5cdFx0J3N0eWxlLWF0dHInOiB7XG5cdFx0XHRwYXR0ZXJuOiAvXFxzKnN0eWxlPShcInwnKS4qP1xcMS9pLFxuXHRcdFx0aW5zaWRlOiB7XG5cdFx0XHRcdCdhdHRyLW5hbWUnOiB7XG5cdFx0XHRcdFx0cGF0dGVybjogL15cXHMqc3R5bGUvaSxcblx0XHRcdFx0XHRpbnNpZGU6IFByaXNtLmxhbmd1YWdlcy5tYXJrdXAudGFnLmluc2lkZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQncHVuY3R1YXRpb24nOiAvXlxccyo9XFxzKlsnXCJdfFsnXCJdXFxzKiQvLFxuXHRcdFx0XHQnYXR0ci12YWx1ZSc6IHtcblx0XHRcdFx0XHRwYXR0ZXJuOiAvLisvaSxcblx0XHRcdFx0XHRpbnNpZGU6IFByaXNtLmxhbmd1YWdlcy5jc3Ncblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFsaWFzOiAnbGFuZ3VhZ2UtY3NzJ1xuXHRcdH1cblx0fSwgUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cC50YWcpO1xufVxuXG4vKiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgIEJlZ2luIHByaXNtLWNsaWtlLmpzXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqICovXG5cblByaXNtLmxhbmd1YWdlcy5jbGlrZSA9IHtcblx0J2NvbW1lbnQnOiBbXG5cdFx0e1xuXHRcdFx0cGF0dGVybjogLyhefFteXFxcXF0pXFwvXFwqW1xcd1xcV10qP1xcKlxcLy8sXG5cdFx0XHRsb29rYmVoaW5kOiB0cnVlXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRwYXR0ZXJuOiAvKF58W15cXFxcOl0pXFwvXFwvLisvLFxuXHRcdFx0bG9va2JlaGluZDogdHJ1ZVxuXHRcdH1cblx0XSxcblx0J3N0cmluZyc6IC8oXCJ8JykoXFxcXFxcbnxcXFxcPy4pKj9cXDEvLFxuXHQnY2xhc3MtbmFtZSc6IHtcblx0XHRwYXR0ZXJuOiAvKCg/Oig/OmNsYXNzfGludGVyZmFjZXxleHRlbmRzfGltcGxlbWVudHN8dHJhaXR8aW5zdGFuY2VvZnxuZXcpXFxzKyl8KD86Y2F0Y2hcXHMrXFwoKSlbYS16MC05X1xcLlxcXFxdKy9pLFxuXHRcdGxvb2tiZWhpbmQ6IHRydWUsXG5cdFx0aW5zaWRlOiB7XG5cdFx0XHRwdW5jdHVhdGlvbjogLyhcXC58XFxcXCkvXG5cdFx0fVxuXHR9LFxuXHQna2V5d29yZCc6IC9cXGIoaWZ8ZWxzZXx3aGlsZXxkb3xmb3J8cmV0dXJufGlufGluc3RhbmNlb2Z8ZnVuY3Rpb258bmV3fHRyeXx0aHJvd3xjYXRjaHxmaW5hbGx5fG51bGx8YnJlYWt8Y29udGludWUpXFxiLyxcblx0J2Jvb2xlYW4nOiAvXFxiKHRydWV8ZmFsc2UpXFxiLyxcblx0J2Z1bmN0aW9uJzoge1xuXHRcdHBhdHRlcm46IC9bYS16MC05X10rXFwoL2ksXG5cdFx0aW5zaWRlOiB7XG5cdFx0XHRwdW5jdHVhdGlvbjogL1xcKC9cblx0XHR9XG5cdH0sXG5cdCdudW1iZXInOiAvXFxiLT8oMHhbXFxkQS1GYS1mXSt8XFxkKlxcLj9cXGQrKFtFZV0tP1xcZCspPylcXGIvLFxuXHQnb3BlcmF0b3InOiAvWy0rXXsxLDJ9fCF8PD0/fD49P3w9ezEsM318JnsxLDJ9fFxcfD9cXHx8XFw/fFxcKnxcXC98fnxcXF58JS8sXG5cdCdpZ25vcmUnOiAvJihsdHxndHxhbXApOy9pLFxuXHQncHVuY3R1YXRpb24nOiAvW3t9W1xcXTsoKSwuOl0vXG59O1xuXG5cbi8qICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgQmVnaW4gcHJpc20tamF2YXNjcmlwdC5qc1xuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xuXG5QcmlzbS5sYW5ndWFnZXMuamF2YXNjcmlwdCA9IFByaXNtLmxhbmd1YWdlcy5leHRlbmQoJ2NsaWtlJywge1xuXHQna2V5d29yZCc6IC9cXGIoYnJlYWt8Y2FzZXxjYXRjaHxjbGFzc3xjb25zdHxjb250aW51ZXxkZWJ1Z2dlcnxkZWZhdWx0fGRlbGV0ZXxkb3xlbHNlfGVudW18ZXhwb3J0fGV4dGVuZHN8ZmFsc2V8ZmluYWxseXxmb3J8ZnVuY3Rpb258Z2V0fGlmfGltcGxlbWVudHN8aW1wb3J0fGlufGluc3RhbmNlb2Z8aW50ZXJmYWNlfGxldHxuZXd8bnVsbHxwYWNrYWdlfHByaXZhdGV8cHJvdGVjdGVkfHB1YmxpY3xyZXR1cm58c2V0fHN0YXRpY3xzdXBlcnxzd2l0Y2h8dGhpc3x0aHJvd3x0cnVlfHRyeXx0eXBlb2Z8dmFyfHZvaWR8d2hpbGV8d2l0aHx5aWVsZClcXGIvLFxuXHQnbnVtYmVyJzogL1xcYi0/KDB4W1xcZEEtRmEtZl0rfFxcZCpcXC4/XFxkKyhbRWVdWystXT9cXGQrKT98TmFOfC0/SW5maW5pdHkpXFxiLyxcblx0J2Z1bmN0aW9uJzogLyg/IVxcZClbYS16MC05XyRdKyg/PVxcKCkvaVxufSk7XG5cblByaXNtLmxhbmd1YWdlcy5pbnNlcnRCZWZvcmUoJ2phdmFzY3JpcHQnLCAna2V5d29yZCcsIHtcblx0J3JlZ2V4Jzoge1xuXHRcdHBhdHRlcm46IC8oXnxbXi9dKVxcLyg/IVxcLykoXFxbLis/XXxcXFxcLnxbXi9cXHJcXG5dKStcXC9bZ2ltXXswLDN9KD89XFxzKigkfFtcXHJcXG4sLjt9KV0pKS8sXG5cdFx0bG9va2JlaGluZDogdHJ1ZVxuXHR9XG59KTtcblxuaWYgKFByaXNtLmxhbmd1YWdlcy5tYXJrdXApIHtcblx0UHJpc20ubGFuZ3VhZ2VzLmluc2VydEJlZm9yZSgnbWFya3VwJywgJ3RhZycsIHtcblx0XHQnc2NyaXB0Jzoge1xuXHRcdFx0cGF0dGVybjogLzxzY3JpcHRbXFx3XFxXXSo/PltcXHdcXFddKj88XFwvc2NyaXB0Pi9pLFxuXHRcdFx0aW5zaWRlOiB7XG5cdFx0XHRcdCd0YWcnOiB7XG5cdFx0XHRcdFx0cGF0dGVybjogLzxzY3JpcHRbXFx3XFxXXSo/Pnw8XFwvc2NyaXB0Pi9pLFxuXHRcdFx0XHRcdGluc2lkZTogUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cC50YWcuaW5zaWRlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlc3Q6IFByaXNtLmxhbmd1YWdlcy5qYXZhc2NyaXB0XG5cdFx0XHR9LFxuXHRcdFx0YWxpYXM6ICdsYW5ndWFnZS1qYXZhc2NyaXB0J1xuXHRcdH1cblx0fSk7XG59XG5cblxuLyogKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuICAgICBCZWdpbiBwcmlzbS1maWxlLWhpZ2hsaWdodC5qc1xuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xuXG4oZnVuY3Rpb24gKCkge1xuXHRpZiAoIXNlbGYuUHJpc20gfHwgIXNlbGYuZG9jdW1lbnQgfHwgIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRzZWxmLlByaXNtLmZpbGVIaWdobGlnaHQgPSBmdW5jdGlvbigpIHtcblxuXHRcdHZhciBFeHRlbnNpb25zID0ge1xuXHRcdFx0J2pzJzogJ2phdmFzY3JpcHQnLFxuXHRcdFx0J2h0bWwnOiAnbWFya3VwJyxcblx0XHRcdCdzdmcnOiAnbWFya3VwJyxcblx0XHRcdCd4bWwnOiAnbWFya3VwJyxcblx0XHRcdCdweSc6ICdweXRob24nLFxuXHRcdFx0J3JiJzogJ3J1YnknLFxuXHRcdFx0J3BzMSc6ICdwb3dlcnNoZWxsJyxcblx0XHRcdCdwc20xJzogJ3Bvd2Vyc2hlbGwnXG5cdFx0fTtcblxuXHRcdEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ3ByZVtkYXRhLXNyY10nKSkuZm9yRWFjaChmdW5jdGlvbihwcmUpIHtcblx0XHRcdHZhciBzcmMgPSBwcmUuZ2V0QXR0cmlidXRlKCdkYXRhLXNyYycpO1xuXHRcdFx0dmFyIGV4dGVuc2lvbiA9IChzcmMubWF0Y2goL1xcLihcXHcrKSQvKSB8fCBbLCcnXSlbMV07XG5cdFx0XHR2YXIgbGFuZ3VhZ2UgPSBFeHRlbnNpb25zW2V4dGVuc2lvbl0gfHwgZXh0ZW5zaW9uO1xuXG5cdFx0XHR2YXIgY29kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NvZGUnKTtcblx0XHRcdGNvZGUuY2xhc3NOYW1lID0gJ2xhbmd1YWdlLScgKyBsYW5ndWFnZTtcblxuXHRcdFx0cHJlLnRleHRDb250ZW50ID0gJyc7XG5cblx0XHRcdGNvZGUudGV4dENvbnRlbnQgPSAnTG9hZGluZ+KApic7XG5cblx0XHRcdHByZS5hcHBlbmRDaGlsZChjb2RlKTtcblxuXHRcdFx0dmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXG5cdFx0XHR4aHIub3BlbignR0VUJywgc3JjLCB0cnVlKTtcblxuXHRcdFx0eGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRpZiAoeGhyLnJlYWR5U3RhdGUgPT0gNCkge1xuXG5cdFx0XHRcdFx0aWYgKHhoci5zdGF0dXMgPCA0MDAgJiYgeGhyLnJlc3BvbnNlVGV4dCkge1xuXHRcdFx0XHRcdFx0Y29kZS50ZXh0Q29udGVudCA9IHhoci5yZXNwb25zZVRleHQ7XG5cblx0XHRcdFx0XHRcdFByaXNtLmhpZ2hsaWdodEVsZW1lbnQoY29kZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVsc2UgaWYgKHhoci5zdGF0dXMgPj0gNDAwKSB7XG5cdFx0XHRcdFx0XHRjb2RlLnRleHRDb250ZW50ID0gJ+KcliBFcnJvciAnICsgeGhyLnN0YXR1cyArICcgd2hpbGUgZmV0Y2hpbmcgZmlsZTogJyArIHhoci5zdGF0dXNUZXh0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdGNvZGUudGV4dENvbnRlbnQgPSAn4pyWIEVycm9yOiBGaWxlIGRvZXMgbm90IGV4aXN0IG9yIGlzIGVtcHR5Jztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdHhoci5zZW5kKG51bGwpO1xuXHRcdH0pO1xuXG5cdH07XG5cblx0c2VsZi5QcmlzbS5maWxlSGlnaGxpZ2h0KCk7XG5cbn0pKCk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xuICAgIHZhciBiYWNrZHJvcHM7XG5cbiAgICBmdW5jdGlvbiBjcmVhdGVCYWNrZHJvcEZvclNsaWRlKHNsaWRlKSB7XG4gICAgICB2YXIgYmFja2Ryb3BBdHRyaWJ1dGUgPSBzbGlkZS5nZXRBdHRyaWJ1dGUoJ2RhdGEtYmVzcG9rZS1iYWNrZHJvcCcpO1xuXG4gICAgICBpZiAoYmFja2Ryb3BBdHRyaWJ1dGUpIHtcbiAgICAgICAgdmFyIGJhY2tkcm9wID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIGJhY2tkcm9wLmNsYXNzTmFtZSA9IGJhY2tkcm9wQXR0cmlidXRlO1xuICAgICAgICBiYWNrZHJvcC5jbGFzc0xpc3QuYWRkKCdiZXNwb2tlLWJhY2tkcm9wJyk7XG4gICAgICAgIGRlY2sucGFyZW50LmFwcGVuZENoaWxkKGJhY2tkcm9wKTtcbiAgICAgICAgcmV0dXJuIGJhY2tkcm9wO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVwZGF0ZUNsYXNzZXMoZWwpIHtcbiAgICAgIGlmIChlbCkge1xuICAgICAgICB2YXIgaW5kZXggPSBiYWNrZHJvcHMuaW5kZXhPZihlbCksXG4gICAgICAgICAgY3VycmVudEluZGV4ID0gZGVjay5zbGlkZSgpO1xuXG4gICAgICAgIHJlbW92ZUNsYXNzKGVsLCAnYWN0aXZlJyk7XG4gICAgICAgIHJlbW92ZUNsYXNzKGVsLCAnaW5hY3RpdmUnKTtcbiAgICAgICAgcmVtb3ZlQ2xhc3MoZWwsICdiZWZvcmUnKTtcbiAgICAgICAgcmVtb3ZlQ2xhc3MoZWwsICdhZnRlcicpO1xuXG4gICAgICAgIGlmIChpbmRleCAhPT0gY3VycmVudEluZGV4KSB7XG4gICAgICAgICAgYWRkQ2xhc3MoZWwsICdpbmFjdGl2ZScpO1xuICAgICAgICAgIGFkZENsYXNzKGVsLCBpbmRleCA8IGN1cnJlbnRJbmRleCA/ICdiZWZvcmUnIDogJ2FmdGVyJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYWRkQ2xhc3MoZWwsICdhY3RpdmUnKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbW92ZUNsYXNzKGVsLCBjbGFzc05hbWUpIHtcbiAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ2Jlc3Bva2UtYmFja2Ryb3AtJyArIGNsYXNzTmFtZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYWRkQ2xhc3MoZWwsIGNsYXNzTmFtZSkge1xuICAgICAgZWwuY2xhc3NMaXN0LmFkZCgnYmVzcG9rZS1iYWNrZHJvcC0nICsgY2xhc3NOYW1lKTtcbiAgICB9XG5cbiAgICBiYWNrZHJvcHMgPSBkZWNrLnNsaWRlc1xuICAgICAgLm1hcChjcmVhdGVCYWNrZHJvcEZvclNsaWRlKTtcblxuICAgIGRlY2sub24oJ2FjdGl2YXRlJywgZnVuY3Rpb24oKSB7XG4gICAgICBiYWNrZHJvcHMuZm9yRWFjaCh1cGRhdGVDbGFzc2VzKTtcbiAgICB9KTtcbiAgfTtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKGRlY2spIHtcbiAgICB2YXIgYWN0aXZlU2xpZGVJbmRleCxcbiAgICAgIGFjdGl2ZUJ1bGxldEluZGV4LFxuXG4gICAgICBidWxsZXRzID0gZGVjay5zbGlkZXMubWFwKGZ1bmN0aW9uKHNsaWRlKSB7XG4gICAgICAgIHJldHVybiBbXS5zbGljZS5jYWxsKHNsaWRlLnF1ZXJ5U2VsZWN0b3JBbGwoKHR5cGVvZiBvcHRpb25zID09PSAnc3RyaW5nJyA/IG9wdGlvbnMgOiAnW2RhdGEtYmVzcG9rZS1idWxsZXRdJykpLCAwKTtcbiAgICAgIH0pLFxuXG4gICAgICBuZXh0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBuZXh0U2xpZGVJbmRleCA9IGFjdGl2ZVNsaWRlSW5kZXggKyAxO1xuXG4gICAgICAgIGlmIChhY3RpdmVTbGlkZUhhc0J1bGxldEJ5T2Zmc2V0KDEpKSB7XG4gICAgICAgICAgYWN0aXZhdGVCdWxsZXQoYWN0aXZlU2xpZGVJbmRleCwgYWN0aXZlQnVsbGV0SW5kZXggKyAxKTtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0gZWxzZSBpZiAoYnVsbGV0c1tuZXh0U2xpZGVJbmRleF0pIHtcbiAgICAgICAgICBhY3RpdmF0ZUJ1bGxldChuZXh0U2xpZGVJbmRleCwgMCk7XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIHByZXYgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHByZXZTbGlkZUluZGV4ID0gYWN0aXZlU2xpZGVJbmRleCAtIDE7XG5cbiAgICAgICAgaWYgKGFjdGl2ZVNsaWRlSGFzQnVsbGV0QnlPZmZzZXQoLTEpKSB7XG4gICAgICAgICAgYWN0aXZhdGVCdWxsZXQoYWN0aXZlU2xpZGVJbmRleCwgYWN0aXZlQnVsbGV0SW5kZXggLSAxKTtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0gZWxzZSBpZiAoYnVsbGV0c1twcmV2U2xpZGVJbmRleF0pIHtcbiAgICAgICAgICBhY3RpdmF0ZUJ1bGxldChwcmV2U2xpZGVJbmRleCwgYnVsbGV0c1twcmV2U2xpZGVJbmRleF0ubGVuZ3RoIC0gMSk7XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIGFjdGl2YXRlQnVsbGV0ID0gZnVuY3Rpb24oc2xpZGVJbmRleCwgYnVsbGV0SW5kZXgpIHtcbiAgICAgICAgYWN0aXZlU2xpZGVJbmRleCA9IHNsaWRlSW5kZXg7XG4gICAgICAgIGFjdGl2ZUJ1bGxldEluZGV4ID0gYnVsbGV0SW5kZXg7XG5cbiAgICAgICAgYnVsbGV0cy5mb3JFYWNoKGZ1bmN0aW9uKHNsaWRlLCBzKSB7XG4gICAgICAgICAgc2xpZGUuZm9yRWFjaChmdW5jdGlvbihidWxsZXQsIGIpIHtcbiAgICAgICAgICAgIGJ1bGxldC5jbGFzc0xpc3QuYWRkKCdiZXNwb2tlLWJ1bGxldCcpO1xuXG4gICAgICAgICAgICBpZiAocyA8IHNsaWRlSW5kZXggfHwgcyA9PT0gc2xpZGVJbmRleCAmJiBiIDw9IGJ1bGxldEluZGV4KSB7XG4gICAgICAgICAgICAgIGJ1bGxldC5jbGFzc0xpc3QuYWRkKCdiZXNwb2tlLWJ1bGxldC1hY3RpdmUnKTtcbiAgICAgICAgICAgICAgYnVsbGV0LmNsYXNzTGlzdC5yZW1vdmUoJ2Jlc3Bva2UtYnVsbGV0LWluYWN0aXZlJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBidWxsZXQuY2xhc3NMaXN0LmFkZCgnYmVzcG9rZS1idWxsZXQtaW5hY3RpdmUnKTtcbiAgICAgICAgICAgICAgYnVsbGV0LmNsYXNzTGlzdC5yZW1vdmUoJ2Jlc3Bva2UtYnVsbGV0LWFjdGl2ZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocyA9PT0gc2xpZGVJbmRleCAmJiBiID09PSBidWxsZXRJbmRleCkge1xuICAgICAgICAgICAgICBidWxsZXQuY2xhc3NMaXN0LmFkZCgnYmVzcG9rZS1idWxsZXQtY3VycmVudCcpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgYnVsbGV0LmNsYXNzTGlzdC5yZW1vdmUoJ2Jlc3Bva2UtYnVsbGV0LWN1cnJlbnQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICB9LFxuXG4gICAgICBhY3RpdmVTbGlkZUhhc0J1bGxldEJ5T2Zmc2V0ID0gZnVuY3Rpb24ob2Zmc2V0KSB7XG4gICAgICAgIHJldHVybiBidWxsZXRzW2FjdGl2ZVNsaWRlSW5kZXhdW2FjdGl2ZUJ1bGxldEluZGV4ICsgb2Zmc2V0XSAhPT0gdW5kZWZpbmVkO1xuICAgICAgfTtcblxuICAgIGRlY2sub24oJ25leHQnLCBuZXh0KTtcbiAgICBkZWNrLm9uKCdwcmV2JywgcHJldik7XG5cbiAgICBkZWNrLm9uKCdzbGlkZScsIGZ1bmN0aW9uKGUpIHtcbiAgICAgIGFjdGl2YXRlQnVsbGV0KGUuaW5kZXgsIDApO1xuICAgIH0pO1xuXG4gICAgYWN0aXZhdGVCdWxsZXQoMCwgMCk7XG4gIH07XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKGRlY2spIHtcbiAgICBkZWNrLnNsaWRlcy5mb3JFYWNoKGZ1bmN0aW9uKHNsaWRlKSB7XG4gICAgICBzbGlkZS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZnVuY3Rpb24oZSkge1xuICAgICAgICBpZiAoL0lOUFVUfFRFWFRBUkVBfFNFTEVDVC8udGVzdChlLnRhcmdldC5ub2RlTmFtZSkgfHwgZS50YXJnZXQuY29udGVudEVkaXRhYmxlID09PSAndHJ1ZScpIHtcbiAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfTtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xuICAgIHZhciBwYXJzZUhhc2ggPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBoYXNoID0gd2luZG93LmxvY2F0aW9uLmhhc2guc2xpY2UoMSksXG4gICAgICAgIHNsaWRlTnVtYmVyT3JOYW1lID0gcGFyc2VJbnQoaGFzaCwgMTApO1xuXG4gICAgICBpZiAoaGFzaCkge1xuICAgICAgICBpZiAoc2xpZGVOdW1iZXJPck5hbWUpIHtcbiAgICAgICAgICBhY3RpdmF0ZVNsaWRlKHNsaWRlTnVtYmVyT3JOYW1lIC0gMSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZGVjay5zbGlkZXMuZm9yRWFjaChmdW5jdGlvbihzbGlkZSwgaSkge1xuICAgICAgICAgICAgaWYgKHNsaWRlLmdldEF0dHJpYnV0ZSgnZGF0YS1iZXNwb2tlLWhhc2gnKSA9PT0gaGFzaCkge1xuICAgICAgICAgICAgICBhY3RpdmF0ZVNsaWRlKGkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIHZhciBhY3RpdmF0ZVNsaWRlID0gZnVuY3Rpb24oaW5kZXgpIHtcbiAgICAgIHZhciBpbmRleFRvQWN0aXZhdGUgPSAtMSA8IGluZGV4ICYmIGluZGV4IDwgZGVjay5zbGlkZXMubGVuZ3RoID8gaW5kZXggOiAwO1xuICAgICAgaWYgKGluZGV4VG9BY3RpdmF0ZSAhPT0gZGVjay5zbGlkZSgpKSB7XG4gICAgICAgIGRlY2suc2xpZGUoaW5kZXhUb0FjdGl2YXRlKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgIHBhcnNlSGFzaCgpO1xuXG4gICAgICBkZWNrLm9uKCdhY3RpdmF0ZScsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgdmFyIHNsaWRlTmFtZSA9IGUuc2xpZGUuZ2V0QXR0cmlidXRlKCdkYXRhLWJlc3Bva2UtaGFzaCcpO1xuICAgICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IHNsaWRlTmFtZSB8fCBlLmluZGV4ICsgMTtcbiAgICAgIH0pO1xuXG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignaGFzaGNoYW5nZScsIHBhcnNlSGFzaCk7XG4gICAgfSwgMCk7XG4gIH07XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gIHJldHVybiBmdW5jdGlvbihkZWNrKSB7XG4gICAgdmFyIGlzSG9yaXpvbnRhbCA9IG9wdGlvbnMgIT09ICd2ZXJ0aWNhbCc7XG5cbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZnVuY3Rpb24oZSkge1xuICAgICAgaWYgKGUud2hpY2ggPT0gMzQgfHwgLy8gUEFHRSBET1dOXG4gICAgICAgIGUud2hpY2ggPT0gMzIgfHwgLy8gU1BBQ0VcbiAgICAgICAgKGlzSG9yaXpvbnRhbCAmJiBlLndoaWNoID09IDM5KSB8fCAvLyBSSUdIVFxuICAgICAgICAoIWlzSG9yaXpvbnRhbCAmJiBlLndoaWNoID09IDQwKSAvLyBET1dOXG4gICAgICApIHsgZGVjay5uZXh0KCk7IH1cblxuICAgICAgaWYgKGUud2hpY2ggPT0gMzMgfHwgLy8gUEFHRSBVUFxuICAgICAgICAoaXNIb3Jpem9udGFsICYmIGUud2hpY2ggPT0gMzcpIHx8IC8vIExFRlRcbiAgICAgICAgKCFpc0hvcml6b250YWwgJiYgZS53aGljaCA9PSAzOCkgLy8gVVBcbiAgICAgICkgeyBkZWNrLnByZXYoKTsgfVxuICAgIH0pO1xuICB9O1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICByZXR1cm4gZnVuY3Rpb24gKGRlY2spIHtcbiAgICB2YXIgcHJvZ3Jlc3NQYXJlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcbiAgICAgIHByb2dyZXNzQmFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JyksXG4gICAgICBwcm9wID0gb3B0aW9ucyA9PT0gJ3ZlcnRpY2FsJyA/ICdoZWlnaHQnIDogJ3dpZHRoJztcblxuICAgIHByb2dyZXNzUGFyZW50LmNsYXNzTmFtZSA9ICdiZXNwb2tlLXByb2dyZXNzLXBhcmVudCc7XG4gICAgcHJvZ3Jlc3NCYXIuY2xhc3NOYW1lID0gJ2Jlc3Bva2UtcHJvZ3Jlc3MtYmFyJztcbiAgICBwcm9ncmVzc1BhcmVudC5hcHBlbmRDaGlsZChwcm9ncmVzc0Jhcik7XG4gICAgZGVjay5wYXJlbnQuYXBwZW5kQ2hpbGQocHJvZ3Jlc3NQYXJlbnQpO1xuXG4gICAgZGVjay5vbignYWN0aXZhdGUnLCBmdW5jdGlvbihlKSB7XG4gICAgICBwcm9ncmVzc0Jhci5zdHlsZVtwcm9wXSA9IChlLmluZGV4ICogMTAwIC8gKGRlY2suc2xpZGVzLmxlbmd0aCAtIDEpKSArICclJztcbiAgICB9KTtcbiAgfTtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKGRlY2spIHtcbiAgICB2YXIgcGFyZW50ID0gZGVjay5wYXJlbnQsXG4gICAgICBmaXJzdFNsaWRlID0gZGVjay5zbGlkZXNbMF0sXG4gICAgICBzbGlkZUhlaWdodCA9IGZpcnN0U2xpZGUub2Zmc2V0SGVpZ2h0LFxuICAgICAgc2xpZGVXaWR0aCA9IGZpcnN0U2xpZGUub2Zmc2V0V2lkdGgsXG4gICAgICB1c2Vab29tID0gb3B0aW9ucyA9PT0gJ3pvb20nIHx8ICgnem9vbScgaW4gcGFyZW50LnN0eWxlICYmIG9wdGlvbnMgIT09ICd0cmFuc2Zvcm0nKSxcblxuICAgICAgd3JhcCA9IGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICAgICAgdmFyIHdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgd3JhcHBlci5jbGFzc05hbWUgPSAnYmVzcG9rZS1zY2FsZS1wYXJlbnQnO1xuICAgICAgICBlbGVtZW50LnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHdyYXBwZXIsIGVsZW1lbnQpO1xuICAgICAgICB3cmFwcGVyLmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuICAgICAgICByZXR1cm4gd3JhcHBlcjtcbiAgICAgIH0sXG5cbiAgICAgIGVsZW1lbnRzID0gdXNlWm9vbSA/IGRlY2suc2xpZGVzIDogZGVjay5zbGlkZXMubWFwKHdyYXApLFxuXG4gICAgICB0cmFuc2Zvcm1Qcm9wZXJ0eSA9IChmdW5jdGlvbihwcm9wZXJ0eSkge1xuICAgICAgICB2YXIgcHJlZml4ZXMgPSAnTW96IFdlYmtpdCBPIG1zJy5zcGxpdCgnICcpO1xuICAgICAgICByZXR1cm4gcHJlZml4ZXMucmVkdWNlKGZ1bmN0aW9uKGN1cnJlbnRQcm9wZXJ0eSwgcHJlZml4KSB7XG4gICAgICAgICAgICByZXR1cm4gcHJlZml4ICsgcHJvcGVydHkgaW4gcGFyZW50LnN0eWxlID8gcHJlZml4ICsgcHJvcGVydHkgOiBjdXJyZW50UHJvcGVydHk7XG4gICAgICAgICAgfSwgcHJvcGVydHkudG9Mb3dlckNhc2UoKSk7XG4gICAgICB9KCdUcmFuc2Zvcm0nKSksXG5cbiAgICAgIHNjYWxlID0gdXNlWm9vbSA/XG4gICAgICAgIGZ1bmN0aW9uKHJhdGlvLCBlbGVtZW50KSB7XG4gICAgICAgICAgZWxlbWVudC5zdHlsZS56b29tID0gcmF0aW87XG4gICAgICAgIH0gOlxuICAgICAgICBmdW5jdGlvbihyYXRpbywgZWxlbWVudCkge1xuICAgICAgICAgIGVsZW1lbnQuc3R5bGVbdHJhbnNmb3JtUHJvcGVydHldID0gJ3NjYWxlKCcgKyByYXRpbyArICcpJztcbiAgICAgICAgfSxcblxuICAgICAgc2NhbGVBbGwgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHhTY2FsZSA9IHBhcmVudC5vZmZzZXRXaWR0aCAvIHNsaWRlV2lkdGgsXG4gICAgICAgICAgeVNjYWxlID0gcGFyZW50Lm9mZnNldEhlaWdodCAvIHNsaWRlSGVpZ2h0O1xuXG4gICAgICAgIGVsZW1lbnRzLmZvckVhY2goc2NhbGUuYmluZChudWxsLCBNYXRoLm1pbih4U2NhbGUsIHlTY2FsZSkpKTtcbiAgICAgIH07XG5cbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgc2NhbGVBbGwpO1xuICAgIHNjYWxlQWxsKCk7XG4gIH07XG5cbn07XG4iLCJcbnZhciBpbnNlcnRDc3MgPSByZXF1aXJlKCdpbnNlcnQtY3NzJyk7XG52YXIgdHJhbnNmb3JtID0gcmVxdWlyZSgnZmVhdHVyZS9jc3MnKSgndHJhbnNmb3JtJyk7XG52YXIgZG90ID0gcmVxdWlyZSgnZG90Jyk7XG52YXIgdGhlbWUgPSBkb3QudGVtcGxhdGUoXCJAaW1wb3J0IHVybChodHRwOi8vZm9udHMuZ29vZ2xlYXBpcy5jb20vY3NzP2ZhbWlseT17ez0gaXQuZm9udCB8fCAnTW9udHNlcnJhdCd9fSk7XFxuQGltcG9ydCB1cmwoaHR0cDovL2ZvbnRzLmdvb2dsZWFwaXMuY29tL2Nzcz9mYW1pbHk9e3s9IGl0LmZvbnQgfHwgJ1NvdXJjZStDb2RlK1Bybyd9fSk7XFxuXFxuaHRtbCwgYm9keSB7XFxuICBtYXJnaW46IDA7XFxuICB3aWR0aDogMTAwJTtcXG4gIGhlaWdodDogMTAwJTtcXG4gIG92ZXJmbG93OiBoaWRkZW47XFxuICBjb2xvcjoge3s9IGl0LmNvbG9yIHx8ICd3aGl0ZScgfX07XFxuICBiYWNrZ3JvdW5kOiB7ez0gaXQuYmFja2dyb3VuZCB8fCAnYmxhY2snIH19O1xcbn1cXG5cXG4uYmVzcG9rZS1wYXJlbnQge1xcbiAgdGV4dC1hbGlnbjogY2VudGVyO1xcbiAgZm9udC1zaXplOiAxLjVlbTtcXG4gIGRpc3BsYXk6IGZsZXg7XFxuICB3aWR0aDogYXV0bztcXG4gIGhlaWdodDogMTAwJTtcXG4gIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjVzIGVhc2UtaW4tb3V0O1xcbiAgZm9udC1mYW1pbHk6ICdNb250c2VycmF0Jywgc2Fucy1zZXJpZjtcXG59XFxuXFxuLmJlc3Bva2Utc2xpZGUge1xcbiAgcGFkZGluZzogNSU7XFxuICB3aWR0aDogOTAlO1xcbiAgaGVpZ2h0OiA5MCU7XFxuXFxuICBiYWNrZ3JvdW5kLXBvc2l0aW9uOiA1MCUgNTAlO1xcbiAgYmFja2dyb3VuZC1yZXBlYXQ6IG5vLXJlcGVhdDtcXG5cXG4gIGRpc3BsYXk6IGZsZXg7XFxuICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xcbiAgZmxleC1zaHJpbms6IDA7XFxuICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcXG59XFxuXFxuLmJlc3Bva2Utc2xpZGUgdWwsIC5iZXNwb2tlLXNsaWRlIG9sIHtcXG4gIHRleHQtYWxpZ246IGxlZnQ7XFxufVxcblxcbi5iZXNwb2tlLXNsaWRlIGgxLCAuYmVzcG9rZS1zbGlkZSBoMiwgLmJlc3Bva2Utc2xpZGUgaDMge1xcbiAgbWFyZ2luOiAwcHg7XFxufVxcblxcbi5iZXNwb2tlLXNsaWRlIGgxICsgaDIge1xcbiAgbWFyZ2luLXRvcDogMTBweDtcXG59XFxuXFxuLmJlc3Bva2Utc2xpZGUgaDEge1xcbiAgZm9udC1zaXplOiA0ZW07XFxuICB0ZXh0LXNoYWRvdzogMS41cHggMS41cHggMXB4IHt7PSBpdC5iYWNrZ3JvdW5kIHx8ICdibGFjaycgfX07XFxufVxcblxcbi5iZXNwb2tlLXNsaWRlIHByZSwgLmJlc3Bva2Utc2xpZGUgY29kZSB7XFxuICBmb250LWZhbWlseTogJ1NvdXJjZSBDb2RlIFBybycsIG1vbm9zcGFjZTtcXG59XFxuXFxuLmJlc3Bva2Utc2xpZGUgbGkge1xcbiAgbGluZS1oZWlnaHQ6IDJlbTtcXG59XFxuXFxuLmJlc3Bva2Utc2xpZGUgYmxvY2txdW90ZSB7XFxuICB0ZXh0LWFsaWduOiBqdXN0aWZ5O1xcbiAgZm9udC1zdHlsZTogaXRhbGljO1xcbn1cXG5cXG4uYmVzcG9rZS1zbGlkZSBhLCAuYmVzcG9rZS1zbGlkZSBhOnZpc2l0ZWQge1xcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xcbiAgY29sb3I6IHt7PSBpdC5saW5rY29sb3IgfHwgJ3llbGxvdycgfX07XFxufVxcblxcbi5iZXNwb2tlLWJ1bGxldCB7XFxuICB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gMC41cyBlYXNlLWluLW91dDtcXG59XFxuXFxuLmJlc3Bva2UtYnVsbGV0LmJlc3Bva2UtYnVsbGV0LWluYWN0aXZlIHtcXG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgxMDB2aCkgdHJhbnNsYXRlWigwKTtcXG59XFxuXCIpO1xuXG4vKipcblx0IyBiZXNwb2tlLXRoZW1lLXR3ZWFrYWJsZVxuXG5cdEEgc2ltcGxlIFtiZXNwb2tlLmpzXShodHRwczovL2dpdGh1Yi5jb20vbWFya2RhbGdsZWlzaC9iZXNwb2tlLmpzKSB0aGVtZVxuXHR0aGF0IGNhbiBiZSBjb25maWd1cmVkIG9uIHRoZSBmbHkgdXNpbmcgY2xpZW50LXNpZGUgdGVtcGxhdGluZy5cblxuXHQjIyBFeGFtcGxlIFVzYWdlXG5cblx0VG8gYmUgY29tcGxldGVkLlxuXG4qKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0cykge1xuICBpbnNlcnRDc3ModGhlbWUob3B0cyB8fCB7fSksIHsgcHJlcGVuZDogdHJ1ZSB9KTtcblxuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xuICAgIHZhciBwYXJlbnQgPSBkZWNrLnBhcmVudDtcblxuICAgIHJlcXVpcmUoJ2Jlc3Bva2UtY2xhc3NlcycpKCkoZGVjayk7XG5cbiAgICBkZWNrLm9uKCdhY3RpdmF0ZScsIGZ1bmN0aW9uKGV2dCkge1xuICAgICAgdmFyIHZhbFggPSAoZXZ0LmluZGV4ICogMTAwKTtcblxuICAgICAgaWYgKHRyYW5zZm9ybSkge1xuICAgICAgICB0cmFuc2Zvcm0ocGFyZW50LCAndHJhbnNsYXRlWCgtJyArIHZhbFggKyAnJSkgdHJhbnNsYXRlWigwKScpO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHBhcmVudC5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG4gICAgICAgIHBhcmVudC5sZWZ0ID0gJy0nICsgdmFsWCArICclJztcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xuICAgIHZhciBhZGRDbGFzcyA9IGZ1bmN0aW9uKGVsLCBjbHMpIHtcbiAgICAgICAgZWwuY2xhc3NMaXN0LmFkZCgnYmVzcG9rZS0nICsgY2xzKTtcbiAgICAgIH0sXG5cbiAgICAgIHJlbW92ZUNsYXNzID0gZnVuY3Rpb24oZWwsIGNscykge1xuICAgICAgICBlbC5jbGFzc05hbWUgPSBlbC5jbGFzc05hbWVcbiAgICAgICAgICAucmVwbGFjZShuZXcgUmVnRXhwKCdiZXNwb2tlLScgKyBjbHMgKycoXFxcXHN8JCknLCAnZycpLCAnICcpXG4gICAgICAgICAgLnRyaW0oKTtcbiAgICAgIH0sXG5cbiAgICAgIGRlYWN0aXZhdGUgPSBmdW5jdGlvbihlbCwgaW5kZXgpIHtcbiAgICAgICAgdmFyIGFjdGl2ZVNsaWRlID0gZGVjay5zbGlkZXNbZGVjay5zbGlkZSgpXSxcbiAgICAgICAgICBvZmZzZXQgPSBpbmRleCAtIGRlY2suc2xpZGUoKSxcbiAgICAgICAgICBvZmZzZXRDbGFzcyA9IG9mZnNldCA+IDAgPyAnYWZ0ZXInIDogJ2JlZm9yZSc7XG5cbiAgICAgICAgWydiZWZvcmUoLVxcXFxkKyk/JywgJ2FmdGVyKC1cXFxcZCspPycsICdhY3RpdmUnLCAnaW5hY3RpdmUnXS5tYXAocmVtb3ZlQ2xhc3MuYmluZChudWxsLCBlbCkpO1xuXG4gICAgICAgIGlmIChlbCAhPT0gYWN0aXZlU2xpZGUpIHtcbiAgICAgICAgICBbJ2luYWN0aXZlJywgb2Zmc2V0Q2xhc3MsIG9mZnNldENsYXNzICsgJy0nICsgTWF0aC5hYnMob2Zmc2V0KV0ubWFwKGFkZENsYXNzLmJpbmQobnVsbCwgZWwpKTtcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgIGFkZENsYXNzKGRlY2sucGFyZW50LCAncGFyZW50Jyk7XG4gICAgZGVjay5zbGlkZXMubWFwKGZ1bmN0aW9uKGVsKSB7IGFkZENsYXNzKGVsLCAnc2xpZGUnKTsgfSk7XG5cbiAgICBkZWNrLm9uKCdhY3RpdmF0ZScsIGZ1bmN0aW9uKGUpIHtcbiAgICAgIGRlY2suc2xpZGVzLm1hcChkZWFjdGl2YXRlKTtcbiAgICAgIGFkZENsYXNzKGUuc2xpZGUsICdhY3RpdmUnKTtcbiAgICAgIHJlbW92ZUNsYXNzKGUuc2xpZGUsICdpbmFjdGl2ZScpO1xuICAgIH0pO1xuICB9O1xufTtcbiIsIi8vIGRvVC5qc1xuLy8gMjAxMS0yMDE0LCBMYXVyYSBEb2t0b3JvdmEsIGh0dHBzOi8vZ2l0aHViLmNvbS9vbGFkby9kb1Rcbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cblxuKGZ1bmN0aW9uKCkge1xuXHRcInVzZSBzdHJpY3RcIjtcblxuXHR2YXIgZG9UID0ge1xuXHRcdHZlcnNpb246IFwiMS4wLjNcIixcblx0XHR0ZW1wbGF0ZVNldHRpbmdzOiB7XG5cdFx0XHRldmFsdWF0ZTogICAgL1xce1xceyhbXFxzXFxTXSs/KFxcfT8pKylcXH1cXH0vZyxcblx0XHRcdGludGVycG9sYXRlOiAvXFx7XFx7PShbXFxzXFxTXSs/KVxcfVxcfS9nLFxuXHRcdFx0ZW5jb2RlOiAgICAgIC9cXHtcXHshKFtcXHNcXFNdKz8pXFx9XFx9L2csXG5cdFx0XHR1c2U6ICAgICAgICAgL1xce1xceyMoW1xcc1xcU10rPylcXH1cXH0vZyxcblx0XHRcdHVzZVBhcmFtczogICAvKF58W15cXHckXSlkZWYoPzpcXC58XFxbW1xcJ1xcXCJdKShbXFx3JFxcLl0rKSg/OltcXCdcXFwiXVxcXSk/XFxzKlxcOlxccyooW1xcdyRcXC5dK3xcXFwiW15cXFwiXStcXFwifFxcJ1teXFwnXStcXCd8XFx7W15cXH1dK1xcfSkvZyxcblx0XHRcdGRlZmluZTogICAgICAvXFx7XFx7IyNcXHMqKFtcXHdcXC4kXSspXFxzKihcXDp8PSkoW1xcc1xcU10rPykjXFx9XFx9L2csXG5cdFx0XHRkZWZpbmVQYXJhbXM6L15cXHMqKFtcXHckXSspOihbXFxzXFxTXSspLyxcblx0XHRcdGNvbmRpdGlvbmFsOiAvXFx7XFx7XFw/KFxcPyk/XFxzKihbXFxzXFxTXSo/KVxccypcXH1cXH0vZyxcblx0XHRcdGl0ZXJhdGU6ICAgICAvXFx7XFx7flxccyooPzpcXH1cXH18KFtcXHNcXFNdKz8pXFxzKlxcOlxccyooW1xcdyRdKylcXHMqKD86XFw6XFxzKihbXFx3JF0rKSk/XFxzKlxcfVxcfSkvZyxcblx0XHRcdHZhcm5hbWU6XHRcIml0XCIsXG5cdFx0XHRzdHJpcDpcdFx0dHJ1ZSxcblx0XHRcdGFwcGVuZDpcdFx0dHJ1ZSxcblx0XHRcdHNlbGZjb250YWluZWQ6IGZhbHNlLFxuXHRcdFx0ZG9Ob3RTa2lwRW5jb2RlZDogZmFsc2Vcblx0XHR9LFxuXHRcdHRlbXBsYXRlOiB1bmRlZmluZWQsIC8vZm4sIGNvbXBpbGUgdGVtcGxhdGVcblx0XHRjb21waWxlOiAgdW5kZWZpbmVkICAvL2ZuLCBmb3IgZXhwcmVzc1xuXHR9LCBfZ2xvYmFscztcblxuXHRkb1QuZW5jb2RlSFRNTFNvdXJjZSA9IGZ1bmN0aW9uKGRvTm90U2tpcEVuY29kZWQpIHtcblx0XHR2YXIgZW5jb2RlSFRNTFJ1bGVzID0geyBcIiZcIjogXCImIzM4O1wiLCBcIjxcIjogXCImIzYwO1wiLCBcIj5cIjogXCImIzYyO1wiLCAnXCInOiBcIiYjMzQ7XCIsIFwiJ1wiOiBcIiYjMzk7XCIsIFwiL1wiOiBcIiYjNDc7XCIgfSxcblx0XHRcdG1hdGNoSFRNTCA9IGRvTm90U2tpcEVuY29kZWQgPyAvWyY8PlwiJ1xcL10vZyA6IC8mKD8hIz9cXHcrOyl8PHw+fFwifCd8XFwvL2c7XG5cdFx0cmV0dXJuIGZ1bmN0aW9uKGNvZGUpIHtcblx0XHRcdHJldHVybiBjb2RlID8gY29kZS50b1N0cmluZygpLnJlcGxhY2UobWF0Y2hIVE1MLCBmdW5jdGlvbihtKSB7cmV0dXJuIGVuY29kZUhUTUxSdWxlc1ttXSB8fCBtO30pIDogXCJcIjtcblx0XHR9O1xuXHR9O1xuXG5cdF9nbG9iYWxzID0gKGZ1bmN0aW9uKCl7IHJldHVybiB0aGlzIHx8ICgwLGV2YWwpKFwidGhpc1wiKTsgfSgpKTtcblxuXHRpZiAodHlwZW9mIG1vZHVsZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiBtb2R1bGUuZXhwb3J0cykge1xuXHRcdG1vZHVsZS5leHBvcnRzID0gZG9UO1xuXHR9IGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09IFwiZnVuY3Rpb25cIiAmJiBkZWZpbmUuYW1kKSB7XG5cdFx0ZGVmaW5lKGZ1bmN0aW9uKCl7cmV0dXJuIGRvVDt9KTtcblx0fSBlbHNlIHtcblx0XHRfZ2xvYmFscy5kb1QgPSBkb1Q7XG5cdH1cblxuXHR2YXIgc3RhcnRlbmQgPSB7XG5cdFx0YXBwZW5kOiB7IHN0YXJ0OiBcIicrKFwiLCAgICAgIGVuZDogXCIpKydcIiwgICAgICBzdGFydGVuY29kZTogXCInK2VuY29kZUhUTUwoXCIgfSxcblx0XHRzcGxpdDogIHsgc3RhcnQ6IFwiJztvdXQrPShcIiwgZW5kOiBcIik7b3V0Kz0nXCIsIHN0YXJ0ZW5jb2RlOiBcIic7b3V0Kz1lbmNvZGVIVE1MKFwiIH1cblx0fSwgc2tpcCA9IC8kXi87XG5cblx0ZnVuY3Rpb24gcmVzb2x2ZURlZnMoYywgYmxvY2ssIGRlZikge1xuXHRcdHJldHVybiAoKHR5cGVvZiBibG9jayA9PT0gXCJzdHJpbmdcIikgPyBibG9jayA6IGJsb2NrLnRvU3RyaW5nKCkpXG5cdFx0LnJlcGxhY2UoYy5kZWZpbmUgfHwgc2tpcCwgZnVuY3Rpb24obSwgY29kZSwgYXNzaWduLCB2YWx1ZSkge1xuXHRcdFx0aWYgKGNvZGUuaW5kZXhPZihcImRlZi5cIikgPT09IDApIHtcblx0XHRcdFx0Y29kZSA9IGNvZGUuc3Vic3RyaW5nKDQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCEoY29kZSBpbiBkZWYpKSB7XG5cdFx0XHRcdGlmIChhc3NpZ24gPT09IFwiOlwiKSB7XG5cdFx0XHRcdFx0aWYgKGMuZGVmaW5lUGFyYW1zKSB2YWx1ZS5yZXBsYWNlKGMuZGVmaW5lUGFyYW1zLCBmdW5jdGlvbihtLCBwYXJhbSwgdikge1xuXHRcdFx0XHRcdFx0ZGVmW2NvZGVdID0ge2FyZzogcGFyYW0sIHRleHQ6IHZ9O1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmICghKGNvZGUgaW4gZGVmKSkgZGVmW2NvZGVdPSB2YWx1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRuZXcgRnVuY3Rpb24oXCJkZWZcIiwgXCJkZWZbJ1wiK2NvZGUrXCInXT1cIiArIHZhbHVlKShkZWYpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gXCJcIjtcblx0XHR9KVxuXHRcdC5yZXBsYWNlKGMudXNlIHx8IHNraXAsIGZ1bmN0aW9uKG0sIGNvZGUpIHtcblx0XHRcdGlmIChjLnVzZVBhcmFtcykgY29kZSA9IGNvZGUucmVwbGFjZShjLnVzZVBhcmFtcywgZnVuY3Rpb24obSwgcywgZCwgcGFyYW0pIHtcblx0XHRcdFx0aWYgKGRlZltkXSAmJiBkZWZbZF0uYXJnICYmIHBhcmFtKSB7XG5cdFx0XHRcdFx0dmFyIHJ3ID0gKGQrXCI6XCIrcGFyYW0pLnJlcGxhY2UoLyd8XFxcXC9nLCBcIl9cIik7XG5cdFx0XHRcdFx0ZGVmLl9fZXhwID0gZGVmLl9fZXhwIHx8IHt9O1xuXHRcdFx0XHRcdGRlZi5fX2V4cFtyd10gPSBkZWZbZF0udGV4dC5yZXBsYWNlKG5ldyBSZWdFeHAoXCIoXnxbXlxcXFx3JF0pXCIgKyBkZWZbZF0uYXJnICsgXCIoW15cXFxcdyRdKVwiLCBcImdcIiksIFwiJDFcIiArIHBhcmFtICsgXCIkMlwiKTtcblx0XHRcdFx0XHRyZXR1cm4gcyArIFwiZGVmLl9fZXhwWydcIitydytcIiddXCI7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dmFyIHYgPSBuZXcgRnVuY3Rpb24oXCJkZWZcIiwgXCJyZXR1cm4gXCIgKyBjb2RlKShkZWYpO1xuXHRcdFx0cmV0dXJuIHYgPyByZXNvbHZlRGVmcyhjLCB2LCBkZWYpIDogdjtcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHVuZXNjYXBlKGNvZGUpIHtcblx0XHRyZXR1cm4gY29kZS5yZXBsYWNlKC9cXFxcKCd8XFxcXCkvZywgXCIkMVwiKS5yZXBsYWNlKC9bXFxyXFx0XFxuXS9nLCBcIiBcIik7XG5cdH1cblxuXHRkb1QudGVtcGxhdGUgPSBmdW5jdGlvbih0bXBsLCBjLCBkZWYpIHtcblx0XHRjID0gYyB8fCBkb1QudGVtcGxhdGVTZXR0aW5ncztcblx0XHR2YXIgY3NlID0gYy5hcHBlbmQgPyBzdGFydGVuZC5hcHBlbmQgOiBzdGFydGVuZC5zcGxpdCwgbmVlZGh0bWxlbmNvZGUsIHNpZCA9IDAsIGluZHYsXG5cdFx0XHRzdHIgID0gKGMudXNlIHx8IGMuZGVmaW5lKSA/IHJlc29sdmVEZWZzKGMsIHRtcGwsIGRlZiB8fCB7fSkgOiB0bXBsO1xuXG5cdFx0c3RyID0gKFwidmFyIG91dD0nXCIgKyAoYy5zdHJpcCA/IHN0ci5yZXBsYWNlKC8oXnxcXHJ8XFxuKVxcdCogK3wgK1xcdCooXFxyfFxcbnwkKS9nLFwiIFwiKVxuXHRcdFx0XHRcdC5yZXBsYWNlKC9cXHJ8XFxufFxcdHxcXC9cXCpbXFxzXFxTXSo/XFwqXFwvL2csXCJcIik6IHN0cilcblx0XHRcdC5yZXBsYWNlKC8nfFxcXFwvZywgXCJcXFxcJCZcIilcblx0XHRcdC5yZXBsYWNlKGMuaW50ZXJwb2xhdGUgfHwgc2tpcCwgZnVuY3Rpb24obSwgY29kZSkge1xuXHRcdFx0XHRyZXR1cm4gY3NlLnN0YXJ0ICsgdW5lc2NhcGUoY29kZSkgKyBjc2UuZW5kO1xuXHRcdFx0fSlcblx0XHRcdC5yZXBsYWNlKGMuZW5jb2RlIHx8IHNraXAsIGZ1bmN0aW9uKG0sIGNvZGUpIHtcblx0XHRcdFx0bmVlZGh0bWxlbmNvZGUgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4gY3NlLnN0YXJ0ZW5jb2RlICsgdW5lc2NhcGUoY29kZSkgKyBjc2UuZW5kO1xuXHRcdFx0fSlcblx0XHRcdC5yZXBsYWNlKGMuY29uZGl0aW9uYWwgfHwgc2tpcCwgZnVuY3Rpb24obSwgZWxzZWNhc2UsIGNvZGUpIHtcblx0XHRcdFx0cmV0dXJuIGVsc2VjYXNlID9cblx0XHRcdFx0XHQoY29kZSA/IFwiJzt9ZWxzZSBpZihcIiArIHVuZXNjYXBlKGNvZGUpICsgXCIpe291dCs9J1wiIDogXCInO31lbHNle291dCs9J1wiKSA6XG5cdFx0XHRcdFx0KGNvZGUgPyBcIic7aWYoXCIgKyB1bmVzY2FwZShjb2RlKSArIFwiKXtvdXQrPSdcIiA6IFwiJzt9b3V0Kz0nXCIpO1xuXHRcdFx0fSlcblx0XHRcdC5yZXBsYWNlKGMuaXRlcmF0ZSB8fCBza2lwLCBmdW5jdGlvbihtLCBpdGVyYXRlLCB2bmFtZSwgaW5hbWUpIHtcblx0XHRcdFx0aWYgKCFpdGVyYXRlKSByZXR1cm4gXCInO30gfSBvdXQrPSdcIjtcblx0XHRcdFx0c2lkKz0xOyBpbmR2PWluYW1lIHx8IFwiaVwiK3NpZDsgaXRlcmF0ZT11bmVzY2FwZShpdGVyYXRlKTtcblx0XHRcdFx0cmV0dXJuIFwiJzt2YXIgYXJyXCIrc2lkK1wiPVwiK2l0ZXJhdGUrXCI7aWYoYXJyXCIrc2lkK1wiKXt2YXIgXCIrdm5hbWUrXCIsXCIraW5kditcIj0tMSxsXCIrc2lkK1wiPWFyclwiK3NpZCtcIi5sZW5ndGgtMTt3aGlsZShcIitpbmR2K1wiPGxcIitzaWQrXCIpe1wiXG5cdFx0XHRcdFx0K3ZuYW1lK1wiPWFyclwiK3NpZCtcIltcIitpbmR2K1wiKz0xXTtvdXQrPSdcIjtcblx0XHRcdH0pXG5cdFx0XHQucmVwbGFjZShjLmV2YWx1YXRlIHx8IHNraXAsIGZ1bmN0aW9uKG0sIGNvZGUpIHtcblx0XHRcdFx0cmV0dXJuIFwiJztcIiArIHVuZXNjYXBlKGNvZGUpICsgXCJvdXQrPSdcIjtcblx0XHRcdH0pXG5cdFx0XHQrIFwiJztyZXR1cm4gb3V0O1wiKVxuXHRcdFx0LnJlcGxhY2UoL1xcbi9nLCBcIlxcXFxuXCIpLnJlcGxhY2UoL1xcdC9nLCAnXFxcXHQnKS5yZXBsYWNlKC9cXHIvZywgXCJcXFxcclwiKVxuXHRcdFx0LnJlcGxhY2UoLyhcXHN8O3xcXH18XnxcXHspb3V0XFwrPScnOy9nLCAnJDEnKS5yZXBsYWNlKC9cXCsnJy9nLCBcIlwiKTtcblx0XHRcdC8vLnJlcGxhY2UoLyhcXHN8O3xcXH18XnxcXHspb3V0XFwrPScnXFwrL2csJyQxb3V0Kz0nKTtcblxuXHRcdGlmIChuZWVkaHRtbGVuY29kZSkge1xuXHRcdFx0aWYgKCFjLnNlbGZjb250YWluZWQgJiYgX2dsb2JhbHMgJiYgIV9nbG9iYWxzLl9lbmNvZGVIVE1MKSBfZ2xvYmFscy5fZW5jb2RlSFRNTCA9IGRvVC5lbmNvZGVIVE1MU291cmNlKGMuZG9Ob3RTa2lwRW5jb2RlZCk7XG5cdFx0XHRzdHIgPSBcInZhciBlbmNvZGVIVE1MID0gdHlwZW9mIF9lbmNvZGVIVE1MICE9PSAndW5kZWZpbmVkJyA/IF9lbmNvZGVIVE1MIDogKFwiXG5cdFx0XHRcdCsgZG9ULmVuY29kZUhUTUxTb3VyY2UudG9TdHJpbmcoKSArIFwiKFwiICsgKGMuZG9Ob3RTa2lwRW5jb2RlZCB8fCAnJykgKyBcIikpO1wiXG5cdFx0XHRcdCsgc3RyO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIG5ldyBGdW5jdGlvbihjLnZhcm5hbWUsIHN0cik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKHR5cGVvZiBjb25zb2xlICE9PSBcInVuZGVmaW5lZFwiKSBjb25zb2xlLmxvZyhcIkNvdWxkIG5vdCBjcmVhdGUgYSB0ZW1wbGF0ZSBmdW5jdGlvbjogXCIgKyBzdHIpO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH07XG5cblx0ZG9ULmNvbXBpbGUgPSBmdW5jdGlvbih0bXBsLCBkZWYpIHtcblx0XHRyZXR1cm4gZG9ULnRlbXBsYXRlKHRtcGwsIG51bGwsIGRlZik7XG5cdH07XG59KCkpO1xuIiwiLyogZG9UICsgYXV0by1jb21waWxhdGlvbiBvZiBkb1QgdGVtcGxhdGVzXG4gKlxuICogMjAxMiwgTGF1cmEgRG9rdG9yb3ZhLCBodHRwczovL2dpdGh1Yi5jb20vb2xhZG8vZG9UXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2VcbiAqXG4gKiBDb21waWxlcyAuZGVmLCAuZG90LCAuanN0IGZpbGVzIGZvdW5kIHVuZGVyIHRoZSBzcGVjaWZpZWQgcGF0aC5cbiAqIEl0IGlnbm9yZXMgc3ViLWRpcmVjdG9yaWVzLlxuICogVGVtcGxhdGUgZmlsZXMgY2FuIGhhdmUgbXVsdGlwbGUgZXh0ZW5zaW9ucyBhdCB0aGUgc2FtZSB0aW1lLlxuICogRmlsZXMgd2l0aCAuZGVmIGV4dGVuc2lvbiBjYW4gYmUgaW5jbHVkZWQgaW4gb3RoZXIgZmlsZXMgdmlhIHt7I2RlZi5uYW1lfX1cbiAqIEZpbGVzIHdpdGggLmRvdCBleHRlbnNpb24gYXJlIGNvbXBpbGVkIGludG8gZnVuY3Rpb25zIHdpdGggdGhlIHNhbWUgbmFtZSBhbmRcbiAqIGNhbiBiZSBhY2Nlc3NlZCBhcyByZW5kZXJlci5maWxlbmFtZVxuICogRmlsZXMgd2l0aCAuanN0IGV4dGVuc2lvbiBhcmUgY29tcGlsZWQgaW50byAuanMgZmlsZXMuIFByb2R1Y2VkIC5qcyBmaWxlIGNhbiBiZVxuICogbG9hZGVkIGFzIGEgY29tbW9uSlMsIEFNRCBtb2R1bGUsIG9yIGp1c3QgaW5zdGFsbGVkIGludG8gYSBnbG9iYWwgdmFyaWFibGVcbiAqIChkZWZhdWx0IGlzIHNldCB0byB3aW5kb3cucmVuZGVyKS5cbiAqIEFsbCBpbmxpbmUgZGVmaW5lcyBkZWZpbmVkIGluIHRoZSAuanN0IGZpbGUgYXJlXG4gKiBjb21waWxlZCBpbnRvIHNlcGFyYXRlIGZ1bmN0aW9ucyBhbmQgYXJlIGF2YWlsYWJsZSB2aWEgX3JlbmRlci5maWxlbmFtZS5kZWZpbmVuYW1lXG4gKlxuICogQmFzaWMgdXNhZ2U6XG4gKiB2YXIgZG90cyA9IHJlcXVpcmUoXCJkb3RcIikucHJvY2Vzcyh7cGF0aDogXCIuL3ZpZXdzXCJ9KTtcbiAqIGRvdHMubXl0ZW1wbGF0ZSh7Zm9vOlwiaGVsbG8gd29ybGRcIn0pO1xuICpcbiAqIFRoZSBhYm92ZSBzbmlwcGV0IHdpbGw6XG4gKiAxLiBDb21waWxlIGFsbCB0ZW1wbGF0ZXMgaW4gdmlld3MgZm9sZGVyICguZG90LCAuZGVmLCAuanN0KVxuICogMi4gUGxhY2UgLmpzIGZpbGVzIGNvbXBpbGVkIGZyb20gLmpzdCB0ZW1wbGF0ZXMgaW50byB0aGUgc2FtZSBmb2xkZXIuXG4gKiAgICBUaGVzZSBmaWxlcyBjYW4gYmUgdXNlZCB3aXRoIHJlcXVpcmUsIGkuZS4gcmVxdWlyZShcIi4vdmlld3MvbXl0ZW1wbGF0ZVwiKS5cbiAqIDMuIFJldHVybiBhbiBvYmplY3Qgd2l0aCBmdW5jdGlvbnMgY29tcGlsZWQgZnJvbSAuZG90IHRlbXBsYXRlcyBhcyBpdHMgcHJvcGVydGllcy5cbiAqIDQuIFJlbmRlciBteXRlbXBsYXRlIHRlbXBsYXRlLlxuICovXG5cbnZhciBmcyA9IHJlcXVpcmUoXCJmc1wiKSxcblx0ZG9UID0gbW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiLi9kb1RcIik7XG5cbmRvVC5wcm9jZXNzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuXHQvL3BhdGgsIGRlc3RpbmF0aW9uLCBnbG9iYWwsIHJlbmRlcm1vZHVsZSwgdGVtcGxhdGVTZXR0aW5nc1xuXHRyZXR1cm4gbmV3IEluc3RhbGxEb3RzKG9wdGlvbnMpLmNvbXBpbGVBbGwoKTtcbn07XG5cbmZ1bmN0aW9uIEluc3RhbGxEb3RzKG8pIHtcblx0dGhpcy5fX3BhdGggXHRcdD0gby5wYXRoIHx8IFwiLi9cIjtcblx0aWYgKHRoaXMuX19wYXRoW3RoaXMuX19wYXRoLmxlbmd0aC0xXSAhPT0gJy8nKSB0aGlzLl9fcGF0aCArPSAnLyc7XG5cdHRoaXMuX19kZXN0aW5hdGlvblx0PSBvLmRlc3RpbmF0aW9uIHx8IHRoaXMuX19wYXRoO1xuXHRpZiAodGhpcy5fX2Rlc3RpbmF0aW9uW3RoaXMuX19kZXN0aW5hdGlvbi5sZW5ndGgtMV0gIT09ICcvJykgdGhpcy5fX2Rlc3RpbmF0aW9uICs9ICcvJztcblx0dGhpcy5fX2dsb2JhbFx0XHQ9IG8uZ2xvYmFsIHx8IFwid2luZG93LnJlbmRlclwiO1xuXHR0aGlzLl9fcmVuZGVybW9kdWxlXHQ9IG8ucmVuZGVybW9kdWxlIHx8IHt9O1xuXHR0aGlzLl9fc2V0dGluZ3MgXHQ9IG8udGVtcGxhdGVTZXR0aW5ncyA/IGNvcHkoby50ZW1wbGF0ZVNldHRpbmdzLCBjb3B5KGRvVC50ZW1wbGF0ZVNldHRpbmdzKSkgOiB1bmRlZmluZWQ7XG5cdHRoaXMuX19pbmNsdWRlc1x0XHQ9IHt9O1xufVxuXG5JbnN0YWxsRG90cy5wcm90b3R5cGUuY29tcGlsZVRvRmlsZSA9IGZ1bmN0aW9uKHBhdGgsIHRlbXBsYXRlLCBkZWYpIHtcblx0ZGVmID0gZGVmIHx8IHt9O1xuXHR2YXIgbW9kdWxlbmFtZSA9IHBhdGguc3Vic3RyaW5nKHBhdGgubGFzdEluZGV4T2YoXCIvXCIpKzEsIHBhdGgubGFzdEluZGV4T2YoXCIuXCIpKVxuXHRcdCwgZGVmcyA9IGNvcHkodGhpcy5fX2luY2x1ZGVzLCBjb3B5KGRlZikpXG5cdFx0LCBzZXR0aW5ncyA9IHRoaXMuX19zZXR0aW5ncyB8fCBkb1QudGVtcGxhdGVTZXR0aW5nc1xuXHRcdCwgY29tcGlsZW9wdGlvbnMgPSBjb3B5KHNldHRpbmdzKVxuXHRcdCwgZGVmYXVsdGNvbXBpbGVkID0gZG9ULnRlbXBsYXRlKHRlbXBsYXRlLCBzZXR0aW5ncywgZGVmcylcblx0XHQsIGV4cG9ydHMgPSBbXVxuXHRcdCwgY29tcGlsZWQgPSBcIlwiXG5cdFx0LCBmbjtcblxuXHRmb3IgKHZhciBwcm9wZXJ0eSBpbiBkZWZzKSB7XG5cdFx0aWYgKGRlZnNbcHJvcGVydHldICE9PSBkZWZbcHJvcGVydHldICYmIGRlZnNbcHJvcGVydHldICE9PSB0aGlzLl9faW5jbHVkZXNbcHJvcGVydHldKSB7XG5cdFx0XHRmbiA9IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0eXBlb2YgZGVmc1twcm9wZXJ0eV0gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGZuID0gZG9ULnRlbXBsYXRlKGRlZnNbcHJvcGVydHldLCBzZXR0aW5ncywgZGVmcyk7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBkZWZzW3Byb3BlcnR5XSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRmbiA9IGRlZnNbcHJvcGVydHldO1xuXHRcdFx0fSBlbHNlIGlmIChkZWZzW3Byb3BlcnR5XS5hcmcpIHtcblx0XHRcdFx0Y29tcGlsZW9wdGlvbnMudmFybmFtZSA9IGRlZnNbcHJvcGVydHldLmFyZztcblx0XHRcdFx0Zm4gPSBkb1QudGVtcGxhdGUoZGVmc1twcm9wZXJ0eV0udGV4dCwgY29tcGlsZW9wdGlvbnMsIGRlZnMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZuKSB7XG5cdFx0XHRcdGNvbXBpbGVkICs9IGZuLnRvU3RyaW5nKCkucmVwbGFjZSgnYW5vbnltb3VzJywgcHJvcGVydHkpO1xuXHRcdFx0XHRleHBvcnRzLnB1c2gocHJvcGVydHkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRjb21waWxlZCArPSBkZWZhdWx0Y29tcGlsZWQudG9TdHJpbmcoKS5yZXBsYWNlKCdhbm9ueW1vdXMnLCBtb2R1bGVuYW1lKTtcblx0ZnMud3JpdGVGaWxlU3luYyhwYXRoLCBcIihmdW5jdGlvbigpe1wiICsgY29tcGlsZWRcblx0XHQrIFwidmFyIGl0c2VsZj1cIiArIG1vZHVsZW5hbWUgKyBcIiwgX2VuY29kZUhUTUw9KFwiICsgZG9ULmVuY29kZUhUTUxTb3VyY2UudG9TdHJpbmcoKSArIFwiKFwiICsgKHNldHRpbmdzLmRvTm90U2tpcEVuY29kZWQgfHwgJycpICsgXCIpKTtcIlxuXHRcdCsgYWRkZXhwb3J0cyhleHBvcnRzKVxuXHRcdCsgXCJpZih0eXBlb2YgbW9kdWxlIT09J3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIG1vZHVsZS5leHBvcnRzPWl0c2VsZjtlbHNlIGlmKHR5cGVvZiBkZWZpbmU9PT0nZnVuY3Rpb24nKWRlZmluZShmdW5jdGlvbigpe3JldHVybiBpdHNlbGY7fSk7ZWxzZSB7XCJcblx0XHQrIHRoaXMuX19nbG9iYWwgKyBcIj1cIiArIHRoaXMuX19nbG9iYWwgKyBcInx8e307XCIgKyB0aGlzLl9fZ2xvYmFsICsgXCJbJ1wiICsgbW9kdWxlbmFtZSArIFwiJ109aXRzZWxmO319KCkpO1wiKTtcbn07XG5cbmZ1bmN0aW9uIGFkZGV4cG9ydHMoZXhwb3J0cykge1xuXHRmb3IgKHZhciByZXQgPScnLCBpPTA7IGk8IGV4cG9ydHMubGVuZ3RoOyBpKyspIHtcblx0XHRyZXQgKz0gXCJpdHNlbGYuXCIgKyBleHBvcnRzW2ldKyBcIj1cIiArIGV4cG9ydHNbaV0rXCI7XCI7XG5cdH1cblx0cmV0dXJuIHJldDtcbn1cblxuZnVuY3Rpb24gY29weShvLCB0bykge1xuXHR0byA9IHRvIHx8IHt9O1xuXHRmb3IgKHZhciBwcm9wZXJ0eSBpbiBvKSB7XG5cdFx0dG9bcHJvcGVydHldID0gb1twcm9wZXJ0eV07XG5cdH1cblx0cmV0dXJuIHRvO1xufVxuXG5mdW5jdGlvbiByZWFkZGF0YShwYXRoKSB7XG5cdHZhciBkYXRhID0gZnMucmVhZEZpbGVTeW5jKHBhdGgpO1xuXHRpZiAoZGF0YSkgcmV0dXJuIGRhdGEudG9TdHJpbmcoKTtcblx0Y29uc29sZS5sb2coXCJwcm9ibGVtcyB3aXRoIFwiICsgcGF0aCk7XG59XG5cbkluc3RhbGxEb3RzLnByb3RvdHlwZS5jb21waWxlUGF0aCA9IGZ1bmN0aW9uKHBhdGgpIHtcblx0dmFyIGRhdGEgPSByZWFkZGF0YShwYXRoKTtcblx0aWYgKGRhdGEpIHtcblx0XHRyZXR1cm4gZG9ULnRlbXBsYXRlKGRhdGEsXG5cdFx0XHRcdFx0dGhpcy5fX3NldHRpbmdzIHx8IGRvVC50ZW1wbGF0ZVNldHRpbmdzLFxuXHRcdFx0XHRcdGNvcHkodGhpcy5fX2luY2x1ZGVzKSk7XG5cdH1cbn07XG5cbkluc3RhbGxEb3RzLnByb3RvdHlwZS5jb21waWxlQWxsID0gZnVuY3Rpb24oKSB7XG5cdGNvbnNvbGUubG9nKFwiQ29tcGlsaW5nIGFsbCBkb1QgdGVtcGxhdGVzLi4uXCIpO1xuXG5cdHZhciBkZWZGb2xkZXIgPSB0aGlzLl9fcGF0aCxcblx0XHRzb3VyY2VzID0gZnMucmVhZGRpclN5bmMoZGVmRm9sZGVyKSxcblx0XHRrLCBsLCBuYW1lO1xuXG5cdGZvciggayA9IDAsIGwgPSBzb3VyY2VzLmxlbmd0aDsgayA8IGw7IGsrKykge1xuXHRcdG5hbWUgPSBzb3VyY2VzW2tdO1xuXHRcdGlmICgvXFwuZGVmKFxcLmRvdHxcXC5qc3QpPyQvLnRlc3QobmFtZSkpIHtcblx0XHRcdGNvbnNvbGUubG9nKFwiTG9hZGVkIGRlZiBcIiArIG5hbWUpO1xuXHRcdFx0dGhpcy5fX2luY2x1ZGVzW25hbWUuc3Vic3RyaW5nKDAsIG5hbWUuaW5kZXhPZignLicpKV0gPSByZWFkZGF0YShkZWZGb2xkZXIgKyBuYW1lKTtcblx0XHR9XG5cdH1cblxuXHRmb3IoIGsgPSAwLCBsID0gc291cmNlcy5sZW5ndGg7IGsgPCBsOyBrKyspIHtcblx0XHRuYW1lID0gc291cmNlc1trXTtcblx0XHRpZiAoL1xcLmRvdChcXC5kZWZ8XFwuanN0KT8kLy50ZXN0KG5hbWUpKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhcIkNvbXBpbGluZyBcIiArIG5hbWUgKyBcIiB0byBmdW5jdGlvblwiKTtcblx0XHRcdHRoaXMuX19yZW5kZXJtb2R1bGVbbmFtZS5zdWJzdHJpbmcoMCwgbmFtZS5pbmRleE9mKCcuJykpXSA9IHRoaXMuY29tcGlsZVBhdGgoZGVmRm9sZGVyICsgbmFtZSk7XG5cdFx0fVxuXHRcdGlmICgvXFwuanN0KFxcLmRvdHxcXC5kZWYpPyQvLnRlc3QobmFtZSkpIHtcblx0XHRcdGNvbnNvbGUubG9nKFwiQ29tcGlsaW5nIFwiICsgbmFtZSArIFwiIHRvIGZpbGVcIik7XG5cdFx0XHR0aGlzLmNvbXBpbGVUb0ZpbGUodGhpcy5fX2Rlc3RpbmF0aW9uICsgbmFtZS5zdWJzdHJpbmcoMCwgbmFtZS5pbmRleE9mKCcuJykpICsgJy5qcycsXG5cdFx0XHRcdFx0cmVhZGRhdGEoZGVmRm9sZGVyICsgbmFtZSkpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdGhpcy5fX3JlbmRlcm1vZHVsZTtcbn07XG4iLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xuLyogZ2xvYmFsIHdpbmRvdzogZmFsc2UgKi9cbi8qIGdsb2JhbCBkb2N1bWVudDogZmFsc2UgKi9cbid1c2Ugc3RyaWN0JztcblxuLy8gbGlzdCBwcmVmaXhlcyBhbmQgY2FzZSB0cmFuc2Zvcm1zXG4vLyAocmV2ZXJzZSBvcmRlciBhcyBhIGRlY3JlbWVudGluZyBmb3IgbG9vcCBpcyB1c2VkKVxudmFyIHByZWZpeGVzID0gW1xuICAnbXMnLFxuICAnbXMnLCAvLyBpbnRlbnRpb25hbDogMm5kIGVudHJ5IGZvciBtcyBhcyB3ZSB3aWxsIGFsc28gdHJ5IFBhc2NhbCBjYXNlIGZvciBNU1xuICAnTycsXG4gICdNb3onLFxuICAnV2Via2l0JyxcbiAgJydcbl07XG5cbnZhciBjYXNlVHJhbnNmb3JtcyA9IFtcbiAgdG9DYW1lbENhc2UsXG4gIG51bGwsXG4gIG51bGwsXG4gIHRvQ2FtZWxDYXNlLFxuICBudWxsLFxuICB0b0NhbWVsQ2FzZVxuXTtcblxudmFyIHByb3BzID0ge307XG52YXIgc3R5bGU7XG5cbi8qKlxuICAjIyMgY3NzKHByb3ApXG5cbiAgVGVzdCBmb3IgdGhlIHByZXNjZW5jZSBvZiB0aGUgc3BlY2lmaWVkIENTUyBwcm9wZXJ0eSAoaW4gYWxsIGl0J3NcbiAgcG9zc2libGUgYnJvd3NlciBwcmVmaXhlZCB2YXJpYW50cykuICBUaGUgcmV0dXJuZWQgZnVuY3Rpb24gKGlmIHdlXG4gIGFyZSBhYmxlIHRvIGFjY2VzcyB0aGUgcmVxdWlyZWQgc3R5bGUgcHJvcGVydHkpIGlzIGJvdGggYSBnZXR0ZXIgYW5kXG4gIHNldHRlciBmdW5jdGlvbiBmb3Igd2hlbiBnaXZlbiBhbiBlbGVtZW50LlxuXG4gIENvbnNpZGVyIHRoZSBmb2xsb3dpbmcgZXhhbXBsZSwgd2l0aCByZWdhcmRzIHRvIENTUyB0cmFuc2Zvcm1zOlxuXG4gIDw8PCBleGFtcGxlcy90cmFuc2Zvcm0uanNcblxuKiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHByb3ApIHtcbiAgdmFyIGlpO1xuICB2YXIgcHJvcE5hbWU7XG4gIHZhciBwYXNjYWxDYXNlTmFtZTtcblxuICBzdHlsZSA9IHN0eWxlIHx8IGRvY3VtZW50LmJvZHkuc3R5bGU7XG5cbiAgLy8gaWYgd2UgYWxyZWFkeSBoYXZlIGEgdmFsdWUgZm9yIHRoZSB0YXJnZXQgcHJvcGVydHksIHJldHVyblxuICBpZiAocHJvcHNbcHJvcF0gfHwgc3R5bGVbcHJvcF0pIHtcbiAgICByZXR1cm4gcHJvcHNbcHJvcF07XG4gIH1cblxuICAvLyBjb252ZXJ0IGEgZGFzaCBkZWxpbWl0ZWQgcHJvcGVydHluYW1lIChlLmcuIGJveC1zaGFkb3cpIGludG9cbiAgLy8gcGFzY2FsIGNhc2VkIG5hbWUgKGUuZy4gQm94U2hhZG93KVxuICBwYXNjYWxDYXNlTmFtZSA9IHByb3Auc3BsaXQoJy0nKS5yZWR1Y2UoZnVuY3Rpb24obWVtbywgdmFsKSB7XG4gICAgcmV0dXJuIG1lbW8gKyB2YWwuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyB2YWwuc2xpY2UoMSk7XG4gIH0sICcnKTtcblxuICAvLyBjaGVjayBmb3IgdGhlIHByb3BlcnR5XG4gIGZvciAoaWkgPSBwcmVmaXhlcy5sZW5ndGg7IGlpLS07ICkge1xuICAgIHByb3BOYW1lID0gcHJlZml4ZXNbaWldICsgKGNhc2VUcmFuc2Zvcm1zW2lpXSA/XG4gICAgICAgICAgICAgICAgICBjYXNlVHJhbnNmb3Jtc1tpaV0ocGFzY2FsQ2FzZU5hbWUpIDpcbiAgICAgICAgICAgICAgICAgIHBhc2NhbENhc2VOYW1lKTtcblxuICAgIGlmICh0eXBlb2Ygc3R5bGVbcHJvcE5hbWVdICE9ICd1bmRlZmluZWQnKSB7XG4gICAgICBwcm9wc1twcm9wXSA9IGNyZWF0ZUdldHRlclNldHRlcihwcm9wTmFtZSk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcHJvcHNbcHJvcF07XG59O1xuXG4vKiBpbnRlcm5hbCBoZWxwZXIgZnVuY3Rpb25zICovXG5cbmZ1bmN0aW9uIGNyZWF0ZUdldHRlclNldHRlcihwcm9wTmFtZSkge1xuICBmdW5jdGlvbiBncyhlbGVtZW50LCB2YWx1ZSkge1xuICAgIC8vIGlmIHdlIGhhdmUgYSB2YWx1ZSB1cGRhdGVcbiAgICBpZiAodHlwZW9mIHZhbHVlICE9ICd1bmRlZmluZWQnKSB7XG4gICAgICBlbGVtZW50LnN0eWxlW3Byb3BOYW1lXSA9IHZhbHVlO1xuICAgIH1cblxuICAgIHJldHVybiB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KVtwcm9wTmFtZV07XG4gIH1cblxuICAvLyBhdHRhY2ggdGhlIHByb3BlcnR5IG5hbWUgdG8gdGhlIGdldHRlciBhbmQgc2V0dGVyXG4gIGdzLnByb3BlcnR5ID0gcHJvcE5hbWU7XG4gIHJldHVybiBncztcbn1cblxuZnVuY3Rpb24gdG9DYW1lbENhc2UoaW5wdXQpIHtcbiAgcmV0dXJuIGlucHV0LmNoYXJBdCgwKS50b0xvd2VyQ2FzZSgpICsgaW5wdXQuc2xpY2UoMSk7XG59IiwidmFyIGluc2VydGVkID0ge307XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGNzcywgb3B0aW9ucykge1xuICAgIGlmIChpbnNlcnRlZFtjc3NdKSByZXR1cm47XG4gICAgaW5zZXJ0ZWRbY3NzXSA9IHRydWU7XG4gICAgXG4gICAgdmFyIGVsZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIGVsZW0uc2V0QXR0cmlidXRlKCd0eXBlJywgJ3RleHQvY3NzJyk7XG5cbiAgICBpZiAoJ3RleHRDb250ZW50JyBpbiBlbGVtKSB7XG4gICAgICBlbGVtLnRleHRDb250ZW50ID0gY3NzO1xuICAgIH0gZWxzZSB7XG4gICAgICBlbGVtLnN0eWxlU2hlZXQuY3NzVGV4dCA9IGNzcztcbiAgICB9XG4gICAgXG4gICAgdmFyIGhlYWQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaGVhZCcpWzBdO1xuICAgIGlmIChvcHRpb25zICYmIG9wdGlvbnMucHJlcGVuZCkge1xuICAgICAgICBoZWFkLmluc2VydEJlZm9yZShlbGVtLCBoZWFkLmNoaWxkTm9kZXNbMF0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGhlYWQuYXBwZW5kQ2hpbGQoZWxlbSk7XG4gICAgfVxufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xuICAgIHZhciBheGlzID0gb3B0aW9ucyA9PSAndmVydGljYWwnID8gJ1knIDogJ1gnLFxuICAgICAgc3RhcnRQb3NpdGlvbixcbiAgICAgIGRlbHRhO1xuXG4gICAgZGVjay5wYXJlbnQuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIGZ1bmN0aW9uKGUpIHtcbiAgICAgIGlmIChlLnRvdWNoZXMubGVuZ3RoID09IDEpIHtcbiAgICAgICAgc3RhcnRQb3NpdGlvbiA9IGUudG91Y2hlc1swXVsncGFnZScgKyBheGlzXTtcbiAgICAgICAgZGVsdGEgPSAwO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgZGVjay5wYXJlbnQuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2htb3ZlJywgZnVuY3Rpb24oZSkge1xuICAgICAgaWYgKGUudG91Y2hlcy5sZW5ndGggPT0gMSkge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGRlbHRhID0gZS50b3VjaGVzWzBdWydwYWdlJyArIGF4aXNdIC0gc3RhcnRQb3NpdGlvbjtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGRlY2sucGFyZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoZW5kJywgZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoTWF0aC5hYnMoZGVsdGEpID4gNTApIHtcbiAgICAgICAgZGVja1tkZWx0YSA+IDAgPyAncHJldicgOiAnbmV4dCddKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH07XG59O1xuIiwidmFyIGZyb20gPSBmdW5jdGlvbihzZWxlY3Rvck9yRWxlbWVudCwgcGx1Z2lucykge1xuICB2YXIgcGFyZW50ID0gc2VsZWN0b3JPckVsZW1lbnQubm9kZVR5cGUgPT09IDEgPyBzZWxlY3Rvck9yRWxlbWVudCA6IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3JPckVsZW1lbnQpLFxuICAgIHNsaWRlcyA9IFtdLmZpbHRlci5jYWxsKHBhcmVudC5jaGlsZHJlbiwgZnVuY3Rpb24oZWwpIHsgcmV0dXJuIGVsLm5vZGVOYW1lICE9PSAnU0NSSVBUJzsgfSksXG4gICAgYWN0aXZlU2xpZGUgPSBzbGlkZXNbMF0sXG4gICAgbGlzdGVuZXJzID0ge30sXG5cbiAgICBhY3RpdmF0ZSA9IGZ1bmN0aW9uKGluZGV4LCBjdXN0b21EYXRhKSB7XG4gICAgICBpZiAoIXNsaWRlc1tpbmRleF0pIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBmaXJlKCdkZWFjdGl2YXRlJywgY3JlYXRlRXZlbnREYXRhKGFjdGl2ZVNsaWRlLCBjdXN0b21EYXRhKSk7XG4gICAgICBhY3RpdmVTbGlkZSA9IHNsaWRlc1tpbmRleF07XG4gICAgICBmaXJlKCdhY3RpdmF0ZScsIGNyZWF0ZUV2ZW50RGF0YShhY3RpdmVTbGlkZSwgY3VzdG9tRGF0YSkpO1xuICAgIH0sXG5cbiAgICBzbGlkZSA9IGZ1bmN0aW9uKGluZGV4LCBjdXN0b21EYXRhKSB7XG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCkge1xuICAgICAgICBmaXJlKCdzbGlkZScsIGNyZWF0ZUV2ZW50RGF0YShzbGlkZXNbaW5kZXhdLCBjdXN0b21EYXRhKSkgJiYgYWN0aXZhdGUoaW5kZXgsIGN1c3RvbURhdGEpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHNsaWRlcy5pbmRleE9mKGFjdGl2ZVNsaWRlKTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgc3RlcCA9IGZ1bmN0aW9uKG9mZnNldCwgY3VzdG9tRGF0YSkge1xuICAgICAgdmFyIHNsaWRlSW5kZXggPSBzbGlkZXMuaW5kZXhPZihhY3RpdmVTbGlkZSkgKyBvZmZzZXQ7XG5cbiAgICAgIGZpcmUob2Zmc2V0ID4gMCA/ICduZXh0JyA6ICdwcmV2JywgY3JlYXRlRXZlbnREYXRhKGFjdGl2ZVNsaWRlLCBjdXN0b21EYXRhKSkgJiYgYWN0aXZhdGUoc2xpZGVJbmRleCwgY3VzdG9tRGF0YSk7XG4gICAgfSxcblxuICAgIG9uID0gZnVuY3Rpb24oZXZlbnROYW1lLCBjYWxsYmFjaykge1xuICAgICAgKGxpc3RlbmVyc1tldmVudE5hbWVdIHx8IChsaXN0ZW5lcnNbZXZlbnROYW1lXSA9IFtdKSkucHVzaChjYWxsYmFjayk7XG5cbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgbGlzdGVuZXJzW2V2ZW50TmFtZV0gPSBsaXN0ZW5lcnNbZXZlbnROYW1lXS5maWx0ZXIoZnVuY3Rpb24obGlzdGVuZXIpIHtcbiAgICAgICAgICByZXR1cm4gbGlzdGVuZXIgIT09IGNhbGxiYWNrO1xuICAgICAgICB9KTtcbiAgICAgIH07XG4gICAgfSxcblxuICAgIGZpcmUgPSBmdW5jdGlvbihldmVudE5hbWUsIGV2ZW50RGF0YSkge1xuICAgICAgcmV0dXJuIChsaXN0ZW5lcnNbZXZlbnROYW1lXSB8fCBbXSlcbiAgICAgICAgLnJlZHVjZShmdW5jdGlvbihub3RDYW5jZWxsZWQsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgcmV0dXJuIG5vdENhbmNlbGxlZCAmJiBjYWxsYmFjayhldmVudERhdGEpICE9PSBmYWxzZTtcbiAgICAgICAgfSwgdHJ1ZSk7XG4gICAgfSxcblxuICAgIGNyZWF0ZUV2ZW50RGF0YSA9IGZ1bmN0aW9uKGVsLCBldmVudERhdGEpIHtcbiAgICAgIGV2ZW50RGF0YSA9IGV2ZW50RGF0YSB8fCB7fTtcbiAgICAgIGV2ZW50RGF0YS5pbmRleCA9IHNsaWRlcy5pbmRleE9mKGVsKTtcbiAgICAgIGV2ZW50RGF0YS5zbGlkZSA9IGVsO1xuICAgICAgcmV0dXJuIGV2ZW50RGF0YTtcbiAgICB9LFxuXG4gICAgZGVjayA9IHtcbiAgICAgIG9uOiBvbixcbiAgICAgIGZpcmU6IGZpcmUsXG4gICAgICBzbGlkZTogc2xpZGUsXG4gICAgICBuZXh0OiBzdGVwLmJpbmQobnVsbCwgMSksXG4gICAgICBwcmV2OiBzdGVwLmJpbmQobnVsbCwgLTEpLFxuICAgICAgcGFyZW50OiBwYXJlbnQsXG4gICAgICBzbGlkZXM6IHNsaWRlc1xuICAgIH07XG5cbiAgKHBsdWdpbnMgfHwgW10pLmZvckVhY2goZnVuY3Rpb24ocGx1Z2luKSB7XG4gICAgcGx1Z2luKGRlY2spO1xuICB9KTtcblxuICBhY3RpdmF0ZSgwKTtcblxuICByZXR1cm4gZGVjaztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBmcm9tOiBmcm9tXG59O1xuIixudWxsLCIvLyBSZXF1aXJlIE5vZGUgbW9kdWxlcyBpbiB0aGUgYnJvd3NlciB0aGFua3MgdG8gQnJvd3NlcmlmeTogaHR0cDovL2Jyb3dzZXJpZnkub3JnXG52YXIgYmVzcG9rZSA9IHJlcXVpcmUoJ2Jlc3Bva2UnKSxcbiAgLy9jdWJlID0gcmVxdWlyZSgnYmVzcG9rZS10aGVtZS1jdWJlJyksXG4gIC8vdm9sdGFpcmUgPSByZXF1aXJlKCdiZXNwb2tlLXRoZW1lLXZvbHRhaXJlJyksXG4gIC8vdGVybWluYWwgPSByZXF1aXJlKCdiZXNwb2tlLXRoZW1lLXRlcm1pbmFsJyksXG4gIC8vZmFuY3kgPSByZXF1aXJlKCdiZXNwb2tlLXRoZW1lLWZhbmN5Jyk7XG4gIC8vc2ltcGxlU2xpZGUgPSByZXF1aXJlKCdiZXNwb2tlLXRoZW1lLXNpbXBsZS1zbGlkZScpO1xuICAvL21vemlsbGFTYW5kc3RvbmUgPSByZXF1aXJlKCdiZXNwb2tlLXRoZW1lLW1vemlsbGEtc2FuZHN0b25lJyk7XG4gIHR3ZWFrYWJsZSA9IHJlcXVpcmUoJ2Jlc3Bva2UtdGhlbWUtdHdlYWthYmxlJyk7XG4gIGtleXMgPSByZXF1aXJlKCdiZXNwb2tlLWtleXMnKSxcbiAgdG91Y2ggPSByZXF1aXJlKCdiZXNwb2tlLXRvdWNoJyksXG4gIGJ1bGxldHMgPSByZXF1aXJlKCdiZXNwb2tlLWJ1bGxldHMnKSxcbiAgYmFja2Ryb3AgPSByZXF1aXJlKCdiZXNwb2tlLWJhY2tkcm9wJyksXG4gIHNjYWxlID0gcmVxdWlyZSgnYmVzcG9rZS1zY2FsZScpLFxuICBoYXNoID0gcmVxdWlyZSgnYmVzcG9rZS1oYXNoJyksXG4gIHByb2dyZXNzID0gcmVxdWlyZSgnYmVzcG9rZS1wcm9ncmVzcycpLFxuICBmb3JtcyA9IHJlcXVpcmUoJ2Jlc3Bva2UtZm9ybXMnKTtcblxuLy8gQmVzcG9rZS5qc1xuYmVzcG9rZS5mcm9tKCdhcnRpY2xlJywgW1xuICAvL2N1YmUoKSxcbiAgLy92b2x0YWlyZSgpLFxuICAvL3Rlcm1pbmFsKCksXG4gIC8vZmFuY3koKSxcbiAgLy9zaW1wbGVTbGlkZSgpLFxuICAvL21vemlsbGFTYW5kc3RvbmUoKSxcbiAgdHdlYWthYmxlKCksXG4gIGtleXMoKSxcbiAgdG91Y2goKSxcbiAgYnVsbGV0cygnbGksIC5idWxsZXQnKSxcbiAgYmFja2Ryb3AoKSxcbiAgc2NhbGUoKSxcbiAgaGFzaCgpLFxuICBwcm9ncmVzcygpLFxuICBmb3JtcygpXG5dKTtcblxuLy8gUHJpc20gc3ludGF4IGhpZ2hsaWdodGluZ1xuLy8gVGhpcyBpcyBhY3R1YWxseSBsb2FkZWQgZnJvbSBcImJvd2VyX2NvbXBvbmVudHNcIiB0aGFua3MgdG9cbi8vIGRlYm93ZXJpZnk6IGh0dHBzOi8vZ2l0aHViLmNvbS9ldWdlbmV3YXJlL2RlYm93ZXJpZnlcbnJlcXVpcmUoXCIuLy4uLy4uL2Jvd2VyX2NvbXBvbmVudHMvcHJpc20vcHJpc20uanNcIik7XG5cbiJdfQ==
=======
},{"./..\\..\\bower_components\\prism\\prism.js":1,"bespoke":16,"bespoke-backdrop":2,"bespoke-bullets":3,"bespoke-forms":4,"bespoke-hash":5,"bespoke-keys":6,"bespoke-progress":7,"bespoke-scale":8,"bespoke-theme-tweakable":9,"bespoke-touch":15}]},{},[18])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxjbG9uZS1hZ2FpblxcQ2xvdWRfQ29tcHV0aW5nXFxub2RlX21vZHVsZXNcXGd1bHAtYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJyb3dzZXItcGFja1xcX3ByZWx1ZGUuanMiLCJDOi9jbG9uZS1hZ2Fpbi9DbG91ZF9Db21wdXRpbmcvYm93ZXJfY29tcG9uZW50cy9wcmlzbS9wcmlzbS5qcyIsIkM6L2Nsb25lLWFnYWluL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS1iYWNrZHJvcC9saWIvYmVzcG9rZS1iYWNrZHJvcC5qcyIsIkM6L2Nsb25lLWFnYWluL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS1idWxsZXRzL2xpYi9iZXNwb2tlLWJ1bGxldHMuanMiLCJDOi9jbG9uZS1hZ2Fpbi9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtZm9ybXMvbGliL2Jlc3Bva2UtZm9ybXMuanMiLCJDOi9jbG9uZS1hZ2Fpbi9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtaGFzaC9saWIvYmVzcG9rZS1oYXNoLmpzIiwiQzovY2xvbmUtYWdhaW4vQ2xvdWRfQ29tcHV0aW5nL25vZGVfbW9kdWxlcy9iZXNwb2tlLWtleXMvbGliL2Jlc3Bva2Uta2V5cy5qcyIsIkM6L2Nsb25lLWFnYWluL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS1wcm9ncmVzcy9saWIvYmVzcG9rZS1wcm9ncmVzcy5qcyIsIkM6L2Nsb25lLWFnYWluL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS1zY2FsZS9saWIvYmVzcG9rZS1zY2FsZS5qcyIsIkM6L2Nsb25lLWFnYWluL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS10aGVtZS10d2Vha2FibGUvaW5kZXguanMiLCJDOi9jbG9uZS1hZ2Fpbi9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtdGhlbWUtdHdlYWthYmxlL25vZGVfbW9kdWxlcy9iZXNwb2tlLWNsYXNzZXMvbGliL2Jlc3Bva2UtY2xhc3Nlcy5qcyIsIkM6L2Nsb25lLWFnYWluL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS10aGVtZS10d2Vha2FibGUvbm9kZV9tb2R1bGVzL2RvdC9kb1QuanMiLCJDOi9jbG9uZS1hZ2Fpbi9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtdGhlbWUtdHdlYWthYmxlL25vZGVfbW9kdWxlcy9kb3QvaW5kZXguanMiLCJDOi9jbG9uZS1hZ2Fpbi9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtdGhlbWUtdHdlYWthYmxlL25vZGVfbW9kdWxlcy9mZWF0dXJlL2Nzcy5qcyIsIkM6L2Nsb25lLWFnYWluL0Nsb3VkX0NvbXB1dGluZy9ub2RlX21vZHVsZXMvYmVzcG9rZS10aGVtZS10d2Vha2FibGUvbm9kZV9tb2R1bGVzL2luc2VydC1jc3MvaW5kZXguanMiLCJDOi9jbG9uZS1hZ2Fpbi9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtdG91Y2gvbGliL2Jlc3Bva2UtdG91Y2guanMiLCJDOi9jbG9uZS1hZ2Fpbi9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2Jlc3Bva2UvbGliL2Jlc3Bva2UuanMiLCJDOi9jbG9uZS1hZ2Fpbi9DbG91ZF9Db21wdXRpbmcvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwiQzovY2xvbmUtYWdhaW4vQ2xvdWRfQ29tcHV0aW5nL3NyYy9zY3JpcHRzL2Zha2VfZGViMDE4MDUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNocUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0lBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1RUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXHJcbi8qICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICAgICBCZWdpbiBwcmlzbS1jb3JlLmpzXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiogKi9cclxuXHJcbnNlbGYgPSAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpXHJcblx0PyB3aW5kb3cgICAvLyBpZiBpbiBicm93c2VyXHJcblx0OiAoXHJcblx0XHQodHlwZW9mIFdvcmtlckdsb2JhbFNjb3BlICE9PSAndW5kZWZpbmVkJyAmJiBzZWxmIGluc3RhbmNlb2YgV29ya2VyR2xvYmFsU2NvcGUpXHJcblx0XHQ/IHNlbGYgLy8gaWYgaW4gd29ya2VyXHJcblx0XHQ6IHt9ICAgLy8gaWYgaW4gbm9kZSBqc1xyXG5cdCk7XHJcblxyXG4vKipcclxuICogUHJpc206IExpZ2h0d2VpZ2h0LCByb2J1c3QsIGVsZWdhbnQgc3ludGF4IGhpZ2hsaWdodGluZ1xyXG4gKiBNSVQgbGljZW5zZSBodHRwOi8vd3d3Lm9wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL21pdC1saWNlbnNlLnBocC9cclxuICogQGF1dGhvciBMZWEgVmVyb3UgaHR0cDovL2xlYS52ZXJvdS5tZVxyXG4gKi9cclxuXHJcbnZhciBQcmlzbSA9IChmdW5jdGlvbigpe1xyXG5cclxuLy8gUHJpdmF0ZSBoZWxwZXIgdmFyc1xyXG52YXIgbGFuZyA9IC9cXGJsYW5nKD86dWFnZSk/LSg/IVxcKikoXFx3KylcXGIvaTtcclxuXHJcbnZhciBfID0gc2VsZi5QcmlzbSA9IHtcclxuXHR1dGlsOiB7XHJcblx0XHRlbmNvZGU6IGZ1bmN0aW9uICh0b2tlbnMpIHtcclxuXHRcdFx0aWYgKHRva2VucyBpbnN0YW5jZW9mIFRva2VuKSB7XHJcblx0XHRcdFx0cmV0dXJuIG5ldyBUb2tlbih0b2tlbnMudHlwZSwgXy51dGlsLmVuY29kZSh0b2tlbnMuY29udGVudCksIHRva2Vucy5hbGlhcyk7XHJcblx0XHRcdH0gZWxzZSBpZiAoXy51dGlsLnR5cGUodG9rZW5zKSA9PT0gJ0FycmF5Jykge1xyXG5cdFx0XHRcdHJldHVybiB0b2tlbnMubWFwKF8udXRpbC5lbmNvZGUpO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdHJldHVybiB0b2tlbnMucmVwbGFjZSgvJi9nLCAnJmFtcDsnKS5yZXBsYWNlKC88L2csICcmbHQ7JykucmVwbGFjZSgvXFx1MDBhMC9nLCAnICcpO1xyXG5cdFx0XHR9XHJcblx0XHR9LFxyXG5cclxuXHRcdHR5cGU6IGZ1bmN0aW9uIChvKSB7XHJcblx0XHRcdHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobykubWF0Y2goL1xcW29iamVjdCAoXFx3KylcXF0vKVsxXTtcclxuXHRcdH0sXHJcblxyXG5cdFx0Ly8gRGVlcCBjbG9uZSBhIGxhbmd1YWdlIGRlZmluaXRpb24gKGUuZy4gdG8gZXh0ZW5kIGl0KVxyXG5cdFx0Y2xvbmU6IGZ1bmN0aW9uIChvKSB7XHJcblx0XHRcdHZhciB0eXBlID0gXy51dGlsLnR5cGUobyk7XHJcblxyXG5cdFx0XHRzd2l0Y2ggKHR5cGUpIHtcclxuXHRcdFx0XHRjYXNlICdPYmplY3QnOlxyXG5cdFx0XHRcdFx0dmFyIGNsb25lID0ge307XHJcblxyXG5cdFx0XHRcdFx0Zm9yICh2YXIga2V5IGluIG8pIHtcclxuXHRcdFx0XHRcdFx0aWYgKG8uaGFzT3duUHJvcGVydHkoa2V5KSkge1xyXG5cdFx0XHRcdFx0XHRcdGNsb25lW2tleV0gPSBfLnV0aWwuY2xvbmUob1trZXldKTtcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRcdHJldHVybiBjbG9uZTtcclxuXHJcblx0XHRcdFx0Y2FzZSAnQXJyYXknOlxyXG5cdFx0XHRcdFx0cmV0dXJuIG8ubWFwKGZ1bmN0aW9uKHYpIHsgcmV0dXJuIF8udXRpbC5jbG9uZSh2KTsgfSk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdHJldHVybiBvO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGxhbmd1YWdlczoge1xyXG5cdFx0ZXh0ZW5kOiBmdW5jdGlvbiAoaWQsIHJlZGVmKSB7XHJcblx0XHRcdHZhciBsYW5nID0gXy51dGlsLmNsb25lKF8ubGFuZ3VhZ2VzW2lkXSk7XHJcblxyXG5cdFx0XHRmb3IgKHZhciBrZXkgaW4gcmVkZWYpIHtcclxuXHRcdFx0XHRsYW5nW2tleV0gPSByZWRlZltrZXldO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRyZXR1cm4gbGFuZztcclxuXHRcdH0sXHJcblxyXG5cdFx0LyoqXHJcblx0XHQgKiBJbnNlcnQgYSB0b2tlbiBiZWZvcmUgYW5vdGhlciB0b2tlbiBpbiBhIGxhbmd1YWdlIGxpdGVyYWxcclxuXHRcdCAqIEFzIHRoaXMgbmVlZHMgdG8gcmVjcmVhdGUgdGhlIG9iamVjdCAod2UgY2Fubm90IGFjdHVhbGx5IGluc2VydCBiZWZvcmUga2V5cyBpbiBvYmplY3QgbGl0ZXJhbHMpLFxyXG5cdFx0ICogd2UgY2Fubm90IGp1c3QgcHJvdmlkZSBhbiBvYmplY3QsIHdlIG5lZWQgYW5vYmplY3QgYW5kIGEga2V5LlxyXG5cdFx0ICogQHBhcmFtIGluc2lkZSBUaGUga2V5IChvciBsYW5ndWFnZSBpZCkgb2YgdGhlIHBhcmVudFxyXG5cdFx0ICogQHBhcmFtIGJlZm9yZSBUaGUga2V5IHRvIGluc2VydCBiZWZvcmUuIElmIG5vdCBwcm92aWRlZCwgdGhlIGZ1bmN0aW9uIGFwcGVuZHMgaW5zdGVhZC5cclxuXHRcdCAqIEBwYXJhbSBpbnNlcnQgT2JqZWN0IHdpdGggdGhlIGtleS92YWx1ZSBwYWlycyB0byBpbnNlcnRcclxuXHRcdCAqIEBwYXJhbSByb290IFRoZSBvYmplY3QgdGhhdCBjb250YWlucyBgaW5zaWRlYC4gSWYgZXF1YWwgdG8gUHJpc20ubGFuZ3VhZ2VzLCBpdCBjYW4gYmUgb21pdHRlZC5cclxuXHRcdCAqL1xyXG5cdFx0aW5zZXJ0QmVmb3JlOiBmdW5jdGlvbiAoaW5zaWRlLCBiZWZvcmUsIGluc2VydCwgcm9vdCkge1xyXG5cdFx0XHRyb290ID0gcm9vdCB8fCBfLmxhbmd1YWdlcztcclxuXHRcdFx0dmFyIGdyYW1tYXIgPSByb290W2luc2lkZV07XHJcblx0XHRcdFxyXG5cdFx0XHRpZiAoYXJndW1lbnRzLmxlbmd0aCA9PSAyKSB7XHJcblx0XHRcdFx0aW5zZXJ0ID0gYXJndW1lbnRzWzFdO1xyXG5cdFx0XHRcdFxyXG5cdFx0XHRcdGZvciAodmFyIG5ld1Rva2VuIGluIGluc2VydCkge1xyXG5cdFx0XHRcdFx0aWYgKGluc2VydC5oYXNPd25Qcm9wZXJ0eShuZXdUb2tlbikpIHtcclxuXHRcdFx0XHRcdFx0Z3JhbW1hcltuZXdUb2tlbl0gPSBpbnNlcnRbbmV3VG9rZW5dO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRcclxuXHRcdFx0XHRyZXR1cm4gZ3JhbW1hcjtcclxuXHRcdFx0fVxyXG5cdFx0XHRcclxuXHRcdFx0dmFyIHJldCA9IHt9O1xyXG5cclxuXHRcdFx0Zm9yICh2YXIgdG9rZW4gaW4gZ3JhbW1hcikge1xyXG5cclxuXHRcdFx0XHRpZiAoZ3JhbW1hci5oYXNPd25Qcm9wZXJ0eSh0b2tlbikpIHtcclxuXHJcblx0XHRcdFx0XHRpZiAodG9rZW4gPT0gYmVmb3JlKSB7XHJcblxyXG5cdFx0XHRcdFx0XHRmb3IgKHZhciBuZXdUb2tlbiBpbiBpbnNlcnQpIHtcclxuXHJcblx0XHRcdFx0XHRcdFx0aWYgKGluc2VydC5oYXNPd25Qcm9wZXJ0eShuZXdUb2tlbikpIHtcclxuXHRcdFx0XHRcdFx0XHRcdHJldFtuZXdUb2tlbl0gPSBpbnNlcnRbbmV3VG9rZW5dO1xyXG5cdFx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRcdHJldFt0b2tlbl0gPSBncmFtbWFyW3Rva2VuXTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdFx0XHJcblx0XHRcdC8vIFVwZGF0ZSByZWZlcmVuY2VzIGluIG90aGVyIGxhbmd1YWdlIGRlZmluaXRpb25zXHJcblx0XHRcdF8ubGFuZ3VhZ2VzLkRGUyhfLmxhbmd1YWdlcywgZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xyXG5cdFx0XHRcdGlmICh2YWx1ZSA9PT0gcm9vdFtpbnNpZGVdICYmIGtleSAhPSBpbnNpZGUpIHtcclxuXHRcdFx0XHRcdHRoaXNba2V5XSA9IHJldDtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH0pO1xyXG5cclxuXHRcdFx0cmV0dXJuIHJvb3RbaW5zaWRlXSA9IHJldDtcclxuXHRcdH0sXHJcblxyXG5cdFx0Ly8gVHJhdmVyc2UgYSBsYW5ndWFnZSBkZWZpbml0aW9uIHdpdGggRGVwdGggRmlyc3QgU2VhcmNoXHJcblx0XHRERlM6IGZ1bmN0aW9uKG8sIGNhbGxiYWNrLCB0eXBlKSB7XHJcblx0XHRcdGZvciAodmFyIGkgaW4gbykge1xyXG5cdFx0XHRcdGlmIChvLmhhc093blByb3BlcnR5KGkpKSB7XHJcblx0XHRcdFx0XHRjYWxsYmFjay5jYWxsKG8sIGksIG9baV0sIHR5cGUgfHwgaSk7XHJcblxyXG5cdFx0XHRcdFx0aWYgKF8udXRpbC50eXBlKG9baV0pID09PSAnT2JqZWN0Jykge1xyXG5cdFx0XHRcdFx0XHRfLmxhbmd1YWdlcy5ERlMob1tpXSwgY2FsbGJhY2spO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0ZWxzZSBpZiAoXy51dGlsLnR5cGUob1tpXSkgPT09ICdBcnJheScpIHtcclxuXHRcdFx0XHRcdFx0Xy5sYW5ndWFnZXMuREZTKG9baV0sIGNhbGxiYWNrLCBpKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRoaWdobGlnaHRBbGw6IGZ1bmN0aW9uKGFzeW5jLCBjYWxsYmFjaykge1xyXG5cdFx0dmFyIGVsZW1lbnRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnY29kZVtjbGFzcyo9XCJsYW5ndWFnZS1cIl0sIFtjbGFzcyo9XCJsYW5ndWFnZS1cIl0gY29kZSwgY29kZVtjbGFzcyo9XCJsYW5nLVwiXSwgW2NsYXNzKj1cImxhbmctXCJdIGNvZGUnKTtcclxuXHJcblx0XHRmb3IgKHZhciBpPTAsIGVsZW1lbnQ7IGVsZW1lbnQgPSBlbGVtZW50c1tpKytdOykge1xyXG5cdFx0XHRfLmhpZ2hsaWdodEVsZW1lbnQoZWxlbWVudCwgYXN5bmMgPT09IHRydWUsIGNhbGxiYWNrKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRoaWdobGlnaHRFbGVtZW50OiBmdW5jdGlvbihlbGVtZW50LCBhc3luYywgY2FsbGJhY2spIHtcclxuXHRcdC8vIEZpbmQgbGFuZ3VhZ2VcclxuXHRcdHZhciBsYW5ndWFnZSwgZ3JhbW1hciwgcGFyZW50ID0gZWxlbWVudDtcclxuXHJcblx0XHR3aGlsZSAocGFyZW50ICYmICFsYW5nLnRlc3QocGFyZW50LmNsYXNzTmFtZSkpIHtcclxuXHRcdFx0cGFyZW50ID0gcGFyZW50LnBhcmVudE5vZGU7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKHBhcmVudCkge1xyXG5cdFx0XHRsYW5ndWFnZSA9IChwYXJlbnQuY2xhc3NOYW1lLm1hdGNoKGxhbmcpIHx8IFssJyddKVsxXTtcclxuXHRcdFx0Z3JhbW1hciA9IF8ubGFuZ3VhZ2VzW2xhbmd1YWdlXTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoIWdyYW1tYXIpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdC8vIFNldCBsYW5ndWFnZSBvbiB0aGUgZWxlbWVudCwgaWYgbm90IHByZXNlbnRcclxuXHRcdGVsZW1lbnQuY2xhc3NOYW1lID0gZWxlbWVudC5jbGFzc05hbWUucmVwbGFjZShsYW5nLCAnJykucmVwbGFjZSgvXFxzKy9nLCAnICcpICsgJyBsYW5ndWFnZS0nICsgbGFuZ3VhZ2U7XHJcblxyXG5cdFx0Ly8gU2V0IGxhbmd1YWdlIG9uIHRoZSBwYXJlbnQsIGZvciBzdHlsaW5nXHJcblx0XHRwYXJlbnQgPSBlbGVtZW50LnBhcmVudE5vZGU7XHJcblxyXG5cdFx0aWYgKC9wcmUvaS50ZXN0KHBhcmVudC5ub2RlTmFtZSkpIHtcclxuXHRcdFx0cGFyZW50LmNsYXNzTmFtZSA9IHBhcmVudC5jbGFzc05hbWUucmVwbGFjZShsYW5nLCAnJykucmVwbGFjZSgvXFxzKy9nLCAnICcpICsgJyBsYW5ndWFnZS0nICsgbGFuZ3VhZ2U7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIGNvZGUgPSBlbGVtZW50LnRleHRDb250ZW50O1xyXG5cclxuXHRcdGlmKCFjb2RlKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHRjb2RlID0gY29kZS5yZXBsYWNlKC9eKD86XFxyP1xcbnxcXHIpLywnJyk7XHJcblxyXG5cdFx0dmFyIGVudiA9IHtcclxuXHRcdFx0ZWxlbWVudDogZWxlbWVudCxcclxuXHRcdFx0bGFuZ3VhZ2U6IGxhbmd1YWdlLFxyXG5cdFx0XHRncmFtbWFyOiBncmFtbWFyLFxyXG5cdFx0XHRjb2RlOiBjb2RlXHJcblx0XHR9O1xyXG5cclxuXHRcdF8uaG9va3MucnVuKCdiZWZvcmUtaGlnaGxpZ2h0JywgZW52KTtcclxuXHJcblx0XHRpZiAoYXN5bmMgJiYgc2VsZi5Xb3JrZXIpIHtcclxuXHRcdFx0dmFyIHdvcmtlciA9IG5ldyBXb3JrZXIoXy5maWxlbmFtZSk7XHJcblxyXG5cdFx0XHR3b3JrZXIub25tZXNzYWdlID0gZnVuY3Rpb24oZXZ0KSB7XHJcblx0XHRcdFx0ZW52LmhpZ2hsaWdodGVkQ29kZSA9IFRva2VuLnN0cmluZ2lmeShKU09OLnBhcnNlKGV2dC5kYXRhKSwgbGFuZ3VhZ2UpO1xyXG5cclxuXHRcdFx0XHRfLmhvb2tzLnJ1bignYmVmb3JlLWluc2VydCcsIGVudik7XHJcblxyXG5cdFx0XHRcdGVudi5lbGVtZW50LmlubmVySFRNTCA9IGVudi5oaWdobGlnaHRlZENvZGU7XHJcblxyXG5cdFx0XHRcdGNhbGxiYWNrICYmIGNhbGxiYWNrLmNhbGwoZW52LmVsZW1lbnQpO1xyXG5cdFx0XHRcdF8uaG9va3MucnVuKCdhZnRlci1oaWdobGlnaHQnLCBlbnYpO1xyXG5cdFx0XHR9O1xyXG5cclxuXHRcdFx0d29ya2VyLnBvc3RNZXNzYWdlKEpTT04uc3RyaW5naWZ5KHtcclxuXHRcdFx0XHRsYW5ndWFnZTogZW52Lmxhbmd1YWdlLFxyXG5cdFx0XHRcdGNvZGU6IGVudi5jb2RlXHJcblx0XHRcdH0pKTtcclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHRlbnYuaGlnaGxpZ2h0ZWRDb2RlID0gXy5oaWdobGlnaHQoZW52LmNvZGUsIGVudi5ncmFtbWFyLCBlbnYubGFuZ3VhZ2UpO1xyXG5cclxuXHRcdFx0Xy5ob29rcy5ydW4oJ2JlZm9yZS1pbnNlcnQnLCBlbnYpO1xyXG5cclxuXHRcdFx0ZW52LmVsZW1lbnQuaW5uZXJIVE1MID0gZW52LmhpZ2hsaWdodGVkQ29kZTtcclxuXHJcblx0XHRcdGNhbGxiYWNrICYmIGNhbGxiYWNrLmNhbGwoZWxlbWVudCk7XHJcblxyXG5cdFx0XHRfLmhvb2tzLnJ1bignYWZ0ZXItaGlnaGxpZ2h0JywgZW52KTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRoaWdobGlnaHQ6IGZ1bmN0aW9uICh0ZXh0LCBncmFtbWFyLCBsYW5ndWFnZSkge1xyXG5cdFx0dmFyIHRva2VucyA9IF8udG9rZW5pemUodGV4dCwgZ3JhbW1hcik7XHJcblx0XHRyZXR1cm4gVG9rZW4uc3RyaW5naWZ5KF8udXRpbC5lbmNvZGUodG9rZW5zKSwgbGFuZ3VhZ2UpO1xyXG5cdH0sXHJcblxyXG5cdHRva2VuaXplOiBmdW5jdGlvbih0ZXh0LCBncmFtbWFyLCBsYW5ndWFnZSkge1xyXG5cdFx0dmFyIFRva2VuID0gXy5Ub2tlbjtcclxuXHJcblx0XHR2YXIgc3RyYXJyID0gW3RleHRdO1xyXG5cclxuXHRcdHZhciByZXN0ID0gZ3JhbW1hci5yZXN0O1xyXG5cclxuXHRcdGlmIChyZXN0KSB7XHJcblx0XHRcdGZvciAodmFyIHRva2VuIGluIHJlc3QpIHtcclxuXHRcdFx0XHRncmFtbWFyW3Rva2VuXSA9IHJlc3RbdG9rZW5dO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRkZWxldGUgZ3JhbW1hci5yZXN0O1xyXG5cdFx0fVxyXG5cclxuXHRcdHRva2VubG9vcDogZm9yICh2YXIgdG9rZW4gaW4gZ3JhbW1hcikge1xyXG5cdFx0XHRpZighZ3JhbW1hci5oYXNPd25Qcm9wZXJ0eSh0b2tlbikgfHwgIWdyYW1tYXJbdG9rZW5dKSB7XHJcblx0XHRcdFx0Y29udGludWU7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdHZhciBwYXR0ZXJucyA9IGdyYW1tYXJbdG9rZW5dO1xyXG5cdFx0XHRwYXR0ZXJucyA9IChfLnV0aWwudHlwZShwYXR0ZXJucykgPT09IFwiQXJyYXlcIikgPyBwYXR0ZXJucyA6IFtwYXR0ZXJuc107XHJcblxyXG5cdFx0XHRmb3IgKHZhciBqID0gMDsgaiA8IHBhdHRlcm5zLmxlbmd0aDsgKytqKSB7XHJcblx0XHRcdFx0dmFyIHBhdHRlcm4gPSBwYXR0ZXJuc1tqXSxcclxuXHRcdFx0XHRcdGluc2lkZSA9IHBhdHRlcm4uaW5zaWRlLFxyXG5cdFx0XHRcdFx0bG9va2JlaGluZCA9ICEhcGF0dGVybi5sb29rYmVoaW5kLFxyXG5cdFx0XHRcdFx0bG9va2JlaGluZExlbmd0aCA9IDAsXHJcblx0XHRcdFx0XHRhbGlhcyA9IHBhdHRlcm4uYWxpYXM7XHJcblxyXG5cdFx0XHRcdHBhdHRlcm4gPSBwYXR0ZXJuLnBhdHRlcm4gfHwgcGF0dGVybjtcclxuXHJcblx0XHRcdFx0Zm9yICh2YXIgaT0wOyBpPHN0cmFyci5sZW5ndGg7IGkrKykgeyAvLyBEb27igJl0IGNhY2hlIGxlbmd0aCBhcyBpdCBjaGFuZ2VzIGR1cmluZyB0aGUgbG9vcFxyXG5cclxuXHRcdFx0XHRcdHZhciBzdHIgPSBzdHJhcnJbaV07XHJcblxyXG5cdFx0XHRcdFx0aWYgKHN0cmFyci5sZW5ndGggPiB0ZXh0Lmxlbmd0aCkge1xyXG5cdFx0XHRcdFx0XHQvLyBTb21ldGhpbmcgd2VudCB0ZXJyaWJseSB3cm9uZywgQUJPUlQsIEFCT1JUIVxyXG5cdFx0XHRcdFx0XHRicmVhayB0b2tlbmxvb3A7XHJcblx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdFx0aWYgKHN0ciBpbnN0YW5jZW9mIFRva2VuKSB7XHJcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xyXG5cdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRcdHBhdHRlcm4ubGFzdEluZGV4ID0gMDtcclxuXHJcblx0XHRcdFx0XHR2YXIgbWF0Y2ggPSBwYXR0ZXJuLmV4ZWMoc3RyKTtcclxuXHJcblx0XHRcdFx0XHRpZiAobWF0Y2gpIHtcclxuXHRcdFx0XHRcdFx0aWYobG9va2JlaGluZCkge1xyXG5cdFx0XHRcdFx0XHRcdGxvb2tiZWhpbmRMZW5ndGggPSBtYXRjaFsxXS5sZW5ndGg7XHJcblx0XHRcdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0XHRcdHZhciBmcm9tID0gbWF0Y2guaW5kZXggLSAxICsgbG9va2JlaGluZExlbmd0aCxcclxuXHRcdFx0XHRcdFx0XHRtYXRjaCA9IG1hdGNoWzBdLnNsaWNlKGxvb2tiZWhpbmRMZW5ndGgpLFxyXG5cdFx0XHRcdFx0XHRcdGxlbiA9IG1hdGNoLmxlbmd0aCxcclxuXHRcdFx0XHRcdFx0XHR0byA9IGZyb20gKyBsZW4sXHJcblx0XHRcdFx0XHRcdFx0YmVmb3JlID0gc3RyLnNsaWNlKDAsIGZyb20gKyAxKSxcclxuXHRcdFx0XHRcdFx0XHRhZnRlciA9IHN0ci5zbGljZSh0byArIDEpO1xyXG5cclxuXHRcdFx0XHRcdFx0dmFyIGFyZ3MgPSBbaSwgMV07XHJcblxyXG5cdFx0XHRcdFx0XHRpZiAoYmVmb3JlKSB7XHJcblx0XHRcdFx0XHRcdFx0YXJncy5wdXNoKGJlZm9yZSk7XHJcblx0XHRcdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0XHRcdHZhciB3cmFwcGVkID0gbmV3IFRva2VuKHRva2VuLCBpbnNpZGU/IF8udG9rZW5pemUobWF0Y2gsIGluc2lkZSkgOiBtYXRjaCwgYWxpYXMpO1xyXG5cclxuXHRcdFx0XHRcdFx0YXJncy5wdXNoKHdyYXBwZWQpO1xyXG5cclxuXHRcdFx0XHRcdFx0aWYgKGFmdGVyKSB7XHJcblx0XHRcdFx0XHRcdFx0YXJncy5wdXNoKGFmdGVyKTtcclxuXHRcdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRcdFx0QXJyYXkucHJvdG90eXBlLnNwbGljZS5hcHBseShzdHJhcnIsIGFyZ3MpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBzdHJhcnI7XHJcblx0fSxcclxuXHJcblx0aG9va3M6IHtcclxuXHRcdGFsbDoge30sXHJcblxyXG5cdFx0YWRkOiBmdW5jdGlvbiAobmFtZSwgY2FsbGJhY2spIHtcclxuXHRcdFx0dmFyIGhvb2tzID0gXy5ob29rcy5hbGw7XHJcblxyXG5cdFx0XHRob29rc1tuYW1lXSA9IGhvb2tzW25hbWVdIHx8IFtdO1xyXG5cclxuXHRcdFx0aG9va3NbbmFtZV0ucHVzaChjYWxsYmFjayk7XHJcblx0XHR9LFxyXG5cclxuXHRcdHJ1bjogZnVuY3Rpb24gKG5hbWUsIGVudikge1xyXG5cdFx0XHR2YXIgY2FsbGJhY2tzID0gXy5ob29rcy5hbGxbbmFtZV07XHJcblxyXG5cdFx0XHRpZiAoIWNhbGxiYWNrcyB8fCAhY2FsbGJhY2tzLmxlbmd0aCkge1xyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0Zm9yICh2YXIgaT0wLCBjYWxsYmFjazsgY2FsbGJhY2sgPSBjYWxsYmFja3NbaSsrXTspIHtcclxuXHRcdFx0XHRjYWxsYmFjayhlbnYpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fVxyXG59O1xyXG5cclxudmFyIFRva2VuID0gXy5Ub2tlbiA9IGZ1bmN0aW9uKHR5cGUsIGNvbnRlbnQsIGFsaWFzKSB7XHJcblx0dGhpcy50eXBlID0gdHlwZTtcclxuXHR0aGlzLmNvbnRlbnQgPSBjb250ZW50O1xyXG5cdHRoaXMuYWxpYXMgPSBhbGlhcztcclxufTtcclxuXHJcblRva2VuLnN0cmluZ2lmeSA9IGZ1bmN0aW9uKG8sIGxhbmd1YWdlLCBwYXJlbnQpIHtcclxuXHRpZiAodHlwZW9mIG8gPT0gJ3N0cmluZycpIHtcclxuXHRcdHJldHVybiBvO1xyXG5cdH1cclxuXHJcblx0aWYgKF8udXRpbC50eXBlKG8pID09PSAnQXJyYXknKSB7XHJcblx0XHRyZXR1cm4gby5tYXAoZnVuY3Rpb24oZWxlbWVudCkge1xyXG5cdFx0XHRyZXR1cm4gVG9rZW4uc3RyaW5naWZ5KGVsZW1lbnQsIGxhbmd1YWdlLCBvKTtcclxuXHRcdH0pLmpvaW4oJycpO1xyXG5cdH1cclxuXHJcblx0dmFyIGVudiA9IHtcclxuXHRcdHR5cGU6IG8udHlwZSxcclxuXHRcdGNvbnRlbnQ6IFRva2VuLnN0cmluZ2lmeShvLmNvbnRlbnQsIGxhbmd1YWdlLCBwYXJlbnQpLFxyXG5cdFx0dGFnOiAnc3BhbicsXHJcblx0XHRjbGFzc2VzOiBbJ3Rva2VuJywgby50eXBlXSxcclxuXHRcdGF0dHJpYnV0ZXM6IHt9LFxyXG5cdFx0bGFuZ3VhZ2U6IGxhbmd1YWdlLFxyXG5cdFx0cGFyZW50OiBwYXJlbnRcclxuXHR9O1xyXG5cclxuXHRpZiAoZW52LnR5cGUgPT0gJ2NvbW1lbnQnKSB7XHJcblx0XHRlbnYuYXR0cmlidXRlc1snc3BlbGxjaGVjayddID0gJ3RydWUnO1xyXG5cdH1cclxuXHJcblx0aWYgKG8uYWxpYXMpIHtcclxuXHRcdHZhciBhbGlhc2VzID0gXy51dGlsLnR5cGUoby5hbGlhcykgPT09ICdBcnJheScgPyBvLmFsaWFzIDogW28uYWxpYXNdO1xyXG5cdFx0QXJyYXkucHJvdG90eXBlLnB1c2guYXBwbHkoZW52LmNsYXNzZXMsIGFsaWFzZXMpO1xyXG5cdH1cclxuXHJcblx0Xy5ob29rcy5ydW4oJ3dyYXAnLCBlbnYpO1xyXG5cclxuXHR2YXIgYXR0cmlidXRlcyA9ICcnO1xyXG5cclxuXHRmb3IgKHZhciBuYW1lIGluIGVudi5hdHRyaWJ1dGVzKSB7XHJcblx0XHRhdHRyaWJ1dGVzICs9IG5hbWUgKyAnPVwiJyArIChlbnYuYXR0cmlidXRlc1tuYW1lXSB8fCAnJykgKyAnXCInO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuICc8JyArIGVudi50YWcgKyAnIGNsYXNzPVwiJyArIGVudi5jbGFzc2VzLmpvaW4oJyAnKSArICdcIiAnICsgYXR0cmlidXRlcyArICc+JyArIGVudi5jb250ZW50ICsgJzwvJyArIGVudi50YWcgKyAnPic7XHJcblxyXG59O1xyXG5cclxuaWYgKCFzZWxmLmRvY3VtZW50KSB7XHJcblx0aWYgKCFzZWxmLmFkZEV2ZW50TGlzdGVuZXIpIHtcclxuXHRcdC8vIGluIE5vZGUuanNcclxuXHRcdHJldHVybiBzZWxmLlByaXNtO1xyXG5cdH1cclxuIFx0Ly8gSW4gd29ya2VyXHJcblx0c2VsZi5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24oZXZ0KSB7XHJcblx0XHR2YXIgbWVzc2FnZSA9IEpTT04ucGFyc2UoZXZ0LmRhdGEpLFxyXG5cdFx0ICAgIGxhbmcgPSBtZXNzYWdlLmxhbmd1YWdlLFxyXG5cdFx0ICAgIGNvZGUgPSBtZXNzYWdlLmNvZGU7XHJcblxyXG5cdFx0c2VsZi5wb3N0TWVzc2FnZShKU09OLnN0cmluZ2lmeShfLnV0aWwuZW5jb2RlKF8udG9rZW5pemUoY29kZSwgXy5sYW5ndWFnZXNbbGFuZ10pKSkpO1xyXG5cdFx0c2VsZi5jbG9zZSgpO1xyXG5cdH0sIGZhbHNlKTtcclxuXHJcblx0cmV0dXJuIHNlbGYuUHJpc207XHJcbn1cclxuXHJcbi8vIEdldCBjdXJyZW50IHNjcmlwdCBhbmQgaGlnaGxpZ2h0XHJcbnZhciBzY3JpcHQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnc2NyaXB0Jyk7XHJcblxyXG5zY3JpcHQgPSBzY3JpcHRbc2NyaXB0Lmxlbmd0aCAtIDFdO1xyXG5cclxuaWYgKHNjcmlwdCkge1xyXG5cdF8uZmlsZW5hbWUgPSBzY3JpcHQuc3JjO1xyXG5cclxuXHRpZiAoZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lciAmJiAhc2NyaXB0Lmhhc0F0dHJpYnV0ZSgnZGF0YS1tYW51YWwnKSkge1xyXG5cdFx0ZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIF8uaGlnaGxpZ2h0QWxsKTtcclxuXHR9XHJcbn1cclxuXHJcbnJldHVybiBzZWxmLlByaXNtO1xyXG5cclxufSkoKTtcclxuXHJcbmlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xyXG5cdG1vZHVsZS5leHBvcnRzID0gUHJpc207XHJcbn1cclxuXHJcblxyXG4vKiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbiAgICAgQmVnaW4gcHJpc20tbWFya3VwLmpzXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiogKi9cclxuXHJcblByaXNtLmxhbmd1YWdlcy5tYXJrdXAgPSB7XHJcblx0J2NvbW1lbnQnOiAvPCEtLVtcXHdcXFddKj8tLT4vLFxyXG5cdCdwcm9sb2cnOiAvPFxcPy4rP1xcPz4vLFxyXG5cdCdkb2N0eXBlJzogLzwhRE9DVFlQRS4rPz4vLFxyXG5cdCdjZGF0YSc6IC88IVxcW0NEQVRBXFxbW1xcd1xcV10qP11dPi9pLFxyXG5cdCd0YWcnOiB7XHJcblx0XHRwYXR0ZXJuOiAvPFxcLz9bXFx3Oi1dK1xccyooPzpcXHMrW1xcdzotXSsoPzo9KD86KFwifCcpKFxcXFw/W1xcd1xcV10pKj9cXDF8W15cXHMnXCI+PV0rKSk/XFxzKikqXFwvPz4vaSxcclxuXHRcdGluc2lkZToge1xyXG5cdFx0XHQndGFnJzoge1xyXG5cdFx0XHRcdHBhdHRlcm46IC9ePFxcLz9bXFx3Oi1dKy9pLFxyXG5cdFx0XHRcdGluc2lkZToge1xyXG5cdFx0XHRcdFx0J3B1bmN0dWF0aW9uJzogL148XFwvPy8sXHJcblx0XHRcdFx0XHQnbmFtZXNwYWNlJzogL15bXFx3LV0rPzovXHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9LFxyXG5cdFx0XHQnYXR0ci12YWx1ZSc6IHtcclxuXHRcdFx0XHRwYXR0ZXJuOiAvPSg/OignfFwiKVtcXHdcXFddKj8oXFwxKXxbXlxccz5dKykvaSxcclxuXHRcdFx0XHRpbnNpZGU6IHtcclxuXHRcdFx0XHRcdCdwdW5jdHVhdGlvbic6IC89fD58XCIvXHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9LFxyXG5cdFx0XHQncHVuY3R1YXRpb24nOiAvXFwvPz4vLFxyXG5cdFx0XHQnYXR0ci1uYW1lJzoge1xyXG5cdFx0XHRcdHBhdHRlcm46IC9bXFx3Oi1dKy8sXHJcblx0XHRcdFx0aW5zaWRlOiB7XHJcblx0XHRcdFx0XHQnbmFtZXNwYWNlJzogL15bXFx3LV0rPzovXHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblxyXG5cdFx0fVxyXG5cdH0sXHJcblx0J2VudGl0eSc6IC8mIz9bXFxkYS16XXsxLDh9Oy9pXHJcbn07XHJcblxyXG4vLyBQbHVnaW4gdG8gbWFrZSBlbnRpdHkgdGl0bGUgc2hvdyB0aGUgcmVhbCBlbnRpdHksIGlkZWEgYnkgUm9tYW4gS29tYXJvdlxyXG5QcmlzbS5ob29rcy5hZGQoJ3dyYXAnLCBmdW5jdGlvbihlbnYpIHtcclxuXHJcblx0aWYgKGVudi50eXBlID09PSAnZW50aXR5Jykge1xyXG5cdFx0ZW52LmF0dHJpYnV0ZXNbJ3RpdGxlJ10gPSBlbnYuY29udGVudC5yZXBsYWNlKC8mYW1wOy8sICcmJyk7XHJcblx0fVxyXG59KTtcclxuXHJcblxyXG4vKiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbiAgICAgQmVnaW4gcHJpc20tY3NzLmpzXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiogKi9cclxuXHJcblByaXNtLmxhbmd1YWdlcy5jc3MgPSB7XHJcblx0J2NvbW1lbnQnOiAvXFwvXFwqW1xcd1xcV10qP1xcKlxcLy8sXHJcblx0J2F0cnVsZSc6IHtcclxuXHRcdHBhdHRlcm46IC9AW1xcdy1dKz8uKj8oO3woPz1cXHMqXFx7KSkvaSxcclxuXHRcdGluc2lkZToge1xyXG5cdFx0XHQncHVuY3R1YXRpb24nOiAvWzs6XS9cclxuXHRcdH1cclxuXHR9LFxyXG5cdCd1cmwnOiAvdXJsXFwoKD86KFtcIiddKShcXFxcXFxufFxcXFw/LikqP1xcMXwuKj8pXFwpL2ksXHJcblx0J3NlbGVjdG9yJzogL1teXFx7XFx9XFxzXVteXFx7XFx9O10qKD89XFxzKlxceykvLFxyXG5cdCdzdHJpbmcnOiAvKFwifCcpKFxcXFxcXG58XFxcXD8uKSo/XFwxLyxcclxuXHQncHJvcGVydHknOiAvKFxcYnxcXEIpW1xcdy1dKyg/PVxccyo6KS9pLFxyXG5cdCdpbXBvcnRhbnQnOiAvXFxCIWltcG9ydGFudFxcYi9pLFxyXG5cdCdwdW5jdHVhdGlvbic6IC9bXFx7XFx9OzpdLyxcclxuXHQnZnVuY3Rpb24nOiAvWy1hLXowLTldKyg/PVxcKCkvaVxyXG59O1xyXG5cclxuaWYgKFByaXNtLmxhbmd1YWdlcy5tYXJrdXApIHtcclxuXHRQcmlzbS5sYW5ndWFnZXMuaW5zZXJ0QmVmb3JlKCdtYXJrdXAnLCAndGFnJywge1xyXG5cdFx0J3N0eWxlJzoge1xyXG5cdFx0XHRwYXR0ZXJuOiAvPHN0eWxlW1xcd1xcV10qPz5bXFx3XFxXXSo/PFxcL3N0eWxlPi9pLFxyXG5cdFx0XHRpbnNpZGU6IHtcclxuXHRcdFx0XHQndGFnJzoge1xyXG5cdFx0XHRcdFx0cGF0dGVybjogLzxzdHlsZVtcXHdcXFddKj8+fDxcXC9zdHlsZT4vaSxcclxuXHRcdFx0XHRcdGluc2lkZTogUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cC50YWcuaW5zaWRlXHJcblx0XHRcdFx0fSxcclxuXHRcdFx0XHRyZXN0OiBQcmlzbS5sYW5ndWFnZXMuY3NzXHJcblx0XHRcdH0sXHJcblx0XHRcdGFsaWFzOiAnbGFuZ3VhZ2UtY3NzJ1xyXG5cdFx0fVxyXG5cdH0pO1xyXG5cdFxyXG5cdFByaXNtLmxhbmd1YWdlcy5pbnNlcnRCZWZvcmUoJ2luc2lkZScsICdhdHRyLXZhbHVlJywge1xyXG5cdFx0J3N0eWxlLWF0dHInOiB7XHJcblx0XHRcdHBhdHRlcm46IC9cXHMqc3R5bGU9KFwifCcpLio/XFwxL2ksXHJcblx0XHRcdGluc2lkZToge1xyXG5cdFx0XHRcdCdhdHRyLW5hbWUnOiB7XHJcblx0XHRcdFx0XHRwYXR0ZXJuOiAvXlxccypzdHlsZS9pLFxyXG5cdFx0XHRcdFx0aW5zaWRlOiBQcmlzbS5sYW5ndWFnZXMubWFya3VwLnRhZy5pbnNpZGVcclxuXHRcdFx0XHR9LFxyXG5cdFx0XHRcdCdwdW5jdHVhdGlvbic6IC9eXFxzKj1cXHMqWydcIl18WydcIl1cXHMqJC8sXHJcblx0XHRcdFx0J2F0dHItdmFsdWUnOiB7XHJcblx0XHRcdFx0XHRwYXR0ZXJuOiAvLisvaSxcclxuXHRcdFx0XHRcdGluc2lkZTogUHJpc20ubGFuZ3VhZ2VzLmNzc1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSxcclxuXHRcdFx0YWxpYXM6ICdsYW5ndWFnZS1jc3MnXHJcblx0XHR9XHJcblx0fSwgUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cC50YWcpO1xyXG59XHJcblxyXG4vKiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbiAgICAgQmVnaW4gcHJpc20tY2xpa2UuanNcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG5cclxuUHJpc20ubGFuZ3VhZ2VzLmNsaWtlID0ge1xyXG5cdCdjb21tZW50JzogW1xyXG5cdFx0e1xyXG5cdFx0XHRwYXR0ZXJuOiAvKF58W15cXFxcXSlcXC9cXCpbXFx3XFxXXSo/XFwqXFwvLyxcclxuXHRcdFx0bG9va2JlaGluZDogdHJ1ZVxyXG5cdFx0fSxcclxuXHRcdHtcclxuXHRcdFx0cGF0dGVybjogLyhefFteXFxcXDpdKVxcL1xcLy4rLyxcclxuXHRcdFx0bG9va2JlaGluZDogdHJ1ZVxyXG5cdFx0fVxyXG5cdF0sXHJcblx0J3N0cmluZyc6IC8oXCJ8JykoXFxcXFxcbnxcXFxcPy4pKj9cXDEvLFxyXG5cdCdjbGFzcy1uYW1lJzoge1xyXG5cdFx0cGF0dGVybjogLygoPzooPzpjbGFzc3xpbnRlcmZhY2V8ZXh0ZW5kc3xpbXBsZW1lbnRzfHRyYWl0fGluc3RhbmNlb2Z8bmV3KVxccyspfCg/OmNhdGNoXFxzK1xcKCkpW2EtejAtOV9cXC5cXFxcXSsvaSxcclxuXHRcdGxvb2tiZWhpbmQ6IHRydWUsXHJcblx0XHRpbnNpZGU6IHtcclxuXHRcdFx0cHVuY3R1YXRpb246IC8oXFwufFxcXFwpL1xyXG5cdFx0fVxyXG5cdH0sXHJcblx0J2tleXdvcmQnOiAvXFxiKGlmfGVsc2V8d2hpbGV8ZG98Zm9yfHJldHVybnxpbnxpbnN0YW5jZW9mfGZ1bmN0aW9ufG5ld3x0cnl8dGhyb3d8Y2F0Y2h8ZmluYWxseXxudWxsfGJyZWFrfGNvbnRpbnVlKVxcYi8sXHJcblx0J2Jvb2xlYW4nOiAvXFxiKHRydWV8ZmFsc2UpXFxiLyxcclxuXHQnZnVuY3Rpb24nOiB7XHJcblx0XHRwYXR0ZXJuOiAvW2EtejAtOV9dK1xcKC9pLFxyXG5cdFx0aW5zaWRlOiB7XHJcblx0XHRcdHB1bmN0dWF0aW9uOiAvXFwoL1xyXG5cdFx0fVxyXG5cdH0sXHJcblx0J251bWJlcic6IC9cXGItPygweFtcXGRBLUZhLWZdK3xcXGQqXFwuP1xcZCsoW0VlXS0/XFxkKyk/KVxcYi8sXHJcblx0J29wZXJhdG9yJzogL1stK117MSwyfXwhfDw9P3w+PT98PXsxLDN9fCZ7MSwyfXxcXHw/XFx8fFxcP3xcXCp8XFwvfH58XFxefCUvLFxyXG5cdCdpZ25vcmUnOiAvJihsdHxndHxhbXApOy9pLFxyXG5cdCdwdW5jdHVhdGlvbic6IC9be31bXFxdOygpLC46XS9cclxufTtcclxuXHJcblxyXG4vKiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbiAgICAgQmVnaW4gcHJpc20tamF2YXNjcmlwdC5qc1xyXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqICovXHJcblxyXG5QcmlzbS5sYW5ndWFnZXMuamF2YXNjcmlwdCA9IFByaXNtLmxhbmd1YWdlcy5leHRlbmQoJ2NsaWtlJywge1xyXG5cdCdrZXl3b3JkJzogL1xcYihicmVha3xjYXNlfGNhdGNofGNsYXNzfGNvbnN0fGNvbnRpbnVlfGRlYnVnZ2VyfGRlZmF1bHR8ZGVsZXRlfGRvfGVsc2V8ZW51bXxleHBvcnR8ZXh0ZW5kc3xmYWxzZXxmaW5hbGx5fGZvcnxmdW5jdGlvbnxnZXR8aWZ8aW1wbGVtZW50c3xpbXBvcnR8aW58aW5zdGFuY2VvZnxpbnRlcmZhY2V8bGV0fG5ld3xudWxsfHBhY2thZ2V8cHJpdmF0ZXxwcm90ZWN0ZWR8cHVibGljfHJldHVybnxzZXR8c3RhdGljfHN1cGVyfHN3aXRjaHx0aGlzfHRocm93fHRydWV8dHJ5fHR5cGVvZnx2YXJ8dm9pZHx3aGlsZXx3aXRofHlpZWxkKVxcYi8sXHJcblx0J251bWJlcic6IC9cXGItPygweFtcXGRBLUZhLWZdK3xcXGQqXFwuP1xcZCsoW0VlXVsrLV0/XFxkKyk/fE5hTnwtP0luZmluaXR5KVxcYi8sXHJcblx0J2Z1bmN0aW9uJzogLyg/IVxcZClbYS16MC05XyRdKyg/PVxcKCkvaVxyXG59KTtcclxuXHJcblByaXNtLmxhbmd1YWdlcy5pbnNlcnRCZWZvcmUoJ2phdmFzY3JpcHQnLCAna2V5d29yZCcsIHtcclxuXHQncmVnZXgnOiB7XHJcblx0XHRwYXR0ZXJuOiAvKF58W14vXSlcXC8oPyFcXC8pKFxcWy4rP118XFxcXC58W14vXFxyXFxuXSkrXFwvW2dpbV17MCwzfSg/PVxccyooJHxbXFxyXFxuLC47fSldKSkvLFxyXG5cdFx0bG9va2JlaGluZDogdHJ1ZVxyXG5cdH1cclxufSk7XHJcblxyXG5pZiAoUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cCkge1xyXG5cdFByaXNtLmxhbmd1YWdlcy5pbnNlcnRCZWZvcmUoJ21hcmt1cCcsICd0YWcnLCB7XHJcblx0XHQnc2NyaXB0Jzoge1xyXG5cdFx0XHRwYXR0ZXJuOiAvPHNjcmlwdFtcXHdcXFddKj8+W1xcd1xcV10qPzxcXC9zY3JpcHQ+L2ksXHJcblx0XHRcdGluc2lkZToge1xyXG5cdFx0XHRcdCd0YWcnOiB7XHJcblx0XHRcdFx0XHRwYXR0ZXJuOiAvPHNjcmlwdFtcXHdcXFddKj8+fDxcXC9zY3JpcHQ+L2ksXHJcblx0XHRcdFx0XHRpbnNpZGU6IFByaXNtLmxhbmd1YWdlcy5tYXJrdXAudGFnLmluc2lkZVxyXG5cdFx0XHRcdH0sXHJcblx0XHRcdFx0cmVzdDogUHJpc20ubGFuZ3VhZ2VzLmphdmFzY3JpcHRcclxuXHRcdFx0fSxcclxuXHRcdFx0YWxpYXM6ICdsYW5ndWFnZS1qYXZhc2NyaXB0J1xyXG5cdFx0fVxyXG5cdH0pO1xyXG59XHJcblxyXG5cclxuLyogKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG4gICAgIEJlZ2luIHByaXNtLWZpbGUtaGlnaGxpZ2h0LmpzXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiogKi9cclxuXHJcbihmdW5jdGlvbiAoKSB7XHJcblx0aWYgKCFzZWxmLlByaXNtIHx8ICFzZWxmLmRvY3VtZW50IHx8ICFkb2N1bWVudC5xdWVyeVNlbGVjdG9yKSB7XHJcblx0XHRyZXR1cm47XHJcblx0fVxyXG5cclxuXHRzZWxmLlByaXNtLmZpbGVIaWdobGlnaHQgPSBmdW5jdGlvbigpIHtcclxuXHJcblx0XHR2YXIgRXh0ZW5zaW9ucyA9IHtcclxuXHRcdFx0J2pzJzogJ2phdmFzY3JpcHQnLFxyXG5cdFx0XHQnaHRtbCc6ICdtYXJrdXAnLFxyXG5cdFx0XHQnc3ZnJzogJ21hcmt1cCcsXHJcblx0XHRcdCd4bWwnOiAnbWFya3VwJyxcclxuXHRcdFx0J3B5JzogJ3B5dGhvbicsXHJcblx0XHRcdCdyYic6ICdydWJ5JyxcclxuXHRcdFx0J3BzMSc6ICdwb3dlcnNoZWxsJyxcclxuXHRcdFx0J3BzbTEnOiAncG93ZXJzaGVsbCdcclxuXHRcdH07XHJcblxyXG5cdFx0QXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgncHJlW2RhdGEtc3JjXScpKS5mb3JFYWNoKGZ1bmN0aW9uKHByZSkge1xyXG5cdFx0XHR2YXIgc3JjID0gcHJlLmdldEF0dHJpYnV0ZSgnZGF0YS1zcmMnKTtcclxuXHRcdFx0dmFyIGV4dGVuc2lvbiA9IChzcmMubWF0Y2goL1xcLihcXHcrKSQvKSB8fCBbLCcnXSlbMV07XHJcblx0XHRcdHZhciBsYW5ndWFnZSA9IEV4dGVuc2lvbnNbZXh0ZW5zaW9uXSB8fCBleHRlbnNpb247XHJcblxyXG5cdFx0XHR2YXIgY29kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NvZGUnKTtcclxuXHRcdFx0Y29kZS5jbGFzc05hbWUgPSAnbGFuZ3VhZ2UtJyArIGxhbmd1YWdlO1xyXG5cclxuXHRcdFx0cHJlLnRleHRDb250ZW50ID0gJyc7XHJcblxyXG5cdFx0XHRjb2RlLnRleHRDb250ZW50ID0gJ0xvYWRpbmfigKYnO1xyXG5cclxuXHRcdFx0cHJlLmFwcGVuZENoaWxkKGNvZGUpO1xyXG5cclxuXHRcdFx0dmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xyXG5cclxuXHRcdFx0eGhyLm9wZW4oJ0dFVCcsIHNyYywgdHJ1ZSk7XHJcblxyXG5cdFx0XHR4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24oKSB7XHJcblx0XHRcdFx0aWYgKHhoci5yZWFkeVN0YXRlID09IDQpIHtcclxuXHJcblx0XHRcdFx0XHRpZiAoeGhyLnN0YXR1cyA8IDQwMCAmJiB4aHIucmVzcG9uc2VUZXh0KSB7XHJcblx0XHRcdFx0XHRcdGNvZGUudGV4dENvbnRlbnQgPSB4aHIucmVzcG9uc2VUZXh0O1xyXG5cclxuXHRcdFx0XHRcdFx0UHJpc20uaGlnaGxpZ2h0RWxlbWVudChjb2RlKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdGVsc2UgaWYgKHhoci5zdGF0dXMgPj0gNDAwKSB7XHJcblx0XHRcdFx0XHRcdGNvZGUudGV4dENvbnRlbnQgPSAn4pyWIEVycm9yICcgKyB4aHIuc3RhdHVzICsgJyB3aGlsZSBmZXRjaGluZyBmaWxlOiAnICsgeGhyLnN0YXR1c1RleHQ7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRcdFx0Y29kZS50ZXh0Q29udGVudCA9ICfinJYgRXJyb3I6IEZpbGUgZG9lcyBub3QgZXhpc3Qgb3IgaXMgZW1wdHknO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fTtcclxuXHJcblx0XHRcdHhoci5zZW5kKG51bGwpO1xyXG5cdFx0fSk7XHJcblxyXG5cdH07XHJcblxyXG5cdHNlbGYuUHJpc20uZmlsZUhpZ2hsaWdodCgpO1xyXG5cclxufSkoKTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcclxuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xyXG4gICAgdmFyIGJhY2tkcm9wcztcclxuXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVCYWNrZHJvcEZvclNsaWRlKHNsaWRlKSB7XHJcbiAgICAgIHZhciBiYWNrZHJvcEF0dHJpYnV0ZSA9IHNsaWRlLmdldEF0dHJpYnV0ZSgnZGF0YS1iZXNwb2tlLWJhY2tkcm9wJyk7XHJcblxyXG4gICAgICBpZiAoYmFja2Ryb3BBdHRyaWJ1dGUpIHtcclxuICAgICAgICB2YXIgYmFja2Ryb3AgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBiYWNrZHJvcC5jbGFzc05hbWUgPSBiYWNrZHJvcEF0dHJpYnV0ZTtcclxuICAgICAgICBiYWNrZHJvcC5jbGFzc0xpc3QuYWRkKCdiZXNwb2tlLWJhY2tkcm9wJyk7XHJcbiAgICAgICAgZGVjay5wYXJlbnQuYXBwZW5kQ2hpbGQoYmFja2Ryb3ApO1xyXG4gICAgICAgIHJldHVybiBiYWNrZHJvcDtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHVwZGF0ZUNsYXNzZXMoZWwpIHtcclxuICAgICAgaWYgKGVsKSB7XHJcbiAgICAgICAgdmFyIGluZGV4ID0gYmFja2Ryb3BzLmluZGV4T2YoZWwpLFxyXG4gICAgICAgICAgY3VycmVudEluZGV4ID0gZGVjay5zbGlkZSgpO1xyXG5cclxuICAgICAgICByZW1vdmVDbGFzcyhlbCwgJ2FjdGl2ZScpO1xyXG4gICAgICAgIHJlbW92ZUNsYXNzKGVsLCAnaW5hY3RpdmUnKTtcclxuICAgICAgICByZW1vdmVDbGFzcyhlbCwgJ2JlZm9yZScpO1xyXG4gICAgICAgIHJlbW92ZUNsYXNzKGVsLCAnYWZ0ZXInKTtcclxuXHJcbiAgICAgICAgaWYgKGluZGV4ICE9PSBjdXJyZW50SW5kZXgpIHtcclxuICAgICAgICAgIGFkZENsYXNzKGVsLCAnaW5hY3RpdmUnKTtcclxuICAgICAgICAgIGFkZENsYXNzKGVsLCBpbmRleCA8IGN1cnJlbnRJbmRleCA/ICdiZWZvcmUnIDogJ2FmdGVyJyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGFkZENsYXNzKGVsLCAnYWN0aXZlJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gcmVtb3ZlQ2xhc3MoZWwsIGNsYXNzTmFtZSkge1xyXG4gICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdiZXNwb2tlLWJhY2tkcm9wLScgKyBjbGFzc05hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGFkZENsYXNzKGVsLCBjbGFzc05hbWUpIHtcclxuICAgICAgZWwuY2xhc3NMaXN0LmFkZCgnYmVzcG9rZS1iYWNrZHJvcC0nICsgY2xhc3NOYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICBiYWNrZHJvcHMgPSBkZWNrLnNsaWRlc1xyXG4gICAgICAubWFwKGNyZWF0ZUJhY2tkcm9wRm9yU2xpZGUpO1xyXG5cclxuICAgIGRlY2sub24oJ2FjdGl2YXRlJywgZnVuY3Rpb24oKSB7XHJcbiAgICAgIGJhY2tkcm9wcy5mb3JFYWNoKHVwZGF0ZUNsYXNzZXMpO1xyXG4gICAgfSk7XHJcbiAgfTtcclxufTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uKGRlY2spIHtcclxuICAgIHZhciBhY3RpdmVTbGlkZUluZGV4LFxyXG4gICAgICBhY3RpdmVCdWxsZXRJbmRleCxcclxuXHJcbiAgICAgIGJ1bGxldHMgPSBkZWNrLnNsaWRlcy5tYXAoZnVuY3Rpb24oc2xpZGUpIHtcclxuICAgICAgICByZXR1cm4gW10uc2xpY2UuY2FsbChzbGlkZS5xdWVyeVNlbGVjdG9yQWxsKCh0eXBlb2Ygb3B0aW9ucyA9PT0gJ3N0cmluZycgPyBvcHRpb25zIDogJ1tkYXRhLWJlc3Bva2UtYnVsbGV0XScpKSwgMCk7XHJcbiAgICAgIH0pLFxyXG5cclxuICAgICAgbmV4dCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHZhciBuZXh0U2xpZGVJbmRleCA9IGFjdGl2ZVNsaWRlSW5kZXggKyAxO1xyXG5cclxuICAgICAgICBpZiAoYWN0aXZlU2xpZGVIYXNCdWxsZXRCeU9mZnNldCgxKSkge1xyXG4gICAgICAgICAgYWN0aXZhdGVCdWxsZXQoYWN0aXZlU2xpZGVJbmRleCwgYWN0aXZlQnVsbGV0SW5kZXggKyAxKTtcclxuICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9IGVsc2UgaWYgKGJ1bGxldHNbbmV4dFNsaWRlSW5kZXhdKSB7XHJcbiAgICAgICAgICBhY3RpdmF0ZUJ1bGxldChuZXh0U2xpZGVJbmRleCwgMCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG5cclxuICAgICAgcHJldiA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHZhciBwcmV2U2xpZGVJbmRleCA9IGFjdGl2ZVNsaWRlSW5kZXggLSAxO1xyXG5cclxuICAgICAgICBpZiAoYWN0aXZlU2xpZGVIYXNCdWxsZXRCeU9mZnNldCgtMSkpIHtcclxuICAgICAgICAgIGFjdGl2YXRlQnVsbGV0KGFjdGl2ZVNsaWRlSW5kZXgsIGFjdGl2ZUJ1bGxldEluZGV4IC0gMSk7XHJcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfSBlbHNlIGlmIChidWxsZXRzW3ByZXZTbGlkZUluZGV4XSkge1xyXG4gICAgICAgICAgYWN0aXZhdGVCdWxsZXQocHJldlNsaWRlSW5kZXgsIGJ1bGxldHNbcHJldlNsaWRlSW5kZXhdLmxlbmd0aCAtIDEpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuXHJcbiAgICAgIGFjdGl2YXRlQnVsbGV0ID0gZnVuY3Rpb24oc2xpZGVJbmRleCwgYnVsbGV0SW5kZXgpIHtcclxuICAgICAgICBhY3RpdmVTbGlkZUluZGV4ID0gc2xpZGVJbmRleDtcclxuICAgICAgICBhY3RpdmVCdWxsZXRJbmRleCA9IGJ1bGxldEluZGV4O1xyXG5cclxuICAgICAgICBidWxsZXRzLmZvckVhY2goZnVuY3Rpb24oc2xpZGUsIHMpIHtcclxuICAgICAgICAgIHNsaWRlLmZvckVhY2goZnVuY3Rpb24oYnVsbGV0LCBiKSB7XHJcbiAgICAgICAgICAgIGJ1bGxldC5jbGFzc0xpc3QuYWRkKCdiZXNwb2tlLWJ1bGxldCcpO1xyXG5cclxuICAgICAgICAgICAgaWYgKHMgPCBzbGlkZUluZGV4IHx8IHMgPT09IHNsaWRlSW5kZXggJiYgYiA8PSBidWxsZXRJbmRleCkge1xyXG4gICAgICAgICAgICAgIGJ1bGxldC5jbGFzc0xpc3QuYWRkKCdiZXNwb2tlLWJ1bGxldC1hY3RpdmUnKTtcclxuICAgICAgICAgICAgICBidWxsZXQuY2xhc3NMaXN0LnJlbW92ZSgnYmVzcG9rZS1idWxsZXQtaW5hY3RpdmUnKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICBidWxsZXQuY2xhc3NMaXN0LmFkZCgnYmVzcG9rZS1idWxsZXQtaW5hY3RpdmUnKTtcclxuICAgICAgICAgICAgICBidWxsZXQuY2xhc3NMaXN0LnJlbW92ZSgnYmVzcG9rZS1idWxsZXQtYWN0aXZlJyk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChzID09PSBzbGlkZUluZGV4ICYmIGIgPT09IGJ1bGxldEluZGV4KSB7XHJcbiAgICAgICAgICAgICAgYnVsbGV0LmNsYXNzTGlzdC5hZGQoJ2Jlc3Bva2UtYnVsbGV0LWN1cnJlbnQnKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICBidWxsZXQuY2xhc3NMaXN0LnJlbW92ZSgnYmVzcG9rZS1idWxsZXQtY3VycmVudCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSxcclxuXHJcbiAgICAgIGFjdGl2ZVNsaWRlSGFzQnVsbGV0QnlPZmZzZXQgPSBmdW5jdGlvbihvZmZzZXQpIHtcclxuICAgICAgICByZXR1cm4gYnVsbGV0c1thY3RpdmVTbGlkZUluZGV4XVthY3RpdmVCdWxsZXRJbmRleCArIG9mZnNldF0gIT09IHVuZGVmaW5lZDtcclxuICAgICAgfTtcclxuXHJcbiAgICBkZWNrLm9uKCduZXh0JywgbmV4dCk7XHJcbiAgICBkZWNrLm9uKCdwcmV2JywgcHJldik7XHJcblxyXG4gICAgZGVjay5vbignc2xpZGUnLCBmdW5jdGlvbihlKSB7XHJcbiAgICAgIGFjdGl2YXRlQnVsbGV0KGUuaW5kZXgsIDApO1xyXG4gICAgfSk7XHJcblxyXG4gICAgYWN0aXZhdGVCdWxsZXQoMCwgMCk7XHJcbiAgfTtcclxufTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcclxuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xyXG4gICAgZGVjay5zbGlkZXMuZm9yRWFjaChmdW5jdGlvbihzbGlkZSkge1xyXG4gICAgICBzbGlkZS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZnVuY3Rpb24oZSkge1xyXG4gICAgICAgIGlmICgvSU5QVVR8VEVYVEFSRUF8U0VMRUNULy50ZXN0KGUudGFyZ2V0Lm5vZGVOYW1lKSB8fCBlLnRhcmdldC5jb250ZW50RWRpdGFibGUgPT09ICd0cnVlJykge1xyXG4gICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfTtcclxufTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcclxuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xyXG4gICAgdmFyIHBhcnNlSGFzaCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICB2YXIgaGFzaCA9IHdpbmRvdy5sb2NhdGlvbi5oYXNoLnNsaWNlKDEpLFxyXG4gICAgICAgIHNsaWRlTnVtYmVyT3JOYW1lID0gcGFyc2VJbnQoaGFzaCwgMTApO1xyXG5cclxuICAgICAgaWYgKGhhc2gpIHtcclxuICAgICAgICBpZiAoc2xpZGVOdW1iZXJPck5hbWUpIHtcclxuICAgICAgICAgIGFjdGl2YXRlU2xpZGUoc2xpZGVOdW1iZXJPck5hbWUgLSAxKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgZGVjay5zbGlkZXMuZm9yRWFjaChmdW5jdGlvbihzbGlkZSwgaSkge1xyXG4gICAgICAgICAgICBpZiAoc2xpZGUuZ2V0QXR0cmlidXRlKCdkYXRhLWJlc3Bva2UtaGFzaCcpID09PSBoYXNoKSB7XHJcbiAgICAgICAgICAgICAgYWN0aXZhdGVTbGlkZShpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIHZhciBhY3RpdmF0ZVNsaWRlID0gZnVuY3Rpb24oaW5kZXgpIHtcclxuICAgICAgdmFyIGluZGV4VG9BY3RpdmF0ZSA9IC0xIDwgaW5kZXggJiYgaW5kZXggPCBkZWNrLnNsaWRlcy5sZW5ndGggPyBpbmRleCA6IDA7XHJcbiAgICAgIGlmIChpbmRleFRvQWN0aXZhdGUgIT09IGRlY2suc2xpZGUoKSkge1xyXG4gICAgICAgIGRlY2suc2xpZGUoaW5kZXhUb0FjdGl2YXRlKTtcclxuICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xyXG4gICAgICBwYXJzZUhhc2goKTtcclxuXHJcbiAgICAgIGRlY2sub24oJ2FjdGl2YXRlJywgZnVuY3Rpb24oZSkge1xyXG4gICAgICAgIHZhciBzbGlkZU5hbWUgPSBlLnNsaWRlLmdldEF0dHJpYnV0ZSgnZGF0YS1iZXNwb2tlLWhhc2gnKTtcclxuICAgICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IHNsaWRlTmFtZSB8fCBlLmluZGV4ICsgMTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignaGFzaGNoYW5nZScsIHBhcnNlSGFzaCk7XHJcbiAgICB9LCAwKTtcclxuICB9O1xyXG59O1xyXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xyXG4gICAgdmFyIGlzSG9yaXpvbnRhbCA9IG9wdGlvbnMgIT09ICd2ZXJ0aWNhbCc7XHJcblxyXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGZ1bmN0aW9uKGUpIHtcclxuICAgICAgaWYgKGUud2hpY2ggPT0gMzQgfHwgLy8gUEFHRSBET1dOXHJcbiAgICAgICAgZS53aGljaCA9PSAzMiB8fCAvLyBTUEFDRVxyXG4gICAgICAgIChpc0hvcml6b250YWwgJiYgZS53aGljaCA9PSAzOSkgfHwgLy8gUklHSFRcclxuICAgICAgICAoIWlzSG9yaXpvbnRhbCAmJiBlLndoaWNoID09IDQwKSAvLyBET1dOXHJcbiAgICAgICkgeyBkZWNrLm5leHQoKTsgfVxyXG5cclxuICAgICAgaWYgKGUud2hpY2ggPT0gMzMgfHwgLy8gUEFHRSBVUFxyXG4gICAgICAgIChpc0hvcml6b250YWwgJiYgZS53aGljaCA9PSAzNykgfHwgLy8gTEVGVFxyXG4gICAgICAgICghaXNIb3Jpem9udGFsICYmIGUud2hpY2ggPT0gMzgpIC8vIFVQXHJcbiAgICAgICkgeyBkZWNrLnByZXYoKTsgfVxyXG4gICAgfSk7XHJcbiAgfTtcclxufTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uIChkZWNrKSB7XHJcbiAgICB2YXIgcHJvZ3Jlc3NQYXJlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcclxuICAgICAgcHJvZ3Jlc3NCYXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcclxuICAgICAgcHJvcCA9IG9wdGlvbnMgPT09ICd2ZXJ0aWNhbCcgPyAnaGVpZ2h0JyA6ICd3aWR0aCc7XHJcblxyXG4gICAgcHJvZ3Jlc3NQYXJlbnQuY2xhc3NOYW1lID0gJ2Jlc3Bva2UtcHJvZ3Jlc3MtcGFyZW50JztcclxuICAgIHByb2dyZXNzQmFyLmNsYXNzTmFtZSA9ICdiZXNwb2tlLXByb2dyZXNzLWJhcic7XHJcbiAgICBwcm9ncmVzc1BhcmVudC5hcHBlbmRDaGlsZChwcm9ncmVzc0Jhcik7XHJcbiAgICBkZWNrLnBhcmVudC5hcHBlbmRDaGlsZChwcm9ncmVzc1BhcmVudCk7XHJcblxyXG4gICAgZGVjay5vbignYWN0aXZhdGUnLCBmdW5jdGlvbihlKSB7XHJcbiAgICAgIHByb2dyZXNzQmFyLnN0eWxlW3Byb3BdID0gKGUuaW5kZXggKiAxMDAgLyAoZGVjay5zbGlkZXMubGVuZ3RoIC0gMSkpICsgJyUnO1xyXG4gICAgfSk7XHJcbiAgfTtcclxufTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uKGRlY2spIHtcclxuICAgIHZhciBwYXJlbnQgPSBkZWNrLnBhcmVudCxcclxuICAgICAgZmlyc3RTbGlkZSA9IGRlY2suc2xpZGVzWzBdLFxyXG4gICAgICBzbGlkZUhlaWdodCA9IGZpcnN0U2xpZGUub2Zmc2V0SGVpZ2h0LFxyXG4gICAgICBzbGlkZVdpZHRoID0gZmlyc3RTbGlkZS5vZmZzZXRXaWR0aCxcclxuICAgICAgdXNlWm9vbSA9IG9wdGlvbnMgPT09ICd6b29tJyB8fCAoJ3pvb20nIGluIHBhcmVudC5zdHlsZSAmJiBvcHRpb25zICE9PSAndHJhbnNmb3JtJyksXHJcblxyXG4gICAgICB3cmFwID0gZnVuY3Rpb24oZWxlbWVudCkge1xyXG4gICAgICAgIHZhciB3cmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgd3JhcHBlci5jbGFzc05hbWUgPSAnYmVzcG9rZS1zY2FsZS1wYXJlbnQnO1xyXG4gICAgICAgIGVsZW1lbnQucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUod3JhcHBlciwgZWxlbWVudCk7XHJcbiAgICAgICAgd3JhcHBlci5hcHBlbmRDaGlsZChlbGVtZW50KTtcclxuICAgICAgICByZXR1cm4gd3JhcHBlcjtcclxuICAgICAgfSxcclxuXHJcbiAgICAgIGVsZW1lbnRzID0gdXNlWm9vbSA/IGRlY2suc2xpZGVzIDogZGVjay5zbGlkZXMubWFwKHdyYXApLFxyXG5cclxuICAgICAgdHJhbnNmb3JtUHJvcGVydHkgPSAoZnVuY3Rpb24ocHJvcGVydHkpIHtcclxuICAgICAgICB2YXIgcHJlZml4ZXMgPSAnTW96IFdlYmtpdCBPIG1zJy5zcGxpdCgnICcpO1xyXG4gICAgICAgIHJldHVybiBwcmVmaXhlcy5yZWR1Y2UoZnVuY3Rpb24oY3VycmVudFByb3BlcnR5LCBwcmVmaXgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHByZWZpeCArIHByb3BlcnR5IGluIHBhcmVudC5zdHlsZSA/IHByZWZpeCArIHByb3BlcnR5IDogY3VycmVudFByb3BlcnR5O1xyXG4gICAgICAgICAgfSwgcHJvcGVydHkudG9Mb3dlckNhc2UoKSk7XHJcbiAgICAgIH0oJ1RyYW5zZm9ybScpKSxcclxuXHJcbiAgICAgIHNjYWxlID0gdXNlWm9vbSA/XHJcbiAgICAgICAgZnVuY3Rpb24ocmF0aW8sIGVsZW1lbnQpIHtcclxuICAgICAgICAgIGVsZW1lbnQuc3R5bGUuem9vbSA9IHJhdGlvO1xyXG4gICAgICAgIH0gOlxyXG4gICAgICAgIGZ1bmN0aW9uKHJhdGlvLCBlbGVtZW50KSB7XHJcbiAgICAgICAgICBlbGVtZW50LnN0eWxlW3RyYW5zZm9ybVByb3BlcnR5XSA9ICdzY2FsZSgnICsgcmF0aW8gKyAnKSc7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgIHNjYWxlQWxsID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFyIHhTY2FsZSA9IHBhcmVudC5vZmZzZXRXaWR0aCAvIHNsaWRlV2lkdGgsXHJcbiAgICAgICAgICB5U2NhbGUgPSBwYXJlbnQub2Zmc2V0SGVpZ2h0IC8gc2xpZGVIZWlnaHQ7XHJcblxyXG4gICAgICAgIGVsZW1lbnRzLmZvckVhY2goc2NhbGUuYmluZChudWxsLCBNYXRoLm1pbih4U2NhbGUsIHlTY2FsZSkpKTtcclxuICAgICAgfTtcclxuXHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgc2NhbGVBbGwpO1xyXG4gICAgc2NhbGVBbGwoKTtcclxuICB9O1xyXG5cclxufTtcclxuIiwiXHJcbnZhciBpbnNlcnRDc3MgPSByZXF1aXJlKCdpbnNlcnQtY3NzJyk7XHJcbnZhciB0cmFuc2Zvcm0gPSByZXF1aXJlKCdmZWF0dXJlL2NzcycpKCd0cmFuc2Zvcm0nKTtcclxudmFyIGRvdCA9IHJlcXVpcmUoJ2RvdCcpO1xyXG52YXIgdGhlbWUgPSBkb3QudGVtcGxhdGUoXCJAaW1wb3J0IHVybChodHRwOi8vZm9udHMuZ29vZ2xlYXBpcy5jb20vY3NzP2ZhbWlseT17ez0gaXQuZm9udCB8fCAnTW9udHNlcnJhdCd9fSk7XFxyXFxuQGltcG9ydCB1cmwoaHR0cDovL2ZvbnRzLmdvb2dsZWFwaXMuY29tL2Nzcz9mYW1pbHk9e3s9IGl0LmZvbnQgfHwgJ1NvdXJjZStDb2RlK1Bybyd9fSk7XFxyXFxuXFxyXFxuaHRtbCwgYm9keSB7XFxyXFxuICBtYXJnaW46IDA7XFxyXFxuICB3aWR0aDogMTAwJTtcXHJcXG4gIGhlaWdodDogMTAwJTtcXHJcXG4gIG92ZXJmbG93OiBoaWRkZW47XFxyXFxuICBjb2xvcjoge3s9IGl0LmNvbG9yIHx8ICd3aGl0ZScgfX07XFxyXFxuICBiYWNrZ3JvdW5kOiB7ez0gaXQuYmFja2dyb3VuZCB8fCAnYmxhY2snIH19O1xcclxcbn1cXHJcXG5cXHJcXG4uYmVzcG9rZS1wYXJlbnQge1xcclxcbiAgdGV4dC1hbGlnbjogY2VudGVyO1xcclxcbiAgZm9udC1zaXplOiAxLjVlbTtcXHJcXG4gIGRpc3BsYXk6IGZsZXg7XFxyXFxuICB3aWR0aDogYXV0bztcXHJcXG4gIGhlaWdodDogMTAwJTtcXHJcXG4gIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjVzIGVhc2UtaW4tb3V0O1xcclxcbiAgZm9udC1mYW1pbHk6ICdNb250c2VycmF0Jywgc2Fucy1zZXJpZjtcXHJcXG59XFxyXFxuXFxyXFxuLmJlc3Bva2Utc2xpZGUge1xcclxcbiAgcGFkZGluZzogNSU7XFxyXFxuICB3aWR0aDogOTAlO1xcclxcbiAgaGVpZ2h0OiA5MCU7XFxyXFxuXFxyXFxuICBiYWNrZ3JvdW5kLXBvc2l0aW9uOiA1MCUgNTAlO1xcclxcbiAgYmFja2dyb3VuZC1yZXBlYXQ6IG5vLXJlcGVhdDtcXHJcXG5cXHJcXG4gIGRpc3BsYXk6IGZsZXg7XFxyXFxuICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xcclxcbiAgZmxleC1zaHJpbms6IDA7XFxyXFxuICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcXHJcXG59XFxyXFxuXFxyXFxuLmJlc3Bva2Utc2xpZGUgdWwsIC5iZXNwb2tlLXNsaWRlIG9sIHtcXHJcXG4gIHRleHQtYWxpZ246IGxlZnQ7XFxyXFxufVxcclxcblxcclxcbi5iZXNwb2tlLXNsaWRlIGgxLCAuYmVzcG9rZS1zbGlkZSBoMiwgLmJlc3Bva2Utc2xpZGUgaDMge1xcclxcbiAgbWFyZ2luOiAwcHg7XFxyXFxufVxcclxcblxcclxcbi5iZXNwb2tlLXNsaWRlIGgxICsgaDIge1xcclxcbiAgbWFyZ2luLXRvcDogMTBweDtcXHJcXG59XFxyXFxuXFxyXFxuLmJlc3Bva2Utc2xpZGUgaDEge1xcclxcbiAgZm9udC1zaXplOiA0ZW07XFxyXFxuICB0ZXh0LXNoYWRvdzogMS41cHggMS41cHggMXB4IHt7PSBpdC5iYWNrZ3JvdW5kIHx8ICdibGFjaycgfX07XFxyXFxufVxcclxcblxcclxcbi5iZXNwb2tlLXNsaWRlIHByZSwgLmJlc3Bva2Utc2xpZGUgY29kZSB7XFxyXFxuICBmb250LWZhbWlseTogJ1NvdXJjZSBDb2RlIFBybycsIG1vbm9zcGFjZTtcXHJcXG59XFxyXFxuXFxyXFxuLmJlc3Bva2Utc2xpZGUgbGkge1xcclxcbiAgbGluZS1oZWlnaHQ6IDJlbTtcXHJcXG59XFxyXFxuXFxyXFxuLmJlc3Bva2Utc2xpZGUgYmxvY2txdW90ZSB7XFxyXFxuICB0ZXh0LWFsaWduOiBqdXN0aWZ5O1xcclxcbiAgZm9udC1zdHlsZTogaXRhbGljO1xcclxcbn1cXHJcXG5cXHJcXG4uYmVzcG9rZS1zbGlkZSBhLCAuYmVzcG9rZS1zbGlkZSBhOnZpc2l0ZWQge1xcclxcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xcclxcbiAgY29sb3I6IHt7PSBpdC5saW5rY29sb3IgfHwgJ3llbGxvdycgfX07XFxyXFxufVxcclxcblxcclxcbi5iZXNwb2tlLWJ1bGxldCB7XFxyXFxuICB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gMC41cyBlYXNlLWluLW91dDtcXHJcXG59XFxyXFxuXFxyXFxuLmJlc3Bva2UtYnVsbGV0LmJlc3Bva2UtYnVsbGV0LWluYWN0aXZlIHtcXHJcXG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgxMDB2aCkgdHJhbnNsYXRlWigwKTtcXHJcXG59XFxyXFxuXCIpO1xyXG5cclxuLyoqXHJcblx0IyBiZXNwb2tlLXRoZW1lLXR3ZWFrYWJsZVxyXG5cclxuXHRBIHNpbXBsZSBbYmVzcG9rZS5qc10oaHR0cHM6Ly9naXRodWIuY29tL21hcmtkYWxnbGVpc2gvYmVzcG9rZS5qcykgdGhlbWVcclxuXHR0aGF0IGNhbiBiZSBjb25maWd1cmVkIG9uIHRoZSBmbHkgdXNpbmcgY2xpZW50LXNpZGUgdGVtcGxhdGluZy5cclxuXHJcblx0IyMgRXhhbXBsZSBVc2FnZVxyXG5cclxuXHRUbyBiZSBjb21wbGV0ZWQuXHJcblxyXG4qKi9cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRzKSB7XHJcbiAgaW5zZXJ0Q3NzKHRoZW1lKG9wdHMgfHwge30pLCB7IHByZXBlbmQ6IHRydWUgfSk7XHJcblxyXG4gIHJldHVybiBmdW5jdGlvbihkZWNrKSB7XHJcbiAgICB2YXIgcGFyZW50ID0gZGVjay5wYXJlbnQ7XHJcblxyXG4gICAgcmVxdWlyZSgnYmVzcG9rZS1jbGFzc2VzJykoKShkZWNrKTtcclxuXHJcbiAgICBkZWNrLm9uKCdhY3RpdmF0ZScsIGZ1bmN0aW9uKGV2dCkge1xyXG4gICAgICB2YXIgdmFsWCA9IChldnQuaW5kZXggKiAxMDApO1xyXG5cclxuICAgICAgaWYgKHRyYW5zZm9ybSkge1xyXG4gICAgICAgIHRyYW5zZm9ybShwYXJlbnQsICd0cmFuc2xhdGVYKC0nICsgdmFsWCArICclKSB0cmFuc2xhdGVaKDApJyk7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgcGFyZW50LnBvc2l0aW9uID0gJ2Fic29sdXRlJztcclxuICAgICAgICBwYXJlbnQubGVmdCA9ICctJyArIHZhbFggKyAnJSc7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH07XHJcbn07XHJcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uKGRlY2spIHtcclxuICAgIHZhciBhZGRDbGFzcyA9IGZ1bmN0aW9uKGVsLCBjbHMpIHtcclxuICAgICAgICBlbC5jbGFzc0xpc3QuYWRkKCdiZXNwb2tlLScgKyBjbHMpO1xyXG4gICAgICB9LFxyXG5cclxuICAgICAgcmVtb3ZlQ2xhc3MgPSBmdW5jdGlvbihlbCwgY2xzKSB7XHJcbiAgICAgICAgZWwuY2xhc3NOYW1lID0gZWwuY2xhc3NOYW1lXHJcbiAgICAgICAgICAucmVwbGFjZShuZXcgUmVnRXhwKCdiZXNwb2tlLScgKyBjbHMgKycoXFxcXHN8JCknLCAnZycpLCAnICcpXHJcbiAgICAgICAgICAudHJpbSgpO1xyXG4gICAgICB9LFxyXG5cclxuICAgICAgZGVhY3RpdmF0ZSA9IGZ1bmN0aW9uKGVsLCBpbmRleCkge1xyXG4gICAgICAgIHZhciBhY3RpdmVTbGlkZSA9IGRlY2suc2xpZGVzW2RlY2suc2xpZGUoKV0sXHJcbiAgICAgICAgICBvZmZzZXQgPSBpbmRleCAtIGRlY2suc2xpZGUoKSxcclxuICAgICAgICAgIG9mZnNldENsYXNzID0gb2Zmc2V0ID4gMCA/ICdhZnRlcicgOiAnYmVmb3JlJztcclxuXHJcbiAgICAgICAgWydiZWZvcmUoLVxcXFxkKyk/JywgJ2FmdGVyKC1cXFxcZCspPycsICdhY3RpdmUnLCAnaW5hY3RpdmUnXS5tYXAocmVtb3ZlQ2xhc3MuYmluZChudWxsLCBlbCkpO1xyXG5cclxuICAgICAgICBpZiAoZWwgIT09IGFjdGl2ZVNsaWRlKSB7XHJcbiAgICAgICAgICBbJ2luYWN0aXZlJywgb2Zmc2V0Q2xhc3MsIG9mZnNldENsYXNzICsgJy0nICsgTWF0aC5hYnMob2Zmc2V0KV0ubWFwKGFkZENsYXNzLmJpbmQobnVsbCwgZWwpKTtcclxuICAgICAgICB9XHJcbiAgICAgIH07XHJcblxyXG4gICAgYWRkQ2xhc3MoZGVjay5wYXJlbnQsICdwYXJlbnQnKTtcclxuICAgIGRlY2suc2xpZGVzLm1hcChmdW5jdGlvbihlbCkgeyBhZGRDbGFzcyhlbCwgJ3NsaWRlJyk7IH0pO1xyXG5cclxuICAgIGRlY2sub24oJ2FjdGl2YXRlJywgZnVuY3Rpb24oZSkge1xyXG4gICAgICBkZWNrLnNsaWRlcy5tYXAoZGVhY3RpdmF0ZSk7XHJcbiAgICAgIGFkZENsYXNzKGUuc2xpZGUsICdhY3RpdmUnKTtcclxuICAgICAgcmVtb3ZlQ2xhc3MoZS5zbGlkZSwgJ2luYWN0aXZlJyk7XHJcbiAgICB9KTtcclxuICB9O1xyXG59O1xyXG4iLCIvLyBkb1QuanNcclxuLy8gMjAxMS0yMDE0LCBMYXVyYSBEb2t0b3JvdmEsIGh0dHBzOi8vZ2l0aHViLmNvbS9vbGFkby9kb1RcclxuLy8gTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxyXG5cclxuKGZ1bmN0aW9uKCkge1xyXG5cdFwidXNlIHN0cmljdFwiO1xyXG5cclxuXHR2YXIgZG9UID0ge1xyXG5cdFx0dmVyc2lvbjogXCIxLjAuM1wiLFxyXG5cdFx0dGVtcGxhdGVTZXR0aW5nczoge1xyXG5cdFx0XHRldmFsdWF0ZTogICAgL1xce1xceyhbXFxzXFxTXSs/KFxcfT8pKylcXH1cXH0vZyxcclxuXHRcdFx0aW50ZXJwb2xhdGU6IC9cXHtcXHs9KFtcXHNcXFNdKz8pXFx9XFx9L2csXHJcblx0XHRcdGVuY29kZTogICAgICAvXFx7XFx7IShbXFxzXFxTXSs/KVxcfVxcfS9nLFxyXG5cdFx0XHR1c2U6ICAgICAgICAgL1xce1xceyMoW1xcc1xcU10rPylcXH1cXH0vZyxcclxuXHRcdFx0dXNlUGFyYW1zOiAgIC8oXnxbXlxcdyRdKWRlZig/OlxcLnxcXFtbXFwnXFxcIl0pKFtcXHckXFwuXSspKD86W1xcJ1xcXCJdXFxdKT9cXHMqXFw6XFxzKihbXFx3JFxcLl0rfFxcXCJbXlxcXCJdK1xcXCJ8XFwnW15cXCddK1xcJ3xcXHtbXlxcfV0rXFx9KS9nLFxyXG5cdFx0XHRkZWZpbmU6ICAgICAgL1xce1xceyMjXFxzKihbXFx3XFwuJF0rKVxccyooXFw6fD0pKFtcXHNcXFNdKz8pI1xcfVxcfS9nLFxyXG5cdFx0XHRkZWZpbmVQYXJhbXM6L15cXHMqKFtcXHckXSspOihbXFxzXFxTXSspLyxcclxuXHRcdFx0Y29uZGl0aW9uYWw6IC9cXHtcXHtcXD8oXFw/KT9cXHMqKFtcXHNcXFNdKj8pXFxzKlxcfVxcfS9nLFxyXG5cdFx0XHRpdGVyYXRlOiAgICAgL1xce1xce35cXHMqKD86XFx9XFx9fChbXFxzXFxTXSs/KVxccypcXDpcXHMqKFtcXHckXSspXFxzKig/OlxcOlxccyooW1xcdyRdKykpP1xccypcXH1cXH0pL2csXHJcblx0XHRcdHZhcm5hbWU6XHRcIml0XCIsXHJcblx0XHRcdHN0cmlwOlx0XHR0cnVlLFxyXG5cdFx0XHRhcHBlbmQ6XHRcdHRydWUsXHJcblx0XHRcdHNlbGZjb250YWluZWQ6IGZhbHNlLFxyXG5cdFx0XHRkb05vdFNraXBFbmNvZGVkOiBmYWxzZVxyXG5cdFx0fSxcclxuXHRcdHRlbXBsYXRlOiB1bmRlZmluZWQsIC8vZm4sIGNvbXBpbGUgdGVtcGxhdGVcclxuXHRcdGNvbXBpbGU6ICB1bmRlZmluZWQgIC8vZm4sIGZvciBleHByZXNzXHJcblx0fSwgX2dsb2JhbHM7XHJcblxyXG5cdGRvVC5lbmNvZGVIVE1MU291cmNlID0gZnVuY3Rpb24oZG9Ob3RTa2lwRW5jb2RlZCkge1xyXG5cdFx0dmFyIGVuY29kZUhUTUxSdWxlcyA9IHsgXCImXCI6IFwiJiMzODtcIiwgXCI8XCI6IFwiJiM2MDtcIiwgXCI+XCI6IFwiJiM2MjtcIiwgJ1wiJzogXCImIzM0O1wiLCBcIidcIjogXCImIzM5O1wiLCBcIi9cIjogXCImIzQ3O1wiIH0sXHJcblx0XHRcdG1hdGNoSFRNTCA9IGRvTm90U2tpcEVuY29kZWQgPyAvWyY8PlwiJ1xcL10vZyA6IC8mKD8hIz9cXHcrOyl8PHw+fFwifCd8XFwvL2c7XHJcblx0XHRyZXR1cm4gZnVuY3Rpb24oY29kZSkge1xyXG5cdFx0XHRyZXR1cm4gY29kZSA/IGNvZGUudG9TdHJpbmcoKS5yZXBsYWNlKG1hdGNoSFRNTCwgZnVuY3Rpb24obSkge3JldHVybiBlbmNvZGVIVE1MUnVsZXNbbV0gfHwgbTt9KSA6IFwiXCI7XHJcblx0XHR9O1xyXG5cdH07XHJcblxyXG5cdF9nbG9iYWxzID0gKGZ1bmN0aW9uKCl7IHJldHVybiB0aGlzIHx8ICgwLGV2YWwpKFwidGhpc1wiKTsgfSgpKTtcclxuXHJcblx0aWYgKHR5cGVvZiBtb2R1bGUgIT09IFwidW5kZWZpbmVkXCIgJiYgbW9kdWxlLmV4cG9ydHMpIHtcclxuXHRcdG1vZHVsZS5leHBvcnRzID0gZG9UO1xyXG5cdH0gZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gXCJmdW5jdGlvblwiICYmIGRlZmluZS5hbWQpIHtcclxuXHRcdGRlZmluZShmdW5jdGlvbigpe3JldHVybiBkb1Q7fSk7XHJcblx0fSBlbHNlIHtcclxuXHRcdF9nbG9iYWxzLmRvVCA9IGRvVDtcclxuXHR9XHJcblxyXG5cdHZhciBzdGFydGVuZCA9IHtcclxuXHRcdGFwcGVuZDogeyBzdGFydDogXCInKyhcIiwgICAgICBlbmQ6IFwiKSsnXCIsICAgICAgc3RhcnRlbmNvZGU6IFwiJytlbmNvZGVIVE1MKFwiIH0sXHJcblx0XHRzcGxpdDogIHsgc3RhcnQ6IFwiJztvdXQrPShcIiwgZW5kOiBcIik7b3V0Kz0nXCIsIHN0YXJ0ZW5jb2RlOiBcIic7b3V0Kz1lbmNvZGVIVE1MKFwiIH1cclxuXHR9LCBza2lwID0gLyReLztcclxuXHJcblx0ZnVuY3Rpb24gcmVzb2x2ZURlZnMoYywgYmxvY2ssIGRlZikge1xyXG5cdFx0cmV0dXJuICgodHlwZW9mIGJsb2NrID09PSBcInN0cmluZ1wiKSA/IGJsb2NrIDogYmxvY2sudG9TdHJpbmcoKSlcclxuXHRcdC5yZXBsYWNlKGMuZGVmaW5lIHx8IHNraXAsIGZ1bmN0aW9uKG0sIGNvZGUsIGFzc2lnbiwgdmFsdWUpIHtcclxuXHRcdFx0aWYgKGNvZGUuaW5kZXhPZihcImRlZi5cIikgPT09IDApIHtcclxuXHRcdFx0XHRjb2RlID0gY29kZS5zdWJzdHJpbmcoNCk7XHJcblx0XHRcdH1cclxuXHRcdFx0aWYgKCEoY29kZSBpbiBkZWYpKSB7XHJcblx0XHRcdFx0aWYgKGFzc2lnbiA9PT0gXCI6XCIpIHtcclxuXHRcdFx0XHRcdGlmIChjLmRlZmluZVBhcmFtcykgdmFsdWUucmVwbGFjZShjLmRlZmluZVBhcmFtcywgZnVuY3Rpb24obSwgcGFyYW0sIHYpIHtcclxuXHRcdFx0XHRcdFx0ZGVmW2NvZGVdID0ge2FyZzogcGFyYW0sIHRleHQ6IHZ9O1xyXG5cdFx0XHRcdFx0fSk7XHJcblx0XHRcdFx0XHRpZiAoIShjb2RlIGluIGRlZikpIGRlZltjb2RlXT0gdmFsdWU7XHJcblx0XHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRcdG5ldyBGdW5jdGlvbihcImRlZlwiLCBcImRlZlsnXCIrY29kZStcIiddPVwiICsgdmFsdWUpKGRlZik7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHRcdHJldHVybiBcIlwiO1xyXG5cdFx0fSlcclxuXHRcdC5yZXBsYWNlKGMudXNlIHx8IHNraXAsIGZ1bmN0aW9uKG0sIGNvZGUpIHtcclxuXHRcdFx0aWYgKGMudXNlUGFyYW1zKSBjb2RlID0gY29kZS5yZXBsYWNlKGMudXNlUGFyYW1zLCBmdW5jdGlvbihtLCBzLCBkLCBwYXJhbSkge1xyXG5cdFx0XHRcdGlmIChkZWZbZF0gJiYgZGVmW2RdLmFyZyAmJiBwYXJhbSkge1xyXG5cdFx0XHRcdFx0dmFyIHJ3ID0gKGQrXCI6XCIrcGFyYW0pLnJlcGxhY2UoLyd8XFxcXC9nLCBcIl9cIik7XHJcblx0XHRcdFx0XHRkZWYuX19leHAgPSBkZWYuX19leHAgfHwge307XHJcblx0XHRcdFx0XHRkZWYuX19leHBbcnddID0gZGVmW2RdLnRleHQucmVwbGFjZShuZXcgUmVnRXhwKFwiKF58W15cXFxcdyRdKVwiICsgZGVmW2RdLmFyZyArIFwiKFteXFxcXHckXSlcIiwgXCJnXCIpLCBcIiQxXCIgKyBwYXJhbSArIFwiJDJcIik7XHJcblx0XHRcdFx0XHRyZXR1cm4gcyArIFwiZGVmLl9fZXhwWydcIitydytcIiddXCI7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9KTtcclxuXHRcdFx0dmFyIHYgPSBuZXcgRnVuY3Rpb24oXCJkZWZcIiwgXCJyZXR1cm4gXCIgKyBjb2RlKShkZWYpO1xyXG5cdFx0XHRyZXR1cm4gdiA/IHJlc29sdmVEZWZzKGMsIHYsIGRlZikgOiB2O1xyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiB1bmVzY2FwZShjb2RlKSB7XHJcblx0XHRyZXR1cm4gY29kZS5yZXBsYWNlKC9cXFxcKCd8XFxcXCkvZywgXCIkMVwiKS5yZXBsYWNlKC9bXFxyXFx0XFxuXS9nLCBcIiBcIik7XHJcblx0fVxyXG5cclxuXHRkb1QudGVtcGxhdGUgPSBmdW5jdGlvbih0bXBsLCBjLCBkZWYpIHtcclxuXHRcdGMgPSBjIHx8IGRvVC50ZW1wbGF0ZVNldHRpbmdzO1xyXG5cdFx0dmFyIGNzZSA9IGMuYXBwZW5kID8gc3RhcnRlbmQuYXBwZW5kIDogc3RhcnRlbmQuc3BsaXQsIG5lZWRodG1sZW5jb2RlLCBzaWQgPSAwLCBpbmR2LFxyXG5cdFx0XHRzdHIgID0gKGMudXNlIHx8IGMuZGVmaW5lKSA/IHJlc29sdmVEZWZzKGMsIHRtcGwsIGRlZiB8fCB7fSkgOiB0bXBsO1xyXG5cclxuXHRcdHN0ciA9IChcInZhciBvdXQ9J1wiICsgKGMuc3RyaXAgPyBzdHIucmVwbGFjZSgvKF58XFxyfFxcbilcXHQqICt8ICtcXHQqKFxccnxcXG58JCkvZyxcIiBcIilcclxuXHRcdFx0XHRcdC5yZXBsYWNlKC9cXHJ8XFxufFxcdHxcXC9cXCpbXFxzXFxTXSo/XFwqXFwvL2csXCJcIik6IHN0cilcclxuXHRcdFx0LnJlcGxhY2UoLyd8XFxcXC9nLCBcIlxcXFwkJlwiKVxyXG5cdFx0XHQucmVwbGFjZShjLmludGVycG9sYXRlIHx8IHNraXAsIGZ1bmN0aW9uKG0sIGNvZGUpIHtcclxuXHRcdFx0XHRyZXR1cm4gY3NlLnN0YXJ0ICsgdW5lc2NhcGUoY29kZSkgKyBjc2UuZW5kO1xyXG5cdFx0XHR9KVxyXG5cdFx0XHQucmVwbGFjZShjLmVuY29kZSB8fCBza2lwLCBmdW5jdGlvbihtLCBjb2RlKSB7XHJcblx0XHRcdFx0bmVlZGh0bWxlbmNvZGUgPSB0cnVlO1xyXG5cdFx0XHRcdHJldHVybiBjc2Uuc3RhcnRlbmNvZGUgKyB1bmVzY2FwZShjb2RlKSArIGNzZS5lbmQ7XHJcblx0XHRcdH0pXHJcblx0XHRcdC5yZXBsYWNlKGMuY29uZGl0aW9uYWwgfHwgc2tpcCwgZnVuY3Rpb24obSwgZWxzZWNhc2UsIGNvZGUpIHtcclxuXHRcdFx0XHRyZXR1cm4gZWxzZWNhc2UgP1xyXG5cdFx0XHRcdFx0KGNvZGUgPyBcIic7fWVsc2UgaWYoXCIgKyB1bmVzY2FwZShjb2RlKSArIFwiKXtvdXQrPSdcIiA6IFwiJzt9ZWxzZXtvdXQrPSdcIikgOlxyXG5cdFx0XHRcdFx0KGNvZGUgPyBcIic7aWYoXCIgKyB1bmVzY2FwZShjb2RlKSArIFwiKXtvdXQrPSdcIiA6IFwiJzt9b3V0Kz0nXCIpO1xyXG5cdFx0XHR9KVxyXG5cdFx0XHQucmVwbGFjZShjLml0ZXJhdGUgfHwgc2tpcCwgZnVuY3Rpb24obSwgaXRlcmF0ZSwgdm5hbWUsIGluYW1lKSB7XHJcblx0XHRcdFx0aWYgKCFpdGVyYXRlKSByZXR1cm4gXCInO30gfSBvdXQrPSdcIjtcclxuXHRcdFx0XHRzaWQrPTE7IGluZHY9aW5hbWUgfHwgXCJpXCIrc2lkOyBpdGVyYXRlPXVuZXNjYXBlKGl0ZXJhdGUpO1xyXG5cdFx0XHRcdHJldHVybiBcIic7dmFyIGFyclwiK3NpZCtcIj1cIitpdGVyYXRlK1wiO2lmKGFyclwiK3NpZCtcIil7dmFyIFwiK3ZuYW1lK1wiLFwiK2luZHYrXCI9LTEsbFwiK3NpZCtcIj1hcnJcIitzaWQrXCIubGVuZ3RoLTE7d2hpbGUoXCIraW5kditcIjxsXCIrc2lkK1wiKXtcIlxyXG5cdFx0XHRcdFx0K3ZuYW1lK1wiPWFyclwiK3NpZCtcIltcIitpbmR2K1wiKz0xXTtvdXQrPSdcIjtcclxuXHRcdFx0fSlcclxuXHRcdFx0LnJlcGxhY2UoYy5ldmFsdWF0ZSB8fCBza2lwLCBmdW5jdGlvbihtLCBjb2RlKSB7XHJcblx0XHRcdFx0cmV0dXJuIFwiJztcIiArIHVuZXNjYXBlKGNvZGUpICsgXCJvdXQrPSdcIjtcclxuXHRcdFx0fSlcclxuXHRcdFx0KyBcIic7cmV0dXJuIG91dDtcIilcclxuXHRcdFx0LnJlcGxhY2UoL1xcbi9nLCBcIlxcXFxuXCIpLnJlcGxhY2UoL1xcdC9nLCAnXFxcXHQnKS5yZXBsYWNlKC9cXHIvZywgXCJcXFxcclwiKVxyXG5cdFx0XHQucmVwbGFjZSgvKFxcc3w7fFxcfXxefFxceylvdXRcXCs9Jyc7L2csICckMScpLnJlcGxhY2UoL1xcKycnL2csIFwiXCIpO1xyXG5cdFx0XHQvLy5yZXBsYWNlKC8oXFxzfDt8XFx9fF58XFx7KW91dFxcKz0nJ1xcKy9nLCckMW91dCs9Jyk7XHJcblxyXG5cdFx0aWYgKG5lZWRodG1sZW5jb2RlKSB7XHJcblx0XHRcdGlmICghYy5zZWxmY29udGFpbmVkICYmIF9nbG9iYWxzICYmICFfZ2xvYmFscy5fZW5jb2RlSFRNTCkgX2dsb2JhbHMuX2VuY29kZUhUTUwgPSBkb1QuZW5jb2RlSFRNTFNvdXJjZShjLmRvTm90U2tpcEVuY29kZWQpO1xyXG5cdFx0XHRzdHIgPSBcInZhciBlbmNvZGVIVE1MID0gdHlwZW9mIF9lbmNvZGVIVE1MICE9PSAndW5kZWZpbmVkJyA/IF9lbmNvZGVIVE1MIDogKFwiXHJcblx0XHRcdFx0KyBkb1QuZW5jb2RlSFRNTFNvdXJjZS50b1N0cmluZygpICsgXCIoXCIgKyAoYy5kb05vdFNraXBFbmNvZGVkIHx8ICcnKSArIFwiKSk7XCJcclxuXHRcdFx0XHQrIHN0cjtcclxuXHRcdH1cclxuXHRcdHRyeSB7XHJcblx0XHRcdHJldHVybiBuZXcgRnVuY3Rpb24oYy52YXJuYW1lLCBzdHIpO1xyXG5cdFx0fSBjYXRjaCAoZSkge1xyXG5cdFx0XHRpZiAodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIpIGNvbnNvbGUubG9nKFwiQ291bGQgbm90IGNyZWF0ZSBhIHRlbXBsYXRlIGZ1bmN0aW9uOiBcIiArIHN0cik7XHJcblx0XHRcdHRocm93IGU7XHJcblx0XHR9XHJcblx0fTtcclxuXHJcblx0ZG9ULmNvbXBpbGUgPSBmdW5jdGlvbih0bXBsLCBkZWYpIHtcclxuXHRcdHJldHVybiBkb1QudGVtcGxhdGUodG1wbCwgbnVsbCwgZGVmKTtcclxuXHR9O1xyXG59KCkpO1xyXG4iLCIvKiBkb1QgKyBhdXRvLWNvbXBpbGF0aW9uIG9mIGRvVCB0ZW1wbGF0ZXNcclxuICpcclxuICogMjAxMiwgTGF1cmEgRG9rdG9yb3ZhLCBodHRwczovL2dpdGh1Yi5jb20vb2xhZG8vZG9UXHJcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZVxyXG4gKlxyXG4gKiBDb21waWxlcyAuZGVmLCAuZG90LCAuanN0IGZpbGVzIGZvdW5kIHVuZGVyIHRoZSBzcGVjaWZpZWQgcGF0aC5cclxuICogSXQgaWdub3JlcyBzdWItZGlyZWN0b3JpZXMuXHJcbiAqIFRlbXBsYXRlIGZpbGVzIGNhbiBoYXZlIG11bHRpcGxlIGV4dGVuc2lvbnMgYXQgdGhlIHNhbWUgdGltZS5cclxuICogRmlsZXMgd2l0aCAuZGVmIGV4dGVuc2lvbiBjYW4gYmUgaW5jbHVkZWQgaW4gb3RoZXIgZmlsZXMgdmlhIHt7I2RlZi5uYW1lfX1cclxuICogRmlsZXMgd2l0aCAuZG90IGV4dGVuc2lvbiBhcmUgY29tcGlsZWQgaW50byBmdW5jdGlvbnMgd2l0aCB0aGUgc2FtZSBuYW1lIGFuZFxyXG4gKiBjYW4gYmUgYWNjZXNzZWQgYXMgcmVuZGVyZXIuZmlsZW5hbWVcclxuICogRmlsZXMgd2l0aCAuanN0IGV4dGVuc2lvbiBhcmUgY29tcGlsZWQgaW50byAuanMgZmlsZXMuIFByb2R1Y2VkIC5qcyBmaWxlIGNhbiBiZVxyXG4gKiBsb2FkZWQgYXMgYSBjb21tb25KUywgQU1EIG1vZHVsZSwgb3IganVzdCBpbnN0YWxsZWQgaW50byBhIGdsb2JhbCB2YXJpYWJsZVxyXG4gKiAoZGVmYXVsdCBpcyBzZXQgdG8gd2luZG93LnJlbmRlcikuXHJcbiAqIEFsbCBpbmxpbmUgZGVmaW5lcyBkZWZpbmVkIGluIHRoZSAuanN0IGZpbGUgYXJlXHJcbiAqIGNvbXBpbGVkIGludG8gc2VwYXJhdGUgZnVuY3Rpb25zIGFuZCBhcmUgYXZhaWxhYmxlIHZpYSBfcmVuZGVyLmZpbGVuYW1lLmRlZmluZW5hbWVcclxuICpcclxuICogQmFzaWMgdXNhZ2U6XHJcbiAqIHZhciBkb3RzID0gcmVxdWlyZShcImRvdFwiKS5wcm9jZXNzKHtwYXRoOiBcIi4vdmlld3NcIn0pO1xyXG4gKiBkb3RzLm15dGVtcGxhdGUoe2ZvbzpcImhlbGxvIHdvcmxkXCJ9KTtcclxuICpcclxuICogVGhlIGFib3ZlIHNuaXBwZXQgd2lsbDpcclxuICogMS4gQ29tcGlsZSBhbGwgdGVtcGxhdGVzIGluIHZpZXdzIGZvbGRlciAoLmRvdCwgLmRlZiwgLmpzdClcclxuICogMi4gUGxhY2UgLmpzIGZpbGVzIGNvbXBpbGVkIGZyb20gLmpzdCB0ZW1wbGF0ZXMgaW50byB0aGUgc2FtZSBmb2xkZXIuXHJcbiAqICAgIFRoZXNlIGZpbGVzIGNhbiBiZSB1c2VkIHdpdGggcmVxdWlyZSwgaS5lLiByZXF1aXJlKFwiLi92aWV3cy9teXRlbXBsYXRlXCIpLlxyXG4gKiAzLiBSZXR1cm4gYW4gb2JqZWN0IHdpdGggZnVuY3Rpb25zIGNvbXBpbGVkIGZyb20gLmRvdCB0ZW1wbGF0ZXMgYXMgaXRzIHByb3BlcnRpZXMuXHJcbiAqIDQuIFJlbmRlciBteXRlbXBsYXRlIHRlbXBsYXRlLlxyXG4gKi9cclxuXHJcbnZhciBmcyA9IHJlcXVpcmUoXCJmc1wiKSxcclxuXHRkb1QgPSBtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCIuL2RvVFwiKTtcclxuXHJcbmRvVC5wcm9jZXNzID0gZnVuY3Rpb24ob3B0aW9ucykge1xyXG5cdC8vcGF0aCwgZGVzdGluYXRpb24sIGdsb2JhbCwgcmVuZGVybW9kdWxlLCB0ZW1wbGF0ZVNldHRpbmdzXHJcblx0cmV0dXJuIG5ldyBJbnN0YWxsRG90cyhvcHRpb25zKS5jb21waWxlQWxsKCk7XHJcbn07XHJcblxyXG5mdW5jdGlvbiBJbnN0YWxsRG90cyhvKSB7XHJcblx0dGhpcy5fX3BhdGggXHRcdD0gby5wYXRoIHx8IFwiLi9cIjtcclxuXHRpZiAodGhpcy5fX3BhdGhbdGhpcy5fX3BhdGgubGVuZ3RoLTFdICE9PSAnLycpIHRoaXMuX19wYXRoICs9ICcvJztcclxuXHR0aGlzLl9fZGVzdGluYXRpb25cdD0gby5kZXN0aW5hdGlvbiB8fCB0aGlzLl9fcGF0aDtcclxuXHRpZiAodGhpcy5fX2Rlc3RpbmF0aW9uW3RoaXMuX19kZXN0aW5hdGlvbi5sZW5ndGgtMV0gIT09ICcvJykgdGhpcy5fX2Rlc3RpbmF0aW9uICs9ICcvJztcclxuXHR0aGlzLl9fZ2xvYmFsXHRcdD0gby5nbG9iYWwgfHwgXCJ3aW5kb3cucmVuZGVyXCI7XHJcblx0dGhpcy5fX3JlbmRlcm1vZHVsZVx0PSBvLnJlbmRlcm1vZHVsZSB8fCB7fTtcclxuXHR0aGlzLl9fc2V0dGluZ3MgXHQ9IG8udGVtcGxhdGVTZXR0aW5ncyA/IGNvcHkoby50ZW1wbGF0ZVNldHRpbmdzLCBjb3B5KGRvVC50ZW1wbGF0ZVNldHRpbmdzKSkgOiB1bmRlZmluZWQ7XHJcblx0dGhpcy5fX2luY2x1ZGVzXHRcdD0ge307XHJcbn1cclxuXHJcbkluc3RhbGxEb3RzLnByb3RvdHlwZS5jb21waWxlVG9GaWxlID0gZnVuY3Rpb24ocGF0aCwgdGVtcGxhdGUsIGRlZikge1xyXG5cdGRlZiA9IGRlZiB8fCB7fTtcclxuXHR2YXIgbW9kdWxlbmFtZSA9IHBhdGguc3Vic3RyaW5nKHBhdGgubGFzdEluZGV4T2YoXCIvXCIpKzEsIHBhdGgubGFzdEluZGV4T2YoXCIuXCIpKVxyXG5cdFx0LCBkZWZzID0gY29weSh0aGlzLl9faW5jbHVkZXMsIGNvcHkoZGVmKSlcclxuXHRcdCwgc2V0dGluZ3MgPSB0aGlzLl9fc2V0dGluZ3MgfHwgZG9ULnRlbXBsYXRlU2V0dGluZ3NcclxuXHRcdCwgY29tcGlsZW9wdGlvbnMgPSBjb3B5KHNldHRpbmdzKVxyXG5cdFx0LCBkZWZhdWx0Y29tcGlsZWQgPSBkb1QudGVtcGxhdGUodGVtcGxhdGUsIHNldHRpbmdzLCBkZWZzKVxyXG5cdFx0LCBleHBvcnRzID0gW11cclxuXHRcdCwgY29tcGlsZWQgPSBcIlwiXHJcblx0XHQsIGZuO1xyXG5cclxuXHRmb3IgKHZhciBwcm9wZXJ0eSBpbiBkZWZzKSB7XHJcblx0XHRpZiAoZGVmc1twcm9wZXJ0eV0gIT09IGRlZltwcm9wZXJ0eV0gJiYgZGVmc1twcm9wZXJ0eV0gIT09IHRoaXMuX19pbmNsdWRlc1twcm9wZXJ0eV0pIHtcclxuXHRcdFx0Zm4gPSB1bmRlZmluZWQ7XHJcblx0XHRcdGlmICh0eXBlb2YgZGVmc1twcm9wZXJ0eV0gPT09ICdzdHJpbmcnKSB7XHJcblx0XHRcdFx0Zm4gPSBkb1QudGVtcGxhdGUoZGVmc1twcm9wZXJ0eV0sIHNldHRpbmdzLCBkZWZzKTtcclxuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgZGVmc1twcm9wZXJ0eV0gPT09ICdmdW5jdGlvbicpIHtcclxuXHRcdFx0XHRmbiA9IGRlZnNbcHJvcGVydHldO1xyXG5cdFx0XHR9IGVsc2UgaWYgKGRlZnNbcHJvcGVydHldLmFyZykge1xyXG5cdFx0XHRcdGNvbXBpbGVvcHRpb25zLnZhcm5hbWUgPSBkZWZzW3Byb3BlcnR5XS5hcmc7XHJcblx0XHRcdFx0Zm4gPSBkb1QudGVtcGxhdGUoZGVmc1twcm9wZXJ0eV0udGV4dCwgY29tcGlsZW9wdGlvbnMsIGRlZnMpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGlmIChmbikge1xyXG5cdFx0XHRcdGNvbXBpbGVkICs9IGZuLnRvU3RyaW5nKCkucmVwbGFjZSgnYW5vbnltb3VzJywgcHJvcGVydHkpO1xyXG5cdFx0XHRcdGV4cG9ydHMucHVzaChwcm9wZXJ0eSk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9XHJcblx0Y29tcGlsZWQgKz0gZGVmYXVsdGNvbXBpbGVkLnRvU3RyaW5nKCkucmVwbGFjZSgnYW5vbnltb3VzJywgbW9kdWxlbmFtZSk7XHJcblx0ZnMud3JpdGVGaWxlU3luYyhwYXRoLCBcIihmdW5jdGlvbigpe1wiICsgY29tcGlsZWRcclxuXHRcdCsgXCJ2YXIgaXRzZWxmPVwiICsgbW9kdWxlbmFtZSArIFwiLCBfZW5jb2RlSFRNTD0oXCIgKyBkb1QuZW5jb2RlSFRNTFNvdXJjZS50b1N0cmluZygpICsgXCIoXCIgKyAoc2V0dGluZ3MuZG9Ob3RTa2lwRW5jb2RlZCB8fCAnJykgKyBcIikpO1wiXHJcblx0XHQrIGFkZGV4cG9ydHMoZXhwb3J0cylcclxuXHRcdCsgXCJpZih0eXBlb2YgbW9kdWxlIT09J3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIG1vZHVsZS5leHBvcnRzPWl0c2VsZjtlbHNlIGlmKHR5cGVvZiBkZWZpbmU9PT0nZnVuY3Rpb24nKWRlZmluZShmdW5jdGlvbigpe3JldHVybiBpdHNlbGY7fSk7ZWxzZSB7XCJcclxuXHRcdCsgdGhpcy5fX2dsb2JhbCArIFwiPVwiICsgdGhpcy5fX2dsb2JhbCArIFwifHx7fTtcIiArIHRoaXMuX19nbG9iYWwgKyBcIlsnXCIgKyBtb2R1bGVuYW1lICsgXCInXT1pdHNlbGY7fX0oKSk7XCIpO1xyXG59O1xyXG5cclxuZnVuY3Rpb24gYWRkZXhwb3J0cyhleHBvcnRzKSB7XHJcblx0Zm9yICh2YXIgcmV0ID0nJywgaT0wOyBpPCBleHBvcnRzLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRyZXQgKz0gXCJpdHNlbGYuXCIgKyBleHBvcnRzW2ldKyBcIj1cIiArIGV4cG9ydHNbaV0rXCI7XCI7XHJcblx0fVxyXG5cdHJldHVybiByZXQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvcHkobywgdG8pIHtcclxuXHR0byA9IHRvIHx8IHt9O1xyXG5cdGZvciAodmFyIHByb3BlcnR5IGluIG8pIHtcclxuXHRcdHRvW3Byb3BlcnR5XSA9IG9bcHJvcGVydHldO1xyXG5cdH1cclxuXHRyZXR1cm4gdG87XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlYWRkYXRhKHBhdGgpIHtcclxuXHR2YXIgZGF0YSA9IGZzLnJlYWRGaWxlU3luYyhwYXRoKTtcclxuXHRpZiAoZGF0YSkgcmV0dXJuIGRhdGEudG9TdHJpbmcoKTtcclxuXHRjb25zb2xlLmxvZyhcInByb2JsZW1zIHdpdGggXCIgKyBwYXRoKTtcclxufVxyXG5cclxuSW5zdGFsbERvdHMucHJvdG90eXBlLmNvbXBpbGVQYXRoID0gZnVuY3Rpb24ocGF0aCkge1xyXG5cdHZhciBkYXRhID0gcmVhZGRhdGEocGF0aCk7XHJcblx0aWYgKGRhdGEpIHtcclxuXHRcdHJldHVybiBkb1QudGVtcGxhdGUoZGF0YSxcclxuXHRcdFx0XHRcdHRoaXMuX19zZXR0aW5ncyB8fCBkb1QudGVtcGxhdGVTZXR0aW5ncyxcclxuXHRcdFx0XHRcdGNvcHkodGhpcy5fX2luY2x1ZGVzKSk7XHJcblx0fVxyXG59O1xyXG5cclxuSW5zdGFsbERvdHMucHJvdG90eXBlLmNvbXBpbGVBbGwgPSBmdW5jdGlvbigpIHtcclxuXHRjb25zb2xlLmxvZyhcIkNvbXBpbGluZyBhbGwgZG9UIHRlbXBsYXRlcy4uLlwiKTtcclxuXHJcblx0dmFyIGRlZkZvbGRlciA9IHRoaXMuX19wYXRoLFxyXG5cdFx0c291cmNlcyA9IGZzLnJlYWRkaXJTeW5jKGRlZkZvbGRlciksXHJcblx0XHRrLCBsLCBuYW1lO1xyXG5cclxuXHRmb3IoIGsgPSAwLCBsID0gc291cmNlcy5sZW5ndGg7IGsgPCBsOyBrKyspIHtcclxuXHRcdG5hbWUgPSBzb3VyY2VzW2tdO1xyXG5cdFx0aWYgKC9cXC5kZWYoXFwuZG90fFxcLmpzdCk/JC8udGVzdChuYW1lKSkge1xyXG5cdFx0XHRjb25zb2xlLmxvZyhcIkxvYWRlZCBkZWYgXCIgKyBuYW1lKTtcclxuXHRcdFx0dGhpcy5fX2luY2x1ZGVzW25hbWUuc3Vic3RyaW5nKDAsIG5hbWUuaW5kZXhPZignLicpKV0gPSByZWFkZGF0YShkZWZGb2xkZXIgKyBuYW1lKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdGZvciggayA9IDAsIGwgPSBzb3VyY2VzLmxlbmd0aDsgayA8IGw7IGsrKykge1xyXG5cdFx0bmFtZSA9IHNvdXJjZXNba107XHJcblx0XHRpZiAoL1xcLmRvdChcXC5kZWZ8XFwuanN0KT8kLy50ZXN0KG5hbWUpKSB7XHJcblx0XHRcdGNvbnNvbGUubG9nKFwiQ29tcGlsaW5nIFwiICsgbmFtZSArIFwiIHRvIGZ1bmN0aW9uXCIpO1xyXG5cdFx0XHR0aGlzLl9fcmVuZGVybW9kdWxlW25hbWUuc3Vic3RyaW5nKDAsIG5hbWUuaW5kZXhPZignLicpKV0gPSB0aGlzLmNvbXBpbGVQYXRoKGRlZkZvbGRlciArIG5hbWUpO1xyXG5cdFx0fVxyXG5cdFx0aWYgKC9cXC5qc3QoXFwuZG90fFxcLmRlZik/JC8udGVzdChuYW1lKSkge1xyXG5cdFx0XHRjb25zb2xlLmxvZyhcIkNvbXBpbGluZyBcIiArIG5hbWUgKyBcIiB0byBmaWxlXCIpO1xyXG5cdFx0XHR0aGlzLmNvbXBpbGVUb0ZpbGUodGhpcy5fX2Rlc3RpbmF0aW9uICsgbmFtZS5zdWJzdHJpbmcoMCwgbmFtZS5pbmRleE9mKCcuJykpICsgJy5qcycsXHJcblx0XHRcdFx0XHRyZWFkZGF0YShkZWZGb2xkZXIgKyBuYW1lKSk7XHJcblx0XHR9XHJcblx0fVxyXG5cdHJldHVybiB0aGlzLl9fcmVuZGVybW9kdWxlO1xyXG59O1xyXG4iLCIvKiBqc2hpbnQgbm9kZTogdHJ1ZSAqL1xyXG4vKiBnbG9iYWwgd2luZG93OiBmYWxzZSAqL1xyXG4vKiBnbG9iYWwgZG9jdW1lbnQ6IGZhbHNlICovXHJcbid1c2Ugc3RyaWN0JztcclxuXHJcbi8vIGxpc3QgcHJlZml4ZXMgYW5kIGNhc2UgdHJhbnNmb3Jtc1xyXG4vLyAocmV2ZXJzZSBvcmRlciBhcyBhIGRlY3JlbWVudGluZyBmb3IgbG9vcCBpcyB1c2VkKVxyXG52YXIgcHJlZml4ZXMgPSBbXHJcbiAgJ21zJyxcclxuICAnbXMnLCAvLyBpbnRlbnRpb25hbDogMm5kIGVudHJ5IGZvciBtcyBhcyB3ZSB3aWxsIGFsc28gdHJ5IFBhc2NhbCBjYXNlIGZvciBNU1xyXG4gICdPJyxcclxuICAnTW96JyxcclxuICAnV2Via2l0JyxcclxuICAnJ1xyXG5dO1xyXG5cclxudmFyIGNhc2VUcmFuc2Zvcm1zID0gW1xyXG4gIHRvQ2FtZWxDYXNlLFxyXG4gIG51bGwsXHJcbiAgbnVsbCxcclxuICB0b0NhbWVsQ2FzZSxcclxuICBudWxsLFxyXG4gIHRvQ2FtZWxDYXNlXHJcbl07XHJcblxyXG52YXIgcHJvcHMgPSB7fTtcclxudmFyIHN0eWxlO1xyXG5cclxuLyoqXHJcbiAgIyMjIGNzcyhwcm9wKVxyXG5cclxuICBUZXN0IGZvciB0aGUgcHJlc2NlbmNlIG9mIHRoZSBzcGVjaWZpZWQgQ1NTIHByb3BlcnR5IChpbiBhbGwgaXQnc1xyXG4gIHBvc3NpYmxlIGJyb3dzZXIgcHJlZml4ZWQgdmFyaWFudHMpLiAgVGhlIHJldHVybmVkIGZ1bmN0aW9uIChpZiB3ZVxyXG4gIGFyZSBhYmxlIHRvIGFjY2VzcyB0aGUgcmVxdWlyZWQgc3R5bGUgcHJvcGVydHkpIGlzIGJvdGggYSBnZXR0ZXIgYW5kXHJcbiAgc2V0dGVyIGZ1bmN0aW9uIGZvciB3aGVuIGdpdmVuIGFuIGVsZW1lbnQuXHJcblxyXG4gIENvbnNpZGVyIHRoZSBmb2xsb3dpbmcgZXhhbXBsZSwgd2l0aCByZWdhcmRzIHRvIENTUyB0cmFuc2Zvcm1zOlxyXG5cclxuICA8PDwgZXhhbXBsZXMvdHJhbnNmb3JtLmpzXHJcblxyXG4qKi9cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihwcm9wKSB7XHJcbiAgdmFyIGlpO1xyXG4gIHZhciBwcm9wTmFtZTtcclxuICB2YXIgcGFzY2FsQ2FzZU5hbWU7XHJcblxyXG4gIHN0eWxlID0gc3R5bGUgfHwgZG9jdW1lbnQuYm9keS5zdHlsZTtcclxuXHJcbiAgLy8gaWYgd2UgYWxyZWFkeSBoYXZlIGEgdmFsdWUgZm9yIHRoZSB0YXJnZXQgcHJvcGVydHksIHJldHVyblxyXG4gIGlmIChwcm9wc1twcm9wXSB8fCBzdHlsZVtwcm9wXSkge1xyXG4gICAgcmV0dXJuIHByb3BzW3Byb3BdO1xyXG4gIH1cclxuXHJcbiAgLy8gY29udmVydCBhIGRhc2ggZGVsaW1pdGVkIHByb3BlcnR5bmFtZSAoZS5nLiBib3gtc2hhZG93KSBpbnRvXHJcbiAgLy8gcGFzY2FsIGNhc2VkIG5hbWUgKGUuZy4gQm94U2hhZG93KVxyXG4gIHBhc2NhbENhc2VOYW1lID0gcHJvcC5zcGxpdCgnLScpLnJlZHVjZShmdW5jdGlvbihtZW1vLCB2YWwpIHtcclxuICAgIHJldHVybiBtZW1vICsgdmFsLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgdmFsLnNsaWNlKDEpO1xyXG4gIH0sICcnKTtcclxuXHJcbiAgLy8gY2hlY2sgZm9yIHRoZSBwcm9wZXJ0eVxyXG4gIGZvciAoaWkgPSBwcmVmaXhlcy5sZW5ndGg7IGlpLS07ICkge1xyXG4gICAgcHJvcE5hbWUgPSBwcmVmaXhlc1tpaV0gKyAoY2FzZVRyYW5zZm9ybXNbaWldID9cclxuICAgICAgICAgICAgICAgICAgY2FzZVRyYW5zZm9ybXNbaWldKHBhc2NhbENhc2VOYW1lKSA6XHJcbiAgICAgICAgICAgICAgICAgIHBhc2NhbENhc2VOYW1lKTtcclxuXHJcbiAgICBpZiAodHlwZW9mIHN0eWxlW3Byb3BOYW1lXSAhPSAndW5kZWZpbmVkJykge1xyXG4gICAgICBwcm9wc1twcm9wXSA9IGNyZWF0ZUdldHRlclNldHRlcihwcm9wTmFtZSk7XHJcbiAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHByb3BzW3Byb3BdO1xyXG59O1xyXG5cclxuLyogaW50ZXJuYWwgaGVscGVyIGZ1bmN0aW9ucyAqL1xyXG5cclxuZnVuY3Rpb24gY3JlYXRlR2V0dGVyU2V0dGVyKHByb3BOYW1lKSB7XHJcbiAgZnVuY3Rpb24gZ3MoZWxlbWVudCwgdmFsdWUpIHtcclxuICAgIC8vIGlmIHdlIGhhdmUgYSB2YWx1ZSB1cGRhdGVcclxuICAgIGlmICh0eXBlb2YgdmFsdWUgIT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgZWxlbWVudC5zdHlsZVtwcm9wTmFtZV0gPSB2YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWxlbWVudClbcHJvcE5hbWVdO1xyXG4gIH1cclxuXHJcbiAgLy8gYXR0YWNoIHRoZSBwcm9wZXJ0eSBuYW1lIHRvIHRoZSBnZXR0ZXIgYW5kIHNldHRlclxyXG4gIGdzLnByb3BlcnR5ID0gcHJvcE5hbWU7XHJcbiAgcmV0dXJuIGdzO1xyXG59XHJcblxyXG5mdW5jdGlvbiB0b0NhbWVsQ2FzZShpbnB1dCkge1xyXG4gIHJldHVybiBpbnB1dC5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGlucHV0LnNsaWNlKDEpO1xyXG59IiwidmFyIGluc2VydGVkID0ge307XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjc3MsIG9wdGlvbnMpIHtcclxuICAgIGlmIChpbnNlcnRlZFtjc3NdKSByZXR1cm47XHJcbiAgICBpbnNlcnRlZFtjc3NdID0gdHJ1ZTtcclxuICAgIFxyXG4gICAgdmFyIGVsZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xyXG4gICAgZWxlbS5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAndGV4dC9jc3MnKTtcclxuXHJcbiAgICBpZiAoJ3RleHRDb250ZW50JyBpbiBlbGVtKSB7XHJcbiAgICAgIGVsZW0udGV4dENvbnRlbnQgPSBjc3M7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBlbGVtLnN0eWxlU2hlZXQuY3NzVGV4dCA9IGNzcztcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIGhlYWQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaGVhZCcpWzBdO1xyXG4gICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5wcmVwZW5kKSB7XHJcbiAgICAgICAgaGVhZC5pbnNlcnRCZWZvcmUoZWxlbSwgaGVhZC5jaGlsZE5vZGVzWzBdKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaGVhZC5hcHBlbmRDaGlsZChlbGVtKTtcclxuICAgIH1cclxufTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uKGRlY2spIHtcclxuICAgIHZhciBheGlzID0gb3B0aW9ucyA9PSAndmVydGljYWwnID8gJ1knIDogJ1gnLFxyXG4gICAgICBzdGFydFBvc2l0aW9uLFxyXG4gICAgICBkZWx0YTtcclxuXHJcbiAgICBkZWNrLnBhcmVudC5hZGRFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0JywgZnVuY3Rpb24oZSkge1xyXG4gICAgICBpZiAoZS50b3VjaGVzLmxlbmd0aCA9PSAxKSB7XHJcbiAgICAgICAgc3RhcnRQb3NpdGlvbiA9IGUudG91Y2hlc1swXVsncGFnZScgKyBheGlzXTtcclxuICAgICAgICBkZWx0YSA9IDA7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGRlY2sucGFyZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNobW92ZScsIGZ1bmN0aW9uKGUpIHtcclxuICAgICAgaWYgKGUudG91Y2hlcy5sZW5ndGggPT0gMSkge1xyXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICBkZWx0YSA9IGUudG91Y2hlc1swXVsncGFnZScgKyBheGlzXSAtIHN0YXJ0UG9zaXRpb247XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGRlY2sucGFyZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoZW5kJywgZnVuY3Rpb24oKSB7XHJcbiAgICAgIGlmIChNYXRoLmFicyhkZWx0YSkgPiA1MCkge1xyXG4gICAgICAgIGRlY2tbZGVsdGEgPiAwID8gJ3ByZXYnIDogJ25leHQnXSgpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9O1xyXG59O1xyXG4iLCJ2YXIgZnJvbSA9IGZ1bmN0aW9uKHNlbGVjdG9yT3JFbGVtZW50LCBwbHVnaW5zKSB7XHJcbiAgdmFyIHBhcmVudCA9IHNlbGVjdG9yT3JFbGVtZW50Lm5vZGVUeXBlID09PSAxID8gc2VsZWN0b3JPckVsZW1lbnQgOiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yT3JFbGVtZW50KSxcclxuICAgIHNsaWRlcyA9IFtdLmZpbHRlci5jYWxsKHBhcmVudC5jaGlsZHJlbiwgZnVuY3Rpb24oZWwpIHsgcmV0dXJuIGVsLm5vZGVOYW1lICE9PSAnU0NSSVBUJzsgfSksXHJcbiAgICBhY3RpdmVTbGlkZSA9IHNsaWRlc1swXSxcclxuICAgIGxpc3RlbmVycyA9IHt9LFxyXG5cclxuICAgIGFjdGl2YXRlID0gZnVuY3Rpb24oaW5kZXgsIGN1c3RvbURhdGEpIHtcclxuICAgICAgaWYgKCFzbGlkZXNbaW5kZXhdKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmaXJlKCdkZWFjdGl2YXRlJywgY3JlYXRlRXZlbnREYXRhKGFjdGl2ZVNsaWRlLCBjdXN0b21EYXRhKSk7XHJcbiAgICAgIGFjdGl2ZVNsaWRlID0gc2xpZGVzW2luZGV4XTtcclxuICAgICAgZmlyZSgnYWN0aXZhdGUnLCBjcmVhdGVFdmVudERhdGEoYWN0aXZlU2xpZGUsIGN1c3RvbURhdGEpKTtcclxuICAgIH0sXHJcblxyXG4gICAgc2xpZGUgPSBmdW5jdGlvbihpbmRleCwgY3VzdG9tRGF0YSkge1xyXG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCkge1xyXG4gICAgICAgIGZpcmUoJ3NsaWRlJywgY3JlYXRlRXZlbnREYXRhKHNsaWRlc1tpbmRleF0sIGN1c3RvbURhdGEpKSAmJiBhY3RpdmF0ZShpbmRleCwgY3VzdG9tRGF0YSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIHNsaWRlcy5pbmRleE9mKGFjdGl2ZVNsaWRlKTtcclxuICAgICAgfVxyXG4gICAgfSxcclxuXHJcbiAgICBzdGVwID0gZnVuY3Rpb24ob2Zmc2V0LCBjdXN0b21EYXRhKSB7XHJcbiAgICAgIHZhciBzbGlkZUluZGV4ID0gc2xpZGVzLmluZGV4T2YoYWN0aXZlU2xpZGUpICsgb2Zmc2V0O1xyXG5cclxuICAgICAgZmlyZShvZmZzZXQgPiAwID8gJ25leHQnIDogJ3ByZXYnLCBjcmVhdGVFdmVudERhdGEoYWN0aXZlU2xpZGUsIGN1c3RvbURhdGEpKSAmJiBhY3RpdmF0ZShzbGlkZUluZGV4LCBjdXN0b21EYXRhKTtcclxuICAgIH0sXHJcblxyXG4gICAgb24gPSBmdW5jdGlvbihldmVudE5hbWUsIGNhbGxiYWNrKSB7XHJcbiAgICAgIChsaXN0ZW5lcnNbZXZlbnROYW1lXSB8fCAobGlzdGVuZXJzW2V2ZW50TmFtZV0gPSBbXSkpLnB1c2goY2FsbGJhY2spO1xyXG5cclxuICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGxpc3RlbmVyc1tldmVudE5hbWVdID0gbGlzdGVuZXJzW2V2ZW50TmFtZV0uZmlsdGVyKGZ1bmN0aW9uKGxpc3RlbmVyKSB7XHJcbiAgICAgICAgICByZXR1cm4gbGlzdGVuZXIgIT09IGNhbGxiYWNrO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9O1xyXG4gICAgfSxcclxuXHJcbiAgICBmaXJlID0gZnVuY3Rpb24oZXZlbnROYW1lLCBldmVudERhdGEpIHtcclxuICAgICAgcmV0dXJuIChsaXN0ZW5lcnNbZXZlbnROYW1lXSB8fCBbXSlcclxuICAgICAgICAucmVkdWNlKGZ1bmN0aW9uKG5vdENhbmNlbGxlZCwgY2FsbGJhY2spIHtcclxuICAgICAgICAgIHJldHVybiBub3RDYW5jZWxsZWQgJiYgY2FsbGJhY2soZXZlbnREYXRhKSAhPT0gZmFsc2U7XHJcbiAgICAgICAgfSwgdHJ1ZSk7XHJcbiAgICB9LFxyXG5cclxuICAgIGNyZWF0ZUV2ZW50RGF0YSA9IGZ1bmN0aW9uKGVsLCBldmVudERhdGEpIHtcclxuICAgICAgZXZlbnREYXRhID0gZXZlbnREYXRhIHx8IHt9O1xyXG4gICAgICBldmVudERhdGEuaW5kZXggPSBzbGlkZXMuaW5kZXhPZihlbCk7XHJcbiAgICAgIGV2ZW50RGF0YS5zbGlkZSA9IGVsO1xyXG4gICAgICByZXR1cm4gZXZlbnREYXRhO1xyXG4gICAgfSxcclxuXHJcbiAgICBkZWNrID0ge1xyXG4gICAgICBvbjogb24sXHJcbiAgICAgIGZpcmU6IGZpcmUsXHJcbiAgICAgIHNsaWRlOiBzbGlkZSxcclxuICAgICAgbmV4dDogc3RlcC5iaW5kKG51bGwsIDEpLFxyXG4gICAgICBwcmV2OiBzdGVwLmJpbmQobnVsbCwgLTEpLFxyXG4gICAgICBwYXJlbnQ6IHBhcmVudCxcclxuICAgICAgc2xpZGVzOiBzbGlkZXNcclxuICAgIH07XHJcblxyXG4gIChwbHVnaW5zIHx8IFtdKS5mb3JFYWNoKGZ1bmN0aW9uKHBsdWdpbikge1xyXG4gICAgcGx1Z2luKGRlY2spO1xyXG4gIH0pO1xyXG5cclxuICBhY3RpdmF0ZSgwKTtcclxuXHJcbiAgcmV0dXJuIGRlY2s7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICBmcm9tOiBmcm9tXHJcbn07XHJcbiIsbnVsbCwiLy8gUmVxdWlyZSBOb2RlIG1vZHVsZXMgaW4gdGhlIGJyb3dzZXIgdGhhbmtzIHRvIEJyb3dzZXJpZnk6IGh0dHA6Ly9icm93c2VyaWZ5Lm9yZ1xyXG52YXIgYmVzcG9rZSA9IHJlcXVpcmUoJ2Jlc3Bva2UnKSxcclxuICAvL2N1YmUgPSByZXF1aXJlKCdiZXNwb2tlLXRoZW1lLWN1YmUnKSxcclxuICAvL3ZvbHRhaXJlID0gcmVxdWlyZSgnYmVzcG9rZS10aGVtZS12b2x0YWlyZScpLFxyXG4gIC8vdGVybWluYWwgPSByZXF1aXJlKCdiZXNwb2tlLXRoZW1lLXRlcm1pbmFsJyksXHJcbiAgLy9mYW5jeSA9IHJlcXVpcmUoJ2Jlc3Bva2UtdGhlbWUtZmFuY3knKTtcclxuICAvL3NpbXBsZVNsaWRlID0gcmVxdWlyZSgnYmVzcG9rZS10aGVtZS1zaW1wbGUtc2xpZGUnKTtcclxuICAvL21vemlsbGFTYW5kc3RvbmUgPSByZXF1aXJlKCdiZXNwb2tlLXRoZW1lLW1vemlsbGEtc2FuZHN0b25lJyk7XHJcbiAgdHdlYWthYmxlID0gcmVxdWlyZSgnYmVzcG9rZS10aGVtZS10d2Vha2FibGUnKTtcclxuICBrZXlzID0gcmVxdWlyZSgnYmVzcG9rZS1rZXlzJyksXHJcbiAgdG91Y2ggPSByZXF1aXJlKCdiZXNwb2tlLXRvdWNoJyksXHJcbiAgYnVsbGV0cyA9IHJlcXVpcmUoJ2Jlc3Bva2UtYnVsbGV0cycpLFxyXG4gIGJhY2tkcm9wID0gcmVxdWlyZSgnYmVzcG9rZS1iYWNrZHJvcCcpLFxyXG4gIHNjYWxlID0gcmVxdWlyZSgnYmVzcG9rZS1zY2FsZScpLFxyXG4gIGhhc2ggPSByZXF1aXJlKCdiZXNwb2tlLWhhc2gnKSxcclxuICBwcm9ncmVzcyA9IHJlcXVpcmUoJ2Jlc3Bva2UtcHJvZ3Jlc3MnKSxcclxuICBmb3JtcyA9IHJlcXVpcmUoJ2Jlc3Bva2UtZm9ybXMnKTtcclxuXHJcbi8vIEJlc3Bva2UuanNcclxuYmVzcG9rZS5mcm9tKCdhcnRpY2xlJywgW1xyXG4gIC8vY3ViZSgpLFxyXG4gIC8vdm9sdGFpcmUoKSxcclxuICAvL3Rlcm1pbmFsKCksXHJcbiAgLy9mYW5jeSgpLFxyXG4gIC8vc2ltcGxlU2xpZGUoKSxcclxuICAvL21vemlsbGFTYW5kc3RvbmUoKSxcclxuICB0d2Vha2FibGUoKSxcclxuICBrZXlzKCksXHJcbiAgdG91Y2goKSxcclxuICBidWxsZXRzKCdsaSwgLmJ1bGxldCcpLFxyXG4gIGJhY2tkcm9wKCksXHJcbiAgc2NhbGUoKSxcclxuICBoYXNoKCksXHJcbiAgcHJvZ3Jlc3MoKSxcclxuICBmb3JtcygpXHJcbl0pO1xyXG5cclxuLy8gUHJpc20gc3ludGF4IGhpZ2hsaWdodGluZ1xyXG4vLyBUaGlzIGlzIGFjdHVhbGx5IGxvYWRlZCBmcm9tIFwiYm93ZXJfY29tcG9uZW50c1wiIHRoYW5rcyB0b1xyXG4vLyBkZWJvd2VyaWZ5OiBodHRwczovL2dpdGh1Yi5jb20vZXVnZW5ld2FyZS9kZWJvd2VyaWZ5XHJcbnJlcXVpcmUoXCIuLy4uXFxcXC4uXFxcXGJvd2VyX2NvbXBvbmVudHNcXFxccHJpc21cXFxccHJpc20uanNcIik7XHJcblxyXG4iXX0=
>>>>>>> eed453b424ec04eac42ce467ec721e87e75a1574
