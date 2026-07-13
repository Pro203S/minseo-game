import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    // Override default ignores of eslint-config-next.
    globalIgnores([
        // Default ignores of eslint-config-next:
        ".next/**",
        "out/**",
        "build/**",
        "next-env.d.ts",
    ]),
    {
        "rules": {
            "jsx-a11y/alt-text": "off",
            "@next/next/no-img-element": "off",
            "react-hooks/set-state-in-effect": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "react-hooks/exhaustive-deps": "off"
        }
    }
]);

export default eslintConfig;