"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import css from "./page.module.css";

interface Game {
    id: number;
    name: string;
    picture: string | null;
    price: number | null;
    stars: number;
}

interface RandomResponse {
    game: Game;
}

const confetti = Array.from({ length: 36 }, (_, index) => index);

function formatPrice(price: number | null): string {
    if (price === null) return "가격 정보 없음";
    return price === 0 ? "무료" : `${price.toLocaleString("ko-KR")}원`;
}

export default function RandomPage() {
    const [game, setGame] = useState<Game | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const drawGame = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const response = await fetch("/api/random", { cache: "no-store" });
            const body = await response.json() as RandomResponse | { message?: string };

            if (!response.ok || !("game" in body)) {
                const message = "message" in body ? body.message : undefined;
                throw new Error(message || "게임을 뽑지 못했습니다.");
            }

            setGame(body.game);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "게임을 뽑지 못했습니다.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void drawGame();
    }, [drawGame]);

    return (
        <main className={css.page}>
            <Link className={css.home} href="/"></Link>

            <section className={css.center} aria-live="polite">
                {loading ? (
                    <div className={css.state}>
                        <span className={css.spinner} />
                        <p>게임을 뽑는 중…</p>
                    </div>
                ) : error ? (
                    <div className={css.state} role="alert">
                        <strong>게임을 불러오지 못했어요.</strong>
                        <p>{error}</p>
                        <button type="button" onClick={drawGame}>다시 시도</button>
                    </div>
                ) : game ? (
                    <div className={css.reveal} key={game.id}>
                        <div className={css.confetti} aria-hidden="true">
                            {confetti.map((piece) => (
                                <i
                                    key={piece}
                                    style={{
                                        "--index": piece,
                                        "--angle": `${piece * 137.5}deg`,
                                        "--distance": `${150 + (piece % 7) * 18}px`,
                                        "--delay": `${(piece % 6) * 25}ms`,
                                    } as React.CSSProperties}
                                />
                            ))}
                        </div>

                        <span className={css.label}>오늘의 랜덤 게임</span>
                        <div
                            className={css.cover}
                            role="img"
                            aria-label={`${game.name} 표지`}
                            style={game.picture ? { backgroundImage: `url("${game.picture}")` } : undefined}
                        >
                            {!game.picture ? <span>NO IMAGE</span> : null}
                        </div>
                        <h1>{game.name}</h1>
                        <div className={css.meta}>
                            <span>{formatPrice(game.price)}</span>
                            <span>★ {game.stars.toFixed(1)}</span>
                        </div>
                        <div className={css.actions}>
                            <button type="button" onClick={drawGame}>↻ 다시 뽑기</button>
                            <Link href={`/details/${game.id}`}>자세히 보기 <span>→</span></Link>
                        </div>
                    </div>
                ) : null}
            </section>
        </main>
    );
}
