// 2단계: 서울 25개 구 × 최근 3개월 매매·전월세 원본 수집
// 결과: raw/trade/11680-202609.json, raw/rent/11680-202609.json ...
import { XMLParser } from 'fast-xml-parser';
import { writeFileSync, mkdirSync } from 'fs';

const KEY = process.env.DATA_GO_KR_KEY;
if (!KEY) {
  console.error('❌ 인증키가 없습니다. 먼저 $env:DATA_GO_KR_KEY="인증키" 를 실행하세요.');
  process.exit(1);
}

const SEOUL = {
  '11110': '종로구', '11140': '중구', '11170': '용산구', '11200': '성동구', '11215': '광진구',
  '11230': '동대문구', '11260': '중랑구', '11290': '성북구', '11305': '강북구', '11320': '도봉구',
  '11350': '노원구', '11380': '은평구', '11410': '서대문구', '11440': '마포구', '11470': '양천구',
  '11500': '강서구', '11530': '구로구', '11545': '금천구', '11560': '영등포구', '11590': '동작구',
  '11620': '관악구', '11650': '서초구', '11680': '강남구', '11710': '송파구', '11740': '강동구',
};

const APIS = {
  trade: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade',
  rent:  'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
};

// 최근 3개월 (이번 달 포함) → 예: ['202608', '202609', '202610']
function recentMonths(n = 3) {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// parseTagValue:false → 모든 값을 글자로 받아 앞자리 0이 사라지지 않음
const parser = new XMLParser({ parseTagValue: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchAll(url, lawd, ym) {
  const items = [];
  let page = 1;
  while (true) {
    const q = `?serviceKey=${encodeURIComponent(KEY)}&LAWD_CD=${lawd}&DEAL_YMD=${ym}&numOfRows=1000&pageNo=${page}`;
    const text = await (await fetch(url + q)).text();
    const data = parser.parse(text);
    const header = data?.response?.header;
    if (!header || Number(header.resultCode) !== 0) {
      throw new Error(text.slice(0, 300));
    }
    const body = data.response.body;
    let list = body?.items?.item ?? [];
    if (!Array.isArray(list)) list = [list];
    items.push(...list);
    const total = Number(body.totalCount || 0);
    if (items.length >= total || list.length === 0) break;
    page++;
    await sleep(200);
  }
  return items;
}

const months = recentMonths(3);
console.log(`수집 기간: ${months.join(', ')}\n`);

let calls = 0, failed = [];
for (const name of Object.keys(APIS)) mkdirSync(`raw/${name}`, { recursive: true });

for (const [lawd, guName] of Object.entries(SEOUL)) {
  const line = [];
  for (const ym of months) {
    for (const [name, url] of Object.entries(APIS)) {
      try {
        const items = await fetchAll(url, lawd, ym);
        writeFileSync(`raw/${name}/${lawd}-${ym}.json`, JSON.stringify(items), 'utf8');
        line.push(`${name === 'trade' ? '매매' : '전월세'} ${ym.slice(4)}월 ${items.length}`);
      } catch (e) {
        failed.push(`${guName} ${name} ${ym}`);
        line.push(`${name} ${ym} ❌`);
        console.error(`   오류 (${guName} ${name} ${ym}): ${e.message}`);
      }
      calls++;
      await sleep(200);
    }
  }
  console.log(`✅ ${guName.padEnd(5)} | ${line.join(' · ')}`);
}

console.log(`\n완료: API 호출 ${calls}회, 실패 ${failed.length}건`);
if (failed.length) console.log('실패 목록:', failed.join(', '));
