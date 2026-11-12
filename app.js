// ============================================================================
// tuSoluciónLSC — Aplicación Sincronizada en Tiempo Real (PC Funcionario + Celular)
// Flujo robusto:
// 1. Al hacer otra pregunta: permite elegir entre la misma categoría (P04) o todas las categorías (P03), sin devolver al inicio.
// 2. Confirmación explícita antes de entrar al chat con Andrés ("No encuentro mi pregunta").
// 3. Alertas y banners de estado en vivo en ambas pantallas (Andrés <-> Visitante).
// ============================================================================

const STORAGE_KEY = 'tuSolucionLSC_shared_state_v4';
const CHANNEL_NAME = 'tuSolucionLSC_sync_channel_v4';
const MQTT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const MQTT_TOPIC_PREFIX = 'icesi/tusolucionlsc/v4/pin/';

const CLIENT_INSTANCE_ID = 'cli-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
const processedEventIds = new Set();

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

const DEFAULT_STATE = {
  viewMode: 'split', // 'split' | 'desktop' | 'mobile'
  desktopScreen: 'A01', // A01..A10, AE01, AE02
  mobileScreen: 'P01',  // P01..P10, E01..E04
  sessionPin: '4829',
  enteredPin: ['4', '8', '2', '9'],
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
  // Modales de flujo robusto en el celular:
  // null | 'confirm-chat' | 'next-question-choice' | 'back-from-chat-choice'
  mobileFlowModal: null,
  // Textos de estado bilateral en tiempo real
  visitorLiveActivity: 'En pantalla de bienvenida',
  agentLiveActivity: 'Esperando vinculación por PIN',
  sentVideosHistory: [],
  chatMessages: [],
  waitingForVideo: false,
  queuedQuestions: [],
  incomingVideoAlert: null,
  mobileDraftMsg: '',
  desktopDraftMsg: ''
};

let isDownloadingVideo = false;

function generateUniquePin() {
  let pin = '';
  do {
    pin = String(Math.floor(1000 + Math.random() * 9000));
  } while (pin === '4805' || pin === '0000');
  return pin;
}

let state = loadState();
let syncChannel = null;
let videoTimerInterval = null;
let toastTimeout = null;

// Transporte en la nube (MQTT sobre WSS + Polling HTTP /api/session)
let mqttClient = null;
let currentSubscribedPin = null;
let apiPollInterval = null;
let lastPolledTimestamp = Date.now() - 10000;
let pinLinkTimeout = null;
let pinVerifyPollInterval = null;

const netStatus = {
  cloudConnected: false,
  isLinkingPin: false
};

const urlParams = new URLSearchParams(window.location.search);
const fixedRole = window.APP_FIXED_ROLE || urlParams.get('mode');
if (fixedRole === 'desktop' || fixedRole === 'mobile' || fixedRole === 'split') {
  state.viewMode = fixedRole;
}

if (fixedRole === 'mobile' || fixedRole === 'split') {
  let tabPin = null;
  try {
    tabPin = sessionStorage.getItem('tuSolucionLSC_tab_pin');
  } catch (e) {}
  if (!tabPin || !/^\d{4}$/.test(tabPin) || tabPin === '4805' || tabPin === '0000') {
    tabPin = generateUniquePin();
    try {
      sessionStorage.setItem('tuSolucionLSC_tab_pin', tabPin);
    } catch (e) {}
  }
  state.sessionPin = tabPin;
  if (fixedRole === 'split') {
    state.enteredPin = tabPin.split('');
  }
} else if (fixedRole === 'desktop' && !state.isLinked) {
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

function showLiveToast(message, icon = '🔔') {
  let toastEl = document.getElementById('live-toast-banner');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'live-toast-banner';
    toastEl.className = 'live-toast';
    document.body.appendChild(toastEl);
  }
  toastEl.innerHTML = `<span style="font-size:16px;">${icon}</span> <span>${escapeHtml(message)}</span>`;
  toastEl.style.display = 'flex';
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    if (toastEl) toastEl.style.display = 'none';
  }, 4200);
}

// ============================================================================
// DESCRIPCIONES DE ESTADO EN VIVO PARA AMBAS PARTES (ALERTAS BILATERALES)
// ============================================================================

function getVisitorStatusDescription(mScreen, catId) {
  const cat = CATEGORIES_DATA[catId] || CATEGORIES_DATA.requisitos;
  switch (mScreen) {
    case 'P01': return 'En pantalla de bienvenida';
    case 'P02': return 'Viendo el código PIN para vincular';
    case 'P03': return 'Explorando el apartado de categorías (Paso 1 de 3)';
    case 'P04': return `Eligiendo una pregunta en «${cat.name}» (Paso 2 de 3)`;
    case 'P05': return `Confirmando envío de pregunta de «${cat.name}» (Paso 3 de 3)`;
    case 'P06': return 'Esperando tu respuesta en video LSC';
    case 'P07': return `Reproduciendo el video LSC («${cat.name}») en su celular`;
    case 'P08': return 'Video visto · Decidiendo si hacer otra pregunta o finalizar';
    case 'P09': return 'En el chat directo contigo';
    case 'P10': return 'Atención finalizada en el celular';
    case 'E02': return 'Viendo aviso de «Pregunta no disponible» en LSC';
    default: return 'Conectada en la aplicación';
  }
}

function getAgentStatusDescription(dScreen, videoId) {
  const vid = CATEGORIES_DATA[videoId] || CATEGORIES_DATA.requisitos;
  switch (dScreen) {
    case 'A01': return 'En pantalla de inicio';
    case 'A02': return 'Ingresando el código PIN...';
    case 'A03': return 'Conectado · Esperando que elijas y envíes tu pregunta';
    case 'A04': return '¡Recibió tu pregunta! Revisando el video LSC sugerido...';
    case 'A05': return 'Buscando el video adecuado en la biblioteca LSC...';
    case 'A06': return `Revisando vista previa de «${vid.videoTitle}» antes de enviártelo...`;
    case 'A07': return 'Te envió el video en LSC · Atento por si tienes otra consulta';
    case 'A08': return 'Atención finalizada';
    case 'A09': return 'Recibió tu solicitud de chat directo · Abriendo conversación...';
    case 'A10': return 'En el chat activo contigo · Listo para responderte';
    default: return 'Conectado en el panel de atención';
  }
}

// ============================================================================
// MOTOR DE SINCRONIZACIÓN EN LA NUBE (MQTT WSS + VERCEL API /api/session)
// ============================================================================

function initCloudSync() {
  if (typeof mqtt !== 'undefined') {
    try {
      mqttClient = mqtt.connect(MQTT_BROKER_URL, {
        clientId: 'icesi_lsc_' + Math.random().toString(16).slice(2, 10),
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 2000
      });

      mqttClient.on('connect', () => {
        netStatus.cloudConnected = true;
        if (state.sessionPin) {
          subscribeToPinRoom(state.sessionPin);
        }
        renderApp();
      });

      mqttClient.on('message', (topic, messageBuffer) => {
        try {
          const ev = JSON.parse(messageBuffer.toString());
          processIncomingCloudEvent(ev);
        } catch (err) {
          console.warn('Error leyendo mensaje MQTT:', err);
        }
      });

      mqttClient.on('error', () => {});
    } catch (e) {
      console.warn('No se pudo iniciar MQTT:', e);
    }
  }

  if (state.sessionPin) {
    subscribeToPinRoom(state.sessionPin);
  }

  if (state.viewMode !== 'desktop') {
    registerPinOnServer(state.sessionPin);
  }

  if (apiPollInterval) clearInterval(apiPollInterval);
  apiPollInterval = setInterval(pollServerEvents, 1100);
}

function subscribeToPinRoom(pin) {
  const cleanPin = String(pin || '').trim();
  if (!cleanPin || cleanPin.length !== 4) return;

  if (mqttClient && mqttClient.connected) {
    if (currentSubscribedPin && currentSubscribedPin !== cleanPin) {
      try { mqttClient.unsubscribe(MQTT_TOPIC_PREFIX + currentSubscribedPin); } catch (e) {}
    }
    currentSubscribedPin = cleanPin;
    mqttClient.subscribe(MQTT_TOPIC_PREFIX + cleanPin, { qos: 0 });
  } else {
    currentSubscribedPin = cleanPin;
  }
}

async function registerPinOnServer(pin) {
  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'REGISTER_PIN', pin: String(pin) })
    });
    if (res.ok) {
      netStatus.cloudConnected = true;
      renderApp();
    }
  } catch (e) {}
}

async function pollServerEvents() {
  const activePin = String(state.sessionPin || '').trim();
  if (!activePin || activePin.length !== 4) return;

  if (window.APP_FIXED_ROLE === 'desktop' && !state.isLinked && !netStatus.isLinkingPin) {
    return;
  }

  try {
    const res = await fetch(`/api/session?pin=${encodeURIComponent(activePin)}&since=${lastPolledTimestamp}`, {
      method: 'GET',
      cache: 'no-store'
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.ok) {
      netStatus.cloudConnected = true;
      if (Array.isArray(data.events) && data.events.length > 0) {
        data.events.forEach(ev => {
          if (ev.timestamp && ev.timestamp > lastPolledTimestamp) {
            lastPolledTimestamp = ev.timestamp;
          }
          processIncomingCloudEvent(ev);
        });
      }
    }
  } catch (e) {}
}

async function dispatchCloudEvent(eventPayload, targetPin = state.sessionPin) {
  const pin = String(targetPin || state.sessionPin).trim();
  const fullEvent = {
    ...eventPayload,
    eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    senderClientId: CLIENT_INSTANCE_ID,
    timestamp: Date.now(),
    pin
  };

  processedEventIds.add(fullEvent.eventId);

  if (mqttClient && mqttClient.connected) {
    try {
      mqttClient.publish(MQTT_TOPIC_PREFIX + pin, JSON.stringify(fullEvent), { qos: 0 });
    } catch (e) {
      console.warn('Error publicando en MQTT:', e);
    }
  }

  try {
    await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'PUSH_EVENT',
        pin,
        event: fullEvent
      })
    });
  } catch (e) {}
}

function processIncomingCloudEvent(ev) {
  if (!ev || !ev.eventId || !ev.type) return;
  if (processedEventIds.has(ev.eventId)) return;
  if (ev.senderClientId === CLIENT_INSTANCE_ID) return;

  processedEventIds.add(ev.eventId);

  switch (ev.type) {
    case 'LINK_REQUEST':
      if (window.APP_FIXED_ROLE !== 'desktop' && ev.pin === state.sessionPin) {
        saveAndSyncState({
          isLinked: true,
          agentLiveActivity: 'Conectado · Esperando que elijas y envíes tu pregunta',
          visitorLiveActivity: 'Sesión vinculada · Explorando categorías (Paso 1 de 3)',
          mobileScreen: (state.mobileScreen === 'P01' || state.mobileScreen === 'P02' || state.mobileScreen === 'E04') ? 'P03' : state.mobileScreen
        });
        dispatchCloudEvent({
          type: 'LINK_ACK',
          pin: state.sessionPin
        }, state.sessionPin);
        showLiveToast(`¡Andrés se conectó con el PIN ${state.sessionPin}!`, '✅');

        if (state.mobileScreen === 'P06') {
          dispatchCloudEvent({
            type: 'VISITOR_QUESTION',
            categoryId: state.selectedCategoryId,
            question: state.selectedQuestion
          });
        } else if (state.mobileScreen === 'P09') {
          dispatchCloudEvent({
            type: 'START_DIRECT_CHAT',
            chatMessages: state.chatMessages
          });
        }
      }
      break;

    case 'LINK_ACK':
      if (pinLinkTimeout) {
        clearTimeout(pinLinkTimeout);
        pinLinkTimeout = null;
      }
      if (pinVerifyPollInterval) {
        clearInterval(pinVerifyPollInterval);
        pinVerifyPollInterval = null;
      }
      if (netStatus.isLinkingPin || !state.isLinked) {
        netStatus.isLinkingPin = false;
        showLiveToast(`¡Dispositivo vinculado con PIN ${ev.pin || state.sessionPin}!`, '✅');
        saveAndSyncState({
          sessionPin: ev.pin || state.sessionPin,
          isLinked: true,
          agentLiveActivity: 'Conectado · Esperando que elijas y envíes tu pregunta',
          visitorLiveActivity: 'Sesión vinculada · Explorando categorías (Paso 1 de 3)',
          desktopScreen: (state.desktopScreen === 'A01' || state.desktopScreen === 'A02' || state.desktopScreen === 'AE01') ? 'A03' : state.desktopScreen,
          mobileScreen: (state.mobileScreen === 'P01' || state.mobileScreen === 'P02' || state.mobileScreen === 'E04') ? 'P03' : state.mobileScreen
        });
      }
      break;

    case 'LINK_SUCCESS':
      if (pinLinkTimeout) {
        clearTimeout(pinLinkTimeout);
        pinLinkTimeout = null;
      }
      if (pinVerifyPollInterval) {
        clearInterval(pinVerifyPollInterval);
        pinVerifyPollInterval = null;
      }
      netStatus.isLinkingPin = false;
      showLiveToast(`¡Conexión establecida con el PIN ${ev.pin || state.sessionPin}!`, '✅');
      saveAndSyncState({
        sessionPin: ev.pin || state.sessionPin,
        isLinked: true,
        agentLiveActivity: 'Conectado · Esperando que elijas y envíes tu pregunta',
        visitorLiveActivity: 'Sesión vinculada · Explorando categorías (Paso 1 de 3)',
        desktopScreen: state.desktopScreen === 'A01' || state.desktopScreen === 'A02' ? 'A03' : state.desktopScreen,
        mobileScreen: (state.mobileScreen === 'P01' || state.mobileScreen === 'P02' || state.mobileScreen === 'E04') ? 'P03' : state.mobileScreen
      });

      if (window.APP_FIXED_ROLE !== 'desktop') {
        if (state.mobileScreen === 'P06') {
          dispatchCloudEvent({
            type: 'VISITOR_QUESTION',
            categoryId: state.selectedCategoryId,
            question: state.selectedQuestion
          });
        } else if (state.mobileScreen === 'P09') {
          dispatchCloudEvent({
            type: 'START_DIRECT_CHAT',
            chatMessages: state.chatMessages
          });
        }
      }
      break;

    case 'MOBILE_STATUS_UPDATE': {
      const desc = getVisitorStatusDescription(ev.mobileScreen, ev.categoryId || state.selectedCategoryId);
      if (ev.toastForAgent) {
        showLiveToast(ev.toastForAgent, '📱');
      }
      saveAndSyncState({
        visitorLiveActivity: desc,
        selectedCategoryId: ev.categoryId || state.selectedCategoryId
      });
      break;
    }

    case 'DESKTOP_STATUS_UPDATE': {
      const desc = getAgentStatusDescription(ev.desktopScreen, ev.videoId || state.selectedVideoId);
      if (ev.toastForVisitor) {
        showLiveToast(ev.toastForVisitor, '💻');
      }
      saveAndSyncState({
        agentLiveActivity: desc
      });
      break;
    }

    case 'VISITOR_QUESTION':
      showLiveToast(`Nueva pregunta recibida: «${ev.question}»`, '📩');
      saveAndSyncState({
        isLinked: true,
        selectedCategoryId: ev.categoryId || 'programas',
        selectedVideoId: ev.categoryId || 'programas',
        selectedQuestion: ev.question,
        visitorLiveActivity: 'Esperando tu respuesta en video LSC',
        agentLiveActivity: '¡Recibió tu pregunta! Revisando el video LSC sugerido...',
        desktopScreen: 'A04'
      });
      break;

    case 'SEND_LSC_VIDEO': {
      const vId = ev.videoId || state.selectedCategoryId;
      const cId = ev.categoryId || state.selectedCategoryId;
      const qText = ev.question || state.selectedQuestion;
      const record = buildSentVideoRecord(vId, cId, qText);
      const nextHistory = [...(state.sentVideosHistory || []), record];
      const isBrowsingExtra = ['P03', 'P04', 'P05', 'E02'].includes(state.mobileScreen);

      if (isBrowsingExtra) {
        showLiveToast('🎬 ¡Andrés te envió el video de tu consulta! Toca "Ver video" arriba.', '🎬');
        saveAndSyncState({
          isLinked: true,
          waitingForVideo: false,
          selectedVideoId: vId,
          sentVideosHistory: nextHistory,
          incomingVideoAlert: {
            videoId: vId,
            categoryId: cId,
            question: qText,
            videoTitle: record.videoTitle
          },
          agentLiveActivity: 'Te envió el video en LSC · Listo para verlo',
          visitorLiveActivity: 'Video recibido · Buscando pregunta extra'
        });
      } else {
        showLiveToast('¡Andrés te ha enviado el video de respuesta en LSC!', '🎬');
        saveAndSyncState({
          isLinked: true,
          waitingForVideo: false,
          incomingVideoAlert: null,
          selectedVideoId: vId,
          selectedCategoryId: cId,
          selectedQuestion: qText,
          sentVideosHistory: nextHistory,
          agentLiveActivity: 'Te envió el video en LSC · Atento por si tienes otra consulta',
          visitorLiveActivity: 'Reproduciendo el video LSC en su celular',
          mobileScreen: 'P07',
          mobileFlowModal: null,
          videoPlaying: true,
          videoCurrentTime: 0
        });
      }
      break;
    }

    case 'QUEUE_UPDATE':
      if (window.APP_FIXED_ROLE === 'desktop' || state.viewMode === 'split') {
        if (ev.count > 0) {
          showLiveToast(`Patricia dejó ${ev.count} pregunta(s) extra en cola mientras espera.`, '📋');
        }
        saveAndSyncState({
          visitorLiveActivity: ev.visitorLiveActivity || state.visitorLiveActivity
        }, false);
      }
      break;

    case 'START_DIRECT_CHAT':
      showLiveToast('La visitante confirmó entrar al chat directo («No encuentro mi pregunta»).', '💬');
      saveAndSyncState({
        isLinked: true,
        visitorLiveActivity: 'En el chat directo contigo',
        agentLiveActivity: 'Recibió tu solicitud de chat directo',
        chatMessages: Array.isArray(ev.chatMessages) && ev.chatMessages.length > state.chatMessages.length
          ? ev.chatMessages
          : state.chatMessages,
        desktopScreen: state.desktopScreen === 'A10' ? 'A10' : 'A09'
      });
      break;

    case 'OPEN_CHAT':
      showLiveToast('Andrés abrió el chat y está listo para responderte.', '💬');
      saveAndSyncState({
        isLinked: true,
        agentLiveActivity: 'En el chat activo contigo · Listo para responderte',
        mobileScreen: 'P09',
        mobileFlowModal: null
      });
      break;

    case 'CHAT_MESSAGE':
      if (ev.message) {
        const exists = state.chatMessages.some(m => m.id === ev.message.id);
        const updatedMessages = exists ? state.chatMessages : [...state.chatMessages, ev.message];

        if (ev.message.sender === 'visitor') {
          showLiveToast(`Mensaje de visitante: "${ev.message.text.slice(0, 38)}"`, '💬');
          saveAndSyncState({
            isLinked: true,
            visitorLiveActivity: 'Te envió un mensaje en el chat directo',
            chatMessages: updatedMessages,
            desktopScreen: state.desktopScreen === 'A10' ? 'A10' : 'A09'
          });
        } else {
          showLiveToast(`Nuevo mensaje de Andrés: "${ev.message.text.slice(0, 38)}"`, '💬');
          saveAndSyncState({
            isLinked: true,
            agentLiveActivity: 'Te acaba de responder en el chat',
            chatMessages: updatedMessages,
            mobileScreen: 'P09',
            mobileFlowModal: null
          });
        }
      }
      break;

    case 'NEW_INQUIRY_SAME_CAT': {
      const catObj = CATEGORIES_DATA[ev.categoryId] || CATEGORIES_DATA.requisitos;
      showLiveToast(`La visitante quiere hacer otra pregunta de «${catObj.name}».`, '📌');
      saveAndSyncState({
        selectedCategoryId: ev.categoryId || state.selectedCategoryId,
        visitorLiveActivity: `Eligiendo otra pregunta de «${catObj.name}» (Paso 2 de 3)`,
        desktopScreen: 'A03'
      });
      break;
    }

    case 'NEW_INQUIRY_ALL_CATS':
      showLiveToast('La visitante volvió al apartado de categorías para elegir otro tema.', '📂');
      saveAndSyncState({
        visitorLiveActivity: 'Explorando el apartado de categorías (Paso 1 de 3)',
        desktopScreen: 'A03'
      });
      break;

    case 'FINISH_SESSION':
      showLiveToast('La sesión de atención ha finalizado.', '✅');
      saveAndSyncState({
        isLinked: false,
        visitorLiveActivity: 'Atención finalizada',
        agentLiveActivity: 'Atención finalizada',
        desktopScreen: 'A08',
        mobileScreen: 'P10',
        mobileFlowModal: null
      });
      break;

    case 'RESET_SESSION':
      saveAndSyncState({
        isLinked: false,
        desktopScreen: 'A01',
        mobileScreen: 'P01',
        mobileFlowModal: null,
        videoCurrentTime: 0,
        chatMessages: []
      });
      break;
  }
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

function renderDesktopLiveAlertBanner() {
  const showBannerScreens = ['A03', 'A04', 'A05', 'A06', 'A07', 'A09', 'A10'];
  if (!showBannerScreens.includes(state.desktopScreen)) return '';

  const isWaitingReply = state.mobileScreen === 'P06';
  const isWatchingVideo = state.mobileScreen === 'P07';
  const isInChat = state.mobileScreen === 'P09';
  const toneClass = isWaitingReply ? 'tone-warning' : (isWatchingVideo ? 'tone-teal' : 'tone-purple');

  return `
    <div class="bilateral-status-banner ${toneClass}">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:16px;">📱</span>
        <span><strong>Estado del celular en vivo:</strong> ${escapeHtml(state.visitorLiveActivity)}</span>
      </div>
      <span style="font-size:12px;opacity:0.85;">PIN ${state.sessionPin}</span>
    </div>
  `;
}

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
      ${renderDesktopLiveAlertBanner()}
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
            <button class="btn-outline" onclick="goToDesktop('A01')" ${netStatus.isLinkingPin ? 'disabled' : ''}>
              Volver
            </button>
            <button class="btn-primary" onclick="attemptPinLink()" ${netStatus.isLinkingPin ? 'disabled' : ''}>
              ${netStatus.isLinkingPin ? 'Vinculando con el celular...' : 'Vincular dispositivo'}
            </button>
          </div>

          <div style="margin-top:14px;display:flex;justify-content:center;gap:12px;flex-wrap:wrap;">
            <button class="link-underline-btn" style="font-size:12.5px;" onclick="fillPinAndLink('4829')">
              Usar PIN por defecto (4829)
            </button>
            <button class="link-underline-btn" style="font-size:12.5px;color:#C4254A;" onclick="simulateInvalidPin()">
              Simular PIN incorrecto (4805 → AE01)
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
            Si la visitante decide realizar otra pregunta (de la misma categoría o de otra), esta pantalla se actualizará automáticamente.
          </p>

          <div class="btn-row-center">
            <button class="btn-outline" onclick="goToDesktop('A05')">Ver biblioteca</button>
            <button class="btn-primary" onclick="finishSessionBothSides()">Finalizar atención</button>
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
      const lastVisitorMsg = [...state.chatMessages].reverse().find(m => m.sender === 'visitor');
      return `
        <div class="desktop-center-card" style="max-width:680px;">
          <div class="status-circle purple">
            <span style="font-size:26px;font-weight:800;">...</span>
          </div>
          <div class="pill-tag navy">NUEVA SOLICITUD DE CHAT DIRECTO</div>
          <h2>La visitante no encontró su pregunta en las categorías</h2>
          <p class="subtitle">
            La persona visitante confirmó entrar al chat desde la opción «No encuentro mi pregunta» en su celular.
          </p>

          <div style="background:var(--purple-light);border:2px solid var(--purple-primary);border-radius:18px;padding:20px 24px;text-align:left;margin-bottom:28px;">
            <div style="font-size:11px;font-weight:800;color:var(--purple-primary);text-transform:uppercase;margin-bottom:6px;">
              ${lastVisitorMsg ? 'MENSAJE RECIBIDO DESDE EL CELULAR:' : 'ESTADO DEL CHAT EN EL CELULAR:'}
            </div>
            <div style="font-size:18px;font-weight:800;color:var(--navy-dark);margin-bottom:6px;">
              ${lastVisitorMsg
                ? `«${escapeHtml(lastVisitorMsg.text)}»`
                : '«La visitante abrió la ventana de chat y está escribiendo su consulta...»'}
            </div>
            <div style="font-size:13px;color:var(--text-muted);">
              Solicitud confirmada por la visitante · Esperando tu respuesta
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
            <button class="btn-outline" style="padding:9px 20px;font-size:13.5px;" onclick="finishSessionBothSides()">
              Finalizar atención
            </button>
          </div>
        </div>

        <div class="a10-chat-box" id="desktop-chat-scroll">
          ${state.chatMessages.length === 0 ? `
            <div style="margin:auto;text-align:center;color:var(--text-muted);font-size:14.5px;">
              El chat está abierto. Puedes saludar a la visitante o esperar su mensaje.
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

function renderMobileLiveStatusStrip() {
  const showStripScreens = ['P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09'];
  if (!state.isLinked || !showStripScreens.includes(state.mobileScreen)) return '';

  const isVideoReady = state.desktopScreen === 'A07' || state.mobileScreen === 'P07';
  const toneClass = isVideoReady ? 'tone-teal' : '';
  const qCount = (state.queuedQuestions || []).length;

  const incomingVideoBanner = state.incomingVideoAlert ? `
    <div style="background:var(--teal-light);border-bottom:2px solid var(--teal-primary);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div style="font-size:12px;font-weight:800;color:var(--teal-dark);line-height:1.3;">
        🎬 ¡Andrés te envió el video!<br>
        <span style="font-weight:600;font-size:11px;">${escapeHtml(state.incomingVideoAlert.videoTitle)}</span>
      </div>
      <button class="btn-primary" style="padding:7px 11px;font-size:11.5px;border-radius:10px;flex-shrink:0;" onclick="openIncomingVideoNow()">
        ▶ Ver video
      </button>
    </div>
  ` : '';

  const waitingBanner = (state.waitingForVideo && state.mobileScreen !== 'P06') ? `
    <div style="background:var(--purple-light);border-bottom:1px solid var(--border-light);padding:7px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--navy-dark);font-weight:700;">
      <span>🕒 Esperando video anterior${qCount > 0 ? ` · ${qCount} en cola` : ''}</span>
      <button class="link-underline-btn" style="font-size:11.5px;" onclick="goToMobile('P06')">Ver espera</button>
    </div>
  ` : '';

  return `
    ${incomingVideoBanner}
    ${waitingBanner}
    <div class="mobile-status-strip ${toneClass}">
      <span>💻</span>
      <span><strong>Andrés:</strong> ${escapeHtml(state.agentLiveActivity)}</span>
    </div>
  `;
}

function renderMobilePane() {
  const isHeroScreen = state.mobileScreen === 'P01';
  return `
    <div class="phone-frame">
      ${getPhoneStatusBarHTML(isHeroScreen)}
      <div class="phone-screen-body">
        ${renderMobileScreenContent()}
        ${renderMobileFlowModalIfActive()}
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

          <button class="btn-primary" style="width:100%;padding:17px;" onclick="goToMobile(state.isLinked ? 'P03' : 'P02')">
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
            <span>←</span> <span>PIN ${state.sessionPin}</span>
          </button>
          <span class="mobile-step-indicator">Paso 1 de 3</span>
        </div>
        ${renderMobileLiveStatusStrip()}
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
            <button class="btn-outline" style="width:100%;padding:15px;" onclick="promptConfirmChatModal()">
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
        ${renderMobileLiveStatusStrip()}
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
            <button class="btn-outline" style="width:100%;padding:15px;" onclick="promptConfirmChatModal()">
              <span>💬</span> <span>No encuentro mi pregunta</span>
            </button>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // E02 · Pregunta no disponible (Con confirmación antes de entrar al chat)
    // ------------------------------------------------------------------------
    case 'E02':
      return `
        <div class="mobile-topbar">
          <button class="mobile-back-btn" onclick="goToMobile('P04')">
            <span>←</span> <span>Volver a preguntas</span>
          </button>
        </div>
        ${renderMobileLiveStatusStrip()}
        <div class="mobile-pad" style="align-items:center;text-align:center;">
          <div class="status-circle purple" style="width:74px;height:74px;margin-top:6px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>

          <h2 style="font-size:25px;font-weight:800;color:var(--navy-dark);margin-bottom:8px;">
            Pregunta no disponible
          </h2>
          <p style="font-size:15px;color:var(--text-muted);line-height:1.45;margin-bottom:20px;">
            No tenemos un video para este tema. Puedes ver otra categoría o confirmar si deseas escribirle a Andrés por chat.
          </p>

          <div class="p01-welcome-card" style="margin-top:0;margin-bottom:22px;" onclick="openMiniClip('Mensaje en LSC', '0:15', '🔍 En este momento no tenemos un video pregrabado para esa pregunta. Si deseas, confirma para abrir el chat con Andrés.')">
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
            <button class="btn-outline" style="width:100%;padding:15px;" onclick="promptConfirmChatModal()">
              <span>💬</span> <span>Escribir a Andrés (Confirmar)</span>
            </button>
            <button class="link-underline-btn" onclick="finishSessionBothSides()">
              Finalizar consulta
            </button>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // P05 · Confirmación de consulta
    // ------------------------------------------------------------------------
    case 'P05': {
      const isQueueMode = Boolean(state.waitingForVideo);
      return `
        <div class="mobile-topbar">
          <button class="mobile-back-btn" onclick="goToMobile('P04')">
            <span>←</span> <span>Pregunta</span>
          </button>
          <span class="mobile-step-indicator">Paso 3 de 3</span>
        </div>
        ${renderMobileLiveStatusStrip()}
        <div class="mobile-pad">
          <h2 style="font-size:26px;font-weight:800;color:var(--navy-dark);line-height:1.2;margin-bottom:8px;">
            ${isQueueMode ? '¿Dejar esta pregunta en cola?' : '¿Deseas enviar esta pregunta?'}
          </h2>
          <p style="font-size:15px;color:var(--text-muted);margin-bottom:22px;">
            ${isQueueMode
              ? 'Mientras esperas tu video actual, esta pregunta quedará guardada para enviarla después.'
              : 'Andrés recibirá tu consulta y te enviará un video en LSC.'}
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
            ${isQueueMode ? `
              <button class="btn-primary" style="width:100%;padding:16px;" onclick="queueExtraQuestionFromMobile()">
                <span>📥</span> <span>Dejar pregunta en cola</span>
              </button>
            ` : `
              <button class="btn-primary" style="width:100%;padding:16px;" onclick="sendQuestionFromMobileToDesktop()">
                <span>✈️</span> <span>Enviar pregunta</span>
              </button>
            `}
            <button class="btn-outline" style="width:100%;padding:15px;" onclick="goToMobile('P04')">
              Cambiar pregunta de ${cat.name}
            </button>
          </div>
        </div>
      `;
    }

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
    case 'P06': {
      const queued = state.queuedQuestions || [];
      return `
        <div class="mobile-topbar">
          ${getBrandLogoSVG('small')}
        </div>
        ${renderMobileLiveStatusStrip()}
        <div class="mobile-pad" style="align-items:center;text-align:center;">
          <div class="status-circle purple" style="width:70px;height:70px;margin-top:4px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>

          <h2 style="font-size:23px;font-weight:800;color:var(--navy-dark);line-height:1.22;margin-bottom:6px;">
            Consulta enviada, esperando respuesta
          </h2>
          <p style="font-size:14px;color:var(--text-muted);line-height:1.45;margin-bottom:14px;">
            Andrés está preparando el video en LSC para responderte.
          </p>

          <div style="display:inline-flex;align-items:center;gap:8px;background:var(--navy-dark);color:var(--white);padding:8px 16px;border-radius:999px;font-size:13px;font-weight:700;margin-bottom:14px;">
            <span>🕒</span>
            <span>Esperando respuesta de Andrés</span>
          </div>

          <div style="width:100%;background:var(--purple-light);border-radius:18px;padding:15px 18px;text-align:left;margin-bottom:12px;">
            <span class="pill-tag" style="background:var(--white);text-transform:none;font-size:11.5px;padding:4px 10px;margin-bottom:8px;">
              ${cat.name}
            </span>
            <div style="font-size:16px;font-weight:800;color:var(--navy-dark);line-height:1.35;">
              ${escapeHtml(state.selectedQuestion)}
            </div>
          </div>

          ${queued.length > 0 ? `
            <div style="width:100%;background:var(--teal-light);border:1.5px solid var(--teal-primary);border-radius:16px;padding:12px 14px;text-align:left;margin-bottom:12px;">
              <div style="font-size:12.5px;font-weight:800;color:var(--teal-dark);margin-bottom:6px;">
                📋 Preguntas en cola (${queued.length})
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;">
                ${queued.map((item, idx) => `
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--white);padding:7px 10px;border-radius:10px;font-size:12px;color:var(--navy-dark);">
                    <span style="font-weight:700;line-height:1.3;">${idx + 1}. ${escapeHtml(item.question)}</span>
                    <button style="background:none;border:none;color:var(--danger-text);font-weight:800;cursor:pointer;font-size:13px;padding:2px 6px;" onclick="removeQueuedQuestion('${escapeAttr(item.id)}')" title="Quitar de la cola">✕</button>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div style="width:100%;background:#F5F4FA;border:1.5px solid var(--border-light);border-radius:14px;padding:11px 13px;display:flex;align-items:center;gap:10px;text-align:left;margin-top:auto;">
            <span style="color:var(--purple-primary);font-weight:800;">⚠️</span>
            <span style="font-size:12.5px;color:var(--text-muted);line-height:1.35;">
              Cuando Andrés envíe el video, te avisaremos aquí mismo.
            </span>
          </div>

          <button class="btn-primary" style="width:100%;margin-top:10px;justify-content:center;padding:13px;" onclick="browseExtraQuestionWhileWaiting()">
            🔍 Buscar otra pregunta mientras espero
          </button>

          <button class="btn-outline" style="width:100%;margin-top:8px;justify-content:center;padding:12px;" onclick="promptNextQuestionChoiceModal()">
            ← Cancelar o cambiar pregunta
          </button>
        </div>
      `;
    }

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
          <span class="pill-tag teal" style="margin-bottom:0;font-size:10.5px;padding:4px 10px;">
            ✓ Video recibido
          </span>
        </div>
        <div class="mobile-pad" style="padding-top:16px;">
          <div style="font-size:15px;font-weight:800;color:var(--navy-dark);margin-bottom:10px;line-height:1.3;">
            ${escapeHtml(state.selectedQuestion)}
          </div>

          <div class="p07-video-card" style="height:330px;" onclick="toggleMobileVideoPlay()" style="cursor:pointer;">
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

          <button
            class="btn-outline"
            id="p07-download-video-btn"
            style="width:100%;padding:13px;margin-top:12px;font-size:14.5px;"
            onclick="downloadSimulatedLscVideo()"
            ${isDownloadingVideo ? 'disabled' : ''}
          >
            <span>⬇</span>
            <span>${isDownloadingVideo ? 'Generando descarga del video...' : 'Descargar video en LSC'}</span>
          </button>

          <button class="btn-primary" style="width:100%;padding:15px;margin-top:10px;" onclick="goToMobile('P08')">
            Continuar
          </button>

          ${(state.queuedQuestions || []).length > 0 ? `
            <div style="width:100%;background:var(--teal-light);border:1.5px solid var(--teal-primary);border-radius:14px;padding:11px 13px;margin-top:10px;text-align:left;">
              <div style="font-size:12px;font-weight:800;color:var(--teal-dark);margin-bottom:6px;">
                📋 Tienes ${state.queuedQuestions.length} pregunta(s) en cola
              </div>
              <div style="font-size:12.5px;font-weight:700;color:var(--navy-dark);margin-bottom:8px;line-height:1.3;">
                Siguiente: «${escapeHtml(state.queuedQuestions[0].question)}»
              </div>
              <button class="btn-primary" style="width:100%;padding:11px;font-size:13px;" onclick="sendNextQueuedQuestion()">
                ✈️ Enviar siguiente pregunta en cola
              </button>
            </div>
          ` : ''}
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
            <button class="link-underline-btn" onclick="finishSessionBothSides()">
              Finalizar atención
            </button>
          </div>
        </div>
      `;

    // ------------------------------------------------------------------------
    // P08 · Nueva consulta o finalizar (Permite elegir misma categoría u otra categoría)
    // ------------------------------------------------------------------------
    case 'P08':
      return `
        <div class="mobile-topbar">
          ${getBrandLogoSVG('small')}
        </div>
        ${renderMobileLiveStatusStrip()}
        <div class="mobile-pad" style="align-items:center;text-align:center;justify-content:center;">
          <div class="status-circle purple" style="width:76px;height:76px;">
            <span style="font-size:34px;font-weight:800;">?</span>
          </div>

          <h2 style="font-size:25px;font-weight:800;color:var(--navy-dark);margin-bottom:6px;">
            ¿Qué deseas hacer ahora?
          </h2>
          <p style="font-size:14.5px;color:var(--text-muted);margin-bottom:22px;">
            Puedes hacer otra pregunta en esta misma categoría, cambiar de categoría o finalizar.
          </p>

          <div style="width:100%;display:flex;flex-direction:column;gap:12px;">
            ${(state.queuedQuestions || []).length > 0 ? `
              <div style="width:100%;background:var(--teal-light);border:1.5px solid var(--teal-primary);border-radius:16px;padding:12px 14px;text-align:left;">
                <div style="font-size:12.5px;font-weight:800;color:var(--teal-dark);margin-bottom:4px;">
                  📋 Siguiente en cola (${state.queuedQuestions.length})
                </div>
                <div style="font-size:13px;font-weight:700;color:var(--navy-dark);margin-bottom:8px;line-height:1.3;">
                  «${escapeHtml(state.queuedQuestions[0].question)}»
                </div>
                <button class="btn-primary" style="width:100%;padding:13px;font-size:14px;" onclick="sendNextQueuedQuestion()">
                  ✈️ Enviar pregunta en cola
                </button>
              </div>
            ` : ''}
            <button class="btn-primary" style="width:100%;padding:16px;" onclick="promptNextQuestionChoiceModal()">
              Realizar otra pregunta
            </button>
            <button class="btn-outline" style="width:100%;padding:15px;" onclick="promptConfirmChatModal()">
              <span>💬</span> <span>Ir al chat con Andrés</span>
            </button>
            <button class="btn-outline" style="width:100%;padding:15px;" onclick="finishSessionBothSides()">
              Finalizar atención
            </button>
            <button class="link-underline-btn" style="margin-top:4px;" onclick="goToMobile('P07')">
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
          <span class="pill-tag teal" style="margin-bottom:0;font-size:10.5px;padding:4px 10px;">
            Chat conectado
          </span>
        </div>
        ${renderMobileLiveStatusStrip()}
        <div class="mobile-pad" style="padding-top:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
            <h2 style="font-size:21px;font-weight:800;color:var(--navy-dark);margin-bottom:0;">
              Chat con Andrés
            </h2>
            <button
              class="btn-outline"
              style="padding:7px 12px;font-size:12px;border-width:1.5px;"
              onclick="downloadConsultationRecord()"
              title="Descargar conversación e información de videos recibidos en PDF"
            >
              📥 Descargar PDF
            </button>
          </div>

          <div class="p09-chat-container" id="mobile-chat-scroll" style="height:285px;">
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

          <button class="btn-outline" style="width:100%;padding:13px;margin-bottom:6px;" onclick="promptNextQuestionChoiceModal()">
            ← Volver a preguntas o categorías
          </button>
          <button class="link-underline-btn" onclick="finishSessionBothSides()">
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

          <div class="p01-welcome-card" style="margin-top:0;margin-bottom:16px;" onclick="openMiniClip('Despedida en LSC', '0:15', '🤲 ¡Muchas gracias por tu visita a la Universidad Icesi! Siempre bienvenido.')">
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

          <button
            class="btn-outline"
            style="width:100%;padding:14px;margin-bottom:10px;font-size:14.5px;"
            onclick="downloadConsultationRecord()"
          >
            <span>📥</span> <span>Descargar PDF (chat e info de videos)</span>
          </button>

          <button class="link-underline-btn" style="font-size:13.5px;" onclick="resetToNewSession()">
            ↻ Iniciar nueva consulta
          </button>
        </div>
      `;

    default:
      return '';
  }
}

// ============================================================================
// MODALES DE CONFIRMACIÓN EN EL CELULAR:
// 1. Confirmar entrada al chat ("No encuentro mi pregunta")
// 2. Elegir si hacer otra pregunta de la misma categoría o ir a categorías
// ============================================================================

function renderMobileFlowModalIfActive() {
  if (!state.mobileFlowModal) return '';
  const cat = CATEGORIES_DATA[state.selectedCategoryId] || CATEGORIES_DATA.requisitos;

  // Modal 1: Confirmar si realmente desea entrar al chat con Andrés
  if (state.mobileFlowModal === 'confirm-chat') {
    return `
      <div class="phone-modal-backdrop" onclick="closeMobileFlowModal()">
        <div class="phone-modal-sheet" onclick="event.stopPropagation()">
          <div class="status-circle purple" style="width:58px;height:58px;margin-bottom:4px;">
            <span style="font-size:24px;">💬</span>
          </div>
          <h3>¿Deseas entrar al chat con Andrés?</h3>
          <p>
            Si no encontraste tu pregunta en la lista, puedes iniciar un chat escrito con Andrés. ¿Confirmas que deseas abrir el chat?
          </p>

          <button class="btn-primary" style="width:100%;padding:15px;" onclick="confirmAndEnterDirectChat()">
            ✓ Sí, confirmar y abrir chat
          </button>

          ${state.mobileScreen !== 'E02' ? `
            <button class="btn-outline" style="width:100%;padding:13px;font-size:14px;" onclick="openE02FromChatPrompt()">
              🤟 Ver aviso en LSC (Pregunta no disponible)
            </button>
          ` : ''}

          <button class="link-underline-btn" style="font-size:14px;" onclick="closeMobileFlowModal()">
            ✕ No, volver a las preguntas
          </button>
        </div>
      </div>
    `;
  }

  // Modal 2: Elegir entre otra pregunta de la misma categoría o volver al apartado de categorías
  if (state.mobileFlowModal === 'next-question-choice') {
    return `
      <div class="phone-modal-backdrop" onclick="closeMobileFlowModal()">
        <div class="phone-modal-sheet" onclick="event.stopPropagation()">
          <div class="status-circle purple" style="width:58px;height:58px;margin-bottom:4px;">
            <span style="font-size:24px;">❓</span>
          </div>
          <h3>¿Dónde quieres hacer tu pregunta?</h3>
          <p>
            Elige si deseas ver otra pregunta del mismo tema o cambiar de categoría (sin perder tu conexión con Andrés):
          </p>

          <button class="choice-card-btn" onclick="chooseAnotherQuestionSameCategory()">
            <div>
              <span class="choice-card-title">📌 Misma categoría: ${escapeHtml(cat.name)}</span>
              <span class="choice-card-sub">Elegir otra pregunta sobre este mismo tema (Paso 2 de 3)</span>
            </div>
            <span style="font-size:22px;color:var(--purple-primary);font-weight:800;">›</span>
          </button>

          <button class="choice-card-btn secondary" onclick="chooseAnotherQuestionAllCategories()">
            <div>
              <span class="choice-card-title">📂 Ir al apartado de categorías</span>
              <span class="choice-card-sub">Cambiar a otro tema diferente (Paso 1 de 3)</span>
            </div>
            <span style="font-size:22px;color:var(--purple-primary);font-weight:800;">›</span>
          </button>

          <button class="link-underline-btn" style="font-size:14px;" onclick="closeMobileFlowModal()">
            Cancelar
          </button>
        </div>
      </div>
    `;
  }

  return '';
}

function renderMiniClipModalIfActive() {
  if (!state.miniClipModal) return '';
  return `
    <div style="position:absolute;inset:0;background:rgba(24,20,64,0.82);backdrop-filter:blur(4px);z-index:70;display:flex;align-items:center;justify-content:center;padding:20px;">
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
// ACCIONES E INTERACCIONES DE FLUJO CONECTADO (PIN, VIDEOS, CHAT, ERRORES)
// ============================================================================

function setViewMode(mode) {
  saveAndSyncState({ viewMode: mode }, false);
}

function goToDesktop(screenId) {
  const agentDesc = getAgentStatusDescription(screenId, state.selectedVideoId);
  saveAndSyncState({
    desktopScreen: screenId,
    desktopPreviewPlaying: false,
    agentLiveActivity: agentDesc
  });

  if (state.isLinked) {
    dispatchCloudEvent({
      type: 'DESKTOP_STATUS_UPDATE',
      desktopScreen: screenId,
      videoId: state.selectedVideoId
    });
  }
}

function openDesktopPinScreen() {
  const prefill = state.enteredPin && state.enteredPin.join('').length === 4
    ? state.enteredPin
    : String(state.sessionPin || '4829').split('');
  saveAndSyncState({
    desktopScreen: 'A02',
    enteredPin: prefill
  }, false);
  setTimeout(() => {
    const firstInput = document.getElementById('pin-input-0');
    if (firstInput) {
      firstInput.focus();
      firstInput.select();
    }
  }, 60);
}

function goToMobile(screenId, toastForAgent = null) {
  const visitorDesc = getVisitorStatusDescription(screenId, state.selectedCategoryId);
  saveAndSyncState({
    mobileScreen: screenId,
    mobileFlowModal: null,
    miniClipModal: null,
    visitorLiveActivity: visitorDesc
  });

  if (state.isLinked) {
    dispatchCloudEvent({
      type: 'MOBILE_STATUS_UPDATE',
      mobileScreen: screenId,
      categoryId: state.selectedCategoryId,
      toastForAgent
    });
  }
}

function openMiniClip(title, duration, caption) {
  saveAndSyncState({ miniClipModal: { title, duration, caption } }, false);
}

function closeMiniClip() {
  saveAndSyncState({ miniClipModal: null }, false);
}

function promptConfirmChatModal() {
  saveAndSyncState({ mobileFlowModal: 'confirm-chat' }, false);
}

function promptNextQuestionChoiceModal() {
  saveAndSyncState({ mobileFlowModal: 'next-question-choice' }, false);
}

function closeMobileFlowModal() {
  saveAndSyncState({ mobileFlowModal: null }, false);
}

function openE02FromChatPrompt() {
  goToMobile('E02', 'La visitante está viendo el aviso de «Pregunta no disponible»');
}

// Manejo de PIN de 4 dígitos
function handlePinDigitInput(idx, val) {
  const clean = val.replace(/\D/g, '').slice(-1);
  const nextPin = [...state.enteredPin];
  nextPin[idx] = clean;
  state.enteredPin = nextPin;
  if (clean && idx < 3) {
    const nextEl = document.getElementById(`pin-input-${idx + 1}`);
    if (nextEl) {
      nextEl.focus();
      nextEl.select();
    }
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
  attemptPinLink();
}

async function attemptPinLink() {
  const entered = (state.enteredPin || []).join('').trim();
  if (entered.length !== 4) {
    showLiveToast('Por favor ingresa los 4 dígitos del PIN del celular.', '⚠️');
    return;
  }

  if (entered === '4805' || entered === '0000' || (state.viewMode === 'split' && entered !== state.sessionPin)) {
    simulateInvalidPin(entered.split(''));
    return;
  }

  if (state.viewMode === 'split' && entered === state.sessionPin) {
    state.sessionPin = entered;
    subscribeToPinRoom(entered);
    saveAndSyncState({
      sessionPin: entered,
      isLinked: true,
      visitorLiveActivity: 'Sesión vinculada · Explorando categorías (Paso 1 de 3)',
      agentLiveActivity: 'Conectado · Esperando que elijas y envíes tu pregunta',
      desktopScreen: 'A03',
      mobileScreen: (state.mobileScreen === 'P01' || state.mobileScreen === 'P02' || state.mobileScreen === 'E04') ? 'P03' : state.mobileScreen
    });
    showLiveToast(`¡Dispositivo vinculado con PIN ${entered}!`, '✅');
    return;
  }

  if (pinLinkTimeout) {
    clearTimeout(pinLinkTimeout);
    pinLinkTimeout = null;
  }
  if (pinVerifyPollInterval) {
    clearInterval(pinVerifyPollInterval);
    pinVerifyPollInterval = null;
  }

  netStatus.isLinkingPin = true;
  renderApp();

  state.sessionPin = entered;
  subscribeToPinRoom(entered);
  lastPolledTimestamp = Date.now() - 10000;

  await dispatchCloudEvent({
    type: 'LINK_REQUEST',
    pin: entered
  }, entered);

  pollServerEvents();
  pinVerifyPollInterval = setInterval(() => {
    if (netStatus.isLinkingPin) {
      pollServerEvents();
    } else if (pinVerifyPollInterval) {
      clearInterval(pinVerifyPollInterval);
      pinVerifyPollInterval = null;
    }
  }, 500);

  pinLinkTimeout = setTimeout(() => {
    if (netStatus.isLinkingPin) {
      netStatus.isLinkingPin = false;
      if (pinVerifyPollInterval) {
        clearInterval(pinVerifyPollInterval);
        pinVerifyPollInterval = null;
      }
      pinLinkTimeout = null;
      simulateInvalidPin(entered.split(''));
    }
  }, 3800);
}

function simulateInvalidPin(customDigits) {
  const digits = Array.isArray(customDigits) && customDigits.length === 4 ? customDigits : ['4', '8', '0', '5'];
  saveAndSyncState({
    enteredPin: digits,
    failedPin: digits,
    isLinked: false,
    desktopScreen: 'AE01',
    mobileScreen: state.viewMode === 'split' ? 'E04' : state.mobileScreen
  });
  showLiveToast('Error: El código PIN ingresado no es válido', '❌');
}

function retryValidPinFromError() {
  const defaultDigits = String(state.sessionPin || '4829').split('');
  saveAndSyncState({
    enteredPin: defaultDigits,
    desktopScreen: 'A02',
    mobileScreen: state.mobileScreen === 'E04' ? 'P02' : state.mobileScreen
  });
}

function regenerateMobilePin() {
  let newPin = String(Math.floor(1000 + Math.random() * 9000));
  if (newPin === '4805') newPin = '4829';

  subscribeToPinRoom(newPin);
  registerPinOnServer(newPin);

  saveAndSyncState({
    sessionPin: newPin,
    enteredPin: newPin.split(''),
    isLinked: false,
    mobileScreen: 'P02'
  });
  showLiveToast(`Nuevo PIN generado: ${newPin}`, '🔑');
}

function proceedFromMobilePin() {
  saveAndSyncState({
    mobileScreen: 'P03',
    visitorLiveActivity: 'Explorando el apartado de categorías (Paso 1 de 3)',
    agentLiveActivity: 'Conectado · Esperando que elijas y envíes tu pregunta',
    desktopScreen: (state.viewMode === 'split' && (state.desktopScreen === 'A01' || state.desktopScreen === 'A02')) ? 'A03' : state.desktopScreen,
    isLinked: true
  });
  dispatchCloudEvent({
    type: 'LINK_SUCCESS',
    pin: state.sessionPin
  });
}

// Flujo de Categorías y Preguntas (Celular -> Computador)
function selectCategoryOnMobile(catId) {
  const cat = CATEGORIES_DATA[catId] || CATEGORIES_DATA.requisitos;
  const visitorDesc = getVisitorStatusDescription('P04', catId);

  saveAndSyncState({
    selectedCategoryId: catId,
    selectedVideoId: catId,
    selectedQuestion: cat.questions[0],
    visitorLiveActivity: visitorDesc,
    mobileScreen: 'P04',
    mobileFlowModal: null
  });

  dispatchCloudEvent({
    type: 'MOBILE_STATUS_UPDATE',
    mobileScreen: 'P04',
    categoryId: catId,
    toastForAgent: `La visitante abrió la categoría «${cat.name}»`
  });
}

function selectQuestionOnMobile(questionText) {
  const visitorDesc = getVisitorStatusDescription('P05', state.selectedCategoryId);
  saveAndSyncState({
    selectedQuestion: questionText,
    visitorLiveActivity: visitorDesc,
    mobileScreen: 'P05',
    mobileFlowModal: null
  });

  dispatchCloudEvent({
    type: 'MOBILE_STATUS_UPDATE',
    mobileScreen: 'P05',
    categoryId: state.selectedCategoryId
  });
}

function sendQuestionFromMobileToDesktop() {
  dispatchCloudEvent({
    type: 'VISITOR_QUESTION',
    categoryId: state.selectedCategoryId,
    question: state.selectedQuestion
  });

  saveAndSyncState({
    isLinked: true,
    waitingForVideo: true,
    incomingVideoAlert: null,
    selectedVideoId: state.selectedCategoryId,
    visitorLiveActivity: 'Esperando tu respuesta en video LSC',
    agentLiveActivity: '¡Recibió tu pregunta! Revisando el video LSC sugerido...',
    mobileScreen: 'P06',
    desktopScreen: 'A04',
    mobileFlowModal: null
  });
  showLiveToast('Pregunta enviada al computador de Andrés', '✈️');
}

function browseExtraQuestionWhileWaiting() {
  saveAndSyncState({
    waitingForVideo: true,
    mobileScreen: 'P03',
    mobileFlowModal: null,
    visitorLiveActivity: 'Esperando video · Buscando pregunta extra en cola'
  });
  showLiveToast('Busca otra pregunta y déjala en cola mientras llega tu video.', '🔍');
}

function queueExtraQuestionFromMobile() {
  const cat = CATEGORIES_DATA[state.selectedCategoryId] || CATEGORIES_DATA.requisitos;
  const currentQueue = state.queuedQuestions || [];
  const item = {
    id: 'q-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    categoryId: cat.id,
    categoryName: cat.name,
    question: state.selectedQuestion,
    time: getCurrentTimeFormatted()
  };

  const nextQueue = [...currentQueue, item];
  const activityText = `Esperando video · ${nextQueue.length} pregunta(s) en cola`;

  dispatchCloudEvent({
    type: 'QUEUE_UPDATE',
    count: nextQueue.length,
    visitorLiveActivity: activityText
  });

  saveAndSyncState({
    queuedQuestions: nextQueue,
    mobileScreen: 'P06',
    mobileFlowModal: null,
    visitorLiveActivity: activityText
  });
  showLiveToast(`Pregunta guardada en cola (${nextQueue.length} en espera)`, '📥');
}

function removeQueuedQuestion(id) {
  const nextQueue = (state.queuedQuestions || []).filter(item => item.id !== id);
  saveAndSyncState({ queuedQuestions: nextQueue });
  showLiveToast('Pregunta quitada de la cola', '🗑️');
}

function openIncomingVideoNow() {
  const alertInfo = state.incomingVideoAlert;
  if (!alertInfo) {
    goToMobile('P07');
    return;
  }
  saveAndSyncState({
    selectedVideoId: alertInfo.videoId,
    selectedCategoryId: alertInfo.categoryId,
    selectedQuestion: alertInfo.question,
    incomingVideoAlert: null,
    waitingForVideo: false,
    mobileScreen: 'P07',
    mobileFlowModal: null,
    videoPlaying: true,
    videoCurrentTime: 0,
    visitorLiveActivity: 'Reproduciendo el video LSC en su celular'
  });
}

function sendNextQueuedQuestion() {
  const currentQueue = state.queuedQuestions || [];
  if (currentQueue.length === 0) return;

  const [nextItem, ...restQueue] = currentQueue;
  dispatchCloudEvent({
    type: 'VISITOR_QUESTION',
    categoryId: nextItem.categoryId,
    question: nextItem.question
  });

  saveAndSyncState({
    isLinked: true,
    waitingForVideo: true,
    incomingVideoAlert: null,
    selectedCategoryId: nextItem.categoryId,
    selectedVideoId: nextItem.categoryId,
    selectedQuestion: nextItem.question,
    queuedQuestions: restQueue,
    visitorLiveActivity: 'Esperando tu respuesta en video LSC',
    agentLiveActivity: '¡Recibió tu pregunta en cola! Revisando el video LSC...',
    mobileScreen: 'P06',
    desktopScreen: 'A04',
    mobileFlowModal: null
  });
  showLiveToast('Siguiente pregunta de la cola enviada a Andrés', '✈️');
}

// Opciones al querer hacer otra pregunta (Misma categoría vs. Apartado de categorías)
function chooseAnotherQuestionSameCategory() {
  const cat = CATEGORIES_DATA[state.selectedCategoryId] || CATEGORIES_DATA.requisitos;
  dispatchCloudEvent({
    type: 'NEW_INQUIRY_SAME_CAT',
    categoryId: state.selectedCategoryId
  });

  saveAndSyncState({
    mobileScreen: 'P04',
    desktopScreen: 'A03',
    mobileFlowModal: null,
    visitorLiveActivity: `Eligiendo otra pregunta en «${cat.name}» (Paso 2 de 3)`,
    agentLiveActivity: `Esperando tu nueva pregunta de «${cat.name}»`
  });
  showLiveToast(`Viendo otras preguntas de «${cat.name}»`, '📌');
}

function chooseAnotherQuestionAllCategories() {
  dispatchCloudEvent({
    type: 'NEW_INQUIRY_ALL_CATS'
  });

  saveAndSyncState({
    mobileScreen: 'P03',
    desktopScreen: 'A03',
    mobileFlowModal: null,
    visitorLiveActivity: 'Explorando el apartado de categorías (Paso 1 de 3)',
    agentLiveActivity: 'Esperando que selecciones una categoría y pregunta'
  });
  showLiveToast('Volviste al apartado de categorías', '📂');
}

// Flujo de Biblioteca y Envío de Video en LSC (Computador -> Celular)
function openCategoryInLibrary(catId) {
  saveAndSyncState({
    libraryFilter: catId,
    desktopScreen: 'A05',
    agentLiveActivity: 'Buscando el video adecuado en la biblioteca LSC...'
  });

  dispatchCloudEvent({
    type: 'DESKTOP_STATUS_UPDATE',
    desktopScreen: 'A05',
    videoId: catId
  });
}

function setLibraryFilter(filter) {
  saveAndSyncState({ libraryFilter: filter });
}

function previewVideo(videoId) {
  const vid = CATEGORIES_DATA[videoId] || CATEGORIES_DATA.requisitos;
  saveAndSyncState({
    selectedVideoId: videoId,
    desktopPreviewPlaying: false,
    desktopScreen: 'A06',
    agentLiveActivity: `Revisando vista previa de «${vid.videoTitle}» antes de enviártelo...`
  });

  dispatchCloudEvent({
    type: 'DESKTOP_STATUS_UPDATE',
    desktopScreen: 'A06',
    videoId,
    toastForVisitor: `Andrés está preparando el «${vid.videoTitle}» para enviártelo`
  });
}

function toggleDesktopPreviewPlay() {
  saveAndSyncState({ desktopPreviewPlaying: !state.desktopPreviewPlaying }, false);
}

function buildSentVideoRecord(videoId, categoryId, question) {
  const videoObj = CATEGORIES_DATA[videoId] || CATEGORIES_DATA.requisitos;
  const catObj = CATEGORIES_DATA[categoryId] || videoObj;
  return {
    id: 'vid-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    videoId: videoObj.id,
    categoryName: catObj.name,
    question: question || state.selectedQuestion,
    videoTitle: videoObj.videoTitle,
    duration: videoObj.duration,
    videoDesc: videoObj.videoDesc,
    summarySteps: [...videoObj.summarySteps],
    lscCaptions: [...videoObj.lscCaptions],
    time: getCurrentTimeFormatted()
  };
}

function sendVideoToVisitorPhone() {
  const record = buildSentVideoRecord(state.selectedVideoId, state.selectedCategoryId, state.selectedQuestion);
  const nextHistory = [...(state.sentVideosHistory || []), record];
  const isBrowsingExtraSplit = state.viewMode === 'split' && ['P03', 'P04', 'P05', 'E02'].includes(state.mobileScreen);

  dispatchCloudEvent({
    type: 'SEND_LSC_VIDEO',
    videoId: state.selectedVideoId,
    categoryId: state.selectedCategoryId,
    question: state.selectedQuestion
  });

  saveAndSyncState({
    desktopScreen: 'A07',
    mobileScreen: isBrowsingExtraSplit ? state.mobileScreen : 'P07',
    mobileFlowModal: null,
    waitingForVideo: false,
    incomingVideoAlert: isBrowsingExtraSplit ? {
      videoId: state.selectedVideoId,
      categoryId: state.selectedCategoryId,
      question: state.selectedQuestion,
      videoTitle: record.videoTitle
    } : null,
    sentVideosHistory: nextHistory,
    videoPlaying: true,
    videoCurrentTime: 0,
    desktopPreviewPlaying: false,
    agentLiveActivity: 'Te envió el video en LSC · Atento por si tienes otra consulta',
    visitorLiveActivity: isBrowsingExtraSplit ? 'Video recibido · Buscando pregunta extra' : 'Reproduciendo el video LSC en su celular'
  });
  showLiveToast(
    isBrowsingExtraSplit
      ? '¡Video enviado! Patricia recibió el aviso arriba mientras busca otra pregunta.'
      : '¡Video en LSC enviado y reproduciéndose en el celular!',
    '🎬'
  );
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

// Flujo de Chat en Tiempo Real (con confirmación previa del visitante)
function confirmAndEnterDirectChat() {
  dispatchCloudEvent({
    type: 'START_DIRECT_CHAT',
    chatMessages: state.chatMessages
  });

  saveAndSyncState({
    isLinked: true,
    mobileFlowModal: null,
    mobileScreen: 'P09',
    desktopScreen: state.desktopScreen === 'A10' ? 'A10' : 'A09',
    visitorLiveActivity: 'En el chat directo contigo',
    agentLiveActivity: state.desktopScreen === 'A10'
      ? 'En el chat activo contigo · Listo para responderte'
      : 'Recibió tu solicitud de chat · Abriendo conversación...'
  });
  showLiveToast('Chat con Andrés iniciado. Se notificó a su computador.', '💬');
}

function openBothChats() {
  dispatchCloudEvent({
    type: 'OPEN_CHAT'
  });

  saveAndSyncState({
    desktopScreen: 'A10',
    mobileScreen: 'P09',
    mobileFlowModal: null,
    agentLiveActivity: 'En el chat activo contigo · Listo para responderte'
  });
  showLiveToast('Chat directo abierto con la persona visitante', '💬');
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
    id: Date.now() + Math.floor(Math.random() * 1000),
    sender: 'visitor',
    senderName: 'Patricia',
    time: getCurrentTimeFormatted(),
    text
  };

  dispatchCloudEvent({
    type: 'CHAT_MESSAGE',
    message: newMsg
  });

  const nextDesktop = (state.desktopScreen === 'A10') ? 'A10' : 'A09';

  saveAndSyncState({
    chatMessages: [...state.chatMessages, newMsg],
    mobileDraftMsg: '',
    visitorLiveActivity: 'Te envió un mensaje en el chat directo',
    desktopScreen: nextDesktop
  });
  showLiveToast('Mensaje enviado a Andrés', '✓');
}

function handleDesktopChatSubmit(event) {
  event.preventDefault();
  const text = (state.desktopDraftMsg || '').trim();
  if (!text) return;

  const newMsg = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    sender: 'agent',
    senderName: 'Andrés',
    time: getCurrentTimeFormatted(),
    text
  };

  dispatchCloudEvent({
    type: 'CHAT_MESSAGE',
    message: newMsg
  });

  saveAndSyncState({
    chatMessages: [...state.chatMessages, newMsg],
    desktopDraftMsg: '',
    agentLiveActivity: 'Te acaba de responder en el chat',
    mobileScreen: 'P09'
  });
  showLiveToast('Respuesta enviada al celular de la visitante', '✓');
}

function finishSessionBothSides() {
  dispatchCloudEvent({
    type: 'FINISH_SESSION'
  });

  saveAndSyncState({
    isLinked: false,
    mobileFlowModal: null,
    visitorLiveActivity: 'Atención finalizada',
    agentLiveActivity: 'Atención finalizada',
    desktopScreen: 'A08',
    mobileScreen: 'P10'
  });
  showLiveToast('Atención finalizada correctamente', '✅');
}

function resetToNewSession() {
  const oldPin = state.sessionPin;
  dispatchCloudEvent({
    type: 'RESET_SESSION'
  }, oldPin);

  if (oldPin) {
    fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CLEAR_ROOM', pin: oldPin })
    }).catch(() => {});
  }

  let newPin = oldPin;
  if (window.APP_FIXED_ROLE !== 'desktop') {
    newPin = generateUniquePin();
    try {
      sessionStorage.setItem('tuSolucionLSC_tab_pin', newPin);
    } catch (e) {}
    subscribeToPinRoom(newPin);
    registerPinOnServer(newPin);
  }

  if (pinLinkTimeout) {
    clearTimeout(pinLinkTimeout);
    pinLinkTimeout = null;
  }
  if (pinVerifyPollInterval) {
    clearInterval(pinVerifyPollInterval);
    pinVerifyPollInterval = null;
  }
  netStatus.isLinkingPin = false;

  saveAndSyncState({
    sessionPin: newPin,
    isLinked: false,
    mobileFlowModal: null,
    visitorLiveActivity: 'En pantalla de bienvenida',
    agentLiveActivity: 'Esperando vinculación por PIN',
    desktopScreen: 'A01',
    mobileScreen: 'P01',
    enteredPin: state.viewMode === 'split' ? newPin.split('') : ['', '', '', ''],
    selectedQuestion: null,
    waitingForVideo: false,
    queuedQuestions: [],
    incomingVideoAlert: null,
    mobileDraftMsg: '',
    desktopDraftMsg: '',
    videoCurrentTime: 0,
    sentVideosHistory: [],
    chatMessages: []
  });
}

// ============================================================================
// DESCARGA DE CONVERSACIÓN DEL CHAT + CONTENIDO DE VIDEOS ENVIADOS
// Y DESCARGA DEL VIDEO SIMULADO EN LSC
// ============================================================================

function triggerBrowserBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

function cleanPdfText(str) {
  // Eliminar emojis que no soporta Helvetica estándar en PDF manteniendo tildes y eñes
  return String(str || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function downloadConsultationRecord() {
  const nowStr = new Date().toLocaleString('es-CO');
  const videos = state.sentVideosHistory || [];
  const messages = state.chatMessages || [];

  if (!window.jspdf || !window.jspdf.jsPDF) {
    showLiveToast('No se pudo cargar el generador PDF. Verifica tu conexión.', '⚠️');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const maxWidth = pageWidth - margin * 2;
  let y = 0;

  function ensureSpace(neededHeight = 28) {
    if (y + neededHeight > pageHeight - 48) {
      doc.addPage();
      y = 48;
    }
  }

  function writeWrapped(text, fontSize = 10.5, isBold = false, color = [31, 26, 78], indent = 0, lineH = 15) {
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(cleanPdfText(text), maxWidth - indent);
    lines.forEach(line => {
      ensureSpace(lineH + 4);
      doc.text(line, margin + indent, y);
      y += lineH;
    });
  }

  // Encabezado institucional
  doc.setFillColor(81, 48, 217); // #5130D9
  doc.rect(0, 0, pageWidth, 86, 'F');
  doc.setFillColor(92, 191, 188); // #5CBFBC
  doc.rect(0, 82, pageWidth, 5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('tuSolucionLSC - Resumen de Consulta', margin, 38);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(cleanPdfText(`Universidad Icesi  |  PIN de sesion: ${state.sessionPin}  |  Fecha: ${nowStr}`), margin, 62);

  y = 114;

  // Sección 1: Videos en LSC recibidos y contenido de la información
  doc.setFillColor(240, 238, 251);
  doc.roundedRect(margin, y - 16, maxWidth, 26, 6, 6, 'F');
  writeWrapped('1. VIDEOS EN LSC RECIBIDOS Y CONTENIDO DE LA INFORMACION', 11.5, true, [81, 48, 217], 8, 18);
  y += 6;

  if (videos.length === 0) {
    writeWrapped('No se recibieron videos en LSC durante esta sesion.', 10.5, false, [95, 92, 120], 4, 16);
    y += 10;
  } else {
    videos.forEach((v, idx) => {
      ensureSpace(90);
      writeWrapped(`Video #${idx + 1}: ${v.videoTitle} (${v.duration}) - Recibido a las ${v.time}`, 11.5, true, [31, 26, 78], 0, 17);
      writeWrapped(`Categoria: ${v.categoryName}`, 10, true, [30, 110, 102], 8, 15);
      writeWrapped(`Pregunta consultada: "${v.question}"`, 10.5, false, [31, 26, 78], 8, 15);
      writeWrapped(`Descripcion: ${v.videoDesc}`, 10, false, [95, 92, 120], 8, 14);
      y += 3;
      writeWrapped('Resumen de la informacion en espanol:', 10, true, [81, 48, 217], 8, 14);
      (v.summarySteps || []).forEach(step => {
        writeWrapped(`- ${step}`, 10, false, [31, 26, 78], 16, 14);
      });
      y += 3;
      writeWrapped('Contenido en Lengua de Senas Colombiana (LSC):', 10, true, [30, 110, 102], 8, 14);
      (v.lscCaptions || []).forEach(cap => {
        writeWrapped(`* ${cap}`, 9.5, false, [62, 58, 93], 16, 13.5);
      });
      y += 12;
      ensureSpace(12);
      doc.setDrawColor(231, 229, 243);
      doc.line(margin, y - 4, pageWidth - margin, y - 4);
      y += 8;
    });
  }

  y += 8;
  ensureSpace(40);

  // Sección 2: Conversación del chat con Andrés
  doc.setFillColor(240, 238, 251);
  doc.roundedRect(margin, y - 16, maxWidth, 26, 6, 6, 'F');
  writeWrapped('2. HISTORIAL DEL CHAT CON ANDRES', 11.5, true, [81, 48, 217], 8, 18);
  y += 6;

  if (messages.length === 0) {
    writeWrapped('No se registraron mensajes en el chat durante esta sesion.', 10.5, false, [95, 92, 120], 4, 16);
  } else {
    messages.forEach(m => {
      ensureSpace(34);
      const isVisitor = m.sender === 'visitor';
      const author = isVisitor ? 'Visitante (Patricia)' : 'Funcionario (Andres)';
      const authorColor = isVisitor ? [81, 48, 217] : [30, 110, 102];
      writeWrapped(`[${m.time}] ${author}:`, 9.5, true, authorColor, 4, 13);
      writeWrapped(m.text, 10.5, false, [31, 26, 78], 12, 15);
      y += 4;
    });
  }

  doc.save(`tuSolucionLSC-consulta-PIN-${state.sessionPin}.pdf`);
  showLiveToast('PDF con chat e información de videos descargado', '📥');
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(' ');
  let line = '';
  let currentY = y;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line.trim()) {
    ctx.fillText(line.trim(), x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

function downloadSimulatedVideoHtmlFallback(videoObj, questionText) {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(videoObj.videoTitle)} — tuSoluciónLSC</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #F8F7FC; color: #1F1A4E; margin: 0; padding: 24px; }
  .card { max-width: 520px; margin: 0 auto; background: #FFF; border-radius: 24px; padding: 24px; box-shadow: 0 10px 30px rgba(31,26,78,0.1); }
  .player { background: linear-gradient(125deg, #5DBFBC 0%, #5130D9 100%); color: #FFF; border-radius: 18px; padding: 28px 20px; text-align: center; margin-bottom: 18px; }
  .step { background: #F0EEFB; padding: 12px 14px; border-radius: 12px; margin-bottom: 8px; font-weight: 600; font-size: 14px; }
</style>
</head>
<body>
  <div class="card">
    <div style="font-size:12px;font-weight:800;color:#5130D9;margin-bottom:6px;">tuSoluciónLSC · VIDEO DESCARGADO</div>
    <h2 style="margin:0 0 8px;">${escapeHtml(videoObj.videoTitle)} (${escapeHtml(videoObj.duration)})</h2>
    <p style="color:#5F5C78;margin:0 0 16px;"><strong>Pregunta:</strong> ${escapeHtml(questionText)}</p>
    <div class="player">
      <div style="font-size:38px;margin-bottom:8px;">🤟</div>
      <div style="font-weight:800;font-size:17px;margin-bottom:10px;">Simulación de Respuesta en LSC</div>
      ${videoObj.lscCaptions.map(c => `<div style="background:rgba(24,20,64,0.65);padding:8px 12px;border-radius:10px;margin-bottom:6px;font-size:13px;">${escapeHtml(c)}</div>`).join('')}
    </div>
    <h3 style="margin:0 0 10px;font-size:16px;">Resumen en español</h3>
    ${videoObj.summarySteps.map(s => `<div class="step">${escapeHtml(s)}</div>`).join('')}
  </div>
</body>
</html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  triggerBrowserBlobDownload(blob, `${videoObj.id}-LSC-tuSolucionLSC.html`);
  showLiveToast('Video interactivo descargado en tu dispositivo', '📥');
}

function downloadSimulatedLscVideo() {
  if (isDownloadingVideo) return;
  const videoObj = CATEGORIES_DATA[state.selectedVideoId] || CATEGORIES_DATA.requisitos;
  const questionText = state.selectedQuestion || '';

  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 960;

  const canRecord = typeof canvas.captureStream === 'function' && typeof MediaRecorder !== 'undefined';
  if (!canRecord) {
    downloadSimulatedVideoHtmlFallback(videoObj, questionText);
    return;
  }

  let mimeType = '';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
    mimeType = 'video/webm;codecs=vp8';
  } else if (MediaRecorder.isTypeSupported('video/webm')) {
    mimeType = 'video/webm';
  } else if (MediaRecorder.isTypeSupported('video/mp4')) {
    mimeType = 'video/mp4';
  }

  if (!mimeType) {
    downloadSimulatedVideoHtmlFallback(videoObj, questionText);
    return;
  }

  isDownloadingVideo = true;
  renderApp();

  try {
    const stream = canvas.captureStream(24);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      isDownloadingVideo = false;
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: mimeType });
      triggerBrowserBlobDownload(blob, `Video-LSC-${videoObj.id}.${ext}`);
      showLiveToast(`Video descargado (${videoObj.videoTitle}.${ext})`, '📥');
      renderApp();
    };

    const ctx = canvas.getContext('2d');
    const startTime = performance.now();
    const durationMs = 2800;

    recorder.start();

    function drawFrame(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);

      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#5DBFBC');
      grad.addColorStop(1, '#5130D9');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Tarjeta superior con marca y pregunta
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.beginPath();
      ctx.roundRect(40, 44, canvas.width - 80, 210, 24);
      ctx.fill();

      ctx.fillStyle = '#5130D9';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('tuSoluciónLSC · Universidad Icesi', 72, 92);

      ctx.fillStyle = '#1F1A4E';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(videoObj.videoTitle, 72, 134);

      ctx.fillStyle = '#5F5C78';
      ctx.font = '22px sans-serif';
      wrapCanvasText(ctx, `Pregunta: ${questionText}`, 72, 178, canvas.width - 144, 30);

      // Círculo central animado de señas LSC
      const pulse = 1 + 0.08 * Math.sin(elapsed * 0.01);
      ctx.save();
      ctx.translate(canvas.width / 2, 430);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.beginPath();
      ctx.arc(0, 0, 92, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '76px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🤟', 0, 4);
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      // Subtítulo LSC actual
      const capIdx = Math.min(
        videoObj.lscCaptions.length - 1,
        Math.floor(progress * videoObj.lscCaptions.length)
      );
      ctx.fillStyle = 'rgba(24, 20, 64, 0.85)';
      ctx.beginPath();
      ctx.roundRect(40, 560, canvas.width - 80, 120, 20);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px sans-serif';
      wrapCanvasText(ctx, videoObj.lscCaptions[capIdx], 68, 608, canvas.width - 136, 32);

      // Resumen en español
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.beginPath();
      ctx.roundRect(40, 704, canvas.width - 80, 210, 20);
      ctx.fill();

      ctx.fillStyle = '#1F1A4E';
      ctx.font = 'bold 21px sans-serif';
      ctx.fillText('Resumen de la información:', 68, 744);

      ctx.fillStyle = '#3E3A5D';
      ctx.font = '19px sans-serif';
      let sy = 778;
      videoObj.summarySteps.forEach(step => {
        sy = wrapCanvasText(ctx, step, 68, sy, canvas.width - 136, 24) + 6;
      });

      if (elapsed < durationMs) {
        requestAnimationFrame(drawFrame);
      } else {
        recorder.stop();
      }
    }

    requestAnimationFrame(drawFrame);
  } catch (err) {
    console.warn('Error grabando video simulado, usando respaldo HTML:', err);
    isDownloadingVideo = false;
    renderApp();
    downloadSimulatedVideoHtmlFallback(videoObj, questionText);
  }
}

// ============================================================================
// RENDERIZADO PRINCIPAL Y BARRA SUPERIOR DE SIMULACIÓN
// ============================================================================

function renderApp() {
  document.querySelectorAll('[data-view-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view-mode') === state.viewMode);
  });

  const topPinBadge = document.getElementById('sim-pin-status');
  if (topPinBadge) {
    const dotClass = state.isLinked ? 'connected' : (netStatus.cloudConnected ? 'ready' : '');
    const statusText = state.isLinked
      ? `Conectados en vivo · PIN ${state.sessionPin}`
      : `PIN activo: ${state.sessionPin} ${netStatus.cloudConnected ? '(Nube lista)' : ''}`;

    topPinBadge.innerHTML = `
      <span class="p2p-status-pill">
        <span class="p2p-dot ${dotClass}"></span>
        <span>${statusText}</span>
      </span>
    `;
  }

  const desktopSelect = document.getElementById('desktop-screen-select');
  if (desktopSelect && desktopSelect.value !== state.desktopScreen) {
    desktopSelect.value = state.desktopScreen;
  }
  const mobileSelect = document.getElementById('mobile-screen-select');
  if (mobileSelect && mobileSelect.value !== state.mobileScreen) {
    mobileSelect.value = state.mobileScreen;
  }

  const workspace = document.getElementById('workspace-container');
  if (workspace) {
    workspace.className = 'workspace-container';
    if (state.viewMode === 'desktop') workspace.classList.add('mode-desktop');
    if (state.viewMode === 'mobile') workspace.classList.add('mode-mobile');
  }

  const desktopContainer = document.getElementById('desktop-pane');
  if (desktopContainer) {
    desktopContainer.innerHTML = renderDesktopPane();
  }

  const mobileContainer = document.getElementById('mobile-pane');
  if (mobileContainer) {
    mobileContainer.innerHTML = renderMobilePane();
  }

  const dChat = document.getElementById('desktop-chat-scroll');
  if (dChat) dChat.scrollTop = dChat.scrollHeight;
  const mChat = document.getElementById('mobile-chat-scroll');
  if (mChat) mChat.scrollTop = mChat.scrollHeight;

  if (state.viewMode === 'desktop' || window.APP_FIXED_ROLE === 'desktop') {
    if (state.desktopScreen === 'A04') {
      document.title = '(1) Nueva pregunta · tuSoluciónLSC';
    } else if (state.desktopScreen === 'A09') {
      document.title = '(1) Solicitud de chat · tuSoluciónLSC';
    } else {
      document.title = 'tuSoluciónLSC — Panel de Andrés';
    }
  }
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

window.addEventListener('DOMContentLoaded', () => {
  setupLocalRealtimeSync();
  startVideoSimulationTicker();
  initCloudSync();
  renderApp();
});
