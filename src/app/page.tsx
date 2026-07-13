"use client";

import InOutAnimation from '@/components/InOutAnimation';
import css from './page.module.css';
import Link from 'next/link';

export default function Page() {
    return (
        <div className={css.container}>
            <div className={css.texts}>
                <InOutAnimation className={css.text} animate delay={500}>
                    <Link className={css.minseo} href="https://www.instagram.com/min_s.e0/" target='_blank'>
                        민서
                    </Link>가
                </InOutAnimation>
                <InOutAnimation className={css.text} animate delay={1000}>
                    좋아하는
                </InOutAnimation>
                <InOutAnimation className={css.text} animate delay={1500}>
                    랜덤게임
                </InOutAnimation>
            </div>
            <InOutAnimation animate delay={2000} className={css.buttons}>
                <Link href="/search">
                    <span>게임 찾아보기</span>
                </Link>
                <Link href="/random">
                    <span>I&rsquo;m feeling lucky</span>
                </Link>
            </InOutAnimation>
        </div>
    );
}