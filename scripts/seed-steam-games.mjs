import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const TARGET = Number.parseInt(process.argv[2] ?? "10000", 10);
const CONCURRENCY = Number.parseInt(process.env.STEAM_CONCURRENCY ?? "12", 10);
const DATABASE_PATH = path.join(process.cwd(), "database.db");
const STEAMSPY_PAGE_SIZE = 1_000;
const CANDIDATE_MULTIPLIER = 1.8;

if (!Number.isInteger(TARGET) || TARGET < 1) {
    throw new Error("목표 개수는 1 이상의 정수여야 합니다.");
}

const database = new DatabaseSync(DATABASE_PATH);

function run(sql, parameters = []) {
    const result = database.prepare(sql).run(...parameters);
    return {
        lastID: Number(result.lastInsertRowid),
        changes: Number(result.changes),
    };
}

function get(sql, parameters = []) {
    return database.prepare(sql).get(...parameters);
}

function all(sql, parameters = []) {
    return database.prepare(sql).all(...parameters);
}

function close() {
    database.close();
}

await run("PRAGMA journal_mode = WAL");
await run(`
    CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        picture TEXT,
        description TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        price REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
        steam_appid INTEGER,
        stars REAL NOT NULL DEFAULT 3 CHECK (stars BETWEEN 1 AND 5),
        rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0)
    )
`);

const columns = await all("PRAGMA table_info(games)");
if (!columns.some((column) => column.name === "steam_appid")) {
    await run("ALTER TABLE games ADD COLUMN steam_appid INTEGER");
}
await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS games_steam_appid_unique
    ON games(steam_appid)
`);

const knownGames = new Map([
    ["Overcooked! 2", 728880],
    ["It Takes Two", 1426210],
    ["Among Us", 945360],
    ["Stardew Valley", 413150],
    ["Lethal Company", 1966720],
    ["플레이트업!", 1599600],
    ["PICO PARK", 1509960],
    ["Human Fall Flat", 477160],
    ["Unrailed!", 1016920],
    ["Gang Beasts", 285900],
    ["얼티밋 치킨 호스", 386940],
    ["Keep Talking and Nobody Explodes", 341800],
]);

for (const [name, appid] of knownGames) {
    await run(
        "UPDATE games SET steam_appid = ? WHERE name = ? AND steam_appid IS NULL",
        [appid, name],
    );
}

const startingCount = (await get("SELECT COUNT(*) AS count FROM games")).count;
if (startingCount >= TARGET) {
    console.log(`이미 ${startingCount.toLocaleString()}개가 저장되어 있습니다.`);
    await close();
    process.exit(0);
}

async function fetchJson(url, attempts = 6) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const response = await fetch(url, {
                headers: { "User-Agent": "minseo-game-database-seeder/1.0" },
                signal: AbortSignal.timeout(20_000),
            });

            if (response.ok) return await response.json();
            if (response.status !== 429 && response.status < 500) return null;
        } catch (error) {
            if (attempt === attempts) {
                console.error(`요청 실패: ${url} (${error.message})`);
                return null;
            }
        }

        const delay = Math.min(30_000, 750 * 2 ** (attempt - 1));
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return null;
}

const needed = TARGET - startingCount;
const pageCount = Math.ceil(
    (needed * CANDIDATE_MULTIPLIER) / STEAMSPY_PAGE_SIZE,
);
console.log(
    `후보 목록 ${pageCount.toLocaleString()}페이지를 불러옵니다 ` +
    `(현재 ${startingCount.toLocaleString()}개 / 목표 ${TARGET.toLocaleString()}개).`,
);

const candidateMaps = await Promise.all(
    Array.from({ length: pageCount }, (_, page) =>
        fetchJson(`https://steamspy.com/api.php?request=all&page=${page}`),
    ),
);

const existingAppIds = new Set(
    (await all("SELECT steam_appid FROM games WHERE steam_appid IS NOT NULL"))
        .map((row) => row.steam_appid),
);
const candidates = [];
const seen = new Set(existingAppIds);

for (const candidateMap of candidateMaps) {
    if (!candidateMap) continue;

    for (const candidate of Object.values(candidateMap)) {
        const appid = Number(candidate.appid);
        if (!Number.isInteger(appid) || seen.has(appid)) continue;
        seen.add(appid);
        candidates.push({ appid, steamSpyTags: Object.keys(candidate.tags ?? {}) });
    }
}

console.log(`${candidates.length.toLocaleString()}개 후보의 한국 스토어 정보를 확인합니다.`);

let storedCount = startingCount;
let checkedCount = 0;
let unavailableCount = 0;
let nextIndex = 0;
let stopping = false;

process.on("SIGINT", () => {
    stopping = true;
    console.log("\n현재 요청이 끝나면 안전하게 종료합니다.");
});

function normalizeText(value) {
    return typeof value === "string"
        ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
        : null;
}

async function importCandidate(candidate) {
    const url =
        "https://store.steampowered.com/api/appdetails" +
        `?appids=${candidate.appid}&cc=kr&l=korean`;
    const payload = await fetchJson(url);
    const result = payload?.[candidate.appid];
    const game = result?.success ? result.data : null;

    if (!game || game.type !== "game") return false;

    const price = game.is_free
        ? 0
        : game.price_overview?.initial != null
            ? game.price_overview.initial / 100
            : null;
    if (price === null || !Number.isFinite(price)) return false;

    const tags = [
        ...(game.genres ?? []).map((genre) => genre.description),
        ...(game.categories ?? []).map((category) => category.description),
        ...candidate.steamSpyTags,
    ]
        .filter((tag) => typeof tag === "string" && tag.trim())
        .map((tag) => tag.trim());
    const uniqueTags = [...new Set(tags)].slice(0, 20);

    const insert = await run(
        `INSERT INTO games
            (name, picture, description, tags, price, steam_appid)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT DO UPDATE SET
            name = excluded.name,
            picture = excluded.picture,
            description = excluded.description,
            tags = excluded.tags,
            price = excluded.price,
            steam_appid = excluded.steam_appid`,
        [
            game.name,
            game.header_image ?? null,
            normalizeText(game.short_description),
            JSON.stringify(uniqueTags),
            price,
            candidate.appid,
        ],
    );

    return insert.changes > 0;
}

async function worker() {
    while (!stopping && storedCount < TARGET) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= candidates.length) return;

        const imported = await importCandidate(candidates[index]);
        checkedCount += 1;
        if (imported) storedCount += 1;
        else unavailableCount += 1;

        if (checkedCount % 100 === 0 || storedCount >= TARGET) {
            console.log(
                `확인 ${checkedCount.toLocaleString()} / ` +
                `저장 ${storedCount.toLocaleString()} / ` +
                `제외 ${unavailableCount.toLocaleString()}`,
            );
        }
    }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
await close();

if (storedCount < TARGET && !stopping) {
    throw new Error(
        `후보가 부족합니다: ${storedCount.toLocaleString()} / ${TARGET.toLocaleString()}`,
    );
}

console.log(`완료: games 테이블에 ${storedCount.toLocaleString()}개가 저장되었습니다.`);
