const GAS_URL = window.GAS_URL || 'https://script.google.com/macros/s/AKfycbyNbrA87prZh3en255zzcOGbCxMiBeoGsoiKJwOhyRzvXpPnSOVp9djaFv3klEDebw/exec';

export function getPlayerId() {
  let id = localStorage.getItem('playerId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('playerId', id);
  }
  return id;
}

export async function submitScore(score) {
  await fetch(GAS_URL, {
    method: 'POST',
    // Use text/plain to avoid CORS preflight
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ score, id: getPlayerId() })
  });
}

export async function loadRanking(limit = 10) {
  const res = await fetch(`${GAS_URL}?limit=${limit}`);
  const list = await res.json();
  list.sort((a, b) => a.score - b.score);
  renderRanking(list);
  updateRecordMessage(list);
  return list;
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

function updateRecordMessage(rows) {
  const playerId = getPlayerId();
  const idx = rows.findIndex(r => r.id === playerId);
  if (idx === -1) return;
  const r = rows[idx];
  const date = new Date(r.time).toLocaleDateString();
  const msg = `Record: ${r.score}s \u3042\u306a\u305f\u306f\u4eca${idx + 1}/${rows.length}\u4f4d\u3067\u3059 (${date})`;
  const record = document.getElementById('record');
  if (record) record.textContent = msg;
  const message = document.getElementById('message');
  if (message && message.textContent.startsWith('Record:')) message.textContent = msg;
}