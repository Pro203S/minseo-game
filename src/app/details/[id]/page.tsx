"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
    QueryClient,
    QueryClientProvider,
    useMutation,
    useQuery,
    useQueryClient,
} from "react-query";
import css from "./page.module.css";

interface Game {
    id: number;
    name: string;
    picture: string | null;
    description: string | null;
    tags: string[];
    price: number | null;
    stars: number;
    ratingCount: number;
}

async function readGame(response: Response): Promise<Game> {
    const body: Game | { message?: string } = await response.json();
    if (!response.ok) {
        throw new Error("message" in body && body.message
            ? body.message
            : "게임 정보를 불러오지 못했습니다.");
    }
    return body as Game;
}

function formatPrice(price: number | null): string {
    if (price === null) return "가격 정보 없음";
    return price === 0 ? "무료" : `${price.toLocaleString("ko-KR")}원`;
}

function DetailsContent() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [selectedRating, setSelectedRating] = useState(0);
    const [hoveredRating, setHoveredRating] = useState(0);
    const [message, setMessage] = useState("");
    const id = params.id;
    const queryKey = ["game", id];

    const gameQuery = useQuery<Game, Error>(
        queryKey,
        () => fetch(`/api/games/${id}`).then(readGame),
        { refetchOnWindowFocus: false },
    );
    const ratingMutation = useMutation<Game, Error, number>(
        (rating) => fetch(`/api/games/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rating }),
        }).then(readGame),
        {
            onSuccess: (game) => {
                queryClient.setQueryData(queryKey, game);
                setMessage(`${selectedRating}점이 등록됐습니다.`);
                setSelectedRating(0);
            },
            onError: (error) => setMessage(error.message),
        },
    );

    function submitRating() {
        if (selectedRating === 0 || ratingMutation.isLoading) return;
        setMessage("");
        ratingMutation.mutate(selectedRating);
    }

    if (gameQuery.isLoading) {
        return <div className={css.state}>게임 정보를 불러오고 있습니다…</div>;
    }

    if (gameQuery.error || !gameQuery.data) {
        return (
            <div className={css.state} role="alert">
                <span>{gameQuery.error?.message || "게임을 찾을 수 없습니다."}</span>
                <button type="button" onClick={() => router.push("/search")}>검색으로 돌아가기</button>
            </div>
        );
    }

    const game = gameQuery.data;
    const previewRating = hoveredRating || selectedRating;

    return (
        <div className={css.container}>
            <div className={css.topbar}>
                <button type="button" onClick={() => router.push("/search")}>← 게임 검색</button>
                <button type="button" onClick={() => router.push("/")}>MINSEO GAME</button>
            </div>

            <div className={css.hero}>
                <div
                    className={css.cover}
                    role="img"
                    aria-label={`${game.name} 표지`}
                    style={game.picture
                        ? { backgroundImage: `url("${game.picture}")` }
                        : undefined}
                >
                    {!game.picture ? <span>NO IMAGE</span> : null}
                </div>

                <div className={css.information}>
                    <span className={css.eyebrow}>GAME DETAILS</span>
                    <div className={css.title} role="heading" aria-level={1}>{game.name}</div>
                    <div className={css.summary}>
                        <span className={css.price}>{formatPrice(game.price)}</span>
                        <span className={css.average}>★ {game.stars.toFixed(1)}</span>
                        <span className={css.count}>평점 {game.ratingCount.toLocaleString("ko-KR")}개</span>
                    </div>
                    <div className={css.description}>
                        {game.description || "게임 설명이 없습니다."}
                    </div>
                    <div className={css.tags}>
                        {game.tags.map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                </div>
            </div>

            <div className={css.ratingPanel}>
                <div>
                    <span className={css.eyebrow}>YOUR RATING</span>
                    <div className={css.ratingTitle} role="heading" aria-level={2}>
                        이 게임은 어땠나요?
                    </div>
                    <span className={css.ratingHint}>별을 선택하고 평점을 등록해 주세요.</span>
                </div>
                <div className={css.ratingControls}>
                    <div
                        className={css.stars}
                        onMouseLeave={() => setHoveredRating(0)}
                    >
                        {[1, 2, 3, 4, 5].map((rating) => (
                            <button
                                className={rating <= previewRating ? css.activeStar : undefined}
                                type="button"
                                aria-label={`${rating}점`}
                                aria-pressed={selectedRating === rating}
                                onMouseEnter={() => setHoveredRating(rating)}
                                onFocus={() => setHoveredRating(rating)}
                                onBlur={() => setHoveredRating(0)}
                                onClick={() => {
                                    setSelectedRating(rating);
                                    setMessage("");
                                }}
                                key={rating}
                            >
                                ★
                            </button>
                        ))}
                    </div>
                    <button
                        className={css.submit}
                        type="button"
                        disabled={selectedRating === 0 || ratingMutation.isLoading}
                        onClick={submitRating}
                    >
                        {ratingMutation.isLoading ? "등록 중…" : "평점 등록"}
                    </button>
                    {message ? <span className={css.message}>{message}</span> : null}
                </div>
            </div>
        </div>
    );
}

export default function DetailsPage() {
    const [queryClient] = useState(() => new QueryClient());

    return (
        <QueryClientProvider client={queryClient}>
            <DetailsContent />
        </QueryClientProvider>
    );
}
