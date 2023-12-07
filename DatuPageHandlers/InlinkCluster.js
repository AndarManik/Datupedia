const ml = require("ml-kmeans");
const { getDb } = require("../APIs/MongoAPI");
const NUMCLUSTERS = 3;
const NUMTOP = 8;
const MAXCHILDRENPROMPT = 2
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
  }



  inlinkMeans(inlinks) {
    const embeddings = this.centerVectors(inlinks.map((inlink) => inlink.embedding));
    const result = ml.kmeans(embeddings, NUMCLUSTERS, { distanceFunction: this.cosineDistance });
    const clusters = Array.from({ length: NUMCLUSTERS }, () => []);
    result.clusters.forEach((clusterIndex, i) => {
      clusters[clusterIndex].push(inlinks[i]);
    });

    clusters.sort((a, b) => b.length - a.length);

    const output = clusters.map((cluster, i) => {
      const clusterCenter = result.centroids[i];
      cluster.forEach((inlink) => {
        inlink.distance = this.cosineDistance(
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
  centerVectors(vectors) {
    if (vectors.length === 0) {
        return [];
    }
    const dim = vectors[0].length;
    const center = vectors.reduce((acc, vec) => {
        return acc.map((val, idx) => val + vec[idx]);
    }, Array(dim).fill(0)).map(val => val / vectors.length);
    const centeredVectors = vectors.map(vec => {
        return vec.map((val, idx) => val - center[idx]);
    });
    return centeredVectors;
}

  cosineDistance(a, b) {
    const dotProduct = a.map((val, i) => val * b[i]).reduce((sum, val) => sum + val, 0);
    
    const magnitudeA = Math.sqrt(a.map(val => val * val).reduce((sum, val) => sum + val, 0));
    const magnitudeB = Math.sqrt(b.map(val => val * val).reduce((sum, val) => sum + val, 0));
    
    const cosineSimilarity = dotProduct / (magnitudeA * magnitudeB);
    
    return 1 - cosineSimilarity;
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
          prompt += `LINK: [[${inlink.title}]]\n`;
          prompt += `TEXT: ${inlink.paragraph}\n`;
        });
      } else {
        child.children.forEach((chichild) => {
          chichild.topInlinks.forEach((inlink, index) => {
            if (index < MAXCHILDRENPROMPT) {
              prompt += `LINK: [[${inlink.title}]]\n`;
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
      prompt += `LINK: [[${inlink.title}]]\n`;
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
    }
  }

  async saveVersion() {
    const db = getDb();
    const collection = db.collection("datuCluster");
    await collection.updateOne({ _id: this.pageName + "VERSION" }, { $set: {version: 1.3} }, { upsert: true });
  }
}

module.exports = InlinkCluster;
