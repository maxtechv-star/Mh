import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

// ES Module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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
      totalReflections: parseInt(totalReflections.rows[0]?.total || 0, 10)
    });
  } catch (error) {
    console.error('Error fetching messages:', error.message);
    res.render('pages/home', { 
      messages: [],
      totalReflections: 0,
      error: 'Failed to load messages'
    });
  }
});

app.get('/share', (req, res) => {
  res.render('pages/share');
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
      messages: result.rows || []
    });
  } catch (error) {
    console.error('Error fetching reflections:', error.message);
    res.render('pages/reflections', { 
      messages: [],
      error: 'Failed to load reflections'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Initialize database
initializeDatabase().then(() => {
  console.log('Application initialized');
}).catch(err => {
  console.error('Failed to initialize application:', err.message);
});

// Start server for local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

// Export for Vercel serverless
export default app;
