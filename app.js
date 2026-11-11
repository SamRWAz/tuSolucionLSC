// ============================================================================
// tuSoluciónLSC — Aplicación Interactiva con Conexión en Tiempo Real P2P (WebRTC)
// Soporta conexión entre Computador (Funcionario) y Celulares reales mediante PIN
// ============================================================================

const STORAGE_KEY = 'tuSolucionLSC_shared_state_v2';
const CHANNEL_NAME = 'tuSolucionLSC_sync_channel_v2';
const PEER_ID_PREFIX = 'icesi-tusolucion-lsc-pin-';

const CATEGORIES_DATA = {
  programas: {
    id: 'programas',
    name: 'Programas académicos',
    shortDesc: 'Carreras disponibles, facultades y duración.',
    videoTitle: 'Video LSC: Programas académicos',
    videoDesc: 'Explicación en Lengua de Señas sobre las carreras de pregrado, facultades y duración en semestres.',
    duration: '01:05',
    totalSeconds: 65,
    summarySteps: [
      '1. Presentación de las facultades y carreras de pregrado disponibles.',
      '2. Duración estimada de cada programa (entre 8 y 10 semestres).',
      '3. Modalidad presencial diurna e información de acompañamiento.'
    ],
    lscCaptions: [
      '👋 [Seña LSC]: ¡Hola! Bienvenido a la Universidad Icesi.',
      '🎓 [Seña LSC]: Contamos con 6 facultades y más de 28 carreras de pregrado.',
      '🗓️ [Seña LSC]: La duración de los programas es de 8 a 10 semestres académicos.',
      '🤝 [Seña LSC]: Ofrecemos acompañamiento e intérpretes LSC durante tu proceso.'
    ],
    questions: [
      '¿Qué carreras de pregrado ofrecen y cuál es su duración?',
      '¿Cuántos semestres dura la carrera y en qué jornada se estudia?',
      '¿Qué facultades tiene la Universidad Icesi?',
      '¿Tienen acompañamiento accesible para estudiantes sordos?'
    ]
  },
  costos: {
    id: 'costos',
    name: 'Costos y financiación',
    shortDesc: 'Valores del semestre, becas y créditos.',
    videoTitle: 'Video LSC: Costos y financiación',
    videoDesc: 'Información sobre valores de matrícula, opciones de becas institucionales, ICETEX y pago diferido.',
    duration: '01:20',
    totalSeconds: 80,
    summarySteps: [
      '1. Explicación de los valores de matrícula según el programa académico.',
      '2. Becas institucionales, apoyos económicos y convenios con ICETEX.',
      '3. Opciones de financiación directa y fechas de pago por cuotas.'
    ],
    lscCaptions: [
      '💰 [Seña LSC]: El valor del semestre depende del programa de pregrado elegido.',
      '🏅 [Seña LSC]: Puedes postularte a becas por mérito académico y apoyo socioeconómico.',
      '🏦 [Seña LSC]: Contamos con financiación directa Icesi, ICETEX y entidades aliadas.',
      '📅 [Seña LSC]: Puedes diferir el pago de tu matrícula en cuotas mensuales.'
    ],
    questions: [
      '¿Cuál es el valor del semestre y qué opciones de becas tienen?',
      '¿Cómo puedo solicitar financiación directa o crédito con ICETEX?',
      '¿Se puede pagar la matrícula por cuotas durante el semestre?',
      '¿Qué descuentos o becas existen para nuevos aspirantes?'
    ]
  },
  requisitos: {
    id: 'requisitos',
    name: 'Requisitos de admisión',
    shortDesc: 'Documentos requeridos, pruebas y fechas.',
    videoTitle: 'Video LSC: Requisitos de admisión',
    videoDesc: 'Pasos del proceso de inscripción, documentos de identidad, resultados Saber 11 y calendario.',
    duration: '00:48',
    totalSeconds: 48,
    summarySteps: [
      '1. Explicación del documento de identidad requerido.',
      '2. Entrega del certificado de notas y acta de grado.',
      '3. Plazos de inscripción y pasos finales en admisiones.'
    ],
    lscCaptions: [
      '🪪 [Seña LSC]: Paso 1: Presentar copia del documento de identidad vigente.',
      '📄 [Seña LSC]: Paso 2: Entregar certificado de notas, diploma o acta de grado de bachiller.',
      '📝 [Seña LSC]: Paso 3: Adjuntar el resultado de las pruebas Saber 11 (ICFES).',
      '✅ [Seña LSC]: Paso 4: Completar el formulario en línea antes de la fecha límite.'
    ],
    questions: [
      '¿Qué requisitos necesito para inscribir a mi hijo?',
      '¿Qué documentos debo entregar?',
      '¿Hasta qué fecha puedo inscribirme?',
      '¿Cuál es el proceso de admisión?'
    ]
  }
};

// Estado inicial
const DEFAULT_STATE = {
  viewMode: 'split', // 'split' | 'desktop' | 'mobile'
  desktopScreen: 'A01', // A01..A10, AE01, AE02
  mobileScreen: 'P01',  // P01..P10, E01..E04
  sessionPin: '4829',
  enteredPin: ['', '', '', ''],
  failedPin: ['4', '8', '0', '5'],
  isLinked: false,
  selectedCategoryId: 'requisitos',
  selectedQuestion: '¿Qué requisitos necesito para inscribir a mi hijo?',
  selectedVideoId: 'requisitos',
  libraryFilter: 'all',
  videoPlaying: true,
  videoCurrentTime: 0,
  desktopPreviewPlaying: false,
  miniClipModal: null,
  chatMessages: [],
  mobileDraftMsg: '',
  desktopDraftMsg: ''
};

let state = loadState();
let syncChannel = null;
let videoTimerInterval = null;
let toastTimeout = null;

// Variables de red P2P (PeerJS WebRTC) para conectar PC y Celulares reales
let mobileHostPeer = null;
let mobileDataConns = [];
let desktopClientPeer = null;
let desktopDataConn = null;
let pinConnectTimeout = null;

const p2pStatus = {
  mobileBrokerReady: false,
  mobilePeerError: null,
  isConnectingPin: false,
  activeRemotePeer: false
};

// Detectar rol fijo (si se abrió desde funcionario.html, visitante.html o ?mode=...)
const urlParams = new URLSearchParams(window.location.search);
const fixedRole = window.APP_FIXED_ROLE || urlParams.get('mode');
if (fixedRole === 'desktop' || fixedRole === 'mobile' || fixedRole === 'split') {
  state.viewMode = fixedRole;
}

// Si es únicamente la vista del funcionario, dejamos las casillas de PIN listas para digitar
if (fixedRole === 'desktop' && !state.isLinked) {
  state.enteredPin = ['', '', '', ''];
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('No se pudo leer localStorage:', e);
  }
  return { ...DEFAULT_STATE };
}

function saveAndSyncState(partial = {}, broadcastLocal = true) {
  state = { ...state, ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Error guardando estado:', e);
  }
  if (broadcastLocal && syncChannel) {
    syncChannel.postMessage({ type: 'STATE_UPDATE', state });
  }
  renderApp();
}

function showLiveToast(message) {
  let toastEl = document.getElementById('live-toast-banner');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'live-toast-banner';
    toastEl.className = 'live-toast';
    document.body.appendChild(toastEl);
  }
  toastEl.innerHTML = `<span style="color:#5CBFBC;">●</span> <span>${escapeHtml(message)}</span>`;
  toastEl.style.display = 'flex';
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    if (toastEl) toastEl.style.display = 'none';
  }, 3600);
}

// ============================================================================
// MOTOR PEER-TO-PEER (WebRTC vía PeerJS) PARA CONECTAR PC <-> CELULAR REAL
// ============================================================================

function initMobilePeerHost(pinToRegister) {
  if (typeof Peer === 'undefined') {
    console.warn('PeerJS no cargó (sin internet). Usando sincronización local.');
    return;
  }

  // No inicializar host móvil si estamos exclusivamente en la app del funcionario (computador)
  if (window.APP_FIXED_ROLE === 'desktop') return;

  if (mobileHostPeer) {
    try { mobileHostPeer.destroy(); } catch (e) {}
    mobileHostPeer = null;
  }
  mobileDataConns = [];
  p2pStatus.mobileBrokerReady = false;
  p2pStatus.mobilePeerError = null;

  const peerId = PEER_ID_PREFIX + String(pinToRegister);
  try {
    mobileHostPeer = new Peer(peerId, { debug: 1 });
  } catch (err) {
    console.warn('Error creando Peer móvil:', err);
    return;
  }

  mobileHostPeer.on('open', () => {
    p2pStatus.mobileBrokerReady = true;
    p2pStatus.mobilePeerError = null;
    renderApp();
  });

  mobileHostPeer.on('connection', (conn) => {
    mobileDataConns.push(conn);
    p2pStatus.activeRemotePeer = true;

    conn.on('open', () => {
      p2pStatus.activeRemotePeer = true;
      renderApp();
    });

    conn.on('data', (data) => {
      handleIncomingP2PDataOnMobile(data, conn);
    });

    conn.on('close', () => {
      mobileDataConns = mobileDataConns.filter(c => c !== conn);
      p2pStatus.activeRemotePeer = mobileDataConns.length > 0;
      renderApp();
    });
  });

  mobileHostPeer.on('error', (err) => {
    if (err && err.type === 'unavailable-id') {
      // Si el PIN 4829 ya está ocupado por otro celular en internet, generamos otro PIN libre automáticamente
      const randomPin = String(Math.floor(1000 + Math.random() * 9000));
      state.sessionPin = randomPin;
      saveAndSyncState({ sessionPin: randomPin }, true);
      initMobilePeerHost(randomPin);
    } else {
      p2pStatus.mobilePeerError = err ? err.type : 'error';
      renderApp();
    }
  });
}

function sendFromMobileToDesktopP2P(payload) {
  mobileDataConns.forEach(conn => {
    if (conn && conn.open) {
      try { conn.send(payload); } catch (e) { console.warn(e); }
    }
  });
}

function sendFromDesktopToMobileP2P(payload) {
  if (desktopDataConn && desktopDataConn.open) {
    try {
      desktopDataConn.send(payload);
      return true;
    } catch (e) {
      console.warn(e);
    }
  }
  return false;
}

// Mensajes que llegan al CELULAR desde el COMPUTADOR de Andrés
function handleIncomingP2PDataOnMobile(data, conn) {
  if (!data || !data.type) return;

  switch (data.type) {
    case 'LINK_SUCCESS':
      showLiveToast(`Conectado con el computador de Andrés (PIN ${data.pin})`);
      saveAndSyncState({
        isLinked: true,
        sessionPin: data.pin || state.sessionPin,
        // Si el celular está en P02 esperando vinculación, pasa automáticamente a P03 (Categorías)
        mobileScreen: (state.mobileScreen === 'P02' || state.mobileScreen === 'E04') ? 'P03' : state.mobileScreen
      });
      // Enviar estado actual de vuelta al PC por si el visitante ya tenía algo seleccionado
      if (conn && conn.open) {
        conn.send({
          type: 'MOBILE_ACK_LINK',
          pin: state.sessionPin,
          chatMessages: state.chatMessages
        });
      }
      break;

    case 'SEND_LSC_VIDEO':
      showLiveToast('¡Andrés te ha enviado un video de respuesta en LSC!');
      saveAndSyncState({
        selectedVideoId: data.videoId || state.selectedCategoryId,
        selectedCategoryId: data.categoryId || state.selectedCategoryId,
        selectedQuestion: data.question || state.selectedQuestion,
        mobileScreen: 'P07',
        videoPlaying: true,
        videoCurrentTime: 0
      });
      break;

    case 'OPEN_CHAT':
      saveAndSyncState({
        mobileScreen: 'P09'
      });
      break;

    case 'CHAT_MESSAGE':
      if (data.message) {
        const exists = state.chatMessages.some(m => m.id === data.message.id);
        const nextMessages = exists ? state.chatMessages : [...state.chatMessages, data.message];
        showLiveToast(`Nuevo mensaje de Andrés: "${data.message.text.slice(0, 30)}..."`);
        saveAndSyncState({
          chatMessages: nextMessages,
          mobileScreen: 'P09'
        });
      }
      break;

    case 'FINISH_SESSION':
      showLiveToast('Andrés ha finalizado la sesión de atención.');
      saveAndSyncState({
        isLinked: false,
        mobileScreen: 'P10'
      });
      break;

    case 'RESET_SESSION':
      saveAndSyncState({
        isLinked: false,
        mobileScreen: 'P01',
        videoCurrentTime: 0,
        chatMessages: []
      });
      break;
  }
}

// Mensajes que llegan al COMPUTADOR de Andrés desde el CELULAR de la persona visitante
function handleIncomingP2PDataOnDesktop(data) {
  if (!data || !data.type) return;

  switch (data.type) {
    case 'MOBILE_ACK_LINK':
      p2pStatus.activeRemotePeer = true;
      if (Array.isArray(data.chatMessages) && data.chatMessages.length > 0 && state.chatMessages.length === 0) {
        saveAndSyncState({ chatMessages: data.chatMessages });
      } else {
        renderApp();
      }
      break;

    case 'VISITOR_QUESTION':
      showLiveToast(`Nueva pregunta recibida: «${data.question}»`);
      saveAndSyncState({
        isLinked: true,
        selectedCategoryId: data.categoryId || 'programas',
        selectedVideoId: data.categoryId || 'programas',
        selectedQuestion: data.question,
        desktopScreen: 'A04'
      });
      break;

    case 'START_DIRECT_CHAT':
      showLiveToast('La persona visitante abrió el chat directo («No encuentro mi pregunta»).');
      saveAndSyncState({
        isLinked: true,
        desktopScreen: state.desktopScreen === 'A10' ? 'A10' : 'A09'
      });
      break;

    case 'CHAT_MESSAGE':
      if (data.message) {
        const exists = state.chatMessages.some(m => m.id === data.message.id);
        const nextMessages = exists ? state.chatMessages : [...state.chatMessages, data.message];
        showLiveToast(`Mensaje de visitante: "${data.message.text.slice(0, 32)}..."`);
        saveAndSyncState({
          isLinked: true,
          chatMessages: nextMessages,
          desktopScreen: state.desktopScreen === 'A10' ? 'A10' : 'A09'
        });
      }
      break;

    case 'NEW_INQUIRY':
      showLiveToast('La persona visitante está seleccionando una nueva pregunta.');
      saveAndSyncState({
        desktopScreen: 'A03'
      });
      break;

    case 'FINISH_SESSION':
      showLiveToast('La persona visitante finalizó la consulta.');
      saveAndSyncState({
        isLinked: false,
        desktopScreen: 'A08'
      });
      break;
  }
}

// Conectar desde el Computador (Andrés) hacia el PIN del Celular vía PeerJS
function connectDesktopToMobilePinP2P(enteredPin) {
  // Si estamos en modo vista dividida en el mismo navegador y coincide el PIN local, vinculamos al instante
  if (state.viewMode === 'split' && enteredPin === state.sessionPin) {
    saveAndSyncState({
      isLinked: true,
      desktopScreen: 'A03',
      mobileScreen: (state.mobileScreen === 'P01' || state.mobileScreen === 'P02' || state.mobileScreen === 'E04') ? 'P03' : state.mobileScreen
    });
    showLiveToast(`Sesión vinculada localmente con PIN ${enteredPin}`);
    return;
  }

  // Si PeerJS no está disponible (offline), validamos contra el estado local
  if (typeof Peer === 'undefined') {
    if (enteredPin === state.sessionPin) {
      saveAndSyncState({
        isLinked: true,
        desktopScreen: 'A03',
        mobileScreen: (state.mobileScreen === 'P01' || state.mobileScreen === 'P02' || state.mobileScreen === 'E04') ? 'P03' : state.mobileScreen
      });
    } else {
      saveAndSyncState({
        failedPin: enteredPin.split(''),
        isLinked: false,
        desktopScreen: 'AE01'
      });
    }
    return;
  }

  p2pStatus.isConnectingPin = true;
  renderApp();

  if (desktopClientPeer) {
    try { desktopClientPeer.destroy(); } catch (e) {}
    desktopClientPeer = null;
  }
  desktopDataConn = null;

  desktopClientPeer = new Peer({ debug: 1 });

  if (pinConnectTimeout) clearTimeout(pinConnectTimeout);
  pinConnectTimeout = setTimeout(() => {
    if (p2pStatus.isConnectingPin) {
      p2pStatus.isConnectingPin = false;
      handleFailedPinAttempt(enteredPin);
    }
  }, 6500);

  desktopClientPeer.on('open', () => {
    const targetPeerId = PEER_ID_PREFIX + enteredPin;
    const conn = desktopClientPeer.connect(targetPeerId, { reliable: true });
    desktopDataConn = conn;

    conn.on('open', () => {
      if (pinConnectTimeout) clearTimeout(pinConnectTimeout);
      p2pStatus.isConnectingPin = false;
      p2pStatus.activeRemotePeer = true;

      conn.send({
        type: 'LINK_SUCCESS',
        pin: enteredPin
      });

      showLiveToast(`¡Conectado exitosamente con el celular (PIN ${enteredPin})!`);
      saveAndSyncState({
        sessionPin: enteredPin,
        isLinked: true,
        desktopScreen: 'A03',
        mobileScreen: (state.mobileScreen === 'P01' || state.mobileScreen === 'P02' || state.mobileScreen === 'E04') ? 'P03' : state.mobileScreen
      });
    });

    conn.on('data', (data) => {
      handleIncomingP2PDataOnDesktop(data);
    });

    conn.on('close', () => {
      p2pStatus.activeRemotePeer = false;
      renderApp();
    });

    conn.on('error', () => {
      if (pinConnectTimeout) clearTimeout(pinConnectTimeout);
      p2pStatus.isConnectingPin = false;
      handleFailedPinAttempt(enteredPin);
    });
  });

  desktopClientPeer.on('error', (err) => {
    if (pinConnectTimeout) clearTimeout(pinConnectTimeout);
    p2pStatus.isConnectingPin = false;
    console.warn('Error PeerJS en Desktop:', err ? err.type : err);
    handleFailedPinAttempt(enteredPin);
  });
}

function handleFailedPinAttempt(enteredPin) {
  // Si el usuario está probando en el mismo computador en dos pestañas y coincide con el localStorage, permitirlo
  const latestLocal = loadState();
  if (enteredPin === latestLocal.sessionPin) {
    saveAndSyncState({
      sessionPin: enteredPin,
      isLinked: true,
      desktopScreen: 'A03',
      mobileScreen: 'P03'
    });
    showLiveToast(`Sesión vinculada en este equipo (PIN ${enteredPin})`);
    return;
  }

  const failedDigits = enteredPin.length === 4 ? enteredPin.split('') : ['4', '8', '0', '5'];
  saveAndSyncState({
    failedPin: failedDigits,
    isLinked: false,
    desktopScreen: 'AE01'
  });
}

function setupLocalRealtimeSync() {
  if ('BroadcastChannel' in window) {
    syncChannel = new BroadcastChannel(CHANNEL_NAME);
    syncChannel.onmessage = (event) => {
      if (event.data && event.data.type === 'STATE_UPDATE') {
        const currentViewMode = state.viewMode;
        state = { ...event.data.state, viewMode: currentViewMode };
        renderApp();
      }
    };
  }

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const incoming = JSON.parse(event.newValue);
        const currentViewMode = state.viewMode;
        state = { ...incoming, viewMode: currentViewMode };
        renderApp();
      } catch (err) {
        console.warn(err);
      }
    }
  });
}

// Temporizador para simular la reproducción del video en LSC en tiempo real
function startVideoSimulationTicker() {
  if (videoTimerInterval) clearInterval(videoTimerInterval);
  videoTimerInterval = setInterval(() => {
    if (state.mobileScreen === 'P07' && state.videoPlaying) {
      const videoObj = CATEGORIES_DATA[state.selectedVideoId] || CATEGORIES_DATA.requisitos;
      let nextTime = state.videoCurrentTime + 1;
      if (nextTime > videoObj.totalSeconds) {
        nextTime = 0;
      }
      state.videoCurrentTime = nextTime;
      updateVideoPlayerDOMOnly();
    }
  }, 1000);
}

function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' + s : s}`;
}

function getCurrentTimeFormatted() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

// ============================================================================
// ICONOS Y LOGOS SVG FIELES A LOS WIREFRAMES
// ============================================================================

function getBrandLogoSVG(size = 'normal') {
  const heights = { small: 26, normal: 32, large: 68 };
  const h = heights[size] || 32;
  return `
    <span style="display:inline-flex;align-items:center;gap:${size === 'large' ? '14px' : '8px'};font-weight:800;letter-spacing:-0.03em;color:#1F1A4E;font-size:${size === 'large' ? '42px' : size === 'small' ? '19px' : '22px'};line-height:1;">
      <span><span style="color:#5130D9;">tu</span>Solución<span style="color:#5CBFBC;">LSC</span></span>
      <svg height="${h}" viewBox="0 0 64 54" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;">
        <path d="M18 32C18 22 25 14 34 14C42 14 48 20 48 28C48 36 41 42 32 42H22" stroke="#5CBFBC" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M12 24L20 12M28 10L33 4M42 12L49 6" stroke="#5CBFBC" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M22 38C25 30 33 25 41 27C48 29 52 36 49 43C46 49 38 51 30 49L18 46" stroke="#1F1A4E" stroke-width="4.5" stroke-linecap="round"/>
        <circle cx="35" cy="28" r="5" fill="#5130D9"/>
      </svg>
    </span>
  `;
}

function getCategoryIconSVG(catId, strokeColor = 'currentColor') {
  if (catId === 'programas') {
    return `
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
        <path d="M6 12v5c3 3 9 3 12 0v-5"/>
      </svg>
    `;
  }
  if (catId === 'costos') {
    return `
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1"/>
        <path d="M12 6v2m0 8v2"/>
      </svg>
    `;
  }
  return `
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
      <path d="M9 14l2 2 4-4"/>
    </svg>
  `;
}

function getPhoneStatusBarHTML(onHero = false) {
  return `
    <div class="phone-statusbar ${onHero ? 'on-hero' : ''}">
      <span>9:41</span>
      <span style="display:inline-flex;align-items:center;gap:6px;">
        <svg width="15" height="11" viewBox="0 0 16 12" fill="currentColor">
          <rect x="1" y="8" width="2.5" height="4" rx="1"/>
          <rect x="4.5" y="6" width="2.5" height="6" rx="1"/>
          <rect x="8" y="3.5" width="2.5" height="8.5" rx="1"/>
          <rect x="11.5" y="1" width="2.5" height="11" rx="1"/>
        </svg>
        <svg width="15" height="11" viewBox="0 0 16 12" fill="currentColor">
          <path d="M8 9.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-3.6-1.8a5.5 5.5 0 0 1 7.2 0l1.2-1.4a7.5 7.5 0 0 0-9.6 0l1.2 1.4zm-2.8-2.8a9.5 9.5 0 0 1 12.8 0L15.6 3.5a11.5 11.5 0 0 0-15.2 0l1.2 1.4z"/>
        </svg>
        <svg width="22" height="11" viewBox="0 0 24 12" fill="none">
          <rect x="1" y="1" width="19" height="10" rx="2.5" stroke="currentColor" stroke-width="1.5"/>
          <rect x="3" y="3" width="15" height="6" rx="1" fill="currentColor"/>
          <path d="M21.5 4v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </span>
    </div>
  `;
}

// ============================================================================
// RENDERIZADO DE LAS 12 PANTALLAS DE ESCRITORIO (FUNCIONARIO: PANEL DE ANDRÉS)
// ============================================================================

function renderDesktopPane() {
  const showLinkedPill = ['A03', 'A04', 'A05', 'A06', 'AE02', 'A07', 'A09', 'A10'].includes(state.desktopScreen);

  return `
    <div class="desktop-navbar">
      <div class="desktop-navbar-brand">
        <div style="cursor:pointer;" onclick="goToDesktop('A01')">${getBrandLogoSVG('normal')}</div>
        <div class="brand-divider"></div>
        <span class="brand-panel-label">Panel de Andrés</span>
      </div>
      <div>
        ${showLinkedPill ? `
          <div class="session-linked-pill">
            <span>✓ Sesión vinculada · PIN ${state.sessionPin}</span>
          </div>
        ` : ''}
      </div>
    </div>
    <div class="desktop-content">
      ${renderDesktopScreenContent()}
    </div>
  `;
}

function renderDesktopScreenContent() {
  const cat = CATEGORIES_DATA[state.selectedCategoryId] || CATEGORIES_DATA.programas;
  const video = CATEGORIES_DATA[state.selectedVideoId] || cat;

  switch (state.desktopScreen) {
    // ------------------------------------------------------------------------
    // A01 · Pantalla de bienvenida
    // ------------------------------------------------------------------------
    case 'A01':
      return `
        <div class="a01-hero-grid">
          <div>
            <div class="pill-tag">ATENCIÓN PRESENCIAL ACCESIBLE</div>
            <h1 class="a01-title-dark">Bienvenido, Andrés</h1>
            <h2 class="a01-title-purple">¿Listo para hablar?</h2>
            <p class="a01-desc">
              Conéctate con el celular de la persona visitante mediante el código PIN para recibir su pregunta y enviarle el video de respuesta en Lengua de Señas Colombiana (LSC).
            </p>
            <button class="btn-primary" onclick="openDesktopPinScreen()">
              Listo para hablar
            </button>
          </div>
          <div class="a01-art-card">
            ${getBrandLogoSVG('large')}
          </div>
        </div>

        <div class="a01-steps-grid">
          <div class="a01-step-card">
            <div class="a01-step-num">1</div>
            <div>
              <h4>Ingresa el PIN</h4>
              <p>Vincula la sesión con el código de 4 dígitos de la visitante.</p>
            </div>
          </div>
          <div class="a01-step-card">
            <div class="a01-step-num">2</div>
            <div>
              <h4>Recibe la consulta</h4>
              <p>Lee en pantalla la pregunta seleccionada o el mensaje directo.</p>
            </div>
          </div>
          <div class="a01-step-card">
            <div class="a01-step-num">3</div>
            <div>
              <h4>Envía la respuesta</h4>
              <p>Selecciona y envía el video en LSC al celular de la visitante.</p>
            </div>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // A02 · Ingreso del PIN de la sesión
    // ------------------------------------------------------------------------
    case 'A02':
      return `
        <div class="desktop-center-card">
          <div class="pill-tag">CONEXIÓN CON LA PERSONA VISITANTE</div>
          <h2>Ingresa el código PIN de la visitante</h2>
          <p class="subtitle">
            Pídele a la persona visitante que te muestre el código de 4 dígitos que aparece en la pantalla de su celular.
          </p>

          <div class="pin-boxes-row">
            ${[0, 1, 2, 3].map(idx => `
              <input
                type="text"
                maxlength="1"
                inputmode="numeric"
                class="pin-digit-input"
                id="pin-input-${idx}"
                value="${state.enteredPin[idx] || ''}"
                placeholder="•"
                oninput="handlePinDigitInput(${idx}, this.value)"
                onkeydown="handlePinKeyDown(event, ${idx})"
              />
            `).join('')}
          </div>

          <div class="btn-row-center">
            <button class="btn-outline" onclick="goToDesktop('A01')" ${p2pStatus.isConnectingPin ? 'disabled' : ''}>
              Volver
            </button>
            <button class="btn-primary" onclick="attemptPinLink()" ${p2pStatus.isConnectingPin ? 'disabled' : ''}>
              ${p2pStatus.isConnectingPin ? 'Conectando con el celular...' : 'Vincular dispositivo'}
            </button>
          </div>

          <div style="margin-top:14px;display:flex;justify-content:center;gap:12px;flex-wrap:wrap;">
            ${state.viewMode === 'split' ? `
              <button class="link-underline-btn" style="font-size:12.5px;" onclick="fillPinAndLink('${state.sessionPin}')">
                Autocompletar PIN del celular (${state.sessionPin})
              </button>
            ` : ''}
            <button class="link-underline-btn" style="font-size:12.5px;color:#C4254A;" onclick="simulateInvalidPin()">
              Simular PIN incorrecto (AE01)
            </button>
          </div>

          <div class="info-footnote">
            <div class="info-footnote-icon">i</div>
            <span>El código PIN garantiza que el video en LSC se envíe únicamente al celular de la persona que estás atendiendo.</span>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // AE01 · Error: PIN no válido
    // ------------------------------------------------------------------------
    case 'AE01':
      return `
        <div class="desktop-center-card">
          <div class="status-circle danger">
            <span style="font-size:34px;font-weight:800;">!</span>
          </div>
          <div class="pill-tag danger">CÓDIGO PIN NO ENCONTRADO</div>
          <h2>El código PIN ingresado no es válido</h2>
          <p class="subtitle">
            No encontramos ninguna sesión activa con este código. Verifica los 4 dígitos en la pantalla del celular de la persona visitante.
          </p>

          <div class="pin-boxes-row" style="margin-bottom:14px;">
            ${state.failedPin.map(d => `
              <input type="text" readonly class="pin-digit-input error" value="${d}" />
            `).join('')}
          </div>

          <p style="font-size:14px;font-weight:700;color:#C4254A;margin-bottom:26px;">
            Revisa los números e inténtalo de nuevo.
          </p>

          <div class="btn-row-center">
            <button class="btn-outline" onclick="goToDesktop('A01')">Volver al inicio</button>
            <button class="btn-primary" onclick="retryValidPinFromError()">Borrar y volver a intentar</button>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // A03 · Esperando consulta de la persona visitante
    // ------------------------------------------------------------------------
    case 'A03':
      return `
        <div class="a03-waiting-box">
          <div class="dots-pill">
            <span></span><span></span><span></span>
          </div>
          <h2>Esperando consulta de la persona visitante...</h2>
          <p>
            La persona visitante está eligiendo una categoría y su pregunta en el celular. Cuando la envíe, aparecerá aquí automáticamente.
          </p>
          <button class="btn-outline" style="padding:11px 24px;font-size:14px;" onclick="openDesktopPinScreen()">
            Cambiar código PIN
          </button>
        </div>

        <h3 class="section-heading">Categorías disponibles en la biblioteca de videos en LSC</h3>
        <div class="a03-cat-grid">
          ${Object.values(CATEGORIES_DATA).map(c => `
            <div class="a03-cat-card" style="cursor:pointer;" onclick="openCategoryInLibrary('${c.id}')">
              <div class="a03-cat-icon">
                ${getCategoryIconSVG(c.id, '#1E6E66')}
              </div>
              <h3>${c.name}</h3>
              <p>${c.shortDesc}</p>
              <div class="validated-pill">
                <span>✓ 1 video validado disponible</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;

    // ------------------------------------------------------------------------
    // A04 · Nueva pregunta recibida
    // ------------------------------------------------------------------------
    case 'A04':
      return `
        <div class="question-header-card">
          <div class="question-badges-row">
            <span class="pill-tag navy" style="margin-bottom:0;">NUEVA PREGUNTA RECIBIDA</span>
            <span class="pill-tag" style="margin-bottom:0;">CATEGORÍA: ${cat.name.toUpperCase()}</span>
          </div>
          <div class="question-kicker">PREGUNTA SELECCIONADA POR LA PERSONA VISITANTE:</div>
          <div class="question-quote">«${state.selectedQuestion}»</div>
          <div class="question-subnote">
            Envía el video en Lengua de Señas Colombiana (LSC) que responde a esta categoría o busca otro en la biblioteca.
          </div>
        </div>

        <div class="suggested-video-card">
          <div class="video-thumb-box" onclick="previewVideo('${cat.id}')">
            <div class="play-circle-btn">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <div class="duration-badge">LSC · ${cat.duration}</div>
          </div>
          <div>
            <div class="pill-tag teal" style="margin-bottom:10px;">VIDEO SUGERIDO PARA LA PREGUNTA</div>
            <h3 style="font-size:25px;font-weight:800;color:var(--navy-dark);margin-bottom:8px;">
              ${cat.videoTitle}
            </h3>
            <p style="font-size:15px;color:var(--text-muted);line-height:1.5;margin-bottom:20px;">
              ${cat.videoDesc}
            </p>
            <div style="display:flex;gap:14px;flex-wrap:wrap;">
              <button class="btn-primary" onclick="previewVideo('${cat.id}')">
                Revisar y enviar video
              </button>
              <button class="btn-outline" onclick="goToDesktop('A05')">
                Ver biblioteca de videos
              </button>
            </div>
          </div>
        </div>

        <div class="library-cta-banner">
          <div>
            <h4 style="font-size:16px;font-weight:800;color:var(--navy-dark);margin-bottom:4px;">
              ¿Necesitas consultar otro tema de la biblioteca?
            </h4>
            <p style="font-size:13.5px;color:var(--text-muted);">
              Puedes explorar los videos de las 3 categorías disponibles antes de enviarlo al celular.
            </p>
          </div>
          <button class="btn-outline" style="padding:11px 22px;font-size:14px;flex-shrink:0;" onclick="goToDesktop('A05')">
            Abrir biblioteca completa
          </button>
        </div>
      `;

    // ------------------------------------------------------------------------
    // A05 · Biblioteca: selección de video
    // ------------------------------------------------------------------------
    case 'A05': {
      const allVideos = Object.values(CATEGORIES_DATA);
      const filteredVideos = state.libraryFilter === 'all'
        ? allVideos
        : allVideos.filter(v => v.id === state.libraryFilter);

      return `
        <div class="question-header-card" style="padding:20px 28px;margin-bottom:18px;">
          <div class="question-kicker">PREGUNTA DE LA PERSONA VISITANTE (${cat.name.toUpperCase()}):</div>
          <div style="font-size:20px;font-weight:800;color:var(--navy-dark);">«${state.selectedQuestion}»</div>
        </div>

        <div class="filter-bar">
          <span class="filter-label">Filtrar por categoría:</span>
          <button
            class="filter-pill ${state.libraryFilter === 'all' ? 'active-dark' : ''}"
            onclick="setLibraryFilter('all')"
          >
            Todas (3)
          </button>
          ${allVideos.map(v => `
            <button
              class="filter-pill ${state.libraryFilter === v.id ? 'active-purple' : ''}"
              onclick="setLibraryFilter('${v.id}')"
            >
              ${v.name}
            </button>
          `).join('')}
        </div>

        <div class="library-list">
          ${filteredVideos.map(v => {
            const isSuggested = v.id === state.selectedCategoryId;
            return `
              <div class="library-item-card ${isSuggested ? 'featured' : ''}">
                <div class="library-item-left">
                  <div class="video-thumb-box small" onclick="previewVideo('${v.id}')">
                    <div class="play-circle-btn" style="width:38px;height:38px;">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                    <div class="duration-badge" style="font-size:10px;padding:3px 7px;bottom:8px;left:8px;">LSC · ${v.duration}</div>
                  </div>
                  <div>
                    <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">
                      <span class="pill-tag" style="margin-bottom:0;font-size:10.5px;padding:4px 12px;">
                        CATEGORÍA: ${v.name.toUpperCase()}
                      </span>
                      ${isSuggested ? `<span class="pill-tag teal" style="margin-bottom:0;font-size:10.5px;padding:4px 12px;">SUGERIDO</span>` : ''}
                    </div>
                    <h4 style="font-size:19px;font-weight:800;color:var(--navy-dark);margin-bottom:4px;">${v.videoTitle}</h4>
                    <p style="font-size:14px;color:var(--text-muted);">${v.videoDesc}</p>
                  </div>
                </div>
                <button
                  class="${isSuggested ? 'btn-primary' : 'btn-outline'}"
                  style="flex-shrink:0;padding:13px 26px;"
                  onclick="previewVideo('${v.id}')"
                >
                  Seleccionar video
                </button>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // ------------------------------------------------------------------------
    // A06 · Vista previa del video
    // ------------------------------------------------------------------------
    case 'A06':
      return `
        <div class="question-header-card" style="padding:18px 28px;margin-bottom:20px;">
          <div class="question-kicker">RESPONDIENDO A LA PREGUNTA (${cat.name.toUpperCase()}):</div>
          <div style="font-size:20px;font-weight:800;color:var(--navy-dark);">«${state.selectedQuestion}»</div>
        </div>

        <div class="a06-preview-grid">
          <div class="a06-player-box" onclick="toggleDesktopPreviewPlay()" style="cursor:pointer;">
            <div style="position:absolute;top:18px;left:18px;">
              <span class="pill-tag navy" style="margin-bottom:0;">VIDEO EN LSC</span>
            </div>

            ${state.desktopPreviewPlaying ? `
              <div class="lsc-signer-sim">
                <div class="lsc-hands-pulse">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
                    <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
                    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
                    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
                  </svg>
                </div>
                <div style="font-size:17px;font-weight:800;">Reproduciendo vista previa en LSC...</div>
                <div class="lsc-caption-pill">${video.lscCaptions[0]}</div>
                <span style="font-size:12px;opacity:0.85;">(Haz clic para pausar vista previa)</span>
              </div>
            ` : `
              <div class="play-circle-btn" style="width:74px;height:74px;margin-bottom:14px;">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </div>
              <div style="font-size:14.5px;font-weight:700;opacity:0.95;">Haz clic para previsualizar el video</div>
            `}

            <div style="position:absolute;bottom:16px;left:18px;right:18px;background:rgba(24,20,64,0.88);padding:12px 18px;border-radius:14px;display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:14px;font-weight:700;">${video.videoTitle}</span>
              <span style="font-size:13px;font-weight:700;color:#7CE3E0;">00:00 / ${video.duration}</span>
            </div>
          </div>

          <div class="a06-summary-card">
            <div>
              <div class="pill-tag" style="margin-bottom:12px;">CONTENIDO DEL VIDEO</div>
              <h3 style="font-size:23px;font-weight:800;color:var(--navy-dark);margin-bottom:8px;">
                Resumen del video en español
              </h3>
              <p style="font-size:14px;color:var(--text-muted);line-height:1.5;margin-bottom:18px;">
                Verifica que este video responda correctamente la inquietud antes de enviarlo al celular:
              </p>

              ${video.summarySteps.map(step => `
                <div class="summary-step-box">${step}</div>
              `).join('')}
            </div>

            <div class="validated-pill" style="justify-content:center;padding:10px 14px;font-size:13px;margin-top:12px;">
              <span>✓ Video grabado y validado en Lengua de Señas</span>
            </div>
          </div>
        </div>

        <div class="a06-bottom-actions">
          <button class="btn-outline" onclick="goToDesktop('A05')">
            Volver a la biblioteca
          </button>
          <div style="display:flex;gap:12px;align-items:center;">
            <button class="link-underline-btn" style="color:#C4254A;font-size:13px;" onclick="goToDesktop('AE02')">
              Simular fallo (AE02)
            </button>
            <button class="btn-primary" onclick="sendVideoToVisitorPhone()">
              Enviar video al celular
            </button>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // AE02 · Error al enviar el video
    // ------------------------------------------------------------------------
    case 'AE02':
      return `
        <div class="desktop-center-card" style="max-width:650px;">
          <div class="status-circle danger">
            <span style="font-size:34px;font-weight:800;">!</span>
          </div>
          <div class="pill-tag danger">ERROR DE ENVÍO</div>
          <h2>No se pudo enviar el video al celular</h2>
          <p class="subtitle">
            Ocurrió una interrupción en la conexión con el dispositivo de la persona visitante. El video no fue entregado.
          </p>

          <div style="background:var(--purple-light);border-radius:16px;padding:18px 22px;text-align:left;margin-bottom:26px;">
            <div style="font-size:11px;font-weight:800;color:var(--purple-primary);text-transform:uppercase;margin-bottom:4px;">
              VIDEO SELECCIONADO PARA ENVÍO:
            </div>
            <div style="font-size:17px;font-weight:800;color:var(--navy-dark);margin-bottom:2px;">
              ${video.videoTitle} (Duración ${video.duration})
            </div>
            <div style="font-size:13px;color:#C4254A;font-weight:700;">
              Estado: Envío pendiente — Sin respuesta del dispositivo
            </div>
          </div>

          <div class="btn-row-center">
            <button class="btn-outline" onclick="goToDesktop('A05')">Cambiar video</button>
            <button class="btn-primary" onclick="sendVideoToVisitorPhone()">Reintentar envío</button>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // A07 · Video enviado correctamente
    // ------------------------------------------------------------------------
    case 'A07':
      return `
        <div class="desktop-center-card" style="max-width:650px;">
          <div class="status-circle teal">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2>Video enviado correctamente</h2>
          <p class="subtitle">
            La persona visitante ya está viendo el video en Lengua de Señas Colombiana (LSC) en su celular.
          </p>

          <div style="background:var(--purple-light);border-radius:18px;padding:18px 24px;text-align:left;margin-bottom:24px;">
            <div style="font-size:11px;font-weight:800;color:var(--purple-primary);text-transform:uppercase;margin-bottom:4px;">
              RESPUESTA ENVIADA AL CELULAR:
            </div>
            <div style="font-size:18px;font-weight:800;color:var(--navy-dark);margin-bottom:4px;">
              ${video.videoTitle} (Duración ${video.duration})
            </div>
            <div style="font-size:13.5px;color:var(--text-muted);margin-bottom:10px;">
              Pregunta: «${state.selectedQuestion}»
            </div>
            <div class="validated-pill">
              <span>✓ Entregado en el celular de la visitante</span>
            </div>
          </div>

          <p style="font-size:14px;color:var(--text-muted);margin-bottom:22px;">
            Puedes esperar si la visitante realiza otra consulta o finalizar la atención.
          </p>

          <div class="btn-row-center">
            <button class="btn-outline" onclick="goToDesktop('A05')">Ver biblioteca</button>
            <button class="btn-primary" onclick="finishSessionBothSides('from-desktop')">Finalizar atención</button>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // A08 · Atención finalizada
    // ------------------------------------------------------------------------
    case 'A08':
      return `
        <div class="desktop-center-card" style="max-width:650px;">
          <div class="status-circle teal">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div class="pill-tag">SESIÓN FINALIZADA</div>
          <h2>La atención ha finalizado correctamente</h2>
          <p class="subtitle">
            La sesión con el celular de la persona visitante se ha desconectado. El sistema está listo para atender a una nueva persona.
          </p>

          <div style="background:var(--purple-light);border-radius:18px;padding:18px 24px;text-align:left;margin-bottom:28px;">
            <div style="font-size:11px;font-weight:800;color:var(--purple-primary);text-transform:uppercase;margin-bottom:6px;">
              RESUMEN DE LA ATENCIÓN
            </div>
            <div style="font-size:16px;font-weight:800;color:var(--navy-dark);margin-bottom:4px;">
              Tema consultado: ${cat.name}
            </div>
            <div style="font-size:13.5px;color:var(--text-muted);">
              Estado: Orientación entregada y sesión cerrada
            </div>
          </div>

          <button class="btn-primary" onclick="resetToNewSession()">
            Volver al inicio (Listo para hablar)
          </button>
        </div>
      `;

    // ------------------------------------------------------------------------
    // A09 · Solicitud de chat directo
    // ------------------------------------------------------------------------
    case 'A09': {
      const lastVisitorMsg = [...state.chatMessages].reverse().find(m => m.sender === 'visitor')
        || { text: 'Hola, quiero saber si puedo homologar materias de otra universidad para mi hijo...' };
      return `
        <div class="desktop-center-card" style="max-width:680px;">
          <div class="status-circle purple">
            <span style="font-size:26px;font-weight:800;">...</span>
          </div>
          <div class="pill-tag navy">NUEVA SOLICITUD DE CHAT DIRECTO</div>
          <h2>La visitante no encontró su pregunta en las categorías</h2>
          <p class="subtitle">
            La persona visitante seleccionó la opción «No encuentro mi pregunta» desde su celular y ha iniciado una conversación por texto contigo.
          </p>

          <div style="background:var(--purple-light);border:2px solid var(--purple-primary);border-radius:18px;padding:20px 24px;text-align:left;margin-bottom:28px;">
            <div style="font-size:11px;font-weight:800;color:var(--purple-primary);text-transform:uppercase;margin-bottom:6px;">
              MENSAJE RECIBIDO DESDE EL CELULAR:
            </div>
            <div style="font-size:18px;font-weight:800;color:var(--navy-dark);margin-bottom:6px;">
              «${escapeHtml(lastVisitorMsg.text)}»
            </div>
            <div style="font-size:13px;color:var(--text-muted);">
              Enviado hace un momento · Esperando tu respuesta
            </div>
          </div>

          <button class="btn-primary" onclick="openBothChats()">
            Abrir chat y responder
          </button>
        </div>
      `;
    }

    // ------------------------------------------------------------------------
    // A10 · Chat con la visitante
    // ------------------------------------------------------------------------
    case 'A10':
      return `
        <div class="a10-header-bar">
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
            <span class="pill-tag navy" style="margin-bottom:0;">CHAT ACTIVO</span>
            <span style="font-size:18px;font-weight:800;color:var(--navy-dark);">
              Conversación directa con la persona visitante
            </span>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn-outline" style="padding:9px 18px;font-size:13.5px;" onclick="goToDesktop('A05')">
              Enviar un video LSC
            </button>
            <button class="btn-outline" style="padding:9px 20px;font-size:13.5px;" onclick="finishSessionBothSides('from-desktop')">
              Finalizar atención
            </button>
          </div>
        </div>

        <div class="a10-chat-box" id="desktop-chat-scroll">
          ${state.chatMessages.length === 0 ? `
            <div style="margin:auto;text-align:center;color:var(--text-muted);font-size:14.5px;">
              No hay mensajes aún. Escribe un mensaje abajo para enviarlo al celular de la visitante.
            </div>
          ` : state.chatMessages.map(m => `
            <div class="chat-msg-group ${m.sender === 'visitor' ? 'visitor' : 'agent'}">
              <div class="chat-msg-meta">
                ${m.sender === 'visitor' ? `VISITANTE · ${m.time}` : `ANDRÉS · ${m.time}`}
              </div>
              <div class="chat-bubble">${escapeHtml(m.text)}</div>
            </div>
          `).join('')}
        </div>

        <form class="a10-input-row" onsubmit="handleDesktopChatSubmit(event)">
          <input
            type="text"
            class="a10-text-input"
            id="desktop-chat-input"
            placeholder="Escribe un mensaje corto y claro para la persona visitante..."
            value="${escapeAttr(state.desktopDraftMsg)}"
            oninput="state.desktopDraftMsg = this.value"
          />
          <button type="submit" class="btn-primary">Enviar mensaje</button>
        </form>
      `;

    default:
      return '';
  }
}

// ============================================================================
// RENDERIZADO DE LAS 14 PANTALLAS DE CELULAR (PERSONA VISITANTE)
// ============================================================================

function renderMobilePane() {
  const isHeroScreen = state.mobileScreen === 'P01';
  return `
    <div class="phone-frame">
      ${getPhoneStatusBarHTML(isHeroScreen)}
      <div class="phone-screen-body">
        ${renderMobileScreenContent()}
        ${renderMiniClipModalIfActive()}
      </div>
    </div>
  `;
}

function renderMobileScreenContent() {
  const cat = CATEGORIES_DATA[state.selectedCategoryId] || CATEGORIES_DATA.requisitos;
  const video = CATEGORIES_DATA[state.selectedVideoId] || cat;

  switch (state.mobileScreen) {
    // ------------------------------------------------------------------------
    // P01 · Pantalla de bienvenida
    // ------------------------------------------------------------------------
    case 'P01':
      return `
        <div class="p01-hero">
          <div style="text-align:center;color:white;opacity:0.9;padding-top:20px;">
            <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
              <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
              <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
            </svg>
          </div>
        </div>
        <div class="p01-sheet">
          <div style="margin-bottom:26px;">${getBrandLogoSVG('normal')}</div>
          <h1 style="font-size:27px;font-weight:800;color:var(--navy-dark);line-height:1.2;margin-bottom:14px;">
            Atención en Lengua de Señas Colombiana
          </h1>
          <p style="font-size:15.5px;color:var(--text-muted);line-height:1.5;margin-bottom:24px;">
            Elige tu pregunta y recibe la respuesta en un video en LSC.
          </p>

          <div class="p01-welcome-card" onclick="openMiniClip('Bienvenida en LSC', '0:20', '👋 ¡Hola! Bienvenido a la atención presencial accesible en LSC de la Universidad Icesi.')">
            <div class="p01-welcome-thumb">
              <div class="play-circle-btn" style="width:36px;height:36px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
            <div>
              <div style="font-size:16px;font-weight:800;color:var(--navy-dark);margin-bottom:2px;">
                Bienvenida en LSC
              </div>
              <div style="font-size:13.5px;color:var(--text-muted);">
                Video · 0:20
              </div>
            </div>
          </div>

          <button class="btn-primary" style="width:100%;padding:17px;" onclick="goToMobile('P02')">
            Comenzar consulta
          </button>
        </div>
      `;

    // ------------------------------------------------------------------------
    // P02 · PIN de la sesión
    // ------------------------------------------------------------------------
    case 'P02': {
      const pinDigits = String(state.sessionPin).split('');
      return `
        <div class="mobile-topbar">
          <button class="mobile-back-btn" onclick="goToMobile('P01')">
            <span>←</span> <span>Vincular sesión</span>
          </button>
          <button class="link-underline-btn" style="font-size:12px;padding:4px;" onclick="regenerateMobilePin()" title="Generar otro código PIN">
            ↻ Nuevo PIN
          </button>
        </div>
        <div class="mobile-pad" style="align-items:center;text-align:center;">
          <div class="status-circle purple" style="width:68px;height:68px;margin-top:8px;margin-bottom:16px;">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="7" y="2" width="10" height="20" rx="2"/>
              <line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
          </div>

          <h2 style="font-size:27px;font-weight:800;color:var(--navy-dark);margin-bottom:6px;">
            PIN de la sesión
          </h2>
          <p style="font-size:15.5px;color:var(--text-muted);margin-bottom:22px;">
            Muestra este código a Andrés.
          </p>

          <div style="display:flex;gap:10px;justify-content:center;margin-bottom:20px;">
            ${pinDigits.map(d => `
              <div style="width:68px;height:84px;border-radius:18px;background:var(--purple-light);border:2px solid var(--purple-primary);color:var(--purple-primary);font-size:34px;font-weight:800;display:flex;align-items:center;justify-content:center;">
                ${d}
              </div>
            `).join('')}
          </div>

          ${state.isLinked ? `
            <div class="session-linked-pill" style="margin-bottom:22px;font-size:13.5px;">
              <span>✓ Vinculada con Andrés</span>
            </div>
          ` : `
            <div style="display:inline-flex;align-items:center;gap:8px;background:var(--teal-light);border:1.5px solid var(--teal-primary);color:var(--navy-dark);padding:8px 18px;border-radius:999px;font-size:14px;font-weight:700;margin-bottom:22px;">
              <span style="width:9px;height:9px;border-radius:50%;background:var(--teal-dark);"></span>
              <span>Esperando vinculación...</span>
            </div>
          `}

          <div style="width:100%;background:var(--purple-light);border-radius:18px;padding:16px;display:flex;align-items:center;gap:14px;text-align:left;margin-top:auto;margin-bottom:18px;">
            <div class="info-footnote-icon" style="border-radius:50%;width:32px;height:32px;">i</div>
            <span style="font-size:14px;color:var(--navy-dark);line-height:1.4;">
              Así Andrés sabe que te está respondiendo a ti.
            </span>
          </div>

          <button class="btn-primary" style="width:100%;padding:17px;" onclick="proceedFromMobilePin()">
            Continuar
          </button>
        </div>
      `;
    }

    // ------------------------------------------------------------------------
    // E04 · PIN no válido o expirado
    // ------------------------------------------------------------------------
    case 'E04': {
      const pinDigits = String(state.sessionPin).split('');
      return `
        <div class="mobile-topbar">
          <button class="mobile-back-btn" onclick="goToMobile('P01')">
            <span>←</span> <span>Vincular sesión</span>
          </button>
        </div>
        <div class="mobile-pad" style="align-items:center;text-align:center;">
          <div style="display:inline-flex;align-items:center;gap:8px;background:var(--teal-light);border:1.5px solid var(--teal-primary);color:var(--navy-dark);padding:7px 16px;border-radius:999px;font-size:13.5px;font-weight:700;margin-bottom:14px;">
            <span style="width:8px;height:8px;border-radius:50%;background:var(--teal-dark);"></span>
            <span>Esperando vinculación...</span>
          </div>

          <div style="width:100%;background:var(--danger-bg);border:1.5px solid var(--danger-border);border-radius:16px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px;text-align:left;margin-bottom:18px;">
            <div style="width:24px;height:24px;border-radius:50%;border:2px solid var(--danger-text);color:var(--danger-text);font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">!</div>
            <div>
              <div style="font-size:15px;font-weight:800;color:var(--danger-text);margin-bottom:2px;">No se pudo vincular</div>
              <div style="font-size:13px;color:var(--navy-dark);line-height:1.35;">
                El código no es válido o expiró. Muéstralo otra vez a Andrés.
              </div>
            </div>
          </div>

          <h2 style="font-size:25px;font-weight:800;color:var(--navy-dark);margin-bottom:4px;">
            PIN de la sesión
          </h2>
          <p style="font-size:14.5px;color:var(--text-muted);margin-bottom:16px;">
            Muestra este código a Andrés.
          </p>

          <div style="display:flex;gap:10px;justify-content:center;margin-bottom:18px;">
            ${pinDigits.map(d => `
              <div style="width:66px;height:80px;border-radius:18px;background:var(--danger-bg);border:2px solid var(--danger-border);color:var(--danger-text);font-size:32px;font-weight:800;display:flex;align-items:center;justify-content:center;">
                ${d}
              </div>
            `).join('')}
          </div>

          <div style="width:100%;background:var(--purple-light);border-radius:18px;padding:14px 16px;display:flex;align-items:center;gap:12px;text-align:left;margin-top:auto;margin-bottom:14px;">
            <div class="info-footnote-icon" style="border-radius:50%;width:30px;height:30px;">i</div>
            <span style="font-size:13.5px;color:var(--navy-dark);line-height:1.4;">
              Así Andrés sabe que te está respondiendo a ti.
            </span>
          </div>

          <button class="btn-primary" disabled style="width:100%;padding:16px;margin-bottom:8px;">
            Continuar
          </button>
          <button class="link-underline-btn" style="font-size:13px;" onclick="regenerateMobilePin()">
            ↻ Generar nuevo PIN activo
          </button>
        </div>
      `;
    }

    // ------------------------------------------------------------------------
    // P03 · Selección de categoría
    // ------------------------------------------------------------------------
    case 'P03':
      return `
        <div class="mobile-topbar">
          <button class="mobile-back-btn" onclick="goToMobile('P02')">
            <span>←</span> <span>Inicio</span>
          </button>
          <span class="mobile-step-indicator">Paso 1 de 3</span>
        </div>
        <div class="mobile-pad">
          <h2 style="font-size:26px;font-weight:800;color:var(--navy-dark);line-height:1.2;">
            ¿Sobre qué tema deseas consultar?
          </h2>

          <div class="mobile-cat-list">
            ${Object.values(CATEGORIES_DATA).map(c => `
              <button class="mobile-cat-card" onclick="selectCategoryOnMobile('${c.id}')">
                <div class="mobile-cat-icon">
                  ${getCategoryIconSVG(c.id, '#1F1A4E')}
                </div>
                <h3>${c.name}</h3>
                <span style="font-size:22px;color:var(--purple-primary);font-weight:700;">›</span>
              </button>
            `).join('')}
          </div>

          <div style="margin-top:auto;padding-top:20px;">
            <button class="btn-outline" style="width:100%;padding:15px;" onclick="startDirectChatFromMobile()">
              <span>💬</span> <span>No encuentro mi pregunta</span>
            </button>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // P04 · Selección de pregunta
    // ------------------------------------------------------------------------
    case 'P04':
      return `
        <div class="mobile-topbar">
          <button class="mobile-back-btn" onclick="goToMobile('P03')">
            <span>←</span> <span>Categorías</span>
          </button>
          <span class="mobile-step-indicator">Paso 2 de 3</span>
        </div>
        <div class="mobile-pad">
          <div>
            <span class="pill-tag" style="text-transform:none;font-size:13px;padding:6px 14px;margin-bottom:10px;">
              ${cat.name}
            </span>
          </div>
          <h2 style="font-size:26px;font-weight:800;color:var(--navy-dark);margin-bottom:4px;">
            Elige tu pregunta
          </h2>
          <p style="font-size:14.5px;color:var(--text-muted);">
            Toca la pregunta que quieres enviar.
          </p>

          <div class="mobile-q-list">
            ${cat.questions.map(q => `
              <button class="mobile-q-card" onclick="selectQuestionOnMobile('${escapeAttr(q)}')">
                <p>${escapeHtml(q)}</p>
                <span style="font-size:20px;color:var(--purple-primary);font-weight:700;">›</span>
              </button>
            `).join('')}
          </div>

          <div style="margin-top:auto;padding-top:18px;">
            <button class="btn-outline" style="width:100%;padding:15px;" onclick="startDirectChatFromMobile()">
              <span>💬</span> <span>No encuentro mi pregunta</span>
            </button>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // E02 · Pregunta no disponible
    // ------------------------------------------------------------------------
    case 'E02':
      return `
        <div class="mobile-topbar">
          <button class="mobile-back-btn" onclick="goToMobile('P04')">
            <span>←</span> <span>Pregunta</span>
          </button>
        </div>
        <div class="mobile-pad" style="align-items:center;text-align:center;">
          <div class="status-circle purple" style="width:74px;height:74px;margin-top:10px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>

          <h2 style="font-size:25px;font-weight:800;color:var(--navy-dark);margin-bottom:8px;">
            Pregunta no disponible
          </h2>
          <p style="font-size:15px;color:var(--text-muted);line-height:1.45;margin-bottom:22px;">
            No tenemos un video para este tema. Puedes ver otra categoría o escribirle a Andrés.
          </p>

          <div class="p01-welcome-card" style="margin-top:0;margin-bottom:24px;" onclick="openMiniClip('Mensaje en LSC', '0:15', '🔍 En este momento no tenemos un video pregrabado para esa pregunta. Escríbele a Andrés en el chat.')">
            <div class="p01-welcome-thumb">
              <div class="play-circle-btn" style="width:36px;height:36px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
            <div>
              <div style="font-size:16px;font-weight:800;color:var(--navy-dark);margin-bottom:2px;">
                Mensaje en LSC
              </div>
              <div style="font-size:13.5px;color:var(--text-muted);">
                Video · 0:15
              </div>
            </div>
          </div>

          <div style="width:100%;display:flex;flex-direction:column;gap:12px;margin-top:auto;">
            <button class="btn-primary" style="width:100%;padding:16px;" onclick="goToMobile('P03')">
              Ver otras categorías
            </button>
            <button class="btn-outline" style="width:100%;padding:15px;" onclick="startDirectChatFromMobile()">
              <span>💬</span> <span>Escribir a Andrés</span>
            </button>
            <button class="link-underline-btn" onclick="finishSessionBothSides('from-mobile')">
              Finalizar consulta
            </button>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // P05 · Confirmación de consulta
    // ------------------------------------------------------------------------
    case 'P05':
      return `
        <div class="mobile-topbar">
          <button class="mobile-back-btn" onclick="goToMobile('P04')">
            <span>←</span> <span>Pregunta</span>
          </button>
          <span class="mobile-step-indicator">Paso 3 de 3</span>
        </div>
        <div class="mobile-pad">
          <h2 style="font-size:26px;font-weight:800;color:var(--navy-dark);line-height:1.2;margin-bottom:8px;">
            ¿Deseas enviar esta pregunta?
          </h2>
          <p style="font-size:15px;color:var(--text-muted);margin-bottom:22px;">
            Andrés recibirá tu consulta y te enviará un video en LSC.
          </p>

          <div style="background:var(--purple-light);border:2px solid var(--purple-primary);border-radius:22px;padding:22px 20px;margin-bottom:24px;">
            <span class="pill-tag" style="background:var(--white);text-transform:none;font-size:12.5px;padding:5px 12px;margin-bottom:14px;">
              ${cat.name}
            </span>
            <div style="font-size:21px;font-weight:800;color:var(--navy-dark);line-height:1.3;">
              ${escapeHtml(state.selectedQuestion)}
            </div>
          </div>

          <div style="margin-top:auto;display:flex;flex-direction:column;gap:12px;">
            <button class="btn-primary" style="width:100%;padding:16px;" onclick="sendQuestionFromMobileToDesktop()">
              <span>✈️</span> <span>Enviar pregunta</span>
            </button>
            <button class="btn-outline" style="width:100%;padding:15px;" onclick="goToMobile('P04')">
              Cambiar pregunta
            </button>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // E01 · Error al enviar la pregunta
    // ------------------------------------------------------------------------
    case 'E01':
      return `
        <div class="mobile-topbar">
          <button class="mobile-back-btn" onclick="goToMobile('P05')">
            <span>←</span> <span>Confirmación</span>
          </button>
        </div>
        <div class="mobile-pad" style="align-items:center;text-align:center;">
          <div class="status-circle danger" style="width:74px;height:74px;margin-top:6px;">
            <span style="font-size:32px;font-weight:800;">!</span>
          </div>

          <h2 style="font-size:25px;font-weight:800;color:var(--navy-dark);line-height:1.2;margin-bottom:8px;">
            No pudimos enviar tu pregunta
          </h2>
          <p style="font-size:14.5px;color:var(--text-muted);margin-bottom:14px;">
            Revisa tu conexión e inténtalo de nuevo.
          </p>

          <div style="display:inline-flex;align-items:center;gap:8px;background:var(--danger-bg);border:1.5px solid var(--danger-border);color:var(--danger-text);padding:6px 16px;border-radius:999px;font-size:13px;font-weight:700;margin-bottom:18px;">
            <span style="width:8px;height:8px;border-radius:50%;background:var(--danger-text);"></span>
            <span>Error de conexión</span>
          </div>

          <div style="width:100%;background:var(--purple-light);border:1.5px solid var(--border-light);border-radius:20px;padding:18px;text-align:left;margin-bottom:20px;">
            <span class="pill-tag" style="background:var(--white);text-transform:none;font-size:12px;padding:4px 10px;margin-bottom:10px;">
              ${cat.name}
            </span>
            <div style="font-size:17px;font-weight:800;color:var(--navy-dark);line-height:1.3;">
              ${escapeHtml(state.selectedQuestion)}
            </div>
          </div>

          <div style="width:100%;margin-top:auto;display:flex;flex-direction:column;gap:12px;">
            <button class="btn-primary" style="width:100%;padding:16px;" onclick="sendQuestionFromMobileToDesktop()">
              <span>↻</span> <span>Reintentar</span>
            </button>
            <button class="btn-outline" style="width:100%;padding:15px;" onclick="goToMobile('P04')">
              Cambiar pregunta
            </button>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // P06 · Consulta enviada y en espera
    // ------------------------------------------------------------------------
    case 'P06':
      return `
        <div class="mobile-topbar">
          ${getBrandLogoSVG('small')}
        </div>
        <div class="mobile-pad" style="align-items:center;text-align:center;">
          <div class="status-circle purple" style="width:80px;height:80px;margin-top:12px;">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>

          <h2 style="font-size:25px;font-weight:800;color:var(--navy-dark);line-height:1.22;margin-bottom:8px;">
            Consulta enviada, esperando respuesta
          </h2>
          <p style="font-size:15px;color:var(--text-muted);line-height:1.45;margin-bottom:18px;">
            Andrés está buscando el video en LSC para responderte.
          </p>

          <div style="display:inline-flex;align-items:center;gap:8px;background:var(--navy-dark);color:var(--white);padding:9px 18px;border-radius:999px;font-size:13.5px;font-weight:700;margin-bottom:22px;">
            <span>🕒</span>
            <span>Esperando respuesta de Andrés</span>
          </div>

          <div style="width:100%;background:var(--purple-light);border-radius:20px;padding:18px 20px;text-align:left;margin-bottom:20px;">
            <span class="pill-tag" style="background:var(--white);text-transform:none;font-size:12px;padding:4px 12px;margin-bottom:10px;">
              ${cat.name}
            </span>
            <div style="font-size:17px;font-weight:800;color:var(--navy-dark);line-height:1.35;">
              ${escapeHtml(state.selectedQuestion)}
            </div>
          </div>

          <div style="width:100%;background:#F5F4FA;border:1.5px solid var(--border-light);border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:12px;text-align:left;margin-top:auto;">
            <span style="color:var(--purple-primary);font-weight:800;">⚠️</span>
            <span style="font-size:13px;color:var(--text-muted);line-height:1.4;">
              No puedes hacer otra pregunta hasta recibir esta respuesta.
            </span>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // P07 · Reproducción del video en LSC
    // ------------------------------------------------------------------------
    case 'P07': {
      const pct = Math.min(100, Math.round((state.videoCurrentTime / video.totalSeconds) * 100));
      const captionIdx = Math.min(
        video.lscCaptions.length - 1,
        Math.floor((state.videoCurrentTime / Math.max(1, video.totalSeconds)) * video.lscCaptions.length)
      );
      return `
        <div class="mobile-topbar">
          <button class="mobile-back-btn" onclick="goToMobile('P08')">
            <span>←</span> <span>Respuesta</span>
          </button>
        </div>
        <div class="mobile-pad">
          <div style="font-size:15px;font-weight:800;color:var(--navy-dark);margin-bottom:12px;line-height:1.3;">
            ${escapeHtml(state.selectedQuestion)}
          </div>

          <div class="p07-video-card" onclick="toggleMobileVideoPlay()" style="cursor:pointer;">
            <div class="lsc-signer-sim">
              <div class="lsc-hands-pulse" style="${state.videoPlaying ? '' : 'animation:none;opacity:0.75;'}">
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
                  <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
                  <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
                  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
                </svg>
              </div>
              <div style="font-size:18px;font-weight:800;margin-top:4px;">Persona señando en LSC</div>
              <div class="lsc-caption-pill" id="p07-live-caption">
                ${video.lscCaptions[captionIdx]}
              </div>
            </div>
          </div>

          <div class="p07-progress-track">
            <div class="p07-progress-fill" id="p07-progress-bar" style="width:${pct}%;"></div>
          </div>
          <div class="p07-time-row">
            <span id="p07-current-time">${formatSeconds(state.videoCurrentTime)}</span>
            <span>${formatSeconds(video.totalSeconds)}</span>
          </div>

          <div class="p07-controls-grid">
            <button class="p07-ctrl-btn ${state.videoPlaying ? 'active' : ''}" onclick="setMobileVideoPlay(true)">
              <span>▶</span>
              <span>Reproducir</span>
            </button>
            <button class="p07-ctrl-btn ${!state.videoPlaying ? 'active' : ''}" onclick="setMobileVideoPlay(false)">
              <span>⏸</span>
              <span>Pausar</span>
            </button>
            <button class="p07-ctrl-btn" onclick="restartMobileVideo()">
              <span>↻</span>
              <span>Repetir</span>
            </button>
          </div>

          <button class="btn-primary" style="width:100%;padding:16px;margin-top:16px;" onclick="goToMobile('P08')">
            Continuar
          </button>
        </div>
      `;
    }

    // ------------------------------------------------------------------------
    // E03 · El video no carga
    // ------------------------------------------------------------------------
    case 'E03':
      return `
        <div class="mobile-topbar">
          <button class="mobile-back-btn" onclick="goToMobile('P07')">
            <span>←</span> <span>Respuesta</span>
          </button>
        </div>
        <div class="mobile-pad" style="align-items:center;text-align:center;">
          <div style="font-size:15px;font-weight:800;color:var(--navy-dark);margin-bottom:14px;text-align:left;width:100%;">
            ${escapeHtml(state.selectedQuestion)}
          </div>

          <div style="width:100%;height:340px;border-radius:24px;background:var(--danger-bg);border:2px solid var(--danger-border);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;margin-bottom:24px;">
            <div style="width:64px;height:64px;border-radius:50%;background:var(--white);border:2.5px solid var(--danger-text);color:var(--danger-text);font-size:28px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-bottom:16px;">
              !
            </div>
            <div style="font-size:22px;font-weight:800;color:var(--navy-dark);margin-bottom:8px;">
              El video no cargó
            </div>
            <div style="font-size:14.5px;color:var(--text-muted);line-height:1.45;">
              Revisa tu conexión e inténtalo otra vez.
            </div>
          </div>

          <div style="width:100%;margin-top:auto;display:flex;flex-direction:column;gap:12px;">
            <button class="btn-primary" style="width:100%;padding:16px;" onclick="goToMobile('P07')">
              <span>↻</span> <span>Reintentar</span>
            </button>
            <button class="btn-outline" style="width:100%;padding:15px;" onclick="goToMobile('P07')">
              ← Volver a la respuesta
            </button>
            <button class="link-underline-btn" onclick="finishSessionBothSides('from-mobile')">
              Finalizar atención
            </button>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // P08 · Nueva consulta o finalizar
    // ------------------------------------------------------------------------
    case 'P08':
      return `
        <div class="mobile-topbar">
          ${getBrandLogoSVG('small')}
        </div>
        <div class="mobile-pad" style="align-items:center;text-align:center;justify-content:center;">
          <div class="status-circle purple" style="width:84px;height:84px;">
            <span style="font-size:38px;font-weight:800;">?</span>
          </div>

          <h2 style="font-size:26px;font-weight:800;color:var(--navy-dark);margin-bottom:8px;">
            ¿Qué deseas hacer ahora?
          </h2>
          <p style="font-size:15px;color:var(--text-muted);margin-bottom:32px;">
            Elige una opción para continuar.
          </p>

          <div style="width:100%;display:flex;flex-direction:column;gap:14px;">
            <button class="btn-primary" style="width:100%;padding:16px;" onclick="startAnotherQuestion()">
              Realizar otra pregunta
            </button>
            <button class="btn-outline" style="width:100%;padding:16px;" onclick="finishSessionBothSides('from-mobile')">
              Finalizar atención
            </button>
            <button class="link-underline-btn" style="margin-top:8px;" onclick="goToMobile('P07')">
              <span>↻</span> <span>Ver respuesta otra vez</span>
            </button>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // P09 · Chat con Andrés
    // ------------------------------------------------------------------------
    case 'P09': {
      const charCount = (state.mobileDraftMsg || '').length;
      return `
        <div class="mobile-topbar">
          ${getBrandLogoSVG('small')}
        </div>
        <div class="mobile-pad" style="padding-top:16px;">
          <h2 style="font-size:22px;font-weight:800;color:var(--navy-dark);margin-bottom:12px;">
            Chat con Andrés
          </h2>

          <div class="p09-chat-container" id="mobile-chat-scroll">
            ${state.chatMessages.length === 0 ? `
              <div style="margin:auto;text-align:center;color:var(--text-muted);font-size:13.5px;padding:12px;">
                Escribe tu pregunta aquí abajo y Andrés la recibirá al instante en su computador.
              </div>
            ` : state.chatMessages.map(m => `
              <div class="p09-msg ${m.sender === 'visitor' ? 'visitor' : 'agent'}">
                <div class="p09-bubble">${escapeHtml(m.text)}</div>
                <div class="p09-sender">${m.sender === 'visitor' ? 'Patricia' : 'Andrés'}</div>
              </div>
            `).join('')}
          </div>

          <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--text-muted);margin-bottom:6px;padding:0 4px;">
            <span>Escribe un mensaje corto</span>
            <span id="mobile-char-counter">${charCount} / 140</span>
          </div>

          <form class="p09-input-pill" onsubmit="handleMobileChatSubmit(event)">
            <input
              type="text"
              maxlength="140"
              placeholder="Mensaje"
              value="${escapeAttr(state.mobileDraftMsg)}"
              oninput="handleMobileDraftInput(this.value)"
            />
            <button type="submit" class="p09-send-circle" title="Enviar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </form>

          <button class="btn-outline" style="width:100%;padding:14px;margin-bottom:8px;" onclick="goToMobile('P03')">
            ← Volver a categorías
          </button>
          <button class="link-underline-btn" onclick="finishSessionBothSides('from-mobile')">
            Finalizar atención
          </button>
        </div>
      `;
    }

    // ------------------------------------------------------------------------
    // P10 · Atención finalizada
    // ------------------------------------------------------------------------
    case 'P10':
      return `
        <div class="mobile-topbar">
          ${getBrandLogoSVG('small')}
        </div>
        <div class="mobile-pad" style="align-items:center;text-align:center;justify-content:center;">
          <div class="status-circle teal" style="width:88px;height:88px;">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>

          <h2 style="font-size:27px;font-weight:800;color:var(--navy-dark);margin-bottom:8px;">
            Atención finalizada
          </h2>
          <p style="font-size:15.5px;color:var(--text-muted);margin-bottom:28px;">
            Gracias por visitar la Universidad Icesi.
          </p>

          <div class="p01-welcome-card" style="margin-top:0;margin-bottom:20px;" onclick="openMiniClip('Despedida en LSC', '0:15', '🤲 ¡Muchas gracias por tu visita a la Universidad Icesi! Siempre bienvenido.')">
            <div class="p01-welcome-thumb">
              <div class="play-circle-btn" style="width:36px;height:36px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
            <div>
              <div style="font-size:16px;font-weight:800;color:var(--navy-dark);margin-bottom:2px;">
                Despedida en LSC
              </div>
              <div style="font-size:13.5px;color:var(--text-muted);">
                Video · 0:15
              </div>
            </div>
          </div>

          <button class="link-underline-btn" style="font-size:13.5px;" onclick="resetToNewSession()">
            ↻ Iniciar nueva consulta
          </button>
        </div>
      `;

    default:
      return '';
  }
}

function renderMiniClipModalIfActive() {
  if (!state.miniClipModal) return '';
  return `
    <div style="position:absolute;inset:0;background:rgba(24,20,64,0.82);backdrop-filter:blur(4px);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;">
      <div style="background:var(--white);border-radius:24px;padding:22px;width:100%;text-align:center;box-shadow:0 14px 40px rgba(0,0,0,0.3);">
        <div style="background:var(--gradient-lsc);border-radius:18px;padding:28px 16px;color:white;margin-bottom:16px;">
          <div class="lsc-hands-pulse" style="margin:0 auto 12px;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2">
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
              <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
              <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
            </svg>
          </div>
          <div style="font-size:17px;font-weight:800;margin-bottom:8px;">${escapeHtml(state.miniClipModal.title)} (${escapeHtml(state.miniClipModal.duration)})</div>
          <div class="lsc-caption-pill" style="margin:0 auto;">${escapeHtml(state.miniClipModal.caption)}</div>
        </div>
        <button class="btn-primary" style="width:100%;padding:13px;" onclick="closeMiniClip()">
          Cerrar video
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// ACCIONES E INTERACCIONES DE FLUJO CONECTADO (PIN P2P, VIDEOS, CHAT, ERRORES)
// ============================================================================

function setViewMode(mode) {
  saveAndSyncState({ viewMode: mode }, false);
}

function goToDesktop(screenId) {
  saveAndSyncState({ desktopScreen: screenId, desktopPreviewPlaying: false });
}

function openDesktopPinScreen() {
  const prefill = state.viewMode === 'split' ? String(state.sessionPin).split('') : ['', '', '', ''];
  saveAndSyncState({
    desktopScreen: 'A02',
    enteredPin: prefill
  }, false);
  setTimeout(() => {
    const firstInput = document.getElementById('pin-input-0');
    if (firstInput) firstInput.focus();
  }, 60);
}

function goToMobile(screenId) {
  saveAndSyncState({ mobileScreen: screenId, miniClipModal: null });
}

function openMiniClip(title, duration, caption) {
  saveAndSyncState({ miniClipModal: { title, duration, caption } }, false);
}

function closeMiniClip() {
  saveAndSyncState({ miniClipModal: null }, false);
}

// Manejo de PIN de 4 dígitos en el computador de Andrés
function handlePinDigitInput(idx, val) {
  const clean = val.replace(/\D/g, '').slice(-1);
  const nextPin = [...state.enteredPin];
  nextPin[idx] = clean;
  state.enteredPin = nextPin;
  if (clean && idx < 3) {
    const nextEl = document.getElementById(`pin-input-${idx + 1}`);
    if (nextEl) nextEl.focus();
  }
}

function handlePinKeyDown(event, idx) {
  if (event.key === 'Backspace' && !state.enteredPin[idx] && idx > 0) {
    const prevEl = document.getElementById(`pin-input-${idx - 1}`);
    if (prevEl) prevEl.focus();
  } else if (event.key === 'Enter') {
    attemptPinLink();
  }
}

function fillPinAndLink(pinStr) {
  const digits = String(pinStr).split('').slice(0, 4);
  state.enteredPin = digits;
  connectDesktopToMobilePinP2P(digits.join(''));
}

function attemptPinLink() {
  const entered = state.enteredPin.join('').trim();
  if (entered.length !== 4) {
    showLiveToast('Por favor ingresa los 4 dígitos del PIN del celular.');
    return;
  }
  connectDesktopToMobilePinP2P(entered);
}

function simulateInvalidPin() {
  saveAndSyncState({
    enteredPin: ['4', '8', '0', '5'],
    failedPin: ['4', '8', '0', '5'],
    isLinked: false,
    desktopScreen: 'AE01',
    mobileScreen: state.viewMode === 'split' ? 'E04' : state.mobileScreen
  });
}

function retryValidPinFromError() {
  const prefill = state.viewMode === 'split' ? String(state.sessionPin).split('') : ['', '', '', ''];
  saveAndSyncState({
    enteredPin: prefill,
    desktopScreen: 'A02',
    mobileScreen: state.mobileScreen === 'E04' ? 'P02' : state.mobileScreen
  });
}

function regenerateMobilePin() {
  const newPin = String(Math.floor(1000 + Math.random() * 9000));
  saveAndSyncState({
    sessionPin: newPin,
    enteredPin: state.viewMode === 'split' ? newPin.split('') : state.enteredPin,
    isLinked: false,
    mobileScreen: 'P02'
  });
  initMobilePeerHost(newPin);
  showLiveToast(`Nuevo PIN generado en el celular: ${newPin}`);
}

function proceedFromMobilePin() {
  saveAndSyncState({
    mobileScreen: 'P03',
    desktopScreen: (state.viewMode === 'split' && (state.desktopScreen === 'A01' || state.desktopScreen === 'A02')) ? 'A03' : state.desktopScreen,
    isLinked: state.viewMode === 'split' ? true : state.isLinked
  });
}

// Flujo de Categorías y Preguntas (Celular -> Computador)
function selectCategoryOnMobile(catId) {
  const cat = CATEGORIES_DATA[catId] || CATEGORIES_DATA.requisitos;
  saveAndSyncState({
    selectedCategoryId: catId,
    selectedVideoId: catId,
    selectedQuestion: cat.questions[0],
    mobileScreen: 'P04'
  });
}

function selectQuestionOnMobile(questionText) {
  saveAndSyncState({
    selectedQuestion: questionText,
    mobileScreen: 'P05'
  });
}

function sendQuestionFromMobileToDesktop() {
  // Enviar por WebRTC P2P si hay un computador conectado
  sendFromMobileToDesktopP2P({
    type: 'VISITOR_QUESTION',
    categoryId: state.selectedCategoryId,
    question: state.selectedQuestion
  });

  saveAndSyncState({
    isLinked: true,
    selectedVideoId: state.selectedCategoryId,
    mobileScreen: 'P06',
    desktopScreen: 'A04'
  });
  showLiveToast('Pregunta enviada al computador de Andrés');
}

// Flujo de Biblioteca y Envío de Video en LSC (Computador -> Celular)
function openCategoryInLibrary(catId) {
  saveAndSyncState({
    libraryFilter: catId,
    desktopScreen: 'A05'
  });
}

function setLibraryFilter(filter) {
  saveAndSyncState({ libraryFilter: filter });
}

function previewVideo(videoId) {
  saveAndSyncState({
    selectedVideoId: videoId,
    desktopPreviewPlaying: false,
    desktopScreen: 'A06'
  });
}

function toggleDesktopPreviewPlay() {
  saveAndSyncState({ desktopPreviewPlaying: !state.desktopPreviewPlaying }, false);
}

function sendVideoToVisitorPhone() {
  // Enviar el video simulado al celular conectado vía WebRTC P2P
  sendFromDesktopToMobileP2P({
    type: 'SEND_LSC_VIDEO',
    videoId: state.selectedVideoId,
    categoryId: state.selectedCategoryId,
    question: state.selectedQuestion
  });

  saveAndSyncState({
    desktopScreen: 'A07',
    mobileScreen: 'P07',
    videoPlaying: true,
    videoCurrentTime: 0,
    desktopPreviewPlaying: false
  });
  showLiveToast('Video en LSC enviado al celular de la visitante');
}

// Controles del reproductor de video en el celular (P07)
function toggleMobileVideoPlay() {
  saveAndSyncState({ videoPlaying: !state.videoPlaying }, false);
}

function setMobileVideoPlay(playing) {
  saveAndSyncState({ videoPlaying: playing }, false);
}

function restartMobileVideo() {
  saveAndSyncState({ videoCurrentTime: 0, videoPlaying: true }, false);
}

function updateVideoPlayerDOMOnly() {
  const videoObj = CATEGORIES_DATA[state.selectedVideoId] || CATEGORIES_DATA.requisitos;
  const pct = Math.min(100, Math.round((state.videoCurrentTime / videoObj.totalSeconds) * 100));
  const captionIdx = Math.min(
    videoObj.lscCaptions.length - 1,
    Math.floor((state.videoCurrentTime / Math.max(1, videoObj.totalSeconds)) * videoObj.lscCaptions.length)
  );
  const barEl = document.getElementById('p07-progress-bar');
  const timeEl = document.getElementById('p07-current-time');
  const capEl = document.getElementById('p07-live-caption');
  if (barEl) barEl.style.width = `${pct}%`;
  if (timeEl) timeEl.textContent = formatSeconds(state.videoCurrentTime);
  if (capEl) capEl.textContent = videoObj.lscCaptions[captionIdx];
}

// Flujo de Chat en Tiempo Real entre Visitante (P09) y Andrés (A09 / A10)
function startDirectChatFromMobile() {
  sendFromMobileToDesktopP2P({
    type: 'START_DIRECT_CHAT'
  });

  saveAndSyncState({
    isLinked: true,
    mobileScreen: 'P09',
    desktopScreen: state.desktopScreen === 'A10' ? 'A10' : 'A09'
  });
}

function openBothChats() {
  sendFromDesktopToMobileP2P({
    type: 'OPEN_CHAT'
  });

  saveAndSyncState({
    desktopScreen: 'A10',
    mobileScreen: 'P09'
  });
}

function handleMobileDraftInput(val) {
  state.mobileDraftMsg = val;
  const counterEl = document.getElementById('mobile-char-counter');
  if (counterEl) counterEl.textContent = `${val.length} / 140`;
}

function handleMobileChatSubmit(event) {
  event.preventDefault();
  const text = (state.mobileDraftMsg || '').trim();
  if (!text) return;

  const newMsg = {
    id: Date.now(),
    sender: 'visitor',
    senderName: 'Patricia',
    time: getCurrentTimeFormatted(),
    text
  };

  sendFromMobileToDesktopP2P({
    type: 'CHAT_MESSAGE',
    message: newMsg
  });

  const nextDesktop = (state.desktopScreen === 'A10') ? 'A10' : 'A09';

  saveAndSyncState({
    chatMessages: [...state.chatMessages, newMsg],
    mobileDraftMsg: '',
    desktopScreen: nextDesktop
  });
}

function handleDesktopChatSubmit(event) {
  event.preventDefault();
  const text = (state.desktopDraftMsg || '').trim();
  if (!text) return;

  const newMsg = {
    id: Date.now(),
    sender: 'agent',
    senderName: 'Andrés',
    time: getCurrentTimeFormatted(),
    text
  };

  sendFromDesktopToMobileP2P({
    type: 'CHAT_MESSAGE',
    message: newMsg
  });

  saveAndSyncState({
    chatMessages: [...state.chatMessages, newMsg],
    desktopDraftMsg: '',
    mobileScreen: 'P09'
  });
}

// Nueva pregunta o finalizar atención
function startAnotherQuestion() {
  sendFromMobileToDesktopP2P({
    type: 'NEW_INQUIRY'
  });

  saveAndSyncState({
    mobileScreen: 'P03',
    desktopScreen: 'A03'
  });
}

function finishSessionBothSides(origin = 'both') {
  if (origin === 'from-desktop' || origin === 'both') {
    sendFromDesktopToMobileP2P({ type: 'FINISH_SESSION' });
  }
  if (origin === 'from-mobile' || origin === 'both') {
    sendFromMobileToDesktopP2P({ type: 'FINISH_SESSION' });
  }

  saveAndSyncState({
    isLinked: false,
    desktopScreen: 'A08',
    mobileScreen: 'P10'
  });
}

function resetToNewSession() {
  sendFromDesktopToMobileP2P({ type: 'RESET_SESSION' });
  saveAndSyncState({
    isLinked: false,
    desktopScreen: 'A01',
    mobileScreen: 'P01',
    enteredPin: state.viewMode === 'split' ? String(state.sessionPin).split('') : ['', '', '', ''],
    videoCurrentTime: 0
  });
}

// ============================================================================
// RENDERIZADO PRINCIPAL Y BARRA SUPERIOR DE SIMULACIÓN
// ============================================================================

function renderApp() {
  // Actualizar botones de modo en la barra superior
  document.querySelectorAll('[data-view-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view-mode') === state.viewMode);
  });

  // Actualizar estado del PIN y conexión P2P en la barra superior
  const topPinBadge = document.getElementById('sim-pin-status');
  if (topPinBadge) {
    const isRemoteConnected = p2pStatus.activeRemotePeer || state.isLinked;
    const dotClass = isRemoteConnected ? 'connected' : (p2pStatus.mobileBrokerReady ? 'ready' : '');
    const statusText = isRemoteConnected
      ? `Conectados (PIN ${state.sessionPin})`
      : (window.APP_FIXED_ROLE === 'desktop'
          ? 'Ingresa el PIN del celular en A02'
          : `PIN del celular: ${state.sessionPin} ${p2pStatus.mobileBrokerReady ? '(En línea)' : ''}`);

    topPinBadge.innerHTML = `
      <span class="p2p-status-pill">
        <span class="p2p-dot ${dotClass}"></span>
        <span>${statusText}</span>
      </span>
    `;
  }

  // Sincronizar selectores rápidos de las 26 pantallas
  const desktopSelect = document.getElementById('desktop-screen-select');
  if (desktopSelect && desktopSelect.value !== state.desktopScreen) {
    desktopSelect.value = state.desktopScreen;
  }
  const mobileSelect = document.getElementById('mobile-screen-select');
  if (mobileSelect && mobileSelect.value !== state.mobileScreen) {
    mobileSelect.value = state.mobileScreen;
  }

  // Contenedor principal (Split / Solo PC / Solo Celular)
  const workspace = document.getElementById('workspace-container');
  if (workspace) {
    workspace.className = 'workspace-container';
    if (state.viewMode === 'desktop') workspace.classList.add('mode-desktop');
    if (state.viewMode === 'mobile') workspace.classList.add('mode-mobile');
  }

  // Renderizar ambos paneles
  const desktopContainer = document.getElementById('desktop-pane');
  if (desktopContainer) {
    desktopContainer.innerHTML = renderDesktopPane();
  }

  const mobileContainer = document.getElementById('mobile-pane');
  if (mobileContainer) {
    mobileContainer.innerHTML = renderMobilePane();
  }

  // Auto-scroll en contenedores de chat
  const dChat = document.getElementById('desktop-chat-scroll');
  if (dChat) dChat.scrollTop = dChat.scrollHeight;
  const mChat = document.getElementById('mobile-chat-scroll');
  if (mChat) mChat.scrollTop = mChat.scrollHeight;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Inicialización al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  setupLocalRealtimeSync();
  startVideoSimulationTicker();
  initMobilePeerHost(state.sessionPin);
  renderApp();
});
