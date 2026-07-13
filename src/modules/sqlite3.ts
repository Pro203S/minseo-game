import "server-only";

import path from "node:path";
import { Database, verbose } from "sqlite3";

const sqlite3 = verbose();
const databasePath = path.join(process.cwd(), "database.db");

export type SqlParameter = string | number | bigint | Buffer | null;

export interface RunResult {
    lastID: number;
    changes: number;
}

export interface Game {
    id: number;
    name: string;
    picture: string | null;
    description: string | null;
    tags: string[];
    price: number | null;
    stars: number;
    ratingCount: number;
}

export interface CreateGameInput {
    name: string;
    picture?: string | null;
    description?: string | null;
    tags?: string[];
    price: number;
    stars?: number;
}

export type UpdateGameInput = Partial<CreateGameInput>;

export interface SearchGamesOptions {
    query?: string;
    tags?: string[];
    page?: number;
    limit?: number;
}

export interface SearchGamesResult {
    games: Game[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface VerifiedPriceRange {
    min: number;
    max: number;
    count: number;
}

interface GameRow extends Omit<Game, "tags" | "ratingCount"> {
    tags: string;
    rating_count: number;
}

declare global {
    // 재실행되는 개발 서버에서도 SQLite 연결을 하나만 유지한다.
    var __minseoGameDatabase: Promise<Database> | undefined;
}

function openDatabase(): Promise<Database> {
    return new Promise((resolve, reject) => {
        const database = new sqlite3.Database(databasePath, (error) => {
            if (error) {
                reject(error);
                return;
            }

            database.exec(
                `
                    PRAGMA foreign_keys = ON;
                    PRAGMA journal_mode = WAL;

                    CREATE TABLE IF NOT EXISTS games (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        picture TEXT,
                        description TEXT,
                        tags TEXT NOT NULL DEFAULT '[]',
                        price REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
                        price_verified INTEGER NOT NULL DEFAULT 0
                            CHECK (price_verified IN (0, 1)),
                        steam_appid INTEGER,
                        stars REAL NOT NULL DEFAULT 3 CHECK (stars BETWEEN 1 AND 5),
                        rating_count INTEGER NOT NULL DEFAULT 0
                            CHECK (rating_count >= 0)
                    );
                `,
                (schemaError) => {
                    if (schemaError) {
                        database.close(() => reject(schemaError));
                        return;
                    }

                    database.all<{ name: string }>(
                        "PRAGMA table_info(games)",
                        (tableInfoError, columns) => {
                            if (tableInfoError) {
                                database.close(() => reject(tableInfoError));
                                return;
                            }

                            const migrations: string[] = [];

                            if (!columns.some((column) => column.name === "price")) {
                                migrations.push(
                                    `ALTER TABLE games ADD COLUMN price REAL NOT NULL
                                     DEFAULT 0 CHECK (price >= 0)`,
                                );
                            }
                            if (!columns.some((column) => column.name === "price_verified")) {
                                migrations.push(
                                    `ALTER TABLE games ADD COLUMN price_verified INTEGER
                                     NOT NULL DEFAULT 0 CHECK (price_verified IN (0, 1))`,
                                );
                            }
                            if (!columns.some((column) => column.name === "steam_appid")) {
                                migrations.push(
                                    "ALTER TABLE games ADD COLUMN steam_appid INTEGER",
                                );
                            }
                            if (!columns.some((column) => column.name === "stars")) {
                                migrations.push(
                                    `ALTER TABLE games ADD COLUMN stars REAL NOT NULL
                                     DEFAULT 3 CHECK (stars BETWEEN 1 AND 5)`,
                                );
                            }
                            if (!columns.some((column) => column.name === "rating_count")) {
                                migrations.push(
                                    `ALTER TABLE games ADD COLUMN rating_count INTEGER
                                     NOT NULL DEFAULT 0 CHECK (rating_count >= 0)`,
                                );
                            }

                            database.exec(
                                `${migrations.join(";")};
                                 CREATE UNIQUE INDEX IF NOT EXISTS
                                 games_steam_appid_unique ON games(steam_appid);`,
                                (migrationError) => {
                                    if (migrationError) {
                                        database.close(() => reject(migrationError));
                                        return;
                                    }

                                    resolve(database);
                                },
                            );
                        },
                    );
                },
            );
        });
    });
}

const databasePromise = globalThis.__minseoGameDatabase ?? openDatabase();

if (process.env.NODE_ENV !== "production") {
    globalThis.__minseoGameDatabase = databasePromise;
}

export async function run(
    statement: string,
    parameters: readonly SqlParameter[] = [],
): Promise<RunResult> {
    const database = await databasePromise;

    return new Promise((resolve, reject) => {
        database.run(statement, [...parameters], function onRun(error) {
            if (error) {
                reject(error);
                return;
            }

            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

export async function get<T>(
    statement: string,
    parameters: readonly SqlParameter[] = [],
): Promise<T | undefined> {
    const database = await databasePromise;

    return new Promise((resolve, reject) => {
        database.get<T>(statement, [...parameters], (error, row) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(row);
        });
    });
}

export async function all<T>(
    statement: string,
    parameters: readonly SqlParameter[] = [],
): Promise<T[]> {
    const database = await databasePromise;

    return new Promise((resolve, reject) => {
        database.all<T>(statement, [...parameters], (error, rows) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(rows);
        });
    });
}

function parseTags(value: string): string[] {
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed)
            ? parsed.filter((tag): tag is string => typeof tag === "string")
            : [];
    } catch {
        return [];
    }
}

function toGame(row: GameRow): Game {
    const { rating_count, ...game } = row;
    return {
        ...game,
        tags: parseTags(row.tags),
        ratingCount: rating_count,
    };
}

function normalizeTags(tags: string[] = []): string[] {
    return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, "\\$&");
}

function requireName(name: string): string {
    const normalizedName = name.trim();

    if (!normalizedName) {
        throw new Error("게임 이름은 비워둘 수 없습니다.");
    }

    return normalizedName;
}

function requirePrice(price: number): number {
    if (!Number.isFinite(price) || price < 0) {
        throw new Error("게임 가격은 0 이상의 숫자여야 합니다.");
    }

    return price;
}

function requireStars(stars: number): number {
    if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
        throw new Error("별점은 1 이상 5 이하의 숫자여야 합니다.");
    }

    return stars;
}

export async function createGame(input: CreateGameInput): Promise<Game> {
    const result = await run(
        `INSERT INTO games
            (name, picture, description, tags, price, price_verified, stars)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [
            requireName(input.name),
            input.picture ?? null,
            input.description ?? null,
            JSON.stringify(normalizeTags(input.tags)),
            requirePrice(input.price),
            requireStars(input.stars ?? 3),
        ],
    );

    const game = await getGame(result.lastID);

    if (!game) {
        throw new Error("저장한 게임을 불러오지 못했습니다.");
    }

    return game;
}

export async function getGame(id: number): Promise<Game | null> {
    const row = await get<GameRow>(
        `SELECT id, name, picture, description, tags,
                CASE WHEN price_verified = 1 THEN price ELSE NULL END AS price,
                stars, rating_count
         FROM games WHERE id = ?`,
        [id],
    );

    return row ? toGame(row) : null;
}

export async function getGames(): Promise<Game[]> {
    const rows = await all<GameRow>(
        `SELECT id, name, picture, description, tags,
                CASE WHEN price_verified = 1 THEN price ELSE NULL END AS price,
                stars, rating_count
         FROM games ORDER BY id DESC`,
    );

    return rows.map(toGame);
}

export async function getRandomGame(
    minPrice?: number,
    maxPrice?: number,
): Promise<Game | null> {
    const conditions: string[] = [];
    const parameters: SqlParameter[] = [];

    if (minPrice !== undefined || maxPrice !== undefined) {
        conditions.push("price_verified = 1");
    }

    if (minPrice !== undefined) {
        conditions.push("price >= ?");
        parameters.push(requirePrice(minPrice));
    }

    if (maxPrice !== undefined) {
        const normalizedMaxPrice = requirePrice(maxPrice);
        if (minPrice !== undefined && normalizedMaxPrice < minPrice) {
            throw new Error("최대 가격은 최소 가격보다 작을 수 없습니다.");
        }
        conditions.push("price <= ?");
        parameters.push(normalizedMaxPrice);
    }

    const where = conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const row = await get<GameRow>(
        `SELECT id, name, picture, description, tags,
                CASE WHEN price_verified = 1 THEN price ELSE NULL END AS price,
                stars, rating_count
         FROM games
         ${where}
         ORDER BY RANDOM()
         LIMIT 1`,
        parameters,
    );

    return row ? toGame(row) : null;
}

export async function getVerifiedPriceRange(): Promise<VerifiedPriceRange | null> {
    const row = await get<VerifiedPriceRange>(
        `SELECT MIN(price) AS min, MAX(price) AS max, COUNT(*) AS count
         FROM games
         WHERE price_verified = 1`,
    );

    return row && row.count > 0 ? row : null;
}

export async function searchGames(
    options: SearchGamesOptions = {},
): Promise<SearchGamesResult> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;

    if (!Number.isInteger(page) || page < 1) {
        throw new Error("페이지는 1 이상의 정수여야 합니다.");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("페이지 크기는 1 이상 100 이하의 정수여야 합니다.");
    }

    const conditions: string[] = [];
    const parameters: SqlParameter[] = [];
    const query = options.query?.trim();

    if (query) {
        conditions.push(
            `(name LIKE ? ESCAPE '\\' COLLATE NOCASE OR
              description LIKE ? ESCAPE '\\' COLLATE NOCASE)`,
        );
        const pattern = `%${escapeLike(query)}%`;
        parameters.push(pattern, pattern);
    }

    for (const tag of normalizeTags(options.tags)) {
        conditions.push(
            `EXISTS (
                SELECT 1 FROM json_each(games.tags)
                WHERE value = ? COLLATE NOCASE
            )`,
        );
        parameters.push(tag);
    }

    const where = conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
    const countRow = await get<{ total: number }>(
        `SELECT COUNT(*) AS total FROM games ${where}`,
        parameters,
    );
    const total = countRow?.total ?? 0;
    const rows = await all<GameRow>(
        `SELECT id, name, picture, description, tags,
                CASE WHEN price_verified = 1 THEN price ELSE NULL END AS price,
                stars, rating_count
         FROM games
         ${where}
         ORDER BY stars DESC, name COLLATE NOCASE ASC
         LIMIT ? OFFSET ?`,
        [...parameters, limit, (page - 1) * limit],
    );

    return {
        games: rows.map(toGame),
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
    };
}

export async function getAvailableTags(): Promise<string[]> {
    const rows = await all<{ tag: string }>(`
        SELECT DISTINCT value AS tag
        FROM games, json_each(games.tags)
        WHERE json_valid(games.tags) AND trim(value) != ''
    `);

    return rows
        .map((row) => row.tag)
        .sort((left, right) => left.localeCompare(right, "ko"));
}

export async function rateGame(id: number, rating: number): Promise<Game | null> {
    if (!Number.isInteger(id) || id < 1) {
        throw new Error("게임 ID는 1 이상의 정수여야 합니다.");
    }

    const normalizedRating = requireStars(rating);
    const result = await run(
        `UPDATE games
         SET stars = ((stars * rating_count) + ?) / (rating_count + 1),
             rating_count = rating_count + 1
         WHERE id = ?`,
        [normalizedRating, id],
    );

    return result.changes > 0 ? getGame(id) : null;
}

export async function updateGame(
    id: number,
    input: UpdateGameInput,
): Promise<Game | null> {
    const assignments: string[] = [];
    const parameters: SqlParameter[] = [];

    if (input.name !== undefined) {
        assignments.push("name = ?");
        parameters.push(requireName(input.name));
    }
    if (input.picture !== undefined) {
        assignments.push("picture = ?");
        parameters.push(input.picture);
    }
    if (input.description !== undefined) {
        assignments.push("description = ?");
        parameters.push(input.description);
    }
    if (input.tags !== undefined) {
        assignments.push("tags = ?");
        parameters.push(JSON.stringify(normalizeTags(input.tags)));
    }
    if (input.price !== undefined) {
        assignments.push("price = ?", "price_verified = 1");
        parameters.push(requirePrice(input.price));
    }
    if (input.stars !== undefined) {
        assignments.push("stars = ?");
        parameters.push(requireStars(input.stars));
    }

    if (assignments.length === 0) {
        return getGame(id);
    }

    parameters.push(id);
    const result = await run(
        `UPDATE games SET ${assignments.join(", ")} WHERE id = ?`,
        parameters,
    );

    return result.changes > 0 ? getGame(id) : null;
}

export async function deleteGame(id: number): Promise<boolean> {
    const result = await run("DELETE FROM games WHERE id = ?", [id]);
    return result.changes > 0;
}
