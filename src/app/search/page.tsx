"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider, useQuery } from "react-query";
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

interface SearchResponse {
    games: Game[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

async function readJson<T>(response: Response): Promise<T> {
    const body: T | { message?: string } = await response.json();

    if (!response.ok) {
        const message = "message" in (body as object)
            ? (body as { message?: string }).message
            : undefined;
        throw new Error(message || "데이터를 불러오지 못했습니다.");
    }

    return body as T;
}

async function fetchGames(
    query: string,
    tags: string[],
    page: number,
): Promise<SearchResponse> {
    const params = new URLSearchParams({ page: String(page), limit: "24" });
    if (query) params.set("query", query);
    if (tags.length > 0) params.set("tags", tags.join(","));

    return readJson<SearchResponse>(await fetch(`/api/search?${params}`));
}

async function fetchTags(): Promise<string[]> {
    return readJson<string[]>(await fetch("/api/tags"));
}

function formatPrice(price: number | null): string {
    if (price === null) return "가격 정보 없음";
    return price === 0 ? "무료" : `${price.toLocaleString("ko-KR")}원`;
}

function SearchContent() {
    const router = useRouter();
    const [input, setInput] = useState("");
    const [query, setQuery] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [tagQuery, setTagQuery] = useState("");
    const [page, setPage] = useState(1);

    const tagsQuery = useQuery<string[], Error>("available-tags", fetchTags, {
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: false,
    });
    const gamesQuery = useQuery<SearchResponse, Error>(
        ["games", query, selectedTags, page],
        () => fetchGames(query, selectedTags, page),
        {
            keepPreviousData: true,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
        },
    );

    const visibleTags = useMemo(() => {
        const normalizedQuery = tagQuery.trim().toLocaleLowerCase("ko");
        return (tagsQuery.data ?? []).filter((tag) =>
            !normalizedQuery || tag.toLocaleLowerCase("ko").includes(normalizedQuery));
    }, [tagQuery, tagsQuery.data]);

    function submitSearch() {
        setQuery(input.trim());
        setPage(1);
    }

    function toggleTag(tag: string) {
        setSelectedTags((current) => current.includes(tag)
            ? current.filter((item) => item !== tag)
            : [...current, tag]);
        setPage(1);
    }

    function clearFilters() {
        setInput("");
        setQuery("");
        setSelectedTags([]);
        setTagQuery("");
        setPage(1);
    }

    const pagination = gamesQuery.data?.pagination;

    return (
        <div className={css.container}>
            <div className={css.hero}>
                <button
                    className={css.homeLink}
                    type="button"
                    onClick={() => router.push("/")}
                >
                    민서가 좋아하는 랜덤 게임
                </button>
                <div className={css.heroCopy}>
                    <div className={css.heroTitle} role="heading" aria-level={1}>
                        새로운 맛의 게임을
                        <span>찾아보세요.</span>
                    </div>
                </div>
                <div className={css.searchForm} role="search">
                    <label className={css.srOnly} htmlFor="game-query">게임 검색</label>
                    <input
                        id="game-query"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") submitSearch();
                        }}
                        placeholder="게임 이름이나 설명을 검색하세요"
                        maxLength={100}
                    />
                    <button type="button" onClick={submitSearch}>검색</button>
                </div>
            </div>

            <div className={css.content}>
                <div className={css.filters}>
                    <div className={css.filterTitle}>
                        <div>
                            <div className={css.sectionTitle} role="heading" aria-level={2}>태그</div>
                        </div>
                        {selectedTags.length > 0 ? (
                            <button type="button" onClick={clearFilters}>초기화</button>
                        ) : null}
                    </div>
                    <label className={css.srOnly} htmlFor="tag-query">태그 검색</label>
                    <input
                        className={css.tagSearch}
                        id="tag-query"
                        value={tagQuery}
                        onChange={(event) => setTagQuery(event.target.value)}
                        placeholder="태그 검색"
                    />

                    {tagsQuery.isLoading ? (
                        <div className={css.filterMessage}>태그를 불러오는 중…</div>
                    ) : tagsQuery.error ? (
                        <div className={css.filterMessage}>{tagsQuery.error.message}</div>
                    ) : (
                        <div className={css.tagList}>
                            {visibleTags.map((tag) => {
                                const active = selectedTags.includes(tag);
                                return (
                                    <button
                                        className={active ? css.activeTag : undefined}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => toggleTag(tag)}
                                        key={tag}
                                    >
                                        <span>{tag}</span>
                                        <span className={css.tagSymbol}>{active ? "×" : "+"}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className={css.results} aria-live="polite">
                    <div className={css.resultsHeader}>
                        <div>
                            <div className={css.sectionTitle} role="heading" aria-level={2}>
                                {pagination
                                    ? `${pagination.total.toLocaleString("ko-KR")}개의 게임`
                                    : "게임 찾기"}
                            </div>
                        </div>
                        {gamesQuery.isFetching && !gamesQuery.isLoading
                            ? <span>새 결과를 불러오는 중…</span>
                            : null}
                    </div>

                    {selectedTags.length > 0 ? (
                        <div className={css.selectedTags}>
                            {selectedTags.map((tag) => (
                                <button type="button" onClick={() => toggleTag(tag)} key={tag}>
                                    {tag} <span>×</span>
                                </button>
                            ))}
                        </div>
                    ) : null}

                    {gamesQuery.isLoading ? (
                        <div className={css.state}>게임을 불러오고 있습니다…</div>
                    ) : gamesQuery.error ? (
                        <div className={css.state} role="alert">
                            <span className={css.stateTitle}>불러오지 못했습니다.</span>
                            <span className={css.stateDescription}>{gamesQuery.error.message}</span>
                            <button type="button" onClick={() => gamesQuery.refetch()}>다시 시도</button>
                        </div>
                    ) : gamesQuery.data?.games.length === 0 ? (
                        <div className={css.state}>
                            <span className={css.stateTitle}>검색 결과가 없습니다.</span>
                            <span className={css.stateDescription}>검색어나 태그를 조금 줄여보세요.</span>
                            <button type="button" onClick={clearFilters}>전체 게임 보기</button>
                        </div>
                    ) : (
                        <div className={css.grid} data-fetching={gamesQuery.isFetching}>
                            {gamesQuery.data?.games.map((game) => (
                                <button
                                    className={css.card}
                                    type="button"
                                    onClick={() => router.push(`/details/${game.id}`)}
                                    key={game.id}
                                >
                                    <div
                                        className={css.cover}
                                        role="img"
                                        aria-label={`${game.name} 표지`}
                                        style={game.picture
                                            ? { backgroundImage: `url("${game.picture}")` }
                                            : undefined}
                                    >
                                        {!game.picture ? <span>NO IMAGE</span> : null}
                                        <span className={css.price}>{formatPrice(game.price)}</span>
                                    </div>
                                    <div className={css.cardBody}>
                                        <div className={css.cardName} title={game.name} role="heading" aria-level={3}>
                                            {game.name}
                                        </div>
                                        <div className={css.cardDescription}>
                                            {game.description || "게임 설명이 없습니다."}
                                        </div>
                                        <div className={css.cardTags}>
                                            {game.tags.slice(0, 3).map((tag) => (
                                                <span key={tag}>{tag}</span>
                                            ))}
                                        </div>
                                        <div className={css.cardFooter}>
                                            <span>
                                                ★ {game.stars.toFixed(1)} · {game.ratingCount.toLocaleString("ko-KR")}개
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {pagination && pagination.totalPages > 1 ? (
                        <div className={css.pagination} role="navigation" aria-label="검색 결과 페이지">
                            <button
                                type="button"
                                disabled={page <= 1 || gamesQuery.isFetching}
                                onClick={() => setPage((current) => current - 1)}
                            >
                                ← 이전
                            </button>
                            <span>{pagination.page} / {pagination.totalPages}</span>
                            <button
                                type="button"
                                disabled={page >= pagination.totalPages || gamesQuery.isFetching}
                                onClick={() => setPage((current) => current + 1)}
                            >
                                다음 →
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export default function SearchPage() {
    const [queryClient] = useState(() => new QueryClient());

    return (
        <QueryClientProvider client={queryClient}>
            <SearchContent />
        </QueryClientProvider>
    );
}
