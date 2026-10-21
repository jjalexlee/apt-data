// 3단계: raw/ 원본 → 앱이 읽을 data/ 파일로 정리
// 결과: data/11680.json (구별 단지 목록), data/summary.json (홈 화면용 요약)
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const GU = {
  '11110': '종로구', '11140': '중구', '11170': '용산구', '11200': '성동구', '11215': '광진구',
  '11230': '동대문구', '11260': '중랑구', '11290': '성북구', '11305': '강북구', '11320': '도봉구',
  '11350': '노원구', '11380': '은평구', '11410': '서대문구', '11440': '마포구', '11470': '양천구',
  '11500': '강서구', '11530': '구로구', '11545': '금천구', '11560': '영등포구', '11590': '동작구',
  '11620': '관악구', '11650': '서초구', '11680': '강남구', '11710': '송파구', '11740': '강동구',
};

const num = (v) => Number(String(v ?? '').replace(/,/g, '').trim()) || 0;
const str = (v) => String(v ?? '').trim();
const pad = (v) => String(num(v)).padStart(2, '0');
const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);

function loadRaw(kind) {
  const dir = `raw/${kind}`;
  if (!existsSync(dir)) return [];
  const rows = [];
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.json')) rows.push(...JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
  }
  return rows;
}

// 단지 묶음 기준: 구코드 + 동 + 지번
const keyOf = (r) => `${str(r.sggCd).padStart(5, '0')}|${str(r.umdNm)}|${str(r.jibun)}`;
const dateOf = (r) => `${str(r.dealYear)}-${pad(r.dealMonth)}-${pad(r.dealDay)}`;

const complexes = new Map(); // key → 단지 정보

// "(50-5)"처럼 숫자·기호로만 된 이름은 쓰지 않음
const goodName = (v) => /[가-힣A-Za-z]/.test(str(v));

function getComplex(r) {
  const k = keyOf(r);
  if (!complexes.has(k)) {
    complexes.set(k, {
      id: k.replace(/\|/g, '-'),
      sggCd: str(r.sggCd).padStart(5, '0'),
      name: goodName(r.aptNm) ? str(r.aptNm) : '',
      dong: str(r.umdNm),
      jibun: str(r.jibun),
      buildYear: num(r.buildYear) || null,
      areas: new Map(),
    });
  }
  return complexes.get(k);
}

function getArea(c, r) {
  const a = Math.round(num(r.excluUseAr)); // 84.97 → 85
  if (!c.areas.has(a)) c.areas.set(a, { area: a, trades: [], rents: [] });
  return c.areas.get(a);
}

// 매매: 해제된 거래(cdealType = 'O') 제외
let removed = 0;
const trades = loadRaw('trade').filter((r) => {
  if (str(r.cdealType) === 'O') { removed++; return false; }
  return true;
});

// 일괄매각 제외: 같은 단지·같은 날 거래가 10건 이상이면 건물 통매각으로 보고 통계에서 뺌
const BULK_MIN = 10;
const sameDay = {};
for (const r of trades) { const k = `${keyOf(r)}|${dateOf(r)}`; sameDay[k] = (sameDay[k] || 0) + 1; }
let bulk = 0;
const bulkList = new Set();

for (const r of trades) {
  if (sameDay[`${keyOf(r)}|${dateOf(r)}`] >= BULK_MIN) {
    bulk++; bulkList.add(`${str(r.aptNm)}(${dateOf(r)})`);
    getComplex(r).bulkDeals = (getComplex(r).bulkDeals || 0) + 1;
    continue;
  }
  const c = getComplex(r);
  if (goodName(r.aptNm)) c.name = str(r.aptNm); // 매매 쪽 이름 우선
  getArea(c, r).trades.push({ d: dateOf(r), f: num(r.floor), p: num(r.dealAmount) });
}

// 전월세
for (const r of loadRaw('rent')) {
  const c = getComplex(r);
  if (!c.name && goodName(r.aptNm)) c.name = str(r.aptNm);
  getArea(c, r).rents.push({ d: dateOf(r), f: num(r.floor), dep: num(r.deposit), m: num(r.monthlyRent) });
}

// 면적별 통계 계산
const byGu = {};
const allTrades = [];
for (const c of complexes.values()) {
  if (!c.name) c.name = `${c.dong} ${c.jibun}`; // 이름이 끝내 없으면 "휘경동 50-5"
  const areas = [...c.areas.values()].sort((a, b) => a.area - b.area).map((a) => {
    a.trades.sort((x, y) => y.d.localeCompare(x.d));
    a.rents.sort((x, y) => y.d.localeCompare(x.d));
    const jeonse = a.rents.filter((x) => x.m === 0).map((x) => x.dep);
    const avgTrade = avg(a.trades.map((x) => x.p));
    const avgJeonse = avg(jeonse);
    return {
      area: a.area,
      pyeong: Math.round(a.area / 3.3058), // 전용면적 기준 평
      avgTrade,                              // 만원
      avgJeonse,                             // 만원
      jeonseRatio: avgTrade && avgJeonse ? Math.round((avgJeonse / avgTrade) * 100) : null, // %
      maxTrade: a.trades.length ? Math.max(...a.trades.map((x) => x.p)) : null,
      trades: a.trades,
      rents: a.rents,
    };
  });

  const tradeCount = areas.reduce((s, a) => s + a.trades.length, 0);
  const rentCount = areas.reduce((s, a) => s + a.rents.length, 0);
  const lastDeal = areas.flatMap((a) => a.trades.map((t) => t.d)).sort().pop() || null;

  const out = { id: c.id, name: c.name, dong: c.dong, jibun: c.jibun, buildYear: c.buildYear,
                tradeCount, rentCount, lastDeal, bulkDeals: c.bulkDeals || 0, areas };
  (byGu[c.sggCd] ??= []).push(out);

  for (const a of areas) for (const t of a.trades) {
    allTrades.push({ gu: GU[c.sggCd] || c.sggCd, sggCd: c.sggCd, id: c.id, name: c.name,
                     dong: c.dong, area: a.area, ...t });
  }
}

// 구별 파일 저장
mkdirSync('data', { recursive: true });
const updatedAt = new Date().toISOString().slice(0, 10);
const summaryGu = [];

for (const [sggCd, list] of Object.entries(byGu)) {
  list.sort((a, b) => b.tradeCount - a.tradeCount || b.rentCount - a.rentCount);
  writeFileSync(`data/${sggCd}.json`,
    JSON.stringify({ sggCd, gu: GU[sggCd] || sggCd, updatedAt, complexes: list }), 'utf8');

  summaryGu.push({
    sggCd, gu: GU[sggCd] || sggCd,
    complexCount: list.length,
    tradeCount: list.reduce((s, c) => s + c.tradeCount, 0),
    rentCount: list.reduce((s, c) => s + c.rentCount, 0),
    topByVolume: list.slice(0, 5).map((c) => ({ id: c.id, name: c.name, dong: c.dong, tradeCount: c.tradeCount })),
  });
}

// 홈 화면용 요약
allTrades.sort((a, b) => b.d.localeCompare(a.d));
const summary = {
  updatedAt,
  gus: summaryGu.sort((a, b) => a.sggCd.localeCompare(b.sggCd)),
  latestTrades: allTrades.slice(0, 30),
};
writeFileSync('data/summary.json', JSON.stringify(summary), 'utf8');

console.log(`✅ 단지 ${complexes.size}개 정리, 매매 ${allTrades.length}건 (해제 거래 ${removed}건 제외)`);
if (bulk) console.log(`   일괄매각 ${bulk}건 통계 제외: ${[...bulkList].join(', ')}`);
console.log(`   구별 파일 ${Object.keys(byGu).length}개 + summary.json → data/ 폴더`);
