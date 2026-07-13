"use client";

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import css from './styles.module.css';
import { faCircleNotch } from '@fortawesome/free-solid-svg-icons';

export default function Loading() {
    return <div className={css.screen}>
        <FontAwesomeIcon
            className={css.loading}
            color="#888"
            icon={faCircleNotch}
            spin
            fontSize={"3rem"} />
    </div>;
}