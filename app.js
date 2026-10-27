// app.js – 화면 동작 (목록 그리기, 일정 추가)

let baseTasks = [];   // data/tasks.json에서 읽은 기본 일정
let addedTasks = [];  // 화면에서 추가해 브라우저에 저장한 일정
let tasksLoading = true;
let tasks = [];
let weatherByRegion = {};
const windTest = new URLSearchParams(window.location.search).get('test') === 'wind';

async function loadWeather() {
  const weatherBox = document.getElementById('weatherBox');
  const testNotice = windTest ? ' · 강풍 시험: 수신한 날씨의 풍속을 12m/s로 적용' : '';
  weatherBox.textContent = '오늘 날씨를 불러오는 중…' + testNotice;
  const failedRegions = [];
  await Promise.all(Object.keys(REGIONS).map(async region => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(buildWeatherUrl(region), { signal: controller.signal });
      if (!response.ok) throw new Error('날씨 요청 실패: ' + response.status);
      const weather = parseWeather(await response.json());
      if (windTest) weather.windMax = 12;
      weatherByRegion[region] = weather;
    } catch (error) {
      failedRegions.push(region);
    } finally {
      clearTimeout(timeout);
      renderTasks();
    }
  }));
  weatherBox.textContent = (failedRegions.length
    ? '날씨를 받지 못한 지역: ' + failedRegions.join(' · ') + '. 인터넷 연결을 확인하고 새로고침해 주세요.'
    : '4개 지역의 오늘 날씨를 불러왔습니다. (한국 시간 기준)') + testNotice;
}

function isTaskList(value) {
  return Array.isArray(value) && value.every(task => task &&
    ['title', 'region', 'kind', 'owner'].every(field => typeof task[field] === 'string') &&
    Object.hasOwn(REGIONS, task.region) && ['야외', '고소', '실내'].includes(task.kind));
}

async function loadTasks() {
  const msgBox = document.getElementById('msgBox');
  const submitButton = document.querySelector('#taskForm button');
  const notices = [];
  tasksLoading = true;
  submitButton.disabled = true;
  msgBox.textContent = '일정 목록을 불러오는 중…';
  try {
    const response = await fetch('data/tasks.json');
    if (!response.ok) throw new Error('일정 파일 요청 실패');
    const data = await response.json();
    if (!isTaskList(data)) throw new Error('일정 파일 형식 오류');
    baseTasks = data;
  } catch (error) {
    baseTasks = [];
    notices.push(window.location.protocol === 'file:'
      ? '배포 주소로 열어 주세요'
      : '기본 일정 파일을 읽지 못했습니다. 연결과 data/tasks.json 파일을 확인하고 새로고침해 주세요.');
  }
  // JSON 요청을 마친 뒤 브라우저의 추가 일정만 읽어 뒤에 붙임
  try {
    const saved = JSON.parse(localStorage.getItem('wx_added') || '[]');
    if (!isTaskList(saved)) throw new Error('저장된 일정 형식 오류');
    addedTasks = saved;
  } catch (error) {
    addedTasks = [];
    notices.push('브라우저에 저장된 추가 일정을 읽지 못했습니다.');
  }
  tasks = baseTasks.concat(addedTasks);
  renderTasks();
  tasksLoading = false;
  submitButton.disabled = false;
  msgBox.textContent = notices.join(' ');
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

function addTask(e) {
  e.preventDefault();
  if (tasksLoading) return;
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner) return;
  const saved = addedTasks.concat(t);
  try {
    localStorage.setItem('wx_added', JSON.stringify(saved));
  } catch (error) {
    document.getElementById('msgBox').textContent = '추가 일정을 브라우저에 저장하지 못했습니다.';
    return;
  }
  addedTasks = saved;
  tasks = baseTasks.concat(addedTasks);
  e.target.reset();
  renderTasks();
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
loadTasks();
renderTasks();
loadWeather();
