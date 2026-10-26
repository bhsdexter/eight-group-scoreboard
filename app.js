const STORAGE_KEY = 'eight-group-scoreboard-v1';
const COLORS = [
  ['#24937e', '#e4f4eb'], ['#e48663', '#fff0e6'],
  ['#6087c7', '#eaf0fa'], ['#bc8d4e', '#fbf1df'],
  ['#a47cbb', '#f3eaf8'], ['#d0718d', '#fbeaf0'],
  ['#6c9a61', '#edf5e8'], ['#668fa0', '#eaf3f5']
];
const $ = (selector) => document.querySelector(selector);

function newState() {
  return {
    version: 1,
    teams: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `第${i + 1}组` })),
    students: [],
    mode: 'group',
    events: [],
    awards: {},
    arrangements: {}
  };
}

function todayKey() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function validState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.teams) || value.teams.length !== 8 || !Array.isArray(value.events) || value.events.length > 100000) return false;
  if (!value.teams.every((team, index) => team.id === index + 1 && typeof team.name === 'string' && team.name.trim().length > 0 && team.name.length <= 20)) return false;
  if (!value.events.every((event) => Number.isInteger(event.teamId) && event.teamId >= 1 && event.teamId <= 8 && Number.isInteger(event.delta) && event.delta !== 0 && Math.abs(event.delta) <= 999 && /^\d{4}-\d{2}-\d{2}$/.test(event.day) && Number.isFinite(event.at) && typeof event.id === 'string')) return false;
  if (value.mode !== undefined && !['group', 'individual'].includes(value.mode)) return false;
  if (value.students !== undefined && (!Array.isArray(value.students) || value.students.length > 400 || !value.students.every((student) => typeof student.id === 'string' && student.id.length > 0 && Number.isInteger(student.teamId) && student.teamId >= 1 && student.teamId <= 8 && typeof student.name === 'string' && student.name.trim().length > 0 && student.name.length <= 20) || new Set(value.students.map((student) => student.id)).size !== value.students.length)) return false;
  if (!value.events.every((event) => (event.studentId === undefined || typeof event.studentId === 'string') && (event.studentName === undefined || typeof event.studentName === 'string' && event.studentName.length <= 20))) return false;
  if (!value.awards || typeof value.awards !== 'object' || Array.isArray(value.awards)) return false;
  if (!Object.values(value.awards).every((name) => typeof name === 'string' && name.length <= 200)) return false;
  if (value.arrangements !== undefined && (typeof value.arrangements !== 'object' || Array.isArray(value.arrangements))) return false;
  return Object.values(value.arrangements || {}).every((note) => typeof note === 'string' && note.length <= 200);
}

function normalizeState(value) {
  return { ...value, students: value.students || [], mode: value.mode || 'group' };
}

let state;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  const parsed = saved ? JSON.parse(saved) : newState();
  state = validState(parsed) ? normalizeState(parsed) : newState();
} catch {
  state = newState();
}

let activeTab = 'score';
let currentTeamId = null;
let currentEventId = null;
let pointsSign = 1;
let editSign = 1;
let lastDay = todayKey();
let toastTimer;

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2500);
}

function commit(change) {
  const next = structuredClone(state);
  change(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    state = next;
    render();
    return true;
  } catch {
    showToast('保存失败，请先下载备份并检查浏览器存储空间');
    return false;
  }
}

function allTotals() {
  const totals = new Map(state.teams.map((team) => [team.id, { total: 0, today: 0 }]));
  const day = todayKey();
  for (const event of state.events) {
    const item = totals.get(event.teamId);
    if (!item) continue;
    item.total += event.delta;
    if (event.day === day) item.today += event.delta;
  }
  return totals;
}

function rankedTeams(totals) {
  const sorted = state.teams.map((team) => ({ ...team, ...totals.get(team.id) }))
    .sort((a, b) => b.total - a.total || a.id - b.id);
  let previousScore = null;
  let previousRank = 0;
  return sorted.map((team, index) => {
    const rank = team.total === previousScore ? previousRank : index + 1;
    previousScore = team.total;
    previousRank = rank;
    return { ...team, rank };
  });
}

function signed(value) { return value > 0 ? `+${value}` : String(value); }
function teamName(id) { return state.teams.find((team) => team.id === id)?.name || `第${id}组`; }
function eventLabel(event) { return `${teamName(event.teamId)}${event.studentName ? ` · ${event.studentName}` : ''}`; }
function newId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`; }

function addPoints(teamId, delta, studentId = null) {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 999) return;
  const student = studentId ? state.students.find((item) => item.id === studentId && item.teamId === teamId) : null;
  if (studentId && (!student || delta !== 1)) return;
  if (commit((next) => next.events.push({ id: newId(), teamId, delta, day: todayKey(), at: Date.now(), ...(student ? { studentId: student.id, studentName: student.name } : {}) }))) {
    showToast(`${student ? `${student.name}为` : ''}${teamName(teamId)} ${signed(delta)} 分，已记下`);
  }
}

function renderDate() {
  const now = new Date();
  $('#today-label').textContent = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' }).format(now);
  $('#weekday-label').textContent = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'long' }).format(now);
}

function renderTeamActions(team) {
  const members = state.students.filter((student) => student.teamId === team.id);
  const rosterHead = `<div class="student-roster-head"><span>组内同学 · ${members.length} 人</span><button type="button" data-roster="${team.id}" aria-label="设置${escapeHtml(team.name)}的同学名单">设置名单</button></div>`;
  if (state.mode === 'individual') {
    const contributions = new Map(members.map((student) => [student.id, 0]));
    for (const event of state.events) {
      if (event.studentId && contributions.has(event.studentId)) contributions.set(event.studentId, contributions.get(event.studentId) + event.delta);
    }
    return `<div class="student-roster">${rosterHead}${members.length ? members.map((student) => `<div class="student-row"><span class="student-name">${escapeHtml(student.name)}</span><span class="student-contribution">个人 ${signed(contributions.get(student.id))}</span><button type="button" data-student="${escapeHtml(student.id)}" data-student-team="${team.id}" aria-label="${escapeHtml(student.name)}为${escapeHtml(team.name)}加1分">＋1</button></div>`).join('') : '<div class="student-empty">还没有同学名单，请点“设置名单”</div>'}</div>`;
  }
  return `<div class="team-bottom"><div class="score-actions">${Array.from({ length: 6 }, (_, i) => `<button type="button" class="score-button plus" data-score="${team.id}" data-delta="${i + 1}" aria-label="${escapeHtml(team.name)}加${i + 1}分">＋${i + 1}</button>`).join('')}<button type="button" class="score-button minus" data-score="${team.id}" data-delta="-1" aria-label="${escapeHtml(team.name)}减1分">－1</button></div><div class="more-actions"><button type="button" data-custom="${team.id}" data-custom-sign="plus" aria-label="${escapeHtml(team.name)}加多分">＋ 加多分</button><button type="button" data-custom="${team.id}" data-custom-sign="minus" aria-label="${escapeHtml(team.name)}减多分">－ 减多分</button></div></div><div class="student-roster student-roster-compact">${rosterHead}${members.length ? `<div class="student-name-list">${members.map((student) => `<span>${escapeHtml(student.name)}</span>`).join('')}</div>` : '<div class="student-empty">还没有同学名单，请点“设置名单”</div>'}</div>`;
}

function renderScore(totals, ranked) {
  $('#team-grid').innerHTML = state.teams.map((team, index) => {
    const { total, today } = totals.get(team.id);
    const [accent, soft] = COLORS[index];
    return `<article class="team-card" style="--accent:${accent};--soft:${soft}">
      <div class="team-top"><div><span class="team-number">${String(team.id).padStart(2, '0')}</span><div class="team-name-line"><span class="team-name" title="${escapeHtml(team.name)}">${escapeHtml(team.name)}</span><button type="button" class="rename-button" data-rename="${team.id}" aria-label="修改${escapeHtml(team.name)}的名称" title="修改小组名称"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 17 1 4 4-1L19 9l-4-4L4 16Z"/><path d="m13 7 4 4"/></svg></button></div></div><span class="today-chip ${today < 0 ? 'is-negative' : today === 0 ? 'is-zero' : ''}">今日 ${signed(today)}</span></div>
      <div class="team-score"><strong>${total}</strong><span>累计分</span></div>
      ${renderTeamActions(team)}
    </article>`;
  }).join('');
  $('#side-ranking-list').innerHTML = ranked.map((team) => `<div class="ranking-row"><span class="rank-num">${String(team.rank).padStart(2, '0')}</span><span class="rank-name" title="${escapeHtml(team.name)}">${escapeHtml(team.name)}</span><span class="rank-score">${team.total}</span></div>`).join('');
  $('#undo-button').disabled = state.events.length === 0;
}

function renderRanking(ranked) {
  $('#full-ranking-list').innerHTML = ranked.map((team) => `<div class="full-ranking-row"><span class="full-rank-number">${team.rank}</span><span class="full-rank-team">${escapeHtml(team.name)}${ranked.filter((item) => item.rank === team.rank).length > 1 ? '<small>并列</small>' : ''}</span><span class="full-rank-today">${signed(team.today)}</span><strong class="full-rank-total">${team.total}</strong></div>`).join('');
}

function renderHistory() {
  const day = $('#history-date').value || todayKey();
  const events = state.events.filter((event) => event.day === day).slice().reverse();
  const net = events.reduce((sum, event) => sum + event.delta, 0);
  $('#history-summary').innerHTML = `<span>这一天共记了 <strong>${events.length}</strong> 笔</span><span>合计 <strong>${signed(net)}</strong> 分</span>`;
  $('#history-list').innerHTML = events.length ? events.map((event) => `<div class="history-row"><span class="history-time">${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(event.at))}</span><span class="history-team">${escapeHtml(eventLabel(event))}</span><span class="history-points ${event.delta > 0 ? 'positive' : 'negative'}">${signed(event.delta)}</span><span class="history-actions"><button type="button" data-edit="${escapeHtml(event.id)}" aria-label="修改${escapeHtml(eventLabel(event))}的${signed(event.delta)}分记录">修改</button><button type="button" class="delete" data-delete="${escapeHtml(event.id)}" aria-label="删除${escapeHtml(eventLabel(event))}的${signed(event.delta)}分记录">删除</button></span></div>`).join('') : '<div class="empty-state"><span class="empty-symbol">✳</span>这一天还没有记分记录</div>';
}

function render() {
  renderDate();
  document.querySelectorAll('[data-mode]').forEach((button) => {
    const selected = button.dataset.mode === state.mode;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const totals = allTotals();
  const ranked = rankedTeams(totals);
  renderScore(totals, ranked);
  renderRanking(ranked);
  renderHistory();
}

function openDialog(id) { document.getElementById(id).showModal(); }
function closeDialog(id) { document.getElementById(id).close(); }

function switchTab(tab) {
  if (!['score', 'ranking', 'history'].includes(tab)) return;
  activeTab = tab;
  document.querySelectorAll('.tab').forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('is-active', active);
    active ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current');
  });
  document.querySelectorAll('.page').forEach((page) => { page.hidden = page.id !== `${tab}-page`; });
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.tab) switchTab(target.dataset.tab);
  if (target.dataset.go) switchTab(target.dataset.go);
  if (target.dataset.mode && target.dataset.mode !== state.mode) commit((next) => { next.mode = target.dataset.mode; });
  if (target.dataset.score) addPoints(Number(target.dataset.score), Number(target.dataset.delta));
  if (target.dataset.student) addPoints(Number(target.dataset.studentTeam), 1, target.dataset.student);
  if (target.dataset.roster) {
    currentTeamId = Number(target.dataset.roster);
    $('#roster-dialog-hint').textContent = `${teamName(currentTeamId)} · 每行填写一位同学`;
    $('#roster-input').value = state.students.filter((student) => student.teamId === currentTeamId).map((student) => student.name).join('\n');
    openDialog('roster-dialog');
  }
  if (target.dataset.rename) {
    currentTeamId = Number(target.dataset.rename);
    $('#team-name-input').value = teamName(currentTeamId);
    openDialog('name-dialog');
    $('#team-name-input').select();
  }
  if (target.dataset.custom) {
    currentTeamId = Number(target.dataset.custom);
    pointsSign = target.dataset.customSign === 'minus' ? -1 : 1;
    const action = pointsSign === 1 ? '加多分' : '减多分';
    $('#points-dialog-title').textContent = action;
    $('#points-dialog-icon').textContent = pointsSign === 1 ? '＋' : '－';
    $('#points-dialog-hint').textContent = `${teamName(currentTeamId)} · ${action}`;
    $('#points-input').value = 7;
    openDialog('points-dialog');
  }
  if (target.dataset.close) closeDialog(target.dataset.close);
  if (target.dataset.editSign) { editSign = target.dataset.editSign === 'plus' ? 1 : -1; updateEditSignButtons(); }
  if (target.dataset.edit) {
    currentEventId = target.dataset.edit;
    const item = state.events.find((record) => record.id === currentEventId);
    if (!item) return;
    editSign = Math.sign(item.delta);
    $('#edit-dialog-hint').textContent = `${eventLabel(item)} · ${item.day}`;
    $('#edit-points-input').value = Math.abs(item.delta);
    updateEditSignButtons();
    openDialog('edit-dialog');
  }
  if (target.dataset.delete) {
    const item = state.events.find((record) => record.id === target.dataset.delete);
    if (item && confirm(`删除${eventLabel(item)} ${signed(item.delta)} 分的记录？`)) {
      if (commit((next) => { next.events = next.events.filter((record) => record.id !== item.id); })) showToast('这笔记录已删除');
    }
  }
});

function updateEditSignButtons() {
  document.querySelectorAll('[data-edit-sign]').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.editSign === (editSign === 1 ? 'plus' : 'minus'));
  });
}

$('#name-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('#team-name-input').value.trim();
  if (!name || name.length > 20) return;
  if (commit((next) => { next.teams[currentTeamId - 1].name = name; })) { closeDialog('name-dialog'); showToast('小组名称已更新'); }
});

$('#roster-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const names = $('#roster-input').value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  if (names.length > 50 || names.some((name) => name.length > 20)) {
    showToast('每组最多 50 人，每个姓名不超过 20 个字');
    return;
  }
  const previous = state.students.filter((student) => student.teamId === currentTeamId);
  const used = new Set();
  const members = names.map((name) => {
    const retained = previous.find((student) => student.name === name && !used.has(student.id));
    if (retained) used.add(retained.id);
    return retained || { id: newId(), teamId: currentTeamId, name };
  });
  if (state.students.length - previous.length + members.length > 400) {
    showToast('全部小组的名单最多 400 人');
    return;
  }
  if (commit((next) => { next.students = next.students.filter((student) => student.teamId !== currentTeamId).concat(members); })) {
    closeDialog('roster-dialog');
    showToast(`${teamName(currentTeamId)}的名单已保存`);
  }
});

$('#points-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const value = Number($('#points-input').value);
  if (!Number.isInteger(value) || value < 1 || value > 999) return;
  closeDialog('points-dialog');
  addPoints(currentTeamId, pointsSign * value);
});

$('#edit-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const value = Number($('#edit-points-input').value);
  if (!Number.isInteger(value) || value < 1 || value > 999) return;
  if (commit((next) => {
    const item = next.events.find((record) => record.id === currentEventId);
    if (item) item.delta = editSign * value;
  })) { closeDialog('edit-dialog'); showToast('分数已修改'); }
});

$('#undo-button').addEventListener('click', () => {
  if (!state.events.length) return;
  const item = state.events.at(-1);
  if (commit((next) => { next.events.pop(); })) showToast(`已撤销${eventLabel(item)} ${signed(item.delta)} 分`);
});

$('#history-date').addEventListener('change', renderHistory);

$('#data-button').addEventListener('click', () => openDialog('data-dialog'));
$('#export-button').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `八组计分板备份-${todayKey()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('备份文件已下载');
});
$('#import-button').addEventListener('click', () => $('#import-input').click());
$('#import-input').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!validState(parsed)) throw new Error('invalid');
    if (!confirm('导入备份会替换当前所有小组名称和分数。确定继续吗？')) return;
    if (commit((next) => { Object.assign(next, normalizeState(parsed)); })) { closeDialog('data-dialog'); showToast('备份已恢复'); }
  } catch { showToast('备份文件格式不正确，未导入'); }
});

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    const parsed = JSON.parse(event.newValue);
    if (validState(parsed)) { state = normalizeState(parsed); render(); showToast('数据已从另一个标签页更新'); }
  } catch { /* Keep current data. */ }
});

$('#history-date').value = todayKey();
render();
setInterval(() => {
  const day = todayKey();
  if (day !== lastDay) {
    if ($('#history-date').value === lastDay) $('#history-date').value = day;
    lastDay = day;
    render();
  }
}, 60000);
