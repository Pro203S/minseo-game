import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const USD_TO_KRW = 1_505;
const RHYTHM_APP_IDS = [
    12900, 49600, 247080, 322170, 356400, 398030, 416790, 440310,
    531510, 618740, 620980, 774171, 774181, 885000, 952040, 960170,
    977950, 980610, 986800, 1058830, 1059990, 1061910, 1079800,
    1122720, 1229380, 1286350, 1345820, 1456760, 1477590, 1509960,
    1585220, 1608700, 1726190, 1761390, 1802720, 2073250, 2093940,
    2190220, 2222540, 2240620, 2262500, 2548120, 2717010,
];

async function fetchDetails(appid) {
    const response = await fetch(
        `https://steamspy.com/api.php?request=appdetails&appid=${appid}`,
        { signal: AbortSignal.timeout(20_000) },
    );
    if (!response.ok) return null;

    const game = await response.json();
    return game?.name ? game : null;
}

function calculateStars(positive, negative) {
    const total = positive + negative;
    return total === 0
        ? 3
        : Math.round((1 + (4 * positive) / total) * 10) / 10;
}

function rhythmDescription(name, tags) {
    const styles = tags.filter((tag) =>
        ["Rhythm", "Music", "Action", "Arcade", "VR", "Roguelike"].includes(tag),
    );
    const styleText = styles.length > 0 ? styles.join(", ") : "리듬 액션";
    return `${name}은(는) 음악과 박자에 맞춰 즐기는 ${styleText} 게임입니다.`;
}

console.log(`${RHYTHM_APP_IDS.length}개 리듬게임 정보를 수집합니다.`);
const games = (
    await Promise.all(RHYTHM_APP_IDS.map((appid) => fetchDetails(appid)))
).filter(Boolean);

const database = new DatabaseSync(path.join(process.cwd(), "database.db"));
const columns = database.prepare("PRAGMA table_info(games)").all();

if (!columns.some((column) => column.name === "steam_appid")) {
    database.exec("ALTER TABLE games ADD COLUMN steam_appid INTEGER");
}
if (!columns.some((column) => column.name === "stars")) {
    database.exec(`
        ALTER TABLE games ADD COLUMN stars REAL NOT NULL DEFAULT 3
        CHECK (stars BETWEEN 1 AND 5)
    `);
}
if (!columns.some((column) => column.name === "rating_count")) {
    database.exec(`
        ALTER TABLE games ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0
        CHECK (rating_count >= 0)
    `);
}
database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS games_steam_appid_unique
    ON games(steam_appid)
`);

const upsert = database.prepare(`
    INSERT INTO games
        (name, picture, description, tags, price, steam_appid, stars, rating_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO UPDATE SET
        name = excluded.name,
        picture = excluded.picture,
        description = excluded.description,
        tags = excluded.tags,
        price = excluded.price,
        steam_appid = excluded.steam_appid,
        stars = excluded.stars,
        rating_count = excluded.rating_count
`);

database.exec("BEGIN IMMEDIATE");
try {
    for (const game of games) {
        const communityTags = Object.entries(game.tags ?? {})
            .sort((left, right) => right[1] - left[1])
            .map(([tag]) => tag);
        const tags = [...new Set(["리듬게임", "음악", ...communityTags])].slice(0, 20);
        const usdPrice = Number(game.initialprice || game.price || 0) / 100;
        const price = usdPrice === 0
            ? 0
            : Math.round((usdPrice * USD_TO_KRW) / 100) * 100;
        const positive = Number(game.positive) || 0;
        const negative = Number(game.negative) || 0;

        upsert.run(
            game.name,
            `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
            rhythmDescription(game.name, communityTags),
            JSON.stringify(tags),
            price,
            Number(game.appid),
            calculateStars(positive, negative),
            positive + negative,
        );
    }
    database.exec("COMMIT");
} catch (error) {
    database.exec("ROLLBACK");
    throw error;
} finally {
    database.close();
}

console.log(`${games.length}개 리듬게임을 추가하거나 갱신했습니다.`);
