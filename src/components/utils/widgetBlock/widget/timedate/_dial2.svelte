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

	let dial2ShowSecond: boolean = true;
	let dial2ShowMarkers: boolean = true;
	let dial2ShowDate: boolean = true;

	// 计算从中心出发沿方向的射线与正方形的交点
	function getSquareIntersection(cos: number, sin: number, halfSize: number = 48) {
		if (cos === 0) {
			// 垂直方向
			return { x: 0, y: sin > 0 ? halfSize : -halfSize };
		}
		if (sin === 0) {
			// 水平方向
			return { x: cos > 0 ? halfSize : -halfSize, y: 0 };
		}
		
		// 计算与四条边的交点
		const t1 = halfSize / cos;  // 右边 x = halfSize
		const t2 = -halfSize / cos; // 左边 x = -halfSize
		const t3 = halfSize / sin;  // 上边 y = halfSize
		const t4 = -halfSize / sin; // 下边 y = -halfSize
		
		// 找到最小的正数t值（最近的交点）
		const ts = [t1, t2, t3, t4].filter(t => t > 0);
		const minT = Math.min(...ts);
		
		return {
			x: cos * minT,
			y: sin * minT
		};
	}

	onMount(() => {
		try {
			const config = JSON.parse(contentTypeJson);
			if (config.type === "timedate" && config.data) {
				dial2ShowSecond = config.data?.dial2ShowSecond ?? true;
				dial2ShowMarkers = config.data?.dial2ShowMarkers ?? true;
				dial2ShowDate = config.data?.dial2ShowDate ?? true;
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
	<!-- 正方形表盘 -->
	<rect class="clock-face" x="-48" y="-48" width="96" height="96" rx="4" />

	<!-- markers - 从内正方形向外正方形辐射 -->
	{#each [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as minute}
		{@const angle = minute * 6} {@const rad = (angle * Math.PI) / 180}
		{@const cos = Math.cos(rad)} {@const sin = Math.sin(rad)}
		<!-- 计算与内正方形(40)的交点作为起点 -->
		{@const innerIntersection = getSquareIntersection(cos, sin, 40)}
		<!-- 计算与外正方形(48)的交点作为终点 -->
		{@const outerIntersection = getSquareIntersection(cos, sin, 48)}
		<!-- 主刻度 -->
		<line
			class="major"
			x1={innerIntersection.x}
			y1={innerIntersection.y}
			x2={outerIntersection.x}
			y2={outerIntersection.y}
		/>
		
		{#each [1, 2, 3, 4] as offset}
			{@const minorAngle = (minute + offset) * 6} {@const minorRad = (minorAngle * Math.PI) / 180}
			{@const minorCos = Math.cos(minorRad)} {@const minorSin = Math.sin(minorRad)}
			{@const minorInnerIntersection = getSquareIntersection(minorCos, minorSin, 43)}
			{@const minorOuterIntersection = getSquareIntersection(minorCos, minorSin, 47)}
			<!-- 次刻度 - 终点在边框内侧一点 -->
			<line
				class="minor"
				x1={minorInnerIntersection.x}
				y1={minorInnerIntersection.y}
				x2={minorOuterIntersection.x}
				y2={minorOuterIntersection.y}
			/>
		{/each}
	{/each}

	{#if dial2ShowMarkers}
		<!-- numbers - 位于内正方形上 -->
		{#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as num}
			{@const angle = num * 30 - 90} {@const rad = (angle * Math.PI) / 180}
			{@const cos = Math.cos(rad)} {@const sin = Math.sin(rad)}
			<!-- 数字位置在内正方形(35)上 -->
			{@const textIntersection = getSquareIntersection(cos, sin, 35)}
			<text
				class="number"
				x={textIntersection.x}
				y={textIntersection.y}
				text-anchor="middle"
				style="font-size: 8px;"
				dominant-baseline="middle"
			>
				{num}
			</text>
		{/each}
	{/if}

	<!-- date display -->
	{#if dial2ShowDate}
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

	{#if dial2ShowSecond}
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
