// 1단계: 강남구(11680) 한 달치 매매·전월세 데이터를 받아 JSON으로 저장
import { XMLParser } from 'fast-xml-parser';
import { writeFileSync } from 'fs';

const KEY = process.env.DATA_GO_KR_KEY;
if (!KEY) {
  console.error('❌ 인증키가 없습니다. 먼저 $env:DATA_GO_KR_KEY="인증키" 를 실행하세요.');
  process.exit(1);
}

const LAWD_CD = '11680';   // 강남구
const DEAL_YMD = '202609'; // 2026년 9월

const APIS = {
  trade: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade',
  rent:  'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
};

const parser = new XMLParser();

async function fetchAll(name, url) {
  const items = [];
  let page = 1;
  while (true) {
    const q = `?serviceKey=${encodeURIComponent(KEY)}&LAWD_CD=${LAWD_CD}&DEAL_YMD=${DEAL_YMD}&numOfRows=1000&pageNo=${page}`;
    const res = await fetch(url + q);
    const text = await res.text();
    const data = parser.parse(text);

    const header = data?.response?.header;
    if (!header || Number(header.resultCode) !== 0) {
      console.error(`❌ [${name}] 오류 응답:\n`, text.slice(0, 500));
      return null;
    }

    const body = data.response.body;
    let list = body?.items?.item ?? [];
    if (!Array.isArray(list)) list = [list]; // 1건이면 배열이 아님
    items.push(...list);

    const total = Number(body.totalCount || 0);
    console.log(`[${name}] ${page}페이지: ${list.length}건 (총 ${total}건)`);
    if (items.length >= total || list.length === 0) break;
    page++;
  }
  return items;
}

for (const [name, url] of Object.entries(APIS)) {
  const items = await fetchAll(name, url);
  if (!items) continue;
  writeFileSync(`${name}-${LAWD_CD}-${DEAL_YMD}.json`, JSON.stringify(items, null, 2), 'utf8');
  console.log(`✅ [${name}] ${items.length}건 저장 → ${name}-${LAWD_CD}-${DEAL_YMD}.json`);
  if (items[0]) console.log(`   필드 목록: ${Object.keys(items[0]).join(', ')}\n`);
}
