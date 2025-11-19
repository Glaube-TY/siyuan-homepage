<script lang="ts">
	import { onMount } from "svelte";

	export let contentTypeJson: string = "{}";

	let time = new Date();

	$: hours = time.getHours();
	$: minutes = time.getMinutes();
	$: seconds = time.getSeconds();
	$: year = time.getFullYear();
	$: month = time.getMonth() + 1;
	$: day = time.getDate();

	let dial1ShowSecond: boolean = true;
	let dial1ShowMarkers: boolean = true;
	let dial1ShowDate: boolean = true;

	onMount(() => {
		try {
			const config = JSON.parse(contentTypeJson);
			if (config.type === "timedate" && config.data) {
				dial1ShowSecond = config.data?.dial1ShowSecond ?? true;
				dial1ShowMarkers = config.data?.dial1ShowMarkers ?? true;
				dial1ShowDate = config.data?.dial1ShowDate ?? true;
			}
		} catch (e) {
			console.warn("无法解析 contentTypeJson", e);
		}

		const interval = setInterval(() => {
			time = new Date();
		}, 500);

		return () => {
			clearInterval(interval);
		};
	});
</script>

<svg viewBox="-50 -50 100 100">
	<circle class="clock-face" r="48" />

	<!-- markers -->
	{#each [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as minute}
		<line class="major" y1="40" y2="45" transform="rotate({30 * minute})" />
		{#each [1, 2, 3, 4] as offset}
			<line
				class="minor"
				y1="42"
				y2="45"
				transform="rotate({6 * (minute + offset)})"
			/>
		{/each}
	{/each}

	{#if dial1ShowMarkers}
		<!-- numbers -->
		{#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as num}
			<text
				class="number"
				y="-33"
				transform="rotate({num * 30})"
				text-anchor="middle"
				style="font-size: 8px;"
			>
				{num}
			</text>
		{/each}
	{/if}

	<!-- date display -->
	{#if dial1ShowDate}
		<text
			class="date-display"
			x="0"
			y="20"
			text-anchor="middle"
			style="font-size: 6px;"
		>
			{year}.{month.toString().padStart(2, "0")}.{day
				.toString()
				.padStart(2, "0")}
		</text>
	{/if}

	<!-- hour hand -->
	<line
		class="hour"
		y1="2"
		y2="-20"
		transform="rotate({30 * hours + minutes / 2})"
	/>

	<!-- minute hand -->
	<line
		class="minute"
		y1="4"
		y2="-30"
		transform="rotate({6 * minutes + seconds / 10})"
	/>

	{#if dial1ShowSecond}
		<!-- second hand -->
		<g transform="rotate({6 * seconds})">
			<line class="second" y1="10" y2="-38" />
			<line class="second-counterweight" y1="10" y2="2" />
		</g>
	{/if}
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
	}

	.clock-face {
		stroke: #333;
		fill: white;
	}

	.minor {
		stroke: #999;
		stroke-width: 0.5;
	}

	.major {
		stroke: #333;
		stroke-width: 1;
	}

	.hour {
		stroke: #333;
	}

	.minute {
		stroke: #666;
	}

	.second,
	.second-counterweight {
		stroke: rgb(180, 0, 0);
	}

	.second-counterweight {
		stroke-width: 3;
	}
</style>
