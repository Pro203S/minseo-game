import { getRandomGame } from "@/modules/sqlite3";
import type { NextRequest } from "next/server";

class RequestError extends Error {}

function parsePrice(value: string | null, field: string): number | undefined {
    if (value === null || value === "") return undefined;

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new RequestError(`${field}는 0 이상의 숫자여야 합니다.`);
    }

    return parsed;
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const min = parsePrice(searchParams.get("min"), "min") ?? 0;
        const max = parsePrice(searchParams.get("max"), "max");

        if (max !== undefined && min > max) {
            throw new RequestError("min은 max보다 클 수 없습니다.");
        }

        const game = await getRandomGame(min, max);
        if (!game) {
            return Response.json(
                { "message": "해당 가격대의 게임을 찾을 수 없습니다." },
                { "status": 404 },
            );
        }

        return Response.json(
            { game, "filters": { min, "max": max ?? null } },
            { "headers": { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : "알 수 없는 오류입니다.";
        const status = error instanceof RequestError ? 400 : 500;
        return Response.json({ message }, { status });
    }
}
