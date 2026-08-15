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
 * @typedef {{ ownerName: string, modelName: string?, files: string[], branch: string? }} HFUrlMeta
 */

const _hf_type_include = "hf download with --include";
const _hf_type_file = "hf download command";
const _hf_type_direct = "direct download URL";
const _hf_type_direct_wget = "direct download URL (wget)";

/**
 * parses urls of the form
 *
 * @param {string} input
 * @returns {HFUrlMeta}
 */
function tryParseUrls(input) {
  const tokens = input
    .split(/[\s'"]+/)
    .map((it) => it.trim())
    .filter((it) => it.length > 0);
  const parsedUrls = [];
  const skippedTokens = [];
  for (const token of tokens) {
    try {
      let curr = token;
      if (!/[a-z0-9]+:\/\//i.test(curr)) {
        curr = "https://" + curr;
      }
      const url = new URL(curr);
      let ownerName = null;
      let modelName = null;
      let branchName = null;
      let filePath = null;
      const pathParts = url.pathname.split("/").filter(Boolean) ?? [];
      if (
        /huggingface.com?/i.test(url.hostname) &&
        ["blob", "resolve"].some((it) => url.pathname.includes(it))
      ) {
        // huggingface.co/<owner>/<model>/blob|resolve/<branch>/<filePath...>
        ownerName = pathParts[0] ?? null;
        modelName = pathParts[1] ?? null;
        const i = [
          pathParts.indexOf("blob"),
          pathParts.indexOf("resolve"),
        ].filter((it) => it >= 0)[0];
        branchName = pathParts[i + 1] || null;
        filePath = pathParts.slice(i + 2).join("/") || null;
      } else if (true || url.protocol.toLowerCase() === "hf:") {
        // hf://<owner>/<model>/<filePath...>
        // <owner>/<model>[/filePath...]
        ownerName = url.hostname;
        modelName = pathParts[0] ?? null;
        branchName = "main"; // not sure we can do anything here
        filePath = pathParts.slice(1).join("/") || null;
      }
      if (ownerName && modelName) {
        parsedUrls.push({
          ownerName,
          modelName,
          files: filePath ? [filePath] : [],
        });
      } else {
        skippedTokens.push({ token, ex: null });
      }
    } catch (ex) {
      skippedTokens.push({ token, ex });
    }
  }
  return { urls: parsedUrls, skippedTokens };
}

/**
 *
 * @param {string[][]} strLists
 */
function strListCommonPrefix(strLists) {
  const prefix = [];
  const maxLen = Math.max(...strLists.map((it) => it.length));
  for (let j = 0; j < maxLen; j++) {
    const val = strLists[0][j];
    for (const strList of strLists) {
      if (strList[j] !== val) {
        return prefix;
      }
    }

    prefix.push(val);
  }

  return prefix;
}

/**
 *
 * @param {HFUrlMeta[]} urls
 * @param {string} localDir
 */
function makeHfDownloadCommands(urls, localDir, type) {
  const result = [];

  if (type === _hf_type_include || type === _hf_type_file) {
    for (const url of urls) {
      const hfCmd = ["hf download"];
      if (localDir.length > 0) {
        hfCmd.push(`--local-dir ${localDir}`);
      }
      hfCmd.push(getRepoKey(url));
      if (url.files.length > 0) {
        if (type === _hf_type_file) {
          hfCmd.push(url.files.join(" "));
        } else if (type == _hf_type_include) {
          const includePrefix = strListCommonPrefix(
            url.files.map((file) => file.split("/")),
          ).join("/");
          if (includePrefix.length > 0) {
            hfCmd.push("--include");
            hfCmd.push(includePrefix + "/*");
          }
        }
      }
      result.push(hfCmd.filter((it) => it.length > 0).join(" "));
    }
  } else if (type === _hf_type_direct || type === _hf_type_direct_wget) {
    for (const url of urls) {
      for (const file of url.files) {
        let link = `https://huggingface.co/${getRepoKey(url)}/resolve/${url.branch || "main"}/${file}`;
        if (type === _hf_type_direct_wget) {
          link = "wget " + link;
        }
        result.push(link);
      }
    }
  } else {
    throw new Error(`Unknown type selection '${type}'`);
  }

  return result;
}

function uniq(list) {
  const dict = {};
  const result = [];
  for (const obj of list) {
    if (dict[obj]) {
      continue;
    }
    dict[obj] = true;
    result.push(obj);
  }
  return result;
}

/**
 * @param {HFUrlMeta[]} urls
 */
function getRepoKey(url) {
  return `${url.ownerName}/${url.modelName}`;
}

/**
 * @param {HFUrlMeta[]} urls
 */
function groupUrls(urls) {
  order = [];
  groups = {};
  for (const url of urls) {
    const key = getRepoKey(url) + "||" + url.branch;
    if (!groups[key]) {
      order.push(key);
      groups[key] = [];
    }
    groups[key].push(url);
  }

  const groupedUrls = [];
  for (const key of order) {
    /** @type {HFUrlMeta[]} */
    const group = groups[key];
    groupedUrl = {
      ...group[0],
      files: uniq(group.flatMap((it) => it.files)),
    };
    groupedUrls.push(groupedUrl);
  }
  return groupedUrls;
}

function test_parseUrls() {
  const cases = [
    {
      name: "top level file",
      inputs: [
        `
        https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/blob/main/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        hf download hf://unsloth/gemma-4-26B-A4B-it-GGUF/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        'hf download hf://unsloth/gemma-4-26B-A4B-it-GGUF/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf'
        huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/blob/main/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        hf://unsloth/gemma-4-26B-A4B-it-GGUF/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        unsloth/gemma-4-26B-A4B-it-GGUF/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        `,
      ],
      expect: {
        [_hf_type_include]:
          "hf download unsloth/gemma-4-26B-A4B-it-GGUF --include gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf/*",
        [_hf_type_direct]:
          "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/resolve/main/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf",
        [_hf_type_file]:
          "hf download unsloth/gemma-4-26B-A4B-it-GGUF gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf",
      },
    },
    {
      name: "nested file",
      inputs: [
        `
        https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/blob/main/MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        hf download hf://unsloth/gemma-4-26B-A4B-it-GGUF/MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/blob/main/MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        hf://unsloth/gemma-4-26B-A4B-it-GGUF/MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        unsloth/gemma-4-26B-A4B-it-GGUF/MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        `,
      ],
      expect: {
        [_hf_type_include]:
          "hf download unsloth/gemma-4-26B-A4B-it-GGUF --include MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf/*",
        [_hf_type_direct]:
          "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/resolve/main/MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf",
        [_hf_type_direct_wget]:
          "wget https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/resolve/main/MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf",
        [_hf_type_file]:
          "hf download unsloth/gemma-4-26B-A4B-it-GGUF MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf",
      },
    },
    {
      name: "aggregation",
      inputs: [
        `
        https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/blob/main/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        hf download hf://unsloth/gemma-4-26B-A4B-it-GGUF/MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        hf download hf://unsloth/gemma-4-26B-A4B-it-GGUF/MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        hf download hf://unsloth/gemma-4-31B-it-GGUF/MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf
        `,
      ],
      expect: {
        [_hf_type_include]: [
          "hf download unsloth/gemma-4-26B-A4B-it-GGUF",
          "hf download unsloth/gemma-4-31B-it-GGUF --include MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf/*",
        ],
        [_hf_type_direct]: [
          "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/resolve/main/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf",
          "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/resolve/main/MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf",
          "https://huggingface.co/unsloth/gemma-4-31B-it-GGUF/resolve/main/MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf",
        ],
        [_hf_type_file]: [
          "hf download unsloth/gemma-4-26B-A4B-it-GGUF gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf",
          "hf download unsloth/gemma-4-31B-it-GGUF MTP/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf",
        ],
      },
    },
    {
      name: "slug",
      inputs: ["unsloth/gemma-4-26B-A4B-it-GGUF"],
      expect: {
        [_hf_type_include]: "hf download unsloth/gemma-4-26B-A4B-it-GGUF",
        [_hf_type_direct]: null,
        [_hf_type_file]: "hf download unsloth/gemma-4-26B-A4B-it-GGUF",
      },
    },
    {
      name: "folder",
      inputs: [
        "unsloth/gemma-4-26B-A4B-it-GGUF/MTP",
        "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/blob/main/MTP/",
        "http://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/blob/x/MTP",
      ],
      expect: {
        [_hf_type_include]:
          "hf download unsloth/gemma-4-26B-A4B-it-GGUF --include MTP/*",
        [_hf_type_direct]:
          "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/resolve/main/MTP",
        [_hf_type_file]: "hf download unsloth/gemma-4-26B-A4B-it-GGUF MTP",
      },
    },
  ];

  let failed = 0;
  let passed = 0;
  for (const c of cases) {
    let idx = 0;
    for (const input of c.inputs) {
      const { urls } = tryParseUrls(input);
      const groupedUrls = groupUrls(urls);
      for (const [type, expect1] of Object.entries(c.expect)) {
        const expect = [expect1].flat().filter((it) => it !== null);
        const result = makeHfDownloadCommands(groupedUrls, "", type);
        const ok = JSON.stringify(result) === JSON.stringify(expect);
        console.log(
          `${ok ? "PASS" : "FAIL"} ${c.name}, case ${idx}, type ${type}`,
        );
        if (!ok) {
          failed++;
          console.log("  input:   ", JSON.stringify(input));
          console.log("  expected:", JSON.stringify(expect));
          console.log("  actual:  ", JSON.stringify(result));
        } else {
          passed++;
        }
      }

      idx++;
    }
  }
  console.log(`${passed}/${passed + failed} passed`);
  return failed === 0 ? 0 : 1;
}

if (
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module
) {
  process.exit(test_parseUrls());
}

const huggingFaceUrlConverter = {
  name: "Hugging Face URL to hf cmd",
  args: [
    {
      name: "huggingFaceUrls",
      type: "textarea",
      default: `You can type things like
https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/blob/main/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf

or unsloth/gemma-4-26B-A4B-it-GGUF

or 'hf download hf://unsloth/gemma-4-26B-A4B-it-GGUF/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf', or huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/blob/main/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf

also hf://unsloth/gemma-4-26B-A4B-it-GGUF/gemma-4-26B-A4B-it-UD-Q5_K_XL.gguf

and it will do its best to give you the minimal download command.
`,
      parseFn: (value) => {
        const { urls, skippedTokens } = tryParseUrls(value);

        return {
          value: urls,
          success: urls.length > 0,
          error: urls.length > 0 ? null : "no hf urls or similar found",
          consoleError: ["Skipped tokens", skippedTokens],
        };
      },
    },
    {
      name: "localDir",
      type: "string",
      default: ".",
    },
    {
      name: "type",
      type: "select",
      options: [
        _hf_type_file,
        _hf_type_direct,
        _hf_type_direct_wget,
        _hf_type_include,
      ],
      default: _hf_type_file,
    },
    {
      name: "aggregate?",
      type: "select",
      options: ["Aggregate the URLs", "One row per URL"],
      default: "Aggregate the URLs",
    },
  ],
  converterFn: (obj) => {
    let urls = obj.huggingFaceUrls;
    if (obj["aggregate?"] === "Aggregate the URLs") {
      urls = groupUrls(obj.huggingFaceUrls);
    }
    const cmds = makeHfDownloadCommands(urls, obj.localDir, obj.type);
    return {
      success: true,
      value: cmds.join("\n\n"),
    };
  },
};
