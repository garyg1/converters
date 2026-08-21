/*
Converters
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

let debug1;

const htmlToJsonConverter = (() => {
  let opts = { firstRowHeader: false, ignoreColspan: false };
  function tryParseHtml(html) {
    try {
      return { doc: new DOMParser().parseFromString(html, "text/html") };
    } catch (err) {
      console.warn(err);
      return { err };
    }
  }

  /**
   *
   * @param {HTMLElement} htmlElement
   * @returns
   */
  function cleanInnerText(htmlElement) {
    return htmlElement.innerText.replaceAll(/\s+/g, " ");
  }

  /**
   *
   * @param {HTMLTableSectionElement} thead
   */
  function parseCols(thead) {
    const cols = [];
    for (const td of thead.querySelectorAll("td")) {
      cols.push(cleanInnerText(td));
    }

    for (const td of thead.querySelectorAll("th")) {
      cols.push(cleanInnerText(td));
    }
    return cols;
  }

  /**
   *
   * @param {HTMLTableCellElement} td
   */
  function parseTextTd(td) {
    const hrefs = [];
    for (const a of td.querySelectorAll("a")) {
      hrefs.push(a.href);
    }

    return { text: cleanInnerText(td), hrefs };
  }

  /**
   *
   * @param {HTMLTableRowElement} tr
   * @param {string[]} cols
   */
  function parseRow(tr, cols) {
    const result = {};
    let idx = 0;
    for (const td of [
      ...tr.querySelectorAll("td"),
      ...tr.querySelectorAll('div[role="cell"]'),
    ]) {
      if (opts.ignoreColspan && td.getAttribute('colspan')) {
        continue;
      }
      const { text, hrefs } = parseTextTd(td);
      const colName = cols[idx] || idx;
      result[colName] = text;
      if (hrefs.length > 0) {
        result[colName + "_href"] = hrefs;
      }

      idx++;
    }
    return result;
  }

  /**
   *
   * @param {string[]} cols
   */
  function getDisambiguatedCols(cols) {
    const cleanedCols = [];
    const colToFirstIdx = {};
    const colToTimesRepeated = {};
    for (const col of cols) {
      const firstIdx = colToFirstIdx[col];
      const timesRepeated = colToTimesRepeated[col] || 0;
      if (timesRepeated === 1) {
        cleanedCols[firstIdx] = cleanedCols[firstIdx] + " (1)";
        cleanedCols.push(col + " (2)");
        colToTimesRepeated[col] = 2;
      } else if (timesRepeated === 0) {
        colToFirstIdx[col] = cleanedCols.length;
        cleanedCols.push(col);
        colToTimesRepeated[col] = 1;
      } else {
        cleanedCols.push(col + " (" + (timesRepeated + 1) + ")");
        colToTimesRepeated[col] += 1;
      }
    }
    return cleanedCols;
  }

  /**
   *
   * @param {HTMLDocument} html
   */
  function convert(html) {
    result = {};
    let idx = 1;
    for (const tableElt of html.querySelectorAll("table")) {
      const heads = tableElt.querySelectorAll("thead");
      let cols = [];
      if (heads.length > 0) {
        cols = parseCols(heads[0]);
      }

      let trs = [
        ...tableElt.querySelectorAll("tr"),
        ...tableElt.querySelectorAll('div[role="row"]'),
      ];
      if (heads.length === 0 && opts.firstRowHeader) {
        cols = parseCols(trs[0]);
        trs = trs.slice(1);
      }

      const cleanedCols = getDisambiguatedCols(cols);

      const rows = [];
      for (const tr of trs) {
        rows.push(parseRow(tr, cleanedCols));
      }

      result["Table " + idx++] = rows;
    }
    return result;
  }

  const converter = {
    name: "html",
    longName: "HTML multi-table to JSON with link extraction",
    args: [
      {
        name: "html",
        type: "textarea",
        default: `
      <div class="does not have to be closed">
        <table>
            <thead>
                <td>example column</td>
                <td>repeated column</td>
                <td>repeated column</td>
            </thead>
            <tr>
                <td>value <span>potentially</span> with <script>alert('example: no xss')</script> arbitrary formatting</td>
                <td><p><a href="https://example.com"><span>linked <span>data</span></span></a></p></td>  
            </tr>
            <tr>
                <td>row</td>
                <td><p><a href="https://example.com"><span>linked <span>data</span></span></a></p></td>  
            </tr>
        </table>

        <table>
            <thead>
                <td>empty</td>
                <td>multi-link column</td>
                <td>empty</td>
            </thead>
            <tr>
                <td>value</td>
                <td><p><a href="https://example.com/1"><span>linked <a href="https://example.com/2">data</a></span></a></p></td>  
            </tr>
        </table>
`,
        parseFn: (value) => {
          const { doc, err } = tryParseHtml(value);

          return {
            value: doc,
            success: !err,
            error: err,
            consoleError: [],
          };
        },
      },
      {
        name: "firstRowHeaderIfNoneDeclared?",
        type: "select",
        options: ["Yes", "No"],
        default: "No",
      },
      {
        name: "ignoreElementsWithColspan?",
        type: "select",
        options: ["Yes", "No"],
        default: "No",
      },
    ],
    converterFn: (obj) => {
      let html = obj.html;
      opts = {
        firstRowHeader: obj["firstRowHeaderIfNoneDeclared?"] === "Yes",
        ignoreColspan: obj["ignoreElementsWithColspan?"] === "Yes",
      };
      const json = convert(html);
      return {
        success: true,
        value: prettifyJson(json, 4, 80),
      };
    },
  };

  return converter;
})();
