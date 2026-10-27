// app.js – 화면 동작 (목록 그리기, 일정 추가)

let tasksLoading = true;
let tasksReady = false;
let taskSaving = false;
let taskClient = null;
let tasks = [];
let weatherByRegion = {};
const currentWeatherByRegion = {};
const weatherFailures = new Set();
let weatherLoading = false;
const WEATHER_REFRESH_MS = 60 * 60 * 1000;
const windTest = new URLSearchParams(window.location.search).get('test') === 'wind';

function renderCurrentWeather() {
  const list = document.getElementById('currentWeatherList');
  list.replaceChildren();
  for (const region of Object.keys(REGIONS)) {
    const current = currentWeatherByRegion[region];
    const item = document.createElement('li');
    item.textContent = current
      ? region + ': ' + current.temperature + '℃ · ' + current.wind + 'm/s' +
        ' · 기준 ' + current.time.replace('T', ' ') + ' · 수신 ' + current.receivedAt +
        (weatherFailures.has(region) ? ' · 갱신 실패 (이전 값)' : '')
      : region + ': ' + (weatherFailures.has(region) ? '날씨 수신 실패' : '불러오는 중…');
    list.appendChild(item);
  }
}

async function loadWeather() {
  if (weatherLoading) return;
  weatherLoading = true;
  const weatherBox = document.getElementById('weatherBox');
  const testNotice = windTest ? ' · 강풍 시험: 수신한 날씨의 풍속을 12m/s로 적용' : '';
  weatherBox.textContent = '현재 날씨와 오늘 예보를 갱신하는 중…' + testNotice;
  renderCurrentWeather();
  const failedRegions = [];
  await Promise.all(Object.keys(REGIONS).map(async region => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(buildWeatherUrl(region), { signal: controller.signal });
      if (!response.ok) throw new Error('날씨 요청 실패: ' + response.status);
      const data = await response.json();
      const weather = parseWeather(data);
      const current = parseCurrentWeather(data);
      if (windTest) weather.windMax = 12;
      weatherByRegion[region] = weather;
      currentWeatherByRegion[region] = {
        ...current,
        receivedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }),
      };
      weatherFailures.delete(region);
    } catch (error) {
      failedRegions.push(region);
      weatherFailures.add(region);
      delete weatherByRegion[region];
    } finally {
      clearTimeout(timeout);
      renderTasks();
      renderCurrentWeather();
    }
  }));
  weatherBox.textContent = (failedRegions.length
    ? '날씨를 받지 못한 지역: ' + failedRegions.join(' · ') + '. 1시간마다 다시 시도합니다.'
    : '4개 지역의 현재 날씨와 오늘 예보를 불러왔습니다. 1시간마다 갱신합니다.') + testNotice;
  weatherLoading = false;
}

function isTaskList(value) {
  return Array.isArray(value) && value.every(task => task &&
    ['title', 'region', 'kind', 'owner'].every(field => typeof task[field] === 'string') &&
    Object.hasOwn(REGIONS, task.region) && ['야외', '고소', '실내'].includes(task.kind));
}

async function loadTasks() {
  const msgBox = document.getElementById('msgBox');
  const submitButton = document.querySelector('#taskForm button');
  tasksLoading = true;
  tasksReady = false;
  submitButton.disabled = true;
  document.getElementById('saveMarkdownButton').disabled = true;
  msgBox.textContent = '일정 목록을 불러오는 중…';
  try {
    if (!taskClient) taskClient = createTaskClient();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let result;
    try {
      result = await taskClient.from('wx_tasks').select('id,title,region,kind,owner')
        .order('id', { ascending: true }).abortSignal(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
    const { data, error } = result;
    if (error) throw new Error('일정을 읽지 못했습니다. 연결 정보와 setup.sql 실행 여부를 확인하고 새로고침해 주세요.');
    if (!isTaskList(data)) throw new Error('DB 일정 응답 형식이 올바르지 않습니다.');
    tasks = data;
    tasksReady = true;
    msgBox.textContent = '공유 일정 ' + tasks.length + '건을 불러왔습니다.';
  } catch (error) {
    msgBox.textContent = error.message || '일정을 읽지 못했습니다. 연결을 확인하고 새로고침해 주세요.';
  } finally {
    renderTasks();
    tasksLoading = false;
    submitButton.disabled = !tasksReady;
    document.getElementById('saveMarkdownButton').disabled = !tasksReady && tasks.length === 0;
  }
}

function createTaskClient() {
  if (typeof SUPABASE_URL !== 'string' || !SUPABASE_URL ||
      typeof SUPABASE_PUBLIC_KEY !== 'string' || !SUPABASE_PUBLIC_KEY) {
    throw new Error('config.js에 Supabase 주소와 공개용 키를 입력해 주세요.');
  }
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(SUPABASE_PUBLIC_KEY);
  if (!publicKey) {
    try {
      const payload = SUPABASE_PUBLIC_KEY.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      publicKey = JSON.parse(atob(payload)).role === 'anon';
    } catch (error) {
      publicKey = false;
    }
  }
  if (!publicKey) throw new Error('공개용 publishable 또는 anon 키만 사용해 주세요. 비밀 키는 사용할 수 없습니다.');
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new Error('supabase-js를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.');
  }
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function weatherText(w) {
  return w ? w.tempMax + '℃ · ' + w.windMax + 'm/s · ' + w.rainProb + '%' : '-';
}

function renderTasks() {
  const body = document.getElementById('taskList');
  body.innerHTML = '';
  for (const t of tasks) {
    const w = weatherByRegion[t.region];
    const r = judge(t.kind, w);
    const tr = document.createElement('tr');
    for (const v of [t.title, t.region, t.kind, t.owner, weatherText(w)]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    const td = document.createElement('td');
    td.textContent = r.text;
    td.className = r.level;
    tr.appendChild(td);
    body.appendChild(tr);
  }
}

async function addTask(e) {
  e.preventDefault();
  if (tasksLoading || taskSaving || !tasksReady) return;
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner) return;
  if (!isTaskList([t])) return;
  const msgBox = document.getElementById('msgBox');
  const submitButton = document.querySelector('#taskForm button');
  taskSaving = true;
  submitButton.disabled = true;
  msgBox.textContent = '공유 일정을 저장하는 중…';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const { data, error } = await taskClient.from('wx_tasks').insert(t)
      .select('id,title,region,kind,owner').single().abortSignal(controller.signal);
    if (error || !data || !isTaskList([data])) throw new Error('일정 저장 실패');
    tasks.push(data);
    e.target.reset();
    renderTasks();
    msgBox.textContent = '공유 일정에 저장했습니다. 다른 브라우저에서는 새로고침해 확인하세요.';
  } catch (error) {
    msgBox.textContent = '저장 결과를 확인하지 못했습니다. 입력은 유지됩니다. 다시 추가하기 전에 새로고침해 중복 여부를 확인하세요.';
  } finally {
    clearTimeout(timeout);
    taskSaving = false;
    submitButton.disabled = !tasksReady;
  }
}

function saveJudgmentMarkdown() {
  const rows = Array.from(document.querySelectorAll('#taskList tr'), row =>
    Array.from(row.cells, cell => cell.textContent));
  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const markdown = buildJudgmentMarkdown(rows, date);
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = '현장일정_판단_' + date + '.md';
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = new Date();
const todayText = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, '0'),
  String(today.getDate()).padStart(2, '0'),
].join('-');
const todayDate = document.getElementById('todayDate');
todayDate.textContent = todayText;
todayDate.dateTime = todayText;

document.getElementById('taskForm').addEventListener('submit', addTask);
document.getElementById('saveMarkdownButton').addEventListener('click', saveJudgmentMarkdown);
loadTasks();
renderTasks();
loadWeather();
setInterval(loadWeather, WEATHER_REFRESH_MS);
