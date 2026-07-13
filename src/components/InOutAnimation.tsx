import { animated, easings, useSpringValue } from "@react-spring/web";
import React, { DetailedHTMLProps, HTMLAttributes, useEffect, useState } from "react"

type DivProps = DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>;

type Props = {
    animate: boolean,
    delay?: number;

    onAnimateEnd?: () => any;
} & Omit<DivProps, "animate">;

export default function InOutAnimation(props: Props) {
    const { animate, children, className, delay, onAnimateEnd, onClick } = props;
    const [pointerEvents, setPointerEvents] = useState<"auto" | "none">("auto");

    const opacity = useSpringValue(0, {
        "config": {
            "duration": 480,
            "easing": easings.easeOutCubic
        }
    });
    const translateY = useSpringValue(15, {
        "config": {
            "duration": 480,
            "easing": easings.easeOutBack
        }
    });

    useEffect(() => {
        let isCancelled = false;

        const runAnimation = async () => {
            if (animate) {
                setPointerEvents("auto");
            } else {
                setPointerEvents("none");
            }

            const animationDelay = delay ?? 0;

            if (animationDelay > 0) {
                await new Promise((resolve) => setTimeout(resolve, animationDelay));
            }

            if (isCancelled) return;

            await Promise.all([
                opacity.start(animate ? 1 : 0),
                translateY.start(animate ? 0 : 10)
            ]);

            if (!isCancelled) {
                onAnimateEnd?.();
            }
        };

        void runAnimation();

        return () => {
            isCancelled = true;
            opacity.stop();
            translateY.stop();
        };
    }, [animate, delay, onAnimateEnd, opacity, translateY]);

    return <animated.div {...{
        ...props,
        animate: undefined,
        delay: undefined
    }} className={className} style={{
        opacity,
        "transform": translateY.to(v => `translateY(${v}px)`),
        pointerEvents,
        ...props.style
    }} onClick={onClick}>
        {children}
    </animated.div>
}
