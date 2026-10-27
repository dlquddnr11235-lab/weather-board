// logic.js – 판단 규칙 · API 주소 생성 · 응답 해석 (화면을 다루는 코드 금지)

// 지역 중심부의 대표 좌표 (개별 현장 위치가 아님)
const REGIONS = {
  '세종': { latitude: 36.4800, longitude: 127.2890 },
  '대전': { latitude: 36.3504, longitude: 127.3845 },
  '태안': { latitude: 36.7456, longitude: 126.2980 },
  '보령': { latitude: 36.3335, longitude: 126.6120 },
};

function buildWeatherUrl(region) {
  const location = REGIONS[region];
  if (!location) throw new Error('지원하지 않는 지역');
  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    daily: 'temperature_2m_max,wind_speed_10m_max,precipitation_probability_max',
    current: 'temperature_2m,wind_speed_10m',
    timezone: 'Asia/Seoul',
    forecast_days: '1',
    temperature_unit: 'celsius',
    wind_speed_unit: 'ms',
  });
  return 'https://api.open-meteo.com/v1/forecast?' + params.toString();
}

function parseWeather(data) {
  const daily = data && data.daily;
  const fields = ['temperature_2m_max', 'wind_speed_10m_max', 'precipitation_probability_max'];
  if (!daily || !Array.isArray(daily.time) || !daily.time[0] ||
      fields.some(field => !Array.isArray(daily[field]) || !Number.isFinite(daily[field][0]))) {
    throw new Error('날씨 응답에 필요한 값이 없음');
  }
  const weather = {
    tempMax: daily.temperature_2m_max[0],
    windMax: daily.wind_speed_10m_max[0],
    rainProb: daily.precipitation_probability_max[0],
  };
  if (weather.windMax < 0 || weather.rainProb < 0 || weather.rainProb > 100) {
    throw new Error('날씨 응답 값의 범위가 올바르지 않음');
  }
  return weather;
}

function parseCurrentWeather(data) {
  const current = data && data.current;
  if (!current || !Number.isFinite(current.temperature_2m) ||
      !Number.isFinite(current.wind_speed_10m) || current.wind_speed_10m < 0 ||
      typeof current.time !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(current.time)) {
    throw new Error('현재 날씨 응답에 필요한 값이 없음');
  }
  return { temperature: current.temperature_2m, wind: current.wind_speed_10m, time: current.time };
}

// 교육용 가상 기준 (실제 작업 중지 · 행사 취소 기준은 각 기관 규정을 따름)
const RULES = { wind: 10, rain: 60, heat: 33 };

// 일정 구분과 날씨로 판단 (w가 없으면 '날씨 확인 전')
function judge(kind, w) {
  if (kind === '실내') return { level: 'ok', text: '영향 없음' };
  if (!w) return { level: 'none', text: '날씨 확인 전' };
  if (kind === '고소' && w.windMax >= RULES.wind) return { level: 'stop', text: '중지 검토 (강풍)' };
  if (w.tempMax >= RULES.heat) return { level: 'warn', text: '폭염 휴식' };
  if (w.rainProb >= RULES.rain) return { level: 'warn', text: '우천 주의' };
  return { level: 'ok', text: '진행' };
}

// 화면에서 전달받은 행 데이터로 마크다운 생성 (DOM을 다루지 않음)
function buildJudgmentMarkdown(rows, date) {
  function escapeCell(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\\/g, '\\\\')
      .replace(/\|/g, '\\|')
      .replace(/([`*_[\]])/g, '\\$1')
      .replace(/\r\n|\r|\n/g, '<br>');
  }
  const lines = [
    '# 현장 일정 판단 ' + date,
    '',
    '| 일정 | 지역 | 구분 | 담당 | 날씨 | 판단 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => '| ' + row.map(escapeCell).join(' | ') + ' |'),
    '',
    '판단 기준(교육용 가상): 실내는 영향 없음; 고소 최대 풍속 ' + RULES.wind +
      'm/s 이상 → 중지 검토; 최고 기온 ' + RULES.heat + '℃ 이상 → 폭염 휴식; 강수확률 ' +
      RULES.rain + '% 이상 → 우천 주의 (강풍 → 폭염 → 우천 순); 해당 없으면 진행, 날씨 미수신은 날씨 확인 전.',
  ];
  return lines.join('\n') + '\n';
}

if (typeof module !== 'undefined') module.exports = { REGIONS, RULES, buildWeatherUrl, parseWeather, parseCurrentWeather, judge, buildJudgmentMarkdown };
