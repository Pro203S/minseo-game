import { searchGames } from "@/modules/sqlite3";
import { NextResponse, type NextRequest } from "next/server";

class RequestError extends Error {}

function parsePositiveInteger(
    value: string | null,
    fallback: number,
    field: string,
    max?: number,
): number {
    if (value === null) return fallback;

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new RequestError(`${field}는 1 이상의 정수여야 합니다.`);
    }
    if (max !== undefined && parsed > max) {
        throw new RequestError(`${field}는 ${max} 이하여야 합니다.`);
    }

    return parsed;
}

function parseTags(searchParams: URLSearchParams): string[] {
    return searchParams
        .getAll("tags")
        .flatMap((value) => value.split(","))
        .map((tag) => tag.trim())
        .filter(Boolean);
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get("query")?.trim() || undefined;

        if (query && query.length > 100) {
            throw new RequestError("검색어는 100자를 넘을 수 없습니다.");
        }

        const result = await searchGames({
            query,
            "tags": parseTags(searchParams),
            "page": parsePositiveInteger(searchParams.get("page"), 1, "page"),
            "limit": parsePositiveInteger(searchParams.get("limit"), 20, "limit", 100),
        });

        return NextResponse.json({
            "games": result.games,
            "pagination": {
                "page": result.page,
                "limit": result.limit,
                "total": result.total,
                "totalPages": result.totalPages,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "알 수 없는 오류입니다.";
        const status = error instanceof RequestError ? 400 : 500;
        return Response.json({ message }, { status });
    }
}
