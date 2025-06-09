const GAS_URL =
  window.GAS_URL ||
  "https://script.google.com/macros/s/AKfycbyNbrA87prZh3en255zzcOGbCxMiBeoGsoiKJwOhyRzvXpPnSOVp9djaFv3klEDebw/exec";
// Use a simple proxy to work around CORS restrictions during local testing.
const CORS_PROXY = window.CORS_PROXY || "https://corsproxy.io/?";
function safeRandomId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

export function getPlayerId() {
  let id = localStorage.getItem('playerId');
  if (!id) {
    id = safeRandomId();
    localStorage.setItem('playerId', id);
  }
  return id;
}

export async function submitScore(score) {
  try {
    await fetch(CORS_PROXY + GAS_URL, {
      method: 'POST',
      // Use text/plain to avoid CORS preflight
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ score, id: getPlayerId() })
    });
  } catch (err) {
    console.error('Failed to submit score', err);
    showRequestError('Failed to submit score');
  }
}

export async function loadRanking(limit = 10) {
  try {
    const res = await fetch(`${CORS_PROXY}${GAS_URL}?limit=${limit}`);
    const { rows, total, player } = await res.json();
    rows.sort((a, b) => a.score - b.score);
    renderRanking(rows);
    updateRecordMessage(player, total);
    return rows;
  } catch (err) {
    console.error('Failed to load ranking', err);
    showRequestError('Failed to load ranking');
    return [];
  }
}

function renderRanking(rows) {
  const ul = document.getElementById('ranking');
  if (!ul) return;
  ul.innerHTML = '';
  rows.forEach((r, i) => {
    const li = document.createElement('li');
    li.textContent = `${i + 1}. ${r.id.slice(0, 8)} — ${r.score}`;
    ul.appendChild(li);
  });
}

function showRequestError(msg) {
  const record = document.getElementById('record');
  if (record) {
    record.textContent = msg;
  }
}


function updateRecordMessage(player, total) {
  if (!player) return;
  const date = new Date(player.time).toLocaleDateString();
  const msg =
    `Record: ${player.score}s \u3042\u306a\u305f\u306f\u4eca${player.rank}/${total}\u4f4d\u3067\u3059 (${date})`;
  const record = document.getElementById('record');
  if (record) record.textContent = msg;
  const message = document.getElementById('message');
  if (message && message.textContent.startsWith('Record:'))
    message.textContent = msg;
}