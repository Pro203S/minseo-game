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
    price: number;
}

export interface CreateGameInput {
    name: string;
    picture?: string | null;
    description?: string | null;
    tags?: string[];
    price: number;
}

export type UpdateGameInput = Partial<CreateGameInput>;

interface GameRow extends Omit<Game, "tags"> {
    tags: string;
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
                        price REAL NOT NULL DEFAULT 0 CHECK (price >= 0)
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

                            if (columns.some((column) => column.name === "price")) {
                                resolve(database);
                                return;
                            }

                            database.run(
                                `ALTER TABLE games
                                 ADD COLUMN price REAL NOT NULL DEFAULT 0
                                 CHECK (price >= 0)`,
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
    return { ...row, tags: parseTags(row.tags) };
}

function normalizeTags(tags: string[] = []): string[] {
    return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
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

export async function createGame(input: CreateGameInput): Promise<Game> {
    const result = await run(
        `INSERT INTO games (name, picture, description, tags, price)
         VALUES (?, ?, ?, ?, ?)`,
        [
            requireName(input.name),
            input.picture ?? null,
            input.description ?? null,
            JSON.stringify(normalizeTags(input.tags)),
            requirePrice(input.price),
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
        "SELECT id, name, picture, description, tags, price FROM games WHERE id = ?",
        [id],
    );

    return row ? toGame(row) : null;
}

export async function getGames(): Promise<Game[]> {
    const rows = await all<GameRow>(
        "SELECT id, name, picture, description, tags, price FROM games ORDER BY id DESC",
    );

    return rows.map(toGame);
}

export async function getRandomGame(): Promise<Game | null> {
    const row = await get<GameRow>(
        "SELECT id, name, picture, description, tags, price FROM games ORDER BY RANDOM() LIMIT 1",
    );

    return row ? toGame(row) : null;
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
        assignments.push("price = ?");
        parameters.push(requirePrice(input.price));
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
