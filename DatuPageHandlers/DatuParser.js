const { JSDOM } = require("jsdom");
const WikipediaAPI = require("../APIs/WikipediaAPI");
const wikipediaAPI = new WikipediaAPI();

async function datuParse(superText, wikiText, position) {
  return addOnclickToH2(
    replacePreWithP(
      removeEditSpans(
        (await wikipediaAPI.parseWikitext(extractLastSuperText(superText))) +
          (await wikipediaAPI.parseWikitext(wikiText))
      )
    ),
    position
  );
}

function extractLastSuperText(str) {
  // Regular expression pattern to match the last '==text==moretext' sequence
  const pattern = /==([^=]+)==([^=]+)$/;

  const match = str.match(pattern);

  if (match) {
    // Return the entire matched string
    return match[0];
  } else {
    return "";
  }
}

function addOnclickToH2(htmlString, position) {
  const dom = new JSDOM(htmlString);
  const document = dom.window.document;

  const h2Elements = document.querySelectorAll(".mw-parser-output h2");

  h2Elements.forEach((h2, index) => {
    const div = document.createElement("div");
    div.className = "article-section";
    div.setAttribute(
      "onclick",
      `handleClientResponse([${position.concat(index)}])`
    );

    h2.parentNode.insertBefore(div, h2);
    div.appendChild(h2);
  });
  if (position.length !== 0) {
    const mwParserOutput = document.querySelector(".mw-parser-output");

    const backDiv = document.createElement("div");
    backDiv.className = "article-section";
    backDiv.setAttribute(
      "onclick",
      `handleClientResponse([${position.slice(0, -1)}])`
    );
    if (position.slice(0, -1).length !== 0) {
      backDiv.innerHTML = `<h2>Go Back to ${position
        .slice(0, -1)
        .map((val) => val + 1)}</h2>`;
    } else {
      backDiv.innerHTML = `<h2>Go back to root</h2>`;
    }
    mwParserOutput.insertBefore(backDiv, mwParserOutput.firstChild);
  }
  return dom.serialize();
}

function replacePreWithP(htmlString) {
  let newHtml = htmlString.replace(/<pre>/gi, "<p>");
  newHtml = newHtml.replace(/<\/pre>/gi, "</p>");
  return newHtml;
}

function removeEditSpans(htmlString) {
  // Create a JSDOM instance from the HTML string
  const dom = new JSDOM(htmlString);
  const document = dom.window.document;

  // Get all the 'edit' spans
  const editSpans = document.querySelectorAll("h2 .mw-editsection");

  // Remove each 'edit' span
  editSpans.forEach((span) => {
    span.parentNode.removeChild(span);
  });

  const editSpansh3 = document.querySelectorAll("h3 .mw-editsection");
  editSpansh3.forEach((span) => {
    span.parentNode.removeChild(span);
  });

  // Return the modified HTML string
  return dom.serialize();
}

module.exports = { datuParse };
