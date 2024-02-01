async function stringSearch(data) {
  data = { searchString: data.paragraph, articleFilters: data.links, k: 10 };
  return await callApi(data, "http://localhost:3000/api/stringsearch");
}

async function stringSearchGlobal(data) {
  data = { searchString: data.paragraph, k: 10 };
  return await callApi(data, "http://localhost:3000/api/stringsearchglobal");
}

async function callApi(data, url) {
  const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    const endTime = Date.now();
    return { time: endTime - startTime, result: result };
  } catch (error) {
    console.error("Error:", error);
    return { time: null, success: false };
  }
}

async function benchmark(searchFunction, documents) {
  let totalTime = 0;
  let successfulCalls = 0;
  let results = [];

  for (const document of documents) {
    const result = await searchFunction(document);
    if (result.time !== null) {
      totalTime += result.time;
      successfulCalls += result.success ? 1 : 0;
      results.push({ time: result.time, result: result });
      console.log(totalTime);
    }
  }

  const averageTime = totalTime / documents.length;
  return {
    averageTime: averageTime / 1000,
    results: results,
  };
}

async function getN() {
  const response = await fetch("http://localhost:3000/api/getRandom", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ n: 1 }),
  });
  const result = await response.json();
  return result;
}

function isDeepEqual(obj1, obj2) {
  if (obj1 === obj2) {
    return true;
  }
  if (
    typeof obj1 !== "object" ||
    typeof obj2 !== "object" ||
    obj1 == null ||
    obj2 == null
  ) {
    return false;
  }

  let keys1 = Object.keys(obj1);
  let keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (let key of keys1) {
    if (!keys2.includes(key) || !isDeepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }

  return true;
}
async function compareSearches() {
  const documents = await getN(); // Assuming getN fetches 10 documents

  const standardResults = await benchmark(stringSearch, documents);
  const globalResults = await benchmark(stringSearchGlobal, documents);

  // Calculate the sameness of the results
  let samenessSum = 0;
  for (let i = 0; i < standardResults.results.length; i++) {
    const standardResult = standardResults.results[i].result;
    const globalResult = globalResults.results[i].result;

    let sameCount = 0;
    for (let j = 0; j < standardResult.length; j++) {
      for (let k = 0; k < globalResult.length; k++) {
        if (isDeepEqual(standardResult[j], globalResult[k])) {
          sameCount++;
          break; // If a match is found, break the inner loop to avoid counting duplicates
        }
      }
    }
    samenessSum += sameCount / standardResult.length;
  }
  const averageSameness = samenessSum / standardResults.length;

  // Display results
  console.log("Standard Search Results:");
  console.log(`Average time: ${standardResults.averageTime} s`);

  console.log("Global Search Results:");
  console.log(`Average time: ${globalResults.averageTime} s`);

  console.log(`Average Sameness: ${averageSameness}`);
}

compareSearches();
