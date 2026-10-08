const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'secreto_super_seguro_ganaviendo';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuración y Reglas
const POINTS_PER_VIDEO = 10;
const MIN_WITHDRAWAL_POINTS = 50000;
const POINTS_TO_USD_RATE = 10000;
const REFERRAL_BONUS_INVITER = 500;
const REFERRAL_BONUS_INVITEE = 250;
const COOLDOWN_SECONDS = 30;
const DAILY_LIMIT_VIDEOS = 100;

// Mongoose Config
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ganaviendo';
mongoose.connect(MONGO_URI)
  .then(async () => {
      console.log('MongoDB Conectado');
      // Crear Admin por defecto si no existe
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount === 0) {
          const hashed = await bcrypt.hash('admin123', 10);
          await User.create({
              name: 'Admin',
              email: 'admin@ganaviendo.com',
              password: hashed,
              role: 'admin',
              points: 0,
              referralCode: 'ADMIN2026'
          });
          console.log('Usuario Admin creado por defecto.');
      }
  })
  .catch(err => console.error("Error conectando a MongoDB:", err));

// Schemas
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    points: { type: Number, default: 0 },
    referralCode: { type: String, required: true },
    referredBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

const videoSchema = new mongoose.Schema({
    youtubeId: { type: String, required: true },
    title: { type: String, required: true },
    category: { type: String },
    pointsReward: { type: Number, default: 10 },
    active: { type: Boolean, default: true }
});

const withdrawalSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    points: { type: Number, required: true },
    amountUSD: { type: Number, required: true },
    bankDetails: { type: Object, required: true },
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const historySchema = new mongoose.Schema({
    userId: { type: String, required: true },
    type: { type: String, required: true }, 
    points: { type: Number, required: true },
    videoId: { type: String },
    details: { type: String },
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Video = mongoose.model('Video', videoSchema);
const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
const History = mongoose.model('History', historySchema);

// Middlewares
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Acceso denegado.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token inválido.' });
    }
}

function adminMiddleware(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Permisos de administrador requeridos.' });
    }
    next();
}

function generateReferralCode(name) {
    return name.substring(0, 4).toUpperCase() + Math.floor(1000 + Math.random() * 9000);
}

// --- RUTAS AUTENTICACIÓN ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, referralCode } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: 'Faltan campos' });
        
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'Correo ya registrado' });

        const hashedPassword = await bcrypt.hash(password, 10);
        let referredBy = null;
        let points = 0;

        if (referralCode) {
            const inviter = await User.findOne({ referralCode });
            if (inviter) {
                referredBy = inviter._id;
                points = REFERRAL_BONUS_INVITEE;
                inviter.points += REFERRAL_BONUS_INVITER;
                await inviter.save();
                await History.create({ userId: inviter._id, type: 'referral_bonus', points: REFERRAL_BONUS_INVITER, details: `Bono por invitar a ${name}` });
            }
        }

        const newUser = await User.create({ name, email, password: hashedPassword, referralCode: generateReferralCode(name), referredBy, points });
        if (referredBy) {
            await History.create({ userId: newUser._id, type: 'welcome_bonus', points: REFERRAL_BONUS_INVITEE, details: 'Bono inicial' });
        }

        const token = jwt.sign({ id: newUser._id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ message: 'Registrado', token, user: { id: newUser._id, name, email, points: newUser.points } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

        let isMatch = false;
        if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            isMatch = (password === user.password);
            if (isMatch) {
                user.password = await bcrypt.hash(password, 10);
                await user.save();
            }
        }

        if (!isMatch) return res.status(401).json({ error: 'Credenciales inválidas' });
        
        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ message: 'Inicio de sesión exitoso', token, user: { id: user._id, name: user.name, email: user.email, role: user.role, points: user.points } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- RUTAS DE USUARIO ---
app.get('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const balanceUSD = (user.points / POINTS_TO_USD_RATE).toFixed(2);
        res.json({ id: user._id, name: user.name, email: user.email, points: user.points, balanceUSD, referralCode: user.referralCode });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- RUTAS DE VIDEOS ---
app.get('/api/videos', authMiddleware, async (req, res) => {
    try {
        const videos = await Video.find({ active: true }).lean();
        res.json(videos.map(v => ({ ...v, id: v._id })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/videos/watch', authMiddleware, async (req, res) => {
    try {
        const { videoId } = req.body;
        const user = await User.findById(req.user.id);
        const video = await Video.findOne({ _id: videoId, active: true });
        
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
        if (!video) return res.status(404).json({ error: 'Video no encontrado.' });

        const today = new Date();
        today.setHours(0,0,0,0);
        
        const videosToday = await History.countDocuments({ userId: user._id, type: 'watch_video', timestamp: { $gte: today } });
        if (videosToday >= DAILY_LIMIT_VIDEOS) return res.status(429).json({ error: 'Límite diario alcanzado.' });

        const lastWatch = await History.findOne({ userId: user._id, type: 'watch_video' }).sort({ timestamp: -1 });
        if (lastWatch) {
            const diffSeconds = (new Date() - lastWatch.timestamp) / 1000;
            if (diffSeconds < COOLDOWN_SECONDS) {
                return res.status(429).json({ error: `Debes esperar ${Math.ceil(COOLDOWN_SECONDS - diffSeconds)} segs.` });
            }
        }

        user.points += video.pointsReward || POINTS_PER_VIDEO;
        await user.save();

        await History.create({ userId: user._id, type: 'watch_video', videoId: video._id, points: video.pointsReward || POINTS_PER_VIDEO });
        res.json({ message: 'Puntos acreditados.', newPoints: user.points });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- RUTAS DE RETIROS ---
app.post('/api/withdrawals', authMiddleware, async (req, res) => {
    try {
        const { bankDetails } = req.body;
        const user = await User.findById(req.user.id);
        
        if (!bankDetails) return res.status(400).json({ error: 'Faltan detalles.' });
        if (user.points < MIN_WITHDRAWAL_POINTS) return res.status(400).json({ error: 'Puntos insuficientes.' });

        const usdAmount = user.points / POINTS_TO_USD_RATE;
        const withdrawalPoints = user.points;
        user.points = 0;
        await user.save();

        const withdrawal = await Withdrawal.create({ userId: user._id, points: withdrawalPoints, amountUSD: usdAmount, bankDetails });
        await History.create({ userId: user._id, type: 'withdrawal_request', points: -withdrawalPoints, details: `Solicitud de retiro de $${usdAmount}` });
        res.json({ message: 'Solicitud creada.', withdrawal });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/withdrawals/me', authMiddleware, async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find({ userId: req.user.id }).lean();
        res.json(withdrawals.map(w => ({ ...w, id: w._id })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- RUTAS DE ADMIN ---
app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalVideos = await Video.countDocuments();
        const pendingWithdrawals = await Withdrawal.countDocuments({ status: 'pending' });
        res.json({ totalUsers, totalVideos, pendingWithdrawals });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/videos', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { youtubeId, title, category, pointsReward } = req.body;
        const video = await Video.create({ youtubeId, title, category, pointsReward: pointsReward || POINTS_PER_VIDEO });
        res.status(201).json({ message: 'Video creado', video: { ...video.toObject(), id: video._id } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/videos/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        const video = await Video.findByIdAndUpdate(id, updateData, { new: true }).lean();
        if (!video) return res.status(404).json({ error: 'Video no encontrado' });
        res.json({ message: 'Video actualizado', video: { ...video, id: video._id } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/videos/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const video = await Video.findByIdAndDelete(id);
        if (!video) return res.status(404).json({ error: 'No encontrado' });
        res.json({ message: 'Video eliminado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/withdrawals', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find().lean();
        res.json(withdrawals.map(w => ({ ...w, id: w._id })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/withdrawals/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const withdrawal = await Withdrawal.findById(id);
        if (!withdrawal) return res.status(404).json({ error: 'No encontrado' });
        if (withdrawal.status !== 'pending') return res.status(400).json({ error: 'Ya procesado' });
        
        withdrawal.status = status;
        await withdrawal.save();
        
        if (status === 'rejected') {
            const user = await User.findById(withdrawal.userId);
            if (user) {
                user.points += withdrawal.points;
                await user.save();
                await History.create({ userId: user._id, type: 'withdrawal_rejected', points: withdrawal.points, details: 'Retiro rechazado' });
            }
        }
        res.json({ message: 'Retiro actualizado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
    console.log(`Servidor GanaViendo corriendo en el puerto ${PORT}`);
});
