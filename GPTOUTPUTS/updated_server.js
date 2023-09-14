const express = require('express');
const rateLimit = require('express-rate-limit');
const WikipediaAPI = require('./WikipediaAPI');
const TextExtractor = require('./TextExtractor');
const DatuPage = require('./DatuPage');
const { connectToDb, getDb } = require('./MongoAPI');
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');


const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const wikipediaAPI = new WikipediaAPI();
const textExtractor = new TextExtractor();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Database connection
connectToDb().then(() => {
  // Only start the server after database connection is established
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error("Failed to connect to the database:", err);
});

app.get('/', (req, res) => {
  fs.readFile(path.join(__dirname, 'public/search.html'), 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      res.status(500).send('Internal Server Error');
      return;
    }
    res.send(data);
  });
});


app.get('/suggestions', async (req, res) => {
    const query = req.query.query;
    const suggestions = await wikipediaAPI.searchSuggestions(query);
    res.json(suggestions);
  });

app.get('/:pagename/home', async (req, res) => {
  try {
    // Write the initial part of the response
    res.write('<html><body>');
    res.write('<h1>Loading Data...</h1>');
  
    // Fetch the data
    const pagename = req.params.pagename;
    const datupage = new DatuPage(pagename, getDb(), wikipediaAPI, textExtractor);
    await datupage.fetchData();
    
    // Write the fetched data (you would replace this with the actual data)
    res.write('<h2>Fetched Data</h2>');
    res.write('<p>Here is the data you fetched...</p>');
  
    // Write the closing part of the response
    res.write('<h1>Data Load Complete</h1>');
    res.write('</body></html>');
  
    // End the response
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});


// Test route for TextExtractor functionality
app.get('/testTextExtractor', async (req, res, next) => {
  try {
    const inlinks = await wikipediaAPI.get_inlinks('Fairy');
    const paragraphs = [];

    for (const inlink of inlinks) {
      const pageContent = await wikipediaAPI.get_page_content(inlink);
      const paragraph = await textExtractor.get_paragraph_with_link(pageContent, 'Fairy');
      paragraphs.push({ inlink, paragraph });
    }

    let htmlResponse = '<html><body><ul>';
    for (const item of paragraphs) {
      htmlResponse += `<li><strong>${item.inlink}</strong>: ${item.paragraph}</li>`;
    }
    htmlResponse += '</ul></body></html>';

    res.send(htmlResponse);
  } catch (err) {
    next(err);
  }
});

// Centralized Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
});


// WebSocket message handling for real-time interaction
wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (message) => {
    if (message === 'fetchData') {
      ws.send('clearScreen');
      
      // Simulate data fetching or perform real operations
      const pagename = 'examplePage';
      // const datupage = new DatuPage(pagename, getDb(), WikipediaAPI, TextExtractor);
      // await datupage.fetchData();
      await new Promise(resolve => setTimeout(resolve, 3000));

      ws.send('Here is the fetched data.');
    }
  });
});
