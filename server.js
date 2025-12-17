require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error acquiring client', err.stack);
  } else {
    console.log('Database connected successfully');
    release();
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

    // Create reflections table (to track who reflected on what)
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
    if (parseInt(result.rows[0].count) === 0) {
      await seedInitialData();
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
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
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Get client IP (for reflection tracking)
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
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
      messages: result.rows,
      totalReflections: parseInt(totalReflections.rows[0].total) || 0
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).render('pages/home', { 
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
    const result = await pool.query(
      'INSERT INTO messages (text, category, author) VALUES ($1, $2, $3) RETURNING *',
      [message.trim(), category, author.trim() || 'Anonymous']
    );
    
    res.redirect('/?success=true');
  } catch (error) {
    console.error('Error saving message:', error);
    res.redirect('/share?error=database');
  }
});

app.post('/reflect/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const userIp = getClientIp(req);
  
  try {
    // Start transaction
    await pool.query('BEGIN');
    
    // Check if user already reflected on this message
    const existingReflection = await pool.query(
      'SELECT id FROM reflections WHERE message_id = $1 AND user_ip = $2',
      [messageId, userIp]
    );
    
    if (existingReflection.rows.length > 0) {
      await pool.query('ROLLBACK');
      return res.json({ success: false, message: 'Already reflected', count: null });
    }
    
    // Add reflection record
    await pool.query(
      'INSERT INTO reflections (message_id, user_ip) VALUES ($1, $2)',
      [messageId, userIp]
    );
    
    // Update message reflection count
    await pool.query(
      'UPDATE messages SET reflection_count = reflection_count + 1 WHERE id = $1 RETURNING reflection_count',
      [messageId]
    );
    
    await pool.query('COMMIT');
    
    // Get updated count
    const result = await pool.query(
      'SELECT reflection_count FROM messages WHERE id = $1',
      [messageId]
    );
    
    res.json({ 
      success: true, 
      count: result.rows[0]?.reflection_count || 0 
    });
    
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error adding reflection:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.get('/reflections', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM messages ORDER BY reflection_count DESC, created_at DESC'
    );
    
    res.render('pages/reflections', { 
      messages: result.rows 
    });
  } catch (error) {
    console.error('Error fetching reflections:', error);
    res.status(500).render('pages/reflections', { 
      messages: [],
      error: 'Failed to load reflections'
    });
  }
});

// Stats endpoint (for future use)
app.get('/api/stats', async (req, res) => {
  try {
    const totalMessages = await pool.query('SELECT COUNT(*) FROM messages');
    const totalReflections = await pool.query('SELECT SUM(reflection_count) FROM messages');
    const topCategories = await pool.query(
      'SELECT category, COUNT(*) as count FROM messages GROUP BY category ORDER BY count DESC LIMIT 5'
    );
    
    res.json({
      totalMessages: parseInt(totalMessages.rows[0].count),
      totalReflections: parseInt(totalReflections.rows[0].sum) || 0,
      topCategories: topCategories.rows
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Health check endpoint for Vercel
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Initialize database and start server
initializeDatabase().then(() => {
  if (require.main === module) {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  }
});

module.exports = app;