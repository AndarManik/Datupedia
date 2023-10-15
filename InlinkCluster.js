const ml = require("ml-kmeans");
const { JSDOM } = require("jsdom");

const NUMCLUSTERS = 3;
const NUMTOP = 8;

class InlinkCluster {
  constructor(
    depth,
    inlinks,
    topInlinks = null,
    clusterCenter = null,
    position = []
  ) {
    this.article = null;
    this.topInlinks = topInlinks;
    this.clusterCenter = clusterCenter;
    this.position = position;
    this.children = [];
    this.superText = "";
    this.wikiText = "";
    this.wikiTextFinished = false;
    if (depth > 0 && inlinks.length > 24) {
      this.inlinkMeans(inlinks).forEach((clusterData, index) =>
        this.children.push(
          new InlinkCluster(
            depth - 1,
            clusterData.inlinks,
            clusterData.topInlinks,
            clusterData.clusterCenter,
            [...position, index]
          )
        )
      );
    }
  }

  inlinkMeans(inlinks) {
    const embeddings = inlinks.map((inlink) => inlink.embedding);

    const result = ml.kmeans(embeddings, NUMCLUSTERS);
    const clusters = Array.from({ length: NUMCLUSTERS }, () => []);
    result.clusters.forEach((clusterIndex, i) => {
      clusters[clusterIndex].push(inlinks[i]);
    });

    clusters.sort((a, b) => b.length - a.length);

    const output = clusters.map((cluster, i) => {
      const clusterCenter = result.centroids[i];
      cluster.forEach((inlink) => {
        inlink.distance = this.euclideanDistance(
          inlink.embedding,
          clusterCenter
        );
      });
      cluster.sort((a, b) => a.distance - b.distance);
      const topInlinks = cluster.slice(0, NUMTOP);
      return { clusterCenter, topInlinks, inlinks: cluster };
    });

    return output;
  }

  euclideanDistance(vecA, vecB) {
    return Math.sqrt(
      vecA.reduce((sum, val, i) => sum + Math.pow(val - vecB[i], 2), 0)
    );
  }

  getTraverse(position) {
    if (position.length === 0) {
      return this;
    } else {
      if (this.children[position[0]]) {
        return this.children[position[0]].getTraverse(position.slice(1));
      } else {
        return null;
      }
    }
  }

  htmlOutput(position) {
    let htmlContent = "";
    htmlContent = `<div class="article-section" onclick="handleClientResponse([${position.slice(
      0,
      -1
    )}])">`;
    htmlContent += `<h2>Go Back</h2>`;
    htmlContent += `</div>`;
    this.children.forEach((child, i) => {
      htmlContent += `<div class="article-section" onclick="handleClientResponse([${position.concat(
        i
      )}])">`; // Add div with onclick attribute here
      htmlContent += `<h2>Cluster: ${i + 1}</h2>`;
      child.topInlinks.forEach((inlink) => {
        htmlContent += `<h2>${inlink.title}</h2>`;
        htmlContent += `<p>${inlink.paragraph}</p>`;
        //htmlContent += `<p> ${inlink.intro}</p>`;
      });
      htmlContent += `</div>`; // Close the div here
    });

    return htmlContent;
  }

  getPrompt() {
    let prompt = "";
    this.children.forEach((child, i) => {
      prompt += `CLUSTER: ${i + 1}\n`;
      if (child.topInlinks.length < 4) {
        return null;
      }
      if (child.children.length === 0) {
        child.topInlinks.forEach((inlink) => {
          prompt += `TITLE: ${inlink.title}\n`;
          prompt += `TEXT: ${inlink.paragraph}\n`;
        });
      } else {
        child.children.forEach((chichild) => {
          chichild.topInlinks.forEach((inlink, index) => {
            if (index < 3) {
              prompt += `TITLE: ${inlink.title}\n`;
              prompt += `TEXT: ${inlink.paragraph}\n`;
            }
          });
        });
      }
    });
    if(prompt.length === 0){
      return null;
    }
    return prompt;
  }

  async wikitextStoreStream(wikitextStream, wikiAPI) {
    let prevChunk = null;
    for await (const chunk of wikitextStream) {
      if (prevChunk !== null) {
        this.wikiText += prevChunk.choices[0].delta.content;
      }
      prevChunk = chunk;
    }
    this.processedWikiText = this.addOnclickToH2(
      await wikiAPI.parseWikitext(this.superText + this.wikiText)
    );
    if (this.children.length !== 0) {
      this.wikiText.match(/==[^=]+==[^=]+/g).forEach((text, index) => {
        this.children[index].superText = text;
      });
    }
    this.wikiTextFinished = true;
  }
  addOnclickToH2(htmlString) {
    // 1. Parse the HTML string using DOMParser
    const dom = new JSDOM(htmlString);
    const document = dom.window.document;

    // 2. Get all h2 elements within the .mw-parser-output div
    const h2Elements = document.querySelectorAll(".mw-parser-output h2");

    // 3. Iterate through all the h2 elements and add the onclick event
    h2Elements.forEach((h2, index) => {
      // You can adjust the content of the onclick event based on your needs
      if (index !== 0 && this.position.length !== 0) {
        const div = document.createElement("div");
        div.className = "article-section";
        div.setAttribute(
          "onclick",
          `handleClientResponse([${this.position.concat(index - 1)}])`
        );

        // Replace the h2 with the div and move the h2 inside the div
        h2.parentNode.insertBefore(div, h2);
        div.appendChild(h2);
      } else {
        if (this.position.length === 0) {
          const div = document.createElement("div");
          div.className = "article-section";
          div.setAttribute(
            "onclick",
            `handleClientResponse([${this.position.concat(index)}])`
          );

          // Replace the h2 with the div and move the h2 inside the div
          h2.parentNode.insertBefore(div, h2);
          div.appendChild(h2);
        }
      }
    });
    const mwParserOutput = document.querySelector(".mw-parser-output");

    const backDiv = document.createElement("div");
    backDiv.className = "article-section";
    backDiv.setAttribute(
      "onclick",
      `handleClientResponse([${this.position.slice(0, -1)}])`
    );
    backDiv.innerHTML = `<h2>Go Back</h2>`;
    mwParserOutput.insertBefore(backDiv, mwParserOutput.firstChild);

    // 4. Serialize the modified DOM back to HTML
    return dom.serialize();
  }
}

module.exports = InlinkCluster;
