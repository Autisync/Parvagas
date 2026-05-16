import nextVitals from "eslint-config-next/core-web-vitals";

export default [
	...nextVitals,
	{
		rules: {
			"react-hooks/static-components": "off",
			"react-hooks/set-state-in-effect": "off",
			"react-hooks/immutability": "off",
			"react-hooks/preserve-manual-memoization": "off",
		},
	},
];
