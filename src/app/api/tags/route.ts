import { getAvailableTags } from "@/modules/sqlite3";

export async function GET() {
    try {
        return Response.json(await getAvailableTags());
    } catch (error) {
        const message = error instanceof Error ? error.message : "알 수 없는 오류입니다.";
        return Response.json({ message }, { status: 500 });
    }
}
