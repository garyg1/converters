/*
Useful format converters.
Copyright (C) 2026 Gary Gurlaskie

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, version 3.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * JSON formatter that captures a mapping from the formatted string to the input object.
 * @param {any} object
 * @param {number} indent
 * @param {number} lineLength
 * @returns {{ json: string, contexts: [{ ctx: string[], pos: [number, number] }]}}
 */
function prettifyJsonWithContext(object, indent, lineLength) {
  const ARRAY_SEP = ", ";
  const ARRAY_NEWLINE_SEP = ",\n";
  const OBJ_KV_SEP = ": ";

  /**
   *
   * @param {any} o
   * @returns {o is any[]}
   */
  function isArray(o) {
    return Array.isArray(o);
  }

  /**
   * @param {any} o
   * @returns {o is Object<string, any>}
   */
  function isObject(o) {
    // https://stackoverflow.com/questions/8511281/check-if-a-value-is-an-object-in-javascript
    return typeof o === "object" && o !== null;
  }

  /** @param {number[]} arr */
  function sumArray(arr) {
    return arr.reduce((s, e) => s + e, 0);
  }

  const singleLineLengths = {};
  function getSingleLineLength(o) {
    let ans = 0;
    if (isArray(o)) {
      ans = sumArray(o.map((e) => getSingleLineLength(e) + ARRAY_SEP.length));
      ans += "[]".length;
      if (o.length > 0) {
        ans -= ARRAY_SEP.length;
      }
    } else if (isObject(o)) {
      ans = sumArray(
        Object.entries(o).map(
          (kv) =>
            JSON.stringify(kv[0]).length +
            OBJ_KV_SEP.length +
            getSingleLineLength(kv[1]) +
            ARRAY_SEP.length,
        ),
      );
      ans += "{  }".length;
      if (Object.keys(o).length > 0) {
        ans -= ARRAY_SEP.length;
      }
    } else {
      ans = JSON.stringify(o).length;
    }

    singleLineLengths[o] = ans;
    return ans;
  }

  const contextAwareCapturer = () => {
    /** @type {string[]} */
    let tokens = [];
    /** @type {{ ctx: any, pos: [number, number]}} */
    let contexts = [];
    /** @type {object[]} */
    let contextStack = [];
    let currLen = 0;
    return {
      emitContext: (x) => {
        const newLen = currLen + x.length;
        contexts.push({
          ctx: contextStack.slice(),
          pos: [currLen, newLen],
          token: x,
        });
        tokens.push(x);
        currLen = newLen;
      },
      emit: (x) => {
        const newLen = currLen + x.length;
        tokens.push(x);
        currLen = newLen;
      },
      retract: () => {
        const x = tokens.pop();
        contexts.pop();
        currLen -= x.length;
      },
      str: () => {
        return tokens.join("");
      },
      pushContext: (ctx) => {
        contextStack.push(ctx);
      },
      popContext: () => {
        return contextStack.pop();
      },
      contexts: () => contexts,
    };
  };

  /**
   * @param {any[]} arr
   */
  function* enumerate(arr) {
    for (let i = 0; i < arr.length; i++) {
      yield [i, arr[i]];
    }
  }

  /**
   * @param {any} currentNode
   * @param {number} currIndent
   * @param {number} nextIndent
   * @param {boolean} forceSingleLine
   * @param {ReturnType<contextAwareCapturer>} output
   * @returns {string}
   */
  function getPrettyRepresentation(
    currentNode,
    currIndent,
    nextIndent,
    forceSingleLine,
    output,
  ) {
    const currLineWidth = lineLength - currIndent;
    const nextLineWidth = lineLength - nextIndent;
    if (isArray(currentNode)) {
      if (getSingleLineLength(currentNode) < currLineWidth || forceSingleLine) {
        output.emit("[");
        for (const [i, e] of enumerate(currentNode)) {
          output.pushContext(i);
          getPrettyRepresentation(e, 0, 0, true, output);
          output.popContext();
          if (i < currentNode.length - 1) {
            output.emit(ARRAY_SEP);
          }
        }
        output.emit("]");
      } else if (getSingleLineLength(currentNode) + indent < nextLineWidth) {
        output.emit("[\n");
        output.emit(" ".repeat(nextIndent + indent));
        for (const [i, e] of enumerate(currentNode)) {
          output.pushContext(i);
          getPrettyRepresentation(e, 0, 0, true, output);
          output.popContext();
          if (i < currentNode.length - 1) {
            output.emit(ARRAY_SEP);
          }
        }

        output.emit("\n");
        output.emit(" ".repeat(nextIndent));
        output.emit("]");
      } else {
        output.emit("[\n");
        for (const [i, e] of enumerate(currentNode)) {
          output.emit(" ".repeat(nextIndent + indent));
          output.pushContext(i);
          getPrettyRepresentation(
            e,
            nextIndent + indent,
            nextIndent + indent,
            false,
            output,
          );
          output.popContext();
          if (i < currentNode.length - 1) {
            output.emit(ARRAY_NEWLINE_SEP);
          }
        }

        output.emit("\n");

        output.emit(" ".repeat(nextIndent));
        output.emit("]");
      }
    } else if (isObject(currentNode)) {
      if (getSingleLineLength(currentNode) < currLineWidth || forceSingleLine) {
        output.emit("{ ");
        const entries = Object.entries(currentNode);
        for (const [i, kvp] of enumerate(entries)) {
          output.pushContext([kvp[0], "key"]);
          getPrettyRepresentation(kvp[0], 0, 0, true, output);
          output.emit(OBJ_KV_SEP);
          output.popContext();
          output.pushContext([kvp[0], "value"]);
          getPrettyRepresentation(kvp[1], 0, 0, true, output);
          output.popContext();

          if (i < entries.length - 1) {
            output.emit(ARRAY_SEP);
          }
        }

        output.emit(" }");
      } else {
        output.emit("{\n");
        const entries = Object.entries(currentNode);
        for (const [i, [k, v]] of enumerate(entries)) {
          output.emit(" ".repeat(nextIndent + indent));
          output.pushContext([k, "key"]);
          output.emitContext(JSON.stringify(k));
          output.popContext();
          output.emit(OBJ_KV_SEP);

          output.pushContext([k, "value"]);
          getPrettyRepresentation(
            v,
            nextIndent + indent + JSON.stringify(k).length + OBJ_KV_SEP.length,
            nextIndent + indent,
            false,
            output,
          );
          output.popContext();
          if (i < entries.length - 1) {
            output.emit(ARRAY_NEWLINE_SEP);
          }
        }
        output.emit("\n");

        output.emit(" ".repeat(nextIndent));
        output.emit("}");
      }
    } else {
      output.emitContext(JSON.stringify(currentNode));
    }
  }

  const output = contextAwareCapturer();
  getPrettyRepresentation(object, 0, 0, false, output);
  const trimmedResult = output.str();
  return { json: trimmedResult, contexts: output.contexts() };
}

/**
 * @param {any} object
 * @param {number} indent
 * @param {number} lineLength
 * @returns {string}
 */
function prettifyJson(object, indent, lineLength) {
  return prettifyJsonWithContext(object, indent, lineLength).json;
}

function test() {
  for (let i = 60; i >= 10; i -= 1) {
    console.log("-".repeat(i));
    console.log(prettifyJson([1, 2, 3, [4, 5, [6, 7, 8]], "9"], 4, i));
  }

  for (let i = 100; i >= 10; i -= 2) {
    console.log("-".repeat(i));
    const result = prettifyJson(
      {
        "the quick brown fox": {
          jumps: "over",
          "the lazy": ["d", "o", "g"],
        },
      },
      4,
      i,
    );
    try {
      JSON.parse(result);
    } catch (e) {
      console.error("Invalid JSON", e);
      throw e;
    }
    console.log(result);
  }
}

const jsonFormatterConverter = {
  name: "JSON Formatter",
  args: [
    {
      name: "json",
      type: "textarea",
      default:
        '{"the quick brown fox":{"jumps over":{"the lazy":["d","o","g"],"the sleeping":["c","a","t"]},"sneaks under":{"the tall":["g","i","r","a","f","f","e"]}}}',
      parseFn: (value) => {
        const exceptions = {};
        try {
          const obj = JSON.parse(value);
          return { success: true, value: obj };
        } catch (e) {
          exceptions["json"] = e;
        }

        try {
          const objs = value
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s)
            .map((s) => JSON.parse(s));

          if (objs.length === 0) {
            return {
              success: false,
              value: null,
              info: "no input",
            };
          }

          return {
            success: true,
            value: objs,
            info: "from JSON Lines",
          };
        } catch (e) {
          exceptions["json-lines"] = e;
        }

        return {
          value: null,
          success: false,
          error: "invalid JSON and JSON-lines",
          consoleError: [
            "Failed to parse " + Object.keys(exceptions),
            exceptions,
          ],
        };
      },
    },
    {
      name: "indent",
      type: "integer",
      default: "4",
    },
    {
      name: "lineLength",
      type: "integer",
      default: "80",
    },
  ],
  converterFn: (obj) => {
    return {
      success: true,
      value: prettifyJson(obj.json, obj.indent, obj.lineLength),
    };
  },
};
