// server.js
// Run:  node server.js
// Make sure you did: npm install express cors mysql2

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = 3000;

// TODO: put your real MySQL password here
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'MyNewPass123!',          // <-- change if you set a password
  database: 'TaskTrackerDB', // <-- change if your DB name is different
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

app.use(cors());
app.use(express.json());

/**
 * Helper: get or create UserID from userName
 */
async function getOrCreateUserId(userName, conn) {
  if (!userName || userName.trim() === '') {
    // fallback: anonymous user
    userName = 'Unknown';
  }

  let [rows] = await conn.execute(
    'SELECT UserID FROM Users WHERE UserName = ?',
    [userName]
  );
  if (rows.length > 0) return rows[0].UserID;

  const [result] = await conn.execute(
    'INSERT INTO Users (UserName) VALUES (?)',
    [userName]
  );
  return result.insertId;
}

/**
 * Helper: get or create CategoryID from category name
 */
async function getOrCreateCategoryId(categoryName, conn) {
  if (!categoryName || categoryName.trim() === '') {
    categoryName = 'Default';
  }

  let [rows] = await conn.execute(
    'SELECT CategoryID FROM Categories WHERE CategoryName = ?',
    [categoryName]
  );
  if (rows.length > 0) return rows[0].CategoryID;

  const [result] = await conn.execute(
    'INSERT INTO Categories (CategoryName) VALUES (?)',
    [categoryName]
  );
  return result.insertId;
}

/**
 * Helper: get or create StatusID from status name
 */
async function getOrCreateStatusId(statusName, conn) {
  if (!statusName || statusName.trim() === '') {
    statusName = 'Pending';
  }

  let [rows] = await conn.execute(
    'SELECT StatusID FROM Status WHERE StatusName = ?',
    [statusName]
  );
  if (rows.length > 0) return rows[0].StatusID;

  const [result] = await conn.execute(
    'INSERT INTO Status (StatusName) VALUES (?)',
    [statusName]
  );
  return result.insertId;
}

/**
 * GET /api/tasks
 * Returns all tasks with joined names for User, Category, Status
 */
app.get('/api/tasks', async (req, res) => {
  try {
    const conn = await pool.getConnection();

    const [rows] = await conn.execute(
      `SELECT 
          t.TaskID,
          t.Title,
          t.Description,
          t.Deadline,
          u.UserName,
          c.CategoryName AS Category,
          s.StatusName AS Status
        FROM Tasks t
        LEFT JOIN Users u ON t.UserID = u.UserID
        LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
        LEFT JOIN Status s ON t.StatusID = s.StatusID
        ORDER BY t.TaskID`
    );

    conn.release();
    res.json(rows);
  } catch (err) {
    console.error('GET /api/tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

/**
 * POST /api/tasks
 * Body: { title, category, description, deadline, status, userName }
 */
app.post('/api/tasks', async (req, res) => {
  const { title, category, description, deadline, status, userName } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const userId = await getOrCreateUserId(userName, conn);
    const categoryId = await getOrCreateCategoryId(category, conn);
    const statusId = await getOrCreateStatusId(status, conn);

    const [result] = await conn.execute(
      `INSERT INTO Tasks (UserID, CategoryID, StatusID, Title, Description, Deadline)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, categoryId, statusId, title, description || '', deadline || null]
    );

    await conn.commit();
    conn.release();

    res.status(201).json({ message: 'Task created', TaskID: result.insertId });
  } catch (err) {
    if (conn) await conn.rollback();
    if (conn) conn.release();
    console.error('POST /api/tasks error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * PUT /api/tasks/:id
 * Body: { title, category, description, deadline, status, userName }
 */
app.put('/api/tasks/:id', async (req, res) => {
  const taskId = req.params.id;
  const { title, category, description, deadline, status, userName } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const userId = await getOrCreateUserId(userName, conn);
    const categoryId = await getOrCreateCategoryId(category, conn);
    const statusId = await getOrCreateStatusId(status, conn);

    const [result] = await conn.execute(
      `UPDATE Tasks
       SET UserID = ?, CategoryID = ?, StatusID = ?, Title = ?, Description = ?, Deadline = ?
       WHERE TaskID = ?`,
      [userId, categoryId, statusId, title, description || '', deadline || null, taskId]
    );

    await conn.commit();
    conn.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ message: 'Task updated' });
  } catch (err) {
    if (conn) await conn.rollback();
    if (conn) conn.release();
    console.error('PUT /api/tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * DELETE /api/tasks/:id
 */
app.delete('/api/tasks/:id', async (req, res) => {
  const taskId = req.params.id;

  try {
    const conn = await pool.getConnection();
    const [result] = await conn.execute(
      'DELETE FROM Tasks WHERE TaskID = ?',
      [taskId]
    );
    conn.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error('DELETE /api/tasks/:id error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Task Tracker API running on http://localhost:${PORT}`);
});
