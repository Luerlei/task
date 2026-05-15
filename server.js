import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;
const JWT_SECRET = 'task-board-secret-key-2024';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Database setup
const defaultData = {
  users: [
    {
      id: uuidv4(),
      username: 'admin',
      password: bcrypt.hashSync('admin123', 10),
      displayName: '管理员',
      role: 'admin',
      group: '',
      totalPoints: 0,
      mustChangePassword: true,
      createdAt: new Date().toISOString()
    }
  ],
  tasks: [],
  lanes: [
    { id: uuidv4(), name: '待认领', order: 0, color: '#007AFF' },
    { id: uuidv4(), name: '进行中', order: 1, color: '#FF9500' },
    { id: uuidv4(), name: '待验收', order: 2, color: '#AF52DE' },
    { id: uuidv4(), name: '已完成', order: 3, color: '#34C759' }
  ],
  groups: [],
  categories: [],
  priorities: [
    { id: 'tian', name: '天', color: '#FF3B30', order: 1 },
    { id: 'di', name: '地', color: '#FF9500', order: 2 },
    { id: 'xuan', name: '玄', color: '#007AFF', order: 3 },
    { id: 'huang', name: '黄', color: '#34C759', order: 4 }
  ],
  comments: [],
  pointsHistory: [],
  settings: {
    allowRegistration: true,
    taskVisibilityControl: false,
    systemName: '任务看板',
    systemIcon: '📋',
    menuNames: { board: '看板', settings: '系统设置' },
    menuIcons: { board: '📋', settings: '⚙️' }
  }
};

const adapter = new JSONFile(join(__dirname, 'db.json'));
const db = new Low(adapter, defaultData);
await db.read();
if (!db.data) {
  db.data = defaultData;
}
if (!db.data.users || db.data.users.length === 0) {
  db.data = defaultData;
}
if (!db.data.settings) {
  db.data.settings = { allowRegistration: true, taskVisibilityControl: false, systemName: '任务看板', systemIcon: '📋', menuNames: { board: '看板', settings: '系统设置' }, menuIcons: { board: '📋', settings: '⚙️' } };
}
if (!db.data.categories) db.data.categories = [];
if (!db.data.priorities || db.data.priorities.length === 0) {
  db.data.priorities = [
    { id: 'tian', name: '天', color: '#FF3B30', order: 1 },
    { id: 'di', name: '地', color: '#FF9500', order: 2 },
    { id: 'xuan', name: '玄', color: '#007AFF', order: 3 },
    { id: 'huang', name: '黄', color: '#34C759', order: 4 }
  ];
}
await db.write();

// Auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.data.users.find(u => u.id === decoded.id);
    if (!user) return res.status(401).json({ error: '用户不存在' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token无效' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '权限不足' });
  }
  next();
}

// ==================== AUTH API ====================

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }
  const user = db.data.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const { password: _, ...userInfo } = user;
  res.json({ token, user: userInfo });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const { password: _, ...userInfo } = req.user;
  res.json(userInfo);
});

app.put('/api/auth/password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: '请输入旧密码和新密码' });
  }
  if (!bcrypt.compareSync(oldPassword, req.user.password)) {
    return res.status(400).json({ error: '旧密码错误' });
  }
  req.user.password = bcrypt.hashSync(newPassword, 10);
  req.user.mustChangePassword = false;
  await db.write();
  res.json({ message: '密码修改成功' });
});

app.post('/api/auth/register', async (req, res) => {
  if (!db.data.settings) db.data.settings = { allowRegistration: true, taskVisibilityControl: false };
  if (!db.data.settings.allowRegistration) {
    return res.status(403).json({ error: '注册功能已关闭' });
  }
  const { username, password, displayName } = req.body;
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: '请填写所有必填字段' });
  }
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: '用户名长度2-20字符' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少6位' });
  }
  if (db.data.users.find(u => u.username === username)) {
    return res.status(400).json({ error: '用户名已存在' });
  }
  const user = {
    id: uuidv4(),
    username,
    password: bcrypt.hashSync(password, 10),
    displayName,
    role: 'member',
    group: '',
    totalPoints: 0,
    mustChangePassword: false,
    createdAt: new Date().toISOString()
  };
  db.data.users.push(user);
  await db.write();
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const { password: _, ...userInfo } = user;
  res.json({ token, user: userInfo });
});

// ==================== USERS API ====================

app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
  const users = db.data.users.map(({ password, ...u }) => u);
  res.json(users);
});

app.post('/api/users', authMiddleware, adminOnly, async (req, res) => {
  const { username, password, displayName, role, group } = req.body;
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: '请填写必要信息' });
  }
  if (db.data.users.find(u => u.username === username)) {
    return res.status(400).json({ error: '用户名已存在' });
  }
  const user = {
    id: uuidv4(),
    username,
    password: bcrypt.hashSync(password, 10),
    displayName,
    role: role || 'member',
    group: group || '',
    totalPoints: 0,
    mustChangePassword: false,
    createdAt: new Date().toISOString()
  };
  db.data.users.push(user);
  await db.write();
  const { password: _, ...userInfo } = user;
  res.json(userInfo);
});

app.put('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const user = db.data.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const { displayName, role, group, password } = req.body;
  if (displayName) user.displayName = displayName;
  if (role) user.role = role;
  if (group !== undefined) user.group = group;
  if (password) user.password = bcrypt.hashSync(password, 10);
  await db.write();
  const { password: _, ...userInfo } = user;
  res.json(userInfo);
});

app.delete('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const idx = db.data.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '用户不存在' });
  if (db.data.users[idx].username === 'admin') {
    return res.status(400).json({ error: '不能删除默认管理员' });
  }
  db.data.users.splice(idx, 1);
  await db.write();
  res.json({ message: '删除成功' });
});

// ==================== GROUPS API ====================

app.get('/api/groups', authMiddleware, (req, res) => {
  res.json(db.data.groups);
});

app.post('/api/groups', authMiddleware, adminOnly, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: '请输入分组名称' });
  const group = { id: uuidv4(), name };
  db.data.groups.push(group);
  await db.write();
  res.json(group);
});

app.put('/api/groups/:id', authMiddleware, adminOnly, async (req, res) => {
  const group = db.data.groups.find(g => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: '分组不存在' });
  if (req.body.name) group.name = req.body.name;
  await db.write();
  res.json(group);
});

app.delete('/api/groups/:id', authMiddleware, adminOnly, async (req, res) => {
  const idx = db.data.groups.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '分组不存在' });
  db.data.groups.splice(idx, 1);
  await db.write();
  res.json({ message: '删除成功' });
});

// ==================== LANES API ====================

app.get('/api/lanes', authMiddleware, (req, res) => {
  const lanes = [...db.data.lanes].sort((a, b) => a.order - b.order);
  res.json(lanes);
});

app.post('/api/lanes', authMiddleware, adminOnly, async (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: '请输入泳道名称' });
  const maxOrder = db.data.lanes.reduce((max, l) => Math.max(max, l.order), -1);
  const lane = { id: uuidv4(), name, order: maxOrder + 1, color: color || '#8E8E93' };
  db.data.lanes.push(lane);
  await db.write();
  res.json(lane);
});

app.put('/api/lanes/:id', authMiddleware, adminOnly, async (req, res) => {
  const lane = db.data.lanes.find(l => l.id === req.params.id);
  if (!lane) return res.status(404).json({ error: '泳道不存在' });
  if (req.body.name) lane.name = req.body.name;
  if (req.body.color) lane.color = req.body.color;
  await db.write();
  res.json(lane);
});

app.delete('/api/lanes/:id', authMiddleware, adminOnly, async (req, res) => {
  const idx = db.data.lanes.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '泳道不存在' });
  // Check if there are tasks in this lane
  const tasksInLane = db.data.tasks.filter(t => t.laneId === req.params.id);
  if (tasksInLane.length > 0) {
    return res.status(400).json({ error: '该泳道中还有任务，无法删除' });
  }
  db.data.lanes.splice(idx, 1);
  await db.write();
  res.json({ message: '删除成功' });
});

app.put('/api/lanes/reorder', authMiddleware, adminOnly, async (req, res) => {
  const { order } = req.body; // array of lane ids in new order
  if (!Array.isArray(order)) return res.status(400).json({ error: '参数错误' });
  order.forEach((id, idx) => {
    const lane = db.data.lanes.find(l => l.id === id);
    if (lane) lane.order = idx;
  });
  await db.write();
  res.json(db.data.lanes.sort((a, b) => a.order - b.order));
});

// ==================== TASKS API ====================

app.get('/api/tasks', authMiddleware, (req, res) => {
  const tasks = db.data.tasks.map(task => {
    const creator = db.data.users.find(u => u.id === task.creatorId);
    const assigneeUsers = task.assignees.map(aid => {
      const u = db.data.users.find(user => user.id === aid);
      return u ? { id: u.id, displayName: u.displayName, group: u.group } : null;
    }).filter(Boolean);
    const creatorUser = creator ? { id: creator.id, displayName: creator.displayName } : null;
    return { ...task, creatorName: creator?.displayName || '未知', assigneeUsers, creatorUser };
  });
  res.json(tasks);
});

app.post('/api/tasks', authMiddleware, adminOnly, async (req, res) => {
  const { title, description, rewardPoints, deadline, priority, startDate, endDate, category } = req.body;
  if (!title) return res.status(400).json({ error: '请输入任务标题' });
  const firstLane = db.data.lanes.sort((a, b) => a.order - b.order)[0];
  const task = {
    id: uuidv4(),
    title,
    description: description || '',
    creatorId: req.user.id,
    assignees: [],
    laneId: firstLane?.id || '',
    rewardPoints: rewardPoints || 0,
    deadline: deadline || null,
    priority: priority || 'xuan',
    startDate: startDate || null,
    endDate: endDate || null,
    category: category || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null
  };
  db.data.tasks.push(task);
  await db.write();
  res.json(task);
});

app.put('/api/tasks/:id', authMiddleware, adminOnly, async (req, res) => {
  const task = db.data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  const { title, description, rewardPoints, deadline, priority, startDate, endDate, category } = req.body;
  if (title) task.title = title;
  if (description !== undefined) task.description = description;
  if (rewardPoints !== undefined) task.rewardPoints = rewardPoints;
  if (deadline !== undefined) task.deadline = deadline;
  if (priority) task.priority = priority;
  if (startDate !== undefined) task.startDate = startDate;
  if (endDate !== undefined) task.endDate = endDate;
  if (category !== undefined) task.category = category;
  task.updatedAt = new Date().toISOString();
  await db.write();
  res.json(task);
});

app.put('/api/tasks/:id/dates', authMiddleware, async (req, res) => {
  const task = db.data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  const { startDate, endDate } = req.body;
  if (startDate !== undefined) task.startDate = startDate;
  if (endDate !== undefined) task.endDate = endDate;
  task.updatedAt = new Date().toISOString();
  await db.write();
  res.json(task);
});

app.delete('/api/tasks/:id', authMiddleware, adminOnly, async (req, res) => {
  const idx = db.data.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '任务不存在' });
  db.data.tasks.splice(idx, 1);
  // Also delete comments for this task
  db.data.comments = db.data.comments.filter(c => c.taskId !== req.params.id);
  await db.write();
  res.json({ message: '删除成功' });
});

app.post('/api/tasks/:id/claim', authMiddleware, async (req, res) => {
  const task = db.data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  if (task.assignees.includes(req.user.id)) {
    return res.status(400).json({ error: '您已认领此任务' });
  }
  task.assignees.push(req.user.id);
  task.updatedAt = new Date().toISOString();
  await db.write();
  res.json(task);
});

app.post('/api/tasks/:id/unclaim', authMiddleware, async (req, res) => {
  const task = db.data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  task.assignees = task.assignees.filter(id => id !== req.user.id);
  task.updatedAt = new Date().toISOString();
  await db.write();
  res.json(task);
});

app.put('/api/tasks/:id/move', authMiddleware, async (req, res) => {
  const task = db.data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  const { laneId } = req.body;
  const lane = db.data.lanes.find(l => l.id === laneId);
  if (!lane) return res.status(400).json({ error: '目标泳道不存在' });

  // Check if moving to the last lane (completed)
  const sortedLanes = [...db.data.lanes].sort((a, b) => a.order - b.order);
  const lastLane = sortedLanes[sortedLanes.length - 1];
  const previousLaneId = task.laneId;

  task.laneId = laneId;
  task.updatedAt = new Date().toISOString();

  // If moved to last lane, mark as completed and distribute points
  if (laneId === lastLane.id && previousLaneId !== lastLane.id) {
    task.completedAt = new Date().toISOString();
    // Distribute points equally among assignees
    if (task.assignees.length > 0 && task.rewardPoints > 0) {
      const pointsPerPerson = Math.floor(task.rewardPoints / task.assignees.length);
      for (const assigneeId of task.assignees) {
        const user = db.data.users.find(u => u.id === assigneeId);
        if (user) {
          user.totalPoints += pointsPerPerson;
          db.data.pointsHistory.push({
            id: uuidv4(),
            userId: assigneeId,
            taskId: task.id,
            points: pointsPerPerson,
            createdAt: new Date().toISOString()
          });
        }
      }
    }
  } else if (previousLaneId === lastLane.id && laneId !== lastLane.id) {
    // If moved away from completed, reverse points
    task.completedAt = null;
    const historyEntries = db.data.pointsHistory.filter(h => h.taskId === task.id);
    for (const entry of historyEntries) {
      const user = db.data.users.find(u => u.id === entry.userId);
      if (user) user.totalPoints -= entry.points;
    }
    db.data.pointsHistory = db.data.pointsHistory.filter(h => h.taskId !== task.id);
  }

  await db.write();
  res.json(task);
});

// ==================== COMMENTS API ====================

app.get('/api/tasks/:id/comments', authMiddleware, (req, res) => {
  const comments = db.data.comments
    .filter(c => c.taskId === req.params.id)
    .map(c => {
      const user = db.data.users.find(u => u.id === c.userId);
      return { ...c, userName: user?.displayName || '未知' };
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json(comments);
});

app.post('/api/tasks/:id/comments', authMiddleware, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: '请输入评论内容' });
  const task = db.data.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  const comment = {
    id: uuidv4(),
    taskId: req.params.id,
    userId: req.user.id,
    content,
    createdAt: new Date().toISOString()
  };
  db.data.comments.push(comment);
  await db.write();
  const user = db.data.users.find(u => u.id === req.user.id);
  res.json({ ...comment, userName: user?.displayName || '未知' });
});

// ==================== SETTINGS API ====================

app.get('/api/settings', (req, res) => {
  if (!db.data.settings) db.data.settings = { allowRegistration: true, taskVisibilityControl: false, systemName: '任务看板', systemIcon: '📋', menuNames: { board: '看板', settings: '系统设置' }, menuIcons: { board: '📋', settings: '⚙️' } };
  res.json(db.data.settings);
});

app.put('/api/settings', authMiddleware, adminOnly, async (req, res) => {
  if (!db.data.settings) db.data.settings = { allowRegistration: true, taskVisibilityControl: false, systemName: '任务看板', systemIcon: '📋', menuNames: { board: '看板', settings: '系统设置' }, menuIcons: { board: '📋', settings: '⚙️' } };
  const { allowRegistration, taskVisibilityControl, systemName, systemIcon, menuNames, menuIcons } = req.body;
  if (allowRegistration !== undefined) db.data.settings.allowRegistration = allowRegistration;
  if (taskVisibilityControl !== undefined) db.data.settings.taskVisibilityControl = taskVisibilityControl;
  if (systemName !== undefined) db.data.settings.systemName = systemName;
  if (systemIcon !== undefined) db.data.settings.systemIcon = systemIcon;
  if (menuNames !== undefined) db.data.settings.menuNames = { ...db.data.settings.menuNames, ...menuNames };
  if (menuIcons !== undefined) db.data.settings.menuIcons = { ...(db.data.settings.menuIcons || {}), ...menuIcons };
  await db.write();
  res.json(db.data.settings);
});

// ==================== LEADERBOARD API ====================

app.get('/api/leaderboard', authMiddleware, (req, res) => {
  const leaderboard = db.data.users
    .map(({ password, ...u }) => u)
    .sort((a, b) => b.totalPoints - a.totalPoints);
  res.json(leaderboard);
});

// ==================== CATEGORIES API ====================

app.get('/api/categories', authMiddleware, (req, res) => {
  const categories = [...(db.data.categories || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  res.json(categories);
});

app.post('/api/categories', authMiddleware, adminOnly, async (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: '请输入分类名称' });
  const maxOrder = (db.data.categories || []).reduce((max, c) => Math.max(max, c.order || 0), -1);
  const category = { id: uuidv4(), name, color: color || '#8E8E93', order: maxOrder + 1 };
  db.data.categories.push(category);
  await db.write();
  res.json(category);
});

app.put('/api/categories/:id', authMiddleware, adminOnly, async (req, res) => {
  const cat = db.data.categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: '分类不存在' });
  if (req.body.name) cat.name = req.body.name;
  if (req.body.color) cat.color = req.body.color;
  if (req.body.order !== undefined) cat.order = req.body.order;
  await db.write();
  res.json(cat);
});

app.delete('/api/categories/:id', authMiddleware, adminOnly, async (req, res) => {
  const idx = db.data.categories.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '分类不存在' });
  db.data.categories.splice(idx, 1);
  await db.write();
  res.json({ message: '删除成功' });
});

// ==================== PRIORITIES API ====================

app.get('/api/priorities', authMiddleware, (req, res) => {
  const priorities = [...(db.data.priorities || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  res.json(priorities);
});

app.post('/api/priorities', authMiddleware, adminOnly, async (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: '请输入优先级名称' });
  const maxOrder = (db.data.priorities || []).reduce((max, p) => Math.max(max, p.order || 0), -1);
  const priority = { id: uuidv4(), name, color: color || '#8E8E93', order: maxOrder + 1 };
  db.data.priorities.push(priority);
  await db.write();
  res.json(priority);
});

app.put('/api/priorities/:id', authMiddleware, adminOnly, async (req, res) => {
  const pri = db.data.priorities.find(p => p.id === req.params.id);
  if (!pri) return res.status(404).json({ error: '优先级不存在' });
  if (req.body.name) pri.name = req.body.name;
  if (req.body.color) pri.color = req.body.color;
  if (req.body.order !== undefined) pri.order = req.body.order;
  await db.write();
  res.json(pri);
});

app.delete('/api/priorities/:id', authMiddleware, adminOnly, async (req, res) => {
  const idx = db.data.priorities.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '优先级不存在' });
  db.data.priorities.splice(idx, 1);
  await db.write();
  res.json({ message: '删除成功' });
});

app.get('/api/leaderboard/:userId/history', authMiddleware, (req, res) => {
  const history = db.data.pointsHistory
    .filter(h => h.userId === req.params.userId)
    .map(h => {
      const task = db.data.tasks.find(t => t.id === h.taskId);
      return { ...h, taskTitle: task?.title || '已删除的任务' };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(history);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 任务看板服务已启动: http://localhost:${PORT}`);
  console.log(`📡 局域网访问: http://<本机IP>:${PORT}`);
  console.log(`👤 默认管理员: admin / admin123`);
});
