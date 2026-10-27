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

if (typeof module !== 'undefined') module.exports = { REGIONS, RULES, buildWeatherUrl, parseWeather, judge };
