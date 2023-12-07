const { parse } = require("node-html-parser");

class TextExtractor {
  constructor(lang = "en") {
    this.lang = lang;
    this.log = false;
  }

  getParagraphWithLink(pageContent, link_title) {
    const root = parse(pageContent);
    const elements = root.querySelectorAll("p");

    const hrefDistances = [];
    const normalized_link_title = encodeURIComponent(
      link_title.replace(/ /g, "_")
    )
      .replace(/'/g, "%27")
      .toLowerCase();
    const link_href = "/wiki/" + normalized_link_title;

    for (const element of elements) {
      const a_tags = element.querySelectorAll("a");

      for (const a_tag of a_tags) {
        let actual_href = a_tag.getAttribute("href");
        actual_href = actual_href
          ? actual_href.toLowerCase().replace(/ /g, "_")
          : "";
        if (this.log) {
          const distance = levenshtein(link_href, actual_href);
          hrefDistances.push({ href: actual_href, distance: distance });
        }
        if (
          actual_href === link_href ||
          actual_href.startsWith(link_href + "#")
        ) {
          if (this.log) {
            const nearestHrefs = hrefDistances
              .sort((a, b) => a.distance - b.distance)
              .slice(0, 5);
            console.log(link_href);
            console.log("5 nearest hrefs:", nearestHrefs);
          }
          return element.text.trim();
        }
      }
    }
    if (this.log) {
      const nearestHrefs = hrefDistances
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5);
      console.log(link_href);
      console.log("5 nearest hrefs:", nearestHrefs);
    }
    return null;
  }
  getParagraphList(pageContent) {
    const root = parse(pageContent);
    const paragraphs = root.querySelectorAll("p");
    return paragraphs.map((p) => p.text.trim());
  }
}

function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let matrix = [];

  let i;
  for (i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  let j;
  for (j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (i = 1; i <= b.length; i++) {
    for (j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

module.exports = TextExtractor;
