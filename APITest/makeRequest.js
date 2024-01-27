async function callApi(data) {
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    const url = 'http://localhost:3000/api/stringsearch';

    try {
        const startTime = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        const endTime = Date.now();
        console.log(result);
        return endTime - startTime;
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

async function benchmark() {
    const queries = [
        { searchString: "History of the Roman Empire", articleFilters: ["history", "Rome", "ancient civilizations"], k: 3 },
        { searchString: "Quantum mechanics basics", articleFilters: ["physics", "quantum theory", "science"], k: 2 },
        { searchString: "How to bake a chocolate cake", articleFilters: ["cooking", "desserts", "baking"], k: 4 },
        { searchString: "Advancements in renewable energy", articleFilters: ["technology", "renewable energy", "sustainability"], k: 3 },
        { searchString: "The impact of AI on society", articleFilters: ["artificial intelligence", "technology", "ethics"], k: 5 },
        { searchString: "Best practices in software development", articleFilters: ["programming", "software engineering", "technology"], k: 2 },
        { searchString: "Exploring the Amazon rainforest", articleFilters: ["travel", "nature", "Amazon"], k: 3 },
        { searchString: "Learning French as a second language", articleFilters: ["languages", "education", "French"], k: 4 },
        { searchString: "The evolution of jazz music", articleFilters: ["music", "jazz", "history"], k: 3 },
        { searchString: "Latest trends in fashion 2024", articleFilters: ["fashion", "trends", "lifestyle"], k: 2 }
    ];
    

    let totalTime = 0;
    let successfulCalls = 0;

    for (const query of queries) {
        const timeTaken = await callApi(query);
        if (timeTaken !== null) {
            totalTime += timeTaken;
            successfulCalls++;
        }
    }

    if (successfulCalls > 0) {
        const averageTime = totalTime / successfulCalls;
        console.log(`Average time taken: ${averageTime/ 1000} s/call for ${successfulCalls} successful calls.`);
    } else {
        console.log("No successful API calls were made.");
    }
}

benchmark();
