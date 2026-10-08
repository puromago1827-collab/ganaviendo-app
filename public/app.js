const API = '';

const app = {
    user: null,
    token: null,
    videos: [],
    currentVideo: null,
    player: null,
    timerInterval: null,
    timeLeft: 30,
    dailyCount: 0,

    // ─── Inicialización ───
    init() {
        // Revisar si alguien entró por un enlace de referido (?ref=CODIGO)
        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref');
        if (refCode) {
            document.getElementById('regRef').value = refCode;
            // Forzar que se abra la ventana de registro automáticamente
            window.location.hash = 'register';
        }

        this.token = localStorage.getItem('gv_token');
        const savedUser = localStorage.getItem('gv_user');

        if (this.token && savedUser) {
            this.user = JSON.parse(savedUser);
            this.refreshProfile().then(() => {
                this.showAuthenticatedUI();
                this.handleRoute();
            });
        } else {
            this.showPublicUI();
            this.handleRoute();
        }

        this.setupEventListeners();
        window.addEventListener('hashchange', () => this.handleRoute());
    },

    setupEventListeners() {
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login(
                document.getElementById('loginEmail').value,
                document.getElementById('loginPassword').value
            );
        });

        document.getElementById('registerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.register(
                document.getElementById('regName').value,
                document.getElementById('regEmail').value,
                document.getElementById('regPassword').value,
                document.getElementById('regRef').value
            );
        });

        document.getElementById('withdrawForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.requestWithdrawal(
                document.getElementById('withdrawMethod').value,
                document.getElementById('withdrawAccount').value,
                document.getElementById('withdrawAmount').value
            );
        });

        document.getElementById('addVideoForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addVideo(
                document.getElementById('adminVidTitle').value,
                document.getElementById('adminVidId').value
            );
        });
    },

    // ─── API Helper ───
    async api(endpoint, options = {}) {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        try {
            const res = await fetch(`${API}${endpoint}`, {
                ...options,
                headers: { ...headers, ...options.headers }
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Error desconocido');
            }
            return data;
        } catch (err) {
            if (err.message === 'Token inválido o expirado.' || err.message === 'Acceso denegado. Token no proporcionado.') {
                this.logout();
            }
            throw err;
        }
    },

    // ─── Navegación SPA ───
    handleRoute() {
        const hash = window.location.hash.replace('#', '') || 'landing';
        const publicRoutes = ['landing', 'login', 'register'];

        if (!this.token && !publicRoutes.includes(hash)) {
            this.navigate('landing');
            return;
        }
        if (this.token && publicRoutes.includes(hash)) {
            this.navigate('dashboard');
            return;
        }

        this.showView(hash);
        this.updateNavUI(hash);

        if (hash === 'dashboard') this.updateDashboard();
        if (hash === 'videos') this.loadVideos();
        if (hash === 'wallet') this.updateWallet();
        if (hash === 'referrals') this.updateReferrals();
        if (hash === 'admin' && this.user && this.user.role === 'admin') this.loadAdminPanel();
    },

    navigate(viewId) {
        window.location.hash = viewId;
    },

    showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const view = document.getElementById(`view-${viewId}`);
        if (view) view.classList.add('active');

        if (viewId !== 'player' && this.player && typeof this.player.stopVideo === 'function') {
            this.player.stopVideo();
            clearInterval(this.timerInterval);
        }
    },

    updateNavUI(activeHash) {
        document.querySelectorAll('.nav-item').forEach(nav => {
            nav.classList.remove('active');
            if (nav.dataset.target === activeHash) {
                nav.classList.add('active');
            }
        });
    },

    showAuthenticatedUI() {
        document.getElementById('appHeader').style.display = 'flex';
        document.getElementById('bottomNav').style.display = 'flex';
        this.updateBalanceUI();
    },

    showPublicUI() {
        document.getElementById('appHeader').style.display = 'none';
        document.getElementById('bottomNav').style.display = 'none';
    },

    // ─── Toasts ───
    showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${type === 'success' ? '✅' : '❌'}</span>
            <div>${message}</div>
        `;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // ─── Autenticación (Backend Real) ───
    async login(email, password) {
        try {
            const data = await this.api('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            this.token = data.token;
            this.user = data.user;
            localStorage.setItem('gv_token', this.token);
            localStorage.setItem('gv_user', JSON.stringify(this.user));

            this.showToast('¡Inicio de sesión exitoso!');
            this.showAuthenticatedUI();
            this.navigate('dashboard');
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async register(name, email, password, referralCode) {
        try {
            const body = { name, email, password };
            if (referralCode) body.referralCode = referralCode;

            await this.api('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify(body)
            });
            this.showToast('¡Cuenta creada con éxito! Inicia sesión.');
            this.navigate('login');
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('gv_token');
        localStorage.removeItem('gv_user');
        this.showPublicUI();
        this.navigate('landing');
    },

    // ─── Perfil ───
    async refreshProfile() {
        try {
            const profile = await this.api('/api/user/profile');
            this.user = { ...this.user, ...profile };
            localStorage.setItem('gv_user', JSON.stringify(this.user));
            this.updateBalanceUI();
        } catch (err) {
            console.error('Error refrescando perfil:', err);
        }
    },

    // ─── Balance UI ───
    updateBalanceUI() {
        if (!this.user) return;
        const points = this.user.points || 0;
        const usd = (points / 100).toFixed(2);

        ['headerPoints', 'dashPoints'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = points;
        });
        ['headerUsd', 'dashUsd', 'walletUsd'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = usd;
        });
    },

    // ─── Dashboard ───
    updateDashboard() {
        this.refreshProfile();
        document.getElementById('dailyCount').textContent = this.dailyCount;
        document.getElementById('dailyProgress').style.width = `${(this.dailyCount / 20) * 100}%`;

        const adminLink = document.getElementById('adminPanelLink');
        if (this.user && this.user.role === 'admin') {
            adminLink.style.display = 'block';
        } else {
            adminLink.style.display = 'none';
        }
    },

    // ─── Videos (Backend Real) ───
    async loadVideos() {
        const grid = document.getElementById('videosGrid');

        if (this.dailyCount >= 20) {
            grid.innerHTML = '<div class="card"><p class="text-center text-muted">Has alcanzado el límite diario de 20 videos. ¡Vuelve mañana!</p></div>';
            return;
        }

        try {
            const videos = await this.api('/api/videos');
            this.videos = videos;

            if (videos.length === 0) {
                grid.innerHTML = '<div class="card"><p class="text-center text-muted">No hay videos disponibles en este momento.</p></div>';
                return;
            }

            grid.innerHTML = videos.map(v => `
                <div class="video-card">
                    <img src="https://img.youtube.com/vi/${v.youtubeId}/hqdefault.jpg" class="video-thumb" alt="${v.title}">
                    <div class="video-info">
                        <h4 class="video-title">${v.title}</h4>
                        <div class="video-reward">💰 +${v.pointsReward} Puntos</div>
                        <button class="btn" onclick="app.playVideo('${v.id}', '${v.youtubeId}', '${v.title.replace(/'/g, "\\'")}', ${v.pointsReward})">Ver Video</button>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            grid.innerHTML = '<div class="card"><p class="text-center text-muted">Error cargando videos.</p></div>';
            this.showToast(err.message, 'error');
        }
    },

    // ─── Reproductor de Video ───
    playVideo(videoId, youtubeId, title, points) {
        if (this.dailyCount >= 20) {
            this.showToast('Límite diario alcanzado.', 'error');
            return;
        }

        this.currentVideo = { id: videoId, youtubeId, title, points };
        document.getElementById('playerTitle').textContent = title;
        document.getElementById('claimBtn').style.display = 'none';
        document.getElementById('claimBtn').textContent = `🎁 Reclamar ${points} Puntos`;

        const tBox = document.getElementById('timerBox');
        tBox.classList.remove('done');
        tBox.innerHTML = 'Tiempo restante: <span id="timeLeft">30</span>s';
        this.timeLeft = 30;

        this.navigate('player');

        if (this.player && typeof this.player.loadVideoById === 'function') {
            this.player.loadVideoById(youtubeId);
        } else {
            this.player = new YT.Player('ytplayer', {
                height: '100%',
                width: '100%',
                videoId: youtubeId,
                playerVars: {
                    playsinline: 1,
                    controls: 1,
                    disablekb: 1,
                    fs: 0,
                    rel: 0
                },
                events: {
                    onStateChange: this.onPlayerStateChange.bind(this)
                }
            });
        }
    },

    onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
            this.startTimer();
        } else {
            this.pauseTimer();
        }
    },

    startTimer() {
        if (this.timeLeft <= 0) return;
        clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            this.timeLeft--;
            const tl = document.getElementById('timeLeft');
            if (tl) tl.textContent = this.timeLeft;

            if (this.timeLeft <= 0) {
                clearInterval(this.timerInterval);
                const tBox = document.getElementById('timerBox');
                tBox.classList.add('done');
                tBox.innerHTML = '¡Completado! Puedes reclamar tus puntos.';
                document.getElementById('claimBtn').style.display = 'block';
            }
        }, 1000);
    },

    pauseTimer() {
        clearInterval(this.timerInterval);
    },

    // ─── Sistema de Anuncios Rewarded ───
    showRewardedAd() {
        // Mostrar overlay del anuncio rewarded
        const container = document.getElementById('rewardedAdContainer');
        container.style.display = 'flex';
        
        // Ocultar el botón de cerrar hasta que pase el tiempo
        document.getElementById('closeAdBtn').style.display = 'none';
        const timerEl = document.getElementById('rewardedAdTimer');
        timerEl.classList.remove('complete');
        
        // Restaurar la estructura del contador por si se borró en el video anterior
        timerEl.innerHTML = 'Espera <span id="adTimeLeft">5</span> segundos...';
        
        // Countdown de 5 segundos (el usuario debe ver el anuncio)
        let adTime = 5;
        
        const adInterval = setInterval(() => {
            adTime--;
            const spanLeft = document.getElementById('adTimeLeft');
            if(spanLeft) spanLeft.textContent = adTime;
            
            if (adTime <= 0) {
                clearInterval(adInterval);
                timerEl.classList.add('complete');
                timerEl.innerHTML = '✅ ¡Anuncio completado!';
                document.getElementById('closeAdBtn').style.display = 'block';
            }
        }, 1000);
    },

    async onRewardedAdComplete() {
        // Cerrar el overlay
        document.getElementById('rewardedAdContainer').style.display = 'none';
        
        // Reclamar los puntos en el backend
        if (!this.currentVideo) return;
        try {
            const data = await this.api('/api/videos/watch', {
                method: 'POST',
                body: JSON.stringify({ videoId: this.currentVideo.id })
            });
            this.user.points = data.newPoints;
            localStorage.setItem('gv_user', JSON.stringify(this.user));
            this.dailyCount++;
            this.updateBalanceUI();
            this.showToast(`¡Has ganado ${this.currentVideo.points} puntos!`);
            
            // --- LÓGICA DE SALTO AUTOMÁTICO AL SIGUIENTE VIDEO ---
            
            // 1. Validar límite diario primero
            if (this.dailyCount >= 20) {
                this.showToast('¡Has alcanzado el límite de 20 videos diarios!', 'success');
                this.navigate('dashboard');
                return;
            }

            // 2. Buscar si hay un video siguiente en la lista
            const currentIndex = this.videos.findIndex(v => v.id === this.currentVideo.id);
            if (currentIndex !== -1 && currentIndex + 1 < this.videos.length) {
                const nextVid = this.videos[currentIndex + 1];
                
                // Esperamos 1.5 segundos para que el usuario pueda ver el mensaje de que ganó puntos
                setTimeout(() => {
                    this.showToast('⏭️ Reproduciendo el siguiente video...');
                    this.playVideo(nextVid.id, nextVid.youtubeId, nextVid.title.replace(/'/g, "\\'"), nextVid.pointsReward);
                }, 1500);
            } else {
                // No hay más videos en la lista
                this.showToast('¡Has visto todos los videos disponibles!');
                this.navigate('videos');
            }

        } catch (err) {
            this.showToast(err.message, 'error');
            this.navigate('videos');
        }
    },

    // ─── Billetera / Retiros (Backend Real) ───
    updateWallet() {
        this.refreshProfile();
        this.loadWithdrawals();
    },

    async loadWithdrawals() {
        try {
            const withdrawals = await this.api('/api/withdrawals/me');
            const container = document.getElementById('withdrawHistory');

            if (withdrawals.length === 0) {
                container.innerHTML = '<p class="text-muted">No tienes retiros previos.</p>';
                return;
            }

            const statusColors = {
                pending: '#f0ad4e',
                approved: '#00C896',
                rejected: '#ff3366'
            };
            const statusLabels = {
                pending: 'Pendiente',
                approved: 'Aprobado',
                rejected: 'Rechazado'
            };

            container.innerHTML = withdrawals.map(w => `
                <div style="padding: 12px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>$${w.amountUSD.toFixed(2)}</strong>
                        <br><small class="text-muted">${new Date(w.createdAt).toLocaleDateString('es')}</small>
                    </div>
                    <span style="color: ${statusColors[w.status]}; font-weight: 600;">${statusLabels[w.status]}</span>
                </div>
            `).join('');
        } catch (err) {
            console.error('Error cargando retiros:', err);
        }
    },

    async requestWithdrawal(method, account, amount) {
        amount = parseFloat(amount);
        if (amount < 15) {
            this.showToast('El monto mínimo es de $15 USD', 'error');
            return;
        }
        const pointsCost = amount * 100;
        if (this.user.points < pointsCost) {
            this.showToast('No tienes suficientes puntos', 'error');
            return;
        }

        try {
            await this.api('/api/withdrawals', {
                method: 'POST',
                body: JSON.stringify({
                    bankDetails: `${method} - Cuenta: ${account}`,
                    amount
                })
            });
            this.showToast('Solicitud de retiro enviada correctamente');
            document.getElementById('withdrawForm').reset();
            await this.refreshProfile();
            this.loadWithdrawals();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    // ─── Referidos ───
    updateReferrals() {
        if (this.user) {
            document.getElementById('refCode').textContent = this.user.referralCode || 'N/A';
        }
    },

    copyRefCode() {
        const code = this.user.referralCode || '';
        // Crear un enlace mágico que ya incluye el código
        const link = window.location.origin + '/?ref=' + code;
        
        navigator.clipboard.writeText(link).then(() => {
            this.showToast('¡Enlace de referido copiado al portapapeles!');
        }).catch(() => {
            // Fallback
            const input = document.createElement('input');
            input.value = link;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            this.showToast('¡Enlace copiado!');
        });
    },

    // ─── Panel Admin (Backend Real) ───
    async loadAdminPanel() {
        try {
            // Estadísticas
            const stats = await this.api('/api/admin/stats');
            const statsContainer = document.querySelector('#view-admin .card:first-child div[style]');
            if (statsContainer) {
                statsContainer.innerHTML = `
                    <div><p style="opacity: 0.7;">Usuarios</p><h3>${stats.totalUsers}</h3></div>
                    <div><p style="opacity: 0.7;">Videos</p><h3>${stats.totalVideos}</h3></div>
                    <div><p style="opacity: 0.7;">Retiros P.</p><h3>${stats.pendingWithdrawals}</h3></div>
                `;
            }

            // Lista de videos
            const videos = await this.api('/api/videos');
            const list = document.getElementById('adminVideosList');
            if (videos.length === 0) {
                list.innerHTML = '<p class="text-muted">No hay videos.</p>';
            } else {
                list.innerHTML = videos.map(v => `
                    <div style="padding: 10px; border: 1px solid #ddd; margin-bottom: 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${v.title}</strong><br>
                            <span class="text-muted">ID: ${v.youtubeId} | ${v.pointsReward} pts</span>
                        </div>
                        <button class="btn btn-outline" style="padding: 5px 10px; width: auto;" onclick="app.removeVideo('${v.id}')">Eliminar</button>
                    </div>
                `).join('');
            }

            // Retiros pendientes
            const withdrawals = await this.api('/api/admin/withdrawals');
            const wList = document.getElementById('adminWithdrawals');
            const pending = withdrawals.filter(w => w.status === 'pending');

            if (pending.length === 0) {
                wList.innerHTML = '<p class="text-muted">No hay retiros pendientes.</p>';
            } else {
                wList.innerHTML = pending.map(w => `
                    <div style="padding: 12px; border: 1px solid #ddd; margin-bottom: 10px; border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <strong>$${w.amountUSD.toFixed(2)} USD</strong>
                            <span class="text-muted">${new Date(w.createdAt).toLocaleDateString('es')}</span>
                        </div>
                        <p style="font-size: 0.85rem; margin-bottom: 8px;">${w.bankDetails}</p>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-secondary" style="padding: 6px 12px; width: auto;" onclick="app.handleWithdrawal('${w.id}', 'approved')">✅ Aprobar</button>
                            <button class="btn btn-outline" style="padding: 6px 12px; width: auto; border-color: #ff3366; color: #ff3366;" onclick="app.handleWithdrawal('${w.id}', 'rejected')">❌ Rechazar</button>
                        </div>
                    </div>
                `).join('');
            }
        } catch (err) {
            this.showToast('Error cargando panel de admin: ' + err.message, 'error');
        }
    },

    async addVideo(title, youtubeId) {
        try {
            await this.api('/api/admin/videos', {
                method: 'POST',
                body: JSON.stringify({ youtubeId, title, category: 'entretenimiento', pointsReward: 10 })
            });
            this.showToast('Video agregado');
            document.getElementById('addVideoForm').reset();
            this.loadAdminPanel();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async removeVideo(id) {
        try {
            await this.api(`/api/admin/videos/${id}`, { method: 'DELETE' });
            this.showToast('Video eliminado');
            this.loadAdminPanel();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    async handleWithdrawal(id, status) {
        try {
            await this.api(`/api/admin/withdrawals/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ status })
            });
            this.showToast(status === 'approved' ? 'Retiro aprobado' : 'Retiro rechazado');
            this.loadAdminPanel();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    }
};

// YouTube IFrame API callback
function onYouTubeIframeAPIReady() {
    // API lista
}

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

// Utilidad automática: Extraer ID de YouTube al pegar enlaces
document.getElementById('adminVidId').addEventListener('input', function(e) {
    let val = e.target.value.trim();
    let id = "";
    
    if (val.includes("youtu.be/")) {
        id = val.split("youtu.be/")[1].substring(0, 11);
    } else if (val.includes("watch?v=")) {
        id = val.split("watch?v=")[1].substring(0, 11);
    } else if (val.includes("shorts/")) {
        id = val.split("shorts/")[1].substring(0, 11);
    }
    
    // Si encontró un ID, reemplazar el texto largo por solo el ID
    if (id && id.length === 11) {
        e.target.value = id;
    }
});
