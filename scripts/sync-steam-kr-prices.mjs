import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const PAGE_SIZE = 100;
const CONCURRENCY = 3;
const searches = [
    { sort: "Reviews_DESC", pages: 80 },
    { sort: "Released_DESC", pages: 120 },
];

async function fetchPage(sort, page) {
    const params = new URLSearchParams({
        query: "",
        start: String(page * PAGE_SIZE),
        count: String(PAGE_SIZE),
        dynamic_data: "",
        sort_by: sort,
        infinite: "1",
        cc: "KR",
        l: "koreana",
    });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
            const response = await fetch(
                `https://store.steampowered.com/search/results/?${params}`,
                { signal: AbortSignal.timeout(20_000) },
            );
            if (response.ok) return (await response.json()).results_html ?? "";
            if (response.status !== 429 && response.status < 500) return "";
        } catch {
            // 재시도에서 처리한다.
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
    }

    return "";
}

function extractPrices(html, wantedAppIds, prices) {
    const rowPattern = /<a\b[^>]*data-ds-appid="(\d+)"[\s\S]*?<\/a>/g;
    let match;

    while ((match = rowPattern.exec(html)) !== null) {
        const appid = Number(match[1]);
        if (!wantedAppIds.has(appid) || prices.has(appid)) continue;

        const row = match[0];
        if (/discount_final_price free/.test(row)) {
            prices.set(appid, 0);
            continue;
        }

        const priceMatch = row.match(
            /search_price_discount_combined[^>]*data-price-final="(\d+)"/,
        );
        if (priceMatch) prices.set(appid, Number(priceMatch[1]) / 100);
    }
}

const database = new DatabaseSync(path.join(process.cwd(), "database.db"));
const columns = database.prepare("PRAGMA table_info(games)").all();
if (!columns.some((column) => column.name === "price_verified")) {
    database.exec(`
        ALTER TABLE games ADD COLUMN price_verified INTEGER NOT NULL DEFAULT 0
        CHECK (price_verified IN (0, 1))
    `);
}

const wantedAppIds = new Set(
    database.prepare(
        "SELECT steam_appid FROM games WHERE steam_appid IS NOT NULL",
    ).all().map((row) => Number(row.steam_appid)),
);
const tasks = searches.flatMap(({ sort, pages }) =>
    Array.from({ length: pages }, (_, page) => ({ sort, page })),
);
const prices = new Map();
let nextTask = 0;
let completed = 0;

console.log(
    `${wantedAppIds.size.toLocaleString()}개 게임의 한국 Steam 현재 가격을 확인합니다.`,
);

async function worker() {
    while (nextTask < tasks.length && prices.size < wantedAppIds.size) {
        const task = tasks[nextTask];
        nextTask += 1;
        const html = await fetchPage(task.sort, task.page);
        extractPrices(html, wantedAppIds, prices);
        completed += 1;

        if (completed % 50 === 0) {
            console.log(
                `${completed}/${tasks.length}페이지, ` +
                `${prices.size.toLocaleString()}개 가격 확인`,
            );
        }
    }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

const update = database.prepare(`
    UPDATE games SET price = ?, price_verified = 1 WHERE steam_appid = ?
`);
database.exec("BEGIN IMMEDIATE");
try {
    database.exec("UPDATE games SET price_verified = 0");
    for (const [appid, price] of prices) update.run(price, appid);
    database.exec("COMMIT");
} catch (error) {
    database.exec("ROLLBACK");
    throw error;
} finally {
    database.close();
}

console.log(
    `완료: ${prices.size.toLocaleString()}개는 실제 한국 현재가, ` +
    `${(wantedAppIds.size - prices.size).toLocaleString()}개는 가격 정보 없음.`,
);
