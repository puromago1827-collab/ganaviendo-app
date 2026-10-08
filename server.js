const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'db.json');
const JWT_SECRET = 'secreto_super_seguro_ganaviendo'; // En producción, usar variables de entorno

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuración y Reglas
const POINTS_PER_VIDEO = 10;
const MIN_WITHDRAWAL_POINTS = 1500;
const POINTS_TO_USD_RATE = 100; // 100 puntos = $1
const REFERRAL_BONUS_INVITER = 50;
const REFERRAL_BONUS_INVITEE = 25;
const COOLDOWN_SECONDS = 30;
const DAILY_LIMIT_VIDEOS = 50;

// Utilidades DB
function readDb() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error leyendo DB:", error);
        return { users: [], videos: [], withdrawals: [], history: [] };
    }
}

function saveDb(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Middleware de Autenticación
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token inválido o expirado.' });
    }
}

// Middleware de Admin
function adminMiddleware(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
    }
    next();
}

function generateReferralCode(name) {
    return name.substring(0, 4).toUpperCase() + Math.floor(1000 + Math.random() * 9000);
}

// --- RUTAS DE AUTENTICACIÓN ---

app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, referralCode } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    const db = readDb();
    if (db.users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: uuidv4(),
        name,
        email,
        password: hashedPassword,
        role: 'user',
        points: 0,
        referralCode: generateReferralCode(name),
        referredBy: null,
        createdAt: new Date().toISOString()
    };

    // Sistema de referidos
    if (referralCode) {
        const inviter = db.users.find(u => u.referralCode === referralCode);
        if (inviter) {
            newUser.referredBy = inviter.id;
            newUser.points += REFERRAL_BONUS_INVITEE;
            inviter.points += REFERRAL_BONUS_INVITER;
            
            db.history.push({
                id: uuidv4(),
                userId: inviter.id,
                type: 'referral_bonus',
                points: REFERRAL_BONUS_INVITER,
                details: `Bono por invitar a ${name}`,
                timestamp: new Date().toISOString()
            });
            
            db.history.push({
                id: uuidv4(),
                userId: newUser.id,
                type: 'welcome_bonus',
                points: REFERRAL_BONUS_INVITEE,
                details: `Bono por usar el código de ${inviter.name}`,
                timestamp: new Date().toISOString()
            });
        }
    }

    db.users.push(newUser);
    saveDb(db);

    const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: 'Usuario registrado exitosamente', token, user: { id: newUser.id, name, email, points: newUser.points } });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const db = readDb();
    const user = db.users.find(u => u.email === email);

    if (!user) {
        return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    let isMatch = false;
    if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
        isMatch = await bcrypt.compare(password, user.password);
    } else {
        isMatch = (password === user.password);
        if (isMatch) {
            user.password = await bcrypt.hash(password, 10);
            saveDb(db);
        }
    }

    if (!isMatch) {
        return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Inicio de sesión exitoso', token, user: { id: user.id, name: user.name, email: user.email, role: user.role, points: user.points } });
});

// --- RUTAS DE USUARIO ---

app.get('/api/user/profile', authMiddleware, (req, res) => {
    const db = readDb();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    
    const balanceUSD = (user.points / POINTS_TO_USD_RATE).toFixed(2);
    res.json({ id: user.id, name: user.name, email: user.email, points: user.points, balanceUSD, referralCode: user.referralCode });
});

// --- RUTAS DE VIDEOS ---

app.get('/api/videos', authMiddleware, (req, res) => {
    const db = readDb();
    const activeVideos = db.videos.filter(v => v.active);
    res.json(activeVideos);
});

// Reclamar puntos por ver un video
app.post('/api/videos/watch', authMiddleware, (req, res) => {
    const { videoId } = req.body;
    const db = readDb();
    const user = db.users.find(u => u.id === req.user.id);
    const video = db.videos.find(v => v.id === videoId && v.active);

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (!video) return res.status(404).json({ error: 'Video no encontrado o inactivo.' });

    const now = new Date();
    
    // Anti-fraude: Obtener historial reciente
    const userHistory = db.history.filter(h => h.userId === user.id && h.type === 'watch_video');
    
    // Límite diario
    const today = now.toISOString().split('T')[0];
    const videosToday = userHistory.filter(h => h.timestamp.startsWith(today)).length;
    if (videosToday >= DAILY_LIMIT_VIDEOS) {
        return res.status(429).json({ error: 'Has alcanzado el límite diario de videos.' });
    }

    // Cooldown
    if (userHistory.length > 0) {
        const lastWatch = new Date(userHistory[userHistory.length - 1].timestamp);
        const diffSeconds = (now - lastWatch) / 1000;
        if (diffSeconds < COOLDOWN_SECONDS) {
            return res.status(429).json({ error: `Debes esperar ${Math.ceil(COOLDOWN_SECONDS - diffSeconds)} segundos antes de ver otro video.` });
        }
    }

    // Acreditar puntos
    user.points += video.pointsReward || POINTS_PER_VIDEO;
    
    db.history.push({
        id: uuidv4(),
        userId: user.id,
        type: 'watch_video',
        videoId: video.id,
        points: video.pointsReward || POINTS_PER_VIDEO,
        timestamp: now.toISOString()
    });

    saveDb(db);
    res.json({ message: 'Puntos acreditados exitosamente.', newPoints: user.points });
});

// --- RUTAS DE RETIROS (WITHDRAWALS) ---

app.post('/api/withdrawals', authMiddleware, (req, res) => {
    const { bankDetails } = req.body;
    const db = readDb();
    const user = db.users.find(u => u.id === req.user.id);

    if (!bankDetails) {
        return res.status(400).json({ error: 'Detalles bancarios son obligatorios.' });
    }

    if (user.points < MIN_WITHDRAWAL_POINTS) {
        return res.status(400).json({ error: `Puntos insuficientes. Mínimo requerido: ${MIN_WITHDRAWAL_POINTS} puntos ($${MIN_WITHDRAWAL_POINTS / POINTS_TO_USD_RATE}).` });
    }

    const usdAmount = user.points / POINTS_TO_USD_RATE;
    const withdrawalPoints = user.points;
    
    // Deducir puntos
    user.points = 0;

    const withdrawal = {
        id: uuidv4(),
        userId: user.id,
        points: withdrawalPoints,
        amountUSD: usdAmount,
        bankDetails,
        status: 'pending',
        createdAt: new Date().toISOString()
    };

    db.withdrawals.push(withdrawal);
    
    db.history.push({
        id: uuidv4(),
        userId: user.id,
        type: 'withdrawal_request',
        points: -withdrawalPoints,
        details: `Solicitud de retiro de $${usdAmount}`,
        timestamp: new Date().toISOString()
    });

    saveDb(db);
    res.json({ message: 'Solicitud de retiro creada exitosamente.', withdrawal });
});

app.get('/api/withdrawals/me', authMiddleware, (req, res) => {
    const db = readDb();
    const myWithdrawals = db.withdrawals.filter(w => w.userId === req.user.id);
    res.json(myWithdrawals);
});

// --- RUTAS DE ADMIN ---

app.get('/api/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
    const db = readDb();
    const totalUsers = db.users.length;
    const totalVideos = db.videos.length;
    const pendingWithdrawals = db.withdrawals.filter(w => w.status === 'pending').length;
    
    res.json({ totalUsers, totalVideos, pendingWithdrawals });
});

// CRUD Videos
app.post('/api/admin/videos', authMiddleware, adminMiddleware, (req, res) => {
    const { youtubeId, title, category, pointsReward } = req.body;
    const db = readDb();
    
    const newVideo = {
        id: uuidv4(),
        youtubeId,
        title,
        category,
        pointsReward: pointsReward || POINTS_PER_VIDEO,
        active: true
    };
    
    db.videos.push(newVideo);
    saveDb(db);
    res.status(201).json({ message: 'Video agregado exitosamente', video: newVideo });
});

app.put('/api/admin/videos/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    const { title, category, pointsReward, active } = req.body;
    const db = readDb();
    
    const videoIndex = db.videos.findIndex(v => v.id === id);
    if (videoIndex === -1) return res.status(404).json({ error: 'Video no encontrado' });
    
    if (title !== undefined) db.videos[videoIndex].title = title;
    if (category !== undefined) db.videos[videoIndex].category = category;
    if (pointsReward !== undefined) db.videos[videoIndex].pointsReward = pointsReward;
    if (active !== undefined) db.videos[videoIndex].active = active;
    
    saveDb(db);
    res.json({ message: 'Video actualizado', video: db.videos[videoIndex] });
});

app.delete('/api/admin/videos/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    const db = readDb();
    const initialLength = db.videos.length;
    db.videos = db.videos.filter(v => v.id !== id);
    
    if (db.videos.length === initialLength) {
        return res.status(404).json({ error: 'Video no encontrado' });
    }
    
    saveDb(db);
    res.json({ message: 'Video eliminado' });
});

// Gestionar Retiros
app.get('/api/admin/withdrawals', authMiddleware, adminMiddleware, (req, res) => {
    const db = readDb();
    res.json(db.withdrawals);
});

app.put('/api/admin/withdrawals/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'approved' o 'rejected'
    const db = readDb();
    
    const withdrawal = db.withdrawals.find(w => w.id === id);
    if (!withdrawal) return res.status(404).json({ error: 'Retiro no encontrado' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ error: 'El retiro ya ha sido procesado' });
    
    withdrawal.status = status;
    
    if (status === 'rejected') {
        // Devolver puntos al usuario
        const user = db.users.find(u => u.id === withdrawal.userId);
        if (user) {
            user.points += withdrawal.points;
            db.history.push({
                id: uuidv4(),
                userId: user.id,
                type: 'withdrawal_rejected',
                points: withdrawal.points,
                details: 'Retiro rechazado. Puntos devueltos.',
                timestamp: new Date().toISOString()
            });
        }
    }
    
    saveDb(db);
    res.json({ message: `Retiro actualizado a ${status}`, withdrawal });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor GanaViendo corriendo en http://localhost:${PORT}`);
});
