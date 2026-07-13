import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    try {
        const rawQuery = req.nextUrl.searchParams.get("query");
        const rawTags = req.nextUrl.searchParams.get("tags");

        
    } catch (e) {
        if (e instanceof Error) return NextResponse.json({
            "message": e.message
        }, { "status": 500 });

        return NextResponse.json({
            "message": e ?? "Unknown Error"
        }, { "status": 500 });
    }
}