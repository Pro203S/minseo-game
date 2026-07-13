import { execFileSync } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const TARGET = Number.parseInt(process.argv[2] ?? "10000", 10);
const USD_TO_KRW = 1_505;
const DATASET_URL =
    "https://www.kaggle.com/api/v1/datasets/download/" +
    "jypenpen54534/steam-games-dataset-2021-2025-65k";
const CSV_NAME = "a_steam_data_2021_2025.csv";
const archivePath = path.join(tmpdir(), "minseo-steam-games-65k.zip");

if (!Number.isInteger(TARGET) || TARGET < 1) {
    throw new Error("목표 개수는 1 이상의 정수여야 합니다.");
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];

        if (quoted) {
            if (character === '"' && text[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (character === '"') {
                quoted = false;
            } else {
                field += character;
            }
        } else if (character === '"') {
            quoted = true;
        } else if (character === ",") {
            row.push(field);
            field = "";
        } else if (character === "\n") {
            row.push(field.replace(/\r$/, ""));
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += character;
        }
    }

    if (field || row.length) {
        row.push(field);
        rows.push(row);
    }

    const headers = rows.shift();
    return rows.map((values) =>
        Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
    );
}

function splitTags(value) {
    return value
        .split(";")
        .map((tag) => tag.trim())
        .filter(Boolean);
}

function koreanDescription(name, genres) {
    const genreText = genres.length > 0 ? genres.join(", ") : "다양한";
    return `${name}은(는) ${genreText} 장르의 Steam 게임입니다.`;
}

console.log("65K Steam 게임 데이터셋을 내려받습니다.");
const response = await fetch(DATASET_URL, { signal: AbortSignal.timeout(60_000) });
if (!response.ok) {
    throw new Error(`데이터셋 다운로드 실패: HTTP ${response.status}`);
}
await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));

const csv = execFileSync("unzip", ["-p", archivePath, CSV_NAME], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
});
await rm(archivePath, { force: true });

const games = parseCsv(csv)
    .map((game) => ({
        appid: Number.parseInt(game.appid, 10),
        name: game.name.trim(),
        priceUsd: Number.parseFloat(game.price),
        recommendations: Number.parseInt(game.recommendations, 10) || 0,
        genres: splitTags(game.genres),
        categories: splitTags(game.categories),
    }))
    .filter(
        (game) =>
            Number.isInteger(game.appid) &&
            game.name &&
            Number.isFinite(game.priceUsd) &&
            game.priceUsd >= 0,
    )
    .sort((left, right) => right.recommendations - left.recommendations);

const database = new DatabaseSync(path.join(process.cwd(), "database.db"));
database.exec("PRAGMA journal_mode = WAL");
database.exec(`
    CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        picture TEXT,
        description TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        price REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
        steam_appid INTEGER,
        stars REAL NOT NULL DEFAULT 3 CHECK (stars BETWEEN 1 AND 5),
        comment INTEGER NOT NULL DEFAULT 0
            CHECK (comment >= 0 AND comment = CAST(comment AS INTEGER))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS games_steam_appid_unique
    ON games(steam_appid);
`);

const countStatement = database.prepare("SELECT COUNT(*) AS count FROM games");
const insertStatement = database.prepare(`
    INSERT INTO games
        (name, picture, description, tags, price, steam_appid)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
`);

let count = Number(countStatement.get().count);
let inserted = 0;
database.exec("BEGIN IMMEDIATE");

try {
    for (const game of games) {
        if (count >= TARGET) break;

        const tags = [...new Set([...game.genres, ...game.categories])].slice(0, 20);
        const approximateKrwPrice = game.priceUsd === 0
            ? 0
            : Math.round((game.priceUsd * USD_TO_KRW) / 100) * 100;
        const result = insertStatement.run(
            game.name,
            `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
            koreanDescription(game.name, game.genres),
            JSON.stringify(tags),
            approximateKrwPrice,
            game.appid,
        );

        if (result.changes > 0) {
            count += 1;
            inserted += 1;
        }
    }

    database.exec("COMMIT");
} catch (error) {
    database.exec("ROLLBACK");
    throw error;
} finally {
    database.close();
}

console.log(
    `완료: ${inserted.toLocaleString()}개 추가, ` +
    `총 ${count.toLocaleString()}개 저장.`,
);

if (count < TARGET) {
    throw new Error(`유효한 게임이 부족합니다: ${count} / ${TARGET}`);
}
