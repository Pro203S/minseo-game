import { getGame, rateGame } from "@/modules/sqlite3";

interface Context {
    params: Promise<{ id: string }>;
}

function parseId(value: string): number | null {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, context: Context) {
    const id = parseId((await context.params).id);
    if (id === null) {
        return Response.json({ message: "올바른 게임 ID가 아닙니다." }, { status: 400 });
    }

    try {
        const game = await getGame(id);
        return game
            ? Response.json(game)
            : Response.json({ message: "게임을 찾을 수 없습니다." }, { status: 404 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "알 수 없는 오류입니다.";
        return Response.json({ message }, { status: 500 });
    }
}

export async function POST(request: Request, context: Context) {
    const id = parseId((await context.params).id);
    if (id === null) {
        return Response.json({ message: "올바른 게임 ID가 아닙니다." }, { status: 400 });
    }

    try {
        const body: unknown = await request.json();
        const rating = typeof body === "object" && body !== null && "rating" in body
            ? Number(body.rating)
            : Number.NaN;

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return Response.json(
                { message: "평점은 1부터 5까지의 정수여야 합니다." },
                { status: 400 },
            );
        }

        const game = await rateGame(id, rating);
        return game
            ? Response.json(game)
            : Response.json({ message: "게임을 찾을 수 없습니다." }, { status: 404 });
    } catch (error) {
        if (error instanceof SyntaxError) {
            return Response.json({ message: "올바른 JSON 요청이 아닙니다." }, { status: 400 });
        }
        const message = error instanceof Error ? error.message : "알 수 없는 오류입니다.";
        return Response.json({ message }, { status: 500 });
    }
}
