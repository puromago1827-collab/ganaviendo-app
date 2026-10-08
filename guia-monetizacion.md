# 💰 Guía de Monetización — GanaViendo

## 📊 Resumen: ¿Qué servicio usar?

| Servicio | Para | Tipo de Anuncio |
|---|---|---|
| **Google AdSense** | Web apps y sitios web | Banners, display, video |
| **Google AdMob** | Apps móviles (Android/iOS) | Rewarded, interstitial, banner |
| **Google Ad Manager** | Web avanzado | Rewarded ads para web |

> [!NOTE]
> Como tu app es **web**, usaremos **Google AdSense** + un sistema de anuncios rewarded personalizado.
> Si más adelante conviertes la app a móvil (Flutter/React Native), usarás **AdMob**.

---

## 📋 PASO 1: Registrarse en Google AdSense

### Requisitos previos
- ✅ Una cuenta de Google/Gmail
- ✅ Un sitio web con contenido propio (necesitas hospedar GanaViendo primero)
- ✅ Tener al menos 18 años
- ✅ El sitio debe tener contenido original y cumplir las [políticas de AdSense](https://support.google.com/adsense/answer/48182)

### Pasos de registro

1. **Ve a** [https://www.google.com/adsense/start/](https://www.google.com/adsense/start/)
2. **Haz clic en** "Comenzar"
3. **Ingresa la URL de tu sitio web** (necesitas un dominio, ej: `ganaviendo.com`)
4. **Selecciona tu país** y acepta los términos
5. **Verifica tu sitio** — Google te dará un código que debes pegar en el `<head>` de tu HTML
6. **Espera aprobación** — Google revisa tu sitio (puede tardar 1-14 días)

> [!WARNING]
> **Google NO aprobará tu cuenta si:**
> - Tu sitio está en localhost (necesitas un dominio real)
> - No tienes suficiente contenido original
> - Tu sitio solo existe para mostrar anuncios
> - Incitas a los usuarios a hacer clic en anuncios
>
> **Recomendación**: Antes de aplicar, agrega un blog con artículos, política de privacidad, y términos de uso.

---

## 📋 PASO 2: Preparar tu sitio para la aprobación

Antes de solicitar AdSense, necesitas estas páginas (ya las integré en tu app):

- ✅ **Página principal** con contenido real
- ✅ **Política de privacidad**
- ✅ **Términos y condiciones**
- ✅ **Página "Acerca de"**
- ✅ Al menos 15-20 páginas/artículos de contenido original

---

## 📋 PASO 3: Integrar anuncios en GanaViendo

### Estrategia de monetización (3 tipos de anuncios)

```
┌─────────────────────────────────────────────────────┐
│                   FUENTES DE INGRESO                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. 🎬 Anuncios de Video Rewarded (PRINCIPAL)      │
│     → Usuario ve anuncio de video completo          │
│     → Gana puntos al terminar                      │
│     → Tú ganas ~$0.01-0.05 por vista               │
│                                                     │
│  2. 📐 Banners Display                             │
│     → Siempre visibles en la app                   │
│     → Ingreso pasivo por impresiones               │
│     → ~$1-3 por cada 1000 vistas (CPM)             │
│                                                     │
│  3. 📺 Anuncios Interstitial                       │
│     → Pantalla completa entre videos               │
│     → Mayor pago que banners                       │
│     → ~$2-8 por cada 1000 vistas                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Ganancia estimada

| Métrica | Valor estimado |
|---|---|
| CPM (Costo por 1000 impresiones) | $1 - $5 USD |
| Ganancia por video rewarded visto | $0.01 - $0.05 USD |
| Pago al usuario por video | $0.10 (10 puntos) |
| **Tu margen por video** | **~50-70% del ingreso publicitario** |

> [!CAUTION]
> **Matemáticas importantes**: Si pagas $0.10 por video al usuario pero solo ganas $0.03 por anuncio, estarás perdiendo dinero. Ajusta los puntos/recompensas según tus ingresos reales de AdSense.
>
> **Recomendación inicial**: Empieza pagando poco (2-3 puntos por video) y aumenta conforme crezcan tus ingresos.

---

## 📋 PASO 4: Alternativa sin AdSense — Redes publicitarias más fáciles

Si no quieres esperar la aprobación de AdSense, estas redes aceptan sitios nuevos:

| Red | Requisito mínimo | Tipo de anuncios |
|---|---|---|
| **[PropellerAds](https://propellerads.com)** | Sin mínimo de tráfico | Push, pop-under, interstitial |
| **[Adsterra](https://adsterra.com)** | Sin mínimo | Banners, pop, video |
| **[Monetag](https://monetag.com)** | Sin mínimo | Push, interstitial |
| **[HilltopAds](https://hilltopads.com)** | Sin mínimo | Video, pop, banner |

> [!TIP]
> **Para empezar rápido**: Usa **PropellerAds** o **Adsterra** mientras esperas la aprobación de AdSense. Son más fáciles de integrar y aceptan sitios nuevos.

---

## 📋 PASO 5: Hospedaje (necesario para monetizar)

Tu app necesita estar en internet con un dominio real. Opciones gratuitas/baratas:

| Servicio | Precio | Ideal para |
|---|---|---|
| **[Render](https://render.com)** | Gratis (con limitaciones) | Node.js apps |
| **[Railway](https://railway.app)** | $5/mes | Node.js apps |
| **[Vercel](https://vercel.com)** | Gratis (frontend) | Landing pages |
| **Dominio .com** | ~$10/año en Namecheap | Tu marca |

