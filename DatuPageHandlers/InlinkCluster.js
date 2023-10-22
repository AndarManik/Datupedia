const ml = require("ml-kmeans");
const { getDb } = require("../APIs/MongoAPI");
const NUMCLUSTERS = 3;
const NUMTOP = 8;

class InlinkCluster {
  constructor(
    pageName,
    depth,
    inlinks,
    topInlinks = null,
    clusterCenter = null,
    position = []
  ) {
    this.pageName = pageName;
    this.topInlinks = topInlinks;
    this.clusterCenter = clusterCenter;
    this.position = position;

    this.prompt = "";
    this.children = [];

    if (depth > 0 && inlinks.length > 21) {
      this.inlinkMeans(inlinks).forEach((clusterData, index) =>
        this.children.push(
          new InlinkCluster(
            pageName,
            depth - 1,
            clusterData.inlinks,
            clusterData.topInlinks,
            clusterData.clusterCenter,
            [...position, index]
          )
        )
      );
      this.prompt = this.getPrompt();
    } else {
      this.prompt = this.leafPrompt(inlinks);
    }
    if(this.position.length === 0) {
      this.saveNodeAndChildren();
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

  has(position) {
    if(position.length === 0) {
      return true;
    }
    if(!this.children[position[0]]){
      return false;
    }
    return this.children[position[0]].has(position.slice(1));
  }

  getPrompt() {
    let prompt = "";
    this.children.forEach((child, i) => {
      prompt += `CLUSTER: ${i + 1}\n`;
      if (child.children.length < 2) {
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
    return prompt;
  }

  leafPrompt(inlinks) {
    let prompt = "";
    inlinks.forEach((inlink) => {
      prompt += `TITLE: ${inlink.title}\n`;
      prompt += `TEXT: ${inlink.paragraph}\n`;
    });
    return prompt;
  }

  async savetodb() {
    const db = getDb();
    const collection = db.collection("datuCluster");
    
    // Prepare the data to save, excluding children for now
    const dataToSave = {
      pageName: this.pageName,
      position: this.position,
      prompt: this.prompt,
      childCount: this.children.length,
      hasArticle: false,
    };
  
    // Use the position as the unique identifier
    const uniqueId = this.pageName + this.position.join('-');
    
    // Insert or update the document in the database
    await collection.updateOne({ _id: uniqueId }, { $set: dataToSave }, { upsert: true });
  }
  async saveNodeAndChildren() {
    await this.savetodb();
    for (const child of this.children) {
      await child.saveNodeAndChildren();
    }
    if(this.position.length === 0){
      console.log("clusterSaveFinished");

    }
  }
}

module.exports = InlinkCluster;
