import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
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

export default config;
