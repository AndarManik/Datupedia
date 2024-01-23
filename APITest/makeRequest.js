async function callApi() {
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    
    const url = 'https://datupedia.com/api/stringsearch';
    const data = {
        searchString: "What is philosphy?",
        articleTitles: ["philosophy", "Knowledge", "experience"],
        k: 5
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        console.log(result);
    } catch (error) {
        console.error('Error:', error);
    }
}

callApi();
