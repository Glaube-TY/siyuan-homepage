<script lang="ts">
	import { onMount } from "svelte";
	import { getImage } from "@/components/tools/getImage";

	export let contentTypeJson: string = "{}";
	const parsed = JSON.parse(contentTypeJson);

	let simple2RemoteBg =
		parsed.data?.simple2RemoteBg ||
		"https://haowallpaper.com/link/common/file/previewFileImg/17882739641666944";
	const simple2LocalBg = parsed.data?.simple2LocalBg || "";
	const simple2BgSelect = parsed.data?.simple2BgSelect || "remote";

	let date = new Date();
	let month = date.getMonth() + 1;
	let week = date.getDay();
	let day = date.getDate();
	let hour = date.getHours();
	let minute = date.getMinutes();

	// 将星期数字转换为中文
	function getChineseWeek(weekNum: number): string {
		const weekNames = ["日", "一", "二", "三", "四", "五", "六"];
		return weekNames[weekNum];
	}

	onMount(() => {
		// 处理背景图片加载
		if (simple2BgSelect === "remote") {
			if (
				!window.navigator.userAgent.includes("Electron") ||
				typeof window.require !== "function"
			) {
				getImage(simple2RemoteBg).then((url) => {
					simple2RemoteBg = url;
				});
			}
		}

		const interval = setInterval(() => {
			date = new Date();
			month = date.getMonth() + 1;
			week = date.getDay();
			day = date.getDate();
			hour = date.getHours();
			minute = date.getMinutes();
		}, 1000);

		return () => clearInterval(interval);
	});
</script>

<div
	class="content-display-simple2"
	style="
        background-image: url({simple2BgSelect === 'remote'
		? simple2RemoteBg
		: simple2LocalBg});
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
    "
>
	<svg viewBox="0 0 100 100">
		<rect class="clock-face" x="10" y="10" width="80" height="80" rx="5" />

		<line
			x1="30"
			y1="50"
			x2="70"
			y2="50"
			stroke="rgba(255, 255, 255, 0.8)"
			stroke-width="1"
		/>

		<text
			x="20"
			y="40"
			font-size="30"
			font-weight="bold"
			fill="rgba(255, 255, 255, 0.8)"
		>
			{hour.toString().padStart(2, "0")}
		</text>

		<text
			x="50"
			y="80"
			font-size="30"
			font-weight="bold"
			fill="rgba(255, 255, 255, 0.8)"
		>
			{minute.toString().padStart(2, "0")}
		</text>

		<text
			x="55"
			y="40"
			font-size="8"
			font-weight="semibold"
			fill="rgba(255, 255, 255, 0.8)"
		>
			{month}/{day}
		</text>

		<text
			x="20"
			y="65"
			font-size="8"
			font-weight="semibold"
			fill="rgba(255, 255, 255, 0.8)"
		>
			星期{getChineseWeek(week)}
		</text>
	</svg>
</div>

<style lang="scss">
	.content-display-simple2 {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;

		.clock-face {
			fill: rgba(0, 0, 0, 0.5);
		}
	}
</style>
