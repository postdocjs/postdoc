// -----------------
// dox licence
// -----------------
// (The MIT License)
//
// Copyright (c) 2011 TJ Holowaychuk &lt;tj@vision-media.ca&gt;
//
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// 'Software'), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import {parse, publish, createDefaultPublisher, NodeType, SyntaxType} from 'jsdoctypeparser';

/*!
 * Removes excess indentation from string of code.
 *
 * @param {String} str
 * @return {String}
 */

const trimIndentation = function (str) {
  // Find indentation from first line of code.
  const indent = str.match(/(?:^|\n)([ \t]*)[^\s]/);
  if (indent) {
    // Replace indentation on all lines.
    str = str.replace(new RegExp('(^|\n)' + indent[1], 'g'), '$1');
  }
  return str;
};

/**
 * Parse the given comment `str`.
 *
 * The comment object returned contains the following
 *
 *  - `tags`  array of tag objects
 *  - `description` the first line of the comment
 *  - `body` lines following the description
 *  - `content` both the description and the body
 *  - `isPrivate` true when "@api private" is used
 *
 * @param {String} str
 * @param {Object} options
 * @return {Object}
 * @see exports.parseTag
 */

const parseComment = async function (str, options) {
  str = str.trim();
  options = options || {};
  const { markdownCompiler } = options;

  let comment = {tags: []};
  let raw = options.raw;
  let description = {};
  let tags = str.split(/\n\s*@/);

  // A comment has no description
  if (tags[0].charAt(0) === '@') {
    tags.unshift('');
  }

  // parse comment body
  description.full = tags[0];
  description.summary = description.full.split('\n\n')[0];
  description.body = description.full.split('\n\n').slice(1).join('\n\n');
  comment.description = description;

  // parse tags
  if (tags.length) {
    comment.tags = tags.slice(1).map(parseTag);
    comment.isPrivate = comment.tags.some(function (tag) {
      return 'private' == tag.visibility;
    });
    comment.isConstructor = comment.tags.some(function (tag) {
      return 'constructor' == tag.type || 'augments' == tag.type;
    });
    comment.isClass = comment.tags.some(function (tag) {
      return 'class' == tag.type;
    });
    comment.isEvent = comment.tags.some(function (tag) {
      return 'event' == tag.type;
    });

    if (!description.full || !description.full.trim()) {
      comment.tags.some(function (tag) {
        if ('description' === tag.type) {
          description.full = tag.full;
          description.summary = tag.summary;
          description.body = tag.body;
          return true;
        }
      });
    }
  }

  // markdown
  if (!raw) {
    let contentFull = description.full;
    let contentSummary = description.summary;
    let contentBody = description.body;
    if (Array.isArray(contentFull) && typeof contentFull[1] == 'string') {
      contentFull = contentFull[1];
    }

    if (Array.isArray(contentSummary) && typeof contentSummary[1] == 'string') {
      contentSummary = contentSummary[1];
    }

    if (Array.isArray(contentBody) && typeof contentBody[1] == 'string') {
      contentBody = contentBody[1];
    }

    description.full = await markdownCompiler.parse(contentFull);
    description.summary = await markdownCompiler.parse(contentSummary);
    description.body = await markdownCompiler.parse(contentBody);

    for (const tag of comment.tags) {
      if (tag.description) {
        tag.description = await markdownCompiler.parse(tag.description);
      } else {
        tag.html = await markdownCompiler.parse(tag.string);
      }
    }
  }

  return comment;
};

//TODO: Find a smarter way to do this
/**
 * Extracts different parts of a tag by splitting string into pieces separated by whitespace. If the white spaces are
 * somewhere between curly braces (which is used to indicate param/return type in JSDoc) they will not be used to split
 * the string. This allows to specify jsdoc tags without the need to eliminate all white spaces i.e. {number | string}
 *
 * @param str The tag line as a string that needs to be split into parts
 * @returns {Array.<string>} An array of strings containing the parts
 */

const extractTagParts = function (str) {
  var level = 0; var extract = ''; var split = [];

  str.split('').forEach(function (c) {
    if (c.match(/\s/) && level === 0) {
      split.push(extract);
      extract = '';
    } else {
      if (c === '{') {
        level++;
      } else if (c === '}') {
        level--;
      }

      extract += c;
    }
  });

  split.push(extract);
  return split.filter(function (str) {
    return str.length > 0;
  });
};


/**
 * Parse tag string "@param {Array} name description" etc.
 *
 * @param {String}
 * @return {Object}
 * @api public
 */

const parseTag = function (str) {
  var tag = {}; var lines = str.split('\n'); var parts = extractTagParts(lines[0]);
  var type = tag.type = parts.shift().replace('@', ''); var matchType = new RegExp('^@?' + type + ' *');
  var matchTypeStr = /^\{.+\}$/;

  tag.string = str.replace(matchType, '');

  if (lines.length > 1) {
    parts.push(lines.slice(1).join('\n'));
  }

  switch (type) {
    case 'property':
    case 'template':
    case 'param':
      var typeString = matchTypeStr.test(parts[0]) ? parts.shift() : '';
      tag.name = parts.shift() || '';
      tag.description = parts.join(' ');
      parseTagTypes(typeString, tag);
      break;
    case 'define':
    case 'return':
    case 'returns':
      var typeString = matchTypeStr.test(parts[0]) ? parts.shift() : '';
      parseTagTypes(typeString, tag);
      tag.description = parts.join(' ');
      break;
    case 'see':
      if (~str.indexOf('http')) {
        tag.title = parts.length > 1 ? parts.shift() : '';
        tag.url = parts.join(' ');
      } else {
        tag.local = parts.join(' ');
      }
      break;
    case 'api':
      tag.visibility = parts.shift();
      break;
    case 'public':
    case 'private':
    case 'protected':
      tag.visibility = type;
      break;
    case 'enum':
    case 'typedef':
    case 'type':
      parseTagTypes(parts.shift(), tag);
      break;
    case 'lends':
    case 'memberOf':
      tag.parent = parts.shift();
      break;
    case 'extends':
    case 'implements':
    case 'augments':
      tag.otherClass = parts.shift();
      break;
    case 'borrows':
      tag.otherMemberName = parts.join(' ').split(' as ')[0];
      tag.thisMemberName = parts.join(' ').split(' as ')[1];
      break;
    case 'throws':
      var typeString = matchTypeStr.test(parts[0]) ? parts.shift() : '';
      tag.types = parseTagTypes(typeString);
      tag.description = parts.join(' ');
      break;
    case 'description':
      tag.full = parts.join(' ').trim();
      tag.summary = tag.full.split('\n\n')[0];
      tag.body = tag.full.split('\n\n').slice(1).join('\n\n');
      break;
    default:
      tag.string = parts.join(' ').replace(/\s+$/, '');
      break;
  }

  return tag;
};

/**
 * Parse tag type string "{Array|Object}" etc.
 * This function also supports complex type descriptors like in jsDoc or even the enhanced syntax used by the
 * [google closure compiler](https://developers.google.com/closure/compiler/docs/js-for-compiler#types)
 *
 * The resulting array from the type descriptor `{number|string|{name:string,age:number|date}}` would look like this:
 *
 *     [
 *       'number',
 *       'string',
 *       {
 *         age: ['number', 'date'],
 *         name: ['string']
 *       }
 *     ]
 *
 * @param {String} str
 * @return {Array}
 * @api public
 */

const parseTagTypes = function (str, tag) {
  if (!str) {
    if (tag) {
      tag.types = [];
      tag.typesDescription = '';
      tag.optional = tag.nullable = tag.nonNullable = tag.variable = false;
    }
    return [];
  }

  const result = parse(str.substring(1, str.length - 1));

  const customPublisher = Object.assign({}, createDefaultPublisher(), {
    NAME(nameNode) {
      let output = '<code>' + nameNode.name + '</code>';

      if (result.type === NodeType.OPTIONAL) {
        output += '|<code>undefined</code>';
      } else if (result.type === NodeType.NULLABLE) {
        output += '|<code>null</code>';
      }

      return output;
    }
  });

  var types = (function transform(type) {
    if (type && type.type === NodeType.UNION) {
      return [transform(type.left), transform(type.right)].flat();
    }

    if (type && type.type === NodeType.NAME) {
      return [type.name];
    }

    if (type && type.type === NodeType.RECORD) {
      return [type.entries.reduce(function (obj, entry) {
        obj[entry.key] = transform(entry.value);
        return obj;
      }, {})];
    }

    if (type && type.type === NodeType.GENERIC) {
      if (type.meta.syntax === SyntaxType.GenericTypeSyntax.ANGLE_BRACKET) {
        return [type.subject.name + '<' + transform(type.objects[0]).join('|') + '>'];
      }

      if (type.meta.syntax === SyntaxType.GenericTypeSyntax.ANGLE_BRACKET_WITH_DOT) {
        return [type.subject.name + '.<' + transform(type.objects[0]).join('|') + '>'];
      }

      if (type.meta.syntax === SyntaxType.GenericTypeSyntax.SQUARE_BRACKET) {
        return [type.subject.name + '[' + transform(type.objects[0]).join('|') + ']'];
      }

      if (type.meta.syntax === SyntaxType.VariadicTypeSyntax.PREFIX_DOTS) {
        return [`...${type.subject.name}`];
      }

      if (type.meta.syntax === SyntaxType.VariadicTypeSyntax.SUFFIX_DOTS) {
        return [`${type.subject.name}...`];
      }

      if (type.meta.syntax === SyntaxType.VariadicTypeSyntax.ONLY_DOTS) {
        return ['...'];
      }

      return [type.subject.name];
    }

    if (type && type.value) {
      return transform(type.value);
    }

    return type.toString();
  }(result));

  if (tag) {
    tag.types = types;
    tag.typesDescription = publish(result, customPublisher).replace(/^\?|=$/, '');
    tag.optional = (tag.name && tag.name.slice(0, 1) === '[') || result.type === NodeType.OPTIONAL;
    tag.nullable = result.type === NodeType.NULLABLE;
    tag.nonNullable = result.meta ? result.meta.syntax === 'SUFFIX_QUESTION_MARK' || result.meta.syntax === 'PREFIX_BANG' : false;
    tag.variable = result.type === NodeType.VARIADIC;
  }

  return types;
};

/**
 * Determine if a parameter is optional.
 *
 * Examples:
 * JSDoc: {Type} [name]
 * Google: {Type=} name
 * TypeScript: {Type?} name
 *
 * @param {Object} tag
 * @return {Boolean}
 */

export const parseParamOptional = function (tag) {
  const lastTypeChar = tag.types.slice(-1)[0].slice(-1);

  return tag.name.slice(0, 1) === '[' || lastTypeChar === '=' || lastTypeChar === '?';
};

/**
 * Parse the context from the given `str` of js.
 *
 * This method attempts to discover the context
 * for the comment based on it's code. Currently
 * supports:
 *
 *   - classes
 *   - class constructors
 *   - class methods
 *   - function statements
 *   - function expressions
 *   - prototype methods
 *   - prototype properties
 *   - methods
 *   - properties
 *   - declarations
 *
 * @param {String} str
 * @param {Object=} parentContext An indication if we are already in something. Like a namespace or an inline declaration.
 * @return {Object}
 */

const parseCodeContext = function (str, parentContext) {
  parentContext = parentContext || {};

  let ctx;

  // loop through all context matchers, returning the first successful match
  return contextPatternMatchers.some(function (matcher) {
    return ctx = matcher(str, parentContext);
  }) && ctx;
};

const contextPatternMatchers = [
  function (str) {
    // class, possibly exported by name or as a default
    if (/^\s*(export(\s+default)?\s+)?class\s+([\w$]+)(\s+extends\s+([\w$.]+(?:\(.*\))?))?\s*{/.exec(str)) {
      return {
        type: 'class',
        constructor: RegExp.$3,
        cons: RegExp.$3,
        name: RegExp.$3,
        extends: RegExp.$5,
        string: 'new ' + RegExp.$3 + '()'
      };
    }
  },

  function (str, parentContext) {
    // class constructor
    if (/^\s*constructor\s*\(/.exec(str)) {
      return {
        type: 'constructor',
        constructor: parentContext.name,
        cons: parentContext.name,
        name: 'constructor',
        string: (parentContext && parentContext.name && parentContext.name + '.prototype.' || '') + 'constructor()'
      };
      // class method
    }
  },

  function (str, parentContext) {
    if (/^\s*(static)?\s*(\*)?\s*([\w$]+|\[.*\])\s*\(/.exec(str)) {
      return {
        type: 'method',
        constructor: parentContext.name,
        cons: parentContext.name,
        name: RegExp.$2 + RegExp.$3,
        string: (parentContext && parentContext.name && parentContext.name + (RegExp.$1 ? '.' : '.prototype.') || '') + RegExp.$2 + RegExp.$3 + '()'
      };
      // named function statement, possibly exported by name or as a default
    }
  },

  function (str) {
    if (/^\s*(export(\s+default)?\s+)?function\s+([\w$]+)\s*\(/.exec(str)) {
      return {
        type: 'function', name: RegExp.$3, string: RegExp.$3 + '()'
      };
    }
  },

  function (str) {
    // anonymous function expression exported as a default
    if (/^\s*export\s+default\s+function\s*\(/.exec(str)) {
      return {
        type: 'function', name: RegExp.$1, // undefined
        string: RegExp.$1 + '()'
      };
    }
  },

  function (str) {
    // function expression
    if (/^return\s+function(?:\s+([\w$]+))?\s*\(/.exec(str)) {
      return {
        type: 'function', name: RegExp.$1, string: RegExp.$1 + '()'
      };
    }
  },

  function (str) {
    // function expression
    if (/^\s*(?:const|let|var)\s+([\w$]+)\s*=\s*function/.exec(str)) {
      return {
        type: 'function', name: RegExp.$1, string: RegExp.$1 + '()'
      };
    }
  },

  function (str, parentContext) {
    // prototype method
    if (/^\s*([\w$.]+)\s*\.\s*prototype\s*\.\s*([\w$]+)\s*=\s*function/.exec(str)) {
      return {
        type: 'method',
        constructor: RegExp.$1,
        cons: RegExp.$1,
        name: RegExp.$2,
        string: RegExp.$1 + '.prototype.' + RegExp.$2 + '()'
      };
    }
  },

  function (str) {
    // prototype property
    if (/^\s*([\w$.]+)\s*\.\s*prototype\s*\.\s*([\w$]+)\s*=\s*([^\n;]+)/.exec(str)) {
      return {
        type: 'property',
        constructor: RegExp.$1,
        cons: RegExp.$1,
        name: RegExp.$2,
        value: RegExp.$3.trim(),
        string: RegExp.$1 + '.prototype.' + RegExp.$2
      };
    }
  },

  function (str) {
    // prototype property without assignment
    if (/^\s*([\w$]+)\s*\.\s*prototype\s*\.\s*([\w$]+)\s*/.exec(str)) {
      return {
        type: 'property',
        constructor: RegExp.$1,
        cons: RegExp.$1,
        name: RegExp.$2,
        string: RegExp.$1 + '.prototype.' + RegExp.$2
      };
    }
  },

  function (str) {
    // inline prototype
    if (/^\s*([\w$.]+)\s*\.\s*prototype\s*=\s*{/.exec(str)) {
      return {
        type: 'prototype', constructor: RegExp.$1, cons: RegExp.$1, name: RegExp.$1, string: RegExp.$1 + '.prototype'
      };
    }
  },

  function (str, parentContext) {
    // inline method
    if (/^\s*([\w$.]+)\s*:\s*function/.exec(str)) {
      return {
        type: 'method',
        constructor: parentContext.name,
        cons: parentContext.name,
        name: RegExp.$1,
        string: (parentContext && parentContext.name && parentContext.name + '.prototype.' || '') + RegExp.$1 + '()'
      };
    }
  },

  function (str, parentContext) {
    // inline property
    if (/^\s*([\w$.]+)\s*:\s*([^\n;]+)/.exec(str)) {
      return {
        type: 'property',
        constructor: parentContext.name,
        cons: parentContext.name,
        name: RegExp.$1,
        value: RegExp.$2.trim(),
        string: (parentContext && parentContext.name && parentContext.name + '.' || '') + RegExp.$1
      };
    }
  },

  function (str, parentContext) {
    // inline getter/setter
    if (/^\s*(get|set)\s*([\w$.]+)\s*\(/.exec(str)) {
      return {
        type: 'property',
        constructor: parentContext.name,
        cons: parentContext.name,
        name: RegExp.$2,
        string: (parentContext && parentContext.name && parentContext.name + '.prototype.' || '') + RegExp.$2
      };
    }
  },

  function (str) {
    // method
    if (/^\s*([\w$.]+)\s*\.\s*([\w$]+)\s*=\s*function/.exec(str)) {
      return {
        type: 'method', receiver: RegExp.$1, name: RegExp.$2, string: RegExp.$1 + '.' + RegExp.$2 + '()'
      };
    }
  },

  function (str) {
    // property
    if (/^\s*([\w$.]+)\s*\.\s*([\w$]+)\s*=\s*([^\n;]+)/.exec(str)) {
      return {
        type: 'property',
        receiver: RegExp.$1,
        name: RegExp.$2,
        value: RegExp.$3.trim(),
        string: RegExp.$1 + '.' + RegExp.$2
      };
    }
  },

  function (str) {
    // declaration
    if (/^\s*(?:const|let|var)\s+([\w$]+)\s*=\s*([^\n;]+)/.exec(str)) {
      return {
        type: 'declaration', name: RegExp.$1, value: RegExp.$2.trim(), string: RegExp.$1
      };
    }
  }];

/**
 * Parse comments in the given string of `js`.
 *
 * @param {String} js
 * @param {Object} options
 * @return Promise<Array>
 * @see exports.parseComment
 * @api public
 */

export const parseComments = async function (js, options) {
  options = options || {};
  js = js.replace(/\r\n/gm, '\n');

  let comments = [];
  let skipSingleStar = options.skipSingleStar;
  let comment;
  let buf = '';
  let ignore;
  let withinMultiline = false;
  let withinSingle = false;
  let withinString = false;
  let code;
  let linterPrefixes = options.skipPrefixes || ['jslint', 'jshint', 'eshint'];
  let skipPattern = new RegExp('^' + (options.raw ? '' : '<p>') + '(' + linterPrefixes.join('|') + ')');
  let lineNum = 1;
  let lineNumStarting = 1;
  let parentContext;
  let withinEscapeChar;
  let currentStringQuoteChar;

  for (let i = 0, len = js.length; i < len; ++i) {
    withinEscapeChar = withinString && !withinEscapeChar && js[i - 1] == '\\';

    // start comment
    if (!withinMultiline && !withinSingle && !withinString && '/' == js[i] && '*' == js[i + 1] && (!skipSingleStar || js[i + 2] == '*')) {
      lineNumStarting = lineNum;
      // code following the last comment
      if (buf.trim().length) {
        comment = comments[comments.length - 1];
        if (comment) {
          // Adjust codeStart for any vertical space between comment and code
          comment.codeStart += buf.match(/^(\s*)/)[0].split('\n').length - 1;
          comment.code = code = trimIndentation(buf).trim();
          comment.ctx = parseCodeContext(code, parentContext);

          if (comment.isConstructor && comment.ctx) {
            comment.ctx.type = 'constructor';
          }

          // starting a new namespace
          if (comment.ctx && (comment.ctx.type === 'prototype' || comment.ctx.type === 'class')) {
            parentContext = comment.ctx;
          }
            // reasons to clear the namespace
          // new property/method in a different constructor
          else if (!parentContext || !comment.ctx || !comment.ctx.constructor || !parentContext.constructor || parentContext.constructor !== comment.ctx.constructor) {
            parentContext = null;
          }
        }
        buf = '';
      }
      i += 2;
      withinMultiline = true;
      ignore = '!' == js[i];

      // if the current character isn't whitespace and isn't an ignored comment,
      // back up one character so we don't clip the contents
      if (' ' !== js[i] && '\n' !== js[i] && '\t' !== js[i] && '!' !== js[i]) {
        i--;
      }

      // end comment
    } else if (withinMultiline && !withinSingle && '*' == js[i] && '/' == js[i + 1]) {
      i += 2;
      buf = buf.replace(/^[ \t]*\* ?/gm, '');
      comment = await parseComment(buf, options);
      comment.ignore = ignore;
      comment.line = lineNumStarting;
      comment.codeStart = lineNum + 1;
      let content = comment.description.full;
      if (Array.isArray(content) && content[1]) {
        content = content[1];
      }

      if ((typeof content == 'string') && !content.match(skipPattern)) {
        comments.push(comment);
      }

      withinMultiline = ignore = false;
      buf = '';
    } else if (!withinSingle && !withinMultiline && !withinString && '/' == js[i] && '/' == js[i + 1]) {
      withinSingle = true;
      buf += js[i];
    } else if (withinSingle && !withinMultiline && '\n' == js[i]) {
      withinSingle = false;
      buf += js[i];
    } else if (!withinSingle && !withinMultiline && !withinEscapeChar && ('\'' == js[i] || '"' == js[i] || '`' == js[i])) {
      if (withinString) {
        if (js[i] == currentStringQuoteChar) {
          withinString = false;
        }
      } else {
        withinString = true;
        currentStringQuoteChar = js[i];
      }

      buf += js[i];
    } else {
      buf += js[i];
    }

    if ('\n' == js[i]) {
      lineNum++;
    }

  }

  if (comments.length === 0) {
    comments.push({
      tags: [],
      description: {full: '', summary: '', body: ''},
      isPrivate: false,
      isConstructor: false,
      line: lineNumStarting
    });
  }

  // trailing code
  if (buf.trim().length) {
    comment = comments[comments.length - 1];
    // Adjust codeStart for any vertical space between comment and code
    comment.codeStart += buf.match(/^(\s*)/)[0].split('\n').length - 1;
    comment.code = code = trimIndentation(buf).trim();
    comment.ctx = parseCodeContext(code, parentContext);
  }

  return comments;
};
