import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import fs from 'fs';

// ES Module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Debug: Show file paths
console.log('Project root:', __dirname);
console.log('Public path:', path.join(__dirname, 'public'));
console.log('CSS path:', path.join(__dirname, 'public', 'css', 'style.css'));

// Check if public directory exists
const publicPath = path.join(__dirname, 'public');
const cssPath = path.join(__dirname, 'public', 'css', 'style.css');
const jsPath = path.join(__dirname, 'public', 'js', 'main.js');

console.log('Public dir exists:', fs.existsSync(publicPath));
console.log('CSS file exists:', fs.existsSync(cssPath));
console.log('JS file exists:', fs.existsSync(jsPath));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error acquiring client:', err.message);
  } else {
    console.log('Database connected successfully');
    if (release) release();
  }
});

// Initialize database tables
async function initializeDatabase() {
  try {
    // Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'Honest Message',
        author VARCHAR(100) DEFAULT 'Anonymous',
        reflection_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create reflections table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reflections (
        id SERIAL PRIMARY KEY,
        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
        user_ip VARCHAR(45),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(message_id, user_ip)
      )
    `);

    // Seed initial data if table is empty
    const result = await pool.query('SELECT COUNT(*) FROM messages');
    if (parseInt(result.rows[0]?.count || 0) === 0) {
      await seedInitialData();
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error.message);
  }
}

// Seed initial data
async function seedInitialData() {
  const initialMessages = [
    {
      text: "Today I admitted I've been pretending to be okay when I'm not. There's power in saying 'I'm struggling' out loud.",
      category: "Vulnerability",
      author: "Anonymous",
      reflection_count: 7
    },
    {
      text: "Growth isn't about becoming someone new, but uncovering who you've always been beneath the layers of expectation.",
      category: "Personal Growth",
      author: "Jamie",
      reflection_count: 12
    },
    {
      text: "I'm learning that boundaries aren't walls to keep people out, but gates that let me choose who gets to be in my garden.",
      category: "Personal Growth",
      author: "Taylor",
      reflection_count: 9
    },
    {
      text: "Grateful for: the quiet moment this morning with my coffee, the sun through the window, and nothing urgent demanding my attention.",
      category: "Gratitude",
      author: "Sam",
      reflection_count: 5
    },
    {
      text: "What if we measured success by how often we choose courage over comfort?",
      category: "Question to Ponder",
      author: "Anonymous",
      reflection_count: 15
    }
  ];

  for (const msg of initialMessages) {
    await pool.query(
      'INSERT INTO messages (text, category, author, reflection_count) VALUES ($1, $2, $3, $4)',
      [msg.text, msg.category, msg.author, msg.reflection_count]
    );
  }
  console.log('Initial data seeded');
}

// Middleware - FIXED FOR CSS
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files from public directory
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Debug route to check static files
app.get('/debug-static', (req, res) => {
  const publicExists = fs.existsSync(path.join(__dirname, 'public'));
  const cssExists = fs.existsSync(path.join(__dirname, 'public', 'css', 'style.css'));
  const jsExists = fs.existsSync(path.join(__dirname, 'public', 'js', 'main.js'));
  
  res.json({
    success: true,
    paths: {
      projectRoot: __dirname,
      publicDir: path.join(__dirname, 'public'),
      cssFile: path.join(__dirname, 'public', 'css', 'style.css'),
      jsFile: path.join(__dirname, 'public', 'js', 'main.js')
    },
    filesExist: {
      publicDir: publicExists,
      cssFile: cssExists,
      jsFile: jsExists
    },
    urls: {
      css: '/css/style.css',
      js: '/js/main.js'
    }
  });
});

// Route to serve CSS directly (for debugging)
app.get('/test-css', (req, res) => {
  const cssPath = path.join(__dirname, 'public', 'css', 'style.css');
  if (fs.existsSync(cssPath)) {
    res.type('css').send(fs.readFileSync(cssPath, 'utf8'));
  } else {
    res.status(404).send('CSS file not found at: ' + cssPath);
  }
});

// Get client IP
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.ip ||
         'unknown';
}

// Routes
app.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM messages ORDER BY created_at DESC LIMIT 10'
    );
    
    const totalReflections = await pool.query(
      'SELECT SUM(reflection_count) as total FROM messages'
    );

    res.render('pages/home', { 
      messages: result.rows || [],
      totalReflections: parseInt(totalReflections.rows[0]?.total || 0, 10),
      // Add CSS check variable for view
      cssAvailable: fs.existsSync(path.join(__dirname, 'public', 'css', 'style.css'))
    });
  } catch (error) {
    console.error('Error fetching messages:', error.message);
    res.render('pages/home', { 
      messages: [],
      totalReflections: 0,
      cssAvailable: false,
      error: 'Failed to load messages'
    });
  }
});

app.get('/share', (req, res) => {
  res.render('pages/share', { 
    cssAvailable: fs.existsSync(path.join(__dirname, 'public', 'css', 'style.css'))
  });
});

app.post('/share', async (req, res) => {
  const { message, category = 'Honest Message', author = 'Anonymous' } = req.body;
  
  if (!message || message.trim().length === 0) {
    return res.redirect('/share?error=empty');
  }
  
  try {
    await pool.query(
      'INSERT INTO messages (text, category, author) VALUES ($1, $2, $3)',
      [message.trim(), category, author.trim() || 'Anonymous']
    );
    
    res.redirect('/?success=true');
  } catch (error) {
    console.error('Error saving message:', error.message);
    res.redirect('/share?error=database');
  }
});

app.post('/reflect/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const userIp = getClientIp(req);
  
  try {
    const existingReflection = await pool.query(
      'SELECT id FROM reflections WHERE message_id = $1 AND user_ip = $2',
      [messageId, userIp]
    );
    
    if (existingReflection.rows.length > 0) {
      return res.json({ success: false, message: 'Already reflected' });
    }
    
    await pool.query('BEGIN');
    
    await pool.query(
      'INSERT INTO reflections (message_id, user_ip) VALUES ($1, $2)',
      [messageId, userIp]
    );
    
    await pool.query(
      'UPDATE messages SET reflection_count = reflection_count + 1 WHERE id = $1',
      [messageId]
    );
    
    await pool.query('COMMIT');
    
    const result = await pool.query(
      'SELECT reflection_count FROM messages WHERE id = $1',
      [messageId]
    );
    
    res.json({ 
      success: true, 
      count: result.rows[0]?.reflection_count || 0 
    });
    
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('Error adding reflection:', error.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.get('/reflections', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM messages ORDER BY reflection_count DESC, created_at DESC'
    );
    
    res.render('pages/reflections', { 
      messages: result.rows || [],
      cssAvailable: fs.existsSync(path.join(__dirname, 'public', 'css', 'style.css'))
    });
  } catch (error) {
    console.error('Error fetching reflections:', error.message);
    res.render('pages/reflections', { 
      messages: [],
      cssAvailable: false,
      error: 'Failed to load reflections'
    });
  }
});

// Serve static test page
app.get('/test', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CSS Test</title>
      <link rel="stylesheet" href="/css/style.css">
      <style>
        body { padding: 20px; font-family: Arial; }
        .test-box { 
          padding: 20px; 
          margin: 10px 0; 
          border: 2px solid #333;
          border-radius: 5px;
        }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
      </style>
    </head>
    <body>
      <h1>CSS Test Page</h1>
      <div class="test-box success">
        If this box has green background, inline CSS works.
      </div>
      <div class="test-box" style="background: var(--accent, #ccc); color: white;">
        If this box is blue, external CSS (/css/style.css) works.
      </div>
      <p>Check console for CSS loading errors.</p>
      <a href="/">Back to main app</a>
    </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    cssAvailable: fs.existsSync(path.join(__dirname, 'public', 'css', 'style.css'))
  });
});

// Initialize database
initializeDatabase().then(() => {
  console.log('Application initialized');
  
  // Check for CSS file
  const cssExists = fs.existsSync(path.join(__dirname, 'public', 'css', 'style.css'));
  console.log('CSS file available:', cssExists ? 'YES' : 'NO');
  
  if (!cssExists) {
    console.warn('WARNING: CSS file not found at:', path.join(__dirname, 'public', 'css', 'style.css'));
    console.warn('Make sure your file structure includes: public/css/style.css');
  }
  
}).catch(err => {
  console.error('Failed to initialize application:', err.message);
});

// Start server for local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Test CSS at: http://localhost:${PORT}/test`);
    console.log(`Debug info at: http://localhost:${PORT}/debug-static`);
  });
}

// Export for Vercel serverless
export default app;
