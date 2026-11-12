// ============================================================================
// Vercel Serverless Function — /api/session
// Relay HTTP/JSON en tiempo real para conectar el PC del Funcionario y Celulares
// mediante el código PIN de 4 dígitos (100% compatible con 4G/5G y firewalls)
// ============================================================================

if (!globalThis.__TUSOLUCION_LSC_ROOMS__) {
  globalThis.__TUSOLUCION_LSC_ROOMS__ = new Map();
}

const rooms = globalThis.__TUSOLUCION_LSC_ROOMS__;

function getOrCreateRoom(pin) {
  const cleanPin = String(pin || '').trim();
  if (!rooms.has(cleanPin)) {
    rooms.set(cleanPin, {
      pin: cleanPin,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isLinked: false,
      events: []
    });
  }
  return rooms.get(cleanPin);
}

// Limpiar salas antiguas (> 3 horas) para no acumular memoria
function cleanupOldRooms() {
  const now = Date.now();
  for (const [key, room] of rooms.entries()) {
    if (now - room.updatedAt > 3 * 60 * 60 * 1000) {
      rooms.delete(key);
    }
  }
}

module.exports = async function handler(req, res) {
  // Cabeceras CORS y No-Cache para respuestas instantáneas entre dispositivos
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  cleanupOldRooms();

  // GET /api/session?pin=4829&since=0
  if (req.method === 'GET') {
    const pin = String(req.query.pin || '').trim();
    const sinceTs = Number(req.query.since || 0);

    if (!pin || pin.length !== 4) {
      return res.status(400).json({ ok: false, error: 'PIN inválido' });
    }

    const room = getOrCreateRoom(pin);
    const pendingEvents = room.events.filter(ev => ev.timestamp > sinceTs);

    return res.status(200).json({
      ok: true,
      pin,
      isLinked: room.isLinked,
      serverTime: Date.now(),
      events: pendingEvents
    });
  }

  // POST /api/session
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const pin = String(body.pin || '').trim();
      const action = body.action || 'PUSH_EVENT';

      if (!pin || pin.length !== 4) {
        return res.status(400).json({ ok: false, error: 'PIN de 4 dígitos requerido' });
      }

      // PIN 4805 o 0000 reservado para probar la pantalla de error AE01 / E04
      if (action === 'LINK_PIN' && (pin === '4805' || pin === '0000')) {
        return res.status(200).json({
          ok: false,
          error: 'INVALID_PIN',
          pin
        });
      }

      const room = getOrCreateRoom(pin);
      room.updatedAt = Date.now();

      if (action === 'REGISTER_PIN') {
        return res.status(200).json({
          ok: true,
          pin,
          isLinked: room.isLinked,
          serverTime: Date.now()
        });
      }

      if (action === 'CLEAR_ROOM') {
        room.isLinked = false;
        room.events = [];
        return res.status(200).json({
          ok: true,
          pin,
          cleared: true,
          serverTime: Date.now()
        });
      }

      if (action === 'LINK_PIN') {
        room.isLinked = true;
        const linkEvent = {
          eventId: body.eventId || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          senderRole: 'desktop',
          type: 'LINK_SUCCESS',
          pin
        };
        room.events.push(linkEvent);
        if (room.events.length > 60) room.events.shift();

        return res.status(200).json({
          ok: true,
          pin,
          isLinked: true,
          event: linkEvent,
          serverTime: Date.now()
        });
      }

      if (action === 'PUSH_EVENT' && body.event) {
        const newEvent = {
          ...body.event,
          eventId: body.event.eventId || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          pin
        };

        if (newEvent.type === 'LINK_SUCCESS' || newEvent.type === 'LINK_ACK') {
          room.isLinked = true;
        } else if (newEvent.type === 'FINISH_SESSION') {
          room.isLinked = false;
        } else if (newEvent.type === 'RESET_SESSION') {
          room.isLinked = false;
          room.events = [];
        }

        // Evitar duplicados en el buffer de eventos
        const alreadyExists = room.events.some(e => e.eventId === newEvent.eventId);
        if (!alreadyExists) {
          room.events.push(newEvent);
          if (room.events.length > 60) room.events.shift();
        }

        return res.status(200).json({
          ok: true,
          pin,
          event: newEvent,
          serverTime: Date.now()
        });
      }

      return res.status(200).json({ ok: true, pin });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
};

