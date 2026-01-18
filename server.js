const http = require('http');
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

let sql;
if (DATABASE_URL) {
  sql = neon(DATABASE_URL);
}

const defaultData = {
  columns: [
    { id: 'backlog', title: 'Backlog', cards: [] },
    { id: 'this-week', title: 'This Week', cards: [] },
    { id: 'in-progress', title: 'In Progress', cards: [] },
    { id: 'review', title: 'Review', cards: [] },
    { id: 'shipped', title: 'Shipped', cards: [] },
    { id: 'validated', title: 'Validated', cards: [] }
  ],
  logs: []
};

async function initDb() {
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS kanban_data (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  // Insert default data if table is empty
  const result = await sql`SELECT data FROM kanban_data WHERE id = 1`;
  if (result.length === 0) {
    await sql`INSERT INTO kanban_data (id, data) VALUES (1, ${JSON.stringify(defaultData)})`;
  }
}

async function getData() {
  if (!sql) return defaultData;
  const result = await sql`SELECT data FROM kanban_data WHERE id = 1`;
  return result.length > 0 ? result[0].data : defaultData;
}

async function saveData(data) {
  if (!sql) return;
  await sql`UPDATE kanban_data SET data = ${JSON.stringify(data)}, updated_at = NOW() WHERE id = 1`;
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API: Get data
  if (req.url === '/api/data' && req.method === 'GET') {
    try {
      const data = await getData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error('Error getting data:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database error' }));
    }
    return;
  }

  // API: Save data
  if (req.url === '/api/data' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        await saveData(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (err) {
        console.error('Error saving data:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Database error' }));
      }
    });
    return;
  }

  // Serve static files
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath);
  const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
      res.end(content);
    }
  });
});

// Initialize database then start server
initDb()
  .then(() => {
    server.listen(PORT, () => console.log(`Kanban running at http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    // Start anyway for static file serving
    server.listen(PORT, () => console.log(`Kanban running at http://localhost:${PORT} (no database)`));
  });
