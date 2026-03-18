import Parser from 'stacktrace-parser';
import fs from 'fs';

const stackTraceFilter = function (parts) {
  const stack = parts.reduce(function(list, line) {
    if (contains(line, [
      'node_modules',
      '(node.js:',
      '(timers.js:',
      '(events.js:',
      '(util.js:',
      '(net.js:',
      '(internal/process/',
      'internal/modules/cjs/loader.js',
      'internal/modules/cjs/helpers.js',
      'internal/timers.js',
      '_http_client.js:',
      'process._tickCallback',
      'node:internal/'
    ])) {
      return list;
    }

    list.push(line);

    return list;
  }, []);

  return stack;
};

const contains = function(str, text) {
  if (Array.isArray(text)) {
    for (let i = 0; i < text.length; i++) {
      if (contains(str, text[i])) {
        return true;
      }
    }
  }

  return str.includes(text);
};

const stackTraceLineRegex = /^\s*at .*(\s+\((?:[a-zA-Z]:)?[^:]+:\d+:\d+\)|\s+(?:[a-zA-Z]:)?[^:]+:\d+:\d+)$/;

const removeNonStackTraceLines = function(stackTrace) {
  return stackTrace.filter((line) => stackTraceLineRegex.test(line));
};

function beautifyStackTrace(errorStack, startIndex = null) {
  try {
    const parsedStacks = Parser.parse(errorStack.join('\n'));
    const parsedStack = parsedStacks[0];
    const file = fs.readFileSync(parsedStack.file.replace(/"/g, ''), 'utf-8');
    const errorLinesofFile = file.split(/\r?\n/);

    const formattedStack = formatStackTrace(errorLinesofFile, parsedStack, startIndex);
    const desiredLines = formattedStack.codeSnippet.reduce(function(lines, newLine) {
      const currentLine = newLine.line_number;
      lines += `\n     ${currentLine} | ${newLine.code}`;

      return lines;
    }, '');

    const delimiter = (new Array(parsedStack.file.length + 3).join('–'));

    return '    at '  + parsedStack.file.replace(/"/g, '') + `:${formattedStack.error_line_number}\n    ` + delimiter + desiredLines + '\n    ' + delimiter + '\n';
  } catch (err) {
    return '';
  }
}

function formatStackTrace(errorLinesofFile, parsedStack, startIndex = null) {
  const result = {
    filePath: parsedStack.file,
    error_line_number: parsedStack.lineNumber,
    codeSnippet: []
  };

  const lineNumber = startIndex ?? parsedStack.lineNumber;

  errorLinesofFile.reduce(function(lines, newLine, lineIndex) {
    const currentLine = lineIndex + 1;
    if (currentLine <= (lineNumber + 4) && currentLine >= (lineNumber - 4)) {
      result.codeSnippet.push({
        line_number: currentLine,
        code: newLine
      });
    }
  }, '');

  return result;
}

const getStartIndex = function(err) {
  switch (err.code) {
    case 'ERR_REQUIRE_ESM':
      return 0;
  }

  return null
};

export const filterStackTrace = function(err, beautify = false, startIndex = null) {
  if (err instanceof Error) {
    const stackTrace = err.stack.split('\n').slice(1);

    const filtered = stackTraceFilter(stackTrace);
    const stack = removeNonStackTraceLines(filtered);

    if (beautify) {
      const index = startIndex ?? getStartIndex(err);

      return beautifyStackTrace(stack, index);
    }

    return stack.join('\n');
  }

  return '';
};


